/* ── Смена: рейс, склад, уборка ───────────────────────────────────
 *
 * Дело смены НА МЕСТЕ и наряд, который это место назначает. Вынесено сюда из
 * `ai/npc_fsm.ts` механически, без правки логики: старый слой распорядка
 * разбирается, а эти механики к нему не относятся — они про вещи, ящики и
 * поверхности, и звать их будут и ядро актора (`systems/actor`), и остатки
 * прежнего слоя, пока он жив.
 *
 * Что здесь живёт и чего нельзя потерять при следующей правке: NPC ПОКУПАЕТ за
 * деньги и ВОРУЕТ через `putIntoContainer`/`takeFromContainer` — со свидетелями
 * и аудитом; квестовая вещь неотчуждаема (`itemRoleForNpc`, теги
 * `quest|persistent|cannot_drop`), и это ЕДИНСТВЕННОЕ, что не даёт сдать
 * квестовый предмет на склад; вставший цех кормится входами; вещь едет по
 * своему природному адресу; уборщик чистит поверхности; патроны — причина
 * рейса, и после них человек перевооружается.
 *
 * Времени модуль не хранит: «сейчас» приходит параметром от того, кто зовёт.
 */

import {
  type Entity, type GameState, type Room, type TerritoryOwner, type WorldContainer,
  AIGoal, Faction, ItemType, MAX_DRAW, Occupation, RoomType, ZoneFaction,
} from '../core/types';
import type { World } from '../core/world';
import { containersInRoom, nearestContainer } from '../world/container_index';
import { WEAPON_STATS } from '../data/catalog';
import { ITEMS } from '../data/items';
import { FACTORIES } from '../data/factories';
import { RESOURCES, resourceForItem } from '../data/resources';
import { roomAffordanceWeight } from '../data/room_affordances';
import { factionToTerritoryOwner } from '../data/factions';
import { occupationHasRoutineTag } from '../data/occupation_profiles';
import { itemAddCapacity } from './inventory';
import {
  canAccessContainer,
  containerAccessInfo,
  putIntoContainer,
  takeFromContainer,
} from './containers';
import { npcAutoEquipBestWeapon } from './ai/combat';
import { cleanSurfaceArea } from './surface_cleanup';
import { territoryOwnerAtIndex } from './territory';
import {
  NPC_UTILITY_ROOM_TYPES,
  npcUtilityIdentityFromEntity,
  npcUtilityJitter01,
  npcUtilityRoomTypeWeightForIntent,
} from './ai/npc_utility';

/* Далеко ли человек ищет ящик под рейс. Раньше он знал каждый ящик этажа и
 * перебирал их все; теперь спрашивает только клетки вокруг себя, вдвое дальше
 * своей видимости. Чего нет в этом круге — того для смены не существует. */
const SUPPLY_ERRAND_RADIUS = MAX_DRAW * 2;
const CLEANER_SURFACE_RADIUS = 1.35;
const CLEANER_SURFACE_RETRY_BASE_SEC = 2.5;
const CLEANER_SURFACE_RETRY_SPREAD_SEC = 2.5;
/** Сколько лишнего надо нести, чтобы вообще собраться на склад. */
const STORE_SPARE_MIN = 2;
const STORE_SPARE_CAP = 4;
export const STORE_ACTION_BASE_SEC = 1.5;
export const STORE_ACTION_SPREAD_SEC = 1.5;

const cleanerNextSurfaceAtByNpc = new WeakMap<Entity, number>();
const storeNextActionAtByNpc = new WeakMap<Entity, number>();

/* Личная присыпка от личности: одна и та же для одного человека и одного
 * повода. Живёт здесь, потому что прежний слой разбирается, а привычка носить
 * вещи и пауза между сделками — свойство человека, а не графа переходов. */
export function stableUnit(e: Entity, salt: string | number): number {
  return npcUtilityJitter01(npcUtilityIdentityFromEntity(e), salt);
}

export function stableTimer(e: Entity, salt: string | number, base: number, spread: number): number {
  return base + stableUnit(e, salt) * spread;
}

function ownTerritoryOwner(e: Entity): TerritoryOwner | undefined {
  return e.faction === undefined ? undefined : factionToTerritoryOwner(e.faction);
}

export function territoryFriendlyForNpc(e: Entity, owner: TerritoryOwner): boolean {
  const own = ownTerritoryOwner(e);
  if (own === undefined) return false;
  if (owner === own) return true;
  if (e.faction === Faction.SCIENTIST && owner === ZoneFaction.CITIZEN) return true;
  if (e.faction === Faction.CITIZEN && owner === ZoneFaction.SCIENTIST) return true;
  return false;
}

export function npcHasRangedWeapon(e: Entity): boolean {
  return WEAPON_STATS[e.weapon ?? '']?.isRanged === true;
}

/**
 * Дело смены НА МЕСТЕ: уборка поверхностей и складской цикл.
 *
 * Ровно то, что прежний обработчик работы делал, ДОЙДЯ до места, — без выбора
 * дороги: её ведёт тот, кто позвал. Своя пауза внутри, звать можно каждый кадр.
 * Возвращает true, пока на месте есть чем заняться.
 */
export function tickNpcWorkDeed(world: World, e: Entity, now: number, state?: GameState): boolean {
  tryCleanerSurfaceWork(world, e, now);
  if ((storeNextActionAtByNpc.get(e) ?? -Infinity) > now) return true;
  storeNextActionAtByNpc.set(e, now + stableTimer(e, 'store_action', STORE_ACTION_BASE_SEC, STORE_ACTION_SPREAD_SEC));
  // Тот же сторож, что и у прежнего обработчика: ради ящика никто не бросает
  // работу и не тащит выход через этаж.
  if (scanSpareInventory(e).first < 0 && !npcIsSupplyCarrier(e) && !ownRoomIsShort(world, e)) return true;
  return tickNpcStorageWork(world, e, state) !== 'nothing';
}

/** Наряд смены: куда ехать за грузом, с грузом или с разносом. −1 — наряда нет. */
export function npcWorkErrandRoomId(world: World, e: Entity): number {
  const id = supplyErrandRoomId(world, e);
  return id === undefined ? -1 : id;
}

/** Пора ли складской сделке. Ключ паузы общий с делом смены — она одна на человека. */
export function npcStoreActionDue(e: Entity, now: number): boolean {
  return (storeNextActionAtByNpc.get(e) ?? -Infinity) <= now;
}

export function noteNpcStoreAction(e: Entity, now: number): void {
  storeNextActionAtByNpc.set(e, now + stableTimer(e, 'store_action', STORE_ACTION_BASE_SEC, STORE_ACTION_SPREAD_SEC));
}

/**
 * Рейс кладовщика: с грузом — на склад, где есть место, порожняком — туда, где
 * товар уже лежит и ждёт вывоза. Обычному человеку рейса нет.
 */
export function supplyErrandRoomId(world: World, e: Entity): number | undefined {
  const carrier = npcIsSupplyCarrier(e);
  // Груз с адресом разносится раньше вывоза со склада.
  const cargo = deliveryCargoSlot(world, e);
  if (cargo) return cargo.roomId;
  const bestRank = roomAffordanceWeight(RoomType.STORAGE, 'store');
  if (!carrier) {
    // Порожняком обычный человек идёт на склад, только когда в его комнате пусто.
    if (!ownRoomIsShort(world, e)) return undefined;
    return nearestContainer(world, e.x, e.y, SUPPLY_ERRAND_RADIUS, container => {
      const room = world.rooms[container.roomId];
      if (!room || storeRank(room) < bestRank || !canAccessContainer(container, e)) return false;
      return container.inventory.some(slot => slot.count > 0 && suppliesOwnRoom(world, e, slot.defId));
    })?.roomId;
  }
  const loaded = scanSpareInventory(e).first >= 0;
  return nearestContainer(world, e.x, e.y, SUPPLY_ERRAND_RADIUS, container => {
    const room = world.rooms[container.roomId];
    const rank = storeRank(room);
    if (!room || rank <= 0) return false;
    if (loaded ? rank < bestRank : rank >= bestRank) return false;
    if (!loaded && !container.inventory.some(slot => slot.count > 0)) return false;
    return canAccessContainer(container, e);
  })?.roomId;
}

function cleanerCanCleanCell(world: World, e: Entity, idx: number): boolean {
  if (territoryFriendlyForNpc(e, territoryOwnerAtIndex(world, idx))) return true;
  const roomId = world.roomMap[idx];
  if (roomId < 0) return false;
  if (roomId === e.assignedRoomId) return true;
  const room = world.rooms[roomId];
  return !!room && e.familyId !== undefined && e.familyId >= 0 && room.apartmentId === e.familyId;
}

export function tryCleanerSurfaceWork(world: World, e: Entity, now: number): void {
  if (e.occupation !== Occupation.CLEANER && !occupationHasRoutineTag(e.occupation, 'cleaning')) return;
  if ((cleanerNextSurfaceAtByNpc.get(e) ?? -Infinity) > now) return;
  cleanerNextSurfaceAtByNpc.set(e, now + stableTimer(e, 'cleaner_surface', CLEANER_SURFACE_RETRY_BASE_SEC, CLEANER_SURFACE_RETRY_SPREAD_SEC));
  const cleaned = cleanSurfaceArea(world, e.x, e.y, CLEANER_SURFACE_RADIUS, {
    shouldCleanCell: idx => cleanerCanCleanCell(world, e, idx),
  });
  if (cleaned <= 0 || !e.ai) return;
  e.ai.goal = AIGoal.WORK;
  e.ai.timer = Math.max(e.ai.timer, 0.4);
}

/* ── Склад: отнести лишнее, взять патроны ─────────────────────────
 *
 * Деятельность `store` у комнаты (`ROOM_AFFORDANCES`) до сих пор ни к чему не
 * вела: склад был достижим только по ремеслу. Теперь у него есть намерение, и
 * оно не выдумывает себе тяги — её поднимает то, что человек несёт лишнее или
 * ему нечем стрелять. Пустой карман, полный магазин — и склад проигрывает
 * прогулке.
 */

/** Патроны, которые человеку нужны под его же оружие. */
function npcAmmoTypeFor(e: Entity): string | undefined {
  return WEAPON_STATS[e.weapon ?? '']?.ammoType;
}

/** Роль вещи в карманах: своя, личный запас или хабар. */
type NpcItemRole = 'own' | 'reserve' | 'spare';

function itemRoleForNpc(e: Entity, defId: string): NpcItemRole {
  if (defId === e.weapon || defId === e.tool) return 'own';
  const def = ITEMS[defId];
  if (!def) return 'own';
  if (def.value <= 0) return 'own';
  if (def.tags?.some(tag => tag === 'quest' || tag === 'persistent' || tag === 'cannot_drop')) return 'own';
  switch (def.type) {
    case ItemType.KEY:
    case ItemType.NOTE:
      return 'own';
    case ItemType.AMMO:
      return defId === npcAmmoTypeFor(e) ? 'own' : 'spare';
    case ItemType.FOOD:
    case ItemType.DRINK:
    case ItemType.MEDICINE:
      // Одну еду человек носит при себе, остальное — излишек: иначе пекарь
      // остался бы стоять со всей сменой хлеба в карманах. Кладовщика это
      // правило не обходит намеренно: пусть подворовывает из груза, отдельного
      // случая для него дешевле не заводить, чем описывать честность.
      return 'reserve';
    default:
      return 'spare';
  }
}

/**
 * Первый лишний слот и общее их число. Личный запас каждого вида оставляется
 * один раз, всё сверх него — излишек и едет на склад вместе с хабаром.
 */
export function scanSpareInventory(e: Entity): { first: number; count: number } {
  const inv = e.inventory;
  let first = -1;
  let count = 0;
  if (!inv) return { first, count };
  let keptFood = false;
  let keptDrink = false;
  let keptMedicine = false;
  for (let i = 0; i < inv.length; i++) {
    const defId = inv[i].defId;
    let role = itemRoleForNpc(e, defId);
    if (role === 'reserve') {
      const type = ITEMS[defId]?.type;
      const kept = type === ItemType.FOOD ? keptFood : type === ItemType.DRINK ? keptDrink : keptMedicine;
      if (!kept) {
        if (type === ItemType.FOOD) keptFood = true;
        else if (type === ItemType.DRINK) keptDrink = true;
        else keptMedicine = true;
        role = 'own';
      } else {
        role = 'spare';
      }
    }
    if (role !== 'spare') continue;
    if (first < 0) first = i;
    count++;
    if (count >= STORE_SPARE_CAP) break;
  }
  return { first, count };
}

function npcNeedsAmmo(e: Entity): boolean {
  const ammo = npcAmmoTypeFor(e);
  if (!ammo || !npcHasRangedWeapon(e)) return false;
  return !e.inventory?.some(slot => slot.defId === ammo && slot.count > 0);
}

/** Готовность лезть в чужой запас. Не занятие и не фракция — черта человека. */
export function npcRaidsForeignContainers(e: Entity): boolean {
  return stableUnit(e, 'store_raid') > 0.75;
}

/* ── Свой рейс у каждого ремесла ──────────────────────────────────
 *
 * Кладовщик возит по всему этажу и всегда. Остальные ходят за припасом только
 * для СВОЕЙ рабочей комнаты и только когда в ней пусто: повар за едой, врач за
 * лекарствами. Так кухня не зависит от одного человека, но и не соревнуется с
 * ним за каждый ящик.
 *
 * Что комнате положено держать, известно из той же таблицы ресурсов
 * (`ResourceDef.roomTypes`), по которой живёт экономика: еда и вода — кухне,
 * медицина — медпункту. Отдельного списка не заводим.
 */
const ROOM_STOCK_RESOURCES: readonly (readonly string[])[] = NPC_UTILITY_ROOM_TYPES
  .reduce<string[][]>((table: string[][], type: RoomType) => {
    table[type] = roomAffordanceWeight(type, 'store') > 0
      ? []
      : RESOURCES.filter(resource => resource.roomTypes.includes(type)).map(resource => resource.id);
    return table;
  }, []);

function roomStockResourceIds(type: RoomType): readonly string[] {
  return ROOM_STOCK_RESOURCES[type] ?? [];
}

/** Рабочая комната человека, если она сама что-то держит: кухня, медпункт. */
function ownStockRoom(world: World, e: Entity): Room | undefined {
  const room = e.assignedRoomId !== undefined && e.assignedRoomId >= 0 ? world.rooms[e.assignedRoomId] : undefined;
  if (!room || roomStockResourceIds(room.type).length === 0) return undefined;
  return npcUtilityRoomTypeWeightForIntent('work', room.type, e.occupation) > 0 ? room : undefined;
}

/** Несёт ли человек это для своей комнаты. */
function suppliesOwnRoom(world: World, e: Entity, defId: string): boolean {
  const room = ownStockRoom(world, e);
  if (!room) return false;
  const resource = resourceForItem(defId)?.id;
  return resource !== undefined && roomStockResourceIds(room.type).includes(resource);
}

/** Пусто ли в своей комнате по тому, что ей положено держать. */
export function ownRoomIsShort(world: World, e: Entity): boolean {
  const room = ownStockRoom(world, e);
  if (!room) return false;
  const need = roomStockResourceIds(room.type);
  for (const container of containersInRoom(world, room.id)) {
    if (!canAccessContainer(container, e)) continue;
    for (const slot of container.inventory) {
      if (slot.count > 0 && need.includes(resourceForItem(slot.defId)?.id ?? '')) return false;
    }
  }
  return true;
}

/** Кладовщик: его дело — возить товар оттуда, где он появился, туда, где хранят. */
export function npcIsSupplyCarrier(e: Entity): boolean {
  return e.occupation === Occupation.STOREKEEPER || occupationHasRoutineTag(e.occupation, 'supply');
}

/**
 * Бродяга: ни дома, ни семьи, ни рабочей комнаты — дорога и есть его занятие.
 *
 * Живёт здесь по той же причине, что и всё остальное в этом модуле: прежний
 * слой распорядка разбирается, а это свойство ЧЕЛОВЕКА, а не графа переходов, и
 * читают его теперь оба — и ядро актора, и остатки прежнего слоя.
 */
export function usesTravelerRoutine(e: Entity): boolean {
  return e.isTraveler === true
    || (e.isTraveler !== false && e.assignedRoomId === undefined && e.familyId === undefined
      && occupationHasRoutineTag(e.occupation, 'traveler'));
}

/** Насколько комната годится КАК ХРАНИЛИЩЕ: у склада полный вес, у цеха малый. */
function storeRank(room: Room | null | undefined): number {
  return room ? roomAffordanceWeight(room.type, 'store') : 0;
}

/** Годится ли вещь в сырьё этому цеховому ящику. Своё сырьё цех не отдаёт. */
function containerUsesAsInput(container: WorldContainer, defId: string): boolean {
  if (!container.factoryId) return false;
  const resource = resourceForItem(defId)?.id;
  if (!resource) return false;
  const factory = FACTORIES.find(f => f.id === container.factoryId);
  if (!factory) return false;
  // Вещь, которую цех сам же и выпускает, сырьём ему не считается — иначе
  // кладовщик возил бы туда его собственную продукцию.
  const produced = factory.recipes.some(recipe =>
    recipe.outputs.some(out => out.defId === defId)
    || recipe.badBatch?.outputs.some(out => out.defId === defId) === true);
  if (produced) return false;
  return factory.recipes.some(recipe => recipe.inputs.some(input => input.id === resource));
}

/** Ждёт ли ящик подвоза: цех встал без входа, и вещь ему годится. */
function containerAwaitsInput(container: WorldContainer, defId: string): boolean {
  return container.productionBlockedReason === 'no_inputs' && containerUsesAsInput(container, defId);
}

/**
 * Куда вещь просится по своей природе: где она водится, но не хранится.
 *
 * Источник тот же, по которому вещь ложится при генерации, — `spawnRooms`.
 * Отдельной таблицы «что куда разносить» не заводим: хлеб и так объявлен
 * кухонным, бинт медпунктовым, а у патронов комнат нет вовсе, поэтому свой
 * боезапас кладовщик разносить не побежит.
 */
function deliveryRoomTypesFor(defId: string): readonly RoomType[] {
  // Адрес вещи — там, где она водится по генерации, И там, где её ресурсу
  // положено лежать по экономике. Второе нужно, чтобы товар доезжал до лавок
  // и баров без правки `spawnRooms` у четырёх сотен предметов.
  const spawn = ITEMS[defId]?.spawnRooms ?? [];
  const stocked = resourceForItem(defId)?.roomTypes ?? [];
  const out: RoomType[] = [];
  for (const type of spawn) {
    if (roomAffordanceWeight(type, 'store') === 0) out.push(type);
  }
  for (const type of stocked) {
    if (roomAffordanceWeight(type, 'store') === 0 && !out.includes(type)) out.push(type);
  }
  return out;
}

/** Ближайшая комната, куда эту вещь можно донести и где её примут. */
function deliveryRoomFor(world: World, e: Entity, defId: string, count: number): number | undefined {
  const types = deliveryRoomTypesFor(defId);
  return nearestContainer(world, e.x, e.y, SUPPLY_ERRAND_RADIUS, container => {
    const room = world.rooms[container.roomId];
    // Либо вещи здесь место по природе, либо встал цех и ждёт именно её.
    if (!room || !(types.includes(room.type) || containerAwaitsInput(container, defId))) return false;
    if (!canAccessContainer(container, e)) return false;
    return itemAddCapacity(container, defId, count, undefined) > 0;
  })?.roomId;
}

/**
 * Что из лишнего можно сдать здесь. У кладовщика груз под разнос из этого
 * списка исключён: иначе, заходя на склад, он сдавал бы туда же то, что несёт
 * на кухню, и хлеб ездил бы по кругу.
 */
function depositableSlot(world: World, e: Entity, carrier: boolean): number {
  const inv = e.inventory;
  if (!inv) return -1;
  const spare = scanSpareInventory(e);
  if (spare.first < 0) return spare.first;
  for (let i = spare.first; i < inv.length; i++) {
    const defId = inv[i].defId;
    if (itemRoleForNpc(e, defId) === 'own') continue;
    // Кладовщик бережёт любой груз с адресом, остальные — только припас своей
    // комнаты: иначе хабар в карманах перестал бы сдаваться на склад вовсе.
    if (carrier ? deliveryRoomFor(world, e, defId, inv[i].count) !== undefined : suppliesOwnRoom(world, e, defId)) continue;
    return i;
  }
  return -1;
}

/** Груз, который человек несёт не себе: первый слот, которому место в другой комнате. */
function deliveryCargoSlot(world: World, e: Entity): { slot: number; roomId: number } | undefined {
  const inv = e.inventory;
  if (!inv) return undefined;
  const carrier = npcIsSupplyCarrier(e);
  const ownRoom = carrier ? undefined : ownStockRoom(world, e);
  for (let i = 0; i < inv.length; i++) {
    const defId = inv[i].defId;
    if (itemRoleForNpc(e, defId) === 'own') continue;
    if (!carrier) {
      // Обычный человек несёт только припас своей комнаты и только в неё.
      if (!ownRoom || !suppliesOwnRoom(world, e, defId)) continue;
      return { slot: i, roomId: ownRoom.id };
    }
    const roomId = deliveryRoomFor(world, e, defId, inv[i].count);
    if (roomId !== undefined) return { slot: i, roomId };
  }
  return undefined;
}

/**
 * Голая арифметика тяги, без личности. Вынесена затем, чтобы потолок тяги
 * считался ТЕМ ЖЕ выражением, а не вторым набором тех же чисел: ядро актора
 * переводит очки в долю, и разъехавшийся потолок молча сдвинул бы весь драйв.
 */
function storeDriveRaw(spare: number, needsAmmo: boolean, atStorage: boolean): number {
  const carry = spare >= (atStorage ? 1 : STORE_SPARE_MIN) ? 12 + spare * 10 : 0;
  // Вооружённому без патронов склад нужнее любого хабара: это дело одного
  // захода и возникает оно ровно после того, как человек отстрелялся.
  return carry + (needsAmmo ? 40 : 0);
}

/**
 * Потолок тяги: ПОЛНЫЕ КАРМАНЫ лишнего. Пустой магазин в потолок намеренно не
 * входит, хотя и складывается с возкой: «полные карманы И нечем стрелять» —
 * стечение, а не норма, и деля на него, обычный рейс с тремя вещами получал бы
 * треть силы вместо четырёх пятых. Перебор гасит `clamp01`.
 */
export const STORE_DRIVE_MAX = storeDriveRaw(STORE_SPARE_CAP, false, false);

/**
 * Насколько человеку сейчас нужен склад. Привычка носить вещи своя у каждого:
 * иначе весь этаж снимался бы к складам одновременно. Тому, кто уже стоит на
 * складе, хватает и одной лишней вещи — раз пришёл, доделай.
 */
export function npcStoreDrive(e: Entity, atStorage: boolean): number {
  // Пустые карманы дела не отменяют: за патронами идут именно с пустыми.
  const raw = storeDriveRaw(scanSpareInventory(e).count, npcNeedsAmmo(e), atStorage);
  if (raw <= 0) return 0;
  // Возка кладовщику не привычка, а ремесло: множитель привычки к ней не идёт.
  if (npcIsSupplyCarrier(e)) return raw;
  return raw * (0.4 + 0.6 * stableUnit(e, 'store_habit'));
}

/**
 * Куда нести лишнее и где брать патроны: ближайший ДОСТУПНЫЙ ЯЩИК, а не
 * ближайшая комната с назначением `store`.
 *
 * Разница не косметическая. Замерено на жилом этаже: назначение `store` несут
 * 1521 комната, а ящик стоит ровно в СЕМИ из них (всего 18 ящиков на этаж).
 * Выбор по назначению отправляет человека в пустую кладовку, и рейс кончается
 * ничем — ровно это и показывал первый замер драйва: люди доходили до складов,
 * а сделок не прибавлялось. Спрашивается индекс ящиков в том же круге, что и
 * весь наряд смены; перебора ящиков этажа здесь нет.
 *
 * Наряд смены идёт первым: у него собственный смысл (груз с адресом, вывоз со
 * склада, припас своей комнаты), а не «куда деть хабар». −1 — ехать некуда.
 */
export function npcStoreErrandRoomId(world: World, e: Entity): number {
  const errand = supplyErrandRoomId(world, e);
  if (errand !== undefined) return errand;
  const ammo = npcNeedsAmmo(e) ? npcAmmoTypeFor(e) : undefined;
  const spare = scanSpareInventory(e);
  const slot = spare.first >= 0 ? e.inventory?.[spare.first] : undefined;
  const raids = npcRaidsForeignContainers(e);
  return nearestContainer(world, e.x, e.y, SUPPLY_ERRAND_RADIUS, container => {
    if (storeRank(world.rooms[container.roomId]) <= 0) return false;
    // В чужой запас лезет только тот, кому это позволяет личность.
    if (!canAccessContainer(container, e)
      && !(raids && containerAccessInfo(container, e).canTake)) return false;
    // За патронами — туда, где они лежат; с хабаром — туда, где есть место.
    if (ammo !== undefined
      && container.inventory.some(s => s.defId === ammo && s.count > 0)) return true;
    return slot !== undefined && itemAddCapacity(container, slot.defId, slot.count, undefined) > 0;
  })?.roomId ?? -1;
}

function findNpcStorageContainer(
  world: World,
  e: Entity,
  room: Room,
  state?: GameState,
): WorldContainer | undefined {
  let foreign: WorldContainer | undefined;
  const raids = npcRaidsForeignContainers(e);
  for (const container of containersInRoom(world, room.id)) {
    if (canAccessContainer(container, e)) return container;
    if (raids && foreign === undefined && containerAccessInfo(container, e, state).canTake) foreign = container;
  }
  return foreign;
}

/**
 * Что человек делает на складе прямо сейчас.
 *
 * `busy` — сделка прошла, есть смысл остаться; `done` — дело закрыто;
 * `nothing` — здесь заняться нечем, надо идти в другую комнату. Различие важно:
 * работник цеха обязан сперва попробовать местный ящик и только потом нести
 * смену через этаж.
 */
export type NpcStorageOutcome = 'busy' | 'done' | 'nothing';

export function tickNpcStorageWork(world: World, e: Entity, state?: GameState): NpcStorageOutcome {
  const room = world.roomAt(e.x, e.y);
  const rank = storeRank(room);
  const carrier = npcIsSupplyCarrier(e);
  // Разнос идёт раньше вывоза и не смотрит на ранг комнаты: кухне сдают хлеб,
  // вставшему цеху — сырьё, а не ставят их на складской учёт.
  if (room) {
    const cargo = deliveryCargoSlot(world, e);
    if (cargo && cargo.roomId === room.id) {
      const target = findNpcStorageContainer(world, e, room, state);
      const slot = e.inventory?.[cargo.slot];
      if (!target || !slot) return 'nothing';
      return putIntoContainer(target, e, cargo.slot, slot.count, state) ? 'busy' : 'done';
    }
    if (rank <= 0) return 'nothing';
  }
  if (!room || rank <= 0) return 'nothing';
  const container = findNpcStorageContainer(world, e, room, state);
  if (!container) return 'nothing';
  const bestRank = roomAffordanceWeight(RoomType.STORAGE, 'store');

  // Кладовщик в цеху не складывает, а забирает: это место, откуда возят.
  if (carrier && rank < bestRank) {
    const load = container.inventory.findIndex(slot => slot.count > 0 && !containerUsesAsInput(container, slot.defId));
    if (load < 0) return 'nothing';
    return takeFromContainer(container, e, load, container.inventory[load].count, state) ? 'busy' : 'nothing';
  }

  const spare = scanSpareInventory(e);
  // Порожняком на складе кладовщик берёт то, чего ждут в других комнатах, и
  // сразу уходит: иначе следующей же сделкой положил бы взятое назад.
  const fetchesForOwnRoom = !carrier && ownRoomIsShort(world, e);
  if ((carrier || fetchesForOwnRoom) && depositableSlot(world, e, carrier) < 0 && rank >= bestRank) {
    for (let i = 0; i < container.inventory.length; i++) {
      const item = container.inventory[i];
      if (item.count <= 0) continue;
      // Кладовщик берёт что угодно, чему есть куда ехать; остальные — только
      // припас своей комнаты. Проверяется КОМНАТА, а не тип: вещь, которой
      // «место на кухне», нельзя брать там, где кухни нет, иначе она поедет со
      // склада и вернётся на склад, и так без конца.
      const wanted = carrier
        ? deliveryRoomFor(world, e, item.defId, item.count) !== undefined
        : suppliesOwnRoom(world, e, item.defId);
      if (!wanted) continue;
      if (takeFromContainer(container, e, i, item.count, state)) return 'done';
    }
  }

  const dropSlot = depositableSlot(world, e, carrier);
  if (dropSlot >= 0) {
    const slot = e.inventory?.[dropSlot];
    if (slot && putIntoContainer(container, e, dropSlot, slot.count, state)) {
      return depositableSlot(world, e, carrier) < 0 && !npcNeedsAmmo(e) ? 'done' : 'busy';
    }
    // Ящик не принял — вещь поедет туда, где место есть.
    if (!npcNeedsAmmo(e)) return 'nothing';
  }
  // Кладовщику с грузом под разнос на складе делать больше нечего: пора везти.
  if (carrier && spare.first >= 0 && dropSlot < 0) return 'done';

  if (npcNeedsAmmo(e)) {
    const ammo = npcAmmoTypeFor(e);
    const ammoSlot = container.inventory.findIndex(slot => slot.defId === ammo && slot.count > 0);
    if (ammoSlot < 0) return spare.first >= 0 ? 'nothing' : 'done';
    if (takeFromContainer(container, e, ammoSlot, container.inventory[ammoSlot].count, state)) {
      npcAutoEquipBestWeapon(e);
      return 'busy';
    }
  }
  return 'done';
}

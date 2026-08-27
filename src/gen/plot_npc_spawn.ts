import { getPlotNpcNumericId } from '../data/npc_packages';
import {
  AIGoal,
  EntityType,
  Occupation,
  type Entity,
  type Item,
  type Needs,
  type Room,
} from '../core/types';
import { type World } from '../core/world';
import { freshNeeds } from '../data/catalog';
import { getNpcPackageByPlotNpcId, npcPackageDisplayName, type NpcPackageDef, allNpcPackages } from '../data/npc_packages';
import { freshRPG } from '../systems/rpg';
import { findRandomFloorCell } from './shared';
import { rng } from '../core/rand';
import { findNamedRoom } from './named_rooms';
import { occupationPreferredVisitRooms } from '../data/occupation_profiles';

export interface PlotNpcSpawnOptions {
  angle?: number;
  pitch?: number;
  canGiveQuest?: boolean;
  isTraveler?: boolean;
  spriteSeed?: number;
  weapon?: string;
  tool?: string;
  aiTarget?: { x: number; y: number };
  needs?: Needs;
  extra?: Partial<Entity>;
}

function packageItems(items: readonly Item[] | undefined): Item[] {
  return (items ?? []).map(item => ({ ...item }));
}

function packageMaxHp(pack: NpcPackageDef): number {
  return Math.max(1, pack.runtime?.maxHp ?? pack.runtime?.hp ?? 100);
}

function packageHp(pack: NpcPackageDef): number {
  return Math.max(1, Math.min(pack.runtime?.hp ?? packageMaxHp(pack), packageMaxHp(pack)));
}

function packageSpeed(pack: NpcPackageDef): number {
  return Math.max(0.1, Math.min(20, pack.runtime?.speed ?? 1.2));
}

/**
 * Тело авторской личности.
 *
 * `entityId` — обычный номер сущности из общего счётчика; личность живёт в
 * `alifeId` и `npcPackageId`. Раньше оба поля получали НОМЕР СЛОТА, и на этом
 * совпадении держалась вся адресация сюжетных людей: любая обычная сущность,
 * попавшая в слотовый диапазон, выдавала себя за человека — панель диалога
 * рисовалась из листовки, A-Life вычищала «переехавшего», а смерть самозванца
 * навсегда записывала в сейв чужую смерть.
 *
 * Анкета пакета говорит, каким человек РОДИЛСЯ, и только это. Что с ним стало —
 * умер, уехал, сменил сторону — знает A-Life, и она же правит тело в проходе
 * материализации (`materializeAlifeFloorPopulation`: `filterDeadPlotNpcs`,
 * `filterRelocatedPlotNpcs`, наложение событийной принадлежности). Спрашивать
 * об этом здесь нечего и не у кого: генерация этажа принципиально не видит
 * `state` (`generateDesignFloor(id, seed)`), и заводить ей окно в живой прогон
 * ради одного поля — значит сломать её чистоту.
 */
export function plotNpcEntityFromPackage(
  entityId: number,
  plotNpcId: string,
  x: number,
  y: number,
  options: PlotNpcSpawnOptions = {},
): (Entity & { npcPackageId: string }) | undefined {
  const numericId = getPlotNpcNumericId(plotNpcId)!;
  const pack = getNpcPackageByPlotNpcId(numericId);
  const packPlotId = pack?.content?.plotNpcId ? getPlotNpcNumericId(pack.content.plotNpcId) : undefined;
  if (!pack || packPlotId !== numericId) return undefined;
  const target = options.aiTarget ?? { x: 0, y: 0 };
  const visualSpriteScale = pack.visual.spriteScale
    ?? (pack.affiliation.occupation === Occupation.CHILD ? 0.6 : undefined);
  return {
    id: entityId,
    alifeId: numericId,
    type: EntityType.NPC,
    x,
    y,
    angle: options.angle ?? 0,
    pitch: options.pitch ?? 0,
    alive: true,
    speed: packageSpeed(pack),
    sprite: pack.visual.sprite ?? pack.affiliation.occupation,
    ...(visualSpriteScale !== undefined ? { spriteScale: visualSpriteScale } : {}),
    spriteSeed: options.spriteSeed ?? pack.visual.spriteSeed,
    npcVisualId: pack.visual.npcVisualId,
    name: npcPackageDisplayName(pack),
    isFemale: pack.demographics.sex === 'female',
    age: pack.demographics.age,
    sex: pack.demographics.sex,
    needs: options.needs ? { ...options.needs } : freshNeeds(),
    hp: packageHp(pack),
    maxHp: packageMaxHp(pack),
    money: pack.wealth.cashRubles ?? 0,
    accountRubles: pack.wealth.accountRubles,
    rpg: freshRPG(pack.rpg.level),
    ai: { goal: AIGoal.IDLE, tx: target.x, ty: target.y, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: packageItems(pack.loadout.inventory),
    weapon: options.weapon ?? pack.loadout.weapon,
    tool: options.tool ?? pack.loadout.tool,
    faction: pack.affiliation.faction,
    occupation: pack.affiliation.occupation,
    npcPackageId: pack.id,
    canGiveQuest: options.canGiveQuest ?? pack.runtime?.canGiveQuest ?? true,
    questId: -1,
    isTraveler: options.isTraveler,
    ...options.extra,
  };
}

export function spawnPlotNpcFromPackage(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  x: number,
  y: number,
  options: PlotNpcSpawnOptions = {},
): Entity | undefined {
  const entity = plotNpcEntityFromPackage(nextId.v, plotNpcId, x, y, options);
  if (!entity) return undefined;
  nextId.v++;
  entities.push(entity);
  return entity;
}

export function requireSpawnedPlotNpcFromPackage(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  x: number,
  y: number,
  options: PlotNpcSpawnOptions = {},
): Entity & { npcPackageId: string } {
  const entity = spawnPlotNpcFromPackage(entities, nextId, plotNpcId, x, y, options);
  if (!entity) throw new Error(`[PLOT_NPC_SPAWN] missing NPC package for "${plotNpcId}"`);
  return entity as Entity & { npcPackageId: string };
}

/**
 * Комната под якорь по объявленному псевдониму (`spawnRoomAlias` анкеты →
 * `placement.roomId`). Совпадение точное: `defId` именованной комнаты этажа,
 * затем её теги.
 *
 * Поиска по русскому отображаемому имени тут больше нет — это была подстрока по
 * тексту для игрока, ломавшаяся от любой правки названия. Нет и падения в
 * случайную комнату: комната — это место, а случайная комната местом не
 * является, и человек, объявивший дом, не должен оказываться неизвестно где.
 * Не нашли объявленное — пусть решает общее правило размещения выше.
 */
function roomForPlacement(world: World, roomId: string | undefined): Room | undefined {
  if (!roomId) return undefined;
  const named = findNamedRoom(world, roomId);
  if (named) return named;
  return world.rooms.find(room => room?.tags?.some(tag => tag === roomId));
}

/**
 * Комната по ремеслу: человек, не объявивший дом, всё равно не бросается куда
 * попало — врача тянет в медпункт, клерка в кабинет, жильца в жилую. Список
 * тяготений берётся из профиля занятия, того же, которым пользуются квесты.
 *
 * Выбор детерминирован от id пакета: один и тот же человек на одном и том же
 * этаже встаёт в одну и ту же комнату, а разные люди одного ремесла не слипаются
 * в первую попавшуюся.
 */
function roomForOccupation(world: World, occupation: Occupation | undefined, packId: string): Room | undefined {
  const preferred = occupationPreferredVisitRooms(occupation);
  if (preferred.length === 0) return undefined;
  const fitting = world.rooms.filter(room => room && room.apartmentId < 0 && preferred.includes(room.type));
  if (fitting.length === 0) return undefined;
  let hash = 2166136261;
  for (let i = 0; i < packId.length; i++) hash = Math.imul(hash ^ packId.charCodeAt(i), 16777619);
  return fitting[(hash >>> 0) % fitting.length];
}

/**
 * Единая доставка авторских NPC на этаж: реестр пакетов — единственный источник
 * состава, дом человека (`placement.homeFloorKey`) — единственное условие.
 *
 * Модуль этажа по-прежнему волен поставить своего человека сам, в свою комнату и
 * позу, — и почти всегда так и делает; этот шаг добирает только тех, кого никто
 * не поставил. До него забытая строчка спавна молча выкидывала персонажа из игры
 * вместе с его квестом (так пропали Олевия Кибер и семеро фоновых жильцов), и
 * заметить это можно было лишь прогоном всех этажей.
 *
 * `event_only` пропускается: такой человек приходит событием, а не этажом.
 */
export function deliverFloorNpcPackages(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  floorKey: string,
): number {
  const placed = new Set<string>();
  for (const entity of entities) {
    const id = (entity as Entity & { npcPackageId?: string }).npcPackageId;
    if (id) placed.add(id);
  }
  let delivered = 0;
  for (const pack of allNpcPackages()) {
    if (pack.placement.homeFloorKey !== floorKey) continue;
    if (pack.placement.presence === 'event_only') continue;
    const plotNpcId = pack.content?.plotNpcId;
    if (plotNpcId == null || placed.has(pack.id)) continue;
    const numericId = getPlotNpcNumericId(plotNpcId);
    if (numericId !== undefined && entities.some(e => e.alifeId === numericId && e.alive)) continue;

    const room = roomForPlacement(world, pack.placement.roomId)
      ?? roomForOccupation(world, pack.affiliation.occupation, pack.id);
    const cell = room ? undefined : findRandomFloorCell(world);
    const spot = room
      ? { x: room.x + Math.floor(room.w / 2) + 0.5, y: room.y + Math.floor(room.h / 2) + 0.5 }
      : cell && { x: cell.x + 0.5, y: cell.y + 0.5 };
    if (!spot) continue;
    const entity = spawnPlotNpcFromPackage(entities, nextId, plotNpcId, spot.x, spot.y, {
      angle: rng() * Math.PI * 2,
      canGiveQuest: true,
    });
    if (entity) delivered++;
  }
  return delivered;
}

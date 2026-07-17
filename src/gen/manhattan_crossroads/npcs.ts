/* -- Design z: Manhattan-like indoor crossroads ------------- */

import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  Occupation,
  type Entity,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { SeedRng } from '../../core/rand';
import { freshNeeds } from '../../data/catalog';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { Spr, monsterSpr } from '../../render/sprite_index';
import {
  randomRPG,
  scaleMonsterHp,
  scaleMonsterSpeed,
} from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('manhattan_crossroads');

export const DESIGN_FLOOR_ID = 'manhattan_crossroads' as const;
export const MANHATTAN_CROSSROADS_Z = 8;
import { CENTER, CROSSROADS_TOLL_CROWD_CAP, CROSSROADS_TRAFFIC_BAND_CAP, KeyRooms, CrossroadsNpcIds, TRAFFIC_MILITSIYA, ZEBRA_GRANNY, COURIER_DIMA, ROAD_STALKER_KSU } from './index';
import { setFeatureIfFloor } from './geometry';

export function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: string,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle = 0,
  extra?: Partial<Entity>,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, x + 0.5, y + 0.5, {
    angle,
    extra,
  });
  return npc.id;
}

export function spawnAmbientNpc(
  rng: SeedRng,
  entities: Entity[],
  nextId: { v: number },
  name: string,
  x: number,
  y: number,
  faction: Faction,
  occupation: Occupation,
  inventory: { defId: string; count: number }[] = [],
  weapon?: string,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: occupation === Occupation.HUNTER ? 1.15 : 1.0,
    sprite: occupation,
    name,
    isFemale: name.endsWith('а') || name.endsWith('я'),
    needs: freshNeeds(),
    hp: faction === Faction.LIQUIDATOR ? 135 : 85,
    maxHp: faction === Faction.LIQUIDATOR ? 135 : 85,
    money: 10 + Math.floor(rng.random() * 35),
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: inventory.map(i => ({ ...i })),
    weapon,
    faction,
    occupation,
    isTraveler: true,
    questId: -1,
  });
}

export function spawnCrossroadsNpcs(rng: SeedRng, world: World, entities: Entity[], nextId: { v: number }, rooms: KeyRooms): CrossroadsNpcIds {
  const militsiya = spawnPlotNpc(
    entities,
    nextId,
    'crossroads_traffic_militsiya',
    TRAFFIC_MILITSIYA,
    rooms.control.x + 5,
    rooms.control.y + 10,
    Math.PI / 2,
    { weapon: 'makarov' },
  );
  const granny = spawnPlotNpc(
    entities,
    nextId,
    'crossroads_zebra_granny',
    ZEBRA_GRANNY,
    rooms.safeCurb.x + 8,
    rooms.safeCurb.y + 11,
    0,
    { spriteScale: 0.86 },
  );
  const dima = spawnPlotNpc(
    entities,
    nextId,
    'crossroads_courier_dima',
    COURIER_DIMA,
    rooms.kiosk.x + 8,
    rooms.kiosk.y + 10,
    Math.PI,
  );
  const ksu = spawnPlotNpc(
    entities,
    nextId,
    'crossroads_road_stalker_ksu',
    ROAD_STALKER_KSU,
    rooms.wrongTurn.x + 9,
    rooms.wrongTurn.y + 8,
    Math.PI,
    { weapon: 'knife' },
  );

  spawnAmbientNpc(rng, entities, nextId, 'Патрульный у делителя', 512, 486, Faction.LIQUIDATOR, Occupation.HUNTER, [
    { defId: 'ammo_9mm', count: 5 },
  ]);
  spawnAmbientNpc(rng, entities, nextId, 'Патрульная у южной зебры', 528, 538, Faction.LIQUIDATOR, Occupation.HUNTER, [
    { defId: 'bandage', count: 1 },
  ]);
  spawnAmbientNpc(rng, entities, nextId, 'Торговец с бордюра', 398, 520, Faction.CITIZEN, Occupation.STOREKEEPER, [
    { defId: 'water', count: 1 },
    { defId: 'bread', count: 2 },
  ]);
  spawnAmbientNpc(rng, entities, nextId, 'Дорожный бродяга', 690, 600, Faction.WILD, Occupation.TRAVELER, [
    { defId: 'pipe', count: 1 },
  ]);
  spawnTollCrowd(rng, entities, nextId);
  spawnTrafficBands(rng, world, entities, nextId);

  return { militsiya, granny, dima, ksu };
}

export function spawnTollCrowd(rng: SeedRng, entities: Entity[], nextId: { v: number }): void {
  const spots: readonly [number, number, Faction, Occupation, string][] = [
    [506, 542, Faction.CITIZEN, Occupation.TRAVELER, 'Очередник у платной зебры'],
    [509, 545, Faction.CITIZEN, Occupation.HOUSEWIFE, 'Женщина с талоном перехода'],
    [514, 544, Faction.CITIZEN, Occupation.STOREKEEPER, 'Кладовщик у турникета'],
    [518, 542, Faction.CITIZEN, Occupation.LOCKSMITH, 'Слесарь с пустым ключом'],
    [502, 532, Faction.LIQUIDATOR, Occupation.HUNTER, 'Ликвидатор очереди'],
    [522, 532, Faction.LIQUIDATOR, Occupation.HUNTER, 'Второй счетчик полос'],
    [532, 536, Faction.CITIZEN, Occupation.SECRETARY, 'Секретарь с квитанцией'],
    [536, 540, Faction.CITIZEN, Occupation.TRAVELER, 'Пассажир без сдачи'],
    [526, 546, Faction.WILD, Occupation.TRAVELER, 'Шепот из обхода'],
    [500, 548, Faction.CITIZEN, Occupation.COOK, 'Повар с хлебом в очереди'],
    [516, 550, Faction.CITIZEN, Occupation.TRAVELER, 'Молчаливый свидетель'],
    [510, 550, Faction.CITIZEN, Occupation.TRAVELER, 'Сосед с мокрым купоном'],
  ];
  for (let i = 0; i < Math.min(CROSSROADS_TOLL_CROWD_CAP, spots.length); i++) {
    const [x, y, faction, occupation, name] = spots[i];
    spawnAmbientNpc(rng, entities, nextId, name, x, y, faction, occupation, [
      { defId: i % 3 === 0 ? 'water_coupon' : 'bread', count: 1 },
    ], faction === Faction.LIQUIDATOR ? 'makarov' : undefined);
  }
}

export function spawnTrafficBandNpc(
  rng: SeedRng,
  world: World,
  entities: Entity[],
  nextId: { v: number },
  name: string,
  x: number,
  y: number,
  faction: Faction,
  occupation: Occupation,
  item: string,
  weapon?: string,
): void {
  const pos = nearestFloorCell(world, x, y);
  spawnAmbientNpc(rng, entities, nextId, name, pos.x, pos.y, faction, occupation, [{ defId: item, count: 1 }], weapon);
}

export function spawnTrafficBands(rng: SeedRng, world: World, entities: Entity[], nextId: { v: number }): void {
  const spots: readonly [string, number, number, Faction, Occupation, string, string?][] = [
    ['Дикий с неверного съезда', 684, 596, Faction.WILD, Occupation.ALCOHOLIC, 'pipe', 'pipe'],
    ['Бетонный счетчик поворота', 690, 604, Faction.WILD, Occupation.TRAVELER, 'cigs', 'knife'],
    ['Резак у синей стрелки', 696, 600, Faction.WILD, Occupation.LOCKSMITH, 'spring', 'knife'],
    ['Молчаливый бандит развязки', 704, 608, Faction.WILD, Occupation.HUNTER, 'ammo_9mm', 'makarov'],
    ['Подручный Ксю на обочине', 712, 602, Faction.WILD, Occupation.TRAVELER, 'govnyak_roll', 'pipe'],
    ['Грузовой вор у гаража', 556, 572, Faction.WILD, Occupation.LOCKSMITH, 'metal_sheet', 'wrench'],
    ['Смотрящий за листовым металлом', 564, 576, Faction.WILD, Occupation.HUNTER, 'ammo_9mm', 'makarov'],
    ['Косой грузчик на стреме', 574, 570, Faction.WILD, Occupation.TRAVELER, 'bread', 'pipe'],
    ['Вор с дорожной биркой', 586, 574, Faction.WILD, Occupation.ALCOHOLIC, 'cigs', 'knife'],
    ['Банда западного делителя один', 334, 520, Faction.WILD, Occupation.TRAVELER, 'pipe', 'pipe'],
    ['Банда западного делителя два', 342, 526, Faction.WILD, Occupation.ALCOHOLIC, 'govnyak_roll', 'knife'],
    ['Банда западного делителя три', 350, 520, Faction.WILD, Occupation.LOCKSMITH, 'spring', 'wrench'],
    ['Патруль центра северный', 506, 490, Faction.LIQUIDATOR, Occupation.HUNTER, 'ammo_9mm', 'makarov'],
    ['Патруль центра восточный', 532, 506, Faction.LIQUIDATOR, Occupation.HUNTER, 'bandage', 'makarov'],
    ['Патруль центра западный', 492, 510, Faction.LIQUIDATOR, Occupation.HUNTER, 'liquidator_ration', 'makarov'],
    ['Регулировщик пробки', 516, 486, Faction.LIQUIDATOR, Occupation.HUNTER, 'fuse', 'makarov'],
    ['Конвойный с мелом', 344, 500, Faction.LIQUIDATOR, Occupation.HUNTER, 'ammo_9mm', 'makarov'],
    ['Проводник грузовой линии', 356, 506, Faction.CITIZEN, Occupation.TRAVELER, 'water_coupon'],
    ['Очередник за конвоем', 364, 514, Faction.CITIZEN, Occupation.HOUSEWIFE, 'bread'],
    ['Носильщик под вывеской', 382, 520, Faction.CITIZEN, Occupation.LOCKSMITH, 'metal_sheet'],
    ['Торговка у киоска', 408, 522, Faction.CITIZEN, Occupation.STOREKEEPER, 'filtered_water'],
    ['Покупатель с чужим талоном', 416, 526, Faction.CITIZEN, Occupation.TRAVELER, 'water_coupon'],
    ['Бегунок через южную зебру', 512, 684, Faction.CITIZEN, Occupation.TRAVELER, 'bread'],
    ['Санитар у безопасного бордюра', 618, 480, Faction.CITIZEN, Occupation.DOCTOR, 'bandage'],
    ['Механик светофорного обхода', 634, 556, Faction.CITIZEN, Occupation.MECHANIC, 'fuse', 'wrench'],
    ['Дежурная в тоннельной очереди', 650, 628, Faction.CITIZEN, Occupation.SECRETARY, 'note'],
    ['Ходок под восточной авеню', 666, 628, Faction.CITIZEN, Occupation.TRAVELER, 'water'],
    ['Дикий над тоннелем', 700, 628, Faction.WILD, Occupation.TRAVELER, 'cigs', 'knife'],
    ['Дикий в ложной витрине', 920, 512, Faction.WILD, Occupation.ALCOHOLIC, 'govnyak_roll', 'pipe'],
    ['Сторож восточного фальшобъезда', 928, 520, Faction.WILD, Occupation.HUNTER, 'ammo_9mm', 'makarov'],
    ['Путница с южного объезда', 512, 920, Faction.CITIZEN, Occupation.TRAVELER, 'tea'],
    ['Кладовщик южного тупика', 504, 912, Faction.CITIZEN, Occupation.STOREKEEPER, 'bread'],
    ['Бандит на южном хвосте', 520, 928, Faction.WILD, Occupation.TRAVELER, 'pipe', 'pipe'],
    ['Счетчик закрытого выезда', 104, 676, Faction.WILD, Occupation.LOCKSMITH, 'spring', 'wrench'],
  ];
  for (let i = 0; i < Math.min(CROSSROADS_TRAFFIC_BAND_CAP, spots.length); i++) {
    const [name, x, y, faction, occupation, item, weapon] = spots[i];
    spawnTrafficBandNpc(rng, world, entities, nextId, name, x, y, faction, occupation, item, weapon);
  }
}

export function nearestFloorCell(world: World, x: number, y: number): { x: number; y: number } {
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = world.wrap(x + dx);
        const ty = world.wrap(y + dy);
        const ci = world.idx(tx, ty);
        if (world.cells[ci] === Cell.FLOOR) return { x: tx, y: ty };
      }
    }
  }
  return { x: world.wrap(x), y: world.wrap(y) };
}

export function spawnMonster(rng: SeedRng, world: World, entities: Entity[], nextId: { v: number }, kind: MonsterKind, x: number, y: number, level: number): void {
  const pos = nearestFloorCell(world, x, y);
  const def = MONSTERS[kind];
  const hp = scaleMonsterHp(def.hp, level);
  const monster: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: pos.x + 0.5,
    y: pos.y + 0.5,
    angle: rng.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: CENTER, ty: CENTER, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
  };
  entities.push(monster);
}

export function spawnRoadHazards(rng: SeedRng, world: World, entities: Entity[], nextId: { v: number }, rooms: KeyRooms): void {
  spawnMonster(rng, world, entities, nextId, MonsterKind.REBAR, rooms.cargo.x + rooms.cargo.w - 7, rooms.cargo.y + 8, 4);
  spawnMonster(rng, world, entities, nextId, MonsterKind.REBAR, rooms.cargo.x + 8, rooms.cargo.y + rooms.cargo.h - 7, 4);
  spawnMonster(rng, world, entities, nextId, MonsterKind.SHADOW, rooms.wrongTurn.x + rooms.wrongTurn.w - 12, rooms.wrongTurn.y + 8, 5);
  spawnMonster(rng, world, entities, nextId, MonsterKind.NELYUD, 704, 602, 4);
  spawnMonster(rng, world, entities, nextId, MonsterKind.EYE, 512, 600, 4);
}

export function dropItem(entities: Entity[], nextId: { v: number }, x: number, y: number, defId: string, count = 1): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}

export function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

export function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  tags: string[],
  owner?: { id?: number; name?: string; faction?: Faction },
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.addContainer({
    id: nextContainerId(world),
    x,
    y,
    z: 60,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory: inventory.map(i => ({ ...i })),
    capacitySlots: Math.max(6, inventory.length + 3),
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: owner?.faction,
    access,
    discovered: true,
    tags: [DESIGN_FLOOR_ID, 'future_design_floor', ...tags],
  });
  setFeatureIfFloor(world, x, y, Feature.SHELF);
}

export function seedContainersAndDrops(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: KeyRooms,
  npcIds: CrossroadsNpcIds,
): void {
  addContainer(
    world,
    rooms.tollGate,
    rooms.tollGate.x + 13,
    rooms.tollGate.y + 7,
    ContainerKind.CASHBOX,
    'Касса платной перемычки',
    'owner',
    [
      { defId: 'key', count: 1 },
      { defId: 'water_coupon', count: 2 },
      { defId: 'cigs', count: 2 },
    ],
    ['toll', 'crowd_pressure', 'junction_key', 'theft'],
    { id: npcIds.militsiya, name: TRAFFIC_MILITSIYA.name, faction: Faction.LIQUIDATOR },
  );
  addContainer(
    world,
    rooms.cargo,
    rooms.cargo.x + rooms.cargo.w - 6,
    rooms.cargo.y + 5,
    ContainerKind.METAL_CABINET,
    'Шкаф украденного груза',
    'locked',
    [
      { defId: 'metal_sheet', count: 2 },
      { defId: 'water_coupon', count: 1 },
      { defId: 'voluntary_receipt', count: 1 },
    ],
    ['cargo', 'garage', 'theft', 'courier'],
    { id: npcIds.dima, name: COURIER_DIMA.name, faction: Faction.CITIZEN },
  );
  addContainer(
    world,
    rooms.control,
    rooms.control.x + rooms.control.w - 4,
    rooms.control.y + 5,
    ContainerKind.TOOL_LOCKER,
    'Светофорный щиток',
    'faction',
    [
      { defId: 'fuse', count: 1 },
      { defId: 'circuit_board', count: 1 },
      { defId: 'relay_diagram', count: 1 },
    ],
    ['junction_control', 'traffic_light', 'repair', 'liquidator'],
    { id: npcIds.militsiya, name: TRAFFIC_MILITSIYA.name, faction: Faction.LIQUIDATOR },
  );
  addContainer(
    world,
    rooms.kiosk,
    rooms.kiosk.x + rooms.kiosk.w - 5,
    rooms.kiosk.y + 5,
    ContainerKind.CASHBOX,
    'Касса дорожного киоска',
    'owner',
    [
      { defId: 'bread', count: 2 },
      { defId: 'filtered_water', count: 1 },
      { defId: 'cigs', count: 3 },
    ],
    ['kiosk', 'food', 'trade', 'theft'],
    { id: npcIds.granny, name: ZEBRA_GRANNY.name, faction: Faction.CITIZEN },
  );
  dropItem(entities, nextId, rooms.cargo.x + 7, rooms.cargo.y + rooms.cargo.h - 6, 'metal_sheet', 1);
  dropItem(entities, nextId, rooms.control.x + 6, rooms.control.y + 5, 'fuse', 1);
  dropItem(entities, nextId, rooms.wrongTurn.x + rooms.wrongTurn.w - 8, rooms.wrongTurn.y + 8, 'lift_scheme', 1);
}

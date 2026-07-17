import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  Cell,
  DoorState,
  EntityType,
  Faction,
  Occupation,
  QuestType,
  Tex,
  W,
  type Room,
} from '../../core/types';
import { REACH_GATE_KEY, REACH_GATE_NONE, auditReachability } from '../../core/world';
import { designNpcFloorKey, type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('manhattan_crossroads');

export const DESIGN_FLOOR_ID = 'manhattan_crossroads' as const;
export const MANHATTAN_CROSSROADS_Z = 8;

export const MANHATTAN_CROSSROADS_SEED = 9009;

export const CENTER = W >> 1;
export const DISTRICT_MIN = CENTER - 330;
export const DISTRICT_MAX = CENTER + 330;
export const AVENUE_WIDTH = 11;
export const STREET_WIDTH = 9;
export const SIDEWALK = 3;
export const ROAD_TEX = Tex.DARK;
export const SIDEWALK_TEX = Tex.F_CONCRETE;
export const MARK_TEX = Tex.F_TILE;
export const ROAD_WALL_TEX = Tex.CONCRETE;
export const OVERPASS_TEX = Tex.F_TILE;
export const UNDERPASS_TEX = Tex.F_CONCRETE;
export const CROSSWALK_ROOM_DEF_ID = 'Белая дорожная разметка';
export const CONTROL_ROOM_DEF_ID = 'Пост управления перекрестком';
export const CARGO_ROOM_DEF_ID = 'Гараж украденного груза';
export const WRONG_TURN_ROOM_DEF_ID = 'Съезд Неправильный поворот';
export const SAFE_CURB_ROOM_DEF_ID = 'Безопасный бордюр у зебры';
export const TOLL_GATE_ROOM_DEF_ID = 'Платная перемычка центральной зебры';
export const AVENUE_CENTERS = [232, 344, 512, 680, 792] as const;
export const STREET_CENTERS = [232, 344, 512, 680, 792] as const;
export const SHELL_AVENUE_CENTERS = [104, ...AVENUE_CENTERS, 920] as const;
export const SHELL_STREET_CENTERS = [104, ...STREET_CENTERS, 920] as const;
export const CROSSROADS_TOLL_CROWD_CAP = 12;
export const CROSSROADS_TRAFFIC_BAND_CAP = 34;

export type Axis = 'vertical' | 'horizontal';

export interface RoadSpan {
  axis: Axis;
  center: number;
  from: number;
  to: number;
  width: number;
  name: string;
}

export interface KeyRooms {
  control: Room;
  cargo: Room;
  wrongTurn: Room;
  safeCurb: Room;
  kiosk: Room;
  tollGate: Room;
}

export interface CrossroadsNpcIds {
  militsiya: number;
  granny: number;
  dima: number;
  ksu: number;
}

export interface AuditRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ManhattanCrossroadsDebugInfo {
  routeId: typeof DESIGN_FLOOR_ID;
  z: number;
  seed: number;
  junctions: readonly string[];
  blockers: readonly string[];
  questRooms: readonly string[];
  smokePath: string;
}

export interface ManhattanCrossroadsDecisionMetrics {
  crosswalkStripeCells: number;
  blockInteriorRooms: number;
  blockInteriorReachableCells: number;
  escortNpcPresent: boolean;
  tollDoorLocked: boolean;
  tollDoorRequiresKey: boolean;
  tollKeyContainers: number;
  tollQueueNpcs: number;
  overpassUngatedCells: number;
  underpassUngatedCells: number;
  controlRoomReachableCells: number;
  repairFuseCount: number;
  cargoRoomReachableCells: number;
  cargoMetalSheets: number;
  wrongExitUngatedCells: number;
  wrongExitMonsters: number;
}

export const MANHATTAN_CROSSROADS_DEBUG: ManhattanCrossroadsDebugInfo = {
  routeId: DESIGN_FLOOR_ID,
  z: MANHATTAN_CROSSROADS_Z,
  seed: MANHATTAN_CROSSROADS_SEED,
  junctions: [
    '4-way: Central Ave / Main Cross at 512,512',
    'T-junction: Central Ave / Wrong-Turn Spur at 512,600',
    '4-way: West Ave / Main Cross at 344,512',
    '4-way: East Ave / Main Cross at 680,512',
    'outer grid: five avenues and five cross streets between 232..792',
  ],
  blockers: [
    'Wrong-turn spur has no western approach, so the 512,600 node reads as a three-approach junction.',
    'Cargo garage is locked/faction-owned and can be looted, fought over, or handled through Dima.',
    'Three barricaded intersections force alley, storefront and overpass detours instead of a single straight road.',
    'Central zebra has a locked toll gate; the player can steal a key under witnesses or use the overpass/underpass bypass.',
    'Traffic bands seed visible wild clusters, convoy bodies and liquidator posts before the A-Life population field fills the road grid.',
  ],
  questRooms: [CONTROL_ROOM_DEF_ID, CARGO_ROOM_DEF_ID, WRONG_TURN_ROOM_DEF_ID, SAFE_CURB_ROOM_DEF_ID, TOLL_GATE_ROOM_DEF_ID],
  smokePath: 'Spawn on the south curb, choose the locked central toll gate or the east overpass bypass, cross two zebra markings, then reach the wrong-turn spur at 512,600.',
};

export const ROAD_SPANS: readonly RoadSpan[] = [
  { axis: 'vertical', center: 232, from: DISTRICT_MIN, to: DISTRICT_MAX, width: AVENUE_WIDTH, name: 'Западная окраинная авеню' },
  { axis: 'vertical', center: 344, from: DISTRICT_MIN, to: DISTRICT_MAX, width: AVENUE_WIDTH, name: 'Западная авеню' },
  { axis: 'vertical', center: 512, from: DISTRICT_MIN, to: DISTRICT_MAX, width: AVENUE_WIDTH, name: 'Центральная авеню' },
  { axis: 'vertical', center: 680, from: DISTRICT_MIN, to: DISTRICT_MAX, width: AVENUE_WIDTH, name: 'Восточная авеню' },
  { axis: 'vertical', center: 792, from: DISTRICT_MIN, to: DISTRICT_MAX, width: AVENUE_WIDTH, name: 'Крайняя восточная авеню' },
  { axis: 'horizontal', center: 232, from: DISTRICT_MIN, to: DISTRICT_MAX, width: STREET_WIDTH, name: 'Северный въезд' },
  { axis: 'horizontal', center: 344, from: DISTRICT_MIN, to: DISTRICT_MAX, width: STREET_WIDTH, name: 'Северная улица' },
  { axis: 'horizontal', center: 512, from: DISTRICT_MIN, to: DISTRICT_MAX, width: STREET_WIDTH, name: 'Главный кросс' },
  { axis: 'horizontal', center: 680, from: DISTRICT_MIN, to: DISTRICT_MAX, width: STREET_WIDTH, name: 'Южная улица' },
  { axis: 'horizontal', center: 792, from: DISTRICT_MIN, to: DISTRICT_MAX, width: STREET_WIDTH, name: 'Южный объезд' },
  { axis: 'horizontal', center: 600, from: 512, to: DISTRICT_MAX, width: STREET_WIDTH, name: 'Съезд Неправильный поворот' },
];

export const CENTRAL_CROSSWALK_AUDIT_RECTS: readonly AuditRect[] = [
  { x: 480, y: 480, w: 65, h: 65 },
  { x: 498, y: 592, w: 40, h: 20 },
];

export const OVERPASS_AUDIT_RECTS: readonly AuditRect[] = [
  { x: 548, y: 438, w: 8, h: 158 },
  { x: 506, y: 438, w: 50, h: 8 },
  { x: 548, y: 586, w: 92, h: 8 },
  { x: 632, y: 586, w: 8, h: 38 },
];

export const UNDERPASS_AUDIT_RECTS: readonly AuditRect[] = [
  { x: 292, y: 620, w: 212, h: 7 },
  { x: 494, y: 600, w: 7, h: 86 },
  { x: 650, y: 626, w: 136, h: 7 },
];

export const TRAFFIC_MILITSIYA: PlotNpcDef = {
  name: 'Сержант Оськин',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 175,
  maxHp: 175,
  money: 120,
  speed: 1.05,
  inventory: [
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 18 },
    { defId: 'fuse', count: 1 },
  ],
  talkLines: [
    'Перекресток мой. Не потому что я хочу, а потому что остальные считают полосы по трупам.',
    'Светофор не сломан, у него сгорела пара предохранителей. Вернешь питание - стрелка перестанет врать.',
    'На белые полосы наступай быстро. На черном асфальте шаги слышно дальше, чем надо.',
    'Центральная калитка платная не деньгами, а вниманием. Ключ лежит рядом, очередь тоже.',
  ],
  talkLinesPost: [
    'Свет снова мигает по уставу. Теперь страшно хотя бы ритмично.',
    'Если пойдешь по съезду с неверной стрелкой, не спорь с указателем вслух.',
  ],
};

export const ZEBRA_GRANNY: PlotNpcDef = {
  name: 'Бабка Зебрина',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 90,
  maxHp: 90,
  money: 18,
  speed: 0.58,
  inventory: [
    { defId: 'bread', count: 1 },
    { defId: 'water_coupon', count: 1 },
  ],
  talkLines: [
    'Я через эту зебру сорок лет хожу. Раньше машины боялись людей, теперь полосы боятся тени.',
    'Проводишь до Димы у киоска? Я медленная, зато помню, где асфальт проваливается.',
    'На середине не стой. Перекресток считает тех, кто задумался.',
  ],
  talkLinesPost: [
    'Дошли. Теперь я снова могу ругаться на дорогу с правильной стороны.',
    'Белая полоса не спасает. Просто на ней видно, кто бежит.',
  ],
};

export const COURIER_DIMA: PlotNpcDef = {
  name: 'Дима Курьер',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 105,
  maxHp: 105,
  money: 75,
  speed: 1.35,
  inventory: [
    { defId: 'water', count: 1 },
    { defId: 'metal_sheet', count: 1 },
  ],
  talkLines: [
    'Доставка по авеню: если дошел, значит адрес был настоящий.',
    'Груз увели в гараж за южной зеброй. Два листа металла, документы и чужая наглость.',
    'Милиция держит центр, Ксю знает боковые стрелки. Я знаю только, где меня еще не били.',
  ],
  talkLinesPost: [
    'Металл вернулся. Теперь дверь снова можно убедить, что она броня.',
    'Бабку довел? Хорошо. На этой дороге старость быстрее пули не бегает.',
  ],
  talkQuestResponse: 'Бабка дошла. Я видел, как перекресток притворился вежливым.',
};

export const ROAD_STALKER_KSU: PlotNpcDef = {
  name: 'Ксю Развязка',
  isFemale: true,
  faction: Faction.WILD,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 120,
  maxHp: 120,
  money: 64,
  speed: 1.2,
  inventory: [
    { defId: 'knife', count: 1 },
    { defId: 'lift_scheme', count: 1 },
    { defId: 'cigs', count: 2 },
  ],
  talkLines: [
    'В городе улица ведет к улице. Здесь улица ведет к этажу, если указатель врет красиво.',
    'Неверный съезд за восточной авеню открыт, но не любит свидетелей.',
    'Плати слухом, патроном или молчанием. Дорога всё равно возьмет сдачу.',
  ],
  talkLinesPost: [
    'Съезд увидел тебя и не забрал. Значит, сегодня ему хватило других.',
    'Если стрелка показывает вниз, проверь, не стоит ли она на потолке.',
  ],
};

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'crossroads_traffic_militsiya', TRAFFIC_MILITSIYA, [
  {
    id: 'crossroads_open_junction',
    giverId: getPlotNpcNumericId('crossroads_traffic_militsiya')!,
    type: QuestType.FETCH,
    desc: 'Оськин: «Два предохранителя на пост. Починим светофор — центр станет проходом, а не мясорубкой.»',
    targetItem: 'fuse',
    targetCount: 2,
    rewardItem: 'ammo_9mm',
    rewardCount: 12,
    extraRewards: [{ defId: 'water', count: 1 }],
    relationDelta: 12,
    xpReward: 70,
    moneyReward: 80,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'crossroads_zebra_granny', ZEBRA_GRANNY, [
  {
    id: 'crossroads_zebra_escort',
    giverId: getPlotNpcNumericId('crossroads_zebra_granny')!,
    type: QuestType.TALK,
    desc: 'Зебрина: «Проведи меня через две зебры к Диме {dir}. Если остановишься на черном, дорога решит, что ты знак.»',
    targetNpcId: getPlotNpcNumericId('crossroads_courier_dima')!,
    rewardItem: 'bread',
    rewardCount: 1,
    extraRewards: [{ defId: 'water_coupon', count: 1 }],
    relationDelta: 8,
    xpReward: 45,
    moneyReward: 20,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'crossroads_courier_dima', COURIER_DIMA, [
  {
    id: 'crossroads_stolen_cargo',
    giverId: getPlotNpcNumericId('crossroads_courier_dima')!,
    type: QuestType.FETCH,
    desc: 'Дима: «Из гаража украли два листа металла. Верни груз или продай совесть дешевле дороги.»',
    targetItem: 'metal_sheet',
    targetCount: 2,
    rewardItem: 'filtered_water',
    rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
    relationDelta: 10,
    xpReward: 60,
    moneyReward: 55,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'crossroads_road_stalker_ksu', ROAD_STALKER_KSU, [
  {
    id: 'crossroads_wrong_turn',
    giverId: getPlotNpcNumericId('crossroads_road_stalker_ksu')!,
    type: QuestType.VISIT,
    desc: 'Ксю: «Найди съезд с неправильной стрелкой {dir}. Не заходи глубоко, просто докажи, что дорога там есть.»',
    targetRoomDefId: WRONG_TURN_ROOM_DEF_ID,
    rewardItem: 'lift_scheme',
    rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 2 }],
    relationDelta: 7,
    xpReward: 50,
    moneyReward: 35,
  },
]);

export function getManhattanCrossroadsDebugLines(): string[] {
  return [
    `[FLOOR] route=${MANHATTAN_CROSSROADS_DEBUG.routeId} z=${MANHATTAN_CROSSROADS_DEBUG.z} seed=${MANHATTAN_CROSSROADS_DEBUG.seed}`,
    ...MANHATTAN_CROSSROADS_DEBUG.junctions.map(j => `[FLOOR] junction ${j}`),
    ...MANHATTAN_CROSSROADS_DEBUG.blockers.map(b => `[FLOOR] blocker ${b}`),
    `[FLOOR] smoke ${MANHATTAN_CROSSROADS_DEBUG.smokePath}`,
  ];
}

export function rectCells(rect: AuditRect): number[] {
  const cells: number[] = [];
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      cells.push((rect.y + dy) * W + rect.x + dx);
    }
  }
  return cells;
}

export function countUngatedRectCells(gen: FloorGeneration, rects: readonly AuditRect[], floorTex: Tex): number {
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  let count = 0;
  for (const rect of rects) {
    for (const rawIdx of rectCells(rect)) {
      const x = rawIdx % W;
      const y = (rawIdx / W) | 0;
      const ci = gen.world.idx(x, y);
      if (gen.world.cells[ci] !== Cell.FLOOR) continue;
      if (gen.world.floorTex[ci] !== floorTex) continue;
      if (!audit.reachable[ci] || audit.gateMask[ci] !== REACH_GATE_NONE) continue;
      count++;
    }
  }
  return count;
}

export function roomReachableCellCount(gen: FloorGeneration, roomDefId: string, ungatedOnly = false): number {
  const roomIds = new Set(gen.world.rooms.filter(room => room.name === roomDefId).map(room => room.id));
  if (roomIds.size === 0) return 0;
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  let count = 0;
  for (let ci = 0; ci < gen.world.cells.length; ci++) {
    if (!roomIds.has(gen.world.roomMap[ci])) continue;
    if (!audit.reachable[ci]) continue;
    if (ungatedOnly && audit.gateMask[ci] !== REACH_GATE_NONE) continue;
    count++;
  }
  return count;
}

export function countInventoryItem(generation: FloorGeneration, defId: string, containerTag?: string): number {
  let count = 0;
  for (const container of generation.world.containers) {
    if (containerTag && !container.tags.includes(containerTag)) continue;
    for (const item of container.inventory) {
      if (item.defId === defId) count += item.count;
    }
  }
  if (containerTag) return count;

  for (const entity of generation.entities) {
    if (!entity.alive || !entity.inventory) continue;
    for (const item of entity.inventory) {
      if (item.defId === defId) count += item.count;
    }
  }
  return count;
}

export function countNpcsNear(generation: FloorGeneration, x: number, y: number, radius: number): number {
  const r2 = radius * radius;
  let count = 0;
  for (const entity of generation.entities) {
    if (!entity.alive || entity.type !== EntityType.NPC) continue;
    if (generation.world.dist2(entity.x, entity.y, x, y) <= r2) count++;
  }
  return count;
}

export function countMonstersInRoom(generation: FloorGeneration, roomDefId: string): number {
  const roomIds = new Set(generation.world.rooms.filter(room => room.name === roomDefId).map(room => room.id));
  let count = 0;
  for (const entity of generation.entities) {
    if (!entity.alive || entity.type !== EntityType.MONSTER) continue;
    const ci = generation.world.idx(Math.floor(entity.x), Math.floor(entity.y));
    if (roomIds.has(generation.world.roomMap[ci])) count++;
  }
  return count;
}

export function measureManhattanCrossroadsDecisionMetrics(generation: FloorGeneration): ManhattanCrossroadsDecisionMetrics {
  const tollDoorIdx = generation.world.idx(512, 536);
  const tollDoor = generation.world.doors.get(tollDoorIdx);
  const audit = auditReachability(generation.world, generation.world.idx(Math.floor(generation.spawnX), Math.floor(generation.spawnY)));

  let crosswalkStripeCells = 0;
  for (const rect of CENTRAL_CROSSWALK_AUDIT_RECTS) {
    for (const rawIdx of rectCells(rect)) {
      const x = rawIdx % W;
      const y = (rawIdx / W) | 0;
      const ci = generation.world.idx(x, y);
      if (generation.world.floorTex[ci] !== MARK_TEX) continue;
      if (!audit.reachable[ci] || audit.gateMask[ci] !== REACH_GATE_NONE) continue;
      crosswalkStripeCells++;
    }
  }

  const blockRoomIds = new Set<number>();
  for (const room of generation.world.rooms) {
    if (!room.name.startsWith('Внутренний квартал')) continue;
    blockRoomIds.add(room.id);
  }
  let blockInteriorReachableCells = 0;
  if (blockRoomIds.size > 0) {
    for (let ci = 0; ci < generation.world.cells.length; ci++) {
      if (blockRoomIds.has(generation.world.roomMap[ci]) && audit.reachable[ci]) blockInteriorReachableCells++;
    }
  }

  return {
    crosswalkStripeCells,
    blockInteriorRooms: blockRoomIds.size,
    blockInteriorReachableCells,
    escortNpcPresent: generation.entities.some(entity => entity.id === getPlotNpcNumericId('crossroads_zebra_granny'))
      && generation.entities.some(entity => entity.id === getPlotNpcNumericId('crossroads_courier_dima')),
    tollDoorLocked: tollDoor?.state === DoorState.LOCKED,
    tollDoorRequiresKey: !!tollDoor && audit.reachable[tollDoorIdx] === 1 && audit.gateMask[tollDoorIdx] === REACH_GATE_KEY,
    tollKeyContainers: generation.world.containers.filter(container =>
      container.tags.includes('toll') && container.inventory.some(item => item.defId === 'key')).length,
    tollQueueNpcs: countNpcsNear(generation, 516.5, 540.5, 34),
    overpassUngatedCells: countUngatedRectCells(generation, OVERPASS_AUDIT_RECTS, OVERPASS_TEX),
    underpassUngatedCells: countUngatedRectCells(generation, UNDERPASS_AUDIT_RECTS, UNDERPASS_TEX),
    controlRoomReachableCells: roomReachableCellCount(generation, CONTROL_ROOM_DEF_ID),
    repairFuseCount: countInventoryItem(generation, 'fuse'),
    cargoRoomReachableCells: roomReachableCellCount(generation, CARGO_ROOM_DEF_ID),
    cargoMetalSheets: countInventoryItem(generation, 'metal_sheet', 'cargo'),
    wrongExitUngatedCells: roomReachableCellCount(generation, WRONG_TURN_ROOM_DEF_ID, true),
    wrongExitMonsters: countMonstersInRoom(generation, WRONG_TURN_ROOM_DEF_ID),
  };
}

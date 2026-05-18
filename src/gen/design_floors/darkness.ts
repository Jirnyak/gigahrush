/* ── Design floor: Darkness — post-Void light-resource pocket ─── */

import {
  W, Cell, Tex, Feature, RoomType, DoorState, LiftDirection,
  FloorLevel, ZoneFaction, Faction, Occupation, EntityType, AIGoal,
  MonsterKind, ContainerKind,
  type Entity, type Room, type Item, type WorldContainer,
  type GameState, type WorldEvent,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr, Spr } from '../../render/sprite_index';
import { publishEvent } from '../../systems/events';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import {
  carveCorridor,
  ensureConnectivity,
  generateZones,
  placeDoorAt,
  sanitizeDoors,
  stampRoom,
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';

export const DARKNESS_DESIGN_FLOOR_ID = 'darkness' as const;
export const DARKNESS_FUTURE_Z = 40;
export const DARKNESS_PRESERVED_NAME_ID = 'tamara_belova' as const;

export const DARKNESS_DEBUG_ENTRY = {
  routeId: DARKNESS_DESIGN_FLOOR_ID,
  z: DARKNESS_FUTURE_Z,
  generator: 'generateDarknessDesignFloor',
} as const;

type DarknessTollState = 'unpaid' | 'paid_light' | 'fought' | 'bypassed';
type DarknessQuestChoice =
  | 'spend_light'
  | 'save_light'
  | 'preserve_name'
  | 'leave_name'
  | 'pay_toll'
  | 'fight_shadows'
  | 'long_route'
  | 'carry_trace';

export interface DarknessRoomLabel {
  roomId: number;
  key: string;
  hiddenName: string;
  revealedName: string;
  lightCost: number;
  revealedAtStart: boolean;
}

export interface DarknessQuestDef {
  id: string;
  giverKey: string;
  title: string;
  objective: string;
  choices: DarknessQuestChoice[];
  rewardHint: string;
}

export interface DarknessFloorState {
  routeId: typeof DARKNESS_DESIGN_FLOOR_ID;
  z: typeof DARKNESS_FUTURE_Z;
  lightBudget: number;
  revealedRoomIds: number[];
  preservedNameId: typeof DARKNESS_PRESERVED_NAME_ID | null;
  shadowTollState: DarknessTollState;
  roomLabels: DarknessRoomLabel[];
  quests: DarknessQuestDef[];
  returnTracePublished: boolean;
}

export interface DarknessReturnTraceOptions {
  preservedNameId?: typeof DARKNESS_PRESERVED_NAME_ID;
  sourceRoomId?: number;
  sourceZoneId?: number;
  x?: number;
  y?: number;
}

interface DarknessNpcSpec {
  key: string;
  name: string;
  isFemale: boolean;
  faction: Faction;
  occupation: Occupation;
  roomKey: string;
  dx: number;
  dy: number;
  hp: number;
  speed: number;
  money: number;
  inventory: Item[];
}

interface DarknessRoomSpec {
  key: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  hiddenName: string;
  revealedName: string;
  lightCost: number;
  revealedAtStart?: boolean;
  lamps?: readonly [number, number, Feature][];
  fog?: number;
}

const ROOM_ORIGIN_X = (W >> 1) - 36;
const ROOM_ORIGIN_Y = (W >> 1) - 10;

const ROOM_SPECS: readonly DarknessRoomSpec[] = [
  {
    key: 'entry',
    type: RoomType.COMMON,
    x: ROOM_ORIGIN_X,
    y: ROOM_ORIGIN_Y + 8,
    w: 12,
    h: 9,
    hiddenName: 'Порог',
    revealedName: 'Порог остаточного света',
    lightCost: 0,
    revealedAtStart: true,
    lamps: [[2, 2, Feature.LAMP], [9, 6, Feature.CANDLE]],
    fog: 12,
  },
  {
    key: 'junction',
    type: RoomType.CORRIDOR,
    x: ROOM_ORIGIN_X + 16,
    y: ROOM_ORIGIN_Y + 10,
    w: 22,
    h: 5,
    hiddenName: 'Темный коридор',
    revealedName: 'Коридор остаточного света',
    lightCost: 1,
    revealedAtStart: true,
    lamps: [[2, 2, Feature.CANDLE], [18, 2, Feature.CANDLE]],
    fog: 24,
  },
  {
    key: 'lamp',
    type: RoomType.STORAGE,
    x: ROOM_ORIGIN_X + 43,
    y: ROOM_ORIGIN_Y + 2,
    w: 13,
    h: 10,
    hiddenName: 'Комната с теплым пятном',
    revealedName: 'Пост Ники-лампоносца',
    lightCost: 2,
    lamps: [[2, 2, Feature.LAMP], [10, 7, Feature.CANDLE]],
    fog: 18,
  },
  {
    key: 'name',
    type: RoomType.OFFICE,
    x: ROOM_ORIGIN_X + 66,
    y: ROOM_ORIGIN_Y - 4,
    w: 15,
    h: 11,
    hiddenName: 'Комната без названия',
    revealedName: 'Регистратура Тамары Беловой',
    lightCost: 3,
    lamps: [[3, 2, Feature.CANDLE]],
    fog: 42,
  },
  {
    key: 'toll',
    type: RoomType.COMMON,
    x: ROOM_ORIGIN_X + 66,
    y: ROOM_ORIGIN_Y + 17,
    w: 15,
    h: 11,
    hiddenName: 'Темный сбор',
    revealedName: 'Пункт теневой пошлины',
    lightCost: 2,
    lamps: [[2, 8, Feature.CANDLE]],
    fog: 48,
  },
  {
    key: 'bypass',
    type: RoomType.CORRIDOR,
    x: ROOM_ORIGIN_X + 39,
    y: ROOM_ORIGIN_Y + 34,
    w: 35,
    h: 4,
    hiddenName: 'Длинная темнота',
    revealedName: 'Обход без ламп',
    lightCost: 1,
    fog: 38,
  },
  {
    key: 'trace',
    type: RoomType.OFFICE,
    x: ROOM_ORIGIN_X + 92,
    y: ROOM_ORIGIN_Y + 8,
    w: 13,
    h: 9,
    hiddenName: 'Пустое место',
    revealedName: 'Комната возвратного следа',
    lightCost: 2,
    lamps: [[6, 4, Feature.LAMP]],
    fog: 56,
  },
];

const QUESTS: readonly DarknessQuestDef[] = [
  {
    id: 'darkness_keep_lamp_alive',
    giverKey: 'darkness_lamp_bearer_nika',
    title: 'Держать лампу живой',
    objective: 'Донести свет от порога до возвратного следа, не тратя его на каждую дверь.',
    choices: ['spend_light', 'save_light'],
    rewardHint: 'светлая короткая дорога или запас фонаря на обратный путь',
  },
  {
    id: 'darkness_find_name',
    giverKey: 'darkness_name_lost',
    title: 'Вернуть имя',
    objective: 'Осветить безымянную регистратуру и сохранить одну карточку имени.',
    choices: ['preserve_name', 'leave_name'],
    rewardHint: 'имя Тамары Беловой становится переносимым фактом',
  },
  {
    id: 'darkness_shadow_toll',
    giverKey: 'darkness_shadow_collector',
    title: 'Теневая пошлина',
    objective: 'Отдать лампу, драться с тенями или идти длинным темным обходом.',
    choices: ['pay_toll', 'fight_shadows', 'long_route'],
    rewardHint: 'короткий путь, добыча с теней или сохраненный свет',
  },
  {
    id: 'darkness_return_with_trace',
    giverKey: 'darkness_return_trace',
    title: 'Вынести след',
    objective: 'Забрать засвеченный кадр и вынести его будущим адресатам: Жилой зоне, Министерству или Якову.',
    choices: ['carry_trace'],
    rewardHint: 'структурированное событие darkness_return_trace для поздних хуков',
  },
];

const NPC_SPECS: readonly DarknessNpcSpec[] = [
  {
    key: 'darkness_lamp_bearer_nika',
    name: 'Ника с лампой',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.ELECTRICIAN,
    roomKey: 'lamp',
    dx: 3,
    dy: 4,
    hp: 90,
    speed: 1.25,
    money: 18,
    inventory: [
      { defId: 'flashlight', count: 1 },
      { defId: 'lamp_bulb', count: 2 },
      { defId: 'water', count: 1 },
      {
        defId: 'note',
        count: 1,
        data: 'Ника: свет не бесплатный. Потратишь на таблички - обратно пойдешь на ощупь.',
      },
    ],
  },
  {
    key: 'darkness_name_lost',
    name: 'Женщина без имени',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.SECRETARY,
    roomKey: 'name',
    dx: 7,
    dy: 5,
    hp: 70,
    speed: 0.8,
    money: 0,
    inventory: [
      {
        defId: 'note',
        count: 1,
        data: 'Под лампой читается: Тамара Белова, кв. нет, этаж спорный. В темноте строка снова пустая.',
      },
    ],
  },
  {
    key: 'darkness_shadow_collector',
    name: 'Сборщик тени',
    isFemale: false,
    faction: Faction.CULTIST,
    occupation: Occupation.PILGRIM,
    roomKey: 'toll',
    dx: 7,
    dy: 5,
    hp: 160,
    speed: 0.9,
    money: 0,
    inventory: [
      {
        defId: 'note',
        count: 1,
        data: 'Пошлина принимается светом. Отказ принимается тенью. Обход принимает время.',
      },
    ],
  },
  {
    key: 'darkness_return_trace',
    name: 'След возврата',
    isFemale: false,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    roomKey: 'trace',
    dx: 6,
    dy: 4,
    hp: 1,
    speed: 0,
    money: 0,
    inventory: [
      { defId: 'overexposed_photo', count: 1 },
      {
        defId: 'note',
        count: 1,
        data: 'На белом кадре проступает чужая подпись: Тамара Белова вернулась в список, но список не знает где.',
      },
    ],
  },
];

const darknessStateByWorld = new WeakMap<World, DarknessFloorState>();

function centerX(room: Room): number {
  return worldWrap(room.x + (room.w >> 1));
}

function centerY(room: Room): number {
  return worldWrap(room.y + (room.h >> 1));
}

function worldWrap(v: number): number {
  return ((v % W) + W) % W;
}

function applyRoomLook(world: World, room: Room, wallTex: Tex, floorTex: Tex, fog: number): void {
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[ci] = floorTex;
        world.fog[ci] = Math.max(world.fog[ci], fog);
      } else {
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

function placeRoomLights(world: World, room: Room, lamps: readonly [number, number, Feature][] | undefined): void {
  if (!lamps) return;
  for (const [dx, dy, feature] of lamps) {
    const ci = world.idx(room.x + dx, room.y + dy);
    if (world.cells[ci] === Cell.FLOOR) world.features[ci] = feature;
  }
}

function connectRoomCenters(world: World, a: Room, b: Room): void {
  carveCorridor(world, centerX(a), centerY(a), centerX(b), centerY(b));
}

function setDoorStates(world: World): void {
  for (const door of world.doors.values()) {
    door.state = DoorState.CLOSED;
    door.timer = 0;
  }
}

function paintCorridors(world: World): void {
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.WALL) {
      if (!world.wallTex[i]) world.wallTex[i] = Tex.DARK;
      continue;
    }
    if (!world.floorTex[i]) world.floorTex[i] = Tex.F_CONCRETE;
    if (world.roomMap[i] < 0) world.fog[i] = Math.max(world.fog[i], 30);
  }
  world.markFogDirty();
}

function addLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = direction;
}

function dropItem(
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  item: Item,
): void {
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
    inventory: [item],
  });
}

function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  name: string,
  inventory: Item[],
  tags: string[],
): void {
  const id = nextContainerId(world);
  const ci = world.idx(x, y);
  const container: WorldContainer = {
    id,
    x: world.wrap(x),
    y: world.wrap(y),
    floor: FloorLevel.VOID,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind: ContainerKind.SECRET_STASH,
    name,
    inventory,
    capacitySlots: 6,
    access: 'public',
    discovered: true,
    tags,
  };
  world.addContainer(container);
}

function spawnNpc(entities: Entity[], nextId: { v: number }, room: Room, spec: DarknessNpcSpec): number {
  const id = nextId.v++;
  entities.push({
    id,
    type: EntityType.NPC,
    x: room.x + spec.dx + 0.5,
    y: room.y + spec.dy + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: spec.speed,
    sprite: spec.occupation,
    name: spec.name,
    isFemale: spec.isFemale,
    needs: freshNeeds(),
    hp: spec.hp,
    maxHp: spec.hp,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: spec.inventory.map(item => ({ ...item })),
    faction: spec.faction,
    occupation: spec.occupation,
    canGiveQuest: true,
    questId: -1,
    money: spec.money,
  });
  return id;
}

function spawnMonster(
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name?: string,
): void {
  const def = MONSTERS[kind];
  const hp = Math.round(scaleMonsterHp(def.hp, level));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(level),
    phasing: kind === MonsterKind.SPIRIT,
  });
}

function buildRooms(world: World): { roomsByKey: Map<string, Room>; labels: DarknessRoomLabel[] } {
  const roomsByKey = new Map<string, Room>();
  const labels: DarknessRoomLabel[] = [];

  for (const spec of ROOM_SPECS) {
    const room = stampRoom(world, world.rooms.length, spec.type, spec.x, spec.y, spec.w, spec.h, -1);
    room.name = spec.revealedAtStart ? spec.revealedName : spec.hiddenName;
    applyRoomLook(world, room, Tex.DARK, spec.key === 'trace' ? Tex.F_VOID : Tex.F_CONCRETE, spec.fog ?? 30);
    placeRoomLights(world, room, spec.lamps);
    roomsByKey.set(spec.key, room);
    labels.push({
      roomId: room.id,
      key: spec.key,
      hiddenName: spec.hiddenName,
      revealedName: spec.revealedName,
      lightCost: spec.lightCost,
      revealedAtStart: spec.revealedAtStart === true,
    });
  }

  const entry = roomsByKey.get('entry')!;
  const junction = roomsByKey.get('junction')!;
  const lamp = roomsByKey.get('lamp')!;
  const name = roomsByKey.get('name')!;
  const toll = roomsByKey.get('toll')!;
  const bypass = roomsByKey.get('bypass')!;
  const trace = roomsByKey.get('trace')!;

  connectRoomCenters(world, entry, junction);
  connectRoomCenters(world, junction, lamp);
  connectRoomCenters(world, lamp, name);
  connectRoomCenters(world, name, trace);
  connectRoomCenters(world, junction, toll);
  connectRoomCenters(world, toll, trace);
  connectRoomCenters(world, lamp, bypass);
  connectRoomCenters(world, bypass, trace);

  placeDoorAt(world, entry.x - 1, entry.y + (entry.h >> 1), entry.id);
  addLift(world, entry.x - 2, entry.y + (entry.h >> 1), LiftDirection.UP);
  placeDoorAt(world, trace.x + trace.w, trace.y + (trace.h >> 1), trace.id);
  addLift(world, trace.x + trace.w + 1, trace.y + (trace.h >> 1), LiftDirection.DOWN);

  setDoorStates(world);
  sanitizeDoors(world);
  paintCorridors(world);
  return { roomsByKey, labels };
}

function placeContent(world: World, entities: Entity[], nextId: { v: number }, roomsByKey: Map<string, Room>): void {
  for (const spec of NPC_SPECS) {
    const room = roomsByKey.get(spec.roomKey);
    if (room) spawnNpc(entities, nextId, room, spec);
  }

  const entry = roomsByKey.get('entry')!;
  const lamp = roomsByKey.get('lamp')!;
  const name = roomsByKey.get('name')!;
  const toll = roomsByKey.get('toll')!;
  const trace = roomsByKey.get('trace')!;
  const bypass = roomsByKey.get('bypass')!;

  dropItem(entities, nextId, entry.x + 4, entry.y + 4, {
    defId: 'note',
    count: 1,
    data: 'ТЬМА: стартовый бюджет света - 8. Комната стоит 1-3. Не всякую табличку надо спасать.',
  });
  dropItem(entities, nextId, entry.x + 7, entry.y + 4, { defId: 'flashlight', count: 1 });

  addContainer(world, lamp, lamp.x + 9, lamp.y + 5, 'Ящик Ники: запас света', [
    { defId: 'lamp_bulb', count: 3 },
    { defId: 'fuse', count: 1 },
    {
      defId: 'note',
      count: 1,
      data: 'Зарядов мало. Один откроет подпись комнаты, два удержат Нику рядом, три купят короткий путь.',
    },
  ], ['darkness', 'light_budget', 'lamp_survival']);

  addContainer(world, name, name.x + 10, name.y + 5, 'Карточка имени под лампой', [
    {
      defId: 'personal_file_copy',
      count: 1,
      data: { darknessNameId: DARKNESS_PRESERVED_NAME_ID },
    },
    {
      defId: 'note',
      count: 1,
      data: 'Тамара Белова. Дата рождения читается, пока горит лампа. Без света карточка пустеет.',
    },
  ], ['darkness', 'preserved_name', DARKNESS_PRESERVED_NAME_ID]);

  addContainer(world, toll, toll.x + 2, toll.y + 8, 'Короткий путь за свет', [
    {
      defId: 'note',
      count: 1,
      data: 'Если отдать лампу сборщику, тени расходятся на один проход. Если нет - они остаются голодными.',
    },
  ], ['darkness', 'shadow_toll', 'pay_light']);

  addContainer(world, bypass, bypass.x + 18, bypass.y + 2, 'Темный обходной тайник', [
    { defId: 'bandage', count: 1 },
    { defId: 'ammo_9mm', count: 8 },
    {
      defId: 'note',
      count: 1,
      data: 'Обход длинный, но свет остается у тебя. Слушай стены, а не таблички.',
    },
  ], ['darkness', 'shadow_toll', 'long_route']);

  addContainer(world, trace, trace.x + 6, trace.y + 6, 'Отметина возврата', [
    { defId: 'overexposed_photo', count: 1 },
    {
      defId: 'note',
      count: 1,
      data: 'Возвратный след: living/ministry/yakov. Один сохраненный факт разрешен к переносу.',
    },
  ], ['darkness', 'return_trace', 'living_hook', 'ministry_hook', 'yakov_hook']);

  spawnMonster(entities, nextId, MonsterKind.SHADOW, toll.x + 11, toll.y + 3, 12, 'Тень пошлины');
  spawnMonster(entities, nextId, MonsterKind.SHADOW, toll.x + 12, toll.y + 8, 12, 'Тень сдачи');
  spawnMonster(entities, nextId, MonsterKind.SHADOW, name.x + 3, name.y + 8, 11, 'Тень без фамилии');
  spawnMonster(entities, nextId, MonsterKind.EYE, trace.x + 9, trace.y + 2, 13, 'Глаз возврата');
}

function applyDarknessZones(world: World): void {
  generateZones(world);
  for (const zone of world.zones) {
    zone.faction = ZoneFaction.SAMOSBOR;
    zone.fogged = true;
    zone.level = 12;
    zone.hasLift = false;
  }
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT) world.zones[world.zoneMap[i]].hasLift = true;
  }
}

function initialState(labels: DarknessRoomLabel[]): DarknessFloorState {
  return {
    routeId: DARKNESS_DESIGN_FLOOR_ID,
    z: DARKNESS_FUTURE_Z,
    lightBudget: 8,
    revealedRoomIds: labels.filter(label => label.revealedAtStart).map(label => label.roomId),
    preservedNameId: null,
    shadowTollState: 'unpaid',
    roomLabels: labels,
    quests: QUESTS.map(q => ({ ...q, choices: [...q.choices] })),
    returnTracePublished: false,
  };
}

export function getDarknessState(world: World): DarknessFloorState | null {
  return darknessStateByWorld.get(world) ?? null;
}

export function publishDarknessReturnTrace(
  state: GameState,
  options: DarknessReturnTraceOptions = {},
): WorldEvent {
  return publishEvent(state, {
    type: 'rumor_observed',
    floor: state.currentFloor,
    zoneId: options.sourceZoneId,
    roomId: options.sourceRoomId,
    x: options.x,
    y: options.y,
    actorName: 'Тьма',
    targetName: 'Жилая зона / Министерство / Яков',
    severity: 4,
    privacy: 'secret',
    tags: ['darkness', 'return_trace', 'living_hook', 'ministry_hook', 'yakov_hook'],
    data: {
      routeId: DARKNESS_DESIGN_FLOOR_ID,
      z: DARKNESS_FUTURE_Z,
      preservedNameId: options.preservedNameId ?? DARKNESS_PRESERVED_NAME_ID,
      fact: 'one_name_returned_from_darkness',
    },
  });
}

export function generateDarknessDesignFloor(): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 1 };

  world.wallTex.fill(Tex.DARK);
  world.floorTex.fill(Tex.F_CONCRETE);

  const { roomsByKey, labels } = buildRooms(world);
  const entry = roomsByKey.get('entry')!;
  const spawnX = entry.x + 2.5;
  const spawnY = entry.y + (entry.h >> 1) + 0.5;

  applyDarknessZones(world);
  placeContent(world, entities, nextId, roomsByKey);
  ensureConnectivity(world, spawnX, spawnY);
  world.bakeLights();

  darknessStateByWorld.set(world, initialState(labels));

  return { world, entities, spawnX, spawnY };
}

/* -- Design floor 69: adult vice, debt, blackmail and refuge ---- */

import {
  AIGoal, Cell, ContainerKind, DoorState, EntityType, Faction, Feature,
  FloorLevel, LiftDirection, Occupation, QuestType, RoomType, Tex, ZoneFaction,
  type ContainerAccess, type Entity, type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom } from '../../core/rand';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { Spr } from '../../render/sprite_index';
import { calcZoneLevel } from '../../systems/rpg';
import {
  carveCorridor,
  ensureConnectivity,
  generateZones,
  placeDoor,
  protectRoom,
  sanitizeDoors,
  stampRoom,
} from '../shared';
import { genLog } from '../log';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_FLOOR_ID = 'floor_69' as const;
export const DESIGN_FLOOR_Z = 4;
export const FLOOR_69_DEFAULT_SEED = 690004;

// Current core state still requires a FloorLevel. Future route integration should
// adapt this string-route floor instead of adding a casual enum here.
const FLOOR_69_BASE_FLOOR = FloorLevel.MAINTENANCE;
const FLOOR_69_MAX_FLAGS = 8;

export interface Floor69State {
  heat: number;
  trust: number;
  raidUntilHour: number;
  debtFlags: string[];
  blackmailFlags: string[];
}

export interface Floor69Generation extends FloorGeneration {
  routeId: typeof DESIGN_FLOOR_ID;
  z: typeof DESIGN_FLOOR_Z;
  seed: number;
  state: Floor69State;
  debugLines: string[];
}

function bounded(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function createFloor69State(state: Partial<Floor69State> = {}): Floor69State {
  return {
    heat: bounded(state.heat ?? 34, 0, 100),
    trust: bounded(state.trust ?? 0, -5, 5),
    raidUntilHour: Math.max(-1, state.raidUntilHour ?? -1),
    debtFlags: (state.debtFlags ?? ['f69_roza_ledger_live', 'f69_market_88_debt_link'])
      .slice(0, FLOOR_69_MAX_FLAGS),
    blackmailFlags: (state.blackmailFlags ?? ['f69_official_denunciation_live'])
      .slice(0, FLOOR_69_MAX_FLAGS),
  };
}

export function floor69DebugLines(state: Floor69State, seed = FLOOR_69_DEFAULT_SEED): string[] {
  const s = createFloor69State(state);
  return [
    `route=${DESIGN_FLOOR_ID} z=${DESIGN_FLOOR_Z} seed=${seed}`,
    `heat=${s.heat}/100 trust=${s.trust}/5 raidUntilHour=${s.raidUntilHour}`,
    `debt=${s.debtFlags.join(',') || 'none'}`,
    `blackmail=${s.blackmailFlags.join(',') || 'none'}`,
    'debugEntry=generateFloor69DesignFloor(seed)',
  ];
}

/*
 * Adult-only constraint: Floor 69 handles social crime and harm reduction.
 * Do not add minors, child sprites, graphic sex text, or explicit mechanics here.
 */
const NPC_DEFS: Record<string, PlotNpcDef> = {
  f69_madam_roza: {
    name: 'Роза Красная',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.DIRECTOR,
    sprite: Spr.F69_FEMALE_NPC_0,
    hp: 160, maxHp: 160, money: 340, speed: 0.75,
    inventory: [
      { defId: 'fake_pass', count: 1 },
      { defId: 'voluntary_receipt', count: 2 },
      { defId: 'cigs', count: 4 },
    ],
    talkLines: [
      'Этаж держится на взрослых сделках и закрытых дверях. Кто путает тишину с правом, быстро знакомится с долгом.',
      'Рейд приходит не за правдой. Он приходит за списком, который можно продать дважды.',
      'Если нашел чужой компромат, реши сразу: прятать, сдавать или считать прибыль.',
    ],
    talkLinesPost: [
      'Долги любят порядок. Люди порядок любят меньше.',
      'Тихая комната стоит дороже, когда сирена уже близко.',
    ],
  },

  f69_guard_venya: {
    name: 'Веня Шлагбаум',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 240, maxHp: 240, money: 55, speed: 0.9,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 12 },
      { defId: 'emergency_roster', count: 1 },
    ],
    talkLines: [
      'Пост простой: оружие видно, бумаги на стол, чужие двери не трогать.',
      'Я не святой и не инспектор. Я считаю, кто успеет в тихие комнаты до рейда.',
      'Список рейда стоит дороже патрона, потому что стреляет до выстрела.',
    ],
    talkLinesPost: [
      'Сегодня проход мягче. Не путай это с доверием.',
      'Если список пропал, значит кто-то уже выбрал сторону.',
    ],
  },

  f69_performer_ira: {
    name: 'Ира Сцена',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.TRAVELER,
    sprite: Spr.F69_FEMALE_NPC_3,
    hp: 90, maxHp: 90, money: 28, speed: 1.0,
    inventory: [
      { defId: 'sealed_complaint', count: 1 },
      { defId: 'tea', count: 1 },
    ],
    talkLines: [
      'Я работаю на сцене, не в чужом сейфе. Но сейф почему-то хранит мое имя.',
      'Компромат называют страховкой те, кто никогда не платит собой.',
      'Если начнется рейд, мне нужен тихий вход к доктору, а не геройская речь.',
    ],
    talkLinesPost: [
      'Бумага сгорела. Пахнет лучше, чем страх.',
      'Сима держит дверь. Значит, есть еще место, где не торгуют человеком.',
    ],
  },

  f69_doctor_sima: {
    name: 'Доктор Сима',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.DOCTOR,
    sprite: Occupation.DOCTOR,
    hp: 130, maxHp: 130, money: 85, speed: 0.8,
    inventory: [
      { defId: 'bandage', count: 4 },
      { defId: 'pills', count: 2 },
      { defId: 'clean_health_cert', count: 1 },
    ],
    talkLines: [
      'Клиника не спрашивает профессию. Клиника спрашивает пульс, воду и чем перевязать.',
      'Антибиотик закончился быстрее морали. Фильтры тоже уходят в долг.',
      'Кто прячется от рейда, сначала дышит. Потом уже объясняет.',
    ],
    talkLinesPost: [
      'Запасы пополнили. Теперь можно лечить, а не только выбирать очередь.',
      'Тихая комната открыта для взрослых, которым нужен врач, а не протокол.',
    ],
    talkQuestResponse: 'Передай Ире: тихая комната готова. Вход через служебный ход, без лишних имен.',
  },

  f69_accountant_nil: {
    name: 'Нил Расписочный',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 105, maxHp: 105, money: 210, speed: 0.7,
    inventory: [
      { defId: 'blank_form', count: 2 },
      { defId: 'ink_bottle', count: 1 },
      { defId: 'official_permit_slip', count: 1 },
    ],
    talkLines: [
      'Долг без подписи - просьба. Долг с подписью - маршрут.',
      'Рынок 88 покупает не людей, а сроки. Это звучит приличнее только в книге учета.',
      'Черная строка в журнале лечится тремя способами: оплатить, подделать, сжечь.',
    ],
    talkLinesPost: [
      'Строка закрыта. Человек пока нет.',
      'Чем меньше листов в сейфе, тем тише этот этаж.',
    ],
  },
};

registerSideQuest('f69_madam_roza', NPC_DEFS.f69_madam_roza, [
  {
    id: 'f69_blackmail_profit',
    giverNpcId: 'f69_madam_roza',
    type: QuestType.FETCH,
    desc: 'Роза: «В сейфе лежит донос на чиновника. Принесешь мне - долг этажа станет твоей премией, а не чужим поводком.»',
    targetItem: 'denunciation', targetCount: 1,
    rewardItem: 'fake_pass', rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 3 }],
    relationDelta: -3, xpReward: 65, moneyReward: 190,
  },
]);

registerSideQuest('f69_guard_venya', NPC_DEFS.f69_guard_venya, [
  {
    id: 'f69_raid_choice',
    giverNpcId: 'f69_guard_venya',
    type: QuestType.FETCH,
    desc: 'Веня: «В посту лежит список рейда. Заберешь его - предупредим тихие комнаты. Продашь или сдашь инспекторам - это уже твоя сторона.»',
    targetItem: 'emergency_roster', targetCount: 1,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 10 }],
    relationDelta: 8, xpReward: 60, moneyReward: 55,
  },
]);

registerSideQuest('f69_performer_ira', NPC_DEFS.f69_performer_ira, [
  {
    id: 'f69_blackmail_protect',
    giverNpcId: 'f69_performer_ira',
    type: QuestType.FETCH,
    desc: 'Ира: «Найди донос из сейфа и отдай мне. Я сожгу копию до рейда, пока ей не торгуют людьми.»',
    targetItem: 'denunciation', targetCount: 1,
    rewardItem: 'clean_health_cert', rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 2 }],
    relationDelta: 16, xpReward: 75, moneyReward: 35,
  },
  {
    id: 'f69_hide_worker',
    giverNpcId: 'f69_performer_ira',
    type: QuestType.TALK,
    desc: 'Ира: «Договорись с доктором Симой о тихой комнате. Если рейд начнется, мне нужен безопасный вход через служебный ход.»',
    targetPlotNpcId: 'f69_doctor_sima',
    rewardItem: 'pills', rewardCount: 1,
    extraRewards: [{ defId: 'water', count: 1 }],
    relationDelta: 12, xpReward: 50, moneyReward: 40,
  },
]);

registerSideQuest('f69_doctor_sima', NPC_DEFS.f69_doctor_sima, [
  {
    id: 'f69_clinic_supply',
    giverNpcId: 'f69_doctor_sima',
    type: QuestType.FETCH,
    desc: 'Доктор Сима: «Нужен антибиотик. Не спрашиваю, купишь, выкрадешь или выменяешь. Тут сначала лечат.»',
    targetItem: 'antibiotic', targetCount: 1,
    rewardItem: 'sanitary_kit', rewardCount: 1,
    extraRewards: [{ defId: 'gasmask_filter', count: 1 }],
    relationDelta: 14, xpReward: 70, moneyReward: 45,
  },
]);

registerSideQuest('f69_accountant_nil', NPC_DEFS.f69_accountant_nil, [
  {
    id: 'f69_debt_ledger',
    giverNpcId: 'f69_accountant_nil',
    type: QuestType.FETCH,
    desc: 'Нил: «Две добровольные расписки из долговой картотеки. После этого строку можно оплатить, переписать или потерять.»',
    targetItem: 'voluntary_receipt', targetCount: 2,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'blank_form', count: 1 }],
    relationDelta: 6, xpReward: 65, moneyReward: 80,
  },
  {
    id: 'f69_blackmail_expose',
    giverNpcId: 'f69_accountant_nil',
    type: QuestType.FETCH,
    desc: 'Нил: «Принеси акт о пропавшей записи. Если бумагу показать наверху, компромат перестанет быть товаром.»',
    targetItem: 'record_exposure_notice', targetCount: 1,
    rewardItem: 'blank_form', rewardCount: 2,
    extraRewards: [{ defId: 'ink_bottle', count: 1 }],
    relationDelta: 4, xpReward: 70, moneyReward: 60,
  },
]);

interface Floor69Rooms {
  publicLift: Room;
  publicCorridor: Room;
  checkpoint: Room;
  hall: Room;
  clinic: Room;
  debtOffice: Room;
  refuge: Room;
  ledger: Room;
  staffRoute: Room;
  staffLift: Room;
}

function applyRoomTextures(world: World, room: Room, wallTex: Tex, floorTex: Tex): void {
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  }
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
    }
  }
}

function addRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  applyRoomTextures(world, room, wallTex, floorTex);
  protectRoom(world, room.x, room.y, room.w, room.h, wallTex, floorTex);
  return room;
}

function connect(
  world: World,
  a: Room,
  b: Room,
  keyId = '',
  state: DoorState = DoorState.CLOSED,
): void {
  const before = new Set(a.doors);
  placeDoor(world, a, b, keyId, state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED);
  const doorIdx = a.doors.find(idx => !before.has(idx));
  if (doorIdx === undefined) {
    carveCorridor(world, a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2), b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2));
    return;
  }
  const door = world.doors.get(doorIdx);
  if (door) {
    door.state = state;
    door.keyId = keyId;
  }
  world.wallTex[doorIdx] = state === DoorState.LOCKED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
}

function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = feature;
}

function addScreenWall(world: World, x: number, y: number, variant: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.WALL) return;
  world.wallTex[ci] = Tex.SCREEN_BASE + (variant % 32);
  world.screenCells.push(ci);
}

function addPosterWall(world: World, x: number, y: number, variant: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = Tex.POSTER_BASE + (variant % 64);
}

function addLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const liftIdx = world.idx(x, y);
  world.cells[liftIdx] = Cell.LIFT;
  world.wallTex[liftIdx] = Tex.LIFT_DOOR;
  world.roomMap[liftIdx] = -1;
  world.features[liftIdx] = Feature.NONE;
  world.liftDir[liftIdx] = direction;

  const buttonIdx = world.idx(buttonX, buttonY);
  if (world.cells[buttonIdx] === Cell.FLOOR) {
    world.features[buttonIdx] = Feature.LIFT_BUTTON;
    world.liftDir[buttonIdx] = direction;
  }
}

function buildLayout(world: World): Floor69Rooms {
  const publicLift = addRoom(world, RoomType.CORRIDOR, 456, 503, 7, 16, 'Лифт 69: публичная площадка', Tex.METAL, Tex.F_CONCRETE);
  const publicCorridor = addRoom(world, RoomType.CORRIDOR, 464, 508, 88, 6, 'Красный коридор 69', Tex.CURTAIN, Tex.F_CARPET);
  const checkpoint = addRoom(world, RoomType.HQ, 476, 497, 13, 10, 'Пост досмотра 69', Tex.METAL, Tex.F_CONCRETE);
  const hall = addRoom(world, RoomType.COMMON, 496, 488, 27, 19, 'Зал ламп и сцены 69', Tex.CURTAIN, Tex.F_CARPET);
  const clinic = addRoom(world, RoomType.MEDICAL, 530, 496, 17, 11, 'Клиника Сима: тихий прием', Tex.TILE_W, Tex.F_TILE);
  const debtOffice = addRoom(world, RoomType.OFFICE, 530, 515, 17, 12, 'Долговая контора 69', Tex.PANEL, Tex.F_PARQUET);
  const refuge = addRoom(world, RoomType.LIVING, 498, 515, 12, 10, 'Тихая комната 69', Tex.PANEL, Tex.F_LINO);
  const ledger = addRoom(world, RoomType.OFFICE, 514, 515, 12, 10, 'Картотека долгов 69', Tex.MARBLE, Tex.F_PARQUET);
  const staffRoute = addRoom(world, RoomType.CORRIDOR, 553, 500, 5, 49, 'Служебный ход 69', Tex.DARK, Tex.F_CONCRETE);
  const staffLift = addRoom(world, RoomType.CORRIDOR, 548, 550, 13, 9, 'Черная лестница 69', Tex.METAL, Tex.F_CONCRETE);

  connect(world, publicLift, publicCorridor);
  connect(world, checkpoint, publicCorridor, '', DoorState.CLOSED);
  connect(world, hall, publicCorridor, '', DoorState.CLOSED);
  connect(world, clinic, publicCorridor, '', DoorState.CLOSED);
  connect(world, debtOffice, publicCorridor, 'key', DoorState.LOCKED);
  connect(world, refuge, publicCorridor, '', DoorState.HERMETIC_OPEN);
  connect(world, ledger, publicCorridor, 'key', DoorState.LOCKED);
  connect(world, publicCorridor, staffRoute, 'key', DoorState.LOCKED);
  connect(world, staffRoute, staffLift, '', DoorState.CLOSED);
  carveCorridor(world, 556, 524, 554, 524);

  addLift(world, 459, 511, 460, 511, LiftDirection.DOWN);
  addLift(world, 554, 554, 554, 553, LiftDirection.UP);
  return { publicLift, publicCorridor, checkpoint, hall, clinic, debtOffice, refuge, ledger, staffRoute, staffLift };
}

function decorateRooms(world: World, rooms: Floor69Rooms, seed: number): void {
  for (let x = rooms.publicCorridor.x + 4; x < rooms.publicCorridor.x + rooms.publicCorridor.w - 4; x += 8) {
    setFeature(world, x, rooms.publicCorridor.y + 2, Feature.LAMP);
    if (x % 16 === 0) addPosterWall(world, x, rooms.publicCorridor.y - 1, x + seed);
  }

  for (let x = rooms.hall.x + 3; x < rooms.hall.x + rooms.hall.w - 3; x += 4) {
    setFeature(world, x, rooms.hall.y + 2, Feature.CHAIR);
    setFeature(world, x, rooms.hall.y + rooms.hall.h - 3, Feature.TABLE);
  }
  setFeature(world, rooms.hall.x + Math.floor(rooms.hall.w / 2), rooms.hall.y + 4, Feature.LAMP);
  setFeature(world, rooms.hall.x + Math.floor(rooms.hall.w / 2), rooms.hall.y + 8, Feature.SCREEN);
  addScreenWall(world, rooms.hall.x + 12, rooms.hall.y - 1, 9);
  addScreenWall(world, rooms.hall.x + 18, rooms.hall.y - 1, 10);
  world.stamp(rooms.hall.x + 13, rooms.hall.y + 9, 0.5, 0.5, 3.5, 0.22, seed + 11, 210, 45, 130, true);
  world.stamp(rooms.hall.x + 18, rooms.hall.y + 9, 0.5, 0.5, 3.5, 0.18, seed + 12, 40, 160, 210, true);

  for (let x = rooms.checkpoint.x + 2; x < rooms.checkpoint.x + rooms.checkpoint.w - 2; x += 3) {
    setFeature(world, x, rooms.checkpoint.y + 2, Feature.DESK);
  }
  setFeature(world, rooms.checkpoint.x + rooms.checkpoint.w - 3, rooms.checkpoint.y + rooms.checkpoint.h - 3, Feature.LAMP);
  addPosterWall(world, rooms.checkpoint.x + 5, rooms.checkpoint.y - 1, 31);

  for (let x = rooms.clinic.x + 2; x < rooms.clinic.x + rooms.clinic.w - 2; x += 4) {
    setFeature(world, x, rooms.clinic.y + 2, Feature.APPARATUS);
    setFeature(world, x, rooms.clinic.y + rooms.clinic.h - 3, Feature.BED);
  }
  setFeature(world, rooms.clinic.x + rooms.clinic.w - 3, rooms.clinic.y + 2, Feature.LAMP);

  for (let y = rooms.debtOffice.y + 2; y < rooms.debtOffice.y + rooms.debtOffice.h - 2; y += 2) {
    setFeature(world, rooms.debtOffice.x + 2, y, Feature.SHELF);
    setFeature(world, rooms.debtOffice.x + rooms.debtOffice.w - 3, y, Feature.DESK);
  }
  addScreenWall(world, rooms.debtOffice.x + 7, rooms.debtOffice.y + rooms.debtOffice.h, 18);

  for (let dx = 2; dx < rooms.refuge.w - 2; dx += 4) {
    setFeature(world, rooms.refuge.x + dx, rooms.refuge.y + 2, Feature.BED);
    setFeature(world, rooms.refuge.x + dx, rooms.refuge.y + rooms.refuge.h - 3, Feature.CHAIR);
  }
  setFeature(world, rooms.refuge.x + rooms.refuge.w - 2, rooms.refuge.y + 2, Feature.LAMP);

  for (let y = rooms.ledger.y + 1; y < rooms.ledger.y + rooms.ledger.h - 1; y += 2) {
    setFeature(world, rooms.ledger.x + 2, y, Feature.SHELF);
    setFeature(world, rooms.ledger.x + rooms.ledger.w - 3, y, Feature.SHELF);
  }

  for (let y = rooms.staffRoute.y + 3; y < rooms.staffRoute.y + rooms.staffRoute.h - 3; y += 7) {
    setFeature(world, rooms.staffRoute.x + 2, y, Feature.LAMP);
  }
}

function addItemDrop(entities: Entity[], nextId: { v: number }, x: number, y: number, defId: string, count = 1): void {
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

function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id)) id++;
  return id;
}

function addContainer(
  world: World,
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  access: ContainerAccess,
  capacitySlots: number,
  inventory: WorldContainer['inventory'],
  tags: string[],
  faction?: Faction,
  lockDifficulty?: number,
): void {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  world.addContainer({
    id: nextContainerId(world),
    x,
    y,
    floor: FLOOR_69_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots,
    faction,
    access,
    lockDifficulty,
    discovered: true,
    tags: ['floor_69', ...tags],
  });
}

function seedContainers(world: World, rooms: Floor69Rooms): void {
  addContainer(
    world, rooms.clinic, 3, 2, ContainerKind.MEDICAL_CABINET, 'Шкаф тихой клиники 69',
    'owner', 8,
    [
      { defId: 'bandage', count: 3 },
      { defId: 'pills', count: 2 },
      { defId: 'antibiotic', count: 1 },
      { defId: 'gasmask_filter', count: 1 },
      { defId: 'clean_health_cert', count: 1 },
    ],
    ['clinic', 'medicine', 'harm_reduction'],
    Faction.SCIENTIST,
  );
  addContainer(
    world, rooms.debtOffice, 4, 3, ContainerKind.SAFE, 'Сейф компромата 69',
    'locked', 7,
    [
      { defId: 'denunciation', count: 1 },
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'personal_file_copy', count: 1 },
      { defId: 'sealed_complaint', count: 1 },
    ],
    ['blackmail', 'evidence', 'official'],
    Faction.CITIZEN,
    4,
  );
  addContainer(
    world, rooms.ledger, 3, 2, ContainerKind.FILING_CABINET, 'Картотека долгов 69',
    'locked', 8,
    [
      { defId: 'voluntary_receipt', count: 3 },
      { defId: 'blank_form', count: 2 },
      { defId: 'ink_bottle', count: 1 },
      { defId: 'fake_pass', count: 1 },
    ],
    ['debt', 'ledger', 'market_88'],
    Faction.CITIZEN,
    3,
  );
  addContainer(
    world, rooms.checkpoint, 9, 2, ContainerKind.WEAPON_CRATE, 'Ящик поста 69',
    'faction', 6,
    [
      { defId: 'emergency_roster', count: 1 },
      { defId: 'liquidator_token', count: 1 },
      { defId: 'ammo_9mm', count: 12 },
      { defId: 'key', count: 1 },
    ],
    ['raid', 'security', 'choice'],
    Faction.LIQUIDATOR,
  );
  addContainer(
    world, rooms.refuge, 2, 2, ContainerKind.EMERGENCY_BOX, 'Ящик тихой комнаты 69',
    'public', 6,
    [
      { defId: 'water', count: 2 },
      { defId: 'bread', count: 2 },
      { defId: 'bandage', count: 1 },
      { defId: 'emergency_roster', count: 1 },
    ],
    ['refuge', 'samosbor', 'aid'],
    Faction.CITIZEN,
  );
}

function spawnNpc(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  x: number,
  y: number,
  angle: number,
  weapon?: string,
): void {
  const def = NPC_DEFS[plotNpcId];
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: world.wrap(x) + 0.5,
    y: world.wrap(y) + 0.5,
    angle,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    name: def.name,
    isFemale: def.isFemale,
    needs: freshNeeds(),
    hp: def.hp,
    maxHp: def.maxHp,
    money: def.money,
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: def.inventory.map(item => ({ ...item })),
    weapon,
    faction: def.faction,
    occupation: def.occupation,
    plotNpcId,
    canGiveQuest: true,
    questId: -1,
  });
}

function spawnAmbientAdult(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  name: string,
  isFemale: boolean,
  occupation: Occupation,
  faction: Faction,
  x: number,
  y: number,
  inventory: Entity['inventory'],
  weapon?: string,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: world.wrap(x) + 0.5,
    y: world.wrap(y) + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: 0.8,
    sprite: occupation,
    name,
    isFemale,
    needs: freshNeeds(),
    hp: 85,
    maxHp: 85,
    money: 20,
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: inventory?.map(item => ({ ...item })) ?? [{ defId: 'note', count: 1 }],
    weapon,
    faction,
    occupation,
    canGiveQuest: false,
    questId: -1,
  });
}

function spawnFloor69Npcs(world: World, entities: Entity[], nextId: { v: number }, rooms: Floor69Rooms): void {
  spawnNpc(world, entities, nextId, 'f69_madam_roza', rooms.hall.x + 13, rooms.hall.y + 5, Math.PI / 2);
  spawnNpc(world, entities, nextId, 'f69_guard_venya', rooms.checkpoint.x + 7, rooms.checkpoint.y + 5, Math.PI, 'makarov');
  spawnNpc(world, entities, nextId, 'f69_performer_ira', rooms.refuge.x + 4, rooms.refuge.y + 5, 0);
  spawnNpc(world, entities, nextId, 'f69_doctor_sima', rooms.clinic.x + 8, rooms.clinic.y + 5, Math.PI / 2);
  spawnNpc(world, entities, nextId, 'f69_accountant_nil', rooms.debtOffice.x + 10, rooms.debtOffice.y + 6, Math.PI);
  spawnAmbientAdult(world, entities, nextId, 'Раиса Гардеробная', true, Occupation.SECRETARY, Faction.CITIZEN, rooms.staffRoute.x + 2, rooms.staffRoute.y + 12, [
    { defId: 'cloth_roll', count: 1 },
    { defId: 'sealed_complaint', count: 1 },
  ]);
  spawnAmbientAdult(world, entities, nextId, 'Павел Тихий', false, Occupation.TRAVELER, Faction.CITIZEN, rooms.publicCorridor.x + 35, rooms.publicCorridor.y + 3, [
    { defId: 'water', count: 1 },
    { defId: 'voluntary_receipt', count: 1 },
  ]);
}

function seedLooseItems(entities: Entity[], nextId: { v: number }, rooms: Floor69Rooms): void {
  addItemDrop(entities, nextId, rooms.publicCorridor.x + 9, rooms.publicCorridor.y + 2, 'cigs', 1);
  addItemDrop(entities, nextId, rooms.hall.x + 5, rooms.hall.y + 12, 'tea', 1);
  addItemDrop(entities, nextId, rooms.clinic.x + 12, rooms.clinic.y + 8, 'bandage', 1);
  addItemDrop(entities, nextId, rooms.staffLift.x + 3, rooms.staffLift.y + 5, 'metro_ticket', 1);
}

function applyZones(world: World): void {
  generateZones(world);
  for (const zone of world.zones) {
    zone.level = Math.max(2, Math.min(5, calcZoneLevel(zone.cx, zone.cy, FLOOR_69_BASE_FLOOR)));
    zone.faction = zone.id % 7 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.fogged = false;
  }
}

export function generateFloor69DesignFloor(seed = FLOOR_69_DEFAULT_SEED): Floor69Generation {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 1 };
    const state = createFloor69State();

    const rooms = buildLayout(world);
    decorateRooms(world, rooms, seed);
    applyZones(world);
    seedContainers(world, rooms);
    spawnFloor69Npcs(world, entities, nextId, rooms);
    seedLooseItems(entities, nextId, rooms);

    const spawnX = rooms.publicCorridor.x + 8.5;
    const spawnY = rooms.publicCorridor.y + 3.5;
    ensureConnectivity(world, spawnX, spawnY);
    sanitizeDoors(world);
    world.bakeLights();

    genLog(`[F69] design floor seed=${seed} rooms=${world.rooms.length} spawn=(${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})`);
    return {
      world,
      entities,
      spawnX,
      spawnY,
      routeId: DESIGN_FLOOR_ID,
      z: DESIGN_FLOOR_Z,
      seed,
      state,
      debugLines: floor69DebugLines(state, seed),
    };
  });
}

/* -- OBZh school evacuation cluster (AG16) ---------------------- */
/* One classroom, one shelter, five NPCs, and a repairable gap     */
/* that becomes meaningful when samosbor fog reaches the school.   */

import {
  Cell, DoorState, Tex, Feature, RoomType,
  type Room, type Entity, EntityType, AIGoal, Faction, Occupation, QuestType,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { Spr } from '../../render/sprite_index';
import { protectRoom } from '../shared';
import { genLog } from '../log';
import { registerZoneContent } from './zone_content';

const CLASSROOM_NAME = 'Кабинет ОБЖ';
const SHELTER_NAME = 'Спортзал-убежище ОБЖ';

const SCHOOL_W = 26;
const SCHOOL_H = 11;
const CLASS_W = 13;
const CLASS_H = 9;
const SHELTER_W = 12;
const SHELTER_H = 9;

interface NpcSpawn {
  id: string;
  room: 'classroom' | 'shelter';
  dx: number;
  dy: number;
  angle: number;
  canGiveQuest?: boolean;
  weapon?: string;
  scale?: number;
}

const NPC_DEFS: Record<string, PlotNpcDef> = {
  ag16_nina_obzh: {
    name: 'Нина ОБЖ',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.DOCTOR,
    sprite: Occupation.DOCTOR,
    hp: 120, maxHp: 120, money: 42, speed: 0.85,
    inventory: [
      { defId: 'bandage', count: 2 },
      { defId: 'water', count: 2 },
      { defId: 'note', count: 1 },
    ],
    talkLines: [
      'Это не тьюториал. Это урок, который проверяет сирена.',
      'Сначала аптечка. Потом убежище. Потом список. Потом дверь.',
      'У сорванной гермодвери не геройствуют. Ее чинят или бросают людей на сквозняк.',
    ],
    talkLinesPost: [
      'Если взял дверь-комплект, реши сам: закрыть класс или унести его дальше.',
      'Во время самосбора дети слушают правила. Взрослые чаще спорят.',
    ],
  },

  ag16_pupil_mira: {
    name: 'Мира из второго ряда',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.CHILD,
    sprite: Occupation.CHILD,
    hp: 55, maxHp: 55, money: 2, speed: 0.95,
    inventory: [{ defId: 'bread', count: 1 }],
    talkLines: [
      'Я знаю правило: не бежать. Но ноги знают другое правило.',
      'Если дверь поставят, я сяду под парту и буду считать вдохи.',
    ],
    talkLinesPost: ['Я запомнила, где убежище. Только бы коридор тоже запомнил.'],
  },

  ag16_parent_lida: {
    name: 'Лида из родкома',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.HOUSEWIFE,
    sprite: Occupation.HOUSEWIFE,
    hp: 85, maxHp: 85, money: 18, speed: 0.9,
    inventory: [
      { defId: 'water', count: 1 },
      { defId: 'kasha', count: 1 },
    ],
    talkLines: [
      'Я заберу своего ребенка до приказа. Приказ потом извиняться не будет.',
      'Паек один. Учитель говорит делить по списку. Я говорю - сначала маленьким.',
    ],
    talkLinesPost: ['Если дверь закрыта, я подожду. Если открыта - я не обещаю.'],
  },

  ag16_guard_roman: {
    name: 'Роман Дежурный',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 190, maxHp: 190, money: 35, speed: 1.0,
    inventory: [
      { defId: 'pipe', count: 1 },
      { defId: 'ammo_9mm', count: 6 },
    ],
    talkLines: [
      'Я держу коридор, пока он держится коридором.',
      'Гермодверь сорвана. Поставишь комплект - туман упрется в железо.',
    ],
    talkLinesPost: ['Если сирена началась, не спорь у порога. Закрывай.'],
  },

  ag16_vadim_monitor: {
    name: 'Вадим Монитор',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.CHILD,
    sprite: Occupation.CHILD,
    hp: 60, maxHp: 60, money: 4, speed: 0.85,
    inventory: [{ defId: 'note', count: 1 }],
    talkLines: [
      'Пункт первый: не паниковать. Пункт второй: если паника уже есть, записать ее в журнал.',
      'Без списка никто не входит в убежище. Даже если стены возражают.',
    ],
    talkLinesPost: ['Я отметил тебя в журнале как условно полезного взрослого.'],
    talkQuestResponse: 'Список у меня. Скажи Нине ОБЖ: трое идут в убежище, один остается у двери, родком спорит.',
  },
};

registerSideQuest('ag16_nina_obzh', NPC_DEFS.ag16_nina_obzh, [
  {
    id: 'ag16_obzh_fetch_kit',
    giverNpcId: 'ag16_nina_obzh',
    type: QuestType.FETCH,
    desc: 'Нина ОБЖ: «Нужны два бинта в учебную аптечку. Без аптечки эвакуация превращается в беготню.»',
    targetItem: 'bandage', targetCount: 2,
    rewardItem: 'water', rewardCount: 2,
    extraRewards: [{ defId: 'bread', count: 1 }],
    relationDelta: 10, xpReward: 25, moneyReward: 10,
  },
  {
    id: 'ag16_obzh_visit_shelter',
    giverNpcId: 'ag16_nina_obzh',
    type: QuestType.VISIT,
    desc: `Нина ОБЖ: «Проверь ${SHELTER_NAME}. Маршрут должен быть в ногах до сирены.»`,
    targetRoomName: SHELTER_NAME,
    rewardItem: 'flashlight', rewardCount: 1,
    extraRewards: [{ defId: 'note', count: 1 }],
    relationDelta: 10, xpReward: 30, moneyReward: 10,
  },
  {
    id: 'ag16_obzh_talk_monitor',
    giverNpcId: 'ag16_nina_obzh',
    type: QuestType.TALK,
    desc: 'Нина ОБЖ: «Сверься с Вадимом Монитором. Он знает список лучше взрослых.»',
    targetNpcId: 'ag16_vadim_monitor',
    rewardItem: 'kompot', rewardCount: 1,
    relationDelta: 8, xpReward: 20, moneyReward: 5,
  },
  {
    id: 'ag16_obzh_repair_gap',
    giverNpcId: 'ag16_nina_obzh',
    type: QuestType.FETCH,
    desc: 'Нина ОБЖ: «Принеси гаечный ключ к сорванной гермодвери. Комплект выдам тебе: поставишь дверь здесь или унесешь - это уже решение.»',
    targetItem: 'wrench', targetCount: 1,
    rewardItem: 'door_kit', rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 1 }],
    relationDelta: 14, xpReward: 45, moneyReward: 25,
  },
]);

registerSideQuest('ag16_pupil_mira', NPC_DEFS.ag16_pupil_mira, []);
registerSideQuest('ag16_parent_lida', NPC_DEFS.ag16_parent_lida, []);
registerSideQuest('ag16_guard_roman', NPC_DEFS.ag16_guard_roman, []);
registerSideQuest('ag16_vadim_monitor', NPC_DEFS.ag16_vadim_monitor, []);

const NPC_SPAWNS: NpcSpawn[] = [
  { id: 'ag16_nina_obzh', room: 'classroom', dx: 6, dy: 1, angle: Math.PI / 2, canGiveQuest: true },
  { id: 'ag16_pupil_mira', room: 'classroom', dx: 3, dy: 6, angle: -Math.PI / 2, scale: 0.65 },
  { id: 'ag16_parent_lida', room: 'classroom', dx: 10, dy: 6, angle: Math.PI },
  { id: 'ag16_guard_roman', room: 'classroom', dx: 2, dy: 8, angle: -Math.PI / 2, weapon: 'pipe' },
  { id: 'ag16_vadim_monitor', room: 'shelter', dx: 2, dy: 3, angle: 0, scale: 0.72 },
];

function areaClear(world: World, rx: number, ry: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (world.aptMask[world.idx(rx + dx, ry + dy)]) return false;
    }
  }
  return true;
}

function findOrigin(world: World, zcx: number, zcy: number): { x: number; y: number } {
  const baseX = zcx - Math.floor(SCHOOL_W / 2);
  const baseY = zcy - Math.floor(SCHOOL_H / 2);
  for (let r = 0; r <= 72; r += 4) {
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2 + 0.31;
      const x = world.wrap(baseX + Math.round(Math.cos(a) * r));
      const y = world.wrap(baseY + Math.round(Math.sin(a) * r));
      if (areaClear(world, x, y, SCHOOL_W, SCHOOL_H)) return { x, y };
    }
  }
  return { x: world.wrap(baseX), y: world.wrap(baseY) };
}

function carveRoom(
  world: World,
  roomId: number,
  type: RoomType,
  name: string,
  rx: number,
  ry: number,
  w: number,
  h: number,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (world.aptMask[ci]) continue;
      world.cells[ci] = Cell.WALL;
      world.wallTex[ci] = wallTex;
      world.floorTex[ci] = floorTex;
      world.roomMap[ci] = -1;
      world.features[ci] = Feature.NONE;
    }
  }

  const room: Room = {
    id: roomId,
    type,
    x: rx,
    y: ry,
    w,
    h,
    name,
    wallTex,
    floorTex,
    doors: [],
    sealed: false,
    apartmentId: -1,
  };
  world.rooms[roomId] = room;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      if (world.aptMask[ci]) continue;
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = floorTex;
      world.roomMap[ci] = roomId;
    }
  }
  protectRoom(world, rx, ry, w, h, wallTex, floorTex);
  return room;
}

function dropItem(entities: Entity[], nextId: { v: number }, x: number, y: number, defId: string, count = 1): void {
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

function dropDesk(entities: Entity[], nextId: { v: number }, x: number, y: number, scale = 0.55): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.DESK,
    spriteScale: scale,
    inventory: [],
  });
}

function spawnNpc(
  entities: Entity[],
  nextId: { v: number },
  spawn: NpcSpawn,
  classRoom: Room,
  shelter: Room,
): void {
  if (entities.some(e => e.alive && e.plotNpcId === spawn.id)) return;
  const def = NPC_DEFS[spawn.id];
  const room = spawn.room === 'classroom' ? classRoom : shelter;
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: room.x + spawn.dx + 0.5,
    y: room.y + spawn.dy + 0.5,
    angle: spawn.angle,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    spriteScale: spawn.scale,
    name: def.name,
    isFemale: def.isFemale,
    needs: freshNeeds(),
    hp: def.hp,
    maxHp: def.maxHp,
    money: def.money,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: def.inventory.map(i => ({ ...i })),
    weapon: spawn.weapon,
    faction: def.faction,
    occupation: def.occupation,
    plotNpcId: spawn.id,
    canGiveQuest: spawn.canGiveQuest === true,
    questId: -1,
  });
}

function placeShelterDoor(world: World, classroom: Room, shelter: Room): void {
  const doorX = world.wrap(classroom.x + classroom.w);
  const doorY = world.wrap(classroom.y + Math.floor(classroom.h / 2));
  const doorI = world.idx(doorX, doorY);
  world.cells[doorI] = Cell.DOOR;
  world.wallTex[doorI] = Tex.HERMO_WALL;
  world.floorTex[doorI] = Tex.F_CONCRETE;
  world.features[doorI] = Feature.NONE;
  world.doors.set(doorI, {
    idx: doorI,
    state: DoorState.HERMETIC_OPEN,
    roomA: classroom.id,
    roomB: shelter.id,
    keyId: '',
    timer: 0,
  });
  classroom.doors.push(doorI);
  shelter.doors.push(doorI);
}

function carveBrokenEntrance(world: World, classroom: Room): void {
  const gapX = world.wrap(classroom.x + 2);
  const gapY = world.wrap(classroom.y + classroom.h);
  const gapI = world.idx(gapX, gapY);
  world.cells[gapI] = Cell.FLOOR;
  world.floorTex[gapI] = Tex.F_LINO;
  world.roomMap[gapI] = -1;
  world.features[gapI] = Feature.NONE;
  world.aptMask[gapI] = 0;
  world.hermoWall[gapI] = 0;

  let cy = world.wrap(gapY + 1);
  for (let s = 0; s < 70; s++) {
    const ci = world.idx(gapX, cy);
    if (s > 0 && world.cells[ci] === Cell.FLOOR && !world.aptMask[ci]) break;
    if (!world.aptMask[ci]) {
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = Tex.F_LINO;
      world.roomMap[ci] = -1;
      world.features[ci] = Feature.NONE;
    }
    cy = world.wrap(cy + 1);
  }
}

function decorateClassroom(world: World, entities: Entity[], nextId: { v: number }, room: Room): void {
  const rx = room.x;
  const ry = room.y;
  world.features[world.idx(rx + 6, ry + 1)] = Feature.LAMP;
  world.features[world.idx(rx + 1, ry + 1)] = Feature.TABLE;
  world.features[world.idx(rx + 11, ry + 1)] = Feature.SHELF;
  world.wallTex[world.idx(rx + 4, ry - 1)] = Tex.POSTER_BASE + 27;
  world.wallTex[world.idx(rx + 7, ry - 1)] = Tex.POSTER_BASE + 28;
  world.wallTex[world.idx(rx + 10, ry - 1)] = Tex.SLIDE_3;
  world.features[world.idx(rx + 10, ry - 1)] = Feature.SLIDE;
  world.slideCells.push(world.idx(rx + 10, ry - 1));

  for (let row = 0; row < 3; row++) {
    const y = ry + 3 + row * 2;
    for (let col = 0; col < 4; col++) {
      dropDesk(entities, nextId, rx + 2 + col * 3, y);
    }
  }
  dropItem(entities, nextId, rx + 11, ry + 2, 'bandage', 1);
  dropItem(entities, nextId, rx + 10, ry + 6, 'water', 1);
  dropItem(entities, nextId, rx + 1, ry + 7, 'wrench', 1);
  world.stamp(rx + 2, ry + CLASS_H - 1, 0.5, 0.5, 5, 0.5, 16016, 95, 44, 52, false);
}

function decorateShelter(world: World, entities: Entity[], nextId: { v: number }, room: Room): void {
  const rx = room.x;
  const ry = room.y;
  world.features[world.idx(rx + 2, ry + 1)] = Feature.LAMP;
  world.features[world.idx(rx + 9, ry + 1)] = Feature.LAMP;
  world.features[world.idx(rx + 2, ry + 6)] = Feature.SHELF;
  world.features[world.idx(rx + 9, ry + 6)] = Feature.SHELF;
  world.wallTex[world.idx(rx + 5, ry - 1)] = Tex.POSTER_BASE + 29;
  world.wallTex[world.idx(rx + 8, ry - 1)] = Tex.HERMO_WALL;
  for (let x = 2; x < SHELTER_W - 2; x += 2) {
    dropDesk(entities, nextId, rx + x, ry + 4, 0.48);
  }
  dropItem(entities, nextId, rx + 2, ry + 6, 'bread', 1);
  dropItem(entities, nextId, rx + 9, ry + 6, 'kasha', 1);
  dropItem(entities, nextId, rx + 10, ry + 2, 'note', 1);
}

function generateObzhSchool(
  world: World,
  nextRoomId: number,
  entities: Entity[],
  nextId: { v: number },
  zcx: number,
  zcy: number,
): { nextRoomId: number } {
  const pos = findOrigin(world, zcx, zcy);
  const classroom = carveRoom(
    world,
    nextRoomId++,
    RoomType.COMMON,
    CLASSROOM_NAME,
    pos.x,
    pos.y,
    CLASS_W,
    CLASS_H,
    Tex.PANEL,
    Tex.F_LINO,
  );
  const shelter = carveRoom(
    world,
    nextRoomId++,
    RoomType.COMMON,
    SHELTER_NAME,
    world.wrap(pos.x + CLASS_W + 1),
    pos.y,
    SHELTER_W,
    SHELTER_H,
    Tex.HERMO_WALL,
    Tex.F_CONCRETE,
  );

  placeShelterDoor(world, classroom, shelter);
  carveBrokenEntrance(world, classroom);
  decorateClassroom(world, entities, nextId, classroom);
  decorateShelter(world, entities, nextId, shelter);
  for (const spawn of NPC_SPAWNS) spawnNpc(entities, nextId, spawn, classroom, shelter);

  genLog(`[AG16] ${CLASSROOM_NAME} at (${pos.x}, ${pos.y}) rooms #${classroom.id}/${shelter.id}`);
  return { nextRoomId };
}

registerZoneContent(42, 'Школа ОБЖ и убежище', generateObzhSchool);

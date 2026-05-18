/* ── Future design floor: Верхнее бюро ───────────────────────── */

import {
  W, Cell, ContainerKind, DoorState, Faction, Feature, FloorLevel, LiftDirection,
  MonsterKind, Occupation, QuestType, RoomType, Tex, ZoneFaction,
  type Entity, type GameState, type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { calcZoneLevel } from '../../systems/rpg';
import { publishEvent } from '../../systems/events';
import { ensureConnectivity, generateZones, stampRoom } from '../shared';
import { placeProceduralScreens } from '../procedural_screens';
import { genLog } from '../log';
import {
  type NextId, addItemDrop, setFeature, spawnAdminMonster, spawnAdminNpc, spawnNamedCivilian,
} from '../ministry/admin_common';

export const UPPER_BUREAU_ROUTE_ID = 'upper_bureau' as const;
export const UPPER_BUREAU_DISPLAY_NAME = 'Верхнее бюро' as const;
export const UPPER_BUREAU_ANCHOR_Z = -28;
export const UPPER_BUREAU_BASE_FLOOR = FloorLevel.MINISTRY;
export const UPPER_BUREAU_AUDIT_HEAT_MAX = 3;

export const UPPER_BUREAU_FLAG_IDS = {
  appointmentToken: 'upper_bureau.appointment_token',
  staffRouteKnown: 'upper_bureau.staff_route_known',
  auditHeat: 'upper_bureau.audit_heat',
  nameErased: 'upper_bureau.name_erased',
} as const;

export interface UpperBureauFlags {
  appointmentToken: boolean;
  staffRouteKnown: boolean;
  auditHeat: number;
  nameErased: boolean;
}

export const UPPER_BUREAU_DOCUMENTS = {
  appointmentToken: 'official_permit_slip',
  forgedAppointment: 'forged_permit_slip',
  cleanerKey: 'key',
  staffRoute: 'elevator_access_order',
  auditPacket: 'denunciation',
  erasedName: 'missing_record_file',
  exposedRecord: 'record_exposure_notice',
} as const;

export const UPPER_BUREAU_GATE_OUTCOMES = [
  {
    id: 'legal_preapproval',
    route: 'legal',
    documentItem: UPPER_BUREAU_DOCUMENTS.appointmentToken,
    flag: UPPER_BUREAU_FLAG_IDS.appointmentToken,
    consequence: 'Дверь открывается тихо; аудит не растёт.',
  },
  {
    id: 'acceleration_fee',
    route: 'social_economic',
    documentItem: UPPER_BUREAU_DOCUMENTS.cleanerKey,
    flag: UPPER_BUREAU_FLAG_IDS.appointmentToken,
    consequence: 'Игрок проходит за деньги; аудит получает слабый след.',
  },
  {
    id: 'cleaner_staff_route',
    route: 'stealth',
    documentItem: UPPER_BUREAU_DOCUMENTS.staffRoute,
    flag: UPPER_BUREAU_FLAG_IDS.staffRouteKnown,
    consequence: 'Служебный обход минует главный пост, если ключ получен у Толика.',
  },
  {
    id: 'stolen_or_combat_key',
    route: 'illegal_combat',
    documentItem: UPPER_BUREAU_DOCUMENTS.erasedName,
    flag: UPPER_BUREAU_FLAG_IDS.auditHeat,
    consequence: 'Кража или убийство дают доступ, но поднимают аудит и слухи.',
  },
] as const;

export const UPPER_BUREAU_DEBUG_ENTRY = {
  routeId: UPPER_BUREAU_ROUTE_ID,
  displayName: UPPER_BUREAU_DISPLAY_NAME,
  anchorZ: UPPER_BUREAU_ANCHOR_Z,
  baseFloor: UPPER_BUREAU_BASE_FLOOR,
  generator: 'generateUpperBureauDesignFloor',
  smokePath: 'spawn -> salon appointment gate OR cleaner closet -> staff route -> zero file room -> service lift',
} as const;

const ISKRA_DEF: PlotNpcDef = {
  name: 'Мадам Искра',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 160, maxHp: 160, money: 220, speed: 0.75,
  inventory: [
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'tea', count: 1 },
  ],
  talkLines: [
    'Верхнее бюро принимает тех, кого уже решили принять.',
    'Назначение не получают. Назначение вспоминают при свидетелях.',
    'Корешок пропуска, чистая печать и спокойные руки открывают больше дверей, чем пистолет.',
    'Ускорительный сбор существует только в тех разговорах, которые никто не записывает.',
  ],
  talkLinesPost: [
    'Ваше назначение внесено карандашом. Карандаш здесь тверже приказа.',
    'Проходите по ковру и не смотрите на картотеку дольше секунды.',
  ],
};

const LEV_DEF: PlotNpcDef = {
  name: 'Аудитор Лев',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 240, maxHp: 240, money: 160, speed: 0.85,
  inventory: [
    { defId: 'denunciation', count: 2 },
    { defId: 'permanent_pass', count: 1 },
    { defId: 'makarov', count: 1 },
  ],
  talkLines: [
    'Я аудирую не деньги. Деньги всегда виноваты. Я ищу, кто им помог.',
    'Черный рынок 88 слишком хорошо знает, когда проверка поворачивает за угол.',
    'Предупредите рынок - получите должников. Поможете мне - получите врагов с печатью.',
    'Жар аудита растет до трех делений. Потом коридор сам начинает спрашивать фамилию.',
  ],
  talkLinesPost: [
    'Папка пошла наверх. Теперь шум будет спускаться этажами.',
    'Если рынок узнал раньше меня, значит у уборщика снова чистые карманы.',
  ],
};

const TOLIK_DEF: PlotNpcDef = {
  name: 'Толик Чистый',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.LOCKSMITH,
  sprite: Occupation.LOCKSMITH,
  hp: 120, maxHp: 120, money: 45, speed: 0.9,
  inventory: [
    { defId: 'key', count: 1 },
    { defId: 'cleaning_kit', count: 1 },
    { defId: 'cigs', count: 1 },
  ],
  talkLines: [
    'Я мою только пол. Двери сами пачкаются ключами.',
    'Служебный ход тихий, пока не хлопнуть тележкой.',
    'Комплект для уборки вернете - покажу, где ковёр не скрипит.',
    'Ключ не спрашивает, законно ли вы идете. Зато журнал спрашивает потом.',
  ],
  talkLinesPost: [
    'Идите служебным. Там охрана ленится смотреть вниз.',
    'Если спросит мадам, я вас не видел. Я вообще вижу только пыль.',
  ],
};

const ANNA_DEF: PlotNpcDef = {
  name: 'Анна Безымянная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 90, maxHp: 90, money: 25, speed: 0.8,
  inventory: [
    { defId: 'passport_stub', count: 1 },
    { defId: 'sealed_complaint', count: 1 },
    { defId: 'bread', count: 1 },
  ],
  talkLines: [
    'Внизу меня похоронили по ошибке. Наверху сказали, что ошибка уже утверждена.',
    'Мне нужно стереть запись о смерти, пока тело не решило согласиться.',
    'Пропавшее личное дело лежит там, где шкафы дышат чужими именами.',
    'Если вынести акт наружу, меня заметят. Если стереть имя, заметят кого-нибудь другого.',
  ],
  talkLinesPost: [
    'Теперь я опять числюсь живой. Это не радость, но паёк выдают живым.',
    'Архив потерял меня второй раз. Второй раз я уже была готова.',
  ],
};

registerSideQuest('bureau_madam_iskra', ISKRA_DEF, [
  {
    id: 'bureau_preapproval_legal',
    giverNpcId: 'bureau_madam_iskra',
    type: QuestType.FETCH,
    desc: 'Мадам Искра: «Официальный корешок пропуска - и главный пост признает ваше назначение без шума.»',
    targetItem: 'official_permit_slip', targetCount: 1,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'temp_pass', count: 1 }],
    relationDelta: 14, xpReward: 85, moneyReward: 55,
  },
  {
    id: 'bureau_preapproval_fee',
    giverNpcId: 'bureau_madam_iskra',
    type: QuestType.FETCH,
    desc: 'Мадам Искра: «Сто восемьдесят рублей ускорительного сбора. Назначение вспомнит вас задним числом.»',
    targetItem: 'money', targetCount: 180,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'official_permit_slip', count: 1 }],
    relationDelta: -4, xpReward: 55, moneyReward: 0,
  },
]);

registerSideQuest('bureau_cleaner_tolik', TOLIK_DEF, [
  {
    id: 'bureau_cleaner_keys_help',
    giverNpcId: 'bureau_cleaner_tolik',
    type: QuestType.FETCH,
    desc: 'Толик Чистый: «Верните чистящий комплект. Покажу служебный ход, где охрана смотрит на ковёр, а не на вас.»',
    targetItem: 'cleaning_kit', targetCount: 1,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'elevator_access_order', count: 1 }],
    relationDelta: 12, xpReward: 70, moneyReward: 35,
  },
  {
    id: 'bureau_market88_warning',
    giverNpcId: 'bureau_cleaner_tolik',
    type: QuestType.TALK,
    desc: 'Толик Чистый: «Если дойдете до Счетной 88, скажите Марте: Лев уже считает их расписки.»',
    targetNpcId: 'ag15_marta_broker',
    rewardItem: 'forged_permit_slip', rewardCount: 1,
    relationDelta: -6, xpReward: 90, moneyReward: 88,
  },
]);

registerSideQuest('bureau_auditor_lev', LEV_DEF, [
  {
    id: 'bureau_audit_market88_help',
    giverNpcId: 'bureau_auditor_lev',
    type: QuestType.FETCH,
    desc: 'Аудитор Лев: «Два доноса и папка по рынку 88 станут делом. Дело станет жаром аудита.»',
    targetItem: 'denunciation', targetCount: 2,
    rewardItem: 'permanent_pass', rewardCount: 1,
    extraRewards: [{ defId: 'record_exposure_notice', count: 1 }],
    relationDelta: 14, xpReward: 100, moneyReward: 120,
  },
]);

registerSideQuest('bureau_visitor_anna', ANNA_DEF, [
  {
    id: 'bureau_erase_name_file',
    giverNpcId: 'bureau_visitor_anna',
    type: QuestType.FETCH,
    desc: 'Анна Безымянная: «Принесите пропавшее личное дело. Я сотру смерть с той страницы, где она выглядит законной.»',
    targetItem: 'missing_record_file', targetCount: 1,
    rewardItem: 'passport_stub', rewardCount: 1,
    extraRewards: [{ defId: 'personal_file_copy', count: 1 }],
    relationDelta: 16, xpReward: 110, moneyReward: 40,
  },
  {
    id: 'bureau_expose_erased_record',
    giverNpcId: 'bureau_visitor_anna',
    type: QuestType.FETCH,
    desc: 'Анна Безымянная: «Можно не стирать. Вынесите акт о пропавшей записи - пусть Райсовет отвечает вслух.»',
    targetItem: 'record_exposure_notice', targetCount: 1,
    rewardItem: 'archive_access_permit', rewardCount: 1,
    relationDelta: 8, xpReward: 85, moneyReward: 70,
  },
]);

export function createUpperBureauFlags(): UpperBureauFlags {
  return {
    appointmentToken: false,
    staffRouteKnown: false,
    auditHeat: 0,
    nameErased: false,
  };
}

export interface UpperBureauFlagChange {
  appointmentToken?: boolean;
  staffRouteKnown?: boolean;
  auditHeatDelta?: number;
  auditHeat?: number;
  nameErased?: boolean;
  actor?: Entity;
  x?: number;
  y?: number;
  zoneId?: number;
  roomId?: number;
  reason: string;
  documentItemId?: string;
}

export function clampUpperBureauAuditHeat(value: number): number {
  return Math.max(0, Math.min(UPPER_BUREAU_AUDIT_HEAT_MAX, Math.floor(value)));
}

export function applyUpperBureauFlagChange(
  state: GameState,
  current: UpperBureauFlags,
  change: UpperBureauFlagChange,
): UpperBureauFlags {
  const next: UpperBureauFlags = { ...current };
  let auditChanged = false;
  let recordChanged = false;
  let routeChanged = false;

  if (change.appointmentToken !== undefined && next.appointmentToken !== change.appointmentToken) {
    next.appointmentToken = change.appointmentToken;
    routeChanged = true;
  }
  if (change.staffRouteKnown !== undefined && next.staffRouteKnown !== change.staffRouteKnown) {
    next.staffRouteKnown = change.staffRouteKnown;
    routeChanged = true;
  }
  if (change.auditHeat !== undefined || change.auditHeatDelta !== undefined) {
    const rawHeat = change.auditHeat ?? next.auditHeat + (change.auditHeatDelta ?? 0);
    const heat = clampUpperBureauAuditHeat(rawHeat);
    auditChanged = heat !== next.auditHeat;
    next.auditHeat = heat;
  }
  if (change.nameErased !== undefined && next.nameErased !== change.nameErased) {
    next.nameErased = change.nameErased;
    recordChanged = true;
  }

  if (auditChanged || recordChanged || routeChanged) {
    const severity = next.auditHeat >= 3 ? 5 : recordChanged ? 4 : 3;
    publishEvent(state, {
      type: 'faction_relation_changed',
      floor: UPPER_BUREAU_BASE_FLOOR,
      zoneId: change.zoneId,
      roomId: change.roomId,
      x: change.x,
      y: change.y,
      actorId: change.actor?.id,
      actorName: change.actor?.name,
      actorFaction: change.actor?.faction,
      targetName: recordChanged ? UPPER_BUREAU_FLAG_IDS.nameErased : UPPER_BUREAU_FLAG_IDS.auditHeat,
      itemId: change.documentItemId,
      severity,
      privacy: next.auditHeat >= 2 ? 'local' : 'private',
      tags: [
        'upper_bureau',
        auditChanged ? 'audit_heat' : 'route_flag',
        recordChanged ? 'record_edit' : 'access',
      ],
      data: {
        routeId: UPPER_BUREAU_ROUTE_ID,
        reason: change.reason,
        appointmentToken: next.appointmentToken,
        staffRouteKnown: next.staffRouteKnown,
        auditHeat: next.auditHeat,
        auditHeatMax: UPPER_BUREAU_AUDIT_HEAT_MAX,
        nameErased: next.nameErased,
        documentItemId: change.documentItemId,
      },
    });
  }

  return next;
}

export function upperBureauDebugLine(flags: UpperBureauFlags = createUpperBureauFlags()): string {
  return `${UPPER_BUREAU_ROUTE_ID} z=${UPPER_BUREAU_ANCHOR_Z} `
    + `token=${flags.appointmentToken ? 1 : 0} staff=${flags.staffRouteKnown ? 1 : 0} `
    + `audit=${clampUpperBureauAuditHeat(flags.auditHeat)}/${UPPER_BUREAU_AUDIT_HEAT_MAX} `
    + `erased=${flags.nameErased ? 1 : 0}`;
}

function fillDefaultTextures(world: World): void {
  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.MARBLE;
    world.floorTex[i] = Tex.F_MARBLE_TILE;
  }
}

function stampBureauRoom(
  world: World,
  id: number,
  type: RoomType,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, id, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = Tex.MARBLE;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = Tex.MARBLE;
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) world.floorTex[ci] = floorTex;
    }
  }
  return room;
}

function carveFloorRect(world: World, x: number, y: number, w: number, h: number, floorTex: Tex): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = floorTex;
    }
  }
}

function addDoor(
  world: World,
  room: Room | null,
  x: number,
  y: number,
  state = DoorState.CLOSED,
  keyId = '',
  wallTex = Tex.DOOR_WOOD,
): void {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = wallTex;
  world.roomMap[idx] = room?.id ?? -1;
  world.doors.set(idx, {
    idx,
    state,
    roomA: room?.id ?? -1,
    roomB: room?.id ?? -1,
    keyId,
    timer: 0,
  });
  if (room && !room.doors.includes(idx)) room.doors.push(idx);
}

function addGatePartition(
  world: World,
  x: number,
  y0: number,
  y1: number,
  doorY: number,
  keyId: string,
): void {
  for (let y = y0; y <= y1; y++) {
    const ci = world.idx(x, y);
    world.cells[ci] = Cell.WALL;
    world.roomMap[ci] = -1;
    world.wallTex[ci] = Tex.MARBLE;
    world.features[ci] = Feature.NONE;
  }
  addDoor(world, null, x, doorY, DoorState.LOCKED, keyId, Tex.DOOR_METAL);
}

function placeLiftCell(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const liftIdx = world.idx(x, y);
  world.cells[liftIdx] = Cell.LIFT;
  world.wallTex[liftIdx] = Tex.LIFT_DOOR;
  world.liftDir[liftIdx] = direction;
  const buttonIdx = world.idx(buttonX, buttonY);
  if (world.cells[buttonIdx] === Cell.FLOOR) {
    world.features[buttonIdx] = Feature.LIFT_BUTTON;
    world.liftDir[buttonIdx] = direction;
  }
}

function nextContainerId(world: World): number {
  let id = world.containers.length + 1;
  while (world.containerById.has(id) || world.containers.some(c => c.id === id)) id++;
  return id;
}

function addBureauContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  tags: string[],
  owner?: { id: number; name: string; faction: Faction },
): void {
  world.addContainer({
    id: nextContainerId(world),
    x,
    y,
    floor: UPPER_BUREAU_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory,
    capacitySlots: Math.max(8, inventory.length + 2),
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: owner?.faction ?? Faction.CITIZEN,
    access,
    lockDifficulty: access === 'locked' ? 4 : undefined,
    discovered: access !== 'secret',
    tags: ['upper_bureau', ...tags],
  });
}

function decorateSalon(world: World, room: Room): void {
  const deskY = room.y + 4;
  for (let dx = 3; dx < room.w - 3; dx++) setFeature(world, room.x + dx, deskY, Feature.DESK);
  for (let dx = 4; dx < room.w - 4; dx += 3) setFeature(world, room.x + dx, deskY + 2, Feature.CHAIR);
  for (let dx = 5; dx < room.w - 5; dx += 5) setFeature(world, room.x + dx, room.y + room.h - 3, Feature.CHAIR);
  setFeature(world, room.x + 4, room.y + 3, Feature.LAMP);
  setFeature(world, room.x + room.w - 5, room.y + 3, Feature.LAMP);
  setFeature(world, room.x + Math.floor(room.w / 2), room.y + room.h - 4, Feature.SCREEN);
  world.wallTex[world.idx(room.x + Math.floor(room.w / 2), room.y - 1)] = Tex.PORTRAIT_BASE + 7;
  world.wallTex[world.idx(room.x + room.w, room.y + 5)] = Tex.POSTER_BASE + 21;
}

function decorateOffice(world: World, room: Room): void {
  const deskY = room.y + 3;
  for (let dx = 3; dx < room.w - 3; dx++) setFeature(world, room.x + dx, deskY, Feature.DESK);
  for (let dx = 4; dx < room.w - 4; dx += 4) setFeature(world, room.x + dx, deskY + 2, Feature.CHAIR);
  for (let dy = 2; dy < room.h - 2; dy += 2) {
    setFeature(world, room.x + 1, room.y + dy, Feature.SHELF);
    setFeature(world, room.x + room.w - 2, room.y + dy, Feature.SHELF);
  }
  setFeature(world, room.x + Math.floor(room.w / 2), room.y + 1, Feature.LAMP);
  world.wallTex[world.idx(room.x + Math.floor(room.w / 2), room.y - 1)] = Tex.PORTRAIT_BASE + 31;
}

function decorateFileRoom(world: World, room: Room): void {
  for (let dy = 1; dy < room.h - 1; dy++) {
    if (dy % 2 === 0) {
      for (let dx = 2; dx < room.w - 2; dx += 3) setFeature(world, room.x + dx, room.y + dy, Feature.SHELF);
    }
  }
  setFeature(world, room.x + 2, room.y + 2, Feature.LAMP);
  setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.LAMP);
  world.wallTex[world.idx(room.x + room.w, room.y + Math.floor(room.h / 2))] = Tex.POSTER_BASE + 44;
}

function decorateCleanerRoom(world: World, room: Room): void {
  for (let dy = 2; dy < room.h - 2; dy += 2) setFeature(world, room.x + 1, room.y + dy, Feature.SHELF);
  setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
  setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.LAMP);
}

function setAdministrativeZones(world: World): void {
  generateZones(world);
  for (const zone of world.zones) {
    zone.level = Math.max(2, calcZoneLevel(zone.cx, zone.cy, UPPER_BUREAU_BASE_FLOOR));
    zone.faction = zone.id % 5 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.fogged = false;
  }
}

export function generateUpperBureauDesignFloor(): { world: World; entities: Entity[]; spawnX: number; spawnY: number } {
  const world = new World();
  const entities: Entity[] = [];
  const nextId: NextId = { v: 1 };
  let nextRoomId = 0;
  fillDefaultTextures(world);

  const salon = stampBureauRoom(world, nextRoomId++, RoomType.COMMON, 'Салон ожидания верхнего бюро', 486, 497, 31, 21, Tex.F_RED_CARPET);
  const executive = stampBureauRoom(world, nextRoomId++, RoomType.OFFICE, 'Кабинет предварительных решений', 544, 493, 20, 14, Tex.F_PARQUET);
  const files = stampBureauRoom(world, nextRoomId++, RoomType.STORAGE, 'Нулевая картотека стертых имен', 568, 493, 18, 14, Tex.F_MARBLE_TILE);
  const audit = stampBureauRoom(world, nextRoomId++, RoomType.OFFICE, 'Аудиторская Льва', 535, 474, 22, 13, Tex.F_GREEN_CARPET);
  const cleaner = stampBureauRoom(world, nextRoomId++, RoomType.STORAGE, 'Чистая кладовая Толика', 494, 526, 15, 10, Tex.F_TILE);
  const staffDesk = stampBureauRoom(world, nextRoomId++, RoomType.OFFICE, 'Служебный стол обходных листов', 552, 526, 20, 10, Tex.F_MARBLE_TILE);
  const shelter = stampBureauRoom(world, nextRoomId++, RoomType.COMMON, 'Политическое укрытие при салоне', 464, 496, 16, 14, Tex.F_GREEN_CARPET);

  carveFloorRect(world, 476, 506, 10, 5, Tex.F_RED_CARPET);
  carveFloorRect(world, 517, 506, 72, 5, Tex.F_RED_CARPET);
  carveFloorRect(world, 545, 487, 5, 19, Tex.F_GREEN_CARPET);
  carveFloorRect(world, 501, 518, 5, 8, Tex.F_MARBLE_TILE);
  carveFloorRect(world, 501, 537, 82, 5, Tex.F_MARBLE_TILE);
  carveFloorRect(world, 578, 507, 5, 31, Tex.F_MARBLE_TILE);
  carveFloorRect(world, 480, 503, 6, 6, Tex.F_RED_CARPET);

  addDoor(world, salon, 485, 508);
  addDoor(world, salon, 517, 508);
  addDoor(world, shelter, 480, 503, DoorState.HERMETIC_CLOSED, '', Tex.DOOR_METAL);
  addDoor(world, executive, 552, 507);
  addDoor(world, files, 576, 507, DoorState.CLOSED, '', Tex.DOOR_METAL);
  addDoor(world, audit, 546, 487);
  addDoor(world, cleaner, 502, 525, DoorState.CLOSED, '', Tex.DOOR_METAL);
  addDoor(world, cleaner, 502, 536, DoorState.CLOSED, '', Tex.DOOR_METAL);
  addDoor(world, staffDesk, 560, 525);
  addGatePartition(world, 532, 504, 512, 508, UPPER_BUREAU_DOCUMENTS.cleanerKey);
  addGatePartition(world, 522, 536, 543, 540, UPPER_BUREAU_DOCUMENTS.cleanerKey);

  placeLiftCell(world, 477, 508, 478, 508, LiftDirection.UP);
  placeLiftCell(world, 586, 540, 584, 540, LiftDirection.DOWN);

  decorateSalon(world, salon);
  decorateOffice(world, executive);
  decorateOffice(world, audit);
  decorateOffice(world, staffDesk);
  decorateFileRoom(world, files);
  decorateCleanerRoom(world, cleaner);
  decorateSalon(world, shelter);

  setAdministrativeZones(world);

  const iskraId = nextId.v;
  spawnAdminNpc(entities, nextId, ISKRA_DEF, 'bureau_madam_iskra', salon.x + 6, salon.y + 3);
  const levId = nextId.v;
  spawnAdminNpc(entities, nextId, LEV_DEF, 'bureau_auditor_lev', audit.x + 10, audit.y + 3, true, 'makarov');
  const tolikId = nextId.v;
  spawnAdminNpc(entities, nextId, TOLIK_DEF, 'bureau_cleaner_tolik', cleaner.x + 4, cleaner.y + 4);
  spawnAdminNpc(entities, nextId, ANNA_DEF, 'bureau_visitor_anna', salon.x + 21, salon.y + 13);
  spawnNamedCivilian(
    entities, nextId, 'Инспектор Главного Поста', false,
    530, 510, Occupation.HUNTER, Faction.LIQUIDATOR,
    [{ defId: 'key', count: 1 }, { defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 10 }],
    'makarov',
  );
  spawnNamedCivilian(
    entities, nextId, 'Понятая у ковра', true,
    salon.x + 9, salon.y + 12, Occupation.SECRETARY, Faction.CITIZEN,
    [{ defId: 'sealed_complaint', count: 1 }, { defId: 'tea', count: 1 }],
  );

  addItemDrop(entities, nextId, salon.x + 4, salon.y + salon.h - 3, 'blank_form', 1);
  addItemDrop(entities, nextId, salon.x + 8, salon.y + salon.h - 3, 'official_permit_slip', 1);
  addItemDrop(entities, nextId, cleaner.x + cleaner.w - 3, cleaner.y + 2, 'cleaning_kit', 1);
  addItemDrop(entities, nextId, files.x + 3, files.y + 2, 'missing_record_file', 1);
  addItemDrop(entities, nextId, files.x + files.w - 4, files.y + 2, 'record_exposure_notice', 1);
  addItemDrop(entities, nextId, audit.x + 3, audit.y + audit.h - 3, 'denunciation', 1);

  addBureauContainer(
    world, executive, executive.x + executive.w - 3, executive.y + 2,
    ContainerKind.SAFE,
    'Сейф предварительных назначений',
    'locked',
    [
      { defId: 'official_permit_slip', count: 1 },
      { defId: 'permanent_pass', count: 1 },
      { defId: 'elevator_access_order', count: 1 },
    ],
    ['appointment', 'locked', 'paper'],
    { id: iskraId, name: ISKRA_DEF.name, faction: Faction.CITIZEN },
  );
  addBureauContainer(
    world, files, files.x + 2, files.y + 2,
    ContainerKind.FILING_CABINET,
    'Нулевая картотека',
    'faction',
    [
      { defId: 'missing_record_file', count: 1 },
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'personal_file_copy', count: 1 },
      { defId: 'stolen_archive_card', count: 1 },
    ],
    ['record_edit', 'name_erasure', 'audit', 'theft'],
    { id: levId, name: LEV_DEF.name, faction: Faction.LIQUIDATOR },
  );
  addBureauContainer(
    world, cleaner, cleaner.x + 2, cleaner.y + cleaner.h - 3,
    ContainerKind.TOOL_LOCKER,
    'Связка служебных ключей Толика',
    'owner',
    [
      { defId: 'key', count: 1 },
      { defId: 'elevator_access_order', count: 1 },
      { defId: 'cigs', count: 2 },
    ],
    ['staff_route', 'key', 'theft'],
    { id: tolikId, name: TOLIK_DEF.name, faction: Faction.CITIZEN },
  );
  addBureauContainer(
    world, audit, audit.x + audit.w - 3, audit.y + audit.h - 3,
    ContainerKind.FILING_CABINET,
    'Папка аудита рынка 88',
    'owner',
    [
      { defId: 'denunciation', count: 2 },
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'official_permit_slip', count: 1 },
    ],
    ['audit', 'black_market_88', 'paper'],
    { id: levId, name: LEV_DEF.name, faction: Faction.LIQUIDATOR },
  );
  addBureauContainer(
    world, salon, salon.x + 3, salon.y + salon.h - 4,
    ContainerKind.EMERGENCY_BOX,
    'Чайный стол ожидания',
    'public',
    [
      { defId: 'tea', count: 2 },
      { defId: 'water', count: 1 },
      { defId: 'blank_form', count: 1 },
    ],
    ['public', 'salon'],
  );

  spawnAdminMonster(world, entities, nextId, files.x + files.w - 4, files.y + files.h - 3, MonsterKind.PARAGRAPH);

  for (const room of world.rooms) {
    if (!room) continue;
    for (let dy = 1; dy < room.h - 1; dy += 5) {
      for (let dx = 1; dx < room.w - 1; dx += 5) {
        const ci = world.idx(room.x + dx, room.y + dy);
        if (world.cells[ci] === Cell.FLOOR && world.features[ci] === Feature.NONE) world.features[ci] = Feature.LAMP;
      }
    }
  }

  ensureConnectivity(world, salon.x + 8.5, salon.y + 10.5);
  placeProceduralScreens(world, UPPER_BUREAU_BASE_FLOOR);
  world.bakeLights();

  const spawnX = salon.x + 8.5;
  const spawnY = salon.y + 10.5;
  genLog(`[UPPER_BUREAU] ${UPPER_BUREAU_DISPLAY_NAME} ${UPPER_BUREAU_ROUTE_ID} z=${UPPER_BUREAU_ANCHOR_Z} spawn=(${spawnX}, ${spawnY})`);
  return { world, entities, spawnX, spawnY };
}

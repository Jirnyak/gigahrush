import {
  Cell,
  DoorState,
  EntityType,
  Feature,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type GameState,
  type Room,
  type TerritoryOwner,
} from '../core/types';
import { World } from '../core/world';
import {
  HUMAN_TERRITORY_OWNERS,
  TERRITORY_OWNERS,
  TERRITORY_OWNER_SLOTS,
  factionToTerritoryOwner,
  isTerritoryOwner,
  territoryOwnerHqName,
  territoryOwnerRoomWeight,
  territoryOwnerToFaction,
} from '../data/factions';
import {
  CROWD_BUCKETS_PER_AXIS,
  CROWD_BUCKET_SIZE,
  crowdBucketAt,
  crowdInBucket,
  crowdRivalsInBucket,
  ensureCrowdIndex,
} from '../world/crowd_index';
import { roomIdsOfType } from '../world/room_index';
import { addAlifeFactionAttitude } from './alife';
import { setDoorState } from './door_state';
import { ENTITY_MASK_NPC, ensureEntityIndex, getEntityIndex } from './entity_index';
import { publishEvent } from './events';
import { rng } from '../core/rand';

const OWNER_BUCKETS = TERRITORY_OWNER_SLOTS;
const HQ_PATCH_RADIUS = 5;
const HQ_PATCH_MAX_CELLS = 96;
const AUTO_HQ_MAX_ROOM_SPAN = 96;
const AUTO_HQ_MAX_DOORS = 12;
/** Штабы двух хозяев не стоят в соседних комнатах: база — это своя земля, а не
 *  дверь напротив чужой. Порог тот же, которым отдельность штабов меряет
 *  генератор коллекторов, плюс запас на смещение якоря внутри комнаты.
 *  Без него на жилом этаже штабы учёных и культистов вставали в 14 клетках. */
const HQ_ANCHOR_MIN_GAP = AUTO_HQ_MAX_ROOM_SPAN + 16;
const HQ_ANCHOR_MIN_GAP2 = HQ_ANCHOR_MIN_GAP * HQ_ANCHOR_MIN_GAP;
const TERRITORY_BUCKET_SIZE = 32;
const TERRITORY_BUCKET_SIDE = W / TERRITORY_BUCKET_SIZE;
const ZONE_SAMPLE_RADIUS = 60;
const ZONE_SAMPLE_STEP = 4;
const CAPTURE_INTERVAL_SEC = 2;
const CAPTURE_RADIUS = 3;
const CAPTURE_GLOBAL_CELL_CAP = 384;
const CAPTURE_EVENT_LIMIT = 4;
/** Насколько своих должно быть больше чужих в бакете, чтобы земля перевернулась.
 *  Одиночка чужую землю не переворачивает — это и есть требование группы. */
/** Перевес своих над чужими, без которого клетка не переворачивается. Это же
 *  число — требование ГРУППЫ, и его читает драйв захвата: одиночке идти незачем. */
export const CAPTURE_MIN_PRESSURE = 2;
/** Сколько бакетов вокруг себя человек видит, выбирая, куда давить. Окно, а не
 *  этаж: дальний фронт — это уже не его дело, а дело тех, кто там стоит. */
const CAPTURE_TARGET_RADIUS_BUCKETS = 6;
/** Проб на бакет при переписи фронта: сторона 16 с шагом 4 — шестнадцать. */
const FRONT_SAMPLE_STEP = 4;
const FRONT_SAMPLES_PER_BUCKET = (CROWD_BUCKET_SIZE / FRONT_SAMPLE_STEP) ** 2;
const FRONT_BUCKET_COUNT = CROWD_BUCKETS_PER_AXIS * CROWD_BUCKETS_PER_AXIS;
const FRONT_SOLID = 255;
/** Радиус и кап тех, кто заметил потерю земли. Реагируют свидетели, а не фракция. */
const LOSS_WITNESS_RADIUS = 16;
const LOSS_WITNESS_CAP = 16;
/** Насколько потеря земли роняет ЛИЧНОЕ отношение потерпевшего к обидчику.
 *  Матрицу фракций это не трогает: её двигает только игрок. */
const LOSS_ATTITUDE_DELTA = -2;
/** Падение штаба — обида всей округи, а не только тех, кто стоял в комнате. */
const HQ_LOSS_WITNESS_RADIUS = LOSS_WITNESS_RADIUS * 3;
const HQ_LOSS_ATTITUDE_DELTA = LOSS_ATTITUDE_DELTA * 4;

const ownerCountsScratch = new Uint32Array(OWNER_BUCKETS);
const roomCountsScratch = new Uint32Array(OWNER_BUCKETS);
const zoneCountsScratch = new Uint16Array(OWNER_BUCKETS);
const captureQuery: Entity[] = [];
let captureAccum = 0;

export interface TerritoryOwnerCount {
  owner: TerritoryOwner;
  cells: number;
}

export interface TerritoryHqAnchor {
  owner: TerritoryOwner;
  roomId: number;
  x: number;
  y: number;
}

export interface TerritoryTargetShare {
  owner: TerritoryOwner;
  share: number;
}

export interface TerritoryInitializationOptions {
  seed?: number;
  targetShares?: readonly TerritoryTargetShare[];
}

export interface PaintRoomTerritoryOptions {
  includeDoors?: boolean;
  preserveAptMask?: boolean;
}

export interface PaintTerritoryDiscOptions {
  cellCap?: number;
  zoneId?: number;
  preserveSamosbor?: boolean;
  passableOnly?: boolean;
  probability?: number;
  random?: () => number;
  onChange?: (idx: number, previousOwner: TerritoryOwner) => void;
}

function normalizeOwner(value: number): TerritoryOwner {
  return isTerritoryOwner(value) ? value : ZoneFaction.CITIZEN;
}

function walkableForCapture(cell: Cell): boolean {
  return cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER;
}

export function territoryOwnerAtIndex(world: World, idx: number): TerritoryOwner {
  return normalizeOwner(world.factionControl[idx] ?? ZoneFaction.CITIZEN);
}

export function territoryOwnerAt(world: World, x: number, y: number): TerritoryOwner {
  return territoryOwnerAtIndex(world, world.idx(Math.floor(x), Math.floor(y)));
}

export function territoryFactionAt(world: World, x: number, y: number) {
  return territoryOwnerToFaction(territoryOwnerAt(world, x, y));
}

export function setTerritoryOwnerAtIndex(world: World, idx: number, owner: TerritoryOwner): boolean {
  const next = normalizeOwner(owner);
  if (world.factionControl[idx] === next) return false;
  world.factionControl[idx] = next;
  return true;
}

export function setTerritoryOwnerAt(world: World, x: number, y: number, owner: TerritoryOwner): boolean {
  return setTerritoryOwnerAtIndex(world, world.idx(Math.floor(x), Math.floor(y)), owner);
}

export function countTerritoryCells(world: World, step = 1): TerritoryOwnerCount[] {
  ownerCountsScratch.fill(0);
  const stride = Math.max(1, Math.floor(step));
  for (let y = 0; y < W; y += stride) {
    for (let x = 0; x < W; x += stride) {
      const owner = territoryOwnerAtIndex(world, world.idx(x, y));
      ownerCountsScratch[owner]++;
    }
  }
  const multiplier = stride * stride;
  return TERRITORY_OWNERS.map(owner => ({
    owner,
    cells: ownerCountsScratch[owner] * multiplier,
  }));
}

export function dominantTerritoryOwnerInRoom(world: World, roomId: number): TerritoryOwner {
  const room = world.rooms[roomId];
  if (!room) return ZoneFaction.CITIZEN;
  roomCountsScratch.fill(0);
  forEachMappedRoomCell(world, room, idx => {
    const owner = territoryOwnerAtIndex(world, idx);
    if (owner < roomCountsScratch.length) roomCountsScratch[owner]++;
  });
  return dominantOwnerFromCounts(roomCountsScratch, ZoneFaction.CITIZEN);
}

/**
 * Чья это комната. У штаба правило было СВОЁ — владелец центральной клетки, — и
 * оно расходилось с правилом перекраски (`paintRoomOwner` спрашивала большинство
 * клеток). Из-за расхождения база одновременно и падала, и не падала: захватчик,
 * перекрасивший половину штаба мимо центра, для одной дороги уже был хозяином, а
 * для другой ещё нет. Правило теперь одно на все комнаты — большинство клеток.
 */
export function territoryRoomOwner(world: World, roomId: number): TerritoryOwner {
  return dominantTerritoryOwnerInRoom(world, roomId);
}

export function currentTerritoryZoneId(world: World, x: number, y: number): number {
  const idx = world.idx(Math.floor(x), Math.floor(y));
  const zoneId = world.zoneMap[idx] ?? 0;
  return zoneId >= 0 && zoneId < world.zones.length ? zoneId : 0;
}

function currentFieldHasAuthoredTerritory(world: World): boolean {
  let first = -1;
  for (let i = 0; i < world.factionControl.length; i++) {
    const owner = normalizeOwner(world.factionControl[i]);
    if (first < 0) first = owner;
    else if (owner !== first) return true;
  }
  return first !== ZoneFaction.CITIZEN && first >= 0;
}

function sanitizeCurrentTerritory(world: World): void {
  for (let i = 0; i < world.factionControl.length; i++) {
    world.factionControl[i] = normalizeOwner(world.factionControl[i]);
  }
}

function seedTerritoryFromZoneMetadata(world: World): void {
  for (let i = 0; i < W * W; i++) {
    const zone = world.zones[world.zoneMap[i]];
    world.factionControl[i] = normalizeOwner(zone?.faction ?? ZoneFaction.CITIZEN);
  }
}

function dominantOwnerFromCounts<T extends Uint16Array | Uint32Array>(counts: T, fallback: TerritoryOwner): TerritoryOwner {
  let best = fallback;
  let bestCount = -1;
  for (const owner of TERRITORY_OWNERS) {
    const count = counts[owner] ?? 0;
    if (count > bestCount) {
      best = owner;
      bestCount = count;
    }
  }
  return best;
}

function roomCenter(room: Room): { x: number; y: number } {
  return { x: worldWrap(room.x + (room.w >> 1)), y: worldWrap(room.y + (room.h >> 1)) };
}

function worldWrap(v: number): number {
  return ((v % W) + W) % W;
}

function roomArea(room: Room): number {
  return room.w * room.h;
}

function autoHqRoomSpanEligible(room: Room): boolean {
  return room.w > 1 && room.h > 1 && room.w <= AUTO_HQ_MAX_ROOM_SPAN && room.h <= AUTO_HQ_MAX_ROOM_SPAN;
}

function autoHqDoorEligible(room: Room): boolean {
  return room.doors.length > 0 && room.doors.length <= AUTO_HQ_MAX_DOORS;
}

function hqRoomGeometrySane(room: Room): boolean {
  return room.w > 1 && room.h > 1 && room.w < W && room.h < W;
}

function forEachMappedRoomCell(world: World, room: Room, visit: (idx: number) => void): number {
  let count = 0;
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] !== room.id) continue;
      visit(idx);
      count++;
    }
  }
  return count;
}

function roomHasMappedCell(world: World, room: Room): boolean {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) return true;
    }
  }
  return false;
}

function hqShellCapacity(world: World, room: Room): number {
  let cells = 0;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.hermoWall[idx]) {
        cells++;
        continue;
      }
      if (!world.aptMask[idx] && world.cells[idx] === Cell.WALL) cells++;
    }
  }
  return cells;
}

function roomMappedAptCells(world: World, room: Room): number {
  let cells = 0;
  forEachMappedRoomCell(world, room, idx => {
    if (world.aptMask[idx]) cells++;
  });
  return cells;
}

function hqAnchorEligible(world: World, room: Room): boolean {
  return room.apartmentId < 0 &&
    hqRoomGeometrySane(room) &&
    roomHasMappedCell(world, room) &&
    roomMappedAptCells(world, room) === 0 &&
    hqShellCapacity(world, room) > 0;
}

/**
 * Из чего можно ПРОИЗВЕСТИ штаб. Не найдя готового, проход берёт подходящую
 * комнату этажа и переписывает ей тип, имя и оболочку (`hardenHqRoom`), — и
 * авторское имя он бережёт особо (`isGenericHqName`), а тип не берёг никак.
 * Тип — это ПОВЕДЕНИЕ (`rooms.md`): по нему ядро актора выбирает, куда идти
 * работать, спать и обходить, поэтому объявленный складом «Склад трофеев снизу»
 * уходил с этажа штабом гарнизона, а «Пост южных ворот» — вместе со всей
 * процедурой возвращения. Выбор идёт по весу хозяина к типу плюс ПЛОЩАДЬ, а
 * самые крупные комнаты этажа — как раз авторские: замерено 8 сидов из 24 на
 * Базе Ликвидаторов.
 *
 * Отсюда правило: комната с объявленной личностью (`room.defId`, то есть
 * `applyNamedRoom`/`stampNamedRoom`) под авто-штаб не берётся никогда. Уже
 * объявленный автором ШТАБ это не трогает — он приходит готовым и идёт мимо
 * этой проверки (`existingHq` в `hardenHqRoom`, `chooseExistingHqAnchorRoom`).
 */
function autoHqCandidateEligible(world: World, room: Room): boolean {
  return room.apartmentId < 0 &&
    room.defId === undefined &&
    autoHqRoomSpanEligible(room) &&
    autoHqDoorEligible(room) &&
    roomHasMappedCell(world, room) &&
    roomMappedAptCells(world, room) === 0 &&
    hqShellCapacity(world, room) > 0;
}

function roomHasHermeticDoor(world: World, room: Room): boolean {
  return room.doors.some(idx => {
    const state = world.doors.get(idx)?.state;
    return state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED;
  });
}

function authoredHqAnchorEligible(world: World, room: Room): boolean {
  return room.apartmentId < 0 &&
    hqRoomGeometrySane(room) &&
    roomHasMappedCell(world, room) &&
    roomHasHermeticDoor(world, room);
}

function roomOwnerHint(world: World, room: Room): TerritoryOwner {
  roomCountsScratch.fill(0);
  forEachMappedRoomCell(world, room, idx => {
    roomCountsScratch[territoryOwnerAtIndex(world, idx)]++;
  });
  return dominantOwnerFromCounts(roomCountsScratch, ZoneFaction.CITIZEN);
}

/* Чужая квартира не берётся никогда, штаб берётся всегда — это про устройство
 * мира, а не про вкус хозяина, поэтому оба остаются кодом. Всё остальное —
 * строка в `TERRITORY_OWNER_DEFS`: ветка на хозяина запрещала бы заводить
 * хозяина данными. */
function roomPreference(owner: TerritoryOwner, room: Room): number {
  if (room.apartmentId >= 0) return -100;
  if (room.type === RoomType.HQ) return 100;
  return territoryOwnerRoomWeight(owner, room.type);
}

function chooseAnchorRoom(
  world: World, owner: TerritoryOwner, usedRooms: Set<number>, tooClose?: (room: Room) => boolean,
): Room | null {
  let best: Room | null = null;
  let bestScore = -Infinity;
  for (const room of world.rooms) {
    if (!room) continue;
    if (room.id === 0) continue;
    if (usedRooms.has(room.id)) continue;
    if (tooClose?.(room)) continue;
    if (roomArea(room) > 4096) continue;
    if (!autoHqCandidateEligible(world, room)) continue;
    const hint = roomOwnerHint(world, room);
    const score = roomPreference(owner, room)
      + (hint === owner ? 60 : 0)
      + Math.min(20, Math.floor((room.w * room.h) / 10))
      - Math.abs(room.id * 17 - owner * 31) * 0.001;
    if (score > bestScore) {
      best = room;
      bestScore = score;
    }
  }
  return best;
}

function hqAnchorSelectionScore(world: World, room: Room, owner: TerritoryOwner): number {
  return roomPreference(owner, room)
    + Math.min(60, roomArea(room) * 0.05)
    + Math.min(24, hqShellCapacity(world, room) * 0.02)
    - room.doors.length * 0.5
    - room.id * 0.0001;
}

function chooseExistingHqAnchorRoom(
  world: World,
  owner: TerritoryOwner,
  usedRooms: ReadonlySet<number>,
  eligible: (world: World, room: Room) => boolean,
  tooClose?: (room: Room) => boolean,
): Room | null {
  let best: Room | null = null;
  let bestScore = -Infinity;
  for (const room of world.rooms) {
    if (!room || room.type !== RoomType.HQ || usedRooms.has(room.id)) continue;
    if (!eligible(world, room)) continue;
    if (tooClose?.(room)) continue;
    if (territoryRoomOwner(world, room.id) !== owner) continue;
    const score = hqAnchorSelectionScore(world, room, owner);
    if (score > bestScore) {
      best = room;
      bestScore = score;
    }
  }
  return best;
}

function pushTerritoryHqAnchor(anchors: TerritoryHqAnchor[], room: Room, owner: TerritoryOwner): void {
  const center = roomCenter(room);
  anchors.push({ owner, roomId: room.id, x: center.x, y: center.y });
}

export function paintRoomTerritory(
  world: World,
  roomId: number,
  owner: TerritoryOwner,
  options: PaintRoomTerritoryOptions = {},
): number {
  const room = world.rooms[roomId];
  if (!room) return 0;
  return paintRoomOwner(world, room, owner, options);
}

export function paintTerritoryDisc(
  world: World,
  x: number,
  y: number,
  radius: number,
  owner: TerritoryOwner,
  options: PaintTerritoryDiscOptions = {},
): number {
  const r = Math.max(0, Math.floor(radius));
  const r2 = r * r;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const cap = Math.max(0, Math.floor(options.cellCap ?? Number.MAX_SAFE_INTEGER));
  const preserveSamosbor = options.preserveSamosbor !== false;
  const probability = Math.max(0, Math.min(1, options.probability ?? 1));
  const random = options.random ?? rng;
  let changed = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (changed >= cap) return changed;
      if (dx * dx + dy * dy > r2) continue;
      if (probability < 1 && random() > probability) continue;
      const idx = world.idx(cx + dx, cy + dy);
      if (options.zoneId !== undefined && world.zoneMap[idx] !== options.zoneId) continue;
      if (options.passableOnly && !walkableForCapture(world.cells[idx])) continue;
      const previousOwner = territoryOwnerAtIndex(world, idx);
      if (preserveSamosbor && previousOwner === ZoneFaction.SAMOSBOR) continue;
      const roomId = world.roomMap[idx];
      if (roomId >= 0 && world.rooms[roomId]?.type === RoomType.HQ && previousOwner !== owner) continue;
      if (!setTerritoryOwnerAtIndex(world, idx, owner)) continue;
      options.onChange?.(idx, previousOwner);
      changed++;
    }
  }
  return changed;
}

function paintRoomOwner(
  world: World,
  room: Room,
  owner: TerritoryOwner,
  options: PaintRoomTerritoryOptions = {},
): number {
  const preserveAptMask = options.preserveAptMask !== false;
  const includeDoors = options.includeDoors !== false;
  if (room.type === RoomType.HQ && dominantTerritoryOwnerInRoom(world, room.id) !== owner) {
    return 0;
  }
  let changed = 0;
  forEachMappedRoomCell(world, room, idx => {
    if (preserveAptMask && world.aptMask[idx]) return;
    if (setTerritoryOwnerAtIndex(world, idx, owner)) changed++;
  });
  if (!includeDoors) return changed;
  for (const idx of room.doors) {
    if (preserveAptMask && world.aptMask[idx]) continue;
    if (setTerritoryOwnerAtIndex(world, idx, owner)) changed++;
  }
  return changed;
}

function paintOwnerPatch(world: World, x: number, y: number, owner: TerritoryOwner): number {
  let changed = 0;
  for (let dy = -HQ_PATCH_RADIUS; dy <= HQ_PATCH_RADIUS; dy++) {
    for (let dx = -HQ_PATCH_RADIUS; dx <= HQ_PATCH_RADIUS; dx++) {
      if (changed >= HQ_PATCH_MAX_CELLS) return changed;
      if (dx * dx + dy * dy > HQ_PATCH_RADIUS * HQ_PATCH_RADIUS) continue;
      const idx = world.idx(x + dx, y + dy);
      if (world.aptMask[idx]) continue;
      if (world.cells[idx] === Cell.ABYSS || world.cells[idx] === Cell.LIFT) continue;
      const roomId = world.roomMap[idx];
      if (roomId >= 0 && world.rooms[roomId]?.type === RoomType.HQ && territoryOwnerAtIndex(world, idx) !== owner) continue;
      if (setTerritoryOwnerAtIndex(world, idx, owner)) changed++;
    }
  }
  return changed;
}

/** Родовое имя штаба — то, что выдала таблица. Авторское имя не переписывается
 *  ни при укреплении, ни при переходе базы в чужие руки. */
function isGenericHqName(name: string): boolean {
  for (const owner of TERRITORY_OWNERS) {
    if (name === territoryOwnerHqName(owner)) return true;
  }
  return false;
}

function hardenHqRoom(world: World, room: Room, owner: TerritoryOwner): void {
  const existingHq = room.type === RoomType.HQ;
  if ((existingHq && !hqRoomGeometrySane(room)) || (!existingHq && !autoHqCandidateEligible(world, room))) {
    room.sealed = false;
    paintRoomOwner(world, room, owner, { includeDoors: false });
    return;
  }
  room.type = RoomType.HQ;
  room.sealed = true;
  if (!room.name || room.name.startsWith('Комната') || isGenericHqName(room.name)) {
    room.name = territoryOwnerHqName(owner);
  }
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) {
          setTerritoryOwnerAtIndex(world, idx, owner);
          if (world.features[idx] === Feature.NONE && ((dx * 17 + dy * 31 + owner) % 19) === 0) {
            world.features[idx] = Feature.TABLE;
          }
        }
        continue;
      }
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
  for (const doorIdx of room.doors) {
    const door = world.doors.get(doorIdx);
    if (door?.state === DoorState.LOCKED && door.keyId) continue;
    setDoorState(world, door, DoorState.HERMETIC_OPEN);
    world.hermoWall[doorIdx] = 1;
    world.wallTex[doorIdx] = Tex.HERMO_WALL;
  }
}

function reinforceHqSupportRooms(world: World, hq: Room, owner: TerritoryOwner): void {
  const center = roomCenter(hq);
  const candidates = world.rooms
    .filter(room => (
      room &&
      room.id !== hq.id &&
      room.type !== RoomType.HQ &&
      room.apartmentId < 0 &&
      autoHqRoomSpanEligible(room) &&
      room.w > 2 &&
      room.h > 2 &&
      roomArea(room) <= 4096 &&
      roomHasMappedCell(world, room)
    ))
    .map(room => ({ room, d2: world.dist2(center.x, center.y, room.x + (room.w >> 1), room.y + (room.h >> 1)) }))
    .sort((a, b) => a.d2 - b.d2);
  let painted = 0;
  for (const candidate of candidates) {
    if (painted >= 4 || candidate.d2 > 96 * 96) break;
    if (
      candidate.room.type !== RoomType.KITCHEN &&
      candidate.room.type !== RoomType.BATHROOM &&
      candidate.room.type !== RoomType.STORAGE &&
      candidate.room.type !== RoomType.MEDICAL &&
      candidate.room.type !== RoomType.OFFICE &&
      candidate.room.type !== RoomType.COMMON
    ) continue;
    paintRoomOwner(world, candidate.room, owner);
    painted++;
  }
}

function reinforceAllHqAnchors(world: World): void {
  for (const anchor of territoryHqAnchors(world)) {
    const room = world.rooms[anchor.roomId];
    if (!room) continue;
    hardenHqRoom(world, room, anchor.owner);
    paintRoomOwner(world, room, anchor.owner);
    paintOwnerPatch(world, anchor.x, anchor.y, anchor.owner);
    reinforceHqSupportRooms(world, room, anchor.owner);
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function territoryHqAnchors(world: World): TerritoryHqAnchor[] {
  const anchors: TerritoryHqAnchor[] = [];
  const seen = new Set<TerritoryOwner>();
  const usedRooms = new Set<number>();
  const claimed: { x: number; y: number }[] = [];
  const tooClose = (room: Room): boolean => {
    const c = roomCenter(room);
    return claimed.some(p => world.dist2(p.x, p.y, c.x, c.y) <= HQ_ANCHOR_MIN_GAP2);
  };
  const claim = (room: Room, owner: TerritoryOwner): void => {
    pushTerritoryHqAnchor(anchors, room, owner);
    seen.add(owner);
    usedRooms.add(room.id);
    claimed.push(roomCenter(room));
  };
  // Разнос — ПРЕДПОЧТЕНИЕ, а не запрет: хозяин без штаба хуже, чем два штаба
  // рядом. Сначала ищем с разносом, и только если такой комнаты нет вовсе —
  // берём любую подходящую. Иначе на тесном этаже фракция теряет базу совсем.
  const pick = (
    choose: (tooClose?: (room: Room) => boolean) => Room | null,
  ): Room | null => choose(tooClose) ?? choose(undefined);

  for (const owner of HUMAN_TERRITORY_OWNERS) {
    const room = pick(g => chooseExistingHqAnchorRoom(world, owner, usedRooms, hqAnchorEligible, g));
    if (room) claim(room, owner);
  }
  for (const owner of HUMAN_TERRITORY_OWNERS) {
    if (seen.has(owner)) continue;
    const room = pick(g => chooseExistingHqAnchorRoom(world, owner, usedRooms, authoredHqAnchorEligible, g));
    if (room) claim(room, owner);
  }
  for (const owner of HUMAN_TERRITORY_OWNERS) {
    if (seen.has(owner)) continue;
    const room = pick(g => chooseAnchorRoom(world, owner, usedRooms, g));
    if (!room) continue;
    hardenHqRoom(world, room, owner);
    claim(room, owner);
  }
  return anchors;
}

function ensureMiniHqPatches(world: World): void {
  const usedRooms = new Set<number>();
  for (const anchor of territoryHqAnchors(world)) {
    const room = world.rooms[anchor.roomId];
    if (room?.type === RoomType.HQ) usedRooms.add(anchor.roomId);
  }
  for (const owner of HUMAN_TERRITORY_OWNERS) {
    let hasAnchor = false;
    for (const anchor of territoryHqAnchors(world)) {
      if (anchor.owner === owner && world.rooms[anchor.roomId]?.type === RoomType.HQ) {
        hasAnchor = true;
        break;
      }
    }
    if (hasAnchor) continue;
    const room = chooseAnchorRoom(world, owner, usedRooms);
    if (!room) continue;
    usedRooms.add(room.id);
    const center = roomCenter(room);
    hardenHqRoom(world, room, owner);
    paintRoomOwner(world, room, owner);
    paintOwnerPatch(world, center.x, center.y, owner);
    reinforceHqSupportRooms(world, room, owner);
  }
}

function territoryHash01(seed: number, a: number, b: number, c = 0): number {
  let h = seed ^ Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x632b, 0xc2b2ae35) ^ Math.imul(c + 0x27d4, 0x165667b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

function normalizedTargetShares(shares: readonly TerritoryTargetShare[] | undefined): TerritoryTargetShare[] {
  if (!shares || shares.length === 0) return [];
  const rows = shares
    .filter(row => TERRITORY_OWNERS.includes(row.owner) && Number.isFinite(row.share) && row.share > 0)
    .map(row => ({ owner: row.owner, share: row.share }));
  const total = rows.reduce((sum, row) => sum + row.share, 0);
  if (total <= 0) return [];
  for (const row of rows) row.share /= total;
  return rows;
}

function bucketCenter(index: number): { x: number; y: number } {
  const bx = index % TERRITORY_BUCKET_SIDE;
  const by = (index / TERRITORY_BUCKET_SIDE) | 0;
  return {
    x: bx * TERRITORY_BUCKET_SIZE + TERRITORY_BUCKET_SIZE / 2,
    y: by * TERRITORY_BUCKET_SIZE + TERRITORY_BUCKET_SIZE / 2,
  };
}

function ownerBucketScore(world: World, owner: TerritoryOwner, anchors: readonly TerritoryHqAnchor[], bucket: number, seed: number): number {
  const center = bucketCenter(bucket);
  let best = Infinity;
  for (const anchor of anchors) {
    if (anchor.owner !== owner) continue;
    const d2 = world.dist2(center.x, center.y, anchor.x + 0.5, anchor.y + 0.5);
    if (d2 < best) best = d2;
  }
  if (!Number.isFinite(best)) best = world.dist2(center.x, center.y, W / 2, W / 2);
  const bx = bucket % TERRITORY_BUCKET_SIDE;
  const by = (bucket / TERRITORY_BUCKET_SIDE) | 0;
  const noise = territoryHash01(seed, bx >> 1, by >> 1, owner * 19) * 0.22 +
    territoryHash01(seed, bx, by, owner * 29) * 0.08;
  return best * (0.88 + noise);
}

function applyTargetTerritoryShares(world: World, shares: readonly TerritoryTargetShare[], seed: number): void {
  const rows = normalizedTargetShares(shares);
  if (rows.length === 0) return;
  const bucketCount = TERRITORY_BUCKET_SIDE * TERRITORY_BUCKET_SIDE;
  const ownerBuckets = new Uint8Array(bucketCount).fill(255);
  const quota = new Map<TerritoryOwner, number>();
  const assigned = new Map<TerritoryOwner, number>();
  let remaining = bucketCount;
  for (let i = 0; i < rows.length; i++) {
    const target = i === rows.length - 1 ? remaining : Math.max(1, Math.round(rows[i].share * bucketCount));
    quota.set(rows[i].owner, target);
    assigned.set(rows[i].owner, 0);
    remaining -= target;
  }

  const hqRooms = world.rooms
    .filter(room => room?.type === RoomType.HQ)
    .map(room => ({ room, owner: territoryRoomOwner(world, room.id), center: roomCenter(room) }));
  const anchors = territoryHqAnchors(world);
  const candidates: { owner: TerritoryOwner; bucket: number; score: number }[] = [];
  for (const row of rows) {
    for (let bucket = 0; bucket < bucketCount; bucket++) {
      candidates.push({ owner: row.owner, bucket, score: ownerBucketScore(world, row.owner, anchors, bucket, seed) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  for (const candidate of candidates) {
    if (ownerBuckets[candidate.bucket] !== 255) continue;
    const used = assigned.get(candidate.owner) ?? 0;
    const cap = quota.get(candidate.owner) ?? 0;
    if (used >= cap) continue;
    ownerBuckets[candidate.bucket] = candidate.owner;
    assigned.set(candidate.owner, used + 1);
  }
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    if (ownerBuckets[bucket] !== 255) continue;
    let bestOwner = rows[0].owner;
    let bestOverflow = Infinity;
    for (const row of rows) {
      const used = assigned.get(row.owner) ?? 0;
      const cap = Math.max(1, quota.get(row.owner) ?? 1);
      const overflow = used / cap + ownerBucketScore(world, row.owner, anchors, bucket, seed) * 1e-7;
      if (overflow < bestOverflow) {
        bestOverflow = overflow;
        bestOwner = row.owner;
      }
    }
    ownerBuckets[bucket] = bestOwner;
    assigned.set(bestOwner, (assigned.get(bestOwner) ?? 0) + 1);
  }

  for (let by = 0; by < TERRITORY_BUCKET_SIDE; by++) {
    for (let bx = 0; bx < TERRITORY_BUCKET_SIDE; bx++) {
      const owner = ownerBuckets[by * TERRITORY_BUCKET_SIDE + bx] as TerritoryOwner;
      for (let dy = 0; dy < TERRITORY_BUCKET_SIZE; dy++) {
        for (let dx = 0; dx < TERRITORY_BUCKET_SIZE; dx++) {
          const idx = world.idx(bx * TERRITORY_BUCKET_SIZE + dx, by * TERRITORY_BUCKET_SIZE + dy);
          const roomId = world.roomMap[idx];
          if (roomId >= 0 && world.rooms[roomId]?.type === RoomType.HQ) continue;
          world.factionControl[idx] = owner;
        }
      }
    }
  }

  const reinforcedRooms = new Set<number>();
  for (const hq of hqRooms) {
    hardenHqRoom(world, hq.room, hq.owner);
    paintRoomOwner(world, hq.room, hq.owner);
    paintOwnerPatch(world, hq.center.x, hq.center.y, hq.owner);
    reinforceHqSupportRooms(world, hq.room, hq.owner);
    reinforcedRooms.add(hq.room.id);
  }
  for (const anchor of territoryHqAnchors(world)) {
    if (reinforcedRooms.has(anchor.roomId)) continue;
    const room = world.rooms[anchor.roomId];
    if (room) {
      hardenHqRoom(world, room, anchor.owner);
      paintRoomOwner(world, room, anchor.owner);
      reinforceHqSupportRooms(world, room, anchor.owner);
    }
    paintOwnerPatch(world, anchor.x, anchor.y, anchor.owner);
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

function nearestZoneHqRoom(world: World, zone: { cx: number; cy: number; faction: TerritoryOwner }): Room | undefined {
  let best: Room | undefined;
  let bestD2 = Infinity;
  for (const room of world.rooms) {
    if (!room || room.type !== RoomType.HQ) continue;
    if (roomOwnerHint(world, room) !== zone.faction) continue;
    const center = roomCenter(room);
    const d2 = world.dist2(zone.cx + 0.5, zone.cy + 0.5, center.x + 0.5, center.y + 0.5);
    if (d2 > bestD2 || (d2 === bestD2 && best !== undefined && room.id >= best.id)) continue;
    best = room;
    bestD2 = d2;
  }
  return best;
}

export function syncZoneMetadataFromTerritory(world: World, zoneIds?: Iterable<number>): void {
  const ids = zoneIds ? [...zoneIds] : world.zones.map(zone => zone.id);
  for (const zoneId of ids) {
    const zone = world.zones[zoneId];
    if (!zone) continue;
    zoneCountsScratch.fill(0);
    for (let dy = -ZONE_SAMPLE_RADIUS; dy <= ZONE_SAMPLE_RADIUS; dy += ZONE_SAMPLE_STEP) {
      for (let dx = -ZONE_SAMPLE_RADIUS; dx <= ZONE_SAMPLE_RADIUS; dx += ZONE_SAMPLE_STEP) {
        const idx = world.idx(zone.cx + dx, zone.cy + dy);
        if (world.zoneMap[idx] !== zoneId) continue;
        zoneCountsScratch[territoryOwnerAtIndex(world, idx)]++;
      }
    }
    zone.territoryCounts = new Uint16Array(zoneCountsScratch);
    zone.faction = dominantOwnerFromCounts(zoneCountsScratch, zone.faction);
    const hq = nearestZoneHqRoom(world, zone);
    zone.hqRoomId = hq?.id ?? zone.hqRoomId;
  }
}

export function initializeCellTerritory(world: World, options: TerritoryInitializationOptions = {}): void {
  if (currentFieldHasAuthoredTerritory(world)) sanitizeCurrentTerritory(world);
  else seedTerritoryFromZoneMetadata(world);
  ensureMiniHqPatches(world);
  reinforceAllHqAnchors(world);
  applyTargetTerritoryShares(world, options.targetShares ?? [], options.seed ?? 0);
  ensureMiniHqPatches(world);
  reinforceAllHqAnchors(world);
  syncZoneMetadataFromTerritory(world);
}

/* ── Фронт: где чья земля крупным планом ───────────────────────────
 *
 * Захват начинался случайно, потому что ворота требовали, чтобы человек УЖЕ
 * стоял на чужой клетке, — а вся его рутина, наоборот, отталкивает от чужой
 * территории. Срабатывало на прохожих и ни к чему не вело.
 *
 * Чтобы захват стал ЦЕЛЬЮ, нужно уметь ответить «куда идти давить», и ответ
 * обязан быть одинаковым у соседей: рейд — это не отряд с составом, это
 * несколько человек, у которых от одинакового входа получилась одна и та же
 * цель. Поэтому цель считается ИЗ СОСТОЯНИЯ МИРА и от БАКЕТА человека, а не от
 * его точных координат и не жребием: все свои внутри одной клетки 16×16 получают
 * буквально одну клетку-цель и идут туда общим маршрутом — цепью, потому что
 * дорогу через двери и коридоры выбирает поиск пути, а расталкивание разводит
 * их вбок.
 *
 * Сетка та же, что у скоплений и у бродфейза: своей ручки не заводим.
 */

interface TerritoryFront {
  builtAt: number;
  builds: number;
  /** Доминирующий хозяин бакета; `FRONT_SOLID` — ходить не по чему. */
  owner: Uint8Array;
  /** Маска хозяев, для которых бакет — фронт: их земля или их люди рядом. */
  reach: Uint8Array;
  /** Сколько проб бакета проходимы: сквозь бетон фронта не бывает. */
  passable: Uint8Array;
  /** Клетка-цель внутри бакета; -1 не считана, -2 считана и её нет. */
  targetCell: Int32Array;
  /** Стоит ли в бакете штаб. */
  hq: Uint8Array;
  /**
   * Выбор цели для пары «бакет смотрящего × сторона»: клетка (-1 не считано,
   * -2 цели нет) и ценность участка.
   *
   * Это не кэш поверх решения, а само решение, записанное один раз: цель
   * считается ОТ БАКЕТА и ни от чего больше, поэтому у всех своих в одной
   * ячейке 16×16 она обязана совпадать — на этом и держится рейд. Пока памяти
   * не было, каждый спрашивающий заново обходил 169 бакетов и получал тот же
   * ответ; на живом этаже это стоило 7% кадра `updateAI`.
   */
  pickCell: Int32Array;
  pickValue: Float32Array;
}

const frontByWorld = new WeakMap<World, TerritoryFront>();
/**
 * Кто объявил, что давит. Захватывает ТОЛЬКО тот, у кого цель — захват: без
 * объявления не переворачивается ни одна клетка, сколько бы народу ни ходило по
 * чужой земле. Иначе большинство этажа съедало бы территорию просто тем, что
 * оно большинство, — замерено на жилом: 1702 жителя из 2175 сносили границу
 * всех четырёх соседей на каждом такте.
 *
 * Список, а не поле в акторе: свойство «сейчас давлю» принадлежит одному такту
 * этой системы, а не сущности, и в `AIState` ему не место.
 */
const pushSet = new Set<Entity>();
const frontPresenceScratch = new Uint8Array(FRONT_BUCKET_COUNT);
const captureZonesScratch = new Set<number>();
const captureHqScratch = new Map<number, TerritoryOwner>();
/** Свои часы такта: `state` бывает не передан, а перепись надо чем-то мерить. */
let captureClock = 0;
let captureCellBudget = 0;
let capturePublished = 0;

function frontOf(world: World): TerritoryFront {
  let front = frontByWorld.get(world);
  if (!front) {
    front = {
      builtAt: -Infinity,
      builds: 0,
      owner: new Uint8Array(FRONT_BUCKET_COUNT).fill(FRONT_SOLID),
      reach: new Uint8Array(FRONT_BUCKET_COUNT),
      passable: new Uint8Array(FRONT_BUCKET_COUNT),
      targetCell: new Int32Array(FRONT_BUCKET_COUNT).fill(-1),
      hq: new Uint8Array(FRONT_BUCKET_COUNT),
      pickCell: new Int32Array(FRONT_BUCKET_COUNT * TERRITORY_OWNER_SLOTS).fill(-1),
      pickValue: new Float32Array(FRONT_BUCKET_COUNT * TERRITORY_OWNER_SLOTS),
    };
    frontByWorld.set(world, front);
  }
  return front;
}

function rebuildFrontOwners(world: World, front: TerritoryFront): void {
  for (let by = 0; by < CROWD_BUCKETS_PER_AXIS; by++) {
    for (let bx = 0; bx < CROWD_BUCKETS_PER_AXIS; bx++) {
      const bucket = by * CROWD_BUCKETS_PER_AXIS + bx;
      ownerCountsScratch.fill(0);
      let passable = 0;
      for (let dy = 0; dy < CROWD_BUCKET_SIZE; dy += FRONT_SAMPLE_STEP) {
        for (let dx = 0; dx < CROWD_BUCKET_SIZE; dx += FRONT_SAMPLE_STEP) {
          const idx = world.idx(bx * CROWD_BUCKET_SIZE + dx, by * CROWD_BUCKET_SIZE + dy);
          if (!walkableForCapture(world.cells[idx])) continue;
          passable++;
          ownerCountsScratch[territoryOwnerAtIndex(world, idx)]++;
        }
      }
      front.passable[bucket] = passable;
      front.owner[bucket] = passable === 0
        ? FRONT_SOLID
        : dominantOwnerFromCounts(ownerCountsScratch, ZoneFaction.CITIZEN);
    }
  }
}

/** Присутствие себя и четырёх соседей. Земля даёт фронт соседнему бакету, люди —
 *  тоже: безземельная банда, вставшая на чужом, создаёт фронт собой. */
function rebuildFrontReach(world: World, front: TerritoryFront): void {
  for (let bucket = 0; bucket < FRONT_BUCKET_COUNT; bucket++) {
    let mask = 0;
    const owner = front.owner[bucket];
    if (owner !== FRONT_SOLID) mask |= 1 << owner;
    for (let candidate = 0; candidate < TERRITORY_OWNER_SLOTS; candidate++) {
      if (crowdInBucket(world, bucket, candidate as TerritoryOwner) > 0) mask |= 1 << candidate;
    }
    frontPresenceScratch[bucket] = mask;
  }
  const side = CROWD_BUCKETS_PER_AXIS;
  for (let by = 0; by < side; by++) {
    for (let bx = 0; bx < side; bx++) {
      front.reach[by * side + bx] = frontPresenceScratch[by * side + bx]
        | frontPresenceScratch[((by + side - 1) % side) * side + bx]
        | frontPresenceScratch[((by + 1) % side) * side + bx]
        | frontPresenceScratch[by * side + ((bx + side - 1) % side)]
        | frontPresenceScratch[by * side + ((bx + 1) % side)];
    }
  }
}

/** Перепись фронта, если её такт истёк. Скопления должны быть переписаны раньше. */
export function ensureTerritoryFront(world: World, time: number): void {
  const front = frontOf(world);
  if (time - front.builtAt < CAPTURE_INTERVAL_SEC) return;
  front.builtAt = time;
  front.builds++;
  front.targetCell.fill(-1);
  front.pickCell.fill(-1);
  front.hq.fill(0);
  rebuildFrontOwners(world, front);
  rebuildFrontReach(world, front);
  for (const roomId of roomIdsOfType(world, RoomType.HQ)) {
    const room = world.rooms[roomId];
    if (!room) continue;
    const center = roomCenter(room);
    front.hq[crowdBucketAt(center.x, center.y)] = 1;
  }
}

/** Клетка внутри бакета, ближайшая к его центру и принадлежащая его хозяину.
 *  Считается по первому спросу и живёт до следующей переписи фронта. */
function frontTargetCell(world: World, front: TerritoryFront, bucket: number): number {
  const cached = front.targetCell[bucket];
  if (cached !== -1) return cached;
  const owner = front.owner[bucket];
  const originX = (bucket % CROWD_BUCKETS_PER_AXIS) * CROWD_BUCKET_SIZE;
  const originY = ((bucket / CROWD_BUCKETS_PER_AXIS) | 0) * CROWD_BUCKET_SIZE;
  const centerX = originX + CROWD_BUCKET_SIZE / 2;
  const centerY = originY + CROWD_BUCKET_SIZE / 2;
  let best = -2;
  let bestD2 = Infinity;
  for (let dy = 0; dy < CROWD_BUCKET_SIZE; dy++) {
    for (let dx = 0; dx < CROWD_BUCKET_SIZE; dx++) {
      const x = originX + dx;
      const y = originY + dy;
      const idx = world.idx(x, y);
      if (!walkableForCapture(world.cells[idx])) continue;
      if (territoryOwnerAtIndex(world, idx) !== owner) continue;
      const d2 = (x + 0.5 - centerX) ** 2 + (y + 0.5 - centerY) ** 2;
      if (d2 >= bestD2) continue;
      bestD2 = d2;
      best = idx;
    }
  }
  front.targetCell[bucket] = best;
  return best;
}

/** Верх шкалы ценности участка: сумма слагаемых формулы ниже при полном
 *  проходимом бакете (1 своя земля + 3 штаб + 2 свои + 1 чужие). Драйву нужен,
 *  чтобы привести ценность к общей доле 0..1, а не заводить свою шкалу. */
export const TERRITORY_CAPTURE_VALUE_MAX = 7;

export interface TerritoryCaptureTarget {
  /** Клетка мира — цель для маршрута. Дорогу к ней прокладывает поиск пути. */
  x: number;
  y: number;
  /** Бакет фронта: у всех своих в одном бакете он одинаков — из этого цепь. */
  bucket: number;
  /** Чей участок сейчас. */
  owner: TerritoryOwner;
  /** Чем участок ценен: люди, штаб, уже идущие туда свои. Для веса драйва. */
  value: number;
  /** Клеток по тору до цели. */
  distance: number;
}

/**
 * Куда этому человеку идти давить. **Это и есть вызов для драйва захвата.**
 *
 * Чистое чтение состояния мира: жребия нет, от личности не зависит, поэтому
 * двое своих в одной клетке 16×16 получают ОДНУ цель и сходятся в рейд, ни о чём
 * не договариваясь. Возвращает `null`, пока перепись фронта не построена
 * (`updateTerritoryCapture` строит её своим тактом) и если фронта рядом нет.
 */
export function territoryCaptureTarget(world: World, actor: Entity): TerritoryCaptureTarget | null {
  if (actor.faction === undefined) return null;
  return territoryCaptureTargetFor(world, factionToTerritoryOwner(actor.faction), actor.x, actor.y);
}

export function territoryCaptureTargetFor(
  world: World,
  mine: TerritoryOwner,
  x: number,
  y: number,
): TerritoryCaptureTarget | null {
  if (mine === ZoneFaction.SAMOSBOR) return null;
  const front = frontByWorld.get(world);
  if (!front || front.builds === 0) return null;
  const bit = 1 << mine;
  const from = crowdBucketAt(x, y);
  /* Решение принимается один раз на пару «бакет × сторона» и живёт до следующей
   * переписи фронта: оно и так зависит только от них. Расстояние — единственное,
   * что считается для каждого спрашивающего, потому что оно от его точки. */
  const slot = from * TERRITORY_OWNER_SLOTS + mine;
  const remembered = front.pickCell[slot];
  if (remembered === -2) return null;
  if (remembered >= 0) return captureTargetAt(world, front, remembered, front.pickValue[slot], x, y);
  const fromX = from % CROWD_BUCKETS_PER_AXIS;
  const fromY = (from / CROWD_BUCKETS_PER_AXIS) | 0;
  let bestBucket = -1;
  let bestScore = 0;
  let bestValue = 0;
  for (let dy = -CAPTURE_TARGET_RADIUS_BUCKETS; dy <= CAPTURE_TARGET_RADIUS_BUCKETS; dy++) {
    for (let dx = -CAPTURE_TARGET_RADIUS_BUCKETS; dx <= CAPTURE_TARGET_RADIUS_BUCKETS; dx++) {
      const bx = (fromX + dx + CROWD_BUCKETS_PER_AXIS) % CROWD_BUCKETS_PER_AXIS;
      const by = (fromY + dy + CROWD_BUCKETS_PER_AXIS) % CROWD_BUCKETS_PER_AXIS;
      const bucket = by * CROWD_BUCKETS_PER_AXIS + bx;
      const owner = front.owner[bucket];
      if (owner === FRONT_SOLID || owner === mine || owner === ZoneFaction.SAMOSBOR) continue;
      if ((front.reach[bucket] & bit) === 0) continue;
      const value = (1
        + (front.hq[bucket] ? 3 : 0)
        + Math.min(4, crowdInBucket(world, bucket, mine)) * 0.5
        + Math.min(4, crowdRivalsInBucket(world, bucket, mine)) * 0.25)
        * (front.passable[bucket] / FRONT_SAMPLES_PER_BUCKET);
      // Потолок этой суммы и есть TERRITORY_CAPTURE_VALUE_MAX: 1 + 3 + 2 + 1.

      const score = value / (1 + dx * dx + dy * dy);
      if (score <= bestScore) continue;
      bestScore = score;
      bestBucket = bucket;
      bestValue = value;
    }
  }
  const cell = bestBucket < 0 ? -1 : frontTargetCell(world, front, bestBucket);
  if (cell < 0) {
    front.pickCell[slot] = -2;
    return null;
  }
  front.pickCell[slot] = cell;
  front.pickValue[slot] = bestValue;
  return captureTargetAt(world, front, cell, bestValue, x, y);
}

/** Собрать ответ по запомненной клетке: всё, кроме расстояния, уже решено. */
function captureTargetAt(
  world: World,
  front: TerritoryFront,
  cell: number,
  value: number,
  x: number,
  y: number,
): TerritoryCaptureTarget {
  const tx = cell % W;
  const ty = (cell / W) | 0;
  const bucket = crowdBucketAt(tx, ty);
  return {
    x: tx,
    y: ty,
    bucket,
    owner: front.owner[bucket] as TerritoryOwner,
    value,
    distance: Math.sqrt(world.dist2(x, y, tx + 0.5, ty + 0.5)),
  };
}

/**
 * Перевес своих над чужими в бакете под человеком. Одно чтение переписи вместо
 * радиусного запроса НА КАЖДОГО актора, которым это считалось раньше.
 */
export function territoryPressureAt(world: World, x: number, y: number, mine: TerritoryOwner): number {
  const bucket = crowdBucketAt(x, y);
  return crowdInBucket(world, bucket, mine) - crowdRivalsInBucket(world, bucket, mine);
}

function capturePatch(
  world: World,
  x: number,
  y: number,
  owner: TerritoryOwner,
  radius: number,
  cellBudget: number,
): number {
  let changed = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (changed >= cellBudget) return changed;
      if (dx * dx + dy * dy > radius * radius) continue;
      const idx = world.idx(x + dx, y + dy);
      if (!walkableForCapture(world.cells[idx])) continue;
      const prev = territoryOwnerAtIndex(world, idx);
      if (prev === owner || prev === ZoneFaction.SAMOSBOR) continue;
      const roomId = world.roomMap[idx];
      // Штаб теперь ПАДАЕТ: перекраску его клеток больше ничто не отменяет, но
      // комната запоминается, чтобы после патча сменить хозяина базы целиком.
      if (roomId >= 0 && world.rooms[roomId]?.type === RoomType.HQ && !captureHqScratch.has(roomId)) {
        captureHqScratch.set(roomId, territoryRoomOwner(world, roomId));
      }
      world.factionControl[idx] = owner;
      captureZonesScratch.add(world.zoneMap[idx]);
      changed++;
    }
  }
  return changed;
}

/**
 * Потеря земли — обида ЛИЧНАЯ. Матрица фракций глобальна и её по закону двигает
 * только игрок, поэтому рейд роняет личные отношения тех, кто эту землю потерял:
 * `isSideHostileToFaction` читает именно их, и чем больше людей потерпевшей
 * стороны считают обидчика врагом, тем вероятнее ответный рейд. Петля замыкается
 * без единого броска кубика.
 */
function applyTerritoryLoss(
  state: GameState | undefined,
  x: number,
  y: number,
  loser: TerritoryOwner,
  aggressor: TerritoryOwner,
  radius: number,
  delta: number,
): number {
  const loserFaction = territoryOwnerToFaction(loser);
  const aggressorFaction = territoryOwnerToFaction(aggressor);
  if (!state || loserFaction === null || aggressorFaction === null || loserFaction === aggressorFaction) return 0;
  let moved = 0;
  getEntityIndex().queryRadiusCapped(x, y, radius, captureQuery, ENTITY_MASK_NPC, LOSS_WITNESS_CAP);
  for (const other of captureQuery) {
    if (!other.alive || other.type !== EntityType.NPC) continue;
    if (other.faction !== loserFaction || other.alifeId === undefined) continue;
    if (addAlifeFactionAttitude(state, other.alifeId, aggressorFaction, delta) !== undefined) moved++;
  }
  captureQuery.length = 0;
  return moved;
}

/** База пала: комната остаётся штабом, но хозяин у неё другой. */
function reassignCapturedHq(
  world: World,
  state: GameState | undefined,
  roomId: number,
  previous: TerritoryOwner,
): boolean {
  const room = world.rooms[roomId];
  if (!room || room.type !== RoomType.HQ) return false;
  const owner = dominantTerritoryOwnerInRoom(world, roomId);
  if (owner === previous) return false;
  paintRoomOwner(world, room, owner);
  if (isGenericHqName(room.name)) room.name = territoryOwnerHqName(owner);
  const center = roomCenter(room);
  const witnesses = applyTerritoryLoss(
    state, center.x, center.y, previous, owner, HQ_LOSS_WITNESS_RADIUS, HQ_LOSS_ATTITUDE_DELTA,
  );
  captureZonesScratch.add(world.zoneMap[world.idx(center.x, center.y)]);
  if (!state) return true;
  publishEvent(state, {
    type: 'faction_event',
    zoneId: currentTerritoryZoneId(world, center.x, center.y),
    x: center.x,
    y: center.y,
    actorFaction: territoryOwnerToFaction(owner) ?? undefined,
    targetFaction: territoryOwnerToFaction(previous) ?? undefined,
    severity: 5,
    privacy: 'public',
    tags: ['faction_event', 'territory_capture', 'cell_territory', 'hq_lost'],
    data: {
      phase: 'hq_lost',
      name: 'Штаб сменил хозяина',
      text: `${room.name}: база перешла в другие руки.`,
      previousOwner: previous,
      owner,
      roomId,
      witnesses,
    },
  });
  return true;
}

function flushCapturedHqRooms(world: World, state: GameState | undefined): number {
  let fallen = 0;
  for (const [roomId, previous] of captureHqScratch) {
    if (reassignCapturedHq(world, state, roomId, previous)) fallen++;
  }
  captureHqScratch.clear();
  return fallen;
}

function flushCaptureZones(world: World): void {
  if (captureZonesScratch.size === 0) return;
  syncZoneMetadataFromTerritory(world, captureZonesScratch);
  captureZonesScratch.clear();
}

/**
 * Этот человек давит здесь и сейчас. **Второй вызов для драйва захвата:** пока
 * намерение активно, драйв зовёт это каждый свой такт, и присутствие становится
 * землёй. Кому удобнее объявить намерение и отдать такт системе — зовёт
 * `declareTerritoryPush`; сама эта функция объявление не спрашивает, потому что
 * её вызов и ЕСТЬ объявление.
 *
 * Ворот «боец / охота / путешественник» больше нет — они и делали захват
 * случайным. Осталось физическое: под ногами чужая проходимая земля, бакет
 * действительно фронт, и своих здесь больше чужих на `CAPTURE_MIN_PRESSURE`.
 * Последнее и есть требование ГРУППЫ: одиночка не переворачивает ничего,
 * сколько бы он ни ходил, а группа с общей целью собирается только рейдом.
 */
export function declareTerritoryPush(actor: Entity): void {
  if (pushSet.size >= CAPTURE_GLOBAL_CELL_CAP) return;
  pushSet.add(actor);
}

/** Сколько человек объявили захват своей целью прямо сейчас. Отладочный путь. */
export function declaredTerritoryPushCount(): number {
  return pushSet.size;
}

export function pressTerritory(world: World, state: GameState | undefined, actor: Entity): number {
  if (!actor.alive || actor.type !== EntityType.NPC || actor.faction === undefined) return 0;
  if (captureCellBudget <= 0) return 0;
  const mine = factionToTerritoryOwner(actor.faction);
  if (mine === ZoneFaction.SAMOSBOR) return 0;
  const x = Math.floor(actor.x);
  const y = Math.floor(actor.y);
  const idx = world.idx(x, y);
  const current = territoryOwnerAtIndex(world, idx);
  if (current === mine || current === ZoneFaction.SAMOSBOR) return 0;
  if (!walkableForCapture(world.cells[idx])) return 0;

  const front = frontByWorld.get(world);
  if (!front || front.builds === 0) return 0;
  const bucket = crowdBucketAt(x, y);
  const held = front.owner[bucket];
  // Чужая клетка внутри СВОЕГО бакета — не фронт, а шум: там давить нечего.
  if (held === mine || held === FRONT_SOLID || held === ZoneFaction.SAMOSBOR) return 0;
  if ((front.reach[bucket] & (1 << mine)) === 0) return 0;

  const pressure = territoryPressureAt(world, x, y, mine);
  if (pressure < CAPTURE_MIN_PRESSURE) return 0;
  const radius = Math.min(CAPTURE_RADIUS, 1 + Math.floor((pressure - CAPTURE_MIN_PRESSURE) / CAPTURE_MIN_PRESSURE));
  const changed = capturePatch(world, x, y, mine, radius, captureCellBudget);
  if (changed <= 0) return 0;
  captureCellBudget -= changed;
  const witnesses = applyTerritoryLoss(state, x, y, current, mine, LOSS_WITNESS_RADIUS, LOSS_ATTITUDE_DELTA);
  const fallen = flushCapturedHqRooms(world, state);

  if (state && capturePublished < CAPTURE_EVENT_LIMIT) {
    capturePublished++;
    publishEvent(state, {
      type: 'faction_event',
      zoneId: currentTerritoryZoneId(world, x, y),
      x: actor.x,
      y: actor.y,
      actorId: actor.id,
      actorName: actor.name,
      actorFaction: actor.faction,
      targetFaction: territoryOwnerToFaction(current) ?? undefined,
      severity: changed >= 24 ? 4 : 3,
      privacy: 'local',
      tags: ['faction_event', 'territory_capture', 'cell_territory'],
      data: {
        phase: 'territory_capture',
        name: 'Захват клеток',
        text: 'Фракция продавила локальный участок территории.',
        previousOwner: current,
        owner: mine,
        cells: changed,
        pressure,
        witnesses,
        hqFallen: fallen,
      },
    });
  }
  return changed;
}

export function updateTerritoryCapture(world: World, entities: Entity[], state: GameState | undefined, dt: number): number {
  captureAccum += dt;
  if (captureAccum < CAPTURE_INTERVAL_SEC) return 0;
  captureAccum -= CAPTURE_INTERVAL_SEC;
  captureClock += CAPTURE_INTERVAL_SEC;

  ensureEntityIndex(entities);
  const actors = getEntityIndex().actors;
  ensureCrowdIndex(world, actors, captureClock);
  ensureTerritoryFront(world, captureClock);

  captureCellBudget = CAPTURE_GLOBAL_CELL_CAP;
  capturePublished = 0;
  let changedCells = 0;
  for (const actor of pushSet) {
    if (captureCellBudget <= 0) break;
    changedCells += pressTerritory(world, state, actor);
  }
  pushSet.clear();
  flushCaptureZones(world);
  return changedCells;
}

export interface TerritoryFrontStats {
  builds: number;
  builtAt: number;
  /** Бакеты, которые для кого-то являются фронтом: чужая земля в досягаемости. */
  frontBuckets: number;
  byOwner: number[];
  hqBuckets: number;
  cellBudgetLeft: number;
}


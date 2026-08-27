/* ── Перевалка, слой 2: четыре микрорайона ────────────────────────
 *
 * ИДЕЯ. У яруса четыре хозяина, но до этого слоя у каждого было по две комнаты
 * во дворе, а всё остальное — общий бетон. Микрорайон и есть разница между
 * «четыре двери на выбор» и «четыре разных места»: у каждой базы своя
 * ПЛАНИРОВКА, а не свой цвет стены.
 *
 *   Дикие      — соты грибных камер вразбежку, лианы проулков, ни одной прямой;
 *   Гражданские— осевая анфилада: один зал переговоров, приёмные по обе стороны;
 *   Ликвидаторы— двусторонние коридоры и одинаковые ячейки журналов, ряд за рядом;
 *   Учёные     — вложенные чёрные кольца и тупиковые боксы, чем глубже, тем теснее.
 *
 * ЗАЧЕМ, КРОМЕ КРАСОТЫ. Расселение и A-Life работают по КОМНАТАМ и зонам: до
 * этого слоя у Перевалки было 34 комнаты на сто тысяч проходимых клеток, и
 * почти всё население этажа оседало в коридорах, потому что ему некуда было
 * сесть. Микрорайоны дают этажу сотню с лишним настоящих комнат с типом и
 * именем — и раздают их по владельцам, а не по географии.
 *
 * ВЛАДЕНИЕ. Каждая комната микрорайона несёт метку своей базы (`district:<id>`),
 * и по этой метке — а не по координатам — территорию красит
 * `reinforcePerevalkaAuthoredHqTerritory` уже ПОСЛЕ `initializeCellTerritory`.
 * Иначе общая раздача долей смывает авторскую принадлежность молча.
 *
 * СТАДИЯ. Сразу после дворов баз и слоя штабелей, ДО `generateZones` и
 * `ensureConnectivity`: слой режет геометрию. Кольцевая дорога микрорайона
 * ложится по кромке квартала и потому касается всех четырёх авеню сама —
 * прошивать связность нечем.
 */

import { Cell, DoorState, Feature, RoomType, Tex, type Room } from '../../core/types';
import { World } from '../../core/world';
import { irand, rng } from '../../core/rand';
import { stampRoom } from '../shared';
import { applyNamedRoom, type NamedRoomDef } from '../named_rooms';
import { PEREVALKA_BASES, type PerevalkaBaseId } from './meta';
import { perevalkaBlock } from './yard';

/** Ширина кольцевой дороги микрорайона. Две машины по встречной — четыре клетки. */
const RING = 4;
/** Ширина внутреннего проулка. Три клетки: разойтись можно, стрелять насквозь легко. */
const LANE = 3;

export interface PerevalkaDistrict {
  id: PerevalkaBaseId;
  x: number;
  y: number;
  w: number;
  h: number;
  rooms: Room[];
}

/** Квартал микрорайона: у каждой базы свой, и он соседний с её двором. */
const DISTRICT_BLOCKS: Record<PerevalkaBaseId, { bx: number; by: number }> = {
  wild: { bx: 1, by: 1 },
  citizen: { bx: 5, by: 1 },
  liquidator: { bx: 0, by: 4 },
  science: { bx: 6, by: 4 },
};

function carve(world: World, x: number, y: number, floorTex: Tex): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT || world.cells[i] === Cell.DOOR) return;
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = floorTex;
  world.features[i] = Feature.NONE;
}

function carveBand(world: World, x: number, y: number, w: number, h: number, floorTex: Tex): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) carve(world, x + dx, y + dy, floorTex);
  }
}

/** Кольцевая дорога по кромке квартала: касается всех четырёх авеню. */
function carveRingRoad(world: World, x: number, y: number, w: number, h: number, width: number, floorTex: Tex): void {
  carveBand(world, x, y, w, width, floorTex);
  carveBand(world, x, y + h - width, w, width, floorTex);
  carveBand(world, x, y, width, h, floorTex);
  carveBand(world, x + w - width, y, width, h, floorTex);
}

interface Palette {
  wall: Tex;
  floor: Tex;
  lane: Tex;
}

function stampDistrictRoom(
  world: World, out: Room[], id: PerevalkaBaseId, def: NamedRoomDef, alias: string,
  x: number, y: number, w: number, h: number, palette: Palette, tier?: number,
): Room {
  const room = stampRoom(world, world.rooms.length, def.type, x, y, w, h, -1);
  room.wallTex = palette.wall;
  room.floorTex = palette.floor;
  if (tier !== undefined) room.ceilingTier = tier;
  applyNamedRoom(room, alias, def);
  // Метка владельца: по ней территория возвращается базе после общей раздачи.
  room.tags = [...new Set([...(room.tags ?? []), `district:${id}`])];
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = palette.wall;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = palette.floor;
  }
  out.push(room);
  return room;
}

/**
 * Дверь в стене комнаты. Обе записи обязательны, иначе комната запечатана.
 *
 * `other` — вторая комната, если створка стоит в ОБЩЕЙ стене. Забыть её значит
 * оставить соседа без единой записи в `room.doors`: зал переговоров держался
 * ровно на этом и числился комнатой без входа, хотя четырнадцать дверей в его
 * стену вели.
 */
function hangDoor(world: World, room: Room, x: number, y: number, state = DoorState.CLOSED, other?: Room): void {
  const i = world.idx(x, y);
  world.cells[i] = Cell.DOOR;
  world.wallTex[i] = state === DoorState.HERMETIC_CLOSED || state === DoorState.HERMETIC_OPEN
    ? Tex.HERMO_WALL : Tex.DOOR_METAL;
  world.features[i] = Feature.NONE;
  world.roomMap[i] = -1;
  world.doors.set(i, { idx: i, state, roomA: room.id, roomB: other?.id ?? -1, keyId: '', timer: 0 });
  room.doors.push(i);
  other?.doors.push(i);
}

function scatterFeature(world: World, room: Room, feature: Feature, step: number): void {
  for (let dy = 2; dy < room.h - 1; dy += step) {
    for (let dx = 2; dx < room.w - 1; dx += step) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.FLOOR) world.features[i] = feature;
    }
  }
}

/* ── Дикие: соты грибных камер ────────────────────────────────────
 * Ряды камер идут ВРАЗБЕЖКУ, как кирпичная кладка, и сторона каждой камеры
 * своя. Прямой перспективы поэтому не возникает ни в одном направлении: улица
 * фермы всё время сбивается вбок, и это и есть её план. Часть слотов пустует —
 * там двор с грибницей, а не забытая комната. */
const FARM_ROOM: NamedRoomDef = { type: RoomType.PRODUCTION, name: 'Грибная камера', tags: ['perevalka', 'district', 'wild', 'mushroom'] };
const FARM_DRY: NamedRoomDef = { type: RoomType.STORAGE, name: 'Сушильня артели', tags: ['perevalka', 'district', 'wild', 'mushroom'] };
const FARM_LOCK: NamedRoomDef = { type: RoomType.MEDICAL, name: 'Споровой шлюз', tags: ['perevalka', 'district', 'wild', 'hermetic'] };

function buildWildDistrict(world: World, block: { x: number; y: number; w: number; h: number }): Room[] {
  const palette: Palette = { wall: Tex.ROTTEN, floor: Tex.F_GRASS, lane: Tex.F_CONCRETE };
  const rooms: Room[] = [];
  carveRingRoad(world, block.x, block.y, block.w, block.h, RING, palette.lane);

  const cellW = 16;
  const cellH = 12;
  const pitchX = cellW + LANE + 1;
  const pitchY = cellH + LANE + 1;
  const cols = Math.floor((block.w - RING * 2) / pitchX);
  const rows = Math.floor((block.h - RING * 2) / pitchY);

  // Проулки: сначала вся сетка прорублена, потом камеры штампуются в её ячейках.
  for (let r = 0; r <= rows; r++) {
    carveBand(world, block.x + RING, block.y + RING + r * pitchY, block.w - RING * 2, LANE, palette.lane);
  }
  for (let c = 0; c <= cols; c++) {
    carveBand(world, block.x + RING + c * pitchX, block.y + RING, LANE, block.h - RING * 2, palette.lane);
  }

  let serial = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Разбежка: чётный ряд сдвинут на треть шага, и ни одна улица не сквозная.
      const shift = r % 2 === 0 ? 0 : LANE + 1;
      const x = block.x + RING + c * pitchX + LANE + shift;
      const y = block.y + RING + r * pitchY + LANE;
      const w = irand(cellW - 5, cellW - 1);
      const h = irand(cellH - 3, cellH - 1);
      if (x + w + 2 > block.x + block.w - RING || y + h + 2 > block.y + block.h - RING) continue;
      if (rng() < 0.16) { // двор с грибницей вместо камеры
        carveBand(world, x, y, w, h, palette.floor);
        for (let n = 0; n < 5; n++) world.features[world.idx(x + 2 + n * 3, y + 2 + (n % 3))] = Feature.TREE;
        continue;
      }
      serial++;
      const room = stampDistrictRoom(
        world, rooms, 'wild',
        serial === 3 ? FARM_DRY : serial === 7 ? FARM_LOCK : FARM_ROOM,
        `perevalka_wild_cell_${serial}`, x, y, w, h, palette,
      );
      room.name = serial === 3 ? 'Сушильня артели' : serial === 7 ? 'Споровой шлюз' : `Грибная камера ${serial}`;
      // Дверь смотрит на СЕВЕРНЫЙ проулок, а не на западный: ряды идут
      // вразбежку, и у сдвинутого ряда западной стены проулок уже не касается —
      // створка оказывалась в глухом бетоне и снималась санацией.
      if (serial === 7) room.sealed = true;
      hangDoor(world, room, room.x + (w >> 1), room.y - 1,
        serial === 7 ? DoorState.HERMETIC_OPEN : DoorState.CLOSED);
      scatterFeature(world, room, serial === 3 ? Feature.SHELF : Feature.TREE, 4);
    }
  }
  return rooms;
}

/* ── Гражданские: осевая анфилада ─────────────────────────────────
 * Один зал, и всё остальное выходит в него. План читается за секунду и потому
 * годится для очереди: сюда приходят ждать, а не искать. Зал объявляет свой
 * потолок сам (ярус 4 — 3.0 м), приёмные молчат и выводятся. */
const PARLEY_HALL: NamedRoomDef = { type: RoomType.COMMON, name: 'Зал переговоров', tags: ['perevalka', 'district', 'citizen', 'parley'] };
const PARLEY_ROOM: NamedRoomDef = { type: RoomType.OFFICE, name: 'Приёмная', tags: ['perevalka', 'district', 'citizen'] };
const PARLEY_DESK: NamedRoomDef = { type: RoomType.OFFICE, name: 'Писарская', tags: ['perevalka', 'district', 'citizen'] };
const PARLEY_CORNER: NamedRoomDef = { type: RoomType.LIVING, name: 'Комната ожидания', tags: ['perevalka', 'district', 'citizen'] };
const HALL_TIER = 4;

function buildCitizenDistrict(world: World, block: { x: number; y: number; w: number; h: number }): Room[] {
  const palette: Palette = { wall: Tex.PANEL, floor: Tex.F_PARQUET, lane: Tex.F_LINO };
  const rooms: Room[] = [];
  carveRingRoad(world, block.x, block.y, block.w, block.h, RING, palette.lane);

  const hallW = block.w - RING * 2 - 4;
  const hallH = 18;
  const hallX = block.x + RING + 2;
  const hallY = block.y + ((block.h - hallH) >> 1);
  const hall = stampDistrictRoom(world, rooms, 'citizen', PARLEY_HALL, 'perevalka_citizen_parley_hall',
    hallX, hallY, hallW, hallH, { ...palette, floor: Tex.F_MARBLE_TILE }, HALL_TIER);
  hall.name = 'Зал переговоров Ариэль';
  for (let dx = 6; dx < hallW - 6; dx += 9) {
    world.features[world.idx(hall.x + dx, hall.y + 2)] = Feature.LAMP;
    world.features[world.idx(hall.x + dx, hall.y + hallH - 3)] = Feature.TABLE;
  }
  // Два входа с кольца — торцевые. Без них зал был бы островом: все остальные
  // его створки ведут в приёмные, а у приёмных второго выхода нет по замыслу.
  const westNotch = block.x + RING;
  const eastNotch = hall.x + hallW + 1;
  carveBand(world, westNotch, hallY + 6, hall.x - 1 - westNotch, 6, palette.lane);
  carveBand(world, eastNotch, hallY + 6, block.x + block.w - RING - eastNotch, 6, palette.lane);
  hangDoor(world, hall, hall.x - 1, hallY + 8, DoorState.OPEN);
  hangDoor(world, hall, hall.x + hallW, hallY + 8, DoorState.OPEN);

  // Приёмные по обе стороны зала: дверь ведёт прямо в зал, второго входа нет —
  // мимо стола Ариэль не пройдёшь, и это её дипломатия, выраженная планом.
  const roomW = 13;
  const roomH = 16;
  const pitch = roomW + 1;
  const count = Math.floor(hallW / pitch);
  let serial = 0;
  for (const side of [-1, 1] as const) {
    for (let c = 0; c < count; c++) {
      const x = hall.x + c * pitch;
      const y = side < 0 ? hall.y - 1 - roomH : hall.y + hallH + 1;
      if (y < block.y + RING || y + roomH > block.y + block.h - RING) continue;
      serial++;
      const room = stampDistrictRoom(world, rooms, 'citizen', PARLEY_ROOM,
        `perevalka_citizen_office_${serial}`, x, y, roomW, roomH, palette);
      room.name = `Приёмная ${serial}`;
      // Створка стоит в ОБЩЕЙ стене с залом, поэтому записывается обеим комнатам.
      hangDoor(world, room, room.x + (roomW >> 1), side < 0 ? room.y + roomH : room.y - 1,
        DoorState.CLOSED, hall);
      world.features[world.idx(room.x + 2, room.y + 2)] = Feature.DESK;
      world.features[world.idx(room.x + 4, room.y + 4)] = Feature.CHAIR;
    }
  }

  // Комнаты ожидания в углах квартала: очередь садится, не занимая зал.
  const cornerW = 18;
  const cornerH = 14;
  let corner = 0;
  for (const cx of [block.x + RING + 1, block.x + block.w - RING - 1 - cornerW] as const) {
    for (const north of [true, false] as const) {
      const cy = north ? block.y + RING + 1 : block.y + block.h - RING - 1 - cornerH;
      corner++;
      const room = stampDistrictRoom(world, rooms, 'citizen', corner === 1 ? PARLEY_DESK : PARLEY_CORNER,
        `perevalka_citizen_corner_${corner}`, cx, cy, cornerW, cornerH, palette);
      room.name = corner === 1 ? 'Писарская общины' : `Комната ожидания ${corner}`;
      // Дверь смотрит на ближнюю сторону кольца, а не на запад: у восточной
      // пары западная стена упирается в бетон между кольцом и залом.
      hangDoor(world, room, room.x + (cornerW >> 1), north ? room.y - 1 : room.y + cornerH);
      scatterFeature(world, room, Feature.CHAIR, 5);
    }
  }
  return rooms;
}

/* ── Ликвидаторы: двусторонние коридоры ───────────────────────────
 * Ячейки одинаковые и пронумерованные, ряд за рядом. Повтор здесь и есть
 * архитектура: застава считает груз, а не украшает себя. Заблудиться негде,
 * спрятаться тоже — прострел вдоль коридора идёт от стены до стены. */
const LEDGER_CELL: NamedRoomDef = { type: RoomType.OFFICE, name: 'Журнальная ячейка', tags: ['perevalka', 'district', 'liquidator', 'ledger'] };
const LEDGER_ARMS: NamedRoomDef = { type: RoomType.STORAGE, name: 'Оружейка заставы', tags: ['perevalka', 'district', 'liquidator'] };
const LEDGER_TALK: NamedRoomDef = { type: RoomType.HQ, name: 'Комната опроса', tags: ['perevalka', 'district', 'liquidator'] };
/** Полоса «ряд — коридор — ряд». Числа взяты от ячейки, а не наоборот. */
const CELL_W = 11;
const CELL_H = 12;
const SPINE = 4;
const BAND = CELL_H * 2 + SPINE + 3;

function buildLiquidatorDistrict(world: World, block: { x: number; y: number; w: number; h: number }): Room[] {
  const palette: Palette = { wall: Tex.METAL, floor: Tex.F_LINO, lane: Tex.F_CONCRETE };
  const rooms: Room[] = [];
  carveRingRoad(world, block.x, block.y, block.w, block.h, RING, palette.lane);

  const cols = Math.floor((block.w - RING * 2 - 2) / (CELL_W + 1));
  const bands = Math.floor((block.h - RING * 2 - 4) / BAND);
  let serial = 0;
  for (let b = 0; b < bands; b++) {
    const top = block.y + RING + 2 + b * BAND;
    // Коридор рубится во всю ширину квартала: оба конца выходят на кольцо.
    carveBand(world, block.x, top + CELL_H + 1, block.w, SPINE, palette.lane);
    for (const side of [0, 1] as const) {
      const roomY = side === 0 ? top : top + CELL_H + 1 + SPINE + 1;
      for (let c = 0; c < cols; c++) {
        const x = block.x + RING + 1 + c * (CELL_W + 1);
        serial++;
        const def = serial === 5 ? LEDGER_ARMS : serial === 11 ? LEDGER_TALK : LEDGER_CELL;
        const room = stampDistrictRoom(world, rooms, 'liquidator', def,
          `perevalka_liq_cell_${serial}`, x, roomY, CELL_W, CELL_H, palette);
        room.name = def === LEDGER_CELL ? `Журнальная ячейка ${serial}` : def.name;
        hangDoor(world, room, room.x + (CELL_W >> 1), side === 0 ? room.y + CELL_H : room.y - 1);
        world.features[world.idx(room.x + 2, room.y + 2)] = def === LEDGER_ARMS ? Feature.SHELF : Feature.DESK;
        world.features[world.idx(room.x + CELL_W - 3, room.y + CELL_H - 3)] = Feature.SHELF;
      }
    }
  }
  return rooms;
}

/* ── Учёные: вложенные чёрные кольца ──────────────────────────────
 * Чем глубже, тем теснее и тем меньше бокс. Радиальные проходы между кольцами
 * СМЕЩЕНЫ друг относительно друга, поэтому пройти насквозь одним ходом нельзя:
 * до центра идёшь по кругу, и на каждом круге мимо тупиков. Тьма здесь не
 * постпроцесс, а отсутствие ламп. */
const SHADOW_BOX: NamedRoomDef = { type: RoomType.MEDICAL, name: 'Бокс наблюдения', tags: ['perevalka', 'district', 'scientist', 'shadow'] };
const SHADOW_CORE: NamedRoomDef = { type: RoomType.MEDICAL, name: 'Внутренний бокс', tags: ['perevalka', 'district', 'scientist', 'shadow', 'hermetic'] };
const SHADOW_RINGS = [6, 30, 54] as const;
const SHADOW_RING_W = 4;

function buildScienceDistrict(world: World, block: { x: number; y: number; w: number; h: number }): Room[] {
  const palette: Palette = { wall: Tex.DARK, floor: Tex.F_CONCRETE, lane: Tex.F_CONCRETE };
  const rooms: Room[] = [];
  carveRingRoad(world, block.x, block.y, block.w, block.h, RING, palette.lane);

  SHADOW_RINGS.forEach((inset, level) => {
    const side = block.w - inset * 2;
    carveRingRoad(world, block.x + inset, block.y + inset, side, side, SHADOW_RING_W, palette.lane);
    /* Сбойка внутрь — ровно одна на кольцо, и она в УГЛУ. Середину каждой
     * стороны занимают тупиковые боксы; сбойка по середине была бы замурована
     * их стенами вместе с половиной тенеловки (замерено: семь комнат вне
     * связности). Чётное кольцо пускает внутрь на северо-западе, нечётное на
     * юго-востоке — поэтому между кольцами всегда полкруга пути мимо тупиков. */
    const prev = level === 0 ? 0 : SHADOW_RINGS[level - 1];
    const outer = prev + (level === 0 ? RING : SHADOW_RING_W) - 1;
    const inner = inset + SHADOW_RING_W - 1;
    const nw = level % 2 === 0;
    carveBand(world,
      block.x + (nw ? outer : block.w - 1 - inner),
      block.y + (nw ? inset - SHADOW_RING_W + 1 : block.h - 1 - inset),
      inner - outer + 1, SHADOW_RING_W, palette.lane);
  });

  const boxSizes = [16, 13] as const;
  let serial = 0;
  boxSizes.forEach((size, level) => {
    const inner = SHADOW_RINGS[level] + SHADOW_RING_W + 1;
    const span = block.w - inner * 2;
    const pitch = size + 2;
    const count = Math.floor(span / pitch);
    const start = block.x + inner + ((span - count * pitch) >> 1);
    for (const north of [true, false] as const) {
      for (let c = 0; c < count; c++) {
        const x = start + c * pitch;
        const y = north ? block.y + inner : block.y + block.h - inner - size;
        if (y < block.y || y + size > block.y + block.h) continue;
        serial++;
        const room = stampDistrictRoom(world, rooms, 'science', SHADOW_BOX,
          `perevalka_shadow_box_${serial}`, x, y, size, size, palette);
        room.name = `Бокс наблюдения ${serial}`;
        hangDoor(world, room, room.x + (size >> 1), north ? room.y - 1 : room.y + size);
        world.features[world.idx(room.x + 2, room.y + 2)] = Feature.APPARATUS;
      }
    }
  });

  const coreInset = SHADOW_RINGS[2] + SHADOW_RING_W + 1;
  const coreSide = block.w - coreInset * 2;
  const core = stampDistrictRoom(world, rooms, 'science', SHADOW_CORE, 'perevalka_shadow_core',
    block.x + coreInset, block.y + coreInset, coreSide, coreSide, palette, 0);
  core.name = 'Внутренний бокс тенеловки';
  core.sealed = true;
  hangDoor(world, core, core.x + (coreSide >> 1), core.y - 1, DoorState.HERMETIC_OPEN);
  scatterFeature(world, core, Feature.APPARATUS, 5);
  return rooms;
}

const BUILDERS: Record<PerevalkaBaseId, (world: World, block: { x: number; y: number; w: number; h: number }) => Room[]> = {
  wild: buildWildDistrict,
  citizen: buildCitizenDistrict,
  liquidator: buildLiquidatorDistrict,
  science: buildScienceDistrict,
};

/** Точка входа слоя. */
export function buildPerevalkaDistricts(world: World): PerevalkaDistrict[] {
  return PEREVALKA_BASES.map(spec => {
    const at = DISTRICT_BLOCKS[spec.id];
    const block = perevalkaBlock(at.bx, at.by);
    return { id: spec.id, x: block.x, y: block.y, w: block.w, h: block.h, rooms: BUILDERS[spec.id](world, block) };
  });
}

/** Метка владельца на комнате микрорайона. Читается территорией после раздачи долей. */
export function districtOwnerTag(id: PerevalkaBaseId): string {
  return `district:${id}`;
}

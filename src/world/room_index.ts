import { W, type Room, type RoomType } from '../core/types';
import type { World } from '../core/world';

/* ── Локальный индекс комнат ───────────────────────────────────────
 *
 * Комната стоит на месте всю жизнь этажа, а спрашивают о ней трое: человек на
 * решении («куда пойти отсюда»), квест («где здесь комната такого типа/имени»)
 * и производство. Все трое спрашивали перебором ВСЕХ комнат этажа, а этаж —
 * это до 13873 комнат: на квартирах утилити-FSM платил этот перебор на каждое
 * решение каждого NPC, то есть миллионы проверок в секунду.
 *
 * Здесь три проекции того же списка: по бакетам тора того же шага, что у сетки
 * сущностей и ящиков (спросили про радиус — обошли клетки вокруг себя), по типу
 * и по стабильному ключу имени (`defId`, иначе `name`).
 *
 * Пересборка ленивая и по признакам самого мира — ровно как у
 * `container_index.ts`: ссылка на массив, длина и `cellVersion`. Своего флага
 * грязи нет намеренно, чтобы не полагаться на дисциплину вызова.
 */

const BUCKET_SHIFT = 4; // 16 клеток — тот же шаг, что у бакетов сущностей и ящиков
const BUCKETS_PER_AXIS = W >> BUCKET_SHIFT;
const BUCKET_MASK = BUCKETS_PER_AXIS - 1;

interface RoomIndex {
  source: readonly (Room | undefined)[];
  length: number;
  cellVersion: number;
  buckets: (number[] | undefined)[];
  byType: Map<RoomType, number[]>;
  byDefKey: Map<string, number[]>;
}

const EMPTY_IDS: readonly number[] = [];
const indexByWorld = new WeakMap<World, RoomIndex>();

/** Центр комнаты — та же точка, по которой её меряют все потребители. */
function centerX(room: Room): number {
  return room.x + room.w * 0.5;
}

function centerY(room: Room): number {
  return room.y + room.h * 0.5;
}

/** Стабильный адрес комнаты для квестов: авторский `defId`, иначе имя. */
export function roomDefKey(room: Room): string {
  return room.defId || room.name;
}

function ensureIndex(world: World): RoomIndex {
  const rooms = world.rooms as readonly (Room | undefined)[];
  const cached = indexByWorld.get(world);
  if (cached
    && cached.source === rooms
    && cached.length === rooms.length
    && cached.cellVersion === world.cellVersion) return cached;

  const buckets: (number[] | undefined)[] = new Array(BUCKETS_PER_AXIS * BUCKETS_PER_AXIS);
  const byType = new Map<RoomType, number[]>();
  const byDefKey = new Map<string, number[]>();
  for (const room of rooms) {
    if (!room) continue;
    const bi = ((Math.floor(centerY(room)) >> BUCKET_SHIFT) & BUCKET_MASK) * BUCKETS_PER_AXIS
      + ((Math.floor(centerX(room)) >> BUCKET_SHIFT) & BUCKET_MASK);
    const bucket = buckets[bi];
    if (bucket) bucket.push(room.id); else buckets[bi] = [room.id];
    const typed = byType.get(room.type);
    if (typed) typed.push(room.id); else byType.set(room.type, [room.id]);
    const key = roomDefKey(room);
    if (!key) continue;
    const named = byDefKey.get(key);
    if (named) named.push(room.id); else byDefKey.set(key, [room.id]);
  }
  const index: RoomIndex = {
    source: rooms,
    length: rooms.length,
    cellVersion: world.cellVersion,
    buckets,
    byType,
    byDefKey,
  };
  indexByWorld.set(world, index);
  return index;
}

/** Комнаты одного типа. Порядок — как в `world.rooms`. */
export function roomIdsOfType(world: World, type: RoomType): readonly number[] {
  return ensureIndex(world).byType.get(type) ?? EMPTY_IDS;
}

/**
 * Комнаты с этим стабильным адресом (`defId`, иначе `name`). Порядок — как в
 * `world.rooms`.
 */
export function roomIdsOfDefKey(world: World, key: string): readonly number[] {
  if (!key) return EMPTY_IDS;
  return ensureIndex(world).byDefKey.get(key) ?? EMPTY_IDS;
}

/**
 * Номера комнат, чей ЦЕНТР лежит в квадрате бакетов, покрывающем радиус.
 * Это НАДМНОЖЕСТВО круга: точную проверку расстояния делает вызывающий — он и
 * так её делает, и считать её здесь значило бы считать дважды. Заполняется
 * массив вызывающего, возвращается число записанных номеров.
 */
export function roomIdsAroundInto(
  world: World,
  x: number,
  y: number,
  radius: number,
  out: number[],
): number {
  const { buckets } = ensureIndex(world);
  let found = 0;
  const minBX = Math.floor(x - radius) >> BUCKET_SHIFT;
  const minBY = Math.floor(y - radius) >> BUCKET_SHIFT;
  const spanX = Math.min(BUCKETS_PER_AXIS, (Math.floor(x + radius) >> BUCKET_SHIFT) - minBX + 1);
  const spanY = Math.min(BUCKETS_PER_AXIS, (Math.floor(y + radius) >> BUCKET_SHIFT) - minBY + 1);
  for (let iy = 0; iy < spanY; iy++) {
    const row = ((minBY + iy) & BUCKET_MASK) * BUCKETS_PER_AXIS;
    for (let ix = 0; ix < spanX; ix++) {
      const bucket = buckets[row + ((minBX + ix) & BUCKET_MASK)];
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) out[found++] = bucket[i];
    }
  }
  out.length = found;
  return found;
}

/** Покрывает ли квадрат бакетов вокруг радиуса весь тор (тогда индекс не экономит). */
export function roomRadiusCoversFloor(radius: number): boolean {
  return !Number.isFinite(radius) || radius * 2 >= W - (1 << BUCKET_SHIFT);
}

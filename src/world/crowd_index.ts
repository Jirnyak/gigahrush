import { EntityType, Faction, W, ZoneFaction, type Entity, type TerritoryOwner } from '../core/types';
import type { World } from '../core/world';
import { TERRITORY_OWNER_SLOTS, factionToTerritoryOwner } from '../data/factions';

/* ── Индекс скоплений ──────────────────────────────────────────────
 *
 * «Где сколько людей какой фракции» спрашивают двое, и оба — на решении, а не
 * на кадре: тварь выбирает, на какое скопление охотиться, и человек выбирает,
 * куда идти давить чужую территорию. Понятия скопления в рантайме не было
 * вовсе: единственная перепись людей по комнатам жила приватно внутри AI и не
 * знала про фракции, а всё остальное считало соседей радиусным запросом НА
 * КАЖДОГО актора — то есть платило население в квадрате.
 *
 * Здесь одна перепись на весь этаж за такт, в трёх проекциях того же списка:
 * по бакетам тора шага 16 (тот же шаг, что у сущностей, комнат и ящиков), по
 * комнате и общим итогом на этаж. Спросить стоит одно чтение массива.
 *
 * Поле восприятия `PEOPLE` (`systems/fields/`) отвечает на другой вопрос —
 * «в какой стороне этажа гуще», градиентом и без разбивки. Здесь наоборот:
 * точное число и обязательно по хозяину, потому что решение «свои или чужие»
 * без разбивки не выражается. Дублирования нет, есть разделение труда.
 *
 * Пересборка по времени, а не по признакам мира: акторы двигаются каждый кадр,
 * ссылочного признака «толпа изменилась» не существует. Каданс общий на всех
 * потребителей, поэтому лишний спрашивающий не стоит ничего.
 */

const BUCKET_SHIFT = 4; // 16 клеток — тот же шаг, что у бакетов сущностей, комнат и ящиков
const BUCKETS_PER_AXIS = W >> BUCKET_SHIFT;
const BUCKET_MASK = BUCKETS_PER_AXIS - 1;
const BUCKET_COUNT = BUCKETS_PER_AXIS * BUCKETS_PER_AXIS;

/** Такт переписи. Реже, чем решение актора, — и это намеренно: скопление это
 *  медленная величина, а перепись стоит один проход по акторам. */
export const CROWD_INDEX_REBUILD_SEC = 1;

/** Сторона бакета в клетках и число бакетов по оси. Отдаются наружу, чтобы у
 *  фронта территории не завелось второй сетки того же шага. */
export const CROWD_BUCKET_SIZE = 1 << BUCKET_SHIFT;
export const CROWD_BUCKETS_PER_AXIS = BUCKETS_PER_AXIS;

export interface CrowdIndexStats {
  builds: number;
  builtAt: number;
  people: number;
  beasts: number;
  occupiedBuckets: number;
  occupiedRooms: number;
  byOwner: number[];
}

interface CrowdIndex {
  builtAt: number;
  builds: number;
  /** BUCKET_COUNT × TERRITORY_OWNER_SLOTS, люди по хозяину клетки-бакета. */
  people: Uint16Array;
  /** BUCKET_COUNT, звери без разбивки: у экологии хозяина нет. */
  beasts: Uint16Array;
  totals: Uint32Array;
  /** Комнаты, где кто-то стоит. Массивы переиспользуются между переписями:
   *  иначе на каждом такте рождались бы сотни короткоживущих счётчиков. */
  byRoom: Map<number, Uint16Array>;
  peopleTotal: number;
  beastTotal: number;
  occupiedBuckets: number;
}

const EMPTY_COUNTS = new Uint16Array(TERRITORY_OWNER_SLOTS);
const indexByWorld = new WeakMap<World, CrowdIndex>();

function bucketOf(x: number, y: number): number {
  return ((Math.floor(y) >> BUCKET_SHIFT) & BUCKET_MASK) * BUCKETS_PER_AXIS
    + ((Math.floor(x) >> BUCKET_SHIFT) & BUCKET_MASK);
}

function createIndex(): CrowdIndex {
  return {
    builtAt: -Infinity,
    builds: 0,
    people: new Uint16Array(BUCKET_COUNT * TERRITORY_OWNER_SLOTS),
    beasts: new Uint16Array(BUCKET_COUNT),
    totals: new Uint32Array(TERRITORY_OWNER_SLOTS),
    byRoom: new Map(),
    peopleTotal: 0,
    beastTotal: 0,
    occupiedBuckets: 0,
  };
}

function indexOf(world: World): CrowdIndex {
  let index = indexByWorld.get(world);
  if (!index) {
    index = createIndex();
    indexByWorld.set(world, index);
  }
  return index;
}

function roomCounts(index: CrowdIndex, roomId: number): Uint16Array {
  let counts = index.byRoom.get(roomId);
  if (!counts) {
    counts = new Uint16Array(TERRITORY_OWNER_SLOTS);
    index.byRoom.set(roomId, counts);
  }
  return counts;
}

function ownerOf(actor: Entity): TerritoryOwner {
  return factionToTerritoryOwner(actor.faction ?? Faction.CITIZEN);
}

/**
 * Перепись, если её такт истёк. Зовётся кем угодно и сколько угодно раз: такт
 * общий, и второй спрашивающий за тот же такт не стоит ничего.
 */
export function ensureCrowdIndex(world: World, actors: readonly Entity[], time: number): void {
  const index = indexOf(world);
  if (time - index.builtAt < CROWD_INDEX_REBUILD_SEC) return;
  rebuildCrowdIndex(world, actors, time);
}

/** Перепись безусловно. Нужна тестам и отладке; игра зовёт `ensureCrowdIndex`. */
export function rebuildCrowdIndex(world: World, actors: readonly Entity[], time: number): void {
  const index = indexOf(world);
  index.builtAt = time;
  index.builds++;
  index.people.fill(0);
  index.beasts.fill(0);
  index.totals.fill(0);
  for (const counts of index.byRoom.values()) counts.fill(0);
  index.peopleTotal = 0;
  index.beastTotal = 0;

  for (const actor of actors) {
    if (!actor.alive) continue;
    const bucket = bucketOf(actor.x, actor.y);
    if (actor.type === EntityType.MONSTER) {
      index.beasts[bucket]++;
      index.beastTotal++;
      continue;
    }
    if (actor.type !== EntityType.NPC) continue;
    const owner = ownerOf(actor);
    index.people[bucket * TERRITORY_OWNER_SLOTS + owner]++;
    index.totals[owner]++;
    index.peopleTotal++;
    const roomId = world.roomMap[world.idx(Math.floor(actor.x), Math.floor(actor.y))];
    if (roomId >= 0) roomCounts(index, roomId)[owner]++;
  }

  let occupied = 0;
  for (let b = 0; b < BUCKET_COUNT; b++) {
    if (index.beasts[b] > 0) { occupied++; continue; }
    const base = b * TERRITORY_OWNER_SLOTS;
    for (let owner = 0; owner < TERRITORY_OWNER_SLOTS; owner++) {
      if (index.people[base + owner] > 0) { occupied++; break; }
    }
  }
  index.occupiedBuckets = occupied;
}

/** Номер бакета скоплений для клетки мира. Общий адрес для всех запросов. */
export function crowdBucketAt(x: number, y: number): number {
  return bucketOf(x, y);
}

export function crowdBucketCount(): number {
  return BUCKET_COUNT;
}

/** Центр бакета в клетках мира — точка, к которой ведёт маршрут. */
export function crowdBucketCenter(bucket: number, out: { x: number; y: number }): void {
  const half = 1 << (BUCKET_SHIFT - 1);
  out.x = ((bucket % BUCKETS_PER_AXIS) << BUCKET_SHIFT) + half;
  out.y = (((bucket / BUCKETS_PER_AXIS) | 0) << BUCKET_SHIFT) + half;
}

/** Людей этого хозяина в бакете под точкой. */
export function crowdAt(world: World, x: number, y: number, owner: TerritoryOwner): number {
  return indexOf(world).people[bucketOf(x, y) * TERRITORY_OWNER_SLOTS + owner] ?? 0;
}

/** Людей этого хозяина в бакете по его номеру. */
export function crowdInBucket(world: World, bucket: number, owner: TerritoryOwner): number {
  return indexOf(world).people[bucket * TERRITORY_OWNER_SLOTS + owner] ?? 0;
}

/** Все люди бакета, без разбивки. */
export function crowdTotalInBucket(world: World, bucket: number): number {
  const people = indexOf(world).people;
  const base = bucket * TERRITORY_OWNER_SLOTS;
  let total = 0;
  for (let owner = 0; owner < TERRITORY_OWNER_SLOTS; owner++) total += people[base + owner];
  return total;
}

/** Люди чужих хозяев в бакете: свои минус все. */
export function crowdRivalsInBucket(world: World, bucket: number, owner: TerritoryOwner): number {
  return crowdTotalInBucket(world, bucket) - crowdInBucket(world, bucket, owner);
}

/** Звери в бакете под точкой. Экология стороны не имеет — одно число. */
export function beastsAt(world: World, x: number, y: number): number {
  return indexOf(world).beasts[bucketOf(x, y)] ?? 0;
}

export function beastsInBucket(world: World, bucket: number): number {
  return indexOf(world).beasts[bucket] ?? 0;
}

/** Кого в бакете больше всех. Ничья решается порядком хозяев — детерминированно. */
export function dominantCrowdOwnerInBucket(world: World, bucket: number): TerritoryOwner {
  const people = indexOf(world).people;
  const base = bucket * TERRITORY_OWNER_SLOTS;
  let best: TerritoryOwner = ZoneFaction.CITIZEN;
  let bestCount = 0;
  for (let owner = 0; owner < TERRITORY_OWNER_SLOTS; owner++) {
    const count = people[base + owner];
    if (count > bestCount) {
      bestCount = count;
      best = owner as TerritoryOwner;
    }
  }
  return best;
}

/** Перепись комнаты по хозяину. Пустая комната отдаёт общий нулевой срез. */
export function crowdInRoom(world: World, roomId: number): Readonly<Uint16Array> {
  if (roomId < 0) return EMPTY_COUNTS;
  return indexOf(world).byRoom.get(roomId) ?? EMPTY_COUNTS;
}

/** Всего людей в комнате. */
export function crowdRoomTotal(world: World, roomId: number): number {
  const counts = crowdInRoom(world, roomId);
  let total = 0;
  for (let owner = 0; owner < TERRITORY_OWNER_SLOTS; owner++) total += counts[owner];
  return total;
}

/** Отладочный путь: что видит индекс прямо сейчас. */
export function crowdIndexStats(world: World): CrowdIndexStats {
  const index = indexOf(world);
  let occupiedRooms = 0;
  for (const counts of index.byRoom.values()) {
    for (let owner = 0; owner < TERRITORY_OWNER_SLOTS; owner++) {
      if (counts[owner] > 0) { occupiedRooms++; break; }
    }
  }
  return {
    builds: index.builds,
    builtAt: index.builtAt,
    people: index.peopleTotal,
    beasts: index.beastTotal,
    occupiedBuckets: index.occupiedBuckets,
    occupiedRooms,
    byOwner: [...index.totals],
  };
}

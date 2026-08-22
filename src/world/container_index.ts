import { W, type WorldContainer } from '../core/types';
import type { World } from '../core/world';

/* ── Локальный индекс ящиков ───────────────────────────────────────
 *
 * Ящик стоит на месте всю жизнь этажа, а спрашивают о нём двое: человек на
 * смене («куда отнести, где взять») и рендер («что нарисовать вокруг»). Оба
 * спрашивали перебором всего списка этажа — человек ещё и на каждом кадре, что
 * и съедало четверть кадра в министерстве.
 *
 * Здесь две проекции того же списка: по комнате (спросили про свою комнату —
 * получили её ящики) и по бакетам тора того же шага, что у сетки сущностей
 * (спросили про радиус — обошли клетки вокруг себя). Перебора всего этажа не
 * остаётся ни в одном горячем пути.
 *
 * Пересборка ленивая и по признакам самого мира: удаления ящиков везде идут
 * через `containers = containers.filter(...)`, то есть меняют ССЫЛКУ на массив,
 * добавления — `push`, то есть длину; самосбор двигает комнаты под ящиками и
 * бампает `cellVersion`. Трёх этих признаков хватает, чтобы не заводить ещё
 * один флаг грязи и не полагаться на дисциплину вызова.
 */

const BUCKET_SHIFT = 4; // 16 клеток — тот же шаг, что у бакетов сущностей
const BUCKETS_PER_AXIS = W >> BUCKET_SHIFT;
const BUCKET_MASK = BUCKETS_PER_AXIS - 1;

interface ContainerIndex {
  source: readonly WorldContainer[];
  length: number;
  cellVersion: number;
  buckets: (WorldContainer[] | undefined)[];
  byRoom: Map<number, WorldContainer[]>;
}

const EMPTY: readonly WorldContainer[] = [];
const indexByWorld = new WeakMap<World, ContainerIndex>();

function bucketOf(x: number, y: number): number {
  return ((Math.floor(y) >> BUCKET_SHIFT) & BUCKET_MASK) * BUCKETS_PER_AXIS
    + ((Math.floor(x) >> BUCKET_SHIFT) & BUCKET_MASK);
}

function ensureIndex(world: World): ContainerIndex {
  const cached = indexByWorld.get(world);
  if (cached
    && cached.source === world.containers
    && cached.length === world.containers.length
    && cached.cellVersion === world.cellVersion) return cached;

  const buckets: (WorldContainer[] | undefined)[] = new Array(BUCKETS_PER_AXIS * BUCKETS_PER_AXIS);
  const byRoom = new Map<number, WorldContainer[]>();
  for (const container of world.containers) {
    const bi = bucketOf(container.x, container.y);
    const bucket = buckets[bi];
    if (bucket) bucket.push(container); else buckets[bi] = [container];
    if (container.roomId < 0) continue;
    const room = byRoom.get(container.roomId);
    if (room) room.push(container); else byRoom.set(container.roomId, [container]);
  }
  const index: ContainerIndex = {
    source: world.containers,
    length: world.containers.length,
    cellVersion: world.cellVersion,
    buckets,
    byRoom,
  };
  indexByWorld.set(world, index);
  return index;
}

/** Ящики одной комнаты. Порядок — как в `world.containers`. */
export function containersInRoom(world: World, roomId: number): readonly WorldContainer[] {
  if (roomId < 0) return EMPTY;
  return ensureIndex(world).byRoom.get(roomId) ?? EMPTY;
}

/**
 * Ящики в радиусе от точки, по клеткам тора. `visit` получает квадрат
 * расстояния, чтобы не считать его второй раз.
 */
export function forEachContainerNear(
  world: World,
  x: number,
  y: number,
  radius: number,
  visit: (container: WorldContainer, dist2: number) => void,
): void {
  const { buckets } = ensureIndex(world);
  const r2 = radius * radius;
  const minBX = (Math.floor(x - radius)) >> BUCKET_SHIFT;
  const minBY = (Math.floor(y - radius)) >> BUCKET_SHIFT;
  const spanX = Math.min(BUCKETS_PER_AXIS, ((Math.floor(x + radius)) >> BUCKET_SHIFT) - minBX + 1);
  const spanY = Math.min(BUCKETS_PER_AXIS, ((Math.floor(y + radius)) >> BUCKET_SHIFT) - minBY + 1);
  for (let iy = 0; iy < spanY; iy++) {
    const row = ((minBY + iy) & BUCKET_MASK) * BUCKETS_PER_AXIS;
    for (let ix = 0; ix < spanX; ix++) {
      const bucket = buckets[row + ((minBX + ix) & BUCKET_MASK)];
      if (!bucket) continue;
      for (const container of bucket) {
        const d2 = world.dist2(x, y, container.x, container.y);
        if (d2 <= r2) visit(container, d2);
      }
    }
  }
}

/**
 * Ближайший ящик в радиусе, который принимает `accept`. Проверка вызывается
 * только на кандидатах, которые уже ближе найденного: она бывает дорогой
 * (доступ, содержимое, место под груз), и платить за неё за весь радиус незачем.
 */
export function nearestContainer(
  world: World,
  x: number,
  y: number,
  radius: number,
  accept: (container: WorldContainer) => boolean,
): WorldContainer | undefined {
  let best: WorldContainer | undefined;
  let bestDist = Infinity;
  forEachContainerNear(world, x, y, radius, (container, d2) => {
    if (d2 >= bestDist || !accept(container)) return;
    bestDist = d2;
    best = container;
  });
  return best;
}

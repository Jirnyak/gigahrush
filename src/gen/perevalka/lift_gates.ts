/* ── Перевалка: лифты вниз внутри баз ─────────────────────────────
 *
 * Замысел этажа: спуск с яруса стоит решённого вопроса с ОДНОЙ из четырёх баз.
 * Значит каждый лифт вниз обязан лежать за дверью, которую открывает ключ базы.
 *
 * Где лежат лифты — не решение этажа. Их ставит единая система шахт
 * (`world/route_lifts.ts`) на шаге манифеста ПОСЛЕ всех авторских хуков
 * территории, и последнее слово о лифтах принадлежит ей. Поэтому обнос идёт в
 * `onAfterPopulate`: это первый хук этажа, который видит уже поставленные
 * шахты. Читаем, куда они легли, и обносим — не двигаем, не добавляем, не
 * удаляем.
 *
 * Периметр тамбура — ОБЫЧНЫЙ бетон: ни `aptMask`, ни гермостены. Они дают
 * иммунитет к пробивному заряду и вырезали бы четвёртый путь игрока. Связность
 * при этом не рвётся: `classifyReachabilityCell` считает `LOCKED` проходимой с
 * пометкой `gated by key`, то есть замок виден как замок, а не как стена.
 */

import { Cell, DoorState, Feature, LiftDirection, RoomType, Tex, W, type Room } from '../../core/types';
import { World, classifyReachabilityCell } from '../../core/world';
import { stampRoom } from '../shared';
import { applyNamedRoom } from '../named_rooms';
import { BASE_HQ_H, BASE_HQ_W, PEREVALKA_BASES, type PerevalkaBaseSpec } from './meta';

/** Половина стороны тамбура. Ужимается, если рядом чужой лифт. */
const GATE_RADIUS = 4;
const GATE_MIN_RADIUS = 1;
/** Насколько далеко ищется проходимое, чтобы прорубить подход к двери. */
const APPROACH_SEARCH = 96;

export interface PerevalkaLiftGate {
  idx: number;
  x: number;
  y: number;
  baseId: string;
  keyId: string;
  doorIdx: number;
  roomId: number;
  radius: number;
  /** Клетка снаружи, к которой прорублен подход: она заведомо ходибельная. */
  approachX: number;
  approachY: number;
}

export interface PerevalkaLiftGateReport {
  gates: PerevalkaLiftGate[];
  /** Лифты вниз, которые не удалось обнести: рядом стоит лифт вверх. */
  conflicts: number[];
  downLifts: number;
  /** Сколько кусков двора пришлось пришить обратно после обноса. */
  repairedComponents: number;
}

function cellsOfDirection(world: World, direction: LiftDirection): number[] {
  const out: number[] = [];
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT && world.liftDir[i] === direction) out.push(i);
  }
  return out;
}

function chebyshev(world: World, ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(world.delta(ax, bx)), Math.abs(world.delta(ay, by)));
}

function baseCenter(spec: PerevalkaBaseSpec): { x: number; y: number } {
  return { x: spec.x + (BASE_HQ_W >> 1), y: spec.y + (BASE_HQ_H >> 1) };
}

/**
 * Кто держит какой лифт. Четыре базы равнозначны, поэтому раздача не просто
 * «кто ближе»: пары «лифт—база» перебираются от ближней к дальней, и база
 * берёт лифт, пока не набрала свою долю. Так шестнадцать шахт ложатся 4/4/4/4
 * без жребия и без зависимости от того, куда сел конкретный лифт.
 */
export function assignLiftsToBases(world: World, lifts: readonly number[]): Map<number, PerevalkaBaseSpec> {
  const quota = Math.ceil(lifts.length / PEREVALKA_BASES.length);
  const pairs: Array<{ lift: number; base: number; d: number }> = [];
  for (const lift of lifts) {
    const lx = lift % W;
    const ly = (lift / W) | 0;
    PEREVALKA_BASES.forEach((spec, base) => {
      const c = baseCenter(spec);
      pairs.push({ lift, base, d: world.dist2(lx, ly, c.x, c.y) });
    });
  }
  pairs.sort((a, b) => (a.d - b.d) || (a.lift - b.lift) || (a.base - b.base));
  const taken = new Map<number, PerevalkaBaseSpec>();
  const counts = new Array(PEREVALKA_BASES.length).fill(0);
  for (const pair of pairs) {
    if (taken.has(pair.lift) || counts[pair.base] >= quota) continue;
    taken.set(pair.lift, PEREVALKA_BASES[pair.base]);
    counts[pair.base]++;
  }
  // Остаток (если квоты не сошлись) уходит ближайшей базе без ограничения.
  for (const pair of pairs) {
    if (!taken.has(pair.lift)) taken.set(pair.lift, PEREVALKA_BASES[pair.base]);
  }
  return taken;
}

function carveApproachCell(world: World, x: number, y: number): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT || world.cells[i] === Cell.DOOR) return;
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = Tex.F_CONCRETE;
  world.wallTex[i] = Tex.CONCRETE;
  world.features[i] = Feature.NONE;
}

/** Ближайшая проходимая клетка снаружи тамбура: к ней прорубается подход. */
function nearestOutsideWalkable(world: World, lx: number, ly: number, radius: number): { x: number; y: number } | null {
  for (let r = radius + 2; r <= APPROACH_SEARCH; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = world.wrap(lx + dx);
        const y = world.wrap(ly + dy);
        const cell = world.cells[world.idx(x, y)];
        if (cell === Cell.FLOOR || cell === Cell.WATER) return { x, y };
      }
    }
  }
  return null;
}

function buildGate(
  world: World,
  liftIdx: number,
  spec: PerevalkaBaseSpec,
  radius: number,
  ordinal: number,
): PerevalkaLiftGate | null {
  const lx = liftIdx % W;
  const ly = (liftIdx / W) | 0;
  const target = nearestOutsideWalkable(world, lx, ly, radius);
  if (!target) return null;

  // Прежние двери внутри пятна снимаются: их комнаты сюда больше не выходят.
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const i = world.idx(lx + dx, ly + dy);
      if (world.doors.has(i)) world.removeDoorAt(i);
    }
  }

  const liftDir = world.liftDir[liftIdx];
  const room = stampRoom(world, world.rooms.length, RoomType.CORRIDOR, lx - radius, ly - radius, radius * 2 + 1, radius * 2 + 1, -1);
  room.wallTex = Tex.METAL;
  room.floorTex = Tex.F_CONCRETE;
  applyNamedRoom(room, `perevalka_lift_gate_${ordinal}`, {
    type: RoomType.CORRIDOR,
    name: `Лифтовой тамбур: ${spec.title}`,
    tags: ['perevalka', 'lift_gate', spec.id],
  });
  // Клетка лифта — не пол комнаты: `stampRoom` вырубает прямоугольник целиком,
  // возвращаем шахту на место ровно такой, какой её поставила система.
  world.cells[liftIdx] = Cell.LIFT;
  world.roomMap[liftIdx] = -1;
  world.wallTex[liftIdx] = Tex.LIFT_DOOR;
  world.features[liftIdx] = Feature.NONE;
  world.liftDir[liftIdx] = liftDir;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const i = world.idx(lx + dx, ly + dy);
      if (world.cells[i] === Cell.FLOOR) {
        world.floorTex[i] = Tex.F_CONCRETE;
        world.features[i] = Feature.NONE;
      }
    }
  }
  const buttonIdx = world.idx(lx + 1, ly);
  if (world.cells[buttonIdx] === Cell.FLOOR) {
    world.features[buttonIdx] = Feature.LIFT_BUTTON;
    world.liftDir[buttonIdx] = liftDir;
  }

  // Дверь ставится на ту сторону, куда смотрит найденное проходимое: проём
  // получает стены по перпендикуляру, пол внутри и подход снаружи.
  const ddx = world.delta(lx, target.x);
  const ddy = world.delta(ly, target.y);
  const horizontal = Math.abs(ddx) >= Math.abs(ddy);
  const sx = horizontal ? Math.sign(ddx) || 1 : 0;
  const sy = horizontal ? 0 : Math.sign(ddy) || 1;
  const doorX = world.wrap(lx + sx * (radius + 1));
  const doorY = world.wrap(ly + sy * (radius + 1));
  const doorIdx = world.idx(doorX, doorY);

  // Подход: сначала по своей оси наружу до уровня цели, потом по второй.
  let cx = world.wrap(doorX + sx);
  let cy = world.wrap(doorY + sy);
  carveApproachCell(world, cx, cy);
  const stepX = Math.sign(world.delta(cx, target.x));
  for (let guard = 0; guard < W && cx !== target.x; guard++) {
    cx = world.wrap(cx + stepX);
    if (chebyshev(world, cx, cy, lx, ly) <= radius + 1) break;
    carveApproachCell(world, cx, cy);
  }
  const stepY = Math.sign(world.delta(cy, target.y));
  for (let guard = 0; guard < W && cy !== target.y; guard++) {
    cy = world.wrap(cy + stepY);
    if (chebyshev(world, cx, cy, lx, ly) <= radius + 1) break;
    carveApproachCell(world, cx, cy);
  }

  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = Tex.DOOR_METAL;
  world.features[doorIdx] = Feature.NONE;
  world.roomMap[doorIdx] = -1;
  // Ключ задан строкой явно: дефолт `door.keyId || 'key'` открыл бы тамбур
  // обычным ключом и обесценил бы все четыре пути игрока разом.
  world.doors.set(doorIdx, { idx: doorIdx, state: DoorState.LOCKED, roomA: room.id, roomB: -1, keyId: spec.keyId, timer: 0 });
  room.doors.push(doorIdx);

  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      world.factionControl[world.idx(lx + dx, ly + dy)] = spec.owner;
    }
  }

  return {
    idx: liftIdx, x: lx, y: ly,
    baseId: spec.id, keyId: spec.keyId,
    doorIdx, roomId: room.id, radius,
    approachX: target.x, approachY: target.y,
  };
}

/* ── Пришивание двора после обноса ────────────────────────────────
 *
 * Тамбур 9×9 садится там, где лёг лифт, и иногда перерезает грузовую авеню
 * поперёк. Решётка двора кольцевая, и обычно разрез ничего не отрезает, но
 * тупиковые ветки — подходы шахт и въезды баз — отрезаются. Замерено: по одному
 * куску в 165–245 клеток на каждый сид, и один лифт вверх оказывался в кармане,
 * ведущем только внутрь чужой базы, то есть приехавший сверху игрок вставал бы
 * запертым.
 *
 * Общий `ensureConnectivity` здесь звать нельзя: он прошьёт кратчайшим путём,
 * а кратчайший путь идёт сквозь стену тамбура — замок бы вскрылся сам. Поэтому
 * своё пришивание, у которого клетки тамбуров неприкосновенны.
 */
function reachableMask(world: World, startIdx: number): Uint8Array {
  const seen = new Uint8Array(W * W);
  if (!classifyReachabilityCell(world, startIdx).passable) return seen;
  const queue = [startIdx];
  seen[startIdx] = 1;
  for (let head = 0; head < queue.length; head++) {
    const ci = queue[head];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = world.idx(x + dx, y + dy);
      if (seen[ni] || !classifyReachabilityCell(world, ni).passable) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

/** Прошить кусок двора к достижимому, обходя тамбуры: волна идёт и сквозь
 *  бетон, но не сквозь замок, а прорубается только пройденный обратный путь. */
function stitchComponent(world: World, from: number, reached: Uint8Array, blocked: Uint8Array): boolean {
  const parent = new Map<number, number>();
  const queue = [from];
  parent.set(from, -1);
  for (let head = 0; head < queue.length && head < 200000; head++) {
    const ci = queue[head];
    if (reached[ci] && ci !== from) {
      for (let step = ci; step !== -1 && step !== from; step = parent.get(step) ?? -1) {
        if (!reached[step]) carveApproachCell(world, step % W, (step / W) | 0);
      }
      return true;
    }
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = world.idx(x + dx, y + dy);
      if (parent.has(ni) || blocked[ni]) continue;
      if (world.cells[ni] === Cell.LIFT || world.cells[ni] === Cell.ABYSS) continue;
      parent.set(ni, ci);
      queue.push(ni);
    }
  }
  return false;
}

function repairYardAfterGates(world: World, spawnIdx: number, gates: readonly PerevalkaLiftGate[]): number {
  const blocked = new Uint8Array(W * W);
  for (const gate of gates) {
    for (let dy = -gate.radius - 1; dy <= gate.radius + 1; dy++) {
      for (let dx = -gate.radius - 1; dx <= gate.radius + 1; dx++) {
        blocked[world.idx(gate.x + dx, gate.y + dy)] = 1;
      }
    }
  }
  let repaired = 0;
  for (let pass = 0; pass < 8; pass++) {
    const reached = reachableMask(world, spawnIdx);
    let orphan = -1;
    for (let i = 0; i < W * W; i++) {
      if (reached[i] || blocked[i]) continue;
      if (world.cells[i] !== Cell.FLOOR && world.cells[i] !== Cell.WATER) continue;
      orphan = i;
      break;
    }
    if (orphan < 0) break;
    if (!stitchComponent(world, orphan, reached, blocked)) break;
    repaired++;
  }
  return repaired;
}

/**
 * Обнести все лифты вниз тамбурами баз. Зовётся из `onAfterPopulate`, то есть
 * после `stampRouteLiftShafts` и после расселения, но до доставки авторских
 * людей — держатели ключей приходят уже в готовый этаж.
 */
export function encloseDownLiftsInPerevalkaBases(world: World, spawnX: number, spawnY: number): PerevalkaLiftGateReport {
  const down = cellsOfDirection(world, LiftDirection.DOWN);
  const foreign = cellsOfDirection(world, LiftDirection.UP);
  const owners = assignLiftsToBases(world, down);
  const gates: PerevalkaLiftGate[] = [];
  const conflicts: number[] = [];

  down.forEach((liftIdx, ordinal) => {
    const spec = owners.get(liftIdx);
    if (!spec) return;
    const lx = liftIdx % W;
    const ly = (liftIdx / W) | 0;
    const others = [...foreign, ...down.filter(i => i !== liftIdx)];
    let radius = GATE_RADIUS;
    // Чужой лифт внутри тамбура или в его стене — приговор: игрок, приехавший
    // сверху, оказался бы заперт внутри базы вместе с целью. Ужимаем, пока
    // чужая шахта не окажется снаружи с запасом в клетку.
    while (radius >= GATE_MIN_RADIUS
      && others.some(i => chebyshev(world, i % W, (i / W) | 0, lx, ly) <= radius + 2)) radius--;
    if (radius < GATE_MIN_RADIUS) { conflicts.push(liftIdx); return; }
    const gate = buildGate(world, liftIdx, spec, radius, ordinal);
    if (gate) gates.push(gate); else conflicts.push(liftIdx);
  });

  const repairedComponents = repairYardAfterGates(world, world.idx(Math.floor(spawnX), Math.floor(spawnY)), gates);

  // Геометрия изменилась после общего бэйка генератора — свет пересчитывается
  // здесь же, на загрузке этажа, а не в рантайме.
  world.bakeLights();
  return { gates, conflicts, downLifts: down.length, repairedComponents };
}

/** Отчёт последнего обноса на этот мир: нужен тестам и отладке. */
export const perevalkaGatesByWorld = new WeakMap<World, PerevalkaLiftGateReport>();

export function perevalkaLiftGateRooms(world: World): Room[] {
  return world.rooms.filter(room => room?.defId?.startsWith('perevalka_lift_gate_'));
}

import { Cell, Feature, msg, type Entity, type GameState } from '../../core/types';
import { World } from '../../core/world';
import { RUNTIME_TOPOLOGY_LIMITS } from '../../data/runtime_topology';
import { isPlayerEntity } from '../player_actor';

interface SnakeRuntime {
  path: Int32Array;
  body: Int32Array;
  base: Uint8Array;
  controlIdx: number;
  head: number;
  length: number;
  direction: 1 | -1;
  stepSeconds: number;
  stepAccum: number;
  warnedUntil: number;
  stoppedUntil: number;
  lastMsgTime: number;
}

interface SnakeFieldRuntime {
  snakes: SnakeRuntime[];
}

const WALL_SNAKE_RE = /\[wall_snake:(-?\d+),(-?\d+),(\d+),(\d+)\]/g;
const snakeByWorld = new WeakMap<World, SnakeFieldRuntime | null>();

function hash32(v: number): number {
  v |= 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d);
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b);
  v ^= v >>> 16;
  return v >>> 0;
}

function perimeterPoint(world: World, x0: number, y0: number, w: number, h: number, step: number): number {
  const len = Math.max(1, (w + h) * 2 - 4);
  let t = ((step % len) + len) % len;
  if (t < w) return world.idx(x0 + t, y0);
  t -= w;
  if (t < h - 1) return world.idx(x0 + w - 1, y0 + 1 + t);
  t -= h - 1;
  if (t < w - 1) return world.idx(x0 + w - 2 - t, y0 + h - 1);
  t -= w - 1;
  return world.idx(x0, y0 + h - 2 - t);
}

function mutableSnakeCell(world: World, ci: number): boolean {
  const cell = world.cells[ci] as Cell;
  if (cell !== Cell.FLOOR && cell !== Cell.WATER) return false;
  if (world.hermoWall[ci] !== 0 || world.aptMask[ci] !== 0 || world.doors.has(ci) || world.containerMap.has(ci)) return false;
  const feature = world.features[ci] as Feature;
  return feature === Feature.NONE || feature === Feature.LAMP;
}

function initSnake(world: World): SnakeFieldRuntime | null {
  const cached = snakeByWorld.get(world);
  if (cached !== undefined) return cached;

  const snakes: SnakeRuntime[] = [];
  const seen = new Set<string>();
  for (const room of world.rooms) {
    WALL_SNAKE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WALL_SNAKE_RE.exec(room.name)) !== null) {
      if (snakes.length >= RUNTIME_TOPOLOGY_LIMITS.wallSnakeMaxSnakes) break;
      const x0 = Number(match[1]);
      const y0 = Number(match[2]);
      const w = Number(match[3]);
      const h = Number(match[4]);
      const key = `${x0}:${y0}:${w}:${h}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const perimeter = Math.max(0, Math.min(RUNTIME_TOPOLOGY_LIMITS.wallSnakeMaxPathCells, (w + h) * 2 - 4));
      if (perimeter < 18) continue;
      const controlIdx = perimeterPoint(world, x0, y0, w, h, 0);
      const pathCells: number[] = [];
      const baseCells: number[] = [];
      for (let i = 0; i < perimeter; i++) {
        const ci = perimeterPoint(world, x0, y0, w, h, i);
        if (!mutableSnakeCell(world, ci)) continue;
        pathCells.push(ci);
        baseCells.push(world.cells[ci]);
      }
      const count = pathCells.length;
      if (count < 18) continue;
      const path = Int32Array.from(pathCells);
      const base = Uint8Array.from(baseCells);
      const body = new Int32Array(Math.min(RUNTIME_TOPOLOGY_LIMITS.wallSnakeMaxBodyCells, Math.max(12, 8 + Math.floor(count / 5))));
      const length = Math.min(body.length, 10 + Math.floor(count / 9));
      const snakeSeed = hash32(
        Math.imul(x0 + 1024, 73856093)
          ^ Math.imul(y0 + 1024, 19349663)
          ^ Math.imul(w, 83492791)
          ^ Math.imul(h, 2654435761)
          ^ snakes.length,
      );
      const direction: 1 | -1 = (snakeSeed & 1) === 0 ? 1 : -1;
      const stepSeconds = 0.24 + ((snakeSeed >>> 8) % 21) * 0.011 + Math.min(0.08, count * 0.0006);
      for (let i = 0; i < length; i++) {
        const pi = (count - direction * i) % count;
        body[i] = pi;
        world.cells[path[pi]] = Cell.WALL;
      }
      snakes.push({
        path,
        body,
        base,
        controlIdx,
        head: 0,
        length,
        direction,
        stepSeconds,
        stepAccum: ((snakeSeed >>> 16) / 0xffff) * stepSeconds,
        warnedUntil: 0,
        stoppedUntil: 0,
        lastMsgTime: -Infinity,
      });
    }
    if (snakes.length >= RUNTIME_TOPOLOGY_LIMITS.wallSnakeMaxSnakes) break;
  }

  if (snakes.length === 0) {
    snakeByWorld.set(world, null);
    return null;
  }

  world.markCellsDirty();
  const runtime = { snakes };
  snakeByWorld.set(world, runtime);
  return runtime;
}

function bodyContains(snake: SnakeRuntime, pathIndex: number): boolean {
  for (let i = 0; i < snake.length; i++) {
    if (snake.body[i] === pathIndex) return true;
  }
  return false;
}

function snakeBodyAtCell(snake: SnakeRuntime, idx: number): boolean {
  for (let i = 0; i < snake.length; i++) {
    if (snake.path[snake.body[i]] === idx) return true;
  }
  return false;
}

function restoreTail(world: World, snake: SnakeRuntime): void {
  const tailSlot = snake.length - 1;
  const tailPathIndex = snake.body[tailSlot];
  if (tailPathIndex < 0) return;
  const ci = snake.path[tailPathIndex];
  world.cells[ci] = snake.base[tailPathIndex] as Cell;
}

function pushHead(world: World, snake: SnakeRuntime, nextHead: number): void {
  restoreTail(world, snake);
  for (let i = snake.length - 1; i > 0; i--) snake.body[i] = snake.body[i - 1];
  snake.body[0] = nextHead;
  snake.head = nextHead;
  world.cells[snake.path[nextHead]] = Cell.WALL;
  world.markCellsDirty();
}

function shrinkSnake(world: World, snake: SnakeRuntime, nextLength: number): void {
  const clamped = Math.max(6, Math.min(snake.length, nextLength));
  for (let i = clamped; i < snake.length; i++) {
    const pathIndex = snake.body[i];
    world.cells[snake.path[pathIndex]] = snake.base[pathIndex] as Cell;
  }
  snake.length = clamped;
  world.markCellsDirty();
}

function playerOnPath(world: World, snake: SnakeRuntime, player: Entity, pathIndex: number): boolean {
  const ci = snake.path[pathIndex];
  return world.idx(Math.floor(player.x), Math.floor(player.y)) === ci;
}

function wallSnakeControlAt(world: World, snake: SnakeRuntime, lookIdx: number): boolean {
  return snake.controlIdx === lookIdx && (world.features[lookIdx] as Feature) === Feature.SCREEN;
}

function findSnakeTarget(world: World, runtime: SnakeFieldRuntime, lookIdx: number): SnakeRuntime | null {
  for (const snake of runtime.snakes) {
    if (wallSnakeControlAt(world, snake, lookIdx) || snakeBodyAtCell(snake, lookIdx)) return snake;
  }
  return null;
}

function hurtPlayer(player: Entity, state: GameState, amount: number): void {
  player.hp = Math.max(1, (player.hp ?? 100) - amount);
  if (player.needs) player.needs.sleep = Math.max(0, player.needs.sleep - amount * 0.15);
  state.msgs.push(msg(`Змейка давит бетонным боком: -${amount} HP. Ждите хвост или клиньте экран.`, state.time, '#f84'));
}

export function updateWallSnakeAnomaly(world: World, player: Entity, state: GameState, dt: number): void {
  if (!isPlayerEntity(player)) return;
  const runtime = initSnake(world);
  if (!runtime || runtime.snakes.length === 0) return;

  for (const snake of runtime.snakes) {
    if (state.time < snake.stoppedUntil) continue;
    for (let i = 0; i < snake.length; i++) {
      if (playerOnPath(world, snake, player, snake.body[i])) {
        if (state.time >= snake.warnedUntil) hurtPlayer(player, state, 3);
        return;
      }
    }
  }

  for (const snake of runtime.snakes) {
    if (state.time < snake.stoppedUntil) continue;
    snake.stepAccum += dt;
    if (snake.stepAccum < snake.stepSeconds) continue;
    snake.stepAccum %= snake.stepSeconds;

    let nextHead = (snake.head + snake.direction + snake.path.length) % snake.path.length;
    for (let turn = 0; turn < 4 && bodyContains(snake, nextHead); turn++) {
      nextHead = (nextHead + snake.direction + snake.path.length) % snake.path.length;
    }

    if (playerOnPath(world, snake, player, nextHead)) {
      if (state.time < snake.warnedUntil) {
        hurtPlayer(player, state, 9);
      } else {
        snake.warnedUntil = state.time + snake.stepSeconds * 1.8;
        if (state.time - snake.lastMsgTime > 3) {
          snake.lastMsgTime = state.time;
          state.msgs.push(msg('Голова змейки смотрит прямо сюда. Есть один шаг, чтобы уйти.', state.time, '#fa4'));
        }
      }
      return;
    }

    pushHead(world, snake, nextHead);
  }
}

function removeOne(player: Entity, ids: readonly string[]): string {
  const inv = player.inventory;
  if (!inv) return '';
  for (const id of ids) {
    const item = inv.find(v => v.defId === id && v.count > 0);
    if (!item) continue;
    item.count--;
    if (item.count <= 0) inv.splice(inv.indexOf(item), 1);
    return id;
  }
  return '';
}

export function tryUseWallSnakeAnomaly(world: World, player: Entity, state: GameState, lookX: number, lookY: number): boolean {
  const runtime = initSnake(world);
  if (!runtime) return false;
  const lookIdx = world.idx(Math.floor(lookX), Math.floor(lookY));
  const snake = findSnakeTarget(world, runtime, lookIdx);
  const closeEnough = world.dist2(player.x, player.y, lookX, lookY) <= 5.8;
  if (!snake || !closeEnough) return false;

  const bait = removeOne(player, ['gear', 'spring', 'metal_sheet', 'bread', 'mushroom_mass']);
  if (bait) {
    snake.stoppedUntil = Math.max(snake.stoppedUntil, state.time + 7);
    shrinkSnake(world, snake, snake.length - 2);
    state.msgs.push(msg('Приманка ушла в экран. Змейка застряла и укоротилась.', state.time, '#8cf'));
  } else {
    snake.stoppedUntil = Math.max(snake.stoppedUntil, state.time + 2.5);
    state.msgs.push(msg('Экран щелкнул пустым зубом. Нужна железка, еда или грибная масса.', state.time, '#fa4'));
  }
  return true;
}

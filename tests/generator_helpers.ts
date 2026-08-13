import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { Cell, LiftDirection, W } from '../src/core/types';
import type { World } from '../src/core/world';
import { makeProceduralFloorSpec, type ProceduralFloorSpec } from '../src/data/procedural_floors';
import type { FloorGeneration } from '../src/gen/floor_manifest';

interface GeneratorTiming {
  label: string;
  ms: number;
}

const generatorTimings: GeneratorTiming[] = [];
const RUN_GENERATION_MATRIX = process.env.GIGAHRUSH_GENERATION_MATRIX === '1';
const GENERATION_SKIP_REASON = 'run npm run test:generation for the full generation matrix';

const ORTHO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Первый прогонный этаж, на котором сходятся условия сцены.
 *
 * Прибивать координату `(n, z)` нельзя: геометрия, большинство и пятёрка
 * lootBias тянутся жребием из пулов по тегам, поэтому любой новый элемент пула
 * сдвигает раздачу и тест краснеет, хотя сцена цела. Контракт авторского
 * схрона — «где условия совпали, он есть», а не «он на этаже 1/-34».
 */
export function findProceduralSpec(
  match: (spec: ProceduralFloorSpec) => boolean,
  label: string,
): ProceduralFloorSpec {
  for (let n = 1; n <= 96; n++) {
    for (let z = -31; z >= -127; z--) {
      const spec = makeProceduralFloorSpec(n, z);
      if (match(spec)) return spec;
    }
  }
  throw new Error(`no procedural floor satisfies ${label}`);
}

export function timeFloorGeneration<T extends FloorGeneration>(label: string, fn: () => T): T {
  const startedAt = process.hrtime.bigint();
  try {
    return fn();
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    generatorTimings.push({ label, ms: elapsedMs });
  }
}

export function printSlowestFloorGenerators(limit = 8): void {
  if (generatorTimings.length === 0) return;
  const slowest = [...generatorTimings].sort((a, b) => b.ms - a.ms).slice(0, limit);
  const totalMs = generatorTimings.reduce((sum, item) => sum + item.ms, 0);
  console.log(`Generation timing: ${generatorTimings.length} floor generator calls, total ${totalMs.toFixed(1)}ms, slowest ${slowest.length}:`);
  for (const item of slowest) console.log(`- ${item.ms.toFixed(1)}ms ${item.label}`);
}

export function testGenerationMatrix(name: string, fn: () => void): void {
  test(name, { skip: RUN_GENERATION_MATRIX ? false : GENERATION_SKIP_REASON }, fn);
}

/** Сторона блока покрытия: карта делится на 8x8 блоков по 128x128 клеток. */
const FOOTPRINT_BLOCK = 128;

function playableCoverage(world: World): { count: number; emptyBlocks: number; blocks: number } {
  const side = W / FOOTPRINT_BLOCK;
  const grid = new Uint8Array(side * side);
  let count = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const cell = world.cells[world.idx(x, y)];
      if (cell !== Cell.FLOOR && cell !== Cell.WATER && cell !== Cell.DOOR && cell !== Cell.LIFT) continue;
      count++;
      grid[((y / FOOTPRINT_BLOCK) | 0) * side + ((x / FOOTPRINT_BLOCK) | 0)] = 1;
    }
  }
  let emptyBlocks = 0;
  for (const value of grid) if (!value) emptyBlocks++;
  return { count, emptyBlocks, blocks: side * side };
}

export function assertFullFootprint(world: World, label: string): void {
  // Граница: этаж маршрута занимает весь тор 1024x1024, а не остров в середине
  // карты — это и есть контракт расширения до полного этажа.
  //
  // Раньше граница проверялась углами bbox (minX===0 && maxX===W-1). Это пин
  // микросостояния и вдобавок неверен на торе: одна случайная клетка в столбце
  // 0 закрывала проверку целиком, а глухая полоса в 44 столбца у шва её роняла
  // (dark_metro: minX=44 при 936 занятых столбцах из 1024 и 0 пустых блоков) —
  // хотя этаж карту покрывает. Сплошная стена у шва тора не отличима от стены
  // в любом другом месте: у тора нет края, к которому можно прижаться.
  //
  // Инвариант вместо пина: ни один из 64 блоков 128x128 (1/64 карты) не остаётся
  // полностью глухим. Остров в центре карты по-прежнему валит проверку — у него
  // пустует весь внешний обод блоков.
  const coverage = playableCoverage(world);
  assert.equal(coverage.emptyBlocks, 0, `${label} footprint: ${coverage.emptyBlocks}/${coverage.blocks} blocks 128x128 have no playable cell`);
  assert.equal(coverage.count >= 18_000, true, `${label} playable cells ${coverage.count}`);
}

export function reachableCells(gen: FloorGeneration): Uint8Array {
  const world = gen.world;
  const out = new Uint8Array(W * W);
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  const start = world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY));
  out[start] = 1;
  queue[tail++] = start;

  while (head < tail) {
    const ci = queue[head++];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of ORTHO_DIRS) {
      const ni = world.idx(x + dx, y + dy);
      if (out[ni]) continue;
      if (world.cells[ni] !== Cell.FLOOR && world.cells[ni] !== Cell.DOOR && world.cells[ni] !== Cell.WATER) continue;
      out[ni] = 1;
      queue[tail++] = ni;
    }
  }

  return out;
}

export function hasReachableLift(gen: FloorGeneration, reachable: Uint8Array, direction: LiftDirection): boolean {
  const world = gen.world;
  for (let i = 0; i < world.cells.length; i++) {
    if (world.cells[i] !== Cell.LIFT || world.liftDir[i] !== direction) continue;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of ORTHO_DIRS) {
      if (reachable[world.idx(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

export function assertReachableRouteLifts(gen: FloorGeneration, label: string): Uint8Array {
  const spawnCell = gen.world.cells[gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY))];
  assert.equal(spawnCell, Cell.FLOOR, `${label} spawn floor`);
  const reachable = reachableCells(gen);
  assert.equal(hasReachableLift(gen, reachable, LiftDirection.UP), true, `${label} reachable up lift`);
  assert.equal(hasReachableLift(gen, reachable, LiftDirection.DOWN), true, `${label} reachable down lift`);
  return reachable;
}

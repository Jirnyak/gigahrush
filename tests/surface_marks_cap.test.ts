import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell } from '../src/core/types';
import { SURFACE_FLAG_CHALK_MAP, World } from '../src/core/world';
import {
  MarkType,
  SURFACE_MAP_MAX_CELLS,
  stampMark,
  stampLocalMark,
} from '../src/systems/surface_marks';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

/* Замок на хранилище плоских следов.
 *
 * Потолок здесь про ПАМЯТЬ: килобайт на клетку. Про рендер он был раньше, и это
 * была ошибка — атлас держит тысячу плиток, но кандидатов в него отбирают по
 * дальности, а не берут всё подряд, поэтому размер карты следов ему безразличен.
 *
 * Главное правило, которое тут запирается: дойдя до потолка, уходит САМОЕ
 * ДАЛЬНЕЕ от свежего следа, а не самое старое. Правило «старое вон» держало
 * потолок ровно так же и потому выглядело безобидным, но на бою рушило картину:
 * сотня дерущихся забивала карту за секунды, и дальше каждый брызг стирал кровь,
 * которой секунда от роду. Лужи пропадали на глазах.
 */

function floodFarAway(world: World, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = 2 + (i % 500);
    const y = 2 + Math.floor(i / 500) * 2;
    // stampLocalMark пишет ровно в одну клетку — чистый источник разных клеток.
    stampLocalMark(world, x, y, 0.5, 0.5, 0.2, MarkType.DRIP, i * 131 + 7, 200, 180, 30, 200);
  }
}

test('ambient surface marks never grow the map past the memory cap', () => {
  const world = openWorld();
  floodFarAway(world, SURFACE_MAP_MAX_CELLS + 2048);
  assert.ok(
    world.surfaceMap.size <= SURFACE_MAP_MAX_CELLS,
    `surfaceMap grew to ${world.surfaceMap.size}, expected <= ${SURFACE_MAP_MAX_CELLS}`,
  );
});

test('eviction preserves functional (flagged) cells', () => {
  const world = openWorld();
  // Пометим функциональную клетку первой, чтобы она была САМОЙ СТАРОЙ записью.
  const chalkCi = world.idx(1, 1);
  world.surfaceFlags[chalkCi] = SURFACE_FLAG_CHALK_MAP;
  stampLocalMark(world, 1, 1, 0.5, 0.5, 0.2, MarkType.MARONARY, 999, 60, 200, 60, 220);
  assert.equal(world.surfaceMap.has(chalkCi), true);

  floodFarAway(world, SURFACE_MAP_MAX_CELLS + 2048);

  assert.ok(world.surfaceMap.size <= SURFACE_MAP_MAX_CELLS);
  assert.equal(
    world.surfaceMap.has(chalkCi),
    true,
    'functional flagged surface cell must not be evicted',
  );
});

test('a heavy local fight keeps all of its blood', () => {
  const world = openWorld();
  // Зал пролога и его окрестности во время боя на сотню человек: несколько тысяч
  // разных заляпанных клеток. Прежний потолок в тысячу срезал их на ходу, и лужи
  // пропадали у зрителя на глазах — ровно эта жалоба.
  const FIGHT_SIDE = 64;
  const fightCells: number[] = [];
  for (let dy = 0; dy < FIGHT_SIDE; dy++) {
    for (let dx = 0; dx < FIGHT_SIDE; dx++) {
      const x = 400 + dx;
      const y = 400 + dy;
      stampLocalMark(world, x, y, 0.5, 0.5, 0.2, MarkType.SPLAT, (dy * FIGHT_SIDE + dx) * 7 + 1, 170, 20, 20, 220);
      fightCells.push(world.idx(x, y));
    }
  }

  const survived = fightCells.filter(ci => world.surfaceMap.has(ci)).length;
  assert.equal(
    survived,
    fightCells.length,
    `кровь боя пережила только ${survived} клеток из ${fightCells.length}`,
  );
});

test('the map holds far more than the render atlas can show at once', () => {
  // Атлас держит тысячу плиток, но отбирает в них ближние к камере сам. Хранилище
  // ему не подчиняется: следы — это память, а память здесь дешёвая.
  const world = openWorld();
  const RENDER_ATLAS_SLOTS = 1024;
  floodFarAway(world, RENDER_ATLAS_SLOTS * 4);
  assert.ok(
    world.surfaceMap.size > RENDER_ATLAS_SLOTS * 3,
    `в карте осталось ${world.surfaceMap.size} клеток — хранилище всё ещё меряется размером атласа`,
  );
});

test('multi-cell splats still stay within the cap under heavy accumulation', () => {
  const world = openWorld();
  for (let i = 0; i < SURFACE_MAP_MAX_CELLS + 2048; i++) {
    const x = 5 + (i % 480);
    const y = 5 + Math.floor(i / 480) * 3;
    // Larger radius touches a 3x3-ish neighborhood per stamp.
    stampMark(world, x, y, 0.5, 0.5, 0.6, MarkType.SPLAT, i * 173 + 3, 180, 20, 20, 200);
  }
  assert.ok(
    world.surfaceMap.size <= SURFACE_MAP_MAX_CELLS,
    `surfaceMap grew to ${world.surfaceMap.size}, expected <= ${SURFACE_MAP_MAX_CELLS}`,
  );
});

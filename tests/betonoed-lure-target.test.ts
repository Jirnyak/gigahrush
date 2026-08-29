/* Замок на приманку бетоноеда.
 *
 * Авторская встреча зовёт тварь к слабой стене приказом `AIGoal.GOTO`. До
 * 2026-08-29 приказ адресовали в саму стену (`weakX/weakY`), а она
 * `Cell.WALL` по построению — дороги туда нет ни у кого, и приказ гасился по
 * ветке `not_found` в тот же кадр. Приманка не работала даже после того, как
 * канал приказов ожил: канал был жив, адрес — мёртв.
 *
 * Замок стережёт ОБЕ клетки разом, потому что поодиночке они ничего не значат:
 * стена обязана остаться стеной (иначе пролом бессмысленен), а подход обязан
 * быть проходимым (иначе звать некуда).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { Cell } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { summarizeBetonoedShortcut } from '../src/gen/maintenance/betonoed_shortcut';

/** Коллекторы. Числовой `z` — канон маршрута, см. `DESIGN_FLOOR_ROUTES`. */
const COLLECTORS_Z = -26;
const SEEDS = [1, 61061, 4242];

function parseSummary(line: string): { weak: [number, number]; approach: [number, number] } | undefined {
  const weak = /weak=(-?\d+),(-?\d+)/.exec(line);
  const approach = /approach=(-?\d+),(-?\d+)/.exec(line);
  if (!weak || !approach) return undefined;
  return {
    weak: [Number(weak[1]), Number(weak[2])],
    approach: [Number(approach[1]), Number(approach[2])],
  };
}

test('приказ зовёт бетоноеда к ПРОХОДИМОЙ клетке перед проломом, а не в саму стену', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    seedGlobalRng(0xa5e1 + seed);
    initFactionRelations();
    const gen = generateFloor(COLLECTORS_Z, seed);
    const summary = summarizeBetonoedShortcut();
    const parsed = summary.map(parseSummary).find(Boolean);
    // Встреча ставится не на каждом сиде — это законно, ей нужно место.
    if (!parsed) continue;
    checked++;

    const at = `сид ${seed}`;
    const weakCell = gen.world.cells[gen.world.idx(parsed.weak[0], parsed.weak[1])];
    const approachCell = gen.world.cells[gen.world.idx(parsed.approach[0], parsed.approach[1])];

    assert.equal(weakCell, Cell.WALL, `${at}: слабая стена обязана остаться стеной`);
    assert.equal(approachCell, Cell.FLOOR,
      `${at}: подход ${parsed.approach} обязан быть полом, иначе звать тварь некуда`);
    assert.notDeepEqual(parsed.approach, parsed.weak,
      `${at}: подход не может совпадать со стеной — именно это и было сломано`);

    // И стоять он обязан вплотную: тварь зовут ГРЫЗТЬ стену, а не гулять рядом.
    const dx = Math.abs(gen.world.delta(parsed.approach[0], parsed.weak[0]));
    const dy = Math.abs(gen.world.delta(parsed.approach[1], parsed.weak[1]));
    assert.ok(dx <= 2 && dy <= 2, `${at}: подход ${parsed.approach} далеко от стены ${parsed.weak}`);
  }
  assert.ok(checked > 0, 'ни на одном сиде встреча не поставилась — замок ничего не проверил');
});

/* ── Свойство вида решает ФЛАГ, а не имя вида ──────────────────────
 *
 * `postrelease.md` §2.7 и закон владельца. Общий AI гейтил механики сравнением
 * `e.monsterKind === MonsterKind.X` — из-за этого новый монстр не мог взять уже
 * написанную механику вообще никак: чтобы теневик стал бояться света, надо было
 * дописать его имя в ядро.
 *
 * Замок держит ДВЕ вещи, и обе нужны.
 *
 * 1. Каждый флаг, объявленный ради конкретного вида, обязан лежать ровно на нём.
 *    Иначе перевод ворот на флаг молча меняет поведение: механика уедет к
 *    соседу или исчезнет у хозяина.
 * 2. В боевом AI не должно оставаться ворот по имени вида сверх известного
 *    остатка. Остаток именной и объяснённый: это не ворота, а ЧИСЛА вида
 *    (масштаб спрайта арматуры, размер пятна угря) и Тварь, которая носит общий
 *    `wallBias`, но со своими числами поверх него. Их снимает не замена
 *    сравнения, а перенос чисел в `MonsterDef` — авторское решение.
 *
 * Второй пункт нарочно считает СТРОКИ ИСХОДНИКА, а не поведение: поведение тут
 * и не сдвинулось ни на дельту, а сдвинуться должна была форма.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { MonsterKind } from '../src/core/types';
import { monsterHasAIFlag, type MonsterAIFlag } from '../src/entities/monster';
import '../src/content';

/** Флаг → единственный вид, которому он принадлежит. Список ручной нарочно:
 *  он и есть утверждение о замысле, а не производная от кода. */
const SINGLE_SPECIES_FLAGS: ReadonlyArray<[MonsterAIFlag, MonsterKind]> = [
  ['wetLineShot', MonsterKind.TRUBNYY_AVTOMAT],
  ['meatGrowth', MonsterKind.SOBRANNYY],
  ['roomBoundAberration', MonsterKind.OBZHIVALSHCHIK],
  ['wallBrace', MonsterKind.PANELNIK],
  ['webSpitter', MonsterKind.PAUPSINA],
  ['drainArmor', MonsterKind.LOTOCHNIK],
  ['lightFollower', MonsterKind.LISHENNYY],
  ['slimeScavenger', MonsterKind.SLIMEVIK],
  ['defensiveNeutral', MonsterKind.GNILUSHKA],
  ['slimeStrider', MonsterKind.SLIME_WOMAN],
  ['hostParasite', MonsterKind.HEAD_SLUG],
  ['blackWaterWake', MonsterKind.CHERNOSLIZ],
  ['meatWorm', MonsterKind.OLGOY],
  ['fogSwimmer', MonsterKind.FOG_SHARK],
  ['documentScent', MonsterKind.KONTORSHCHIK],
  ['baitLine', MonsterKind.TONKAYA_TEN],
  ['lastSoundBeam', MonsterKind.SLEPOGLAZ],
  ['lightLock', MonsterKind.LAMPOGLAZ],
  ['waterPressureLine', MonsterKind.VODYANOY_KOSHMAR],
  ['fractureSprint', MonsterKind.TRESKOTNIK],
  ['lightShy', MonsterKind.SHADOW],
  ['crowdPressure', MonsterKind.ZOMBIE],
  ['killCellPressure', MonsterKind.POLZUN],
  ['backstab', MonsterKind.BEZEKHIY],
  ['wetShotRisk', MonsterKind.ROBOT],
  ['roomPressure', MonsterKind.NIGHTMARE],
  ['firstSightCue', MonsterKind.SBORKA],
  ['temperedArmor', MonsterKind.ZAKALENNAYA_ARMATURA],
  ['choirLead', MonsterKind.KHOROVAYA_MATKA],
  ['broodSource', MonsterKind.MATKA],
];

/**
 * Сколько ворот по имени вида осталось в боевом AI и почему.
 *
 * 23 → 5 за волну 2. Остаток разобран поимённо в шапке файла: три числа вида
 * (масштаб спрайта арматуры дважды, размер пятна угря) и Тварь в двух
 * множителях. Опускать это число можно только вместе с переносом чисел вида в
 * `MonsterDef` — то есть авторским решением, а не заменой сравнения.
 */
const NAME_GATES_LEFT = 5;

test('каждый видовой флаг лежит ровно на своём виде', () => {
  const kinds = (Object.values(MonsterKind) as unknown[])
    .filter((k): k is MonsterKind => typeof k === 'number');

  for (const [flag, owner] of SINGLE_SPECIES_FLAGS) {
    const carriers = kinds.filter(kind => monsterHasAIFlag({ monsterKind: kind }, flag));
    assert.deepEqual(
      carriers.map(kind => MonsterKind[kind]), [MonsterKind[owner]],
      `флаг ${flag} обязан лежать ровно на ${MonsterKind[owner]}: иначе перевод ворот на него молча двигает механику`,
    );
  }
});

test('ворот по имени вида в боевом AI не больше известного остатка', () => {
  const source = fs.readFileSync(path.join('src', 'systems', 'ai', 'monster.ts'), 'utf8');
  const gates = [...source.matchAll(/e\.monsterKind (?:===|!==) MonsterKind\.[A-Z_]+/g)].map(m => m[0]);
  assert.equal(
    gates.length, NAME_GATES_LEFT,
    `ворот по имени вида ${gates.length}, ожидалось ${NAME_GATES_LEFT}:\n  ${gates.join('\n  ')}`,
  );
});

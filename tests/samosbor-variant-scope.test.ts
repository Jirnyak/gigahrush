import test from 'node:test';
import assert from 'node:assert/strict';

import { _overrideRng, _restoreRng } from '../src/core/rand';
import {
  SAMOSBOR_VARIANTS,
  getSamosborAftermathBeats,
  getSamosborVariantWeight,
} from '../src/data/samosbor_variants';
import {
  chooseSamosborVariant,
  clearActiveSamosborVariant,
  forceNextSamosborVariant,
} from '../src/systems/samosbor_variants_runtime';

/* Самосбор один и тот же везде.
 *
 * Раньше и выбор варианта, и его последствия отсекались списком этажей, а сам
 * список выводился из шести корзин тем; сверху лежала матрица множителей вида
 * «на министерстве электрический ×1.8, в Аду мясной ×5». Решение владельца:
 * фундаментальная механика самосбора — перестройка этажа — едина, различия
 * принадлежат самому варианту (истотит, маронарий, веретар, мокрый, мясной), а
 * не месту. Тесты держат новое правило: место не участвует нигде.
 */

test('вес варианта не зависит от этажа и у каждого варианта он есть', () => {
  for (const def of SAMOSBOR_VARIANTS) {
    assert.ok(
      getSamosborVariantWeight(def.id) > 0,
      `вариант ${def.id} обязан быть достижим: отсечки по этажу больше нет`,
    );
    assert.equal(getSamosborVariantWeight(def.id), def.weight);
  }
});

test('принудительный выбор варианта исполняется всегда', () => {
  // Раньше принудительный выбор сверялся с областью этажа и мог молча провалиться
  // в общий бросок. При сиде 0 бросок детерминированно даёт SAMOSBOR_VARIANTS[0],
  // поэтому возвращённый veretar доказывает, что исполнился именно приказ.
  _overrideRng(() => 0);
  try {
    clearActiveSamosborVariant();
    assert.equal(forceNextSamosborVariant('veretar'), true);
    assert.equal(chooseSamosborVariant().def.id, 'veretar');
  } finally {
    _restoreRng();
    clearActiveSamosborVariant();
  }
});

test('последствия принадлежат варианту, а не этажу', () => {
  const classic = getSamosborAftermathBeats('classic');
  assert.ok(classic.some(b => b.id === 'aftermath_fog_residue'), 'такт классического самосбора на месте');

  // Отбор по варианту — единственный оставшийся, и он настоящий.
  const electric = getSamosborAftermathBeats('electric');
  assert.equal(electric.some(b => b.id === 'aftermath_fog_residue'), false, 'такт уважает свой список вариантов');

  // И он больше не зависит от места: один и тот же вариант даёт один и тот же набор.
  assert.deepEqual(getSamosborAftermathBeats('classic').map(b => b.id), classic.map(b => b.id));
});

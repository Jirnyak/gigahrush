import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ── Паритет двух рук ближнего боя ────────────────────────────────
 *
 * Ближний удар в `main.ts` разрешается ДВАЖДЫ: рукой локального игрока и рукой
 * ко-оп-пира на хозяине (`applyPeerFireAction`). Копии разошлись по трём
 * пунктам, и все три видел игрок:
 *
 *   1. `recordMonsterMeleeDeath` звала только рука игрока. Это контрплей самого
 *      МОНСТРА — срез корня борщевика и кровяного растения, смерть тумана в
 *      огне, — и от руки он не зависит.
 *   2. Гор при добивании у пира стоял жёсткой единицей: бензопила оставляла ту
 *      же лужу, что кулак.
 *   3. Прочность у пира списывалась БЕЗУСЛОВНО и до наведения, а собственное
 *      предсказание пира (`peerLocalMeleeWouldHit`) списывает её только за
 *      попадание. Промах стоил ресурса на хозяине и не стоил у себя.
 *
 * Ни одна из двух веток не экспортируется (`main.ts` — точка входа браузера, у
 * него DOM-побочки на импорте), поэтому замок держит ИСХОДНИК. Образец в
 * репозитории уже есть: `tests/plot-outcomes.test.ts`.
 */

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

function countOf(needle: string): number {
  return main.split(needle).length - 1;
}

test('контрплей монстра зовут обе руки ближнего боя', () => {
  // Один импорт + два вызова. Меньше трёх — значит одна из рук снова его потеряла.
  assert.equal(
    countOf('recordMonsterMeleeDeath'), 3,
    'ожидались импорт и ровно два вызова — по одному на руку игрока и руку пира',
  );
});

test('гор ближнего добивания считает одна общая функция', () => {
  assert.equal(countOf('function meleeKillGore'), 1, 'общей функции гора нет');
  // Три вызова: объявление + рука игрока + рука пира.
  assert.equal(countOf('meleeKillGore('), 3, 'гор считают не обе руки');
  assert.equal(
    main.includes("(weaponId === 'chainsaw' || weaponId === 'axe') ? 3"), false,
    'лестница гора снова выписана на месте вместо общей функции',
  );
});

test('прочность у обеих рук списывается за попадание, а не за взмах', () => {
  assert.equal(
    main.includes('consumeDurability(actor, [], state.time, state, weaponId);\n  const normalDmg'), false,
    'путь пира снова списывает прочность до наведения и безусловно',
  );
  assert.equal(
    main.includes('if (hitSomething) consumeDurability(actor, [], state.time, state, weaponId);'), true,
    'путь пира больше не списывает прочность за попадание',
  );
  // Рука игрока и предсказание пира — те же ворота, обе на месте.
  assert.equal(
    main.includes('const broke = consumeDurability(player, state.msgs, state.time, state, weaponId);'), true,
  );
  assert.equal(
    main.includes('peerLocalMeleeWouldHit(weaponId, ws) && consumeDurability(player'), true,
  );
});

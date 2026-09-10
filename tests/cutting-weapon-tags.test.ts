/* «Каким оружием режут» — одна механика, значит один путь.
 *
 * Три системы держали СВОЙ список: паутина паупсины (`systems/status.ts`),
 * борщевик (`systems/borshchevik.ts`), кровяная лоза (`systems/blood_plant.ts`).
 * Ядро у всех совпадало, а хвосты разошлись зеркально — у борщевика были
 * арматура и труба, но не было штыка и лопатки, у паутины ровно наоборот.
 * Это дубликат СИСТЕМЫ, а не контента, и правило `CLAUDE.md` про повтор между
 * равнозначными пакетами на него не распространяется.
 *
 * Свойство переехало на предмет двумя метками: `blade` режет, `heavy_pry`
 * ломает. Замок держит КЛАСС: собственных списков режущего инструмента в
 * системах быть не должно, а наборы механик обязаны выводиться из меток.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import { ITEMS, itemIsBladeWeapon, itemIsHeavyPryWeapon } from '../src/data/items';
import { isBloodPlantCuttingWeapon } from '../src/systems/blood_plant';
import { isBorshchevikCuttingWeapon } from '../src/systems/borshchevik';
import { isPaupsinaWebCuttingWeapon } from '../src/systems/status';

const ALL_ITEM_IDS = Object.keys(ITEMS);

function idsWhere(pred: (id: string) => boolean): string[] {
  return ALL_ITEM_IDS.filter(pred).sort();
}

test('метки лезвия и рычага не пусты и не пересекаются', () => {
  const blades = idsWhere(itemIsBladeWeapon);
  const pries = idsWhere(itemIsHeavyPryWeapon);
  assert.ok(blades.length >= 5, `лезвий ${blades.length} — метка потеряна`);
  assert.ok(pries.length >= 2, `рычагов ${pries.length} — метка потеряна`);
  const both = blades.filter(id => pries.includes(id));
  assert.deepEqual(both, [], 'предмет не может быть одновременно лезвием и рычагом: свойства разные');
});

test('паутину берёт только лезвие', () => {
  /* Трубой и арматурой нить не режут — `heavy_pry` здесь не спрашивается
   * НАМЕРЕННО, и это единственное отличие паутины от стебля и лозы. */
  assert.deepEqual(idsWhere(isPaupsinaWebCuttingWeapon), idsWhere(itemIsBladeWeapon));
  assert.equal(isPaupsinaWebCuttingWeapon('knife'), true);
  assert.equal(isPaupsinaWebCuttingWeapon('rebar'), false);
  assert.equal(isPaupsinaWebCuttingWeapon('pipe'), false);
});

test('стебель и лозу берут и лезвие, и тяжёлый рычаг', () => {
  const expected = idsWhere(id => itemIsBladeWeapon(id) || itemIsHeavyPryWeapon(id));
  assert.deepEqual(idsWhere(isBorshchevikCuttingWeapon), expected);
  assert.deepEqual(idsWhere(isBloodPlantCuttingWeapon), expected);
  /* Замер сведения: ни одна из трёх механик ничего не потеряла, борщевик
   * прибавил монтировку, лопатку и штык. Числа держатся здесь, чтобы
   * следующее «просто добавлю метку» показало свою цену. */
  assert.equal(expected.length, 10);
});

test('ни одна система не заводит собственный список режущего оружия', () => {
  /* Инвариант вместо теста: закрывает КЛАСС, а не три известных файла.
   *
   * Признак взят узкий и объяснимый: список, где кухонный НОЖ стоит рядом с
   * БЕНЗОПИЛОЙ, — это и есть «чем режут», от края до края. Все три разъехавшихся
   * списка несли обе крайности; соседние списки, отвечающие на ДРУГИЕ вопросы,
   * не несут ни одной пары и остаются при своём законно:
   *   · `hladon.FIRE_COUNTER_WEAPONS` — «чем греют» (огнемёт, багор, пила);
   *   · `plombirovshchik.CUT_ITEMS` — «чем ломают пломбу», и туда входят ключ,
   *     молоток и кувалда, то есть слесарный инструмент, а не лезвие. Свести их
   *     сюда значило бы раздать `heavy_pry` половине мастерской и молча
   *     расширить борщевик с лозой. */
  const offenders: string[] = [];
  for (const path of sourceFiles()) {
    if (path === 'src/data/items.ts') continue;
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/(?:new Set\(\[|=\s*\[)([^\]]*)\]/g)) {
      const body = match[1];
      if (!/['"]knife['"]/.test(body) || !/['"]chainsaw['"]/.test(body)) continue;
      offenders.push(`${path}: ${body.replace(/\s+/g, ' ').slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [],
    'спрашивай метку `blade` / `heavy_pry`, а не переписывай список у себя');
});

/** Обход через fs, а не через import: тест обязан остаться в гейтованном
 *  наборе, а импорт по пути с генераторами уводит файл в набор generation. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) out.push(path);
    }
  };
  walk('src');
  return out;
}

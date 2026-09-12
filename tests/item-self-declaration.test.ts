/* Вещь объявляет себя меткой; система не разбирает её id.
 *
 * Продолжение того же приёма, которым это уже сделано для оружия
 * (`tests/weapon-self-declaration.test.ts`, метки `deletion_beam`/`armor_strip`).
 * Здесь закрыты два кластера:
 *
 *   `systems/containers.ts`  — 21 id тремя списками: что принимает ящик сбора
 *                              улик, ящик саботажа и заслон окна;
 *   `systems/ai/monster.ts`  — 7 id в общем боевом AI: громкий выстрел,
 *                              ритуальная приманка, запах сырого мяса, свет на
 *                              полу.
 *
 * Метки заведены ПОД ВОПРОС, а не под общий смысл. Это не придирка: общую
 * `evidence` носят 58 предметов, а набор ящика — 13, и переиспользовать её
 * значило бы молча расширить набор вчетверо. То же с `bait_meat` — его носят
 * ещё тушёнка и паёк, а нюхает тварь именно СЫРОЕ мясо.
 *
 * Наборы сохранены ДО ID: слепки ниже снимались с прежнего кода, и они и есть
 * доказательство, что правка ничего не потеряла и ничего не добавила.
 *
 * Три доказуемо лишних разбора id сняты, а не переписаны на метку: шумовая
 * банка приходит источником `decoy` и метками `can`/`counterplay`, арматура —
 * профилем шума с меткой `metal`, и обе проверки уже стояли в тех же функциях.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ITEMS, itemIdHasTag } from '../src/data/items';
import { droppedLightScore } from '../src/data/tool_lights';

function taggedIds(tag: string): string[] {
  return Object.keys(ITEMS).filter(id => itemIdHasTag(id, tag)).sort();
}

/** Слепки, снятые с кода ДО перевода на метки. Менять их можно только вместе с
 *  осознанным решением о составе набора — это игровой вопрос, не технический. */
const SNAPSHOTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['evidence_drop', [
    'chernobog_cell_map', 'chernobog_confiscation_act', 'chernobog_external_cell_index',
    'chernobog_liquidator_memo', 'chernobog_redacted_central_note', 'chernobog_witness_correction',
    'cult_supply_list', 'denunciation', 'ration_registry_extract', 'record_exposure_notice',
    'sealed_complaint', 'voluntary_receipt', 'zhelemish_raw',
  ]],
  ['sabotage_drop', ['acid_bottle', 'ammo_fuel', 'glass_shard', 'infected_mushroom', 'rawmeat', 'sealant_tube']],
  ['window_seal', ['cloth_roll', 'sealant_tube']],
  ['loud_report', ['shotgun', 'toz_shotgun']],
  ['bait_ritual', ['meat_rune', 'psi_meat_hook']],
  ['bait_meat_raw', ['rawmeat']],
];

test('наборы перенесены на метки без потерь и добавок', () => {
  for (const [tag, expected] of SNAPSHOTS) {
    assert.deepEqual(taggedIds(tag), [...expected],
      `набор метки ${tag} разошёлся со слепком: предмет потерялся или добавился молча`);
  }
});

test('метка читается из ОБОИХ мест, где живут метки предмета', () => {
  /* Ловушка, оплаченная на оружии: метки лежат и в `ITEM_TAGS`, и в поле `tags`
   * определения. Досье Чернобога носит свои только в первом. */
  const docket = 'chernobog_cell_map';
  assert.deepEqual(ITEMS[docket]?.tags ?? [], [],
    'у досье появилось собственное поле tags — проверка перестала охранять ловушку');
  assert.ok(itemIdHasTag(docket, 'evidence_drop'),
    'метка из ITEM_TAGS не видна: читатель снова смотрит только def.tags');
});

test('свет на полу — вопрос к данным, а не две ветки в ядре', () => {
  // Числа те же, что стояли в AI: свеча 0.64, лампа 0.32.
  assert.equal(droppedLightScore('istotit_candle'), 0.64);
  assert.equal(droppedLightScore('lamp_bulb'), 0.32);
  // И инструментальный свет по-прежнему отвечает своим числом.
  assert.equal(droppedLightScore('liquidator_flashlamp'), 0.88);
  assert.equal(droppedLightScore('bread'), 0, 'светом объявился предмет, который не светит');
});

test('ни одна система не разбирает эти id вручную', () => {
  /* Код без комментариев: на оружии этот же инвариант однажды покраснел на
   * собственном комментарии правки. */
  const ID_CHECKS = [
    'cult_supply_list', 'denunciation', 'sealed_complaint', 'record_exposure_notice',
    'voluntary_receipt', 'ration_registry_extract', 'infected_mushroom', 'acid_bottle',
    'glass_shard', 'cloth_roll', 'meat_rune', 'istotit_candle', 'lamp_bulb',
    'toz_shotgun', 'noise_can', 'rebar',
  ];
  const offenders: string[] = [];
  for (const file of ['src/systems/containers.ts', 'src/systems/ai/monster.ts']) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const id of ID_CHECKS) {
      /* Ищем СРАВНЕНИЕ, а не упоминание: строка `'denunciation'` живёт в этом же
       * файле тегом события, и запрет на любое вхождение краснел бы на нём —
       * то есть охранял бы не тот вопрос. */
      if (new RegExp(`(===|!==|includes\\()\\s*'${id}'`).test(code)) offenders.push(`${file}: '${id}'`);
    }
  }
  assert.deepEqual(offenders, [],
    'система снова узнаёт предмет по имени: спросите метку через itemIdHasTag');
});

test('инвариант считает код, а не комментарий', () => {
  /* Негативный контроль САМОГО замка: без снятия комментариев он краснел бы на
   * пояснении к правке, как это уже случилось с `Math.random` и с оружием. */
  const withComment = "  // раньше здесь стояло defId === 'meat_rune'\n  return itemIdHasTag(defId, 'bait_ritual');";
  const stripped = withComment.replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!stripped.includes("'meat_rune'"), 'чистка комментариев не работает — замок будет ловить себя');
  assert.ok(stripped.includes("'bait_ritual'"), 'чистка съела код вместе с комментарием');

  // И вторая сторона: тег события с тем же написанием нарушением НЕ считается.
  const eventTag = "    tags: ['room_memory', 'denunciation', 'container'],";
  assert.ok(!/(===|!==|includes\()\s*'denunciation'/.test(eventTag),
    'замок считает нарушением тег события — он охраняет не тот вопрос');
  assert.ok(/(===|!==|includes\()\s*'denunciation'/.test("if (defId === 'denunciation') return true;"),
    'замок перестал видеть настоящее сравнение id');
});

test('метка-вопрос принадлежит логике: арт её не знает', () => {
  /* Ловушка, оплаченная прогоном: `ITEM_TAGS` кормит не только логику, но и
   * ГЕНЕРАТОР ПРОЦЕДУРНОГО АРТА (`render/item_sprites.ts` выбирает силуэт по
   * меткам). Первая версия правки дописала предметам описательные метки
   * (`document`, `cult`, `meat`) «для порядка» — и пять наборов иконок
   * поехали: список закупок культа перестал быть кастрюлей и стал бумагой.
   *
   * Отсюда правило: метка, заведённая под вопрос системы, не должна входить в
   * словарь арта. Хочешь сменить иконку — меняй её осознанно и обновляй
   * `tests/item-sprites.test.ts`, а не попутно с логикой. */
  const art = readFileSync('src/render/item_sprites.ts', 'utf8');
  for (const [tag] of SNAPSHOTS) {
    assert.ok(!art.includes(`'${tag}'`),
      `метка ${tag} попала в словарь арта: логическая метка теперь меняет иконку предмета`);
  }
  // Обратная сторона: словарь арта существует и читается — иначе проверка пуста.
  assert.ok(art.includes("'cult'") && art.includes("'sample'"),
    'словарь арта не найден: проверка выше ничего не охраняет');
});

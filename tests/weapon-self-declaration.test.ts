/* Оружие объявляет себя САМО; система не разбирает его id.
 *
 * Два места разбирали. `systems/weapon_beams.ts` спрашивал
 * `weaponId === 'gravity_beam_emitter'`, хотя обе лучевые пушки уже носят свои
 * метки. `systems/monster_armor.ts` держал два списка на восемнадцать id —
 * «чем срывают броню» и «что считается инструментом», — и у таких списков своя
 * болезнь: запись, которой нет в `WEAPON_STATS`, не срабатывает никогда и молча
 * изображает работающее правило (так оттуда сняли `jackhammer` и `uv_spotlight`).
 *
 * Метка этого класса ошибок не допускает: её видно на предмете, и её сторожит
 * замок. Тот же приём, что `blade` и `heavy_pry` у режущего оружия.
 *
 * ЛОВУШКА, ПОЙМАННАЯ ЗАМЕРОМ: метки предмета живут в ДВУХ местах — `ITEM_TAGS`
 * и собственное поле `tags` определения. У гравилуча они только в первом, и
 * первая версия правки читала `def.tags`, получая пустой список. Спрашивать
 * положено общим `itemIdHasTag`.
 */

import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as assert from 'node:assert/strict';

import { EntityType, MonsterKind } from '../src/core/types';
import { World } from '../src/core/world';
import { ITEMS, itemIdHasTag } from '../src/data/items';
import { WEAPON_STATS } from '../src/data/catalog';
import { applyMonsterArmorHit, type MonsterArmorHitKind } from '../src/systems/monster_armor';
import { makeGameState, makeTestEntity } from './helpers';

/** Набор «срывает броню» на момент переноса из `systems/monster_armor.ts`.
 *  Слепок нужен, чтобы перенос был проверяемым: метка обязана дать ТОТ ЖЕ
 *  список, а не похожий. */
const ARMOR_STRIP_BEFORE = [
  'axe', 'bfg', 'chainsaw', 'crowbar', 'gauss', 'grenade', 'gravity_beam_emitter',
  'harpoon_gun', 'liquidator_axe', 'losyash_rifle', 'metal_chair', 'ptrs_liquidator',
  'shotgun', 'sledgehammer', 'toz_shotgun',
].sort();

const ARMOR_TOOL_BEFORE = ['fire_hook', 'rebar'].sort();

function taggedIds(tag: string): string[] {
  return Object.keys(ITEMS).filter(id => itemIdHasTag(id, tag)).sort();
}

test('набор «срывает броню» перенесён на метку без потерь и добавок', () => {
  assert.deepEqual(taggedIds('armor_strip'), ARMOR_STRIP_BEFORE);
});

test('набор «бьют инструментом» перенесён на метку без потерь и добавок', () => {
  assert.deepEqual(taggedIds('armor_tool'), ARMOR_TOOL_BEFORE);
});

test('каждый луч, удаляющий материю, называет себя меткой', () => {
  /* `deletionBeam` — это «разрушает материю на пути», и он уже данные оружия.
   * Луч без собственной метки уедет в событие безымянным, и мир не отличит
   * гравитационный импульс от атомной струи. */
  const beams = Object.keys(WEAPON_STATS).filter(id => WEAPON_STATS[id].deletionBeam);
  assert.ok(beams.length >= 2, `лучей, удаляющих материю: ${beams.length}`);
  for (const id of beams) {
    assert.ok(itemIdHasTag(id, 'deletion_beam'), `${id} удаляет материю, но метки не несёт`);
  }
  /* Гравитационный — ещё и своей, отдельной: событие мира различает их. */
  assert.ok(itemIdHasTag('gravity_beam_emitter', 'gravity_beam'));
  assert.equal(itemIdHasTag('ato41_atomic_flamer', 'gravity_beam'), false);
});

test('метка читается из ОБОИХ мест, где живут метки предмета', () => {
  /* Негативный контроль самого хелпера. У гравилуча метки лежат только в
   * `ITEM_TAGS`, у АТО-41 — ещё и на определении; обе стороны обязаны
   * отвечать одинаково, иначе правка молча читает пустоту. */
  assert.ok(itemIdHasTag('gravity_beam_emitter', 'deletion_beam'));
  assert.ok(itemIdHasTag('ato41_atomic_flamer', 'deletion_beam'));
  assert.equal(itemIdHasTag('knife', 'deletion_beam'), false);
  assert.equal(itemIdHasTag(undefined, 'deletion_beam'), false);
});

/** Исходник без комментариев. Правило обязано считать КОД, а не собственное
 *  объяснение: первая версия этого теста покраснела на моём же комментарии
 *  «здесь стояло `weaponId === 'gravity_beam_emitter'`». Класс известный —
 *  так же однажды покраснел инвариант `Math.random`. */
function codeWithoutComments(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

test('метка доезжает до разбора удара, а не только лежит на предмете', () => {
  /* Поведенческая сверка, и она обязательна: первая версия этого файла
   * проверяла ТОЛЬКО наборы меток и текст исходника, поэтому снятый в броне
   * вопрос к метке не краснел — контроль был пустым. Здесь спрашивается сам
   * разбор удара через живой вход системы. */
  const world = new World();
  const state = makeGameState({ time: 10 });
  const monster = makeTestEntity({
    id: 501, type: EntityType.MONSTER, monsterKind: MonsterKind.TVAR, hp: 300, maxHp: 300,
  });

  const hit = (weaponId: string): MonsterArmorHitKind =>
    applyMonsterArmorHit(world, state, monster, { damage: 10, weaponId }).hitKind;

  assert.equal(hit('shotgun'), 'heavy', 'дробовик срывает броню — это метка armor_strip');
  assert.equal(hit('gravity_beam_emitter'), 'heavy');
  assert.equal(hit('fire_hook'), 'tool', 'багор бьёт инструментом — это метка armor_tool');
  assert.equal(hit('knife'), 'weak', 'нож не срывает броню и не инструмент');
});

test('ни одна система не разбирает id лучевого оружия вручную', () => {
  /* Инвариант класса: имя конкретной пушки внутри системной ветки — это
   * будущая забытая третья пушка. */
  for (const path of ['src/systems/weapon_beams.ts', 'src/systems/monster_armor.ts']) {
    assert.equal(
      /'gravity_beam_emitter'|'ato41_atomic_flamer'/.test(codeWithoutComments(path)), false,
      `${path} снова разбирает id оружия — спрашивайте метку`,
    );
  }
});

test('инвариант считает код, а не комментарий', () => {
  /* Негативный контроль самого правила в обе стороны. */
  assert.equal(/'gravity_beam_emitter'/.test(codeWithoutComments('src/systems/weapon_beams.ts')), false);
  assert.ok(readFileSync('src/systems/weapon_beams.ts', 'utf8').includes('gravity_beam_emitter'),
    'имя пушки пропало даже из объяснения — контроль стал пустым');
});

/**
 * Замок вывода силуэта вьюмодели (`src/render/viewmodel/archetype.ts`).
 *
 * Силуэт НЕ перечисляется вручную для семидесяти стволов — он выводится из уже
 * канонических боевых чисел. Плата за это в том, что ошибка вывода МОЛЧАЛИВА:
 * вещь всё равно получает какую-то картинку, никто не падает, и в руках просто
 * оказывается не то. Ровно так это место ломалось трижды, и все три поломки
 * записаны в `viewmodel.md` как предупреждение:
 *
 *  1. порог по дальности для «длинного» загонял в древковые кувалду, стул и
 *     разводной ключ — вылет ближнего боя весь лежит в 1.25..2.35, и любое
 *     отсечение по числу врало; сейчас правило опирается на авторский пояс
 *     `melee_reach`;
 *  2. пояс `grenade` держит и бросок рукой, и выстрел из трубы, а различает их
 *     скорость снаряда: брошенное ≤ 9, выпущенное ≥ 10;
 *  3. атомный огнемёт помечен `deletionBeam`, но в руках это бак со шлангом, а
 *     не эмиттер энергетики, поэтому огонь обязан решать РАНЬШЕ луча.
 *
 * Поэтому ассерты ниже поимённые, а два из них — отрицательные контроли: они
 * проверяют, что боевое число, из-за которого правило однажды соврало, на месте
 * и до сих пор перекрывается правильной веткой.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, WEAPON_STATS } from '../src/data/catalog';
import { itemEquipSlot } from '../src/data/items';
import { TOOL_LIGHT_DEFS } from '../src/data/tool_lights';
import { viewmodelArchetype } from '../src/render/viewmodel';
import type { ViewmodelArchetype } from '../src/render/viewmodel';
import type { ViewmodelSlot } from '../src/render/viewmodel';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** В какой руке вещь оказывается на самом деле. ПСИ живёт в слоте инструмента. */
function slotOf(itemId: string): ViewmodelSlot {
  const def = ITEMS[itemId];
  return def && itemEquipSlot(def) === 'tool' ? 'tool' : 'weapon';
}

/** Идентификаторы боевых чисел, кроме пустого — это безоружные руки. */
const WEAPON_IDS = Object.keys(WEAPON_STATS).filter(id => id !== '');

test('каждая вещь с боевыми числами получает силуэт, и пустая рука тоже', () => {
  assert.ok(WEAPON_IDS.length >= 80, `боевых вещей стало подозрительно мало: ${WEAPON_IDS.length}`);

  const missing: string[] = [];
  for (const id of WEAPON_IDS) {
    if (!viewmodelArchetype(slotOf(id), id)) missing.push(id);
  }
  // Ни одного `undefined`: промах вывода означает, что рука не рисуется вовсе.
  assert.deepEqual(missing, [], `вещи без силуэта: ${missing.join(', ')}`);

  // Пустая правая рука — это кулаки, пустая левая — ничего.
  assert.equal(viewmodelArchetype('weapon', undefined), 'bare_hands');
  assert.equal(viewmodelArchetype('weapon', ''), 'bare_hands');
  assert.equal(viewmodelArchetype('tool', undefined), undefined);
  // Незнакомая вещь силуэта не получает и не притворяется кулаками.
  assert.equal(viewmodelArchetype('weapon', 'no_such_item_at_all'), undefined);
  assert.equal(viewmodelArchetype('tool', 'no_such_item_at_all'), undefined);
});

test('ближний бой: древковое отделено поясом melee_reach, а не порогом по вылету', () => {
  // Кувалда, стул и разводной ключ — те самые три вещи, которых порог по
  // дальности объявлял древковыми. Они ОБЯЗАНЫ остаться дробящими.
  for (const id of ['sledgehammer', 'metal_chair', 'wrench']) {
    assert.ok(WEAPON_STATS[id], `${id} исчез из боевых чисел — ассерт ниже перестал что-либо значить`);
    assert.equal(viewmodelArchetype('weapon', id), 'blunt', `${id} должен быть дробящим`);
  }
  // Настоящее древковое: багор, арматура, цепь.
  for (const id of ['fire_hook', 'rebar', 'chain']) {
    assert.ok(WEAPON_STATS[id], `${id} исчез из боевых чисел`);
    assert.equal(viewmodelArchetype('weapon', id), 'polearm', `${id} должен быть древковым`);
  }
  // Отрицательный контроль правила: вылет кувалды лежит В ТОЙ ЖЕ полосе, что у
  // древковых, — то есть числом их не разделить, и разделяет их только пояс.
  const sledge = WEAPON_STATS.sledgehammer.range;
  const hook = WEAPON_STATS.fire_hook.range;
  assert.ok(Math.abs(sledge - hook) < 1.2, `вылет кувалды и багра разошёлся: ${sledge} против ${hook}`);

  // Режущее отличается от дробящего только именем: боевые числа этой разницы
  // не несут вовсе.
  assert.equal(viewmodelArchetype('weapon', 'knife'), 'blade');
  assert.equal(viewmodelArchetype('weapon', 'axe'), 'blade');
  // Штык — исключение по руке: им колют с вылета, но держат как клинок.
  assert.equal(viewmodelArchetype('weapon', 'bayonet'), 'blade');
  // ...а грабли со штыком остаются древковыми: длинным их делает черенок.
  assert.equal(viewmodelArchetype('weapon', 'rake_bayonet'), 'polearm');
});

test('пояс grenade делится по скорости снаряда: бросок против пусковой', () => {
  const thrown = WEAPON_STATS.grenade;
  const launcher = WEAPON_STATS.g41_grenade_launcher;
  assert.ok(thrown && launcher, 'обе вещи обязаны существовать');

  // Числа, на которых держится разделение. Без них ассерты ниже — совпадение.
  assert.ok((thrown.projSpeed ?? 0) <= 9, `брошенное летит не быстрее девяти: ${thrown.projSpeed}`);
  assert.ok((launcher.projSpeed ?? 0) >= 10, `выпущенное летит от десяти: ${launcher.projSpeed}`);

  assert.equal(viewmodelArchetype('weapon', 'grenade'), 'thrown');
  assert.equal(viewmodelArchetype('weapon', 'g41_grenade_launcher'), 'launcher');
  // Одноразовая труба на плече — пусковая через таблицу исключений.
  assert.equal(viewmodelArchetype('weapon', 'shmk_disposable'), 'launcher');
});

test('огонь решает раньше луча: атомный огнемёт остаётся огнемётом', () => {
  const atomic = WEAPON_STATS.ato41_atomic_flamer;
  assert.ok(atomic, 'атомный огнемёт обязан существовать');
  // Отрицательный контроль: метка луча удаления НА МЕСТЕ, то есть ветка
  // энергетики действительно перекрывается, а не просто не срабатывает.
  assert.ok(atomic.deletionBeam, 'атомный огнемёт помечен deletionBeam — на этом и держится проверка порядка');
  assert.equal(viewmodelArchetype('weapon', 'ato41_atomic_flamer'), 'flamer');

  // Настоящая энергетика при этом энергетикой и осталась.
  for (const id of ['gauss', 'plasma', 'bfg']) {
    assert.equal(viewmodelArchetype('weapon', id), 'energy', `${id} должен быть энергетикой`);
  }
});

test('огнестрел разведён по ёмкости и поясу: ППШ, пулемёт и автомат', () => {
  const cases: Readonly<Record<string, ViewmodelArchetype>> = {
    ppsh: 'smg',
    machinegun: 'machinegun',
    ak47: 'rifle',
    makarov: 'pistol',
    shotgun: 'shotgun',
  };
  for (const [id, expected] of Object.entries(cases)) {
    assert.ok(WEAPON_STATS[id], `${id} исчез из боевых чисел`);
    assert.equal(viewmodelArchetype('weapon', id), expected, `${id} → ${expected}`);
  }
  // Числа, из которых это выведено: диск ППШ ≥ 50, короб пулемёта ≥ 100,
  // рожок автомата меньше пятидесяти.
  assert.ok((WEAPON_STATS.ppsh.magazineSize ?? 0) >= 50, `диск ППШ: ${WEAPON_STATS.ppsh.magazineSize}`);
  assert.ok((WEAPON_STATS.machinegun.magazineSize ?? 0) >= 100, `короб пулемёта: ${WEAPON_STATS.machinegun.magazineSize}`);
  assert.ok((WEAPON_STATS.ak47.magazineSize ?? 0) < 50, `рожок автомата: ${WEAPON_STATS.ak47.magazineSize}`);
  // Дробовик опознаётся картечью, а не именем.
  assert.ok((WEAPON_STATS.shotgun.pellets ?? 1) > 1, 'дробовик стреляет картечью');
});

test('все ПСИ дают psi_hand в любой руке', () => {
  const psiIds = Object.keys(WEAPON_STATS).filter(id => WEAPON_STATS[id].psiCost);
  // Порог, а не точное число: ПСИ вправе прибавляться, правило ниже поштучное.
  assert.ok(psiIds.length >= 18, `ПСИ стало меньше восемнадцати: ${psiIds.length}`);

  for (const id of psiIds) {
    // Сгусток живёт в слоте инструмента, поэтому проверка на `psiCost` стоит
    // РАНЬШЕ разбора инструментов: иначе ПСИ уехало бы в фонарь или в
    // `tool_generic`, и в левой руке появился бы ящик с инструментом.
    assert.equal(viewmodelArchetype('tool', id), 'psi_hand', `${id} в левой руке`);
    assert.equal(viewmodelArchetype('weapon', id), 'psi_hand', `${id} в правой руке`);
    const item = ITEMS[id];
    assert.ok(item, `${id} обязан быть предметом`);
    assert.equal(itemEquipSlot(item), 'tool', `${id} экипируется в левую руку`);
  }
});

test('инструменты: свет опознан поимённо, остальное — общий инструмент', () => {
  const lights: Readonly<Record<string, ViewmodelArchetype>> = {
    flashlight: 'flashlight',
    liquidator_flashlamp: 'flashlight',
    lighter: 'lighter',
    uv_spotlight: 'uv_spotlight',
  };
  // Ни один источник света не имеет права стать безликим `tool_generic`.
  for (const def of TOOL_LIGHT_DEFS) {
    const archetype = viewmodelArchetype('tool', def.id);
    assert.ok(archetype, `${def.id}: нет силуэта`);
    assert.notEqual(archetype, 'tool_generic', `${def.id} — источник света, а не безликий инструмент`);
    if (lights[def.id]) assert.equal(archetype, lights[def.id], `${def.id} → ${lights[def.id]}`);
  }

  // Каждый предмет левой руки получает силуэт: пустая левая рука — это дефект,
  // который в браузере читается как «инструмент исчез».
  const toolItems = Object.values(ITEMS).filter(def => itemEquipSlot(def) === 'tool');
  assert.ok(toolItems.length >= 30, `предметов левой руки стало мало: ${toolItems.length}`);
  const homeless: string[] = [];
  for (const def of toolItems) if (!viewmodelArchetype('tool', def.id)) homeless.push(def.id);
  assert.deepEqual(homeless, [], `инструменты без силуэта: ${homeless.join(', ')}`);

  // Обычный инструмент без своего пакета — общий силуэт.
  assert.equal(viewmodelArchetype('tool', 'radio'), 'tool_generic');
  assert.equal(viewmodelArchetype('tool', 'fog_detector'), 'tool_generic');
});

test('таблица исключений архетипа остаётся КОРОТКОЙ и вся живая', () => {
  /* Читаем исходник, а не поведение: таблица не экспортируется, а смысл замка
   * именно в её РАЗМЕРЕ. Каждая строка здесь — признание, что общее правило для
   * вещи не работает; растущая таблица означает, что правило чинят таблицей
   * вместо правила, и в `viewmodel.md` это записано прямым запретом. */
  const source = readFileSync(path.join(ROOT, 'src/render/viewmodel/archetype.ts'), 'utf8');
  const start = source.indexOf('const ARCHETYPE_OVERRIDES');
  assert.ok(start >= 0, 'таблица исключений не найдена — её переименовали, замок ослеп');
  const end = source.indexOf('\n};', start);
  assert.ok(end > start, 'не найден конец таблицы исключений');
  const body = source
    .slice(source.indexOf('{', start) + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const entries = [...body.matchAll(/([A-Za-z0-9_]+)\s*:\s*'([a-z_]+)'/g)].map(m => [m[1], m[2]] as const);
  const table = Object.fromEntries(entries);

  assert.deepEqual(table, {
    chainsaw: 'chainsaw',
    nailgun: 'smg',
    harpoon_gun: 'rifle',
    shmk_disposable: 'launcher',
    bayonet: 'blade',
  }, 'таблица исключений изменилась: правило чинят таблицей вместо правила');

  // Мёртвая строка исключения молчит так же, как молчит неверный вывод:
  // переименовали ствол — исключение перестало срабатывать, и никто не узнал.
  for (const [id, archetype] of entries) {
    assert.ok(WEAPON_STATS[id], `исключение ${id} не соответствует ни одной вещи`);
    assert.equal(viewmodelArchetype('weapon', id), archetype, `исключение ${id} не доезжает до вывода`);
  }
});

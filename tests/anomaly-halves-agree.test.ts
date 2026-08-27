import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/* Две половины одной аномалии обязаны договориться.
 *
 * Аномалия живёт двумя файлами: `gen/procedural_anomalies/<id>.ts` вырубает её
 * при постройке этажа, `systems/procedural_anomalies/<id>.ts` растит во время
 * игры. Это НЕ два равнозначных пакета контента (тем повторяться друг с другом
 * положено) — это один пакет, разрезанный по слоям, и числа в нём общие.
 *
 * Цена расхождения, найденная 2026-08-27: у живых тоннелей радиус защиты
 * маршрутного якоря стоял 3 в генерации и 2 в рантайме, при БАЙТ В БАЙТ
 * одинаковой проверке. Генерация отказывалась прорубать в 7×7 вокруг лифта,
 * а живой рост тоннелей отказывался только в 5×5 — значит рантайм съедал ровно
 * то кольцо, которым `stampRouteLiftShafts` прорубает подход к лифту.
 * Инвариант держался на входе в этаж и ломался во время игры, то есть тихо:
 * игрок обнаруживал это, уже стоя перед замурованным лифтом.
 *
 * Слить константу в один модуль нельзя — `systems/` не имеет права импортировать
 * `gen/` по слоевому контракту. Поэтому замок читает исходники: он сверяет
 * ЧИСЛА, а не тянет зависимость.
 *
 * Проверка общая, а не про одну аномалию: любая константа с одинаковым именем
 * в обеих половинах обязана совпадать. Новая аномалия попадает под правило
 * автоматически, без правки этого файла. */

const GEN_DIR = path.join(process.cwd(), 'src/gen/procedural_anomalies');
const SYS_DIR = path.join(process.cwd(), 'src/systems/procedural_anomalies');

/** Числовые константы верхнего уровня модуля: `const NAME = 123;` */
function numericConstants(file: string): Map<string, number> {
  const out = new Map<string, number>();
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/^const ([A-Z][A-Z0-9_]*) = (-?\d+(?:\.\d+)?);/gm)) {
    out.set(m[1], Number(m[2]));
  }
  return out;
}

function twoHalvedAnomalies(): string[] {
  const gen = new Set(fs.readdirSync(GEN_DIR).filter(f => f.endsWith('.ts')));
  return fs.readdirSync(SYS_DIR).filter(f => f.endsWith('.ts') && gen.has(f)).sort();
}

test('у аномалии есть обе половины, и их больше одной', () => {
  const both = twoHalvedAnomalies();
  assert.ok(both.length >= 8, `аномалий с двумя половинами всего ${both.length}`);
});

test('одноимённые числовые константы обеих половин совпадают', () => {
  const mismatches: string[] = [];
  for (const file of twoHalvedAnomalies()) {
    const gen = numericConstants(path.join(GEN_DIR, file));
    const sys = numericConstants(path.join(SYS_DIR, file));
    for (const [name, genValue] of gen) {
      const sysValue = sys.get(name);
      if (sysValue === undefined || sysValue === genValue) continue;
      mismatches.push(`${file}: ${name} — генерация ${genValue}, рантайм ${sysValue}`);
    }
  }
  assert.deepEqual(mismatches, [], 'половины одной аномалии разошлись в числах');
});

test('защита маршрутного якоря объявлена в обеих половинах там, где она есть', () => {
  /* Обратная сторона: константа, тихо пропавшая из рантайма, прошла бы проверку
   * выше — сравнивать было бы не с чем, а лифт остался бы без охраны. */
  const NAME = 'ROUTE_ANCHOR_PROTECT_RADIUS';
  for (const file of twoHalvedAnomalies()) {
    const gen = numericConstants(path.join(GEN_DIR, file));
    if (!gen.has(NAME)) continue;
    const sys = numericConstants(path.join(SYS_DIR, file));
    assert.ok(sys.has(NAME), `${file}: генерация охраняет якорь, рантайм — нет`);
    assert.equal(sys.get(NAME), gen.get(NAME), `${file}: радиус охраны якоря разошёлся`);
  }
});

/* Кто мутирует геометрию В РАНТАЙМЕ — обязан щадить подход к маршрутному лифту.
 *
 * Прежний замок сверял ДВЕ ПОЛОВИНЫ одной аномалии и потому не видел соседнюю,
 * у которой защиты нет вовсе. Так и оказалось: `living_tunnels` и
 * `sandpile_perekrytie` держали буфер радиусом 3, а `conway_life`,
 * `cement_memory` и `section_shift` защищали ровно клетку лифта — при том что
 * мутация переводит клетку ПОДХОДА. Замер на коллекторах: из четырёх кнопок
 * лифта у одной мутабельный пол стоял вплотную, у двух — в радиусе трёх.
 *
 * Генерация под правило НЕ попадает, и это не поблажка, а порядок шагов:
 * `stampRouteLiftShafts` ставит шахты ПОСЛЕ `applyProceduralAnomalyProfile` и
 * сам прорубает к ним подход. Рантайм же чинить некому — там буфер обязателен.
 *
 * Проверка идёт по исходникам, а не по вызовам: слить константу в общий модуль
 * нельзя (аномалии — равнозначные пакеты контента), но одинаковое число в них
 * обязано быть одинаковым, и ОТСУТСТВИЕ числа у живого мутатора — тоже находка. */
test('рантайм-мутаторы геометрии держат один буфер вокруг маршрутного якоря', () => {
  const RADIUS = 'ROUTE_ANCHOR_PROTECT_RADIUS';
  const mutators: { file: string; radius: number | undefined }[] = [];
  for (const name of fs.readdirSync(SYS_DIR).filter(f => f.endsWith('.ts'))) {
    const file = path.join(SYS_DIR, name);
    const text = fs.readFileSync(file, 'utf8');
    // Живой мутатор: пишет клетки мира И знает про лифт как про помеху.
    if (!text.includes('Feature.LIFT_BUTTON')) continue;
    if (!/world\.cells\[[^\]]*\]\s*=[^=]/.test(text)) continue;
    mutators.push({ file: name, radius: numericConstants(file).get(RADIUS) });
  }
  assert.ok(mutators.length >= 4, `рантайм-мутаторов всего ${mutators.length}`);
  const unguarded = mutators.filter(m => m.radius === undefined).map(m => m.file);
  assert.deepEqual(unguarded, [], 'рантайм-мутатор знает про лифт, но буфера вокруг него не держит');
  const radii = [...new Set(mutators.map(m => m.radius))];
  assert.equal(radii.length, 1, `буфер якоря разошёлся между аномалиями: ${radii}`);
});

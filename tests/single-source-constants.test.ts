/* ── Замки на «одно понятие — один источник» ───────────────────────
 *
 * Каждый тест здесь закрывает пару, которая уже успела разойтись или могла
 * разойтись молча: две шкалы отношений, два предела на один массив, два набора
 * границ обзора карты, рукописная торовая арифметика и адресация комнаты по
 * отображаемому имени. Проверяются ИСХОДНИКИ, а не только поведение: вторая
 * копия числа не ломает ни один сценарий в день своего появления — она ломает
 * его через месяц, когда одну из копий подвинут.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { W } from '../src/core/types';
import { RELATION_MAX, RELATION_MIN, RELATION_UNSET } from '../src/data/relations';
import { DEMOS_SOCIAL_OVERRIDE_CAP } from '../src/data/demos_social';
import {
  FULL_MAP_RADIUS_DEFAULT,
  FULL_MAP_RADIUS_MAX,
  FULL_MAP_RADIUS_MIN,
  clampFullMapRadius,
} from '../src/render/map_ui';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

const SOURCES: readonly { file: string; text: string }[] = sourceFiles(SRC_ROOT)
  .map(file => ({ file: path.relative(SRC_ROOT, file), text: readFileSync(file, 'utf8') }));

/** Все объявления `const NAME = ...` по всему `src/`, с правой частью. */
function declarationsOf(name: string): { file: string; value: string }[] {
  const re = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*([^;]+);`, 'm');
  const out: { file: string; value: string }[] = [];
  for (const { file, text } of SOURCES) {
    const hit = re.exec(text);
    if (hit) out.push({ file, value: hit[1].trim() });
  }
  return out;
}

/* ── 1. Шкала отношений объявлена ровно один раз ───────────────── */

test('шкала отношений живёт только в data/relations.ts', () => {
  for (const name of ['RELATION_UNSET', 'RELATION_MIN', 'RELATION_MAX', 'RELATION_HOSTILE_THRESHOLD']) {
    const decls = declarationsOf(name);
    assert.deepEqual(
      decls.map(d => d.file),
      ['data/relations.ts'],
      `${name} объявлен вне data/relations.ts: ${decls.map(d => d.file).join(', ')}`,
    );
  }
  // «Не задано» обязано лежать ВНЕ рабочего диапазона, иначе кламп его затрёт.
  assert.ok(RELATION_UNSET < RELATION_MIN);
  assert.equal(RELATION_MAX, -RELATION_MIN);
});

test('сейв Демоса клампит отношения той же шкалой, что и рантайм', async () => {
  const { sanitizeDemosSocialSave } = await import('../src/systems/demos_save');
  const restored = sanitizeDemosSocialSave({
    version: 1,
    relationOverrides: [
      { fromAlifeId: 1, targetKind: 'player', value: RELATION_MAX + 500 },
      { fromAlifeId: 2, targetKind: 'player', value: RELATION_MAX },
      { fromAlifeId: 3, targetKind: 'player', value: RELATION_MIN },
      { fromAlifeId: 4, targetKind: 'player', value: RELATION_UNSET },
    ],
  });
  const values = restored.relationOverrides.map(o => o.value);
  // Верхний край зажимается, «не задано» отбрасывается. Ни одно значение из
  // сейва не выходит за ту же шкалу, которой клампит рантайм.
  assert.deepEqual(values, [RELATION_MAX, RELATION_MAX, RELATION_MIN]);
  for (const v of values) assert.ok(v >= RELATION_MIN && v <= RELATION_MAX, `${v} вне шкалы`);
});

/* ── 2. Один предел на массив relationOverrides ────────────────── */

test('предел relationOverrides объявлен один раз и режет рантайм и сейв одинаково', async () => {
  const decls = declarationsOf('DEMOS_SOCIAL_OVERRIDE_CAP');
  assert.deepEqual(decls.map(d => d.file), ['data/demos_social.ts']);
  assert.equal(declarationsOf('DEMOS_RELATION_OVERRIDE_CAP').length, 0,
    'второй предел на тот же массив вернулся — сейв и рантайм разойдутся');

  // Обрезка сейва читает ровно этот предел: переполненный вход усечён до него.
  const { sanitizeDemosSocialSave } = await import('../src/systems/demos_save');
  const overflow = Array.from({ length: DEMOS_SOCIAL_OVERRIDE_CAP + 16 }, (_, i) => ({
    fromAlifeId: i + 1, targetKind: 'player' as const, value: 5,
  }));
  const restored = sanitizeDemosSocialSave({ version: 1, relationOverrides: overflow });
  assert.equal(restored.relationOverrides.length, DEMOS_SOCIAL_OVERRIDE_CAP);
  // Усечение с ХВОСТА: свежие отношения переживают сохранение, а не старые.
  assert.equal(restored.relationOverrides[restored.relationOverrides.length - 1].fromAlifeId, overflow.length);
});

/* ── 3. Границы обзора полной карты ────────────────────────────── */

test('границы обзора полной карты не расходятся между копиями', () => {
  // Пока патч `main.ts` не применён, объявлений два. Разъехаться они не имеют
  // права: одно поле `state.fullMapRadius`, и нарисованный охват обязан совпасть
  // с сохранённым. После патча объявление останется одно, и тест это переживёт.
  for (const name of ['FULL_MAP_RADIUS_DEFAULT', 'FULL_MAP_RADIUS_MIN', 'FULL_MAP_RADIUS_MAX']) {
    const decls = declarationsOf(name);
    assert.ok(decls.length >= 1, `${name} исчез`);
    const values = new Set(decls.map(d => d.value));
    assert.equal(values.size, 1, `${name} разошёлся: ${decls.map(d => `${d.file}=${d.value}`).join(', ')}`);
  }
});

test('clampFullMapRadius держит охват в границах', () => {
  assert.equal(clampFullMapRadius(undefined), FULL_MAP_RADIUS_DEFAULT);
  assert.equal(clampFullMapRadius(Number.NaN), FULL_MAP_RADIUS_DEFAULT);
  assert.equal(clampFullMapRadius('200'), FULL_MAP_RADIUS_DEFAULT);
  assert.equal(clampFullMapRadius(-1e9), FULL_MAP_RADIUS_MIN);
  assert.equal(clampFullMapRadius(1e9), FULL_MAP_RADIUS_MAX);
  assert.equal(clampFullMapRadius(120.4), 120);
  // Охват больше полутора мира на торе бессмысленен: карта начала бы повторяться.
  assert.equal(FULL_MAP_RADIUS_MAX, W / 2);
});

/* ── 4. Ширина мира не переписывается литералом ────────────────── */

test('в правленых файлах нет рукописной торовой арифметики по 1024', () => {
  const watched = ['systems/ai/pathfinding.ts', 'systems/blood_fx.ts', 'world/procedural_screens.ts', 'render/map_ui.ts'];
  for (const rel of watched) {
    const entry = SOURCES.find(s => s.file === rel);
    assert.ok(entry, `${rel} не найден`);
    for (const line of entry.text.split('\n')) {
      const code = line.replace(/\/\/.*$/, '');
      if (/\/\*|\*/.test(line.trim().slice(0, 2))) continue;
      // Разрешены только байтовые бюджеты вида `128 * 1024 * 1024` и размеры
      // буферов; торовая арифметика по литералу — нет.
      assert.ok(!/%\s*1024|1024\s*\)\s*%|<\s*1024|>=\s*1024/.test(code),
        `${rel}: ширина мира переписана литералом — «${line.trim()}»`);
    }
  }
});

test('gotoRoom страхуется по обеим осям, а не по одной', async () => {
  const entry = SOURCES.find(s => s.file === 'systems/ai/pathfinding.ts');
  assert.ok(entry);
  const body = /export function gotoRoom\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(entry.text);
  assert.ok(body, 'gotoRoom не найден');
  const guard = body[1].split('\n').find(line => /return 'not_found'/.test(line) && /e\.[xy]/.test(line));
  assert.ok(guard, 'страховка по координатам исчезла');
  assert.match(guard, /e\.x/, 'страховка смотрит только на одну ось');
  assert.match(guard, /e\.y/, 'страховка смотрит только на одну ось');
  assert.match(guard, /\bW\b/, 'ширина мира переписана литералом');

  // И поведение: порченая координата ЛЮБОЙ оси отменяет заказ дороги.
  const { gotoRoom } = await import('../src/systems/ai/pathfinding');
  const { RoomType } = await import('../src/core/types');
  const world = { rooms: [] } as unknown as import('../src/core/world').World;
  const at = (x: number, y: number) => ({ x, y } as unknown as import('../src/core/types').Entity);
  for (const e of [at(-1, 10), at(W, 10), at(10, -1), at(10, W), at(Number.NaN, 10), at(10, Number.NaN)]) {
    assert.equal(gotoRoom(world, e, RoomType.COMMON), 'not_found');
  }
});

/* ── 5. Комната адресуется defId, а не отображаемым именем ─────── */

test('процедурные экраны не ищут комнату по русскому имени', () => {
  const entry = SOURCES.find(s => s.file === 'world/procedural_screens.ts');
  assert.ok(entry);
  const code = entry.text
    .split('\n')
    .filter(line => !/^\s*(\*|\/\*|\/\/)/.test(line))
    .join('\n');
  assert.ok(!/room[?.]?\.name\s*===/.test(code),
    'сравнение комнаты с отображаемым именем вернулось в горячую логику');
  assert.ok(/room\.defId/.test(code), 'адресация по defId пропала');
  // Приставка ложного укрытия берётся из data, а не печатается второй раз.
  assert.ok(!/'Тихий блок'/.test(code) && !/'Актовый зал'/.test(code),
    'русский литерал имени комнаты вернулся в world/procedural_screens.ts');
});

test('учебный зал получает свой defId — по нему его и отсекают экраны', async () => {
  const { LIVING_NAMED_ROOMS } = await import('../src/gen/living/rooms');
  const { applyNamedRoom } = await import('../src/gen/named_rooms');
  const room = applyNamedRoom(
    { id: 0, name: '', type: 0, x: 0, y: 0, w: 4, h: 4, doors: [] } as unknown as import('../src/core/types').Room,
    'tutor_hall',
    LIVING_NAMED_ROOMS.tutor_hall,
  );
  assert.equal(room.defId, 'tutor_hall');
  // Имя — то самое, по которому раньше шёл поиск: замок ловит и переименование.
  assert.equal(room.name, 'Актовый зал');
});

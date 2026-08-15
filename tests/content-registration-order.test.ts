import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLOT_NPC_ID_ORDER } from '../src/data/npc_plot_ids';
import { allNpcPackages, getPlotNpcCount, getPlotNpcNumericId, getPlotNpcStringId } from '../src/data/npc_packages';
import '../src/content';

/* Замок на регистрацию контента.
 *
 * Раньше числовой plotNpcId выдавался счётчиком в порядке регистрации, а
 * регистрация идёт побочным эффектом импорта. Значит состав и порядок импортов
 * двигали личности: слот 5 у одной точки входа Ольга, у другой кто-то другой,
 * и оверрайд A-Life садился на чужую запись. Порядок заморожен в npc_plot_ids.ts;
 * здесь проверяется, что заморозка держит.
 *
 * Часть проверок запускает отдельные процессы, потому что порядок импортов
 * внутри одного процесса уже зафиксирован первым же тестовым файлом. */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tsxBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const probe = join(root, 'tests', 'content_order_probe.ts');

interface ProbeResult {
  variant: string;
  count: number;
  slots: (string | null)[];
  packages: string[];
  olga: number | null;
  voidClerk: number | null;
  market88: number | null;
}

function runProbe(variant: string): ProbeResult {
  const result = spawnSync(tsxBin, [probe, variant], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(result.status, 0, `пробник "${variant}" упал: ${result.stderr}`);
  const line = (result.stdout ?? '').trim();
  assert.ok(line.startsWith('{'), `пробник "${variant}" не выдал JSON: ${line.slice(0, 400)}`);
  return JSON.parse(line) as ProbeResult;
}

test('canonical plot slot list has no duplicates and no blanks', () => {
  const seen = new Set<string>();
  for (const id of PLOT_NPC_ID_ORDER) {
    assert.ok(id.trim().length > 0, 'пустой id в PLOT_NPC_ID_ORDER');
    assert.equal(seen.has(id), false, `дубликат в PLOT_NPC_ID_ORDER: "${id}"`);
    seen.add(id);
  }
  assert.equal(seen.size, PLOT_NPC_ID_ORDER.length);
});

test('every registered plot package sits in its frozen slot', () => {
  const listed = new Set(PLOT_NPC_ID_ORDER);
  const strays: string[] = [];
  for (const pack of allNpcPackages()) {
    const slot = getPlotNpcNumericId(pack.id);
    assert.notEqual(slot, undefined, `пакет "${pack.id}" зарегистрирован, но слота не получил`);
    if (!listed.has(pack.id)) { strays.push(pack.id); continue; }
    assert.equal(slot, PLOT_NPC_ID_ORDER.indexOf(pack.id) + 1, `пакет "${pack.id}" сел не в свой слот`);
    assert.equal(getPlotNpcStringId(slot!), pack.id);
  }
  assert.deepEqual(strays, [], 'пакеты вне npc_plot_ids.ts: допиши их В КОНЕЦ списка, иначе поедут чужие слоты');
});

test('plot slot ceiling does not grow with the content registry', () => {
  // Диапазон 1..getPlotNpcCount() целиком резервируется в A-Life и по нему
  // работает isPlotNpc. Он обязан быть свойством списка, а не набора импортов.
  assert.equal(getPlotNpcCount(), PLOT_NPC_ID_ORDER.length);
});

test('plot slots do not depend on which module was imported first', () => {
  const base = runProbe('content');
  assert.equal(base.count, PLOT_NPC_ID_ORDER.length);
  assert.deepEqual(base.slots, [...PLOT_NPC_ID_ORDER]);

  for (const variant of ['samosbor', 'design', 'alife', 'quests']) {
    const other = runProbe(variant);
    assert.equal(other.count, base.count, `вариант "${variant}" сдвинул верхнюю границу слотов`);
    assert.deepEqual(other.slots, base.slots, `вариант "${variant}" переставил личности по слотам`);
    assert.deepEqual(other.packages, base.packages, `вариант "${variant}" изменил состав реестра`);
  }
});

test('plot slots survive a registry with no content loaded at all', () => {
  // Самая жёсткая форма: контент не загружен вовсе. Слоты обязаны остаться,
  // потому что это список, а не счётчик. Раньше здесь было 101 вместо 473.
  const bare = runProbe('bare');
  assert.equal(bare.count, PLOT_NPC_ID_ORDER.length);
  assert.deepEqual(bare.slots, [...PLOT_NPC_ID_ORDER]);
  assert.equal(bare.packages.length, 0);
  assert.equal(bare.olga, PLOT_NPC_ID_ORDER.indexOf('olga') + 1);
  assert.equal(bare.voidClerk, PLOT_NPC_ID_ORDER.indexOf('floor20_void_protocol_clerk') + 1);
  assert.equal(bare.market88, PLOT_NPC_ID_ORDER.indexOf('market88_marta_broker') + 1);
});

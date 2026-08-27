/* Запертая дверь обязана называть свой ключ.
 *
 * `doorKeyId` (systems/door_state.ts) читает пустой `keyId` как универсальный
 * предмет `key`: створка со `state: DoorState.LOCKED` и пустым ключом выглядит
 * замком, а открывается первой же связкой, подобранной этажом выше. Умолчание
 * остаётся — менять поведение здесь нечего, — но опереться на него молча
 * генератор больше не может: `scripts/check-invariants.mjs` считает такие места
 * храповиком.
 *
 * Проверяется сама проверка, а не текущее число: скрипт запускается над
 * синтетическим деревом, где замки заведены всеми ловимыми формами, и от него
 * требуется назвать каждую и не тронуть створку с честным ключом.
 */

import test from 'node:test';
import assert from 'node:assert';

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'scripts', 'check-invariants.mjs');

/** Пять форм замка без ключа плюс одна честная створка. */
const PROBE = `
import { DoorState } from '../../core/types';

function probeAddDoor(world: any, room: any, state: DoorState, keyId = ''): void {
  world.doors.set(0, { idx: 0, roomA: room.id, roomB: -1, state, keyId, timer: 0 });
}

function probeSealDoor(world: any, room: any, state: DoorState): void {
  world.doors.set(1, { idx: 1, roomA: room.id, roomB: -1, state, keyId: '', timer: 0 });
}

export function probeLiteralEmptyKey(world: any): void {
  world.doors.set(2, { idx: 2, state: DoorState.LOCKED, roomA: 1, roomB: -1, keyId: '', timer: 0 });
}

export function probeSpecWithoutKey(world: any, room: any): void {
  probeAddRoom(world, { name: 'Проба', doorState: DoorState.LOCKED, room });
}

export function probeHelperDefault(world: any, room: any): void {
  probeAddDoor(world, room, DoorState.LOCKED);
}

export function probeHelperWithoutKeyParam(world: any, room: any): void {
  probeSealDoor(world, room, DoorState.LOCKED);
}

export function probeAssignment(world: any): void {
  const door = world.doors.get(3);
  if (door) door.state = DoorState.LOCKED;
}

export function probeHonestKey(world: any): void {
  world.doors.set(4, { idx: 4, state: DoorState.LOCKED, roomA: 1, roomB: -1, keyId: 'probe_permit', timer: 0 });
}

function probeAddRoom(_world: any, _spec: any): void { /* заглушка */ }
`;

/* Скрипт смотрит на `src/` от своего рабочего каталога, поэтому дерево делается
 * минимальным: точка сборки с честным кадровым циклом (иначе проверка кадра
 * сообщит, что ослепла) и пакет этажа с пробами. */
function runOnProbeTree(probe: string): { code: number; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gigahrush-door-probe-'));
  try {
    fs.mkdirSync(path.join(dir, 'src', 'gen', 'probe'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'main.ts'), 'function gameLoop(): void {\n  requestAnimationFrame(gameLoop);\n}\n');
    fs.writeFileSync(path.join(dir, 'src', 'gen', 'probe', 'doors.ts'), probe);
    try {
      const out = execFileSync('node', [script], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('инвариант называет каждую форму замка без ключа', () => {
  const { code, out } = runOnProbeTree(PROBE);

  assert.equal(code, 1, 'дерево с замками без ключа обязано валить проверку');
  assert.match(out, /Запертая дверь без ключа: 5 мест/, out);

  // Скрипт печатает саму строку-нарушителя, поэтому каждая форма опознаётся
  // по своему коду, а не по номеру строки в пробнике.
  for (const [form, code] of [
    ['литерал двери с пустым keyId', "world.doors.set(2, { idx: 2, state: DoorState.LOCKED"],
    ['спецификация без поля ключа', "doorState: DoorState.LOCKED"],
    ["помощник с умолчанием keyId = ''", 'probeAddDoor(world, room, DoorState.LOCKED)'],
    ['помощник, ключа не принимающий вовсе', 'probeSealDoor(world, room, DoorState.LOCKED)'],
    ['присваивание состояния без ключа рядом', 'door.state = DoorState.LOCKED'],
  ] as const) {
    assert.ok(out.includes(code), `${form}: форма обязана быть названа\n${out}`);
  }

  assert.equal(out.includes('probe_permit'), false, 'створка с честным ключом в список не попадает');
});

test('створка с честным ключом инвариант не трогает', () => {
  const honest = PROBE.slice(0, PROBE.indexOf('export function probeLiteralEmptyKey'))
    + PROBE.slice(PROBE.indexOf('export function probeHonestKey'));
  const { code, out } = runOnProbeTree(honest);

  assert.equal(code, 0, `названный ключ — законная дверь, а не нарушение:\n${out}`);
  assert.equal(out.includes('gen/probe/doors.ts'), false, `честная створка не имеет права попасть в список:\n${out}`);
});

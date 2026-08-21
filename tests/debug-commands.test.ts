import '../src/systems/debug_content';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  debugCommandCount,
  SMOKE_DEBUG_COMMAND_IDS,
  SMOKE_STRESS_HOOK_ID,
  getDebugCommandIds,
  getDebugCommandIndex,
  type DebugCommandId,
} from '../src/systems/debug';

function duplicateIds(ids: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
}

function quotedId(text: string, id: string): boolean {
  return text.includes(`'${id}'`) || text.includes(`"${id}"`);
}

test('debug command ids are unique and resolve to menu indexes', () => {
  const ids = getDebugCommandIds();

  assert.equal(ids.length, debugCommandCount());
  assert.deepEqual(duplicateIds(ids), [], 'debug command ids must be unique');

  ids.forEach((id, index) => {
    assert.equal(getDebugCommandIndex(id), index, `${id} must resolve to its menu index`);
  });
});

test('smoke debug hooks have stable command ids', () => {
  const ids = new Set<DebugCommandId>(getDebugCommandIds());
  const required = Object.values(SMOKE_DEBUG_COMMAND_IDS) as DebugCommandId[];

  assert.deepEqual(
    required.filter(id => !ids.has(id)),
    [],
    'required smoke debug command ids must exist',
  );

  for (const id of required) {
    assert.ok(getDebugCommandIndex(id) >= 0, `${id} must resolve to a debug menu command`);
  }
});

test('revealmap debug command has a stable id', () => {
  assert.ok(getDebugCommandIndex('revealmap') >= 0, 'revealmap must resolve to a debug menu command');
});

test('map editor debug command stays in the top cheat block', () => {
  const ids = getDebugCommandIds();
  const openEditor = getDebugCommandIndex('open_map_editor');
  const teleportLiving = getDebugCommandIndex('teleport_design_z: living');
  const firstDesignTeleport = ids.findIndex(id => id.startsWith('teleport_design_z: '));

  assert.ok(openEditor >= 0, 'open_map_editor must resolve to a debug menu command');
  assert.ok(openEditor < teleportLiving, 'map editor must stay above story-floor teleports');
  assert.ok(firstDesignTeleport < 0 || openEditor < firstDesignTeleport, 'map editor must stay above routed design teleports');
});

test('smoke playability script calls hooks by stable ids', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.resolve(here, '../scripts/smoke-playability.mjs'), 'utf8');
  const required = [
    ...Object.values(SMOKE_DEBUG_COMMAND_IDS),
    SMOKE_STRESS_HOOK_ID,
  ];

  assert.ok(
    source.includes('__gigahrushDebugCommandIndex'),
    'smoke must resolve debug menu commands through the browser lookup API',
  );
  assert.deepEqual(
    required.filter(id => !quotedId(source, id)),
    [],
    'smoke script must use mandatory stable hook ids',
  );
});

test('каждая система, регистрирующая команду, вписана в точку сборки меню', () => {
  /* Команда попадает в меню побочным эффектом импорта. Забытая строка в
   * debug_content.ts не ломает игру (main тянет системы и так), но урезает
   * меню в любом частичном графе и двигает номера команд — а по номеру ходит
   * smoke. Поэтому список сверяется с исходниками, а не поддерживается на
   * доверии. */
  const here = path.dirname(fileURLToPath(import.meta.url));
  const systems = path.resolve(here, '../src/systems');
  const assembly = readFileSync(path.join(systems, 'debug_content.ts'), 'utf8');

  const registrars: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(path.join(dir, entry.name), `${prefix}${entry.name}/`); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      const id = `${prefix}${entry.name.replace(/\.ts$/, '')}`;
      if (id === 'debug' || id === 'debug_registry' || id === 'debug_content') continue;
      const source = readFileSync(path.join(dir, entry.name), 'utf8');
      if (/register(DebugCommand|DebugPanel)\(/.test(source)) registrars.push(id);
    }
  };
  walk(systems, '');

  const missing = registrars.filter(id => !assembly.includes(`import './${id}';`));
  assert.deepEqual(missing, [], 'допишите модули в src/systems/debug_content.ts');
});

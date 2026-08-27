#!/usr/bin/env tsx
/* Дамп строки цели по всем видам адресата: побайтовая сверка ответа индекса с
 * прежним перебором.
 *
 * Выборка нарочно шире живых людей: предмет, монстр, снаряд, убитый (его в
 * индексе живых нет — и раньше он отсеивался проверкой `.alive`), несуществующий
 * номер, задание по слоту и задание без адресата.
 *
 * Запуск: npx tsx scripts/objective_parity_dump.ts <designFloorId> <seed>
 */
import '../src/content';
import { EntityType, QuestType, type Entity, type GameState, type Quest } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { ensureAlifeState, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { buildFloor, createArenaGameState } from '../src/arena_scenarios';
import { getCurrentObjective } from '../src/systems/quests';
import { markEntityIndexDirty, rebuildEntityIndexForSimulation } from '../src/systems/entity_index';

const floorId = process.argv[2] ?? 'living';
const seed = Number(process.argv[3] ?? 1337);

seedGlobalRng(seed);
const scene = buildFloor(floorId, seed);
const state: GameState = createArenaGameState();
state.currentZ = 0;
ensureAlifeState(state);
materializeAlifeFloorPopulation(state, scene.world, scene.entities, scene.nextId, `design:${floorId}`);
rebuildEntityIndexForSimulation(scene.entities, 0);

const out: string[] = [];

function quest(targetNpcId: number | undefined, bySlot: boolean): Quest {
  const q: Record<string, unknown> = {
    id: 1, type: QuestType.TALK, desc: 'проба', done: false,
    giverId: -1, giverName: 'проба', targetNpcId,
  };
  // Адресация по слоту — вторая ветка справки, она не менялась и обязана это доказать.
  if (bySlot) q.sideQuestId = 'probe_side_quest';
  return q as unknown as Quest;
}

function probe(label: string, targetNpcId: number | undefined, bySlot: boolean): void {
  const q = quest(targetNpcId, bySlot);
  state.quests = [q];
  state.activeQuestId = q.id;
  const o = getCurrentObjective(state, scene.entities);
  out.push(`${label}\t${targetNpcId ?? 'none'}\t${bySlot ? 'slot' : 'id'}\t${o === null ? 'null' : `${o.line}|${o.detail ?? ''}|${o.source}|${o.questId}|${o.targetEntityId ?? 'none'}|${o.targetNpcId ?? 'none'}|${o.color}`}`);
}

const byType = new Map<EntityType, Entity[]>();
for (const e of scene.entities) {
  if (!byType.has(e.type)) byType.set(e.type, []);
  byType.get(e.type)!.push(e);
}

for (const [type, list] of [...byType.entries()].sort((a, b) => a[0] - b[0])) {
  // По 40 представителей каждого типа сущностей плюс первый и последний в массиве.
  const step = Math.max(1, Math.floor(list.length / 40));
  for (let i = 0; i < list.length; i += step) {
    probe(`type${type}`, list[i].id, false);
    probe(`type${type}slot`, list[i].id, true);
  }
  probe(`type${type}first`, list[0].id, false);
  probe(`type${type}last`, list[list.length - 1].id, false);
}

// Мёртвые: убиваем каждого сотого и спрашиваем снова — ответ обязан стать пустым.
let killed = 0;
for (let i = 0; i < scene.entities.length; i += 100) {
  const e = scene.entities[i];
  if (e.type !== EntityType.NPC || !e.alive) continue;
  e.alive = false;
  e.hp = 0;
  killed++;
}
markEntityIndexDirty();
rebuildEntityIndexForSimulation(scene.entities, 1);
out.push(`killed\t${killed}`);
for (let i = 0; i < scene.entities.length; i += 100) {
  const e = scene.entities[i];
  if (e.type !== EntityType.NPC) continue;
  probe('dead', e.id, false);
}

probe('missing', 9_000_000, false);
probe('missingSlot', 9_000_000, true);
probe('zero', 0, false);
probe('negative', -1, false);
probe('none', undefined, false);

process.stdout.write(out.join('\n') + '\n');

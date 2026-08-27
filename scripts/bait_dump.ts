#!/usr/bin/env tsx
/* Дамп пути приманки: кто на неё идёт, кто её съедает, кто её не видит.
 *
 * Снимается ДО и ПОСЛЕ раннего выхода при нуле приманок и сверяется построчно.
 * Ранний выход обязан менять только ЦЕНУ пустого списка, а не поведение при
 * живой приманке.
 *
 * Запуск: npx tsx scripts/bait_dump.ts
 */
import '../src/content';
import { Cell, MonsterKind, RoomType, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { placeMonsterBait, resetMonsterBaits, getActiveMonsterBaits } from '../src/systems/monster_bait';
import { updateMonster, setEntityMap } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setListenerPos } from '../src/systems/audio';
import { seedGlobalRng } from '../src/core/rand';
import { ensureFloorRunState } from '../src/systems/procedural_floors';
import { benchMonster, benchPlayer, benchRpg, benchState } from './bench_actors';

function hall(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.roomMap.fill(0);
  world.zoneMap.fill(0);
  world.light.fill(0.2);
  world.zones[0] = { id: 0, cx: 12, cy: 12, faction: 0, hasLift: false, fogged: false, level: 1, hqRoomId: -1 };
  world.rooms[0] = {
    id: 0, type: RoomType.COMMON, x: 4, y: 4, w: 40, h: 40, doors: [], sealed: false,
    name: 'Зал', apartmentId: -1, wallTex: 0, floorTex: 0,
  };
  return world;
}

const KINDS = [
  MonsterKind.TVAR, MonsterKind.OLGOY, MonsterKind.ZOMBIE, MonsterKind.SBORKA,
  MonsterKind.POMOYNY_ROY, MonsterKind.GREEN_DOG, MonsterKind.KRYSNOZHKA,
];
const BAITS: readonly (readonly [string, string, number])[] = [
  ['мясо', 'rawmeat', 2],
  ['говняк', 'govnyak_roll', 1],
  ['нет приманки', '', 0],
];

const lines: string[] = [];

for (const kind of KINDS) {
  for (const [label, defId, count] of BAITS) {
    resetMonsterBaits();
    const world = hall();
    setListenerPos(512, 512, world.dist2.bind(world));
    const state = benchState();
    state.currentZ = 0;
    state.time = 5;
    /* Состояние прогона поднимается ЗАРАНЕЕ и до сида.
     *
     * Иначе его лениво строил сам путь приманки (`monsterBaitFloorKey` →
     * `currentFloorRunEntry` → `ensureFloorRunState`), а нормализация маршрута
     * тянет общий RNG. Ранний выход этот ленивый вызов снимает, и дамп начинал
     * ловить сдвиг ПОТОКА СЛУЧАЙНОСТИ вместо разницы в поведении. */
    ensureFloorRunState(state);
    // Сид на каждый случай: блуждание тварей идёт через общий RNG.
    seedGlobalRng(1337);
    const player = benchPlayer({ id: 1, x: 30, y: 30, hp: 100, maxHp: 100 });
    const e = benchMonster(kind, { id: 3, x: 14, y: 20, rpg: benchRpg() });
    const entities = [player, e];
    rebuildEntityIndex(entities);
    setEntityMap(new Map(entities.map(a => [a.id, a])));
    if (count > 0) placeMonsterBait(state, world, player, 20, 20, defId, count, 'drop', 77);

    const msgs: Msg[] = [];
    let simTime = 5;
    const start = { x: e.x, y: e.y };
    for (let tick = 0; tick < 240; tick++) {
      simTime += 1 / 60;
      state.time = simTime;
      updateMonster(world, entities, e, 1 / 60, simTime, msgs, player.id, { v: 900 }, state);
    }
    const moved = Math.hypot(e.x - start.x, e.y - start.y);
    const toward = Math.hypot(20 - e.x, 20 - e.y);
    lines.push([
      `${MonsterKind[kind]}`.padEnd(14),
      label.padEnd(14),
      `метка=${e.ai?.baitMarkerId ?? '—'}`,
      `осталось=${getActiveMonsterBaits().length}`,
      `прошёл=${moved.toFixed(3)}`,
      `доПриманки=${toward.toFixed(3)}`,
      `цель=${e.ai?.combatTargetId ?? '—'}`,
      `лог=${msgs.map(m => m.text).join(' | ') || '—'}`,
    ].join('  '));
  }
}

console.log(lines.join('\n'));

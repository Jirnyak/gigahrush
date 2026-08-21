/* Замок на две оси социальной связи.
 *
 * ОТНОШЕНИЕ — это ЧИСЛО, и метка «друг/знакомый/враг» из него ВЫВОДИТСЯ. Хранить
 * метку отдельно значит завести второй источник правды, и он разъезжается: так
 * ребро с числом −42 носило метку «враг», хотя порог вражды −64, — и всякая
 * система, читающая метку, считала врагами тех, кто по числу всего лишь неприятен.
 *
 * СВЯЗЬ — это РОД, и он объявляется: родитель, партнёр, коллега, должник,
 * соперник. Из числа он не выводится и не должен: коллега бывает и любимым, и
 * ненавистным. Ручная выдача для авторских личностей работает именно так — задаётся
 * число и род связи, метка идёт следом.
 *
 * Обе оси сходятся в единственной точке записи графа, поэтому здесь проверяется
 * ровно она: что бы ни передал вызывающий, метка соответствует числу.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { type GameState } from '../src/core/types';
import {
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FRIEND,
  DEMOS_EDGE_WORK,
  DemosSocialRoleId,
} from '../src/data/demos_social';
import {
  getFactionRel,
  initFactionRelations,
  RELATION_FRIENDLY_THRESHOLD,
  RELATION_HOSTILE_THRESHOLD,
} from '../src/data/relations';
import { createPrefilledAlifeState, getAlifeNpcRecordSnapshot } from '../src/systems/alife';
import {
  getDemosOutgoingSocialEdges,
  getDemosSocialGraphStats,
  setDemosSocialEdge,
} from '../src/systems/demos_social';

function population(total: number): GameState {
  initFactionRelations();
  const state = { currentZ: 0 } as GameState;
  createPrefilledAlifeState(state, 4242, total, {
    buckets: [{ floorKey: 'design:living', z: -6, targetCount: total, reserved: [] }],
  });
  getDemosSocialGraphStats(state);
  return state;
}

function edgeTo(state: GameState, from: number, to: number) {
  return getDemosOutgoingSocialEdges(state, from).find(e => e.targetKind === 'alife' && e.targetAlifeId === to);
}

test('the attitude tag always follows the number, whatever the caller asked for', () => {
  const state = population(32);

  // Вызывающий настаивает на метке «враг» при вполне мирном числе.
  setDemosSocialEdge(state, 1, 2, -42, DEMOS_EDGE_ENEMY);
  const mild = edgeTo(state, 1, 2);
  assert.ok(mild, 'ребро должно быть записано');
  assert.equal(mild!.relation, -42);
  assert.ok(-42 > RELATION_HOSTILE_THRESHOLD, 'число −42 выше порога вражды и врагом быть не может');
  assert.equal(mild!.flags & DEMOS_EDGE_ENEMY, 0, 'метка вражды поставлена вопреки числу');
  assert.notEqual(mild!.role, DemosSocialRoleId.ENEMY, 'роль «враг» выдана вопреки числу');

  // И наоборот: метки нет, а число враждебное.
  setDemosSocialEdge(state, 1, 3, -100, 0);
  const foe = edgeTo(state, 1, 3);
  assert.ok(foe);
  assert.ok(foe!.relation <= RELATION_HOSTILE_THRESHOLD);
  assert.notEqual(foe!.flags & DEMOS_EDGE_ENEMY, 0, 'враждебное число обязано нести метку вражды');
  assert.equal(foe!.role, DemosSocialRoleId.ENEMY);

  // То же для дружбы.
  setDemosSocialEdge(state, 1, 4, 100, 0);
  const friend = edgeTo(state, 1, 4);
  assert.ok(friend);
  assert.ok(friend!.relation >= RELATION_FRIENDLY_THRESHOLD);
  assert.notEqual(friend!.flags & DEMOS_EDGE_FRIEND, 0);
  assert.equal(friend!.role, DemosSocialRoleId.FRIEND);
});

test('the kind of bond stays declared and survives the number', () => {
  const state = population(32);

  // Коллега — это РОД связи, а не уровень симпатии: он остаётся коллегой и когда
  // его терпеть не могут, и когда с ним дружат.
  setDemosSocialEdge(state, 5, 6, -90, DEMOS_EDGE_WORK);
  const hated = edgeTo(state, 5, 6);
  assert.ok(hated);
  assert.notEqual(hated!.flags & DEMOS_EDGE_WORK, 0, 'род связи не имеет права теряться');
  assert.notEqual(hated!.flags & DEMOS_EDGE_ENEMY, 0, 'а вот метка вражды по числу обязана быть');

  setDemosSocialEdge(state, 5, 7, 110, DEMOS_EDGE_WORK);
  const liked = edgeTo(state, 5, 7);
  assert.ok(liked);
  assert.notEqual(liked!.flags & DEMOS_EDGE_WORK, 0, 'род связи не имеет права теряться');
  assert.notEqual(liked!.flags & DEMOS_EDGE_FRIEND, 0);
});

test('generated edges never carry a tag their number does not support', () => {
  // Весь граф целиком: ни одного ребра, у которого метка спорит с числом.
  const state = population(96);
  let checked = 0;
  for (let id = 1; id <= 96; id++) {
    for (const edge of getDemosOutgoingSocialEdges(state, id)) {
      checked++;
      const hostile = edge.relation <= RELATION_HOSTILE_THRESHOLD;
      const friendly = edge.relation >= RELATION_FRIENDLY_THRESHOLD;
      assert.equal((edge.flags & DEMOS_EDGE_ENEMY) !== 0, hostile,
        `${id}→${edge.targetAlifeId}: число ${edge.relation}, метка вражды ${(edge.flags & DEMOS_EDGE_ENEMY) !== 0}`);
      assert.equal((edge.flags & DEMOS_EDGE_FRIEND) !== 0, friendly,
        `${id}→${edge.targetAlifeId}: число ${edge.relation}, метка дружбы ${(edge.flags & DEMOS_EDGE_FRIEND) !== 0}`);
      if (edge.role === DemosSocialRoleId.ENEMY) assert.equal(hostile, true, 'роль «враг» при невраждебном числе');
      if (edge.role === DemosSocialRoleId.FRIEND) assert.equal(friendly, true, 'роль «друг» при недружеском числе');
    }
  }
  assert.ok(checked > 50, `проверено всего ${checked} рёбер — граф не наполнился`);
});

test('same-faction people never become personal enemies by generation', () => {
  /* Правило владельца: своих по фракции генерация враждовать не заставляет никогда.
   *
   * Держится оно на том, что ВСЕ режимы рёбер считаются от базы отношений фракций,
   * а у своих она 64 — и разброс до порога вражды −64 не достаёт. Ровно один режим
   * (соперничество, долг, неприязнь) раньше базу не читал вовсе и ставил число
   * литералом −42…−111 любой паре: он и делал из сослуживцев смертельных врагов.
   *
   * Между РАЗНЫМИ фракциями личная вражда законна и здесь не проверяется: у чужих
   * база ниже, и до порога разброс достаёт — так и задумано.
   */
  const state = population(400);
  let hostileSameFaction = 0;
  let hostileTotal = 0;
  let checked = 0;

  for (let id = 1; id <= 400; id++) {
    const source = getAlifeNpcRecordSnapshot(state, id);
    if (!source) continue;
    for (const edge of getDemosOutgoingSocialEdges(state, id)) {
      if (edge.targetKind !== 'alife' || edge.targetAlifeId === undefined) continue;
      const target = getAlifeNpcRecordSnapshot(state, edge.targetAlifeId);
      if (!target) continue;
      checked++;
      if (edge.relation > RELATION_HOSTILE_THRESHOLD) continue;
      hostileTotal++;
      if (source.faction === target.faction) hostileSameFaction++;
    }
  }

  assert.ok(checked > 500, `проверено всего ${checked} рёбер — граф не наполнился`);
  assert.equal(hostileSameFaction, 0,
    `${hostileSameFaction} враждебных рёбер внутри одной фракции из ${hostileTotal} враждебных всего`);
  // База своих обязана оставаться выше порога вражды: на ней всё и держится.
  const own = Math.round((getFactionRel(0, 0) + getFactionRel(0, 0)) * 0.25);
  assert.ok(own > RELATION_HOSTILE_THRESHOLD + 64,
    `база своих ${own} слишком близка к порогу вражды ${RELATION_HOSTILE_THRESHOLD}`);
});

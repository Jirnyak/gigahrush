/* Статус — метка на теле, и обвязка у неё ОДНА.
 *
 * До 2026-09-10 у каждой метки была своя: свой поиск в списке, свой upsert,
 * свой потолок длительности, своя обрезка группы и свой проход по истечению.
 * Говняк держал всё это отдельной системой на 337 строк и повторял общую
 * обвязку слово в слово. Механика сведена в `systems/status.ts`, различия
 * переехали в данные (`data/player_statuses.ts`), система говняка удалена.
 *
 * Замок держит КЛАСС: потолки берутся из реестра, а не из вызывающего, и
 * формула руки одна на все метки.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { type Entity, type PlayerStatusId } from '../src/core/types';
import {
  PLAYER_STATUS_DEFS,
  PLAYER_STATUS_GROUP_CAP,
  playerStatusDef,
} from '../src/data/player_statuses';
import {
  applyPlayerStatus,
  expirePlayerStatuses,
  playerStatusAimSpreadMult,
  playerStatusIntensity,
} from '../src/systems/status';
import { makeTestPlayer } from './helpers';

function body(): Entity {
  const e = makeTestPlayer({ x: 1.5, y: 1.5 });
  e.statuses = undefined;
  return e;
}

test('каждая объявленная метка описана в реестре', () => {
  /* Тип `PlayerStatusId` и реестр обязаны совпадать: метка без записи получит
   * бесконечные потолки молча, а запись без метки — мёртвые данные. */
  const declared = Object.keys(PLAYER_STATUS_DEFS) as PlayerStatusId[];
  assert.ok(declared.length >= 6, `меток в реестре ${declared.length}`);
  for (const id of declared) assert.equal(playerStatusDef(id).id, id);
});

test('потолок длительности берётся из реестра, а не из вызывающего', () => {
  const e = body();
  const def = playerStatusDef('govnyak_relief');
  assert.ok(def.durationCap, 'у облегчения пропал потолок — проверка стала пустой');
  /* Просят вчетверо больше потолка. Ядро обязано обрезать само: раньше это
   * делал каждый вызывающий у себя, и потолок жил в трёх местах. */
  const status = applyPlayerStatus(e, 'govnyak_relief', 'govnyak_roll', 100, def.durationCap! * 4, 1);
  assert.equal(status.expiresAt, 100 + def.durationCap!);
});

test('потолок силы берётся из реестра', () => {
  const e = body();
  const def = playerStatusDef('govnyak_cough');
  assert.ok(def.intensityCap, 'у кашля пропал потолок силы');
  const status = applyPlayerStatus(e, 'govnyak_cough', 'govnyak_roll', 0, 10, def.intensityCap! * 10);
  assert.equal(status.intensity, def.intensityCap);
});

test('группа не разрастается сверх своего числа', () => {
  const e = body();
  /* Меток говняка ровно три, и все три законны. Обрезка обязана оставить их
   * все и не пустить четвёртую — но четвёртой в группе и нет, поэтому
   * проверяется само число. */
  applyPlayerStatus(e, 'govnyak_relief', 'govnyak_roll', 0, 10, 1);
  applyPlayerStatus(e, 'govnyak_cough', 'govnyak_roll', 0, 10, 1);
  applyPlayerStatus(e, 'govnyak_debt', 'govnyak_roll', 0, 10, 1);
  const group = (e.statuses ?? []).filter(s => playerStatusDef(s.id)?.group === 'govnyak');
  assert.equal(group.length, 3);
  assert.ok(group.length <= PLAYER_STATUS_GROUP_CAP);
});

test('повторная метка продлевает, а не заводит вторую', () => {
  /* Проверка идёт на метке БЕЗ группы, и это не придирка: у говняка дубль
   * подчищает обрезка группы, поэтому там upsert можно сломать незаметно —
   * первый вариант этого теста стоял на кашле и негативный контроль вышел
   * ПУСТЫМ. Вне группы страж один, и он обязан работать сам. */
  const e = body();
  assert.equal(playerStatusDef('paupsina_web').group, undefined, 'паутина обзавелась группой — контроль снова пуст');
  applyPlayerStatus(e, 'paupsina_web', 'paupsina_web', 0, 20, 1);
  applyPlayerStatus(e, 'paupsina_web', 'paupsina_web', 5, 40, 2);
  const webs = (e.statuses ?? []).filter(s => s.id === 'paupsina_web');
  assert.equal(webs.length, 1, 'вторая метка того же вида — это дубль, а не продление');
  assert.equal(webs[0].startedAt, 0, 'начало держится первой метки');
  assert.equal(playerStatusIntensity(e, 'paupsina_web'), 2);

  /* А в группе за тем же отвечает обрезка — обе стороны правила заперты. */
  const g = body();
  applyPlayerStatus(g, 'govnyak_cough', 'govnyak_roll', 0, 20, 1);
  applyPlayerStatus(g, 'govnyak_cough', 'govnyak_brick', 5, 40, 2);
  assert.equal((g.statuses ?? []).filter(s => s.id === 'govnyak_cough').length, 1);
});

test('истечение снимает метки одним проходом на всё тело', () => {
  const e = body();
  applyPlayerStatus(e, 'govnyak_cough', 'govnyak_roll', 0, 10, 1);
  applyPlayerStatus(e, 'govnyak_debt', 'govnyak_roll', 0, 100, 1);
  const expired: PlayerStatusId[] = [];
  expirePlayerStatuses(e, 50, status => expired.push(status.id));
  assert.deepEqual(expired, ['govnyak_cough']);
  assert.deepEqual((e.statuses ?? []).map(s => s.id), ['govnyak_debt']);
  /* Пустое тело обязано остаться без списка вовсе: пустой массив на каждом
   * акторе мира — это память ни за что. */
  expirePlayerStatuses(e, 500, () => {});
  assert.equal(e.statuses, undefined);
});

test('рука считается одной формулой: дрожь минус твёрдость', () => {
  const e = body();
  assert.equal(playerStatusAimSpreadMult(body()), 1, 'чистое тело — базовый разброс');

  applyPlayerStatus(e, 'govnyak_cough', 'govnyak_roll', 0, 100, 1);
  const shaken = playerStatusAimSpreadMult(e);
  assert.ok(shaken > 1, 'кашель обязан разбалтывать руку');

  applyPlayerStatus(e, 'govnyak_relief', 'govnyak_roll', 0, 100, 1);
  const relieved = playerStatusAimSpreadMult(e);
  assert.ok(relieved < shaken, 'облегчение обязано вычитать из того же числа');
  assert.ok(relieved > 1 - 0.5, 'и не имеет права перекрыть расплату целиком');
});

test('метка без чисел в реестре руку не трогает', () => {
  /* Негативный контроль формулы: паутина, желемышья кожа и споровая дымка
   * объявлены без вкладов в разброс — их множители живут у своих механик и
   * не про руку. Попади они в общую формулу, разброс поехал бы молча. */
  const e = body();
  applyPlayerStatus(e, 'paupsina_web', 'paupsina_web', 0, 100, 3);
  applyPlayerStatus(e, 'zhelemish_skin', 'zhelemish_raw', 0, 100, 3);
  assert.equal(playerStatusAimSpreadMult(e), 1);
});

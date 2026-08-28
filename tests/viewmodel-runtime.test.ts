/**
 * Замок моторики рук (`src/render/viewmodel/runtime.ts`).
 *
 * Моторика — единственная часть вьюмодели, у которой есть память между кадрами,
 * и вся она рендерная: фаза шага, откат отдачи, увод при смене. В сейв не
 * попадает ничего, поэтому сломанную моторику не поймает ни один тест сохранения
 * — её видно только в браузере и только в движении. Отсюда прогон настоящих
 * кадров: `new World()`, обычный объект-актор, шаг `dt = 1/60`.
 *
 * Что здесь закреплено и почему это ломается молча:
 *  - руки ДОСТАЮТСЯ, а не появляются: в первом кадре после сброса их нет;
 *  - покачивание считается от ПРОЙДЕННОГО ПУТИ, а не от времени, поэтому стоящий
 *    актор не качается вовсе;
 *  - выстрел и удар распознаются по СКАЧКУ `attackCd` вверх, без нового события
 *    в геймплее;
 *  - замах проверяется РАНЬШЕ выстрела: кадра `fire` у ближнего боя нет, и
 *    обратный порядок съедал первые полкадра удара;
 *  - смена вещи подменяется на ДНЕ увода, иначе новый ствол выскакивает рывком;
 *  - смена тела (одержимость) сбрасывает моторику, иначе новое тело наследует
 *    чужую отдачу и фазу шага.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { SCR_H, SCR_W } from '../src/render/webgl';
import { resetViewmodel, updateViewmodel, viewmodelFrame } from '../src/render/viewmodel';
import type { ViewmodelFrameState, ViewmodelUpdate } from '../src/render/viewmodel';

/** Один мир на файл: моторика читает из него только свет и путь по тору. */
const world = new World();

/** Кадр в шестидесятую секунды — тот же шаг, с каким игра зовёт моторику. */
const DT = 1 / 60;

function actor(over: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    // Игрок — просто NPC: отдельного типа для тела, чьими глазами смотрят, нет,
    // и вьюмодель ровно поэтому считается от актора, а не от глобала игрока.
    type: EntityType.NPC,
    x: 100,
    y: 100,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    weapon: 'makarov',
    tool: 'flashlight',
    attackCd: 0,
    ...over,
  };
}

/**
 * Один такт моторики. Часы интерфейса по умолчанию СТОЯТ: в покое кадр дышит от
 * `time`, и без этого «стоящий не качается» было бы не отличить от дыхания.
 */
function step(a: Entity, over: Partial<ViewmodelUpdate> = {}): ViewmodelFrameState {
  updateViewmodel({
    actor: a,
    world,
    dt: DT,
    time: 0,
    screenW: SCR_W,
    screenH: SCR_H,
    ambient: 0.5,
    flashlight: 0,
    hidden: false,
    ...over,
  });
  return viewmodelFrame();
}

function run(a: Entity, frames: number, over: Partial<ViewmodelUpdate> = {}): ViewmodelFrameState {
  let out: ViewmodelFrameState = { quads: [] };
  for (let i = 0; i < frames; i++) out = step(a, over);
  return out;
}

function keys(frame: ViewmodelFrameState): string[] {
  return frame.quads.map(q => q.key);
}

function weaponQuad(frame: ViewmodelFrameState) {
  return frame.quads.find(q => q.key.startsWith('weapon|'));
}

test('руки достаются: в первом кадре их нет, через четверть секунды они на месте', () => {
  resetViewmodel();
  const a = actor();

  // Слот стартует полностью уведённым (`swap = 1`), и уведённая рука не
  // рисуется вовсе: квад за краем кадра — это отрисовка, за которую платят
  // каждый кадр и не видят ничего.
  assert.equal(step(a).quads.length, 0, 'в первом кадре руки не должны стоять на месте');

  const settled = run(a, Math.round(0.25 / DT));
  assert.deepEqual(keys(settled), ['tool|flashlight|idle', 'weapon|makarov|idle']);
  // Инструмент рисуется ПЕРВЫМ: оружие по центру перекрывает его, а не наоборот.
  assert.ok(settled.quads[0].key.startsWith('tool|'), 'инструмент обязан идти раньше оружия');
  assert.equal(settled.quads.every(q => !q.additive), true, 'в покое аддитивных квадов нет');
});

test('покачивание идёт от пройденного пути: шаг качает, стояние — нет', () => {
  resetViewmodel();
  const a = actor({ tool: '' });
  run(a, 40);

  const stillX: number[] = [];
  const stillY: number[] = [];
  for (let i = 0; i < 60; i++) {
    const q = weaponQuad(step(a))!;
    stillX.push(q.x);
    stillY.push(q.y);
  }
  // Часы стоят, актор стоит — координата обязана быть мёртвой.
  assert.equal(Math.max(...stillX) - Math.min(...stillX), 0, 'стоящий актор качается');
  assert.equal(Math.max(...stillY) - Math.min(...stillY), 0, 'стоящий актор качается по вертикали');

  const walkX: number[] = [];
  for (let i = 0; i < 60; i++) {
    a.x += 0.06;
    walkX.push(weaponQuad(step(a))!.x);
  }
  const spread = Math.max(...walkX) - Math.min(...walkX);
  assert.ok(spread > 4, `ходьба не даёт покачивания: разброс ${spread.toFixed(2)}`);

  // Тот же путь, пройденный ЧЕРЕЗ ШОВ ТОРА, качает так же: фаза считается по
  // `world.delta`, иначе на шве мира шаг прыгал бы на пол-мира.
  resetViewmodel();
  const seam = actor({ tool: '', x: 0.02, y: 100 });
  run(seam, 40);
  const seamX: number[] = [];
  for (let i = 0; i < 60; i++) {
    seam.x = world.wrap(seam.x - 0.06);
    seamX.push(weaponQuad(step(seam))!.x);
  }
  const seamSpread = Math.max(...seamX) - Math.min(...seamX);
  assert.ok(seamSpread > 4, `шов тора съел покачивание: разброс ${seamSpread.toFixed(2)}`);
  assert.ok(Number.isFinite(seamSpread), 'на шве координата стала нечислом');
});

test('скачок attackCd даёт дальнобойному кадр fire и аддитивную вспышку', () => {
  resetViewmodel();
  const a = actor();
  run(a, 40);

  a.attackCd = 0.5; // ровно то, что ставит применение оружия
  const shot = step(a);
  assert.deepEqual(keys(shot), ['tool|flashlight|idle', 'weapon|makarov|fire', 'viewmodel:flash']);
  // Третий квад — вспышка: она СКЛАДЫВАЕТСЯ со сценой, а не закрывает её.
  const flash = shot.quads[2];
  assert.equal(flash.additive, true, 'вспышка обязана быть аддитивной');
  assert.equal(shot.quads[0].additive, false);
  assert.equal(shot.quads[1].additive, false);
  assert.ok(flash.alpha > 0 && flash.alpha <= 1, `яркость вспышки: ${flash.alpha}`);
  // Квадов в кадре максимум три: инструмент, оружие, вспышка.
  assert.ok(shot.quads.length <= 3, `квадов в кадре стало больше трёх: ${shot.quads.length}`);

  // Вспышка гаснет сама, без второго события.
  const later = run(a, 30);
  assert.deepEqual(keys(later), ['tool|flashlight|idle', 'weapon|makarov|idle']);

  // Падение `attackCd` (обычный отсчёт отката) выстрелом НЕ считается.
  a.attackCd = 0.2;
  assert.deepEqual(keys(step(a)), ['tool|flashlight|idle', 'weapon|makarov|idle'], 'спад отката принят за выстрел');
});

test('тот же скачок у ближнего боя даёт замах, а не выстрел', () => {
  resetViewmodel();
  const a = actor({ weapon: 'sledgehammer', tool: '' });
  run(a, 40);

  a.attackCd = 0.9;
  const swing = step(a);
  // Кадра `fire` у ближнего боя нет вовсе, и проверка в обратном порядке
  // съедала первые полкадра удара, откатывая пилу и топор обратно в покой.
  assert.deepEqual(keys(swing), ['weapon|sledgehammer|swing']);
  // Вспышки у дробящего нет: дуло не объявлено.
  assert.equal(swing.quads.some(q => q.additive), false, 'у кувалды появилась дульная вспышка');

  // Второй такт замаха приходит сам, по затуханию отката.
  const frames = new Set<string>();
  for (let i = 0; i < 20; i++) frames.add(keys(step(a))[0]);
  assert.equal(frames.has('weapon|sledgehammer|swing2'), true, 'второй такт замаха не сыгран');
  assert.equal(frames.has('weapon|sledgehammer|fire'), false, 'ближний бой не имеет права стрелять');
});

test('смена оружия показывает новый ствол на дне увода, а не сразу', () => {
  resetViewmodel();
  const a = actor({ tool: '' });
  run(a, 40);

  const before = weaponQuad(step(a))!;
  a.weapon = 'ak47';

  const seen: string[] = [];
  const ys: number[] = [];
  for (let i = 0; i < 60; i++) {
    const q = weaponQuad(step(a));
    seen.push(q ? q.key : '-');
    if (q) ys.push(q.y);
  }

  const firstNew = seen.findIndex(k => k.includes('ak47'));
  const lastOld = seen.lastIndexOf(seen.find(k => k.includes('makarov'))!);
  assert.ok(firstNew > 0, 'новый ствол не появился вовсе');
  assert.ok(lastOld >= 0 && lastOld < firstNew, 'новый ствол показан раньше, чем убран старый');
  // Между ними обязателен хотя бы один кадр без оружия: подмена происходит на
  // ДНЕ увода. Подмена наверху была бы рывком.
  assert.equal(seen.slice(lastOld + 1, firstNew).every(k => k === '-'), true, 'ствол подменён на полпути');

  // Старый ствол именно УЕЗЖАЕТ вниз, а не гаснет кадром.
  const leaving = ys.slice(0, lastOld + 1);
  assert.ok(leaving[leaving.length - 1] > before.y + 8, `уводу не хватило хода: ${before.y} → ${leaving[leaving.length - 1]}`);
  for (let i = 1; i < leaving.length; i++) {
    assert.ok(leaving[i] >= leaving[i - 1] - 1e-6, 'увод пошёл вверх посреди смены');
  }
});

test('смена тела сбрасывает моторику: одержимость не наследует чужую отдачу', () => {
  resetViewmodel();
  const a = actor();
  run(a, 40);
  a.attackCd = 0.7;
  const shot = step(a);
  assert.equal(keys(shot).includes('weapon|makarov|fire'), true, 'подготовка теста: выстрел не сыгран');

  // Одержимость подменяет ссылку на тело. Руки читаются от актора, поэтому
  // меняются сами; а вот отдача и фаза шага прежнего тела обязаны исчезнуть.
  a.id = 4242;
  a.weapon = 'ak47';
  const swapped = step(a);
  assert.equal(swapped.quads.length, 0, 'новое тело унаследовало руки прежнего');

  const settled = run(a, Math.round(0.25 / DT));
  assert.deepEqual(keys(settled), ['tool|flashlight|idle', 'weapon|ak47|idle']);
});

test('hidden в итоге очищает кадр, но руки уезжают, а не гаснут', () => {
  resetViewmodel();
  const a = actor();
  run(a, 40);

  // Смерть и кат-сцена читаются ДВИЖЕНИЕМ: кадр продолжает собираться, пока
  // руки не ушли за край.
  const leaving = step(a, { hidden: true });
  assert.ok(leaving.quads.length > 0, 'руки погасли кадром вместо увода');

  const gone = run(a, 60, { hidden: true });
  assert.equal(gone.quads.length, 0, 'скрытые руки так и не убрались из кадра');

  // Мёртвый актор уводит руки по тому же пути.
  resetViewmodel();
  const dead = actor({ alive: false });
  assert.equal(run(dead, 60).quads.length, 0, 'у мёртвого актора остались руки');
});

test('пустые руки: справа кулаки, слева ничего', () => {
  resetViewmodel();
  const a = actor({ weapon: '', tool: '' });
  const settled = run(a, 40);
  assert.deepEqual(keys(settled), ['weapon||idle'], 'пустая правая рука обязана быть кулаками');
});

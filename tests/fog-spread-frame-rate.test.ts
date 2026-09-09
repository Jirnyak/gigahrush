/* ── Скорость тумана — свойство мира, а не частоты кадров ──────────
 *
 * `postrelease.md` §3, `#136`. `spreadFog` не принимал `dt` вовсе и делал
 * `FOG_SAMPLES_PER_TICK` выборок КАЖДЫЙ кадр. Беды две, и вторая хуже:
 *   · цена — 128 бросков `rng()` шестьдесят раз в секунду безусловно;
 *   · на плавном железе туман полз ВДВОЕ быстрее, чем на дёргающемся, то есть у
 *     игрока с тридцатью кадрами была другая игра.
 *
 * Замок меряет РАБОТУ ЗА ОДНУ И ТУ ЖЕ СЕКУНДУ игрового времени при разной
 * частоте кадров. Работа считается по броскам общего ГСЧ: `spreadFog` — его
 * единственный потребитель на этом пути, и подменить его снаружи можно только
 * официальным тестовым хуком.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, Feature } from '../src/core/types';
import { World } from '../src/core/world';
import { _overrideRng, _restoreRng } from '../src/core/rand';
import { resetFogSpreadForTests, spreadFogForTests } from '../src/systems/samosbor';

/** Секунда игрового времени, нарезанная на кадры указанной частоты. */
const SECOND = 1;

function foggyWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.features.fill(Feature.NONE);
  // Затравка: без единой туманной клетки расползаться нечему.
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) world.fog[world.idx(512 + dx, 512 + dy)] = 200;
  }
  return world;
}

/** Сколько раз общий ГСЧ дёрнули за секунду игрового времени при данном FPS. */
function rngCallsPerSecond(fps: number): number {
  let calls = 0;
  resetFogSpreadForTests();
  _overrideRng(() => { calls++; return 0.5; });
  try {
    const world = foggyWorld();
    const dt = SECOND / fps;
    for (let frame = 0; frame < fps; frame++) {
      spreadFogForTests(world, dt);
    }
  } finally {
    _restoreRng();
  }
  return calls;
}

test('за одну и ту же секунду туман делает одинаковую работу при любом FPS', () => {
  const at60 = rngCallsPerSecond(60);
  const at30 = rngCallsPerSecond(30);
  const at20 = rngCallsPerSecond(20);

  assert.ok(at60 > 0, 'контроль: при шестидесяти кадрах туман вообще работает');
  /* Допуск дробный: бюджет копится непрерывно, и остаток на границе секунды
   * законен. Важно, что работа НЕ пропорциональна числу кадров. */
  const tolerance = at60 * 0.1;
  assert.ok(Math.abs(at30 - at60) <= tolerance,
    `при 30 кадрах работы ${at30}, при 60 — ${at60}: скорость тумана не должна зависеть от FPS`);

  /* НИЖЕ ТРИДЦАТИ КАДРОВ ПОТОЛОК ВСПЛЕСКА НАЧИНАЕТ КУСАТЬСЯ, и это осознанный
   * размен, а не недоделка: полная скорость держится ровно до тех пор, пока
   * одна порция бюджета укладывается в потолок в две номинальных. Дальше
   * выбирается кадр, а не туман — на двадцати кадрах игроку важнее кадр.
   *
   * Замок это ФИКСИРУЕТ, а не прощает: деградация обязана быть плавной и
   * ограниченной снизу, а не обвалом. До правки на двадцати кадрах туман полз
   * втрое медленнее шестидесяти (2560 против 7680); теперь — на треть. */
  assert.ok(at20 < at60, 'контроль: потолок на двадцати кадрах действительно срабатывает');
  assert.ok(at20 >= at60 * 0.6,
    `при 20 кадрах работы ${at20}, при 60 — ${at60}: просадка глубже трети означает, что потолок задан слишком туго`);
});

test('просевший кадр не оборачивается всплеском без потолка', () => {
  let calls = 0;
  resetFogSpreadForTests();
  _overrideRng(() => { calls++; return 0.5; });
  try {
    const world = foggyWorld();
    // Полсекунды одним кадром — так выглядит подвисание на загрузке.
    spreadFogForTests(world, 0.5);
  } finally {
    _restoreRng();
  }
  assert.ok(calls > 0, 'один длинный кадр всё же должен двигать туман');
  assert.ok(calls <= 256, `всплеск на просевшем кадре: ${calls} бросков, потолок — две номинальных порции`);
});

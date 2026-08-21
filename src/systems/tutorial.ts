/* ── Обучение ──────────────────────────────────────────────────────
 *
 * Флаг `tutorialMode` в игре делает ровно одно: не даёт начаться самосбору, пока
 * обучение идёт (`samosbor.ts`). Всё прочее, что на него смотрит, — подсказки и
 * интерфейсные цели, а не механика.
 *
 * Шаг `tutorialStep` — не сиквенс. Сам сиквенс выводится из состояния мира
 * (`systems/target_guide.ts`, договор в `data/tutorial_start.ts`), а этот счётчик
 * несёт только то, что из мира не выводится: попил игрок или ещё нет. Дальше он
 * стоит на `TOILET` и на ключе, и на двери — поэтому строить на нём шаги нельзя,
 * и попытка такое построить оставила после себя семь недостижимых состояний и
 * подсистему давления, которая не могла сработать ни разу. Снято 2026-08-20.
 *
 * Номера сохранены с пропуском намеренно: `tutorialStep` уезжает в сейв числом, и
 * перенумеровать `DONE` значило бы задним числом переназначить смысл сохранённого.
 */

import { type Entity, type GameState, msg } from '../core/types';

export enum TutorialStep {
  DRINK = 0,
  TOILET = 1,
  DONE = 6,
}

export function logTutorialMsg(state: GameState, text: string, time: number): void {
  const m = msg(text, time, '#fff');
  m.hour = state.clock?.hour ?? 8;
  m.minute = state.clock?.minute ?? 0;
  state.msgs.push(m);
  if (state.msgLog) state.msgLog.push(m);
}

export function startTutorial(state: GameState, player: Entity): void {
  state.tutorialMode = true;
  state.tutorialStep = TutorialStep.DRINK;
  if (player.needs) {
    player.needs.water = 20;
    player.needs.pee = 50;
    player.needs.poo = 50;
  }
  logTutorialMsg(state, '-где я?', state.time + 15);
  logTutorialMsg(state, '-я хочу пить', state.time + 15);
}

export function completeTutorial(state: GameState): void {
  if (!state.tutorialMode) return;
  state.tutorialMode = false;
  state.tutorialStep = TutorialStep.DONE;
  state.msgs.push(msg('Обучение завершено. Вы предоставлены сами себе.', state.time, '#8fc'));
}

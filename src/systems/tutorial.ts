import { type Entity, type GameState, msg } from '../core/types';
import { recordPlayerDamage } from './damage';
import { registerContentRuntimeHook } from './content_hooks';

export enum TutorialStep {
  DRINK = 0,
  TOILET = 1,
  EAT = 2,
  WORK = 3,
  SAMOSBOR = 4,
  ESCAPE = 5,
  DONE = 6,
  FIND_KEY = 7,
  UNLOCK_DOOR = 8,
  EXIT_APARTMENT = 9,
}

export function advanceTutorial(state: GameState, step: TutorialStep): void {
  if (!state.tutorialMode) return;
  state.tutorialStep = step;
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

export function updateTutorialPressure(state: GameState, dt: number): void {
  if (state.tutorialStep === TutorialStep.UNLOCK_DOOR || state.tutorialStep === TutorialStep.FIND_KEY) {
    const prevTimer = state.tutorialExitTimer ?? 0;
    state.tutorialExitTimer = prevTimer + dt;

    if (prevTimer < 30 && state.tutorialExitTimer >= 30) {
      state.msgs.push(msg('В коридорах что-то гудит. Надо спешить.', state.time, '#f84'));
    }

    if (state.tutorialExitTimer > 60 && Math.floor(state.tutorialExitTimer) > Math.floor(prevTimer)) {
      recordPlayerDamage(state, undefined, 1, 'tutorial_fog');
    }
  }
}

registerContentRuntimeHook({
  id: 'tutorial_pressure',
  phases: ['floor_activity'],
  update: (ctx) => {
    if (ctx.state.tutorialMode) {
      updateTutorialPressure(ctx.state, ctx.dt);
    }
    return {};
  }
});

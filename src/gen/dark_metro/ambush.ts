/* ── Тёмная пересадка слышит собственные подсказки ────────────────
 * Два предупреждения о засаде (`DARK_METRO_AMBUSH_CUES`) были написаны и не
 * доходили до мира: `publishDarkMetroAmbushWarning` не звали ни разу. Игрок
 * видел строку в журнале, а мир не знал, что игрока предупредили, — то есть
 * контрплей не был обучаемым, он был разовым текстом.
 *
 * Своего рантайма заводить не нужно: маркер маршрутной подсказки УЖЕ публикует
 * `rumor_observed` с тегом `route_cue` и `data.cueId` (`systems/route_cues.ts`,
 * `publishCueEvent`). Этаж просто слушает общий факт и добавляет свой — тем же
 * механизмом, что `gen/void/maronary_signalshchik.ts`. Ребра `systems → gen`
 * при этом не возникает: подписка идёт снизу вверх.
 */

import { type WorldEvent, type GameState, type Faction } from '../../core/types';
import { registerWorldEventObserver as observeWorldEvents } from '../../systems/events';
import {
  DARK_METRO_Z,
  publishDarkMetroAmbushWarning,
  type DarkMetroAmbushCueId,
} from './meta';

/**
 * Какая подсказка чью засаду объявляет.
 *
 * Белые лампы — маркер обрыва света перед слепым тоннелем, один к одному.
 * Красное табло неверной посадки — тот самый стрелочный панельный маркер:
 * он покупает короткий ход и он же вправе объявить чужую остановку.
 */
const CUE_TO_AMBUSH: Readonly<Record<string, DarkMetroAmbushCueId>> = {
  dark_metro_white_lamp_ambush: 'dark_metro_white_lamp_ambush',
  dark_metro_service_floor_shortcut: 'dark_metro_red_panel_wrong_stop',
};

/** Услышал и пошёл смотреть — оба считаются предупреждением; проигнорировал — нет. */
const WARNING_ACTIONS = new Set(['heard', 'inspected', 'followed']);

function handleRouteCue(state: GameState, event: WorldEvent): void {
  if (event.type !== 'rumor_observed') return;
  if (!event.tags.includes('route_cue')) return;
  // Сторож этажа первой строкой: подсказки маршрута есть на всех этажах.
  if (event.z !== DARK_METRO_Z) return;
  const cueId = event.data?.cueId;
  if (typeof cueId !== 'string') return;
  const ambushId = CUE_TO_AMBUSH[cueId];
  if (!ambushId) return;
  const action = event.data?.action;
  if (typeof action !== 'string' || !WARNING_ACTIONS.has(action)) return;

  publishDarkMetroAmbushWarning(state, ambushId, {
    zoneId: event.zoneId,
    x: event.x,
    y: event.y,
    actorId: event.actorId,
    actorName: event.actorName,
    actorFaction: event.actorFaction as Faction | undefined,
  });
}

observeWorldEvents(handleRouteCue);

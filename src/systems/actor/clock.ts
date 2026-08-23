import type { GameClock } from '../../core/types';

/**
 * Третий род входа в счёт драйва: ОБЩИЙ ТАКТ ЭТАЖА.
 *
 * `needs` — это тело, `senses` — восприятие; ни то, ни другое не знает, который
 * час, а смена начинается по часам. Здесь всё, что одинаково у всех на этаже в
 * этот кадр и меняет распорядок сразу у всех: минута суток и объявленный
 * самосбор.
 *
 * Снимок ОДИН на кадр, а не на актора: время у всех одно, и считать его на
 * каждого значило бы платить за то, что не может отличаться. Личное в
 * распорядке — не время, а СДВИГ СМЕНЫ, и он выводится из личности прямо в
 * формуле драйва (`drives.ts`, `routinePhase`).
 *
 * Ни одного обращения к миру и ни одной аллокации на вызов, как у соседей.
 */
export interface ActorClock {
  /** Минута суток, 0..1439. Единственный вход, от которого висит распорядок. */
  minuteOfDay: number;
  /**
   * Объявлен самосбор. Не «опасность вокруг» (её несут поля), а факт этажа:
   * смена отменяется у всех разом, кто бы где ни стоял.
   */
  samosbor: boolean;
}

export function createActorClock(): ActorClock {
  return { minuteOfDay: 0, samosbor: false };
}

/**
 * Заполнить снимок. Минута суток берётся из часов ровно так же, как её брал
 * прежний слой распорядка (`hour * 60 + minute`), — вторая формула того же
 * времени разошлась бы с первой на любой правке хода часов.
 */
export function readActorClock(
  clock: GameClock | undefined, samosbor: boolean, out: ActorClock,
): ActorClock {
  const hour = clock?.hour;
  const minute = clock?.minute;
  out.minuteOfDay = typeof hour === 'number' && typeof minute === 'number'
    && Number.isFinite(hour) && Number.isFinite(minute)
    ? ((hour * 60 + minute) % 1440 + 1440) % 1440
    : 0;
  out.samosbor = samosbor === true;
  return out;
}

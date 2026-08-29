/* ── Поводок места: актор, привязанный к комнате или к кругу ───────
 *
 * НАЗНАЧЕНИЕ: сказать «этот человек до такой-то минуты не выходит отсюда» — и
 * не отнять у него при этом ничего другого. Внутри комнаты он живёт как все:
 * думает ядром актора, ходит по комнате, ест из карманов, работает, отвечает на
 * удар, говорит. Поводок отвечает ровно на один вопрос — можно ли назначить ему
 * дорогу за порог, — и больше ни на что не влияет.
 *
 * Почему это НЕ `ai.homeRoomId`. То поле уже занято и означает другое: мягкий
 * поводок территориальной стаи (`ai/monster.ts`, шестнадцать клеток, отпускает
 * в погоню). Сделать его жёстким значило бы запретить территориалам гнаться —
 * регрессия ради чужой задачи. Два разных смысла на одном поле не живут.
 *
 * Почему WeakMap, а не поле в ядре. Привязка — свойство роли, а не сущности:
 * поставили на пост, сняли с поста. Заводить под неё поле в `AIState` значило
 * бы дописывать ядро под частный случай.
 *
 * Почему без сохранения и без такта. Срок — АБСОЛЮТНАЯ минута игровых часов, а
 * не остаток, и привязка ставится при спавне. Этаж пересобирается при загрузке,
 * генератор ставит пост заново с тем же сроком, и после перезагрузки на минуте
 * 300 человек досидит ровно до своей 480-й. Снимать привязку тоже некому и
 * незачем: срок проверяется в момент вопроса.
 *
 * Единственный шов исполнения — назначение маршрута (`ai/pathfinding.ts`).
 * Через него проходит ВСЁ, что ходит: и прежний слой, и ядро актора, и мелкие
 * побуждения. Поэтому правил в поводке два, и оба живут там:
 *
 *   стоим дома, цель снаружи  → маршрут не назначается вовсе;
 *   стоим снаружи, цель любая → маршрут ведёт домой.
 *
 * Второе правило важнее, чем кажется: без него вытолкнутый расталкиванием или
 * убежавший от твари человек навсегда встал бы за порогом, потому что дорогу
 * назад ему никто бы не заказал.
 *
 * ── Две формы места, и обе читаются одинаково ─────────────────────
 *
 * КОМНАТА — когда место названо: пост Ольги в медпункте, строй в зале сцены.
 * КРУГ (точка и радиус) — когда место не совпадает ни с какой комнатой: место
 * действия кат-сцены шире своего зала намеренно, бой на форпосте выплёскивается
 * в коридор, а кольцевая волна стоит вообще снаружи.
 *
 * Форма вторая появилась не ради полноты. Круг раньше держали НИТЬЮ — сцена
 * каждый кадр возвращала тело на радиус, — и это правило правило ТЕЛО, оставляя
 * волю целой: ноги шли на работу, нить тянула к якорю, оба шага случались в
 * одном кадре, человек стоял на месте и дрожал. Замерено на прологе жилого
 * (`tmp/prologue_jitter_probe.ts`): 13 колебаний в секунду амплитудой в сотую
 * клетки. Спор снимается только здесь — там, где дорога НАЗНАЧАЕТСЯ.
 */

import type { Entity } from '../core/types';

interface ActorLeash {
  /** Комната; `-1` — держит круг. */
  roomId: number;
  x: number;
  y: number;
  radius: number;
  untilMinutes: number;
}

const leashByActor = new WeakMap<Entity, ActorLeash>();

/** Минута игровых часов. Ставится раз в кадр из точки входа AI. */
let nowMinutes = 0;

export function setRoomLeashMinute(totalMinutes: number): void {
  nowMinutes = totalMinutes;
}

/** Поставить на пост: до минуты `untilTotalMinutes` актор не покидает комнату. */
export function bindActorToRoom(e: Entity, roomId: number, untilTotalMinutes: number): void {
  if (roomId < 0 || !Number.isFinite(untilTotalMinutes)) return;
  leashByActor.set(e, { roomId, x: 0, y: 0, radius: 0, untilMinutes: untilTotalMinutes });
}

/**
 * То же, но местом служит круг: до минуты `untilTotalMinutes` актор не уходит
 * дальше `radius` от точки. Для мест, которым не отвечает ни одна комната.
 */
export function bindActorToSpot(
  e: Entity, x: number, y: number, radius: number, untilTotalMinutes: number,
): void {
  if (!(radius > 0) || !Number.isFinite(untilTotalMinutes)) return;
  leashByActor.set(e, { roomId: -1, x, y, radius, untilMinutes: untilTotalMinutes });
}

/** Снять с поста досрочно. Срок снимает сам себя и в этом не нуждается. */
export function releaseActorFromRoom(e: Entity): void {
  leashByActor.delete(e);
}

/** Живая привязка актора, если срок ещё не вышел. */
function liveLeash(e: Entity): ActorLeash | undefined {
  const leash = leashByActor.get(e);
  if (leash === undefined) return undefined;
  if (nowMinutes >= leash.untilMinutes) {
    leashByActor.delete(e);
    return undefined;
  }
  return leash;
}

/** Комната, за порог которой актору сейчас нельзя. `undefined` — свободен или на круге. */
export function actorLeashRoom(e: Entity): number | undefined {
  const leash = liveLeash(e);
  return leash && leash.roomId >= 0 ? leash.roomId : undefined;
}

/** Круг, за который актору сейчас нельзя. `undefined` — свободен или в комнате. */
export function actorLeashSpot(e: Entity): { x: number; y: number; radius: number } | undefined {
  const leash = liveLeash(e);
  return leash && leash.roomId < 0 ? leash : undefined;
}

/** Актор на поводке любой формы: комната, круг — всё равно не свободен. */
export function actorIsLeashed(e: Entity): boolean {
  return liveLeash(e) !== undefined;
}

/** Тестовый сброс: WeakMap переживает файл теста, минута — нет. */
export function resetRoomLeashClockForTests(): void {
  nowMinutes = 0;
}

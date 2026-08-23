import type { Entity, GameState } from '../core/types';
import { ALIFE_ROOM_VISIT_EMPTY, ALIFE_ROOM_VISIT_MEMORY, existingAlifeRoomVisits } from './alife';

/**
 * Где человек только что был.
 *
 * Кольцо последних комнат на ЛИЧНОСТЬ (хранится колонкой A-Life, см.
 * `ALIFE_ROOM_VISIT_MEMORY`), а здесь — доступ к нему из кадра. Ответ нужен
 * обоим слоям выбора комнаты: и прежнему распорядку, и ядру актора, — а
 * заводить второй экземпляр памяти значило бы получить двух людей в одном.
 *
 * Ссылка на колонку подсовывается раз за кадр, тем же приёмом, что у пути, боя
 * и социального графа: чтение идёт тысячи раз за кадр и в состояние лазить не
 * может. Без контекста память просто не читается, и всё кажется новым.
 */

let visits: Uint16Array | undefined;

export function setRoomVisitContext(state?: GameState): void {
  visits = state === undefined ? undefined : existingAlifeRoomVisits(state);
}

function ringBase(e: Entity): number {
  const alifeId = e.alifeId;
  if (visits === undefined || alifeId === undefined || alifeId <= 0) return -1;
  const base = (alifeId - 1) * ALIFE_ROOM_VISIT_MEMORY;
  return base + ALIFE_ROOM_VISIT_MEMORY <= visits.length ? base : -1;
}

/**
 * Отметить, что человек ЗДЕСЬ. Повтор той же комнаты не пишется: кольцо
 * хранит переходы, а не время стояния, иначе шесть тактов в одной кухне
 * стирали бы всю память об этаже.
 */
export function noteRoomVisit(e: Entity, roomId: number | undefined): void {
  if (roomId === undefined || roomId < 0 || roomId >= ALIFE_ROOM_VISIT_EMPTY) return;
  const base = ringBase(e);
  if (base < 0) return;
  const ring = visits!;
  if (ring[base + ALIFE_ROOM_VISIT_MEMORY - 1] === roomId) return;
  // Сдвиг на одну ячейку: самая старая уходит, новая встаёт в конец.
  for (let i = 0; i < ALIFE_ROOM_VISIT_MEMORY - 1; i++) ring[base + i] = ring[base + i + 1];
  ring[base + ALIFE_ROOM_VISIT_MEMORY - 1] = roomId;
}

/** 0..1: единица — на памяти сюда не ходил, ноль — только что оттуда вышел. */
export function roomVisitNovelty(e: Entity, roomId: number): number {
  const base = ringBase(e);
  if (base < 0 || roomId < 0) return 1;
  const ring = visits!;
  for (let i = ALIFE_ROOM_VISIT_MEMORY - 1; i >= 0; i--) {
    if (ring[base + i] === roomId) return (ALIFE_ROOM_VISIT_MEMORY - 1 - i) / ALIFE_ROOM_VISIT_MEMORY;
  }
  return 1;
}

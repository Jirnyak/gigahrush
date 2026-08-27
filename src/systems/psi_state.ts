/* ── Пси-состояние: два предиката сущности и фаза носителя ───────
 *
 * Отдельный лист, а не часть `psi.ts`, и причина архитектурная. Матрица
 * враждебности спрашивает «этот под моим контролем?» и «этот безумен?» из самого
 * горячего скана, а импорт ради двух полей тянул за собой весь модуль пси-заклятий
 * — и замыкал цикл `combat → combat_stimulus → factions → psi → combat`, стоило
 * пси начать пользоваться единой дверью урона.
 *
 * По той же причине сюда переехал ФЛАГ ФАЗЫ. Его спрашивает урон
 * (`damage.ts`: сквозь фазового не проходит удар обвала), и ровно это
 * единственное ребро `damage → psi` замыкало последний путь обратно в пси —
 * из-за него дверь урона приходилось получать инъекцией через сеттер, а
 * запасной путь без двери считал броню не так, как настоящий. Ребра нет —
 * инъекции и запасного пути тоже нет.
 *
 * Здесь только чтение полей сущности и два флага прогона. Ни заклятий,
 * ни целей, ни таймеров эффектов.
 */

import type { Entity } from '../core/types';

/** Под чьим контролем: свои по пси друг друга не атакуют. */
export function isPsiAlly(a: Entity, b: Entity): boolean {
  if (b.psiControlledBy !== undefined && b.psiControlledBy === a.id) return true;
  if (a.psiControlledBy !== undefined && a.psiControlledBy === b.id) return true;
  // Оба под одним хозяином.
  return a.psiControlledBy !== undefined
    && b.psiControlledBy !== undefined
    && a.psiControlledBy === b.psiControlledBy;
}

/** Безумный бьёт всех без разбора. */
export function isPsiMad(e: Entity): boolean {
  return (e.psiMadness ?? 0) > 0;
}

let phaseTimer = 0;      // остаток фазового сдвига носителя, секунды
let debugNoClip = false; // отладочный сквозной проход

export function isPhaseActive(): boolean { return phaseTimer > 0; }
export function getPhaseTimer(): number { return phaseTimer; }
export function setPhaseTimer(seconds: number): void { phaseTimer = Math.max(0, seconds); }

/** Проходит ли носитель сквозь материю: фаза или отладочный режим. */
export function isNoClipActive(): boolean { return debugNoClip || phaseTimer > 0; }
export function isDebugNoClipEnabled(): boolean { return debugNoClip; }
export function toggleDebugNoClip(): boolean {
  debugNoClip = !debugNoClip;
  return debugNoClip;
}

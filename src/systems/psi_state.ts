/* ── Пси-состояние сущности: два предиката ───────────────────────
 *
 * Отдельный лист, а не часть `psi.ts`, и причина архитектурная. Матрица
 * враждебности спрашивает «этот под моим контролем?» и «этот безумен?» из самого
 * горячего скана, а импорт ради двух полей тянул за собой весь модуль пси-заклятий
 * — и замыкал цикл `combat → combat_stimulus → factions → psi → combat`, стоило
 * пси начать пользоваться единой дверью урона.
 *
 * Здесь только чтение полей сущности. Ни заклятий, ни состояния прогона.
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

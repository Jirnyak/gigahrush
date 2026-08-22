import type { Entity } from '../../core/types';

/* ── Состояние вида живёт рядом с видом ────────────────────────────
 *
 * `AIState` — общая память ЛЮБОГО актора мира: у крысы, у продавца и у босса
 * она одна и та же. Всё, что нужно ровно одному виду (кулдаун его скана,
 * его цель, его таймер), в ней быть не должно: поле платит памятью за каждого
 * актора на этаже, а читатель общего кода не может отличить общее от частного.
 *
 * Здесь один приём на все такие случаи: вид объявляет свою запись, движок
 * держит её в `WeakMap` возле кода вида и отпускает вместе с сущностью.
 * Правило владельца: одно свойство вида — один флаг, а не поле в ядре.
 */

export interface SpeciesState<T extends object> {
  /** Запись актора; создаётся при первом обращении. */
  of(e: Entity): T;
  /** Запись, если она уже есть. Для читателей, которым нечего создавать. */
  peek(e: Entity): T | undefined;
  /** Забыть запись: пересборка вида, смерть, отладка. */
  forget(e: Entity): void;
}

export function speciesState<T extends object>(create: () => T): SpeciesState<T> {
  const byActor = new WeakMap<Entity, T>();
  return {
    of(e: Entity): T {
      let state = byActor.get(e);
      if (!state) {
        state = create();
        byActor.set(e, state);
      }
      return state;
    },
    peek(e: Entity): T | undefined {
      return byActor.get(e);
    },
    forget(e: Entity): void {
      byActor.delete(e);
    },
  };
}

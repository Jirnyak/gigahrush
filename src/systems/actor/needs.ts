import type { Entity } from '../../core/types';

/**
 * Тело актора одним снимком: шесть давлений в 0..1, где ноль — «всё в порядке»,
 * единица — «дальше терпеть нельзя».
 *
 * Здесь нет ни одного обращения к миру: это чистая функция от `Entity`. Тем же
 * снимком пользуются человек, тварь и игрок — асимметрии вида «боль считается
 * только человеку» стать невыразимыми можно только так.
 *
 * Тик самих нужд (убыль еды, переваривание, урон от истощения) живёт в
 * `systems/needs.ts`. Здесь только чтение.
 */

export interface ActorNeeds {
  /** Мало еды. */
  hunger: number;
  /** Мало воды. */
  thirst: number;
  /** Мало сна. */
  sleepiness: number;
  /** Полный пузырь или кишечник — что раньше. */
  bladder: number;
  /** Недостача здоровья. */
  pain: number;
  /**
   * Усталость: сколько сил НЕ осталось. Своего поля у неё нет и заводить его
   * незачем — запас сил это и есть произведение сытости на выспанность, и
   * отдельная шкала только разошлась бы с ними.
   */
  fatigue: number;
  /** Худшее из телесных давлений одним числом: «телу плохо». */
  worst: number;
}

export function createActorNeeds(): ActorNeeds {
  return { hunger: 0, thirst: 0, sleepiness: 0, bladder: 0, pain: 0, fatigue: 0, worst: 0 };
}

/**
 * Кривая нужды со шкалы 0..100, где МЕНЬШЕ значит хуже (еда, вода, сон).
 *
 * Плавная, а не линейная, намеренно: сытый не должен вздрагивать от каждого
 * процента, а голодающий обязан перебить любое дело. Порог — 72 из 100, ниже
 * него давление начинает расти.
 */
export function lowNeedPressure(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return smoothstep(0.18, 0.82, clamp01((72 - value) / 72));
}

/** То же для шкалы, где БОЛЬШЕ значит хуже (пузырь, кишечник). */
export function highNeedPressure(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return smoothstep(0.35, 0.9, clamp01(value / 100));
}

/** Недостача здоровья, 0..1. */
export function painPressure(hp: number | undefined, maxHp: number | undefined): number {
  if (typeof hp !== 'number' || typeof maxHp !== 'number') return 0;
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 0;
  return clamp01(1 - hp / maxHp);
}

/** Заполнить снимок тела. Переиспользует объект: ни одной аллокации на вызов. */
export function readActorNeeds(e: Entity, out: ActorNeeds): ActorNeeds {
  const n = e.needs;
  out.hunger = lowNeedPressure(n?.food);
  out.thirst = lowNeedPressure(n?.water);
  out.sleepiness = lowNeedPressure(n?.sleep);
  out.bladder = Math.max(highNeedPressure(n?.pee), highNeedPressure(n?.poo));
  out.pain = painPressure(e.hp, e.maxHp);
  // Запас сил = сытость × выспанность; усталость — то, чего в нём не хватает.
  out.fatigue = 1 - (1 - out.hunger) * (1 - out.sleepiness);
  out.worst = Math.max(out.hunger, out.thirst, out.sleepiness, out.bladder, out.pain);
  return out;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

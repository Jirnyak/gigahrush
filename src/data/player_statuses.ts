/* ── Реестр статусов игрока ────────────────────────────────────────
 *
 * Статус — это метка на теле со сроком и силой. Их шесть, и до 2026-09-10 у
 * каждого была СВОЯ обвязка: свой поиск в списке, свой upsert, свой потолок
 * длительности, своя обрезка и свой проход по истечению. Говняк держал всё это
 * отдельным модулем на 337 строк, три остальных — россыпью в `systems/status.ts`.
 *
 * Здесь лежат только ДАННЫЕ: сколько статус живёт, насколько силён и что он
 * делает с рукой. Механику одну на всех держит `systems/status.ts`.
 *
 * Ноль полей значит «этот статус так не влияет»: молчание читается как
 * отсутствие, и объявлять единицу вслух не нужно.
 */

import { type PlayerStatusId } from '../core/types';

export interface PlayerStatusDef {
  id: PlayerStatusId;
  /** Потолок длительности, секунды. Без него срок не ограничен. */
  durationCap?: number;
  /** Потолок силы. Без него сила не ограничена. */
  intensityCap?: number;
  /** Прибавка к разбросу за единицу силы: рука дрожит. */
  aimSpreadPerIntensity?: number;
  /** Убавка разброса за единицу силы: рука держит. */
  aimSteadyPerIntensity?: number;
  /** Потолок собственного вклада статуса в разброс — в обе стороны. */
  aimCap?: number;
  /** Группа взаимного вытеснения: статусы одной группы считаются вместе и
   *  обрезаются общим числом. Без группы статус живёт сам по себе. */
  group?: string;
}

/** Сколько статусов ОДНОЙ группы живёт на теле одновременно. */
export const PLAYER_STATUS_GROUP_CAP = 3;

/* Говняк: облегчение против кашля и долга — три метки одной сделки, и обе
 * стороны цены обязаны читаться одной формулой. Вклад облегчения вдвое меньше
 * кашля той же силы: затяжка НЕ обязана перекрывать свою же расплату, иначе
 * сделка перестаёт быть сделкой. Сроки — семьдесят секунд твёрдой руки против
 * трёхсот десяти кашля и четырёхсот восьмидесяти долга. */
const GOVNYAK_GROUP = 'govnyak';

export const PLAYER_STATUS_DEFS: Readonly<Record<PlayerStatusId, PlayerStatusDef>> = {
  govnyak_relief: {
    id: 'govnyak_relief',
    group: GOVNYAK_GROUP,
    durationCap: 70,
    intensityCap: 3,
    aimSteadyPerIntensity: 0.08,
    aimCap: 0.16,
  },
  govnyak_cough: {
    id: 'govnyak_cough',
    group: GOVNYAK_GROUP,
    durationCap: 210,
    intensityCap: 3,
    aimSpreadPerIntensity: 0.16,
    aimCap: 0.75,
  },
  govnyak_debt: {
    id: 'govnyak_debt',
    group: GOVNYAK_GROUP,
    durationCap: 480,
    intensityCap: 3,
    aimSpreadPerIntensity: 0.08,
    aimCap: 0.75,
  },
  /* Три метки ниже пришли из своих механик и обвязки не имели вовсе: у них нет
   * силы, нет потолков и нет группы — только срок. Их множители остались у
   * своих систем, потому что там они не про руку: паутина держит ноги,
   * желемышья кожа меняет лечение и ближний урон, споровая дымка спрашивает
   * противогаз. Реестр знает о них ровно то, что общее. */
  zhelemish_skin: { id: 'zhelemish_skin' },
  paupsina_web: { id: 'paupsina_web' },
  spore_haze: { id: 'spore_haze' },
};

export function playerStatusDef(id: PlayerStatusId): PlayerStatusDef {
  return PLAYER_STATUS_DEFS[id];
}

/** Все метки одной группы. Пустой список — статус вне групп. */
export function playerStatusGroupIds(group: string): PlayerStatusId[] {
  return (Object.keys(PLAYER_STATUS_DEFS) as PlayerStatusId[])
    .filter(id => PLAYER_STATUS_DEFS[id].group === group);
}

/* ── Говняк: что делает затяжка ─────────────────────────────────────
 * Чистые данные сделки. Механика — `systems/status.ts`; своей системы у говняка
 * больше нет, она была 337 строк и повторяла общую обвязку статусов.
 */

export const GOVNYAK_ITEM_IDS = [
  'govnyak_roll',
  'govnyak_brick',
  'govnyak_sample',
  'govnyak_bad_batch',
] as const;

export type GovnyakItemId = typeof GOVNYAK_ITEM_IDS[number];

export interface GovnyakUseDef {
  psiRelief: number;
  thirstCost: number;
  sleepCost: number;
  hpCost: number;
  attackDelay: number;
  reliefSeconds: number;
  coughSeconds: number;
  debt: number;
  debtSeconds: number;
  badChance: number;
  badMadness: number;
}

export const GOVNYAK_USE: Record<GovnyakItemId, GovnyakUseDef> = {
  govnyak_roll: {
    psiRelief: 6, thirstCost: 12, sleepCost: 4, hpCost: 0, attackDelay: 0.15,
    reliefSeconds: 35, coughSeconds: 55, debt: 0.45, debtSeconds: 190, badChance: 0.07, badMadness: 0,
  },
  govnyak_brick: {
    psiRelief: 12, thirstCost: 20, sleepCost: 8, hpCost: 3, attackDelay: 0.3,
    reliefSeconds: 55, coughSeconds: 95, debt: 0.75, debtSeconds: 300, badChance: 0.12, badMadness: 2,
  },
  govnyak_sample: {
    psiRelief: 16, thirstCost: 10, sleepCost: 6, hpCost: 1, attackDelay: 0.2,
    reliefSeconds: 45, coughSeconds: 70, debt: 0.55, debtSeconds: 260, badChance: 0.04, badMadness: 2,
  },
  govnyak_bad_batch: {
    psiRelief: 8, thirstCost: 26, sleepCost: 12, hpCost: 8, attackDelay: 0.6,
    reliefSeconds: 25, coughSeconds: 150, debt: 1.15, debtSeconds: 420, badChance: 1, badMadness: 5,
  },
};


export function isGovnyakItem(defId: string): defId is GovnyakItemId {
  return (GOVNYAK_ITEM_IDS as readonly string[]).includes(defId);
}

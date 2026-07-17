/* ── Underhell design z: ritual thresholds below Hell ─────── */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  
  MonsterKind, QuestType
  
  
  ,
} from '../../core/types';
import { withSeededRandom } from '../../core/rand';
import { registerFloorSideQuest } from '../../data/plot';
import { DESIGN_NPC_HOME_FLOOR_KEY, UNDERHELL_DEFAULT_SEED, UnderhellDesignGeneration, UnderhellGenerationOptions, THRESHOLD_MARFUSHA_DEF, DEBT_CULTIST_DEF, WORDLESS_LIQUIDATOR_DEF, FALSE_YAKOV_DEF } from "./meta";
import { generateUnderhellDesignFloorSeeded } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'underhell_threshold_marfusha', THRESHOLD_MARFUSHA_DEF, [
  {
    id: 'underhell_pay_threshold',
    giverId: getPlotNpcNumericId('underhell_threshold_marfusha')!,
    type: QuestType.FETCH,
    desc: 'Марфуша Постовая: «Пост примет одну из трех плат: флягу с церковной печатью, паспортный корешок или 35 HP кровью. Для журнала принеси флягу, остальные цены отмечены в табличке.»',
    targetItem: 'holy_water', targetCount: 1,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    relationDelta: 8, xpReward: 90,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'underhell_debt_cultist', DEBT_CULTIST_DEF, [
  {
    id: 'underhell_burn_debt',
    giverId: getPlotNpcNumericId('underhell_debt_cultist')!,
    type: QuestType.FETCH,
    desc: 'Иона Долгожог: «Принеси лист с поддельной печатью. Сожжем рыночный долг, но Market 88 и этаж 69 получат слух с плохим хвостом.»',
    targetItem: 'forged_stamp_sheet', targetCount: 1,
    rewardItem: 'water_coupon', rewardCount: 3,
    extraRewards: [{ defId: 'fake_pass', count: 1 }],
    relationDelta: -6, xpReward: 100, moneyReward: 69,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'underhell_wordless_liquidator', WORDLESS_LIQUIDATOR_DEF, [
  {
    id: 'underhell_free_witness',
    giverId: getPlotNpcNumericId('underhell_wordless_liquidator')!,
    type: QuestType.TALK,
    desc: 'Безмолвный ликвидатор просит открыть свидетельскую клетку. Можно вывести свидетеля или замолчать клетку, но оба исхода пишутся событием.',
    targetNpcId: getPlotNpcNumericId('underhell_wordless_liquidator')!,
    rewardItem: 'ammo_9mm', rewardCount: 12,
    extraRewards: [{ defId: 'bandage', count: 2 }],
    relationDelta: 12, xpReward: 80,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'underhell_false_yakov_echo', FALSE_YAKOV_DEF, [
  {
    id: 'underhell_open_void_cut',
    giverId: getPlotNpcNumericId('underhell_false_yakov_echo')!,
    type: QuestType.KILL,
    desc: 'Ложный Яков-эхо: «Разбей идол-якорь в палате якоря. Если пост уже оплачен, разрез к Пустоте откроется сразу.»',
    targetMonsterKind: MonsterKind.IDOL,
    killNeeded: 1,
    rewardItem: 'void_spike', rewardCount: 1,
    relationDelta: 0, xpReward: 160,
  },
]);

export function generateUnderhellDesignFloor(options: UnderhellGenerationOptions = {}): UnderhellDesignGeneration {
  const seed = options.seed ?? UNDERHELL_DEFAULT_SEED;
  return withSeededRandom(seed, () => generateUnderhellDesignFloorSeeded(seed, options.forceOpenVoidGate === true));
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";

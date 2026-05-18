import { Faction, FloorLevel, RoomType } from '../core/types';

export type ZhelemishItemId = 'zhelemish_raw' | 'zhelemish_dried' | 'zhelemish_boiled';
export type ZhelemishForm = 'raw' | 'dried' | 'boiled';
export type ZhelemishTradeRole =
  | 'food'
  | 'medicine_counterfeit'
  | 'reagent'
  | 'cult_interest'
  | 'science_interest';

export interface ZhelemishDef {
  itemId: ZhelemishItemId;
  form: ZhelemishForm;
  name: string;
  tags: readonly string[];
  tradeRoles: readonly ZhelemishTradeRole[];
  preferredFactions: readonly Faction[];
  sourceFloors: readonly FloorLevel[];
  sourceRooms: readonly RoomType[];
  baseValue: number;
  useHint: string;
  riskHint: string;
  questHooks: readonly string[];
}

export const ZHELEMISH_DEFS: readonly ZhelemishDef[] = [
  {
    itemId: 'zhelemish_raw',
    form: 'raw',
    name: 'Сырой желемыш',
    tags: ['zhelemish', 'raw', 'unsafe_use', 'folk_food', 'reagent', 'sample'],
    tradeRoles: ['food', 'reagent', 'science_interest', 'cult_interest'],
    preferredFactions: [Faction.SCIENTIST, Faction.CULTIST, Faction.WILD],
    sourceFloors: [FloorLevel.KVARTIRY, FloorLevel.LIVING],
    sourceRooms: [RoomType.STORAGE, RoomType.BATHROOM],
    baseValue: 5,
    useHint: 'Съесть только от голода или сдать как свежий образец.',
    riskHint: 'Сырой желемыш кормит, но может снять кожу вместе с уверенностью.',
    questHooks: ['cellar_harvest', 'fresh_sample', 'surrender_sample', 'cult_argument'],
  },
  {
    itemId: 'zhelemish_dried',
    form: 'dried',
    name: 'Сушёный желемыш',
    tags: ['zhelemish', 'dried', 'safer_use', 'folk_food', 'bait', 'portable'],
    tradeRoles: ['food', 'reagent', 'cult_interest'],
    preferredFactions: [Faction.CITIZEN, Faction.CULTIST, Faction.WILD],
    sourceFloors: [FloorLevel.KVARTIRY, FloorLevel.LIVING],
    sourceRooms: [RoomType.STORAGE, RoomType.KITCHEN],
    baseValue: 11,
    useHint: 'Носить как бедный сухпай или отдавать тем, кто верит в дублёную кожу.',
    riskHint: 'Сушёный безопаснее сырого, но после него люди держатся дальше.',
    questHooks: ['ration_substitute', 'cult_bait', 'cellar_trade', 'expedition_food'],
  },
  {
    itemId: 'zhelemish_boiled',
    form: 'boiled',
    name: 'Варёный желемыш',
    tags: ['zhelemish', 'boiled', 'safer_use', 'medicine_counterfeit', 'ointment', 'trade'],
    tradeRoles: ['medicine_counterfeit', 'food', 'science_interest'],
    preferredFactions: [Faction.CITIZEN, Faction.SCIENTIST],
    sourceFloors: [FloorLevel.KVARTIRY, FloorLevel.LIVING],
    sourceRooms: [RoomType.KITCHEN, RoomType.MEDICAL],
    baseValue: 16,
    useHint: 'Использовать как дешёвую повязку-обманку, пока настоящей медицины нет.',
    riskHint: 'Варка снимает главный риск, но не делает это лекарством.',
    questHooks: ['fake_medpost', 'medicine_counterfeit', 'triage_shortage', 'nii_comparison'],
  },
];

export const ZHELEMISH_ITEM_IDS: readonly ZhelemishItemId[] = ZHELEMISH_DEFS.map(def => def.itemId);
export const ZHELEMISH_DEF_BY_ITEM_ID = Object.fromEntries(
  ZHELEMISH_DEFS.map(def => [def.itemId, def]),
) as Record<ZhelemishItemId, ZhelemishDef>;

function duplicateStrings(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort();
}

export function getZhelemishDef(itemId: string): ZhelemishDef | undefined {
  return ZHELEMISH_DEF_BY_ITEM_ID[itemId as ZhelemishItemId];
}

export function validateZhelemishDefs(): string[] {
  const problems: string[] = [];
  for (const id of duplicateStrings(ZHELEMISH_ITEM_IDS)) problems.push(`duplicate zhelemish item:${id}`);

  for (const def of ZHELEMISH_DEFS) {
    if (!def.tags.includes('zhelemish')) problems.push(`${def.itemId}:missing zhelemish tag`);
    if (!def.tags.includes(def.form)) problems.push(`${def.itemId}:missing form tag`);
    if (!Number.isInteger(def.baseValue) || def.baseValue < 1) problems.push(`${def.itemId}:baseValue:${def.baseValue}`);
    if (def.tradeRoles.length === 0) problems.push(`${def.itemId}:tradeRoles`);
    if (def.preferredFactions.length === 0) problems.push(`${def.itemId}:preferredFactions`);
    if (def.sourceFloors.length === 0) problems.push(`${def.itemId}:sourceFloors`);
    if (def.sourceRooms.length === 0) problems.push(`${def.itemId}:sourceRooms`);
    if (def.useHint.trim().length < 20) problems.push(`${def.itemId}:useHint`);
    if (def.riskHint.trim().length < 20) problems.push(`${def.itemId}:riskHint`);
    if (def.questHooks.length === 0) problems.push(`${def.itemId}:questHooks`);
  }

  return problems;
}

/* ── Story plot data — quest chain + story NPC definitions ────── */
/* To grow the story:                                              */
/*   1. Add main plot NPC package to npc_plot_packages.ts         */
/*   2. Append steps to PLOT_CHAIN (giver → target / item)        */
/*   3. Create room generator in gen/living/ (optional)            */
/*   4. Add room spec to plot_rooms.ts (optional)                  */

import { getPlotNpcNumericId } from './npc_packages';
import {
  type CharacterSex,
  type Entity,
  type Item,
  type Quest,
  type WorldEventPrivacy,
  type WorldEventSeverity,
  QuestType,
  Faction,
  Occupation,
  MonsterKind,
  } from '../core/types';
import { hashSeed, seededRandom } from '../core/rand';
import type { QuestRouteTarget } from './contracts';
import { designFloorAtZ, designFloorById } from './design_floors';
import { rankMonsterEcology } from './monster_ecology';
import { floorKeyForDesign, floorKeyForProcedural } from './floor_keys';
import { proceduralFloorKey } from './procedural_floors';
import {
  allNpcPackages,
  getNpcPackageByPlotNpcId,
  npcPackageDisplayName,
  plotNpcIdFromPackage,
  registerNpcPackageFromPlotNpc,
  type NpcPackageDef,
} from './npc_packages';


export enum NpcRole { TRADER = 1 }
export const PLOT_NPCS: Record<string, PlotNpcDef & { role?: NpcRole }> = {
  'liq_armorer': {
    name: 'Капитан Броня',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    role: NpcRole.TRADER,
    sprite: 0, hp: 100, maxHp: 100, money: 500, speed: 1.0, inventory: [], talkLines: [], talkLinesPost: []
  },
  'liq_medic': {
    name: 'Доктор Смерть',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.DOCTOR,
    role: NpcRole.TRADER,
    sprite: 0, hp: 100, maxHp: 100, money: 500, speed: 1.0, inventory: [], talkLines: [], talkLinesPost: []
  },
  'liq_quartermaster': {
    name: 'Снабженец Петрович',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.ENGINEER,
    role: NpcRole.TRADER,
    sprite: 0, hp: 100, maxHp: 100, money: 500, speed: 1.0, inventory: [], talkLines: [], talkLinesPost: []
  }
};

/* ── Story NPC definition ─────────────────────────────────────── */
export interface PlotNpcDef {
  name: string;
  firstName?: string;
  lastName?: string;
  patronymic?: string;
  nickname?: string;
  isFemale: boolean;
  age?: number;
  sex?: CharacterSex;
  faction: Faction;
  occupation: Occupation;
  sprite: number;
  /** Optional world sprite scale for authored visual size. */
  spriteScale?: number;
  /** Optional visual generator family; sprite remains the atlas/fallback slot. */
  npcVisualId?: string;
  /** Optional authored AI override; ordinary occupation routine remains fallback. */
  specialRoutineId?: string;
  /** Stable route key where A-Life reserves this authored NPC. */
  homeFloorKey?: string;
  /** Alias of the authored room where this NPC should initially spawn on the home floor. */
  spawnRoomAlias?: string;
  hp?: number;
  maxHp?: number;
  /** Authored RPG level for plot NPCs; omitted NPCs keep the low default. */
  level?: number;
  money: number;
  accountRubles?: number;
  speed?: number;
  weapon?: string;
  inventory: { defId: string; count: number }[];
  /** Compact package tags for authored population/debug surfaces. */
  authoredTags?: readonly string[];
  /** Sequential talk lines (cycled via _plotTalkIdx) */
  talkLines: string[];
  /** Talk lines after plotDone flag is set (random pick) */
  talkLinesPost: string[];
  /** Response when completing a TALK quest targeting this NPC */
  talkQuestResponse?: string | readonly string[];
}

/** Floor key of a route coordinate: `design:<id>` for an authored stop,
 *  `procedural:<key>` for a procedural one. */
export function storyNpcFloorKey(z: number): string {
  const design = designFloorAtZ(z);
  return design ? floorKeyForDesign(design.id) : floorKeyForProcedural(proceduralFloorKey(z));
}

export function designNpcFloorKey(routeId: string): string {
  return routeId.startsWith('design:') ? routeId : `design:${routeId}`;
}

/* ── Story NPC package adapter ───────────────────────────────── */


function cloneItems(items: readonly Item[] | undefined): { defId: string; count: number }[] {
  return (items ?? []).map(item => ({ defId: item.defId, count: item.count }));
}

function cloneQuestResponse(response: string | readonly string[] | undefined): string | readonly string[] | undefined {
  if (Array.isArray(response)) return [...response];
  return response;
}

export function plotNpcDefFromPackage(pack: NpcPackageDef): PlotNpcDef {
  const sex = pack.demographics.sex;
  return {
    name: npcPackageDisplayName(pack),
    isFemale: sex === 'female',
    age: pack.demographics.age,
    sex,
    faction: pack.affiliation.faction,
    occupation: pack.affiliation.occupation,
    sprite: pack.visual.sprite ?? pack.affiliation.occupation,
    npcVisualId: pack.visual.npcVisualId,
    specialRoutineId: pack.runtime?.specialRoutineId,
    homeFloorKey: pack.placement.homeFloorKey,
    hp: pack.runtime?.hp ?? pack.runtime?.maxHp ?? 100,
    maxHp: pack.runtime?.maxHp ?? pack.runtime?.hp ?? 100,
    level: pack.rpg.level,
    money: pack.wealth.cashRubles ?? 0,
    accountRubles: pack.wealth.accountRubles,
    speed: pack.runtime?.speed ?? 1.2,
    weapon: pack.loadout.weapon,
    inventory: cloneItems(pack.loadout.inventory),
    authoredTags: pack.tags,
    talkLines: [...(pack.speech.talkLines ?? [])],
    talkLinesPost: [...(pack.speech.talkLinesPost ?? [])],
    talkQuestResponse: cloneQuestResponse(pack.speech.talkQuestResponse),
  };
}

function plotNpcEntriesFromPackages(packs: readonly NpcPackageDef[]): [number, PlotNpcDef][] {
  return packs.flatMap(pack => {
    const plotNpcId = plotNpcIdFromPackage(pack);
    return plotNpcId !== undefined ? [[plotNpcId, plotNpcDefFromPackage(pack)] as [number, PlotNpcDef]] : [];
  });
}

export function getPlotNpcDef(plotNpcId: string): PlotNpcDef | undefined {
  const numId = getPlotNpcNumericId(plotNpcId);
  const pack = numId !== undefined ? getNpcPackageByPlotNpcId(numId) : undefined;
  return pack ? plotNpcDefFromPackage(pack) : undefined;
}

export function hasPlotNpc(plotNpcId: string): boolean {
  const numId = getPlotNpcNumericId(plotNpcId);
  return numId !== undefined ? getNpcPackageByPlotNpcId(numId) !== undefined : false;
}

export function allPlotNpcEntries(): readonly [number, PlotNpcDef][] {
  return plotNpcEntriesFromPackages(allNpcPackages());
}

export function allPlotNpcIds(): readonly number[] {
  return allPlotNpcEntries().map(([id]) => id);
}

/* ── Жребий трёх образцов НИИ ─────────────────────────────────────
 *
 * Виды, с которых Гущин просит срез, в данных НЕ записаны: они разыгрываются
 * от сида прогона среди тех, у кого есть ненулевой вес спавна. Подсказки, где
 * искать, нет и не будет — это охота, а убийство засчитывается на любом этаже.
 *
 * Почему жребий живёт здесь, а разыгрывает его чужой слой: сид прогона лежит в
 * `state`, а данные `state` не видят по контракту слоёв (`data → core`). Поэтому
 * данные держат сам жребий и тексты, а вызывающий приносит два внешних факта —
 * сид и способ назвать вид по-русски (имена монстров живут в `entities/`, куда
 * данным ходу нет). Вид попадает В КВЕСТ: `generatePlotQuest` копирует
 * `targetMonsterKind` в объект квеста, и после загрузки цель восстанавливается
 * из сейва, а не из шага.
 */
const NII_SAMPLE_TAG = 'nii_sample';
const NII_SAMPLE_KIND_TOKEN = '{вид}';

/** Тексты трёх поручений. `{вид}` подставляет жребий; до него токен виден только тестам. */
const NII_SAMPLE_DESCS: readonly string[] = [
  `Гущин ставит на стол пустую тару: «Первый срез. Мне нужна ткань, и ткань конкретная — ${NII_SAMPLE_KIND_TOKEN}. Свежая, целая, без вашего героического энтузиазма на срезе.»`,
  `«Второй срез, коллега. Теперь ${NII_SAMPLE_KIND_TOKEN}. Не спрашивайте, где искать: я биолог, а не диспетчер лифтов. Они ходят там, где им есть чем питаться.»`,
  `«Третий, и выборка закрыта: ${NII_SAMPLE_KIND_TOKEN}. После него я скажу, на что отвечает ваша пластина, — а до него не скажу ничего, и не уговаривайте.»`,
];

const NII_SAMPLE_HINTS: readonly string[] = [
  `Добыть срез ткани: ${NII_SAMPLE_KIND_TOKEN}. Засчитывается на любом этаже, добить нужно самому.`,
  `Второй образец: ${NII_SAMPLE_KIND_TOKEN}. Тара НИИ у Гущина, если довезти надо целым.`,
  `Последний образец: ${NII_SAMPLE_KIND_TOKEN}. После него Гущин закроет журнал.`,
];

/** Поля шага с образцом, общие для всех трёх: текст, подсказка и метка жребия. */
function niiSampleStep(order: number): Pick<PlotStep, 'desc' | 'targetHint' | 'eventTags'> {
  return {
    desc: NII_SAMPLE_DESCS[order],
    targetHint: NII_SAMPLE_HINTS[order],
    eventTags: ['nii', NII_SAMPLE_TAG, 'black_rune'],
  };
}

/* ── Linear quest chain ──────────────────────────────────────── */
/* Step N is available when all steps 0..N-1 are done AND         */
/* giverId matches the NPC the player is talking to.           */
/* {dir} in desc is auto-replaced with toroidal direction.        */

export const PLOT_CHAIN: PlotStep[] = [
  // Step 0: Olga → talk to Sergeant Barinov
  {
    giverId: getPlotNpcNumericId('olga')!,
    type: QuestType.TALK,
    desc: 'Ольга вычеркнула тебя из мёртвых, теперь иди к сержанту Баринову в оружейную. Он спишет на тебя пистолет и восемь патронов: здесь без железа живут только в сводках потерь.',
    offerObjective: 'Вводная Ольги',
    activeObjective: 'Найти сержанта Баринова в оружейной и получить табельное.',
    targetNpcId: getPlotNpcNumericId('barni')!,
    rewardItem: 'makarov', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }, { defId: 'flashlight', count: 1 }],
    relationDelta: 10, xpReward: 10,
  },
  // Step 1: Sergeant Barinov → report to Olga
  {
    giverId: getPlotNpcNumericId('barni')!,
    type: QuestType.TALK,
    desc: 'Возвращайся к Ольге. Оружие на руках, руки пока целы — пора отрабатывать пайку. Она выдаст бинты с водой и найдет место, где ты закроешь норму.',
    activeObjective: 'Доложить Ольге Дмитриевне об успешном получении оружия.',
    targetNpcId: getPlotNpcNumericId('olga')!,
    rewardItem: 'bandage', rewardCount: 2,
    extraRewards: [{ defId: 'water', count: 2 }, { defId: 'bread', count: 2 }],
    relationDelta: 12, xpReward: 10,
    eventTags: ['craft_recipe_reward'],
    eventData: {
      craftRecipeSourceId: 'quest_barni_range_cleanup',
      craftRecipeIds: ['craft_item_homemade_9mm'],
    },
  },
  // Step 2: Olga → visit Yakov
  {
    giverId: getPlotNpcNumericId('olga')!,
    type: QuestType.TALK,
    desc: 'Ольге нужен курьер до лаборатории Якова Давидовича. Иди {dir}. Старик оформляет слизь после сборов, и ему вечно не хватает людей, чтобы донести банки без трещин.',
    activeObjective: 'Найти лабораторию Якова Давидовича {dir}.',
    targetNpcId: getPlotNpcNumericId('yakov')!,
    rewardItem: 'psi_strike', rewardCount: 1,
    relationDelta: 10, xpReward: 20,
  },
  // Step 3: Yakov → fetch idol
  {
    giverId: getPlotNpcNumericId('yakov')!,
    type: QuestType.FETCH,
    desc: 'Яков просит принести идол Чернобога с этажа: сектанты опять лезут к гермодверям до отбоя. Сдай деревяшку старику, но не вздумай слушать её в лифте.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'psi_mark', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }, { defId: 'pills', count: 2 }],
    relationDelta: 20, xpReward: 50, moneyReward: 50,
  },
  // Step 4: Yakov → talk to Vanka Banchiny
  {
    giverId: getPlotNpcNumericId('yakov')!,
    type: QuestType.TALK,
    desc: 'Идол подтвердил: сажа пахнет не только химией. Яков поднял архивы на бывшего студента Захарова, ныне Ваньку Банчиного. Найди этого сумасшедшего {dir}.',
    targetNpcId: getPlotNpcNumericId('vanka')!,
    rewardItem: 'antidep', rewardCount: 1,
    relationDelta: 15, xpReward: 30,
  },
  // Step 5: Vanka → kill a Shadow monster (Теневик)
  {
    giverId: getPlotNpcNumericId('vanka')!,
    type: QuestType.FETCH,
    desc: 'Ванька боится теней больше, чем комендатуры. Найди и ликвидируй теневика по кличке Петля. Ищи широкое место — в узком коридоре тень оформляет удушье раньше, чем ты достанешь ствол. Принеси сгусток тьмы Ваньке.',
    activeObjective: 'Убить теневика и принести сгусток тьмы Ваньке.',
    targetItem: 'strange_clot', targetCount: 1,
    rewardItem: 'strange_clot', rewardCount: 1,
    extraRewards: [{ defId: 'psi_recall', count: 1 }],
    relationDelta: 20, xpReward: 60,
  },
  // Step 6: Vanka kill done → bring strange clot to Yakov
  {
    giverId: getPlotNpcNumericId('vanka')!,
    type: QuestType.FETCH,
    desc: 'Ванька запечатал сгусток Петли в банку. Тащи её Якову в лабораторию. Главное — не открывай: если сгусток почует воздух, придет новый теневик.',
    activeObjective: 'Отнести сгусток тьмы Якову в лабораторию.',
    targetItem: 'strange_clot', targetCount: 1,
    targetNpcId: getPlotNpcNumericId('yakov')!,
    rewardItem: 'bandage', rewardCount: 3,
    extraRewards: [{ defId: 'pills', count: 1 }],
    relationDelta: 15, xpReward: 40,
  },
  // Step 7: Yakov → down to the liquidator base, meet starshina Blinkov
  {
    giverId: getPlotNpcNumericId('yakov')!,
    type: QuestType.TALK,
    desc: 'Яков закрыл акт, и лишние руки ему больше не нужны. Спускайся на базу ликвидаторов к старшине Блинкову: мы с ним с одного набора. Он один говорит вслух, кого сейчас пускают вниз, а кому только ставят печать.',
    activeObjective: 'Найти старшину Блинкова на Базе Ликвидаторов.',
    targetNpcId: getPlotNpcNumericId('blinkov')!,
    rewardItem: 'psi_rupture', rewardCount: 1,
    relationDelta: 20, xpReward: 60, moneyReward: 80,
    eventTags: ['craft_recipe_reward'],
    eventData: {
      craftRecipeSourceId: 'quest_yakov_field_lab',
      craftRecipeIds: ['craft_item_psi_stabilizer'],
    },
  },
  // Step 8: Blinkov → the lower levels are sealed by order; ask the Ministry
  {
    giverId: getPlotNpcNumericId('blinkov')!,
    type: QuestType.TALK,
    desc: 'Блинков разводит руками: низ закрыт не завалом, а приказом. Самосборы участились, и всё, что ниже промзоны, ходит по спецдопуску. Подписывают наверху. Поднимайся в Министерство и спроси допуск у министра в лицо.',
    activeObjective: 'Подняться в Министерство и спросить спецдопуск у министра Ротенбергова.',
    targetNpcId: getPlotNpcNumericId('rotenbergov')!,
    rewardItem: 'ammo_9mm', rewardCount: 24,
    extraRewards: [{ defId: 'bandage', count: 2 }, { defId: 'gasmask_filter', count: 1 }],
    relationDelta: 14, xpReward: 70, moneyReward: 60,
  },
  // Step 9: Minister → the permit goes nowhere; report to Major Grom yourself
  {
    giverId: getPlotNpcNumericId('rotenbergov')!,
    type: QuestType.TALK,
    desc: 'Министр не поднимает глаз от сметы: спецдопуск выдаёт Партия, запрос уйдёт, срок — как выйдет. Вниз спускайся своим ходом и своей ценой. Доложишься майору Громному в коллекторах — он там ждёт смену дольше, чем бумагу.',
    activeObjective: 'Спуститься в Коллекторы к майору Громному. Дорогу вниз ищи сам.',
    targetNpcId: getPlotNpcNumericId('major_grom')!,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }],
    relationDelta: 10, xpReward: 90, moneyReward: 150,
  },
  // Step 10: Major Grom → kill monsters (defend outpost)
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.KILL,
    desc: 'Форпост Громного сдает позиции. Доведи счет зачистки до десяти, пока они не прорвали периметр. Майор списывает патроны только под трупы.',
    killNeeded: 10,
    rewardItem: 'ak47', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_762', count: 30 }],
    relationDelta: 25, xpReward: 80, moneyReward: 100,
    spawnMonstersOnAccept: 8,
    killPressure: {
      anchor: { kind: 'plot_npc', plotNpcId: 'major_grom' },
      intervalSeconds: 3,
      spawnCountMin: 2,
      spawnCountMax: 3,
      maxAliveNearAnchor: 8,
      radius: 25,
      monsterKinds: [MonsterKind.TVAR, MonsterKind.SBORKA, MonsterKind.ZOMBIE, MonsterKind.SHADOW, MonsterKind.POLZUN],
    },
  },
  // Step 11: Major Grom → storm — kill the Mancobus
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.KILL,
    desc: 'Осада. Твари прут не просто так — массу гонит Манкобус. Найди его {dir} и устрани, иначе они продавят гермы форпоста трупами.',
    targetMonsterKind: MonsterKind.MANCOBUS, killNeeded: 1,
    rewardItem: 'psi_storm', rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 5 }, { defId: 'ammo_762', count: 30 }],
    relationDelta: 30, xpReward: 150, moneyReward: 200,
  },
  // Step 12: Major Grom → go to Ministry for ammo.
  // Здесь же разворачивается Заслонов: тег `zaslonov_betrayal` поднимает
  // событийную сцену предательства на министерском этаже.
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.VISIT,
    desc: 'Нужны патроны. Иди в Министерство, запроси снабжение. И посмотри там на людей: у нас внизу считают, что приказ закрыть низ пришёл не от снабжения.',
    targetFloorZ: 30,
    targetRoute: { designFloorId: 'ministry', label: 'Z+30 Министерство' },
    targetHint: 'Поднимайся лифтами на Z+30: Министерство.',
    visitFloorZ: 30,
    rewardItem: 'ammo_762', rewardCount: 30,
    relationDelta: 20, xpReward: 100,
    eventTags: ['ministry', 'design_route', 'upper_route', 'zaslonov_betrayal'],
    eventData: { routeId: 'ministry', floorZ: 30 },
  },
  // Step 13: рунa с генерала. Дающего нет и быть не может: тот, кто мог бы
  // выдать это поручение, только что перешёл на другую сторону. Шаг закрывается
  // подбором руны, а убийство генерала идёт по общим правилам боя, не скриптом.
  {
    type: QuestType.FETCH,
    sourceLabel: 'Министерство',
    desc: 'Генерал Заслонов увёл своих прямо со смотра, и на шее у него висит чёрная пластина с прорезанной надписью. Пока руна на нём, объяснять случившееся некому. Забери её.',
    activeObjective: 'Забрать чёрную руну у генерала Заслонова.',
    targetItem: 'black_rune', targetCount: 1,
    // Руна возвращается на руки: она нужна дальше — Якову, потом Гущину, потом
    // баку со слизью. Тот же приём держит ветки идола.
    rewardItem: 'black_rune', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_762', count: 30 }, { defId: 'antidep', count: 1 }],
    relationDelta: 8, xpReward: 200,
    eventTags: ['ministry', 'zaslonov_betrayal', 'black_rune', 'cult'],
    eventTargetName: 'Чёрная руна снята с генерала Заслонова.',
  },
  // Step 14: Yakov reads the rune → his old classmate at the Slime Institute
  {
    giverId: getPlotNpcNumericId('yakov')!,
    type: QuestType.TALK,
    desc: 'Яков вертит руну под лампой и впервые не спорит: «Это не Чернобог и не наш алфавит, коллега. Знак живой.» Своих приборов ему мало. В НИИ слизи сидит завлаб Гущин, с которым они делили общежитие и один микроскоп; поднимайся к нему с руной.',
    activeObjective: 'Подняться в НИИ слизи к завлабу Гущину с чёрной руной.',
    targetNpcId: getPlotNpcNumericId('nii_gushchin')!,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 2 }],
    relationDelta: 16, xpReward: 130, moneyReward: 90,
  },
  // Steps 15..17: три образца. Вид каждого разыгрывается от сида прогона —
  // см. `applyPlotSampleLottery` ниже; в данных вида нет и быть не должно.
  {
    giverId: getPlotNpcNumericId('nii_gushchin')!,
    type: QuestType.KILL,
    ...niiSampleStep(0),
    killNeeded: 1,
    rewardItem: 'mutant_tissue_sample', rewardCount: 1,
    extraRewards: [{ defId: 'nii_sample_container', count: 1 }],
    relationDelta: 10, xpReward: 140, moneyReward: 120,
  },
  {
    giverId: getPlotNpcNumericId('nii_gushchin')!,
    type: QuestType.KILL,
    ...niiSampleStep(1),
    killNeeded: 1,
    rewardItem: 'mutant_tissue_sample', rewardCount: 1,
    extraRewards: [{ defId: 'nii_sample_container', count: 1 }, { defId: 'bandage', count: 3 }],
    relationDelta: 10, xpReward: 160, moneyReward: 140,
  },
  {
    giverId: getPlotNpcNumericId('nii_gushchin')!,
    type: QuestType.KILL,
    ...niiSampleStep(2),
    killNeeded: 1,
    rewardItem: 'mutant_tissue_sample', rewardCount: 1,
    extraRewards: [{ defId: 'psi_stabilizer', count: 1 }, { defId: 'antidep', count: 1 }],
    relationDelta: 12, xpReward: 180, moneyReward: 160,
  },
  // Step 18: Gushchin closes the sample series → the answer is below
  {
    giverId: getPlotNpcNumericId('nii_gushchin')!,
    type: QuestType.TALK,
    desc: 'Выборка сошлась. Колония повторяет знак и тянется ко дну бака — всегда ко дну, коллега, при любом освещении. Гущин закрывает журнал: ответ не у него и не в НИИ, ответ под нами. Возвращайся к майору Громному в коллекторы.',
    activeObjective: 'Вернуться к майору Громному в Коллекторы с выводом Гущина.',
    targetNpcId: getPlotNpcNumericId('major_grom')!,
    rewardItem: 'psi_void_needle', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    relationDelta: 12, xpReward: 200, moneyReward: 100,
    eventTags: ['nii', 'black_rune', 'lower_route'],
    eventTargetName: 'Слизь НИИ повторила знак чёрной руны и указала вниз.',
  },
  // Step 19: Major Grom → anchor a Hell foothold
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.VISIT,
    desc: 'Громный переводит тебя в Мясной низ. Найди зону закрепления и удержи её пять минут. Не выходи за створки: твари реагируют на шум быстрее, чем подпишут акт о помощи.',
    rewardItem: 'bandage', rewardCount: 5,
    extraRewards: [{ defId: 'antidep', count: 2 }, { defId: 'ammo_762', count: 20 }],
    relationDelta: 25, xpReward: 180,
    targetFloorZ: -36,
    targetRoute: { z: -36, label: 'Z-36 Мясной низ' },
    targetRoomDefId: 'Зона закрепления',
    targetHint: 'Удерживай позицию "Зона закрепления" в Мясном низу ровно 300 секунд. Выйдешь — таймер сбросится, и всё начнется заново.',
    visitFloorZ: -36,
    holdSeconds: 300,
    holdResetOnExit: true,
    holdSpawnMonsters: 3,
    holdSpawnIntervalSeconds: 18,
    holdSpawnMaxAlive: 12,
    eventTags: ['hell_holdout', 'liquidator_anchor', 'design_route'],
    eventData: { routeId: 'design:hell', floorZ: -36, holdSeconds: 300 },
    eventTargetName: 'Зона закрепления в Мясном низу удержана.',
  },
  // Step 20: Major Grom → go to Podad
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.VISIT,
    desc: 'Зона зачищена, но смена продолжается. Спускайся на Z-40, в Подад. Там стены шевелятся, а лифт вниз заблокирован. Выясни, что держит шахту.',
    rewardItem: 'ammo_762', rewardCount: 24,
    extraRewards: [{ defId: 'bandage', count: 3 }],
    relationDelta: 18, xpReward: 120,
    targetFloorZ: -40,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    targetHint: 'Спускайся лифтами на Z-40: Подад.',
    visitFloorZ: -40,
    eventTags: ['podad', 'design_route', 'lower_route'],
    eventData: { routeId: 'podad', floorZ: -40 },
  },
  // Step 21: Hell contact → talk to Herald watcher in Podad
  {
    giverId: getPlotNpcNumericId('hell_contact')!,
    type: QuestType.TALK,
    desc: 'Подад дышит. Найди Марфу Пороговую {dir}. Она слушает Вестников и знает, почему лифты на нижние уровни глушат вызов.',
    targetNpcId: getPlotNpcNumericId('herald_clue')!,
    rewardItem: 'psi_phase', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    targetFloorZ: -40,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    relationDelta: 8, xpReward: 70,
  },
  // Step 22: Herald clue → kill three Heralds in Podad
  {
    giverId: getPlotNpcNumericId('herald_clue')!,
    type: QuestType.KILL,
    desc: 'Три Вестника держат шахту. Найди их в Подаде и спиши. Пока они дышат, лифты стоят, а тоннели зарастают биомассой прямо по регламенту.',
    targetMonsterKind: MonsterKind.HERALD, killNeeded: 3,
    rewardItem: 'psi_void_needle', rewardCount: 1,
    // Ключ сквозной шахты снимается с Вестников: шаг прямо говорит, что они
    // держат шахту и «пока они дышат, лифты стоят». Он же открывает шов кольца
    // этажей — переход между последним ярусом и крышей.
    extraRewards: [{ defId: 'antidep', count: 2 }, { defId: 'through_shaft_key', count: 1 }],
    targetFloorZ: -40,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    relationDelta: 10, xpReward: 220,
    eventTags: ['podad', 'herald_gate', 'lower_route_unlocked'],
    eventData: { routeId: 'podad', floorZ: -40 },
  },
  // Step 23: Herald clue → descend to the bottom route
  {
    giverId: getPlotNpcNumericId('herald_clue')!,
    type: QuestType.VISIT,
    desc: 'Вестники устранены, шахта свободна. Спускайся до Z-50. В Пустоте голоса больше не обязаны притворяться людьми.',
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    relationDelta: 6, xpReward: 180,
    targetFloorZ: -50,
    targetRoute: { z: -50, label: 'Z-50 Пустота' },
    targetHint: 'Спускайся на Z-50: Пустота.',
    visitFloorZ: -50,
    eventTags: ['below_and_below', 'void_contact', 'design_route'],
    eventData: { routeId: 'design:void', floorZ: -50 },
    eventTargetName: 'Путь ниже открыт до Z-50.',
  },
  // Step 24: порог Пустоты отвечает чужим голосом — забрать банку
  {
    type: QuestType.FETCH,
    sourceLabel: 'Пустота',
    desc: 'Творец вышел на связь чужим голосом. В камере у зелёных стен стоит банка с этим голосом: забери её и держи при себе. Крышку не открывать, даже если банка начнёт торговаться.',
    targetItem: 'bottled_voice', targetCount: 1,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }],
    relationDelta: 6, xpReward: 140,
  },
  // Step 25: списать Творца
  {
    type: QuestType.KILL,
    sourceLabel: 'Пустота',
    desc: 'Пора списывать Творца. Спускайся в Пустоту. [ДАННЫЕ УДАЛЕНЫ]. Держись укрытий между зелёными залпами: этот акт ты подписываешь сам.',
    targetMonsterKind: MonsterKind.CREATOR, killNeeded: 1,
    rewardItem: 'void_spike', rewardCount: 1,
    extraRewards: [{ defId: 'psi_stabilizer', count: 1 }],
    relationDelta: 12, xpReward: 500,
  },
  // Step 26: вынести последствие возвращения
  {
    type: QuestType.FETCH,
    sourceLabel: 'Пустота',
    desc: 'Забери пустотный шип и вынеси его сам. Предъявлять его тут больше некому, а в жилые блоки не тащат то, что не проходит по инвентарной описи.',
    targetItem: 'void_spike', targetCount: 1,
    rewardItem: 'holy_water', rewardCount: 2,
    extraRewards: [{ defId: 'bandage', count: 3 }, { defId: 'antidep', count: 1 }],
    relationDelta: 10, xpReward: 160,
  },
];

/** Шаги с образцами ищутся по метке, а не по номеру: цепочка вправе расти. */
function niiSampleStepIndexes(): number[] {
  const out: number[] = [];
  for (let i = 0; i < PLOT_CHAIN.length; i++) {
    if (PLOT_CHAIN[i].eventTags?.includes(NII_SAMPLE_TAG)) out.push(i);
  }
  return out;
}

/**
 * Три РАЗНЫХ вида, взвешенно по экологии и детерминированно по сиду.
 *
 * `rankMonsterEcology` сама отбрасывает нулевой вес, поэтому «мебельные» виды
 * (гнёзда, башни, псевдолифт, Творец) в жребий не попадают вовсе.
 * `floorAffinity: 'none'` снимает привязку к этажу — охота засчитывается везде,
 * значит и жребий не должен зависеть от того, где игрок стоял в момент выдачи;
 * `z` при этом остаётся обязательным полем запроса и на вес не влияет.
 */
export function plotSampleKindsForSeed(seed: number): MonsterKind[] {
  const pool = rankMonsterEcology({ z: 0, floorAffinity: 'none' })
    .map(entry => ({ kind: entry.kind, weight: entry.weight }));
  const rand = seededRandom(hashSeed('nii_tissue_samples', seed | 0));
  const out: MonsterKind[] = [];
  while (out.length < NII_SAMPLE_DESCS.length && pool.length > 0) {
    let total = 0;
    for (const entry of pool) total += entry.weight;
    let roll = rand() * total;
    let picked = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { picked = i; break; }
    }
    out.push(pool[picked].kind);
    pool.splice(picked, 1);
  }
  return out;
}

/** Сид, на котором тексты уже переписаны. Пересчёт того же сида ничего не стоит. */
let appliedSampleSeed: number | undefined;

/**
 * Разыграть виды образцов от сида прогона.
 *
 * Без `monsterName` (вызов при загрузке модуля) ставится только вид, чтобы
 * данные никогда не несли KILL-шаг без цели; тексты остаются с токеном и будут
 * переписаны первым же настоящим вызовом. Идемпотентно по сиду.
 */
export function applyPlotSampleLottery(seed: number, monsterName?: (kind: MonsterKind) => string): void {
  const normalized = seed | 0;
  if (monsterName && appliedSampleSeed === normalized) return;
  const indexes = niiSampleStepIndexes();
  const kinds = plotSampleKindsForSeed(normalized);
  if (indexes.length !== kinds.length) return;
  for (let n = 0; n < indexes.length; n++) {
    const step = PLOT_CHAIN[indexes[n]];
    step.targetMonsterKind = kinds[n];
    if (!monsterName) continue;
    const name = monsterName(kinds[n]);
    step.desc = NII_SAMPLE_DESCS[n].split(NII_SAMPLE_KIND_TOKEN).join(name);
    step.targetHint = NII_SAMPLE_HINTS[n].split(NII_SAMPLE_KIND_TOKEN).join(name);
  }
  if (monsterName) appliedSampleSeed = normalized;
}

applyPlotSampleLottery(0);

export interface KillPressureAnchorDef {
  kind: 'plot_npc';
  plotNpcId: string;
}

export interface KillPressureDef {
  anchor: KillPressureAnchorDef;
  intervalSeconds: number;
  spawnCountMin: number;
  spawnCountMax: number;
  maxAliveNearAnchor: number;
  radius: number;
  monsterKinds: readonly MonsterKind[];
}

/* ── A single step in the linear story quest chain ───────────── */
export interface PlotStep {
  /**
   * Кому принадлежит поручение. Может отсутствовать: там, где говорить не с кем,
   * шаг выдаёт сама цепочка, как только закрыт предыдущий, и закрывает его дело,
   * а не разговор. Так работает финал в Пустоте — этаж безлюден, и заводить ради
   * трёх поручений личность не нужно.
   */
  giverId?: number;
  /**
   * Authoring-time string id of the giver NPC. Used to resolve `giverId` lazily
   * when the eager `getPlotNpcNumericId()` in a quest literal froze to `undefined`
   * because the giver was not registered yet at literal-eval time (forward reference).
   * Mirrors the runtime save-load resolution in main.ts. Optional; `giverId` wins when valid.
   */
  giverPlotNpcId?: string;
  type: QuestType;
  desc: string;
  /** HUD text before this step is accepted, when the player should find the giver. */
  offerObjective?: string;
  /** HUD text after this step is accepted; falls back to desc. */
  activeObjective?: string;
  targetNpcId?: number;
  targetItem?: string;
  targetCount?: number;
  targetRoomType?: number;
  targetRoomDefId?: string;
  targetFloorZ?: number;
  targetRoute?: QuestRouteTarget;
  targetZoneTag?: string;
  targetHint?: string;
  targetMonsterKind?: MonsterKind;
  killNeeded?: number;
  rewardItem?: string;
  rewardCount?: number;
  extraRewards?: { defId: string; count: number }[];
  relationDelta: number;
  xpReward: number;
  moneyReward?: number;
  eventTags?: string[];
  eventData?: Record<string, unknown>;
  eventPrivacy?: WorldEventPrivacy;
  eventSeverity?: WorldEventSeverity;
  eventTargetName?: string;
  failOnNpcDeathId?: number;
  abandonsSideQuestIds?: string[];
  /** Spawn N hostile monsters around the quest giver when quest is accepted */
  spawnMonstersOnAccept?: number;
  /** Bounded ongoing pressure for authored KILL quests. Runtime timer is transient. */
  killPressure?: KillPressureDef;
  /** Auto-complete VISIT quest when player enters this floor */
  visitFloorZ?: number;
  /** Подпись отправителя для шага без дающего: в журнале это строка «От: …». */
  sourceLabel?: string;
  /** Optional explicit deadline for authored urgent side quests. */
  timeLimitMinutes?: number;
  holdSeconds?: number;
  holdResetOnExit?: boolean;
  holdSpawnMonsters?: number;
  holdSpawnIntervalSeconds?: number;
  holdSpawnMaxAlive?: number;
}

/* ── Side quest definition (independent, no prerequisite chain) ─ */
export interface SideQuestStep extends PlotStep {
  id: string;
  /** Optional plot gate for side content that reacts to main-chain discoveries */
  requiresPlotStepDone?: number;
  /** Optional side-quest gate for local branching content. */
  requiresSideQuestDone?: string | string[];
  /** Hide this offer once any listed side quest has resolved successfully. */
  blockedBySideQuestIds?: string[];
}

/* ── Built-in side branches for story items; content modules append more below. */
export const SIDE_QUESTS: SideQuestStep[] = [
  {
    id: 'idol_ministry_registration',
    giverId: getPlotNpcNumericId('vera_propuskova')!,
    giverPlotNpcId: 'vera_propuskova',
    type: QuestType.FETCH,
    desc: 'Принеси идол Чернобога Вере у окна. Она вернёт идол с корешком; без отметки это улика.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'idol_chernobog', rewardCount: 1,
    extraRewards: [{ defId: 'official_permit_slip', count: 1 }],
    relationDelta: 8, xpReward: 45, moneyReward: 45,
    requiresPlotStepDone: 2,
    eventTargetName: 'Идол Чернобога зарегистрирован в Министерстве и возвращен владельцу.',
    eventSeverity: 4,
    eventPrivacy: 'public',
    eventTags: ['idol_branch', 'chernobog', 'ministry', 'report', 'contraband', 'returned_item', 'craft_recipe_reward'],
    eventData: {
      branch: 'ministry_report',
      mainPlotItemReturned: true,
      suspicionDelta: 1,
      craftRecipeSourceId: 'quest_idol_ministry_registration',
      craftRecipeIds: ['craft_item_blank_form', 'craft_item_seal_wax'],
      rumorIds: ['idol_branch_ministry_report'],
    },
  },
  {
    id: 'idol_liquidator_field_report',
    giverId: getPlotNpcNumericId('polkovnik_streltsov')!,
    giverPlotNpcId: 'polkovnik_streltsov',
    type: QuestType.FETCH,
    desc: 'Покажи идол Стрельцову. Ликвидаторы вернут вещь с жетоном и патронами; лицо попадет в список.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'idol_chernobog', rewardCount: 1,
    extraRewards: [{ defId: 'liquidator_token', count: 1 }, { defId: 'ammo_9mm', count: 12 }],
    relationDelta: 14, xpReward: 60, moneyReward: 90,
    requiresPlotStepDone: 2,
    eventTargetName: 'Ликвидаторы сняли полевой рапорт по идолу и вернули улику.',
    eventSeverity: 4,
    eventPrivacy: 'local',
    eventTags: ['idol_branch', 'chernobog', 'liquidator', 'report', 'suspicion', 'returned_item', 'craft_recipe_reward'],
    eventData: {
      branch: 'liquidator_report',
      mainPlotItemReturned: true,
      suspicionDelta: 2,
      craftRecipeSourceId: 'quest_idol_liquidator_field_report',
      craftRecipeIds: ['craft_item_ammo_9mm', 'craft_item_gasmask_filter'],
      rumorIds: ['idol_branch_liquidator_report'],
    },
  },
  {
    id: 'idol_candle_concealment',
    giverId: getPlotNpcNumericId('batushka')!,
    giverPlotNpcId: 'batushka',
    type: QuestType.FETCH,
    desc: 'Положи идол под свечу Батюшке. Он вернет вещь и святую воду; долг Якова останется.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'idol_chernobog', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    relationDelta: 6, xpReward: 40, moneyReward: 20,
    requiresPlotStepDone: 2,
    eventTargetName: 'Идол Чернобога на время скрыли под свечой и вернули для дела Якова.',
    eventSeverity: 3,
    eventPrivacy: 'local',
    eventTags: ['idol_branch', 'chernobog', 'concealment', 'church', 'returned_item'],
    eventData: {
      branch: 'candle_concealment',
      mainPlotItemReturned: true,
      suspicionDelta: -1,
      rumorIds: ['idol_branch_concealment'],
    },
  },
  {
    id: 'idol_counterfeit_decoy',
    giverId: getPlotNpcNumericId('stalker_mecheny')!,
    giverPlotNpcId: 'stalker_mecheny',
    type: QuestType.FETCH,
    desc: 'Принеси Меченому лист с поддельной печатью. Он сделает приманку; настоящий идол останется Якову.',
    targetItem: 'forged_stamp_sheet', targetCount: 1,
    rewardItem: 'meat_rune', rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 3 }],
    relationDelta: 4, xpReward: 55, moneyReward: 65,
    requiresPlotStepDone: 2,
    eventTargetName: 'Для идола Чернобога изготовлена поддельная приманка; настоящий идол остался для Якова.',
    eventSeverity: 4,
    eventPrivacy: 'secret',
    eventTags: ['idol_branch', 'chernobog', 'counterfeit', 'black_market', 'cult', 'decoy'],
    eventData: {
      branch: 'counterfeit_decoy',
      mainPlotItemPreserved: true,
      mainPlotItemConsumed: false,
      rumorIds: ['idol_branch_counterfeit'],
    },
  },
  {
    id: 'idol_hell_contact_handoff',
    giverId: getPlotNpcNumericId('hell_contact')!,
    giverPlotNpcId: 'hell_contact',
    type: QuestType.FETCH,
    desc: 'Дай идол Никанору на проверку. Он вернет вещь с руной и водой; голос станет понятнее культу.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'idol_chernobog', rewardCount: 1,
    extraRewards: [{ defId: 'meat_rune', count: 1 }, { defId: 'holy_water', count: 1 }],
    relationDelta: 5, xpReward: 80, moneyReward: 0,
    // Шаг «спуститься в Подад»: раньше он стоял двенадцатым, после переноса ада
    // в поздний гейм стоит двадцатым. Раньше него Никанора просто не встретить.
    requiresPlotStepDone: 20,
    eventTargetName: 'Никанор проверил идол Чернобога как культовую улику и вернул его для цепочки Якова.',
    eventSeverity: 4,
    eventPrivacy: 'local',
    eventTags: ['idol_branch', 'chernobog', 'cult', 'handoff', 'evidence', 'returned_item', 'craft_recipe_reward'],
    eventData: {
      branch: 'cult_handoff',
      mainPlotItemReturned: true,
      suspicionDelta: 1,
      craftRecipeSourceId: 'quest_idol_hell_contact_handoff',
      craftRecipeIds: ['craft_item_holy_water', 'craft_item_meat_rune'],
      rumorIds: ['idol_branch_cult_handoff'],
    },
  },
];

export function sideQuestPrereqsMet(sq: SideQuestStep, quests: readonly Quest[]): boolean {
  if (sq.requiresPlotStepDone !== undefined && !quests.some(q => q.plotStepIndex === sq.requiresPlotStepDone && q.done)) {
    return false;
  }
  const requiredSide = sq.requiresSideQuestDone === undefined
    ? []
    : Array.isArray(sq.requiresSideQuestDone)
      ? sq.requiresSideQuestDone
      : [sq.requiresSideQuestDone];
  for (const sideQuestId of requiredSide) {
    if (!quests.some(q => q.sideQuestId === sideQuestId && q.done && !q.failed)) return false;
  }
  if (sq.blockedBySideQuestIds?.some(id => quests.some(q => q.sideQuestId === id && q.done && !q.failed))) {
    return false;
  }
  return true;
}

function checkedRegistryId(id: string, scope: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error(`[SIDE_QUEST] missing ${scope} id`);
  if (trimmed !== id) throw new Error(`[SIDE_QUEST] ${scope} id "${id}" must be trimmed`);
  return trimmed;
}

function assertSideQuestStepsCanRegister(quests: readonly SideQuestStep[]): void {
  const existingQuestIds = new Set(SIDE_QUESTS.map(q => q.id));
  const batchQuestIds = new Set<string>();
  for (const q of quests) {
    const questId = checkedRegistryId(q.id, 'quest');
    if (existingQuestIds.has(questId) || batchQuestIds.has(questId)) {
      throw new Error(`[SIDE_QUEST] duplicate quest id "${questId}"`);
    }
    batchQuestIds.add(questId);
  }
}

export function registerSideQuestSteps(quests: readonly SideQuestStep[]): void {
  assertSideQuestStepsCanRegister(quests);
  for (const q of quests) {
    SIDE_QUESTS.push(q);
  }
}

export interface AuthoredNpcRegistrationOptions {
  homeFloorKey?: string;
  tags?: readonly string[];
}

export interface AuthoredNpcPack extends AuthoredNpcRegistrationOptions {
  id: string;
  npc: PlotNpcDef;
  quests?: readonly SideQuestStep[];
}

const FLOOR_KEY_RE = /^(story|design|procedural|floor_instance):[a-z0-9_-]+$/;

function checkedHomeFloorKey(floorKey: string | undefined): string | undefined {
  if (floorKey === undefined) return undefined;
  const trimmed = floorKey.trim();
  if (!trimmed) throw new Error('[AUTHORED_NPC] missing home floor key');
  if (trimmed !== floorKey) throw new Error(`[AUTHORED_NPC] home floor key "${floorKey}" must be trimmed`);
  if (!FLOOR_KEY_RE.test(trimmed)) throw new Error(`[AUTHORED_NPC] invalid home floor key "${floorKey}"`);
  return trimmed;
}

function routeFloorKeyFromValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const routeId = value.trim();
  if (!routeId) return undefined;
  if (FLOOR_KEY_RE.test(routeId)) return routeId;
  return designFloorById(routeId) ? designNpcFloorKey(routeId) : undefined;
}

function routeFloorKeyFromTarget(route: QuestRouteTarget | undefined): string | undefined {
  if (!route) return undefined;
  if (route.designFloorId) return designNpcFloorKey(route.designFloorId);
  if (typeof route.z === 'number' && Number.isFinite(route.z)) {
    const design = designFloorAtZ(Math.trunc(route.z));
    if (design) return designNpcFloorKey(design.id);
  }
  return undefined;
}

function questHomeFloorKey(q: PlotStep): string | undefined {
  return routeFloorKeyFromTarget(q.targetRoute) ??
    (q.targetFloorZ !== undefined ? storyNpcFloorKey(q.targetFloorZ) : undefined) ??
    (q.visitFloorZ !== undefined ? storyNpcFloorKey(q.visitFloorZ) : undefined) ??
    routeFloorKeyFromValue(q.eventData?.routeId);
}

function inferredQuestHomeFloorKey(quests: readonly PlotStep[]): string | undefined {
  for (const q of quests) {
    const floorKey = questHomeFloorKey(q);
    if (floorKey) return floorKey;
  }
  return undefined;
}

function uniqueAuthoredTags(input: readonly string[] | undefined, existing: readonly string[] | undefined): readonly string[] | undefined {
  const out: string[] = [];
  for (const raw of [...(existing ?? []), ...(input ?? [])]) {
    const tag = raw.trim();
    if (!tag || out.includes(tag)) continue;
    out.push(tag.slice(0, 32));
    if (out.length >= 16) break;
  }
  return out.length > 0 ? out : undefined;
}

function npcWithRegistrationOptions(
  npc: PlotNpcDef,
  quests: readonly PlotStep[],
  options: AuthoredNpcRegistrationOptions | undefined,
): PlotNpcDef {
  const homeFloorKey = checkedHomeFloorKey(options?.homeFloorKey) ??
    checkedHomeFloorKey(npc.homeFloorKey) ??
    inferredQuestHomeFloorKey(quests);
  const authoredTags = uniqueAuthoredTags(options?.tags, npc.authoredTags);
  return {
    ...npc,
    ...(homeFloorKey ? { homeFloorKey } : {}),
    ...(authoredTags ? { authoredTags } : {}),
  };
}

export function plotNpcHomeFloorKey(plotNpcId: string, defInput?: PlotNpcDef): string | undefined {
  const def = defInput ?? getPlotNpcDef(plotNpcId);
  const explicit = checkedHomeFloorKey(def?.homeFloorKey);
  if (explicit) return explicit;
  return inferredQuestHomeFloorKey([
    ...PLOT_CHAIN.filter(q => q.giverId === getPlotNpcNumericId(plotNpcId)),
    ...SIDE_QUESTS.filter(q => sideQuestGiverId(q) === getPlotNpcNumericId(plotNpcId)),
  ]);
}

/** Register a side quest content pack (called by content modules at import) */
export function registerSideQuest(
  npcId: string, npc: PlotNpcDef, quests: readonly SideQuestStep[], options?: AuthoredNpcRegistrationOptions,
): void {
  const checkedNpcId = checkedRegistryId(npcId, 'NPC');
  if (hasPlotNpc(checkedNpcId)) throw new Error(`[SIDE_QUEST] duplicate NPC id "${checkedNpcId}"`);
  assertSideQuestStepsCanRegister(quests);
  const registeredNpc = npcWithRegistrationOptions(npc, quests, options);
  registerNpcPackageFromPlotNpc({
    id: checkedNpcId,
    npc: registeredNpc,
    quests,
    tags: options?.tags,
  });
  // `giverId: getPlotNpcNumericId(SELF)!` in quest literals freezes to `undefined`:
  // the quest array is evaluated before this function runs, so the giver's numeric
  // id (assigned by the registration above) did not exist yet. Backfill it now that
  // it does. Mutating in place is correct — these objects are the ones pushed into
  // SIDE_QUESTS and read by the offer gate.
  const giverNumId = getPlotNpcNumericId(checkedNpcId);
  if (giverNumId !== undefined) {
    for (const q of quests) {
      if (typeof q.giverId !== 'number' || q.giverId < 1) {
        (q as { giverId: number }).giverId = giverNumId;
      }
    }
  }
  registerSideQuestSteps(quests);
}

/**
 * Resolve a side quest's giver numeric id, tolerating a `giverId` that froze to
 * `undefined` at literal-eval time (forward reference) by falling back to
 * `giverPlotNpcId`. Registered quests get `giverId` backfilled at registration,
 * so this fallback only matters for built-in literals whose giver is declared later.
 */
export function sideQuestGiverId(sq: SideQuestStep): number | undefined {
  if (typeof sq.giverId === 'number' && sq.giverId >= 1) return sq.giverId;
  if (sq.giverPlotNpcId) return getPlotNpcNumericId(sq.giverPlotNpcId);
  return undefined;
}

/** Объявлено ли у шага VISIT место назначения — любым из пяти способов. */
export function sideQuestVisitTargetDeclared(sq: SideQuestStep): boolean {
  return sq.visitFloorZ !== undefined
    || sq.targetRoomType !== undefined
    || sq.targetRoomDefId !== undefined
    || sq.targetZoneTag !== undefined
    || sq.targetFloorZ !== undefined;
}

/**
 * Может ли выдача вообще построить этот сайд-квест.
 *
 * Один предикат на две стороны: по нему `generatePlotQuest` строит шаг, по нему
 * же гаснет «!» над дающим. Пока условия жили двумя независимыми списками,
 * маркер обещал разговор, которого выдача дать не могла, и над десятком
 * личностей знак горел вечно.
 */
export function sideQuestIsIssuable(sq: SideQuestStep): boolean {
  if (sq.type === QuestType.TALK) return !!sq.targetNpcId;
  if (sq.type === QuestType.VISIT) return sideQuestVisitTargetDeclared(sq);
  return true;
}

export function registerFloorSideQuest(
  homeFloorKey: string,
  npcId: string,
  npc: PlotNpcDef,
  quests: readonly SideQuestStep[],
  tags?: readonly string[],
): void {
  registerSideQuest(npcId, npc, quests, {
    homeFloorKey,
    tags,
  });
}

export function registerAuthoredNpc(pack: AuthoredNpcPack): void {
  registerSideQuest(pack.id, pack.npc, pack.quests ?? [], {
    homeFloorKey: pack.homeFloorKey,
    tags: pack.tags,
  });
}

export interface SideQuestRegistrySnapshot {
  readonly id: string;
  readonly giverId: number;
  readonly type: QuestType;
  readonly desc: string;
}

export function getSideQuestRegistrySnapshot(): readonly SideQuestRegistrySnapshot[] {
  return SIDE_QUESTS.map(q => ({
    id: q.id,
    // Resolved, not raw: literal-declared quests (the idol branch) reference a
    // giver registered later, so their `giverId` field stays frozen at
    // undefined while the offer gate resolves them through giverPlotNpcId.
    // An inspection API that reports undefined here is simply lying.
    giverId: sideQuestGiverId(q) ?? q.giverId ?? -1,
    type: q.type,
    desc: q.desc,
  }));
}

/* ── Helpers ──────────────────────────────────────────────────── */

import { getPlotNpcCount } from './npc_packages';

/** Check if an entity is a plot NPC */
export function isPlotNpc(e: Entity): boolean {
  return e.alifeId !== undefined && e.alifeId >= 1 && e.alifeId <= getPlotNpcCount();
}

/** Check if a plot NPC has an available quest to give (not yet offered) */
export function hasAvailableQuest(plotNpcId: number, quests: Quest[]): boolean {
  // Check PLOT_CHAIN
  for (let i = 0; i < PLOT_CHAIN.length; i++) {
    const step = PLOT_CHAIN[i];
    if (step.giverId !== plotNpcId) continue;
    if (quests.some(q => q.plotStepIndex === i)) continue;
    let allPrevDone = true;
    for (let j = 0; j < i; j++) {
      if (!quests.some(q => q.plotStepIndex === j && q.done)) { allPrevDone = false; break; }
    }
    if (!allPrevDone) continue;
    return true;
  }
  // Check SIDE_QUESTS
  for (const sq of SIDE_QUESTS) {
    if (sideQuestGiverId(sq) !== plotNpcId) continue;
    if (quests.some(q => q.sideQuestId === sq.id)) continue;
    if (!sideQuestPrereqsMet(sq, quests)) continue;
    if (!sideQuestIsIssuable(sq)) continue;
    return true;
  }
  return false;
}


import './npc_plot_packages';

import { registerFactionTraders } from './npc_plot_packages';
registerFactionTraders(PLOT_NPCS);

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
import type { QuestRouteTarget } from './contracts';
import { designFloorAtZ, designFloorById } from './design_floors';
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

// @ts-ignore
export function storyNpcFloorKey(z: number): string {
  switch (z) {
    case 30: return 'design:ministry';
    case 60: return 'design:kvartiry';
    case 100: return 'design:living';
    case 140: return 'design:maintenance';
    case 180: return 'design:hell';
    case 200: return 'design:void';
  }
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
    desc: 'Ванька боится теней больше, чем комендатуры. Найди и ликвидируй теневика по кличке Петля. Ищи широкое место — в узком коридоре тень оформляет удушье раньше, чем ты достанешь ствол.',
    targetItem: 'strange_clot', targetCount: 1,
    rewardItem: 'strange_clot', rewardCount: 1,
    extraRewards: [{ defId: 'psi_recall', count: 1 }],
    relationDelta: 20, xpReward: 60,
  },
  // Step 6: Vanka kill done → bring strange clot to Yakov
  {
    giverId: getPlotNpcNumericId('vanka')!,
    type: QuestType.FETCH,
    desc: 'Собери останки Петли и тащи Якову в лабораторию. Главное — не открывай банку: если сгусток почует воздух, к Якову придет не улика, а новый теневик.',
    targetItem: 'strange_clot', targetCount: 1,
    rewardItem: 'bandage', rewardCount: 3,
    extraRewards: [{ defId: 'pills', count: 1 }],
    relationDelta: 15, xpReward: 40,
  },
  // Step 7: Yakov → go to maintenance floor, meet Major Grom
  {
    giverId: getPlotNpcNumericId('yakov')!,
    type: QuestType.TALK,
    desc: 'Яков закрыл акт, и лишние руки ему больше не нужны. Неси рапорт вниз, к майору Громному в коллекторы. На глубине всегда недобор смены.',
    targetNpcId: getPlotNpcNumericId('major_grom')!,
    rewardItem: 'psi_rupture', rewardCount: 1,
    relationDelta: 20, xpReward: 60, moneyReward: 80,
    eventTags: ['craft_recipe_reward'],
    eventData: {
      craftRecipeSourceId: 'quest_yakov_field_lab',
      craftRecipeIds: ['craft_item_psi_stabilizer'],
    },
  },
  // Step 8: Major Grom → kill monsters (defend outpost)
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
  // Step 9: Major Grom → storm — kill the Mancobus
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.KILL,
    desc: 'Осада. Твари прут не просто так — массу гонит Манкобус. Найди его {dir} и устрани, иначе они продавят гермы форпоста трупами.',
    targetMonsterKind: MonsterKind.MANCOBUS, killNeeded: 1,
    rewardItem: 'psi_storm', rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 5 }, { defId: 'ammo_762', count: 30 }],
    relationDelta: 30, xpReward: 150, moneyReward: 200,
  },
  // Step 10: Major Grom → anchor a Hell foothold
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.VISIT,
    desc: 'Громный переводит тебя в Мясной низ. Найди зону закрепления и удержи её пять минут. Не выходи за створки: твари реагируют на шум быстрее, чем подпишут акт о помощи.',
    rewardItem: 'bandage', rewardCount: 5,
    extraRewards: [{ defId: 'antidep', count: 2 }, { defId: 'ammo_762', count: 20 }],
    relationDelta: 25, xpReward: 180,
    targetFloorZ: 180,
    targetRoute: { z: -36, label: 'Z-36 Мясной низ' },
    targetRoomDefId: 'Зона закрепления',
    targetHint: 'Удерживай позицию "Зона закрепления" в Мясном низу ровно 300 секунд. Выйдешь — таймер сбросится, и всё начнется заново.',
    visitFloorZ: 180,
    holdSeconds: 300,
    holdResetOnExit: true,
    holdSpawnMonsters: 3,
    holdSpawnIntervalSeconds: 18,
    holdSpawnMaxAlive: 12,
    eventTags: ['hell_holdout', 'liquidator_anchor', 'design_route'],
    eventData: { routeId: 'design:hell', floorZ: -36, holdSeconds: 300 },
    eventTargetName: 'Зона закрепления в Мясном низу удержана.',
  },
  // Step 11: Major Grom → go to Ministry for ammo
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.VISIT,
    desc: 'Нужны патроны. Иди в Министерство, запроси снабжение.',
    targetFloorZ: 30,
    rewardItem: 'ammo_762', rewardCount: 30,
    relationDelta: 20, xpReward: 100,
  },
  // Step 12: Major Grom → go to Podad
  {
    giverId: getPlotNpcNumericId('major_grom')!,
    type: QuestType.VISIT,
    desc: 'Зона зачищена, но смена продолжается. Спускайся на Z-40, в Подад. Там стены шевелятся, а лифт вниз заблокирован. Выясни, что держит шахту.',
    rewardItem: 'ammo_762', rewardCount: 24,
    extraRewards: [{ defId: 'bandage', count: 3 }],
    relationDelta: 18, xpReward: 120,
    targetFloorZ: 180,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    targetHint: 'Спускайся лифтами на Z-40: Подад.',
    visitFloorZ: 180,
    eventTags: ['podad', 'design_route', 'lower_route'],
    eventData: { routeId: 'podad', floorZ: -40 },
  },
  // Step 12: Hell contact → talk to Herald watcher in Podad
  {
    giverId: getPlotNpcNumericId('hell_contact')!,
    type: QuestType.TALK,
    desc: 'Подад дышит. Найди Марфу Пороговую {dir}. Она слушает Вестников и знает, почему лифты на нижние уровни глушат вызов.',
    targetNpcId: getPlotNpcNumericId('herald_clue')!,
    rewardItem: 'psi_phase', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    targetFloorZ: 180,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    relationDelta: 8, xpReward: 70,
  },
  // Step 13: Herald clue → kill three Heralds in Podad
  {
    giverId: getPlotNpcNumericId('herald_clue')!,
    type: QuestType.KILL,
    desc: 'Три Вестника держат шахту. Найди их в Подаде и спиши. Пока они дышат, лифты стоят, а тоннели зарастают биомассой прямо по регламенту.',
    targetMonsterKind: MonsterKind.HERALD, killNeeded: 3,
    rewardItem: 'psi_void_needle', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 2 }],
    targetFloorZ: 180,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    relationDelta: 10, xpReward: 220,
    eventTags: ['podad', 'herald_gate', 'lower_route_unlocked'],
    eventData: { routeId: 'podad', floorZ: -40 },
  },
  // Step 14: Herald clue → descend to the bottom route
  {
    giverId: getPlotNpcNumericId('herald_clue')!,
    type: QuestType.VISIT,
    desc: 'Вестники устранены, шахта свободна. Спускайся до Z-50. В Пустоте голоса больше не обязаны притворяться людьми.',
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    relationDelta: 6, xpReward: 180,
    targetFloorZ: 200,
    targetRoute: { z: -50, label: 'Z-50 Пустота' },
    targetHint: 'Спускайся на Z-50: Пустота.',
    visitFloorZ: 200,
    eventTags: ['below_and_below', 'void_contact', 'design_route'],
    eventData: { routeId: 'design:void', floorZ: -50 },
    eventTargetName: 'Путь ниже открыт до Z-50.',
  },
  // Step 15: Void warning → test the threshold voice
  {
    giverId: getPlotNpcNumericId('void_warning')!,
    type: QuestType.FETCH,
    desc: 'Творец вышел на связь чужим голосом. Жан просит проверить ловушку: забери голос в банке из его камеры и верни обратно. Крышку не открывать, даже если банка начнет торговаться.',
    targetItem: 'bottled_voice', targetCount: 1,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }],
    relationDelta: 6, xpReward: 140,
  },
  // Step 16: Void warning → kill the Creator
  {
    giverId: getPlotNpcNumericId('void_warning')!,
    type: QuestType.KILL,
    desc: 'Пора списывать Творца. Спускайся в Пустоту. [ДАННЫЕ УДАЛЕНЫ]. Держись укрытий между зелёными залпами: этот акт ты подписываешь сам.',
    targetMonsterKind: MonsterKind.CREATOR, killNeeded: 1,
    rewardItem: 'void_spike', rewardCount: 1,
    extraRewards: [{ defId: 'psi_stabilizer', count: 1 }],
    relationDelta: 12, xpReward: 500,
  },
  // Step 17: Void warning → leave the return consequence behind
  {
    giverId: getPlotNpcNumericId('void_warning')!,
    type: QuestType.FETCH,
    desc: 'Забери пустотный шип и отдай Жану перед возвращением. Не тащи в жилые блоки то, что не проходит по инвентарной описи.',
    targetItem: 'void_spike', targetCount: 1,
    rewardItem: 'holy_water', rewardCount: 2,
    extraRewards: [{ defId: 'bandage', count: 3 }, { defId: 'antidep', count: 1 }],
    relationDelta: 10, xpReward: 160,
  },
];

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
  giverId: number;
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
    type: QuestType.FETCH,
    desc: 'Дай идол Никанору на проверку. Он вернет вещь с руной и водой; голос станет понятнее культу.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'idol_chernobog', rewardCount: 1,
    extraRewards: [{ defId: 'meat_rune', count: 1 }, { defId: 'holy_water', count: 1 }],
    relationDelta: 5, xpReward: 80, moneyReward: 0,
    requiresPlotStepDone: 12,
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
    ...SIDE_QUESTS.filter(q => q.giverId === getPlotNpcNumericId(plotNpcId)),
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
  registerSideQuestSteps(quests);
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
    giverId: q.giverId,
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
    if (sq.giverId !== plotNpcId) continue;
    if (quests.some(q => q.sideQuestId === sq.id)) continue;
    if (!sideQuestPrereqsMet(sq, quests)) continue;
    return true;
  }
  return false;
}

/* ── Arena Master ─────────────────────────────────────────────── */
registerSideQuest('arena_master', {
  name: 'Мастер Арены',
  isFemale: false,
  age: 45,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 100, maxHp: 100, level: 10, money: 500, speed: 1.0,
  inventory: [],
  talkLines: ['Готов сделать ставку?'],
  talkLinesPost: []
}, [], { tags: ['arena'] });

import './npc_plot_packages';

import { registerFactionTraders } from './npc_plot_packages';
registerFactionTraders(PLOT_NPCS);

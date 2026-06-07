/* ── Story plot data — quest chain + story NPC definitions ────── */
/* To grow the story:                                              */
/*   1. Add main plot NPC package to npc_plot_packages.ts         */
/*   2. Append steps to PLOT_CHAIN (giver → target / item)        */
/*   3. Create room generator in gen/living/ (optional)            */
/*   4. Add room spec to plot_rooms.ts (optional)                  */

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
  FloorLevel,
} from '../core/types';
import type { QuestRouteTarget } from './contracts';
import { designFloorAtZ, designFloorById } from './design_floors';
import {
  MAIN_PLOT_NPC_PACKAGES,
} from './npc_plot_packages';
import {
  allNpcPackages,
  getNpcPackageByPlotNpcId,
  npcPackageDisplayName,
  plotNpcIdFromPackage,
  registerNpcPackageFromPlotNpc,
  registerNpcPackages,
  type NpcPackageDef,
} from './npc_packages';

/* ── Story NPC definition ─────────────────────────────────────── */
export interface PlotNpcDef {
  name: string;
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
  hp: number;
  maxHp: number;
  /** Authored RPG level for plot NPCs; omitted NPCs keep the low default. */
  level?: number;
  money: number;
  accountRubles?: number;
  speed: number;
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

export function storyNpcFloorKey(floor: FloorLevel): string {
  switch (floor) {
    case FloorLevel.MINISTRY: return 'story:ministry';
    case FloorLevel.KVARTIRY: return 'story:kvartiry';
    case FloorLevel.LIVING: return 'story:living';
    case FloorLevel.MAINTENANCE: return 'story:maintenance';
    case FloorLevel.HELL: return 'story:hell';
    case FloorLevel.VOID: return 'story:void';
  }
}

export function designNpcFloorKey(routeId: string): string {
  return routeId.startsWith('design:') ? routeId : `design:${routeId}`;
}

/* ── Story NPC package adapter ───────────────────────────────── */

registerNpcPackages(MAIN_PLOT_NPC_PACKAGES);

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

function plotNpcEntriesFromPackages(packs: readonly NpcPackageDef[]): [string, PlotNpcDef][] {
  return packs.flatMap(pack => {
    const plotNpcId = plotNpcIdFromPackage(pack);
    return plotNpcId ? [[plotNpcId, plotNpcDefFromPackage(pack)] as [string, PlotNpcDef]] : [];
  });
}

export function getPlotNpcDef(plotNpcId: string): PlotNpcDef | undefined {
  const pack = getNpcPackageByPlotNpcId(plotNpcId);
  return pack ? plotNpcDefFromPackage(pack) : undefined;
}

export function hasPlotNpc(plotNpcId: string): boolean {
  return getNpcPackageByPlotNpcId(plotNpcId) !== undefined;
}

export function allPlotNpcEntries(): readonly [string, PlotNpcDef][] {
  return plotNpcEntriesFromPackages(allNpcPackages());
}

export function allPlotNpcIds(): readonly string[] {
  return allPlotNpcEntries().map(([id]) => id);
}

/* ── Linear quest chain ──────────────────────────────────────── */
/* Step N is available when all steps 0..N-1 are done AND         */
/* giverNpcId matches the NPC the player is talking to.           */
/* {dir} in desc is auto-replaced with toroidal direction.        */

export const PLOT_CHAIN: PlotStep[] = [
  // Step 0: Olga → talk to Sergeant Barinov
  {
    giverNpcId: 'olga',
    type: QuestType.TALK,
    desc: 'После вводной Ольги поговори с сержантом Бариновым в оружейной. Он выдаст Макаров и 8 патронов: без ствола новичка несут обратно к медпункту.',
    offerObjective: 'Цель: поговорить с Ольгой Дмитриевной в актовом зале.',
    activeObjective: 'Цель: поговорить с сержантом Бариновым в оружейной/стрельбище.',
    targetNpcId: 'barni',
    rewardItem: 'makarov', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
    relationDelta: 10, xpReward: 10,
  },
  // Step 1: Sergeant Barinov → report to Olga
  {
    giverNpcId: 'barni',
    type: QuestType.TALK,
    desc: 'Доложи Ольге о стрельбе. Она выдаст бинты, воду и хлеб, а потом даст первую настоящую работу на этаже.',
    activeObjective: 'Цель: вернуться к Ольге Дмитриевне после оружейной.',
    targetNpcId: 'olga',
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
    giverNpcId: 'olga',
    type: QuestType.TALK,
    desc: 'Сходи к Якову Давидовичу, коллеге Ольги. Его лаборатория {dir}. Ему нужен полевой помощник: образцы сами до журнала не доходят.',
    activeObjective: 'Цель: поговорить с Яковом Давидовичем в лаборатории. Это мост к первой полевой работе.',
    targetNpcId: 'yakov',
    rewardItem: 'psi_strike', rewardCount: 1,
    relationDelta: 10, xpReward: 20,
  },
  // Step 3: Yakov → fetch idol
  {
    giverNpcId: 'yakov',
    type: QuestType.FETCH,
    desc: 'Принеси Якову идол Чернобога. Он проверяет связь Самосборов с культами; это первая полевая вылазка за настоящим образцом.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'psi_mark', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }, { defId: 'pills', count: 2 }],
    relationDelta: 20, xpReward: 50, moneyReward: 50,
  },
  // Step 4: Yakov → talk to Vanka Banchiny
  {
    giverNpcId: 'yakov',
    type: QuestType.TALK,
    desc: 'Яков исследовал идол: связь Самосборов с культами подтверждается. В архиве он нашёл Ивана Захарова, бывшего студента; теперь его зовут Ванька Банчиный. Найди его {dir}.',
    targetNpcId: 'vanka',
    rewardItem: 'antidep', rewardCount: 1,
    relationDelta: 15, xpReward: 30,
  },
  // Step 5: Vanka → kill a Shadow monster (Теневик)
  {
    giverNpcId: 'vanka',
    type: QuestType.KILL,
    desc: 'Помоги Ваньке: его пугает теневик Петля, и Ванька связывает теневиков с Самосбором. Убей Петлю на широком месте; в тесноте тень бьёт первой.',
    targetMonsterKind: MonsterKind.SHADOW, killNeeded: 1,
    rewardItem: 'psi_recall', rewardCount: 1,
    relationDelta: 20, xpReward: 60,
  },
  // Step 6: Vanka kill done → bring strange clot to Yakov
  {
    giverNpcId: 'vanka',
    type: QuestType.FETCH,
    desc: 'Отнеси останки теневика Якову. Банку не открывай: Якову нужен целый сгусток, чтобы проверить связь теневиков с Самосбором.',
    targetItem: 'strange_clot', targetCount: 1,
    rewardItem: 'bandage', rewardCount: 3,
    extraRewards: [{ defId: 'pills', count: 1 }],
    relationDelta: 15, xpReward: 40,
  },
  // Step 7: Yakov → go to maintenance floor, meet Major Grom
  {
    giverNpcId: 'yakov',
    type: QuestType.TALK,
    desc: 'Яков доволен данными, но дальше ему нужен лаборант, а не полевой наёмник. Передай его рапорт Майору Громному в коллекторах: внизу ты будешь полезнее.',
    targetNpcId: 'major_grom',
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
    giverNpcId: 'major_grom',
    type: QuestType.KILL,
    desc: 'Помоги Громному удержать нижний форпост: убей десять тварей перед сектором. Чем ниже этаж, тем ближе Самосбор и тем хуже обычные правила.',
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
    giverNpcId: 'major_grom',
    type: QuestType.KILL,
    desc: 'Громный понял, что тварями внизу кто-то управляет. Найди и убей Манкобуса {dir}; без него форпост сможет двинуться глубже.',
    targetMonsterKind: MonsterKind.MANCOBUS, killNeeded: 1,
    rewardItem: 'psi_storm', rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 5 }, { defId: 'ammo_762', count: 30 }],
    relationDelta: 30, xpReward: 150, moneyReward: 200,
  },
  // Step 10: Major Grom → anchor a Hell foothold
  {
    giverNpcId: 'major_grom',
    type: QuestType.VISIT,
    desc: 'Громный отправляет тебя в Мясной низ закрепиться до прихода группы. Найди зону закрепления, держи её пять минут и не уходи за створки: твари проверят шум раньше ликвидаторов.',
    rewardItem: 'bandage', rewardCount: 5,
    extraRewards: [{ defId: 'antidep', count: 2 }, { defId: 'ammo_762', count: 20 }],
    relationDelta: 25, xpReward: 180,
    targetFloor: FloorLevel.HELL,
    targetRoute: { z: -36, label: 'Z-36 Мясной низ' },
    targetRoomName: 'Зона закрепления',
    targetHint: 'В аду удерживай комнату "Зона закрепления" 300 секунд. Выход из комнаты сбрасывает таймер.',
    visitFloor: FloorLevel.HELL,
    holdSeconds: 300,
    holdResetOnExit: true,
    holdSpawnMonsters: 3,
    holdSpawnIntervalSeconds: 18,
    holdSpawnMaxAlive: 12,
    eventTags: ['hell_holdout', 'liquidator_anchor', 'story_route'],
    eventData: { routeId: 'story:hell', floorZ: -36, holdSeconds: 300 },
    eventTargetName: 'Зона закрепления в Мясном низу удержана.',
  },
  // Step 11: Major Grom → go to Podad
  {
    giverNpcId: 'major_grom',
    type: QuestType.VISIT,
    desc: 'Громный дошёл до зоны и разворачивает пост. Следующий ход ниже: спустись в Подад на Z-40. Это не пропускник и не обычный ад; стены там двигаются, а проход вниз ещё закрыт.',
    rewardItem: 'ammo_762', rewardCount: 24,
    extraRewards: [{ defId: 'bandage', count: 3 }],
    relationDelta: 18, xpReward: 120,
    targetFloor: FloorLevel.HELL,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    targetHint: 'Иди обычными лифтами вниз до Z-40: Подад.',
    visitFloor: FloorLevel.HELL,
    eventTags: ['podad', 'story_route', 'lower_route'],
    eventData: { routeId: 'podad', floorZ: -40 },
  },
  // Step 12: Hell contact → talk to Herald watcher in Podad
  {
    giverNpcId: 'hell_contact',
    type: QuestType.TALK,
    desc: 'Подад шевелит стены вокруг входа. Найди Марфу Пороговую {dir}: она считает Вестников и знает, почему лифт вниз не отвечает.',
    targetNpcId: 'herald_clue',
    rewardItem: 'psi_phase', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    targetFloor: FloorLevel.HELL,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    relationDelta: 8, xpReward: 70,
  },
  // Step 13: Herald clue → kill three Heralds in Podad
  {
    giverNpcId: 'herald_clue',
    type: QuestType.KILL,
    desc: 'Убей трёх Вестников в Подаде. Пока они живы, нижние лифты молчат, а тоннели зарастают за спиной.',
    targetMonsterKind: MonsterKind.HERALD, killNeeded: 3,
    rewardItem: 'psi_void_needle', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 2 }],
    targetFloor: FloorLevel.HELL,
    targetRoute: { designFloorId: 'podad', label: 'Z-40 Подад' },
    relationDelta: 10, xpReward: 220,
    eventTags: ['podad', 'herald_gate', 'lower_route_unlocked'],
    eventData: { routeId: 'podad', floorZ: -40 },
  },
  // Step 14: Herald clue → descend to the bottom route
  {
    giverNpcId: 'herald_clue',
    type: QuestType.VISIT,
    desc: 'НИЖЕ И НИЖЕ. Вестники упали, нижние лифты открыты. Спускайся обычным маршрутом до Z-50: там голос уже не прячется за чужой дверью.',
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'holy_water', count: 1 }],
    relationDelta: 6, xpReward: 180,
    targetFloor: FloorLevel.VOID,
    targetRoute: { z: -50, label: 'Z-50 Пустота' },
    targetHint: 'После Подада иди лифтами вниз через открытые этажи до Z-50.',
    visitFloor: FloorLevel.VOID,
    eventTags: ['below_and_below', 'void_contact', 'story_route'],
    eventData: { routeId: 'story:void', floorZ: -50 },
    eventTargetName: 'Путь ниже открыт до Z-50.',
  },
  // Step 15: Void warning → test the threshold voice
  {
    giverNpcId: 'void_warning',
    type: QuestType.FETCH,
    desc: 'На Z-50 Творец вышел на связь чужим голосом. Жан просит проверить ловушку: забери голос в банке из его камеры и верни ему; крышку не открывать.',
    targetItem: 'bottled_voice', targetCount: 1,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }],
    relationDelta: 6, xpReward: 140,
  },
  // Step 16: Void warning → kill the Creator
  {
    giverNpcId: 'void_warning',
    type: QuestType.KILL,
    desc: 'Убей Творца в Пустоте: загадочного демиурга за Самосборами. Данные удалены; держи укрытие между зелёными залпами.',
    targetMonsterKind: MonsterKind.CREATOR, killNeeded: 1,
    rewardItem: 'void_spike', rewardCount: 1,
    extraRewards: [{ defId: 'psi_stabilizer', count: 1 }],
    relationDelta: 12, xpReward: 500,
  },
  // Step 17: Void warning → leave the return consequence behind
  {
    giverNpcId: 'void_warning',
    type: QuestType.FETCH,
    desc: 'Отдай пустотный шип Жану перед возвратом. Не неси в жилую зону образец того, что стояло за Самосборами.',
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
  giverNpcId: string;
  type: QuestType;
  desc: string;
  /** HUD text before this step is accepted, when the player should find the giver. */
  offerObjective?: string;
  /** HUD text after this step is accepted; falls back to desc. */
  activeObjective?: string;
  targetNpcId?: string;
  targetPlotNpcId?: string;   // plot NPC key for cross-floor KILL quests targeting NPCs
  targetItem?: string;
  targetCount?: number;
  targetRoomType?: number;
  targetRoomName?: string;
  targetFloor?: FloorLevel;
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
  failOnNpcDeathPlotId?: string;
  abandonsSideQuestIds?: string[];
  /** Spawn N hostile monsters around the quest giver when quest is accepted */
  spawnMonstersOnAccept?: number;
  /** Bounded ongoing pressure for authored KILL quests. Runtime timer is transient. */
  killPressure?: KillPressureDef;
  /** Auto-complete VISIT quest when player enters this floor */
  visitFloor?: FloorLevel;
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
    giverNpcId: 'vera_propuskova',
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
    giverNpcId: 'polkovnik_streltsov',
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
    giverNpcId: 'batushka',
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
    giverNpcId: 'stalker_mecheny',
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
    giverNpcId: 'hell_contact',
    type: QuestType.FETCH,
    desc: 'Дай идол Никанору на проверку. Он вернет вещь с руной и водой; голос станет понятнее культу.',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'idol_chernobog', rewardCount: 1,
    extraRewards: [{ defId: 'meat_rune', count: 1 }, { defId: 'holy_water', count: 1 }],
    relationDelta: 5, xpReward: 80, moneyReward: 0,
    requiresPlotStepDone: 11,
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
    (q.targetFloor !== undefined ? storyNpcFloorKey(q.targetFloor) : undefined) ??
    (q.visitFloor !== undefined ? storyNpcFloorKey(q.visitFloor) : undefined) ??
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
    ...PLOT_CHAIN.filter(q => q.giverNpcId === plotNpcId),
    ...SIDE_QUESTS.filter(q => q.giverNpcId === plotNpcId),
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
  readonly giverNpcId: string;
  readonly type: QuestType;
  readonly desc: string;
}

export function getSideQuestRegistrySnapshot(): readonly SideQuestRegistrySnapshot[] {
  return SIDE_QUESTS.map(q => ({
    id: q.id,
    giverNpcId: q.giverNpcId,
    type: q.type,
    desc: q.desc,
  }));
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** Check if an entity is a plot NPC */
export function isPlotNpc(e: Entity): boolean {
  return !!e.plotNpcId;
}

/** Get the PlotNpcDef for an entity (or undefined) */
export function getPlotDef(e: Entity): PlotNpcDef | undefined {
  return e.plotNpcId ? getPlotNpcDef(e.plotNpcId) : undefined;
}

/** Check if a plot NPC has an available quest to give (not yet offered) */
export function hasAvailableQuest(plotNpcId: string, quests: Quest[]): boolean {
  // Check PLOT_CHAIN
  for (let i = 0; i < PLOT_CHAIN.length; i++) {
    const step = PLOT_CHAIN[i];
    if (step.giverNpcId !== plotNpcId) continue;
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
    if (sq.giverNpcId !== plotNpcId) continue;
    if (quests.some(q => q.sideQuestId === sq.id)) continue;
    if (!sideQuestPrereqsMet(sq, quests)) continue;
    return true;
  }
  return false;
}

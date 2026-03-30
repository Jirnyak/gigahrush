/* ── Story plot data — quest chain + story NPC definitions ────── */
/* To grow the story:                                              */
/*   1. Add NPC to PLOT_NPCS (id, dialogue, stats)                */
/*   2. Append steps to PLOT_CHAIN (giver → target / item)        */
/*   3. Create room generator in gen/living/ (optional)            */
/*   4. Add room spec to plot_rooms.ts (optional)                  */

import {
  type Entity, QuestType, Faction, Occupation, MonsterKind,
} from '../core/types';

/* ── Story NPC definition ─────────────────────────────────────── */
export interface PlotNpcDef {
  name: string;
  isFemale: boolean;
  faction: Faction;
  occupation: Occupation;
  sprite: number;
  hp: number;
  maxHp: number;
  money: number;
  speed: number;
  inventory: { defId: string; count: number }[];
  /** Sequential talk lines (cycled via _plotTalkIdx) */
  talkLines: string[];
  /** Talk lines after plotDone flag is set (random pick) */
  talkLinesPost: string[];
  /** Response when completing a TALK quest targeting this NPC */
  talkQuestResponse?: string;
}

/* ── Story NPC registry ───────────────────────────────────────── */
export const PLOT_NPCS: Record<string, PlotNpcDef> = {
  olga: {
    name: 'Ольга Дмитриевна',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.DOCTOR,
    sprite: Occupation.DOCTOR,
    hp: 100, maxHp: 100, money: 50, speed: 1.2,
    inventory: [
      { defId: 'bandage', count: 3 },
      { defId: 'pills', count: 1 },
      { defId: 'water', count: 2 },
      { defId: 'bread', count: 2 },
    ],
    talkLines: [
      'Добро пожаловать в блок! Я Ольга Дмитриевна, врач. Прочитайте слайды на стене — там основные правила.',
      'Двигайтесь клавишами WASD, мышь — обзор. Нажмите E чтобы поговорить с кем-нибудь или открыть дверь.',
      'Предметы подбираются автоматически. I — открыть инвентарь. F — отношения фракций. Кушайте вовремя, иначе здоровье падает.',
      'Пробел или ЛКМ — удар/выстрел. Зайдите в оружейную — там Барни покажет как стрелять.',
      'Когда услышите сирену — это САМОСБОР. Бегите в ближайшую комнату и закройте дверь! Коридоры смертельно опасны.',
      'Фиолетовый туман убивает. Из него лезут твари. Не стойте в тумане — бегите к шлюзу.',
      'Нажмите M — карта. Q — журнал заданий. Общайтесь с жителями, помогайте — от них зависит выживание.',
      'У меня есть для вас задание. Откройте вкладку «Задание» — я расскажу.',
    ],
    talkLinesPost: [
      'Приходи если ранен. Помогу.',
      'Таблеток мало осталось.',
      'Мне пора на работу. Береги себя.',
    ],
  },

  barni: {
    name: 'Барни',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 120, maxHp: 120, money: 80, speed: 1.4,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 8 },
      { defId: 'canned', count: 1 },
    ],
    talkLines: [
      'Я Барни, старший ликвидатор. Добро пожаловать в оружейную.',
      'Стреляй по мишеням — тренируйся. Патроны забирай со стойки.',
      'Макаров — лучший друг в лабиринте. Держи его заряженным.',
      'Слышишь сирену — хватай ствол и к двери. В коридоре без оружия — труп.',
      'Мишени на стене — стреляй сколько хочешь. Следы от пуль видно.',
      'Бетонник? Не лезь с ножом. Только с огнестрелом. И то — издалека.',
    ],
    talkLinesPost: [],
  },

  yakov: {
    name: 'Яков Давидович',
    isFemale: false,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    sprite: Occupation.SCIENTIST,
    hp: 80, maxHp: 80, money: 60, speed: 1.0,
    inventory: [
      { defId: 'psi_strike', count: 1 },
      { defId: 'antidep', count: 1 },
    ],
    talkLines: [],
    talkLinesPost: [
      'Исследования продолжаются. Не мешай.',
      'Самосбор и культы — тут есть связь. Я чувствую это.',
      'Возвращайся, если найдёшь что-то необычное.',
    ],
    talkQuestResponse: 'Ольга прислала? Хорошо. Я занимаюсь пси-явлениями хруща. Возьмите это — пригодится.',
  },

  vanka: {
    name: 'Ванька Банчиный',
    isFemale: false,
    faction: Faction.CULTIST,
    occupation: Occupation.ALCOHOLIC,
    sprite: Occupation.ALCOHOLIC,
    hp: 60, maxHp: 60, money: 5, speed: 0.9,
    inventory: [
      { defId: 'bread', count: 1 },
      { defId: 'cigs', count: 2 },
    ],
    talkLines: [
      'А?! Кто?! Не трогай! Ванька не виноват! Ванька ничего не делал!',
      'Чернобог… Чернобог идёт… ОН ВСЕГДА ИДЁТ… стены дышат, слышишь?',
      'Теневик! Теневик он злой! Петля! Плохой человек! Приказал страшно!',
      'Тени ползут… из стен… из пола… Теневик командует ими… он не человек уже…',
      'Ванька видел! Ванька всё видел! Глаза в темноте! Фиолетовые!',
      'Убей его! УБЕЙ ТЕНЕВИКА! Тогда Ванька спать сможет… может быть…',
    ],
    talkLinesPost: [
      'Тише стало… но стены всё ещё дышат…',
      'Ванька боится. Всегда боится.',
      'Спасибо тебе… Теневик больше не приходит во снах…',
    ],
    talkQuestResponse: 'Яков? Яков послал?! Учёный… Ванька расскажет! Теневик! Он злой! Петля! Плохой человек! Приказал страшно! Убей его! УБЕЙ!',
  },

  major_grom: {
    name: 'Майор Громный',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 180, maxHp: 180, money: 120, speed: 1.5,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 12 },
      { defId: 'canned', count: 2 },
      { defId: 'bandage', count: 2 },
    ],
    talkLines: [
      'Майор Громный, ликвидатор. Осваиваем этот блок — трубы, крысы, твари.',
      'Наверху полегче. Тут — каждый коридор может быть последним.',
      'Если Яков послал — значит дело серьёзное. Слушаю.',
      'Теневики? Видали. Гадость. Но у нас тут проблемы поважнее — тварей полно.',
    ],
    talkLinesPost: [
      'Форпост держим. Заходи если что.',
      'Мои ребята патрулируют. Пока справляемся.',
      'Яков хороший мужик. Передавай привет.',
    ],
    talkQuestResponse: 'Яков прислал? Слышал о теневиках. Поможешь отбиться от тварей — расскажу всё, что знаю.',
  },
};

/* ── Linear quest chain ──────────────────────────────────────── */
/* Step N is available when all steps 0..N-1 are done AND         */
/* giverNpcId matches the NPC the player is talking to.           */
/* {dir} in desc is auto-replaced with toroidal direction.        */

export const PLOT_CHAIN: PlotStep[] = [
  // Step 0: Olga → talk to Barni
  {
    giverNpcId: 'olga',
    type: QuestType.TALK,
    desc: 'Ольга Дмитриевна: «Сходите в оружейную. Поговорите с Барни — он научит стрелять.»',
    targetNpcId: 'barni',
    rewardItem: 'makarov', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
    relationDelta: 10, xpReward: 10,
  },
  // Step 1: Barni → report to Olga
  {
    giverNpcId: 'barni',
    type: QuestType.TALK,
    desc: 'Барни: «Доложите Ольге Дмитриевне, что вы вооружены и готовы.»',
    targetNpcId: 'olga',
    rewardItem: 'bandage', rewardCount: 2,
    extraRewards: [{ defId: 'water', count: 2 }, { defId: 'bread', count: 2 }],
    relationDelta: 12, xpReward: 10,
  },
  // Step 2: Olga → visit Yakov
  {
    giverNpcId: 'olga',
    type: QuestType.TALK,
    desc: 'Ольга Дмитриевна: «Зайдите к моему коллеге — Якову Давидовичу. Его лаборатория {dir}. Изучает пси-явления.»',
    targetNpcId: 'yakov',
    rewardItem: 'psi_strike', rewardCount: 1,
    relationDelta: 10, xpReward: 20,
  },
  // Step 3: Yakov → fetch idol
  {
    giverNpcId: 'yakov',
    type: QuestType.FETCH,
    desc: 'Яков Давидович: «Культисты поклоняются Чернобогу. Найдите мне один из их идолов — они разбросаны по всему лабиринту.»',
    targetItem: 'idol_chernobog', targetCount: 1,
    rewardItem: 'psi_mark', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }, { defId: 'pills', count: 2 }],
    relationDelta: 20, xpReward: 50, moneyReward: 50,
  },
  // Step 4: Yakov → talk to Vanka Banchiny
  {
    giverNpcId: 'yakov',
    type: QuestType.TALK,
    desc: 'Яков Давидович: «Я исследовал идол. Моя теория связи самосборов с культами подтверждается. В медицинских архивах я нашёл записи о неком безумце из соседнего сектора — его записали полоумным, но он говорил о приходе Чернобога. Найди его {dir} — узнай всё, что можешь.»',
    targetNpcId: 'vanka',
    rewardItem: 'antidep', rewardCount: 1,
    relationDelta: 15, xpReward: 30,
  },
  // Step 5: Vanka → kill a Shadow monster (Теневик)
  {
    giverNpcId: 'vanka',
    type: QuestType.KILL,
    desc: 'Ванька Банчиный: «Теневик! Он злой! Убей его! УБЕЙ ТЕНЕВИКА! Тогда Ванька спать сможет!»',
    targetMonsterKind: MonsterKind.SHADOW, killNeeded: 1,
    rewardItem: 'psi_recall', rewardCount: 1,
    relationDelta: 20, xpReward: 60,
  },
  // Step 6: Vanka kill done → bring strange clot to Yakov
  {
    giverNpcId: 'vanka',
    type: QuestType.FETCH,
    desc: 'С теневика вы подобрали странный сгусток. Ванька: «Неси это учёному! Яков поймёт! ОН ПОЙМЁТ!»',
    targetItem: 'strange_clot', targetCount: 1,
    rewardItem: 'bandage', rewardCount: 3,
    extraRewards: [{ defId: 'pills', count: 1 }],
    relationDelta: 15, xpReward: 40,
  },
  // Step 7: Yakov → go to maintenance floor, meet Major Grom
  {
    giverNpcId: 'yakov',
    type: QuestType.TALK,
    desc: 'Яков Давидович: «Теневик — что-то новое. О них слышали в докладах с нижних уровней. Спустись в коллекторы и найди моего знакомого — Майора Громного. Он дядька простой, но хороший, что редко среди ликвидаторов. Его форпост {dir}.»',
    targetNpcId: 'major_grom',
    rewardItem: 'psi_rupture', rewardCount: 1,
    relationDelta: 20, xpReward: 60, moneyReward: 80,
  },
  // Step 8: Major Grom → kill monsters (defend outpost)
  {
    giverNpcId: 'major_grom',
    type: QuestType.KILL,
    desc: 'Майор Громный: «Помоги отбиться — тварей тут полно. Убей хотя бы троих, и я расскажу что знаю о теневиках.»',
    targetMonsterKind: MonsterKind.TVAR, killNeeded: 3,
    rewardItem: 'ak47', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_762', count: 30 }],
    relationDelta: 25, xpReward: 80, moneyReward: 100,
    spawnMonstersOnAccept: 8,
  },
];

/* ── A single step in the linear story quest chain ───────────── */
export interface PlotStep {
  giverNpcId: string;
  type: QuestType;
  desc: string;
  targetNpcId?: string;
  targetItem?: string;
  targetCount?: number;
  targetRoomType?: number;
  targetMonsterKind?: MonsterKind;
  killNeeded?: number;
  rewardItem?: string;
  rewardCount?: number;
  extraRewards?: { defId: string; count: number }[];
  relationDelta: number;
  xpReward: number;
  moneyReward?: number;
  /** Spawn N hostile monsters around the quest giver when quest is accepted */
  spawnMonstersOnAccept?: number;
}

/* ── Side quest definition (independent, no prerequisite chain) ─ */
export interface SideQuestStep extends PlotStep {
  id: string;
}

/* ── Side quests — populated by content modules via registerSideQuest() */
export const SIDE_QUESTS: SideQuestStep[] = [];

/** Register a side quest content pack (called by content modules at import) */
export function registerSideQuest(
  npcId: string, npc: PlotNpcDef, quests: SideQuestStep[],
): void {
  PLOT_NPCS[npcId] = npc;
  SIDE_QUESTS.push(...quests);
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** Check if an entity is a plot NPC */
export function isPlotNpc(e: Entity): boolean {
  return !!e.plotNpcId;
}

/** Get the PlotNpcDef for an entity (or undefined) */
export function getPlotDef(e: Entity): PlotNpcDef | undefined {
  return e.plotNpcId ? PLOT_NPCS[e.plotNpcId] : undefined;
}

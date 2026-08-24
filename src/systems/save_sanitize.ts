/* ── Санитайзеры загружаемого сейва ────────────────────────────────
 * Чистые функции «вход → выход»: ни одна не читает общий стейт игры.
 * Приводят недоверенный localStorage-объект текущей формы к валидным
 * структурам, обрезая строки, диапазоны и длины массивов.
 *
 * Формы прошлых версий здесь не поддерживаются: несовместимый сейв
 * отвергается по SAVE_SHAPE_VERSION, а не чинится.
 */

import { SAVE_QUEST_CAP } from './save_payload';
import { Faction, GameClock, Item, MonsterKind, Needs, Quest, QuestType, RPGStats, RoomType,
  WorldEventPrivacy, WorldEventSeverity } from '../core/types';
import { ITEMS, WEAPON_STATS, freshNeeds } from '../data/catalog';
import { DESIGN_FLOOR_ROUTES, isValidZ } from '../data/design_floors';
import { MAX_INVENTORY_SLOTS } from '../data/inventory_limits';
import { getStack, itemEquipSlot } from '../data/items';
import { getPlotNpcNumericId } from '../data/npc_packages';
import { RPG_ATTRIBUTE_CAP, RPG_LEVEL_CAP, freshRPG, getMaxPsi, xpForLevel } from './rpg';
import { compactSaveData } from './save_payload';

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const SAVE_INVENTORY_SLOT_CAP = MAX_INVENTORY_SLOTS;

const SAVE_TEXT_CAP = 192;
export const MAX_SAVE_MONEY = 999_999;
const MAX_QUEST_TIME_LIMIT_MINUTES = 5 * 24 * 60;
const EVENT_PRIVACIES: readonly WorldEventPrivacy[] = ['public', 'local', 'witnessed', 'private', 'secret'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteInt(value: unknown, fallback: number): number {
  return Math.trunc(finiteNumber(value, fallback));
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, finiteInt(value, fallback)));
}

function cleanSaveText(value: unknown, fallback = '', max = SAVE_TEXT_CAP): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

export function normalizeNeeds(input: unknown): Needs {
  const src = isRecord(input) ? input : {};
  const base = freshNeeds();
  return {
    food: clampNumber(src.food, base.food, 0, 100),
    water: clampNumber(src.water, base.water, 0, 100),
    sleep: clampNumber(src.sleep, base.sleep, 0, 100),
    pee: clampNumber(src.pee, base.pee, 0, 100),
    poo: clampNumber(src.poo, base.poo, 0, 100),
    pendingPee: src.pendingPee === undefined ? undefined : clampNumber(src.pendingPee, 0, 0, 100),
    pendingPoo: src.pendingPoo === undefined ? undefined : clampNumber(src.pendingPoo, 0, 0, 100),
  };
}

export function normalizeInventory(input: unknown): Item[] {
  if (!Array.isArray(input)) return [];
  const out: Item[] = [];
  for (const raw of input) {
    if (out.length >= SAVE_INVENTORY_SLOT_CAP || !isRecord(raw)) break;
    const defId = cleanSaveText(raw.defId, '', 64);
    const def = ITEMS[defId];
    if (!def) continue;
    let count = clampInt(raw.count, 1, 1, Math.max(1, getStack(def) * SAVE_INVENTORY_SLOT_CAP));
    const data = compactSaveData(raw.data);
    while (count > 0 && out.length < SAVE_INVENTORY_SLOT_CAP) {
      const add = Math.min(count, getStack(def));
      out.push(data === undefined ? { defId, count: add } : { defId, count: add, data });
      count -= add;
    }
  }
  return out;
}

export function normalizeEquippedItem(
  value: unknown,
  inventory: readonly Item[],
  equipSlot: 'weapon' | 'tool' | 'armor',
): string {
  const defId = cleanSaveText(value, '', 64);
  if (!defId || !inventory.some(slot => slot.defId === defId)) return '';
  const def = ITEMS[defId];
  if (!def || itemEquipSlot(def) !== equipSlot) return '';
  if (equipSlot === 'weapon' && !WEAPON_STATS[defId]) return '';
  return defId;
}

export function normalizeRpg(input: unknown): RPGStats {
  const src = isRecord(input) ? input : {};
  const level = clampInt(src.level, 1, 1, RPG_LEVEL_CAP);
  const rpg = freshRPG(level);
  const xpCap = level >= RPG_LEVEL_CAP ? 0 : Math.max(0, xpForLevel(level + 1) - 1);
  rpg.xp = clampInt(src.xp, 0, 0, xpCap);
  rpg.attrPoints = clampInt(src.attrPoints, 0, 0, RPG_ATTRIBUTE_CAP);
  rpg.str = clampInt(src.str, 0, 0, RPG_ATTRIBUTE_CAP);
  rpg.agi = clampInt(src.agi, 0, 0, RPG_ATTRIBUTE_CAP);
  rpg.int = clampInt(src.int, 0, 0, RPG_ATTRIBUTE_CAP);
  rpg.maxPsi = getMaxPsi(rpg);
  rpg.psi = clampNumber(src.psi, rpg.maxPsi, 0, rpg.maxPsi);
  return rpg;
}

export function normalizeClock(input: unknown): GameClock {
  const src = isRecord(input) ? input : {};
  const totalMinutes = clampInt(src.totalMinutes, 0, 0, 365 * 24 * 60);
  return {
    hour: clampInt(src.hour, Math.floor(totalMinutes / 60) % 24, 0, 23),
    minute: clampInt(src.minute, totalMinutes % 60, 0, 59),
    totalMinutes,
  };
}

function normalizeQuestType(value: unknown): QuestType | undefined {
  return typeof value === 'number' && QuestType[value] !== undefined ? value as QuestType : undefined;
}

function normalizeRoomType(value: unknown): RoomType | undefined {
  return typeof value === 'number' && RoomType[value] !== undefined ? value as RoomType : undefined;
}

function normalizeMonsterKind(value: unknown): MonsterKind | undefined {
  return typeof value === 'number' && MonsterKind[value] !== undefined ? value as MonsterKind : undefined;
}

function normalizeFaction(value: unknown): Faction | undefined {
  return typeof value === 'number' && Faction[value] !== undefined ? value as Faction : undefined;
}

function normalizeEventPrivacy(value: unknown): WorldEventPrivacy | undefined {
  return typeof value === 'string' && EVENT_PRIVACIES.includes(value as WorldEventPrivacy)
    ? value as WorldEventPrivacy
    : undefined;
}

function normalizeEventSeverity(value: unknown): WorldEventSeverity | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(5, Math.round(value))) as WorldEventSeverity
    : undefined;
}

function normalizeStringArray(value: unknown, maxItems = 8, maxLen = 48): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (out.length >= maxItems) break;
    if (typeof raw !== 'string') continue;
    const clean = raw.slice(0, maxLen);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out.length > 0 ? out : undefined;
}

function normalizeRewardList(value: unknown): Quest['extraRewards'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: { defId: string; count: number }[] = [];
  for (const raw of value) {
    if (out.length >= 8 || !isRecord(raw)) break;
    const defId = cleanSaveText(raw.defId, '', 64);
    if (!ITEMS[defId]) continue;
    out.push({ defId, count: clampInt(raw.count, 1, 1, 999) });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeQuestTargetRoute(value: unknown): Quest['targetRoute'] | undefined {
  if (!isRecord(value)) return undefined;
  const out: NonNullable<Quest['targetRoute']> = {};
  const designFloorId = cleanSaveText(value.designFloorId, '', 64);
  if (designFloorId && DESIGN_FLOOR_ROUTES.some(route => route.id === designFloorId)) out.designFloorId = designFloorId;
  if (typeof value.z === 'number' && Number.isFinite(value.z)) out.z = clampInt(value.z, 0, -50, 50);
  const anomalyId = cleanSaveText(value.anomalyId, '', 64);
  if (anomalyId) out.anomalyId = anomalyId;
  const proceduralTag = cleanSaveText(value.proceduralTag, '', 64);
  if (proceduralTag) out.proceduralTag = proceduralTag;
  const tags = normalizeStringArray(value.tags, 8, 48);
  if (tags) out.tags = tags;
  const label = cleanSaveText(value.label, '', 96);
  if (label) out.label = label;
  if (value.risk !== undefined) out.risk = clampInt(value.risk, 1, 1, 5);
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeQuestTargets(q: Quest, raw: Record<string, unknown>): void {
  const targetItem = cleanSaveText(raw.targetItem, '', 64);
  if (targetItem === 'money' || ITEMS[targetItem]) q.targetItem = targetItem;
  if (raw.targetCount !== undefined) q.targetCount = clampInt(raw.targetCount, 1, 1, 999);
  if (typeof raw.targetRoom === 'number' && Number.isFinite(raw.targetRoom)) {
    q.targetRoom = clampInt(raw.targetRoom, -1, -1, 100_000);
  }
  if (isValidZ(raw.targetFloorZ)) q.targetFloorZ = raw.targetFloorZ;
  const targetRoomType = normalizeRoomType(raw.targetRoomType);
  if (targetRoomType !== undefined) q.targetRoomType = targetRoomType;
  const targetRoomDefId = cleanSaveText(raw.targetRoomDefId, '', 96);
  if (targetRoomDefId) q.targetRoomDefId = targetRoomDefId;
  const targetZoneTag = cleanSaveText(raw.targetZoneTag, '', 48);
  if (targetZoneTag) q.targetZoneTag = targetZoneTag;
  q.targetRoute = normalizeQuestTargetRoute(raw.targetRoute);
  const targetHint = cleanSaveText(raw.targetHint);
  if (targetHint) q.targetHint = targetHint;
  const targetMonsterKind = normalizeMonsterKind(raw.targetMonsterKind);
  if (targetMonsterKind !== undefined) q.targetMonsterKind = targetMonsterKind;
  if (raw.killCount !== undefined) q.killCount = clampInt(raw.killCount, 0, 0, 999);
  if (raw.killNeeded !== undefined) q.killNeeded = clampInt(raw.killNeeded, 1, 1, 999);
  const targetNpcName = cleanSaveText(raw.targetNpcName, '', 96);
  if (targetNpcName) q.targetNpcName = targetNpcName;
  // Раньше поле разбиралось ДВАЖДЫ в одной функции: первый блок допускал −1,
  // второй тут же перетирал результат диапазоном с нуля, то есть первый не мог
  // ни на что повлиять. Заодно вернулась строгая проверка: `!Number.isNaN`
  // пропускает Infinity, `Number.isFinite` — нет.
  if (typeof raw.targetNpcId === 'number' && Number.isFinite(raw.targetNpcId)) {
    q.targetNpcId = clampInt(raw.targetNpcId, 0, 0, 1_000_000);
  } else if (typeof raw.targetNpcId === 'string' && raw.targetNpcId.length > 0) {
    const numId = getPlotNpcNumericId(raw.targetNpcId)!;
    if (numId !== undefined) q.targetNpcId = numId;
  }
}

function normalizeQuestRewards(q: Quest, raw: Record<string, unknown>): void {
  const rewardItem = cleanSaveText(raw.rewardItem, '', 64);
  if (ITEMS[rewardItem]) q.rewardItem = rewardItem;
  if (raw.rewardCount !== undefined) q.rewardCount = clampInt(raw.rewardCount, 1, 1, 999);
  q.extraRewards = normalizeRewardList(raw.extraRewards);
  if (raw.relationDelta !== undefined) q.relationDelta = clampInt(raw.relationDelta, 0, -100, 100);
  if (raw.difficulty !== undefined) q.difficulty = clampNumber(raw.difficulty, 1, 0, 10);
  if (raw.xpReward !== undefined) q.xpReward = clampInt(raw.xpReward, 0, 0, 100_000);
  if (raw.moneyReward !== undefined) q.moneyReward = clampInt(raw.moneyReward, 0, 0, MAX_SAVE_MONEY);
}

function normalizeQuestMeta(q: Quest, raw: Record<string, unknown>): void {
  if (typeof raw.plotStepIndex === 'number' && Number.isFinite(raw.plotStepIndex)) {
    q.plotStepIndex = clampInt(raw.plotStepIndex, 0, 0, 10_000);
  }
  const sideQuestId = cleanSaveText(raw.sideQuestId, '', 96);
  if (sideQuestId) q.sideQuestId = sideQuestId;
  const contractId = cleanSaveText(raw.contractId, '', 96);
  if (contractId) q.contractId = contractId;
  const contractFaction = normalizeFaction(raw.contractFaction);
  if (contractFaction !== undefined) q.contractFaction = contractFaction;
  if (raw.contractRank !== undefined) q.contractRank = clampInt(raw.contractRank, 0, 0, 10);
  if (isValidZ(raw.visitFloorZ)) q.visitFloorZ = raw.visitFloorZ;
  if (raw.giverless === true) q.giverless = true;
}

function normalizeQuestHold(q: Quest, raw: Record<string, unknown>): void {
  if (raw.holdSeconds !== undefined) q.holdSeconds = clampInt(raw.holdSeconds, 0, 1, 3600);
  if (raw.holdProgressSeconds !== undefined) q.holdProgressSeconds = clampNumber(raw.holdProgressSeconds, 0, 0, 3600);
  if (raw.holdLastTime !== undefined) q.holdLastTime = clampNumber(raw.holdLastTime, 0, 0, 1_000_000_000);
  if (raw.holdResetOnExit !== undefined) q.holdResetOnExit = raw.holdResetOnExit === true;
  if (raw.holdSpawnMonsters !== undefined) q.holdSpawnMonsters = clampInt(raw.holdSpawnMonsters, 0, 0, 32);
  if (raw.holdSpawnIntervalSeconds !== undefined) q.holdSpawnIntervalSeconds = clampNumber(raw.holdSpawnIntervalSeconds, 1, 1, 600);
  if (raw.holdSpawnMaxAlive !== undefined) q.holdSpawnMaxAlive = clampInt(raw.holdSpawnMaxAlive, 1, 1, 64);
  if (raw.holdSpawnLastTime !== undefined) q.holdSpawnLastTime = clampNumber(raw.holdSpawnLastTime, 0, 0, 1_000_000_000);
}

function normalizeQuestEvents(q: Quest, raw: Record<string, unknown>): void {
  q.eventTags = normalizeStringArray(raw.eventTags);
  const eventData = compactSaveData(raw.eventData);
  if (isRecord(eventData)) q.eventData = eventData;
  q.eventPrivacy = normalizeEventPrivacy(raw.eventPrivacy);
  q.eventSeverity = normalizeEventSeverity(raw.eventSeverity);
  const eventTargetName = cleanSaveText(raw.eventTargetName);
  if (eventTargetName) q.eventTargetName = eventTargetName;
  if (typeof raw.failOnNpcDeathId === 'number' && !Number.isNaN(raw.failOnNpcDeathId)) {
    q.failOnNpcDeathId = clampInt(raw.failOnNpcDeathId, 0, 0, 1_000_000);
  } else if (typeof raw.failOnNpcDeathId === 'string' && raw.failOnNpcDeathId.length > 0) {
    const numId = getPlotNpcNumericId(raw.failOnNpcDeathId);
    if (numId !== undefined) q.failOnNpcDeathId = numId;
  }
  q.abandonsSideQuestIds = normalizeStringArray(raw.abandonsSideQuestIds, 12, 96);
}

function normalizeQuestTimeLimit(q: Quest, raw: Record<string, unknown>, nowMinutes: number): void {
  const timeLimit = raw.timeLimitMinutes === undefined
    ? undefined
    : clampInt(raw.timeLimitMinutes, 0, 1, MAX_QUEST_TIME_LIMIT_MINUTES);
  let expiresAt = raw.expiresAtMinutes === undefined
    ? undefined
    : clampInt(raw.expiresAtMinutes, 0, 0, nowMinutes + MAX_QUEST_TIME_LIMIT_MINUTES);
  if (timeLimit !== undefined) {
    q.timeLimitMinutes = timeLimit;
    if (expiresAt === undefined && !q.done) expiresAt = Math.ceil(nowMinutes + timeLimit);
  }
  if (expiresAt !== undefined) q.expiresAtMinutes = expiresAt;
  if (raw.failed === true) q.failed = true;
}

function isQuestValid(q: Quest): boolean {
  if (!q.done) {
    if (q.type === QuestType.FETCH && !q.targetItem) return false;
    if (q.type === QuestType.VISIT && q.targetRoom === undefined && q.targetRoomDefId === undefined && q.targetRoute === undefined && q.visitFloorZ === undefined) return false;
    if (q.type === QuestType.KILL && q.targetMonsterKind === undefined && !q.targetNpcId && q.killNeeded === undefined) return false;
    // Слоты сюжетных личностей начинаются с единицы, поэтому ноль не принадлежит
    // никому. Стояло `=== undefined && !q.targetNpcId`: второй конъюнкт не мог
    // добавить ни одного входа, и TALK-квест с нулевой целью проходил проверку
    // невыполнимым — тогда как KILL строкой выше такой же ноль отбрасывал.
    if (q.type === QuestType.TALK && !q.targetNpcId) return false;
  }
  return true;
}

function normalizeQuest(raw: unknown, nowMinutes: number): Quest | null {
  if (!isRecord(raw)) return null;
  const type = normalizeQuestType(raw.type);
  if (type === undefined) return null;
  const desc = cleanSaveText(raw.desc);
  if (!desc) return null;
  const id = clampInt(raw.id, 0, 1, 1_000_000);
  const done = raw.done === true || raw.failed === true;
  const q: Quest = {
    id,
    type,
    giverId: clampInt(raw.giverId, -1, -1, 1_000_000),
    giverName: cleanSaveText(raw.giverName, '???', 96),
    desc,
    done,
  };
  
  if (typeof raw.giverPlotNpcId === 'number' && !Number.isNaN(raw.giverPlotNpcId)) {
    q.giverId = clampInt(raw.giverPlotNpcId, 0, 0, 1_000_000);
  } else if (typeof raw.giverPlotNpcId === 'string' && raw.giverPlotNpcId.length > 0) {
    const numId = getPlotNpcNumericId(raw.giverPlotNpcId)!;
    if (numId !== undefined) q.giverId = numId;
  }

  normalizeQuestTargets(q, raw);
  normalizeQuestRewards(q, raw);
  normalizeQuestMeta(q, raw);
  normalizeQuestHold(q, raw);
  normalizeQuestEvents(q, raw);
  normalizeQuestTimeLimit(q, raw, nowMinutes);

  if (!isQuestValid(q)) return null;

  return q;
}

export function normalizeQuestList(input: unknown, nextQuestIdInput: unknown, nowMinutes: number): { quests: Quest[]; nextQuestId: number } {
  const quests: Quest[] = [];
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (quests.length >= SAVE_QUEST_CAP) break;
      const quest = normalizeQuest(raw, nowMinutes);
      if (quest) quests.push(quest);
    }
  }
  let nextQuestId = clampInt(nextQuestIdInput, 1, 1, 1_000_001);
  for (const quest of quests) nextQuestId = Math.max(nextQuestId, quest.id + 1);
  return { quests, nextQuestId };
}

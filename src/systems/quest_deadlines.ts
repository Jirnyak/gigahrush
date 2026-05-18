import { QuestType, type Quest } from '../core/types';

export interface QuestDeadlineContext {
  samosborDanger?: boolean;
  nearbyMonster?: boolean;
  crossFloor?: boolean;
  distance?: number;
}

const MIN_URGENT_MINUTES = 60;
const NORMAL_QUEST_MINUTES = 24 * 60;
const MAX_QUEST_MINUTES = 5 * 24 * 60;

const URGENT_FETCH_ITEMS = new Set([
  'antibiotic', 'bandage', 'pills', 'antidep',
  'water', 'bread', 'canned', 'ammo_9mm', 'ammo_762', 'ammo_shells',
]);

export function isHandAuthoredQuest(q: Quest): boolean {
  return (q.plotStepIndex !== undefined || q.sideQuestId !== undefined) && q.expiresAtMinutes === undefined;
}

export function assignProceduralQuestDeadline(
  q: Quest,
  nowMinutes: number,
  ctx: QuestDeadlineContext = {},
): Quest {
  if (isHandAuthoredQuest(q)) return q;
  const limit = proceduralQuestTimeLimitMinutes(q, ctx);
  q.timeLimitMinutes = limit;
  q.expiresAtMinutes = Math.ceil(nowMinutes + limit);
  return q;
}

export function questRemainingMinutes(q: Quest, nowMinutes: number): number | undefined {
  if (q.expiresAtMinutes === undefined || isHandAuthoredQuest(q)) return undefined;
  return Math.max(0, Math.ceil(q.expiresAtMinutes - nowMinutes));
}

export function formatQuestMinutes(minutes: number): string {
  const mins = Math.max(0, Math.ceil(minutes));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${rem}м`;
  return `${rem}м`;
}

function proceduralQuestTimeLimitMinutes(q: Quest, ctx: QuestDeadlineContext): number {
  let base = NORMAL_QUEST_MINUTES;
  if (q.type === QuestType.KILL) base = 18 * 60;
  if (q.type === QuestType.TALK) base = 20 * 60;

  const urgent = ctx.samosborDanger || ctx.nearbyMonster;
  if (urgent) {
    if (ctx.nearbyMonster && q.type === QuestType.KILL && (q.killNeeded ?? 1) <= 1) {
      base = MIN_URGENT_MINUTES;
    } else if (q.type === QuestType.KILL) {
      base = 3 * 60;
    } else if (q.type === QuestType.FETCH && q.targetItem && URGENT_FETCH_ITEMS.has(q.targetItem)) {
      base = 6 * 60;
    } else {
      base = Math.min(base, 12 * 60);
    }
  }

  let extra = 0;
  const targetCount = q.targetCount ?? 1;
  if (targetCount > 1) extra += Math.min(24 * 60, (targetCount - 1) * 30);

  const killNeeded = q.killNeeded ?? 1;
  if (q.type === QuestType.KILL && killNeeded > 1) extra += (killNeeded - 1) * 3 * 60;

  const distance = ctx.distance ?? 0;
  if (distance > 120) extra += 12 * 60;
  else if (distance > 60) extra += 6 * 60;

  if (q.difficulty !== undefined) {
    if (q.difficulty >= 4) extra += 24 * 60;
    else if (q.difficulty >= 2) extra += 12 * 60;
  }

  if (q.contractRank !== undefined) extra += Math.max(0, q.contractRank) * 6 * 60;

  let total = base + extra;
  if (q.visitFloor !== undefined || ctx.crossFloor) total = Math.max(total, 2 * 24 * 60);
  return Math.max(MIN_URGENT_MINUTES, Math.min(MAX_QUEST_MINUTES, Math.round(total)));
}

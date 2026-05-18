/* ── Govnyak pressure items: bounded relief, cough, debt ─────── */

import {
  EntityType,
  type Entity,
  type GameState,
  type PlayerStatus,
  type PlayerStatusId,
  type PlayerStatusSource,
  type WorldEventSeverity,
} from '../core/types';
import { ITEMS } from '../data/items';
import { publishEvent } from './events';

export const GOVNYAK_ITEM_IDS = [
  'govnyak_roll',
  'govnyak_brick',
  'govnyak_sample',
  'govnyak_bad_batch',
] as const;

export type GovnyakItemId = typeof GOVNYAK_ITEM_IDS[number];

interface GovnyakUseDef {
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

const GOVNYAK_USE: Record<GovnyakItemId, GovnyakUseDef> = {
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

export interface GovnyakUseResult {
  text: string;
  severity: WorldEventSeverity;
  badBatch: boolean;
}

export function isGovnyakItem(defId: string): defId is GovnyakItemId {
  return (GOVNYAK_ITEM_IDS as readonly string[]).includes(defId);
}

function itemName(defId: string): string {
  return ITEMS[defId]?.name ?? defId;
}

function statusIndex(e: Entity, id: PlayerStatusId): number {
  return (e.statuses ?? []).findIndex(s => s.id === id);
}

function getStatus(e: Entity, id: PlayerStatusId): PlayerStatus | undefined {
  const idx = statusIndex(e, id);
  return idx >= 0 ? e.statuses?.[idx] : undefined;
}

function upsertStatus(
  e: Entity,
  id: PlayerStatusId,
  source: PlayerStatusSource,
  now: number,
  duration: number,
  intensity: number,
  badReaction = false,
): PlayerStatus {
  if (!e.statuses) e.statuses = [];
  const idx = statusIndex(e, id);
  const prev = idx >= 0 ? e.statuses[idx] : undefined;
  const status: PlayerStatus = {
    id,
    source,
    startedAt: prev?.startedAt ?? now,
    expiresAt: Math.max(prev?.expiresAt ?? 0, now + duration),
    intensity,
    badReaction: badReaction || prev?.badReaction,
  };
  if (idx >= 0) e.statuses[idx] = status;
  else e.statuses.push(status);
  return status;
}

function statusIntensity(e: Entity, id: PlayerStatusId): number {
  return getStatus(e, id)?.intensity ?? 0;
}

function publishGovnyakStatusEvent(
  state: GameState | undefined,
  actor: Entity,
  type: 'player_status_applied' | 'player_status_expired' | 'player_status_cured' | 'player_status_bad_reaction',
  status: PlayerStatus,
  severity: WorldEventSeverity,
  tags: string[],
): void {
  if (!state || actor.type !== EntityType.PLAYER) return;
  publishEvent(state, {
    type,
    actorId: actor.id,
    actorName: actor.name ?? 'Вы',
    actorFaction: actor.faction,
    itemId: status.source,
    itemName: itemName(status.source),
    severity,
    privacy: severity >= 4 ? 'local' : 'private',
    tags: ['player', 'govnyak', 'contraband', 'status', ...tags],
    data: {
      statusId: status.id,
      source: status.source,
      intensity: status.intensity ?? 0,
      expiresAt: status.expiresAt,
      badReaction: status.badReaction === true,
      rumorIds: tags.includes('bad_batch')
        ? ['govnyak_bad_batch']
        : tags.includes('recovery')
          ? ['govnyak_recovery']
          : ['govnyak_debt'],
    },
  });
}

export function useGovnyakItem(actor: Entity, defId: string, state?: GameState): GovnyakUseResult | undefined {
  if (!isGovnyakItem(defId)) return undefined;
  const def = GOVNYAK_USE[defId];
  const now = state?.time ?? 0;
  const source = defId as PlayerStatusSource;
  const badBatch = def.badChance >= 1 || Math.random() < def.badChance;

  if (actor.rpg) actor.rpg.psi = Math.min(actor.rpg.maxPsi, actor.rpg.psi + def.psiRelief);
  if (actor.needs) {
    actor.needs.water = Math.max(0, actor.needs.water - def.thirstCost);
    actor.needs.sleep = Math.max(0, actor.needs.sleep - def.sleepCost);
  }
  if (def.hpCost > 0 && actor.hp !== undefined) actor.hp = Math.max(1, actor.hp - def.hpCost);
  actor.attackCd = Math.max(actor.attackCd ?? 0, def.attackDelay);
  if (badBatch && def.badMadness > 0) actor.psiMadness = Math.max(actor.psiMadness ?? 0, def.badMadness);

  upsertStatus(actor, 'govnyak_relief', source, now, def.reliefSeconds, 1);
  const cough = upsertStatus(
    actor,
    'govnyak_cough',
    source,
    now,
    badBatch ? def.coughSeconds * 1.4 : def.coughSeconds,
    Math.min(3, statusIntensity(actor, 'govnyak_cough') + (badBatch ? 1.1 : 0.65)),
    badBatch,
  );
  const debt = upsertStatus(
    actor,
    'govnyak_debt',
    source,
    now,
    def.debtSeconds,
    Math.min(3, statusIntensity(actor, 'govnyak_debt') + def.debt),
    badBatch,
  );

  if (state && actor.type === EntityType.PLAYER) {
    publishEvent(state, {
      type: 'player_use_item',
      actorId: actor.id,
      actorName: actor.name ?? 'Вы',
      actorFaction: actor.faction,
      itemId: defId,
      itemName: itemName(defId),
      itemCount: 1,
      itemValue: ITEMS[defId]?.value ?? 0,
      severity: badBatch ? 4 : 3,
      privacy: badBatch ? 'local' : 'private',
      tags: ['player', 'inventory', 'govnyak', 'contraband', 'use', badBatch ? 'bad_batch' : 'relief'],
      data: {
        psiRelief: def.psiRelief,
        thirstCost: def.thirstCost,
        sleepCost: def.sleepCost,
        hpCost: def.hpCost,
        debtIntensity: debt.intensity ?? 0,
        coughIntensity: cough.intensity ?? 0,
        reliefSeconds: def.reliefSeconds,
        coughSeconds: cough.expiresAt - now,
        rumorIds: [badBatch ? 'govnyak_bad_batch' : 'govnyak_trade'],
      },
    });
    publishGovnyakStatusEvent(state, actor, 'player_status_applied', debt, 3, ['debt']);
    if (badBatch) publishGovnyakStatusEvent(state, actor, 'player_status_bad_reaction', cough, 4, ['bad_batch', 'cough']);
  }

  const debtLabel = Math.ceil((debt.intensity ?? 0) * 10) / 10;
  const cost = `вода -${def.thirstCost}${def.hpCost > 0 ? `, HP -${def.hpCost}` : ''}`;
  if (badBatch) {
    return {
      text: `Говняк сорвался: ПСИ +${def.psiRelief}, ${cost}. Кашель и долг ${debtLabel}/3`,
      severity: 4,
      badBatch,
    };
  }
  return {
    text: `Говняк притушил шум: ПСИ +${def.psiRelief}, ${cost}. Кашель держит прицел, долг ${debtLabel}/3`,
    severity: 3,
    badBatch,
  };
}

export function govnyakAimSpreadMult(e: Entity): number {
  const cough = statusIntensity(e, 'govnyak_cough');
  const debt = statusIntensity(e, 'govnyak_debt');
  if (cough <= 0 && debt <= 0) return 1;
  return 1 + Math.min(0.75, cough * 0.16 + debt * 0.08);
}

export function updateGovnyakConditions(e: Entity, state: GameState): void {
  if (!e.statuses || e.statuses.length === 0) return;
  const now = state.time;
  for (let i = e.statuses.length - 1; i >= 0; i--) {
    const status = e.statuses[i];
    if (!status.id.startsWith('govnyak_') || status.expiresAt > now) continue;
    e.statuses.splice(i, 1);
    if (status.id === 'govnyak_debt') {
      publishGovnyakStatusEvent(state, e, 'player_status_cured', status, 3, ['recovery', 'debt_clear']);
    } else if (status.id === 'govnyak_cough') {
      publishGovnyakStatusEvent(state, e, 'player_status_expired', status, 2, ['recovery', 'cough_clear']);
    }
  }
  if (e.statuses.length === 0) e.statuses = undefined;
}

import {
  EntityType,
  type Entity,
  type GameState,
  type Msg,
  type PlayerStatus,
  type PlayerStatusId,
  type PlayerStatusSource,
  type WorldEventType,
  msg,
} from '../core/types';
import { publishEvent } from './events';

export const ZHELEMISH_SKIN_ID: PlayerStatusId = 'zhelemish_skin';
export const ZHELEMISH_RAW_ITEM = 'zhelemish_raw';
const ZHELEMISH_TREATED_ITEMS = new Set(['zhelemish_dried', 'zhelemish_boiled']);

const RAW_DURATION = 180;
const TREATED_DURATION = 150;
const DEBUG_DURATION = 90;
const RAW_BAD_REACTION_CHANCE = 0.22;
const MELEE_DAMAGE_MULT = 0.7;
const MOVE_MULT = 0.82;
const HEAL_MULT = 0.55;
const WATER_DRAIN = 0.045;
const BAD_WATER_DRAIN = 0.075;
const RAW_USE_RUMOR_ID = 'zhelemish_raw_use_reaction';
const TREATED_USE_RUMOR_ID = 'zhelemish_treated_use_tradeoff';
const GOVNYAK_STATUS_IDS = new Set<PlayerStatusId>(['govnyak_relief', 'govnyak_cough', 'govnyak_debt']);
const GOVNYAK_STATUS_SOURCES = new Set<PlayerStatusSource>([
  'govnyak_roll',
  'govnyak_brick',
  'govnyak_sample',
  'govnyak_bad_batch',
]);

export interface ZhelemishApplyResult {
  status: PlayerStatus;
  refreshed: boolean;
  badReaction: boolean;
}

function zhelemishDuration(source: PlayerStatusSource): number {
  if (source === 'zhelemish_raw') return RAW_DURATION;
  if (source === 'zhelemish_treated') return TREATED_DURATION;
  return DEBUG_DURATION;
}

function sourceLabel(source: PlayerStatusSource): string {
  if (source === 'zhelemish_raw') return 'сырой';
  if (source === 'zhelemish_treated') return 'дубленый';
  return 'отладочный';
}

function sourceTags(source: PlayerStatusSource): string[] {
  if (source === 'zhelemish_raw') return ['raw_use', 'sample_spoiled'];
  if (source === 'zhelemish_treated') return ['treated_use', 'survival_tradeoff'];
  return ['debug'];
}

function useRumorIds(source: PlayerStatusSource): string[] {
  return source === 'zhelemish_raw' ? [RAW_USE_RUMOR_ID] : [TREATED_USE_RUMOR_ID];
}

function statusEvent(
  state: GameState | undefined,
  actor: Entity,
  type: WorldEventType,
  severity: 0 | 1 | 2 | 3 | 4 | 5,
  privacy: 'private' | 'witnessed',
  data?: Record<string, unknown>,
): void {
  if (!state || actor.type !== EntityType.PLAYER) return;
  const source = typeof data?.source === 'string' ? data.source as PlayerStatusSource : undefined;
  const tags = ['player', 'status', 'zhelemish', 'condition'];
  if (source) tags.push(...sourceTags(source));
  if (data?.npcReaction) tags.push('npc_reaction');
  publishEvent(state, {
    type,
    actorId: actor.id,
    actorName: actor.name ?? 'Вы',
    actorFaction: actor.faction,
    severity,
    privacy,
    tags,
    data: { statusId: ZHELEMISH_SKIN_ID, ...data },
  });
}

export function normalizePlayerStatuses(input: unknown): PlayerStatus[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: PlayerStatus[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Partial<PlayerStatus>;
    if (rec.id !== ZHELEMISH_SKIN_ID && !GOVNYAK_STATUS_IDS.has(rec.id as PlayerStatusId)) continue;
    const source = rec.id === ZHELEMISH_SKIN_ID
      ? rec.source === 'zhelemish_raw' || rec.source === 'zhelemish_treated' || rec.source === 'debug'
        ? rec.source
        : 'zhelemish_raw'
      : GOVNYAK_STATUS_SOURCES.has(rec.source as PlayerStatusSource)
        ? rec.source as PlayerStatusSource
        : 'govnyak_roll';
    const startedAt = Number.isFinite(rec.startedAt) ? Number(rec.startedAt) : 0;
    const expiresAt = Number.isFinite(rec.expiresAt) ? Number(rec.expiresAt) : 0;
    if (expiresAt <= startedAt) continue;
    const id = rec.id === ZHELEMISH_SKIN_ID ? ZHELEMISH_SKIN_ID : rec.id as PlayerStatusId;
    out.push({
      id,
      source,
      startedAt,
      expiresAt,
      intensity: Number.isFinite(rec.intensity) ? Number(rec.intensity) : undefined,
      badReaction: rec.badReaction === true,
    });
  }
  return out.length > 0 ? out : undefined;
}

export function activeZhelemishSkin(entity: Entity, time: number): PlayerStatus | undefined {
  for (const status of entity.statuses ?? []) {
    if (status.id === ZHELEMISH_SKIN_ID && status.expiresAt > time) return status;
  }
  return undefined;
}

export function isZhelemishSkinItem(itemId: string): boolean {
  return itemId === ZHELEMISH_RAW_ITEM || ZHELEMISH_TREATED_ITEMS.has(itemId);
}

export function zhelemishSourceForItem(itemId: string): PlayerStatusSource | null {
  if (itemId === ZHELEMISH_RAW_ITEM) return 'zhelemish_raw';
  if (ZHELEMISH_TREATED_ITEMS.has(itemId)) return 'zhelemish_treated';
  return null;
}

export function isZhelemishCureItem(itemId: string): boolean {
  return itemId === 'antifungal_ointment' || itemId === 'antibiotic';
}

export function applyZhelemishSkin(
  entity: Entity,
  time: number,
  source: PlayerStatusSource,
  state?: GameState,
  rng: () => number = Math.random,
): ZhelemishApplyResult {
  const duration = zhelemishDuration(source);
  const badReaction = source === 'zhelemish_raw' && rng() < RAW_BAD_REACTION_CHANCE;
  if (!entity.statuses) entity.statuses = [];
  const existing = entity.statuses.find(s => s.id === ZHELEMISH_SKIN_ID);
  const refreshed = existing !== undefined;
  const status: PlayerStatus = {
    id: ZHELEMISH_SKIN_ID,
    source,
    startedAt: time,
    expiresAt: time + duration,
    badReaction,
  };
  if (existing) Object.assign(existing, status);
  else entity.statuses.push(status);

  if (badReaction) {
    if (entity.needs) entity.needs.water = Math.max(0, entity.needs.water - 8);
    if (entity.rpg) entity.rpg.psi = Math.max(0, entity.rpg.psi - 2);
  }

  statusEvent(state, entity, 'player_status_applied', 3, 'private', {
    source,
    duration,
    refreshed,
    incomingMeleeDamageMult: MELEE_DAMAGE_MULT,
    moveMult: MOVE_MULT,
    healMult: HEAL_MULT,
    waterDrainPerSecond: WATER_DRAIN,
    badWaterDrainPerSecond: BAD_WATER_DRAIN,
    outcome: source === 'zhelemish_raw' ? 'raw_eaten_sample_spoiled' : 'treated_survival_use',
    bounded: true,
    rumorIds: useRumorIds(source),
  });
  if (badReaction) {
    statusEvent(state, entity, 'player_status_bad_reaction', 4, 'witnessed', {
      source,
      waterLoss: 8,
      psiLoss: 2,
      outcome: 'raw_bad_reaction',
      npcReaction: 'sanitary_witness',
      rumorIds: [RAW_USE_RUMOR_ID],
    });
  }
  return { status: existing ?? status, refreshed, badReaction };
}

export function applyZhelemishSkinWithMessage(
  entity: Entity,
  time: number,
  msgs: Msg[],
  source: PlayerStatusSource,
  state?: GameState,
  rng?: () => number,
): ZhelemishApplyResult {
  const result = applyZhelemishSkin(entity, time, source, state, rng);
  const verb = result.refreshed ? 'обновился' : 'сел на кожу';
  const tradeoff = source === 'zhelemish_raw'
    ? 'еда сейчас, проба испорчена'
    : 'обработанный запас, но не настоящее лечение';
  msgs.push(msg(
    `Желемыш ${sourceLabel(source)} ${verb}: ${tradeoff}; ход вязнет, лечение хуже, вода уходит.`,
    time,
    '#9c6',
  ));
  if (result.badReaction) {
    msgs.push(msg('Плохая реакция: сушит горло, ПСИ шумит, от вас отворачиваются.', time, '#d68'));
  }
  return result;
}

export function cureZhelemishSkin(
  entity: Entity,
  time: number,
  msgs: Msg[],
  state?: GameState,
  reason = 'medicine',
): boolean {
  const statuses = entity.statuses;
  if (!statuses) return false;
  const idx = statuses.findIndex(s => s.id === ZHELEMISH_SKIN_ID && s.expiresAt > time);
  if (idx < 0) return false;
  const [removed] = statuses.splice(idx, 1);
  if (statuses.length === 0) delete entity.statuses;
  msgs.push(msg('Желемышная кожа сошла. Тело снова лечится обычно.', time, '#8cf'));
  statusEvent(state, entity, 'player_status_cured', 3, 'private', {
    source: removed.source,
    reason,
    remaining: Math.max(0, removed.expiresAt - time),
  });
  return true;
}

export function updateZhelemishSkinStatus(entity: Entity, state: GameState, dt: number): void {
  const statuses = entity.statuses;
  if (!statuses) return;
  for (let i = statuses.length - 1; i >= 0; i--) {
    const status = statuses[i];
    if (status.id !== ZHELEMISH_SKIN_ID) continue;
    if (status.expiresAt <= state.time) {
      statuses.splice(i, 1);
      state.msgs.push(msg('Желемышная кожа высохла и отвалилась.', state.time, '#8cf'));
      statusEvent(state, entity, 'player_status_expired', 2, 'private', { source: status.source });
    } else if (entity.needs) {
      const drain = (status.badReaction ? BAD_WATER_DRAIN : WATER_DRAIN) * dt;
      entity.needs.water = Math.max(0, entity.needs.water - drain);
    }
  }
  if (statuses.length === 0) delete entity.statuses;
}

export function zhelemishMoveMult(entity: Entity, time: number): number {
  return activeZhelemishSkin(entity, time) ? MOVE_MULT : 1;
}

export function zhelemishHealingMult(entity: Entity, time: number): number {
  return activeZhelemishSkin(entity, time) ? HEAL_MULT : 1;
}

export function zhelemishIncomingMeleeDamage(entity: Entity, time: number, damage: number): number {
  if (!activeZhelemishSkin(entity, time)) return damage;
  return Math.max(1, Math.round(damage * MELEE_DAMAGE_MULT));
}

export function zhelemishHudLine(entity: Entity, time: number): string | null {
  const status = activeZhelemishSkin(entity, time);
  if (!status) return null;
  const left = Math.max(0, Math.ceil(status.expiresAt - time));
  const raw = status.source === 'zhelemish_raw' ? 'сыр' : 'дуб';
  const bad = status.badReaction ? '!' : '';
  return `ЖЕЛЕМЫШ${bad} ${raw} ${left}s  вход.удар -30%  ход -18%  вода`;
}

export function zhelemishStatsLine(entity: Entity, time: number): string | null {
  const status = activeZhelemishSkin(entity, time);
  if (!status) return null;
  const left = Math.max(0, Math.ceil(status.expiresAt - time));
  const reaction = status.badReaction ? ' реакция: вода/ПСИ хуже' : '';
  return `Желемыш ${sourceLabel(status.source)}: ${left}s из ${zhelemishDuration(status.source)}s, входящий удар -30%, ход -18%, лечение -45%, вода уходит${reaction}`;
}

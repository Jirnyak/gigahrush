import { EntityType, type Entity, type GameState, type MonsterKind, type PlayerDamageRecord, type PlayerDamageSourceKind } from '../core/types';
/* Из ЛИСТА, а не из `psi.ts`: это единственное ребро замыкало цикл
 * `psi → combat_stimulus → factions → … → damage → psi`, из-за которого пси
 * получал дверь урона инъекцией и держал запасной путь мимо носимой брони. */
import { isNoClipActive } from './psi_state';
import type { World } from '../core/world';
import { ensureEntityIndex } from './entity_index';
import { isPlayerEntity } from './player_actor';
import { MONSTERS, entityDisplayName } from '../entities/monster';
import { mathRng } from '../core/rand';
import { DamageType } from '../core/types';
import { damageActorByEnvironment } from './actor_damage';

const DEATH_CAUSE_LOOKBACK_SEC = 4;
const DEATH_CAUSE_LOOKAHEAD_SEC = 1.5;

/**
 * Недобранный обвалом урон, накопленный между кадрами.
 *
 * Дверь округляет удар до целого (`applyDamage`), а обвал давит десятью в
 * секунду — это 0.17 за кадр, то есть ноль после округления и мёртвая механика.
 * Тот же приём и тем же именем уже стоит у клеточной опасности
 * (`HazardSubjectState.damageCarry`); здесь он снаружи сущности, потому что
 * своего состояния у раздавливания нет и в сейв ему не надо.
 */
const crushCarry = new WeakMap<Entity, number>();

function roundDamage(amount: number): number {
  return Math.max(0, Math.round(amount * 10) / 10);
}

function formatDamageAmount(amount: number): string {
  const rounded = roundDamage(amount);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function normalizeDamageDetail(detail: string, amount: number): string {
  const raw = String(amount);
  const formatted = formatDamageAmount(amount);
  if (raw === formatted) return detail;
  return detail.split(`-${raw}`).join(`-${formatted}`).split(`+${raw}`).join(`+${formatted}`);
}

function damageSourceKind(source: Entity | undefined): PlayerDamageSourceKind {
  if (!source) return 'unknown';
  if (source.type === EntityType.MONSTER) return 'monster';
  if (source.type === EntityType.NPC) return 'npc';
  if (source.type === EntityType.PROJECTILE) return 'projectile';
  return 'unknown';
}

function sourceName(source: Entity | undefined, kind: PlayerDamageSourceKind): string {
  switch (kind) {
    case 'monster':
    case 'npc':
      if (source) return entityDisplayName(source);
      return kind === 'monster' ? 'монстр' : 'жилец';
    case 'projectile':
      return source?.name ?? 'снаряд';
    case 'hazard': return 'опасная зона';
    case 'need': return 'истощение';
    case 'samosbor': return 'самосбор';
    case 'void': return 'правило Пустоты';
    default: return 'неизвестный источник';
  }
}

function explicitFailureDetail(source: Entity | undefined, amount: number): string | undefined {
  if (source?.monsterKind === undefined) return undefined;
  const cause = MONSTERS[source.monsterKind]?.boss?.deathCause;
  return cause ? `${cause}: -${formatDamageAmount(amount)}` : undefined;
}

export function recordPlayerDamage(
  state: GameState | undefined,
  source: Entity | undefined,
  amount: number,
  detail?: string,
  sourceKind: PlayerDamageSourceKind = damageSourceKind(source),
): void {
  if (!state || !Number.isFinite(amount) || amount <= 0) return;
  const rounded = roundDamage(amount);
  const amountLabel = formatDamageAmount(rounded);
  const name = sourceName(source, sourceKind);
  const failureDetail = explicitFailureDetail(source, rounded);
  state.lastDamage = {
    time: state.time,
    tick: state.tick,
    amount: rounded,
    sourceKind,
    sourceId: source?.id,
    sourceName: name,
    monsterKind: source?.monsterKind,
    weaponId: source?.weapon,
    detail: failureDetail ?? (detail && detail.length > 0 ? normalizeDamageDetail(detail, amount) : `${name}: -${amountLabel}`),
  };
}

export function formatLastPlayerDamageCause(
  state: GameState,
  deathTime: number,
): string | undefined {
  const last: PlayerDamageRecord | undefined = state.lastDamage;
  if (!last) return undefined;
  if (last.time < deathTime - DEATH_CAUSE_LOOKBACK_SEC || last.time > deathTime + DEATH_CAUSE_LOOKAHEAD_SEC) return undefined;
  return last.detail || `${last.sourceName}: -${last.amount}`;
}

/**
 * Кто нанёс смертельный удар, если это была тварь.
 *
 * Окно то же, что у причины смерти, и живёт оно ЗДЕСЬ: у экрана смерти своей
 * копии этих двух чисел быть не должно.
 */
export function lastPlayerDamageMonsterKind(state: GameState, deathTime: number): MonsterKind | undefined {
  const last: PlayerDamageRecord | undefined = state.lastDamage;
  if (!last || last.monsterKind === undefined) return undefined;
  if (last.time < deathTime - DEATH_CAUSE_LOOKBACK_SEC || last.time > deathTime + DEATH_CAUSE_LOOKAHEAD_SEC) return undefined;
  return last.monsterKind;
}

export function hasFreshPlayerDamageRecord(state: GameState, tick: number, time: number): boolean {
  const last = state.lastDamage;
  return !!last && last.tick === tick && Math.abs(last.time - time) <= 0.05;
}

export function updateBlockCrushDamage(
  world: World,
  entities: readonly Entity[],
  state: GameState,
  dt: number,
): void {
  const DAMAGE_PER_SECOND = 10;
  // Давит только людей и тварей: срез актёров — это ровно они, живые. Дропы,
  // снаряды и билборды тут не при чём, и перебирать их каждый кадр незачем.
  // Игрок — такой же NPC и лежит в том же срезе.
  const actors = ensureEntityIndex(entities).actors;
  for (const e of actors) {
    if (!e.alive) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER && !isPlayerEntity(e)) continue;

    // Skip noclippers and entities in phasing state
    if (e.phasing) continue;
    if (isPlayerEntity(e) && isNoClipActive()) continue;

    if (world.solid(Math.floor(e.x), Math.floor(e.y))) {
      const carried = (crushCarry.get(e) ?? 0) + DAMAGE_PER_SECOND * dt;
      const dmg = Math.floor(carried);
      crushCarry.set(e, carried - dmg);
      if (dmg <= 0) continue;
      /* Через единую дверь урона: бетон бьёт КИНЕТИКОЙ, и плита её держит так же,
       * как держала бы пулю. Раньше здоровье снималось здесь напрямую, и обвал
       * шёл сквозь любую броню целиком. Автора у обвала нет — репутацию он не
       * двигает и войны не начинает. */
      const applied = damageActorByEnvironment(world, state, e, {
        damage: dmg,
        damageType: DamageType.KINETIC,
        time: state.time,
      });
      if (applied <= 0) continue;
      if (isPlayerEntity(e)) {
        if (mathRng() < dt * 2) {
          state.dmgFlash = Math.max(state.dmgFlash ?? 0, 0.15);
        }
        recordPlayerDamage(state, undefined, applied, 'Раздавлен в структуре', 'hazard');
      }
    } else if (crushCarry.get(e) !== undefined) {
      crushCarry.delete(e);
    }
  }
}


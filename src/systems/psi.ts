/* ── PSI spell system: сгустки (psychic runes) ───────────────── */

import {
  W, type Entity, type GameState, type Msg, EntityType, AIGoal, DamageType,
  msg,
} from '../core/types';
import { World } from '../core/world';
import { isPlotNpc } from '../data/plot';
import { randSeed } from '../core/rand';
import { stampMark, MarkType } from './surface_marks';
import { WEAPON_STATS } from '../data/catalog';
import { spawnBloodHit, spawnDeathPool } from './blood_fx';
import { MONSTERS, entityDisplayName } from '../entities/monster';
import { ENTITY_MASK_ACTOR, ensureEntityIndex } from './entity_index';
import { applyMonsterIncomingDamage } from './monster_traits';
import { calculateDamage } from './combat';
import { intPsiDurationBonusSec } from './rpg';
import { registerDebugCommand } from './debug_registry';
import type { ActorDamageInput, ActorDamageResult } from './combat_stimulus';
import { killEntity } from './entity_death';

/* Дверь урона приходит ИНЪЕКЦИЕЙ, а тип — типом (при сборке стирается).
 * Прямой импорт замкнул бы цикл `psi → combat_stimulus → factions → … → damage
 * → psi`: матрица отношений тянет за собой пол-игры, а `damage.ts` спрашивает у
 * пси флаг ноуклипа. Тот же приём, которым самосбор получает генератор этажа. */
type ActorDamageSink = (world: World, state: GameState, target: Entity, input: ActorDamageInput) => ActorDamageResult;
let damageSink: ActorDamageSink | undefined;
export function setPsiDamageSink(sink: ActorDamageSink | undefined): void {
  damageSink = sink;
}

// ── Module state (player-only transient effects) ─────────────────
let phaseTimer = 0;                              // phase shift remaining seconds
let shieldTimer = 0;                             // PSI shield remaining seconds
let markPos: { x: number; y: number } | null = null;  // saved teleport mark
let debugNoClip = false;                        // debug override for phase movement
const psiTargetQuery: Entity[] = [];
let hasActiveMadness = false;
let madnessScanAccum = 0;
/* Вселения ЖИВЫХ, ключ — id вселившегося. Здесь стоял ОДИН слот на весь мир, и
 * это делало способность игроцкой по устройству: пока занят слот, никто больше
 * вселиться не мог. При этом каст уже принимал любого актора (`castInstantSpell`
 * зовут и не за игрока), то есть NPC мог занять слот и заблокировать игрока.
 *
 * Форма взята с соседней строки этого же файла — `controlTimers` ровно такая же
 * карта «id → остаток». Правда о том, кто в ком, живёт на сущностях
 * (`psiControlledBy` / `psiAway`); карта нужна лишь как список активных для
 * такта, чтобы не перебирать этаж. */
const possessions = new Map<number, { targetId: number; timer: number }>();

// ── Queries ──────────────────────────────────────────────────────
export function isPhaseActive(): boolean { return phaseTimer > 0; }
export function isNoClipActive(): boolean { return debugNoClip || phaseTimer > 0; }
export function isDebugNoClipEnabled(): boolean { return debugNoClip; }
export function getPhaseTimer(): number { return phaseTimer; }
export function isPsiShieldActive(): boolean { return shieldTimer > 0; }
export function getPsiShieldTimer(): number { return shieldTimer; }
export function getPsiMark(): { x: number; y: number } | null { return markPos; }
export function toggleDebugNoClip(): boolean {
  debugNoClip = !debugNoClip;
  return debugNoClip;
}

// ── Reset (on new game / floor switch) ───────────────────────────
export function resetPsiState(): void {
  phaseTimer = 0;
  shieldTimer = 0;
  markPos = null;
  possessions.clear();
  controlTimers.clear();
}

/**
 * Пси-удар одним ходом.
 *
 * Раньше каждый из трёх пси-путей вычитал здоровье сам и никому не сообщал: у
 * жертвы не оставалось автора, и ответить она не могла — игрок со стволом
 * получал сдачи, игрок с пси был невидимкой. Дверь урона делает всё: тип, броню,
 * толчок, память жертвы, штраф отношениям и смерть.
 *
 * Запасной путь без состояния оставлен намеренно: пси зовут и из мест, где
 * `GameState` не протянут, и молча ронять там урон нельзя.
 */
function psiHit(
  world: World,
  state: GameState | undefined,
  target: Entity,
  rawDamage: number,
  attacker: Entity | undefined,
  handleKill: (e: Entity) => void,
): number {
  const damage = Math.round(rawDamage);
  if (state && damageSink) {
    return damageSink(world, state, target, {
      damage,
      source: 'projectile',
      attacker,
      damageType: DamageType.PSI,
      knockback: false,
    }).applied;
  }
  const finalDmg = applyMonsterIncomingDamage(world, target, Math.round(calculateDamage(damage, DamageType.PSI, target)));
  target.hp = (target.hp ?? 0) - finalDmg;
  if ((target.hp ?? 0) <= 0) {
    killEntity(target);
    handleKill(target);
  }
  return finalDmg;
}

// ── Cast an instant (non-projectile) PSI spell ───────────────────
export function castInstantSpell(
  effect: string,
  player: Entity,
  entities: Entity[],
  world: World,
  msgs: Msg[],
  time: number,
  handleKill: (e: Entity) => void,
  state?: GameState,
): { beamLen?: number; player?: Entity } {
  ensureEntityIndex(entities);
  switch (effect) {
    case 'storm':    castStorm(player, entities, world, msgs, time, handleKill, state); break;
    case 'brain_burn': castBrainBurn(player, entities, world, msgs, time, handleKill); break;
    case 'madness':  castTargeted(player, entities, world, msgs, time, 'madness'); break;
    case 'control':  castTargeted(player, entities, world, msgs, time, 'control'); break;
    case 'phase':    castPhase(player, msgs, time); break;
    case 'shield':   castShield(player, msgs, time); break;
    case 'mark':     castMark(player, msgs, time); break;
    case 'recall':   castRecall(player, msgs, time); break;
    case 'possession': return { player: castPossession(player, entities, world, msgs, time) ?? undefined };
    case 'beam':     return { beamLen: castBeam(player, entities, world, msgs, time, handleKill, state) };
  }
  return {};
}

// ── Update ongoing PSI effects (call every frame) ────────────────
export function updatePsiEffects(entities: Entity[], dt: number, player: Entity, msgs?: Msg[], time = 0): { player?: Entity } {
  // Phase shift timer
  if (phaseTimer > 0) {
    phaseTimer = Math.max(0, phaseTimer - dt);
  }
  if (shieldTimer > 0) {
    shieldTimer = Math.max(0, shieldTimer - dt);
  }

  let madnessDt = dt;
  let scanMadness = hasActiveMadness;
  if (!scanMadness) {
    madnessScanAccum += dt;
    if (madnessScanAccum >= 0.5) {
      madnessDt = madnessScanAccum;
      madnessScanAccum = 0;
      scanMadness = true;
    }
  }

  if (scanMadness) {
    hasActiveMadness = false;
    const actors = ensureEntityIndex(entities).actors;
    for (const e of actors) {
      if (!e.alive) continue;
      if (e.psiMadness !== undefined && e.psiMadness > 0) {
        e.psiMadness -= madnessDt;
        if (e.psiMadness <= 0) {
          e.psiMadness = undefined;
          // Reset combat target so AI re-evaluates
          if (e.ai) e.ai.combatTargetId = undefined;
        } else {
          hasActiveMadness = true;
        }
      }
    }
  }

  // Control timers
  const byId = controlTimers.size > 0 ? ensureEntityIndex(entities).byId : null;
  for (const [eid, remaining] of controlTimers) {
    const left = remaining - dt;
    if (left <= 0) {
      controlTimers.delete(eid);
      const e = byId?.get(eid);
      if (e) {
        e.psiControlledBy = undefined;
        if (e.ai) e.ai.combatTargetId = undefined;
      }
    } else {
      controlTimers.set(eid, left);
    }
  }

  /* Такт всех вселений, а не одного. Обход идёт по карте активных — их единицы,
   * — а не по этажу: перебор сущностей ради редкого события запрещён. */
  if (possessions.size > 0) {
    const byId = ensureEntityIndex(entities).byId;
    let nextPlayer: Entity | undefined;
    for (const [hostId, live] of [...possessions]) {
      live.timer -= dt;
      const host = byId.get(hostId);
      const target = byId.get(live.targetId);
      if (host?.alive && target?.alive && live.timer > 0) continue;
      /* Возврат управления касается ТОЛЬКО игрока: у него вход привязан к телу.
       * NPC возвращается в себя тем же снятием полей, ничего сообщать некому. */
      const returned = releasePossession(entities, hostId, msgs, time, target?.alive ? 'expired' : 'broken');
      if (player && hostId === player.id) nextPlayer = returned;
      else if (player && live.targetId === player.id) nextPlayer = returned;
    }
    if (nextPlayer) return { player: nextPlayer };
  }
  return {};
}

// ── Control timer tracking ───────────────────────────────────────
const controlTimers = new Map<number, number>();  // entityId → remaining seconds

// ── Find target in player's line of sight ────────────────────────
function findLookTarget(
  player: Entity, entities: Entity[], world: World, maxRange: number,
): Entity | null {
  let best: Entity | null = null;
  let bestDist2 = maxRange * maxRange;

  ensureEntityIndex(entities).queryRadius(player.x, player.y, maxRange, psiTargetQuery, ENTITY_MASK_ACTOR);
  for (const e of psiTargetQuery) {
    if (!e.alive || e.id === player.id) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    const dx = world.delta(player.x, e.x);
    const dy = world.delta(player.y, e.y);
    const dist2 = dx * dx + dy * dy;
    if (dist2 > maxRange * maxRange || dist2 < 0.25) continue;
    // Check angle — must be within ~15 degrees of look direction
    const angToTarget = Math.atan2(dy, dx);
    let dAngle = angToTarget - player.angle;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    if (Math.abs(dAngle) > 0.26) continue; // ~15 degrees
    if (dist2 < bestDist2) {
      bestDist2 = dist2;
      best = e;
    }
  }
  return best;
}

// ── Пси буря: damage all visible entities in area ────────────────
const STORM_RANGE = 12;
const STORM_MAX_TARGETS = 8;

function castStorm(
  player: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  handleKill: (e: Entity) => void,
  state?: GameState,
): void {
  const ws = WEAPON_STATS['psi_storm'];
  const dmg = ws?.dmg ?? 10;
  let hits = 0;
  const range2 = STORM_RANGE * STORM_RANGE;

  ensureEntityIndex(entities).queryRadius(player.x, player.y, STORM_RANGE, psiTargetQuery, ENTITY_MASK_ACTOR);
  for (const e of psiTargetQuery) {
    if (!e.alive || e.id === player.id) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    const dx = world.delta(player.x, e.x);
    const dy = world.delta(player.y, e.y);
    if (dx * dx + dy * dy > range2) continue;
    // Check FOV cone (~60 degrees half-angle)
    const angToTarget = Math.atan2(dy, dx);
    let dAngle = angToTarget - player.angle;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    if (Math.abs(dAngle) > 1.05) continue; // ~60 degrees
    if (e.hp !== undefined) {
      // Same monster-trait pass as the beam and AoE paths: without it a braced
      // панельник and a wet лоточник lost their positional counterplay to storm.
      const finalDmg = psiHit(world, state, e, dmg, player, handleKill);
      spawnBloodHit(world, e.x, e.y, player.angle, finalDmg, e.type === EntityType.MONSTER);
      hits++;
      if (hits >= STORM_MAX_TARGETS) break;
    }
  }
  if (hits > 0) {
    msgs.push(msg(`Пси буря! Поражено целей: ${hits}`, time, '#c4f'));
  } else {
    msgs.push(msg('Пси буря — целей нет', time, '#a4f'));
  }
}

// ── Выжиг мозга: instant kill target at or below player level ────
function castBrainBurn(
  player: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  handleKill: (e: Entity) => void,
): void {
  const target = findLookTarget(player, entities, world, 12);
  if (!target) {
    msgs.push(msg('Выжиг мозга — цель не найдена', time, '#a4f'));
    return;
  }
  const playerLevel = player.rpg?.level ?? 1;
  const targetLevel = target.rpg?.level ?? 1;
  if (targetLevel > playerLevel) {
    msgs.push(msg(`${entityDisplayName(target)} слишком сильна для выжига!`, time, '#f84'));
    return;
  }
  // Instant kill
  if (target.hp !== undefined) {
    target.hp = 0;
    killEntity(target);
    spawnDeathPool(world, target.x, target.y, target.type === EntityType.MONSTER);
    handleKill(target);
    msgs.push(msg(`Выжиг мозга! ${entityDisplayName(target)} уничтожена`, time, '#f4f'));
  }
}

// ── Безумие / Контроль: targeted PSI effects ─────────────────────
export const PSI_EFFECT_DURATION = 15; // base seconds before INT extension
const POSSESSION_RANGE = 10;
const POSSESSION_AFTERSHOCK_SEC = 3;

function psiEffectDurationSec(actor: Entity): number {
  return PSI_EFFECT_DURATION + (actor.rpg ? intPsiDurationBonusSec(actor.rpg) : 0);
}

function castTargeted(
  player: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  mode: 'madness' | 'control',
): void {
  const target = findLookTarget(player, entities, world, 12);
  if (!target) {
    msgs.push(msg(`${mode === 'madness' ? 'Безумие' : 'Контроль'} — цель не найдена`, time, '#a4f'));
    return;
  }

  if (mode === 'madness') {
    target.psiMadness = psiEffectDurationSec(player);
    hasActiveMadness = true;
    if (target.ai) target.ai.combatTargetId = undefined;
    msgs.push(msg(`Безумие! ${entityDisplayName(target)} сходит с ума`, time, '#f4f'));
  } else {
    target.psiControlledBy = player.id;
    controlTimers.set(target.id, psiEffectDurationSec(player));
    if (target.ai) target.ai.combatTargetId = undefined;
    msgs.push(msg(`Контроль! ${entityDisplayName(target)} подчинена`, time, '#4ff'));
  }
}

// ── Фазовый сдвиг: walk through walls ───────────────────────────
function castPhase(player: Entity, msgs: Msg[], time: number): void {
  phaseTimer = psiEffectDurationSec(player);
  msgs.push(msg('Фазовый сдвиг! Вы проходите сквозь материю', time, '#4af'));
}

// ── ПСИ-щит: HP loss is paid from PSI until the timer or PSI ends ─
function castShield(player: Entity, msgs: Msg[], time: number): void {
  shieldTimer = psiEffectDurationSec(player);
  msgs.push(msg('ПСИ-щит поднят: боль уходит в запас ПСИ', time, '#8cf'));
}

export function absorbPsiShieldDamage(player: Entity, hpBefore: number, msgs: Msg[], time: number): number {
  if (shieldTimer <= 0 || !player.rpg || player.hp === undefined) return 0;
  const hpAfter = player.hp;
  const lost = Math.max(0, hpBefore - hpAfter);
  if (lost <= 0) return 0;
  if (player.rpg.psi <= 0) {
    shieldTimer = 0;
    msgs.push(msg('ПСИ-щит погас: запас ПСИ пуст', time, '#f84'));
    return 0;
  }

  const psiLoss = Math.round(lost * 0.1 * 10) / 10;
  player.rpg.psi = Math.max(0, player.rpg.psi - psiLoss);
  player.hp = Math.min(player.maxHp ?? hpBefore, hpBefore);
  player.alive = true;
  const costLabel = Number.isInteger(psiLoss) ? String(psiLoss) : psiLoss.toFixed(1);
  msgs.push(msg(`ПСИ-щит держит удар: ПСИ -${costLabel}`, time, '#8cf'));
  if (player.rpg.psi <= 0) {
    shieldTimer = 0;
    msgs.push(msg('ПСИ-щит рассыпался: запас ПСИ исчерпан', time, '#f84'));
  }
  return lost;
}

function actorIntelligence(e: Entity): number {
  const direct = e.rpg?.int;
  if (Number.isFinite(direct)) return Math.max(0, Math.floor(direct ?? 0));
  if (e.type === EntityType.MONSTER) {
    const hp = Math.max(1, e.maxHp ?? e.hp ?? 1);
    const bossBias = e.monsterKind !== undefined && MONSTERS[e.monsterKind]?.boss ? 8 : 0;
    return Math.max(0, Math.floor(Math.sqrt(hp) / 5) + bossBias);
  }
  return 0;
}

function canPossessTarget(target: Entity): boolean {
  if (!target.alive) return false;
  if (target.type !== EntityType.NPC && target.type !== EntityType.MONSTER) return false;
  if (isPlotNpc(target)) return false;
  if (target.monsterKind !== undefined && MONSTERS[target.monsterKind]?.boss) return false;
  return true;
}

/* Вселяться может ЛЮБОЙ актор, не только игрок. Имя параметра `caster` вместо
 * прежнего `player` — не косметика: раньше отказ стоял на глобальном слоте, и
 * первый вселившийся запирал способность всему миру. */
function castPossession(caster: Entity, entities: Entity[], world: World, msgs: Msg[], time: number): Entity | null {
  if (possessions.has(caster.id)) {
    msgs.push(msg('Вселение уже держит чужое тело', time, '#f84'));
    return null;
  }
  const target = findLookTarget(caster, entities, world, POSSESSION_RANGE);
  if (!target) {
    msgs.push(msg('Вселение — цель не найдена', time, '#a4f'));
    return null;
  }
  if (target.psiControlledBy !== undefined || target.psiAway !== undefined) {
    msgs.push(msg(`${entityDisplayName(target)} уже занят чужой волей`, time, '#f84'));
    return null;
  }
  if (!canPossessTarget(target)) {
    msgs.push(msg(`${entityDisplayName(target)} не принимает вселение`, time, '#f84'));
    return null;
  }
  const casterInt = actorIntelligence(caster);
  const targetInt = actorIntelligence(target);
  if (casterInt <= targetInt) {
    msgs.push(msg(`Вселение сорвалось: интеллект цели ${targetInt}, ваш ${casterInt}`, time, '#f84'));
    return null;
  }

  target.psiControlledBy = caster.id;
  /* Собственное тело остаётся в мире БЕЗВОЛЬНЫМ и уязвимым: цикл AI за него не
   * думает (см. `psiAway` в `ai/index.ts`), защищаться оно не будет, и убить
   * его могут, пока хозяин в чужом. Это делает вселение риском, а не бесплатным
   * улучшением, и работает одинаково для игрока и для NPC. */
  caster.psiAway = target.id;
  if (target.ai) {
    target.ai.combatTargetId = undefined;
    target.ai.goal = AIGoal.IDLE;
    target.ai.path = [];
    target.ai.timer = 0;
  }
  const duration = psiEffectDurationSec(caster);
  possessions.set(caster.id, { targetId: target.id, timer: duration });
  msgs.push(msg(`Вселение: вы внутри ${entityDisplayName(target)} на ${Math.round(duration)}с`, time, '#4ff'));
  return target;
}

/** Кого сейчас ведёт этот актор, если он вселился. Раньше функция отвечала за
 *  единственное вселение в мире и никого не спрашивала. */
export function getPsiPossessionTarget(entities: readonly Entity[], host: Entity | undefined): Entity | null {
  if (!host) return null;
  const live = possessions.get(host.id);
  if (!live) return null;
  const byId = ensureEntityIndex(entities).byId;
  const target = byId.get(live.targetId);
  if (!target?.alive || !host.alive) return null;
  return target;
}

/** Сколько секунд этому актору осталось в чужом теле. */
export function getPsiPossessionTimer(host: Entity | undefined): number {
  return host ? (possessions.get(host.id)?.timer ?? 0) : 0;
}

/**
 * Снять вселение и вернуть тело, которым отныне управляет хозяин.
 *
 * Общая для всех дверь: игрок и NPC выходят из чужого тела одним путём, разница
 * лишь в том, что игроку возвращённое тело подставляют под ввод
 * (`makeCurrentPlayer` в точке сборки), а NPC просто снова думает за себя.
 */
function releasePossession(
  entities: readonly Entity[],
  hostId: number,
  msgs: Msg[] | undefined,
  time: number,
  reason: 'expired' | 'broken' | 'cancelled' | 'reset',
): Entity | undefined {
  const live = possessions.get(hostId);
  if (!live) return undefined;
  possessions.delete(hostId);
  const byId = ensureEntityIndex(entities).byId;
  const host = byId.get(hostId);
  const target = byId.get(live.targetId);
  if (host) host.psiAway = undefined;
  if (target) {
    target.psiControlledBy = undefined;
    if (target.ai) target.ai.combatTargetId = undefined;
    if (target.alive && reason !== 'reset') {
      target.psiMadness = Math.max(target.psiMadness ?? 0, POSSESSION_AFTERSHOCK_SEC);
      hasActiveMadness = true;
    }
  }
  if (msgs && reason !== 'reset') {
    msgs.push(msg(reason === 'broken' ? 'Вселение оборвалось' : 'Вселение отпустило чужое тело', time, '#8cf'));
  }
  return host?.alive ? host : undefined;
}

/**
 * Точка сборки зовёт это за ИГРОКА: вернуть его в своё тело. Хозяином считается
 * тот, кто вселился, — им может быть и текущее управляемое тело (игрок внутри
 * чужого), и оно само (игрок уже дома).
 */
export function endPsiPossession(
  entities: readonly Entity[],
  currentPlayer?: Entity,
  msgs?: Msg[],
  time = 0,
  reason: 'expired' | 'broken' | 'cancelled' | 'reset' = 'cancelled',
): Entity | undefined {
  if (!currentPlayer) return currentPlayer;
  /* Игрок может быть либо хозяином (ещё не вселился или уже дома), либо телом,
   * в которое вселились. Во втором случае снимать надо вселение ХОЗЯИНА. */
  const hostId = currentPlayer.psiControlledBy ?? currentPlayer.id;
  const returned = releasePossession(entities, hostId, msgs, time, reason);
  return returned ?? (currentPlayer.alive ? currentPlayer : undefined);
}

// ── Метка: save current position ─────────────────────────────────
function castMark(player: Entity, msgs: Msg[], time: number): void {
  markPos = { x: player.x, y: player.y };
  msgs.push(msg('Метка установлена', time, '#4af'));
}

// ── Возврат: teleport to saved mark ──────────────────────────────
function castRecall(player: Entity, msgs: Msg[], time: number): void {
  if (!markPos) {
    msgs.push(msg('Метка не установлена!', time, '#f84'));
    return;
  }
  player.x = markPos.x;
  player.y = markPos.y;
  msgs.push(msg('Телепорт к метке!', time, '#4af'));
}

// ── Пси Хамехамеха: wide beam that burns everything on path ─────
const BEAM_RANGE = 20;
const BEAM_WIDTH = 1.2; // half-width of the beam corridor
const BEAM_MAX_TARGETS = 10;

function castBeam(
  player: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  handleKill: (e: Entity) => void,
  state?: GameState,
): number {
  const ws = WEAPON_STATS['psi_beam'];
  const dmg = ws?.dmg ?? 15;
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);

  // DDA ray to find beam end (wall hit or max range)
  let beamEnd = BEAM_RANGE;
  {
    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);
    const ddx = Math.abs(1 / dirX);
    const ddy = Math.abs(1 / dirY);
    const stepX = dirX < 0 ? -1 : 1;
    const stepY = dirY < 0 ? -1 : 1;
    let sdx = dirX < 0 ? (player.x - mapX) * ddx : (mapX + 1 - player.x) * ddx;
    let sdy = dirY < 0 ? (player.y - mapY) * ddy : (mapY + 1 - player.y) * ddy;

    for (let step = 0; step < BEAM_RANGE * 2; step++) {
      const dist = Math.min(sdx, sdy);
      if (dist >= BEAM_RANGE) break;
      if (sdx < sdy) { sdx += ddx; mapX += stepX; } else { sdy += ddy; mapY += stepY; }
      const wx = ((mapX % W) + W) % W;
      const wy = ((mapY % W) + W) % W;
      if (world.solid(wx, wy)) {
        beamEnd = dist;
        break;
      }
    }
  }

  // Paint scorch along beam path on floor
  const scorchStep = 0.35;
  for (let d = 0.5; d < beamEnd; d += scorchStep) {
    const sx = player.x + dirX * d;
    const sy = player.y + dirY * d;
    const fx = ((Math.floor(sx) % W) + W) % W;
    const fy = ((Math.floor(sy) % W) + W) % W;
    if (!world.solid(fx, fy)) {
      stampMark(world, fx, fy, sx - Math.floor(sx), sy - Math.floor(sy),
        0.45, MarkType.PSI, randSeed(), 80, 20, 120, 200); // bright purple scorch
    }
  }

  // Damage all entities within the beam corridor
  let hits = 0;
  ensureEntityIndex(entities).queryRadius(player.x, player.y, beamEnd + BEAM_WIDTH, psiTargetQuery, ENTITY_MASK_ACTOR);
  for (const e of psiTargetQuery) {
    if (!e.alive || e.id === player.id) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    // Project entity position onto beam line
    const dx = world.delta(player.x, e.x);
    const dy = world.delta(player.y, e.y);
    const along = dx * dirX + dy * dirY; // projection along beam
    if (along < 0.5 || along > beamEnd) continue;
    const perp = Math.abs(dx * (-dirY) + dy * dirX); // perpendicular distance
    if (perp > BEAM_WIDTH) continue;
    if (e.hp !== undefined) {
      const falloff = 1 - (along / beamEnd) * 0.3;
      const finalDmg = psiHit(world, state, e, dmg * falloff, player, handleKill);
      spawnBloodHit(world, e.x, e.y, player.angle, finalDmg, e.type === EntityType.MONSTER);
      hits++;
      if (hits >= BEAM_MAX_TARGETS) break;
    }
  }
  if (hits > 0) {
    msgs.push(msg(`ПСИ ХАМЕХАМЕХА! Поражено: ${hits}`, time, '#f0f'));
  } else {
    msgs.push(msg('ПСИ ХАМЕХАМЕХА!', time, '#c0f'));
  }
  return beamEnd;
}

// ── AoE explosion (called from updateProjectiles on impact) ──────
export function psiAoeExplosion(
  proj: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  handleKill: (e: Entity) => void,
  state?: GameState,
  owner?: Entity,
): void {
  const radius = proj.aoeRadius ?? 0;
  const dmg = proj.aoeDmg ?? proj.projDmg ?? 10;
  if (radius <= 0) return;

  let hits = 0;
  const radius2 = radius * radius;
  const maxHits = 10;
  ensureEntityIndex(entities).queryRadius(proj.x, proj.y, radius, psiTargetQuery, ENTITY_MASK_ACTOR);
  for (const e of psiTargetQuery) {
    if (!e.alive) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;

    const dx = world.delta(proj.x, e.x);
    const dy = world.delta(proj.y, e.y);
    const dist2 = dx * dx + dy * dy;
    if (dist2 > radius2) continue;
    if (e.hp !== undefined) {
      // Damage falls off with distance
      const dist = Math.sqrt(dist2);
      const falloff = 1 - (dist / radius) * 0.5;
      const finalDmg = psiHit(world, state, e, dmg * falloff, owner, handleKill);
      spawnBloodHit(world, e.x, e.y, Math.atan2(dy, dx), finalDmg, e.type === EntityType.MONSTER);
      hits++;
      if (hits >= maxHits) break;
    }
  }
  if (hits > 0) {
    msgs.push(msg(`Разрыв связности! Поражено: ${hits}`, time, '#c4f'));
  }
}

/* Предикаты пси-состояния уехали в лист `psi_state.ts`: их спрашивает матрица
 * враждебности из горячего скана, и тянуть ради двух полей весь модуль заклятий
 * незачем — этим импортом и замыкался цикл, стоило пси пойти через дверь урона.
 * Реэкспорт сохранён: звать их отсюда по-прежнему законно. */
export { isPsiAlly, isPsiMad } from './psi_state';

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* Toggle noclip */
  id: 'toggle_noclip',
  group: 'cheat',
  label: 'Noclip',
  run: ({ state }) => {
    const enabled = toggleDebugNoClip();
    state.msgs.push(msg(
      `[DEBUG] Noclip ${enabled ? 'включён' : 'выключен'}`,
      state.time,
      '#ff0',
    ));
  },
});

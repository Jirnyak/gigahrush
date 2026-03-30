/* ── PSI spell system: сгустки (psychic runes) ───────────────── */

import {
  W, type Entity, type Msg, EntityType,
} from '../core/types';
import { World } from '../core/world';
import { WEAPON_STATS } from '../data/catalog';
import { spawnBloodHit, spawnDeathPool } from '../render/blood';

// ── Module state (player-only transient effects) ─────────────────
let phaseTimer = 0;                              // phase shift remaining seconds
let markPos: { x: number; y: number } | null = null;  // saved teleport mark
let debugNoClip = false;                        // debug override for phase movement

// ── Queries ──────────────────────────────────────────────────────
export function isPhaseActive(): boolean { return phaseTimer > 0; }
export function isNoClipActive(): boolean { return debugNoClip || phaseTimer > 0; }
export function isDebugNoClipEnabled(): boolean { return debugNoClip; }
export function getPhaseTimer(): number { return phaseTimer; }
export function getPsiMark(): { x: number; y: number } | null { return markPos; }
export function toggleDebugNoClip(): boolean {
  debugNoClip = !debugNoClip;
  return debugNoClip;
}

// ── Reset (on new game / floor switch) ───────────────────────────
export function resetPsiState(): void {
  phaseTimer = 0;
  markPos = null;
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
): void {
  switch (effect) {
    case 'storm':    castStorm(player, entities, world, msgs, time, handleKill); break;
    case 'brain_burn': castBrainBurn(player, entities, world, msgs, time, handleKill); break;
    case 'madness':  castTargeted(player, entities, world, msgs, time, 'madness'); break;
    case 'control':  castTargeted(player, entities, world, msgs, time, 'control'); break;
    case 'phase':    castPhase(player, msgs, time); break;
    case 'mark':     castMark(player, msgs, time); break;
    case 'recall':   castRecall(player, msgs, time); break;
  }
}

// ── Update ongoing PSI effects (call every frame) ────────────────
export function updatePsiEffects(entities: Entity[], dt: number): void {
  // Phase shift timer
  if (phaseTimer > 0) {
    phaseTimer = Math.max(0, phaseTimer - dt);
  }

  // Decay madness / control on all entities
  for (const e of entities) {
    if (!e.alive) continue;
    if (e.psiMadness !== undefined && e.psiMadness > 0) {
      e.psiMadness -= dt;
      if (e.psiMadness <= 0) {
        e.psiMadness = undefined;
        // Reset combat target so AI re-evaluates
        if (e.ai) e.ai.combatTargetId = undefined;
      }
    }
    if (e.psiControlledBy !== undefined) {
      // Control uses a hidden timer stored as negative psiMadness (hack) —
      // instead, we store it directly. Use a parallel field:
      // Actually, let's track control duration via a module-level map.
    }
  }

  // Control timers
  for (const [eid, remaining] of controlTimers) {
    const left = remaining - dt;
    if (left <= 0) {
      controlTimers.delete(eid);
      const e = entities.find(en => en.id === eid);
      if (e) {
        e.psiControlledBy = undefined;
        if (e.ai) e.ai.combatTargetId = undefined;
      }
    } else {
      controlTimers.set(eid, left);
    }
  }
}

// ── Control timer tracking ───────────────────────────────────────
const controlTimers = new Map<number, number>();  // entityId → remaining seconds

// ── Find target in player's line of sight ────────────────────────
function findLookTarget(
  player: Entity, entities: Entity[], _world: World, maxRange: number,
): Entity | null {
  let best: Entity | null = null;
  let bestDist = maxRange;

  for (const e of entities) {
    if (!e.alive || e.id === player.id) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    const dx = ((e.x - player.x + W / 2) % W + W) % W - W / 2;
    const dy = ((e.y - player.y + W / 2) % W + W) % W - W / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRange || dist < 0.5) continue;
    // Check angle — must be within ~15 degrees of look direction
    const angToTarget = Math.atan2(dy, dx);
    let dAngle = angToTarget - player.angle;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    if (Math.abs(dAngle) > 0.26) continue; // ~15 degrees
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

// ── Пси буря: damage all visible entities in area ────────────────
const STORM_RANGE = 12;

function castStorm(
  player: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  handleKill: (e: Entity) => void,
): void {
  const ws = WEAPON_STATS['psi_storm'];
  const dmg = ws?.dmg ?? 10;
  let hits = 0;

  for (const e of entities) {
    if (!e.alive || e.id === player.id) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;
    const dx = ((e.x - player.x + W / 2) % W + W) % W - W / 2;
    const dy = ((e.y - player.y + W / 2) % W + W) % W - W / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > STORM_RANGE) continue;
    // Check FOV cone (~60 degrees half-angle)
    const angToTarget = Math.atan2(dy, dx);
    let dAngle = angToTarget - player.angle;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    if (Math.abs(dAngle) > 1.05) continue; // ~60 degrees
    if (e.hp !== undefined) {
      e.hp -= dmg;
      spawnBloodHit(world, e.x, e.y, player.angle, dmg, e.type === EntityType.MONSTER);
      if (e.hp <= 0) {
        e.alive = false;
        handleKill(e);
      }
      hits++;
    }
  }
  if (hits > 0) {
    msgs.push({ text: `Пси буря! Поражено целей: ${hits}`, time, color: '#c4f' });
  } else {
    msgs.push({ text: 'Пси буря — целей нет', time, color: '#a4f' });
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
    msgs.push({ text: 'Выжиг мозга — цель не найдена', time, color: '#a4f' });
    return;
  }
  const playerLevel = player.rpg?.level ?? 1;
  const targetLevel = target.rpg?.level ?? 1;
  if (targetLevel > playerLevel) {
    msgs.push({ text: `${target.name ?? 'Цель'} слишком сильна для выжига!`, time, color: '#f84' });
    return;
  }
  // Instant kill
  if (target.hp !== undefined) {
    target.hp = 0;
    target.alive = false;
    spawnDeathPool(world, target.x, target.y, target.type === EntityType.MONSTER);
    handleKill(target);
    msgs.push({ text: `Выжиг мозга! ${target.name ?? 'Цель'} уничтожена`, time, color: '#f4f' });
  }
}

// ── Безумие / Контроль: targeted PSI effects ─────────────────────
const PSI_EFFECT_DURATION = 15; // 15 seconds = 15 game minutes

function castTargeted(
  player: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  mode: 'madness' | 'control',
): void {
  const target = findLookTarget(player, entities, world, 12);
  if (!target) {
    msgs.push({ text: `${mode === 'madness' ? 'Безумие' : 'Контроль'} — цель не найдена`, time, color: '#a4f' });
    return;
  }

  if (mode === 'madness') {
    target.psiMadness = PSI_EFFECT_DURATION;
    if (target.ai) target.ai.combatTargetId = undefined;
    msgs.push({ text: `Безумие! ${target.name ?? 'Цель'} сходит с ума`, time, color: '#f4f' });
  } else {
    target.psiControlledBy = player.id;
    controlTimers.set(target.id, PSI_EFFECT_DURATION);
    if (target.ai) target.ai.combatTargetId = undefined;
    msgs.push({ text: `Контроль! ${target.name ?? 'Цель'} подчинена`, time, color: '#4ff' });
  }
}

// ── Фазовый сдвиг: walk through walls ───────────────────────────
function castPhase(_player: Entity, msgs: Msg[], time: number): void {
  phaseTimer = PSI_EFFECT_DURATION;
  msgs.push({ text: 'Фазовый сдвиг! Вы проходите сквозь материю', time, color: '#4af' });
}

// ── Метка: save current position ─────────────────────────────────
function castMark(player: Entity, msgs: Msg[], time: number): void {
  markPos = { x: player.x, y: player.y };
  msgs.push({ text: 'Метка установлена', time, color: '#4af' });
}

// ── Возврат: teleport to saved mark ──────────────────────────────
function castRecall(player: Entity, msgs: Msg[], time: number): void {
  if (!markPos) {
    msgs.push({ text: 'Метка не установлена!', time, color: '#f84' });
    return;
  }
  player.x = markPos.x;
  player.y = markPos.y;
  msgs.push({ text: 'Телепорт к метке!', time, color: '#4af' });
}

// ── AoE explosion (called from updateProjectiles on impact) ──────
export function psiAoeExplosion(
  proj: Entity, entities: Entity[], world: World,
  msgs: Msg[], time: number,
  handleKill: (e: Entity) => void,
): void {
  const radius = proj.aoeRadius ?? 0;
  const dmg = proj.aoeDmg ?? proj.projDmg ?? 10;
  if (radius <= 0) return;

  let hits = 0;
  for (const e of entities) {
    if (!e.alive || e.id === proj.ownerId) continue;
    if (e.type !== EntityType.NPC && e.type !== EntityType.MONSTER) continue;

    const dx = ((e.x - proj.x + W / 2) % W + W) % W - W / 2;
    const dy = ((e.y - proj.y + W / 2) % W + W) % W - W / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) continue;
    if (e.hp !== undefined) {
      // Damage falls off with distance
      const falloff = 1 - (dist / radius) * 0.5;
      const finalDmg = Math.round(dmg * falloff);
      e.hp -= finalDmg;
      spawnBloodHit(world, e.x, e.y, Math.atan2(dy, dx), finalDmg, e.type === EntityType.MONSTER);
      if (e.hp <= 0) {
        e.alive = false;
        handleKill(e);
      }
      hits++;
    }
  }
  if (hits > 0) {
    msgs.push({ text: `Разрыв связности! Поражено: ${hits}`, time, color: '#c4f' });
  }
}

// ── Check if entity is PSI-controlled ally of another ────────────
export function isPsiAlly(a: Entity, b: Entity): boolean {
  // b is controlled by a's controller or by a itself
  if (b.psiControlledBy !== undefined && b.psiControlledBy === a.id) return true;
  if (a.psiControlledBy !== undefined && a.psiControlledBy === b.id) return true;
  // Both controlled by same entity
  if (a.psiControlledBy !== undefined && b.psiControlledBy !== undefined &&
      a.psiControlledBy === b.psiControlledBy) return true;
  return false;
}

// ── Check if entity is mad (attacks everyone) ────────────────────
export function isPsiMad(e: Entity): boolean {
  return (e.psiMadness ?? 0) > 0;
}

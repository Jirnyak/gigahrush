/* ── Monster behavior: hunt player + hostile NPCs ─────────────── */

import {
  W,
  type Entity, type Msg,
  EntityType, AIGoal, MonsterKind,
  msg,
} from '../../core/types';
import { World } from '../../core/world';
import { MONSTERS, entityDisplayName } from '../../entities/monster';
import { playGrowl, playSoundAt } from '../audio';
import { isHostile } from '../factions';
import { scaleMonsterDmg, strMeleeDmgMult, scaleMonsterHp, scaleMonsterSpeed, randomRPG } from '../rpg';
import { spawnBloodHit, spawnDeathPool } from '../../render/blood';
import { bfsPath, followPath, wanderNearby } from './pathfinding';
import { Spr } from '../../render/sprite_index';

/* ── Shared combat target finder ──────────────────────────────── */
const MONSTER_DETECT = 20;
const MONSTER_DETECT_SQ = MONSTER_DETECT * MONSTER_DETECT;
const PREFER_PLAYER = 15;
const PREFER_SQ = PREFER_PLAYER * PREFER_PLAYER;
const MATKA_MAX_CHILDREN = 100;

/** Entity lookup map — set by updateAI each frame */
let _entityById = new Map<number, Entity>();
export function setEntityMap(m: Map<number, Entity>): void { _entityById = m; }

export function findCombatTarget(
  world: World, entities: Entity[], e: Entity, dt: number,
  rangeSq: number, scanCd: number,
  typeFilter: (other: Entity) => boolean,
): Entity | null {
  const ai = e.ai!;
  let target: Entity | null = null;

  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatTargetId !== undefined) {
    const cached = _entityById.get(ai.combatTargetId);
    if (cached && cached.alive) {
      const d2 = world.dist2(e.x, e.y, cached.x, cached.y);
      if (d2 < rangeSq) { target = cached; }
    }
    if (!target) ai.combatTargetId = undefined;
  }

  // Always rescan periodically to switch to closer targets
  if (ai.combatScanCd! <= 0) {
    ai.combatScanCd = scanCd;
    let newTarget: Entity | null = null;
    let newBest = rangeSq;
    for (const other of entities) {
      if (!other.alive || other.id === e.id) continue;
      if (!typeFilter(other)) continue;
      const d2 = world.dist2(e.x, e.y, other.x, other.y);
      if (d2 >= newBest) continue;
      if (!isHostile(e, other)) continue;
      newBest = d2;
      newTarget = other;
    }
    if (newTarget) { target = newTarget; ai.combatTargetId = newTarget.id; }
  }

  return target;
}

/* ── Drop NPC inventory as ITEM_DROP entities ─────────────────── */
export function dropNpcInventory(e: Entity, entities: Entity[], nextId: { v: number }): void {
  if (!e.inventory || e.inventory.length === 0) return;
  for (const item of e.inventory) {
    if (!item || item.count <= 0) continue;
    entities.push({
      id: nextId.v++, type: EntityType.ITEM_DROP,
      x: e.x + (Math.random() - 0.5) * 0.5,
      y: e.y + (Math.random() - 0.5) * 0.5,
      angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
      inventory: [{ defId: item.defId, count: item.count, data: item.data }],
    });
  }
  e.inventory = [];
}

/* ── Monster AI update ────────────────────────────────────────── */
export function updateMonster(world: World, entities: Entity[], e: Entity, dt: number, time: number, msgs: Msg[], playerId: number, nextId: { v: number }): void {
  const ai = e.ai!;

  // Матка: spawn a random monster every 60 real seconds (1 game hour)
  if (e.monsterKind === MonsterKind.MATKA) {
    e.matkaTimer = (e.matkaTimer ?? 60) - dt;
    if (e.matkaTimer <= 0) {
      e.matkaTimer = 60;
      let nearby = 0;
      for (const o of entities) {
        if (o.type === EntityType.MONSTER && o.alive && o.id !== e.id && world.dist2(e.x, e.y, o.x, o.y) < 400) nearby++;
      }
      if (nearby < MATKA_MAX_CHILDREN) {
        const spawnKinds = [MonsterKind.SBORKA, MonsterKind.TVAR, MonsterKind.ZOMBIE, MonsterKind.SHADOW, MonsterKind.POLZUN];
        const kind = spawnKinds[Math.floor(Math.random() * spawnKinds.length)];
        const def = MONSTERS[kind];
        const zid = world.zoneMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
        const zoneLevel = (zid >= 0 && world.zones[zid]) ? (world.zones[zid].level ?? 1) : 1;
        const rpg = randomRPG(zoneLevel);
        const hpBase = scaleMonsterHp(def.hp, zoneLevel);
        const hpFinal = Math.round(hpBase * (1 + 0.1 * rpg.str));
        const ox = (Math.random() - 0.5) * 2;
        const oy = (Math.random() - 0.5) * 2;
        const sx = ((e.x + ox) % W + W) % W;
        const sy = ((e.y + oy) % W + W) % W;
        if (!world.solid(Math.floor(sx), Math.floor(sy))) {
          entities.push({
            id: nextId.v++,
            type: EntityType.MONSTER,
            x: sx, y: sy,
            angle: Math.random() * Math.PI * 2,
            pitch: 0,
            alive: true,
            speed: scaleMonsterSpeed(def.speed, zoneLevel),
            sprite: def.sprite,

            hp: hpFinal, maxHp: hpFinal,
            monsterKind: kind,
            attackCd: def.attackRate,
            ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
            rpg,
          });
          msgs.push(msg(`Матка родила ${def.name}!`, time, '#f4a'));
        }
      }
    }
  }

  let target = findCombatTarget(
    world, entities, e, dt,
    MONSTER_DETECT_SQ, 1.0 + Math.random() * 0.5,
    o => o.type !== EntityType.MONSTER && o.type !== EntityType.PROJECTILE && o.type !== EntityType.ITEM_DROP,
  );

  // Prefer player only if player is closer than current target
  const player = _entityById.get(playerId);
  if (player?.alive && target && target.id !== playerId) {
    const pd2 = world.dist2(e.x, e.y, player.x, player.y);
    const td2 = world.dist2(e.x, e.y, target.x, target.y);
    if (pd2 < td2 && pd2 < PREFER_SQ) { target = player; ai.combatTargetId = player.id; }
  } else if (player?.alive && !target) {
    const pd2 = world.dist2(e.x, e.y, player.x, player.y);
    if (pd2 < MONSTER_DETECT_SQ) { target = player; ai.combatTargetId = player.id; }
  }

  const def = e.monsterKind !== undefined ? MONSTERS[e.monsterKind] : null;

  if (!target) {
    // Immobile monsters (Idol) just idle — no wandering
    if (def?.speed === 0) return;
    ai.goal = AIGoal.WANDER;
    ai.combatTargetId = undefined;
    ai.timer -= dt;
    if (ai.path.length === 0 || ai.pi >= ai.path.length || ai.timer <= 0) {
      // Phasing monsters: random direction wander
      if (e.phasing) {
        ai.timer = 2 + Math.random() * 3;
        (e as any)._wanderAngle = Math.random() * Math.PI * 2;
      } else {
        wanderNearby(world, e);
      }
      ai.timer = 1.5 + Math.random() * 2.5;
    }
    if (e.phasing) {
      const a = (e as any)._wanderAngle ?? 0;
      const spd = e.speed * 0.4 * dt;
      e.x = ((e.x + Math.cos(a) * spd) % W + W) % W;
      e.y = ((e.y + Math.sin(a) * spd) % W + W) % W;
    } else {
      followPath(world, e, dt);
    }
    return;
  }
  ai.combatTargetId = target.id;

  const bestDist = Math.sqrt(world.dist2(e.x, e.y, target.x, target.y));

  // Ranged attack: shoot projectile if in range but not too close
  // Immobile ranged monsters (Idol) fire at any distance within detection range
  const minRange = def?.speed === 0 ? 0 : 1.5;
  if (def?.isRanged && bestDist < 15 && bestDist > minRange) {
    e.attackCd = (e.attackCd ?? 0) - dt;
    if (e.attackCd! <= 0) {
      const baseDmg = def.dmg ?? 10;
      const level = e.rpg?.level ?? 1;
      const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
      const dmg = Math.round(scaleMonsterDmg(baseDmg, level) * strMult);
      const ang = Math.atan2(target.y - e.y, target.x - e.x);
      const spd = def.projSpeed ?? 8;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      entities.push({
        id: nextId.v++,
        type: EntityType.PROJECTILE,
        x: e.x + cos * 0.5,
        y: e.y + sin * 0.5,
        angle: ang,
        pitch: 0,
        alive: true,
        speed: 0,
        sprite: def.projSprite ?? Spr.EYE_BOLT,
        vx: cos * spd,
        vy: sin * spd,
        projDmg: dmg,
        projLife: 3.0,
        ownerId: e.id,
        spriteScale: 0.3,
        spriteZ: 0.5,
      });
      playSoundAt(playGrowl, e.x, e.y);
      e.attackCd = def.attackRate ?? 2;
    }
    return;
  }

  // Melee attack if close enough
  if (bestDist < 1.2) {
    e.attackCd = (e.attackCd ?? 0) - dt;
    if (e.attackCd! <= 0) {
      const baseDmg = def?.dmg ?? 10;
      const level = e.rpg?.level ?? 1;
      const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
      const dmg = Math.round(scaleMonsterDmg(baseDmg, level) * strMult);
      if (target.hp !== undefined) {
        target.hp -= dmg;
        if (target.hp <= 0) { target.alive = false; target.hp = 0; }
        const hitAng = Math.atan2(target.y - e.y, target.x - e.x);
        spawnBloodHit(world, target.x, target.y, hitAng, dmg, target.type === EntityType.MONSTER);
        if (target.hp <= 0) {
          spawnDeathPool(world, target.x, target.y, target.type === EntityType.MONSTER);
          if (target.type === EntityType.NPC) dropNpcInventory(target, entities, nextId);
          msgs.push(msg(`${entityDisplayName(e)} убил ${entityDisplayName(target)}`, time, '#f44'));
        }
      }
      playSoundAt(playGrowl, e.x, e.y);
      e.attackCd = def?.attackRate ?? 1;
    }
    return;
  }

  // Immobile monsters don't pathfind or melee — only ranged
  if (def?.speed === 0) return;

  // Hunt: pathfind to target
  ai.timer -= dt;
  if (ai.path.length === 0 || ai.timer <= 0) {
    ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), Math.floor(target.x), Math.floor(target.y));
    ai.pi = 0;
    ai.timer = 2;
  }

  // Phasing monsters (Spirit) move directly through walls
  if (e.phasing) {
    const ddx = world.delta(e.x, target.x);
    const ddy = world.delta(e.y, target.y);
    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dd > 0.1) {
      const spd = e.speed * dt;
      e.x = ((e.x + (ddx / dd) * spd) % W + W) % W;
      e.y = ((e.y + (ddy / dd) * spd) % W + W) % W;
    }
    return;
  }

  followPath(world, e, dt);
}

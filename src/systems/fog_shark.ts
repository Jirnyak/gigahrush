/* ── Fog Shark: fire ignition and bounded gas-belly burst ─────── */

import {
  EntityType,
  MonsterKind,
  msg,
  type Entity,
  type GameState,
} from '../core/types';
import { World } from '../core/world';
import { entityDisplayName } from '../entities/monster';
import { MarkType, stampMark } from './surface_marks';
import { playExplosion, playSoundAt } from './audio';
import { getEntityIndex, ENTITY_MASK_ACTOR } from './entity_index';
import { publishEvent } from './events';
import { publishExplosionNoise } from './noise';
import { recordPlayerDamage } from './damage';
import { isPlayerEntity } from './player_actor';
import { damageActor } from './combat_stimulus';
import { killEntity } from './entity_death';

export const FOG_SHARK_IGNITION_RADIUS = 2.65;
export const FOG_SHARK_IGNITION_DAMAGE = 16;
export const FOG_SHARK_IGNITION_TARGET_CAP = 8;

const FOG_SHARK_IGNITION_QUERY_CAP = FOG_SHARK_IGNITION_TARGET_CAP * 4 + 1;
const FOG_SHARK_RUMOR_IDS = ['monster_fog_shark_fog', 'ecology_fog_shark_fire'] as const;
const fogSharkIgnitionQuery: Entity[] = [];

export type FogSharkCollateralKillHandler = (target: Entity, pvx: number, pvy: number, goreLevel: number) => void;

function cellZoneId(world: World, e: Entity): number | undefined {
  const zid = world.zoneMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
  return zid >= 0 ? zid : undefined;
}

function cellRoomId(world: World, e: Entity): number | undefined {
  const rid = world.roomMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
  return rid >= 0 ? rid : undefined;
}

function actorName(e: Entity | undefined): string | undefined {
  if (!e) return undefined;
  if (isPlayerEntity(e)) return 'Вы';
  return entityDisplayName(e);
}

/* Газовое брюхо поджигает ОГОНЬ — тип урона, а не список стволов и спрайт
 * болта. Списка `fire_hook` здесь больше нет: багор — стальной крюк ролевого
 * тира `melee_reach`, он бьёт кинетикой, и «поджечь» им акулу было третьим
 * ключом к тому же факту. Зато огнём теперь считается ЛЮБОЙ огонь: чужой
 * огнемёт поджигает акулу так же, как свой. Смертельность объявлена в
 * `DEF.damageFloor` и считается за общей дверью урона. */

export function recordFogSharkIgnited(
  world: World,
  state: GameState,
  shark: Entity,
  actor?: Entity,
  onKill?: FogSharkCollateralKillHandler,
): number {
  const radius = FOG_SHARK_IGNITION_RADIUS;
  const radiusSq = radius * radius;
  let hitCount = 0;
  let killCount = 0;
  let sharkHits = 0;
  const hitIds: number[] = [];

  getEntityIndex().queryRadiusCapped(
    shark.x,
    shark.y,
    radius,
    fogSharkIgnitionQuery,
    ENTITY_MASK_ACTOR,
    FOG_SHARK_IGNITION_QUERY_CAP,
  );

  const hitTarget = (target: Entity): void => {
    if (hitCount >= FOG_SHARK_IGNITION_TARGET_CAP) return;
    if (!target.alive || target.id === shark.id || target.hp === undefined) return;
    if (!isPlayerEntity(target) && target.type !== EntityType.NPC && target.type !== EntityType.MONSTER) return;
    const d2 = world.dist2(shark.x, shark.y, target.x, target.y);
    if (d2 > radiusSq) return;
    const dist = Math.sqrt(d2);
    const falloff = 1 - (dist / radius) * 0.45;
    const damage = Math.max(3, Math.round(FOG_SHARK_IGNITION_DAMAGE * falloff));
    /* Автора взрыва (`actor` — тот, кто поджёг) сюда протянули и до сих пор
     * выбрасывали: NPC, попавший под подожжённый игроком пузырь, не узнавал, кто
     * это сделал. Дверь урона доводит и автора, и штраф отношениям. */
    damageActor(world, state, target, {
      damage,
      source: 'explosion',
      attacker: actor,
      aoe: true,
      knockback: false,
    });
    hitCount++;
    hitIds.push(target.id);
    if (target.monsterKind === MonsterKind.FOG_SHARK) sharkHits++;

    const dx = world.delta(shark.x, target.x);
    const dy = world.delta(shark.y, target.y);
    const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const blastVx = (dx / len) * 7;
    const blastVy = (dy / len) * 7;

    if (isPlayerEntity(target)) {
      state.dmgFlash = Math.max(state.dmgFlash, 0.28);
      state.dmgSeed = (state.dmgSeed + 91) | 0;
      recordPlayerDamage(state, shark, damage, `Газовый взрыв туманной акулы: -${damage}`, 'hazard');
    }

    if (target.hp <= 0) {
      target.hp = 0;
      killEntity(target);
      killCount++;
      onKill?.(target, blastVx, blastVy, target.type === EntityType.MONSTER ? 2 : 1);
    }
  };

  for (const target of fogSharkIgnitionQuery) {
    if (target.monsterKind === MonsterKind.FOG_SHARK) continue;
    hitTarget(target);
  }
  for (const target of fogSharkIgnitionQuery) {
    if (target.monsterKind !== MonsterKind.FOG_SHARK) continue;
    hitTarget(target);
  }

  const cx = Math.floor(shark.x);
  const cy = Math.floor(shark.y);
  const fx = ((shark.x % 1) + 1) % 1;
  const fy = ((shark.y % 1) + 1) % 1;
  const seed = Math.imul(shark.id, 1103515245) ^ Math.floor(state.time * 60);
  stampMark(world, cx, cy, fx, fy, radius * 0.8, MarkType.SCORCH, seed, 42, 24, 58, 210);

  playSoundAt(playExplosion, shark.x, shark.y);
  publishExplosionNoise(state, actor, shark.x, shark.y, radius, 'fog_shark');
  state.msgs.push(msg(
    hitCount > 0
      ? `Газовый пузырь туманной акулы лопнул: задело ${hitCount}.`
      : 'Газовый пузырь туманной акулы лопнул в пустой туман.',
    state.time,
    '#fb8',
  ));

  publishEvent(state, {
    type: 'fog_shark_ignited',
    zoneId: cellZoneId(world, shark),
    roomId: cellRoomId(world, shark),
    x: shark.x,
    y: shark.y,
    actorId: actor?.id,
    actorName: actorName(actor),
    actorFaction: actor?.faction,
    targetId: shark.id,
    targetName: actorName(shark),
    monsterKind: MonsterKind.FOG_SHARK,
    severity: hitCount > 0 ? 4 : 3,
    privacy: isPlayerEntity(actor) ? 'local' : 'witnessed',
    tags: ['monster', 'fog_shark', 'fire', 'explosion', 'counterplay', 'fog'],
    data: {
      radius,
      damage: FOG_SHARK_IGNITION_DAMAGE,
      cap: FOG_SHARK_IGNITION_TARGET_CAP,
      hitCount,
      killCount,
      sharkHits,
      hitIds,
      rumorIds: [...FOG_SHARK_RUMOR_IDS],
    },
  });

  return hitCount;
}

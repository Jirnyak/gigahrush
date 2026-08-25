/* ── Мухожук: кладёт личинку в раненого ───────────────────────────
 *
 * Одно правило: рядом с мухожуком раненый получает личинку. Дальше всё делает
 * время. Вылечили выше порога — личинка не прижилась. Не вылечили — носитель
 * умирает, и из него выходит новый мухожук. Умер раньше срока от чего угодно —
 * выходит сразу: мёртвое тело личинке даже удобнее.
 *
 * Динамика отсюда растёт сама и без единого исключения в общем коде: раненого
 * нельзя бросить лежать, раненых нельзя копить, а добить своего — значит
 * ускорить то, чего ты боялся. Мухожука при этом можно вообще не убивать —
 * достаточно лечить.
 *
 * До этого у вида было три механики сразу (командование соседями, порча еды в
 * ящиках, отдельная манера погони) и восемь полей в ядре. Ни одна из них не
 * давала игроку решения — только шум.
 */

import {
  EntityType, MonsterKind,
  type Entity, type GameState, type Msg, type WorldEventSeverity,
  msg,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { MONSTERS, entityDisplayName, monsterHasAIFlag } from '../../entities/monster';
import { monsterSpr } from '../../entities/sprite_index';
import { spawnDeathPool } from '../blood_fx';
import { canSpawnEntityType } from '../entity_limits';
import { ENTITY_MASK_ACTOR, getEntityIndex } from '../entity_index';
import { publishEvent } from '../events';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../rpg';
import { speciesState } from './species_state';
import { killEntity } from '../entity_death';

/** Личинку кладут вплотную — это укус, а не заклинание. */
const LARVA_INFECT_RANGE = 1.8;
/** Кого считать раненым: половина здоровья. */
const LARVA_INFECT_HP_RATIO = 0.5;
/** Насколько надо вылечиться, чтобы личинка не прижилась. */
const LARVA_CURE_HP_RATIO = 0.8;
/** Сколько зреет. Успеть довести раненого до медпункта — реально, но впритык. */
const LARVA_HATCH_SEC = 48;
/** Как часто мухожук пробует кусать и как часто зреют личинки. */
const LARVA_BITE_CD_SEC = 5.5;
const LARVA_TICK_SEC = 0.5;
/** Потолок реестра: заражённых на этаже не бывает больше горстки. */
const LARVA_REGISTRY_CAP = 24;
const LARVA_SCAN_CAP = 12;

const mukhozhukBiteState = speciesState<{ cd: number }>(() => ({ cd: 0 }));

interface Larva {
  hostId: number;
  motherId: number;
  hatchAt: number;
  /** Последняя известная клетка носителя: тело может исчезнуть из индекса. */
  x: number;
  y: number;
}

/** Реестр ограничен и живёт один прогон: личинка — не персистентный факт. */
const larvae = new Map<number, Larva>();
const biteQuery: Entity[] = [];
let larvaTickCd = 0;

export function resetMukhozhukLarvae(): void {
  larvae.clear();
  larvaTickCd = 0;
}

/** Заражён ли актор. Путь для отладки, тестов и читаемости в HUD. */
export function isMukhozhukInfested(e: Entity): boolean {
  return larvae.has(e.id);
}

export function mukhozhukLarvaCount(): number {
  return larvae.size;
}

function publishLarvaEvent(
  state: GameState | undefined,
  world: World,
  e: Entity,
  host: Entity | undefined,
  type: 'mukhozhuk_infested' | 'mukhozhuk_hatched',
  severity: WorldEventSeverity,
  tags: string[],
  data: Record<string, unknown>,
): void {
  if (!state) return;
  publishEvent(state, {
    type,
    time: data.time as number ?? 0,
    zoneId: world.zoneMap[world.idx(Math.floor(e.x), Math.floor(e.y))],
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: host?.id,
    targetName: host ? entityDisplayName(host) : undefined,
    targetFaction: host?.faction,
    monsterKind: MonsterKind.MUKHOZHUK_HOST,
    severity,
    privacy: 'witnessed',
    tags: ['monster', 'mukhozhuk', 'larva', ...tags],
    data: {
      hatchSec: LARVA_HATCH_SEC,
      cureHpRatio: LARVA_CURE_HP_RATIO,
      counterplay: 'heal_the_wounded_before_it_hatches',
      ...data,
    },
  });
}

function canCarryLarva(host: Entity, mother: Entity): boolean {
  if (host.id === mother.id || !host.alive || host.hp === undefined) return false;
  if (monsterHasAIFlag(host, 'larvaCarrier')) return false;
  if (larvae.has(host.id)) return false;
  return host.hp <= (host.maxHp ?? 100) * LARVA_INFECT_HP_RATIO;
}

/**
 * Укус мухожука. Ищет раненого вплотную — своих, чужих и игрока одинаково:
 * личинке всё равно, чьё это мясо.
 */
export function updateMukhozhukBite(
  world: World,
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): void {
  if (!e.alive || !monsterHasAIFlag(e, 'larvaCarrier')) return;
  const bite = mukhozhukBiteState.of(e);
  bite.cd -= dt;
  if (bite.cd > 0 || larvae.size >= LARVA_REGISTRY_CAP) return;
  bite.cd = LARVA_BITE_CD_SEC + (e.id & 3) * 0.4;

  getEntityIndex().queryRadiusCapped(e.x, e.y, LARVA_INFECT_RANGE, biteQuery, ENTITY_MASK_ACTOR, LARVA_SCAN_CAP);
  for (const host of biteQuery) {
    if (!canCarryLarva(host, e)) continue;
    larvae.set(host.id, { hostId: host.id, motherId: e.id, hatchAt: time + LARVA_HATCH_SEC, x: host.x, y: host.y });
    msgs.push(msg(`${entityDisplayName(e)} оставил личинку в ране: ${entityDisplayName(host)}`, time, '#bd6'));
    publishLarvaEvent(state, world, e, host, 'mukhozhuk_infested', 4, ['infested'], { time });
    return;
  }
}

function hatchLarva(
  world: World,
  entities: Entity[],
  larva: Larva,
  host: Entity | undefined,
  nextId: { v: number },
  time: number,
  msgs: Msg[],
  state?: GameState,
): void {
  const x = host?.x ?? larva.x;
  const y = host?.y ?? larva.y;
  if (host?.alive) {
    killEntity(host);
    host.hp = 0;
  }
  spawnDeathPool(world, x, y, true);

  if (!canSpawnEntityType(entities, EntityType.MONSTER)) return;
  const def = MONSTERS[MonsterKind.MUKHOZHUK_HOST];
  const level = world.zones[world.zoneMap[world.idx(Math.floor(x), Math.floor(y))]]?.level ?? 1;
  const born: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x,
    y,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(MonsterKind.MUKHOZHUK_HOST),
    name: def.name,
    hp: Math.max(1, Math.round(scaleMonsterHp(def.hp, level) * 0.7)),
    maxHp: Math.max(1, Math.round(scaleMonsterHp(def.hp, level) * 0.7)),
    monsterKind: MonsterKind.MUKHOZHUK_HOST,
    attackCd: 1.2,
    rpg: randomRPG(level),
  };
  entities.push(born);
  msgs.push(msg(host
    ? `Из ${entityDisplayName(host)} вышел мухожук`
    : 'Из брошенного тела вышел мухожук', time, '#c84'));
  publishLarvaEvent(state, world, born, host, 'mukhozhuk_hatched', 5, ['hatched'], { time, motherId: larva.motherId });
}

/**
 * Зрелость личинок. Один проход по короткому реестру — не по этажу и не по
 * списку сущностей: заражённых на этаже единицы.
 */
export function updateMukhozhukLarvae(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): void {
  if (larvae.size === 0) return;
  larvaTickCd -= dt;
  if (larvaTickCd > 0) return;
  larvaTickCd = LARVA_TICK_SEC;

  const byId = getEntityIndex().byId;
  for (const larva of [...larvae.values()]) {
    const host = byId.get(larva.hostId);
    if (host?.alive) {
      larva.x = host.x;
      larva.y = host.y;
      // Вылечили — личинка не прижилась. Это и есть контрплей: не оружие, а бинт.
      if ((host.hp ?? 0) >= (host.maxHp ?? 100) * LARVA_CURE_HP_RATIO) {
        larvae.delete(larva.hostId);
        msgs.push(msg(`Рана закрыта: личинка в ${entityDisplayName(host)} не прижилась`, time, '#9cf'));
        continue;
      }
      if (time < larva.hatchAt) continue;
    }
    // Мёртвого носителя личинка не ждёт: тело ей даже удобнее живого.
    larvae.delete(larva.hostId);
    hatchLarva(world, entities, larva, host, nextId, time, msgs, state);
  }
}

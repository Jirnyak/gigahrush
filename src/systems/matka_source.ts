/* ── Matka source spawning: capped persistent children ────────── */

import {
  AIGoal,
  Cell,
  EntityType,
  MonsterKind,
  msg,
  type Entity,
  type GameState,
  type Msg,
} from '../core/types';
import { World } from '../core/world';
import { MONSTERS, entityDisplayName, type MonsterSourceDef } from '../entities/monster';
import { monsterSpr } from '../entities/sprite_index';
import { canSpawnEntityType } from './entity_limits';
import { ENTITY_MASK_ACTOR, getEntityIndex } from './entity_index';
import { publishEvent } from './events';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from './rpg';

/* Источником вид делает объявление `MonsterDef.source`, а не проверка на матку:
 * приплод, каденция и потолок живых детей теперь лежат у вида, шаг остался один
 * на всех. Матка своими числами и остаётся эталоном — обе константы ниже просто
 * читают её объявление, чтобы тесты и внешние ссылки говорили о ней же. */
function sourceDef(e: Entity): MonsterSourceDef | undefined {
  return e.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.source : undefined;
}

export const MATKA_CHILD_CAP = MONSTERS[MonsterKind.MATKA].source!.cap;
export const MATKA_SPAWN_COOLDOWN_SEC = MONSTERS[MonsterKind.MATKA].source!.cooldownSec;

const MATKA_SPAWN_ATTEMPTS = 32;
const MATKA_SPAWN_RADIUS = 3.2;
const MATKA_RUMOR_IDS = ['monster_matka_spawn', 'ecology_matka_children', 'hell_matka_wall_heat'] as const;
const matkaSpawnBlockQuery: Entity[] = [];

function sourceChildren(source: Entity, cap: number): number[] {
  const ai = source.ai;
  if (!ai) return [];
  if (!ai.sourceChildIds) ai.sourceChildIds = [];
  let write = 0;
  for (const rawId of ai.sourceChildIds as unknown[]) {
    const id = Math.floor(Number(rawId));
    if (!Number.isFinite(id) || id <= 0) continue;
    if (write >= cap) break;
    ai.sourceChildIds[write++] = id;
  }
  ai.sourceChildIds.length = write;
  return ai.sourceChildIds;
}

function compactMatkaChildren(source: Entity, byId: ReadonlyMap<number, Entity>, cap: number): number {
  const ids = sourceChildren(source, cap);
  let write = 0;
  for (const id of ids) {
    const child = byId.get(id);
    if (!child?.alive || child.type !== EntityType.MONSTER || child.ai?.sourceEntityId !== source.id) continue;
    if (write >= cap) break;
    ids[write++] = id;
  }
  ids.length = write;
  return write;
}

function zoneLevelAt(world: World, x: number, y: number): number {
  const ci = world.idx(Math.floor(x), Math.floor(y));
  const zid = world.zoneMap[ci];
  return (zid >= 0 && world.zones[zid]) ? Math.max(1, world.zones[zid].level ?? 1) : 1;
}

function findMatkaSpawnCell(world: World, source: Entity, slot: number): { x: number; y: number } | null {
  const entityIndex = getEntityIndex();
  const base = source.id * 0.61803398875 + slot * 2.3999632297;
  for (let attempt = 0; attempt < MATKA_SPAWN_ATTEMPTS; attempt++) {
    const angle = base + attempt * 1.917;
    const dist = 1.1 + ((attempt + slot) % 5) * (MATKA_SPAWN_RADIUS / 5);
    const x = world.wrap(Math.floor(source.x + Math.cos(angle) * dist));
    const y = world.wrap(Math.floor(source.y + Math.sin(angle) * dist));
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) continue;
    if (world.solid(x, y)) continue;
    entityIndex.queryRadiusCapped(x + 0.5, y + 0.5, 0.72, matkaSpawnBlockQuery, ENTITY_MASK_ACTOR, 1);
    if (matkaSpawnBlockQuery.length > 0) continue;
    return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}

function spawnMatkaChild(
  world: World,
  entities: Entity[],
  source: Entity,
  nextId: { v: number },
  sdef: MonsterSourceDef,
): Entity | null {
  if (!canSpawnEntityType(entities, EntityType.MONSTER)) return null;
  const ai = source.ai;
  if (!ai) return null;
  const slot = ai.sourceSpawnedChildren ?? 0;
  const pos = findMatkaSpawnCell(world, source, slot);
  if (!pos) return null;

  const kind = sdef.childKinds[slot % sdef.childKinds.length];
  const def = MONSTERS[kind];
  const level = zoneLevelAt(world, pos.x, pos.y);
  const rpg = randomRPG(level);
  const hp = Math.max(1, Math.round(scaleMonsterHp(def.hp, level) * (0.82 + Math.min(0.3, rpg.str * 0.04))));
  const child: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: pos.x,
    y: pos.y,
    angle: Math.atan2(world.delta(pos.y, source.y), world.delta(pos.x, source.x)),
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, level),
    sprite: monsterSpr(kind),
    name: sdef.childName,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: def.attackRate,
    ai: {
      goal: AIGoal.HUNT,
      tx: Math.floor(source.x),
      ty: Math.floor(source.y),
      path: [],
      pi: 0,
      stuck: 0,
      timer: 0,
      sourceEntityId: source.id,
      // Поводок ребёнка — поводок источника. У матки он не задан, и приплод
      // остаётся при ней; у линейного гнезда он указывает на ЧУЖУЮ комнату, и
      // тот же территориальный режим гонит бойца в наступление.
      homeRoomId: ai.homeRoomId,
    },
    rpg,
    // Сторона наследуется: фракция решает вражду, младший бит сида — цвет.
    faction: source.faction,
    spriteSeed: source.faction !== undefined ? (source.spriteSeed ?? 0) : undefined,
    spriteScale: kind === MonsterKind.SBORKA || kind === MonsterKind.ZOMBIE ? 0.82 : 0.92,
  };
  entities.push(child);
  sourceChildren(source, sdef.cap).push(child.id);
  ai.sourceSpawnedChildren = slot + 1;
  return child;
}

export function updateMatkaSource(
  world: World,
  entities: Entity[],
  source: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  nextId: { v: number },
  entityById: ReadonlyMap<number, Entity>,
  state?: GameState,
): void {
  const sdef = sourceDef(source);
  if (!sdef || !source.ai) return;
  if (source.matkaTimer === Number.POSITIVE_INFINITY) return;

  const liveChildren = compactMatkaChildren(source, entityById, sdef.cap);
  source.matkaTimer = (source.matkaTimer ?? sdef.cooldownSec) - dt;
  if (source.matkaTimer > 0) return;
  source.matkaTimer = sdef.cooldownSec;
  if (liveChildren >= sdef.cap) return;

  const child = spawnMatkaChild(world, entities, source, nextId, sdef);
  if (!child) {
    source.matkaTimer = Math.max(1, sdef.cooldownSec * 0.25);
    return;
  }

  const def = MONSTERS[child.monsterKind ?? MonsterKind.SBORKA];
  // Молчаливый источник — обычный случай: линия рожает раз в десяток секунд, и
  // строка на каждого бойца превратила бы лог в счётчик.
  if (sdef.spawnMsg) msgs.push(msg(sdef.spawnMsg.replace('%s', def.name), time, '#f4a'));
  if (state) {
    const ci = world.idx(Math.floor(source.x), Math.floor(source.y));
    const roomId = world.roomMap[ci];
    publishEvent(state, {
      type: 'matka_child_spawned',
      zoneId: world.zoneMap[ci],
      roomId: roomId >= 0 ? roomId : undefined,
      x: source.x,
      y: source.y,
      actorId: source.id,
      actorName: entityDisplayName(source),
      targetId: child.id,
      targetName: entityDisplayName(child),
      monsterKind: source.monsterKind,
      severity: 4,
      privacy: 'local',
      tags: ['monster', 'matka', 'source_hive', 'children', 'spawn'],
      data: {
        sourceId: source.id,
        childKind: child.monsterKind,
        liveChildren: liveChildren + 1,
        maxChildren: sdef.cap,
        cooldown: sdef.cooldownSec,
        rumorIds: [...MATKA_RUMOR_IDS],
        counterplay: 'kill_source_stops_new_children_existing_children_remain',
      },
    });
  }
}

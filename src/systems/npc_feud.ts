/* ── Личная вражда: поведение и разборка ───────────────────────────
 *
 * Личная неприязнь двоих (ребро графа Демоса ниже порога вражды) НЕ делает их
 * боевыми целями друг для друга — см. `isPersonalFeudEnemy` в `factions.ts`.
 * Она меняет поведение и копится, пока не разрешится одним читаемым событием:
 * двое сходятся один на один.
 *
 * Три следствия вражды, все выражены весами и существующими механизмами:
 *   1. Не помогает в бою — зов своих (`alertFactionMates`) обходит врага.
 *   2. Избегает — комната, где стоит личный враг, теряет вес при выборе цели.
 *   3. Разборка — этот модуль: вызов, дорога к месту, бой, исход.
 *
 * Разборка идёт через ОБЫЧНЫЕ боевые пути: боевая память (`forceCombatThreat`)
 * наводит одного на другого, дальше работает штатный бой, и урон проходит той же
 * единственной дверью `damageActor`. Своего оружия у разборки нет.
 *
 * Место: комната с тегом `arena`, если она есть на этаже; иначе — тихая комната
 * у середины пути между двоими. Оба идут туда САМИ, обычным движением.
 *
 * Исход: смерть ВОЗМОЖНА, но не обязательна. Первый, кому собственная храбрость
 * (`npcShouldFightThreat` — та же справка, по которой всякий решает, драться ли)
 * говорит «хватит», уступает. Любой исход разряжает вражду: ребро пары
 * поднимается до половины пути от порога к нулю — остыли, но не подружились.
 * Без этого разборка была бы бесконечной, а разряжать её нечем.
 */

import {
  AIGoal, EntityType, type Entity, type GameState,
} from '../core/types';
import type { World } from '../core/world';
import { RELATION_HOSTILE_THRESHOLD } from '../data/relations';
import { roomIdsAroundInto } from '../world/room_index';
import { ENTITY_MASK_NPC, getEntityIndex } from './entity_index';
import { publishEvent } from './events';
import { factionsSocialContextState, isHostile } from './factions';
import { isPlayerEntity } from './player_actor';
import {
  clearCombatThreat, forceCombatThreat, npcShouldFightThreat, setDuelLock,
} from './combat_stimulus';
import { getDemosNpcOnlySocialEdges, setDemosSocialEdge } from './demos_social';
import { registerContentRuntimeHook } from './content_hooks';
import { followPath, tryAssignPathToCell } from './ai/pathfinding';

/** Такт распорядителя разборок. Из него выведены оба срока — лишних ручек нет. */
const FEUD_TICK_SECONDS = 4;
/** Дорога к месту: не дошли за это время — расходятся. */
const FEUD_TRAVEL_TIMEOUT_S = FEUD_TICK_SECONDS * 15;
/** Бой: не решили за это время — расходятся, вражда всё равно разряжена. */
const FEUD_FIGHT_TIMEOUT_S = FEUD_TICK_SECONDS * 45;
/** Ринг: ближе этого к месту — считается, что дошёл. */
const FEUD_RING_RADIUS = 3;
/** Сколько человек распорядитель успевает опросить за такт. */
const FEUD_SCAN_PER_TICK = 64;
/** Докуда ищется тихая комната от середины пути между двоими. */
const FEUD_VENUE_SCAN_RADIUS = 40;
/** Сколько комнат-кандидатов взвешивается. Перебирать этаж нельзя: их тысячи. */
const FEUD_VENUE_CANDIDATES = 12;
/** Чем разряжается вражда любым исходом: половина пути от порога к нулю. */
const FEUD_SETTLED_RELATION = Math.round(RELATION_HOSTILE_THRESHOLD / 2);

type FeudDuelPhase = 'travel' | 'fight';

interface FeudDuel {
  aId: number;
  bId: number;
  aAlifeId: number;
  bAlifeId: number;
  z: number;
  x: number;
  y: number;
  roomId: number;
  arena: boolean;
  phase: FeudDuelPhase;
  elapsed: number;
}

/* Кап — одна разборка на этаж, и он выражен самой формой хранения: разборка
 * должна быть СОБЫТИЕМ, которое видно, а не режимом этажа. Тот же приём, что у
 * арены (`systems/arena.ts`): один слот, не список. */
let activeDuel: FeudDuel | null = null;
let directorAccum = 0;
let scanCursor = 0;
/* Отладочный путь. Отвечает на единственный вопрос, который тут задают: почему
 * разборок не видно. `pairsSeen` — сколько пар распорядитель вообще нашёл,
 * `noVenue` — скольким некуда идти, `walkTicks` — идут ли бойцы, `lastLeft*` —
 * сколько клеток осталось до места, когда истёк срок дороги. */
const feudStats = {
  ticks: 0, pairsSeen: 0, noVenue: 0, called: 0, resolved: 0,
  lastOutcome: '', walkTicks: 0, lastLeftA: 0, lastLeftB: 0,
};

export function getFeudDebugStats(): Readonly<typeof feudStats> & { active: boolean } {
  return { ...feudStats, active: activeDuel !== null };
}

/* ── Избегание: где стоят мои личные враги ─────────────────────────
 * Строк графа у человека семь, поэтому список врагов заведомо короткий.
 * Считается не чаще такта распорядителя и живёт на сущности. */
interface FeudAvoidCache { at: number; rooms: number[] }
const avoidCacheByActor = new WeakMap<Entity, FeudAvoidCache>();

function refreshAvoidCache(world: World, actor: Entity, state: GameState): FeudAvoidCache {
  let cache = avoidCacheByActor.get(actor);
  if (cache && state.time - cache.at >= 0 && state.time - cache.at < FEUD_TICK_SECONDS) return cache;
  if (!cache) {
    cache = { at: state.time, rooms: [] };
    avoidCacheByActor.set(actor, cache);
  }
  cache.at = state.time;
  cache.rooms.length = 0;
  const alifeId = actor.alifeId;
  if (alifeId === undefined) return cache;
  const byAlifeId = getEntityIndex().byAlifeId;
  for (const edge of getDemosNpcOnlySocialEdges(state, alifeId)) {
    const targetAlifeId = edge.targetAlifeId;
    if (targetAlifeId === undefined || edge.relation > RELATION_HOSTILE_THRESHOLD) continue;
    const enemy = byAlifeId.get(targetAlifeId);
    if (!enemy?.alive || enemy.id === actor.id) continue;
    const roomId = world.roomMap[world.idx(Math.floor(enemy.x), Math.floor(enemy.y))];
    if (roomId >= 0 && !cache.rooms.includes(roomId)) cache.rooms.push(roomId);
  }
  return cache;
}

/**
 * Стоит ли в этой комнате личный враг. Читается выбором цели рутины как ещё
 * одно слагаемое веса — рядом с «чужая территория», «толпа» и «опасность».
 *
 * Кадровый контекст тот же, что у `isHostile`: без него личная вражда просто не
 * читается, и комната весит как обычно.
 */
export function feudRoomHoldsEnemy(world: World, actor: Entity, roomId: number): boolean {
  if (roomId < 0 || actor.type !== EntityType.NPC || actor.alifeId === undefined) return false;
  const state = factionsSocialContextState();
  if (state === undefined) return false;
  const cache = refreshAvoidCache(world, actor, state);
  return cache.rooms.length > 0 && cache.rooms.includes(roomId);
}

/* ── Разборка ─────────────────────────────────────────────────────── */

export function isInFeudDuel(e: Entity): boolean {
  return activeDuel !== null && (activeDuel.aId === e.id || activeDuel.bId === e.id);
}

/**
 * Дорога на разборку идёт вместо рутины, а не поверх неё.
 *
 * Распорядитель тикает раз в несколько секунд и назначить путь может, а удержать
 * — нет: между его тактами человек переберёт намерения и уйдёт по своим делам.
 * Поэтому шаг дороги живёт в самом такте рутины (`npc_fsm`) и возвращает `true`,
 * когда рутину надо пропустить: боец идёт СВОИМ ходом, обычным `followPath`,
 * телепорта на этой ветке нет.
 *
 * В фазе боя удержания нет: там работает штатный боевой AI.
 */
export function tickFeudDuelWalk(world: World, e: Entity, dt: number): boolean {
  const duel = activeDuel;
  if (!duel || duel.phase !== 'travel') return false;
  if (duel.aId !== e.id && duel.bId !== e.id) return false;
  const ai = e.ai;
  if (!ai) return false;
  if (world.dist2(e.x, e.y, duel.x, duel.y) <= FEUD_RING_RADIUS * FEUD_RING_RADIUS) return false;
  if (ai.path.length === 0 || ai.pi >= ai.path.length) {
    if (!sendToVenue(world, e, duel.x, duel.y)) return false;
  }
  ai.goal = AIGoal.GOTO;
  ai.timer = FEUD_TICK_SECONDS;
  feudStats.walkTicks++;
  followPath(world, e, dt);
  return true;
}

export function resetFeudDuels(): void {
  activeDuel = null;
  directorAccum = 0;
  scanCursor = 0;
  feudStats.ticks = 0;
  feudStats.pairsSeen = 0;
  feudStats.noVenue = 0;
  feudStats.called = 0;
  feudStats.resolved = 0;
  feudStats.lastOutcome = '';
  feudStats.walkTicks = 0;
}

function duelCandidate(e: Entity): boolean {
  return e.alive === true
    && e.type === EntityType.NPC
    && e.ai !== undefined
    && e.alifeId !== undefined
    && !isPlayerEntity(e)
    && (e.psiMadness ?? 0) <= 0;
}

let arenaRoomWorld: World | undefined;
let arenaRoomId = -1;

function arenaRoomOf(world: World): number {
  if (arenaRoomWorld === world) return arenaRoomId;
  arenaRoomWorld = world;
  arenaRoomId = world.rooms.findIndex(r => r?.tags?.includes('arena') === true);
  return arenaRoomId;
}

const venueScratch: number[] = [];
const occupantScratch: Entity[] = [];

interface FeudVenue { x: number; y: number; roomId: number; arena: boolean }

function roomVenue(world: World, roomId: number, arena: boolean): FeudVenue | undefined {
  const room = world.rooms[roomId];
  if (!room) return undefined;
  return {
    x: world.wrap(room.x + Math.floor(room.w / 2)) + 0.5,
    y: world.wrap(room.y + Math.floor(room.h / 2)) + 0.5,
    roomId,
    arena,
  };
}

/** Арена этажа, если она вообще есть. Первый выбор места. */
function arenaVenue(world: World): FeudVenue | undefined {
  const arena = arenaRoomOf(world);
  return arena >= 0 ? roomVenue(world, arena, true) : undefined;
}

/** Договорная точка: самая тихая комната у середины пути между двоими. */
function quietVenue(world: World, a: Entity, b: Entity): FeudVenue | undefined {
  const mx = world.wrap(a.x + world.delta(a.x, b.x) * 0.5);
  const my = world.wrap(a.y + world.delta(a.y, b.y) * 0.5);
  const found = roomIdsAroundInto(world, mx, my, FEUD_VENUE_SCAN_RADIUS, venueScratch);
  let best: FeudVenue | undefined;
  let bestCrowd = Number.POSITIVE_INFINITY;
  const limit = Math.min(found, FEUD_VENUE_CANDIDATES);
  for (let i = 0; i < limit; i++) {
    const venue = roomVenue(world, venueScratch[i], false);
    if (!venue) continue;
    getEntityIndex().queryRadiusCapped(
      venue.x, venue.y, FEUD_RING_RADIUS, occupantScratch, ENTITY_MASK_NPC, 8,
    );
    const crowd = occupantScratch.length;
    occupantScratch.length = 0;
    if (crowd >= bestCrowd) continue;
    bestCrowd = crowd;
    best = venue;
    if (crowd === 0) break;
  }
  return best;
}

/** Отправить бойца к месту. `false` — дороги туда нет, договариваться не о чем. */
function sendToVenue(world: World, e: Entity, x: number, y: number): boolean {
  const ai = e.ai;
  if (!ai) return false;
  const status = tryAssignPathToCell(world, e, Math.floor(x), Math.floor(y));
  if (status === 'not_found') return false;
  ai.goal = AIGoal.GOTO;
  ai.timer = FEUD_TICK_SECONDS;
  ai.combatScanCd = FEUD_TICK_SECONDS;
  return true;
}

function publishDuelEvent(
  state: GameState,
  duel: FeudDuel,
  a: Entity | undefined,
  b: Entity | undefined,
  phase: 'challenge' | 'resolved',
  outcome: string,
): void {
  publishEvent(state, {
    type: phase === 'challenge' ? 'npc_feud_challenge' : 'npc_feud_resolved',
    roomId: duel.roomId >= 0 ? duel.roomId : undefined,
    x: duel.x,
    y: duel.y,
    actorId: duel.aId,
    actorName: a?.name,
    actorFaction: a?.faction,
    targetId: duel.bId,
    targetName: b?.name,
    targetFaction: b?.faction,
    severity: phase === 'challenge' ? 2 : 3,
    privacy: 'local',
    tags: ['demos_social', 'feud', 'duel', duel.arena ? 'arena' : 'meeting_point', outcome],
    data: {
      outcome,
      arena: duel.arena,
      actorAlifeId: duel.aAlifeId,
      targetAlifeId: duel.bAlifeId,
    },
  });
}

/** Любой исход разряжает вражду: ребро перестаёт быть враждебным. */
function settleFeud(state: GameState, duel: FeudDuel): void {
  setDemosSocialEdge(state, duel.aAlifeId, duel.bAlifeId, FEUD_SETTLED_RELATION);
}

function endDuel(state: GameState, outcome: string): void {
  const duel = activeDuel;
  if (!duel) return;
  activeDuel = null;
  const byId = getEntityIndex().byId;
  const a = byId.get(duel.aId);
  const b = byId.get(duel.bId);
  for (const fighter of [a, b]) {
    if (!fighter) continue;
    setDuelLock(fighter, false);
    clearCombatThreat(fighter);
    if (fighter.ai && fighter.alive) {
      fighter.ai.combatTargetId = undefined;
      fighter.ai.goal = AIGoal.WANDER;
      fighter.ai.timer = 0;
    }
  }
  settleFeud(state, duel);
  feudStats.resolved++;
  feudStats.lastOutcome = outcome;
  publishDuelEvent(state, duel, a, b, 'resolved', outcome);
}

/** Ищет пару, которой пора выяснить отношения. Просмотр ограничен курсором. */
function findChallenge(world: World, entities: readonly Entity[], state: GameState): boolean {
  const count = entities.length;
  if (count === 0) return false;
  const byAlifeId = getEntityIndex().byAlifeId;
  /* Бюджет тратится на ЛЮДЕЙ, а не на позиции массива: в списке сущностей этажа
   * людей меньше четверти (остальное — вещи, снаряды, декорации), и бюджет,
   * потраченный на позиции, до людей почти не доходил. Шаг по массиву при этом
   * ограничен его длиной — полного оборота за такт не бывает. */
  let steps = 0;
  for (let scanned = 0; scanned < FEUD_SCAN_PER_TICK && steps < count; steps++) {
    if (scanCursor >= count) scanCursor = 0;
    const a = entities[scanCursor++];
    if (!duelCandidate(a)) continue;
    scanned++;
    for (const edge of getDemosNpcOnlySocialEdges(state, a.alifeId!)) {
      const targetAlifeId = edge.targetAlifeId;
      if (targetAlifeId === undefined || edge.relation > RELATION_HOSTILE_THRESHOLD) continue;
      const b = byAlifeId.get(targetAlifeId);
      if (!b || !duelCandidate(b) || b.id === a.id) continue;
      // Тем, кто и так стреляет друг в друга, разборка не нужна: она — способ
      // выразить вражду там, где боя быть не должно.
      //
      // Спрашивается это у обоих поимённо, а не у их фракций. Враждебность стала
      // ЛИЧНОЙ и направленной: два жителя одной фракции могут смотреть на
      // ликвидатора по-разному, и общий ответ «фракции не враждуют» пропустил бы
      // на разборку того, кто уже держит противника на мушке.
      if (isHostile(a, b) || isHostile(b, a)) continue;
      // Выясняют отношения с тем, на кого натыкаются, а не с тем, кто на другом
      // конце этажа: через полтысячи клеток к сроку никто не приходит, и вызов
      // весь свой срок стоит впустую. Дальнюю вражду сводит макрослой — визит
      // `conflict_visit` (`data/demos_social_visits.ts`) привозит ненавистника
      // на этаж врага, и уже там его встречает этот распорядитель.
      if (world.dist2(a.x, a.y, b.x, b.y) > FEUD_VENUE_SCAN_RADIUS * FEUD_VENUE_SCAN_RADIUS) continue;
      feudStats.pairsSeen++;
      // Место назначается только если ОБА могут туда дойти. Иначе разборка стоит
      // впустую весь свой срок — так на коллекторах, где стоит чужая и
      // непроходимая арена: вызов был, а прийти на него было нельзя. Поэтому
      // недостижимая арена не отменяет разборку, а уступает договорной точке.
      let venue = arenaVenue(world);
      if (!venue || !sendToVenue(world, a, venue.x, venue.y) || !sendToVenue(world, b, venue.x, venue.y)) {
        venue = quietVenue(world, a, b);
      }
      if (!venue || !sendToVenue(world, a, venue.x, venue.y) || !sendToVenue(world, b, venue.x, venue.y)) {
        feudStats.noVenue++;
        continue;
      }
      activeDuel = {
        aId: a.id, bId: b.id,
        aAlifeId: a.alifeId!, bAlifeId: targetAlifeId,
        z: state.currentZ,
        x: venue.x, y: venue.y, roomId: venue.roomId, arena: venue.arena,
        phase: 'travel', elapsed: 0,
      };
      setDuelLock(a, true);
      setDuelLock(b, true);
      feudStats.called++;
      publishDuelEvent(state, activeDuel, a, b, 'challenge', 'called');
      return true;
    }
  }
  return false;
}

function updateDuel(world: World, state: GameState, dt: number): void {
  const duel = activeDuel;
  if (!duel) return;
  duel.elapsed += dt;
  // Смена этажа и самосбор снимают разборку целиком: место перестало существовать.
  if (duel.z !== state.currentZ || state.samosborActive) {
    endDuel(state, 'aborted');
    return;
  }
  const byId = getEntityIndex().byId;
  const a = byId.get(duel.aId);
  const b = byId.get(duel.bId);
  if (!a?.alive || !b?.alive) {
    // Один выбыл — разборка кончилась смертью. Оба разом (двойное убийство,
    // уход с этажа, разгрузка сущностей) — победителя нет.
    const bothGone = !a?.alive && !b?.alive;
    endDuel(state, bothGone ? 'lost' : 'death');
    return;
  }

  if (duel.phase === 'travel') {
    if (duel.elapsed >= FEUD_TRAVEL_TIMEOUT_S) {
      feudStats.lastLeftA = Math.round(Math.sqrt(world.dist2(a.x, a.y, duel.x, duel.y)));
      feudStats.lastLeftB = Math.round(Math.sqrt(world.dist2(b.x, b.y, duel.x, duel.y)));
      endDuel(state, 'no_show');
      return;
    }
    const ring = FEUD_RING_RADIUS * FEUD_RING_RADIUS;
    if (world.dist2(a.x, a.y, duel.x, duel.y) <= ring && world.dist2(b.x, b.y, duel.x, duel.y) <= ring) {
      duel.phase = 'fight';
      duel.elapsed = 0;
    } else if (!sendToVenue(world, a, duel.x, duel.y) || !sendToVenue(world, b, duel.x, duel.y)) {
      // Дорога пропала посреди пути — самосбор перестроил геометрию, дверь заперли.
      endDuel(state, 'no_show');
    }
    return;
  }

  if (duel.elapsed >= FEUD_FIGHT_TIMEOUT_S) {
    endDuel(state, 'draw');
    return;
  }
  // Уступает тот, кому собственная храбрость говорит «хватит». Справка общая:
  // по ней всякий решает, отвечать на удар или бежать.
  if (!npcShouldFightThreat(a, b)) {
    endDuel(state, 'yield');
    return;
  }
  if (!npcShouldFightThreat(b, a)) {
    endDuel(state, 'yield');
    return;
  }
  forceCombatThreat(a, b, state.time);
  forceCombatThreat(b, a, state.time);
}

registerContentRuntimeHook({
  id: 'npc_feud_duels',
  phases: ['floor_activity'],
  update: ({ state, entities, world, dt, gameOver }) => {
    if (gameOver) return;
    directorAccum += Math.max(0, dt);
    if (directorAccum < FEUD_TICK_SECONDS) return;
    const elapsed = directorAccum;
    directorAccum = 0;
    feudStats.ticks++;
    if (activeDuel) {
      updateDuel(world, state, elapsed);
      return;
    }
    if (state.samosborActive) return;
    findChallenge(world, entities, state);
  },
});

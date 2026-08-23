/* ── NPC local utility executor: intent scoring + bounded actions ─ */

import {
  type Entity, type Msg,
  EntityType, AIGoal, RoomType, NpcState, Faction,
  ZoneFaction, Occupation, type GameClock, Cell, type TerritoryOwner, type Room,
  ItemType, MAX_DRAW,
} from '../../core/types';
import { World } from '../../core/world';
import { containersInRoom, nearestContainer } from '../../world/container_index';
import { roomIdsAroundInto, roomRadiusCoversFloor } from '../../world/room_index';
import { WEAPON_STATS } from '../../data/catalog';
import { ITEMS } from '../../data/items';
import { roomAffordanceWeight } from '../../data/room_affordances';
import { FACTORIES } from '../../data/factories';
import { RESOURCES, resourceForItem } from '../../data/resources';
import { itemAddCapacity } from '../inventory';
import {
  canAccessContainer,
  containerAccessInfo,
  putIntoContainer,
  takeFromContainer,
} from '../containers';
import { npcAutoEquipBestWeapon } from './combat';
import { ENTITY_MASK_ACTOR, ensureEntityIndex } from '../entity_index';
import { isHostile } from '../factions';
import { feudRoomHoldsEnemy, tickFeudDuelWalk } from '../npc_feud';
import {
  followPath,
  findFamilyRoom,
  gotoNearestRoomOfTypes,
  gotoNearestRoomType,
  roomTargetCell,
  tryAssignPathToCell,
  wanderNearby,
  wanderFar,
  wanderInRoom,
} from './pathfinding';
import { evaluateMicroStimuli, tickMicroGoal } from './micro_goals';
import {
  emitMarkovBark,
  BARK_CHANCE_HIDE,
  BARK_CHANCE_GENERIC,
} from './barks';
import { getRecentEvents } from '../events';
import { chooseNpcEmergencyDecision } from './npc_emergency';
import { tickNpcMemoryLowFrequency } from '../npc_memory';
import { tickNpcRumorLowFrequency } from '../rumor';
import { tickNpcSpecialRoutine } from '../npc_special_routines';
import { factionToTerritoryOwner } from '../../data/factions';
import {
  occupationHasAnyRoutineTag,
  occupationHasRoutineTag,
} from '../../data/occupation_profiles';
import {
  getRoomMemory,
  getRoomMemoryCount,
  roomMemoryIsHelpful,
  roomMemoryIsHostile,
  roomMemoryRevealsStash,
} from '../room_memory';
import { territoryOwnerAtIndex, territoryRoomOwner } from '../territory';
import { noteRoomVisit, roomVisitNovelty } from '../room_visits';
import { cleanSurfaceArea } from '../surface_cleanup';
import {
  NPC_UTILITY_INTENTS,
  NPC_UTILITY_ROOM_TYPES,
  NPC_UTILITY_ROOM_TYPE_SLOTS,
  createNpcUtilityScoreBuffer,
  fillNpcUtilityRoomTypeInterest,
  npcUtilityIdentityFromEntity,
  npcUtilityJitter01,
  npcUtilityIntentPatience,
  npcUtilityRoomCapacity,
  npcUtilityRoomInterest,
  npcUtilityRoomTypeWeightForIntent,
  scoreNpcUtilityTargetPreference,
  scoreNpcUtilities,
  selectNpcUtilityIntent,
  type NpcUtilityIntentId,
  type NpcUtilityRoomMemorySnapshot,
  type NpcUtilityTargetCandidate,
  type NpcUtilityTargetPreferenceContext,
  type NpcUtilityThreatSnapshot,
} from './npc_utility';
import { rng } from '../../core/rand';

export type NpcAiProfile = 'default' | 'ministry';

let _barkMsgs: Msg[] = [];
let _barkTime = 0;
/** Этаж активного прогона: ключ коммунальной памяти комнат (`room_memory`). */
let _routineZ: number | undefined;

export function setNpcContext(msgs: Msg[], time: number, currentZ?: number): void {
  _barkMsgs = msgs;
  _barkTime = time;
  _routineZ = currentZ;
}

/* Далеко ли человек ищет ящик под рейс. Раньше он знал каждый ящик этажа и
 * перебирал их все; теперь спрашивает только клетки вокруг себя, вдвое дальше
 * своей видимости. Чего нет в этом круге — того для смены не существует. */
const SUPPLY_ERRAND_RADIUS = MAX_DRAW * 2;
const UTILITY_THREAT_RADIUS = 16;
const UTILITY_THREAT_CAP = 32;
const UTILITY_SWITCH_MARGIN = 7;
const UTILITY_EMERGENCY_SCORE = 58;
const UTILITY_RETHINK_BASE_SEC = 1.5;
const UTILITY_RETHINK_SPREAD_SEC = 2.5;
/* Скольким ближайшим ГОДНЫМ комнатам достаётся дорогая оценка. Меньше прежних
 * 96 не потому, что стало хуже: раньше из 96 комнат окна годными оказывались
 * единицы, а сюда попадают только те, которым есть что предложить, и только
 * ближайшие. Восьмёрка финалистов выбирается из них. */
const ROUTINE_NEAREST_ROOM_CAP = 24;
const ROUTINE_ROOM_CANDIDATE_CAP = 8;
const ROUTINE_LOCAL_ROOM_DISTANCE = 132;
const ROUTINE_SURVIVAL_ROOM_DISTANCE = 220;
const ROUTINE_TRAVELER_NEED_ROOM_DISTANCE = 280;
const CLEANER_SURFACE_RADIUS = 1.35;
const CLEANER_SURFACE_RETRY_BASE_SEC = 2.5;
const CLEANER_SURFACE_RETRY_SPREAD_SEC = 2.5;
/** Сколько лишнего надо нести, чтобы вообще собраться на склад. */
const STORE_SPARE_MIN = 2;
const STORE_SPARE_CAP = 4;
const STORE_ACTION_BASE_SEC = 1.5;
const STORE_ACTION_SPREAD_SEC = 1.5;
const emergencyLocalActors: Entity[] = [];
const utilityLocalActors: Entity[] = [];
const utilityScoreBuffer = createNpcUtilityScoreBuffer();
const routineFriendlyRoomCandidates: NpcUtilityTargetCandidate[] = [];
const routineFallbackRoomCandidates: NpcUtilityTargetCandidate[] = [];
const routineSeenRoomIds = new Set<number>();
const routineNearbyRoomIds: number[] = [];
const routineNearbyKeys: number[] = [];
/** Сырая выборка индекса комнат: надмножество круга, фильтруется на месте. */
const routineRoomIdScratch: number[] = [];
/** Номер комнаты влезает в младшие разряды ключа сортировки по расстоянию. */
const ROUTINE_ROOM_KEY_SCALE = 1 << 18;
const routineTypeInterest = new Float32Array(NPC_UTILITY_ROOM_TYPE_SLOTS);
/** Граница терпеливого дела: работа, досуг, патруль и прогулка (см. таблицу терпения). */
const ROUTINE_PATIENT_INTENT = 0.85;
const ROOM_CROWD_REFRESH_SEC = 0.5;
/** Комната, куда не зовут: чужая территория или личный враг внутри. */
const ROOM_UNWELCOME_PENALTY = 18;
/* Забитость комнаты как контекст: где уже стоят люди, туда тянет слабее.
 * Считается ОДНОЙ переписью на этаж раз в полсекунды, а не запросом на
 * человека и не обходом комнаты — иначе выбор цели стал бы квадратичным. */
const roomCrowdCounts: number[] = [];
let roomCrowdRefreshedAt = -Infinity;
const utilityIntentByNpc = new WeakMap<Entity, NpcUtilityIntentId>();
const utilityScoreByNpc = new WeakMap<Entity, number>();
const utilityNextDecisionAtByNpc = new WeakMap<Entity, number>();
const cleanerNextSurfaceAtByNpc = new WeakMap<Entity, number>();
const storeNextActionAtByNpc = new WeakMap<Entity, number>();

function stableUnit(e: Entity, salt: string | number): number {
  return npcUtilityJitter01(npcUtilityIdentityFromEntity(e), salt);
}

function stableTimer(e: Entity, salt: string | number, base: number, spread: number): number {
  return base + stableUnit(e, salt) * spread;
}

/* Зеркало комнат в плоских массивах: центр и тип.
 *
 * Отбор ближайших идёт по всему этажу, а этаж — это до 14 тысяч комнат. Ходить
 * по такому числу объектов на каждое решение дорого не из-за арифметики, а
 * из-за разыменования; в трёх плоских массивах тот же проход стоит втрое
 * меньше. Геометрия комнат статична, поэтому зеркало живёт до смены этажа и
 * подновляется по времени — на случай, если самосбор дострочил комнат. */
const ROOM_MIRROR_REFRESH_SEC = 1;
const ROOM_MIRROR_HOLE = 255;
let roomMirrorWorld: World | undefined;
let roomMirrorAt = -Infinity;
let roomMirrorCount = 0;
let roomMirrorCx = new Float32Array(0);
let roomMirrorCy = new Float32Array(0);
let roomMirrorType = new Uint8Array(0);

function refreshRoomMirror(world: World): void {
  const count = world.rooms.length;
  const elapsed = _barkTime - roomMirrorAt;
  if (roomMirrorWorld === world && roomMirrorCount === count && elapsed >= 0 && elapsed < ROOM_MIRROR_REFRESH_SEC) return;
  roomMirrorWorld = world;
  roomMirrorCount = count;
  roomMirrorAt = _barkTime;
  if (roomMirrorCx.length < count) {
    roomMirrorCx = new Float32Array(count);
    roomMirrorCy = new Float32Array(count);
    roomMirrorType = new Uint8Array(count);
  }
  for (let id = 0; id < count; id++) {
    const room = world.rooms[id];
    if (room === undefined) {
      roomMirrorType[id] = ROOM_MIRROR_HOLE;
      continue;
    }
    roomMirrorCx[id] = room.x + room.w * 0.5;
    roomMirrorCy[id] = room.y + room.h * 0.5;
    roomMirrorType[id] = room.type;
  }
}

function refreshRoomCrowd(world: World, entities: readonly Entity[]): void {
  const elapsed = _barkTime - roomCrowdRefreshedAt;
  if (elapsed >= 0 && elapsed < ROOM_CROWD_REFRESH_SEC) return;
  roomCrowdRefreshedAt = _barkTime;
  const rooms = world.rooms.length;
  roomCrowdCounts.length = rooms;
  roomCrowdCounts.fill(0);
  for (const other of entities) {
    // Игрок ходит той же сущностью NPC — он тоже занимает место в комнате.
    if (!other.alive || other.type !== EntityType.NPC) continue;
    const roomId = world.roomMap[world.idx(Math.floor(other.x), Math.floor(other.y))];
    if (roomId >= 0 && roomId < rooms) roomCrowdCounts[roomId]++;
  }
}

function routineRoomMemorySnapshot(roomId: number): NpcUtilityRoomMemorySnapshot | undefined {
  // Ключ памяти — строка, а спрашивают её на каждую комнату окна сканирования.
  // Пустая память (обычный случай до первого следа игрока) не стоит ничего.
  if (_routineZ === undefined || getRoomMemoryCount() === 0) return undefined;
  const record = getRoomMemory(_routineZ, roomId);
  if (!record) return undefined;
  return {
    hostile: roomMemoryIsHostile(record),
    helpful: roomMemoryIsHelpful(record),
    stash: roomMemoryRevealsStash(record),
    severity: record.severity,
  };
}

function routineRoomPreferenceContext(
  e: Entity,
  intent: NpcUtilityIntentId,
): NpcUtilityTargetPreferenceContext {
  return {
    identity: npcUtilityIdentityFromEntity(e),
    intent,
    occupation: e.occupation,
    faction: e.faction,
    needs: e.needs,
    hp: e.hp,
    maxHp: e.maxHp,
    stableJitter: 2,
    distanceScale: 96,
  };
}

function ownTerritoryOwner(e: Entity): TerritoryOwner | undefined {
  return e.faction === undefined ? undefined : factionToTerritoryOwner(e.faction);
}

function territoryFriendlyForNpc(e: Entity, owner: TerritoryOwner): boolean {
  const own = ownTerritoryOwner(e);
  if (own === undefined) return false;
  if (owner === own) return true;
  if (e.faction === Faction.SCIENTIST && owner === ZoneFaction.CITIZEN) return true;
  if (e.faction === Faction.CITIZEN && owner === ZoneFaction.SCIENTIST) return true;
  return false;
}

function usesTravelerRoutine(e: Entity): boolean {
  return e.isTraveler === true ||
    (e.isTraveler !== false && e.assignedRoomId === undefined && e.familyId === undefined && occupationHasRoutineTag(e.occupation, 'traveler'));
}

function isRoutineTrespassRelaxed(e: Entity): boolean {
  return usesTravelerRoutine(e) || occupationHasRoutineTag(e.occupation, 'patrol');
}

/* Пройти чужой территорией ради нужды больше некому: тело целиком ведёт ядро
 * актора (`systems/actor`), и его драйвы сами решают, куда идти. Предикат
 * оставлен пустым намеренно — он выражает «у этого слоя срочных дел не
 * осталось», и его единственный читатель ниже это и проверяет. */
function routineIntentAllowsSurvivalTrespass(_intent: NpcUtilityIntentId): boolean {
  return false;
}


function utilityRethinkInterval(e: Entity): number {
  return stableTimer(e, 'utility_rethink', UTILITY_RETHINK_BASE_SEC, UTILITY_RETHINK_SPREAD_SEC);
}

function hasActivePath(e: Entity): boolean {
  const ai = e.ai;
  return !!ai && ai.path.length > 0 && ai.pi < ai.path.length;
}

function canHoldRoutineFrame(e: Entity, intent: NpcUtilityIntentId): boolean {
  const ai = e.ai;
  if (!ai || ai.combatTargetId !== undefined || hasActivePath(e) || ai.timer <= 0) return false;
  // Кадр держат только терпеливые дела: срочное обязано пересчитаться сразу.
  return npcUtilityIntentPatience(intent) >= ROUTINE_PATIENT_INTENT;
}

function preferredEmergencyRoomId(world: World, e: Entity): number | undefined {
  const familyRoomId = usesTravelerRoutine(e) ? -1 : findFamilyRoom(world, e, RoomType.LIVING);
  if (familyRoomId >= 0) return familyRoomId;
  if (e.assignedRoomId !== undefined && e.assignedRoomId >= 0) return e.assignedRoomId;
  return undefined;
}

function tryAssignEmergencyShelterPath(
  world: World,
  _entities: readonly Entity[],
  e: Entity,
  clock?: GameClock,
  shelterRoomIds?: readonly number[],
): boolean {
  const ai = e.ai!;
  const homeRoomId = preferredEmergencyRoomId(world, e);
  const assignedRoomId = e.assignedRoomId !== undefined && e.assignedRoomId >= 0 ? e.assignedRoomId : undefined;
  const preferredRoomIds = assignedRoomId !== undefined && assignedRoomId !== homeRoomId ? [assignedRoomId] : undefined;
  const nearbyRadius = 18 + Math.floor(stableUnit(e, 'emergency_radius') * 8);
  ensureEntityIndex(_entities).queryRadiusCapped(e.x, e.y, nearbyRadius, emergencyLocalActors, ENTITY_MASK_ACTOR, 64);
  const decision = chooseNpcEmergencyDecision(world, e, {
    phase: 'active',
    homeRoomId,
    preferredRoomIds,
    localActors: emergencyLocalActors,
    localActorCap: 16,
    shelterRoomIds,
    candidateCap: 8,
    nearbyRadius,
    nearbyRoomCap: 8,
    seedSalt: Math.floor((clock?.totalMinutes ?? 0) / 30),
  });
  if (decision.targetRoomId < 0) return false;

  ai.goal = AIGoal.HIDE;
  ai.tx = decision.targetCellX;
  ai.ty = decision.targetCellY;
  ai.path = [];
  ai.pi = 0;
  ai.stuck = 0;
  const status = tryAssignPathToCell(world, e, decision.targetCellX, decision.targetCellY);
  if (status === 'not_found') {
    ai.timer = 0;
    return false;
  }
  ai.timer = Math.max(0.75, decision.rethinkAfterSec);
  return true;
}

function initialIntentForNpc(e: Entity, samosborActive: boolean, profile: NpcAiProfile): NpcUtilityIntentId {
  if (samosborActive && e.faction !== Faction.LIQUIDATOR && e.faction !== Faction.CULTIST && e.faction !== Faction.WILD) {
    return 'safety';
  }
  if (usesTravelerRoutine(e)) return 'wander';
  if (e.faction === Faction.LIQUIDATOR || occupationHasRoutineTag(e.occupation, 'patrol')) return 'patrol';
  if (profile === 'ministry' && (e.assignedRoomId !== undefined || occupationHasAnyRoutineTag(e.occupation, ['admin', 'paperwork']))) {
    return 'work';
  }
  return 'wander';
}

function stateForIntent(intent: NpcUtilityIntentId, e: Entity, profile: NpcAiProfile): NpcState {
  switch (intent) {
    case 'safety':
    case 'flee':
      return NpcState.HIDING;
    case 'work':
    case 'store':
      // Носить вещи на склад — та же работа: отдельного состояния не заводим,
      // иначе речь, анимации и диалоги обязаны узнать про новое слово.
      return NpcState.WORKING;
    case 'social':
      return profile === 'ministry' ? NpcState.MEETING : NpcState.FREE_TIME;
    case 'combat':
    case 'patrol':
    case 'faction_assault':
      return NpcState.PATROL;
    case 'wander':
      return usesTravelerRoutine(e) ? NpcState.TRAVELING : NpcState.FREE_TIME;
  }
}

function goalForIntent(intent: NpcUtilityIntentId): AIGoal {
  switch (intent) {
    case 'safety': return AIGoal.HIDE;
    case 'flee': return AIGoal.FLEE;
    case 'work':
    case 'store': return AIGoal.WORK;
    case 'combat': return AIGoal.HUNT;
    case 'faction_assault': return AIGoal.GOTO;
    case 'social':
    case 'patrol':
    case 'wander':
      return AIGoal.WANDER;
  }
}

function enterUtilityIntent(e: Entity, intent: NpcUtilityIntentId, score: number, profile: NpcAiProfile): void {
  const ai = e.ai!;
  const previousIntent = utilityIntentByNpc.get(e);
  const nextState = stateForIntent(intent, e, profile);
  const changed = previousIntent !== intent || ai.npcState !== nextState;

  utilityIntentByNpc.set(e, intent);
  utilityScoreByNpc.set(e, score);
  if (!changed) return;

  ai.npcState = nextState;
  ai.stateTimer = 0;
  if (ai.combatTargetId !== undefined) return;

  ai.goal = goalForIntent(intent);
  ai.path = [];
  ai.pi = 0;
  ai.stuck = 0;
  ai.timer = 0;
}

function clearUtilityState(e: Entity): void {
  utilityIntentByNpc.delete(e);
  utilityScoreByNpc.delete(e);
  utilityNextDecisionAtByNpc.delete(e);
}

export function primeNpcAlifeState(
  e: Entity,
  clock: GameClock,
  samosborActive: boolean,
  profile: NpcAiProfile = 'default',
): void {
  const ai = e.ai;
  if (!ai) return;
  const special = tickNpcSpecialRoutine(e, clock);
  if (special.clearUtility) clearUtilityState(e);
  if (special.held) return;
  if (utilityIntentByNpc.get(e) === undefined || ai.npcState === undefined) {
    const intent = initialIntentForNpc(e, samosborActive, profile);
    enterUtilityIntent(e, intent, 0, profile);
  }
}

/* ── NPC behavior: local utility selection with bounded execution ─ */
export function updateNPC(
  world: World,
  entities: Entity[],
  e: Entity,
  dt: number,
  time: number,
  clock: GameClock,
  samosborActive: boolean,
  profile: NpcAiProfile = 'default',
  state?: import('../../core/types').GameState,
): void {
  const ai = e.ai!;
  refreshRoomCrowd(world, entities);

  const special = tickNpcSpecialRoutine(e, clock);
  if (special.clearUtility) {
    ai.stateTimer = 0;
    clearUtilityState(e);
  }

  if (state) {
    processUrinationEvents(world, e, ai, state, _barkMsgs, time);
  }
  if (special.held) {
    return;
  }

  // Дорога на объявленную разборку идёт ВМЕСТО рутины: иначе человек бросит её
  // на первом же переборе намерений и на место так и не придёт.
  if (tickFeudDuelWalk(world, e, dt)) {
    return;
  }

  evaluateMicroStimuli(world, e, time, _barkMsgs);
  if (tickMicroGoal(world, e, dt, time, _barkMsgs)) {
    return;
  }

  if (utilityIntentByNpc.get(e) === undefined || ai.npcState === undefined) {
    enterUtilityIntent(e, initialIntentForNpc(e, samosborActive, profile), 0, profile);
  }

  const decision = selectAndEnterUtilityIntent(world, entities, e, clock, samosborActive, profile, state);
  const intent = decision.intent;

  ai.timer -= dt;
  ai.stateTimer = (ai.stateTimer ?? 0) + dt;

  if (!decision.rescored && canHoldRoutineFrame(e, intent)) {
    if (intent === 'work') tryCleanerSurfaceWork(world, e);
    tickNpcMemoryLowFrequency(e, time, clock.totalMinutes, samosborActive);
    tickNpcRumorLowFrequency(e, time, clock.totalMinutes, samosborActive);
    tryAmbientBark(e, dt, samosborActive);
    return;
  }


  switch (intent) {
    case 'safety':
    case 'flee':
      handleHiding(world, entities, e, dt, clock, profile);
      break;
    case 'work':
      handleWorking(world, e, dt, state);
      break;
    case 'social':
      handleSocial(world, e, dt);
      break;
    case 'combat':
    case 'patrol':
      handlePatrol(world, e, dt);
      break;
    case 'faction_assault':
      handleFactionAssault(world, e, dt, state);
      break;
    case 'store':
      handleStore(world, e, dt, state);
      break;
    case 'wander':
      handleWander(world, e, dt);
      break;
  }

  tickNpcMemoryLowFrequency(e, time, clock.totalMinutes, samosborActive);
  tickNpcRumorLowFrequency(e, time, clock.totalMinutes, samosborActive);
  tryAmbientBark(e, dt, samosborActive);
}

function selectAndEnterUtilityIntent(
  world: World,
  entities: readonly Entity[],
  e: Entity,
  clock: GameClock,
  samosborActive: boolean,
  profile: NpcAiProfile,
  state?: import('../../core/types').GameState,
): { intent: NpcUtilityIntentId; rescored: boolean } {
  const currentIntent = utilityIntentByNpc.get(e);
  const now = _barkTime;
  if (currentIntent !== undefined && (utilityNextDecisionAtByNpc.get(e) ?? -Infinity) > now) {
    return { intent: currentIntent, rescored: false };
  }

  const scores = scoreNpcUtilities({
    identity: npcUtilityIdentityFromEntity(e),
    minuteOfDay: clock.hour * 60 + clock.minute,
    totalMinutes: clock.totalMinutes,
    samosborActive,
    currentIntent,
    currentIntentStickiness: 5 + Math.min(7, (e.ai?.stateTimer ?? 0) * 0.18),
    needs: e.needs,
    hp: e.hp,
    maxHp: e.maxHp,
    threat: buildThreatSnapshot(world, entities, e),
    role: {
      faction: e.faction,
      occupation: e.occupation,
      armed: npcIsArmed(e),
      hasRangedWeapon: npcHasRangedWeapon(e),
      isTraveler: usesTravelerRoutine(e),
    },
    local: buildLocalUtilityScores(world, e, samosborActive, profile),
    factionGoals: state?.factionGoals,
  }, utilityScoreBuffer);
  const selected = selectNpcUtilityIntent(scores, currentIntent, {
    switchMargin: UTILITY_SWITCH_MARGIN,
    emergencyScore: UTILITY_EMERGENCY_SCORE,
  });
  // Начатый путь бросают только ради дела, которое уже не терпит: порог берётся
  // из терпения самого намерения, а не из списка «что считается срочным».
  if (
    currentIntent !== undefined &&
    hasActivePath(e) &&
    !(selected.switched && selected.emergency)
  ) {
    utilityNextDecisionAtByNpc.set(e, now + utilityRethinkInterval(e));
    return { intent: currentIntent, rescored: true };
  }
  enterUtilityIntent(e, selected.intent, selected.score, profile);
  utilityNextDecisionAtByNpc.set(e, now + utilityRethinkInterval(e));
  return { intent: selected.intent, rescored: true };
}

export function processUrinationEvents(world: World, e: Entity, ai: import('../../core/types').AIState, state: import('../../core/types').GameState, msgs: import('../../core/types').Msg[], time: number): void {
  const sinceId = ai.lastSeenUrinationId ?? 0;
  const events = getRecentEvents(state, { type: 'player_urinated', sinceId, limit: 1 });
  if (events.length > 0) {
    const event = events[0];
    if (event.id > sinceId) {
      ai.lastSeenUrinationId = event.id;
      if (event.x !== undefined && event.y !== undefined) {
        const dist2 = world.dist2(e.x, e.y, event.x, event.y);
        if (dist2 <= 64 && e.faction !== Faction.WILD) {
          const isBathroom = event.roomId !== undefined && world.rooms[event.roomId]?.type === RoomType.BATHROOM;
          if (!isBathroom) {
            e.playerRelation = (e.playerRelation ?? 0) - 15;
            if (e.playerRelation <= -30 && event.actorId !== undefined) {
              ai.goal = AIGoal.HUNT;
              ai.combatTargetId = event.actorId;
              emitMarkovBark(e, msgs, time, 'combat', 'Извращенец!', 1.0, '#fa8');
            }
          }
        }
      }
    }
  } else if (state.worldEvents) {
    ai.lastSeenUrinationId = Math.max(sinceId, state.worldEvents.nextId - 1);
  }
}

function buildLocalUtilityScores(
  world: World,
  e: Entity,
  samosborActive: boolean,
  profile: NpcAiProfile,
): Partial<Record<NpcUtilityIntentId, number>> {
  const local: Partial<Record<NpcUtilityIntentId, number>> = {};
  const room = world.roomAt(e.x, e.y);
  // Опрос «где я сейчас» идёт на такте переоценки: этого хватает на новизну и
  // не стоит ни одного лишнего обращения к карте комнат.
  noteRoomVisit(e, room?.id);
  const cellOwner = territoryOwnerAtIndex(world, world.idx(Math.floor(e.x), Math.floor(e.y)));
  if (cellOwner === ZoneFaction.SAMOSBOR) {
    addLocalScore(local, 'safety', e.faction === Faction.CULTIST ? -5 : 14);
    addLocalScore(local, 'wander', -10);
    addLocalScore(local, 'work', -8);
    addLocalScore(local, 'social', -6);
  } else if (territoryFriendlyForNpc(e, cellOwner)) {
    addLocalScore(local, 'work', 4);
    addLocalScore(local, 'social', 4);
    addLocalScore(local, 'wander', usesTravelerRoutine(e) ? 0 : 5);
    addLocalScore(local, 'patrol', 5);
  } else if (e.faction !== undefined) {
    addLocalScore(local, 'work', -5);
    addLocalScore(local, 'social', -4);
    addLocalScore(local, 'wander', usesTravelerRoutine(e) ? 4 : -6);
    addLocalScore(local, 'patrol', 7);
  }
  if (room) {
    for (const intent of NPC_UTILITY_INTENTS) {
      const weight = npcUtilityRoomTypeWeightForIntent(intent, room.type, e.occupation);
      if (weight > 0) addLocalScore(local, intent, Math.min(10, weight * 0.18));
    }
    if (room.id === e.assignedRoomId) {
      addLocalScore(local, 'work', profile === 'ministry' ? 14 : 9);
      addLocalScore(local, 'safety', 4);
    }
    if (profile === 'ministry' && (room.type === RoomType.COMMON || room.type === RoomType.HQ)) {
      addLocalScore(local, 'social', 5);
    }
  }

  if (usesTravelerRoutine(e)) {
    addLocalScore(local, 'wander', 12);
    addLocalScore(local, 'work', -8);
  }
  const storeDrive = npcStoreDrive(e, roomSuitsIntent(e, room, 'store'));
  if (storeDrive > 0) addLocalScore(local, 'store', storeDrive);
  if (e.faction === Faction.LIQUIDATOR || occupationHasRoutineTag(e.occupation, 'patrol')) addLocalScore(local, 'patrol', 10);
  if (e.faction === Faction.WILD) addLocalScore(local, 'wander', 6);
  if (samosborActive) {
    if (e.faction === Faction.LIQUIDATOR) {
      addLocalScore(local, 'patrol', 12);
      addLocalScore(local, 'safety', -8);
    } else if (e.faction === Faction.CULTIST) {
      addLocalScore(local, 'social', 8);
      addLocalScore(local, 'safety', -5);
    } else {
      addLocalScore(local, 'safety', 16);
    }
  }
  return local;
}

function addLocalScore(local: Partial<Record<NpcUtilityIntentId, number>>, intent: NpcUtilityIntentId, amount: number): void {
  local[intent] = (local[intent] ?? 0) + amount;
}

function buildThreatSnapshot(world: World, entities: readonly Entity[], e: Entity): NpcUtilityThreatSnapshot {
  utilityLocalActors.length = 0;
  ensureEntityIndex(entities).queryRadiusCapped(e.x, e.y, UTILITY_THREAT_RADIUS, utilityLocalActors, ENTITY_MASK_ACTOR, UTILITY_THREAT_CAP);
  let visibleHostiles = 0;
  let hostilePower = 0;
  let allyPower = actorPower(e) * 0.35;
  let monsterPressure = 0;
  let nearest = Infinity;

  for (const other of utilityLocalActors) {
    if (other.id === e.id || !other.alive) continue;
    const d = Math.sqrt(world.dist2(e.x, e.y, other.x, other.y));
    if (isHostile(e, other)) {
      visibleHostiles++;
      hostilePower += actorPower(other);
      if (other.type === EntityType.MONSTER) monsterPressure = Math.max(monsterPressure, 1);
      if (d < nearest) nearest = d;
    } else if (other.faction !== undefined && other.faction === e.faction) {
      allyPower += actorPower(other) * 0.25;
    }
  }

  const close = Number.isFinite(nearest) ? clamp01((UTILITY_THREAT_RADIUS - nearest) / UTILITY_THREAT_RADIUS) : 0;
  const danger = clamp01(visibleHostiles * 0.18 + close * 0.42 + monsterPressure * 0.32);
  return {
    danger,
    visibleHostiles,
    hostilePower,
    allyPower,
    distance: Number.isFinite(nearest) ? nearest : undefined,
    monster: monsterPressure,
    strongerHostile: hostilePower > allyPower + 0.15,
  };
}

function actorPower(e: Entity): number {
  const ws = WEAPON_STATS[e.weapon ?? ''] ?? WEAPON_STATS[''];
  const weapon = ws ? (ws.isRanged ? ws.dmg * (ws.pellets ?? 1) * 1.6 : ws.dmg) : 0;
  const hp = Math.max(0, e.hp ?? 20) * 0.22;
  const level = Math.max(1, e.rpg?.level ?? 1) * 3;
  return hp + weapon + level;
}

function npcIsArmed(e: Entity): boolean {
  const ws = WEAPON_STATS[e.weapon ?? ''];
  return !!ws && (ws.dmg > 3 || ws.isRanged);
}

function npcHasRangedWeapon(e: Entity): boolean {
  return WEAPON_STATS[e.weapon ?? '']?.isRanged === true;
}


function tryAmbientBark(e: Entity, dt: number, samosborActive: boolean): void {
  const ai = e.ai!;
  ai.ambientBarkCd = Math.max(0, (ai.ambientBarkCd ?? (10 + rng() * 12)) - dt);
  if (ai.ambientBarkCd > 0) return;

  ai.ambientBarkCd = 18 + rng() * 28;
  if (samosborActive) return;
  if (ai.npcState === NpcState.SLEEPING || ai.npcState === NpcState.HIDING) return;
  if (ai.goal === AIGoal.FLEE || ai.goal === AIGoal.HIDE || ai.goal === AIGoal.HUNT) return;

  emitMarkovBark(e, _barkMsgs, _barkTime, 'ambient', '...', BARK_CHANCE_GENERIC, '#9ba');
}

/* ── Intent handlers ─────────────────────────────────────────── */

/** Годится ли комната, в которой человек уже стоит, под его намерение. */
function roomSuitsIntent(e: Entity, room: Room | null | undefined, intent: NpcUtilityIntentId): boolean {
  return !!room && npcUtilityRoomTypeWeightForIntent(intent, room.type, e.occupation) > 0;
}








function handleWorking(world: World, e: Entity, dt: number, state?: import('../../core/types').GameState): void {
  const ai = e.ai!;
  tryCleanerSurfaceWork(world, e);

  // Сперва то, что под рукой: сложить сделанное в ящик, взять со склада то, чего
  // ждут в комнатах, отдать привезённое. Это часть смены, а не отдельное дело,
  // поэтому ради ящика никто не бросает работу и не тащит выход через этаж.
  let outcome: NpcStorageOutcome = 'nothing';
  if (ai.path.length === 0 && (storeNextActionAtByNpc.get(e) ?? -Infinity) <= _barkTime) {
    storeNextActionAtByNpc.set(e, _barkTime + stableTimer(e, 'store_action', STORE_ACTION_BASE_SEC, STORE_ACTION_SPREAD_SEC));
    if (scanSpareInventory(e).first >= 0 || npcIsSupplyCarrier(e) || ownRoomIsShort(world, e)) {
      outcome = tickNpcStorageWork(world, e, state);
    }
  }
  if (outcome === 'busy') {
    ai.goal = AIGoal.WORK;
    wanderInRoom(world, e);
    ai.timer = stableTimer(e, 'work_in_room', 3, 4);
    followPath(world, e, dt);
    return;
  }
  // Здесь закончено — решать, куда дальше, надо сейчас, а не по таймеру.
  if (outcome === 'done') ai.timer = 0;

  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    ai.goal = AIGoal.WORK;
    // Куда кладовщику ехать за грузом, с грузом или с разносом — это его смена.
    // Рейс — наряд, а не предпочтение: иначе кладовщик каждый раз выбирал бы
    // свой же склад, где ему по ремеслу интереснее, и за грузом не поехал.
    // Считается он только здесь, в момент выбора цели: это перебор всех ящиков
    // этажа, и на каждом кадре каждого работника он стоил четверть кадра.
    const errandRoomId = supplyErrandRoomId(world, e);
    const errandRoom = errandRoomId !== undefined ? world.rooms[errandRoomId] : undefined;
    const routed = errandRoom
      ? tryAssignPathToRoomCenter(world, e, errandRoom) !== 'not_found'
      : tryGotoAssignedWorkRoom(world, e) || gotoRoutineRoom(world, e, 'work');
    if (!routed) wanderNearby(world, e);
    ai.timer = ai.path.length > 0 ? stableTimer(e, 'work_rethink', 14, 18) : 2.0;
  }

  if (ai.goal === AIGoal.WORK && ai.path.length === 0) {
    const cr = world.roomAt(e.x, e.y);
    if (cr && (cr.id === e.assignedRoomId || npcUtilityRoomTypeWeightForIntent('work', cr.type, e.occupation) > 0)) {
      wanderInRoom(world, e);
      ai.timer = stableTimer(e, 'work_in_room', 7, 13);
    }
  }

  followPath(world, e, dt);
}

/**
 * Рейс кладовщика: с грузом — на склад, где есть место, порожняком — туда, где
 * товар уже лежит и ждёт вывоза. Обычному человеку рейса нет.
 */
function supplyErrandRoomId(world: World, e: Entity): number | undefined {
  const carrier = npcIsSupplyCarrier(e);
  // Груз с адресом разносится раньше вывоза со склада.
  const cargo = deliveryCargoSlot(world, e);
  if (cargo) return cargo.roomId;
  const bestRank = roomAffordanceWeight(RoomType.STORAGE, 'store');
  if (!carrier) {
    // Порожняком обычный человек идёт на склад, только когда в его комнате пусто.
    if (!ownRoomIsShort(world, e)) return undefined;
    return nearestContainer(world, e.x, e.y, SUPPLY_ERRAND_RADIUS, container => {
      const room = world.rooms[container.roomId];
      if (!room || storeRank(room) < bestRank || !canAccessContainer(container, e)) return false;
      return container.inventory.some(slot => slot.count > 0 && suppliesOwnRoom(world, e, slot.defId));
    })?.roomId;
  }
  const loaded = scanSpareInventory(e).first >= 0;
  return nearestContainer(world, e.x, e.y, SUPPLY_ERRAND_RADIUS, container => {
    const room = world.rooms[container.roomId];
    const rank = storeRank(room);
    if (!room || rank <= 0) return false;
    if (loaded ? rank < bestRank : rank >= bestRank) return false;
    if (!loaded && !container.inventory.some(slot => slot.count > 0)) return false;
    return canAccessContainer(container, e);
  })?.roomId;
}

function cleanerCanCleanCell(world: World, e: Entity, idx: number): boolean {
  if (territoryFriendlyForNpc(e, territoryOwnerAtIndex(world, idx))) return true;
  const roomId = world.roomMap[idx];
  if (roomId < 0) return false;
  if (roomId === e.assignedRoomId) return true;
  const room = world.rooms[roomId];
  return !!room && e.familyId !== undefined && e.familyId >= 0 && room.apartmentId === e.familyId;
}

function tryCleanerSurfaceWork(world: World, e: Entity): void {
  if (e.occupation !== Occupation.CLEANER && !occupationHasRoutineTag(e.occupation, 'cleaning')) return;
  const now = _barkTime;
  if ((cleanerNextSurfaceAtByNpc.get(e) ?? -Infinity) > now) return;
  cleanerNextSurfaceAtByNpc.set(e, now + stableTimer(e, 'cleaner_surface', CLEANER_SURFACE_RETRY_BASE_SEC, CLEANER_SURFACE_RETRY_SPREAD_SEC));
  const cleaned = cleanSurfaceArea(world, e.x, e.y, CLEANER_SURFACE_RADIUS, {
    shouldCleanCell: idx => cleanerCanCleanCell(world, e, idx),
  });
  if (cleaned <= 0 || !e.ai) return;
  e.ai.goal = AIGoal.WORK;
  e.ai.timer = Math.max(e.ai.timer, 0.4);
}

/* ── Склад: отнести лишнее, взять патроны ─────────────────────────
 *
 * Деятельность `store` у комнаты (`ROOM_AFFORDANCES`) до сих пор ни к чему не
 * вела: склад был достижим только по ремеслу. Теперь у него есть намерение, и
 * оно не выдумывает себе тяги — её поднимает то, что человек несёт лишнее или
 * ему нечем стрелять. Пустой карман, полный магазин — и склад проигрывает
 * прогулке.
 */

/** Патроны, которые человеку нужны под его же оружие. */
function npcAmmoTypeFor(e: Entity): string | undefined {
  return WEAPON_STATS[e.weapon ?? '']?.ammoType;
}

/** Роль вещи в карманах: своя, личный запас или хабар. */
type NpcItemRole = 'own' | 'reserve' | 'spare';

function itemRoleForNpc(e: Entity, defId: string): NpcItemRole {
  if (defId === e.weapon || defId === e.tool) return 'own';
  const def = ITEMS[defId];
  if (!def) return 'own';
  if (def.value <= 0) return 'own';
  if (def.tags?.some(tag => tag === 'quest' || tag === 'persistent' || tag === 'cannot_drop')) return 'own';
  switch (def.type) {
    case ItemType.KEY:
    case ItemType.NOTE:
      return 'own';
    case ItemType.AMMO:
      return defId === npcAmmoTypeFor(e) ? 'own' : 'spare';
    case ItemType.FOOD:
    case ItemType.DRINK:
    case ItemType.MEDICINE:
      // Одну еду человек носит при себе, остальное — излишек: иначе пекарь
      // остался бы стоять со всей сменой хлеба в карманах. Кладовщика это
      // правило не обходит намеренно: пусть подворовывает из груза, отдельного
      // случая для него дешевле не заводить, чем описывать честность.
      return 'reserve';
    default:
      return 'spare';
  }
}

/**
 * Первый лишний слот и общее их число. Личный запас каждого вида оставляется
 * один раз, всё сверх него — излишек и едет на склад вместе с хабаром.
 */
function scanSpareInventory(e: Entity): { first: number; count: number } {
  const inv = e.inventory;
  let first = -1;
  let count = 0;
  if (!inv) return { first, count };
  let keptFood = false;
  let keptDrink = false;
  let keptMedicine = false;
  for (let i = 0; i < inv.length; i++) {
    const defId = inv[i].defId;
    let role = itemRoleForNpc(e, defId);
    if (role === 'reserve') {
      const type = ITEMS[defId]?.type;
      const kept = type === ItemType.FOOD ? keptFood : type === ItemType.DRINK ? keptDrink : keptMedicine;
      if (!kept) {
        if (type === ItemType.FOOD) keptFood = true;
        else if (type === ItemType.DRINK) keptDrink = true;
        else keptMedicine = true;
        role = 'own';
      } else {
        role = 'spare';
      }
    }
    if (role !== 'spare') continue;
    if (first < 0) first = i;
    count++;
    if (count >= STORE_SPARE_CAP) break;
  }
  return { first, count };
}

function npcNeedsAmmo(e: Entity): boolean {
  const ammo = npcAmmoTypeFor(e);
  if (!ammo || !npcHasRangedWeapon(e)) return false;
  return !e.inventory?.some(slot => slot.defId === ammo && slot.count > 0);
}

/** Готовность лезть в чужой запас. Не занятие и не фракция — черта человека. */
function npcRaidsForeignContainers(e: Entity): boolean {
  return stableUnit(e, 'store_raid') > 0.75;
}

/* ── Свой рейс у каждого ремесла ──────────────────────────────────
 *
 * Кладовщик возит по всему этажу и всегда. Остальные ходят за припасом только
 * для СВОЕЙ рабочей комнаты и только когда в ней пусто: повар за едой, врач за
 * лекарствами. Так кухня не зависит от одного человека, но и не соревнуется с
 * ним за каждый ящик.
 *
 * Что комнате положено держать, известно из той же таблицы ресурсов
 * (`ResourceDef.roomTypes`), по которой живёт экономика: еда и вода — кухне,
 * медицина — медпункту. Отдельного списка не заводим.
 */
const ROOM_STOCK_RESOURCES: readonly (readonly string[])[] = NPC_UTILITY_ROOM_TYPES
  .reduce<string[][]>((table: string[][], type: RoomType) => {
    table[type] = roomAffordanceWeight(type, 'store') > 0
      ? []
      : RESOURCES.filter(resource => resource.roomTypes.includes(type)).map(resource => resource.id);
    return table;
  }, []);

function roomStockResourceIds(type: RoomType): readonly string[] {
  return ROOM_STOCK_RESOURCES[type] ?? [];
}

/** Рабочая комната человека, если она сама что-то держит: кухня, медпункт. */
function ownStockRoom(world: World, e: Entity): Room | undefined {
  const room = e.assignedRoomId !== undefined && e.assignedRoomId >= 0 ? world.rooms[e.assignedRoomId] : undefined;
  if (!room || roomStockResourceIds(room.type).length === 0) return undefined;
  return npcUtilityRoomTypeWeightForIntent('work', room.type, e.occupation) > 0 ? room : undefined;
}

/** Несёт ли человек это для своей комнаты. */
function suppliesOwnRoom(world: World, e: Entity, defId: string): boolean {
  const room = ownStockRoom(world, e);
  if (!room) return false;
  const resource = resourceForItem(defId)?.id;
  return resource !== undefined && roomStockResourceIds(room.type).includes(resource);
}

/** Пусто ли в своей комнате по тому, что ей положено держать. */
function ownRoomIsShort(world: World, e: Entity): boolean {
  const room = ownStockRoom(world, e);
  if (!room) return false;
  const need = roomStockResourceIds(room.type);
  for (const container of containersInRoom(world, room.id)) {
    if (!canAccessContainer(container, e)) continue;
    for (const slot of container.inventory) {
      if (slot.count > 0 && need.includes(resourceForItem(slot.defId)?.id ?? '')) return false;
    }
  }
  return true;
}

/** Кладовщик: его дело — возить товар оттуда, где он появился, туда, где хранят. */
function npcIsSupplyCarrier(e: Entity): boolean {
  return e.occupation === Occupation.STOREKEEPER || occupationHasRoutineTag(e.occupation, 'supply');
}

/** Насколько комната годится КАК ХРАНИЛИЩЕ: у склада полный вес, у цеха малый. */
function storeRank(room: Room | null | undefined): number {
  return room ? roomAffordanceWeight(room.type, 'store') : 0;
}

/** Годится ли вещь в сырьё этому цеховому ящику. Своё сырьё цех не отдаёт. */
function containerUsesAsInput(container: import('../../core/types').WorldContainer, defId: string): boolean {
  if (!container.factoryId) return false;
  const resource = resourceForItem(defId)?.id;
  if (!resource) return false;
  const factory = FACTORIES.find(f => f.id === container.factoryId);
  if (!factory) return false;
  // Вещь, которую цех сам же и выпускает, сырьём ему не считается — иначе
  // кладовщик возил бы туда его собственную продукцию.
  const produced = factory.recipes.some(recipe =>
    recipe.outputs.some(out => out.defId === defId)
    || recipe.badBatch?.outputs.some(out => out.defId === defId) === true);
  if (produced) return false;
  return factory.recipes.some(recipe => recipe.inputs.some(input => input.id === resource));
}

/** Ждёт ли ящик подвоза: цех встал без входа, и вещь ему годится. */
function containerAwaitsInput(container: import('../../core/types').WorldContainer, defId: string): boolean {
  return container.productionBlockedReason === 'no_inputs' && containerUsesAsInput(container, defId);
}

/**
 * Куда вещь просится по своей природе: где она водится, но не хранится.
 *
 * Источник тот же, по которому вещь ложится при генерации, — `spawnRooms`.
 * Отдельной таблицы «что куда разносить» не заводим: хлеб и так объявлен
 * кухонным, бинт медпунктовым, а у патронов комнат нет вовсе, поэтому свой
 * боезапас кладовщик разносить не побежит.
 */
function deliveryRoomTypesFor(defId: string): readonly RoomType[] {
  // Адрес вещи — там, где она водится по генерации, И там, где её ресурсу
  // положено лежать по экономике. Второе нужно, чтобы товар доезжал до лавок
  // и баров без правки `spawnRooms` у четырёх сотен предметов.
  const spawn = ITEMS[defId]?.spawnRooms ?? [];
  const stocked = resourceForItem(defId)?.roomTypes ?? [];
  const out: RoomType[] = [];
  for (const type of spawn) {
    if (roomAffordanceWeight(type, 'store') === 0) out.push(type);
  }
  for (const type of stocked) {
    if (roomAffordanceWeight(type, 'store') === 0 && !out.includes(type)) out.push(type);
  }
  return out;
}

/** Ближайшая комната, куда эту вещь можно донести и где её примут. */
function deliveryRoomFor(world: World, e: Entity, defId: string, count: number): number | undefined {
  const types = deliveryRoomTypesFor(defId);
  return nearestContainer(world, e.x, e.y, SUPPLY_ERRAND_RADIUS, container => {
    const room = world.rooms[container.roomId];
    // Либо вещи здесь место по природе, либо встал цех и ждёт именно её.
    if (!room || !(types.includes(room.type) || containerAwaitsInput(container, defId))) return false;
    if (!canAccessContainer(container, e)) return false;
    return itemAddCapacity(container, defId, count, undefined) > 0;
  })?.roomId;
}

/**
 * Что из лишнего можно сдать здесь. У кладовщика груз под разнос из этого
 * списка исключён: иначе, заходя на склад, он сдавал бы туда же то, что несёт
 * на кухню, и хлеб ездил бы по кругу.
 */
function depositableSlot(world: World, e: Entity, carrier: boolean): number {
  const inv = e.inventory;
  if (!inv) return -1;
  const spare = scanSpareInventory(e);
  if (spare.first < 0) return spare.first;
  for (let i = spare.first; i < inv.length; i++) {
    const defId = inv[i].defId;
    if (itemRoleForNpc(e, defId) === 'own') continue;
    // Кладовщик бережёт любой груз с адресом, остальные — только припас своей
    // комнаты: иначе хабар в карманах перестал бы сдаваться на склад вовсе.
    if (carrier ? deliveryRoomFor(world, e, defId, inv[i].count) !== undefined : suppliesOwnRoom(world, e, defId)) continue;
    return i;
  }
  return -1;
}

/** Груз, который человек несёт не себе: первый слот, которому место в другой комнате. */
function deliveryCargoSlot(world: World, e: Entity): { slot: number; roomId: number } | undefined {
  const inv = e.inventory;
  if (!inv) return undefined;
  const carrier = npcIsSupplyCarrier(e);
  const ownRoom = carrier ? undefined : ownStockRoom(world, e);
  for (let i = 0; i < inv.length; i++) {
    const defId = inv[i].defId;
    if (itemRoleForNpc(e, defId) === 'own') continue;
    if (!carrier) {
      // Обычный человек несёт только припас своей комнаты и только в неё.
      if (!ownRoom || !suppliesOwnRoom(world, e, defId)) continue;
      return { slot: i, roomId: ownRoom.id };
    }
    const roomId = deliveryRoomFor(world, e, defId, inv[i].count);
    if (roomId !== undefined) return { slot: i, roomId };
  }
  return undefined;
}

/**
 * Насколько человеку сейчас нужен склад. Привычка носить вещи своя у каждого:
 * иначе весь этаж снимался бы к складам одновременно. Тому, кто уже стоит на
 * складе, хватает и одной лишней вещи — раз пришёл, доделай.
 */
function npcStoreDrive(e: Entity, atStorage: boolean): number {
  // Пустые карманы дела не отменяют: за патронами идут именно с пустыми.
  const spare = scanSpareInventory(e).count;
  const carry = spare >= (atStorage ? 1 : STORE_SPARE_MIN) ? 12 + spare * 10 : 0;
  // Вооружённому без патронов склад нужнее любого хабара: это дело одного
  // захода и возникает оно ровно после того, как человек отстрелялся.
  const restock = npcNeedsAmmo(e) ? 40 : 0;
  if (carry + restock <= 0) return 0;
  // Возка кладовщику не привычка, а ремесло: множитель привычки к ней не идёт.
  if (npcIsSupplyCarrier(e)) return carry + restock;
  return (carry + restock) * (0.4 + 0.6 * stableUnit(e, 'store_habit'));
}

function findNpcStorageContainer(
  world: World,
  e: Entity,
  room: Room,
  state?: import('../../core/types').GameState,
): import('../../core/types').WorldContainer | undefined {
  let foreign: import('../../core/types').WorldContainer | undefined;
  const raids = npcRaidsForeignContainers(e);
  for (const container of containersInRoom(world, room.id)) {
    if (canAccessContainer(container, e)) return container;
    if (raids && foreign === undefined && containerAccessInfo(container, e, state).canTake) foreign = container;
  }
  return foreign;
}

/**
 * Что человек делает на складе прямо сейчас.
 *
 * `busy` — сделка прошла, есть смысл остаться; `done` — дело закрыто;
 * `nothing` — здесь заняться нечем, надо идти в другую комнату. Различие важно:
 * работник цеха обязан сперва попробовать местный ящик и только потом нести
 * смену через этаж.
 */
type NpcStorageOutcome = 'busy' | 'done' | 'nothing';

function tickNpcStorageWork(world: World, e: Entity, state?: import('../../core/types').GameState): NpcStorageOutcome {
  const room = world.roomAt(e.x, e.y);
  const rank = storeRank(room);
  const carrier = npcIsSupplyCarrier(e);
  // Разнос идёт раньше вывоза и не смотрит на ранг комнаты: кухне сдают хлеб,
  // вставшему цеху — сырьё, а не ставят их на складской учёт.
  if (room) {
    const cargo = deliveryCargoSlot(world, e);
    if (cargo && cargo.roomId === room.id) {
      const target = findNpcStorageContainer(world, e, room, state);
      const slot = e.inventory?.[cargo.slot];
      if (!target || !slot) return 'nothing';
      return putIntoContainer(target, e, cargo.slot, slot.count, state) ? 'busy' : 'done';
    }
    if (rank <= 0) return 'nothing';
  }
  if (!room || rank <= 0) return 'nothing';
  const container = findNpcStorageContainer(world, e, room, state);
  if (!container) return 'nothing';
  const bestRank = roomAffordanceWeight(RoomType.STORAGE, 'store');

  // Кладовщик в цеху не складывает, а забирает: это место, откуда возят.
  if (carrier && rank < bestRank) {
    const load = container.inventory.findIndex(slot => slot.count > 0 && !containerUsesAsInput(container, slot.defId));
    if (load < 0) return 'nothing';
    return takeFromContainer(container, e, load, container.inventory[load].count, state) ? 'busy' : 'nothing';
  }

  const spare = scanSpareInventory(e);
  // Порожняком на складе кладовщик берёт то, чего ждут в других комнатах, и
  // сразу уходит: иначе следующей же сделкой положил бы взятое назад.
  const fetchesForOwnRoom = !carrier && ownRoomIsShort(world, e);
  if ((carrier || fetchesForOwnRoom) && depositableSlot(world, e, carrier) < 0 && rank >= bestRank) {
    for (let i = 0; i < container.inventory.length; i++) {
      const item = container.inventory[i];
      if (item.count <= 0) continue;
      // Кладовщик берёт что угодно, чему есть куда ехать; остальные — только
      // припас своей комнаты. Проверяется КОМНАТА, а не тип: вещь, которой
      // «место на кухне», нельзя брать там, где кухни нет, иначе она поедет со
      // склада и вернётся на склад, и так без конца.
      const wanted = carrier
        ? deliveryRoomFor(world, e, item.defId, item.count) !== undefined
        : suppliesOwnRoom(world, e, item.defId);
      if (!wanted) continue;
      if (takeFromContainer(container, e, i, item.count, state)) return 'done';
    }
  }

  const dropSlot = depositableSlot(world, e, carrier);
  if (dropSlot >= 0) {
    const slot = e.inventory?.[dropSlot];
    if (slot && putIntoContainer(container, e, dropSlot, slot.count, state)) {
      return depositableSlot(world, e, carrier) < 0 && !npcNeedsAmmo(e) ? 'done' : 'busy';
    }
    // Ящик не принял — вещь поедет туда, где место есть.
    if (!npcNeedsAmmo(e)) return 'nothing';
  }
  // Кладовщику с грузом под разнос на складе делать больше нечего: пора везти.
  if (carrier && spare.first >= 0 && dropSlot < 0) return 'done';

  if (npcNeedsAmmo(e)) {
    const ammo = npcAmmoTypeFor(e);
    const ammoSlot = container.inventory.findIndex(slot => slot.defId === ammo && slot.count > 0);
    if (ammoSlot < 0) return spare.first >= 0 ? 'nothing' : 'done';
    if (takeFromContainer(container, e, ammoSlot, container.inventory[ammoSlot].count, state)) {
      npcAutoEquipBestWeapon(e);
      return 'busy';
    }
  }
  return 'done';
}

function handleStore(world: World, e: Entity, dt: number, state?: import('../../core/types').GameState): void {
  const ai = e.ai!;

  // Сперва — здесь: работник цеха кладёт смену в свой ящик, если место есть, и
  // только потом несёт её через этаж.
  let outcome: NpcStorageOutcome = 'nothing';
  if (ai.path.length === 0 && (storeNextActionAtByNpc.get(e) ?? -Infinity) <= _barkTime) {
    storeNextActionAtByNpc.set(e, _barkTime + stableTimer(e, 'store_action', STORE_ACTION_BASE_SEC, STORE_ACTION_SPREAD_SEC));
    outcome = tickNpcStorageWork(world, e, state);
    if (outcome === 'done') {
      ai.goal = AIGoal.IDLE;
      ai.timer = 0.5;
    } else if (outcome === 'busy') {
      wanderInRoom(world, e);
      ai.timer = stableTimer(e, 'store_in_room', 3, 4);
    }
  }

  if (outcome === 'nothing' && (ai.timer <= 0 || ai.goal === AIGoal.IDLE)) {
    ai.goal = AIGoal.WORK;
    if (!gotoRoutineRoom(world, e, 'store', { allowTrespassFallback: npcRaidsForeignContainers(e) })) {
      wanderNearby(world, e);
    }
    ai.timer = ai.path.length > 0 ? stableTimer(e, 'store_rethink', 9, 10) : 2.0;
  }

  followPath(world, e, dt);
}


function handleSocial(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    ai.goal = AIGoal.WANDER;
    if (!gotoRoutineRoom(world, e, 'social')) wanderNearby(world, e);
    ai.timer = ai.path.length > 0 ? stableTimer(e, 'social_rethink', 8, 12) : 2.0;
  }
  if (ai.path.length === 0) {
    const cr = world.roomAt(e.x, e.y);
    if (roomSuitsIntent(e, cr, 'social')) {
      wanderInRoom(world, e);
      ai.timer = stableTimer(e, 'social_in_room', 6, 10);
    }
  }
  followPath(world, e, dt);
}

function handleFactionAssault(world: World, e: Entity, dt: number, state?: import('../../core/types').GameState): void {
  const ai = e.ai!;

  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    ai.goal = AIGoal.GOTO;
    ai.timer = 5;

    if (state?.factionGoals) {
      for (const goal of state.factionGoals) {
        if (goal.type === 'attack' && goal.members.includes(e.id)) {
          const zone = world.zones[goal.targetZone];
          if (zone) {
            tryAssignPathToCell(world, e, zone.cx, zone.cy);
          }
          break;
        }
      }
    }
  }

  followPath(world, e, dt);
}

function handlePatrol(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    ai.goal = AIGoal.WANDER;
    patrolCorridor(world, e);
    ai.timer = ai.path.length > 0 ? stableTimer(e, 'patrol_rethink', 9, 14) : 2.0;
  }
  followPath(world, e, dt);
}

function handleWander(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  if (ai.timer <= 0 || ai.goal === AIGoal.IDLE) {
    ai.goal = AIGoal.WANDER;
    if (usesTravelerRoutine(e)) {
      wanderFar(world, e);
      ai.timer = ai.path.length > 0 ? stableTimer(e, 'traveler_rethink', 10, 20) : 2.0;
    } else {
      const roll = stableUnit(e, `wander:${Math.floor((ai.stateTimer ?? 0) / 15)}`);
      const routed = roll < 0.68 && gotoRoutineRoom(world, e, 'wander');
      if (!routed) {
        wanderNearby(world, e);
      }
      ai.timer = ai.path.length > 0 ? stableTimer(e, 'wander_rethink', 7, 12) : 2.0;
    }
  }
  followPath(world, e, dt);
}

/**
 * Назначенная комната — это НОМЕР, а не тип. Раньше номер уходил в
 * `gotoRoom(world, e, type)`, где он читался как `RoomType`: путь почти никогда
 * не находился, а фолбэк не срабатывал, потому что ветка уже была взята, — и
 * человек вставал намертво, перезапрашивая раз в такт. Теперь номер идёт по
 * своему пути, а фолбэк — по неудаче, а не по отсутствию назначения.
 */
function gotoAssignedOrNearest(world: World, e: Entity, fallbackType: RoomType): void {
  const assigned = e.assignedRoomId !== undefined && e.assignedRoomId >= 0
    ? world.rooms[e.assignedRoomId]
    : undefined;
  if (assigned && tryAssignPathToRoomCenter(world, e, assigned) !== 'not_found') return;
  if (!gotoNearestRoomType(world, e, fallbackType)) {
    wanderNearby(world, e);
  }
}

function tryGotoAssignedWorkRoom(world: World, e: Entity): boolean {
  if (e.assignedRoomId === undefined || e.assignedRoomId < 0) return false;
  const room = world.rooms[e.assignedRoomId];
  if (!room) return false;
  if (npcUtilityRoomTypeWeightForIntent('work', room.type, e.occupation) <= 0) return false;
  if (!territoryFriendlyForNpc(e, territoryRoomOwner(world, room.id)) && !isRoutineTrespassRelaxed(e)) return false;
  return tryAssignPathToRoomCenter(world, e, room) !== 'not_found';
}

interface RoutineRoomOptions {
  preferredRoomId?: number;
  allowTrespassFallback?: boolean;
}

/**
 * Куда пойти под это намерение. Списка «кому куда можно» здесь нет: кандидат —
 * любая комната этажа, а годность и вес даёт контекстная сумма интереса
 * (`npcUtilityRoomInterest`). Комната отсеивается не типом, а тем, что ей нечем
 * этого человека сейчас заинтересовать.
 */
function gotoRoutineRoom(
  world: World,
  e: Entity,
  intent: NpcUtilityIntentId,
  options: RoutineRoomOptions = {},
): boolean {
  routineFriendlyRoomCandidates.length = 0;
  routineFallbackRoomCandidates.length = 0;
  routineSeenRoomIds.clear();
  const context = routineRoomPreferenceContext(e, intent);
  const allowFallback = options.allowTrespassFallback === true ||
    routineIntentAllowsSurvivalTrespass(intent) ||
    isRoutineTrespassRelaxed(e);
  const considerRoom = (room: Room | undefined): void => {
    if (!room || routineSeenRoomIds.has(room.id)) return;
    routineSeenRoomIds.add(room.id);
    const anchored = room.id === options.preferredRoomId || room.id === e.assignedRoomId;
    const memory = routineRoomMemorySnapshot(room.id);
    if (!anchored && npcUtilityRoomInterest(room.type, context, memory) <= 0) return;
    const friendly = territoryFriendlyForNpc(e, territoryRoomOwner(world, room.id));
    if (!friendly && !allowFallback) return;
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const distance = Math.sqrt(world.dist2(e.x, e.y, cx, cy));
    if (distance > routineRoomDistanceLimit(e, room, intent, options.preferredRoomId)) return;
    const target = routineRoomTargetCandidate(world, e, room, context, memory, friendly, options.preferredRoomId, distance);
    pushRoutineRoomCandidate(friendly ? routineFriendlyRoomCandidates : routineFallbackRoomCandidates, target);
  };

  considerRoom(options.preferredRoomId !== undefined ? world.rooms[options.preferredRoomId] : undefined);
  considerRoom(e.assignedRoomId !== undefined ? world.rooms[e.assignedRoomId] : undefined);
  considerRoom(world.roomAt(e.x, e.y) ?? undefined);

  for (const roomId of collectNearestRoomIds(world, e, intent, context)) {
    considerRoom(world.rooms[roomId]);
  }
  routineFriendlyRoomCandidates.sort(compareRoutineRoomCandidates);
  if (tryAssignRoutineRoomCandidate(world, e, routineFriendlyRoomCandidates)) return true;
  if (!allowFallback) return false;
  routineFallbackRoomCandidates.sort(compareRoutineRoomCandidates);
  return tryAssignRoutineRoomCandidate(world, e, routineFallbackRoomCandidates);
}

/**
 * Ближайшие комнаты, которым вообще есть что предложить.
 *
 * Отбор физический, а не по месту в массиве: этаж — это тысячи комнат
 * (квартиры: 13873), и окно «96 подряд от случайного места» показывало
 * человеку меньше процента этажа, зато с другого его конца. Проход идёт по
 * всем комнатам, но дёшево: индекс в таблице интереса по типу плюс `dist2`.
 * Дорогое — память комнаты, территория, danger, полный скоринг — достаётся
 * только ближайшим `ROUTINE_NEAREST_ROOM_CAP`.
 */
function collectNearestRoomIds(
  world: World,
  e: Entity,
  intent: NpcUtilityIntentId,
  context: NpcUtilityTargetPreferenceContext,
): readonly number[] {
  fillNpcUtilityRoomTypeInterest(context, routineTypeInterest);
  const limit = routineScanDistanceLimit(e, intent);
  const limit2 = limit === Infinity ? Infinity : limit * limit;
  refreshRoomMirror(world);
  const count = roomMirrorCount;
  // Расстояние и номер в одном числе: сортировать плотный массив чисел дешевле,
  // чем держать разрежённую таблицу на весь этаж.
  let found = 0;
  // Дальше своего предела человек всё равно не пойдёт, поэтому и смотреть весь
  // этаж незачем: пространственный индекс отдаёт только комнаты вокруг. Круг
  // отбирается тем же `dist2`, что и раньше, — набор комнат тождественный,
  // меняется только то, сколько лишних мимо него прошло.
  const spatial = !roomRadiusCoversFloor(limit);
  const scanned = spatial ? roomIdsAroundInto(world, e.x, e.y, limit, routineRoomIdScratch) : count;
  for (let i = 0; i < scanned; i++) {
    const id = spatial ? routineRoomIdScratch[i] : i;
    if (id >= count) continue;
    const type = roomMirrorType[id];
    if (type === ROOM_MIRROR_HOLE || routineTypeInterest[type] <= 0) continue;
    const d2 = world.dist2(e.x, e.y, roomMirrorCx[id], roomMirrorCy[id]);
    if (d2 > limit2) continue;
    routineNearbyKeys[found++] = Math.round(d2) * ROUTINE_ROOM_KEY_SCALE + id;
  }
  routineNearbyKeys.length = found;
  if (found > ROUTINE_NEAREST_ROOM_CAP) {
    routineNearbyKeys.sort(compareNumbers);
    routineNearbyKeys.length = ROUTINE_NEAREST_ROOM_CAP;
  } else if (spatial) {
    // Индекс отдаёт комнаты в порядке бакетов; сплошной проход отдавал их по
    // номеру. Порядок дальше не решает ничего, но пусть выход будет тот же.
    routineNearbyKeys.sort(compareRoomKeysById);
  }
  routineNearbyRoomIds.length = routineNearbyKeys.length;
  for (let i = 0; i < routineNearbyKeys.length; i++) {
    routineNearbyRoomIds[i] = routineNearbyKeys[i] % ROUTINE_ROOM_KEY_SCALE;
  }
  return routineNearbyRoomIds;
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function compareRoomKeysById(a: number, b: number): number {
  return (a % ROUTINE_ROOM_KEY_SCALE) - (b % ROUTINE_ROOM_KEY_SCALE);
}

function routineRoomTargetCandidate(
  world: World,
  e: Entity,
  room: Room,
  context: NpcUtilityTargetPreferenceContext,
  memory: NpcUtilityRoomMemorySnapshot | undefined,
  friendly: boolean,
  preferredRoomId: number | undefined,
  distance: number,
): NpcUtilityTargetCandidate {
  const assignedBonus = room.id === e.assignedRoomId ? 14 : 0;
  const preferredBonus = room.id === preferredRoomId ? 12 : 0;
  const territoryUtility = friendly ? 10 : -22;
  const score = scoreNpcUtilityTargetPreference({
    id: room.id,
    roomId: room.id,
    roomType: room.type,
    utility: assignedBonus + preferredBonus + territoryUtility,
    distance,
    crowd: roomCrowdCounts[room.id] ?? 0,
    capacity: npcUtilityRoomCapacity(room),
    // Чужая территория и личный враг отталкивают одинаково: и то и другое —
    // причина не заходить, и вторая шкала для второй причины не нужна.
    factionPenalty: (friendly ? 0 : ROOM_UNWELCOME_PENALTY)
      + (feudRoomHoldsEnemy(world, e, room.id) ? ROOM_UNWELCOME_PENALTY : 0),
    danger: world.dangerField[world.idx(Math.floor(room.x + room.w/2), Math.floor(room.y + room.h/2))] / 255,
    memory,
    novelty: roomVisitNovelty(e, room.id),
  }, context);
  // Оценка комнаты берётся по её центру — это свойство комнаты. А идти надо в
  // СВОЮ точку внутри неё: общий центр делал из каждой комнаты аттрактор, куда
  // сходилась вся рутина этажа.
  const spot = roomTargetCell(world, e, room);
  return {
    id: room.id,
    roomId: room.id,
    roomType: room.type,
    x: spot.x,
    y: spot.y,
    utility: score,
    distance,
  };
}

/** Насколько далеко человек вообще готов идти под это дело. */
function routineScanDistanceLimit(e: Entity, intent: NpcUtilityIntentId): number {
  if (usesTravelerRoutine(e)) return routineIntentAllowsSurvivalTrespass(intent) ? ROUTINE_TRAVELER_NEED_ROOM_DISTANCE : Infinity;
  if (routineIntentAllowsSurvivalTrespass(intent)) return ROUTINE_SURVIVAL_ROOM_DISTANCE;
  return ROUTINE_LOCAL_ROOM_DISTANCE;
}

function routineRoomDistanceLimit(e: Entity, room: Room, intent: NpcUtilityIntentId, preferredRoomId: number | undefined): number {
  // Своя и назначенная комнаты дальностью не ограничены: домой идут через этаж.
  if (room.id === preferredRoomId || room.id === e.assignedRoomId) return Infinity;
  return routineScanDistanceLimit(e, intent);
}

function pushRoutineRoomCandidate(candidates: NpcUtilityTargetCandidate[], candidate: NpcUtilityTargetCandidate): void {
  candidates.push(candidate);
  if (candidates.length <= ROUTINE_ROOM_CANDIDATE_CAP * 2) return;
  candidates.sort(compareRoutineRoomCandidates);
  candidates.length = ROUTINE_ROOM_CANDIDATE_CAP;
}

/**
 * Ничью решает физика, а не номер комнаты в массиве: при равном интересе идут
 * в ближнюю. Номер остаётся последним средством — только между комнатами,
 * которые равны и по интересу, и по расстоянию, то есть взаимозаменяемы.
 */
function compareRoutineRoomCandidates(a: NpcUtilityTargetCandidate, b: NpcUtilityTargetCandidate): number {
  return (b.utility ?? 0) - (a.utility ?? 0)
    || (a.distance ?? 0) - (b.distance ?? 0)
    || Number(a.roomId ?? a.id) - Number(b.roomId ?? b.id);
}

function tryAssignRoutineRoomCandidate(world: World, e: Entity, candidates: readonly NpcUtilityTargetCandidate[]): boolean {
  const limit = Math.min(candidates.length, ROUTINE_ROOM_CANDIDATE_CAP);
  const currentRoom = world.roomAt(e.x, e.y);
  for (let i = 0; i < limit; i++) {
    const candidate = candidates[i];
    if (candidate.x === undefined || candidate.y === undefined) continue;
    if (currentRoom && currentRoom.id === candidate.roomId) {
      const ai = e.ai!;
      ai.path = [];
      ai.pi = 0;
      ai.stuck = 0;
      return true;
    }
    if (tryAssignPathToCell(world, e, candidate.x, candidate.y) !== 'not_found') return true;
  }
  return false;
}

/** Имя историческое: цель внутри комнаты давно НЕ её центр. Целиться в
 *  `room.x + w/2` значило слать всю рутину в одну клетку на всю комнату —
 *  жильцы стекались в неё и стояли друг в друге. `roomTargetCell` разводит их
 *  по площади детерминированно от `e.id`, без памяти и без полей в `AIState`. */
function tryAssignPathToRoomCenter(world: World, e: Entity, room: Room) {
  const currentRoom = world.roomAt(e.x, e.y);
  if (currentRoom && currentRoom.id === room.id) {
    const ai = e.ai!;
    ai.path = [];
    ai.pi = 0;
    ai.stuck = 0;
    return 'same';
  }
  const spot = roomTargetCell(world, e, room);
  return tryAssignPathToCell(world, e, spot.x, spot.y);
}

function patrolCorridor(world: World, e: Entity): void {
  for (let attempt = 0; attempt < 20; attempt++) {
    const dx = Math.floor(stableUnit(e, `patrol_x:${attempt}:${Math.floor((e.ai?.stateTimer ?? 0) / 10)}`) * 61) - 30;
    const dy = Math.floor(stableUnit(e, `patrol_y:${attempt}:${Math.floor((e.ai?.stateTimer ?? 0) / 10)}`) * 61) - 30;
    const tx = world.wrap(Math.floor(e.x) + dx);
    const ty = world.wrap(Math.floor(e.y) + dy);
    const ci = world.idx(tx, ty);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    if (world.roomMap[ci] >= 0) continue;
    if (!territoryFriendlyForNpc(e, territoryOwnerAtIndex(world, ci)) && attempt < 14) continue;
    const status = tryAssignPathToCell(world, e, tx, ty);
    if (status !== 'not_found') return;
  }
  wanderNearby(world, e);
}

function handleHiding(
  world: World,
  entities: readonly Entity[],
  e: Entity,
  dt: number,
  clock: GameClock,
  profile: NpcAiProfile,
): void {
  const ai = e.ai!;
  if (ai.goal !== AIGoal.HIDE) {
    ai.goal = AIGoal.HIDE;
    ai.timer = 0;
  }
  if (ai.path.length === 0 && ai.timer <= 0) {
    if (!tryAssignEmergencyShelterPath(world, entities, e, clock)) {
      if (profile === 'ministry') {
        gotoAssignedOrNearest(world, e, RoomType.OFFICE);
      } else if (usesTravelerRoutine(e)) {
        gotoNearestRoomType(world, e, RoomType.LIVING);
      } else {
        // `findFamilyRoom` возвращает НОМЕР комнаты. Он уходил в `gotoRoom`,
        // который ждёт ТИП, — и прятаться было некуда: путь не находился, а до
        // фолбэка дело не доходило.
        const familyRoomId = findFamilyRoom(world, e, RoomType.LIVING);
        const familyRoom = familyRoomId >= 0 ? world.rooms[familyRoomId] : undefined;
        if (!familyRoom || tryAssignPathToRoomCenter(world, e, familyRoom) === 'not_found') {
          gotoNearestRoomOfTypes(world, e, [RoomType.LIVING, RoomType.HQ, RoomType.COMMON]);
        }
      }
      ai.timer = 1.25;
    }
  }
  followPath(world, e, dt);
}

/* ── Force NPCs to hide (called by samosbor) ─────────────────── */
export function forceHide(
  entities: Entity[],
  msgs?: Msg[],
  time?: number,
  world?: World,
  clock?: GameClock,
  shelterRoomIds?: readonly number[],
): void {
  for (const e of entities) {
    if (e.type === EntityType.NPC && e.alive && e.ai) {
      if (e.faction === Faction.LIQUIDATOR || e.faction === Faction.CULTIST || e.faction === Faction.WILD) continue;
      if (msgs) emitMarkovBark(e, msgs, time ?? 0, 'alert', 'Тихо...', BARK_CHANCE_HIDE, '#ff4');
      utilityIntentByNpc.set(e, 'safety');
      utilityScoreByNpc.set(e, UTILITY_EMERGENCY_SCORE);
      e.ai.npcState = NpcState.HIDING;
      e.ai.goal = AIGoal.HIDE;
      e.ai.path = [];
      e.ai.pi = 0;
      e.ai.timer = 0;
      if (world) tryAssignEmergencyShelterPath(world, entities, e, clock, shelterRoomIds);
      utilityNextDecisionAtByNpc.set(e, (time ?? _barkTime) + utilityRethinkInterval(e));
    }
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

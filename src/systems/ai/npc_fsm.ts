/* ── NPC local utility executor: intent scoring + bounded actions ─ */

import {
  type Entity, type Msg,
  EntityType, AIGoal, RoomType, NpcState, Faction,
  type GameClock, Cell, type Room, ZoneFaction,
} from '../../core/types';
import { World } from '../../core/world';
import { roomIdsAroundInto, roomRadiusCoversFloor } from '../../world/room_index';
import { WEAPON_STATS } from '../../data/catalog';
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
import { actorUnderOrder, tickGotoOrder } from './goto_order';
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
import { equippedCombatItemId } from '../inventory';
import { territoryOwnerAtIndex, territoryRoomOwner } from '../territory';
import { noteRoomVisit, roomVisitNovelty } from '../room_visits';
/* Смена (рейс, склад, уборка) живёт своим модулем: она не про граф переходов,
 * и звать её теперь есть кому, кроме этого слоя. Здесь только точки вызова. */
import {
  npcHasRangedWeapon,
  npcIsSupplyCarrier,
  npcRaidsForeignContainers,
  npcStoreActionDue,
  npcStoreDrive,
  noteNpcStoreAction,
  ownRoomIsShort,
  scanSpareInventory,
  stableTimer,
  stableUnit,
  supplyErrandRoomId,
  territoryFriendlyForNpc,
  tickNpcStorageWork,
  tryCleanerSurfaceWork,
  usesTravelerRoutine,
  type NpcStorageOutcome,
} from '../npc_work';
import {
  NPC_UTILITY_INTENTS,
  NPC_UTILITY_ROOM_TYPE_SLOTS,
  createNpcUtilityScoreBuffer,
  fillNpcUtilityRoomTypeInterest,
  npcUtilityIdentityFromEntity,
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
  /* Курс переписывает только тот, кто им и владеет. Боевая цель тут стояла с
   * самого начала; приказ снаружи (`AIGoal.GOTO`, `goto_order.ts`) — ровно тот
   * же случай и та же строка: волю актору задали не намерением, и намерение её
   * не отменяет. Гасит приказ его собственный исполнитель — приходом в клетку
   * или отсутствием дороги.
   *
   * Без этого приказ, поставленный ПРИ СПАВНЕ, не доживал до первого своего
   * исполнения: `primeNpcAlifeState` зовут на первом же кадре жизни NPC, и он
   * заходит сюда. Замерено на жилом этаже (сид 20881,
   * `tmp/goto_holes_probe.ts`): из двенадцати получивших приказ при создании
   * первый кадр не пережил НИ ОДИН, дошли 0 из 12. Приказом при спавне живут
   * шесть мест — подъезд Мёбиуса, приманка бетоноеда, белая комната, белая
   * прислушка и мигрант A-Life (`opts.goalX/goalY`). */
  if (ai.combatTargetId !== undefined || actorUnderOrder(e)) return;

  ai.goal = goalForIntent(intent);
  ai.path = [];
  ai.pi = 0;
  ai.stuck = 0;
  ai.timer = 0;
}

export function primeNpcAlifeState(
  e: Entity,
  samosborActive: boolean,
  profile: NpcAiProfile = 'default',
): void {
  const ai = e.ai;
  if (!ai) return;
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

  if (state) {
    processUrinationEvents(world, e, ai, state, _barkMsgs, time);
  }

  // Дорога на объявленную разборку идёт ВМЕСТО рутины: иначе человек бросит её
  // на первом же переборе намерений и на место так и не придёт.
  if (tickFeudDuelWalk(world, e, dt)) {
    return;
  }

  // Приказ «иди в точку» тоже идёт ВМЕСТО рутины и по той же причине, что
  // дорога на разборку. Разбор — у `tickGotoOrder`.
  if (tickGotoOrder(world, e, dt)) {
    return;
  }

  evaluateMicroStimuli(world, e, time, _barkMsgs);
  if (tickMicroGoal(world, e, dt, time, _barkMsgs)) {
    return;
  }

  if (utilityIntentByNpc.get(e) === undefined || ai.npcState === undefined) {
    enterUtilityIntent(e, initialIntentForNpc(e, samosborActive, profile), 0, profile);
  }

  const decision = selectAndEnterUtilityIntent(world, entities, e, clock, samosborActive, profile);
  const intent = decision.intent;

  ai.timer -= dt;
  ai.stateTimer = (ai.stateTimer ?? 0) + dt;

  if (!decision.rescored && canHoldRoutineFrame(e, intent)) {
    if (intent === 'work') tryCleanerSurfaceWork(world, e, _barkTime);
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

/* «Чем бьёт» — у `equippedCombatItemId`: слот оружия ИЛИ пси-инструмент, тем же
 * вызовом, каким берёт оружие сам бой. По одному слоту `weapon` пси-боец числился
 * безоружным и невесомым. */
function actorPower(e: Entity): number {
  const ws = WEAPON_STATS[equippedCombatItemId(e)] ?? WEAPON_STATS[''];
  const weapon = ws ? (ws.isRanged ? ws.dmg * (ws.pellets ?? 1) * 1.6 : ws.dmg) : 0;
  const hp = Math.max(0, e.hp ?? 20) * 0.22;
  const level = Math.max(1, e.rpg?.level ?? 1) * 3;
  return hp + weapon + level;
}

function npcIsArmed(e: Entity): boolean {
  const ws = WEAPON_STATS[equippedCombatItemId(e)];
  return !!ws && (ws.dmg > 3 || ws.isRanged);
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
  tryCleanerSurfaceWork(world, e, _barkTime);

  // Сперва то, что под рукой: сложить сделанное в ящик, взять со склада то, чего
  // ждут в комнатах, отдать привезённое. Это часть смены, а не отдельное дело,
  // поэтому ради ящика никто не бросает работу и не тащит выход через этаж.
  let outcome: NpcStorageOutcome = 'nothing';
  if (ai.path.length === 0 && npcStoreActionDue(e, _barkTime)) {
    noteNpcStoreAction(e, _barkTime);
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

function handleStore(world: World, e: Entity, dt: number, state?: import('../../core/types').GameState): void {
  const ai = e.ai!;

  // Сперва — здесь: работник цеха кладёт смену в свой ящик, если место есть, и
  // только потом несёт её через этаж.
  let outcome: NpcStorageOutcome = 'nothing';
  if (ai.path.length === 0 && npcStoreActionDue(e, _barkTime)) {
    noteNpcStoreAction(e, _barkTime);
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

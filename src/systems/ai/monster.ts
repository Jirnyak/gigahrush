/* ── Monster behavior: hunt player + hostile NPCs ─────────────── */


import {
  W,
  type Entity, type GameState, type Msg, type Room,
  Cell, DoorState, Feature, ItemType, ProjType, RoomType, Tex, ZoneFaction,
  EntityType, AIGoal, MonsterKind,
  msg,
} from '../../core/types';
import { World } from '../../core/world';
import { MONSTERS, entityDisplayName, monsterHasAIFlag, monsterWindup, type MonsterAIFlag, type MonsterAffinityDef, type MonsterAnchorDef, type MonsterDef, type MonsterStrikeDef, type MonsterWindupDef } from '../../entities/monster';
import { ITEMS, ITEM_TAGS } from '../../data/items';
import { droppedToolLightScore, equippedToolLightScore } from '../../data/tool_lights';
import {
  playGrowl,
  playFogSharkBite,
  playFogSharkHiss,
  playHostileEnergyShot,
  playHostileEyeShot,
  playHostileFlame,
  playHostileParagraphShot,
  playHostilePsiCast,
  playSoundAt,
} from '../audio';
import { isHostile } from '../factions';
import { scaleMonsterDmg, strMeleeDmgMult } from '../rpg';
import { zhelemishIncomingMeleeDamage } from '../status';
import { spawnBloodHit, spawnDeathPool } from '../blood_fx';
import { MarkType, stampMark } from '../surface_marks';
import {
  followPath, pathTargetIs, spreadTargetCell, tryAssignPathToCell, wanderFar, wanderNearby,
  // Предикат и назначение общие для всех акторов и живут в pathfinding; здесь
  // они сохраняют исторические имена, чтобы не трогать три десятка вызовов.
  actorRepathDue as monsterRepathDue,
  assignActorPath as assignMonsterPath,
} from './pathfinding';
import { hasLineOfSight, isLineOfFireCover, lineBlockDistance, lineCoverCells } from '../../world/line_of_sight';
import {
  DashRunOutcome, DashStep, advanceDashRun, dashLanding, dashReached, dashSelfDamage,
  dashTo, endDashRun, startDashRun,
} from './dash';
import { tickGotoOrder } from './goto_order';
import { evaluateMicroStimuli, tickMicroGoal } from './micro_goals';
import { emitMarkovBark } from './barks';
import { Spr } from '../../entities/sprite_index';
import { getRecentEvents, publishEvent } from '../events';
import { recordPlayerDamage } from '../damage';
import { setDoorState } from '../door_state';
import { findNoiseForActor, findNoiseInvestigationTarget, type NoiseRecord } from '../noise';
import { ROOM_MEMORY_BITS, getRoomMemory, roomMemoryHas } from '../room_memory';
import {
  MONSTER_BAIT_COMBAT_LOCK_SQ,
  MONSTER_BAIT_CONSUME_RADIUS_SQ,
  clearDeadBaitDrop,
  consumeMonsterBait,
  getActiveMonsterBaits,
  findMonsterBaitTarget,
  type MonsterBaitMarker,
} from '../monster_bait';
import { entityInActiveCellHazard, registerCellHazardSite } from '../cell_hazards';
import { isDebugOnePunchManEnabled, keepDebugOnePunchManAlive } from '../debug_cheats';
import { ENTITY_MASK_ACTOR, ENTITY_MASK_ITEM_DROP, ENTITY_MASK_NPC, ensureEntityIndex, getEntityIndex } from '../entity_index';
import { damageActor, getRecentCombatThreat } from '../combat_stimulus';
import { updateSlimevikMonster } from '../slimevik';
import { updateGnilushkaMonster } from '../gnilushka';
import { territoryOwnerAtIndex } from '../territory';
import { BLACK_LIQUIDATOR_REVEALED_STAGE } from '../../entities/black_liquidator';
import { HEAD_SLUG_DETACHED_STAGE, HEAD_SLUG_HOSTED_STAGE } from '../../entities/head_slug';
import {
  HARD_LIGHT_LOCK as LAMPOGLAZ_HARD_LOCK,
  HARD_LOCK_DMG_MULT as LAMPOGLAZ_HARD_LOCK_DMG_MULT,
  HARD_LOCK_WINDUP_SEC as LAMPOGLAZ_HARD_LOCK_WINDUP_SEC,
  LIGHT_LOCK as LAMPOGLAZ_LIGHT_LOCK,
  LOCK_DMG_MULT as LAMPOGLAZ_LOCK_DMG_MULT,
} from '../../entities/lampoglaz';
/* Второй удар Слепоглаза объявлен рядом с его дефом: числа и тексты удара —
 * свойство вида, а не константы боевого AI. */
import { NERVE_STRIKE as SLEPOGLAZ_NERVE_STRIKE, NERVE_STRIKE_RATE as SLEPOGLAZ_NERVE_RATE } from '../../entities/slepoglaz';
import { updateKhorovayaMatka } from './khorovaya_matka';
import {
  findZombieApocalypseTarget,
  isZombieApocalypseActive,
  tryZombieApocalypseInfection,
} from '../procedural_anomalies/zombie_apocalypse';
import { entitySpawnSlots } from '../entity_limits';
import { documentScentStrength, hasDocumentScent, markNoisyDocument } from '../document_scent';
import { drainLineCell, getBoundedWetConnection, wetTerrainAtEntity, wetTerrainCell, wetWaterCell } from '../monster_terrain';
import { isPlayerEntity } from '../player_actor';
import { damageBorshchevikRootSite, releaseBorshchevikSeedPuff } from '../borshchevik';
import { killEntity } from '../entity_death';
import {
  BLOOD_PLANT_HEAL_SCAN_SEC,
  BLOOD_PLANT_TENDRIL_MAX_CELLS,
  BLOOD_PLANT_TENDRIL_RANGE,
  healBloodPlantFromRedMold,
  traceBloodPlantTendrilCells,
} from '../blood_plant';
import { updateMatkaSource } from '../matka_source';
import {
  CHERVIE_NET_SOURCE_RADIUS,
  PANELNIK_OPEN_SLOW_MULT,
  PANELNIK_OPEN_SLOW_SEC,
  findMonsterAnchor,
  monsterAnchored,
  type MonsterAnchorPoint,
  monsterWallContext,
  panelnikOpenFloor,
  panelnikWallBraceActive,
} from '../monster_traits';
import { feedMonster, isMonsterSated, monsterWanderDrive, shareLocalTarget } from './monster_pack';
import { selectMeleeTarget } from '../melee_targeting';
import { findMeatChunkCell, hasVisualSlotCode, removeVisualSlotCode } from '../../world/visual_cell_slots';
import { DANGER_FIELD_DEATH_IMPULSE, clearBloodTrailCell, findBloodTrailCell } from '../danger_field';
import { updateMukhozhukBite } from './mukhozhuk';
import { updateTumannikReveal } from './tumannik';
import { updateDikiyRush } from './dikiy_mertvyak';
import { updateSporeCarpetGrowth } from './spore_carpet';
import { speciesState } from './species_state';
import { getMonsterEcology, isCarnivoreMonster, monsterHuntsBeasts, monsterPackMode, monsterPreysOn, monsterWallReadability, type MonsterWallReadability } from '../../data/monster_ecology';
import { rng } from '../../core/rand';
import { tryCombatOrbitStep } from './combat_orbit';

/* ── Shared combat target finder ──────────────────────────────── */
const MONSTER_DETECT = 20;
const MONSTER_MELEE_DETECT = 30;
const MONSTER_DETECT_SQ = MONSTER_DETECT * MONSTER_DETECT;
const MONSTER_MELEE_DETECT_SQ = MONSTER_MELEE_DETECT * MONSTER_MELEE_DETECT;
const IMMEDIATE_THREAT_RADIUS = 10;
const IMMEDIATE_THREAT_RADIUS_SQ = IMMEDIATE_THREAT_RADIUS * IMMEDIATE_THREAT_RADIUS;
/* Сколько тел актор вообще рассматривает как боевую цель за один поиск.
 * Экспортируется, потому что прицел HUD обязан смотреть ровно на тот же
 * горизонт: до 2026-08-27 он держал СВОЮ копию с числом 160 и называл игроку
 * цель, до которой собственный AI этого же актора не дотягивается. Закон
 * «Игрок == NPC» требует одной боевой математики, а не двух похожих. */
export const COMBAT_TARGET_SCAN_CAP = 80;
const IMMEDIATE_THREAT_SCAN_CAP = 40;

const OLGOY_SCENT_SCAN_CAP = 64;
const LISHENNYY_LIGHT_SCAN_CAP = 72;
const CHERNOSLIZ_SCAN_CAP = 64;
const DOCUMENT_HUNTER_SCAN_CAP = 72;
const SLEPOGLAZ_BEAM_SCAN_CAP = 96;
const PECHATEED_FALLBACK_SQ = 10 * 10;
const KONTORSHCHIK_FALLBACK_SQ = 7 * 7;
const PROTOKOLNIK_FALLBACK_SQ = 8 * 8;
const PROTOKOLNIK_PRESSURE_RANGE = 18;
const PROTOKOLNIK_PRESSURE_RANGE_SQ = PROTOKOLNIK_PRESSURE_RANGE * PROTOKOLNIK_PRESSURE_RANGE;
export const PROTOKOLNIK_PRESSURE_MAX = 100;
export const PROTOKOLNIK_PRESSURE_SAFE_CAP = 42;
const PROTOKOLNIK_PRESSURE_WARN_STEP = 25;
const PROTOKOLNIK_PRESSURE_PULSE_THRESHOLD = 35;
const PROTOKOLNIK_PRESSURE_PULSE_CD = 2.2;
const PROTOKOLNIK_PRESSURE_DECAY = 18;
const PROTOKOLNIK_CAP_DECAY = 13;
const DEBRIS_LURKER_COVER_DETECT_SQ = 22 * 22;
const DEBRIS_LURKER_EXPOSED_DETECT_SQ = 12 * 12;
const NELYUD_REVEAL_SQ = 6 * 6;
const BEZEKHIY_BACK_DOT = -0.18;
export const TRESKOTNIK_WINDUP_SEC = 0.35;
export const TRESKOTNIK_STAGGER_SEC = 1.35;
const TRESKOTNIK_DETECT_SQ = 18 * 18;
const TRESKOTNIK_WINDUP_RANGE = 7.5;
const ZOMBIE_CROWD_PRESSURE_RADIUS = 2.35;
const ZOMBIE_CROWD_PRESSURE_SCAN_CAP = 10;
const ZOMBIE_CROWD_DAMAGE_BONUS = 0.12;
const ZOMBIE_DOOR_DAMAGE_BONUS = 0.2;
const ZOMBIE_CROWD_DAMAGE_CAP = 1.32;
const GREEN_DOG_PACK_RADIUS = 11;
export const GREEN_DOG_PACK_CAP = 8;
const GREEN_DOG_SHARE_COOLDOWN_SEC = 0.75;
const GREEN_DOG_FEAR_SEC = 4.6;
const GREEN_DOG_FEAR_RADIUS = 18;
const GREEN_DOG_FLEE_DIST = 8;
const FOG_SHARK_FOG_THRESHOLD = 55;
export const FOG_SHARK_DRY_SPEED_MULT = 0.34;
export const FOG_SHARK_FOG_SPEED_MULT = 1.08;
const FOG_SHARK_DRY_DAMAGE_MULT = 0.55;
const FOG_SHARK_FOG_DAMAGE_MULT = 1.18;
const FOG_SHARK_DETECT_SQ = 28 * 28;
const FOG_SHARK_DRY_DETECT_SQ = 8 * 8;
const FOG_SHARK_PACK_RADIUS = 10;
export const FOG_SHARK_PACK_CAP = 6;
const FOG_SHARK_SHARE_COOLDOWN_SEC = 0.65;
const FOG_SHARK_SIGHT_COOLDOWN_SEC = 8;
const FOG_SHARK_FOG_TURN_RATE = 5.6;
const FOG_SHARK_DRY_TURN_RATE = 1.05;
export const HEAD_SLUG_REHOST_RADIUS = 5.5;
export const HEAD_SLUG_REHOST_SCAN_CAP = 16;
const HEAD_SLUG_ATTACH_RANGE_SQ = 1.15 * 1.15;
const HEAD_SLUG_DETACH_HP_RATIO = 0.38;
const HEAD_SLUG_DETACHED_HP = 18;
const HEAD_SLUG_DETACHED_SPEED = 1.92;
const HEAD_SLUG_REHOST_COOLDOWN_SEC = 1.2;
const HEAD_SLUG_QUARANTINE_EVENT_COOLDOWN_SEC = 24;
const POMOYNY_ROY_MAX_SCENT_DETECT = 34;
const POMOYNY_ROY_SLOT_RADIUS = 1.65;
const POMOYNY_ROY_SLOT_ANGLES = [Math.PI / 2, -Math.PI / 2, Math.PI * 0.78, -Math.PI * 0.78, Math.PI, Math.PI * 0.35, -Math.PI * 0.35, 0] as const;
const NIGHTMARE_PRESSURE_RANGE = 7.5;
const NIGHTMARE_PRESSURE_MAX = 4;
const NIGHTMARE_PRESSURE_GAIN = 0.74;
const NIGHTMARE_PRESSURE_DECAY = 2.1;
const NIGHTMARE_HEAVY_DAMAGE_BREAK = 34;
const NIGHTMARE_HEAVY_DAMAGE_RATIO = 0.12;
const SOBRANNYY_WAKE_RADIUS_SQ = 5.75 * 5.75;
const SOBRANNYY_DAMAGE_WINDOW_SEC = 4.2;
const SOBRANNYY_STACK_SEC = 20;
const SOBRANNYY_MAX_STACKS = 3;
const SOBRANNYY_IDLE_CHIP_IGNORE = 8;
const SOBRANNYY_DOOR_BREAK_RANGE_SQ = 2.4 * 2.4;
const SOBRANNYY_ACTIVITY_WAKE_SEC = 2.5;
const BORSHCHEVIK_DETECT_SQ = 7.5 * 7.5;
const BORSHCHEVIK_SEED_SQ = 4.8 * 4.8;
const BORSHCHEVIK_SAP_RANGE_SQ = 1.55 * 1.55;
const BORSHCHEVIK_SEED_COOLDOWN_SEC = 5.6;
const BORSHCHEVIK_ROOT_COOLDOWN_SEC = 8.5;
/* Откаты укоренённых — рядом с видом, а не в ядре.
 *
 * Оба сидели в общих `ai.plantPuffCd`/`ai.plantRootCd` у КАЖДОГО актора игры, и
 * `plantRootCd` при этом делили ДВА вида с разным смыслом: у Кровавого растения
 * это скан плесени в ящиках, у Борщевика — таран слабой стены. Одно имя на два
 * несовместимых счётчика — ровно тот разошедшийся общий путь, из-за которого
 * поле и признаётся дефектом. Теперь у каждого свой, и первый тик Борщевика
 * по-прежнему начинается с 1.4 с, как начинался. */
const borshchevikState = speciesState<{ puffCd: number; rootCd: number }>(() => ({ puffCd: 0, rootCd: 1.4 }));
const bloodPlantState = speciesState<{ scanCd: number }>(() => ({ scanCd: 0 }));
// Lazily squared: blood_plant and this module import each other, so reading
// the imported constant at module-evaluation time throws a TDZ ReferenceError
// whenever blood_plant happens to be entered first (it did — the whole
// blood-plant test file failed to load).
function bloodPlantTendrilRangeSq(): number {
  return BLOOD_PLANT_TENDRIL_RANGE * BLOOD_PLANT_TENDRIL_RANGE;
}
const OBZHIVALSHCHIK_BREACH_ANGER = 70;
const OBZHIVALSHCHIK_MAX_ANGER = 100;
const OBZHIVALSHCHIK_GROWTH_CAP = 6;
const OBZHIVALSHCHIK_GROWTH_CD = 10;
const OBZHIVALSHCHIK_SCRATCH_CD = 7;
const OBZHIVALSHCHIK_RETURN_CD = 1.2;
/* Комнатная злость и её следствия — рядом с видом, а не в ядре.
 *
 * Это были СЕМЬ полей `AIState` у КАЖДОГО актора игры ради одного вида, и одно
 * из них (`anger`) делил с ним Гнилушка — с другим смыслом и другим темпом:
 * у обживальщика это накопленная память комнаты со шкалой 0..100, у гнилушки —
 * секунды оборонительной стойки. Одно имя на два несовместимых счётчика.
 *
 * Начальные значения оставлены прежними: `growthCd` стартует с 1.5 с, `scratchCd`
 * с 0.8 с — ровно те умолчания, что стояли в `?? ` на первом тике. */
interface ObzhivalshchikState {
  anger: number;
  growthCount: number;
  growthCd: number;
  scratchCd: number;
  lastRoomMemoryEventId?: number;
  breached: boolean;
}
/* «Этот шум я уже отработал» — одна памятка на всех, кто дедуплицирует шум.
 *
 * Смысл у Обживальщика и Чернослиза здесь ОДИН (не среагировать на одно
 * событие дважды), поэтому и запись одна; общим полем `ai.lastNoiseId` у
 * каждого актора игры она быть перестала. */
const handledNoise = speciesState<{ id?: number }>(() => ({}));

/** Новый ли это шум для твари. Отмечает его отработанным и отвечает `true`. */
function takeFreshNoise(e: Entity, noiseId: number): boolean {
  const seen = handledNoise.of(e);
  if (seen.id === noiseId) return false;
  seen.id = noiseId;
  return true;
}

const obzhivalshchikState = speciesState<ObzhivalshchikState>(() => ({
  anger: 0, growthCount: 0, growthCd: 1.5, scratchCd: 0.8, breached: false,
}));

/** Комнатная память особи: путь для отладки и тестов, как `choirStateOf`. */
export function obzhivalshchikStateOf(e: Entity): ObzhivalshchikState {
  return obzhivalshchikState.of(e);
}
const ZHORNAYA_SCENT_RADIUS = 18;
const ZHORNAYA_SCENT_RADIUS_SQ = ZHORNAYA_SCENT_RADIUS * ZHORNAYA_SCENT_RADIUS;
const ZHORNAYA_DROP_SCAN_RADIUS = 15;
const ZHORNAYA_DROP_SCAN_CAP = 8;
const ZHORNAYA_CARRIER_SCAN_RADIUS = 18;
const ZHORNAYA_CARRIER_SCAN_CAP = 10;
const ZHORNAYA_LUNGE_RANGE = 6.8;
const ZHORNAYA_LUNGE_RANGE_SQ = ZHORNAYA_LUNGE_RANGE * ZHORNAYA_LUNGE_RANGE;
const ZHORNAYA_MISS_RECOVERY_SEC = 1.45;
const ZHORNAYA_HIT_RECOVERY_SEC = 0.72;
const ZHORNAYA_MISS_COOLDOWN_SEC = 3.1;
const ZHORNAYA_SCENT_SCAN_SEC = 0.14;
const OLGOY_DETECT_RADIUS = 24;
const OLGOY_BLOOD_RADIUS = 30;
const OLGOY_CORPSE_RADIUS = 26;
/* Порог запаха падали: половина импульса смерти. Царапина даёт вчетверо
 * меньше, поэтому падальщик не бегает на каждую ссадину. */
const CARRION_BLOOD_MIN = DANGER_FIELD_DEATH_IMPULSE / 2;
const OLGOY_COMBAT_LOCK_SQ = 2.35 * 2.35;
const OLGOY_AMBUSH_RADIUS = 2;
const OLGOY_DRAG_STEP = 0.82;
const CHERNOSLIZ_REVEAL_CLOSE_SQ = 6 * 6;
const CHERNOSLIZ_LIGHT_REVEAL = 0.28;
const CHERNOSLIZ_LIGHT_RANGE = 12;
const CHERNOSLIZ_LIGHT_RANGE_SQ = CHERNOSLIZ_LIGHT_RANGE * CHERNOSLIZ_LIGHT_RANGE;
const CHERNOSLIZ_WATER_DETECT_SQ = 18 * 18;
const CHERNOSLIZ_DRY_DETECT_SQ = 10 * 10;
const WATER_STRIDER_RIPPLE_SEC = 0.75;
const LOTOCHNIK_WET_REGEN_PER_SEC = 1.35;
const EYE_MIN_RANGE = 1.5;
const RANGED_SHOT_RANGE = 15;
const RANGED_LOS_BREAK_COOLDOWN = 0.75;
const PAUPSINA_WEB_MIN_RANGE = 3.4;
const PAUPSINA_WEB_STRAFE_RANGE = 7.25;
const KANTSELYARSKIY_IDOL_BASE_RANGE = 14.5;
const KANTSELYARSKIY_IDOL_MIN_RANGE = 2.35;
const SLEPOGLAZ_SHOT_RANGE = 18;
const SLEPOGLAZ_MIN_RANGE = 2.0;
const SLEPOGLAZ_WINDUP_SEC = 1.15;
const SLEPOGLAZ_BEAM_WIDTH = 0.68;
const SLEPOGLAZ_RECOVERY_SEC = 1.55;
const SLEPOGLAZ_NOISE_HEARING_MULT = 1.45;
/* Дальность и мёртвая зона — строка замаха вида. */
const LAMPOGLAZ_SHOT_RANGE = MONSTERS[MonsterKind.LAMPOGLAZ].windup!.range;
const LAMPOGLAZ_MIN_RANGE = MONSTERS[MonsterKind.LAMPOGLAZ].windup!.minRange;
const LAMPOGLAZ_WINDUP_SEC = MONSTERS[MonsterKind.LAMPOGLAZ].windup!.windupSec;
/* Предел мокрой прямой и длина заряда объявлены строкой замаха вида
 * (`MONSTERS[TRUBNYY_AVTOMAT].windup`); здесь они только читаются наружу для
 * тестов и генератора. */
export const TRUBNYY_WET_LINE_MAX_CELLS = MONSTERS[MonsterKind.TRUBNYY_AVTOMAT].windup!.range;
export const TRUBNYY_WET_LINE_WINDUP_SEC = MONSTERS[MonsterKind.TRUBNYY_AVTOMAT].windup!.windupSec;
export const TRUBNYY_WET_LINE_RECOVERY_SEC = 2.75;
const TRUBNYY_WET_LINE_MIN_RANGE = MONSTERS[MonsterKind.TRUBNYY_AVTOMAT].windup!.minRange;
const TRUBNYY_WET_LINE_ALIGN_EPS = 0.68;
export const VODYANOY_WET_LINE_MAX_CELLS = 160;
export const VODYANOY_WET_LINE_MAX_DIST = 28;
export const VODYANOY_WET_LINE_SCAN_SEC = 0.35;
export const VODYANOY_WET_LINE_DRY_BREAK_SEC = 0.7;
export const VODYANOY_WET_LINE_PRESSURE_MAX = 6;
const VODYANOY_WET_LINE_PULSE_SEC = 0.65;
const GENERIC_RANGED_WINDUP_SEC = 0.7;
const SHADOW_WARNING_RANGE_SQ = 5.5 * 5.5;
const SHADOW_WINDUP_SEC = 0.55;
const SHADOW_STRIKE_BREAK_RANGE = 1.65;
const SHADOW_LIGHT_SAFE = 0.34;
const SHADOW_DARK_LIGHT = 0.18;
const SHADOW_CANCEL_COOLDOWN = 0.65;
const LISHENNYY_DETECT_RADIUS = 30;
const LISHENNYY_DETECT_SQ = LISHENNYY_DETECT_RADIUS * LISHENNYY_DETECT_RADIUS;
const LISHENNYY_FEATURE_SCAN_RADIUS = 12;
const LISHENNYY_LIGHT_MIN = 0.2;
const LISHENNYY_BRIGHT_AVOID = 0.56;
const LISHENNYY_SCAN_SEC = 0.62;
const LISHENNYY_CONTACT_DRAIN = 4;
const TONKAYA_BAIT_SCAN_RADIUS = 10;
const TONKAYA_BAIT_SCAN_RADIUS_SQ = TONKAYA_BAIT_SCAN_RADIUS * TONKAYA_BAIT_SCAN_RADIUS;
const TONKAYA_BAIT_MAX_VISIBLE = 15;
const TONKAYA_BAIT_MIN_TARGET_SQ = 3.2 * 3.2;
const TONKAYA_BAIT_MAX_TARGET_SQ = 13 * 13;
const TONKAYA_LINE_HALF_LEN = 5.5;
const TONKAYA_LINE_PERP = 0.72;
const TONKAYA_NERVE_SEC = 5.6;
const TONKAYA_REPOSITION_CD = 0.8;
const TONKAYA_FLANK_RANGE = 7.5;
const RZHAVNIK_CLOSE_WAKE_SQ = 2.45 * 2.45;
const RZHAVNIK_LEAP_WINDUP_SEC = 0.28;
/* Длина прыжка живёт в строке рывка вида: здесь она нужна как радиус поиска
 * потерянной цели и как число в событии читаемости. */
const RZHAVNIK_LEAP_STEP = MONSTERS[MonsterKind.RZHAVNIK].dash!.step!;
const PANELNIK_BRACE_REACH = 1.75;
const PANELNIK_OPEN_REACH = 1.16;
const PANELNIK_BRACE_CUE_COOLDOWN_SEC = 4.2;
const WALL_BIAS_CUE_COOLDOWN_SEC = 5.2;
const SLIME_WOMAN_RESIDUE_COOLDOWN_SEC = 2.4;
const SLIME_WOMAN_RESIDUE_DURATION_SEC = 18;
const SLIME_WOMAN_DRY_EVENT_COOLDOWN_SEC = 7;
const GREEN_DOG_RUMOR_IDS = ['monster_green_dog_door', 'ecology_green_dog_noise'] as const;
const FOG_SHARK_RUMOR_IDS = ['monster_fog_shark_fog', 'ecology_fog_shark_fire'] as const;
export const CHERVIE_MIND_PULSE_RADIUS = 7.5;
export const CHERVIE_MIND_PULSE_CAP = 4;
export const CHERVIE_MIND_PULSE_COOLDOWN_SEC = 8.5;
const CHERVIE_MIND_PULSE_CONFUSION_SEC = 4.2;

/** Entity lookup map — set by updateAI each frame */
let _entityById = new Map<number, Entity>();
export function setEntityMap(m: Map<number, Entity>): void { _entityById = m; }

const combatQuery: Entity[] = [];
const disguiseWitnessQuery: Entity[] = [];
/** Кто рядом считается свидетелем маскировки. */
const BLACK_LIQUIDATOR_WITNESS_RADIUS = 12;
const BLACK_LIQUIDATOR_WITNESS_CAP = 16;
const monsterMeleeHitQuery: Entity[] = [];
const immediateTopCandidates: Entity[] = [];
const documentHunterQuery: Entity[] = [];
const chernoslizTargetQuery: Entity[] = [];
const zhornayaCarrierQuery: Entity[] = [];
const zhornayaDropQuery: Entity[] = [];
const slepoglazBeamQuery: Entity[] = [];
const zombieCrowdQuery: Entity[] = [];
const greenDogPackQuery: Entity[] = [];
const fogSharkPackQuery: Entity[] = [];
const headSlugHostQuery: Entity[] = [];
const cherviePulseQuery: Entity[] = [];
const pomoynyRoyQuery: Entity[] = [];
const lishennyyLightQuery: Entity[] = [];

const lampPoweredRuntime = new WeakMap<Entity, boolean>();



interface ZhornayaScentRuntime {
  nextScanAt: number;
  scent: ZhornayaScentTarget | null;
}

const zhornayaScentRuntime = new WeakMap<Entity, ZhornayaScentRuntime>();

interface SobrannyyRuntime {
  lastHp: number;
  baseSpeed: number;
  dormant: boolean;
  hitCount: number;
  hitWindowUntil: number;
  stacks: number;
  stackUntil: number;
  isolatedUntil: number;
}

const sobrannyyRuntime = new WeakMap<Entity, SobrannyyRuntime>();
const SOBRANNYY_SLIME_TAGS = ['slime', 'toxic', 'acid', 'red_slime', 'black_slime', 'brown_slime'] as const;

interface NightmareRuntime {
  lastHp: number;
  pressure: number;
  lastBreakAt: number;
}

const nightmareRuntime = new WeakMap<Entity, NightmareRuntime>();

interface SlimeWomanRuntime {
  lastHp: number;
  lastResidueAt: number;
  lastDryEventAt: number;
}

const slimeWomanRuntime = new WeakMap<Entity, SlimeWomanRuntime>();
const SLIME_WOMAN_HAZARD_TAGS = ['slime', 'toxic', 'black_slime', 'green_slime', 'slime_woman'] as const;

interface GreenDogRuntime {
  nextShareAt: number;
  fearUntil: number;
  fearX: number;
  fearY: number;
  lastScaryNoiseId: number;
}

const greenDogRuntime = new WeakMap<Entity, GreenDogRuntime>();

interface FogSharkRuntime {
  nextShareAt: number;
  nextSightAt: number;
}

const fogSharkRuntime = new WeakMap<Entity, FogSharkRuntime>();

function zoneIdAt(world: World, x: number, y: number): number | undefined {
  const zid = world.zoneMap[world.idx(Math.floor(x), Math.floor(y))];
  return zid >= 0 ? zid : undefined;
}

function greenDogState(e: Entity): GreenDogRuntime {
  let state = greenDogRuntime.get(e);
  if (!state) {
    state = {
      nextShareAt: -Infinity,
      fearUntil: -Infinity,
      fearX: e.x,
      fearY: e.y,
      lastScaryNoiseId: 0,
    };
    greenDogRuntime.set(e, state);
  }
  return state;
}

function fogSharkState(e: Entity): FogSharkRuntime {
  let state = fogSharkRuntime.get(e);
  if (!state) {
    state = {
      nextShareAt: -Infinity,
      nextSightAt: -Infinity,
    };
    fogSharkRuntime.set(e, state);
  }
  return state;
}

function fogSharkHasFogPressure(world: World, e: Entity): boolean {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const idx = world.idx(x, y);
  if (world.fog[idx] >= FOG_SHARK_FOG_THRESHOLD) return true;
  const zid = world.zoneMap[idx];
  const zone = zid >= 0 ? world.zones[zid] : undefined;
  return zone?.fogged === true || territoryOwnerAtIndex(world, idx) === ZoneFaction.SAMOSBOR;
}

export function fogSharkMoveMultiplierForTests(world: World, e: Entity): number {
  if (!hasAIFlag(e, 'fogSwimmer')) return 1;
  return fogSharkHasFogPressure(world, e) ? FOG_SHARK_FOG_SPEED_MULT : FOG_SHARK_DRY_SPEED_MULT;
}

function angleDelta(to: number, from: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function updateFogSharkTurn(world: World, e: Entity, target: Entity, dt: number): void {
  if (e.monsterKind !== MonsterKind.FOG_SHARK) return;
  const desired = Math.atan2(world.delta(e.y, target.y), world.delta(e.x, target.x));
  const rate = fogSharkHasFogPressure(world, e) ? FOG_SHARK_FOG_TURN_RATE : FOG_SHARK_DRY_TURN_RATE;
  const delta = angleDelta(desired, e.angle);
  const step = Math.max(-rate * dt, Math.min(rate * dt, delta));
  e.angle += step;
}

function fogSharkChaseCell(world: World, e: Entity, target: Entity): { x: number; y: number } {
  if (!hasAIFlag(e, 'fogSwimmer')) return greenDogChaseCell(world, e, target);
  const dx = world.delta(target.x, e.x);
  const dy = world.delta(target.y, e.y);
  const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const side = (e.id & 1) === 0 ? 1 : -1;
  const px = -dy / dist * side;
  const py = dx / dist * side;
  const back = (e.id % 3) - 1;
  const candidates = [
    { x: target.x + px * 1.45 - dx / dist * back * 0.6, y: target.y + py * 1.45 - dy / dist * back * 0.6 },
    { x: target.x - px * 1.2, y: target.y - py * 1.2 },
    { x: target.x, y: target.y },
  ];
  for (const c of candidates) {
    const x = world.wrap(Math.floor(c.x));
    const y = world.wrap(Math.floor(c.y));
    if (!world.solid(x, y)) return { x, y };
  }
  return monsterChaseCell(world, e, target);
}

function fogSharkPackMember(candidate: Entity): boolean {
  return candidate.monsterKind === MonsterKind.FOG_SHARK;
}

function updateFogSharkPack(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  if (!target || !hasAIFlag(e, 'fogSwimmer')) return;
  const runtime = fogSharkState(e);
  let shared = 0;
  if (runtime.nextShareAt <= time) {
    runtime.nextShareAt = time + FOG_SHARK_SHARE_COOLDOWN_SEC;
    shared = shareLocalTarget(e, target, {
      radius: FOG_SHARK_PACK_RADIUS,
      cap: FOG_SHARK_PACK_CAP,
      scratch: fogSharkPackQuery,
      context: undefined,
      predicate: fogSharkPackMember,
    });
  }

  if (runtime.nextSightAt > time) return;
  runtime.nextSightAt = time + FOG_SHARK_SIGHT_COOLDOWN_SEC;
  if (target.id === playerId) msgs.push(msg('В тумане хлопнули газовые жабры. Туманные акулы взяли стаю.', time, '#b9f'));
  playSoundAt(playFogSharkHiss, e.x, e.y);
  if (!state) return;
  publishEvent(state, {
    type: 'fog_shark_pack_sighted',
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target.id,
    targetName: entityDisplayName(target),
    targetFaction: target.faction,
    monsterKind: MonsterKind.FOG_SHARK,
    severity: target.id === playerId ? 4 : 3,
    privacy: target.id === playerId ? 'local' : 'witnessed',
    tags: ['monster', 'fog_shark', 'pack', 'fog', 'samosbor'],
    data: {
      shared,
      radius: FOG_SHARK_PACK_RADIUS,
      fogActive: fogSharkHasFogPressure(world, e),
      counterplay: 'leave fog, close doors/corners, fire only at range',
      rumorIds: FOG_SHARK_RUMOR_IDS,
    },
  });
}

function scaryGreenDogNoise(noise: NoiseRecord): boolean {
  if (noise.source === 'explosion') return true;
  if (noise.itemId === 'shotgun' || noise.itemId === 'toz_shotgun' || noise.itemId === 'noise_can') return true;
  if (noise.tags.includes('metal') || noise.tags.includes('valve') || noise.tags.includes('pipe')) return true;
  if (noise.tags.includes('can') || noise.tags.includes('counterplay')) return true;
  return noise.source === 'weapon_fire' && noise.severity >= 4;
}

function pickGreenDogFleeCell(world: World, e: Entity, noise: NoiseRecord): { x: number; y: number } {
  const dx = world.delta(noise.x, e.x);
  const dy = world.delta(noise.y, e.y);
  const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const base = Math.atan2(dy, dx);
  const offsets = [0, 0.45, -0.45, 0.9, -0.9, Math.PI * 0.5, -Math.PI * 0.5] as const;
  for (const offset of offsets) {
    const a = base + offset;
    for (let d = GREEN_DOG_FLEE_DIST; d >= 3; d -= 1.5) {
      const x = world.wrap(Math.floor(e.x + Math.cos(a) * d));
      const y = world.wrap(Math.floor(e.y + Math.sin(a) * d));
      if (!world.solid(x, y)) return { x, y };
    }
  }
  return {
    x: world.wrap(Math.floor(e.x + dx / dist * 3)),
    y: world.wrap(Math.floor(e.y + dy / dist * 3)),
  };
}

function publishGreenDogScared(
  state: GameState | undefined,
  world: World,
  e: Entity,
  noise: NoiseRecord,
): void {
  if (!state) return;
  publishEvent(state, {
    type: 'green_dog_scared',
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    itemId: noise.itemId,
    monsterKind: MonsterKind.GREEN_DOG,
    severity: 3,
    privacy: 'local',
    tags: ['monster', 'green_dog', 'noise_fear', noise.source, ...noise.tags.slice(0, 3)],
    data: {
      noiseId: noise.id,
      noiseSource: noise.source,
      fearSeconds: GREEN_DOG_FEAR_SEC,
      counterplay: 'loud metal, valve, noise can, shotgun',
      rumorIds: GREEN_DOG_RUMOR_IDS,
    },
  });
}

function updateGreenDogNoiseFear(
  world: World,
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): boolean {
  if (!hasAIFlag(e, 'noiseFear')) return false;
  const runtime = greenDogState(e);
  const ai = e.ai!;
  const noise = findNoiseForActor(world, state, e, time, {
    minSeverity: 2,
    scanInterval: 0.35,
    hearingMult: 1.25,
  });
  if (
    noise &&
    noise.id !== runtime.lastScaryNoiseId &&
    scaryGreenDogNoise(noise) &&
    world.dist2(e.x, e.y, noise.x, noise.y) <= GREEN_DOG_FEAR_RADIUS * GREEN_DOG_FEAR_RADIUS
  ) {
    const flee = pickGreenDogFleeCell(world, e, noise);
    runtime.lastScaryNoiseId = noise.id;
    runtime.fearUntil = time + GREEN_DOG_FEAR_SEC + Math.min(1.2, noise.severity * 0.2);
    runtime.fearX = flee.x;
    runtime.fearY = flee.y;
    ai.combatTargetId = undefined;
    ai.path = [];
    ai.pi = 0;
    ai.timer = 0;
    e.spriteScale = 0.82;
    msgs.push(msg('Зеленая собака взвизгнула от громкого металла и рвет стаю.', time, '#9f6'));
    publishGreenDogScared(state, world, e, noise);
    playSoundAt(playGrowl, e.x, e.y);
  }

  if (runtime.fearUntil <= time) {
    if (e.spriteScale === 0.82) e.spriteScale = undefined;
    return false;
  }

  ai.goal = AIGoal.WANDER;
  ai.combatTargetId = undefined;
  ai.timer -= dt;
  if (monsterRepathDue(world, e) || !pathTargetIs(world, e, runtime.fearX, runtime.fearY)) {
    assignMonsterPath(world, e, runtime.fearX, runtime.fearY, 0.9);
  }
  if (ai.path.length > 0) followMonsterPath(world, e, dt);
  return true;
}

function shareGreenDogTarget(e: Entity, target: Entity, time: number): number {
  const runtime = greenDogState(e);
  if (runtime.nextShareAt > time) return 0;
  runtime.nextShareAt = time + GREEN_DOG_SHARE_COOLDOWN_SEC;
  return shareLocalTarget(e, target, {
    radius: GREEN_DOG_PACK_RADIUS,
    cap: GREEN_DOG_PACK_CAP,
    scratch: greenDogPackQuery,
    context: time,
    predicate: greenDogPackMember,
  });
}

function greenDogPackMember(dog: Entity, _actor: Entity, _target: Entity, time: number): boolean {
  return hasAIFlag(dog, 'packHowl') && greenDogState(dog).fearUntil <= time;
}

/**
 * Стая делит цель — и это ВСЁ, что осталось от `packHowl`.
 *
 * Здесь же стоял вой: событие `green_dog_howl`, строка в лог игрока и рык. Его
 * дроссель (8 с) сбрасывался при смене цели, а в толпе цель меняется каждый
 * такт, поэтому на грузовом поясе он публиковал ~310 событий в минуту — шестую
 * часть всего мирового потока — при НУЛЕ читателей: ни `contextFactKind`, ни
 * слухи, ни речь его не разбирают, единственным потребителем был форматчик
 * строки в `world_log`. Решение владельца: подсказка того не стоит, вой снят
 * целиком вместе с дросселем.
 */
function updateGreenDogPackShare(e: Entity, target: Entity | null, time: number): void {
  if (!target || !hasAIFlag(e, 'packHowl')) return;
  shareGreenDogTarget(e, target, time);
}

/* ── Пересборка пути монстра ──────────────────────────────────── */

/**
 * Радиус разброса цели погони. Верхняя граница жёсткая: смещённая клетка
 * обязана оставаться внутри самой короткой стандартной дистанции ближнего боя
 * (`monsterMeleeRange`, 1.2), иначе стая окружит цель и никогда её не достанет.
 */
const MONSTER_CHASE_SPREAD_R = 0.5;
/** Округление до клетки может вынести разведённую цель дальше кольца, поэтому
 *  результат ещё и проверяется по расстоянию: что не влезло — идёт в саму цель. */
const MONSTER_CHASE_SPREAD_MAX_SQ = 0.9 * 0.9;

/** Клетка погони по умолчанию: цель, разведённая по непрерывному кольцу от id. */
function monsterChaseCell(world: World, e: Entity, target: Entity): { x: number; y: number } {
  const spot = spreadTargetCell(world, e, target.x, target.y, MONSTER_CHASE_SPREAD_R);
  if (world.dist2(target.x, target.y, spot.x + 0.5, spot.y + 0.5) <= MONSTER_CHASE_SPREAD_MAX_SQ) return spot;
  return { x: Math.floor(world.wrap(target.x)), y: Math.floor(world.wrap(target.y)) };
}

function greenDogChaseCell(world: World, e: Entity, target: Entity): { x: number; y: number } {
  if (hasAIFlag(e, 'garbageSurround')) return pomoynyRoyChaseCell(world, e, target);
  if (!hasAIFlag(e, 'packHowl')) return monsterChaseCell(world, e, target);
  const dx = world.delta(target.x, e.x);
  const dy = world.delta(target.y, e.y);
  const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const side = (e.id & 1) === 0 ? 1 : -1;
  const px = -dy / dist * side;
  const py = dx / dist * side;
  const behind = ((e.id * 17) & 3) === 0 ? -1.2 : 0.35;
  const candidates = [
    { x: target.x + px * 1.7 + dx / dist * behind, y: target.y + py * 1.7 + dy / dist * behind },
    { x: target.x - px * 1.3, y: target.y - py * 1.3 },
    { x: target.x, y: target.y },
  ];
  for (const c of candidates) {
    const x = world.wrap(Math.floor(c.x));
    const y = world.wrap(Math.floor(c.y));
    if (!world.solid(x, y)) return { x, y };
  }
  return monsterChaseCell(world, e, target);
}

function pomoynyRoyChaseCell(world: World, e: Entity, target: Entity): { x: number; y: number } {
  const dx = world.delta(e.x, target.x);
  const dy = world.delta(e.y, target.y);
  const base = Math.atan2(dy, dx);
  const slot = (Math.imul(e.id, 1103515245) ^ target.id) & 7;
  const angle = base + POMOYNY_ROY_SLOT_ANGLES[slot];
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  let x = world.wrap(Math.floor(target.x + ax * POMOYNY_ROY_SLOT_RADIUS));
  let y = world.wrap(Math.floor(target.y + ay * POMOYNY_ROY_SLOT_RADIUS));
  if (!world.solid(x, y)) return { x, y };
  x = world.wrap(Math.floor(target.x - ax * 1.15));
  y = world.wrap(Math.floor(target.y - ay * 1.15));
  if (!world.solid(x, y)) return { x, y };
  return monsterChaseCell(world, e, target);
}

/* Состояние переползания — рядом с видом, а не в ядре.
 *
 * Это были ТРИ поля `AIState` у каждого актора игры ради одной особи во всей
 * игре: откат переползания, откат события карантина и ротационный курсор
 * перебора этажа. Носитель `parasiteHostSkill` остался полем `Entity`: его
 * ставят два генератора при спавне, а `src/gen/**` за границей этого фронта.
 *
 * `victim` — тело, которое слизень положил САМ. Курсора перебора здесь больше
 * нет: правило сменилось (см. `findHeadSlugOwnVictim`), и трупы этажа слизня
 * не интересуют. Ссылка прямая, а не id: мёртвых нет в индексе сущностей
 * (`byId` набивается только живыми), и разыменовать их там нечем. Хранит её
 * WeakMap самого слизня — умер слизень, ушла и память. */
const headSlugState = speciesState<{ rehostCd: number; quarantineCd: number; victim?: Entity }>(
  () => ({ rehostCd: 0, quarantineCd: 0 }),
);

function isHeadSlugDetached(e: Entity): boolean {
  return e.monsterKind === MonsterKind.HEAD_SLUG && e.monsterStage === HEAD_SLUG_DETACHED_STAGE;
}

function headSlugHostSkill(host: Entity): number {
  const level = host.rpg?.level ?? 1;
  const speed = host.speed > 0 ? host.speed : 0.75;
  return Math.max(0.82, Math.min(1.38, 0.74 + speed * 0.34 + level * 0.025));
}

function publishHeadSlugEvent(
  state: GameState | undefined,
  world: World,
  slug: Entity,
  target: Entity | undefined,
  type: 'head_slug_detached' | 'head_slug_rehosted' | 'head_slug_quarantined',
  severity: 3 | 4 | 5,
  tags: string[],
  data?: Record<string, unknown>,
): void {
  if (!state) return;
  publishEvent(state, {
    type,
    zoneId: zoneIdAt(world, slug.x, slug.y),
    roomId: world.roomAt(slug.x, slug.y)?.id,
    x: slug.x,
    y: slug.y,
    actorId: slug.id,
    actorName: entityDisplayName(slug),
    actorFaction: slug.faction,
    targetId: target?.id,
    targetName: target ? entityDisplayName(target) : undefined,
    targetFaction: target?.faction,
    monsterKind: MonsterKind.HEAD_SLUG,
    severity,
    privacy: 'local',
    tags: ['monster', 'head_slug', 'parasite', ...tags],
    data: {
      counterplay: MONSTERS[MonsterKind.HEAD_SLUG]?.counterplay,
      rumorIds: ['monster_head_slug_host', 'ecology_head_slug_rehost'],
      ...data,
    },
  });
}

function detachHeadSlug(
  world: World,
  slug: Entity,
  time: number,
  msgs: Msg[],
  state?: GameState,
  reason = 'host_body_failed',
): void {
  const ai = slug.ai!;
  slug.monsterStage = HEAD_SLUG_DETACHED_STAGE;
  slug.name = undefined;
  slug.maxHp = HEAD_SLUG_DETACHED_HP;
  slug.hp = Math.max(6, Math.min(HEAD_SLUG_DETACHED_HP, slug.hp ?? HEAD_SLUG_DETACHED_HP));
  slug.speed = HEAD_SLUG_DETACHED_SPEED;
  slug.spriteScale = 0.58;
  slug.spriteZ = 0.08;
  slug.parasiteHostSkill = undefined;
  slug.attackCd = Math.max(slug.attackCd ?? 0, 0.65);
  ai.combatTargetId = undefined;
  ai.path = [];
  ai.pi = 0;
  ai.timer = 0;
  headSlugState.of(slug).rehostCd = 0;
  stampMark(world, Math.floor(slug.x), Math.floor(slug.y), 0.5, 0.5, 0.35, MarkType.SPLAT, slug.id ^ 0x51a6, 112, 62, 76, 125);
  msgs.push(msg('Головной слизень сорвался с шеи и ищет новое тело. Добейте его до переползания.', time, '#f8b'));
  publishHeadSlugEvent(state, world, slug, undefined, 'head_slug_detached', 4, ['detached', reason], {
    reason,
    rehostRadius: HEAD_SLUG_REHOST_RADIUS,
    scanCap: HEAD_SLUG_REHOST_SCAN_CAP,
  });
}

function canHeadSlugUseLiveHost(host: Entity): boolean {
  if (!host.alive || host.type !== EntityType.NPC) return false;
  return (host.ai?.staggerTimer ?? 0) > 0.15;
}

function canHeadSlugUseCorpse(host: Entity): boolean {
  return !host.alive && host.type === EntityType.NPC;
}

function findHeadSlugLiveHost(world: World, slug: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD2 = HEAD_SLUG_REHOST_RADIUS * HEAD_SLUG_REHOST_RADIUS;
  getEntityIndex().queryRadiusCapped(
    slug.x,
    slug.y,
    HEAD_SLUG_REHOST_RADIUS,
    headSlugHostQuery,
    ENTITY_MASK_ACTOR,
    HEAD_SLUG_REHOST_SCAN_CAP,
  );
  for (const host of headSlugHostQuery) {
    if (host.id === slug.id || !canHeadSlugUseLiveHost(host)) continue;
    const d2 = world.dist2(slug.x, slug.y, host.x, host.y);
    if (d2 >= bestD2) continue;
    best = host;
    bestD2 = d2;
  }
  return best;
}

/**
 * Тело, которое слизень положил САМ.
 *
 * Здесь стоял ЛИНЕЙНЫЙ ОБХОД ВСЕГО МАССИВА сущностей с ротационным курсором —
 * трупов нет в индексе сущностей, и другого способа найти «любой труп на этаже»
 * не существовало. Правило сменено, а не перенесено: слизень переползает в свою
 * жертву, и тогда искать нечего — он её помнит с момента убийства.
 *
 * Дешевле, и по игре злее: контрплей стал «не дай ему добить», а не «где-то там
 * был труп». Заодно ушёл артефакт курсора — на восьмидесяти трупах два вызова
 * подряд отвечали ПО-РАЗНОМУ, потому что кап 32 из 82 сдвигал окно.
 *
 * Радиус тот же, что и у живого носителя: далеко уползшее тело слизень бросает.
 */
function findHeadSlugOwnVictim(world: World, slug: Entity): Entity | null {
  const own = headSlugState.of(slug);
  const victim = own.victim;
  if (!victim) return null;
  if (!canHeadSlugUseCorpse(victim)) {
    // Тело подняли, вычистили или это уже не тело: память больше не о чем.
    own.victim = undefined;
    return null;
  }
  return world.dist2(slug.x, slug.y, victim.x, victim.y) < HEAD_SLUG_REHOST_RADIUS * HEAD_SLUG_REHOST_RADIUS
    ? victim
    : null;
}

/**
 * Запомнить свою жертву. Зовётся из общего ближнего боя монстров на факте
 * смерти — там же, где растёт Собранный от своего убийства.
 */
export function rememberHeadSlugVictim(slug: Entity, victim: Entity): void {
  if (victim.type !== EntityType.NPC) return;
  headSlugState.of(slug).victim = victim;
}

/** Чьё тело слизень держит на примете: путь для отладки, тестов и стендов. */
export function headSlugVictimOf(slug: Entity): Entity | undefined {
  return headSlugState.peek(slug)?.victim;
}

/** Отложить переползание: путь для внешних глушителей (УФ-прожектор). */
export function delayHeadSlugRehost(slug: Entity, seconds: number): void {
  const own = headSlugState.of(slug);
  own.rehostCd = Math.max(own.rehostCd, seconds);
}

export function findHeadSlugRehostTarget(world: World, slug: Entity): Entity | null {
  if (!isHeadSlugDetached(slug)) return null;
  return findHeadSlugLiveHost(world, slug) ?? findHeadSlugOwnVictim(world, slug);
}

function rehostHeadSlug(
  world: World,
  entities: Entity[],
  slug: Entity,
  host: Entity,
  time: number,
  msgs: Msg[],
  nextId: { v: number },
  state?: GameState,
): void {
  const def = MONSTERS[MonsterKind.HEAD_SLUG];
  const skill = headSlugHostSkill(host);
  const hostWasAlive = host.alive;
  if (host.alive) {
    killEntity(host);
    host.hp = 0;
    spawnDeathPool(world, host.x, host.y, false);
    dropNpcInventory(host, entities, nextId);
  }

  slug.monsterStage = HEAD_SLUG_HOSTED_STAGE;
  slug.x = host.x;
  slug.y = host.y;
  slug.angle = host.angle;
  slug.name = `${host.name ?? 'Носитель'}: головной слизень`;
  slug.faction = host.faction;
  slug.occupation = host.occupation;
  slug.isFemale = host.isFemale;
  slug.parasiteHostSkill = skill;
  slug.speed = def.speed * skill;
  slug.maxHp = Math.max(32, Math.round(def.hp * (0.7 + skill * 0.22)));
  slug.hp = Math.max(slug.hp ?? 1, Math.round(slug.maxHp * 0.58));
  slug.spriteScale = undefined;
  slug.spriteZ = undefined;
  slug.attackCd = Math.max(slug.attackCd ?? 0, 0.8);
  if (slug.ai) {
    slug.ai.combatTargetId = undefined;
    slug.ai.path = [];
    slug.ai.pi = 0;
    slug.ai.timer = 0;
  }
  const own = headSlugState.of(slug);
  own.rehostCd = HEAD_SLUG_REHOST_COOLDOWN_SEC;
  // Тело израсходовано: следующая цель — следующая своя жертва.
  own.victim = undefined;
  msgs.push(msg(`Головной слизень переполз в ${host.name ?? 'тело'}.`, time, '#f8b'));
  publishHeadSlugEvent(state, world, slug, host, 'head_slug_rehosted', 5, ['rehosted', hostWasAlive ? 'stunned_host' : 'corpse_host'], {
    hostSkill: Math.round(skill * 100) / 100,
    hostWasAlive,
    rehostCooldown: HEAD_SLUG_REHOST_COOLDOWN_SEC,
  });
}

function headSlugQuarantineCell(world: World, slug: Entity): boolean {
  const room = world.roomAt(slug.x, slug.y);
  if (room?.sealed) return true;
  const sx = Math.floor(slug.x);
  const sy = Math.floor(slug.y);
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const ci = world.idx(sx + dx, sy + dy);
      const door = world.doors.get(ci);
      if (!door) continue;
      if (door.state === DoorState.HERMETIC_CLOSED || door.state === DoorState.LOCKED) return true;
    }
  }
  return room?.type === RoomType.MEDICAL;
}

function updateHeadSlugParasite(
  world: World,
  entities: Entity[],
  slug: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  nextId: { v: number },
  state?: GameState,
): boolean {
  if (slug.monsterKind !== MonsterKind.HEAD_SLUG || !slug.ai) return false;
  const ai = slug.ai;
  if (slug.monsterStage === undefined) slug.monsterStage = HEAD_SLUG_HOSTED_STAGE;
  const own = headSlugState.of(slug);
  own.rehostCd = Math.max(0, own.rehostCd - dt);
  own.quarantineCd = Math.max(0, own.quarantineCd - dt);

  if (slug.monsterStage === HEAD_SLUG_HOSTED_STAGE) {
    const maxHp = Math.max(1, slug.maxHp ?? MONSTERS[MonsterKind.HEAD_SLUG].hp);
    if ((slug.hp ?? maxHp) > 0 && (slug.hp ?? maxHp) <= maxHp * HEAD_SLUG_DETACH_HP_RATIO) {
      detachHeadSlug(world, slug, time, msgs, state);
      return true;
    }
    if (slug.parasiteHostSkill !== undefined) slug.speed = MONSTERS[MonsterKind.HEAD_SLUG].speed * slug.parasiteHostSkill;
    return false;
  }

  slug.speed = HEAD_SLUG_DETACHED_SPEED;
  slug.spriteScale = 0.58;
  slug.spriteZ = 0.08;
  if (own.rehostCd <= 0) {
    own.rehostCd = HEAD_SLUG_REHOST_COOLDOWN_SEC;
    const host = findHeadSlugRehostTarget(world, slug);
    if (host) {
      if (world.dist2(slug.x, slug.y, host.x, host.y) <= HEAD_SLUG_ATTACH_RANGE_SQ) {
        rehostHeadSlug(world, entities, slug, host, time, msgs, nextId, state);
        return true;
      }
      ai.goal = AIGoal.HUNT;
      ai.combatTargetId = undefined;
      ai.timer -= dt;
      if (monsterRepathDue(world, slug) || ai.pi >= ai.path.length) {
        assignMonsterPath(world, slug, Math.floor(host.x), Math.floor(host.y), 0.35);
      }
      followMonsterPath(world, slug, dt);
      return true;
    }
    if (own.quarantineCd <= 0 && headSlugQuarantineCell(world, slug)) {
      own.quarantineCd = HEAD_SLUG_QUARANTINE_EVENT_COOLDOWN_SEC;
      publishHeadSlugEvent(state, world, slug, undefined, 'head_slug_quarantined', 3, ['quarantine', 'sealed_room'], {
        rehostRadius: HEAD_SLUG_REHOST_RADIUS,
      });
    }
  }
  return false;
}


function sobrannyyState(e: Entity): SobrannyyRuntime {
  const hp = Math.max(1, e.hp ?? e.maxHp ?? 1);
  let state = sobrannyyRuntime.get(e);
  if (!state) {
    state = {
      lastHp: hp,
      baseSpeed: e.speed,
      dormant: true,
      hitCount: 0,
      hitWindowUntil: 0,
      stacks: 0,
      stackUntil: 0,
      isolatedUntil: 0,
    };
    sobrannyyRuntime.set(e, state);
  }
  return state;
}

function publishSobrannyyEvent(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity | undefined,
  type: 'composite_woke' | 'composite_growth' | 'composite_isolated',
  severity: 3 | 4 | 5,
  tags: string[],
  data?: Record<string, unknown>,
): void {
  if (!state) return;
  publishEvent(state, {
    type,
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target?.id,
    targetName: target ? entityDisplayName(target) : undefined,
    targetFaction: target?.faction,
    monsterKind: MonsterKind.SOBRANNYY,
    severity,
    privacy: isPlayerEntity(target) ? 'local' : 'witnessed',
    tags: ['monster', 'sobrannyy', 'composite', ...tags],
    data: {
      rumorIds: ['ecology_sobrannyy_shelter'],
      counterplay: MONSTERS[MonsterKind.SOBRANNYY]?.counterplay,
      ...data,
    },
  });
}

function wakeSobrannyy(
  world: World,
  e: Entity,
  target: Entity | undefined,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
  reason: string,
): void {
  const runtime = sobrannyyState(e);
  if (!runtime.dormant) return;
  runtime.dormant = false;
  e.spriteScale = Math.max(e.spriteScale ?? 1, 1.08);
  msgs.push(msg('Собранный человек повернул сразу несколько голов. Отходи к слизи или гермопорогу.', time, '#fa4'));
  publishSobrannyyEvent(state, world, e, target, 'composite_woke', 4, ['woke', reason], { reason });
  playSoundAt(playGrowl, e.x, e.y);
}

function sobrannyyRecentRoomActivityWake(world: World, e: Entity, time: number, state: GameState | undefined): string | undefined {
  if (!state) return undefined;
  const room = world.roomAt(e.x, e.y);
  if (!room) return undefined;
  for (const event of getRecentEvents(state, { limit: 16 })) {
    const age = time - event.time;
    if (age < 0 || age > SOBRANNYY_ACTIVITY_WAKE_SEC) continue;
    if (event.actorId === e.id || event.roomId !== room.id) continue;
    if (event.type === 'container_opened' || event.type === 'item_stolen') return 'container';
    if (event.type === 'door_opened') return 'door';
  }
  return undefined;
}

function growSobrannyy(
  world: World,
  e: Entity,
  target: Entity | undefined,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
  reason: string,
): void {
  const runtime = sobrannyyState(e);
  if (runtime.stacks >= SOBRANNYY_MAX_STACKS) {
    runtime.stackUntil = Math.max(runtime.stackUntil, time + SOBRANNYY_STACK_SEC * 0.5);
    return;
  }
  runtime.stacks++;
  runtime.stackUntil = time + SOBRANNYY_STACK_SEC;
  e.monsterDmgMult = 1 + runtime.stacks * 0.2;
  e.speed = runtime.baseSpeed * (1 + runtime.stacks * 0.08);
  e.spriteScale = 1 + runtime.stacks * 0.1;
  msgs.push(msg(`Собранный человек прибавил массу: рост ${runtime.stacks}/${SOBRANNYY_MAX_STACKS}.`, time, '#f84'));
  publishSobrannyyEvent(state, world, e, target, 'composite_growth', 5, ['growth', reason], {
    reason,
    stacks: runtime.stacks,
    maxStacks: SOBRANNYY_MAX_STACKS,
    stackSeconds: SOBRANNYY_STACK_SEC,
  });
}

function updateSobrannyyGrowthState(
  world: World,
  e: Entity,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): void {
  if (e.monsterKind !== MonsterKind.SOBRANNYY) return;
  if (!e.alive || (e.hp ?? 1) <= 0) {
    sobrannyyRuntime.delete(e);
    return;
  }
  const runtime = sobrannyyState(e);
  if (runtime.stacks > 0 && time >= runtime.stackUntil) {
    runtime.stacks = 0;
    runtime.hitCount = 0;
    e.monsterDmgMult = undefined;
    e.speed = runtime.baseSpeed;
    e.spriteScale = undefined;
  } else if (runtime.stacks > 0) {
    e.monsterDmgMult = 1 + runtime.stacks * 0.2;
    e.speed = runtime.baseSpeed * (1 + runtime.stacks * 0.08);
    e.spriteScale = Math.max(e.spriteScale ?? 1, 1 + runtime.stacks * 0.1);
  }

  const hp = e.hp ?? runtime.lastHp;
  if (hp < runtime.lastHp) {
    const loss = runtime.lastHp - hp;
    if (runtime.dormant && loss <= SOBRANNYY_IDLE_CHIP_IGNORE && e.hp !== undefined) {
      e.hp = Math.min(e.maxHp ?? runtime.lastHp, e.hp + loss);
    }
    wakeSobrannyy(world, e, undefined, time, msgs, state, 'damage');
    if (time <= runtime.hitWindowUntil) runtime.hitCount++;
    else runtime.hitCount = 1;
    runtime.hitWindowUntil = time + SOBRANNYY_DAMAGE_WINDOW_SEC;
    if (runtime.hitCount >= 3) {
      runtime.hitCount = 0;
      growSobrannyy(world, e, undefined, time, msgs, state, 'sustained_hits');
    }
  }
  runtime.lastHp = e.hp ?? hp;
}

function closedHermeticDoorBetween(world: World, e: Entity, target: Entity): boolean {
  const a = world.roomAt(e.x, e.y);
  const b = world.roomAt(target.x, target.y);
  if (!a || !b || a.id === b.id) return false;
  for (const idx of a.doors) {
    const door = world.doors.get(idx);
    if (!door || door.state !== DoorState.HERMETIC_CLOSED) continue;
    if (door.roomA === b.id || door.roomB === b.id) return true;
  }
  return false;
}

function sobrannyyIsolationReason(world: World, e: Entity, target: Entity): string | undefined {
  if (entityInActiveCellHazard(world, target, SOBRANNYY_SLIME_TAGS)) return 'slime';
  if (closedHermeticDoorBetween(world, e, target)) return 'hermetic_door';
  return undefined;
}

function weakDoorBetweenRooms(world: World, e: Entity, target: Entity): number | undefined {
  const a = world.roomAt(e.x, e.y);
  const b = world.roomAt(target.x, target.y);
  if (!a || !b || a.id === b.id) return undefined;
  for (const idx of a.doors) {
    const door = world.doors.get(idx);
    if (!door || (door.roomA !== b.id && door.roomB !== b.id)) continue;
    if (door.state === DoorState.CLOSED || door.state === DoorState.LOCKED) return idx;
  }
  return undefined;
}

function trySobrannyyBreakWeakDoor(
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): boolean {
  if ((e.attackCd ?? 0) > 0) return false;
  const doorIdx = weakDoorBetweenRooms(world, e, target);
  if (doorIdx === undefined) return false;
  const dx = doorIdx % W + 0.5;
  const dy = ((doorIdx / W) | 0) + 0.5;
  if (world.dist2(e.x, e.y, dx, dy) > SOBRANNYY_DOOR_BREAK_RANGE_SQ) return false;
  const door = world.doors.get(doorIdx);
  if (!door) return false;
  setDoorState(world, door, DoorState.OPEN);
  door.timer = Math.max(door.timer, 4);
  e.attackCd = 1.8;
  msgs.push(msg('Собранный человек выбил слабую дверь, но гермопорог не тронул.', time, '#f84'));
  if (state) {
    publishEvent(state, {
      type: 'door_opened',
      zoneId: zoneIdAt(world, dx, dy),
      roomId: world.roomMap[doorIdx] >= 0 ? world.roomMap[doorIdx] : undefined,
      x: dx,
      y: dy,
      actorId: e.id,
      actorName: entityDisplayName(e),
      actorFaction: e.faction,
      targetId: target.id,
      targetName: entityDisplayName(target),
      targetFaction: target.faction,
      monsterKind: MonsterKind.SOBRANNYY,
      severity: 3,
      privacy: isPlayerEntity(target) ? 'local' : 'witnessed',
      tags: ['monster', 'sobrannyy', 'door', 'weak_door'],
      data: { doorIdx, counterplay: 'closed_hermetic_door_still_blocks_composite' },
    });
  }
  playSoundAt(playGrowl, e.x, e.y);
  return true;
}

function updateSobrannyyTarget(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): Entity | null {
  if (e.monsterKind !== MonsterKind.SOBRANNYY) return target;
  const runtime = sobrannyyState(e);
  if (runtime.dormant) {
    const noise = findNoiseInvestigationTarget(world, state, e, time);
    if (noise) wakeSobrannyy(world, e, undefined, time, msgs, state, 'noise');
  }
  if (runtime.dormant) {
    const activity = sobrannyyRecentRoomActivityWake(world, e, time, state);
    if (activity) wakeSobrannyy(world, e, target ?? undefined, time, msgs, state, activity);
  }
  if (target && runtime.dormant && world.dist2(e.x, e.y, target.x, target.y) <= SOBRANNYY_WAKE_RADIUS_SQ) {
    wakeSobrannyy(world, e, target, time, msgs, state, 'approach');
  }
  if (runtime.dormant) {
    e.ai!.combatTargetId = undefined;
    e.ai!.path = [];
    e.ai!.goal = AIGoal.IDLE;
    return null;
  }
  if (!target) return null;
  const isolated = sobrannyyIsolationReason(world, e, target);
  if (isolated) {
    e.ai!.combatTargetId = undefined;
    e.ai!.path = [];
    e.ai!.goal = AIGoal.IDLE;
    runtime.hitCount = 0;
    if (time >= runtime.isolatedUntil) {
      runtime.isolatedUntil = time + 8;
      msgs.push(msg(
        isolated === 'slime'
          ? 'Собранный человек потерял цель у слизи. Это окно для отхода или доклада.'
          : 'Гермодверь отрезала Собранного человека. Не открывай обратно.',
        time,
        '#9cf',
      ));
      publishSobrannyyEvent(state, world, e, target, 'composite_isolated', 4, ['isolated', isolated], { reason: isolated });
    }
    return null;
  }
  return target;
}

function clampObzhivalshchikAnger(e: Entity, value: number): number {
  const anger = Math.max(0, Math.min(OBZHIVALSHCHIK_MAX_ANGER, value));
  obzhivalshchikState.of(e).anger = anger;
  return anger;
}

function obzhivalshchikHomeRoom(world: World, e: Entity): Room | undefined {
  const ai = e.ai!;
  if (ai.homeRoomId === undefined) {
    const room = world.roomAt(e.x, e.y);
    if (room) ai.homeRoomId = room.id;
  }
  return ai.homeRoomId !== undefined ? world.rooms[ai.homeRoomId] : undefined;
}

function obzhivalshchikEntityInHome(world: World, room: Room, entity: Entity): boolean {
  return world.roomMap[world.idx(Math.floor(entity.x), Math.floor(entity.y))] === room.id;
}

function obzhivalshchikCanBreach(e: Entity, state: GameState | undefined): boolean {
  const own = obzhivalshchikState.of(e);
  return own.breached
    || own.anger >= OBZHIVALSHCHIK_BREACH_ANGER
    || state?.samosborActive === true;
}

function publishObzhivalshchikEvent(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity | undefined,
  type: 'obzhivalshchik_calmed' | 'obzhivalshchik_breached',
  severity: 2 | 3 | 4 | 5,
  tags: string[],
  data?: Record<string, unknown>,
): void {
  if (!state) return;
  publishEvent(state, {
    type,
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: e.ai?.homeRoomId ?? world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target?.id,
    targetName: target ? entityDisplayName(target) : undefined,
    targetFaction: target?.faction,
    monsterKind: MonsterKind.OBZHIVALSHCHIK,
    severity,
    privacy: isPlayerEntity(target) ? 'local' : 'witnessed',
    tags: ['monster', 'obzhivalshchik', 'room_bound', ...tags],
    data: {
      rumorIds: ['monster_obzhivalshchik_room', 'ecology_obzhivalshchik_growth'],
      counterplay: MONSTERS[MonsterKind.OBZHIVALSHCHIK]?.counterplay,
      anger: Math.round(obzhivalshchikState.of(e).anger),
      growthCount: obzhivalshchikState.of(e).growthCount,
      ...data,
    },
  });
}

function obzhivalshchikLowLight(world: World, e: Entity, state: GameState | undefined): boolean {
  const ci = world.idx(Math.floor(e.x), Math.floor(e.y));
  const hour = state?.clock.hour ?? 0;
  return world.light[ci] < 0.16 || hour >= 22 || hour < 5;
}

function processObzhivalshchikNoise(world: World, e: Entity, time: number, state: GameState | undefined): void {
  const ai = e.ai!;
  const own = obzhivalshchikState.of(e);
  const noise = findNoiseForActor(world, state, e, time, { minSeverity: 1, scanInterval: 0.85, hearingMult: 1.35 });
  if (!noise) return;
  const home = ai.homeRoomId !== undefined ? world.rooms[ai.homeRoomId] : undefined;
  if (home) {
    const noiseRoom = world.roomAt(noise.x, noise.y);
    const nearHome = noiseRoom?.id === home.id || world.dist2(e.x, e.y, noise.x, noise.y) <= 14 * 14;
    if (!nearHome) return;
  }
  if (!takeFreshNoise(e, noise.id)) return;
  const base = noise.source === 'door' ? 14 : noise.source === 'footstep' ? 4 : 8;
  clampObzhivalshchikAnger(e, own.anger + base + noise.severity * 3);
}

function processObzhivalshchikRoomMemory(
  world: World,
  e: Entity,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): void {
  const ai = e.ai!;
  const own = obzhivalshchikState.of(e);
  const memory = getRoomMemory(state?.currentZ, ai.homeRoomId);
  if (!memory || memory.lastEventId === own.lastRoomMemoryEventId) return;
  own.lastRoomMemoryEventId = memory.lastEventId;

  if (roomMemoryHas(memory, ROOM_MEMORY_BITS.THEFT | ROOM_MEMORY_BITS.COMBAT)) {
    clampObzhivalshchikAnger(e, own.anger + 18 + memory.severity * 5);
  }

  if (roomMemoryHas(memory, ROOM_MEMORY_BITS.HELP | ROOM_MEMORY_BITS.INFORM | ROOM_MEMORY_BITS.REPAIR)) {
    const before = own.anger;
    const after = clampObzhivalshchikAnger(e, before - (24 + memory.severity * 8));
    if (after < before) {
      msgs.push(msg('За дверью перестали скрести: доклад или помощь сбили комнатную злость.', time, '#9cf'));
      publishObzhivalshchikEvent(state, world, e, undefined, 'obzhivalshchik_calmed', 3, ['calm', 'report'], {
        roomMemoryBits: memory.bits,
        roomMemorySeverity: memory.severity,
      });
    }
  }
}

function obzhivalshchikGrowthCell(world: World, room: Room, seed: number): { x: number; y: number } | undefined {
  const spanX = Math.max(1, room.w - 2);
  const spanY = Math.max(1, room.h - 2);
  for (let attempt = 0; attempt < 64; attempt++) {
    const side = (seed + attempt) & 3;
    const t = Math.abs(Math.imul(seed + attempt * 37, 1103515245)) >>> 0;
    let x = room.x;
    let y = room.y;
    if (side === 0) {
      x = room.x + 1 + (t % spanX);
      y = room.y - 1;
    } else if (side === 1) {
      x = room.x + 1 + (t % spanX);
      y = room.y + room.h;
    } else if (side === 2) {
      x = room.x - 1;
      y = room.y + 1 + (t % spanY);
    } else {
      x = room.x + room.w;
      y = room.y + 1 + (t % spanY);
    }
    x = world.wrap(x);
    y = world.wrap(y);
    const ci = world.idx(x, y);
    if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.DOOR) return { x, y };
  }
  return undefined;
}

function growObzhivalshchikWallMatter(
  world: World,
  e: Entity,
  room: Room,
  time: number,
  msgs: Msg[],
): void {
  const own = obzhivalshchikState.of(e);
  if (own.growthCount >= OBZHIVALSHCHIK_GROWTH_CAP) return;
  if (own.growthCd > 0) return;

  const growthCount = own.growthCount;
  const seed = 19019 + e.id * 97 + room.id * 31 + growthCount * 53;
  const cell = obzhivalshchikGrowthCell(world, room, seed);
  own.growthCd = Math.max(4, OBZHIVALSHCHIK_GROWTH_CD - Math.min(4, own.anger / 25));
  if (!cell) return;

  stampMark(world, cell.x, cell.y, 0.5, 0.5, 0.42, MarkType.SPLAT, seed, 176, 166, 132, 160, true);
  own.growthCount = growthCount + 1;
  if (own.growthCount === 1 || own.growthCount === OBZHIVALSHCHIK_GROWTH_CAP) {
    msgs.push(msg(`Комнатная слизь расползлась по стене: ${own.growthCount}/${OBZHIVALSHCHIK_GROWTH_CAP}.`, time, '#db9'));
  }
}

function tickObzhivalshchikPressure(
  world: World,
  e: Entity,
  room: Room,
  dt: number,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): void {
  const own = obzhivalshchikState.of(e);
  processObzhivalshchikNoise(world, e, time, state);
  processObzhivalshchikRoomMemory(world, e, time, msgs, state);

  const lowLight = obzhivalshchikLowLight(world, e, state);
  clampObzhivalshchikAnger(e, own.anger + (lowLight ? dt * 0.05 : -dt * 0.02));
  own.growthCd -= dt;
  if (lowLight || own.anger >= 35) growObzhivalshchikWallMatter(world, e, room, time, msgs);

  own.scratchCd -= dt;
  if ((lowLight || own.anger >= 25) && own.scratchCd <= 0) {
    own.scratchCd = OBZHIVALSHCHIK_SCRATCH_CD;
    /* Скрёб и нарост — фон комнаты, а не факт мира: событие
     * `obzhivalshchik_scratched` не читал никто, кроме форматчика строки лога,
     * а публиковалось оно по своему откату у каждого обживальщика. Снято;
     * слышимая часть (строка и рык) осталась. */
    msgs.push(msg('За квартирной стеной скребут длинные пальцы. Не бей дверь без плана.', time, '#db9'));
    playSoundAt(playGrowl, e.x, e.y);
  }
}

function obzhivalshchikRoomCell(world: World, room: Room, seed: number): { x: number; y: number } | undefined {
  const spanX = Math.max(1, room.w - 2);
  const spanY = Math.max(1, room.h - 2);
  for (let attempt = 0; attempt < 32; attempt++) {
    const x = world.wrap(room.x + 1 + Math.abs(seed + attempt * 7) % spanX);
    const y = world.wrap(room.y + 1 + Math.abs(seed * 3 + attempt * 11) % spanY);
    const ci = world.idx(x, y);
    if (world.roomMap[ci] === room.id && !world.solid(x, y)) return { x, y };
  }
  return undefined;
}

function idleObzhivalshchikInRoom(world: World, e: Entity, room: Room, dt: number, time: number): boolean {
  const ai = e.ai!;
  ai.goal = AIGoal.WANDER;
  ai.combatTargetId = undefined;
  ai.timer -= dt;

  const inside = obzhivalshchikEntityInHome(world, room, e);
  if (!inside || monsterRepathDue(world, e) || ai.pi >= ai.path.length) {
    const target = obzhivalshchikRoomCell(world, room, e.id * 17 + Math.floor(time * 3));
    if (!target) return true;
    assignMonsterPath(world, e, target.x, target.y, inside ? 1.5 + ((e.id + Math.floor(time)) % 3) * 0.35 : OBZHIVALSHCHIK_RETURN_CD);
  }
  followMonsterPath(world, e, dt);
  return true;
}

function updateObzhivalshchikTarget(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): Entity | null {
  if (e.monsterKind !== MonsterKind.OBZHIVALSHCHIK) return target;
  const room = obzhivalshchikHomeRoom(world, e);
  if (!room) return target;

  tickObzhivalshchikPressure(world, e, room, dt, time, msgs, state);
  const inside = obzhivalshchikEntityInHome(world, room, e);
  const mayBreach = obzhivalshchikCanBreach(e, state);
  if (!inside && !mayBreach) return null;
  if (!target) return null;
  if (obzhivalshchikEntityInHome(world, room, target)) return target;
  if (!mayBreach) return null;

  const own = obzhivalshchikState.of(e);
  if (!own.breached) {
    own.breached = true;
    msgs.push(msg('Комнатный обживальщик вышел из квартиры. Теперь коридор тоже его.', time, '#f84'));
    publishObzhivalshchikEvent(state, world, e, target, 'obzhivalshchik_breached', 4, ['breach'], {
      reason: state?.samosborActive ? 'samosbor' : 'anger',
    });
  }
  return target;
}

/** Общий пустой список: своей аллокации на каждый вид без слухов не заводим. */
const EMPTY_RUMOR_IDS: readonly string[] = [];

/* Слухи читаемости берутся из АВТОРСКИХ данных экологии, а не из рукописной
 * копии рядом. Копия здесь была — `switch` на 37 веток и 40 констант, — и она
 * молча отстала. Сверка по ВСЕМ видам: 36 совпадений, НОЛЬ случаев «копия знает
 * больше», 36 видов, о которых копия молчала, хотя экология их описывает, и
 * споровый ковёр, потерявший одну наводку. Данные экологии строго содержали
 * копию, поэтому замена ничего не отняла и вернула читаемость половине бестиария. То есть половина бестиария не могла
 * научить игрока контрприёму: слухи прикрепляются к событию «монстра увидели»,
 * и без них увиденное ничему не учит. */
function monsterReadabilityRumorIds(kind: MonsterKind | undefined): readonly string[] {
  return (kind === undefined ? undefined : getMonsterEcology(kind)?.rumorIds) ?? EMPTY_RUMOR_IDS;
}

function monsterReadabilityEventData(
  kind: MonsterKind | undefined,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const rumorIds = monsterReadabilityRumorIds(kind);
  return rumorIds.length > 0 ? { rumorIds: [...rumorIds], ...extra } : { ...extra };
}

/**
 * Событие читаемости монстра. Один публикатор на всех.
 *
 * Рядом стоял `publishBladeEliteEvent` — та же функция слово в слово, с
 * собственным списком слухов и собственной меткой вида. Список слухов
 * совпадал с `MonsterEcologyDef.rumorIds` обоих видов один в один, а метка —
 * это просто первый элемент `tags`, как у всех остальных видов.
 */
function publishMonsterReadabilityEvent(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity | undefined,
  type: 'monster_sighted' | 'monster_windup_interrupted' | 'monster_armor_cut' | 'monster_escaped',
  severity: 3 | 4 | 5,
  tags: string[],
  data?: Record<string, unknown>,
): void {
  if (!state) return;
  publishEvent(state, {
    type,
    zoneId: zoneIdAt(world, e.x, e.y),
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target?.id,
    targetName: target ? entityDisplayName(target) : undefined,
    targetFaction: target?.faction,
    monsterKind: e.monsterKind,
    severity,
    privacy: isPlayerEntity(target) ? 'local' : 'witnessed',
    tags: ['monster', ...tags],
    data: monsterReadabilityEventData(e.monsterKind, data),
  });
}

function nightmareState(e: Entity): NightmareRuntime {
  const hp = Math.max(1, e.hp ?? e.maxHp ?? 1);
  let state = nightmareRuntime.get(e);
  if (!state) {
    state = { lastHp: hp, pressure: 0, lastBreakAt: -Infinity };
    nightmareRuntime.set(e, state);
  }
  return state;
}

function nightmareSamePressureSpace(world: World, e: Entity, target: Entity): boolean {
  const a = world.roomAt(e.x, e.y)?.id;
  const b = world.roomAt(target.x, target.y)?.id;
  return a === b;
}

function publishNightmarePressureBreak(
  world: World,
  e: Entity,
  target: Entity | undefined,
  time: number,
  msgs: Msg[],
  playerId: number,
  state: GameState | undefined,
  reason: string,
): void {
  const runtime = nightmareState(e);
  if (runtime.lastBreakAt > time - 1.2) return;
  runtime.lastBreakAt = time;
  if (target?.id === playerId) {
    msgs.push(msg(
      reason === 'burst_damage'
        ? 'Кошмарище потеряло темп от тяжелого урона. Сейчас решай: добивать или выйти.'
        : 'Дверь, угол или дистанция разорвали давление Кошмарища.',
      time,
      '#9cf',
    ));
  }
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', 4, ['nightmare', 'pressure', reason], {
    reason,
    pressure: Math.round(runtime.pressure * 100) / 100,
    pressureCap: NIGHTMARE_PRESSURE_MAX,
    counterplay: 'burst_damage_or_leave_room_before_pressure_caps',
  });
}

function updateNightmarePressure(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  if (e.monsterKind !== MonsterKind.NIGHTMARE) return;
  if (!e.alive || (e.hp ?? 1) <= 0) {
    nightmareRuntime.delete(e);
    return;
  }

  const runtime = nightmareState(e);
  const hp = e.hp ?? runtime.lastHp;
  const hpLoss = Math.max(0, runtime.lastHp - hp);
  const heavyDamage = hpLoss >= Math.max(NIGHTMARE_HEAVY_DAMAGE_BREAK, (e.maxHp ?? hp) * NIGHTMARE_HEAVY_DAMAGE_RATIO);
  if (heavyDamage && runtime.pressure > 0) {
    runtime.pressure = Math.max(0, runtime.pressure - 2.5);
    e.attackCd = Math.max(e.attackCd ?? 0, 0.55);
    e.spriteScale = 0.92;
    publishNightmarePressureBreak(world, e, target ?? undefined, time, msgs, playerId, state, 'burst_damage');
  }
  runtime.lastHp = hp;

  const closeTarget = !!target?.alive &&
    world.dist2(e.x, e.y, target.x, target.y) <= NIGHTMARE_PRESSURE_RANGE * NIGHTMARE_PRESSURE_RANGE &&
    nightmareSamePressureSpace(world, e, target);



  const before = runtime.pressure;
  if (closeTarget) {
    runtime.pressure = Math.min(NIGHTMARE_PRESSURE_MAX, runtime.pressure + dt * NIGHTMARE_PRESSURE_GAIN);
    if (target?.id === playerId && e.ai?.lastSeenTargetId !== playerId) {
      e.ai!.lastSeenTargetId = playerId;
      msgs.push(msg('Кошмарище давит комнату. Длинный бой кормит его: тяжелый урон или выход.', time, '#fa4'));
      publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['nightmare', 'pressure', 'warning'], {
        pressureCap: NIGHTMARE_PRESSURE_MAX,
        counterplay: 'burst_damage_or_leave_room',
      });
    }
  } else {
    runtime.pressure = Math.max(0, runtime.pressure - dt * NIGHTMARE_PRESSURE_DECAY);
    if (before >= 1 && runtime.pressure <= 0.2) {
      publishNightmarePressureBreak(world, e, target ?? undefined, time, msgs, playerId, state, 'left_room_or_range');
    }
    if (target?.id !== playerId) e.ai!.lastSeenTargetId = undefined;
  }

  if (runtime.pressure > 0) {
    e.monsterDmgMult = 1 + runtime.pressure * 0.1;
    e.spriteScale = 1 + runtime.pressure * 0.035;
  } else {
    e.monsterDmgMult = undefined;
    if (e.spriteScale !== 0.92) e.spriteScale = undefined;
  }
}

/* Растеризация луча одна на всю игру — `world/line_of_sight`. Своя копия здесь
 * шагала пробами через полклетки и не проверяла КОНЦЫ отрезка: цель, стоящая в
 * бетоне, читалась как видимая, а первая проба падала внутрь клетки самого
 * наблюдателя. Общий обход проходит ровно пересечённые клетки. */
/**
 * Линия до цели. `coverBlocks` — единственное, чем отличались два предиката.
 *
 * Их было два: `hasClearLine` (только бетон и створки) и `hasClearLineOfFire`
 * (плюс мебель — шкаф, машина, аппарат, стол, стойка). Разница между ними не
 * свойство КОДА, а свойство ВИДА, и теперь она колонка `MonsterWindupDef`:
 * пилы Кострореза режут сквозь стол, клинки Сейфгарда — нет.
 *
 * ВНИМАНИЕ, АСИММЕТРИЯ ПО РЕШЕНИЮ ВЛАДЕЛЬЦА (не «забытое место»).
 * У людей мебель линию огня больше НЕ рвёт — она портит прицел. У монстров
 * поведение оставлено прежним: стол по-прежнему запрещает выстрел. Менять это
 * значит менять баланс, а не чинить баг, поэтому решение отложено до владельца.
 * Когда решит — здесь достаточно снять `=== 0` и перейти на `>= 0`.
 */
export function hasClearLine(
  world: World,
  e: Entity,
  target: Entity,
  maxDist: number,
  coverBlocks = false,
): boolean {
  return coverBlocks
    ? lineCoverCells(world, e.x, e.y, target.x, target.y, maxDist) === 0
    : hasLineOfSight(world, e.x, e.y, target.x, target.y, maxDist);
}

export interface LineThreatContext {
  distance: number;
  inRange: boolean;
  los: boolean;
  coverBroken: boolean;
  targetLight: number;
  litTarget: boolean;
}

/**
 * Обстановка на линии: дистанция, дальность, линия и свет цели.
 *
 * Третьим ПРЕДИКАТОМ это не является — это связка над тем же `hasClearLine`,
 * которая заодно считает то, что иначе каждый вид считал бы у себя. Живёт
 * отдельно ровно потому, что её читателям нужны ещё дистанция и свет.
 */
export function lineThreatContext(
  world: World,
  e: Entity,
  target: Entity,
  maxRange: number,
  minRange = 0,
  coverBlocks = true,
): LineThreatContext {
  const dx = world.delta(e.x, target.x);
  const dy = world.delta(e.y, target.y);
  const distance = Math.sqrt(dx * dx + dy * dy);
  const inRange = distance <= maxRange && distance > minRange;
  const los = inRange && hasClearLine(world, e, target, maxRange, coverBlocks);
  let targetLight = entityLight(world, target);
  if (nearFeature(world, target, Feature.LAMP, 1)) targetLight = Math.max(targetLight, 0.62);
  if (nearFeature(world, target, Feature.CANDLE, 1)) targetLight = Math.max(targetLight, 0.48);
  return {
    distance,
    inRange,
    los,
    coverBroken: inRange && !los,
    targetLight,
    litTarget: targetLight >= LAMPOGLAZ_LIGHT_LOCK,
  };
}

function isDocumentPressureHunter(e: Entity): boolean {
  return hasAIFlag(e, 'documentHunter') || hasAIFlag(e, 'documentScent') || hasAIFlag(e, 'protocolPressure');
}

export function protokolnikDocumentPressure(target: Entity | undefined): number {
  return documentScentStrength(target);
}

export function protokolnikPressureCap(documentPressure: number): number {
  return Math.min(PROTOKOLNIK_PRESSURE_MAX, PROTOKOLNIK_PRESSURE_SAFE_CAP + Math.max(0, documentPressure) * 5.8);
}

function protokolnikPressureTier(pressure: number): number {
  return Math.max(0, Math.min(4, Math.floor(pressure / PROTOKOLNIK_PRESSURE_WARN_STEP)));
}

function protokolnikHasProtocolLine(world: World, e: Entity, target: Entity): boolean {
  if (world.dist2(e.x, e.y, target.x, target.y) > PROTOKOLNIK_PRESSURE_RANGE_SQ) return false;
  return hasClearLine(world, e, target, PROTOKOLNIK_PRESSURE_RANGE, true);
}

function protokolnikPressureMessage(pressure: number, documentPressure: number): string {
  if (pressure >= 75) return 'Протокольник почти закрыл протокол. Бумаги в кармане давят как чужая подпись.';
  if (pressure >= 50) return documentPressure > 0
    ? 'Протокольник ускорил страницы вокруг вас. Спрячьте документы или уходите за дверь.'
    : 'Протокольник держит пустой протокол. Долгий бой все равно кормит ПСИ-давление.';
  return documentPressure > 0
    ? 'Протокольник нашел ваши бумаги. Чем дольше бой, тем тяжелее протокол.'
    : 'Протокольник начал сверку без бумаг. Короткий бой или выход пока безопаснее.';
}

function publishProtokolnikEscaped(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity | undefined,
  pressure: number,
  documentPressure: number,
): void {
  if (!state) return;
  publishEvent(state, {
    type: 'monster_escaped',
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target?.id,
    targetName: target ? entityDisplayName(target) : undefined,
    targetFaction: target?.faction,
    monsterKind: MonsterKind.PROTOKOLNIK,
    severity: 4,
    privacy: 'local',
    tags: ['monster', 'protokolnik', 'protocol_pressure', 'escaped'],
    data: monsterReadabilityEventData(MonsterKind.PROTOKOLNIK, {
      protocolPressure: Math.round(pressure),
      documentPressure: Math.round(documentPressure * 10) / 10,
      counterplay: 'left_room_or_broke_line_before_protocol_closed',
    }),
  });
}

function publishProtokolnikPressure(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity,
  pressure: number,
  exposure: number,
  documentPressure: number,
): void {
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['protokolnik', 'protocol_pressure', 'documents'], {
    protocolPressure: Math.round(pressure),
    protocolExposure: Math.round(exposure * 10) / 10,
    documentPressure: Math.round(documentPressure * 10) / 10,
    pressureCap: Math.round(protokolnikPressureCap(documentPressure)),
    counterplay: 'drop_or_stash_documents_burst_or_leave_room',
  });
}

/* Давление копится на любого, кто держит строку протокола, поэтому и пульс
 * прилетает любому. Игроку он раньше доставался один: NPC жгли кулдаун сверки
 * и уходили целыми. */
function applyProtokolnikPulse(
  world: World,
  state: GameState | undefined,
  e: Entity,
  target: Entity,
  pressure: number,
  documentPressure: number,
  time: number,
  msgs: Msg[],
  playerId: number,
): void {
  if (target.hp === undefined) return;
  /* Своя формула по существу: пульс считает не урон вида, а НАБРАННОЕ давление
   * и вес бумаг на цели. Десятая доля — шаг этого удара, он единственный бьёт
   * дробным числом.
   *
   * Потолок здесь был мёртвым числом. Давление ограничено сотней
   * (`PROTOKOLNIK_PRESSURE_MAX`), вес бумаг — десяткой (`documentScentStrength`),
   * значит максимум суммы 0.65 + 2.4 + 0.8 = 3.85, и `min(4, …)` не срабатывал
   * НИ РАЗУ. Вместе с ним снят и охранник `dmg <= 0`: пульс бьёт только с
   * порога 35, то есть не ниже 1.5. */
  const dmg = Math.round((0.65 + pressure * 0.024 + documentPressure * 0.08) * 10) / 10;
  applyMonsterStrike(world, state, e, target, dmg, MONSTERS[MonsterKind.PROTOKOLNIK].strike!, time, msgs, playerId);
  if (target.id === playerId) msgs.push(msg(`Протокол давит: -${dmg}. Бумаги усиливают сверку.`, time, '#d8a4ff'));
  playSoundAt(playHostilePsiCast, e.x, e.y);
}

/* Давление протокола: сколько на тебя уже составлено и как давно. Свойство
 * одного вида — держится рядом с ним, в ядре его нет. */
interface ProtokolnikState {
  pressure: number;
  exposure: number;
  pulseCd: number;
  warnAt: number;
}
const protokolnikState = speciesState<ProtokolnikState>(() => ({
  pressure: 0, exposure: 0, pulseCd: 0, warnAt: PROTOKOLNIK_PRESSURE_WARN_STEP,
}));

/** Набранное давление протокола: путь для отладки и тестов. */
export function peekProtokolnikPressure(e: Entity): number {
  return protokolnikState.peek(e)?.pressure ?? 0;
}

export function updateProtokolnikProtocolPressure(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  if (!hasAIFlag(e, 'protocolPressure') || !e.ai || dt <= 0) return;
  const ai = e.ai;
  const protocol = protokolnikState.of(e);
  const pressureBefore = protocol.pressure;
  const exposureBefore = protocol.exposure;
  const active = !!target && target.alive && protokolnikHasProtocolLine(world, e, target);
  const documentPressure = protokolnikDocumentPressure(active ? target ?? undefined : _entityById.get(playerId));

  if (!active) {
    if (ai.lastSeenTargetId === playerId && pressureBefore >= 18) {
      const player = _entityById.get(playerId);
      msgs.push(msg('Протокольник потерял строку протокола: дверь, шкаф или дистанция дали окно.', time, '#9cf'));
      publishProtokolnikEscaped(state, world, e, player, pressureBefore, documentPressure);
    }
    ai.lastSeenTargetId = undefined;
    protocol.exposure = Math.max(0, exposureBefore - dt * 1.6);
    protocol.pressure = Math.max(0, pressureBefore - PROTOKOLNIK_PRESSURE_DECAY * dt);
    if (protocol.pressure <= 0.05) {
      protokolnikState.forget(e);
      e.protocolPressureTier = 0;
    } else {
      e.protocolPressureTier = protokolnikPressureTier(protocol.pressure);
      if (protocol.pressure < PROTOKOLNIK_PRESSURE_WARN_STEP * 0.55) protocol.warnAt = PROTOKOLNIK_PRESSURE_WARN_STEP;
    }
    return;
  }

  const pressureCap = protokolnikPressureCap(documentPressure);
  const exposure = Math.min(90, exposureBefore + dt);
  let pressure = pressureBefore;
  if (pressure > pressureCap) {
    pressure = Math.max(pressureCap, pressure - PROTOKOLNIK_CAP_DECAY * dt);
  } else {
    const growth = 0.85 + documentPressure * 0.72 + Math.min(3.4, exposure * 0.045);
    pressure = Math.min(pressureCap, pressure + growth * dt);
  }
  pressure = Math.min(PROTOKOLNIK_PRESSURE_MAX, pressure);

  protocol.exposure = exposure;
  protocol.pressure = pressure;
  e.protocolPressureTier = protokolnikPressureTier(pressure);
  if (target.id === playerId) ai.lastSeenTargetId = playerId;

  const warnAt = protocol.warnAt;
  if (target.id === playerId && pressure >= warnAt) {
    msgs.push(msg(protokolnikPressureMessage(pressure, documentPressure), time, '#d8a4ff'));
    publishProtokolnikPressure(state, world, e, target, pressure, exposure, documentPressure);
    protocol.warnAt = warnAt + PROTOKOLNIK_PRESSURE_WARN_STEP;
  } else if (pressure < PROTOKOLNIK_PRESSURE_WARN_STEP * 0.55) {
    protocol.warnAt = PROTOKOLNIK_PRESSURE_WARN_STEP;
  }

  protocol.pulseCd -= dt;
  if (pressure >= PROTOKOLNIK_PRESSURE_PULSE_THRESHOLD && protocol.pulseCd <= 0) {
    protocol.pulseCd = PROTOKOLNIK_PRESSURE_PULSE_CD;
    applyProtokolnikPulse(world, state, e, target, pressure, documentPressure, time, msgs, playerId);
  }
}

function updateNelyudCloseReveal(
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
  state?: GameState,
): void {
  if (!hasAIFlag(e, 'closeReveal') || !e.ai) return;
  if (e.ai.lastSeenTargetId === target.id) return;
  if (world.dist2(e.x, e.y, target.x, target.y) > NELYUD_REVEAL_SQ) return;

  e.ai.lastSeenTargetId = target.id;
  if (isPlayerEntity(target)) {
    msgs.push(msg('Сосед перестал моргать. Нелюдь раскрылась слишком близко; держите свет, свидетеля и выход.', time, '#f84'));
  }
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', isPlayerEntity(target) ? 4 : 3, ['nelyud', 'close_reveal', 'mimic_threshold'], {
    reason: 'close_distance_reveal',
    light: Math.round(Math.max(entityLight(world, e), entityLight(world, target)) * 100) / 100,
    counterplay: 'distance_light_witness_exit',
  });
}

/**
 * Маскировка Чёрного ликвидатора держится на свидетелях.
 *
 * Пока рядом есть посторонние, он неотличим от настоящего обхода — и настоящие
 * ликвидаторы его не трогают (`looksLiquidator` в проверке враждебности). Стоит
 * жертве остаться одной — или самому попасть под удар — форма сбрасывается, и
 * дальше это обычный враждебный монстр.
 *
 * Своих полей вид не заводит: режим различает существующий `monsterStage`, а
 * «меня били» берётся из общей памяти угроз. Проверка идёт не каждый кадр —
 * раз в пару секунд, вразнобой по id.
 */
function updateBlackLiquidatorDisguise(world: World, e: Entity, time: number): void {
  if (e.monsterStage === BLACK_LIQUIDATOR_REVEALED_STAGE) return;
  if (getRecentCombatThreat(e, time)) {
    e.monsterStage = BLACK_LIQUIDATOR_REVEALED_STAGE;
    return;
  }
  if ((Math.floor(time * 2) + e.id) % 4 !== 0) return;

  const count = getEntityIndex().queryRadiusCapped(
    e.x, e.y, BLACK_LIQUIDATOR_WITNESS_RADIUS, disguiseWitnessQuery, ENTITY_MASK_ACTOR, BLACK_LIQUIDATOR_WITNESS_CAP,
  );
  let witnesses = 0;
  for (let i = 0; i < count; i++) {
    const other = disguiseWitnessQuery[i];
    if (!other.alive || other.id === e.id || other.type === EntityType.MONSTER) continue;
    if (world.dist2(e.x, e.y, other.x, other.y) > BLACK_LIQUIDATOR_WITNESS_RADIUS * BLACK_LIQUIDATOR_WITNESS_RADIUS) continue;
    witnesses++;
    if (witnesses > 1) return; // есть кому заметить — форма держится
  }
  // Один на один (или вовсе никого) — притворяться больше не перед кем.
  e.monsterStage = BLACK_LIQUIDATOR_REVEALED_STAGE;
}

/* ── Семья спецударов: одно применение вместо одиннадцати ──────────
 *
 * «Посчитать урон, провести его дверью, записать игроку, добить, брызнуть
 * кровью и сказать в лог» было написано ОДИННАДЦАТЬ раз: пульс Протокольника,
 * корень Кровавого растения, сок Борщевика, рывок Ржавника, бросок Жорной,
 * рез замаха Кострореза и Сейфгарда, мокрая линия Водяного, луч и тычок
 * Слепоглаза, удар Тонкой Тени, спринт Трескотника.
 *
 * Расхождения между копиями замыслом не были. Записи урона игроку не хватало
 * ровно на СМЕРТЕЛЬНОМ ударе мокрой линии — экран смерти называл не того;
 * отладочное бессмертие игрока проверяли десять из одиннадцати, а два из этих
 * десяти всё равно лили кровь мимо проверки; клампа `hp = 0` не было у одного.
 * Здесь всё это одно, а тексты и кровь — колонки `MonsterDef.strike` в файле
 * самого вида.
 */

/** Подстановка имён в строку удара: `%s` — бьющий, `%t` — цель. */
function strikeLine(template: string, e: Entity, target: Entity): string {
  return template.replace('%s', entityDisplayName(e)).replace('%t', entityDisplayName(target));
}

/**
 * Урон спецудара по общей формуле вида.
 *
 * Уровень, сила, множитель удара, текущий множитель урона твари и скидка кожи
 * желемыши на цели — пять сомножителей, и все пять принадлежат не удару, а
 * бьющему и бьющемуся. Копий этой строки было девять.
 */
function monsterStrikeDamage(e: Entity, target: Entity, time: number, base: number, mult = 1): number {
  const level = e.rpg?.level ?? 1;
  const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
  return zhelemishIncomingMeleeDamage(
    target, time,
    Math.round(scaleMonsterDmg(base, level) * strMult * mult * (e.monsterDmgMult ?? 1)),
  );
}

/**
 * Приложить спецурон: единственное место, где это делается.
 *
 * `hitAngle` — направление брызг, если удар знает его лучше геометрии (луч
 * Слепоглаза бьёт вдоль своей оси, а не от твари к цели). `hitLine` — строка
 * попадания того, кому она нужна ПЕРЕД строкой убийства; остальные печатают
 * свою после и делают это сами, потому что говорят они о состоявшемся УДАРЕ,
 * а не о прошедшем уроне, и печатаются даже под отладочным бессмертием.
 *
 * Возвращает `false`, если урон не пошёл: цель без здоровья или отладочное
 * бессмертие игрока. Последствия удара (событие читаемости, самоурон, откат)
 * вызывающий вешает на этот ответ.
 */
function applyMonsterStrike(
  world: World,
  state: GameState | undefined,
  e: Entity,
  target: Entity,
  dmg: number,
  strike: MonsterStrikeDef,
  time: number,
  msgs: Msg[],
  playerId: number,
  hitAngle?: number,
  hitLine?: string,
  hitColor?: string,
): boolean {
  if (target.hp === undefined) return false;
  if (target.id === playerId && isDebugOnePunchManEnabled()) {
    keepDebugOnePunchManAlive(target);
    return false;
  }
  damageActor(world, state, target, { damage: dmg, source: 'monster_special', attacker: e, time });
  if (target.id === playerId && strike.hurt !== undefined) {
    recordPlayerDamage(state, e, dmg, `${strikeLine(strike.hurt, e, target)}: -${dmg}`);
  }
  // Дверь смерти игрока не объявляет — у неё своя дорога; клампом здоровья
  // спецудар закрывает шкалу, а не решает судьбу.
  if (target.hp <= 0) {
    killEntity(target);
    target.hp = 0;
  }
  if (strike.blood !== false) {
    /* Пол `Math.max(1, dmg)` стоял у двух копий из восьми и был мёртвым: самый
     * слабый спецудар из бьющих по телу — слепой тычок Слепоглаза (7), самый
     * сильный гаситель — озноб хладонца (×0.55), то есть ниже четырёх урон не
     * опускается ни в одной комбинации. Осталась форма большинства — сырой урон. */
    spawnBloodHit(
      world, target.x, target.y,
      hitAngle ?? Math.atan2(world.delta(e.y, target.y), world.delta(e.x, target.x)),
      dmg, target.type === EntityType.MONSTER,
    );
  }
  if (hitLine !== undefined) msgs.push(msg(hitLine, time, hitColor ?? '#f44'));
  if (target.hp <= 0 && strike.kill !== undefined) {
    msgs.push(msg(strikeLine(strike.kill, e, target), time, strike.killColor ?? '#f44'));
  }
  return true;
}

function cutMetalSheet(target: Entity): boolean {
  if (!target.inventory) return false;
  for (let i = 0; i < target.inventory.length; i++) {
    const slot = target.inventory[i];
    if (slot.defId !== 'metal_sheet' || slot.count <= 0) continue;
    slot.count--;
    if (slot.count <= 0) target.inventory.splice(i, 1);
    return true;
  }
  return false;
}

/** Пускает ли смотрящий `hunter` кандидата `other` в цели. Второй аргумент
 *  необязателен для вызывающего: фильтр арности 1 подходит по типу. */
export type CombatTargetFilter = (other: Entity, hunter: Entity) => boolean;

export function findCombatTarget(
  world: World, entities: Entity[], e: Entity, dt: number,
  rangeSq: number, scanCd: number,
  typeFilter: CombatTargetFilter,
): Entity | null {
  const ai = e.ai!;
  let target: Entity | null = null;

  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatTargetId !== undefined) {
    const cached = _entityById.get(ai.combatTargetId);
    if (cached && cached.alive && typeFilter(cached, e)) {
      const d2 = world.dist2(e.x, e.y, cached.x, cached.y);
      if (d2 < rangeSq && isHostile(e, cached)) { target = cached; }
    }
    if (!target) ai.combatTargetId = undefined;
  }

  ai.immediateScanCd = (ai.immediateScanCd ?? 0) - dt;
  if (!target && ai.combatScanCd! > 0 && ai.immediateScanCd <= 0) {
    ai.immediateScanCd = 0.1; // Check for immediate threats 10 times a second, not every frame
    target = findImmediateCombatTarget(world, e, Math.min(rangeSq, IMMEDIATE_THREAT_RADIUS_SQ), typeFilter);
    if (target) {
      ai.combatTargetId = target.id;
      ai.goal = AIGoal.HUNT;
      ai.combatScanCd = Math.min(ai.combatScanCd!, 0.15);
      return target;
    }
  }

  // Always rescan periodically to switch to closer targets
  if (ai.combatScanCd! <= 0) {
    ai.combatScanCd = scanCd;
    let newTarget: Entity | null = null;
    let newBest = rangeSq;
    const queryMask = combatTargetQueryMask(typeFilter);
    const range = Math.sqrt(rangeSq);
    // Видит ли смотрящий сквозь стены — свойство его самого, а не кандидата.
    // Раньше обе справки о фазе и корень из радиуса брались заново на каждого
    // кандидата в цикле; справки чистые, ответ тот же.
    const seesThroughWalls = hasAIFlag(e, 'noclip') || !!e.phasing;
    ensureEntityIndex(entities).queryRadiusCapped(e.x, e.y, range, combatQuery, queryMask, COMBAT_TARGET_SCAN_CAP);
    for (const other of combatQuery) {
      if (!other.alive || other.id === e.id) continue;
      if (!typeFilter(other, e)) continue;
      const d2 = world.dist2(e.x, e.y, other.x, other.y);
      if (d2 >= newBest) continue;
      if (!isHostile(e, other)) continue;
      if (!seesThroughWalls && !hasClearLine(world, e, other, range)) continue;
      newBest = d2;
      newTarget = other;
    }
    if (newTarget && (!target || newBest < world.dist2(e.x, e.y, target.x, target.y) * 0.72)) {
      target = newTarget;
      ai.combatTargetId = newTarget.id;
    }
  }

  // Беззвучный не чует и не слышит: цель у него только та, что в глазах.
  // Ушёл за угол — потерян насовсем, второго канала у него нет.
  if (target && hasAIFlag(e, 'silent') && !hasClearLine(world, e, target, Math.sqrt(rangeSq))) {
    ai.combatTargetId = undefined;
    target = null;
  }
  return target;
}

function findImmediateCombatTarget(
  world: World,
  e: Entity,
  rangeSq: number,
  typeFilter: CombatTargetFilter,
): Entity | null {
  let target: Entity | null = null;
  let best = rangeSq;
  const queryMask = combatTargetQueryMask(typeFilter);
  const range = Math.sqrt(rangeSq);
  const seesThroughWalls = hasAIFlag(e, 'noclip') || !!e.phasing;
  const count = getEntityIndex().queryRadiusCapped(
    e.x, e.y, range, immediateTopCandidates, queryMask, IMMEDIATE_THREAT_SCAN_CAP
  );
  for (let i = 0; i < count; i++) {
    const other = immediateTopCandidates[i];
    if (!other.alive || other.id === e.id) continue;
    if (!typeFilter(other, e)) continue;
    if (!isHostile(e, other)) continue;
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    if (d2 >= best) continue;
    if (!seesThroughWalls && !hasClearLine(world, e, other, range)) continue;
    best = d2;
    target = other;
  }
  return target;
}



function canBeMonsterTarget(other: Entity): boolean {
  return isPlayerEntity(other) || other.type === EntityType.NPC;
}

/* Хищник ест не только людей.
 *
 * Пищевая цепь объявлена одним полем экологии (`preyTags`), и вся её проверка —
 * пересечение тегов. Маска скана расширяется до монстров ТОЛЬКО у видов, у
 * которых это поле есть: остальные по-прежнему ходят по узкой маске NPC и не
 * платят кадром за перебор тварей, которых они всё равно не тронут. */
function canBePreyMonsterTarget(other: Entity, hunter: Entity): boolean {
  if (isPlayerEntity(other) || other.type === EntityType.NPC) return true;
  return other.type === EntityType.MONSTER && monsterPreysOn(hunter.monsterKind, other.monsterKind);
}

/* Монстру с ОБЪЯВЛЕННОЙ фракцией враги — тоже монстры (`isHostile` пускает такую
 * пару в матрицу отношений). Дефолтная экология других монстров не сканирует
 * вовсе, и запрос у неё идёт по узкой маске NPC; расширять его всем подряд
 * значит платить кадром за то, чего в обычной игре не бывает. */
function canBeFactionMonsterTarget(other: Entity): boolean {
  return isPlayerEntity(other) || other.type === EntityType.NPC || other.type === EntityType.MONSTER;
}

function monsterTargetFilter(e: Entity): CombatTargetFilter {
  if (hasAIFlag(e, 'sided') && e.faction !== undefined) return canBeFactionMonsterTarget;
  return monsterHuntsBeasts(e.monsterKind) ? canBePreyMonsterTarget : canBeMonsterTarget;
}

function combatTargetQueryMask(typeFilter: CombatTargetFilter): number {
  return typeFilter === canBeMonsterTarget ? ENTITY_MASK_NPC : ENTITY_MASK_ACTOR;
}

/* Вторая реализация того же вопроса — снята: спрашивает общий
 * `monsterHasAIFlag`, у которого флаги вида испечены в множество. Локальное имя
 * оставлено ради читаемости сотни мест, где оно уже стоит. */
const hasAIFlag = monsterHasAIFlag;

/**
 * Каданс скана целей. Своё число вид объявляет ДАННЫМИ (`MonsterDef.scanSec`);
 * здесь остались только те, у кого каданс — следствие повадки, а не вида, и
 * потому висит на флаге поведения. Никакого `switch` по видам тут больше нет:
 * новый вид объявляет свою частоту в дефе и в общий AI не заглядывает.
 */
function fixedScanCd(e: Entity): number | undefined {
  const declared = e.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.scanSec : undefined;
  if (declared !== undefined) return declared;
  if (hasAIFlag(e, 'wallBias')) return 1.1;
  if (hasAIFlag(e, 'lampPowered')) return 1.2;
  if (hasAIFlag(e, 'lightLock')) return 0.85;
  if (hasAIFlag(e, 'blackWaterWake')) return 0.75;
  if (hasAIFlag(e, 'waterPressureLine')) return 0.8;
  if (hasAIFlag(e, 'waterStrider')) return 1.3;
  if (hasAIFlag(e, 'slimeStrider')) return 1.15;
  if (hasAIFlag(e, 'rangedClause')) return 1.4;
  if (hasAIFlag(e, 'officeField')) return 1.1;
  if (hasAIFlag(e, 'debrisLurker')) return 1.25;
  if (hasAIFlag(e, 'lastSoundBeam')) return 0.85;
  if (hasAIFlag(e, 'baitLine')) return 0.75;
  if (hasAIFlag(e, 'strikeReveal')) return 0.75;
  if (hasAIFlag(e, 'meatWorm')) return 0.95;
  if (hasAIFlag(e, 'lightFollower')) return LISHENNYY_SCAN_SEC;
  return undefined;
}

export function deterministicScanCd(id: number, base: number, spread: number): number {
  const h = Math.imul(id ^ 0x9E3779B9, 0x85EBCA6B) >>> 0;
  return base + ((h & 1023) / 1023) * spread;
}

function hasDocumentLikeItem(e: Entity): boolean {
  return hasDocumentScent(e);
}

/** Объявленная дальность вида, в квадрате. Единственный источник числа —
 *  деф вида; охотник за документами меряет своё чутьё тем же самым. */
function declaredDetectSq(e: Entity, fallback: number): number {
  const declared = e.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.detect : undefined;
  return declared !== undefined ? declared * declared : fallback;
}

function documentDetectSq(e: Entity): number {
  return declaredDetectSq(e, MONSTER_DETECT_SQ);
}

function documentFallbackSq(e: Entity): number {
  if (hasAIFlag(e, 'protocolPressure')) return PROTOKOLNIK_FALLBACK_SQ;
  return hasAIFlag(e, 'documentScent') ? KONTORSHCHIK_FALLBACK_SQ : PECHATEED_FALLBACK_SQ;
}

/**
 * Вес обстановки в точке мира по строке вида.
 *
 * Здесь стояла таблица `RoomType → число` (`switch` на пять веток), список
 * годных признаков и тройка литералов их веса — три записи одного знания в
 * общем боевом такте. Осталась одна, и она в дефе вида (`MonsterDef.affinity`).
 *
 * Строку приносит ТВАРЬ, а точку меряют любую: поле идола считает и клетки под
 * собой, и клетки под жертвой, а жертва своей строки обстановки не имеет.
 */
function affinityZoneScore(world: World, affinity: MonsterAffinityDef, x: number, y: number, radius: number): number {
  const ex = Math.floor(x);
  const ey = Math.floor(y);
  let score = affinity.rooms?.[world.roomAt(x, y)?.type as RoomType] ?? 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      score += affinity.features?.[world.features[world.idx(ex + dx, ey + dy)] as Feature] ?? 0;
    }
  }
  return Math.min(affinity.cap, score);
}

function officeFieldPressure(world: World, e: Entity, target?: Entity): number {
  const affinity = e.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.affinity : undefined;
  if (!affinity || !hasAIFlag(e, 'officeField')) return 1;
  let score = affinityZoneScore(world, affinity, e.x, e.y, 2);
  if (target) {
    score += affinityZoneScore(world, affinity, target.x, target.y, 1) * 0.55;
    if (hasDocumentLikeItem(target)) score += 1.1;
    if (world.dist2(e.x, e.y, target.x, target.y) <= KANTSELYARSKIY_IDOL_MIN_RANGE * KANTSELYARSKIY_IDOL_MIN_RANGE) score -= 1.2;
  }
  return Math.max(0.72, Math.min(1.55, 0.84 + score * 0.16));
}

function officeFieldShotRange(world: World, e: Entity, target: Entity): number {
  if (!hasAIFlag(e, 'officeField')) return RANGED_SHOT_RANGE;
  return Math.min(19, KANTSELYARSKIY_IDOL_BASE_RANGE + (officeFieldPressure(world, e, target) - 1) * 8);
}

function officeFieldEventData(world: World, e: Entity, target: Entity): Record<string, unknown> {
  if (!hasAIFlag(e, 'officeField')) return {};
  return {
    systemTag: 'office_field',
    officeFieldPressure: Math.round(officeFieldPressure(world, e, target) * 100) / 100,
    targetCarriesPaper: hasDocumentLikeItem(target),
    counterplay: 'cabinet_wall_close_or_drop_papers',
  };
}

/* Состояние Червия — рядом с видом, а не в ядре.
 *
 * Раньше это были ЧЕТЫРЕ поля `AIState` у каждого актора игры: откат импульса и
 * закэшированный ответ «цела ли сеть» вместе с координатами якоря. Ответ теперь
 * читается из мира в кадре общим `monsterAnchored`, а координаты не читал никто,
 * кроме собственной метки. Осталось ровно то, что из мира не выводится: откат и
 * ПРОШЛЫЙ ответ, по которому ловится сам перелом — включение и обрыв линии. */
interface ChervieState {
  pulseCd: number;
  powered: boolean;
}
const chervieState = speciesState<ChervieState>(() => ({ pulseCd: 0, powered: false }));

/** Откат импульса: путь для отладки и тестов, как у давления Протокольника. */
export function peekCherviePulseCd(e: Entity): number {
  return chervieState.peek(e)?.pulseCd ?? 0;
}

function chervieSignalEventData(anchor: MonsterAnchorPoint | undefined, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    rumorIds: [...monsterReadabilityRumorIds(MonsterKind.CHERVIE_AVATAR)],
    sourceX: anchor?.x,
    sourceY: anchor?.y,
    sourceFeature: anchor?.feature,
    sourceRadius: CHERVIE_NET_SOURCE_RADIUS,
    pulseRadius: CHERVIE_MIND_PULSE_RADIUS,
    counterplay: 'break_screen_line_or_destroy_apparatus_then_use_energy',
    ...extra,
  };
}

/** Перелом линии: включилась или оборвалась. Сам ответ приходит из мира. */
function publishChervieNetEdge(
  world: World, e: Entity, anchor: MonsterAnchorPoint | undefined,
  time: number, msgs: Msg[], player: Entity | undefined, state?: GameState,
): void {
  if (anchor) {
    if (player && world.dist2(e.x, e.y, player.x, player.y) <= MONSTER_DETECT_SQ) {
      const label = anchor.feature === Feature.APPARATUS ? 'серверный аппарат' : 'экран';
      msgs.push(msg(`Червие поймало ${label}: зеленая линия снова держит тело.`, time, '#6f8'));
    }
  } else {
    msgs.push(msg('Зеленый свет Червие оборвался. Без экрана и аппарата кабели стали медленнее.', time, '#9cf'));
  }
  if (!state) return;
  publishEvent(state, {
    type: anchor ? 'chervie_signal' : 'chervie_server_cut',
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    monsterKind: MonsterKind.CHERVIE_AVATAR,
    severity: anchor ? 3 : 4,
    privacy: 'local',
    tags: anchor
      ? ['monster', 'chervie', 'net', 'powered', anchor.feature === Feature.APPARATUS ? 'apparatus' : 'screen']
      : ['monster', 'chervie', 'net', 'server_cut', 'counterplay'],
    data: chervieSignalEventData(anchor),
  });
}

function stampCherviePulseCue(world: World, e: Entity, anchor: MonsterAnchorPoint | undefined, time: number): void {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const fx = ((e.x % 1) + 1) % 1;
  const fy = ((e.y % 1) + 1) % 1;
  const seed = Math.imul(e.id, 18_018) ^ Math.floor(time * 9);
  stampMark(world, x, y, fx, fy, 0.55, MarkType.PSI, seed, 58, 255, 116, 128);
  if (anchor) stampMark(world, anchor.x, anchor.y, 0.5, 0.5, 0.42, MarkType.PSI, seed ^ 0x715, 20, 220, 80, 105);
}

export function updateChervieNetPossessor(
  world: World,
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  if (!hasAIFlag(e, 'netPossessor') || !e.ai || dt <= 0) return;
  // Только по карте: фолбэк перебором стоил полный проход по сущностям каждый
  // кадр на каждого червия ровно тогда, когда игрока в индексе живых нет.
  const player = _entityById.get(playerId);
  const anchor = findMonsterAnchor(world, e);
  const chervie = chervieState.of(e);
  const powered = anchor !== undefined;
  // Раздутое у экрана тело и опавшее без него — та же строка якоря, только
  // видимая: обрыв линии читается силуэтом раньше, чем цифрами.
  e.spriteScale = powered ? 1.13 : 0.82;
  if (powered !== chervie.powered) {
    publishChervieNetEdge(world, e, anchor, time, msgs, player, state);
    chervie.powered = powered;
  }
  chervie.pulseCd = Math.max(0, chervie.pulseCd - dt);
  if (!powered || chervie.pulseCd > 0) return;

  getEntityIndex().queryRadiusCapped(
    e.x,
    e.y,
    CHERVIE_MIND_PULSE_RADIUS,
    cherviePulseQuery,
    ENTITY_MASK_ACTOR,
    CHERVIE_MIND_PULSE_CAP + 8,
  );

  const pulseRadiusSq = CHERVIE_MIND_PULSE_RADIUS * CHERVIE_MIND_PULSE_RADIUS;
  let affectedNpcs = 0;
  // Подменённый приказ всегда выписан на живого человека: Червие берёт ближайшего
  // в радиусе импульса, кто не его стороны. Игрок проходит по этому правилу
  // наравне со всеми, а без него приказ выписывают на соседа, а не на пустоту.
  let framed: Entity | undefined;
  let framedD2 = pulseRadiusSq;
  for (const other of cherviePulseQuery) {
    if (!other.alive || other.id === e.id || !canBeMonsterTarget(other) || !isHostile(e, other)) continue;
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    if (d2 > framedD2) continue;
    framedD2 = d2;
    framed = other;
  }
  const falseOrder = framed !== undefined;
  if (framed?.rpg) framed.rpg.psi = Math.max(0, framed.rpg.psi - 1);
  for (const other of cherviePulseQuery) {
    if (!other.alive || other.id === e.id) continue;
    if (world.dist2(e.x, e.y, other.x, other.y) > pulseRadiusSq) continue;
    if (other.type !== EntityType.NPC || affectedNpcs >= CHERVIE_MIND_PULSE_CAP) continue;
    // Голова мутится у всех в радиусе. Приказ исполняет тот, кто ходит по приказу:
    // игрок получает ту же муть, но своим телом правит сам.
    other.psiMadness = Math.max(other.psiMadness ?? 0, CHERVIE_MIND_PULSE_CONFUSION_SEC);
    if (other.ai && !isPlayerEntity(other)) {
      other.ai.goal = AIGoal.HUNT;
      other.ai.combatTargetId = framed && framed.id !== other.id ? framed.id : e.id;
      other.ai.timer = 0;
      other.ai.path = [];
      other.ai.pi = 0;
    }
    affectedNpcs++;
  }

  if (!falseOrder && affectedNpcs <= 0) return;
  chervie.pulseCd = CHERVIE_MIND_PULSE_COOLDOWN_SEC;
  stampCherviePulseCue(world, e, anchor, time);
  if (isPlayerEntity(framed)) {
    msgs.push(msg('НЕТ-экран печатает свежий приказ от твоего имени. Не выполняй его: это Червие.', time, '#6f8'));
  } else {
    msgs.push(msg('Червие дернуло локальную сеть. Люди рядом слышат чужой приказ.', time, '#6f8'));
  }
  if (!state) return;
  publishEvent(state, {
    type: falseOrder ? 'chervie_false_order' : 'chervie_signal',
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: framed?.id,
    targetName: framed ? entityDisplayName(framed) : undefined,
    targetFaction: framed?.faction,
    monsterKind: MonsterKind.CHERVIE_AVATAR,
    severity: falseOrder ? 5 : 4,
    privacy: isPlayerEntity(framed) ? 'private' : 'local',
    tags: ['monster', 'chervie', 'net', 'mind_pulse', falseOrder ? 'false_order' : 'npc_confusion'],
    data: chervieSignalEventData(anchor, {
      affectedNpcs,
      pulseCap: CHERVIE_MIND_PULSE_CAP,
      cooldownSec: CHERVIE_MIND_PULSE_COOLDOWN_SEC,
      confusionSec: CHERVIE_MIND_PULSE_CONFUSION_SEC,
      psiLoss: framed?.rpg ? 1 : 0,
    }),
  });
}

interface ZhornayaScentTarget {
  x: number;
  y: number;
  entity?: Entity;
  bait?: MonsterBaitMarker;
  source: 'bait' | 'drop' | 'carrier' | 'target';
  score: number;
}

function itemScentScore(defId: string): number {
  const def = ITEMS[defId];
  if (!def) return 0;
  const tags = ITEM_TAGS[defId] ?? def.tags ?? [];
  let score = def.type === ItemType.FOOD ? 1.1 : 0;
  if (tags.includes('bait_meat')) score += 1.55;
  if (tags.includes('bait_food')) score += 0.55;
  if (tags.includes('bait_stale')) score += 0.24;
  if (tags.includes('bait_risky') || tags.includes('bait_trap')) score += 0.45;
  if (tags.includes('bait_fungal')) score += 0.35;
  if (tags.includes('bait_sealed')) score *= 0.2;
  if (defId === 'meat_rune' || defId === 'psi_meat_hook') score = Math.max(score, 1.45);
  return score;
}

function inventoryScentScore(e: Entity): number {
  let score = 0;
  for (const item of e.inventory ?? []) {
    if (item.count <= 0) continue;
    score += itemScentScore(item.defId) * Math.min(3, item.count);
  }
  return score;
}

function pomoynyRoyScentScore(e: Entity): number {
  let score = 0;
  for (const item of e.inventory ?? []) {
    if (item.count <= 0) continue;
    const def = ITEMS[item.defId];
    if (!def) continue;
    const tags = ITEM_TAGS[item.defId] ?? def.tags ?? [];
    let itemScore = itemScentScore(item.defId);
    if (tags.includes('govnyak') || tags.includes('bait_govnyak')) itemScore += 1.35;
    if (tags.includes('bait_food')) itemScore += 0.35;
    if (itemScore <= 0) continue;
    score += itemScore * Math.min(3, item.count);
  }
  return score;
}

/**
 * Насколько далеко рой чует конкретного носителя. Радиус принадлежит не игроку,
 * а приманке в чужих руках: тот же говняк у NPC тянет рой ровно так же.
 */
function pomoynyRoyScentDetectSq(candidate: Entity, baseSq: number): number {
  const scent = pomoynyRoyScentScore(candidate);
  if (scent <= 0.2) return baseSq;
  const radius = Math.min(POMOYNY_ROY_MAX_SCENT_DETECT, Math.sqrt(baseSq) + 3.5 + Math.min(5, scent) * 2.4);
  return Math.max(baseSq, radius * radius);
}

/**
 * Цель роя: у каждого кандидата свой радиус притяжения по запаху, и выигрывает
 * тот, кто глубже внутри своего. Образец — `findMeatWormTarget` олгоя.
 */
function findPomoynyRoyTarget(world: World, e: Entity, dt: number, baseSq: number): Entity | null {
  const ai = e.ai!;
  let target: Entity | null = null;

  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatTargetId !== undefined) {
    const cached = _entityById.get(ai.combatTargetId);
    if (cached?.alive && canBeMonsterTarget(cached) && isHostile(e, cached) &&
        world.dist2(e.x, e.y, cached.x, cached.y) <= pomoynyRoyScentDetectSq(cached, baseSq)) {
      target = cached;
    }
    if (!target) ai.combatTargetId = undefined;
  }

  // Быстрая полоса на упор — та же, что у общего поиска цели: рой не ждёт
  // секундного каданса, если кто-то встал вплотную.
  ai.immediateScanCd = (ai.immediateScanCd ?? 0) - dt;
  if (!target && ai.combatScanCd > 0 && ai.immediateScanCd <= 0) {
    ai.immediateScanCd = 0.1;
    target = findImmediateCombatTarget(world, e, Math.min(baseSq, IMMEDIATE_THREAT_RADIUS_SQ), canBeMonsterTarget);
    if (target) {
      ai.combatTargetId = target.id;
      ai.goal = AIGoal.HUNT;
      ai.combatScanCd = Math.min(ai.combatScanCd, 0.15);
      return target;
    }
  }

  if (target || ai.combatScanCd > 0) return target;
  ai.combatScanCd = fixedScanCd(e) ?? deterministicScanCd(e.id, 1.0, 0.5);

  const scanRadius = Math.max(Math.sqrt(baseSq), POMOYNY_ROY_MAX_SCENT_DETECT);
  let bestScore = 1;
  const count = getEntityIndex().queryRadiusCapped(e.x, e.y, scanRadius, pomoynyRoyQuery, ENTITY_MASK_NPC, COMBAT_TARGET_SCAN_CAP);
  for (let i = 0; i < count; i++) {
    const other = pomoynyRoyQuery[i];
    if (!other.alive || other.id === e.id || !canBeMonsterTarget(other) || !isHostile(e, other)) continue;
    const reachSq = pomoynyRoyScentDetectSq(other, baseSq);
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    if (d2 > reachSq) continue;
    const score = d2 / reachSq;
    if (score >= bestScore) continue;
    if (!hasClearLine(world, e, other, scanRadius)) continue;
    bestScore = score;
    target = other;
  }
  if (target) ai.combatTargetId = target.id;
  return target;
}

function droppedScentScore(e: Entity): number {
  if (e.type !== EntityType.ITEM_DROP || !e.alive) return 0;
  return inventoryScentScore(e);
}

function pointOffPlayerPath(world: World, monster: Entity, target: Entity | null, x: number, y: number): boolean {
  if (!target) return true;
  const px = world.delta(monster.x, target.x);
  const py = world.delta(monster.y, target.y);
  const bx = world.delta(monster.x, x);
  const by = world.delta(monster.y, y);
  const len2 = px * px + py * py;
  if (len2 <= 0.01) return true;
  const t = (bx * px + by * py) / len2;
  if (t < 0.08 || t > 1.15) return true;
  const lx = px * t;
  const ly = py * t;
  const off2 = (bx - lx) * (bx - lx) + (by - ly) * (by - ly);
  return off2 > 1.15 * 1.15;
}

function findZhornayaCarrierTarget(world: World, e: Entity): ZhornayaScentTarget | null {
  let best: ZhornayaScentTarget | null = null;
  let bestAdjusted = Infinity;
  getEntityIndex().queryRadiusCapped(
    e.x,
    e.y,
    ZHORNAYA_CARRIER_SCAN_RADIUS,
    zhornayaCarrierQuery,
    ENTITY_MASK_ACTOR,
    ZHORNAYA_CARRIER_SCAN_CAP,
  );
  for (const other of zhornayaCarrierQuery) {
    if (!other.alive || other.id === e.id || !canBeMonsterTarget(other)) continue;
    if (!isHostile(e, other)) continue;
    const score = inventoryScentScore(other);
    if (score <= 0.6) continue;
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    if (d2 > ZHORNAYA_SCENT_RADIUS_SQ) continue;
    const adjusted = d2 / (score * score);
    if (adjusted >= bestAdjusted) continue;
    bestAdjusted = adjusted;
    best = { x: other.x, y: other.y, entity: other, source: 'carrier', score };
  }
  return best;
}

function findZhornayaDropTarget(world: World, e: Entity, target: Entity | null): ZhornayaScentTarget | null {
  let best: ZhornayaScentTarget | null = null;
  let bestAdjusted = Infinity;
  getEntityIndex().queryRadiusCapped(
    e.x,
    e.y,
    ZHORNAYA_DROP_SCAN_RADIUS,
    zhornayaDropQuery,
    ENTITY_MASK_ITEM_DROP,
    ZHORNAYA_DROP_SCAN_CAP,
  );
  for (const drop of zhornayaDropQuery) {
    const score = droppedScentScore(drop);
    if (score <= 0.4) continue;
    if (!pointOffPlayerPath(world, e, target, drop.x, drop.y)) continue;
    const d2 = world.dist2(e.x, e.y, drop.x, drop.y);
    const adjusted = d2 / (score * score);
    if (adjusted >= bestAdjusted) continue;
    bestAdjusted = adjusted;
    best = { x: drop.x, y: drop.y, entity: drop, source: 'drop', score };
  }
  return best;
}

function zhornayaScentScanInterval(e: Entity): number {
  return ZHORNAYA_SCENT_SCAN_SEC + (e.id & 3) * 0.018;
}

function zhornayaTargetFallback(target: Entity | null): ZhornayaScentTarget | null {
  return target ? { x: target.x, y: target.y, entity: target, source: 'target', score: 0.35 } : null;
}

function validCachedZhornayaScent(
  world: World,
  e: Entity,
  target: Entity | null,
  scent: ZhornayaScentTarget | null,
  time: number,
): ZhornayaScentTarget | null {
  if (!scent) return null;
  if (scent.bait) {
    if (!getActiveMonsterBaits().includes(scent.bait)) return null;
    if (scent.bait.expiresAt <= time || scent.bait.attractedCount >= scent.bait.maxAttractions) return null;
    if (!pointOffPlayerPath(world, e, target, scent.bait.x, scent.bait.y)) return null;
    scent.x = scent.bait.x;
    scent.y = scent.bait.y;
    scent.score = scent.bait.strength + scent.bait.risk * 0.2;
    return scent;
  }
  const entity = scent.entity;
  if (!entity?.alive) return null;
  if (scent.source === 'drop') {
    if (entity.type !== EntityType.ITEM_DROP) return null;
    const score = droppedScentScore(entity);
    if (score <= 0.4 || !pointOffPlayerPath(world, e, target, entity.x, entity.y)) return null;
    if (world.dist2(e.x, e.y, entity.x, entity.y) > ZHORNAYA_DROP_SCAN_RADIUS * ZHORNAYA_DROP_SCAN_RADIUS) return null;
    scent.x = entity.x;
    scent.y = entity.y;
    scent.score = score;
    return scent;
  }
  if (scent.source === 'carrier') {
    if (!canBeMonsterTarget(entity) || !isHostile(e, entity)) return null;
    const score = inventoryScentScore(entity);
    if (score <= 0.6 || world.dist2(e.x, e.y, entity.x, entity.y) > ZHORNAYA_SCENT_RADIUS_SQ) return null;
    scent.x = entity.x;
    scent.y = entity.y;
    scent.score = score;
    return scent;
  }
  if (scent.source === 'target') {
    if (target?.id !== entity.id || !isHostile(e, entity)) return null;
    scent.x = entity.x;
    scent.y = entity.y;
    return scent;
  }
  return null;
}

function findZhornayaCadencedScentTarget(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
): ZhornayaScentTarget | null {
  let runtime = zhornayaScentRuntime.get(e);
  if (runtime && time < runtime.nextScanAt) {
    const cached = validCachedZhornayaScent(world, e, target, runtime.scent, time);
    if (cached) return cached;
    return zhornayaTargetFallback(target);
  }

  if (!runtime) {
    runtime = { nextScanAt: 0, scent: null };
    zhornayaScentRuntime.set(e, runtime);
  }
  runtime.nextScanAt = time + zhornayaScentScanInterval(e);
  runtime.scent = findZhornayaDropTarget(world, e, target) ?? findZhornayaCarrierTarget(world, e) ?? zhornayaTargetFallback(target);
  return runtime.scent;
}

function findZhornayaScentTarget(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  state?: GameState,
): ZhornayaScentTarget | null {
  const bait = findMonsterBaitTarget(
    world,
    e,
    dt,
    time,
    state,
    undefined,
    marker => pointOffPlayerPath(world, e, target, marker.x, marker.y),
  );
  if (bait) {
    return { x: bait.x, y: bait.y, bait, source: 'bait', score: bait.strength + bait.risk * 0.2 };
  }

  return findZhornayaCadencedScentTarget(world, e, target, time);
}

function hasRawMeatItem(e: Entity): boolean {
  for (const item of e.inventory ?? []) {
    if (item.count > 0 && item.defId === 'rawmeat') return true;
  }
  return false;
}

function isHeavyBleedingTarget(e: Entity): boolean {
  if (e.hp === undefined || e.maxHp === undefined || e.maxHp <= 0) return false;
  return e.hp > 0 && e.hp / e.maxHp <= 0.42;
}

function isOlgoyScentedTarget(e: Entity): boolean {
  return hasRawMeatItem(e) || isHeavyBleedingTarget(e);
}

export function olgoyAmbushCell(world: World, x: number, y: number): boolean {
  const ci = world.idx(x, y);
  const cell = world.cells[ci];
  return cell === Cell.WATER ||
    cell === Cell.ABYSS ||
    world.floorTex[ci] === Tex.F_WATER ||
    world.wallTex[ci] === Tex.PIPE ||
    world.features[ci] === Feature.SINK ||
    world.features[ci] === Feature.TOILET;
}

export function olgoyNearAmbushTerrain(world: World, e: Entity, radius = OLGOY_AMBUSH_RADIUS): boolean {
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      if (olgoyAmbushCell(world, ex + dx, ey + dy)) return true;
    }
  }
  return false;
}

export function olgoyTerrainMoveMult(world: World, e: Entity): number {
  return olgoyNearAmbushTerrain(world, e) ? 1.12 : 0.55;
}

export function olgoyTerrainDmgMult(world: World, e: Entity, target?: Entity): number {
  if (olgoyNearAmbushTerrain(world, e)) return 1.44;
  if (target && olgoyNearAmbushTerrain(world, target, 1)) return 1.22;
  return 0.82;
}

function publishOlgoyFed(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity | undefined,
  time: number,
  source: 'bait' | 'corpse',
  data?: Record<string, unknown>,
): void {
  if (!state) return;
  publishEvent(state, {
    type: 'olgoy_fed',
    time,
    zoneId: zoneIdAt(world, e.x, e.y),
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target?.id,
    targetName: target ? entityDisplayName(target) : undefined,
    targetFaction: target?.faction,
    monsterKind: MonsterKind.OLGOY,
    severity: source === 'corpse' ? 3 : 2,
    privacy: 'local',
    tags: ['monster', 'olgoy', 'meat_worm', 'fed', source],
    data: { source, ...data },
  });
}

/* Падаль — это КЛЕТКА, а не тело.
 *
 * Раньше олгой искал труп сущностью, перебирая весь список этажа каждый кадр:
 * трупов нет в индексе живых, и другого способа у него не было. Но место
 * смерти уже помечено — `blood_fx` льёт в поле запаха импульс на смерть и
 * поменьше на рану. Падальщик идёт на пятно: тело может исчезнуть, его могли
 * унести, оно могло вообще не остаться — запах держится сам и гаснет сам.
 *
 * Одна цель на всех: кусок мяса на полу или кровь. Своё состояние падальщик
 * держит здесь, рядом с собой, а не в `AIState` у каждого актора мира.
 */
interface CarrionState {
  /** Клетка цели как `world.idx`, -1 — цели нет. */
  cell: number;
  scanCd: number;
}
const carrionStateByActor = new WeakMap<Entity, CarrionState>();

function carrionStateFor(e: Entity): CarrionState {
  let state = carrionStateByActor.get(e);
  if (!state) {
    state = { cell: -1, scanCd: 0 };
    carrionStateByActor.set(e, state);
  }
  return state;
}

function tryConsumeMeatChunk(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): boolean {
  if (target && world.dist2(e.x, e.y, target.x, target.y) <= 12) return false;

  const ai = e.ai!;
  const isOlgoy = hasAIFlag(e, 'meatWorm');
  const maxRadius = isOlgoy ? OLGOY_CORPSE_RADIUS : 16;

  if (!isOlgoy && !isCarnivoreMonster(e.monsterKind)) return false;
  if (!isOlgoy && (e.hp ?? 0) >= (e.maxHp ?? 100)) return false;

  const carrion = carrionStateFor(e);
  carrion.scanCd -= dt;
  if (carrion.scanCd <= 0) {
    carrion.scanCd = deterministicScanCd(e.id, 2.5, 0.5);
    // Кусок мяса виден глазом и потому весомее запаха: на него идут первым.
    const cell = findMeatChunkCell(world, e.x, e.y, maxRadius)
      ?? findBloodTrailCell(world, e.x, e.y, maxRadius, CARRION_BLOOD_MIN);
    carrion.cell = cell ? world.idx(cell.x, cell.y) : -1;
  }

  if (carrion.cell < 0) return false;

  const chunkX = carrion.cell % W;
  const chunkY = (carrion.cell / W) | 0;

  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = undefined;

  if (world.dist2(e.x, e.y, chunkX, chunkY) <= 1.35 * 1.35) {
    const chunk = hasVisualSlotCode(world, carrion.cell, 34);
    if (chunk) removeVisualSlotCode(world, carrion.cell, 34);
    clearBloodTrailCell(world, chunkX, chunkY);

    if (isOlgoy) {
      msgs.push(msg(`${entityDisplayName(e)} утянул ${chunk ? 'кусок мяса' : 'останки'} в коллектор`, time, '#c86'));
      if (state) publishOlgoyFed(state, world, e, e, time, 'corpse', { corpseType: chunk ? 'chunk' : 'remains' });
    } else {
      msgs.push(msg(`${entityDisplayName(e)} сожрал ${chunk ? 'кусок мяса' : 'падаль'}`, time, '#c44'));
      e.hp = Math.min(e.maxHp ?? 100, (e.hp ?? 0) + 25);
    }
    // Наелась: чутьё падает до вытянутой руки, за скоплением она не пойдёт.
    // Это одно из давлений, которыми мир держится от вымирания.
    feedMonster(e, time);
    carrion.cell = -1;
    ai.path = [];
    ai.pi = 0;
    return true;
  }

  ai.timer -= dt;
  if (monsterRepathDue(world, e) || !pathTargetIs(world, e, chunkX, chunkY)) {
    assignMonsterPath(world, e, chunkX, chunkY, 1.5);
  }
  followMonsterPath(world, e, dt);
  return true;
}

function findMeatWormTarget(world: World, e: Entity, dt: number): Entity | null {
  const ai = e.ai!;
  let target: Entity | null = null;
  const normalSq = OLGOY_DETECT_RADIUS * OLGOY_DETECT_RADIUS;
  const bloodSq = OLGOY_BLOOD_RADIUS * OLGOY_BLOOD_RADIUS;

  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatTargetId !== undefined) {
    const cached = _entityById.get(ai.combatTargetId);
    if (cached?.alive && canBeMonsterTarget(cached) && isHostile(e, cached)) {
      const scented = isOlgoyScentedTarget(cached);
      const d2 = world.dist2(e.x, e.y, cached.x, cached.y);
      if (d2 <= (scented ? bloodSq : normalSq)) target = cached;
    }
    if (!target) ai.combatTargetId = undefined;
  }
  if (target || ai.combatScanCd > 0) return target;
  ai.combatScanCd = deterministicScanCd(e.id, 0.95, 0.45);

  let bestScore = bloodSq;
  getEntityIndex().queryRadiusCapped(e.x, e.y, OLGOY_BLOOD_RADIUS, combatQuery, ENTITY_MASK_ACTOR, OLGOY_SCENT_SCAN_CAP);
  for (const other of combatQuery) {
    if (!other.alive || other.id === e.id || !canBeMonsterTarget(other)) continue;
    if (!isHostile(e, other)) continue;
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    const meat = hasRawMeatItem(other);
    const bleeding = isHeavyBleedingTarget(other);
    if (!meat && !bleeding && d2 > normalSq) continue;
    let score = d2;
    if (meat) score *= 0.34;
    if (bleeding) score *= 0.52;
    // Прежде здесь стоял множитель «а если это игрок — то вкуснее». Олгой идёт
    // на мясо и на кровь, а не на конкретное лицо: признаки те же для всех.
    if (score >= bestScore) continue;
    bestScore = score;
    target = other;
  }
  if (target) ai.combatTargetId = target.id;
  return target;
}




function updateOlgoyReadability(world: World, e: Entity, target: Entity, time: number, msgs: Msg[], playerId: number, state?: GameState): void {
  if (e.monsterKind !== MonsterKind.OLGOY || target.id !== playerId || e.ai?.lastSeenTargetId === playerId) return;
  if (!olgoyNearAmbushTerrain(world, e)) return;
  e.ai!.lastSeenTargetId = playerId;
  msgs.push(msg('Олгой-Хорхой поднялся из трубы. Сухой пол и мясная приманка сейчас важнее геройства.', time, '#fa6'));
  if (!state) return;
  publishEvent(state, {
    type: 'olgoy_burrowed',
    time,
    zoneId: zoneIdAt(world, e.x, e.y),
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target.id,
    targetName: entityDisplayName(target),
    targetFaction: target.faction,
    monsterKind: MonsterKind.OLGOY,
    severity: 4,
    privacy: 'local',
    tags: ['monster', 'olgoy', 'meat_worm', 'burrowed', 'ambush'],
    data: { counterplay: 'dry_floor_or_rawmeat_bait', terrain: 'water_pipe_abyss' },
  });
}

function tryOlgoyDragTarget(world: World, e: Entity, target: Entity, time: number, msgs: Msg[], state?: GameState): void {
  if (e.monsterKind !== MonsterKind.OLGOY || !target.alive || !olgoyNearAmbushTerrain(world, e)) return;
  const dx = world.delta(target.x, e.x);
  const dy = world.delta(target.y, e.y);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0.2) return;
  const step = Math.min(OLGOY_DRAG_STEP, Math.max(0, dist - 0.55));
  if (step <= 0) return;
  const nx = world.wrap(target.x + (dx / dist) * step);
  const ny = world.wrap(target.y + (dy / dist) * step);
  if (world.solid(Math.floor(nx), Math.floor(ny))) return;
  target.x = nx;
  target.y = ny;
  msgs.push(msg(`${entityDisplayName(e)} подтянул ${isPlayerEntity(target) ? 'тебя' : entityDisplayName(target)} к трубе`, time, '#f86'));
  if (!state) return;
  publishEvent(state, {
    type: 'olgoy_dragged_target',
    time,
    zoneId: zoneIdAt(world, e.x, e.y),
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target.id,
    targetName: entityDisplayName(target),
    targetFaction: target.faction,
    monsterKind: MonsterKind.OLGOY,
    severity: isPlayerEntity(target) ? 4 : 3,
    privacy: isPlayerEntity(target) ? 'local' : 'witnessed',
    tags: ['monster', 'olgoy', 'meat_worm', 'dragged'],
    data: { dragStep: step, counterplay: 'fight_away_from_pipe_water_or_abyss' },
  });
}

function nearFeature(world: World, e: Entity, feature: Feature, radius: number): boolean {
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const ci = world.idx(ex + dx, ey + dy);
      if (world.features[ci] === feature) return true;
    }
  }
  return false;
}

function nearDebrisFeature(world: World, e: Entity, radius: number): boolean {
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const feature = world.features[world.idx(ex + dx, ey + dy)];
      if (feature === Feature.SHELF || feature === Feature.MACHINE || feature === Feature.APPARATUS) return true;
    }
  }
  return false;
}

function inDebrisCover(world: World, e: Entity): boolean {
  const ctx = monsterWallContext(world, e);
  return ctx.adjacentWall || ctx.narrowDoorOrCorner || ctx.debrisNearby;
}

function wallTerrainPressureActive(world: World, e: Entity, target?: Entity): boolean {
  const actorCtx = monsterWallContext(world, e);
  if (hasAIFlag(e, 'debrisLurker') && (actorCtx.debrisNearby || actorCtx.adjacentWall || actorCtx.narrowDoorOrCorner)) return true;
  if (!hasAIFlag(e, 'wallBias')) return false;
  if (actorCtx.adjacentWall || actorCtx.narrowDoorOrCorner) return true;
  if (!target) return false;
  const targetCtx = monsterWallContext(world, target);
  return targetCtx.adjacentWall || targetCtx.narrowDoorOrCorner;
}

function wallTerrainOpenBreak(world: World, e: Entity, target?: Entity): boolean {
  const actorCtx = monsterWallContext(world, e);
  if (actorCtx.openFloorScore < 0.98) return false;
  if (hasAIFlag(e, 'debrisLurker') && actorCtx.debrisNearby) return false;
  if (!target) return true;
  const targetCtx = monsterWallContext(world, target);
  if (targetCtx.openFloorScore < 0.98) return false;
  return !hasAIFlag(e, 'debrisLurker') || !targetCtx.debrisNearby;
}

/**
 * Реплика упора: мусорную строку берёт только тот вид, который её объявил.
 *
 * Три `switch (kind)` на четыре вида — тег, реплика упора, реплика потери —
 * были одной таблицей, написанной трижды; она уехала в `MonsterEcologyDef.wall`
 * к остальным текстам вида.
 */
function wallTerrainCueText(wall: MonsterWallReadability, debris: boolean): string {
  return debris ? wall.cueDebris ?? wall.cue : wall.cue;
}

function updateWallTerrainReadability(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): void {
  if (!e.ai || (!hasAIFlag(e, 'wallBias') && !hasAIFlag(e, 'debrisLurker'))) return;
  const localTarget = target?.alive && world.dist2(e.x, e.y, target.x, target.y) <= 16 * 16 ? target : undefined;
  const active = wallTerrainPressureActive(world, e, localTarget);
  const openBreak = !active && e.ai.wallBiasWasActive === true && wallTerrainOpenBreak(world, e, localTarget);
  if (!active && !openBreak) return;

  const canCue = time >= (e.ai.wallBiasCueAt ?? -Infinity);
  const wall = monsterWallReadability(e.monsterKind);
  if (active) {
    e.ai.wallBiasWasActive = true;
    e.spriteScale = Math.max(e.spriteScale ?? 1, e.monsterKind === MonsterKind.REBAR ? 1.05 : 1.03);
    if (!localTarget || !canCue) return;
    e.ai.wallBiasCueAt = time + WALL_BIAS_CUE_COOLDOWN_SEC;
    const actorCtx = monsterWallContext(world, e);
    if (isPlayerEntity(localTarget)) msgs.push(msg(wallTerrainCueText(wall, actorCtx.debrisNearby), time, '#ca6'));
    publishMonsterReadabilityEvent(state, world, e, localTarget, 'monster_sighted', isPlayerEntity(localTarget) ? 4 : 3, [
      wall.tag,
      hasAIFlag(e, 'debrisLurker') ? 'debris_lurker' : 'wall_bias',
      actorCtx.debrisNearby ? 'debris' : 'wall_edge',
    ], monsterReadabilityEventData(e.monsterKind, {
      actorAdjacentWall: actorCtx.adjacentWall,
      actorNarrowDoorOrCorner: actorCtx.narrowDoorOrCorner,
      actorOpenFloorScore: Math.round(actorCtx.openFloorScore * 100) / 100,
      counterplay: 'open_floor_center_room_distance',
    }));
    return;
  }

  e.ai.wallBiasWasActive = false;
  if (!localTarget || !canCue) return;
  e.ai.wallBiasCueAt = time + WALL_BIAS_CUE_COOLDOWN_SEC;
  e.spriteScale = e.monsterKind === MonsterKind.REBAR ? 0.94 : 0.96;
  if (isPlayerEntity(localTarget)) msgs.push(msg(wall.open, time, '#9cf'));
  publishMonsterReadabilityEvent(state, world, e, localTarget, 'monster_windup_interrupted', 3, [
    wall.tag,
    'open_floor',
    'wall_advantage_broken',
  ], monsterReadabilityEventData(e.monsterKind, {
    counterplay: 'open_floor',
  }));
}

function wallNeighborCount(world: World, x: number, y: number): number {
  let n = 0;
  if (world.solid(x - 1, y)) n++;
  if (world.solid(x + 1, y)) n++;
  if (world.solid(x, y - 1)) n++;
  if (world.solid(x, y + 1)) n++;
  return n;
}

interface CheapCrowdPressure {
  crowd: number;
  capped: boolean;
  choke: boolean;
}

function cheapCrowdPressure(
  world: World,
  e: Entity,
  target: Entity,
  radius: number,
  cap: number,
  out: Entity[],
): CheapCrowdPressure {
  const found = getEntityIndex().queryRadiusCapped(e.x, e.y, radius, out, ENTITY_MASK_ACTOR, cap);
  let crowd = 0;
  for (const other of out) {
    if (!other.alive || other.id === e.id || other.id === target.id) continue;
    crowd++;
  }
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  const tx = Math.floor(target.x);
  const ty = Math.floor(target.y);
  const choke = wallNeighborCount(world, ex, ey) >= 2 ||
    wallNeighborCount(world, tx, ty) >= 2 ||
    world.cells[world.idx(ex, ey)] === Cell.DOOR ||
    world.cells[world.idx(tx, ty)] === Cell.DOOR;
  return { crowd, capped: found >= cap, choke };
}

function inPolzunKillCell(world: World, e: Entity): boolean {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const ci = world.idx(x, y);
  return world.cells[ci] === Cell.WATER ||
    wallNeighborCount(world, x, y) >= 2 ||
    world.features[ci] === Feature.SINK ||
    world.features[ci] === Feature.TOILET;
}

/** Общая дальность ближнего удара: столько достаёт тварь, не объявившая своей. */
const MONSTER_REACH = 1.2;
/** Сорванный головной слизень — голова на щупальцах: достаёт короче носителя. */
const HEAD_SLUG_DETACHED_REACH = 0.95;

/**
 * Дальность ближнего удара.
 *
 * Постоянная дальность вида — колонка `MonsterDef.reach` в файле самого вида;
 * здесь остались только ОБСТАНОВОЧНЫЕ дальности, которые нельзя записать
 * числом: упор Панельника в стену и стадия Головного слизня. Раньше и то, и
 * другое лежало одним `switch (kind)` на девять веток.
 */
function monsterMeleeRange(world: World, e: Entity): number {
  if (e.monsterKind === MonsterKind.PANELNIK) {
    return panelnikWallBraceActive(world, e) ? PANELNIK_BRACE_REACH : PANELNIK_OPEN_REACH;
  }
  if (isHeadSlugDetached(e)) return HEAD_SLUG_DETACHED_REACH;
  return (e.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.reach : undefined) ?? MONSTER_REACH;
}

function facingDotTo(world: World, from: Entity, to: Entity): number {
  const dx = world.delta(from.x, to.x);
  const dy = world.delta(from.y, to.y);
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= 0.001) return 1;
  return (Math.cos(from.angle) * dx + Math.sin(from.angle) * dy) / len;
}

function targetBackTurned(world: World, monster: Entity, target: Entity): boolean {
  return facingDotTo(world, target, monster) <= BEZEKHIY_BACK_DOT;
}

/**
 * Кого сторожит Безэхий у порога. Ближайший живой человек в радиусе обнаружения:
 * игрок ничем не выделен, засада работает против любого, кто идёт через дверь.
 */
function entityLight(world: World, e: Entity): number {
  return world.light[world.idx(Math.floor(e.x), Math.floor(e.y))] ?? 0;
}

function entityHasEquippedLight(e: Entity): boolean {
  return equippedToolLightScore(e.tool) > 0;
}

interface LishennyyLightTarget {
  x: number;
  y: number;
  score: number;
  source: 'actor' | 'drop' | 'feature';
  entity?: Entity;
  itemId?: string;
}

function lishennyyActorLightScore(world: World, e: Entity): number {
  if (!canBeMonsterTarget(e)) return 0;
  let score = entityLight(world, e);
  score = Math.max(score, equippedToolLightScore(e.tool));
  if (nearFeature(world, e, Feature.LAMP, 1)) score = Math.max(score, 0.62);
  if (nearFeature(world, e, Feature.CANDLE, 1)) score = Math.max(score, 0.48);
  return score;
}

/* Свет, за которым идёт Лишенный: его цель, его кулдауны. Всё это касается
 * одного вида и потому лежит рядом с ним, а не в `AIState` каждого актора. */
interface LishennyyState {
  scanCd: number;
  targetX?: number;
  targetY?: number;
  targetId?: number;
  targetKind?: LishennyyLightTarget['source'];
  avoidTimer: number;
  cueAt: number;
}
const lishennyyState = speciesState<LishennyyState>(() => ({ scanCd: 0, avoidTimer: 0, cueAt: -Infinity }));

/** Что Лишенный считает светом прямо сейчас: путь для отладки и тестов. */
export function peekLishennyyLightTarget(e: Entity): { id?: number; kind?: LishennyyLightTarget['source'] } | undefined {
  const light = lishennyyState.peek(e);
  if (!light) return undefined;
  return { id: light.targetId, kind: light.targetKind };
}

/** Яркий свет в лицо: Лишенный отшатывается и забывает, за чем шёл. */
export function repelLishennyyFromLight(e: Entity, seconds: number): void {
  const light = lishennyyState.of(e);
  light.avoidTimer = Math.max(light.avoidTimer, seconds);
  light.targetId = undefined;
  light.targetKind = undefined;
}

function lishennyyDropLight(drop: Entity): { score: number; itemId: string } | null {
  if (drop.type !== EntityType.ITEM_DROP || !drop.alive) return null;
  let bestScore = 0;
  let bestItem = '';
  for (const item of drop.inventory ?? []) {
    if (item.count <= 0) continue;
    let score = droppedToolLightScore(item.defId);
    if (item.defId === 'istotit_candle') score = 0.64;
    else if (item.defId === 'lamp_bulb') score = 0.32;
    else if (score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      bestItem = item.defId;
    }
  }
  return bestScore > 0 ? { score: bestScore, itemId: bestItem } : null;
}

function lishennyyFeatureScore(feature: Feature, light: number): number {
  if (feature === Feature.LAMP) return Math.max(0.68, light);
  if (feature === Feature.CANDLE) return Math.max(0.46, light * 0.85);
  return 0;
}

function lishennyyWeightedScore(world: World, e: Entity, x: number, y: number, score: number, source: LishennyyLightTarget['source']): number {
  const dist = Math.sqrt(world.dist2(e.x, e.y, x, y));
  const sourceBonus = source === 'actor' ? 12 : source === 'drop' ? 18 : 4;
  return score * 100 + sourceBonus - dist * 2.2;
}

function lishennyyCandidateAllowed(e: Entity, score: number): boolean {
  return (lishennyyState.peek(e)?.avoidTimer ?? 0) <= 0 || score < LISHENNYY_BRIGHT_AVOID;
}

function lishennyyCachedTarget(world: World, e: Entity): LishennyyLightTarget | null {
  const light = lishennyyState.peek(e);
  if (!e.ai || !light || light.targetX === undefined || light.targetY === undefined || light.targetKind === undefined) return null;
  if (light.targetKind !== 'feature' && light.targetId !== undefined) {
    const entity = _entityById.get(light.targetId);
    if (!entity?.alive) return null;
    if (light.targetKind === 'actor') {
      const score = lishennyyActorLightScore(world, entity);
      if (score < LISHENNYY_LIGHT_MIN || !lishennyyCandidateAllowed(e, score)) return null;
      return { x: entity.x, y: entity.y, score, source: 'actor', entity };
    }
    const dropped = lishennyyDropLight(entity);
    if (!dropped || !lishennyyCandidateAllowed(e, dropped.score)) return null;
    return { x: entity.x, y: entity.y, score: dropped.score, source: 'drop', entity, itemId: dropped.itemId };
  }
  const score = pointLight(world, light.targetX, light.targetY);
  if (score < LISHENNYY_LIGHT_MIN || !lishennyyCandidateAllowed(e, score)) return null;
  return { x: light.targetX, y: light.targetY, score, source: 'feature' };
}

function publishLishennyyLured(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: LishennyyLightTarget,
  time: number,
): void {
  if (!state) return;
  const itemName = target.itemId ? ITEMS[target.itemId]?.name ?? target.itemId : undefined;
  publishEvent(state, {
    type: 'lishennyy_lured',
    time,
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target.entity?.id,
    targetName: target.entity
      ? target.source === 'drop' ? itemName ?? 'брошенный свет' : entityDisplayName(target.entity)
      : 'лампа',
    targetFaction: target.entity?.faction,
    monsterKind: MonsterKind.LISHENNYY,
    itemId: target.itemId,
    itemName,
    severity: 3,
    privacy: isPlayerEntity(target.entity) ? 'local' : 'witnessed',
    tags: ['monster', 'lishennyy', 'light_follower', 'lured', target.source],
    data: {
      source: target.source,
      lightScore: target.score,
      rumorIds: [...monsterReadabilityRumorIds(MonsterKind.LISHENNYY)],
      counterplay: 'drop_light_decoy_or_break_contact',
    },
  });
}

function findLishennyyFeatureTarget(world: World, e: Entity): LishennyyLightTarget | null {
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  let best: LishennyyLightTarget | null = null;
  let bestWeight = -Infinity;
  for (let dy = -LISHENNYY_FEATURE_SCAN_RADIUS; dy <= LISHENNYY_FEATURE_SCAN_RADIUS; dy++) {
    for (let dx = -LISHENNYY_FEATURE_SCAN_RADIUS; dx <= LISHENNYY_FEATURE_SCAN_RADIUS; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > LISHENNYY_FEATURE_SCAN_RADIUS * LISHENNYY_FEATURE_SCAN_RADIUS) continue;
      const x = world.wrap(ex + dx);
      const y = world.wrap(ey + dy);
      const ci = world.idx(x, y);
      const score = lishennyyFeatureScore(world.features[ci] as Feature, world.light[ci] ?? 0);
      if (score < LISHENNYY_LIGHT_MIN || !lishennyyCandidateAllowed(e, score)) continue;
      const weight = lishennyyWeightedScore(world, e, x + 0.5, y + 0.5, score, 'feature');
      if (weight <= bestWeight) continue;
      bestWeight = weight;
      best = { x: x + 0.5, y: y + 0.5, score, source: 'feature' };
    }
  }
  return best;
}

function findLishennyyLightTarget(
  world: World,
  e: Entity,
  dt: number,
  time: number,
  state: GameState | undefined,
): LishennyyLightTarget | null {
  const light = lishennyyState.of(e);
  light.scanCd -= dt;
  if (light.scanCd > 0) return lishennyyCachedTarget(world, e);

  light.scanCd = LISHENNYY_SCAN_SEC + (e.id & 3) * 0.07;
  let best = findLishennyyFeatureTarget(world, e);
  let bestWeight = best ? lishennyyWeightedScore(world, e, best.x, best.y, best.score, best.source) : -Infinity;

  getEntityIndex().queryRadiusCapped(e.x, e.y, LISHENNYY_DETECT_RADIUS, lishennyyLightQuery, ENTITY_MASK_ACTOR | ENTITY_MASK_ITEM_DROP, LISHENNYY_LIGHT_SCAN_CAP);
  for (const other of lishennyyLightQuery) {
    if (!other.alive || other.id === e.id) continue;
    if (other.type === EntityType.ITEM_DROP) {
      const light = lishennyyDropLight(other);
      if (!light || !lishennyyCandidateAllowed(e, light.score)) continue;
      const weight = lishennyyWeightedScore(world, e, other.x, other.y, light.score, 'drop');
      if (weight <= bestWeight) continue;
      bestWeight = weight;
      best = { x: other.x, y: other.y, score: light.score, source: 'drop', entity: other, itemId: light.itemId };
      continue;
    }
    if (!isHostile(e, other)) continue;
    const score = lishennyyActorLightScore(world, other);
    if (score < LISHENNYY_LIGHT_MIN || !lishennyyCandidateAllowed(e, score)) continue;
    const weight = lishennyyWeightedScore(world, e, other.x, other.y, score, 'actor');
    if (weight <= bestWeight) continue;
    bestWeight = weight;
    best = { x: other.x, y: other.y, score, source: 'actor', entity: other };
  }

  if (!best) {
    light.targetX = undefined;
    light.targetY = undefined;
    light.targetId = undefined;
    light.targetKind = undefined;
    return null;
  }

  const changed = light.targetKind !== best.source ||
    light.targetId !== best.entity?.id ||
    Math.floor(light.targetX ?? -999) !== Math.floor(best.x) ||
    Math.floor(light.targetY ?? -999) !== Math.floor(best.y);
  light.targetX = best.x;
  light.targetY = best.y;
  light.targetId = best.entity?.id;
  light.targetKind = best.source;
  if (changed && time >= light.cueAt) {
    light.cueAt = time + 5.5;
    publishLishennyyLured(state, world, e, best, time);
  }
  return best;
}

function lishennyyDimRetreatCell(world: World, e: Entity): { x: number; y: number } | null {
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  let best: { x: number; y: number } | null = null;
  let bestLight = pointLight(world, e.x, e.y);
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = world.wrap(ex + dx);
      const y = world.wrap(ey + dy);
      if (world.solid(x, y)) continue;
      const light = world.light[world.idx(x, y)] ?? 0;
      if (light >= bestLight) continue;
      bestLight = light;
      best = { x, y };
    }
  }
  return best;
}

function updateLishennyyBrightAvoidance(
  world: World,
  e: Entity,
  dt: number,
): boolean {
  if (e.monsterKind !== MonsterKind.LISHENNYY || !e.ai) return false;
  const ai = e.ai;
  const light = lishennyyState.of(e);
  light.avoidTimer = Math.max(0, light.avoidTimer - dt);
  /* Боль сбивает УДАР, а не всего зверя: ни цели, ни маршрута она не отменяет.
   *
   * Здесь стояло `return true` вместе с чисткой `combatTargetId` и `path` —
   * оглушённый Лишённый переставал видеть врага и терял дорогу, а плоские 0.35
   * не имели отношения к длине самого стаггера. Верную половину делает общий
   * обработчик в начале `updateMonster`: он вычитает боль и держит откат атаки
   * ровно на её остатке. Здесь остаётся только читаемая поза. */
  if ((ai.staggerTimer ?? 0) > 0) e.spriteScale = 0.84;
  if (light.avoidTimer <= 0 || pointLight(world, e.x, e.y) < LISHENNYY_BRIGHT_AVOID) return false;
  ai.combatTargetId = undefined;
  ai.goal = AIGoal.WANDER;
  ai.timer -= dt;
  if (monsterRepathDue(world, e) || ai.pi >= ai.path.length) {
    const dim = lishennyyDimRetreatCell(world, e);
    if (dim) assignMonsterPath(world, e, dim.x, dim.y, 0.9);
    else { wanderNearby(world, e); ai.timer = 0.9; }
  }
  const oldSpeed = e.speed;
  e.speed = oldSpeed * 0.72;
  followMonsterPath(world, e, dt);
  e.speed = oldSpeed;
  e.spriteScale = 0.88;
  return true;
}

function followLishennyyLightTarget(world: World, e: Entity, target: LishennyyLightTarget, dt: number): boolean {
  if (e.monsterKind !== MonsterKind.LISHENNYY || target.source === 'actor' || !e.ai) return false;
  const ai = e.ai;
  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = undefined;
  ai.timer -= dt;
  if (monsterRepathDue(world, e) || ai.pi >= ai.path.length) {
    assignMonsterPath(world, e, Math.floor(target.x), Math.floor(target.y), 1.35);
  }
  const oldSpeed = e.speed;
  e.speed = oldSpeed * (target.source === 'drop' ? 1.1 : 0.92);
  followMonsterPath(world, e, dt);
  e.speed = oldSpeed;
  e.spriteScale = world.dist2(e.x, e.y, target.x, target.y) < 1.7 * 1.7 ? 1.08 : undefined;
  return true;
}

function applyLishennyyContactDecay(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity,
  dmg: number,
  time: number,
  msgs: Msg[],
  playerId: number,
): void {
  if (e.monsterKind !== MonsterKind.LISHENNYY) return;
  let needDrain = 0;
  if (target.needs) {
    const before = target.needs.food + target.needs.water + target.needs.sleep;
    target.needs.food = Math.max(0, target.needs.food - LISHENNYY_CONTACT_DRAIN);
    target.needs.water = Math.max(0, target.needs.water - LISHENNYY_CONTACT_DRAIN);
    target.needs.sleep = Math.max(0, target.needs.sleep - Math.ceil(LISHENNYY_CONTACT_DRAIN * 0.5));
    needDrain = before - target.needs.food - target.needs.water - target.needs.sleep;
  }
  if (target.rpg) target.rpg.psi = Math.max(0, target.rpg.psi - 2);
  if (target.id === playerId) msgs.push(msg('Лишенный коснулся света в тебе: горло пересохло, ноги стали ватными.', time, '#99a'));
  if (!state) return;
  publishEvent(state, {
    type: 'lishennyy_contact_decay',
    time,
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target.id,
    targetName: entityDisplayName(target),
    targetFaction: target.faction,
    monsterKind: MonsterKind.LISHENNYY,
    severity: isPlayerEntity(target) ? 4 : 3,
    privacy: isPlayerEntity(target) ? 'local' : 'witnessed',
    tags: ['monster', 'lishennyy', 'contact_decay', 'decay'],
    data: {
      damage: dmg,
      needDrain,
      psiDrain: target.rpg ? 2 : 0,
      rumorIds: [...monsterReadabilityRumorIds(MonsterKind.LISHENNYY)],
      counterplay: 'break_contact_and_move_light_away',
    },
  });
}

function isSlimeWomanWetCell(world: World, e: Entity): boolean {
  return wetTerrainAtEntity(world, e) ||
    entityInActiveCellHazard(world, e, SLIME_WOMAN_HAZARD_TAGS);
}

function isSlimeWomanDryCounterCell(world: World, e: Entity): boolean {
  if (isSlimeWomanWetCell(world, e)) return false;
  const ci = world.idx(Math.floor(e.x), Math.floor(e.y));
  if (world.cells[ci] !== Cell.FLOOR) return false;
  return world.light[ci] >= 0.24 || nearFeature(world, e, Feature.LAMP, 3);
}

function slimeWomanRuntimeState(e: Entity): SlimeWomanRuntime {
  const hp = Math.max(1, e.hp ?? e.maxHp ?? 1);
  let runtime = slimeWomanRuntime.get(e);
  if (!runtime) {
    runtime = { lastHp: hp, lastResidueAt: -Infinity, lastDryEventAt: -Infinity };
    slimeWomanRuntime.set(e, runtime);
  }
  return runtime;
}

function publishSlimeWomanDriedEvent(
  state: GameState | undefined,
  world: World,
  e: Entity,
  time: number,
  reason: string,
): void {
  if (!state) return;
  publishEvent(state, {
    type: 'slime_humanoid_dried',
    time,
    zoneId: zoneIdAt(world, e.x, e.y),
    roomId: world.roomAt(e.x, e.y)?.id,
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    monsterKind: MonsterKind.SLIME_WOMAN,
    severity: 3,
    privacy: 'local',
    tags: ['monster', 'slime_woman', 'slime', 'dry', 'counterplay'],
    data: {
      reason,
      counterplay: MONSTERS[MonsterKind.SLIME_WOMAN]?.counterplay,
      rumorIds: ['ecology_slime_woman_dry_edge', 'lead_maint_slime_woman_sump'],
    },
  });
}

function slimeWomanResidueCells(world: World, e: Entity, target: Entity | undefined): number[] {
  const cells: number[] = [];
  const push = (x: number, y: number): void => {
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
    if (!cells.includes(ci)) cells.push(ci);
  };
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  push(ex, ey);
  if (target) push(Math.floor(target.x), Math.floor(target.y));
  for (let i = 0; i < 4; i++) {
    const dx = i === 0 ? 1 : i === 1 ? -1 : 0;
    const dy = i === 2 ? 1 : i === 3 ? -1 : 0;
    push(ex + dx, ey + dy);
  }
  return cells;
}

function dropSlimeWomanResidue(
  world: World,
  e: Entity,
  target: Entity | undefined,
  time: number,
  state: GameState | undefined,
  reason: string,
): void {
  if (e.monsterKind !== MonsterKind.SLIME_WOMAN) return;
  const runtime = slimeWomanRuntimeState(e);
  if (time - runtime.lastResidueAt < SLIME_WOMAN_RESIDUE_COOLDOWN_SEC) return;
  const cells = slimeWomanResidueCells(world, e, target);
  if (cells.length === 0) return;
  runtime.lastResidueAt = time;
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  stampMark(world, x, y, 0.5, 0.5, 1.25, MarkType.DRIP, 50_500 + e.id * 17 + Math.floor(time * 10), 18, 150, 98, 175);
  registerCellHazardSite(world, {
    id: `slime_woman_residue_${e.id}_${Math.floor(time * 10)}`,
    kind: 'slime_woman_residue',
    displayName: 'Жижевая токсичная пленка',
    cells,
    tags: ['slime', 'toxic', 'slime_woman', 'green_slime'],
    sticky: false,
    cleanable: true,
    slowMult: 0.72,
    playerDamagePerSecond: 1.25,
    messageCooldownSeconds: 2.8,
    expiresAt: time + SLIME_WOMAN_RESIDUE_DURATION_SEC,
    roomId: world.roomAt(e.x, e.y)?.id,
    zoneId: zoneIdAt(world, e.x, e.y),
    centerX: e.x,
    centerY: e.y,
    warning: 'Жижевая пленка ест подошву. Чистящий комплект, огонь или сухой обход держат проход.',
    warningColor: '#4f8',
  });
  if (state && target && isPlayerEntity(target)) {
    publishEvent(state, {
      type: 'monster_sighted',
      time,
      zoneId: zoneIdAt(world, e.x, e.y),
      roomId: world.roomAt(e.x, e.y)?.id,
      x: e.x,
      y: e.y,
      actorId: e.id,
      actorName: entityDisplayName(e),
      actorFaction: e.faction,
      targetId: target.id,
      targetName: entityDisplayName(target),
      targetFaction: target.faction,
      monsterKind: MonsterKind.SLIME_WOMAN,
      severity: 3,
      privacy: 'local',
      tags: ['monster', 'slime_woman', 'slime', 'residue', reason],
      data: {
        residueCells: cells.length,
        residueSeconds: SLIME_WOMAN_RESIDUE_DURATION_SEC,
        counterplay: 'cleaning_kit_fire_or_dry_edge',
      },
    });
  }
}

function updateSlimeWomanState(
  world: World,
  e: Entity,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
): void {
  if (e.monsterKind !== MonsterKind.SLIME_WOMAN) return;
  if (!e.alive || (e.hp ?? 1) <= 0) {
    slimeWomanRuntime.delete(e);
    return;
  }
  const runtime = slimeWomanRuntimeState(e);
  const hp = e.hp ?? runtime.lastHp;
  if (hp < runtime.lastHp) dropSlimeWomanResidue(world, e, undefined, time, state, 'damaged');
  runtime.lastHp = hp;

  if (isSlimeWomanDryCounterCell(world, e)) {
    e.spriteScale = 0.88;
    if (time - runtime.lastDryEventAt >= SLIME_WOMAN_DRY_EVENT_COOLDOWN_SEC) {
      runtime.lastDryEventAt = time;
      msgs.push(msg('Жижевая женщина подсыхает на светлом сухом бетоне. Сейчас её можно держать темпом.', time, '#8cf'));
      publishSlimeWomanDriedEvent(state, world, e, time, 'dry_lit_concrete');
    }
  } else if (isSlimeWomanWetCell(world, e)) {
    e.spriteScale = Math.max(e.spriteScale ?? 1, 1.06);
  } else if (e.spriteScale !== undefined && (e.spriteScale < 1 || e.spriteScale > 1.04)) {
    e.spriteScale = undefined;
  }
}

function panelnikAdjacentWallCell(world: World, e: Entity): { x: number; y: number } | undefined {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (const [dx, dy] of dirs) {
    const wx = world.wrap(x + dx);
    const wy = world.wrap(y + dy);
    if (world.cells[world.idx(wx, wy)] === Cell.WALL) return { x: wx, y: wy };
  }
  return undefined;
}

function stampPanelnikWallScrape(world: World, e: Entity, time: number): void {
  const wall = panelnikAdjacentWallCell(world, e);
  if (!wall) return;
  const seed = Math.imul(e.id, 1201) ^ Math.floor(time * 8);
  stampMark(world, wall.x, wall.y, 0.5, 0.5, 0.24, MarkType.BULLET, seed, 206, 194, 158, 135, true);
}

function updatePanelnikWallBrace(
  world: World,
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  target: Entity | undefined,
  state: GameState | undefined,
): void {
  if (e.monsterKind !== MonsterKind.PANELNIK || !e.ai) return;
  const ai = e.ai;
  ai.wallBraceSlowTimer = Math.max(0, (ai.wallBraceSlowTimer ?? 0) - dt);

  const localTarget = target?.alive && world.dist2(e.x, e.y, target.x, target.y) <= 16 * 16 ? target : undefined;
  if (panelnikWallBraceActive(world, e)) {
    ai.wallBraceWasActive = true;
    ai.wallBraceSlowTimer = 0;
    e.spriteScale = Math.max(e.spriteScale ?? 1, 1.07);
    if (localTarget && time >= (ai.wallBraceCueAt ?? -Infinity)) {
      ai.wallBraceCueAt = time + PANELNIK_BRACE_CUE_COOLDOWN_SEC;
      stampPanelnikWallScrape(world, e, time);
      msgs.push(msg('Панельник скребет плитной рукой по стене: у панели броня и длинный удар.', time, '#cca'));
      publishMonsterReadabilityEvent(state, world, e, localTarget, 'monster_sighted', 3, ['panelnik', 'wall_brace', 'scrape'], {
        braceReach: PANELNIK_BRACE_REACH,
        counterplay: 'door_corner_or_open_floor',
      });
    }
    return;
  }

  if (panelnikOpenFloor(world, e) && ai.wallBraceWasActive) {
    ai.wallBraceWasActive = false;
    ai.wallBraceSlowTimer = Math.max(ai.wallBraceSlowTimer ?? 0, PANELNIK_OPEN_SLOW_SEC);
    e.spriteScale = 0.92;
    if (localTarget) {
      msgs.push(msg('Панельник потерял стену. Пыль осела: броня пропала, темп просел.', time, '#9cf'));
      publishMonsterReadabilityEvent(state, world, e, localTarget, 'monster_windup_interrupted', 3, ['panelnik', 'wall_brace', 'broken', 'open_floor'], {
        slowSec: PANELNIK_OPEN_SLOW_SEC,
        counterplay: 'open_floor',
      });
    }
    return;
  }

  if ((ai.wallBraceSlowTimer ?? 0) > 0) {
    e.spriteScale = 0.92;
  } else if (e.spriteScale !== undefined && (e.spriteScale < 0.96 || e.spriteScale > 1.04)) {
    e.spriteScale = undefined;
  }
}

function shadowHasLightCounter(world: World, shadow: Entity, target: Entity): boolean {
  return entityHasEquippedLight(target) ||
    entityLight(world, target) >= SHADOW_LIGHT_SAFE ||
    entityLight(world, shadow) >= SHADOW_LIGHT_SAFE;
}

function shadowCanDarkAmbush(world: World, shadow: Entity, target: Entity): boolean {
  return !entityHasEquippedLight(target) &&
    entityLight(world, shadow) <= SHADOW_DARK_LIGHT &&
    entityLight(world, target) < SHADOW_LIGHT_SAFE;
}

function isBlackWaterWakeCell(world: World, e: Entity): boolean {
  return wetWaterCell(world, Math.floor(e.x), Math.floor(e.y));
}

export function isChernoSlizHidden(world: World, e: Entity, target?: Entity): boolean {
  if (e.monsterKind !== MonsterKind.CHERNOSLIZ) return false;
  if (e.monsterStage === 1) return false;
  if (!isBlackWaterWakeCell(world, e)) return false;
  const maxHp = e.maxHp ?? e.hp ?? 1;
  if ((e.hp ?? maxHp) < maxHp) return false;
  if (entityLight(world, e) >= CHERNOSLIZ_LIGHT_REVEAL) return false;
  if (!target?.alive) return true;
  const d2 = world.dist2(e.x, e.y, target.x, target.y);
  if (d2 <= CHERNOSLIZ_REVEAL_CLOSE_SQ) return false;
  if (entityHasEquippedLight(target) && d2 <= CHERNOSLIZ_LIGHT_RANGE_SQ && hasClearLine(world, e, target, CHERNOSLIZ_LIGHT_RANGE)) return false;
  return true;
}

function chernoslizDetectSq(world: World, e: Entity): number {
  return isBlackWaterWakeCell(world, e) ? CHERNOSLIZ_WATER_DETECT_SQ : CHERNOSLIZ_DRY_DETECT_SQ;
}

function chernoslizCanTarget(world: World, e: Entity, target: Entity): boolean {
  if (!target.alive || !canBeMonsterTarget(target) || !isHostile(e, target)) return false;
  if (isChernoSlizHidden(world, e, target)) return false;
  return world.dist2(e.x, e.y, target.x, target.y) < chernoslizDetectSq(world, e);
}

function chernoslizRevealNoise(noise: NoiseRecord): boolean {
  if (noise.source === 'decoy' || noise.source === 'explosion') return true;
  if (noise.source === 'weapon_fire' && noise.severity >= 2) return true;
  if (noise.source === 'melee' && (noise.tags.includes('metal') || noise.tags.includes('pipe'))) return true;
  return noise.itemId === 'noise_can' || noise.tags.includes('counterplay');
}

function revealChernoSlizByNoise(
  world: World,
  e: Entity,
  noise: NoiseRecord,
  time: number,
  msgs: Msg[],
  state?: GameState,
): void {
  if (e.monsterStage === 1) return;
  e.monsterStage = 1;
  e.spriteScale = undefined;
  stampChernoSlizWake(world, e, time);
  const target = noise.actorId !== undefined ? _entityById.get(noise.actorId) : undefined;
  msgs.push(msg('Шум вскрыл черную воду: чернослиз дернулся и потерял первый скрытый залп.', time, '#7f9'));
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 3, ['chernosliz', 'black_water', 'noise_reveal', 'counterplay'], {
    noiseId: noise.id,
    noiseSource: noise.source,
    itemId: noise.itemId,
    counterplay: 'light_noise_probe_or_dry_edge',
  });
}

function tryRevealChernoSlizByNoise(
  world: World,
  e: Entity,
  time: number,
  msgs: Msg[],
  state?: GameState,
): boolean {
  if (e.monsterKind !== MonsterKind.CHERNOSLIZ || e.monsterStage === 1) return false;
  if (!isChernoSlizHidden(world, e)) return false;
  const noise = findNoiseForActor(world, state, e, time, { minSeverity: 2, scanInterval: 0.65, hearingMult: 1.24 });
  if (!noise || !chernoslizRevealNoise(noise) || !takeFreshNoise(e, noise.id)) return false;
  revealChernoSlizByNoise(world, e, noise, time, msgs, state);
  return true;
}

function findChernoSlizTarget(world: World, e: Entity, dt: number): Entity | null {
  const ai = e.ai!;
  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatTargetId !== undefined) {
    const cached = _entityById.get(ai.combatTargetId);
    if (cached && chernoslizCanTarget(world, e, cached)) return cached;
    ai.combatTargetId = undefined;
  }
  if (ai.combatScanCd > 0) return null;

  ai.combatScanCd = fixedScanCd(e) ?? 0.75;
  let target: Entity | null = null;
  let best = chernoslizDetectSq(world, e);
  getEntityIndex().queryRadiusCapped(e.x, e.y, Math.sqrt(best), chernoslizTargetQuery, ENTITY_MASK_ACTOR, CHERNOSLIZ_SCAN_CAP);
  for (const other of chernoslizTargetQuery) {
    if (!chernoslizCanTarget(world, e, other)) continue;
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    if (d2 >= best) continue;
    best = d2;
    target = other;
  }
  if (target) ai.combatTargetId = target.id;
  return target;
}

function stampChernoSlizWake(world: World, e: Entity, time: number): void {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const fx = ((e.x % 1) + 1) % 1;
  const fy = ((e.y % 1) + 1) % 1;
  const seed = Math.imul(e.id, 977) ^ Math.floor(time * 10);
  stampMark(world, x, y, fx, fy, 0.44, MarkType.SPLAT, seed, 36, 42, 62, 130);
  stampMark(world, x, y, fx, fy, 0.18, MarkType.PSI, seed ^ 0x5a17, 58, 210, 82, 95);
}

function stampWetStriderRipple(world: World, e: Entity, time: number): void {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const fx = ((e.x % 1) + 1) % 1;
  const fy = ((e.y % 1) + 1) % 1;
  const seed = Math.imul(e.id, 1229) ^ Math.floor(time * 8);
  stampMark(world, x, y, fx, fy, e.monsterKind === MonsterKind.TUBE_EEL ? 0.36 : 0.42, MarkType.SPLAT, seed, 42, 120, 138, 110);
}

function updateWaterStriderState(world: World, e: Entity, dt: number, time: number): void {
  if (!hasAIFlag(e, 'waterStrider')) return;
  const wet = wetTerrainAtEntity(world, e);
  if (wet && time - (e.monsterArmorLastMsgAt ?? -Infinity) >= WATER_STRIDER_RIPPLE_SEC) {
    e.monsterArmorLastMsgAt = time;
    stampWetStriderRipple(world, e, time);
  }
  if (e.monsterKind !== MonsterKind.LOTOCHNIK) return;
  const maxHp = e.maxHp ?? e.hp ?? MONSTERS[MonsterKind.LOTOCHNIK].hp;
  if (wet) {
    if ((e.hp ?? maxHp) < maxHp) e.hp = Math.min(maxHp, (e.hp ?? maxHp) + dt * LOTOCHNIK_WET_REGEN_PER_SEC);
    e.spriteScale = Math.max(e.spriteScale ?? 1, 1.04);
  } else if (e.spriteScale !== undefined && e.spriteScale > 1.02 && e.spriteScale < 1.08) {
    e.spriteScale = undefined;
  }
}

/** Строка якоря вида, если она есть. */
function monsterAnchorDef(e: Entity): MonsterAnchorDef | undefined {
  return e.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.anchor : undefined;
}

function monsterMoveMult(world: World, e: Entity, target?: Entity): number {
  const anchor = monsterAnchorDef(e);
  if (anchor?.moveMult !== undefined) {
    return monsterAnchored(world, e) ? anchor.moveMult : (anchor.cutMoveMult ?? 1);
  }
  if (hasAIFlag(e, 'debrisLurker')) return inDebrisCover(world, e) ? 1.22 : 0.68;
  if (hasAIFlag(e, 'documentScent')) {
    const strength = documentScentStrength(target);
    return strength > 0 ? Math.min(1.78, 1.2 + strength * 0.08) : 0.68;
  }
  if (hasAIFlag(e, 'fogSwimmer')) return fogSharkMoveMultiplierForTests(world, e);
  switch (e.monsterKind) {
    case MonsterKind.SHADOW: {
      const light = entityLight(world, e);
      if (light >= SHADOW_LIGHT_SAFE) return 0.78;
      if (light <= SHADOW_DARK_LIGHT) return 1.08;
      return 1;
    }
    case MonsterKind.TVAR:
      return monsterWallContext(world, e).adjacentWall ? 1.12 : 0.96;
    case MonsterKind.CHERNOSLIZ:
      return isBlackWaterWakeCell(world, e) ? 1.0 : 0.46;
    case MonsterKind.HEAD_SLUG:
      return isHeadSlugDetached(e) ? 1.14 : 1;
	    case MonsterKind.OLGOY:
	      return olgoyTerrainMoveMult(world, e);
	    case MonsterKind.PANELNIK:
	      if ((e.ai?.wallBraceSlowTimer ?? 0) > 0) return PANELNIK_OPEN_SLOW_MULT;
	      return panelnikWallBraceActive(world, e) ? 1.02 : 0.9;
	    default:
	      break;
	  }
  if (hasAIFlag(e, 'wallBias')) {
    const ctx = monsterWallContext(world, e);
    return ctx.adjacentWall || ctx.narrowDoorOrCorner ? 1.18 : 0.92;
  }
  if (hasAIFlag(e, 'waterPressureLine')) {
    return isVodyanoyWetLineCell(world, Math.floor(e.x), Math.floor(e.y)) ? 1.16 : 0.86;
  }
  if (hasAIFlag(e, 'waterStrider')) {
    return wetTerrainAtEntity(world, e) ? 1.45 : 0.72;
  }
  if (hasAIFlag(e, 'slimeStrider')) {
    if (isSlimeWomanWetCell(world, e)) return 1.48;
    return isSlimeWomanDryCounterCell(world, e) ? 0.58 : 0.86;
  }
  return 1;
}

function monsterDmgMult(world: World, e: Entity, target?: Entity): number {
  const anchor = monsterAnchorDef(e);
  if (anchor?.dmgMult !== undefined) {
    return monsterAnchored(world, e) ? anchor.dmgMult : (anchor.cutDmgMult ?? 1);
  }
  if (hasAIFlag(e, 'debrisLurker')) return inDebrisCover(world, e) ? 1.25 : 0.75;
  switch (e.monsterKind) {
    case MonsterKind.SHADOW: {
      const light = entityLight(world, e);
      if (light >= SHADOW_LIGHT_SAFE) return 0.72;
      if (light <= SHADOW_DARK_LIGHT) return 1.1;
      return 1;
    }
    case MonsterKind.TVAR:
      return wallTerrainPressureActive(world, e, target) ? 1.22 : 1;
    case MonsterKind.ZOMBIE: {
      if (!target) return 1;
      const pressure = cheapCrowdPressure(world, e, target, ZOMBIE_CROWD_PRESSURE_RADIUS, ZOMBIE_CROWD_PRESSURE_SCAN_CAP, zombieCrowdQuery);
      const bonus = Math.min(
        ZOMBIE_CROWD_DAMAGE_CAP - 1,
        pressure.crowd * ZOMBIE_CROWD_DAMAGE_BONUS + (pressure.choke ? ZOMBIE_DOOR_DAMAGE_BONUS : 0),
      );
      return 1 + Math.max(0, bonus);
    }
    case MonsterKind.POLZUN:
      return inPolzunKillCell(world, e) || (target !== undefined && inPolzunKillCell(world, target)) ? 1.35 : 1;
    case MonsterKind.CHERNOSLIZ:
      return isBlackWaterWakeCell(world, e) ? 1.28 : 0.62;
    case MonsterKind.BEZEKHIY:
      return target !== undefined && targetBackTurned(world, e, target) ? 1.55 : 0.72;
    case MonsterKind.HEAD_SLUG:
      return isHeadSlugDetached(e) ? 0.55 : 1;
    case MonsterKind.OLGOY:
      return olgoyTerrainDmgMult(world, e, target);
    case MonsterKind.ROBOT:
      return robotPlasmaWetRiskMult(world, e, target);
    default:
      break;
  }
  if (hasAIFlag(e, 'wallBias')) return wallTerrainPressureActive(world, e, target) ? 1.2 : 1;
  if (hasAIFlag(e, 'documentScent')) return documentScentStrength(target) > 0 ? 1.14 : 0.82;
  if (hasAIFlag(e, 'fogSwimmer')) return fogSharkHasFogPressure(world, e) ? FOG_SHARK_FOG_DAMAGE_MULT : FOG_SHARK_DRY_DAMAGE_MULT;
  if (hasAIFlag(e, 'officeField')) return officeFieldPressure(world, e, target);
  if (hasAIFlag(e, 'waterStrider')) return wetTerrainAtEntity(world, e) ? 1.18 : 0.78;
  if (hasAIFlag(e, 'slimeStrider')) {
    if (isSlimeWomanWetCell(world, e)) return 1.12;
    return isSlimeWomanDryCounterCell(world, e) ? 0.7 : 0.9;
  }
  return 1;
}

function robotPlasmaWetRiskMult(world: World, e: Entity, target?: Entity): number {
  if (!target) return 1;
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  const tx = Math.floor(target.x);
  const ty = Math.floor(target.y);
  return isDrainLineCell(world, ex, ey) || isDrainLineCell(world, tx, ty) ? 1.16 : 1;
}

function updateLampPoweredReadability(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  const anchor = monsterAnchorDef(e);
  if (!hasAIFlag(e, 'lampPowered') || !anchor) return;
  // Тот же вопрос, что у множителя урона, и задаётся он тем же поиском: вторая
  // копия «есть ли лампа в трёх клетках» стояла здесь своим `nearFeature`.
  const powered = target?.alive === true && monsterAnchored(world, e);
  const wasPowered = lampPoweredRuntime.get(e) === true;
  lampPoweredRuntime.set(e, powered);
  if (!powered || wasPowered || !target) return;

  if (target.id === playerId) {
    msgs.push(msg('Ламповый зазвенел под лампой: свет усилил удар. Отводите его на три клетки или за угол.', time, '#fd6'));
  }
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', isPlayerEntity(target) ? 4 : 3, ['lampovy', 'lamp_powered', 'light', 'warning'], {
    lampRadius: anchor.radius,
    damageMult: anchor.dmgMult,
    counterplay: 'leave_lamp_cluster_or_break_line',
  });
}

/**
 * Дальность обнаружения особи.
 *
 * Постоянная дальность вида — ДАННЫЕ (`MonsterDef.detect`), и она идёт первой:
 * новый вид объявляет своё чутьё рядом со скоростью и уроном, а не двадцатью
 * константами `*_DETECT_SQ` в теле общего AI. Ниже остались только ОБСТАНОВОЧНЫЕ
 * дальности — те, что вид считает по туману, укрытию или питанию от сети;
 * числом их не выразить, и данными они быть не могут.
 *
 * Сытость режет чутьё до радиуса непосредственной угрозы: наевшаяся тварь
 * ушла переваривать и прохожего не выцеливает, но того, кто подошёл вплотную
 * или ударил, всё ещё видит.
 */
function monsterDetectSq(world: World, e: Entity, fallback: number, time: number): number {
  if (hasAIFlag(e, 'rootHive')) return bloodPlantTendrilRangeSq();
  const anchor = monsterAnchorDef(e);
  if (anchor?.detect !== undefined) {
    const reach = monsterAnchored(world, e) ? anchor.detect : (anchor.cutDetect ?? anchor.detect);
    return reach * reach;
  }
  if (hasAIFlag(e, 'fogSwimmer')) return fogSharkHasFogPressure(world, e) ? FOG_SHARK_DETECT_SQ : FOG_SHARK_DRY_DETECT_SQ;
  if (hasAIFlag(e, 'blackWaterWake')) return chernoslizDetectSq(world, e);
  if (hasAIFlag(e, 'debrisLurker')) {
    return inDebrisCover(world, e) ? DEBRIS_LURKER_COVER_DETECT_SQ : DEBRIS_LURKER_EXPOSED_DETECT_SQ;
  }
  const base = declaredDetectSq(e, fallback);
  if (base > IMMEDIATE_THREAT_RADIUS_SQ && isMonsterSated(e, time)) return IMMEDIATE_THREAT_RADIUS_SQ;
  return base;
}

function updateBloodPlantRootHive(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  if (!hasAIFlag(e, 'rootHive')) return false;
  const ai = e.ai!;
  ai.path = [];
  ai.pi = 0;

  const root = bloodPlantState.of(e);
  root.scanCd = Math.max(0, root.scanCd - dt);
  if (root.scanCd <= 0) {
    const heal = healBloodPlantFromRedMold(world, e);
    if (heal.healed > 0 && target?.id === playerId && world.dist2(e.x, e.y, target.x, target.y) <= bloodPlantTendrilRangeSq()) {
      msgs.push(msg('Красная плесень в ящиках кормит ствол. Уберите пробу или жгите быстрее.', time, '#d66'));
    }
    root.scanCd = BLOOD_PLANT_HEAL_SCAN_SEC + ((e.id % 3) * 0.13);
  }

  if (!target?.alive || !canBeMonsterTarget(target) || !isHostile(e, target)) {
    ai.goal = AIGoal.IDLE;
    ai.combatTargetId = undefined;
    return true;
  }

  const d2 = world.dist2(e.x, e.y, target.x, target.y);
  if (d2 > bloodPlantTendrilRangeSq()) {
    ai.goal = AIGoal.IDLE;
    ai.combatTargetId = undefined;
    return true;
  }

  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = target.id;
  e.angle = Math.atan2(world.delta(e.y, target.y), world.delta(e.x, target.x));
  if ((e.attackCd ?? 0) > 0) return true;

  const cells = traceBloodPlantTendrilCells(world, e.x, e.y, target.x, target.y, BLOOD_PLANT_TENDRIL_MAX_CELLS);
  const targetCell = world.idx(Math.floor(target.x), Math.floor(target.y));
  let hit = false;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const x = cell % W;
    const y = (cell / W) | 0;
    stampMark(world, x, y, 0.5, 0.5, 0.32, MarkType.SPLAT, 15015 + e.id * 17 + i, 130, 12, 24, 185);
    if (cell === targetCell) hit = true;
  }

  if (hit && target.hp !== undefined) {
    const def = MONSTERS[MonsterKind.BLOOD_PLANT];
    const dmg = monsterStrikeDamage(e, target, time, def.dmg);
    applyMonsterStrike(world, state, e, target, dmg, def.strike!, time, msgs, playerId);
    if (target.id === playerId) msgs.push(msg(`Корень кровавого растения ударил из пола: -${dmg}`, time, '#f77'));
    playSoundAt(playGrowl, e.x, e.y);
  }

  e.attackCd = MONSTERS[MonsterKind.BLOOD_PLANT].attackRate;
  return true;
}

function updateBorshchevikRootedPlant(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  if (!hasAIFlag(e, 'rootedPlant')) return false;
  const ai = e.ai!;
  ai.path = [];
  ai.pi = 0;

  if (!target?.alive || !canBeMonsterTarget(target) || !isHostile(e, target)) {
    ai.goal = AIGoal.IDLE;
    ai.combatTargetId = undefined;
    return true;
  }

  const d2 = world.dist2(e.x, e.y, target.x, target.y);
  if (d2 > BORSHCHEVIK_DETECT_SQ) {
    ai.goal = AIGoal.IDLE;
    ai.combatTargetId = undefined;
    return true;
  }

  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = target.id;
  e.angle = Math.atan2(world.delta(e.y, target.y), world.delta(e.x, target.x));
  const roots = borshchevikState.of(e);
  roots.puffCd = Math.max(0, roots.puffCd - dt);
  roots.rootCd = Math.max(0, roots.rootCd - dt);

  if (d2 <= BORSHCHEVIK_SEED_SQ && roots.puffCd <= 0) {
    if (state) releaseBorshchevikSeedPuff(world, state, e, target, 'seed');
    roots.puffCd = BORSHCHEVIK_SEED_COOLDOWN_SEC + ((e.id % 5) * 0.23);
  }

  if (roots.rootCd <= 0 && state && damageBorshchevikRootSite(world, state, e)) {
    roots.rootCd = BORSHCHEVIK_ROOT_COOLDOWN_SEC;
    if (target.id === playerId) msgs.push(msg('Корни борщевика хрустнули в слабой стене. Обход меняется.', time, '#cf8'));
  } else if (roots.rootCd <= 0) {
    roots.rootCd = BORSHCHEVIK_ROOT_COOLDOWN_SEC;
  }

  if (d2 <= BORSHCHEVIK_SAP_RANGE_SQ && (e.attackCd ?? 0) <= 0) {
    const def = MONSTERS[MonsterKind.BORSHCHEVIK];
    const dmg = monsterStrikeDamage(e, target, time, def.dmg);
    applyMonsterStrike(world, state, e, target, dmg, def.strike!, time, msgs, playerId);
    if (target.id === playerId) msgs.push(msg(`Сок борщевика жжет кожу: -${dmg}`, time, '#df6'));
    playSoundAt(playGrowl, e.x, e.y);
    e.attackCd = def.attackRate;
  }

  return true;
}

function followMonsterPath(world: World, e: Entity, dt: number, target?: Entity): void {
  const mult = monsterMoveMult(world, e, target);
  if (mult === 1) {
    followPath(world, e, dt);
    return;
  }
  const baseSpeed = e.speed;
  e.speed = baseSpeed * mult;
  followPath(world, e, dt);
  e.speed = baseSpeed;
}

function tryFollowMonsterBait(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): boolean {
  const combatLockSq = e.monsterKind === MonsterKind.OLGOY ? OLGOY_COMBAT_LOCK_SQ : MONSTER_BAIT_COMBAT_LOCK_SQ;
  if (target && !hasAIFlag(e, 'garbageSurround') && !hasAIFlag(e, 'sourceSwarm') && world.dist2(e.x, e.y, target.x, target.y) <= combatLockSq) {
    if (!isDocumentPressureHunter(e) || hasDocumentLikeItem(target)) return false;
  }
  const bait = findMonsterBaitTarget(world, e, dt, time, state);
  if (!bait) return false;

  const ai = e.ai!;
  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = undefined;
  const baitD2 = world.dist2(e.x, e.y, bait.x, bait.y);
  if (baitD2 <= MONSTER_BAIT_CONSUME_RADIUS_SQ) {
    const dropId = consumeMonsterBait(state, bait, e, time);
    if (dropId !== undefined) {
      const drop = _entityById.get(dropId);
      if (drop) clearDeadBaitDrop(drop);
    }
    ai.path = [];
    ai.pi = 0;
    if (e.monsterKind === MonsterKind.OLGOY) {
      publishOlgoyFed(state, world, e, undefined, time, 'bait', {
        baitId: bait.id,
        itemId: bait.itemId,
        itemName: bait.itemName,
        risk: bait.risk,
        strength: bait.strength,
      });
    }
    msgs.push(msg(
      e.monsterKind === MonsterKind.OLGOY
        ? `${entityDisplayName(e)} ушел на мясную приманку`
        : `${entityDisplayName(e)} сожрал приманку`,
      time,
      '#ca6',
    ));
    return true;
  }

  const tx = Math.floor(bait.x);
  const ty = Math.floor(bait.y);
  ai.timer -= dt;
  if (monsterRepathDue(world, e) || !pathTargetIs(world, e, tx, ty)) {
    assignMonsterPath(world, e, tx, ty, 1.4);
  }
  if (ai.path.length === 0) return false;
  followMonsterPath(world, e, dt);
  return true;
}

function tryFollowNoise(
  world: World,
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): boolean {
  if (hasAIFlag(e, 'silent')) return false;
  const noise = findNoiseInvestigationTarget(world, state, e, time);
  if (!noise) return false;

  const ai = e.ai!;
  if (noise.id !== ai.lastSeenNoiseId) {
    ai.lastSeenNoiseId = noise.id;
    if (noise.actorId !== undefined) {
      ai.lastSeenTargetId = noise.actorId;
    }
    if (e.type === EntityType.NPC) emitMarkovBark(e, msgs, time, 'alert', 'Что там?', 1.0, '#aac');
  }

  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = undefined;
  const tx = Math.floor(noise.x);
  const ty = Math.floor(noise.y);
  ai.timer -= dt;
  if (monsterRepathDue(world, e) || !pathTargetIs(world, e, tx, ty)) {
    assignMonsterPath(world, e, tx, ty, 1.25);
  }
  if (ai.path.length === 0) return false;
  followMonsterPath(world, e, dt);
  return true;
}

function updateSborkaReadability(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  if (e.monsterKind !== MonsterKind.SBORKA || !target || e.ai?.lastSeenTargetId === target.id) return;
  e.ai!.lastSeenTargetId = target.id;
  if (target.id === playerId) {
    msgs.push(msg('Сборка щелкнула проволокой и пошла первой. Широкий проход и дешевый выстрел решают до касания.', time, '#f86'));
  }
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', target.id === playerId ? 4 : 3, ['sborka', 'cheap_chaser', 'first_sight'], {
    counterplay: 'wide_floor_early_shot_or_bait_before_combat_lock',
  });
}

function updateZombieCrowdReadability(
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  if (e.monsterKind !== MonsterKind.ZOMBIE || e.ai?.lastSeenTargetId === target.id) return;
  const pressure = cheapCrowdPressure(world, e, target, ZOMBIE_CROWD_PRESSURE_RADIUS, ZOMBIE_CROWD_PRESSURE_SCAN_CAP, zombieCrowdQuery);
  if (!pressure.choke && pressure.crowd <= 0) return;
  e.ai!.lastSeenTargetId = target.id;
  if (target.id === playerId) {
    msgs.push(msg('Мертвяк хватил из дверной толпы. Выводи его на пустой проход до первого касания.', time, '#f87'));
  }
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', target.id === playerId ? 4 : 3, ['zombie', 'crowd_chaser', 'door_pressure'], {
    crowd: pressure.crowd,
    capped: pressure.capped,
    choke: pressure.choke,
    damageCap: ZOMBIE_CROWD_DAMAGE_CAP,
    counterplay: 'wide_floor_early_hits_before_door_or_crowd_contact',
  });
}

function updatePomoynyRoyReadability(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  if (!hasAIFlag(e, 'garbageSurround') || target?.id !== playerId || e.ai?.lastSeenTargetId === playerId) return;
  const scent = pomoynyRoyScentScore(target);
  if (scent <= 0.2) return;
  e.ai!.lastSeenTargetId = playerId;
  msgs.push(msg('Помойный рой развернул край на запах еды. Закройте запас или бросайте приманку в сторону.', time, '#ca6'));
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['pomoyny_roy', 'garbage_surround', 'food_scent'], {
    scent: Math.round(scent * 100) / 100,
    counterplay: 'sealed_food_side_bait_fire_lane',
    slotRadius: POMOYNY_ROY_SLOT_RADIUS,
  });
}

function rzhavnikDormantAnchor(world: World, e: Entity): boolean {
  const roomType = world.roomAt(e.x, e.y)?.type;
  if (roomType === RoomType.STORAGE) return true;
  if (roomType === RoomType.PRODUCTION && nearDebrisFeature(world, e, 2)) return true;
  return nearDebrisFeature(world, e, 1);
}

function rzhavnikWakeNoise(noise: NoiseRecord): boolean {
  if (noise.source === 'explosion') return true;
  if (noise.source === 'weapon_fire' && noise.severity >= 3) return true;
  if (noise.source === 'melee' && (noise.tags.includes('metal') || noise.itemId === 'rebar')) return true;
  return noise.tags.includes('metal') || noise.tags.includes('pipe') || noise.tags.includes('valve');
}

function stampRzhavnikScrape(world: World, e: Entity, time: number): void {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  const seed = Math.imul(e.id, 11_231) ^ Math.floor(time * 20);
  stampMark(world, x, y, 0.5, 0.5, 0.46, MarkType.BULLET, seed, 165, 86, 36, 135);
  stampMark(world, x, y, 0.5, 0.58, 0.28, MarkType.DRIP, seed ^ 0x7a4, 20, 16, 12, 120);
}

function publishRzhavnikWake(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity | undefined,
  reason: string,
): void {
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['rzhavnik', 'scrap_wake', reason], {
    reason,
    windupSec: RZHAVNIK_LEAP_WINDUP_SEC,
    leapStep: RZHAVNIK_LEAP_STEP,
    counterplay: 'poke_straight_scrap_from_range_then_dodge_first_leap',
  });
}

function wakeRzhavnik(
  world: World,
  e: Entity,
  target: Entity | undefined,
  x: number,
  y: number,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
  reason: string,
): void {
  const ai = e.ai!;
  ai.scrapWake = 1;
  // Замах у семьи один и общий: `windupTimer`. Свой второй таймер рядом с ним
  // означал только то, что Ржавника писали отдельно от остальных.
  ai.windupTimer = RZHAVNIK_LEAP_WINDUP_SEC;
  ai.windupTargetId = target?.id;
  ai.combatTargetId = target?.id;
  ai.goal = AIGoal.HUNT;
  ai.tx = world.wrap(Math.floor(x));
  ai.ty = world.wrap(Math.floor(y));
  ai.path = [];
  ai.pi = 0;
  e.spriteScale = 1.16;
  stampRzhavnikScrape(world, e, time);
  if (isPlayerEntity(target)) {
    msgs.push(msg('Ровная стопка ржавых прутьев разложилась в ноги. Уклоняйтесь от первого рывка.', time, '#d86'));
  }
  publishRzhavnikWake(state, world, e, target, reason);
  playSoundAt(playGrowl, e.x, e.y);
}

/**
 * Хрупкий корпус после состоявшегося рывка. Числа — колонки `dash`.
 *
 * Пол `Math.max(18, …)` снят как МЁРТВЫЙ. Он срабатывал бы только при
 * `maxHp <= 31`, а нижняя граница здоровья Ржавника — 72 из его же дефа:
 * `scaleMonsterHp` умножает на `1 + 0.12·(уровень−1)` и НИЖЕ базы не опускает
 * ни на одном уровне, а самый скупой спавнер (`hermodoor_borer`, ×0.85 с полом
 * 26) даёт 61. Хрупкое состояние при этом ставится РОВНО ОДИН РАЗ на особь:
 * после рывка `scrapWake = 2`, а обратно в 1 переводит только пробуждение из
 * спячки, закрытое проверкой `scrapWake === 2`. То есть 72·0.58 = 42, и до 18
 * выражение не доходило ни в одной расстановке.
 */
function applyRzhavnikFragileState(e: Entity): void {
  const dash = MONSTERS[MonsterKind.RZHAVNIK].dash!;
  const maxHp = e.maxHp ?? e.hp ?? MONSTERS[MonsterKind.RZHAVNIK].hp;
  const fragileMax = Math.round(maxHp * (dash.fragileHpMult ?? 1));
  if (e.maxHp === undefined || e.maxHp > fragileMax) e.maxHp = fragileMax;
  if (e.hp !== undefined && e.hp > fragileMax) e.hp = fragileMax;
  e.monsterDmgMult = Math.min(e.monsterDmgMult ?? 1, dash.fragileDmgMult ?? 1);
  e.spriteScale = 0.88;
}

function finishRzhavnikLeap(
  world: World,
  e: Entity,
  target: Entity | undefined,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  const ai = e.ai!;
  const dash = MONSTERS[MonsterKind.RZHAVNIK].dash!;
  const tx = target?.alive ? target.x : ai.tx + 0.5;
  const ty = target?.alive ? target.y : ai.ty + 0.5;
  const landing = dashLanding(world, e, tx, ty, dash);
  const dirAngle = Math.atan2(landing.dirY, landing.dirX);
  /* Упёрся — значит рывка НЕ БЫЛО.
   *
   * Здесь стояло `if (свободно) { … }` без `else`: тварь оставалась на месте, но
   * дальше шла та же дорога, что и после состоявшегося прыжка — проверка
   * попадания, `scrapWake = 2` и НЕОБРАТИМЫЙ хрупкий корпус (maxHp ×0.58). То
   * есть 42% здоровья снимались за срыв, которого не случилось; ни у одного
   * другого члена семьи рывков срыв не наказывается необратимо.
   *
   * Хрупкость — цена состоявшегося удара о мир, а не о собственную стену:
   * ржавый набор прутьев разлетается, когда долетел. Упёршийся скользит вдоль
   * препятствия общим шагом семьи (колонка `slideOnBlock`), теряет засаду и
   * получает ту же отдачу, но остаётся целым. */
  const leaped = dashTo(world, e, landing.x, landing.y, dash) === DashStep.CLEAR;
  e.angle = dirAngle;

  let damage = 0;
  if (target?.alive && target.hp !== undefined && dashReached(world, e, target, dash)) {
    const def = MONSTERS[MonsterKind.RZHAVNIK];
    // Множитель рывка — колонка `dash.damageMult`; всё прочее общая формула.
    damage = monsterStrikeDamage(e, target, time, def.dmg, dash.damageMult ?? 1);
    // Единая дверь урона со всем конвейером: резист надетой брони цели и
    // врождённая броня твари. Разбор — `ActorDamageInput.applied`.
    applyMonsterStrike(world, state, e, target, damage, def.strike!, time, msgs, playerId);
  }

  ai.scrapWake = 2;
  ai.windupTimer = undefined;
  ai.windupTargetId = undefined;
  ai.staggerTimer = Math.max(ai.staggerTimer ?? 0, 0.42);
  e.attackCd = Math.max(e.attackCd ?? 0, MONSTERS[MonsterKind.RZHAVNIK].attackRate * 0.85);
  if (leaped) applyRzhavnikFragileState(e);
  else e.spriteScale = undefined;
  stampRzhavnikScrape(world, e, time);
  if (isPlayerEntity(target)) {
    msgs.push(msg(
      damage > 0
        ? `Ржавник попал первым рывком: -${damage}. Теперь корпус хрупкий.`
        : leaped
          ? 'Ржавник промахнулся первым рывком и рассыпался в хрупкую походку.'
          : 'Ржавник ткнулся рывком в препятствие и заскрёб вдоль него. Корпус цел.',
      time,
      damage > 0 ? '#f86' : '#fc4',
    ));
  }
}

function updateRzhavnikScrapWake(
  world: World,
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  if (!hasAIFlag(e, 'scrapWake')) return false;
  const ai = e.ai!;
  if (ai.scrapWake === undefined) ai.scrapWake = rzhavnikDormantAnchor(world, e) ? 0 : 2;

  if (ai.scrapWake === 2) {
    e.monsterDmgMult = Math.min(e.monsterDmgMult ?? 1, MONSTERS[MonsterKind.RZHAVNIK].dash?.fragileDmgMult ?? 1);
    return false;
  }

  if (ai.scrapWake === 1) {
    ai.windupTimer = Math.max(0, (ai.windupTimer ?? 0) - dt);
    e.spriteScale = 1.12 + ai.windupTimer * 0.18;
    if (ai.windupTimer > 0) return true;
    const cached = ai.combatTargetId !== undefined ? _entityById.get(ai.combatTargetId) : undefined;
    // Рывок идёт в того, кого разбудили. Потеряв цель, ржавник ищет ближайшего
    // рядом теми же глазами, что и при пробуждении, а не игрока по всему этажу.
    const target = cached?.alive
      ? cached
      : findImmediateCombatTarget(world, e, RZHAVNIK_LEAP_STEP * RZHAVNIK_LEAP_STEP, canBeMonsterTarget) ?? undefined;
    finishRzhavnikLeap(world, e, target, time, msgs, playerId, state);
    return true;
  }

  const maxHp = e.maxHp ?? e.hp ?? MONSTERS[MonsterKind.RZHAVNIK].hp;
  const damaged = e.hp !== undefined && e.hp < maxHp;
  const closeTarget = findImmediateCombatTarget(world, e, RZHAVNIK_CLOSE_WAKE_SQ, canBeMonsterTarget);
  const noise = findNoiseForActor(world, state, e, time, {
    minSeverity: 2,
    scanInterval: 0.25,
    hearingMult: 1.2,
  });

  if (damaged) {
    // Просыпается на того, кто ткнул: источник урона лежит в памяти угроз, и он
    // одинаков для выстрела NPC и для выстрела игрока.
    const poker = getRecentCombatThreat(e, time)?.attacker;
    wakeRzhavnik(world, e, poker?.alive ? poker : closeTarget ?? undefined, e.x, e.y, time, msgs, state, 'ranged_poke');
    return true;
  }
  if (closeTarget) {
    wakeRzhavnik(world, e, closeTarget, closeTarget.x, closeTarget.y, time, msgs, state, 'close_approach');
    return true;
  }
  if (noise && rzhavnikWakeNoise(noise)) {
    const noiseActor = noise.actorId !== undefined ? _entityById.get(noise.actorId) : undefined;
    wakeRzhavnik(world, e, noiseActor?.alive ? noiseActor : undefined, noise.x, noise.y, time, msgs, state, 'loud_metal');
    return true;
  }

  ai.goal = AIGoal.IDLE;
  ai.combatTargetId = undefined;
  ai.path = [];
  ai.pi = 0;
  e.spriteScale = 0.62;
  return true;
}

function publishZhornayaScentEvent(
  state: GameState | undefined,
  world: World,
  e: Entity,
  scent: ZhornayaScentTarget,
  playerId: number,
  reason: string,
): void {
  if (!state) return;
  const target = scent.entity?.id === playerId ? scent.entity : undefined;
  publishEvent(state, {
    type: 'monster_sighted',
    zoneId: zoneIdAt(world, e.x, e.y),
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target?.id,
    targetName: target ? entityDisplayName(target) : undefined,
    targetFaction: target?.faction,
    itemId: scent.bait?.itemId ?? (scent.entity?.type === EntityType.ITEM_DROP ? scent.entity.inventory?.[0]?.defId : undefined),
    itemName: scent.bait?.itemName,
    monsterKind: e.monsterKind,
    severity: 3,
    privacy: target ? 'local' : 'witnessed',
    tags: ['monster', 'scent', 'lunge', scent.source, reason],
    data: {
      counterplay: 'sealed food, side bait, punish recovery',
      scentScore: scent.score,
      source: scent.source,
      baitId: scent.bait?.id,
      rumorIds: ['ecology_zhornaya_tvar_scent'],
    },
  });
}

function damageZhornayaTarget(
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  const def = MONSTERS[MonsterKind.ZHORNAYA_TVAR];
  if (target.hp === undefined) return false;
  const dmg = monsterStrikeDamage(e, target, time, def.dmg, def.dash?.damageMult ?? 1);
  applyMonsterStrike(world, state, e, target, dmg, def.strike!, time, msgs, playerId);

  const label = isPlayerEntity(target) ? 'тебя' : entityDisplayName(target);
  msgs.push(msg(`${entityDisplayName(e)} сорвалась на запах и ударила ${label}: -${dmg}`, time, '#f44'));
  return true;
}

function finishZhornayaLunge(
  world: World,
  e: Entity,
  scent: ZhornayaScentTarget,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  const ai = e.ai!;
  const dash = MONSTERS[MonsterKind.ZHORNAYA_TVAR].dash!;
  // Рывок шёл в обход коллизии и проносил тварь сквозь стены на четыре клетки.
  // Общий предикат семьи: до цели — только по свободному месту, упёрлась —
  // соскользнула вдоль препятствия (колонка `slideOnBlock`).
  const landing = dashLanding(world, e, scent.x, scent.y, dash);
  const dirAngle = Math.atan2(landing.dirY, landing.dirX);
  dashTo(world, e, landing.x, landing.y, dash);
  e.angle = dirAngle;

  let connected = false;
  if (scent.bait && world.dist2(e.x, e.y, scent.bait.x, scent.bait.y) <= MONSTER_BAIT_CONSUME_RADIUS_SQ) {
    const dropId = consumeMonsterBait(state, scent.bait, e, time);
    if (dropId !== undefined) {
      const drop = _entityById.get(dropId);
      if (drop) clearDeadBaitDrop(drop);
    }
    msgs.push(msg(`${entityDisplayName(e)} перелетела на приманку и жует`, time, '#ca6'));
    connected = true;
  } else if (scent.entity?.type === EntityType.ITEM_DROP && world.dist2(e.x, e.y, scent.entity.x, scent.entity.y) <= MONSTER_BAIT_CONSUME_RADIUS_SQ) {
    clearDeadBaitDrop(scent.entity);
    msgs.push(msg(`${entityDisplayName(e)} сорвалась на пищевой запах`, time, '#ca6'));
    connected = true;
  } else if (scent.entity && dashReached(world, e, scent.entity, dash)) {
    connected = damageZhornayaTarget(world, e, scent.entity, time, msgs, playerId, state);
  }

  if (!connected) {
    msgs.push(msg(`${entityDisplayName(e)} промахнулась рывком и тяжело собирает брюхо`, time, '#fc4'));
    publishZhornayaScentEvent(state, world, e, scent, playerId, 'missed');
  }

  ai.path = [];
  ai.pi = 0;
  ai.timer = 0.8;
  ai.staggerTimer = connected ? ZHORNAYA_HIT_RECOVERY_SEC : ZHORNAYA_MISS_RECOVERY_SEC;
  e.attackCd = connected ? MONSTERS[MonsterKind.ZHORNAYA_TVAR].attackRate : ZHORNAYA_MISS_COOLDOWN_SEC;
  e.spriteScale = connected ? 1.04 : 0.88;
  zhornayaScentRuntime.delete(e);
  playSoundAt(playGrowl, e.x, e.y);
}

function updateZhornayaTvar(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  if (!hasAIFlag(e, 'scentOvercommit')) return false;
  const ai = e.ai!;

  /* Боль сбивает УДАР, а не всего зверя.
   *
   * Здесь стояло `return true`: оглушённая тварь не нюхала, не шла и не меняла
   * цели — статуя на всю длину стаггера. Рывок и без того закрыт откатом атаки
   * ниже (`(e.attackCd ?? 0) <= 0`), а откат держит на остатке боли общий
   * обработчик в начале `updateMonster`. Осталась читаемая поза. */
  const staggered = (ai.staggerTimer ?? 0) > 0;
  e.spriteScale = staggered ? 0.88 : undefined;

  const scent = findZhornayaScentTarget(world, e, target, dt, time, state);
  if (!scent) return false;
  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = scent.entity && scent.entity.type !== EntityType.ITEM_DROP ? scent.entity.id : undefined;

  const d2 = world.dist2(e.x, e.y, scent.x, scent.y);
  if (scent.bait && d2 <= MONSTER_BAIT_CONSUME_RADIUS_SQ) {
    const dropId = consumeMonsterBait(state, scent.bait, e, time);
    if (dropId !== undefined) {
      const drop = _entityById.get(dropId);
      if (drop) clearDeadBaitDrop(drop);
    }
    msgs.push(msg(`${entityDisplayName(e)} сожрала приманку`, time, '#ca6'));
    ai.baitMarkerId = undefined;
    zhornayaScentRuntime.delete(e);
    return true;
  }
  if (scent.entity?.type === EntityType.ITEM_DROP && d2 <= MONSTER_BAIT_CONSUME_RADIUS_SQ) {
    clearDeadBaitDrop(scent.entity);
    msgs.push(msg(`${entityDisplayName(e)} сожрала пахнущий сброс`, time, '#ca6'));
    zhornayaScentRuntime.delete(e);
    return true;
  }

  if (d2 <= ZHORNAYA_LUNGE_RANGE_SQ && (e.attackCd ?? 0) <= 0
    && hasLineOfSight(world, e.x, e.y, scent.x, scent.y, ZHORNAYA_LUNGE_RANGE)) {
    e.spriteScale = 1.18;
    publishZhornayaScentEvent(state, world, e, scent, playerId, 'locked');
    finishZhornayaLunge(world, e, scent, time, msgs, playerId, state);
    return true;
  }

  e.spriteScale = staggered ? 0.88 : 1.08;
  const tx = Math.floor(scent.x);
  const ty = Math.floor(scent.y);
  ai.timer -= dt;
  if (monsterRepathDue(world, e) || !pathTargetIs(world, e, tx, ty)) {
    assignMonsterPath(world, e, tx, ty, 1.0);
  }
  if (ai.path.length > 0) followMonsterPath(world, e, dt);
  return true;
}

function findDocumentHunterTarget(world: World, _entities: Entity[], e: Entity, dt: number): Entity | null {
  const ai = e.ai!;
  let target: Entity | null = null;
  const docRangeSq = documentDetectSq(e);
  const fallbackRangeSq = documentFallbackSq(e);

  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatTargetId !== undefined) {
    const cached = _entityById.get(ai.combatTargetId);
    if (cached && cached.alive && canBeMonsterTarget(cached)) {
      const d2 = world.dist2(e.x, e.y, cached.x, cached.y);
      const documentRange = hasDocumentLikeItem(cached) && d2 < docRangeSq;
      const fallbackRange = d2 < fallbackRangeSq;
      if ((documentRange || fallbackRange) && isHostile(e, cached)) target = cached;
    }
    if (!target) ai.combatTargetId = undefined;
  }

  if (ai.combatScanCd! <= 0) {
    ai.combatScanCd = hasAIFlag(e, 'documentScent') ? 1.1 : 1.5;
    let docTarget: Entity | null = null;
    let docBest = docRangeSq;
    let fallbackTarget: Entity | null = null;
    let fallbackBest = fallbackRangeSq;
    getEntityIndex().queryRadiusCapped(e.x, e.y, Math.sqrt(docRangeSq), documentHunterQuery, ENTITY_MASK_ACTOR, DOCUMENT_HUNTER_SCAN_CAP);
    for (const other of documentHunterQuery) {
      if (!other.alive || other.id === e.id || !canBeMonsterTarget(other)) continue;
      if (!isHostile(e, other)) continue;
      const d2 = world.dist2(e.x, e.y, other.x, other.y);
      if (hasDocumentLikeItem(other) && d2 < docBest) {
        docBest = d2;
        docTarget = other;
      } else if (d2 < fallbackBest) {
        fallbackBest = d2;
        fallbackTarget = other;
      }
    }
    target = docTarget ?? fallbackTarget;
    if (target) ai.combatTargetId = target.id;
  }

  return target;
}

function applyKontorshchikGrab(
  state: GameState | undefined,
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
): void {
  if (e.monsterKind !== MonsterKind.KONTORSHCHIK || documentScentStrength(target) <= 0) return;
  const mark = markNoisyDocument(target, time, e.id);
  if (!mark) return;
  const targetIsPlayer = isPlayerEntity(target);
  msgs.push(msg(
    mark.marked
      ? `Конторщик проштамповал ${mark.itemName}: бумага шумит и тянет хват.`
      : `Конторщик дернул ${mark.itemName}, но бумага уже помечена иначе.`,
    time,
    targetIsPlayer ? '#d9b36a' : '#b98',
  ));
  if (!state) return;
  publishEvent(state, {
    type: 'monster_sighted',
    zoneId: zoneIdAt(world, e.x, e.y),
    x: e.x,
    y: e.y,
    actorId: e.id,
    actorName: entityDisplayName(e),
    actorFaction: e.faction,
    targetId: target.id,
    targetName: entityDisplayName(target),
    targetFaction: target.faction,
    monsterKind: e.monsterKind,
    itemId: mark.itemId,
    itemName: mark.itemName,
    severity: targetIsPlayer ? 4 : 3,
    privacy: targetIsPlayer ? 'local' : 'witnessed',
    tags: ['monster', 'kontorshchik', 'document_scent', 'noisy_document'],
    data: {
      noisyUntil: mark.until,
      noisyMarked: mark.marked,
      counterplay: 'drop_or_stash_documents',
      rumorIds: ['ecology_kontorshchik_forms'],
    },
  });
}

/* ── Общий шаг замаха ─────────────────────────────────────────────
 *
 * Взвод, снятие и объявление замаха были написаны по копии у каждого из семи
 * членов семьи. Разница между копиями — только числа и тексты, и они уехали в
 * `MonsterDef.windup`. Замыканий эти помощники не принимают и ничего на актора
 * в кадре не аллоцируют: причину срыва вызывающий считает сам и передаёт словом.
 */

/** Завести замах: длина, цель и поза взвода. */
function armWindup(e: Entity, target: Entity, sec: number, pose: number): void {
  const ai = e.ai!;
  ai.windupTimer = sec;
  ai.windupTargetId = target.id;
  e.spriteScale = pose;
}

/** Снять замах. `breakCd` — откат после срыва, если он у вида есть. */
function clearWindup(e: Entity, breakCd?: number): void {
  const ai = e.ai!;
  ai.windupTimer = undefined;
  ai.windupTargetId = undefined;
  e.spriteScale = undefined;
  if (breakCd !== undefined) e.attackCd = Math.max(e.attackCd ?? 0, breakCd);
}

/** Довернуться на цель — обязательный такт любого замаха. */
function faceWindupTarget(world: World, e: Entity, target: Entity): void {
  e.angle = Math.atan2(world.delta(e.y, target.y), world.delta(e.x, target.x));
}

/**
 * Вид взял цель на прицел — сказать это один раз на цель.
 *
 * Возвращает `true`, если объявление состоялось: у части видов за ним идёт рык.
 * Условие «цель — игрок и она новая» было переписано шесть раз слово в слово.
 */
function announceWindupSighting(
  world: World,
  e: Entity,
  target: Entity,
  playerId: number,
  time: number,
  msgs: Msg[],
  tags: string[],
  data: Record<string, unknown>,
  state?: GameState,
): boolean {
  const ai = e.ai!;
  if (target.id !== playerId || ai.lastSeenTargetId === playerId) return false;
  ai.lastSeenTargetId = playerId;
  msgs.push(msg(rangedMonsterSightMessage(e.monsterKind, entityDisplayName(e)), time, rangedMonsterColor(e.monsterKind)));
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, tags, data);
  return true;
}

/** Линия замаха этого вида: колонка `coverBlocks` решает, рвёт ли её мебель. */
function windupHasLine(world: World, e: Entity, target: Entity, windup: MonsterWindupDef, maxDist: number): boolean {
  return hasClearLine(world, e, target, maxDist, windup.coverBlocks === true);
}

/** Дальность срыва заведённого замаха. Без своей колонки — дальность взвода. */
function windupBreakRange(windup: MonsterWindupDef): number {
  return windup.breakRange ?? windup.range;
}

/**
 * Замах ближнего боя (`meleeWindup`): Косторез и Сейфгард.
 *
 * Оба вида были ЕДИНСТВЕННЫМИ со спецповедением и без единого флага — их
 * ворота стояли `switch`-ем по `MonsterKind`. Ворота теперь флаг, числа и
 * тексты — строка `MonsterDef.windup`, и второй вид берёт эту механику
 * объявлением, а не правкой общего AI.
 */
function publishMeleeWindupEscape(
  world: World,
  e: Entity,
  target: Entity | undefined,
  playerId: number,
  state: GameState | undefined,
  reason: string,
): void {
  const ai = e.ai!;
  if (target?.id !== playerId && ai.lastSeenTargetId !== playerId) return;
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_escaped', 4, rangedMonsterTags(e.monsterKind, 'escaped'), { reason });
  ai.lastSeenTargetId = undefined;
}

function finishMeleeWindup(
  world: World,
  e: Entity,
  target: Entity,
  def: MonsterDef,
  windup: MonsterWindupDef,
  time: number,
  msgs: Msg[],
  state: GameState | undefined,
  playerId: number,
): void {
  /* Урон общий (`monsterStrikeDamage`), своя здесь только цена реза: бронелист
   * принимает один рез, и лист стоит нападающему половины урона.
   *
   * Скидка кожи желемыши идёт ДО реза, потому что она принадлежит цели, а рез —
   * удару: сначала сколько дошло до тела, потом сколько съел лист. На замеренных
   * числах порядок безразличен — пол 7 накрывает обе стороны (Косторез 17→12,
   * рез 7 в любом порядке; Сейфгард 24→17, рез 9 в любом порядке).
   *
   * Нижняя граница 7 живая: срабатывает под ознобом и теперь под кожей. */
  let dmg = monsterStrikeDamage(e, target, time, def.dmg);
  const armorCut = cutMetalSheet(target);
  if (armorCut) dmg = Math.max(7, Math.round(dmg * 0.55));
  const strikeVerb = windup.strikeVerb ?? 'бьёт';
  const targetLabel = isPlayerEntity(target) ? 'тебя' : entityDisplayName(target);

  // Строка попадания идёт ПЕРЕД строкой убийства и только по прошедшему урону,
  // поэтому её печатает общий шаг, а не вызывающий.
  const landed = applyMonsterStrike(
    world, state, e, target, dmg, def.strike ?? {}, time, msgs, playerId, undefined,
    armorCut
      ? `${entityDisplayName(e)} срезал бронелист и задел ${targetLabel}: -${dmg}`
      : `${entityDisplayName(e)} ${strikeVerb} ${targetLabel}: -${dmg}`,
    armorCut ? '#fc4' : '#f44',
  );
  if (landed) {
    publishMonsterReadabilityEvent(state, world, e, target, 'monster_armor_cut', armorCut ? 5 : 4, rangedMonsterTags(e.monsterKind, 'hit', armorCut ? 'armor_cut' : 'burst'), {
      damage: dmg,
      armorCut,
      itemId: armorCut ? 'metal_sheet' : undefined,
      itemName: armorCut ? ITEMS.metal_sheet?.name : undefined,
    });
  }

  e.attackCd = def.attackRate;
  clearWindup(e);
  if (target.id === playerId) e.ai!.lastSeenTargetId = playerId;
  playSoundAt(playGrowl, e.x, e.y);
}

function updateMeleeWindup(
  world: World,
  e: Entity,
  target: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  const def = e.monsterKind !== undefined ? MONSTERS[e.monsterKind] : undefined;
  const windup = monsterWindup(e.monsterKind);
  if (!def || !windup) return false;
  const ai = e.ai!;
  const dist = Math.sqrt(world.dist2(e.x, e.y, target.x, target.y));
  const breakRange = windupBreakRange(windup);

  if (announceWindupSighting(world, e, target, playerId, time, msgs, rangedMonsterTags(e.monsterKind, 'sighted', 'warning'), {
    counterplay: windup.counterplay,
  }, state)) {
    playSoundAt(playGrowl, e.x, e.y);
  }

  /* Боль сбивает УДАР, а не всего зверя.
   *
   * Здесь стояло `return true`: элита на всю длину стаггера становилась статуей —
   * не шла, не перецеливалась, не разрывала дистанцию. Дробь по элите даёт до
   * секунды боли, и два попадания с интервалом в секунду держали её замороженной
   * насмерть — ровно тот стан-лок, против которого подняли `STAGGER_MIN_HP_RATIO`
   * и рефрактерное окно в `systems/combat.ts`.
   *
   * Замах боль СРЫВАЕТ (так же, как попадание дробью в `tryMonsterProjectileStagger`),
   * а новый закрыт откатом атаки ниже; сам откат держит на остатке боли общий
   * обработчик в начале `updateMonster`. Плоские 0.35 к длине стаггера отношения
   * не имели и потому сняты. */
  const staggered = (ai.staggerTimer ?? 0) > 0;
  if (staggered) {
    ai.windupTimer = undefined;
    ai.windupTargetId = undefined;
  }
  e.spriteScale = staggered ? 0.95 : undefined;

  if ((ai.windupTimer ?? 0) > 0) {
    ai.windupTimer = Math.max(0, (ai.windupTimer ?? 0) - dt);
    faceWindupTarget(world, e, target);
    e.spriteScale = 1.1 + Math.max(0, ai.windupTimer) * 0.08;

    if (!target.alive || dist > breakRange || !windupHasLine(world, e, target, windup, breakRange)) {
      publishMeleeWindupEscape(world, e, target, playerId, state, dist > breakRange ? 'distance' : 'obstacle');
      msgs.push(msg(`${entityDisplayName(e)} промахнулся: цель вышла из замаха.`, time, '#fc4'));
      clearWindup(e);
      /* Присвоение, а не `Math.max`, — так было до сведения. Занизить откат
       * оно не может: с непустой болью в этой ветке не оказываются, замах
       * снимает стаггер выше по функции. */
      e.attackCd = 0.75;
      return true;
    }

    if (ai.windupTimer <= 0) finishMeleeWindup(world, e, target, def, windup, time, msgs, state, playerId);
    return true;
  }

  if (dist <= windup.range && (e.attackCd ?? 0) <= 0 && windupHasLine(world, e, target, windup, breakRange)) {
    armWindup(e, target, windup.windupSec, 1.18);
    msgs.push(msg(rangedMonsterWindupMessage(e.monsterKind, entityDisplayName(e)), time, rangedMonsterColor(e.monsterKind)));
    playSoundAt(playGrowl, e.x, e.y);
    return true;
  }

  if (windup.escapeDist !== undefined && dist > windup.escapeDist) ai.windupTargetId = undefined;
  ai.timer -= dt;
  if (monsterRepathDue(world, e)) {
    const chase = monsterChaseCell(world, e, target);
    assignMonsterPath(world, e, chase.x, chase.y, 1.4);
  }
  followMonsterPath(world, e, dt);
  return true;
}

export function tryMonsterProjectileStagger(
  world: World,
  state: GameState,
  monster: Entity,
  projectile: Entity,
  playerId: number,
): boolean {
  if (monster.type !== EntityType.MONSTER || !monster.ai) return false;
  if (monster.monsterKind === MonsterKind.SOBRANNYY &&
      projectile.ownerId === playerId &&
      (projectile.sprite === Spr.PELLET || projectile.projType === ProjType.FLAME)) {
    const runtime = sobrannyyState(monster);
    runtime.hitCount = Math.max(0, runtime.hitCount - (projectile.projType === ProjType.FLAME ? 2 : 1));
    if (runtime.stacks > 0) runtime.stackUntil = Math.min(runtime.stackUntil, state.time + 6);
    wakeSobrannyy(world, monster, undefined, state.time, state.msgs, state, projectile.projType === ProjType.FLAME ? 'fire' : 'shotgun');
    monster.attackCd = Math.max(monster.attackCd ?? 0, projectile.projType === ProjType.FLAME ? 0.65 : 0.45);
    monster.spriteScale = Math.max(monster.spriteScale ?? 1, 1.03);
    state.msgs.push(msg(
      projectile.projType === ProjType.FLAME
        ? 'Огонь подсушил швы Собранного человека: рост выгорит быстрее.'
        : 'Дробь сбила мясной темп Собранного человека.',
      state.time,
      '#fc6',
    ));
    return true;
  }
  if (monster.monsterKind === MonsterKind.TRESKOTNIK &&
      projectile.ownerId !== monster.id &&
      (monster.hp ?? 1) > 0 &&
      (monster.ai.windupTimer ?? 0) > 0) {
    const target = monster.ai.combatTargetId !== undefined ? _entityById.get(monster.ai.combatTargetId) : undefined;
    interruptTreskotnikWindup(world, monster, target, state.time, state.msgs, 'hit', state);
    return true;
  }
  /* Дробь сбивает замах у того, кто ОБЪЯВИЛ длину боли колонкой `staggerSec`, —
   * а не у двух видов по имени. */
  const windup = monsterWindup(monster.monsterKind);
  if (!windup?.staggerSec) return false;
  if ((monster.hp ?? 1) <= 0) return false;
  if (projectile.ownerId !== playerId || projectile.sprite !== Spr.PELLET) return false;

  const ai = monster.ai;
  const wasWindup = (ai.windupTimer ?? 0) > 0;
  ai.staggerTimer = Math.max(ai.staggerTimer ?? 0, windup.staggerSec);
  ai.windupTimer = undefined;
  ai.windupTargetId = undefined;
  monster.attackCd = Math.max(monster.attackCd ?? 0, 0.95);
  monster.spriteScale = 0.95;

  if (wasWindup) {
    const target = ai.combatTargetId !== undefined ? _entityById.get(ai.combatTargetId) : undefined;
    publishMonsterReadabilityEvent(state, world, monster, target, 'monster_windup_interrupted', 4, rangedMonsterTags(monster.monsterKind, 'windup', 'interrupted', 'shotgun'), {
      reason: 'shotgun_stagger',
    });
    if (windup.staggerLine) state.msgs.push(msg(windup.staggerLine, state.time, '#4f4'));
  }
  return true;
}

function fireMonsterProjectile(
  world: World,
  entities: Entity[],
  e: Entity,
  target: Entity,
  def: MonsterDef,
  nextId: { v: number },
  damageMult = 1,
): void {
  const baseDmg = def.dmg ?? 10;
  const level = e.rpg?.level ?? 1;
  const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
  const dmg = Math.round(scaleMonsterDmg(baseDmg, level) * strMult * monsterDmgMult(world, e, target) * (e.monsterDmgMult ?? 1) * damageMult);
  const dx = world.delta(e.x, target.x);
  const dy = world.delta(e.y, target.y);
  const ang = Math.atan2(dy, dx);
  const spd = def.projSpeed ?? 8;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const sprite = def.projSprite || Spr.EYE_BOLT;
  // Compensate gravity so projectile arrives at target height instead of hitting the floor
  const pt = def.projType;
  const gravity = pt === ProjType.FLAME ? 1.8 : pt === ProjType.GRENADE ? 2.5 : pt === ProjType.BFG ? 0.3 : 1.2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const flightTime = dist / Math.max(1, spd);
  const vz = 0.5 * gravity * flightTime;
  entities.push({
    id: nextId.v++,
    type: EntityType.PROJECTILE,
    x: world.wrap(e.x + cos * 0.85),
    y: world.wrap(e.y + sin * 0.85),
    angle: ang,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite,
    vx: cos * spd,
    vy: sin * spd,
    vz,
    projDmg: dmg,
    projLife: pt === ProjType.WEB ? 1.45 : 3.0,
    ownerId: e.id,
    spriteScale: monsterProjectileScale(e.monsterKind, sprite),
    spriteZ: 0.5,
    projType: pt,
    projGore: pt === ProjType.WEB || sprite === Spr.PARAGRAPH_BOLT ? 1 : 2,
  });
  playSoundAt(monsterProjectileSound(e.monsterKind, sprite), e.x, e.y);
  e.attackCd = def.attackRate ?? 2;
}

function monsterProjectileScale(kind: MonsterKind | undefined, sprite: number): number {
  if (sprite === Spr.WEB_BOLT || kind === MonsterKind.PAUPSINA) return 0.42;
  if (sprite === Spr.WET_LINE_BOLT) return 0.5;
  if (sprite === Spr.PARAGRAPH_BOLT) return 0.34;
  if (sprite === Spr.HOSTILE_FLAME_BOLT) return 0.52;
  if (sprite === Spr.HOSTILE_PLASMA_BOLT) return 0.34;
  if (kind === MonsterKind.IDOL) return 0.4;
  return 0.3;
}

function monsterProjectileSound(kind: MonsterKind | undefined, sprite: number): () => void {
  if (sprite === Spr.WEB_BOLT || kind === MonsterKind.PAUPSINA) return playGrowl;
  if (sprite === Spr.WET_LINE_BOLT) return playHostileEnergyShot;
  if (kind === MonsterKind.EYE || kind === MonsterKind.CHERNOSLIZ || sprite === Spr.EYE_BOLT) return playHostileEyeShot;
  if (kind === MonsterKind.PARAGRAPH || sprite === Spr.PARAGRAPH_BOLT) return playHostileParagraphShot;
  if (sprite === Spr.HOSTILE_FLAME_BOLT) return playHostileFlame;
  if (sprite === Spr.HOSTILE_PLASMA_BOLT) return playHostileEnergyShot;
  if (sprite === Spr.HOSTILE_PSI_BOLT) return playHostilePsiCast;
  return playGrowl;
}

/* ── Семья: замах и телеграфируемый удар ──────────────────────────
 *
 * Числа и тексты замаха живут в дефе вида (`MonsterDef.windup`, у боссов —
 * `boss`), а здесь остались только ОБЩИЕ УМОЛЧАНИЯ семьи. До сведения на их
 * месте стояли семь `switch (kind)` на 14 дальнобойных видов, отдельная
 * таблица `bladeEliteTuning` на два ближних и третья копия в
 * `MonsterBossReadability` — одна мысль, написанная трижды разными руками.
 *
 * Умолчание — не «пустое место», а полноценный ответ: вид, которому нечего
 * добавить (Башня, Аватар Червия), строки в дефе не заводит вовсе.
 */
const WINDUP_DEFAULT_COLOR = '#fc6';
const WINDUP_RANGE_BREAK_LINE = 'Дистанция сломала выстрел: источник потерял линию.';
const WINDUP_LINE_BREAK_LINE = 'Линия огня сорвана укрытием или углом.';

function rangedMonsterWindupSec(kind: MonsterKind | undefined): number {
  return monsterWindup(kind)?.windupSec ?? GENERIC_RANGED_WINDUP_SEC;
}

function rangedMonsterMinRange(kind: MonsterKind | undefined): number {
  return monsterWindup(kind)?.minRange ?? EYE_MIN_RANGE;
}

function rangedMonsterShotRange(kind: MonsterKind | undefined): number {
  return monsterWindup(kind)?.range ?? RANGED_SHOT_RANGE;
}

function tryPaupsinaRangeStep(world: World, e: Entity, target: Entity, bestDist: number, dt: number): boolean {
  if (e.monsterKind !== MonsterKind.PAUPSINA || bestDist > PAUPSINA_WEB_STRAFE_RANGE) return false;
  const dx = world.delta(target.x, e.x);
  const dy = world.delta(target.y, e.y);
  const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const awayX = dx / len;
  const awayY = dy / len;
  const side = e.id % 2 === 0 ? 1 : -1;
  const stepAway = bestDist < PAUPSINA_WEB_MIN_RANGE ? 4.2 : 1.2;
  const stepSide = bestDist < PAUPSINA_WEB_MIN_RANGE ? 1.2 : 3.5;
  const tx = Math.floor(world.wrap(e.x + awayX * stepAway - awayY * side * stepSide));
  const ty = Math.floor(world.wrap(e.y + awayY * stepAway + awayX * side * stepSide));
  if (world.solid(tx, ty)) return false;
  const ai = e.ai!;
  ai.timer -= dt;
  if (monsterRepathDue(world, e) || !pathTargetIs(world, e, tx, ty)) {
    assignMonsterPath(world, e, tx, ty, 0.75);
  }
  if (ai.path.length === 0) return false;
  followMonsterPath(world, e, dt);
  e.spriteScale = 0.96;
  return true;
}

function rangedMonsterColor(kind: MonsterKind | undefined): string {
  return monsterWindup(kind)?.color ?? WINDUP_DEFAULT_COLOR;
}

function rangedMonsterTag(kind: MonsterKind | undefined): string {
  if (kind === undefined) return 'ranged';
  return monsterWindup(kind)?.tag ?? MonsterKind[kind].toLowerCase();
}

function rangedMonsterTags(kind: MonsterKind | undefined, ...tags: string[]): string[] {
  const base = rangedMonsterTag(kind);
  if (kind !== undefined && MONSTERS[kind]?.boss) return [base, 'boss_line_controller', ...tags];
  return kind === MonsterKind.KANTSELYARSKIY_IDOL ? [base, 'office_field', ...tags] : [base, ...tags];
}

function rangedMonsterWindupMessage(kind: MonsterKind | undefined, name: string): string {
  return monsterWindup(kind)?.windupLine ??
    `${name} целится по прямой. Укрытие или угол ломают линию огня.`;
}

function rangedMonsterSightMessage(kind: MonsterKind | undefined, name: string): string {
  return monsterWindup(kind)?.warningLine ??
    `${name} держит линию огня. Выстрел будет с разогревом.`;
}

/* Порядок ветвей прежний: у босса своя строка на ЛЮБОЙ срыв (его проверка
 * стояла первой в старом `switch`), у остальных срыв по дистанции говорит
 * общей строкой, а собственная строка вида отвечает за геометрию. */
function rangedMonsterInterruptedMessage(kind: MonsterKind | undefined, reason: string): string {
  const boss = kind === undefined ? undefined : MONSTERS[kind]?.boss;
  if (boss) return boss.interruptLine;
  if (reason === 'range') return WINDUP_RANGE_BREAK_LINE;
  return monsterWindup(kind)?.interruptLine ?? WINDUP_LINE_BREAK_LINE;
}

function rangedMonsterCounterplay(kind: MonsterKind | undefined, fallback: string): string {
  return monsterWindup(kind)?.counterplay ?? fallback;
}

function updateRangedBossPhaseCue(
  world: World,
  e: Entity,
  target: Entity,
  def: MonsterDef,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  const boss = def.boss;
  if (!boss || boss.phases.length === 0 || !e.ai) return;
  const maxHp = Math.max(1, e.maxHp ?? def.hp);
  const hpPct = Math.max(0, Math.min(1, (e.hp ?? maxHp) / maxHp));
  const nextIndex = (e.ai.bossPhaseIndex ?? -1) + 1;
  const phase = boss.phases[nextIndex];
  if (!phase || hpPct > phase.hpPct) return;

  e.ai.bossPhaseIndex = nextIndex;
  if (target.id === playerId) msgs.push(msg(phase.line, time, rangedMonsterColor(e.monsterKind)));
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', target.id === playerId ? 4 : 3, rangedMonsterTags(e.monsterKind, 'boss_phase', phase.tag), {
    phaseIndex: nextIndex,
    phaseTag: phase.tag,
    hpPct: Math.round(hpPct * 100) / 100,
    thresholdHpPct: phase.hpPct,
    counterplay: boss.counterplay,
  });
}

export interface TrubnyyWetLineShot {
  stepX: number;
  stepY: number;
  cells: number;
  waterCells: number;
  wetScore: number;
}

function isDrainLineCell(world: World, x: number, y: number): boolean {
  return drainLineCell(world, x, y);
}

export interface VodyanoyWaterPressureLine {
  cells: number;
  waterCells: number;
  distance: number;
}

function isVodyanoyWetLineCell(world: World, x: number, y: number): boolean {
  return wetTerrainCell(world, x, y);
}

export function getVodyanoyWaterPressureLine(world: World, e: Entity, target: Entity): VodyanoyWaterPressureLine | undefined {
  return getBoundedWetConnection(world, e, target, VODYANOY_WET_LINE_MAX_CELLS, VODYANOY_WET_LINE_MAX_DIST);
}

function stampVodyanoyWetLineCue(world: World, e: Entity, target: Entity, time: number, pressure: number): void {
  const dx = world.delta(e.x, target.x);
  const dy = world.delta(e.y, target.y);
  const dist = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
  const steps = Math.min(7, Math.max(2, Math.floor(dist)));
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const x = world.wrap(Math.floor(e.x + dx * t));
    const y = world.wrap(Math.floor(e.y + dy * t));
    if (!isVodyanoyWetLineCell(world, x, y)) continue;
    const intensity = Math.min(210, 95 + Math.floor(pressure * 18));
    stampMark(world, x, y, 0.5, 0.5, 0.18 + t * 0.12, MarkType.PSI, 170_000 + e.id * 43 + i * 19 + Math.floor(time * 3), 62, 128, 138, intensity);
  }
}

function vodyanoyChaseCell(world: World, e: Entity, target: Entity): { x: number; y: number } {
  const tx = Math.floor(target.x);
  const ty = Math.floor(target.y);
  if (isVodyanoyWetLineCell(world, tx, ty)) return { x: tx, y: ty };

  let bestX = tx;
  let bestY = ty;
  let best = Infinity;
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = world.wrap(tx + dx);
        const y = world.wrap(ty + dy);
        if (!isVodyanoyWetLineCell(world, x, y) || world.solid(x, y)) continue;
        const score = world.dist2(e.x, e.y, x + 0.5, y + 0.5) + world.dist2(target.x, target.y, x + 0.5, y + 0.5) * 2;
        if (score >= best) continue;
        best = score;
        bestX = x;
        bestY = y;
      }
    }
    if (best < Infinity) break;
  }
  return { x: bestX, y: bestY };
}

/* Мокрая линия Водяного кошмара: давление, связность и его кулдауны. Всё —
 * свойство одного вида, поэтому живёт рядом с ним, а не в `AIState` мира. */
interface VodyanoyLineState {
  pressure: number;
  scanCd: number;
  breakTimer: number;
  pulseCd: number;
  cueCd: number;
  targetId?: number;
  connected: boolean;
}
const vodyanoyLineState = speciesState<VodyanoyLineState>(() => ({
  pressure: 0, scanCd: 0, breakTimer: 0, pulseCd: 0, cueCd: 0, connected: false,
}));

/** Набранное давление мокрой линии: путь для отладки и тестов. */
export function peekVodyanoyWaterPressure(e: Entity): number {
  return vodyanoyLineState.peek(e)?.pressure ?? 0;
}

export function updateVodyanoyWaterPressureLine(
  world: World,
  e: Entity,
  target: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  if (e.monsterKind !== MonsterKind.VODYANOY_KOSHMAR) return false;
  const ai = e.ai!;
  const wet = vodyanoyLineState.of(e);
  if (wet.targetId !== undefined && wet.targetId !== target.id) {
    wet.connected = false;
    wet.breakTimer = 0;
    wet.pulseCd = 0;
  }
  wet.targetId = target.id;
  wet.scanCd = Math.max(0, wet.scanCd - dt);
  wet.pulseCd = Math.max(0, wet.pulseCd - dt);
  wet.cueCd = Math.max(0, wet.cueCd - dt);

  let line: VodyanoyWaterPressureLine | undefined;
  if (wet.scanCd <= 0) {
    wet.scanCd = VODYANOY_WET_LINE_SCAN_SEC;
    line = getVodyanoyWaterPressureLine(world, e, target);
    if (line) {
      wet.connected = true;
      wet.breakTimer = VODYANOY_WET_LINE_DRY_BREAK_SEC;
      if (target.id === playerId && ai.lastSeenTargetId !== playerId) {
        ai.lastSeenTargetId = playerId;
        msgs.push(msg('Водяной кошмар держит мокрую линию. Рябь идет к вам, давление растет.', time, '#7dd'));
        publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['vodyanoy_koshmar', 'water_pressure', 'wet_line', 'warning'], {
          cells: line.cells,
          waterCells: line.waterCells,
          maxCells: VODYANOY_WET_LINE_MAX_CELLS,
          counterplay: 'step_to_dry_concrete_or_burst_during_interruption',
        });
      }
    } else {
      wet.connected = false;
    }
  }

  if (!line && !wet.connected) {
    const hadPressure = wet.pressure > 0.35;
    wet.breakTimer = Math.max(0, wet.breakTimer - dt);
    wet.pressure = Math.max(0, wet.pressure - dt * (wet.breakTimer > 0 ? 0.7 : 1.85));
    e.spriteScale = wet.pressure > 0.2 ? 0.96 + wet.pressure * 0.025 : undefined;
    if (hadPressure && wet.pressure <= 0.35 && target.id === playerId) {
      ai.lastSeenTargetId = undefined;
      msgs.push(msg('Сухой бетон сбил мокрую ПСИ-линию. Короткое окно для рывка или отхода.', time, '#9cf'));
      publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', 3, ['vodyanoy_koshmar', 'water_pressure', 'dry_break'], {
        reason: 'dry_concrete',
        counterplay: 'burst_or_leave_wet_path',
      });
    }
    return false;
  }

  wet.pressure = Math.min(VODYANOY_WET_LINE_PRESSURE_MAX, wet.pressure + dt * 1.15);
  e.spriteScale = 1.02 + wet.pressure * 0.035;

  if (wet.cueCd <= 0) {
    wet.cueCd = 0.7;
    stampVodyanoyWetLineCue(world, e, target, time, wet.pressure);
  }

  if (wet.pulseCd <= 0 && target.hp !== undefined) {
    wet.pulseCd = VODYANOY_WET_LINE_PULSE_SEC;
    /* Своя формула по существу: пульс считает НАБРАННОЕ давление, а не урон
     * вида. Пол в единицу здесь мёртв — давление неотрицательно, и `round(1 + …)`
     * ниже единицы не опускается; оставлен только у пси-слива, где та же
     * причина. Снят: числа он не менял ни разу. */
    const dmg = Math.round(1 + wet.pressure * 0.62);
    const landed = applyMonsterStrike(world, state, e, target, dmg, MONSTERS[MonsterKind.VODYANOY_KOSHMAR].strike!, time, msgs, playerId);
    if (target.rpg) target.rpg.psi = Math.max(0, target.rpg.psi - Math.round(2 + wet.pressure));
    if (landed && target.alive && target.id === playerId && wet.pressure > 3.2) {
      msgs.push(msg('Давление в воде набирает силу. Сходите на сухой бетон сейчас.', time, '#7dd'));
    }
  }

  return false;
}

export function getTrubnyyWetLineShot(world: World, e: Entity, target: Entity): TrubnyyWetLineShot | undefined {
  const dx = world.delta(e.x, target.x);
  const dy = world.delta(e.y, target.y);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= TRUBNYY_WET_LINE_MIN_RANGE || dist > TRUBNYY_WET_LINE_MAX_CELLS) return undefined;

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  let stepX = 0;
  let stepY = 0;
  let cells = 0;
  if (adx >= ady) {
    if (ady > TRUBNYY_WET_LINE_ALIGN_EPS) return undefined;
    stepX = dx >= 0 ? 1 : -1;
    cells = Math.round(adx);
  } else {
    if (adx > TRUBNYY_WET_LINE_ALIGN_EPS) return undefined;
    stepY = dy >= 0 ? 1 : -1;
    cells = Math.round(ady);
  }
  if (cells <= 0 || cells > TRUBNYY_WET_LINE_MAX_CELLS) return undefined;

  const ox = Math.floor(e.x);
  const oy = Math.floor(e.y);
  let waterCells = 0;
  let wetScore = 0;
  for (let i = 1; i <= cells; i++) {
    const x = world.wrap(ox + stepX * i);
    const y = world.wrap(oy + stepY * i);
    const ci = world.idx(x, y);
    if (world.solid(x, y) || isLineOfFireCover(world.features[ci] as Feature)) return undefined;
    if (world.cells[ci] === Cell.WATER) {
      waterCells++;
      wetScore += 2;
    } else if (isDrainLineCell(world, x, y)) {
      wetScore++;
    }
  }

  const required = Math.max(4, Math.ceil(cells * 0.45));
  if (waterCells <= 0 || wetScore < required) return undefined;
  return { stepX, stepY, cells, waterCells, wetScore };
}

export function updateTrubnyyWetLineShot(
  world: World,
  entities: Entity[],
  e: Entity,
  target: Entity,
  def: MonsterDef,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  nextId: { v: number },
  state?: GameState,
): boolean {
  if (e.monsterKind !== MonsterKind.TRUBNYY_AVTOMAT) return false;
  const ai = e.ai!;

  const windup = monsterWindup(e.monsterKind)!;

  if ((ai.windupTimer ?? 0) > 0) {
    ai.windupTimer = Math.max(0, (ai.windupTimer ?? 0) - dt);
    const line = ai.windupTargetId === target.id && target.alive
      ? getTrubnyyWetLineShot(world, e, target)
      : undefined;
    /* Причина срыва у этого вида одна и своя: мокрая прямая перестала быть
     * мокрой или прямой. Колонка `MonsterWindupDef` её не выражает — это
     * геометрия воды, а не дистанция и не укрытие. */
    if (!line) {
      clearWindup(e, RANGED_LOS_BREAK_COOLDOWN);
      if (target.id === playerId) {
        msgs.push(msg(rangedMonsterInterruptedMessage(e.monsterKind, 'wet_line'), time, '#9cf'));
        publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', 3, rangedMonsterTags(e.monsterKind, 'wet_line', 'interrupted'), {
          reason: 'left_wet_line',
          counterplay: windup.counterplay,
        });
      }
      return true;
    }

    faceWindupTarget(world, e, target);
    e.spriteScale = 1.08 + Math.max(0, ai.windupTimer / windup.windupSec) * 0.16;
    if (ai.windupTimer <= 0) {
      fireMonsterProjectile(world, entities, e, target, def, nextId, 1.08);
      e.attackCd = TRUBNYY_WET_LINE_RECOVERY_SEC;
      clearWindup(e);
      e.spriteScale = 0.9;
      if (target.id === playerId) {
        msgs.push(msg('Трубный Автомат прожег мокрую линию и ушел в остывание. Сейчас окно для упора или фланга.', time, '#6cf'));
      }
    }
    return true;
  }

  if ((e.attackCd ?? 0) > 0) {
    e.spriteScale = 0.93;
    return true;
  }
  e.spriteScale = undefined;

  const line = getTrubnyyWetLineShot(world, e, target);
  if (!line) return false;

  announceWindupSighting(world, e, target, playerId, time, msgs, rangedMonsterTags(e.monsterKind, 'ranged', 'wet_line', 'warning'), {
    wetCells: line.waterCells,
    wetScore: line.wetScore,
    maxCells: TRUBNYY_WET_LINE_MAX_CELLS,
    recoverySec: TRUBNYY_WET_LINE_RECOVERY_SEC,
    counterplay: 'step_off_wet_line_or_attack_recovery',
  }, state);

  armWindup(e, target, windup.windupSec, 1.18);
  if (target.id === playerId) {
    msgs.push(msg(rangedMonsterWindupMessage(e.monsterKind, entityDisplayName(e)), time, rangedMonsterColor(e.monsterKind)));
    playSoundAt(playGrowl, e.x, e.y);
  }
  return true;
}

function lampoglazTargetLight(world: World, target: Entity): number {
  const light = entityLight(world, target);
  return nearFeature(world, target, Feature.LAMP, 1) ? Math.max(light, LAMPOGLAZ_HARD_LOCK) : light;
}

function lampoglazWindupSec(light: number): number {
  return light >= LAMPOGLAZ_HARD_LOCK ? LAMPOGLAZ_HARD_LOCK_WINDUP_SEC : LAMPOGLAZ_WINDUP_SEC;
}

function lampoglazDamageMult(light: number): number {
  return light >= LAMPOGLAZ_HARD_LOCK ? LAMPOGLAZ_HARD_LOCK_DMG_MULT : LAMPOGLAZ_LOCK_DMG_MULT;
}

function updateLampoglazLightLock(
  world: World,
  entities: Entity[],
  e: Entity,
  target: Entity,
  def: MonsterDef,
  bestDist: number,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  nextId: { v: number },
  state?: GameState,
): boolean {
  const ai = e.ai!;
  const targetLight = lampoglazTargetLight(world, target);
  const hasLock = targetLight >= LAMPOGLAZ_LIGHT_LOCK;
  const hardLock = targetLight >= LAMPOGLAZ_HARD_LOCK;
  const windup = monsterWindup(e.monsterKind)!;
  const line = lineThreatContext(world, e, target, LAMPOGLAZ_SHOT_RANGE, LAMPOGLAZ_MIN_RANGE);
  const lineClear = target.alive && line.los;
  const currentTarget = ai.windupTargetId === undefined || ai.windupTargetId === target.id;

  if ((ai.windupTimer ?? 0) > 0) {
    ai.windupTimer = Math.max(0, (ai.windupTimer ?? 0) - dt);
    /* Причина срыва у этого вида своя — ТЕМНОТА: цель ушла со света.
     * Дистанция и геометрия у него общие с дальнобойными. */
    if (!currentTarget || !lineClear || !hasLock) {
      clearWindup(e, RANGED_LOS_BREAK_COOLDOWN);
      if (target.id === playerId) {
        const reason = !hasLock ? 'darkness' : !line.inRange ? 'range' : 'line_of_sight';
        msgs.push(msg(
          reason === 'darkness'
            ? 'Лампоглаз потерял световой захват. Темный угол держит паузу.'
            : windup.interruptLine ?? WINDUP_LINE_BREAK_LINE,
          time,
          '#9cf',
        ));
        publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', 3, rangedMonsterTags(e.monsterKind, 'light_lock', 'interrupted'), {
          reason,
          targetLight,
          counterplay: windup.counterplay,
        });
      }
      return true;
    }

    faceWindupTarget(world, e, target);
    e.spriteScale = hardLock ? 1.22 : 1.12;
    if (ai.windupTimer <= 0) {
      fireMonsterProjectile(world, entities, e, target, def, nextId, lampoglazDamageMult(targetLight));
      e.attackCd = (def.attackRate ?? 2) * (hardLock ? 0.72 : 1);
      clearWindup(e);
    }
    return true;
  }

  if (hasLock && lineClear) {
    announceWindupSighting(world, e, target, playerId, time, msgs, rangedMonsterTags(e.monsterKind, 'ranged', 'light_lock', hardLock ? 'hard_lock' : 'lit_target'), {
      targetLight,
      windupSec: lampoglazWindupSec(targetLight),
      counterplay: 'leave_light_or_break_line',
    }, state);
    if ((e.attackCd ?? 0) <= 0) {
      armWindup(e, target, lampoglazWindupSec(targetLight), hardLock ? 1.24 : 1.15);
      if (target.id === playerId) {
        msgs.push(msg(
          hardLock
            ? 'Лампы вокруг щелкнули резко: Лампоглаз взял точный захват. В темноту или за шкаф!'
            : rangedMonsterWindupMessage(e.monsterKind, entityDisplayName(e)),
          time,
          rangedMonsterColor(e.monsterKind),
        ));
        playSoundAt(playGrowl, e.x, e.y);
      }
    }
    return true;
  }

  e.spriteScale = hasLock ? 1.04 : undefined;
  if (def.speed > 0 && bestDist > 9) {
    ai.timer -= dt;
    if (monsterRepathDue(world, e)) {
      const chase = monsterChaseCell(world, e, target);
      assignMonsterPath(world, e, chase.x, chase.y, 2.3);
    }
    followMonsterPath(world, e, dt);
  }
  return true;
}

function updateReadableMonsterRanged(
  world: World,
  entities: Entity[],
  e: Entity,
  target: Entity,
  def: MonsterDef,
  bestDist: number,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  nextId: { v: number },
  state?: GameState,
): boolean {
  const ai = e.ai!;
  const shotRange = hasAIFlag(e, 'officeField') ? officeFieldShotRange(world, e, target) : rangedMonsterShotRange(e.monsterKind);
  const minRange = rangedMonsterMinRange(e.monsterKind);
  const windupSec = rangedMonsterWindupSec(e.monsterKind);
  const line = lineThreatContext(world, e, target, shotRange, minRange);
  const currentTarget = ai.windupTargetId === undefined || ai.windupTargetId === target.id;
  updateRangedBossPhaseCue(world, e, target, def, time, msgs, playerId, state);

  if ((ai.windupTimer ?? 0) > 0) {
    ai.windupTimer = Math.max(0, (ai.windupTimer ?? 0) - dt);
    const lineClear = currentTarget && target.alive && line.los;
    if (!lineClear) {
      clearWindup(e, RANGED_LOS_BREAK_COOLDOWN);
      if (target.id === playerId) {
        const reason = !line.inRange ? 'range' : 'line_of_sight';
        msgs.push(msg(rangedMonsterInterruptedMessage(e.monsterKind, reason), time, '#9cf'));
        publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', 3, rangedMonsterTags(e.monsterKind, 'windup', 'line_of_sight', 'interrupted'), {
          reason,
          counterplay: rangedMonsterCounterplay(e.monsterKind, 'break_line_before_bolt'),
          ...officeFieldEventData(world, e, target),
        });
      }
      return true;
    }

    faceWindupTarget(world, e, target);
    e.spriteScale = 1.05 + Math.max(0, ai.windupTimer / windupSec) * 0.12;
    if (ai.windupTimer <= 0) {
      fireMonsterProjectile(world, entities, e, target, def, nextId);
      clearWindup(e);
    }
    return true;
  }

  if (!line.inRange) {
    if (bestDist <= minRange && tryPaupsinaRangeStep(world, e, target, bestDist, dt)) return true;
    return false;
  }
  if (!line.los) return false;

  announceWindupSighting(world, e, target, playerId, time, msgs, rangedMonsterTags(e.monsterKind, 'ranged', 'line_of_sight', 'warning'), {
    windupSec,
    shotRange: Math.round(shotRange * 10) / 10,
    minRange: Math.round(minRange * 10) / 10,
    counterplay: rangedMonsterCounterplay(e.monsterKind, 'corner_or_door_breaks_line'),
    ...officeFieldEventData(world, e, target),
  }, state);

  if ((e.attackCd ?? 0) <= 0) {
    armWindup(e, target, windupSec, 1.14);
    if (e.monsterKind === MonsterKind.CHERNOSLIZ) stampChernoSlizWake(world, e, time);
    if (target.id === playerId) {
      msgs.push(msg(rangedMonsterWindupMessage(e.monsterKind, entityDisplayName(e)), time, rangedMonsterColor(e.monsterKind)));
      playSoundAt(playGrowl, e.x, e.y);
    }
  } else if (tryPaupsinaRangeStep(world, e, target, bestDist, dt)) {
    return true;
  } else if ((def?.speed ?? 0) > 0) {
    // Generic ranged monsters strafe between shots
    const idealR = (shotRange + minRange) * 0.5;
    tryCombatOrbitStep(world, e, target, idealR, (shotRange - minRange) * 0.35, dt);
  }
  return true;
}

interface SlepoglazAim {
  x: number;
  y: number;
  target?: Entity;
  source: 'sound' | 'sight';
}

function slepoglazAimAngle(world: World, e: Entity, tx: number, ty: number): number {
  const dx = world.delta(e.x, tx);
  const dy = world.delta(e.y, ty);
  if (dx * dx + dy * dy < 0.01) return e.angle;
  return Math.atan2(dy, dx);
}

/**
 * Докуда достаёт луч Слепоглаза.
 *
 * Свой марш пробами через 0.25 клетки был ЧЕТВЁРТОЙ копией одной растеризации,
 * и мелкий шаг был не замыслом, а платой за приблизительность проб: он ловил
 * клетки, которые луч задевает вскользь, ценой вчетверо большего числа проб.
 * Точный обход шага не имеет вовсе и знает точку входа в бетон, поэтому луч
 * теперь кончается РОВНО у стены, а не на четверть клетки не дойдя до неё.
 * Пол в полклетки сохранён: упёршийся в стену бьёт хотя бы себе под ноги.
 */
function traceSlepoglazBeamLen(world: World, e: Entity, dirX: number, dirY: number): number {
  return Math.max(0.5, lineBlockDistance(world, e.x, e.y, dirX, dirY, SLEPOGLAZ_SHOT_RANGE));
}

function stampSlepoglazBeam(world: World, e: Entity, dirX: number, dirY: number, len: number): void {
  for (let d = 0.5; d < len; d += 0.55) {
    const sx = e.x + dirX * d;
    const sy = e.y + dirY * d;
    const x = world.wrap(Math.floor(sx));
    const y = world.wrap(Math.floor(sy));
    if (world.solid(x, y)) continue;
    const fx = ((sx % 1) + 1) % 1;
    const fy = ((sy % 1) + 1) % 1;
    stampMark(
      world, x, y, fx, fy,
      0.28, MarkType.PSI, e.id * 917 + Math.floor(d * 41),
      80, 205, 70, 170,
    );
  }
}

function fireSlepoglazBeam(
  world: World,
  e: Entity,
  def: MonsterDef,
  tx: number,
  ty: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  const angle = slepoglazAimAngle(world, e, tx, ty);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const len = traceSlepoglazBeamLen(world, e, dirX, dirY);
  let hitCount = 0;
  let hitPlayer = false;

  e.angle = angle;
  stampSlepoglazBeam(world, e, dirX, dirY, len);
  getEntityIndex().queryRadiusCapped(e.x, e.y, len + SLEPOGLAZ_BEAM_WIDTH + 1, slepoglazBeamQuery, ENTITY_MASK_ACTOR, SLEPOGLAZ_BEAM_SCAN_CAP);
  for (const target of slepoglazBeamQuery) {
    if (!target.alive || target.id === e.id) continue;
    if (!isPlayerEntity(target) && target.type !== EntityType.NPC) continue;
    const dx = world.delta(e.x, target.x);
    const dy = world.delta(e.y, target.y);
    const along = dx * dirX + dy * dirY;
    if (along < 0.45 || along > len + 0.35) continue;
    const perp = Math.abs(dx * -dirY + dy * dirX);
    if (perp > SLEPOGLAZ_BEAM_WIDTH) continue;
    if (target.hp === undefined) continue;

    /* Форма поражения у луча своя — полоса, а не одна цель, — но ПРИМЕНЕНИЕ
     * урона внутри полосы то же самое, что у остальных десяти. Брызги идут
     * вдоль луча, а не от твари к цели: направление удара знает здесь только он.
     *
     * Урон считается НА КАЖДУЮ цель, а не один раз на луч: множитель силы
     * ближнего боя бьющего в этой формуле был с самого начала, значит и скидка
     * ближнего урона цели принадлежит ей же. Половина правила зависит от цели,
     * поэтому вынести её из полосы нельзя. */
    const dmg = monsterStrikeDamage(e, target, time, def.dmg);
    if (applyMonsterStrike(world, state, e, target, dmg, def.strike!, time, msgs, playerId, angle)) {
      if (target.id === playerId) hitPlayer = true;
    }
    hitCount++;
  }

  if (hitPlayer) {
    msgs.push(msg('Слепоглаз попал в старую шумную точку. Следующий луч пережидайте только шагом в сторону.', time, '#9f4'));
  } else if (hitCount === 0) {
    msgs.push(msg('Слепоглаз прожег пустое место и просел после луча. Сближайтесь сейчас.', time, '#9f4'));
  }
  playSoundAt(playHostileEyeShot, e.x, e.y);
}

function acquireSlepoglazAim(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  playerId: number,
  state?: GameState,
): SlepoglazAim | undefined {
  const player = _entityById.get(playerId);
  const noise = findNoiseForActor(world, state, e, time, {
    minSeverity: 2,
    scanInterval: 0.55,
    hearingMult: SLEPOGLAZ_NOISE_HEARING_MULT,
  });
  if (noise && world.dist2(e.x, e.y, noise.x, noise.y) <= SLEPOGLAZ_SHOT_RANGE * SLEPOGLAZ_SHOT_RANGE) {
    const d = Math.sqrt(world.dist2(e.x, e.y, noise.x, noise.y));
    if (d > SLEPOGLAZ_MIN_RANGE) {
      return {
        x: noise.x,
        y: noise.y,
        target: noise.actorId === playerId ? player : undefined,
        source: 'sound',
      };
    }
  }

  if (!target || !target.alive) return undefined;
  const line = lineThreatContext(world, e, target, SLEPOGLAZ_SHOT_RANGE, SLEPOGLAZ_MIN_RANGE);
  if (!line.los) return undefined;
  return { x: target.x, y: target.y, target, source: 'sight' };
}

function updateSlepoglazCloseDefense(
  world: World,
  e: Entity,
  target: Entity | null,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  if (!target || !target.alive || target.hp === undefined) return false;
  const meleeRange = monsterMeleeRange(world, e);
  if (world.dist2(e.x, e.y, target.x, target.y) > meleeRange * meleeRange) return false;

  if ((e.attackCd ?? 0) > 0) return true;

  const dmg = monsterStrikeDamage(e, target, time, SLEPOGLAZ_NERVE_STRIKE.damage!);
  applyMonsterStrike(world, state, e, target, dmg, SLEPOGLAZ_NERVE_STRIKE, time, msgs, playerId);
  playSoundAt(playGrowl, e.x, e.y);
  e.attackCd = SLEPOGLAZ_NERVE_RATE;
  return true;
}

function updateSlepoglaz(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  if (e.monsterKind !== MonsterKind.SLEPOGLAZ) return false;
  const ai = e.ai!;
  const def = MONSTERS[MonsterKind.SLEPOGLAZ];

  if ((ai.windupTimer ?? 0) > 0) {
    ai.windupTimer = Math.max(0, (ai.windupTimer ?? 0) - dt);
    e.angle = slepoglazAimAngle(world, e, ai.tx, ai.ty);
    e.spriteScale = 1.08 + Math.max(0, ai.windupTimer / SLEPOGLAZ_WINDUP_SEC) * 0.16;
    if (ai.windupTimer <= 0) {
      fireSlepoglazBeam(world, e, def, ai.tx, ai.ty, time, msgs, playerId, state);
      ai.windupTimer = undefined;
      ai.windupTargetId = undefined;
      ai.staggerTimer = SLEPOGLAZ_RECOVERY_SEC;
      e.attackCd = def.attackRate;
      e.spriteScale = 0.9;
    }
    return true;
  }

  /* Отдельной ветки у боли здесь нет: она была ДУБЛЁМ соседней.
   *
   * Стояло `attackCd = max(, 0.25)` и `return true` — то же самое, что делает
   * ветка отката строкой ниже, только с плоским числом, не связанным с длиной
   * стаггера. Откат и так не может быть короче остатка боли: его держит общий
   * обработчик в начале `updateMonster`, поэтому оглушённый Слепоглаз заходит в
   * ту же ветку и живёт по СВОЕМУ такту луча, а не по второму, боевому. */
  e.spriteScale = (ai.staggerTimer ?? 0) > 0 ? 0.9 : undefined;
  if ((e.attackCd ?? 0) > 0) {
    if (updateSlepoglazCloseDefense(world, e, target, time, msgs, playerId, state)) return true;
    return true;
  }

  const aim = acquireSlepoglazAim(world, e, target, time, playerId, state);
  if (!aim) {
    if (updateSlepoglazCloseDefense(world, e, target, time, msgs, playerId, state)) return true;
    ai.goal = AIGoal.WANDER;
    ai.combatTargetId = undefined;
    ai.path = [];
    return true;
  }

  ai.tx = world.wrap(aim.x);
  ai.ty = world.wrap(aim.y);
  ai.windupTimer = SLEPOGLAZ_WINDUP_SEC;
  ai.windupTargetId = aim.target?.id;
  e.angle = slepoglazAimAngle(world, e, ai.tx, ai.ty);
  e.spriteScale = 1.22;
  if (aim.target?.id === playerId) {
    const sourceText = aim.source === 'sound' ? 'последний шум' : 'старую позицию';
    msgs.push(msg(`Слепоглаз зарядил зеленый луч в ${sourceText}. Шагните в сторону до вспышки.`, time, '#9f4'));
  }
  publishMonsterReadabilityEvent(state, world, e, aim.target, 'monster_sighted', 4, ['slepoglaz', 'last_sound', 'beam', 'warning'], {
    windupSec: SLEPOGLAZ_WINDUP_SEC,
    source: aim.source,
    counterplay: 'bait_sound_sidestepping_then_rush_after_beam',
  });
  playSoundAt(playGrowl, e.x, e.y);
  return true;
}

function updateShadowAmbushReadability(
  world: World,
  e: Entity,
  target: Entity,
  bestDist: number,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  const ai = e.ai!;

  if (target.id === playerId &&
      ai.lastSeenTargetId !== playerId &&
      world.dist2(e.x, e.y, target.x, target.y) <= SHADOW_WARNING_RANGE_SQ &&
      shadowCanDarkAmbush(world, e, target)) {
    ai.lastSeenTargetId = playerId;
    msgs.push(msg('Теневик вышел из темного угла. Свет, шаг назад или широкий проход ломают рывок.', time, '#c8f'));
    publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['shadow', 'ambush', 'dark', 'warning'], {
      windupSec: SHADOW_WINDUP_SEC,
      counterplay: 'light_distance_or_open_space',
    });
  }

  if ((ai.windupTimer ?? 0) > 0) {
    ai.windupTimer = Math.max(0, (ai.windupTimer ?? 0) - dt);
    const interrupted = !target.alive ||
      bestDist > SHADOW_STRIKE_BREAK_RANGE ||
      ai.windupTargetId !== target.id ||
      shadowHasLightCounter(world, e, target);
    if (interrupted) {
      ai.windupTimer = undefined;
      ai.windupTargetId = undefined;
      e.attackCd = Math.max(e.attackCd ?? 0, SHADOW_CANCEL_COOLDOWN);
      if (target.id === playerId) {
        msgs.push(msg('Теневик потерял рывок в свете или на дистанции.', time, '#ccf'));
        publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', 3, ['shadow', 'ambush', 'interrupted', 'light'], {
          reason: shadowHasLightCounter(world, e, target) ? 'light' : 'distance',
          counterplay: 'keep_light_or_distance',
        });
      }
      return true;
    }
    if (ai.windupTimer > 0) return true;

    ai.windupTimer = undefined;
    ai.windupTargetId = undefined;
    return false;
  }

  if (bestDist < 1.2 && (e.attackCd ?? 0) <= 0 && shadowCanDarkAmbush(world, e, target)) {
    ai.windupTimer = SHADOW_WINDUP_SEC;
    ai.windupTargetId = target.id;
    if (target.id === playerId) {
      msgs.push(msg('Теневик готовит рывок из тени. Отступите в свет или за дистанцию.', time, '#c8f'));
    }
    return true;
  }

  return false;
}

function pointLight(world: World, x: number, y: number): number {
  return world.light[world.idx(Math.floor(x), Math.floor(y))] ?? 0;
}

function tonkayaLineCell(world: World, x: number, y: number): boolean {
  const ci = world.idx(x, y);
  const cell = world.cells[ci];
  return (cell === Cell.FLOOR || cell === Cell.DOOR) && !world.solid(x, y);
}

function tonkayaOpenRun(world: World, x: number, y: number, dx: number, dy: number): number {
  let run = 0;
  for (let step = 1; step <= 6; step++) {
    const tx = world.wrap(x + dx * step);
    const ty = world.wrap(y + dy * step);
    if (!tonkayaLineCell(world, tx, ty)) break;
    run++;
  }
  return run;
}

function tonkayaAxisAt(world: World, x: number, y: number): { dx: number; dy: number; score: number } | null {
  const ci = world.idx(x, y);
  const doorBonus = world.cells[ci] === Cell.DOOR ? 2.4 : 0;
  const horizontal = tonkayaOpenRun(world, x, y, 1, 0) + tonkayaOpenRun(world, x, y, -1, 0);
  const vertical = tonkayaOpenRun(world, x, y, 0, 1) + tonkayaOpenRun(world, x, y, 0, -1);
  const horizontalWalls = (world.solid(x, y - 1) ? 1 : 0) + (world.solid(x, y + 1) ? 1 : 0);
  const verticalWalls = (world.solid(x - 1, y) ? 1 : 0) + (world.solid(x + 1, y) ? 1 : 0);
  const horizontalScore = horizontal + horizontalWalls * 1.35 + doorBonus;
  const verticalScore = vertical + verticalWalls * 1.35 + doorBonus;
  const axis = horizontalScore >= verticalScore
    ? { dx: 1, dy: 0, score: horizontalScore }
    : { dx: 0, dy: 1, score: verticalScore };
  return axis.score >= 5.4 ? axis : null;
}

/** Видно ли цель из клетки ловушки. Растеризация одна на игру. */
function tonkayaClearSight(world: World, x: number, y: number, target: Entity): boolean {
  return hasLineOfSight(world, x + 0.5, y + 0.5, target.x, target.y, TONKAYA_BAIT_MAX_VISIBLE);
}

/* Приманочная линия — рядом с видом, а не в ядре.
 *
 * Собственный тип `MonsterBaitLineState` жил в `core/types.ts`, а поле `baitLine`
 * — в `AIState` у КАЖДОГО актора игры ради максимум двух особей одновременно.
 * Откат репозиции при этом брался из общего `ai.baitScanCd`, который тем же
 * именем ведёт скан ПИЩЕВОЙ приманки в `monster_bait.ts`: два несовместимых
 * счётчика на одном поле. Здесь остался свой. */
interface TonkayaLine {
  x: number;
  y: number;
  dx: number;
  dy: number;
  nerve: number;
  armed: boolean;
  spent: boolean;
}
const tonkayaState = speciesState<{ line?: TonkayaLine; scanCd: number }>(() => ({ scanCd: 0 }));

/** Готовая линия засады: путь для отладки, тестов и стендов. */
export function tonkayaLineOf(e: Entity): TonkayaLine | undefined {
  return tonkayaState.peek(e)?.line;
}

/** Поставить линию руками — стендам и тестам, чтобы не ждать её выбора. */
export function setTonkayaLine(e: Entity, line: TonkayaLine | undefined): void {
  tonkayaState.of(e).line = line;
}

function chooseTonkayaBaitLine(world: World, e: Entity, target: Entity): TonkayaLine | undefined {
  const ex = Math.floor(e.x);
  const ey = Math.floor(e.y);
  let bestScore = -Infinity;
  let best: TonkayaLine | undefined;

  for (let oy = -TONKAYA_BAIT_SCAN_RADIUS; oy <= TONKAYA_BAIT_SCAN_RADIUS; oy++) {
    for (let ox = -TONKAYA_BAIT_SCAN_RADIUS; ox <= TONKAYA_BAIT_SCAN_RADIUS; ox++) {
      if (ox * ox + oy * oy > TONKAYA_BAIT_SCAN_RADIUS_SQ) continue;
      const x = world.wrap(ex + ox);
      const y = world.wrap(ey + oy);
      if (!tonkayaLineCell(world, x, y)) continue;

      const dTarget = world.dist2(x + 0.5, y + 0.5, target.x, target.y);
      if (dTarget < TONKAYA_BAIT_MIN_TARGET_SQ || dTarget > TONKAYA_BAIT_MAX_TARGET_SQ) continue;
      const light = world.light[world.idx(x, y)] ?? 0;
      if (light > 0.3 && world.cells[world.idx(x, y)] !== Cell.DOOR) continue;

      const axis = tonkayaAxisAt(world, x, y);
      if (!axis || !tonkayaClearSight(world, x, y, target)) continue;

      const lineDist = Math.sqrt(dTarget);
      const score = axis.score * 3 + (0.32 - light) * 8 - Math.abs(lineDist - 7.2) * 0.45 - world.dist2(e.x, e.y, x + 0.5, y + 0.5) * 0.018;
      if (score <= bestScore) continue;
      bestScore = score;
      best = { x, y, dx: axis.dx, dy: axis.dy, nerve: TONKAYA_NERVE_SEC, armed: false, spent: false };
    }
  }

  return best;
}

function targetInsideTonkayaLine(world: World, line: TonkayaLine, target: Entity): boolean {
  const ax = line.x + 0.5;
  const ay = line.y + 0.5;
  const dx = world.delta(ax, target.x);
  const dy = world.delta(ay, target.y);
  const proj = dx * line.dx + dy * line.dy;
  const perp = Math.abs(dx * line.dy - dy * line.dx);
  return Math.abs(proj) <= TONKAYA_LINE_HALF_LEN && perp <= TONKAYA_LINE_PERP;
}

/** Дальше этого фланговый бросок Тонкой Тени не переносит: он рывок, а не
 *  телепорт через полэтажа. Длина ловушки — её же естественный предел. */
const TONKAYA_FLANK_MAX_DIST = TONKAYA_LINE_HALF_LEN;

function tonkayaMoveToFlank(world: World, e: Entity, target: Entity, line: TonkayaLine): void {
  const dash = MONSTERS[MonsterKind.TONKAYA_TEN].dash!;
  const px = -line.dy;
  const py = line.dx;
  const side = world.dist2(e.x, e.y, target.x + px, target.y + py) < world.dist2(e.x, e.y, target.x - px, target.y - py) ? 1 : -1;
  for (const mult of TONKAYA_FLANK_MULTS) {
    const fx = world.wrap(Math.floor(target.x + px * side * mult));
    const fy = world.wrap(Math.floor(target.y + py * side * mult));
    if (!tonkayaLineCell(world, fx, fy)) continue;
    // Бросок был жёстким телепортом: ни линии, ни предела дистанции — тень
    // возникала вплотную к цели из-за стены с любого конца этажа. Предикат
    // теперь общий на семью: путь и место приземления, с радиусом тела.
    if (dashTo(world, e, fx + 0.5, fy + 0.5, dash, TONKAYA_FLANK_MAX_DIST) !== DashStep.CLEAR) continue;
    break;
  }
}

const TONKAYA_FLANK_MULTS = [1.05, -1.05, 0.0] as const;

function damageTonkayaTenStrike(
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  const def = MONSTERS[MonsterKind.TONKAYA_TEN];
  if (target.hp === undefined) return;
  const dmg = monsterStrikeDamage(e, target, time, def.dmg, def.dash?.damageMult ?? 1);
  applyMonsterStrike(world, state, e, target, dmg, def.strike!, time, msgs, playerId);

  const label = isPlayerEntity(target) ? 'тебя' : entityDisplayName(target);
  msgs.push(msg(`${entityDisplayName(e)} бьет ${label} сбоку из подготовленной линии: -${dmg}`, time, '#c8f'));
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['tonkaya_ten', 'bait_line', 'flank', 'line_crossed'], {
    damage: dmg,
    counterplay: 'hold_ground_light_or_noise',
  });
}

function collapseTonkayaLine(
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
  reason: string,
  state?: GameState,
): void {
  const own = tonkayaState.of(e);
  own.line = undefined;
  own.scanCd = TONKAYA_REPOSITION_CD;
  e.attackCd = Math.max(e.attackCd ?? 0, 0.65);
  e.spriteScale = undefined;
  if (isPlayerEntity(target)) {
    msgs.push(msg(
      reason === 'wait'
        ? 'Тонкая Тень не выдержала ожидания и вернулась без фланговой линии.'
        : 'Свет или шум сорвали темную линию Тонкой Тени.',
      time,
      '#ccf',
    ));
  }
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', 3, ['tonkaya_ten', 'bait_line', 'interrupted', reason], {
    reason,
    counterplay: 'hold_ground_light_or_noise',
  });
}

function updateTonkayaTenBaitLine(
  world: World,
  e: Entity,
  target: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  const ai = e.ai!;
  const own = tonkayaState.of(e);
  if (shadowHasLightCounter(world, e, target)) {
    if (own.line) collapseTonkayaLine(world, e, target, time, msgs, 'light', state);
    return false;
  }

  const noise = findNoiseInvestigationTarget(world, state, e, time);
  if (noise && own.line && world.dist2(noise.x, noise.y, own.line.x + 0.5, own.line.y + 0.5) > 4) {
    collapseTonkayaLine(world, e, target, time, msgs, 'noise', state);
    return false;
  }

  own.scanCd -= dt;
  if (!own.line && own.scanCd <= 0) {
    own.line = chooseTonkayaBaitLine(world, e, target);
    own.scanCd = TONKAYA_REPOSITION_CD;
    if (own.line && target.id === playerId && ai.lastSeenTargetId !== playerId) {
      ai.lastSeenTargetId = playerId;
      msgs.push(msg('Тонкая Тень пятится к темной линии. Не входите за ней в коридор.', time, '#bce'));
      publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', 4, ['tonkaya_ten', 'bait_line', 'warning'], {
        counterplay: 'hold_ground_light_or_noise',
        lineX: own.line.x,
        lineY: own.line.y,
      });
    }
  }

  const line = own.line;
  if (!line) return false;
  const lineCenterX = line.x + 0.5;
  const lineCenterY = line.y + 0.5;
  if (!tonkayaLineCell(world, line.x, line.y) || !tonkayaClearSight(world, line.x, line.y, target)) {
    collapseTonkayaLine(world, e, target, time, msgs, 'blocked', state);
    return false;
  }

  if (!line.spent && line.armed && targetInsideTonkayaLine(world, line, target) && world.dist2(e.x, e.y, target.x, target.y) <= TONKAYA_FLANK_RANGE * TONKAYA_FLANK_RANGE) {
    line.spent = true;
    tonkayaMoveToFlank(world, e, target, line);
    damageTonkayaTenStrike(world, e, target, time, msgs, playerId, state);
    own.line = undefined;
    e.spriteScale = undefined;
    e.attackCd = MONSTERS[MonsterKind.TONKAYA_TEN].attackRate;
    return true;
  }

  const targetDistToLine = world.dist2(target.x, target.y, lineCenterX, lineCenterY);
  line.nerve -= dt * (targetDistToLine > 5.5 * 5.5 ? 1.35 : 0.65);
  if (line.nerve <= 0) {
    collapseTonkayaLine(world, e, target, time, msgs, 'wait', state);
    return false;
  }

  const dx = world.delta(target.x, e.x);
  const dy = world.delta(target.y, e.y);
  e.angle = Math.atan2(dy, dx);
  ai.goal = AIGoal.HUNT;
  ai.combatTargetId = target.id;

  if (world.dist2(e.x, e.y, lineCenterX, lineCenterY) > 0.55) {
    ai.timer -= dt;
    if (monsterRepathDue(world, e) || !pathTargetIs(world, e, line.x, line.y)) {
      assignMonsterPath(world, e, line.x, line.y, 0.9);
    }
    followMonsterPath(world, e, dt);
    return true;
  }

  line.armed = true;
  e.spriteScale = 0.92;
  return true;
}

function clearTreskotnikBurst(e: Entity): void {
  const ai = e.ai!;
  ai.windupTimer = undefined;
  ai.windupTargetId = undefined;
  ai.windupStartHp = undefined;
  endDashRun(e);
  e.spriteScale = undefined;
}

function interruptTreskotnikWindup(
  world: World,
  e: Entity,
  target: Entity | undefined,
  time: number,
  msgs: Msg[],
  reason: 'hit' | 'line',
  state?: GameState,
): void {
  const ai = e.ai!;
  const wasWindup = (ai.windupTimer ?? 0) > 0;
  clearTreskotnikBurst(e);
  if (reason === 'hit') {
    ai.staggerTimer = Math.max(ai.staggerTimer ?? 0, TRESKOTNIK_STAGGER_SEC);
    e.attackCd = Math.max(e.attackCd ?? 0, 1.0);
    e.spriteScale = 0.82;
    msgs.push(msg('Попадание раскрошило красный рывок Трескотника. Он долго собирает плиты обратно.', time, '#f66'));
  } else {
    e.attackCd = Math.max(e.attackCd ?? 0, 0.55);
    msgs.push(msg('Трескотник потерял прямую и рассыпал рывок об угол.', time, '#f86'));
  }
  if (!wasWindup) return;
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_windup_interrupted', reason === 'hit' ? 4 : 3, ['treskotnik', 'fracture_sprint', 'interrupted', reason], {
    reason,
    staggerSec: reason === 'hit' ? TRESKOTNIK_STAGGER_SEC : 0,
    counterplay: reason === 'hit' ? 'shoot_red_crack_pulse' : 'break_straight_line_before_sprint',
  });
}

function damageTreskotnikTarget(
  world: World,
  e: Entity,
  target: Entity,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): void {
  const def = MONSTERS[MonsterKind.TRESKOTNIK];
  const dash = def.dash!;
  const dmg = monsterStrikeDamage(e, target, time, def.dmg, dash.damageMult ?? 1);
  applyMonsterStrike(world, state, e, target, dmg, def.strike!, time, msgs, playerId);

  const selfDamage = dashSelfDamage(world, e, dash.strikeSelfDamage ?? 0);
  msgs.push(msg(`Трескотник ударил и осыпался сам: -${selfDamage}`, time, '#f86'));
  publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', isPlayerEntity(target) ? 4 : 3, ['treskotnik', 'fracture_sprint', 'hit'], {
    damage: dmg,
    selfDamage,
    counterplay: 'shoot_windup_or_break_line_before_contact',
  });
  playSoundAt(playGrowl, e.x, e.y);
}

function updateTreskotnikFractureSprint(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  state?: GameState,
): boolean {
  // Ворота — флаг, а не имя вида: рывок по красной трещине объявляет `aiFlags`.
  if (!hasAIFlag(e, 'fractureSprint')) return false;
  const ai = e.ai!;
  const def = MONSTERS[MonsterKind.TRESKOTNIK];
  const dash = def.dash!;

  /* Боль сбивает УДАР, а не всего зверя.
   *
   * Здесь стояло `return true`: оглушённый Трескотник не шёл, не перецеливался и
   * не доводил уже начатый рывок — статуя на всю длину стаггера. Новый замах
   * закрыт откатом атаки ниже, а откат держит на остатке боли общий обработчик в
   * начале `updateMonster`; сам замах срывается отдельно, по потере здоровья
   * (`windupStartHp`). Плоские 0.25 к длине стаггера отношения не имели.
   * Осталась читаемая поза — она и так считалась от остатка боли. */
  if ((ai.staggerTimer ?? 0) > 0) {
    e.spriteScale = 0.82 + Math.max(0, (ai.staggerTimer ?? 0) / TRESKOTNIK_STAGGER_SEC) * 0.08;
  }

  const running = advanceDashRun(world, e, target, dt, dash);
  if (running !== DashRunOutcome.IDLE) {
    if (running === DashRunOutcome.CRASHED) {
      const selfDamage = dashSelfDamage(world, e, dash.crashSelfDamage ?? 0);
      clearTreskotnikBurst(e);
      ai.staggerTimer = Math.max(ai.staggerTimer ?? 0, dash.crashStunSec ?? 0);
      e.attackCd = def.attackRate;
      msgs.push(msg(`Трескотник врезался в препятствие и осыпался: -${selfDamage}`, time, '#f86'));
      publishMonsterReadabilityEvent(state, world, e, target ?? undefined, 'monster_windup_interrupted', 3, ['treskotnik', 'fracture_sprint', 'obstacle'], {
        reason: 'obstacle',
        selfDamage,
        counterplay: dash.counterplay,
      });
      return true;
    }
    if (running === DashRunOutcome.HIT && target?.alive) {
      damageTreskotnikTarget(world, e, target, time, msgs, playerId, state);
      clearTreskotnikBurst(e);
      ai.staggerTimer = Math.max(ai.staggerTimer ?? 0, 0.5);
      e.attackCd = def.attackRate;
      return true;
    }
    e.spriteScale = 1.14;
    if (running === DashRunOutcome.SPENT) {
      clearTreskotnikBurst(e);
      e.attackCd = Math.max(e.attackCd ?? 0, 0.65);
    }
    return true;
  }

  if ((ai.windupTimer ?? 0) > 0) {
    if (e.hp !== undefined && ai.windupStartHp !== undefined && e.hp < ai.windupStartHp - 0.001) {
      interruptTreskotnikWindup(world, e, target ?? undefined, time, msgs, 'hit', state);
      return true;
    }
    if (!target?.alive || ai.windupTargetId !== target.id || !hasClearLine(world, e, target, TRESKOTNIK_WINDUP_RANGE + 1.5)) {
      interruptTreskotnikWindup(world, e, target ?? undefined, time, msgs, 'line', state);
      return true;
    }

    const dx = world.delta(e.x, target.x);
    const dy = world.delta(e.y, target.y);
    const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    e.angle = Math.atan2(dy, dx);
    const windupTimer = ai.windupTimer ?? 0;
    e.spriteScale = 1.18 + Math.max(0, windupTimer / TRESKOTNIK_WINDUP_SEC) * 0.16;
    ai.windupTimer = Math.max(0, windupTimer - dt);
    if (ai.windupTimer <= 0) {
      startDashRun(e, dx / dist, dy / dist, dash);
      ai.windupTimer = undefined;
      ai.windupStartHp = undefined;
      e.spriteScale = 1.2;
    }
    return true;
  }

  if (!target || !target.alive) {
    e.spriteScale = undefined;
    return false;
  }

  const distSq = world.dist2(e.x, e.y, target.x, target.y);
  if (distSq <= TRESKOTNIK_WINDUP_RANGE * TRESKOTNIK_WINDUP_RANGE && (e.attackCd ?? 0) <= 0 && hasClearLine(world, e, target, TRESKOTNIK_WINDUP_RANGE)) {
    const dx = world.delta(e.x, target.x);
    const dy = world.delta(e.y, target.y);
    ai.windupTimer = TRESKOTNIK_WINDUP_SEC;
    ai.windupTargetId = target.id;
    ai.windupStartHp = e.hp;
    ai.path = [];
    ai.pi = 0;
    e.angle = Math.atan2(dy, dx);
    e.spriteScale = 1.32;
    if (target.id === playerId) {
      msgs.push(msg('Трескотник замер: красные трещины вспыхнули перед прямым рывком.', time, '#f66'));
      playSoundAt(playGrowl, e.x, e.y);
    }
    publishMonsterReadabilityEvent(state, world, e, target, 'monster_sighted', target.id === playerId ? 4 : 3, ['treskotnik', 'fracture_sprint', 'warning'], {
      windupSec: TRESKOTNIK_WINDUP_SEC,
      counterplay: 'shoot_red_crack_pulse_or_break_line',
    });
    return true;
  }

  e.spriteScale = undefined;
  return false;
}

/**
 * Поза Закалённой арматуры под болью. Только поза.
 *
 * Функция возвращала `true`, а вызов в `updateMonster` был `if (...) return;` —
 * жёсткая заморозка на всю длину стаггера, плюс плоские 0.35 отката, не
 * связанные с ней ничем. Боль сбивает УДАР, а не всего зверя: откат держит на
 * остатке боли общий обработчик строкой выше по вызову, а ноги, глаза и выбор
 * цели остаются свободными.
 */
function updateZakalennayaArmorStagger(e: Entity): void {
  if (!e.ai) return;
  if ((e.ai.staggerTimer ?? 0) <= 0) {
    if (e.spriteScale !== undefined) e.spriteScale = undefined;
    return;
  }
  e.spriteScale = (e.monsterArmorStacks ?? 0) <= 0 ? 0.88 : 0.94;
}

/* ── Drop NPC inventory as ITEM_DROP entities ─────────────────── */
export function dropNpcInventory(e: Entity, entities: Entity[], nextId: { v: number }): void {
  if (!e.inventory || e.inventory.length === 0) return;
  const slots = entitySpawnSlots(entities, EntityType.ITEM_DROP, e.inventory.length);
  let dropped = 0;
  for (const item of e.inventory) {
    if (dropped >= slots) break;
    if (!item || item.count <= 0) continue;
    entities.push({
      id: nextId.v++, type: EntityType.ITEM_DROP,
      x: e.x + (rng() - 0.5) * 0.5,
      y: e.y + (rng() - 0.5) * 0.5,
      angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
      inventory: [{ defId: item.defId, count: item.count, data: item.data }],
    });
    dropped++;
  }
  e.inventory = [];
}

/* Скульптура смотрит на смотрящих: радиус, кап наблюдателей и такт.
 * Раньше проверка шла КАЖДЫЙ кадр, аллоцировала массив, брала радиусный
 * запрос без капа и трассировала линию на каждого найденного. */
const WEEPING_ANGEL_RADIUS = 25;
/** Такт проверки наблюдателей: реакция на взгляд остаётся мгновенной на глаз. */
const WEEPING_ANGEL_SCAN_SEC = 0.2;
const WEEPING_ANGEL_OBSERVER_CAP = 8;
const WEEPING_ANGEL_FOV = Math.PI / 4;

interface WeepingAngelState {
  cd: number;
  frozen: boolean;
}

const weepingAngelState = speciesState<WeepingAngelState>(() => ({ cd: 0, frozen: false }));
const _weepingAngelObservers: Entity[] = [];

function scanWeepingAngelObservers(world: World, e: Entity): boolean {
  const found = getEntityIndex().queryRadiusCapped(
    e.x, e.y, WEEPING_ANGEL_RADIUS, _weepingAngelObservers, ENTITY_MASK_NPC, WEEPING_ANGEL_OBSERVER_CAP,
  );
  for (let i = 0; i < found; i++) {
    const actor = _weepingAngelObservers[i];
    if (actor.id === e.id || !actor.alive) continue;
    // Only players and NPCs count as observers — other monsters can't freeze sculptures
    if (actor.type === EntityType.MONSTER) continue;

    // Шов тора: кандидаты приходят из запроса, который обёртку УЧИТЫВАЕТ, а угол
    // считался голым вычитанием — за швом он переворачивался на 180°, и
    // скульптура замирала ровно от тех, кто на неё не смотрит.
    const angleToSculpture = Math.atan2(world.delta(actor.y, e.y), world.delta(actor.x, e.x));
    let diff = Math.abs(angleToSculpture - actor.angle);
    while (diff > Math.PI) diff -= Math.PI * 2;
    diff = Math.abs(diff);
    if (diff > WEEPING_ANGEL_FOV) continue;

    if (hasClearLine(world, actor, e, WEEPING_ANGEL_RADIUS)) return true;
  }
  return false;
}

function isWeepingAngelFrozen(world: World, e: Entity, dt: number): boolean {
  if (!hasAIFlag(e, 'weepingAngel')) return false;
  const state = weepingAngelState.of(e);
  state.cd -= dt;
  if (state.cd <= 0) {
    state.cd = deterministicScanCd(e.id, WEEPING_ANGEL_SCAN_SEC, WEEPING_ANGEL_SCAN_SEC * 0.5);
    state.frozen = scanWeepingAngelObservers(world, e);
  }
  return state.frozen;
}

export function tryPerformMonsterMeleeAttack(
  world: World,
  entities: Entity[],
  e: Entity,
  target: Entity,
  def: MonsterDef | null,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  nextId: { v: number },
  bestDist: number,
  state?: GameState
): boolean {
  const mRange = monsterMeleeRange(world, e);
  if (bestDist < mRange) {
    if ((e.attackCd ?? 0) <= 0) {
      const dx = world.delta(e.x, target.x);
      const dy = world.delta(e.y, target.y);
      e.angle = Math.atan2(dy, dx);

      getEntityIndex().queryRadius(e.x, e.y, mRange + 0.5, monsterMeleeHitQuery, ENTITY_MASK_ACTOR);
      const hitTarget = selectMeleeTarget(world, e, monsterMeleeHitQuery, mRange, undefined, true);

      if (hitTarget) {
        updateZombieCrowdReadability(world, e, hitTarget, time, msgs, playerId, state);
        const baseDmg = def?.dmg ?? 10;
        const level = e.rpg?.level ?? 1;
        const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
        const rawDmg = Math.round(scaleMonsterDmg(baseDmg, level) * strMult * monsterDmgMult(world, e, hitTarget) * (e.monsterDmgMult ?? 1));
        const dmg = zhelemishIncomingMeleeDamage(hitTarget, time, rawDmg);
        if (tryZombieApocalypseInfection(world, e, hitTarget, state, msgs, time)) {
          const hitAng = Math.atan2(world.delta(e.y, hitTarget.y), world.delta(e.x, hitTarget.x));
          spawnBloodHit(world, hitTarget.x, hitTarget.y, hitAng, Math.max(2, Math.round(dmg * 0.35)), false);
          playSoundAt(e.monsterKind === MonsterKind.FOG_SHARK ? playFogSharkBite : playGrowl, e.x, e.y);
          e.attackCd = (def?.attackRate ?? 1) * 1.5;
          return true;
        }
        if (hitTarget.hp !== undefined) {
          const debugImmortalPlayerHit = hitTarget.id === playerId && isDebugOnePunchManEnabled();
          if (debugImmortalPlayerHit) {
            keepDebugOnePunchManAlive(hitTarget);
          } else {
            // Единая дверь урона со всем конвейером: резист надетой брони цели
            // и врождённая броня твари. Разбор — `ActorDamageInput.applied`.
            /* Тип удара НЕ прибивается кинетикой: его объявляет вид
             * (`MonsterDef.damageType`), и дверь берёт его у бьющего сама. */
            damageActor(world, state, hitTarget, {
              damage: dmg,
              source: 'monster_melee',
              attacker: e,
              time,
              deathByCaller: true,
            });
            applyLishennyyContactDecay(state, world, e, hitTarget, dmg, time, msgs, playerId);
            applyKontorshchikGrab(state, world, e, hitTarget, time, msgs);
            dropSlimeWomanResidue(world, e, hitTarget, time, state, 'grab');
            if (hitTarget.id === playerId) {
              const verb = e.monsterKind === MonsterKind.KONTORSHCHIK
                ? 'схватил за бумаги'
                : e.monsterKind === MonsterKind.SLIME_WOMAN
                  ? 'схватила жижевой рукой'
                  : e.monsterKind === MonsterKind.LISHENNYY
                    ? 'коснулся распадом'
                    : 'задел';
              recordPlayerDamage(state, e, dmg, `${entityDisplayName(e)} ${verb} тебя: -${dmg}`);
            }
            if (hitTarget.hp <= 0) { killEntity(hitTarget); hitTarget.hp = 0; }
            const hitAng = Math.atan2(world.delta(e.y, hitTarget.y), world.delta(e.x, hitTarget.x));
            spawnBloodHit(world, hitTarget.x, hitTarget.y, hitAng, dmg, hitTarget.type === EntityType.MONSTER);
            if (hitTarget.hp <= 0) {
              spawnDeathPool(world, hitTarget.x, hitTarget.y, hitTarget.type === EntityType.MONSTER);
              if (hitTarget.type === EntityType.NPC) dropNpcInventory(hitTarget, entities, nextId);
              msgs.push(msg(`${entityDisplayName(e)} убил ${entityDisplayName(hitTarget)}`, time, '#f44'));
              if (e.monsterKind === MonsterKind.SOBRANNYY) growSobrannyy(world, e, hitTarget, time, msgs, state, 'kill');
              if (e.monsterKind === MonsterKind.HEAD_SLUG) rememberHeadSlugVictim(e, hitTarget);
            }
          }
        }
        playSoundAt(e.monsterKind === MonsterKind.FOG_SHARK ? playFogSharkBite : playGrowl, e.x, e.y);
        tryOlgoyDragTarget(world, e, hitTarget, time, msgs, state);
        e.attackCd = def?.attackRate ?? 1;
      }
    }
    // Orbit around target while in melee range (circle-strafe between attacks)
    if (!e.phasing && (def?.speed ?? 0) > 0) {
      tryCombatOrbitStep(world, e, target, mRange * 0.5, 0.3, dt);
    }
    return true;
  }
  return false;
}


/* ── Такт вида: диспетчер вместо четырнадцати безусловных вызовов ──
 *
 * Здесь стояли четырнадцать вызовов подряд, и КАЖДЫЙ звался на КАЖДУЮ тварь в
 * КАЖДОМ кадре только затем, чтобы первой строкой сравнить `monsterKind` и
 * выйти. На тёмном отсеке это 3100 тварей × 14 × 60 = 2.6 миллиона вызовов в
 * секунду ради тринадцати отказов из четырнадцати. Замерено: 5.9 % времени AI
 * и 0.64 мс кадра.
 *
 * Гейт теперь объявлен РЯДОМ С ШАГОМ, а список шагов на вид печётся один раз
 * при загрузке модуля: перебирать нечего, тварь берёт свой готовый список по
 * `monsterKind`. Порядок шагов сохранён дословно — он значим.
 *
 * Гейт внутри самих шагов НЕ снят и снят не будет: пять из них живут своими
 * пакетами (`mukhozhuk`, `tumannik`, `spore_carpet`, `slimevik`, `gnilushka`),
 * и проверка вида там — контракт пакета, а не оптимизация. Второй раз она не
 * стоит ничего: диспетчер зовёт шаг только для своего вида.
 */
interface SpeciesTickStep {
  /** Кому шаг принадлежит: вид или его флаг. Ровно одно из двух. */
  kind?: MonsterKind;
  flag?: MonsterAIFlag;
  /** `true` — такт твари закончен, дальше идти незачем. */
  run: (c: SpeciesTickArgs) => boolean;
}

interface SpeciesTickArgs {
  world: World;
  entities: Entity[];
  e: Entity;
  dt: number;
  time: number;
  msgs: Msg[];
  playerId: number;
  nextId: { v: number };
  player: Entity | undefined;
  state: GameState | undefined;
}

const SPECIES_TICK_STEPS: readonly SpeciesTickStep[] = [
  { flag: 'larvaCarrier', run: c => { updateMukhozhukBite(c.world, c.e, c.dt, c.time, c.msgs, c.state); return false; } },
  { flag: 'strikeReveal', run: c => { updateTumannikReveal(c.world, c.e); return false; } },
  // Ковёр не воюет и не ходит: он растение, и вся его жизнь — этот вызов.
  { kind: MonsterKind.SPORE_CARPET, run: c => updateSporeCarpetGrowth(c.world, c.entities, c.e, c.nextId, c.dt, c.time, c.msgs, c.state) },
  { kind: MonsterKind.LISHENNYY, run: c => updateLishennyyBrightAvoidance(c.world, c.e, c.dt) },
  { flag: 'netPossessor', run: c => { updateChervieNetPossessor(c.world, c.e, c.dt, c.time, c.msgs, c.playerId, c.state); return false; } },
  { kind: MonsterKind.SLIMEVIK, run: c => updateSlimevikMonster(c.world, c.entities, c.e, c.dt, c.time, c.msgs, c.state) },
  { kind: MonsterKind.GNILUSHKA, run: c => updateGnilushkaMonster(c.world, c.entities, c.e, c.dt, c.time, c.msgs, c.playerId, c.state) },
  { kind: MonsterKind.HEAD_SLUG, run: c => updateHeadSlugParasite(c.world, c.entities, c.e, c.dt, c.time, c.msgs, c.nextId, c.state) },
  { kind: MonsterKind.SOBRANNYY, run: c => { updateSobrannyyGrowthState(c.world, c.e, c.time, c.msgs, c.state); return false; } },
  { flag: 'noiseFear', run: c => updateGreenDogNoiseFear(c.world, c.e, c.dt, c.time, c.msgs, c.state) },
  { kind: MonsterKind.SLIME_WOMAN, run: c => { updateSlimeWomanState(c.world, c.e, c.time, c.msgs, c.state); return false; } },
  { flag: 'waterStrider', run: c => { updateWaterStriderState(c.world, c.e, c.dt, c.time); return false; } },
  { kind: MonsterKind.PANELNIK, run: c => { updatePanelnikWallBrace(c.world, c.e, c.dt, c.time, c.msgs, c.player, c.state); return false; } },
  { flag: 'scrapWake', run: c => updateRzhavnikScrapWake(c.world, c.e, c.dt, c.time, c.msgs, c.playerId, c.state) },
];

/** Список шагов на вид, испечённый один раз. Пустой список — общая пустая ссылка. */
const NO_SPECIES_STEPS: readonly SpeciesTickStep[] = [];
const SPECIES_TICK_BY_KIND: (readonly SpeciesTickStep[])[] = (() => {
  const baked: (readonly SpeciesTickStep[])[] = [];
  for (const value of Object.values(MonsterKind)) {
    if (typeof value !== 'number') continue;
    const def = MONSTERS[value as MonsterKind];
    const steps = SPECIES_TICK_STEPS.filter(step => step.kind !== undefined
      ? step.kind === value
      : def?.aiFlags?.includes(step.flag!) === true);
    baked[value] = steps.length > 0 ? steps : NO_SPECIES_STEPS;
  }
  return baked;
})();

/* Один аргумент на все шаги, переиспользуемый: новый объект на каждую тварь в
 * каждом кадре был бы ровно тем мусором, ради которого диспетчер и заводили.
 * Такт монстров однопоточный и не рекурсивный, шаг чужого такта не запускает. */
const speciesTickArgs: SpeciesTickArgs = {
  world: undefined as unknown as World, entities: [], e: undefined as unknown as Entity,
  dt: 0, time: 0, msgs: [], playerId: 0, nextId: { v: 0 }, player: undefined, state: undefined,
};

function runSpeciesTickSteps(
  world: World,
  entities: Entity[],
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  playerId: number,
  nextId: { v: number },
  player: Entity | undefined,
  state: GameState | undefined,
): boolean {
  if (e.monsterKind === undefined) return false;
  const steps = SPECIES_TICK_BY_KIND[e.monsterKind];
  if (steps === undefined || steps.length === 0) return false;
  const c = speciesTickArgs;
  c.world = world; c.entities = entities; c.e = e; c.dt = dt; c.time = time;
  c.msgs = msgs; c.playerId = playerId; c.nextId = nextId; c.player = player; c.state = state;
  for (const step of steps) {
    if (step.run(c)) return true;
  }
  return false;
}

/* ── Monster AI update ────────────────────────────────────────── */
export function updateMonster(world: World, entities: Entity[], e: Entity, dt: number, time: number, msgs: Msg[], playerId: number, nextId: { v: number }, state?: GameState): void {
  const ai = e.ai!;
  if (isWeepingAngelFrozen(world, e, dt)) {
    return;
  }

  /* Боль сбивает УДАР — у твари ровно так же, как у человека.
   *
   * Штраф за попадание платил только человек: `applyHitStaggerAndKnockback`
   * пишет `ai.staggerTimer` ЛЮБОЙ цели, но читал его общий боевой такт NPC, а
   * монстрятник — нет. У твари он молча копился и мешался под ногами у тех
   * пяти видов, которые тем же полем меряют СВОЮ отдачу после замаха: чужая
   * пуля продлевала им восстановление.
   *
   * Убыль теперь одна на всех и живёт здесь; видовые ветки только читают
   * остаток и рисуют свою реакцию. Второй такой убыли в монстрятнике быть не
   * должно — иначе вид отходит от боли вдвое быстрее прочих.
   */
  if ((ai.staggerTimer ?? 0) > 0) {
    ai.staggerTimer = Math.max(0, (ai.staggerTimer ?? 0) - dt);
    e.attackCd = Math.max(e.attackCd ?? 0, ai.staggerTimer);
  }

  /* Щит по виду стоит НА ВЫЗОВЕ, а не внутри: поза Закалённой арматуры — одна
   * из немногих веток, которую общий такт звал безусловно, то есть 796 монстров
   * × 60 кадров = ~48 тысяч вызовов в секунду ради вида, которого на этаже может
   * не быть вовсе. */
  if (e.monsterKind === MonsterKind.ZAKALENNAYA_ARMATURA) updateZakalennayaArmorStagger(e);

  evaluateMicroStimuli(world, e, time, msgs);
  if (tickMicroGoal(world, e, dt, time, msgs)) return;

  if (e.monsterKind === MonsterKind.KHOROVAYA_MATKA) {
    updateKhorovayaMatka(world, entities, e, dt, time, msgs, playerId, nextId, _entityById, state);
  }

  if (e.monsterKind === MonsterKind.MATKA) {
    if (!e.alive) return;
    updateMatkaSource(world, entities, e, dt, time, msgs, nextId, _entityById, state);
  }

  const player = _entityById.get(playerId);
  if (monsterHasAIFlag(e, 'looksLiquidator')) updateBlackLiquidatorDisguise(world, e, time);

  const def = e.monsterKind !== undefined ? MONSTERS[e.monsterKind] : null;
  if (runSpeciesTickSteps(world, entities, e, dt, time, msgs, playerId, nextId, player, state)) return;
  const baseDetectSq = def && !def.isRanged && def.speed > 0 ? MONSTER_MELEE_DETECT_SQ : MONSTER_DETECT_SQ;
  let detectSq = monsterDetectSq(world, e, baseDetectSq, time);
  let target: Entity | null;
  let lishennyyLightTarget: LishennyyLightTarget | null = null;
  const zombieApocalypse = e.monsterKind === MonsterKind.ZOMBIE && isZombieApocalypseActive(state);
  if (zombieApocalypse) {
    target = findZombieApocalypseTarget(world, entities, e, dt, detectSq);
  } else if (e.monsterKind === MonsterKind.LISHENNYY) {
    detectSq = LISHENNYY_DETECT_SQ;
    lishennyyLightTarget = findLishennyyLightTarget(world, e, dt, time, state);
    target = lishennyyLightTarget?.source === 'actor' && lishennyyLightTarget.entity
      ? lishennyyLightTarget.entity
      : null;
  } else if (e.monsterKind === MonsterKind.CHERNOSLIZ) {
    target = findChernoSlizTarget(world, e, dt);
  } else if (hasAIFlag(e, 'meatWorm')) {
    target = findMeatWormTarget(world, e, dt);
  } else if (hasAIFlag(e, 'garbageSurround')) {
    target = findPomoynyRoyTarget(world, e, dt, detectSq);
  } else if (isDocumentPressureHunter(e)) {
    target = findDocumentHunterTarget(world, entities, e, dt);
  } else if (hasAIFlag(e, 'closeReveal')) {
    target = findCombatTarget(world, entities, e, dt, detectSq, 1.25, monsterTargetFilter(e));
  } else if (hasAIFlag(e, 'meleeWindup')) {
    /* Замах ищет цель чаще обычного и сытым не жмурится. Обе константы вида
     * (`KOSTOREZ_DETECT_SQ`, `SAFEGUARD_DETECT_SQ`) были равны общей дальности
     * ближнего боя слово в слово — от них осталась только эта строка. */
    detectSq = MONSTER_MELEE_DETECT_SQ;
    target = findCombatTarget(world, entities, e, dt, detectSq, deterministicScanCd(e.id, 0.7, 0.3), monsterTargetFilter(e));
  } else if (e.monsterKind === MonsterKind.TRESKOTNIK) {
    detectSq = TRESKOTNIK_DETECT_SQ;
    target = findCombatTarget(world, entities, e, dt, detectSq, 0.45, monsterTargetFilter(e));
  } else {
    const scanCd = fixedScanCd(e) ?? deterministicScanCd(e.id, 1.0, 0.5);
    target = findCombatTarget(
      world, entities, e, dt,
      detectSq, scanCd,
      monsterTargetFilter(e),
    );
  }

  /* Здесь стоял блок «Prefer player»: после честного выбора цели монстр ещё раз
   * мерил расстояние до ИГРОКА и переключался на него. Мерил в обход всего —
   * мимо проверки луча, мимо кадансов сканирования и мимо враждебности. Игрока
   * поэтому замечали сквозь стену и мгновенно, а NPC — только по видимости и по
   * расписанию, из-за чего бои NPC против NPC рядом с игроком почти не случались.
   *
   * Блок снят: цель выбирают функции выше, и игрок проходит через них наравне со
   * всеми. Особые повадки при этом сохранились — они и раньше жили не здесь, а в
   * своих ветках выбора цели (`findDocumentHunterTarget` для печатоеда,
   * `findMeatWormTarget` для олгоя, `findChernoSlizTarget`), и там они с самого
   * начала написаны про любого носителя, а не про игрока. */

  updateGreenDogPackShare(e, target, time);
  if (lishennyyLightTarget && followLishennyyLightTarget(world, e, lishennyyLightTarget, dt)) return;
  target = updateSobrannyyTarget(world, e, target, time, msgs, state);
  target = updateObzhivalshchikTarget(world, e, target, dt, time, msgs, state);

  /* Приказ «иди в точку» тварь читает ТЕМ ЖЕ каналом, что и человек, — общим
   * исполнителем `tickGotoOrder` (`ai/goto_order.ts`). Своей ветки под `GOTO` в
   * монстрятнике не было вовсе, поэтому авторская сцена, адресующая ОДНУ тварь
   * в ОДНУ клетку, была мертва: приманка бетоноеда на шум
   * (`gen/maintenance/betonoed_shortcut.ts`) ставит `goal = GOTO` на слабую
   * стену, а тварь тут же уходила блуждать строкой `ai.goal = AIGoal.WANDER`
   * ниже. Замерено на коллекторах (`tmp/goto_holes_probe.ts`): из десяти
   * тварей под приказом первый кадр не пережила ни одна.
   *
   * Место строки — существенное. Приказ читается ПОСЛЕ поиска цели и только
   * при её отсутствии: у твари бой живёт внутри этого такта, и подъём приказа
   * выше отнял бы у неё ответ на удар. Он же идёт ДО расследования шума ниже —
   * иначе шум переписал бы `goal` и `tx/ty` приказа своей охотой, как рутина
   * переписывала его у человека.
   *
   * Шаг отдаётся под закон породы: `monsterMoveMult` — та же поправка на
   * местность, с которой тварь ходит и в охоте, и в блуждании. */
  if (!target && tickGotoOrder(world, e, dt, monsterMoveMult(world, e))) return;

  /* Слух переходит в охоту — механика ОБЩАЯ на всех.
   *
   * Здесь стоял чёрный список из пяти видов (Хоровая Матка, Матка, Зомби,
   * Чернослиз, Зелёный пёс), вычеркнутых из механики одной строкой. Это не
   * свойство вида: свойство вида живёт в его дефе, а не списком исключений в
   * общем цикле. Решение владельца 2026-08-24 — заплатка от старого бага, снести.
   * Кто по замыслу не слышит, объявит это флагом рядом с уже существующим
   * `silent` («не шумит»), а не отсутствием в списке. */
  if (!target && (!ai.combatTargetId || ai.goal !== AIGoal.HUNT)) {
    const noise = findNoiseInvestigationTarget(world, state, e, time);
    if (noise && noise.id !== ai.lastSeenNoiseId) {
      ai.lastSeenNoiseId = noise.id;
      if (noise.actorId !== undefined) {
        ai.lastSeenTargetId = noise.actorId;
      }
      ai.tx = noise.x;
      ai.ty = noise.y;
      ai.goal = AIGoal.HUNT;
    }
  }
  updateNightmarePressure(world, e, target, dt, time, msgs, playerId, state);
  if (updateBloodPlantRootHive(world, e, target, dt, time, msgs, playerId, state)) return;
  if (updateBorshchevikRootedPlant(world, e, target, dt, time, msgs, playerId, state)) return;
  updateProtokolnikProtocolPressure(world, e, target, dt, time, msgs, playerId, state);
  if (target && !target.alive) return;
  updateWallTerrainReadability(world, e, target, time, msgs, state);
  if (updateZhornayaTvar(world, e, target, dt, time, msgs, playerId, state)) return;
  if (updateSlepoglaz(world, e, target, dt, time, msgs, playerId, state)) return;
  if (updateTreskotnikFractureSprint(world, e, target, dt, time, msgs, playerId, state)) return;
  if (target) updateVodyanoyWaterPressureLine(world, e, target, dt, time, msgs, playerId, state);
  updatePomoynyRoyReadability(world, e, target, time, msgs, playerId, state);

  if (!hasAIFlag(e, 'scentOvercommit') && tryFollowMonsterBait(world, e, target, dt, time, msgs, state)) return;
  if (tryConsumeMeatChunk(world, e, target, dt, time, msgs, state)) return;

  if (!target) {
    if (e.monsterKind === MonsterKind.OBZHIVALSHCHIK) {
      const room = obzhivalshchikHomeRoom(world, e);
      if (room && idleObzhivalshchikInRoom(world, e, room, dt, time)) return;
    }
    if (e.monsterKind === MonsterKind.SOBRANNYY) {
      const runtime = sobrannyyState(e);
      if (runtime.dormant || runtime.isolatedUntil > time) return;
    }
    /* Наблюдателя тут нет: цели не нашлось, значит никто рядом его не вскрыл —
     * близость и фонарь любого носителя уже проверил `chernoslizCanTarget`. */
    if (e.monsterKind === MonsterKind.CHERNOSLIZ && isChernoSlizHidden(world, e)) {
      const revealedByNoise = tryRevealChernoSlizByNoise(world, e, time, msgs, state);
      if (revealedByNoise) {
        if (tryFollowNoise(world, e, dt, time, msgs, state)) return;
      } else if (tryFollowNoise(world, e, dt, time, msgs, state)) {
        return;
      }
      if (isChernoSlizHidden(world, e)) {
        e.spriteScale = 0.58;
        return;
      }
    }
    if (tryFollowNoise(world, e, dt, time, msgs, state)) return;
    if (hasAIFlag(e, 'meleeWindup') && ai.lastSeenTargetId === playerId) {
      publishMeleeWindupEscape(world, e, player, playerId, state, 'lost_target');
    }
    // Immobile monsters (Idol) just idle — no wandering
    if (def?.speed === 0) return;
    ai.goal = AIGoal.WANDER;
    ai.combatTargetId = undefined;
    if (e.phasing) {
      ai.timer -= dt;
      if (ai.timer <= 0) {
        ai.timer = 2 + rng() * 3;
        ai.wanderAngle = rng() * Math.PI * 2;
      }
      const a = ai.wanderAngle ?? 0;
      const spd = e.speed * 0.4 * dt;
      e.x = ((e.x + Math.cos(a) * spd) % W + W) % W;
      e.y = ((e.y + Math.sin(a) * spd) % W + W) % W;
    } else {
      if (ai.path.length === 0 || ai.pi >= ai.path.length) {
        // Сначала давления по полям: не отбиться от стаи и найти, чем кормиться.
        // Оба драйва — марш по градиенту под ногами, без единого перебора.
        // Территориал своего дома не бросает: его поводок сильнее любого запаха.
        const packMode = monsterPackMode(e.monsterKind);
        const driven = packMode !== 'territorial' &&
          monsterWanderDrive(world, e, time);
        // Pack-mode wander (mode from monster ecology): roamers patrol wide, territorial
        // packs leash back to their home room (~16-cell tether), everyone else wanders
        // locally. Iron-Law safe — only assigns paths on the baked nav, never re-bakes.
        if (driven) {
          // путь уже назначен драйвом
        } else if (packMode === 'roamer') {
          wanderFar(world, e);
        } else if (packMode === 'territorial' && ai.homeRoomId !== undefined) {
          const home = world.rooms[ai.homeRoomId];
          const hx = home ? home.x + (home.w >> 1) : e.x;
          const hy = home ? home.y + (home.h >> 1) : e.y;
          // Beyond the leash and a path home exists → walk home; otherwise wander in place.
          const leashed = home !== undefined && world.dist2(e.x, e.y, hx, hy) > 256 &&
            tryAssignPathToCell(world, e, hx, hy) !== 'not_found';
          if (!leashed) wanderNearby(world, e);
        } else {
          wanderNearby(world, e);
        }
      }
      followMonsterPath(world, e, dt);
    }
    return;
  }
  ai.combatTargetId = target.id;
  ai.goal = AIGoal.HUNT;

  const bestDist = Math.sqrt(world.dist2(e.x, e.y, target.x, target.y));
  updateNelyudCloseReveal(world, e, target, time, msgs, state);
  updateSborkaReadability(world, e, target, time, msgs, playerId, state);
  updateLampPoweredReadability(world, e, target, time, msgs, playerId, state);
  updateOlgoyReadability(world, e, target, time, msgs, playerId, state);
  if (updateDikiyRush(world, e, target, dt, time, msgs, state)) return;

  if (e.monsterKind === MonsterKind.SOBRANNYY && trySobrannyyBreakWeakDoor(world, e, target, time, msgs, state)) return;

  if (hasAIFlag(e, 'meleeWindup')) {
    updateMeleeWindup(world, e, target, dt, time, msgs, playerId, state);
    return;
  }

  if (e.monsterKind === MonsterKind.TONKAYA_TEN &&
      updateTonkayaTenBaitLine(world, e, target, dt, time, msgs, playerId, state)) {
    return;
  }

  if (e.monsterKind === MonsterKind.SHADOW &&
      updateShadowAmbushReadability(world, e, target, bestDist, dt, time, msgs, playerId, state)) {
    return;
  }

  if (e.monsterKind === MonsterKind.FOG_SHARK) {
    updateFogSharkTurn(world, e, target, dt);
    updateFogSharkPack(world, e, target, time, msgs, playerId, state);
  }

  if (e.monsterKind === MonsterKind.LAMPOGLAZ && def) {
    updateLampoglazLightLock(world, entities, e, target, def, bestDist, dt, time, msgs, playerId, nextId, state);
    return;
  }

  // Ranged monsters telegraph, require a clear toroidal line of fire, and can be denied by cover.
  if (e.monsterKind === MonsterKind.TRUBNYY_AVTOMAT && def) {
    if (updateTrubnyyWetLineShot(world, entities, e, target, def, dt, time, msgs, playerId, nextId, state)) return;
  } else if (def?.isRanged && updateReadableMonsterRanged(world, entities, e, target, def, bestDist, dt, time, msgs, playerId, nextId, state)) return;

  // Immobile monsters don't pathfind or melee: once their line/source is denied, they are disabled until it opens again.
  if (def?.speed === 0) return;

  // Melee attack if close enough
  if (tryPerformMonsterMeleeAttack(world, entities, e, target, def, dt, time, msgs, playerId, nextId, bestDist, state)) {
    return;
  }



  // Hunt: pathfind to target
  ai.timer -= dt;
  if (monsterRepathDue(world, e)) {
    const chase = e.monsterKind === MonsterKind.VODYANOY_KOSHMAR
      ? vodyanoyChaseCell(world, e, target)
      : e.monsterKind === MonsterKind.FOG_SHARK
        ? fogSharkChaseCell(world, e, target)
        : greenDogChaseCell(world, e, target);
    assignMonsterPath(world, e, chase.x, chase.y, 2);
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

  followMonsterPath(world, e, dt, target);
}

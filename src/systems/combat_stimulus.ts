import {
  AIGoal,
  EntityType,
  Faction,
  type Entity,
  type GameState,
  type WorldEventSeverity,
} from '../core/types';
import type { World } from '../core/world';
import { WEAPON_STATS } from '../data/catalog';
import { occupationHasAnyProfileTag } from '../data/occupation_profiles';
import { entityDisplayName } from '../entities/monster';
import { ENTITY_MASK_NPC, getEntityIndex } from './entity_index';
import { publishEvent } from './events';
import { applyWitnessedViolencePenalty, areSameSide, combatSideOf, isHostile, isPersonalFeudEnemy } from './factions';
import { isPlayerEntity } from './player_actor';
import { hasLineOfSight } from '../world/line_of_sight';
import { equippedCombatItemId, weaponCanFire } from './inventory';
import { RELATION_FRIENDLY_THRESHOLD, getNpcPlayerRelation } from './npc_relations';
import { finishActorDeath, runActorDamageCore } from './actor_damage';
import { applyCombatRelationOutcome } from './factions';
import type { MonsterArmorHitResult } from './monster_armor';
import type { DamageType, ProjType } from '../core/types';

export type CombatStimulusSource =
  | 'player_melee'
  | 'npc_melee'
  | 'npc_ranged'
  | 'monster_melee'
  | 'monster_special'
  | 'projectile'
  | 'explosion'
  /* Среда: пар, огонь, ловушка этажа. Автора у такого удара нет, но жертва
   * обязана получить всё остальное — броню, кровь, обработку смерти и повод
   * уйти с места. Отличать его от чужой руки нужно ровно затем, чтобы никто не
   * считал это нападением и не начинал из-за пара войну. */
  | 'environment';

export type CombatThreatReaction = 'fight' | 'flee' | 'startled';

export interface NpcCombatProfile {
  brave: boolean;
  armed: boolean;
  ranged: boolean;
  threatScore: number;
  hpRatio: number;
}

export interface CombatThreat {
  attacker: Entity;
  attackerId: number;
  lastKnownX: number;
  lastKnownY: number;
  damagePressure: number;
  reaction: CombatThreatReaction;
  source: CombatStimulusSource;
  expiresAt: number;
}

interface CombatThreatMemory {
  attackerId: number;
  lastKnownX: number;
  lastKnownY: number;
  damagePressure: number;
  reaction: CombatThreatReaction;
  source: CombatStimulusSource;
  expiresAt: number;
}

const COMBAT_THREAT_TTL = 5.0;
const COMBAT_THREAT_PRESSURE_CAP = 120;
/**
 * Докуда доносится драка. «В зоне видимости» читается буквально: сосед считается
 * свидетелем, если стоит в этом радиусе И видит место по прямой
 * (`hasLineOfSight`). Стены и закрытые двери держат — потасовка в кабинете не
 * поднимает коридор, а бетон между двумя коридорами не делает их одной комнатой.
 */
const ASSIST_SIGHT_RADIUS = 12;
/** Потолок отзывающихся на один зов: драка своих, а не всеобщая мобилизация. */
const ASSIST_ALERT_CAP = 8;
const assistScratch: Entity[] = [];
/** Нижняя граница между двумя схватками одной и той же пары. Второй слой поверх
 *  боевой памяти: она держит пять секунд, но истечь и начаться заново может и
 *  быстрее, а лента этого повторять не обязана. */
const HURT_EVENT_COOLDOWN = 0.7;

let threatMemory = new WeakMap<Entity, CombatThreatMemory>();
const recentEventTimes = new Map<string, number>();
let killedEventTargets = new WeakSet<Entity>();
/* Участники объявленного поединка. Один на один — значит свои не вмешиваются:
 * зов союзников их обходит. Живёт рядом с боевой памятью, потому что это факт
 * о драке, а не свойство вида; поединок объявляет тот, кто его завёл
 * (`systems/npc_feud.ts`, `systems/arena.ts`), и он же снимает замок. */
let duelLocked = new WeakSet<Entity>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function eventLocation(world: World, entity: Entity): { zoneId: number; roomId?: number } {
  const cell = world.idx(Math.floor(entity.x), Math.floor(entity.y));
  const room = world.roomMap[cell];
  return {
    zoneId: world.zoneMap[cell],
    roomId: room >= 0 ? room : undefined,
  };
}

function cleanSeverity(value: number): WorldEventSeverity {
  return clamp(Math.round(value), 0, 5) as WorldEventSeverity;
}

function displayName(e: Entity): string {
  if (e.name) return e.name;
  if (isPlayerEntity(e)) return 'Вы';
  if (e.type === EntityType.MONSTER) return entityDisplayName(e);
  return 'NPC';
}

function eventAllowed(key: string, time: number, cooldown: number): boolean {
  const prev = recentEventTimes.get(key) ?? -Infinity;
  if (time - prev < cooldown) return false;
  recentEventTimes.set(key, time);
  if (recentEventTimes.size > 256) {
    for (const oldKey of recentEventTimes.keys()) {
      recentEventTimes.delete(oldKey);
      if (recentEventTimes.size <= 192) break;
    }
  }
  return true;
}

/** Занятия, при которых бой — часть работы. Список вынесен из тела справки:
 *  литерал в аргументе аллоцировал массив на каждый вызов. */
const BRAVE_OCCUPATION_TAGS: readonly string[] = ['combat', 'patrol'];

/**
 * ПОСТОЯННАЯ ПОЛОВИНА боевой справки: всё, что не зависит от текущего здоровья.
 *
 * Справку спрашивают у каждого думающего человека каждый его такт — замерено
 * 2300 вызовов в кадр на жилом этаже, — а тяжёлое в ней ровно две вещи, и обе
 * от здоровья не зависят: разбор тегов занятия (`toLowerCase` плюс проходы по
 * трём спискам тегов и по словарю синонимов) и таблица оружия.
 *
 * Поэтому кэшируется НЕ профиль, а его постоянная половина, и ключ — полный
 * список её входов. Их ровно шесть, и все они читаются из самой справки:
 * оружие в руках, занятие, фракция, пси-безумие, признак странника и уровень.
 * БРОНИ СРЕДИ НИХ НЕТ — справка её не читает вовсе, ни носимую, ни монстровую,
 * поэтому смена брони профиль не меняет и инвалидировать его не обязана.
 *
 * Здоровье пересчитывается на каждом вызове и в ключ не входит: делить и
 * умножать дешевле, чем сверять, а раненый обязан отвечать текущим числом.
 */
interface CombatProfileCore {
  weapon: string;
  occupation: Entity['occupation'];
  faction: Faction | undefined;
  psiMad: boolean;
  traveler: boolean;
  level: number;
  /** Есть ли чем стрелять: пустой магазин делает ствол бесполезным. */
  canFire: boolean;
  brave: boolean;
  armed: boolean;
  ranged: boolean;
  weaponScore: number;
  levelScore: number;
}

let profileCores = new WeakMap<Entity, CombatProfileCore>();

function combatProfileCore(npc: Entity): CombatProfileCore {
  /* Чем человек дерётся, знает `equippedCombatItemId`: слот оружия ИЛИ пси-
   * инструмент. Читать один слот `weapon` нельзя — бой берёт пси именно этим
   * вызовом, и справка расходилась с боем. Культист с пси-крюком на 50 урона
   * числился БЕЗОРУЖНЫМ, а значит по `npcShouldFightThreat` всегда уходил в
   * бегство и не весил в раскладе сил ничего сверх здоровья и уровня. */
  const weapon = equippedCombatItemId(npc);
  const psiMad = (npc.psiMadness ?? 0) > 0;
  const traveler = npc.isTraveler === true;
  const level = Math.max(1, npc.rpg?.level ?? 1);
  /* Патроны кончаются ЧАЩЕ, чем меняется оружие, поэтому признак входит в ключ
   * кэша: иначе опустевший стрелок числился бы вооружённым до самой смены
   * ствола. Проверка — обход собственных карманов, а их единицы. */
  const canFire = weaponCanFire(npc, weapon);
  const cached = profileCores.get(npc);
  if (cached !== undefined &&
    cached.canFire === canFire &&
    cached.weapon === weapon &&
    cached.occupation === npc.occupation &&
    cached.faction === npc.faction &&
    cached.psiMad === psiMad &&
    cached.traveler === traveler &&
    cached.level === level) return cached;
  const ws = WEAPON_STATS[weapon] ?? WEAPON_STATS[''];
  const ranged = ws.isRanged === true;
  const core: CombatProfileCore = {
    weapon,
    occupation: npc.occupation,
    faction: npc.faction,
    psiMad,
    traveler,
    level,
    canFire,
    brave: psiMad ||
      traveler ||
      occupationHasAnyProfileTag(npc.occupation, BRAVE_OCCUPATION_TAGS) ||
      npc.faction === Faction.LIQUIDATOR ||
      npc.faction === Faction.CULTIST ||
      npc.faction === Faction.WILD,
    ranged,
    /* Пустой ствол не оружие. Без этого стрелок с нулём патронов числился
     * вооружённым, стоял на месте и «отстреливался» вхолостую: разорвать
     * контакт и сходить за патронами ему было незачем, потому что расчёт сил
     * считал его бойцом. Теперь он читается как безоружный, уходит из-под огня
     * — и там уже срабатывает складской рейс, у которого `opportunity` равен
     * нулю, пока рядом враг (`actor/drives.ts`). */
    armed: canFire && (ws.dmg > 3 || ranged),
    /* Вес НЕ зависит от патронов, и это не недосмотр: `weaponScore` читают
     * ДРУГИЕ — через `actorThreatScore`, когда решают, драться ли с этим
     * человеком. Чужой магазин со стороны не виден. Пустой ствол меняет
     * решение только своего хозяина (`armed` выше), а пугает он ровно так же. */
    weaponScore: ranged ? ws.dmg * (ws.pellets ?? 1) * 1.6 : ws.dmg,
    levelScore: level * 3,
  };
  profileCores.set(npc, core);
  return core;
}

/**
 * Смелость отдельным входом: боевому AI из всей справки нужен ровно этот флаг,
 * и это самый частый её потребитель. Через полный профиль он платил бы объектом
 * на каждый вызов ни за что.
 */
export function npcIsBraveActor(npc: Entity): boolean {
  return combatProfileCore(npc).brave;
}

export function npcCombatProfile(npc: Entity): NpcCombatProfile {
  const core = combatProfileCore(npc);
  const hp = Math.max(0, npc.hp ?? 20);
  const maxHp = Math.max(1, npc.maxHp ?? (hp || 20));
  return {
    brave: core.brave,
    armed: core.armed,
    ranged: core.ranged,
    hpRatio: hp / maxHp,
    threatScore: hp * 0.22 + core.weaponScore + core.levelScore,
  };
}

function actorThreatScore(actor: Entity): number {
  if (actor.type === EntityType.MONSTER) {
    return Math.max(12, (actor.hp ?? 35) * 0.2 + Math.max(1, actor.rpg?.level ?? 1) * 5);
  }
  if (actor.type === EntityType.NPC) return npcCombatProfile(actor).threatScore;
  return 30;
}

/** Своей силы должно быть хотя бы столько от чужой, чтобы принять бой. */
const FIGHT_ODDS = 0.45;
/** Ниже этой доли здоровья бой не принимают. */
const FIGHT_MIN_HP_RATIO = 0.24;
/**
 * Во столько раз храбрость смягчает оба требования. Не выключатель: смелый
 * дерётся при вдвое худшем раскладе и вдвое более раненым, но безнадёжный
 * расклад безнадёжен для всех.
 */
const BRAVE_RELIEF = 2;

/**
 * Стоит ли этому человеку принимать бой с этим противником.
 *
 * Одна справка на весь мир: по ней решается и реакция на удар, и то, когда
 * боец объявленного поединка уступает (`systems/npc_feud.ts`). Отдельного
 * порога «сдаться» заводить нельзя — он тут же разъедется с этим.
 *
 * Храбрость была ВЫКЛЮЧАТЕЛЕМ расчёта: `if (profile.brave) return true` —
 * ликвидатор, культист и дикий принимали любой бой при любом здоровье и против
 * кого угодно, потому что расчёт до них не доходил. Замер жилого этажа: за 90
 * секунд гибло 74.5% диких и 30.9% ликвидаторов против 14.5% жителей. Это не
 * баланс, а отсутствие расчёта: они лезли в драку без шансов и не умели
 * отступать. Теперь храбрость смягчает те же два требования вдвое, а не
 * отменяет их.
 */
export function npcShouldFightThreat(npc: Entity, attacker: Entity): boolean {
  const profile = npcCombatProfile(npc);
  const relief = profile.brave ? BRAVE_RELIEF : 1;
  if (profile.hpRatio < FIGHT_MIN_HP_RATIO / relief) return false;
  // Безоружный смелый всё же бросается: голыми руками, но бросается.
  if (!profile.armed && !profile.brave) return false;
  return profile.threatScore >= actorThreatScore(attacker) * (FIGHT_ODDS / relief);
}

/**
 * Стоит ли этот удар боевой памяти.
 *
 * Правило одно и без списков: **ударивший с ЧУЖОЙ стороны становится врагом сам
 * по себе**, чем бы он ни ударил — рукой, очередью, шальной пулей, взрывом.
 * Перечислять источники нельзя: шальная пуля и нападение — физически одно и то
 * же событие, тот же урон из того же ствола, и любой список будет заплатой.
 *
 * Внутри одной стороны удар врагом НЕ делает. Не потому, что своих прощают, а
 * потому, что внутри фракции вражда идёт своим каналом — личным ребром графа
 * Демоса, обоюдным и переживающим прогон. Он уже прочитан выше, в `isHostile`:
 * двое своих с отношением ниже порога дерутся и без всякого удара.
 *
 * Экология — объявленное исключение, а не недосмотр: монстры между собой
 * конкурируют за место, но не враждуют, и удар этого не меняет.
 */
function isCombatRelevantThreat(victim: Entity, attacker: Entity): boolean {
  if (victim.id === attacker.id || !attacker.alive) return false;
  if (victim.type === EntityType.MONSTER && attacker.type === EntityType.MONSTER) return false;
  if ((victim.psiMadness ?? 0) > 0) return true;
  if (isHostile(victim, attacker)) return true;
  return !areSameSide(victim, attacker);
}

function threatReaction(victim: Entity, attacker: Entity, _source: CombatStimulusSource, _damage: number): CombatThreatReaction {
  if (!isCombatRelevantThreat(victim, attacker)) return 'startled';
  if (victim.type === EntityType.NPC && !isPlayerEntity(victim)) {
    return npcShouldFightThreat(victim, attacker) ? 'fight' : 'flee';
  }
  return 'fight';
}

function setThreatMemory(
  victim: Entity,
  attacker: Entity,
  damage: number,
  source: CombatStimulusSource,
  time: number,
  reaction: CombatThreatReaction = threatReaction(victim, attacker, source, damage),
): void {
  const prev = threatMemory.get(victim);
  threatMemory.set(victim, {
    attackerId: attacker.id,
    lastKnownX: attacker.x,
    lastKnownY: attacker.y,
    damagePressure: clamp((prev?.damagePressure ?? 0) + Math.max(1, damage), 0, COMBAT_THREAT_PRESSURE_CAP),
    reaction,
    source,
    expiresAt: time + COMBAT_THREAT_TTL,
  });
}

/**
 * Сброс маршрута — только при СМЕНЕ противника.
 *
 * Раньше эти два хука чистили `ai.path` и обнуляли `ai.timer` на КАЖДОМ
 * попадании. Под очередью автомата это обнуляет все троттлы пересборки
 * маршрута: замерено 59.4 назначения пути в секунду на одного актора при
 * среднем 0.1–0.3 у остальных. Тот же враг — маршрут к нему уже строится, и
 * рвать его нечем.
 */
function applyThreatHint(victim: Entity, attacker: Entity, goal: AIGoal): void {
  const ai = victim.ai;
  if (!ai || isPlayerEntity(victim)) return;
  const switched = ai.combatTargetId !== attacker.id || ai.goal !== goal;
  ai.combatTargetId = attacker.id;
  ai.combatScanCd = 0;
  ai.goal = goal;
  if (!switched) return;
  ai.path = [];
  ai.pi = 0;
  ai.timer = 0;
}

function applyFightHint(victim: Entity, attacker: Entity): void {
  applyThreatHint(victim, attacker, AIGoal.HUNT);
}

function applyFleeHint(victim: Entity, attacker: Entity): void {
  applyThreatHint(victim, attacker, AIGoal.FLEE);
}

function applyVictimReaction(victim: Entity, attacker: Entity, reaction: CombatThreatReaction): void {
  if (!victim.ai || reaction === 'startled') return;
  if (reaction === 'flee') applyFleeHint(victim, attacker);
  else applyFightHint(victim, attacker);
}

/**
 * Удар между людьми.
 *
 * Игрок здесь — просто ещё один атакующий: его рука меняет только ИМЯ типа
 * (`player_hurt_npc` против `npc_hurt_npc`) и больше ничего. Ровно так устроен
 * слой убийств, где давно живут обе стороны — `player_kill_npc` и
 * `npc_kill_npc`. Отдельной ветки «а если это игрок» в теле нет и заводить её
 * обратно нельзя: до 2026-08-27 события «NPC ранил NPC» не существовало вовсе, и
 * это была последняя ветка класса «игрок особенный» в событийном слое.
 *
 * Двумя типами, а не одним общим, — потому что читатели `player_hurt_npc`
 * спрашивают именно про руку игрока и никак иначе: коммунальная память комнаты
 * опознаёт его по `type.startsWith('player_')`, а хоровая подать и пси-схрон
 * ветвят сюжет на «игрок напал на культиста». Один общий тип соврал бы всем
 * троим, и каждый пришлось бы учить новому вопросу.
 *
 * ТРОТТЛ — по образцу `alertWitnesses`: событие про то, что СХВАТКА НАЧАЛАСЬ, а
 * не про то, что прилетела пуля. Боевая память жертвы живёт `COMBAT_THREAT_TTL`
 * и продлевается каждым попаданием, поэтому пока пара дерётся, второго события
 * не будет: очередь ППШ в четырнадцать выстрелов стоит одного. Замер живого
 * этажа без игрока: 1200–3500 попаданий NPC↔NPC в минуту, и события на каждое
 * хватило бы, чтобы одним боем вымыть и кольцо `recentEvents`, и окно ленты
 * Демоса (64 события на такт в 30 секунд).
 *
 * Память сверяется ПО ПАРЕ, а не «жертва вообще с кем-то дерётся»: иначе
 * вступление третьего в идущую драку молчит, и хоровая подать не узнала бы про
 * игрока, ударившего уже занятого боем сборщика.
 */
function publishActorHurtEvent(
  world: World,
  state: GameState | undefined,
  attacker: Entity,
  victim: Entity,
  damage: number,
  source: CombatStimulusSource,
  time: number,
  engagedWithAttacker: boolean,
): void {
  if (!state || engagedWithAttacker) return;
  // Тварь бьёт молча: своего типа у неё нет, а `npc_hurt_npc` про неё соврал бы.
  // На слое убийств у монстра ровно та же доля — там он попадает в `death_seen`.
  if (attacker.type !== EntityType.NPC) return;
  if (victim.type !== EntityType.NPC || isPlayerEntity(victim)) return;
  const type = isPlayerEntity(attacker) ? 'player_hurt_npc' : 'npc_hurt_npc';
  if (!eventAllowed(`${type}:${attacker.id}:${victim.id}`, time, HURT_EVENT_COOLDOWN)) return;
  const loc = eventLocation(world, victim);
  publishEvent(state, {
    type,
    ...loc,
    x: victim.x,
    y: victim.y,
    actorId: attacker.id,
    actorName: displayName(attacker),
    actorFaction: attacker.faction,
    targetId: victim.id,
    targetName: displayName(victim),
    targetFaction: victim.faction,
    severity: cleanSeverity(damage >= 18 ? 4 : 3),
    privacy: 'local',
    tags: ['combat', 'damage', 'npc', source],
    data: { damage: Math.round(damage * 10) / 10, source },
  });
}

function publishActorKillEvent(world: World, state: GameState | undefined, killer: Entity, target: Entity, source: CombatStimulusSource): void {
  // Смерть игрока эта дверь не объявляет: у неё своя дорога (щит, продолжение за
  // другое тело), и флаг `alive` там не поднимают — событие ушло бы про живого.
  if (!state || killedEventTargets.has(target) || isPlayerEntity(killer) || isPlayerEntity(target)) return;
  if (target.type !== EntityType.NPC && target.type !== EntityType.MONSTER) return;
  killedEventTargets.add(target);
  const loc = eventLocation(world, target);
  if (killer.type === EntityType.NPC) {
    publishEvent(state, {
      type: target.type === EntityType.MONSTER ? 'npc_kill_monster' : 'npc_kill_npc',
      ...loc,
      x: target.x,
      y: target.y,
      actorId: killer.id,
      actorName: displayName(killer),
      actorFaction: killer.faction,
      targetId: target.id,
      targetName: displayName(target),
      targetFaction: target.faction,
      monsterKind: target.monsterKind,
      severity: cleanSeverity(target.type === EntityType.NPC ? 4 : 3),
      privacy: 'local',
      tags: target.type === EntityType.MONSTER ? ['combat', 'kill', 'monster'] : ['combat', 'kill', 'npc'],
      // Личности сторон: круг близких убитого отвечает убийце, кем бы он ни был.
      data: { source, actorAlifeId: killer.alifeId, targetAlifeId: target.alifeId },
    });
    return;
  }
  if (killer.type === EntityType.MONSTER && target.type === EntityType.NPC) {
    publishEvent(state, {
      type: 'death_seen',
      ...loc,
      x: target.x,
      y: target.y,
      actorId: killer.id,
      actorName: displayName(killer),
      actorFaction: killer.faction,
      targetId: target.id,
      targetName: displayName(target),
      targetFaction: target.faction,
      monsterKind: killer.monsterKind,
      severity: 4,
      privacy: 'local',
      tags: ['combat', 'kill', 'npc', 'monster'],
      data: { source },
    });
  }
}

export function notifyActorDamaged(
  world: World,
  victim: Entity,
  attacker: Entity | undefined,
  damage: number,
  source: CombatStimulusSource,
  time: number,
  state?: GameState,
): void {
  if (!victim.alive || damage <= 0) return;
  if (!attacker || attacker.id === victim.id || !attacker.alive) return;
  if (victim.type === EntityType.MONSTER && attacker.type === EntityType.MONSTER) return;

  const prev = threatMemory.get(victim);
  const alreadyEngaged = prev !== undefined && prev.expiresAt > time;
  // Та же боевая память, но спрошенная про ПАРУ: «эта драка уже идёт» для зова
  // свидетелей и «этот бьёт этого уже не впервые» для ленты — разные вопросы.
  const engagedWithAttacker = alreadyEngaged && prev!.attackerId === attacker.id;
  const reaction = threatReaction(victim, attacker, source, damage);
  setThreatMemory(victim, attacker, damage, source, time, reaction);
  applyVictimReaction(victim, attacker, reaction);
  const killed = (victim.hp ?? 1) <= 0;
  /* Соседи оборачиваются на ПЕРВЫЙ удар схватки, а не на каждый. Живая боевая
   * память и есть признак «эта драка уже идёт»: пока она не истекла, второй зов
   * не нужен, и запрос по радиусу не повторяется на каждое попадание. Очередь
   * автомата поэтому не стоит стрелку восьми репутаций за секунду.
   *
   * Смерть — исключение, и единственное: она случается один раз на жизнь, стоит
   * отдельной, более крупной дельты и обязана быть увиденной даже посреди уже
   * идущей схватки. Второй запрос по радиусу за драку, а не за попадание. */
  if (!alreadyEngaged || killed) alertWitnesses(world, victim, attacker, damage, time, killed, state);
  publishActorHurtEvent(world, state, attacker, victim, damage, source, time, engagedWithAttacker);
  if (killed) publishActorKillEvent(world, state, attacker, victim, source);
}

/**
 * Свои ли эти двое настолько, чтобы вступиться.
 *
 * У человека «свой» — это фракция. У игрока фракции в этом смысле нет: она
 * синтетическая и не имеет других членов, поэтому множество «своих» для него
 * пусто по построению, и за него не вступался никто. Его сторону читает тот же
 * личный канал, который у каждого NPC к игроку и так есть: друг тот, чьё личное
 * отношение дошло до общего порога дружбы. Своей ручки под это не заведено —
 * порог один на всю игру, а число рождается с гауссовым разбросом, поэтому за
 * игрока встают не «все жители», а их доля.
 */
function standsUpFor(mate: Entity, victim: Entity): boolean {
  if (isPlayerEntity(victim)) return getNpcPlayerRelation(mate) >= RELATION_FRIENDLY_THRESHOLD;
  return mate.faction !== undefined && mate.faction === victim.faction;
}

/**
 * Кто рядом видел удар — и что он с этим делает.
 *
 * Два следствия у одного факта, поэтому и запрос по радиусу один: свой
 * вступается за пострадавшего, а всякий, кто видел руку игрока, помнит её.
 *
 * Подъём своих. Без него драка оставалась личным делом двоих: рядом стоящий
 * взвод смотрел, как бьют товарища, потому что по матрице фракций обидчик ему
 * друг. Отзыв идёт через боевую память и подсказку цели разом: одна память
 * заставила бы товарища ждать своего такта AI, а вступаться надо в тот же кадр;
 * без памяти же `findCombatTarget` сверит цель с матрицей фракций, вражды не
 * найдёт и сбросит её на следующем кадре.
 *
 * Свидетели. Репутация перестаёт быть глобальной цифрой: удар помнят те, кто
 * стоял рядом, — включая тех, кто вступаться не стал. Считается и тогда, когда
 * жертва убегает: видеть — не значит драться. Платят за ЛЮБОГО обидчика со
 * стороной, а не только за руку игрока: закон «игрок — просто NPC» не терпит
 * канала, которого нет у остальных. Экология выпадает сама — у монстра без
 * флага `sided` стороны нет, и крыса не портит никому репутацию. Совпадение
 * нашивок обидчика и жертвы тоже никого не освобождает: свой, избивающий
 * своего, платит личным ребром — см. `applyWitnessedViolencePenalty`.
 *
 * Ограничено вчетверо: радиус, линия взгляда, потолок и одна тревога на схватку
 * (плюс одна на смерть).
 */
function alertWitnesses(
  world: World,
  victim: Entity,
  attacker: Entity,
  damage: number,
  time: number,
  killed: boolean,
  state?: GameState,
): void {
  if (victim.type !== EntityType.NPC) return;
  // Объявленный поединок — дело двоих. Ни свои жертвы, ни свои обидчика в него
  // не вступаются, иначе разборка тут же превращается в свалку.
  if (isDuelLocked(victim) || isDuelLocked(attacker)) return;
  /* Вступаются и за УБЕГАЮЩЕГО. Раньше подъём своих был заведён на реакцию
   * жертвы (`reaction === 'fight'`), а безоружный житель по расчёту сил всегда
   * получает `flee`, — то есть за обычного человека не вставал никто и никогда,
   * даже когда рядом стоял вооружённый сосед. Кто вступится, по-прежнему решают
   * `standsUpFor` и личная неприязнь; решает не то, дал ли жертва сдачи. */
  const attackerSide = combatSideOf(attacker);
  // Экология выпадает сама: у монстра без флага `sided` стороны нет, и крыса
  // никому репутацию не портит.
  const witnessed = attackerSide !== undefined;
  if (!witnessed) return;
  getEntityIndex().queryRadiusCapped(
    victim.x, victim.y, ASSIST_SIGHT_RADIUS, assistScratch, ENTITY_MASK_NPC, ASSIST_ALERT_CAP,
  );
  for (const mate of assistScratch) {
    if (mate.id === victim.id || mate.id === attacker.id) continue;
    if (!mate.alive || isPlayerEntity(mate)) continue;
    /* Свидетель — тот, кто ВИДЕЛ. Прежняя проверка «та же комната» была неверна
     * в обе стороны разом: `stampRoom` пишет в дверные клетки −1, а
     * `carveCorridor` не пишет `roomMap` вовсе, поэтому −1 — это не «нет
     * комнаты», а ОДНА псевдокомната на весь этаж. Свидетеля в дверном проёме
     * она молча пропускала, а двоих в разных коридорах по разные стороны
     * бетонной стены считала свидетелями друг друга.
     *
     * Луч читает живые `cells`/`doors`, поэтому пробитая стена учитывается тем
     * же кадром и инвалидировать нечего. Цена — обход клеток отрезка, и она
     * платится дважды за схватку, а не на каждое попадание (см. вызов). */
    if (!hasLineOfSight(world, mate.x, mate.y, victim.x, victim.y, ASSIST_SIGHT_RADIUS)) continue;
    applyWitnessedViolencePenalty(state, mate, attacker, victim, damage, killed);
    if (!mate.ai || !standsUpFor(mate, victim)) continue;
    // Личная неприязнь — отказ помочь: сосед, ненавидящий пострадавшего, не
    // вступается за него. Это первое, чем вражда платит вместо трупа.
    if (isPersonalFeudEnemy(mate, victim)) continue;
    setThreatMemory(mate, attacker, 1, 'npc_melee', time, 'fight');
    applyFightHint(mate, attacker);
  }
}

/**
 * Забыть, кто ударил.
 *
 * Снятия `ai.combatTargetId` мало: цель берётся ещё и из боевой памяти
 * (`forcedTarget` в `ai/combat.ts`), и та переживает сброс цели. Поводок сцены
 * оттого не держал — командир возвращался в драку тем же кадром, формально
 * «на поводке», и уходил втрое дальше собственного поводка.
 */
export function clearCombatThreat(entity: Entity): void {
  threatMemory.delete(entity);
}

/**
 * Force a fight reaction (arena duels, authored scenes): the victim attacks the
 * aggressor through the normal forcedTarget AI path regardless of factions.
 * Callers re-apply on a cadence to keep the memory from expiring mid-fight.
 */
export function forceCombatThreat(victim: Entity, attacker: Entity, time: number): void {
  if (!victim.alive || !attacker.alive || victim.id === attacker.id) return;
  setThreatMemory(victim, attacker, 1, 'npc_melee', time, 'fight');
}

/** Объявить (или снять) поединок один на один: свои в него не вмешиваются. */
export function setDuelLock(e: Entity, locked: boolean): void {
  if (locked) duelLocked.add(e);
  else duelLocked.delete(e);
}

export function isDuelLocked(e: Entity): boolean {
  return duelLocked.has(e);
}

export function getRecentCombatThreat(victim: Entity, time: number): CombatThreat | undefined {
  const memory = threatMemory.get(victim);
  if (!memory || memory.expiresAt <= time) return undefined;
  const attacker = getEntityIndex().byId.get(memory.attackerId);
  if (!attacker?.alive) return undefined;
  if (victim.type === EntityType.MONSTER && attacker.type === EntityType.MONSTER) return undefined;
  return {
    attacker,
    attackerId: memory.attackerId,
    lastKnownX: memory.lastKnownX,
    lastKnownY: memory.lastKnownY,
    damagePressure: memory.damagePressure,
    reaction: memory.reaction,
    source: memory.source,
    expiresAt: memory.expiresAt,
  };
}

export function isRecentCombatThreat(victim: Entity, attacker: Entity, time: number): boolean {
  if (victim.type === EntityType.MONSTER && attacker.type === EntityType.MONSTER) return false;
  const memory = threatMemory.get(victim);
  return memory !== undefined &&
    memory.attackerId === attacker.id &&
    memory.expiresAt > time &&
    memory.reaction !== 'startled';
}

export function resetCombatStimulus(): void {
  threatMemory = new WeakMap<Entity, CombatThreatMemory>();
  killedEventTargets = new WeakSet<Entity>();
  duelLocked = new WeakSet<Entity>();
  profileCores = new WeakMap<Entity, CombatProfileCore>();
  recentEventTimes.clear();
}


/* ── Единая дверь урона ──────────────────────────────────────────
 *
 * Всё, что снимает здоровье у актора, проходит здесь. До этой двери каждый
 * бьющий делал работу сам: считал тип, вычитал здоровье, толкал, сообщал жертве
 * и начислял штраф отношениям — пять шагов, которые надо было помнить. Помнили
 * не все: `notifyActorDamaged` знали три файла из всех, снимавших здоровье, и
 * оттого весь пси-арсенал игрока бил без автора, а гнилушка и слизевик — в
 * тишине. Жертва просто не узнавала, кто её ударил, и ответить не могла.
 *
 * Молчание было ПОВЕДЕНИЕМ ПО УМОЛЧАНИЮ, потому что единственный общий помощник
 * `applyDamage` только считал число. Теперь по умолчанию — полный ход.
 */

/* Обработчик смерти живёт в ядре двери; отсюда он виден как раньше, чтобы точка
 * сборки и тесты не знали о разделении. Средовой вход отсюда НЕ реэкспортируется
 * намеренно: импорт «из двери» вернул бы среде ребро на фракционный узел, ради
 * снятия которого ядро и выделено. Зовите `systems/actor_damage`. */
export { setActorDeathHandler } from './actor_damage';
export type { ActorDeathHandler } from './actor_damage';

export interface ActorDamageInput {
  damage: number;
  /** Чем ударили. Определяет реакцию жертвы, см. `combat_stimulus`. */
  source: CombatStimulusSource;
  /**
   * Кто ударил. ОТСУТСТВИЕ АВТОРА — полноправный случай, а не недосмотр: голод,
   * обвал, газ, поезд и самосбор бьют без виновника, и винить там некого.
   */
  attacker?: Entity;
  weaponId?: string;
  damageType?: DamageType;
  projectileType?: ProjType;
  aoe?: boolean;
  /** Толчок от удара. Выключается там, где толкать нечем — среда, голод. */
  knockback?: boolean;
  /**
   * Откуда толкает удар, если толкает не сама рука: точка попадания снаряда,
   * эпицентр взрыва. По умолчанию — позиция атакующего. Задаётся отдельно,
   * потому что у снаряда автор и источник импульса — разные точки, а у взрыва
   * автора может не быть вовсе.
   */
  knockbackFromX?: number;
  knockbackFromY?: number;
  /**
   * Часы боя. Без них дверь берёт `state.time`, а без состояния — ноль; кадр AI
   * своё время знает точнее и обязан его передавать.
   */
  time?: number;
  /** Уровень кровищи при смерти и вектор разлёта. */
  gore?: number;
  splashX?: number;
  splashY?: number;

  /* ── ОСТАТОК ШЛЮЗОВ СВЕДЕНИЯ ──────────────────────────────────────
   *
   * Шесть путей урона пришли к этой двери каждый со своим законом, и поля ниже
   * были слепком этих расхождений. Три сняты целиком вместе с вызовами:
   * `relationPenalty`, `relationAttacker`, `factionClash`. Платит тот, кто
   * ударил, по своей стороне (`combatSideOf`), и спорить с этим на входе больше
   * нечем.
   *
   * Осталось четыре, и все четыре — настоящие расхождения путей, а не выбор
   * закона. Правило прежнее: любое поле отсюда, которое перестанет что-то
   * значить, — незакрытая работа.
   */

  /**
   * Сколько снять на самом деле, если конвейер типа и брони посчитал сам
   * вызывающий.
   *
   * Остался ровно один повод: точка сборки зовёт `applyDamage` ДО двери, потому
   * что число нужно ей самой — кровь, сообщение об уроне, отладочное бессмертие.
   * Второй раз конвейер гонять нельзя, он с побочными действиями: срывает
   * бронеплиты и печатает реплики.
   *
   * БОЕВОЙ AI ЭТО ПОЛЕ БОЛЬШЕ НЕ ЗАПОЛНЯЕТ (с 2026-08-27). Он заполнял: ближний
   * бой NPC и ближний бой с рывком монстра приходили с готовым числом и
   * `applyMonsterArmorHit` минули целиком — бронированная тварь держала удар
   * только от игрока. Замер живых этажей без игрока (60 с, по два сида): из
   * 38 256 таких ударов 606 пришлись по бронированной твари, из них 74 — по
   * Червие с живой сетью, то есть 100 урона вместо 56; авторский «Червие
   * НЕТ-ветки» на Кремниевом колодце погибал в обоих сидах. Панельник и Лоточник
   * не пострадали ни разу: их множитель путь NPC применял отдельным вызовом
   * `applyMonsterIncomingDamage`, замер дал ровно 1.00. Монстр по бронированной
   * твари не попал НИ РАЗУ (0 из 38 256) — его ветку сняли за компанию, чтобы у
   * двери не осталось второго закона. После: твари 35.74% → 35.63%, люди 37.65%
   * → 38.41%, реплик в логе не прибавилось. Таблица —
   * `tests/damage-door-unification.test.ts`, вторая половина.
   */
  applied?: number;
  /**
   * Какое число узнают жертва и отношения. По умолчанию — `damage`. Точка сборки
   * рассказывает урон ПОСЛЕ брони, боевой AI — ДО резиста типа; разница в числе,
   * которое идёт в штраф отношений.
   */
  reportedDamage?: number;
  /**
   * Сообщать ли жертве, кто её ударил. Выключено ровно в одном месте: удар
   * ко-оп-пира по игроку. У игрока свой канал (`recordPlayerDamage`), и боевой
   * памяти ему сегодня не ставят.
   */
  notifyVictim?: boolean;
  /**
   * Смерть обрабатывает вызывающий. У каждого пути своя обработка — лут,
   * приписка опыта пиру, свои сообщения и кровь, — и свести их в общий
   * `actorDeathHandler` без смены поведения нельзя.
   */
  deathByCaller?: boolean;
}

export interface ActorDamageResult {
  /** Сколько сняли после резиста типа и брони. */
  applied: number;
  killed: boolean;
  armor: MonsterArmorHitResult;
}

/**
 * Нанести урон актору. Один ход на все семь шагов.
 *
 * Ядро удара — счёт брони, снятие здоровья, толчок и смерть — лежит в
 * `actor_damage.ts` и одинаково для всех. Здесь к нему добавляется социальная
 * половина: кто заплатит за насилие и кто узнает, что его ударили. Она нужна
 * ровно тогда, когда у удара есть АВТОР, поэтому среда зовёт ядро напрямую
 * (`damageActorByEnvironment`) — и это не обход двери, а тот же ход с пустой
 * рукой. Кто считает броню сам и почему — см. `ActorDamageInput.applied`.
 */
export function damageActor(
  world: World,
  state: GameState | undefined,
  target: Entity,
  input: ActorDamageInput,
): ActorDamageResult {
  const { armor, blocked } = runActorDamageCore(world, state, target, input);
  if (blocked) return { applied: 0, killed: false, armor };

  const attacker = input.attacker;
  const reported = input.reportedDamage ?? input.damage;
  /* Отношения — ПЕРЕД сообщением жертве. Так это делали четыре пути из шести до
   * сведения, и порядок между ними ни на что не влияет: удар внутри одной
   * стороны штрафа не даёт вовсе, а между сторонами жертва считает обидчика
   * врагом и без всякого штрафа (`isCombatRelevantThreat`). Обратного чтения
   * нет: зов свидетелей трогает соседей, а не жертву.
   *
   * Условие ровно одно и оно про АВТОРА: есть рука — есть счёт. Пар, обвал и
   * голод бьют без виновника, и винить там некого. */
  if (attacker) applyCombatRelationOutcome(world, state, attacker, target, reported);
  // Жертва узнаёт, кто её ударил. Без автора вызов сам обращается в ничто.
  if (input.notifyVictim !== false) {
    notifyActorDamaged(world, target, attacker, reported, input.source, input.time ?? state?.time ?? 0, state);
  }

  if ((target.hp ?? 0) > 0) return { applied: armor.damage, killed: false, armor };
  // ВРЕМЕННО: пути со своей обработкой смерти (см. `deathByCaller`).
  if (input.deathByCaller === true) return { applied: armor.damage, killed: true, armor };
  finishActorDeath(target, attacker, input);
  return { applied: armor.damage, killed: true, armor };
}

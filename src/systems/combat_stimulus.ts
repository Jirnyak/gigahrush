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
import { RELATION_FRIENDLY_THRESHOLD, getNpcPlayerRelation } from './npc_relations';
import { applyDamage, applyHitStaggerAndKnockback, calculateDamage } from './combat';
import { applyCombatRelationOutcome } from './factions';
import { isDebugOnePunchManEnabled, keepDebugOnePunchManAlive } from './debug_cheats';
import type { MonsterArmorHitResult } from './monster_armor';
import type { DamageType, ProjType } from '../core/types';
import { killEntity } from './entity_death';

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
 * Докуда доносится драка. «В зоне видимости» здесь читается по-мировому: свои
 * отзываются, если стоят в ТОЙ ЖЕ КОМНАТЕ и в пределах этого радиуса. Комната —
 * основа мира, и потасовка в кабинете не обязана поднимать коридор.
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

export function npcCombatProfile(npc: Entity): NpcCombatProfile {
  const ws = WEAPON_STATS[npc.weapon ?? ''] ?? WEAPON_STATS[''];
  const brave = (npc.psiMadness ?? 0) > 0 ||
    npc.isTraveler ||
    occupationHasAnyProfileTag(npc.occupation, ['combat', 'patrol']) ||
    npc.faction === Faction.LIQUIDATOR ||
    npc.faction === Faction.CULTIST ||
    npc.faction === Faction.WILD;
  const ranged = ws.isRanged === true;
  const armed = ws.dmg > 3 || ranged;
  const hp = Math.max(0, npc.hp ?? 20);
  const maxHp = Math.max(1, npc.maxHp ?? (hp || 20));
  const weaponScore = ranged ? ws.dmg * (ws.pellets ?? 1) * 1.6 : ws.dmg;
  const levelScore = Math.max(1, npc.rpg?.level ?? 1) * 3;
  return {
    brave,
    armed,
    ranged,
    hpRatio: hp / maxHp,
    threatScore: hp * 0.22 + weaponScore + levelScore,
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
  if (!alreadyEngaged || killed) alertWitnesses(world, victim, attacker, damage, time, reaction, killed, state);
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
 * флага `sided` стороны нет, и крыса не портит никому репутацию.
 *
 * Ограничено втройне: радиус, потолок и одна тревога на схватку (плюс одна на
 * смерть).
 */
function alertWitnesses(
  world: World,
  victim: Entity,
  attacker: Entity,
  damage: number,
  time: number,
  reaction: CombatThreatReaction,
  killed: boolean,
  state?: GameState,
): void {
  if (victim.type !== EntityType.NPC) return;
  // Объявленный поединок — дело двоих. Ни свои жертвы, ни свои обидчика в него
  // не вступаются, иначе разборка тут же превращается в свалку.
  if (isDuelLocked(victim) || isDuelLocked(attacker)) return;
  const rally = reaction === 'fight';
  const attackerSide = combatSideOf(attacker);
  // Внутри одной стороны свидетелю платить не за что: там вражда идёт личным
  // ребром графа Демоса, а не мнением о фракции.
  const witnessed = attackerSide !== undefined && attackerSide !== combatSideOf(victim);
  if (!rally && !witnessed) return;
  const room = world.roomMap[world.idx(Math.floor(victim.x), Math.floor(victim.y))];
  getEntityIndex().queryRadiusCapped(
    victim.x, victim.y, ASSIST_SIGHT_RADIUS, assistScratch, ENTITY_MASK_NPC, ASSIST_ALERT_CAP,
  );
  for (const mate of assistScratch) {
    if (mate.id === victim.id || mate.id === attacker.id) continue;
    if (!mate.alive || isPlayerEntity(mate)) continue;
    if (world.roomMap[world.idx(Math.floor(mate.x), Math.floor(mate.y))] !== room) continue;
    if (witnessed) applyWitnessedViolencePenalty(state, mate, attackerSide!, damage, killed);
    if (!rally || !mate.ai || !standsUpFor(mate, victim)) continue;
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

/** Кто обрабатывает смерть. Приходит инъекцией из точки сборки: сама обработка
 *  (лут, опыт, кровь, квесты, A-Life) принадлежит `main.ts`, а знать о ней
 *  систему заставлять нельзя — это ребро systems → main. */
export type ActorDeathHandler = (victim: Entity, killer: Entity | undefined, gore: number, vx: number, vy: number) => void;

let actorDeathHandler: ActorDeathHandler | undefined;
export function setActorDeathHandler(handler: ActorDeathHandler | undefined): void {
  actorDeathHandler = handler;
}

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
 * Броневой конвейер дверь гонит ВСЕМ, кто не посчитал его сам: живучесть
 * существа не зависит от того, чья рука бьёт. Кто считает сам и почему — см.
 * `ActorDamageInput.applied`; там же замер, которым снято последнее исключение.
 */
export function damageActor(
  world: World,
  state: GameState | undefined,
  target: Entity,
  input: ActorDamageInput,
): ActorDamageResult {
  /* Состояние может отсутствовать: часть спецударов монстров зовётся оттуда, где
   * `GameState` не протянут. Тогда броневой конвейер пропускается — ему нужен мир
   * целиком, — но тип урона, память жертвы и смерть работают как всегда. Молча
   * ронять урон нельзя ни в одном случае. */
  const armor = input.applied !== undefined
    ? { damage: input.applied, armorActive: false, armorStacks: 0, stripped: false, hitKind: 'weak' as const }
    : state
      ? applyDamage(world, state, target, input)
      : { damage: Math.round(calculateDamage(input.damage, input.damageType, target)), armorActive: false, armorStacks: 0, stripped: false, hitKind: 'weak' as const };
  const empty: ActorDamageResult = { applied: 0, killed: false, armor };
  if (!target.alive || target.hp === undefined || input.damage <= 0) return empty;

  // Бессмертие отладочного режима — одно место на всю игру, а не по копии у
  // каждого бьющего.
  if (isPlayerEntity(target) && isDebugOnePunchManEnabled()) {
    keepDebugOnePunchManAlive(target);
    return empty;
  }

  target.hp -= armor.damage;
  const attacker = input.attacker;
  const knockbackX = input.knockbackFromX ?? attacker?.x;
  const knockbackY = input.knockbackFromY ?? attacker?.y;
  if (input.knockback !== false && knockbackX !== undefined && knockbackY !== undefined) {
    applyHitStaggerAndKnockback(world, target, knockbackX, knockbackY, armor.damage);
  }
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

  if (target.hp > 0) return { applied: armor.damage, killed: false, armor };
  // ВРЕМЕННО: пути со своей обработкой смерти (см. `deathByCaller`).
  if (input.deathByCaller === true) return { applied: armor.damage, killed: true, armor };
  /* Смерть игрока дверь НЕ объявляет: у неё своя дорога — щит, продолжение за
   * другое тело, камера смерти, — и флаг `alive` там не поднимают вовсе.
   * Обработчик всё равно зовётся: он первым делом пробует поглотить удар щитом. */
  if (!isPlayerEntity(target)) killEntity(target);
  actorDeathHandler?.(target, attacker, input.gore ?? 1, input.splashX ?? 0, input.splashY ?? 0);
  return { applied: armor.damage, killed: true, armor };
}

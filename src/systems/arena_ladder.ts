/* ── Лестница арены: бойцы, чемпионство, претенденты ──────────────
 *
 * Образец — арена Обливиона. Боец арены это ЛИЧНОСТЬ A-Life с флагом, а не
 * спавн: лестница строится по силе от слабейшего до действующего чемпиона,
 * игрок дерётся сам, а убив чемпиона — сам занимает песок и дальше титул
 * ДЕРЖИТ: претенденты приходят вызывать его так же, как приходил он.
 *
 * Ростер не бесконечен и не досоздаётся: новых людей не рождается никогда.
 * Редким тактом холодной симуляции кто-то из уже живущих ВО ВСЁМ МИРЕ решается
 * выйти на песок — так закон «никакого добора фонового населения» остаётся
 * цел, а лестница не кончается навсегда после того, как игрок вырезал ростер.
 *
 * Модуль владеет поединками с участием ИГРОКА (вызов ступени, оборона титула,
 * бои с мутантами). Ставочные бои двух NPC живут в `arena.ts` и сюда не лезут:
 * это разные режимы, и общее у них только кольцо, за которым оба и ходят сюда.
 */

import {
  AIGoal, Cell, EntityType, Faction, MonsterKind,
  msg, type Entity, type GameState, type Room,
} from '../core/types';
import type { World } from '../core/world';
import { irand, rng } from '../core/rand';
import { MONSTERS } from '../entities/monster';
import { monsterSpr } from '../entities/sprite_index';
import {
  ALIFE_ARENA_CHAMPION_PLAYER,
  forEachAlifeNpcRecordSlice,
  getAlifeArenaChampion,
  listAlifeArenaFighters,
  materializeAlifeArrival,
  selectAlifeArenaLadderIds,
  setAlifeArenaChampion,
  setAlifeArenaFighter,
  type AlifeArenaFighter,
} from './alife';
import { grantArenaChampionRewards } from './arena_rewards';
import { forceCombatThreat, setDuelLock } from './combat_stimulus';
import { entitySpawnSlots } from './entity_limits';
import { publishEvent } from './events';
import { transferMoney } from './inventory';

/** Ступеней на песке. Восемь — столько лестница показывает в меню одним экраном
 *  и столько личностей уезжает в сейв «тронутыми» ради флага. */
const ARENA_LADDER_SIZE = 8;

/* Холодная симуляция флага. Такт редкий, срез ограничен, вероятность мала:
 * при 64 личностях за 30 секунд это порядка одного решившегося за час игры. */
const ARENA_COLD_TICK_S = 30;
const ARENA_COLD_SLICE = 64;
const ARENA_COLD_CHANCE = 0.0002;

/** Шанс, что на таком же такте к чемпиону-игроку придёт претендент. */
const ARENA_CHALLENGER_CHANCE = 0.25;

/** Плата за очищенную волну мутантов: ставка растёт с номером волны. */
const ARENA_MUTANT_WAVE_PRIZE = 100;

const ARENA_MUTANT_KINDS: readonly MonsterKind[] = [
  MonsterKind.POLZUN, MonsterKind.ZOMBIE, MonsterKind.SBORKA, MonsterKind.TVAR,
];

/** Поединок с участием игрока. Живёт ровно один: песок один. */
interface ArenaPlayerBout {
  kind: 'ladder' | 'defense' | 'mutants';
  /* Противники ссылками, а не номерами: индекс сущностей пересобирается РАЗ в
   * кадр и до этого такта, поэтому только что выведенного на песок бойца в нём
   * ещё нет. По номерам поединок объявлял победу в тот же кадр, в который
   * начался, — противник «не найден» читалось как «мёртв». Ссылки живут ровно
   * столько, сколько бой: уход с песка и смена этажа его закрывают. */
  foes: Entity[];
  opponentAlifeId: number;
  opponentName: string;
  /** Был ли противник чемпионом на момент выхода: титул решается по этому. */
  forTitle: boolean;
  wave: number;
  threatAccum: number;
}

const ladderRuntime: {
  seeded: boolean;
  coldAccum: number;
  coldCursor: number;
  pendingChallengeAlifeId: number;
  pendingMutants: boolean;
  bout: ArenaPlayerBout | null;
} = {
  seeded: false,
  coldAccum: 0,
  coldCursor: 0,
  pendingChallengeAlifeId: 0,
  pendingMutants: false,
  bout: null,
};

export function resetArenaLadderRuntime(): void {
  ladderRuntime.seeded = false;
  ladderRuntime.coldAccum = 0;
  ladderRuntime.coldCursor = 0;
  ladderRuntime.pendingChallengeAlifeId = 0;
  ladderRuntime.pendingMutants = false;
  ladderRuntime.bout = null;
}

/** Комната песка на текущем этаже. Ищется по тегу, а не по координатам: этаж
 *  генерируется заново каждый забег. */
export function findArenaRoom(world: World): Room | undefined {
  return world.rooms.find(room => room?.tags?.includes('arena'));
}

function isInsideArena(world: World, room: Room | undefined, e: Entity): boolean {
  if (!room) return false;
  return world.roomMap[world.idx(Math.floor(e.x), Math.floor(e.y))] === room.id;
}

/* ── Ростер ───────────────────────────────────────────────────── */

/**
 * Первый ростер: сильнейшие живые мира. Зовётся один раз за забег и ничего не
 * делает, если бойцы уже есть — например, приехали из сейва.
 *
 * ЗАМЕРЕНО 2026-08-24, не повторять: набор из гарнизона базы даёт ПЛОСКУЮ
 * лестницу. На трёх сидах восемь ступеней выходили ур.1/hp100 почти целиком
 * (1,1,1,1,1,1,2,3 · 1,1,1,2,2,3,4,5 · семь единиц и пятёрка), потому что
 * гарнизон — обычное население первого уровня, а «сила» решалась тай-брейком
 * по номеру. Разброс живёт на глубине, поэтому и берётся со всего мира; на
 * песок приезжают через `bringFighterToRing`, который перевозит запись сам.
 */
function seedArenaRoster(state: GameState): void {
  if (ladderRuntime.seeded) return;
  ladderRuntime.seeded = true;
  const existing = listAlifeArenaFighters(state);
  if (existing.length > 0) return;
  for (const id of selectAlifeArenaLadderIds(state, ARENA_LADDER_SIZE)) {
    setAlifeArenaFighter(state, id, true);
  }
  const roster = listAlifeArenaFighters(state);
  const champion = roster[roster.length - 1];
  if (champion && getAlifeArenaChampion(state) === undefined) {
    setAlifeArenaChampion(state, champion.id);
  }
}

/**
 * Холодный переход флага. Ограничен тактом, срезом и потолком ростера: перебора
 * всей популяции в кадре здесь нет и быть не может.
 */
function coldFlagTransfer(state: GameState): void {
  const roster = listAlifeArenaFighters(state);
  if (roster.length >= ARENA_LADDER_SIZE) return;
  let picked = 0;
  const slice = forEachAlifeNpcRecordSlice(state, ladderRuntime.coldCursor, ARENA_COLD_SLICE, record => {
    if (picked > 0 || record.dead || record.arenaFighter) return;
    if (rng() >= ARENA_COLD_CHANCE) return;
    picked = record.id;
  });
  ladderRuntime.coldCursor = slice.nextCursor;
  if (picked <= 0 || !setAlifeArenaFighter(state, picked, true)) return;
  publishEvent(state, {
    type: 'arena_fighter_joined',
    tags: ['arena', 'ladder'],
    severity: 1,
    privacy: 'public',
    data: { alifeId: picked },
  });
}

/* ── Взгляд на лестницу для меню ─────────────────────────────── */

export interface ArenaLadderView {
  fighters: readonly AlifeArenaFighter[];
  championName: string;
  playerIsChampion: boolean;
  /** Следующая ступень для игрока: слабейший из тех, кого он ещё не побил. */
  next?: AlifeArenaFighter;
  nextRung: number;
}

export function getArenaLadderView(state: GameState): ArenaLadderView {
  seedArenaRoster(state);
  const fighters = listAlifeArenaFighters(state);
  const champion = getAlifeArenaChampion(state);
  const playerIsChampion = champion === ALIFE_ARENA_CHAMPION_PLAYER;
  const championEntry = fighters.find(f => f.id === champion);
  const next = playerIsChampion ? undefined : fighters[0];
  return {
    fighters,
    championName: playerIsChampion ? 'вы' : championEntry?.name ?? 'никто',
    playerIsChampion,
    next,
    nextRung: next ? 1 : 0,
  };
}

/* ── Заявки из меню ──────────────────────────────────────────── */

/* Меню арены открыто на паузе и не имеет ни мира, ни счётчика сущностей:
 * оно объявляет НАМЕРЕНИЕ, а поединок собирает такт с полным контекстом. */
export function requestArenaChallenge(alifeId: number): void {
  ladderRuntime.pendingChallengeAlifeId = alifeId;
}

export function requestArenaMutantBout(): void {
  ladderRuntime.pendingMutants = true;
}

export function isArenaPlayerBoutActive(): boolean {
  return ladderRuntime.bout !== null;
}

/* ── Такт ────────────────────────────────────────────────────── */

export function updateArenaLadder(
  world: World, entities: Entity[], player: Entity, state: GameState, nextId: { v: number }, dt: number,
): void {
  seedArenaRoster(state);
  const room = findArenaRoom(world);

  ladderRuntime.coldAccum += dt;
  if (ladderRuntime.coldAccum >= ARENA_COLD_TICK_S) {
    ladderRuntime.coldAccum = 0;
    coldFlagTransfer(state);
    if (room && getAlifeArenaChampion(state) === ALIFE_ARENA_CHAMPION_PLAYER
      && !ladderRuntime.bout && rng() < ARENA_CHALLENGER_CHANCE) {
      summonChallenger(world, entities, player, state, nextId, room);
    }
  }

  if (ladderRuntime.pendingChallengeAlifeId > 0) {
    const alifeId = ladderRuntime.pendingChallengeAlifeId;
    ladderRuntime.pendingChallengeAlifeId = 0;
    if (room && !ladderRuntime.bout) startLadderBout(world, entities, player, state, nextId, room, alifeId);
  }
  if (ladderRuntime.pendingMutants) {
    ladderRuntime.pendingMutants = false;
    if (room && !ladderRuntime.bout) startMutantBout(world, entities, player, state, nextId, room);
  }

  if (ladderRuntime.bout) updatePlayerBout(world, entities, player, state, nextId, room, dt);
}

/** Противник на песок: уже стоящая на этаже сущность либо материализованная
 *  личность. Новых людей не создаётся ни на одном из путей. */
function bringFighterToRing(
  world: World, entities: Entity[], state: GameState, nextId: { v: number }, room: Room, alifeId: number,
): Entity | null {
  const cx = world.wrap(room.x + Math.floor(room.w / 2));
  const cy = world.wrap(room.y + Math.floor(room.h / 2));
  const existing = entities.find(e => e.alifeId === alifeId && e.alive);
  if (existing) {
    existing.x = world.wrap(cx + 2) + 0.5;
    existing.y = cy + 0.5;
    return existing;
  }
  return materializeAlifeArrival(state, world, entities, nextId, alifeId, {
    x: world.wrap(cx + 2) + 0.5, y: cy + 0.5, isTraveler: false,
  });
}

function startLadderBout(
  world: World, entities: Entity[], player: Entity, state: GameState,
  nextId: { v: number }, room: Room, alifeId: number,
): void {
  const opponent = bringFighterToRing(world, entities, state, nextId, room, alifeId);
  if (!opponent) {
    state.msgs.push(msg('Боец не вышел на песок.', state.time, '#cc9'));
    return;
  }
  const cx = world.wrap(room.x + Math.floor(room.w / 2));
  const cy = world.wrap(room.y + Math.floor(room.h / 2));
  player.x = world.wrap(cx - 2) + 0.5;
  player.y = cy + 0.5;
  ladderRuntime.bout = {
    kind: 'ladder',
    foes: [opponent],
    opponentAlifeId: alifeId,
    opponentName: opponent.name ?? 'боец',
    forTitle: getAlifeArenaChampion(state) === alifeId,
    wave: 0,
    threatAccum: 0,
  };
  openBout(opponent, player, state);
}

/** Претендент к чемпиону-игроку: приходит тот, кто уже носит флаг бойца. */
function summonChallenger(
  world: World, entities: Entity[], player: Entity, state: GameState, nextId: { v: number }, room: Room,
): void {
  const roster = listAlifeArenaFighters(state);
  if (roster.length === 0) return;
  const pick = roster[irand(0, roster.length - 1)];
  const opponent = bringFighterToRing(world, entities, state, nextId, room, pick.id);
  if (!opponent) return;
  ladderRuntime.bout = {
    kind: 'defense',
    foes: [opponent],
    opponentAlifeId: pick.id,
    opponentName: opponent.name ?? 'претендент',
    forTitle: true,
    wave: 0,
    threatAccum: 0,
  };
  state.msgs.push(msg(`«Чемпион! Я вызываю тебя!» — ${opponent.name ?? 'претендент'} выходит на песок.`, state.time, '#fa4'));
  openBout(opponent, player, state);
}

function openBout(opponent: Entity, player: Entity, state: GameState): void {
  // Поединок один на один: свои в него не вмешиваются.
  setDuelLock(opponent, true);
  setDuelLock(player, true);
  forceCombatThreat(opponent, player, state.time);
  state.msgs.push(msg(`Бой начался: вы против ${opponent.name ?? 'бойца'}.`, state.time, '#f66'));
}

function startMutantBout(
  world: World, entities: Entity[], player: Entity, state: GameState, nextId: { v: number }, room: Room,
): void {
  const cx = world.wrap(room.x + Math.floor(room.w / 2));
  const cy = world.wrap(room.y + Math.floor(room.h / 2));
  player.x = cx + 0.5;
  player.y = cy + 0.5;
  ladderRuntime.bout = {
    kind: 'mutants', foes: [], opponentAlifeId: 0, opponentName: 'мутанты',
    forTitle: false, wave: 0, threatAccum: 0,
  };
  setDuelLock(player, true);
  spawnMutantWave(world, entities, state, nextId, room);
  if (ladderRuntime.bout.foes.length === 0) {
    state.msgs.push(msg('Клетки пусты: выпускать некого.', state.time, '#cc9'));
    endBout(player);
    return;
  }
  state.msgs.push(msg('Решётки подняты. Первая волна выходит на песок.', state.time, '#f66'));
}

/** Волна мутантов в кольцо. Растёт с номером и упирается в бюджет сущностей. */
function spawnMutantWave(
  world: World, entities: Entity[], state: GameState, nextId: { v: number }, room: Room,
): void {
  const bout = ladderRuntime.bout;
  if (!bout) return;
  bout.wave++;
  const want = Math.min(ARENA_MUTANT_KINDS.length, 1 + bout.wave);
  const count = entitySpawnSlots(entities, EntityType.MONSTER, want);
  const cx = world.wrap(room.x + Math.floor(room.w / 2));
  const cy = world.wrap(room.y + Math.floor(room.h / 2));
  bout.foes.length = 0;
  for (let i = 0; i < count; i++) {
    const kind = ARENA_MUTANT_KINDS[i % ARENA_MUTANT_KINDS.length];
    const def = MONSTERS[kind];
    if (!def) continue;
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    const x = world.wrap(cx + Math.round(Math.cos(angle) * 6));
    const y = world.wrap(cy + Math.round(Math.sin(angle) * 6));
    if (world.cells[world.idx(x, y)] !== Cell.FLOOR) continue;
    // Волна крепчает: та же кривая, что у охраны контрактов — прибавка от номера.
    const hp = Math.round(def.hp * (1 + bout.wave * 0.12));
    const monster: Entity = {
      id: nextId.v++, type: EntityType.MONSTER,
      x: x + 0.5, y: y + 0.5, angle: rng() * Math.PI * 2, pitch: 0,
      alive: true, speed: def.speed, sprite: monsterSpr(kind),
      hp, maxHp: hp, monsterKind: kind, attackCd: 0, faction: Faction.WILD,
      ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    };
    entities.push(monster);
    bout.foes.push(monster);
  }
  state.msgs.push(msg(`Волна ${bout.wave}: на песке ${bout.foes.length}.`, state.time, '#fa4'));
}

function updatePlayerBout(
  world: World, entities: Entity[], player: Entity, state: GameState,
  nextId: { v: number }, room: Room | undefined, dt: number,
): void {
  const bout = ladderRuntime.bout;
  if (!bout) return;
  if (!player.alive) { endBout(player); return; }
  // Ушёл с песка — бой окончен: держать поединок за спиной у игрока нечестно.
  if (!isInsideArena(world, room, player)) {
    state.msgs.push(msg('Вы покинули песок. Бой окончен.', state.time, '#cc9'));
    endBout(player);
    return;
  }

  const alive = bout.foes.filter(foe => foe.alive);
  if (alive.length > 0) {
    bout.threatAccum += dt;
    // Угроза подаётся тактом, а не каждый кадр: память о ней истекает, и без
    // повторной подачи противник посреди боя теряет цель.
    if (bout.threatAccum >= 2) {
      bout.threatAccum = 0;
      for (const foe of alive) forceCombatThreat(foe, player, state.time);
    }
    return;
  }

  if (bout.kind === 'mutants') {
    const prize = ARENA_MUTANT_WAVE_PRIZE * bout.wave;
    transferMoney(null, player, prize);
    state.msgs.push(msg(`Волна ${bout.wave} очищена. ${prize}₽ от распорядителя.`, state.time, '#4cf'));
    /* Пустая волна закрывает бой, а не крутит его дальше. Без этого «бесконечные
     * бои» становятся бесконечной ВЫПЛАТОЙ: волна, которой некуда встать (нет
     * свободных клеток, выбран бюджет сущностей), очищается в тот же кадр, и
     * касса открывается каждый кадр. */
    if (room) spawnMutantWave(world, entities, state, nextId, room);
    if (bout.foes.length === 0) {
      state.msgs.push(msg('Клетки пусты. Распорядитель закрывает песок.', state.time, '#cc9'));
      endBout(player);
    }
    return;
  }

  onLadderVictory(entities, player, state, nextId, bout);
  endBout(player);
}

/** Победа над ступенью. Титул переходит только если пал именно чемпион — и
 *  тогда срабатывает уже написанная награда чемпиона. */
function onLadderVictory(
  entities: Entity[], player: Entity, state: GameState, nextId: { v: number }, bout: ArenaPlayerBout,
): void {
  publishEvent(state, {
    type: 'arena_duel_ended',
    actorId: player.id,
    tags: ['arena', 'ladder'],
    severity: 3,
    privacy: 'public',
    data: { defeatedAlifeId: bout.opponentAlifeId, forTitle: bout.forTitle },
  });
  if (!bout.forTitle) {
    state.msgs.push(msg(`${bout.opponentName} повержен. Лестница ждёт следующего.`, state.time, '#4cf'));
    return;
  }
  setAlifeArenaChampion(state, ALIFE_ARENA_CHAMPION_PLAYER);
  state.msgs.push(msg('Чемпион пал. Песок ваш.', state.time, '#fdd'));
  grantArenaChampionRewards(entities, player, state, nextId);
}

function endBout(player: Entity): void {
  const bout = ladderRuntime.bout;
  ladderRuntime.bout = null;
  if (!bout) return;
  setDuelLock(player, false);
  for (const foe of bout.foes) setDuelLock(foe, false);
}

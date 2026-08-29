/* Замок на бой на арене — сцену-пролог Базы Ликвидаторов.
 *
 * Проверяется механика, и только она (`cutscene.md`, §12: исхода боя в замках
 * сцены быть не должно). Здесь это особенно легко нарушить: соблазн потребовать,
 * чтобы пленного вынесли, — прямое назначение исхода, а он принадлежит стволам.
 *
 * ── Два прогона, и второй ГОНЯЕТ AI ───────────────────────────────
 *
 * РАССТАНОВКА известна на кадре, которым сцена поднялась, и дальше не меняется:
 * роли, места, тег арены, геометрия кадра. Она снимается без единого шага
 * симуляции.
 *
 * ДУЭЛЬ снимается только покадровым прогоном `updateAI`, как у соседних сцен
 * (`forpost-defense-scene`, `ministry-parade-scene`). Пока его здесь не было,
 * замок держал ровно то, что и так видно в объявлении, — и не заметил, что бой
 * на песке разваливается: пленный выходил безоружным (профиль культиста ВСЕГДА
 * даёт пси-сгусток вместо ствола), поводок гасил победителю цель и скан, и тот
 * стоял на радиусе поводка до конца сцены, а посторонний ликвидатор гарнизона
 * успевал зайти на песок третьим. Всё это — механика, и вся она проверяема, не
 * называя победителя.
 *
 * Что держится:
 *   — сцена в реестре, и её этаж — тот самый, что у маршрута Базы;
 *   — арена вырыта, найдена ТОЧНЫМ `defId` и не потеряла тега `arena`;
 *   — весь кадр помещается в комнату: и точки пролётов, и круги облётов;
 *   — все роли резолвятся — каждая объявленная получила живых людей;
 *   — трибуна не вступит в бой: никто из зрителей не враждебен ни одному из
 *     бойцов, а единственный ликвидатор в кадре (распорядитель) стоит дальше,
 *     чем боец видит цель;
 *   — сигнал к бою идёт ПОСЛЕ камеры, а не на нулевом такте;
 *   — на песке нет посторонних: третий боец — не зевака;
 *   — оба вооружены так, что боевые справки считают их вооружёнными;
 *   — до сигнала они не достают друг друга и не ранены;
 *   — после дуэли выживший продолжает жить, а не стоит столбом на поводке.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, Faction, type Entity, type GameState } from '../src/core/types';
import type { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { designNpcFloorKey } from '../src/data/plot';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { ARENA_SAND_HALF, ARENA_SIDE, ARENA_STAND_ROW } from '../src/gen/liquidatorbase/fort';
import { LIQUIDATOR_BASE_ARENA_ANCHOR } from '../src/gen/liquidatorbase/rooms';
import {
  ARENA_DUEL_ANNOUNCER_ID,
  ARENA_DUEL_SCENE_ID,
  LIQUIDATOR_BASE_FLOOR_KEY,
} from '../src/gen/liquidatorbase/arena_duel';
import { updateAI } from '../src/systems/ai';
import { currentAlifeFloorKey } from '../src/systems/alife';
import { createRuntimeCamera, updateRuntimeCamera, type RuntimeCamera } from '../src/systems/camera';
import { npcCombatProfile } from '../src/systems/combat_stimulus';
import {
  bindSceneCamera,
  floorSceneById,
  isFloorSceneActive,
  requestFloorScene,
  resetFloorScenes,
  type SceneSpot,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { areFactionsHostile } from '../src/systems/factions';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestPlayer } from './helpers';
import { thinSceneBystanders } from './scene_crowd';

const LIQUIDATOR_BASE_Z = -12;
const FRAME = 1 / 60;
/**
 * Сиды прогона. Комната-якорь от сида не зависит вовсе — форт ставит арену
 * ровно в середине этажа, — но ЗАГРУЗКА бойцов, гарнизон вокруг песка и сам
 * размен зависят. Второй сид взят не для количества: на нём победитель выходит
 * из боя тяжело раненым и хочет уйти с песка, то есть спорит с поводком, а
 * первый — тот самый, на котором дуэль разбиралась.
 */
const SEEDS = [20_881, 7];
/* Потолок подъёма сцены. В норме хватает одного кадра хуков: комната-якорь
 * есть с самого начала, ждать нечего. */
const RAISE_FRAMES = 240;
/** Потолок прогона: сцена закрывается сама, потолок — от зависания. */
const MAX_FRAMES = 60 * 200;
/**
 * Докуда человек берёт боевую цель — `NPC_COMBAT_RANGE` из `ai/combat.ts`.
 * Константа там приватная, поэтому здесь её копия, и копия эта НАМЕРЕННАЯ:
 * замок обязан упасть, если радиус в бою вырастет, а расстановка сцены нет.
 */
const NPC_COMBAT_RANGE = 8;
/**
 * Досягаемость удара с запасом: дальность оружия плюс радиус попадания
 * (`ai/combat.ts`, `effectiveReach`). Самое длинное холодное в игре — арматура
 * на 2.1 клетки, и три клетки покрывают её вместе с радиусом.
 */
const MELEE_REACH = 3;

/** Роли, объявленные сценой. Пусто хоть у одной — кадр без своего содержимого. */
const DECLARED_ROLES = [
  'marko', 'gladiator', 'prisoner',
  'stand_north', 'stand_south', 'stand_west', 'stand_east',
] as const;

function sceneDef() {
  const def = floorSceneById(ARENA_DUEL_SCENE_ID);
  assert.ok(def, 'сцена боя на арене не зарегистрирована');
  return def!;
}

/** Смещение точки кадра от якоря. Роль и говорящий — люди, они мерятся отдельно. */
function spotOffset(spot: SceneSpot): { ox: number; oy: number } | null {
  return 'ox' in spot ? { ox: spot.ox, oy: spot.oy } : null;
}

interface Stage {
  world: World;
  entities: Entity[];
  player: Entity;
  state: GameState;
  camera: RuntimeCamera;
  /**
   * Счётчик id ОДИН на прогон, и это не мелочь. Свежий объект на каждый кадр
   * раздаёт одни и те же номера снарядам, трупам и актёрам, а сцена ведёт свой
   * каст по id: с дублями поводок берёт из индекса не того человека и молча не
   * работает вовсе. Так этот замок и не видел половины механики.
   */
  nextEntityId: { v: number };
  anchorX: number;
  anchorY: number;
  marko: Entity | undefined;
}

function stageArena(seed: number): Stage {
  seedGlobalRng(0xa5e1 + seed);
  initFactionRelations();
  const gen = generateFloor(LIQUIDATOR_BASE_Z, seed);
  const world = gen.world;
  const anchor = world.rooms.find(room => room?.defId === LIQUIDATOR_BASE_ARENA_ANCHOR);
  assert.ok(anchor, `сид ${seed}: у Базы нет комнаты-якоря: сцена не начнётся и визит не засчитается`);

  const player = makeTestPlayer({ x: gen.spawnX, y: gen.spawnY, angle: 0 });
  const entities: Entity[] = [player, ...gen.entities];
  const state = makeGameState({ currentZ: LIQUIDATOR_BASE_Z });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation(entities, 0);

  const camera = createRuntimeCamera();
  bindSceneCamera(camera);
  resetFloorScenes();
  assert.equal(requestFloorScene(ARENA_DUEL_SCENE_ID), true, 'сцена обязана быть в реестре');

  return {
    world,
    entities,
    player,
    state,
    camera,
    nextEntityId: { v: 900_000 },
    anchorX: anchor!.x + anchor!.w / 2,
    anchorY: anchor!.y + anchor!.h / 2,
    marko: entities.find(e => (e as { npcPackageId?: string }).npcPackageId === ARENA_DUEL_ANNOUNCER_ID),
  };
}

/** Один кадр хуков контента: он и поднимает сцену, он же ставит каст. */
function tickHooks(stage: Stage): void {
  stage.state.time += FRAME;
  stage.state.tick++;
  updateContentRuntimeHooks({
    world: stage.world, entities: stage.entities, player: stage.player, state: stage.state,
    nextEntityId: stage.nextEntityId, dt: FRAME, phase: 'floor_activity', gameOver: false,
  });
}

function raiseScene(stage: Stage, seed: number): void {
  let raised = false;
  for (let frame = 0; frame < RAISE_FRAMES && !raised; frame++) {
    tickHooks(stage);
    raised = isFloorSceneActive();
  }
  assert.equal(raised, true, `сид ${seed}: сцена так и не поднялась`);
}

function sceneCast(stage: Stage): Entity[] {
  return stage.entities.filter(e =>
    e.alive && e.type === EntityType.NPC && e.cinematicState?.sceneId === ARENA_DUEL_SCENE_ID);
}

/** Двое на песке: пленный да боец гарнизона, но не распорядитель. */
function sandFighters(stage: Stage, cast: Entity[]): Entity[] {
  return cast.filter(e => e.faction === Faction.CULTIST
    || (e.faction === Faction.LIQUIDATOR && e.id !== stage.marko?.id));
}

test('сцена боя на арене объявлена на своём этаже и держится за вырытую арену', () => {
  const def = sceneDef();
  assert.equal(def.floorKey, LIQUIDATOR_BASE_FLOOR_KEY);
  assert.equal(def.floorKey, designNpcFloorKey('liquidatorbase'));
  assert.equal(def.anchorRoomAlias, LIQUIDATOR_BASE_ARENA_ANCHOR);
  assert.equal(def.trigger.kind, 'first_visit');
  // Потолок обязателен: без него кадр висит у игрока без управления.
  assert.ok(def.maxSeconds > 0 && def.maxSeconds <= 240, `потолок сцены ${def.maxSeconds}`);
});

test('кадр помещается в арену: и точки пролётов, и круги облётов', () => {
  const def = sceneDef();
  /* Мерка `cutscene.md`: круг не больше половины МЕНЬШЕЙ стороны минус клетка.
   * Арена квадратная, так что сторона одна. Точки кадра считаются от середины
   * и обязаны лежать внутри тех же стен. */
  const half = ARENA_SIDE / 2;
  const maxRadius = half - 1;

  let orbits = 0;
  let flies = 0;
  for (const beat of def.beats) {
    if (beat.kind === 'orbit') {
      orbits++;
      assert.ok(beat.radius > 0 && beat.radius <= maxRadius,
        `радиус облёта ${beat.radius} не помещается в арену ${ARENA_SIDE}x${ARENA_SIDE}`);
      const at = spotOffset(beat.around);
      if (at) {
        assert.ok(Math.abs(at.ox) + beat.radius <= maxRadius && Math.abs(at.oy) + beat.radius <= maxRadius,
          `круг вокруг (${at.ox}, ${at.oy}) выходит за стену`);
      }
    }
    if (beat.kind !== 'fly') continue;
    flies++;
    for (const spot of [beat.to, beat.look]) {
      const at = spot ? spotOffset(spot) : null;
      if (!at) continue;
      assert.ok(Math.abs(at.ox) < half && Math.abs(at.oy) < half,
        `точка кадра (${at.ox}, ${at.oy}) лежит в стене`);
    }
  }
  assert.ok(orbits >= 2, 'облёта арены в сцене нет');
  assert.ok(flies >= 2, 'подлёта к арене в сцене нет');
});

/**
 * Порядок тактов, а не их набор.
 *
 * Сигнал к бою стоял ПЕРВЫМ тактом, и это было ошибкой замысла: бой на песке
 * кончается за десяток-другой секунд, камера доезжает за столько же, а в живой
 * игре игрок к этому едет ещё и лифтом. Он приезжал на законченное — двое
 * стояли по краям и не дрались, потому что драться было уже не с кем.
 *
 * Замок держит именно порядок: перед `release` обязаны стоять пролёты, и оба
 * они обязаны ЖДАТЬ прилёта камеры (`wait: false` сняло бы всю выдержку).
 */
test('сигнал к бою идёт после камеры, а не на нулевом такте', () => {
  const def = sceneDef();
  const release = def.beats.findIndex(beat => beat.kind === 'release');
  assert.ok(release > 0, 'бойцов отпускают первым же тактом: игрок приедет на законченный бой');

  const before = def.beats.slice(0, release);
  const waitingFlies = before.filter(beat => beat.kind === 'fly' && beat.wait !== false);
  assert.ok(waitingFlies.length >= 2,
    `до сигнала всего ${waitingFlies.length} ждущих пролётов: камера не успеет доехать`);

  /* Выдержку до сигнала держит ПОСТ, а пост читает поводок роли: объявленный
   * роли поводок вытесняет короткий пост и отпускает бойцов гулять по всему
   * песку ещё до камеры. Поэтому место действия объявляет СЦЕНА, а роли на
   * песке не несут своего поводка вовсе. */
  assert.ok((def.leash ?? 0) > 0, 'у сцены нет поводка места действия: отпущенных ничто не держит');
  for (const role of ['gladiator', 'prisoner']) {
    const actor = def.actors.find(item => item.role === role);
    assert.ok(actor, `роль "${role}" пропала из сцены`);
    assert.equal(actor!.leash, undefined,
      `у роли "${role}" свой поводок: он заменит ей пост, и бой начнётся до камеры`);
  }
});

test('арена вырыта, ищется по псевдониму и не потеряла тега дуэльной системы', () => {
  seedGlobalRng(0xa5e1 + SEEDS[0]);
  const gen = generateFloor(LIQUIDATOR_BASE_Z, SEEDS[0]);
  const anchor = gen.world.rooms.find(room => room?.defId === LIQUIDATOR_BASE_ARENA_ANCHOR);
  assert.ok(anchor, 'у Базы нет комнаты-якоря: сцена не начнётся и визит не засчитается');
  assert.equal(anchor!.w, ARENA_SIDE);
  assert.equal(anchor!.h, ARENA_SIDE);
  // Тег носит `findArenaRoom` в `arena_ladder.ts`; псевдоним его не вытесняет.
  assert.ok(anchor!.tags?.includes('arena'), 'арена потеряла тег `arena`');
  assert.ok(anchor!.tags?.includes(LIQUIDATOR_BASE_ARENA_ANCHOR));
});

test('сцена поднимается, все роли резолвятся, и трибуна в бой не вступит', () => {
  const def = sceneDef();
  const stage = stageArena(SEEDS[0]);
  const { world, entities, anchorX, anchorY } = stage;
  assert.equal(currentAlifeFloorKey(stage.state), LIQUIDATOR_BASE_FLOOR_KEY,
    'прогон стоит не на Базе: сцена ждала бы своего этажа');
  assert.ok(stage.marko, 'распорядитель арены не доставлен на этаж — сцене некому вести бой');

  raiseScene(stage, SEEDS[0]);

  /* Состав роли проигрыватель наружу не отдаёт. Зато он оставляет на каждом
   * актёре ПОСТ — клетку, куда роль его поставила, — и по нему роль узнаётся
   * обратно: пост лежит у своего смещения в пределах разброса. Пусто хоть у
   * одной роли — это либо промах смещения в бетон, либо не найденный пакет. */
  const cast = sceneCast(stage);
  assert.deepEqual(def.actors.map(actor => actor.role), [...DECLARED_ROLES],
    'состав ролей сцены разошёлся с замком');

  let declared = 0;
  let placed = 0;
  for (const actor of def.actors) {
    const postX = anchorX + actor.ox;
    const postY = anchorY + actor.oy;
    // Место ищется расходящейся спиралью в пределах разброса, плюс кучка своего
    // смещения: три клетки запаса поверх разброса покрывают обе выборки.
    const reach = (actor.spread ?? 2) + 3;
    const mine = cast.filter(e => world.dist(e.cinematicState!.postX, e.cinematicState!.postY, postX, postY) <= reach);
    assert.ok(mine.length > 0, `роль "${actor.role}" не поставила никого`);
    declared += actor.packageId ? 1 : (actor.count ?? 0);
    placed += mine.length;
  }
  /* Толпа наполовину пустая ловится ТОЛЬКО счётом: кому не нашлось клетки в
   * пределах разброса, того молча пропускают, без ошибки и без записи. */
  assert.ok(placed >= declared * 0.9,
    `трибуна поставлена не целиком: ${placed} из ${declared}`);

  const byFaction = (faction: Faction) => cast.filter(e => e.faction === faction);
  assert.equal(byFaction(Faction.CULTIST).length, 1, 'пленного на песке ровно один, и он обязан быть');
  assert.ok(cast.some(e => e.id === stage.marko!.id), 'распорядитель не взят сценой');

  /* Двое на песке — внутри ринга и в пределах взгляда друг друга: иначе бой не
   * начнётся вовсе и такт ожидания досидит до своего таймаута. */
  const fighters = sandFighters(stage, cast);
  assert.equal(fighters.length, 2, 'на песке обязаны стоять двое');
  for (const man of fighters) {
    assert.ok(Math.abs(world.delta(man.x, anchorX)) <= ARENA_SAND_HALF
      && Math.abs(world.delta(man.y, anchorY)) <= ARENA_SAND_HALF,
      'боец поставлен за столами ринга, а не на песке');
  }
  assert.ok(world.dist(fighters[0].x, fighters[0].y, fighters[1].x, fighters[1].y) <= NPC_COMBAT_RANGE,
    'бойцы разведены дальше, чем берут цель: драки не будет');

  /* Главное свойство расстановки: зритель, враждебный бойцу, дерётся наравне со
   * всеми — цикл AI актёра сцены не пропускает. Значит либо зритель терпит
   * обоих, либо он стоит дальше, чем боец берёт цель. */
  const fighterFactions = [Faction.LIQUIDATOR, Faction.CULTIST];
  const sandReach = ARENA_SAND_HALF + NPC_COMBAT_RANGE;
  for (const watcher of cast) {
    if (fighters.some(man => man.id === watcher.id)) continue;
    const faction = watcher.faction ?? Faction.CITIZEN;
    const feuding = fighterFactions.some(other =>
      areFactionsHostile(faction, other) || areFactionsHostile(other, faction));
    if (!feuding) continue;
    const away = world.dist(watcher.x, watcher.y, anchorX, anchorY);
    assert.ok(away > sandReach,
      `зритель фракции ${Faction[faction]} стоит в ${away.toFixed(1)} клетках от песка и вступит в дуэль`);
  }
  assert.ok(world.dist(stage.marko!.x, stage.marko!.y, anchorX, anchorY) >= ARENA_STAND_ROW - 1,
    'распорядитель стоит на песке, а не у трибуны');

  resetFloorScenes();
});

/* ── Прогон дуэли ────────────────────────────────────────────────
 *
 * Всё, что здесь снимается, — механика. Исхода в этих числах нет: кто кого,
 * замок не спрашивает и спрашивать не вправе.
 */
interface Duel {
  /** Посторонние акторы на песке в момент подъёма сцены. */
  intruders: number;
  /** Оба ли бойца вооружены так, что боевые справки считают их вооружёнными. */
  armed: boolean;
  /** Секунда, на которой поводок сцены снят с обоих. */
  releaseAt: number;
  /** Секунда первой потери здоровья хоть кем-то из двоих. */
  firstHitAt: number;
  /** Насколько близко они сошлись, ПОКА оба стояли на посту. */
  gapOnPost: number;
  /** Потерял ли кто-то здоровье до сигнала. */
  hurtOnPost: boolean;
  /** Секунда, на которой дуэль кончилась смертью; -1 — не кончилась. */
  deathAt: number;
  /** Путь, пройденный живыми бойцами после смерти павшего, в клетках. */
  pathAfterDeath: number;
  seconds: number;
}

function playDuel(seed: number): Duel {
  const stage = stageArena(seed);
  const { world, entities, player, state, camera } = stage;
  const run: Duel = {
    intruders: 0, armed: false, releaseAt: -1, firstHitAt: -1,
    gapOnPost: Infinity, hurtOnPost: false, deathAt: -1, pathAfterDeath: 0, seconds: 0,
  };

  let fighters: Entity[] = [];
  let startHp: number[] = [];
  let lastX: number[] = [];
  let lastY: number[] = [];
  let taken = false;
  let started = false;

  for (let f = 0; f < MAX_FRAMES; f++) {
    tickHooks(stage);
    if (isFloorSceneActive() && !taken) {
      taken = true;
      fighters = sandFighters(stage, sceneCast(stage));
      assert.equal(fighters.length, 2, `сид ${seed}: на песке обязаны стоять двое`);
      startHp = fighters.map(e => e.hp ?? 0);
      lastX = fighters.map(e => e.x);
      lastY = fighters.map(e => e.y);
      run.armed = fighters.every(e => npcCombatProfile(e).armed);
      /* Песок принадлежит дуэли. Всякий посторонний актор на нём — это не
       * зевака: гарнизонный ликвидатор враждебен пленному по той же матрице,
       * по которой идёт сама дуэль, и вступает в неё третьим. */
      run.intruders = entities.filter(e =>
        e.alive && e !== player
        && (e.type === EntityType.NPC || e.type === EntityType.MONSTER)
        && !fighters.includes(e)
        && world.dist(e.x, e.y, stage.anchorX, stage.anchorY) <= ARENA_SAND_HALF).length;
      // Фон этажа прореживается до размера каста, как у соседних сцен: цикл AI
      // ведёт каждого, а в кадр попадает каст (`tests/scene_crowd.ts`).
      thinSceneBystanders(entities, player);
    }
    // Бой и камеру двигает игровой цикл, а не хуки сцены. Без этих двух шагов
    // сцена «играет» в пустоту: никто не дерётся и кадр стоит на месте.
    rebuildEntityIndexForSimulation(entities, f + 1);
    updateAI(world, entities, FRAME, state.time, state.msgs, player.id, state.clock,
      false, stage.nextEntityId, LIQUIDATOR_BASE_Z, state);
    updateRuntimeCamera(camera, world, FRAME, player);
    if (!taken) continue;

    const now = f / 60;
    run.seconds = now;
    started = true;
    const onPost = fighters.some(e => e.cinematicState !== undefined);
    if (run.releaseAt < 0 && !onPost) run.releaseAt = now;
    if (onPost) {
      run.gapOnPost = Math.min(run.gapOnPost,
        world.dist(fighters[0].x, fighters[0].y, fighters[1].x, fighters[1].y));
    }
    if (fighters.some((e, i) => (e.hp ?? 0) < startHp[i])) {
      if (run.firstHitAt < 0) run.firstHitAt = now;
      if (onPost) run.hurtOnPost = true;
    }
    if (run.deathAt < 0 && fighters.some(e => !e.alive)) run.deathAt = now;
    for (let i = 0; i < fighters.length; i++) {
      const man = fighters[i];
      if (!man.alive) continue;
      if (run.deathAt >= 0) {
        run.pathAfterDeath += Math.hypot(world.delta(lastX[i], man.x), world.delta(lastY[i], man.y));
      }
      lastX[i] = man.x;
      lastY[i] = man.y;
    }
    if (!isFloorSceneActive()) break;
  }

  assert.equal(started, true, `сид ${seed}: сцена так и не поднялась`);
  assert.ok(run.releaseAt >= 0, `сид ${seed}: бойцов так и не отпустили`);
  resetFloorScenes();
  return run;
}

/* Оба замка смотрят на одни и те же прогоны: сцена идёт минуту с лишним
 * игрового времени, и играть её дважды незачем. */
const duels = new Map<number, Duel>();
function duelFor(seed: number): Duel {
  const cached = duels.get(seed);
  if (cached) return cached;
  const run = playDuel(seed);
  duels.set(seed, run);
  return run;
}

test('дуэль начинается по сигналу, а не до него: песок пуст, бойцы вооружены и не достают друг друга', () => {
  for (const seed of SEEDS) {
    const run = duelFor(seed);
    const at = `сид ${seed}`;

    assert.equal(run.intruders, 0,
      `${at}: на песке ${run.intruders} посторонних — дуэль двоих превращается в травлю`);

    /* Безоружный по справкам дерётся ВДВОЕ хуже: контекст драки ему режется,
     * и раненым он уходит в бегство. Профиль культиста выдаёт пси-сгусток в
     * слот инструмента и НИКОГДА не даёт оружия, поэтому оружие дуэлянтам
     * назначает сцена. */
    assert.equal(run.armed, true, `${at}: на песок вышли с пустыми руками`);

    assert.ok(run.gapOnPost >= MELEE_REACH,
      `${at}: на посту они сошлись на ${run.gapOnPost.toFixed(1)} клетки и достали друг друга до сигнала`);
    assert.equal(run.hurtOnPost, false, `${at}: размен начался, пока бойцы ещё стояли на посту`);
    assert.ok(run.firstHitAt < 0 || run.firstHitAt >= run.releaseAt,
      `${at}: первый удар на ${run.firstHitAt.toFixed(1)}s, а сигнал на ${run.releaseAt.toFixed(1)}s`);
  }
});

/**
 * Главный замок на поводок отпущенного.
 *
 * Исхода он не назначает: смерти не требует, победителя не называет. Он держит
 * ровно то, что поводок сцены не вправе сделать с отпущенным человеком, — не
 * превращать его в столб.
 *
 * Было: павший ложится где придётся (на замере — в 10.2 клетки при поводке в
 * 10), победитель идёт к его месту, упирается в поводок, и тот каждым кадром
 * гасит ему цель, память об ударе и скан, а заодно обнуляет маршрут. Человек
 * стоял на радиусе поводка до конца сцены — пятьдесят секунд из шестидесяти.
 */
test('после дуэли выживший продолжает жить, а не стоит столбом на поводке', () => {
  for (const seed of SEEDS) {
    const run = duelFor(seed);
    const at = `сид ${seed}`;
    // Смерти замок не требует: исход принадлежит стволам. Не случилось её —
    // проверять нечего, бой просто ещё идёт.
    if (run.deathAt < 0) continue;
    const after = run.seconds - run.deathAt;
    assert.ok(after > 5, `${at}: после смерти осталось ${after.toFixed(1)}s — судить не о чем`);
    /* Мерка — ПУТЬ, а не место. Стоять у самого поводка законно: раненый
     * победитель хочет уйти с песка, и стена его не пускает; на живом прогоне
     * он проводит у неё половину времени, расхаживая вдоль. Незаконно — не
     * ходить вовсе. Замерено на этих же двух сидах: было 0.07 клетки в секунду
     * (3.8 клетки за 52 секунды), стало 0.6; порог в пятую долю клетки лежит
     * втрое дальше обоих. */
    assert.ok(run.pathAfterDeath > after * 0.2,
      `${at}: за ${after.toFixed(1)}s после дуэли выживший прошёл ${run.pathAfterDeath.toFixed(1)} клетки`);
  }
});

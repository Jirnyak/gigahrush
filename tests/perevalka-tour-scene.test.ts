/* Замок на знакомство с Перевалкой — проезд по четырём дворам.
 *
 * Проверяется РАССТАНОВКА и ГЕОМЕТРИЯ, то есть всё, что известно на кадре
 * подъёма сцены и дальше не меняется. Проигрывание в реальном времени снято
 * намеренно — решением владельца оно убрано и из замков форпоста и НИИ.
 *
 * Что здесь держится:
 *   — сцена объявлена на своём этаже, по первому визиту, с потолком и без
 *     единого `release`: это знакомство, а не бой;
 *   — каждая роль, которую зовут такты, объявлена в актёрах, а четыре хозяина
 *     зовутся пакетами и резолвятся в живых людей на сгенерированном ярусе;
 *   — комната-якорь вырыта и находится точным `defId`, а её центр совпадает с
 *     тем, от которого сцена считает смещения (промах здесь не падает — он
 *     молча снимает не то);
 *   — МАРШРУТ ПРОХОДИМ: каждый перегон либо прокладывается настоящим
 *     маршрутизатором кадра, либо, если тот сдался, идёт прямой, свободной от
 *     бетона. Второе законно (`cutscene.md`, «дороги нет — идёт напрямую»), но
 *     только пока прямая не режет простенок;
 *   — ЗАМОК ПОКАЗАН: после обноса лифтов сцена знает настоящий тамбур, кадр
 *     заходит в него, а его створка заперта ключом базы;
 *   — сцена укладывается в собственный потолок с запасом.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { Cell, DoorState, type Entity, type Room } from '../src/core/types';
import type { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { designNpcFloorKey } from '../src/data/plot';
import { initFactionRelations } from '../src/data/relations';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import {
  PEREVALKA_BASES,
  PEREVALKA_DOCK,
  PEREVALKA_KEYHOLDERS,
  PEREVALKA_TOUR_ANCHOR,
  PEREVALKA_TOUR_SCENE_ID,
  PEREVALKA_Z,
  perevalkaGatesByWorld,
} from '../src/gen/perevalka';
import {
  createRuntimeCamera,
  routeCinematicCamera,
  startCinematicCamera,
} from '../src/systems/camera';
import {
  bindSceneCamera,
  floorSceneById,
  isFloorSceneActive,
  resetFloorScenes,
  type FloorSceneDef,
  type SceneBeat,
  type SceneSpot,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestPlayer } from './helpers';

const RUN_SEEDS = [0x4453474e, 0x0be7a1];
const FRAME = 1 / 60;

/** Центр якоря: от него сцена считает КАЖДОЕ своё смещение. */
const ANCHOR_X = PEREVALKA_DOCK.x + PEREVALKA_DOCK.w / 2;
const ANCHOR_Y = PEREVALKA_DOCK.y + PEREVALKA_DOCK.h / 2;

function isOffsetSpot(spot: SceneSpot): spot is { ox: number; oy: number } {
  return 'ox' in spot;
}

/** Куда кадр ЕДЕТ: такая точка обязана быть проходимой, иначе она не точка. */
function beatDestinations(beat: SceneBeat): SceneSpot[] {
  if (beat.kind === 'fly') return [beat.to];
  if (beat.kind === 'orbit') return [beat.around];
  if (beat.kind === 'moveTo') return [beat.to];
  return [];
}

/** Куда кадр СМОТРИТ: запертая створка — законная цель взгляда, стоять в ней не надо. */
function beatGazes(beat: SceneBeat): SceneSpot[] {
  return beat.kind === 'fly' && beat.look ? [beat.look] : [];
}

function beatRoles(beat: SceneBeat): string[] {
  const roles: string[] = [];
  if (beat.kind === 'say' || beat.kind === 'awaitDeath' || beat.kind === 'materialize') roles.push(beat.role);
  if (beat.kind === 'release' && beat.roles) roles.push(...beat.roles);
  if (beat.kind === 'defect' || beat.kind === 'depart' || beat.kind === 'walkOut' || beat.kind === 'moveTo') {
    roles.push(...beat.roles);
  }
  for (const spot of [...beatDestinations(beat), ...beatGazes(beat)]) {
    if (!isOffsetSpot(spot) && 'role' in spot) roles.push(spot.role);
  }
  return roles;
}

function beatSeconds(beat: SceneBeat): number {
  if (beat.kind === 'say') return beat.seconds ?? Math.min(6, Math.max(2.5, beat.text.length * 0.12));
  if (beat.kind === 'pause' || beat.kind === 'orbit') return beat.seconds;
  return 0;
}

function roomAt(world: World, x: number, y: number): Room | undefined {
  const id = world.roomMap[world.idx(Math.floor(x), Math.floor(y))];
  return id >= 0 ? world.rooms[id] : undefined;
}

/** Сколько проб прямой между двумя точками попадает в непроходимое. */
function straightHitsSolid(world: World, ax: number, ay: number, bx: number, by: number): number {
  const dx = world.delta(ax, bx);
  const dy = world.delta(ay, by);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 4));
  let bad = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (world.solid(Math.floor(ax + dx * t), Math.floor(ay + dy * t))) bad++;
  }
  return bad;
}

interface Stage {
  world: World;
  entities: Entity[];
  anchor: Room;
  spawnX: number;
  spawnY: number;
  scene: FloorSceneDef;
  cast: Entity[];
}

/** Живой ярус с поднятой сценой: одна генерация, несколько кадров хуков контента. */
function stagePerevalka(seed: number): Stage {
  seedGlobalRng(0x9e12 ^ seed);
  initFactionRelations();
  const gen = generateDesignFloor('perevalka', seed);
  const world = gen.world;

  const anchor = world.rooms.find(room => room?.defId === PEREVALKA_TOUR_ANCHOR);
  assert.ok(anchor, 'у Перевалки нет комнаты-якоря знакомства');

  const player = makeTestPlayer({ x: gen.spawnX, y: gen.spawnY, angle: 0 });
  const entities: Entity[] = [player, ...gen.entities];
  const state = makeGameState({ currentZ: PEREVALKA_Z });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation(entities, 0);

  bindSceneCamera(createRuntimeCamera());
  resetFloorScenes();

  const before = new Set(entities.map(e => e.id));
  const nextEntityId = { v: 900_000 };
  for (let frame = 0; frame < 4 && !isFloorSceneActive(); frame++) {
    state.time += FRAME;
    state.tick++;
    updateContentRuntimeHooks({
      world, entities, player, state, nextEntityId, dt: FRAME, phase: 'floor_activity', gameOver: false,
    });
  }
  assert.equal(isFloorSceneActive(), true, 'знакомство не поднялось на первом визите');

  // Объявление берётся ПОСЛЕ генерации: тамбур дописывает в него `onAfterPopulate`.
  const scene = floorSceneById(PEREVALKA_TOUR_SCENE_ID)!;
  const cast = entities.filter(e => !before.has(e.id) || e.cinematicState !== undefined);
  resetFloorScenes();
  return { world, entities, anchor: anchor!, spawnX: gen.spawnX, spawnY: gen.spawnY, scene, cast };
}

const staged = new Map<number, Stage>();
function stage(seed: number): Stage {
  if (!staged.has(seed)) staged.set(seed, stagePerevalka(seed));
  return staged.get(seed)!;
}

test('знакомство объявлено на своём этаже и никого не выпускает', () => {
  const scene = floorSceneById(PEREVALKA_TOUR_SCENE_ID);
  assert.ok(scene, 'сцена не зарегистрирована');
  assert.equal(scene!.floorKey, designNpcFloorKey('perevalka'));
  assert.equal(scene!.trigger.kind, 'first_visit');
  assert.equal(scene!.anchorRoomAlias, PEREVALKA_TOUR_ANCHOR);
  assert.ok(scene!.maxSeconds > 0, 'у сцены обязан быть потолок проигрывания');

  // Это знакомство, а не бой: сцена не отпускает никого своим тактом.
  assert.equal(scene!.beats.some(beat => beat.kind === 'release'), false,
    'знакомство отпускает актёров тактом release');
  assert.equal(scene!.beats.some(beat => beat.kind === 'awaitDeath' || beat.kind === 'defect'), false,
    'в знакомстве появились такты боя и предательства');

  const roles = new Set(scene!.actors.map(actor => actor.role));
  for (const beat of scene!.beats) {
    for (const role of beatRoles(beat)) {
      assert.ok(roles.has(role), `такт ${beat.kind} зовёт роль «${role}», которой нет в актёрах`);
    }
  }

  // Четыре хозяина — четыре пакета: сцена их зовёт, а не создаёт двойников.
  const packages = scene!.actors.map(actor => actor.packageId).filter(Boolean).sort();
  assert.deepEqual(packages, [...PEREVALKA_KEYHOLDERS].sort(),
    'в кадре не все четыре хозяина ключей');
});

test('якорь знакомства — общий двор, и его центр совпадает с объявленным', () => {
  for (const seed of RUN_SEEDS) {
    const { anchor } = stage(seed);
    assert.equal(anchor.x + anchor.w / 2, ANCHOR_X, 'центр якоря уехал по X — все смещения сцены врут');
    assert.equal(anchor.y + anchor.h / 2, ANCHOR_Y, 'центр якоря уехал по Y — все смещения сцены врут');
    assert.equal(anchor.defId, PEREVALKA_TOUR_ANCHOR);
  }
});

test('хозяева стоят в кадре, каждый у своего дела', () => {
  for (const seed of RUN_SEEDS) {
    const { world, cast, scene } = stage(seed);
    for (const actor of scene.actors) {
      if (!actor.packageId) continue;
      const owner = cast.find(e => (e as Entity & { npcPackageId?: string }).npcPackageId === actor.packageId);
      assert.ok(owner, `${actor.packageId} не вызван в кадр`);
      assert.equal(owner!.cinematicState?.sceneId, PEREVALKA_TOUR_SCENE_ID, 'хозяин не на посту сцены');

      // Пост — место в сцене: человека туда переносят, и там обязан быть пол,
      // да ещё и принадлежащий его собственной базе.
      const px = ANCHOR_X + actor.ox;
      const py = ANCHOR_Y + actor.oy;
      assert.equal(world.solid(px, py), false, `пост ${actor.role} (${px}, ${py}) лежит в бетоне`);
      const room = roomAt(world, px, py);
      const spec = PEREVALKA_BASES.find(base => base.npcId === actor.packageId)!;
      assert.ok(
        room?.defId === spec.hqAlias || room?.defId === spec.workAlias,
        `${actor.packageId} поставлен в «${room?.name ?? 'коридоре'}», а не на своей базе`,
      );
    }

    // Свита есть у троих, и её действительно расставили. У Жирняка её нет —
    // это его характеристика, а не забытая роль.
    const dockers = scene.actors.find(actor => actor.role === 'dockers')!;
    assert.ok((dockers.count ?? 0) > 0, 'двор пуст');
    assert.equal(scene.actors.some(actor => actor.role.includes('zhirnyak') && (actor.count ?? 0) > 0), false);
  }
});

test('маршрут проезда проходим: везде дорога, а где нет — свободная прямая', () => {
  for (const seed of RUN_SEEDS) {
    const { world, scene, spawnX, spawnY } = stage(seed);
    const camera = createRuntimeCamera();
    startCinematicCamera(camera, spawnX, spawnY, []);
    // Тот же первый маршрут, что прокладывает проигрыватель на подъёме сцены.
    routeCinematicCamera(camera, world, ANCHOR_X, ANCHOR_Y);

    let index = 0;
    let seconds = 0;
    let road = 0;
    for (const beat of scene.beats) {
      index++;
      seconds += beatSeconds(beat);
      if (beat.kind !== 'fly' || !isOffsetSpot(beat.to)) continue;

      const tx = ANCHOR_X + beat.to.ox;
      const ty = ANCHOR_Y + beat.to.oy;
      assert.equal(world.solid(tx, ty), false, `точка кадра #${index} (${tx}, ${ty}) лежит в бетоне`);

      const fromX = camera.free.x;
      const fromY = camera.free.y;
      routeCinematicCamera(camera, world, tx, ty);
      const path = camera.cinematic!.path;
      let length = 0;
      let px = fromX;
      let py = fromY;
      for (const [wx, wy] of path) {
        length += Math.hypot(world.delta(px, wx), world.delta(py, wy));
        px = wx;
        py = wy;
      }
      camera.free.x = px;
      camera.free.y = py;
      road += length;
      seconds += length / (beat.speed ?? 4);

      // Маршрутизатор сдался — значит кадр пойдёт прямой. Она законна ровно
      // до тех пор, пока не режет простенок.
      if (path.length <= 1 && length > 2) {
        assert.equal(
          straightHitsSolid(world, fromX, fromY, tx, ty), 0,
          `перегон #${index} к (${tx}, ${ty}) идёт прямой СКВОЗЬ БЕТОН`,
        );
      }
    }

    assert.ok(road > 2000, `проезд вышел короче четырёх дворов: ${road.toFixed(0)} клеток`);
    assert.ok(
      seconds < scene.maxSeconds,
      `сцена не укладывается в свой потолок: ${seconds.toFixed(0)}s из ${scene.maxSeconds}s`,
    );
    // Потолок — предохранитель, а не темп: он обязан быть с запасом.
    assert.ok(seconds < scene.maxSeconds * 0.95, `запас до потолка съеден: ${seconds.toFixed(0)}s`);
  }
});

test('взгляд кадра ни разу не упирается в глухой бетон', () => {
  for (const seed of RUN_SEEDS) {
    const { world, scene } = stage(seed);
    for (const beat of scene.beats) {
      for (const spot of beatGazes(beat)) {
        if (!isOffsetSpot(spot)) continue;
        const x = Math.floor(ANCHOR_X + spot.ox);
        const y = Math.floor(ANCHOR_Y + spot.oy);
        const door = world.doors.get(world.idx(x, y));
        assert.ok(door !== undefined || !world.solid(x, y), `взгляд кадра упёрт в бетон (${x}, ${y})`);
      }
    }
  }
});

test('замок показан: кадр заходит в настоящий тамбур за запертой створкой', () => {
  for (const seed of RUN_SEEDS) {
    const { world, scene } = stage(seed);
    const report = perevalkaGatesByWorld.get(world)!;
    const keys = new Set(PEREVALKA_BASES.map(spec => spec.keyId));

    // Точки кадра, попавшие внутрь лифтового тамбура. Хотя бы одна обязана быть:
    // иначе замок остался рассказанным, а не показанным.
    const gateShots = scene.beats
      .flatMap(beatDestinations)
      .filter(isOffsetSpot)
      .map(spot => ({ x: Math.floor(ANCHOR_X + spot.ox), y: Math.floor(ANCHOR_Y + spot.oy) }))
      .filter(point => roomAt(world, point.x, point.y)?.defId?.startsWith('perevalka_lift_gate_'));
    assert.ok(gateShots.length > 0, 'сцена ни разу не заходит в лифтовый тамбур');

    for (const point of gateShots) {
      const room = roomAt(world, point.x, point.y)!;
      const gate = report.gates.find(item => item.roomId === room.id);
      assert.ok(gate, `тамбур ${room.name} не значится в отчёте обноса`);

      // Створка обязана быть заперта ключом базы: на этом и стоит весь ярус.
      const door = world.doors.get(gate!.doorIdx);
      assert.ok(door, 'у тамбура нет двери');
      assert.equal(door!.state, DoorState.LOCKED, 'створка тамбура не заперта — показывать нечего');
      assert.ok(keys.has(door!.keyId), `ключ створки «${door!.keyId}» не принадлежит ни одной базе`);

      // И шахта вниз рядом с точкой кадра: замок без лифта за ним — просто дверь.
      assert.equal(world.cells[world.idx(gate!.x, gate!.y)], Cell.LIFT, 'в тамбуре нет шахты');
      assert.ok(
        Math.max(Math.abs(world.delta(point.x, gate!.x)), Math.abs(world.delta(point.y, gate!.y))) <= gate!.radius,
        'кадр стоит вне тамбура, который показывает',
      );
    }
  }
});

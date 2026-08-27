/* Замок на экскурсию по НИИ слизи — четвёртая сцена на движке.
 *
 * Проверяется РАССТАНОВКА и ГЕОМЕТРИЯ, то есть всё, что известно уже на кадре
 * подъёма сцены и дальше не меняется. Проигрывание в реальном времени снято
 * намеренно: решением владельца (2026-08-24) такой прогон убран и из замка
 * форпоста — полторы минуты игрового времени с полным циклом AI стоят дороже,
 * чем стоят утверждения, которые владелец всё равно смотрит глазами.
 *
 * Что здесь держится:
 *   — сцена объявлена на СВОЁМ этаже и по первому визиту;
 *   — такта `release` нет ни одного: тварей экскурсия не выпускает;
 *   — каждая роль, которую зовут такты, объявлена в актёрах;
 *   — комната-якорь вырыта и находится точным `defId`, а её центр совпадает с
 *     тем, от которого сцена считает свои смещения (промах здесь не падает, он
 *     молча снимает не то);
 *   — галерея вырыта, точки пролёта лежат в ней и достижимы обычной ходьбой от
 *     точки высадки игрока;
 *   — точки внутри гермокамер лежат в самих камерах, у камер есть дверь (кадру
 *     она не помеха, а тварь она держит), и поставленные твари стоят внутри.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { DoorState, EntityType, type Entity, type Room } from '../src/core/types';
import type { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { designNpcFloorKey } from '../src/data/plot';
import { initFactionRelations } from '../src/data/relations';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { materializeAlifeFloorPopulation } from '../src/systems/alife';
import { SLIME_NII_CAMERA_ROOM_PREFIX } from '../src/gen/slime_nii';
import {
  CAMERA_ROWS,
  GALLERY_W,
  GALLERY_X,
  SLIME_NII_ENTRY_ANCHOR,
  SLIME_NII_GALLERY_ANCHOR,
  SLIME_NII_TOUR_SCENE_ID,
} from '../src/gen/slime_nii/tour_scene';
import { bfsPath } from '../src/systems/ai/pathfinding';
import { createRuntimeCamera } from '../src/systems/camera';
import {
  bindSceneCamera,
  floorSceneById,
  isFloorSceneActive,
  resetFloorScenes,
  type SceneBeat,
  type SceneSpot,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestPlayer } from './helpers';

const SLIME_NII_Z = 12;
const FRAME = 1 / 60;
const SEED = 61_061;

const scene = floorSceneById(SLIME_NII_TOUR_SCENE_ID);

interface Stage {
  world: World;
  entities: Entity[];
  anchor: Room;
  gallery: Room;
  spawnX: number;
  spawnY: number;
  cast: Entity[];
}

/** Смещение точки кадра — только для точек-мест; роли и говорящий живые. */
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

/** Куда кадр СМОТРИТ: гермодверь — законная цель взгляда, стоять в ней не надо. */
function beatGazes(beat: SceneBeat): SceneSpot[] {
  return beat.kind === 'fly' && beat.look ? [beat.look] : [];
}

function beatSpots(beat: SceneBeat): SceneSpot[] {
  return [...beatDestinations(beat), ...beatGazes(beat)];
}

function beatRoles(beat: SceneBeat): string[] {
  const roles: string[] = [];
  if (beat.kind === 'say') roles.push(beat.role);
  if (beat.kind === 'awaitDeath') roles.push(beat.role);
  if (beat.kind === 'materialize') roles.push(beat.role);
  if (beat.kind === 'release' && beat.roles) roles.push(...beat.roles);
  if (beat.kind === 'defect' || beat.kind === 'depart' || beat.kind === 'walkOut' || beat.kind === 'moveTo') {
    roles.push(...beat.roles);
  }
  for (const spot of beatSpots(beat)) {
    if (!isOffsetSpot(spot) && 'role' in spot) roles.push(spot.role);
  }
  return roles;
}

function roomAt(world: World, x: number, y: number): Room | undefined {
  const id = world.roomMap[world.idx(Math.floor(x), Math.floor(y))];
  return id >= 0 ? world.rooms[id] : undefined;
}

/** Живой этаж НИИ с поднятой сценой: одна генерация, один кадр хуков контента. */
function stageSlimeNii(): Stage {
  seedGlobalRng(0x5117 ^ SEED);
  initFactionRelations();
  const gen = generateDesignFloor('slime_nii', SEED);
  const world = gen.world;

  const anchor = world.rooms.find(room => room?.defId === SLIME_NII_ENTRY_ANCHOR);
  assert.ok(anchor, 'у НИИ слизи нет комнаты-якоря экскурсии');
  const gallery = world.rooms.find(room => room?.defId === SLIME_NII_GALLERY_ANCHOR);
  assert.ok(gallery, 'смотровая галерея не вырыта');

  const player = makeTestPlayer({ x: gen.spawnX, y: gen.spawnY, angle: 0 });
  const entities: Entity[] = [player, ...gen.entities];
  const state = makeGameState({ currentZ: SLIME_NII_Z });
  setCurrentPlayerEntity(player);

  /* Население этажа берётся ТЕМ ЖЕ шагом, что и в игре. Генерация НИИ выкладывает
   * три с половиной тысячи шаблонных жильцов — больше мягкого предела акторов
   * целиком, — а на загрузке этажа A-Life меняет их на свой пул и оставляет около
   * двух с половиной тысяч. Без этого шага у сцены НОЛЬ мест под спавн, и замок
   * краснел бы на пустом кастe там, где игра ставит его полностью. */
  materializeAlifeFloorPopulation(state, world, entities, { v: 800_000 }, designNpcFloorKey('slime_nii'));
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
  assert.equal(isFloorSceneActive(), true, 'экскурсия не поднялась на первом визите');

  const cast = entities.filter(e => !before.has(e.id) || e.cinematicState !== undefined);
  resetFloorScenes();
  return { world, entities, anchor: anchor!, gallery: gallery!, spawnX: gen.spawnX, spawnY: gen.spawnY, cast };
}

let cached: Stage | undefined;
function slimeNiiStage(): Stage {
  cached = cached ?? stageSlimeNii();
  return cached;
}

test('экскурсия по НИИ слизи объявлена на своём этаже и никого не выпускает', () => {
  assert.ok(scene, 'сцена не зарегистрирована');
  assert.equal(scene!.floorKey, designNpcFloorKey('slime_nii'));
  assert.equal(scene!.trigger.kind, 'first_visit');
  assert.equal(scene!.anchorRoomAlias, SLIME_NII_ENTRY_ANCHOR);
  assert.ok(scene!.maxSeconds > 0, 'у сцены обязан быть потолок проигрывания');

  // Тварей экскурсия показывает, а не спускает: такта `release` тут быть не должно.
  assert.equal(scene!.beats.some(beat => beat.kind === 'release'), false,
    'экскурсия отпускает актёров — твари выйдут из камер в кадре');

  const roles = new Set(scene!.actors.map(actor => actor.role));
  for (const beat of scene!.beats) {
    for (const role of beatRoles(beat)) {
      assert.ok(roles.has(role), `такт ${beat.kind} зовёт роль «${role}», которой нет в актёрах`);
    }
  }
  assert.ok(scene!.actors.some(actor => actor.monster !== undefined), 'в камерах никого нет');
});

test('якорь и галерея экскурсии вырыты на живом этаже', () => {
  const stage = slimeNiiStage();
  const { world, anchor, gallery } = stage;

  // Смещения точек кадра считаются от центра якоря, и сцена знает его цифрой.
  assert.equal(anchor.x + anchor.w / 2, 512, 'центр якоря уехал по X — все смещения сцены врут');
  assert.equal(anchor.y + anchor.h / 2, 688, 'центр якоря уехал по Y — все смещения сцены врут');

  assert.equal(gallery.x, GALLERY_X);
  assert.equal(gallery.w, GALLERY_W);

  const cameras = world.rooms.filter(room => room?.name.startsWith(SLIME_NII_CAMERA_ROOM_PREFIX) && room.x < 512);
  assert.ok(cameras.length >= CAMERA_ROWS.length, 'западная батарея гермокамер не собрана');

  const midX = GALLERY_X + (GALLERY_W >> 1);
  for (const row of CAMERA_ROWS) {
    // Галерея идёт вдоль дверей и потому обязана накрывать каждый их ряд.
    assert.ok(row > gallery.y && row < gallery.y + gallery.h, `ряд ${row} не лежит в галерее`);
    assert.equal(roomAt(world, midX, row)?.defId, SLIME_NII_GALLERY_ANCHOR,
      `точка галереи (${midX}, ${row}) лежит вне галереи`);
    assert.equal(world.solid(midX, row), false, `точка галереи (${midX}, ${row}) непроходима`);
  }
});

test('маршрут экскурсии проходим, а камеры остаются камерами', () => {
  const stage = slimeNiiStage();
  const { world } = stage;
  const sx = Math.floor(stage.spawnX);
  const sy = Math.floor(stage.spawnY);
  const anchorX = stage.anchor.x + stage.anchor.w / 2;
  const anchorY = stage.anchor.y + stage.anchor.h / 2;

  const chamberCells = new Set<number>();
  for (const room of world.rooms) {
    if (!room?.name.startsWith(SLIME_NII_CAMERA_ROOM_PREFIX)) continue;
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) chamberCells.add(world.idx(room.x + dx, room.y + dy));
    }
  }

  // Взгляд вправе упираться в гермодверь: смотреть на пломбу — это кадр, а не
  // промах. Требование к нему одно — попасть в дверь или в проходимую клетку.
  for (const beat of scene!.beats) {
    for (const spot of beatGazes(beat)) {
      if (!isOffsetSpot(spot)) continue;
      const x = Math.floor(anchorX + spot.ox);
      const y = Math.floor(anchorY + spot.oy);
      const door = world.doors.get(world.idx(x, y));
      assert.ok(door !== undefined || !world.solid(x, y), `взгляд кадра упёрт в глухой бетон (${x}, ${y})`);
    }
  }

  let chamberShots = 0;
  for (const beat of scene!.beats) {
    for (const spot of beatDestinations(beat)) {
      if (!isOffsetSpot(spot)) continue;
      const x = Math.floor(anchorX + spot.ox);
      const y = Math.floor(anchorY + spot.oy);
      assert.equal(world.solid(x, y), false, `точка кадра (${x}, ${y}) лежит в бетоне`);

      if (chamberCells.has(world.idx(x, y))) {
        // Внутрь камеры кадр заходит сквозь гермодверь: она есть у камеры и её
        // не проходит никто, кроме камеры кадра, — тем и держится содержимое.
        const room = roomAt(world, x, y);
        assert.ok(room && room.doors.length > 0, `у камеры на (${x}, ${y}) нет двери`);
        chamberShots++;
        continue;
      }
      // Всё, что снаружи камер, обязано быть достижимо обычной ходьбой: иначе
      // кадр летит напрямую сквозь планировку, а игрок туда не придёт вовсе.
      assert.ok(bfsPath(world, sx, sy, x, y).length > 0,
        `точка кадра (${x}, ${y}) отрезана от точки высадки игрока`);
    }
  }
  assert.ok(chamberShots > 0, 'экскурсия ни разу не заглядывает в камеру');
});

test('каст экскурсии стоит по местам, а твари — внутри своих камер', () => {
  const stage = slimeNiiStage();
  const { world, cast } = stage;

  const people = cast.filter(e => e.type === EntityType.NPC && e.alive);
  const monsters = cast.filter(e => e.type === EntityType.MONSTER && e.alive);
  assert.ok(people.length >= 10, `смена института не набралась: ${people.length} человек`);
  assert.ok(monsters.length > 0, 'твари в камеры не поставлены');

  for (const monster of monsters) {
    const room = roomAt(world, monster.x, monster.y);
    assert.ok(room?.name.startsWith(SLIME_NII_CAMERA_ROOM_PREFIX),
      `тварь сцены стоит в «${room?.name ?? 'коридоре'}», а не в гермокамере`);
    assert.equal(room!.sealed, true, `камера «${room!.name}» не запечатана — тварь выйдет`);

    /* И главное: по концу сцены проигрыватель отпускает ВЕСЬ каст сам, поэтому
     * тварь держит не такт, а дверь. Закрытая створка (`CLOSED`) для неё не
     * преграда — путь ей закрывают только замок и герма. */
    for (const idx of room!.doors) {
      const door = world.doors.get(idx);
      assert.ok(
        door && (door.state === DoorState.LOCKED || door.state === DoorState.HERMETIC_CLOSED),
        `камера «${room!.name}» держится на створке ${door?.state}: отпущенная тварь выйдет в галерею`,
      );
    }
  }

  // Директор ведёт экскурсию сама: сцена её зовёт, а не создаёт заново.
  const guide = cast.find(e => (e as Entity & { npcPackageId?: string }).npcPackageId === 'slime_nii_director_larisa');
  assert.ok(guide, 'Лариса Гладкая не вызвана в кадр');
});

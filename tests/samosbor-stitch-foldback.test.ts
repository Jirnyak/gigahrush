/* Замок на конец самосбора: свёртка в A-Life и уборка после стича.
 *
 * Цена ошибки здесь двойная и обе половины закрепляют друг друга.
 *
 *   1. СТИЧ ЗАМУРОВЫВАЕТ. `applyFrontFieldStitch` пишет клетки поля и не
 *      смотрит, кто на них стоял. Клетка, чья замена — стена, оставляет тело
 *      ВНУТРИ геометрии: `world.solid()` под ним истинно, путь наружу не
 *      строится, человек выключен из симуляции навсегда. Замер на пяти живых
 *      прогонах (z = 0/14/-26/30): 2117 акторов внутри стен после стича.
 *      Ящик при этом держал `roomId` комнаты, которая клеткой больше не
 *      владеет, — 109 битых записей на тех же пяти прогонах.
 *
 *   2. СВЁРТКА ОПАЗДЫВАЛА. Свернуть живое состояние в A-Life до перестройки
 *      было некому: единственный самосборный вызов `captureCurrentAlifeFloor()`
 *      сидел в `main.ts` под `if (updateSamosbor(...))`, а все четыре `return`
 *      этой функции возвращают `false`. Записи держали до-самосборные
 *      координаты до следующего выхода с этажа — и тогда в запись уходили
 *      координаты уже испорченного тела. Если бы свёртка встала ПОСЛЕ стича,
 *      было бы то же самое: A-Life запомнила бы не где человек жил, а куда его
 *      откинуло переселение.
 *
 * Поэтому проверяется именно ПОРЯДОК: запись хранит координаты ДО стича, а тело
 * после стича стоит на проходимой клетке.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Cell,
  EntityType,
  Faction,
  RoomType,
  Tex,
  type Entity,
  type GameState,
  type Room,
} from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { ensureAlifeState, setAlifeState } from '../src/systems/alife';
import { abortSamosborRuntime, updateSamosbor } from '../src/systems/samosbor';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { makeGameState, makeTestContainer } from './helpers';

const BLOCK_X = 200;
const BLOCK_Y = 200;
const BLOCK_W = 224;
const BLOCK_H = 224;

/** `open` — открытый зал, где фронтам есть куда идти, а телам где стоять.
 *  `lattice` — замена: решётка коридоров через 8 клеток. Настоящий генератор
 *  тоже отдаёт стены вперемешку с проходами, и такая замена честно ставит
 *  стену там, где тело стояло, не выжигая при этом пол целиком. */
function hallWorld(shape: 'open' | 'lattice'): World {
  const world = new World();
  const room: Room = {
    id: 0,
    type: RoomType.COMMON,
    x: BLOCK_X,
    y: BLOCK_Y,
    w: BLOCK_W,
    h: BLOCK_H,
    doors: [],
    sealed: false,
    name: 'Зал',
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  };
  world.rooms = [room];
  world.cells.fill(Cell.WALL);
  for (let y = BLOCK_Y; y < BLOCK_Y + BLOCK_H; y++) {
    for (let x = BLOCK_X; x < BLOCK_X + BLOCK_W; x++) {
      const ci = world.idx(x, y);
      const floor = shape === 'open' || x % 8 === 0 || y % 8 === 0;
      world.cells[ci] = floor ? Cell.FLOOR : Cell.WALL;
      world.roomMap[ci] = floor ? 0 : -1;
      world.floorTex[ci] = Tex.F_CONCRETE;
      world.wallTex[ci] = Tex.CONCRETE;
    }
  }
  return world;
}

function actor(id: number, type: EntityType, x: number, y: number): Entity {
  return {
    id,
    type,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: type === EntityType.MONSTER ? Faction.WILD : Faction.CIVILIAN,
  };
}

function blockedActors(world: World, entities: readonly Entity[]): Entity[] {
  return entities.filter(e =>
    e.alive
    && (e.type === EntityType.NPC || e.type === EntityType.MONSTER || e.type === EntityType.PLAYER)
    && world.solid(Math.floor(e.x), Math.floor(e.y)));
}

interface Scene {
  world: World;
  entities: Entity[];
  state: GameState;
  npcs: Entity[];
  nextId: { v: number };
}

function buildScene(): Scene {
  seedGlobalRng(90_210);
  const world = hallWorld('open');
  const state = makeGameState({ currentZ: 0 });
  setFloorRunState(state, { runSeed: 4242 }, 0);
  setAlifeState(state, { seed: 4242, total: 256 }, { populationPlan: 'empty_packages' });
  const alife = ensureAlifeState(state);

  const nextId = { v: 500_000 };
  const entities: Entity[] = [];
  const player = actor(nextId.v++, EntityType.PLAYER, BLOCK_X + 1, BLOCK_Y + 1);
  entities.push(player);

  /* Сетка по всему залу: поле фронтов ложится пятнами, и кучка тел в одном углу
   * сделала бы тест лотереей — накрыло или нет. */
  const npcs: Entity[] = [];
  const step = 14;
  let slot = 0;
  let cell = 0;
  for (let gy = 2; gy < BLOCK_H - 2; gy += step) {
    for (let gx = 2; gx < BLOCK_W - 2; gx += step, cell++) {
      const x = BLOCK_X + gx;
      const y = BLOCK_Y + gy;
      if (cell % 2 === 0) {
        const record = alife.npcs[slot++];
        const e = actor(nextId.v++, EntityType.NPC, x, y);
        e.alifeId = record.id;
        /* Метка-часовой: если свёртка не произойдёт вовсе, запись останется
         * здесь, и тест не спутает «свернулось» с «совпало случайно». */
        record.x = 1.5;
        record.y = 1.5;
        npcs.push(e);
        entities.push(e);
      } else {
        entities.push(actor(nextId.v++, EntityType.MONSTER, x, y));
      }
    }
  }

  for (let gy = 8; gy < BLOCK_H - 8; gy += 26) {
    for (let gx = 8; gx < BLOCK_W - 8; gx += 26) {
      const cx = BLOCK_X + gx;
      const cy = BLOCK_Y + gy;
      world.addContainer(makeTestContainer({
        id: world.containers.length + 1,
        x: cx,
        y: cy,
        z: 0,
        roomId: 0,
        zoneId: world.zoneMap[world.idx(cx, cy)],
      }));
    }
  }

  return { world, entities, state, npcs, nextId };
}

/** Прогон до конца активной фазы и принудительный отбой. Сетка тел плюс
 *  решётчатая замена дают поле, которое накрывает стеной заведомо не одно тело,
 *  — дефект виден без удачи сида. */
function runSamosborToStitch(scene: Scene): { before: Map<number, { x: number; y: number }> } {
  const { world, entities, state, nextId } = scene;
  const replacement = { world: hallWorld('lattice'), entities: [] as Entity[], spawnX: BLOCK_X + 1, spawnY: BLOCK_Y + 1 };
  const provider = () => replacement;

  state.samosborTimer = 0;
  const dt = 0.05;
  // Пуск + активная фаза: фронтам нужно время, чтобы наметить поле.
  for (let i = 0; i < 240; i++) {
    updateSamosbor(world, entities, state, dt, nextId, provider, undefined);
    state.time += dt;
    if (!state.samosborActive) break;
  }
  assert.equal(state.samosborActive, true, 'активная фаза должна идти к моменту принудительного отбоя');

  const before = new Map<number, { x: number; y: number }>();
  for (const e of entities) before.set(e.id, { x: e.x, y: e.y });

  state.samosborTimer = 0;
  updateSamosbor(world, entities, state, dt, nextId, provider, undefined);
  assert.equal(state.samosborActive, false, 'отбой должен закрыть активную фазу и сшить поле');
  return { before };
}

test('после стича самосбора ни один актор не остаётся внутри геометрии', () => {
  const scene = buildScene();
  try {
    const { before } = runSamosborToStitch(scene);

    const walled = blockedActors(scene.world, scene.entities);
    assert.deepEqual(
      walled.slice(0, 8).map(e => `${e.type}@${Math.floor(e.x)},${Math.floor(e.y)}`),
      [],
      `${walled.length} акторов замуровано стичем: наружу они уже не выйдут`,
    );

    // Переселение обязано было СРАБОТАТЬ, а не просто ничего не найти: если поле
    // никого не накрыло, тест зелёный по случайности и дефект не сторожит.
    const moved = scene.entities.filter(e => {
      const was = before.get(e.id);
      return was !== undefined && e.alive && (was.x !== e.x || was.y !== e.y);
    });
    assert.ok(moved.length > 0, 'стич должен был накрыть геометрией хотя бы одно тело и переселить его');
  } finally {
    abortSamosborRuntime();
  }
});

test('стич не оставляет ящик ни в стене, ни за чужой комнатой', () => {
  const scene = buildScene();
  try {
    runSamosborToStitch(scene);
    const { world } = scene;
    const broken: string[] = [];
    for (const c of world.containers) {
      const ci = world.idx(c.x, c.y);
      if (world.solid(c.x, c.y)) broken.push(`${c.x},${c.y} в стене`);
      else if (world.roomMap[ci] !== c.roomId) broken.push(`${c.x},${c.y} комната ${c.roomId} vs ${world.roomMap[ci]}`);
    }
    assert.deepEqual(broken.slice(0, 8), [], `${broken.length} ящиков потеряли клетку или комнату`);
    // Карта контейнеров обязана указывать на то, что осталось в списке.
    for (const c of world.containers) {
      assert.ok(world.containersAt(c.x, c.y).includes(c), `ящик ${c.x},${c.y} должен находиться по своей клетке`);
    }
  } finally {
    abortSamosborRuntime();
  }
});

test('координаты живых сворачиваются в A-Life ДО перестройки, а не после', () => {
  const scene = buildScene();
  try {
    const { before } = runSamosborToStitch(scene);
    const alife = ensureAlifeState(scene.state);

    let folded = 0;
    let provedOrder = 0;
    for (const npc of scene.npcs) {
      if (!npc.alive || npc.alifeId === undefined) continue;
      const record = alife.npcs[npc.alifeId - 1];
      assert.ok(record, `у ${npc.id} должна быть запись A-Life`);
      const was = before.get(npc.id);
      assert.ok(was);
      assert.notEqual(`${record.x},${record.y}`, '1.5,1.5', `запись ${npc.alifeId} не свернулась вовсе`);
      assert.equal(record.x, was.x, `запись ${npc.alifeId} держит координату не до стича`);
      assert.equal(record.y, was.y, `запись ${npc.alifeId} держит координату не до стича`);
      folded++;
      if (npc.x !== was.x || npc.y !== was.y) provedOrder++;
    }
    assert.ok(folded > 0, 'хотя бы одна личность должна была свернуться');
    assert.ok(
      provedOrder > 0,
      'нужен хотя бы один переселённый человек: только на нём видно, что свёртка идёт ПЕРЕД стичем',
    );
  } finally {
    abortSamosborRuntime();
  }
});

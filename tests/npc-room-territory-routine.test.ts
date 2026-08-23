import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, NpcState, Occupation, RoomType, type Entity, type GameClock, ZoneFaction } from '../src/core/types';
import { World } from '../src/core/world';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { setNpcContext, updateNPC } from '../src/systems/ai/npc_fsm';
import {
  actorDrive, forgetActorBrain, setActorCoreContext, tickActorBrain,
} from '../src/systems/actor/brain';
import { rebuildCrowdIndex } from '../src/world/crowd_index';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { addTestRoom, makeTestPlayer } from './helpers';

/** Цель рутины — СВОЯ точка внутри комнаты, а не её центр: `roomTargetCell`
 *  разводит жильцов по площади, иначе центр комнаты работает аттрактором и вся
 *  рутина этажа сходится в одну клетку. Проверяется выбор КОМНАТЫ, поэтому
 *  сверяется попадание цели в её прямоугольник, а не конкретная клетка. */
function assertTargetInRoom(
  npc: Entity,
  room: { x: number; y: number; w: number; h: number },
  message?: string,
): void {
  const tx = npc.ai?.tx ?? -1;
  const ty = npc.ai?.ty ?? -1;
  assert.ok(
    tx > room.x && tx < room.x + room.w && ty > room.y && ty < room.y + room.h,
    `${message ?? 'цель должна лежать в выбранной комнате'}: цель (${tx}, ${ty}), `
    + `комната [${room.x}..${room.x + room.w}) x [${room.y}..${room.y + room.h})`,
  );
}


function makeRoutineWorld(): World {
  const world = new World();
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  return world;
}

function makeNpc(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x: 8.5,
    y: 8.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: Faction.CITIZEN,
    occupation: Occupation.MECHANIC,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function tickNpc(world: World, npc: Entity, clock: GameClock = { hour: 9, minute: 0, totalMinutes: 540 }): void {
  const player = makeTestPlayer({ id: 1, x: 90, y: 90 });
  const entities = [player, npc];
  rebuildEntityIndexForSimulation(entities, clock.totalMinutes);
  setPathContext([], clock.totalMinutes);
  setNpcContext([], clock.totalMinutes);
  updateNPC(world, entities, npc, 0, clock.totalMinutes, clock, false);
}

/* ── Тело ходит через ядро актора ─────────────────────────────────────────
 *
 * Голод, жажда, сон, туалет и лечение уехали из рутины прежнего слоя в
 * `systems/actor`, поэтому телесные проверки обязаны гонять цикл ЯДРА. Ядро
 * решает по своей паузе, расфазированной от `id` и выведенной из такта полей
 * (не больше четырёх секунд), а исполняет каждый кадр, — значит одного такта
 * мало ни для решения, ни тем более для дороги.
 *
 * `CORE_DECIDE_STEPS` — сколько тактов нужно, чтобы решение точно состоялось;
 * `CORE_WALK_STEPS` — с запасом на дорогу через весь тестовый этаж пешком.
 */
const CORE_DT = 0.5;
const CORE_DECIDE_STEPS = Math.ceil(4 / CORE_DT) + 1;
const CORE_WALK_STEPS = 160;

function runCore(world: World, npc: Entity, steps: number, bystanders: readonly Entity[] = []): void {
  const entities = [makeTestPlayer({ id: 1, x: 90, y: 90 }), ...bystanders, npc];
  forgetActorBrain(npc);
  setActorCoreContext(0);
  for (let step = 0; step < steps; step++) {
    const now = step * CORE_DT;
    rebuildEntityIndexForSimulation(entities, now);
    rebuildCrowdIndex(world, entities, now);
    setPathContext([], now);
    setNpcContext([], now, 0);
    tickActorBrain(world, npc, CORE_DT, now);
  }
}

function markSurfaceCell(world: World, x: number, y: number, alpha = 220): number {
  const idx = world.idx(x, y);
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 120;
    pixels[i + 1] = 30;
    pixels[i + 2] = 25;
    pixels[i + 3] = alpha;
  }
  world.surfaceMap.set(idx, pixels);
  world.markSurfaceCellDirty(idx);
  return idx;
}

function alphaSum(world: World, idx: number): number {
  const pixels = world.surfaceMap.get(idx);
  if (!pixels) return 0;
  let sum = 0;
  for (let i = 3; i < pixels.length; i += 4) sum += pixels[i];
  return sum;
}

test('routine thirst prefers a friendly kitchen over a closer hostile kitchen', () => {
  const world = makeRoutineWorld();
  addTestRoom(world, { id: 1, x: 12, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 1, zoneFaction: ZoneFaction.CULTIST });
  const friendly = addTestRoom(world, { id: 2, x: 54, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(10, { needs: { food: 90, water: 0, sleep: 100, pee: 0, poo: 0 } });

  // Дорога проходится целиком: отметка занятия ставится ПО ПРИБЫТИИ, и только
  // по ней `systems/needs.ts` отличает «сел обедать» от «стоит у кухни».
  runCore(world, npc, CORE_WALK_STEPS);

  assert.equal(actorDrive(npc), 'drink');
  assertTargetInRoom(npc, friendly);
  assert.equal(world.roomAt(npc.x, npc.y)?.id, friendly.id, 'должен дойти до дружественной кухни');
  assert.equal(npc.ai?.npcState, NpcState.LUNCH);
});

test('routine toilet pressure avoids hostile bathroom when a friendly bathroom is reachable', () => {
  const world = makeRoutineWorld();
  addTestRoom(world, { id: 1, x: 13, y: 8, w: 5, h: 5, type: RoomType.BATHROOM, zoneId: 1, zoneFaction: ZoneFaction.WILD });
  const friendly = addTestRoom(world, { id: 2, x: 42, y: 8, w: 5, h: 5, type: RoomType.BATHROOM, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(11, { needs: { food: 100, water: 100, sleep: 100, pee: 96, poo: 80 } });

  runCore(world, npc, CORE_DECIDE_STEPS);

  assert.equal(actorDrive(npc), 'toilet');
  assertTargetInRoom(npc, friendly);
});

test('routine work uses an assigned work room only when the room is friendly', () => {
  const world = makeRoutineWorld();
  const hostileAssigned = addTestRoom(world, { id: 1, x: 14, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 1, zoneFaction: ZoneFaction.CULTIST });
  const friendly = addTestRoom(world, { id: 2, x: 52, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(12, {
    assignedRoomId: hostileAssigned.id,
    occupation: Occupation.MECHANIC,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
  });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.WORK);
  assert.equal(npc.ai?.npcState, NpcState.WORKING);
  assertTargetInRoom(npc, friendly);
});

test('routine work keeps a friendly assigned work room as the strongest anchor', () => {
  const world = makeRoutineWorld();
  const assigned = addTestRoom(world, { id: 1, x: 36, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  addTestRoom(world, { id: 2, x: 14, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(13, {
    assignedRoomId: assigned.id,
    occupation: Occupation.MECHANIC,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
  });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.WORK);
  assertTargetInRoom(npc, assigned);
});

test('cleaner work routine wipes nearby friendly surface marks without scanning the floor', () => {
  const world = makeRoutineWorld();
  const assigned = addTestRoom(world, { id: 1, x: 6, y: 6, w: 6, h: 6, type: RoomType.COMMON, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  const dirtyIdx = markSurfaceCell(world, 8, 8);
  const beforeAlpha = alphaSum(world, dirtyIdx);
  const beforeVersion = world.surfaceVersion;
  const npc = makeNpc(17, {
    x: 8.5,
    y: 8.5,
    assignedRoomId: assigned.id,
    occupation: Occupation.CLEANER,
    sprite: Occupation.CLEANER,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
  });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.WORK);
  assert.ok(alphaSum(world, dirtyIdx) < beforeAlpha);
  assert.ok(world.surfaceVersion > beforeVersion);
});

test('routine work can target an assigned room beyond the first scan window', () => {
  const world = makeRoutineWorld();
  for (let id = 1; id <= 130; id++) {
    addTestRoom(world, {
      id,
      x: 4 + (id % 12) * 7,
      y: 4 + Math.floor(id / 12) * 7,
      w: 4,
      h: 4,
      type: RoomType.STORAGE,
      zoneId: id,
      zoneFaction: ZoneFaction.CITIZEN,
    });
  }
  const assigned = addTestRoom(world, { id: 160, x: 58, y: 58, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 160, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(15, {
    assignedRoomId: assigned.id,
    occupation: Occupation.MECHANIC,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
  });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.WORK);
  assertTargetInRoom(npc, assigned);
});

/* Прежде это проверялось так: «домашняя привязка глушит рутину путешественника».
 * Глушить больше нечего и незачем — тело идёт через ядро актора, а ядро стоит
 * ПЕРЕД прежним слоем и забирает актора себе, как только тяга выше порога. То
 * есть подавление рутины стало структурным и от ремесла не зависит вовсе:
 * охотник-путешественник со сном на нуле обязан лечь спать так же, как любой
 * житель. Проверяется теперь именно это, вместе с отметкой занятия — по ней
 * `systems/needs.ts` и восстанавливает сон. */
test('сонного ведёт спать домой независимо от ремесла, и по прибытии он ложится', () => {
  const world = makeRoutineWorld();
  const home = addTestRoom(world, {
    id: 1,
    x: 54,
    y: 8,
    w: 6,
    h: 6,
    type: RoomType.LIVING,
    zoneId: 1,
    zoneFaction: ZoneFaction.CITIZEN,
    apartmentId: 42,
  });
  const npc = makeNpc(16, {
    occupation: Occupation.HUNTER,
    familyId: 42,
    isTraveler: false,
    needs: { food: 100, water: 100, sleep: 0, pee: 0, poo: 0 },
  });

  runCore(world, npc, CORE_WALK_STEPS);

  assert.equal(actorDrive(npc), 'sleep');
  assertTargetInRoom(npc, home);
  assert.equal(world.roomAt(npc.x, npc.y)?.id, home.id, 'должен дойти до жилой комнаты');
  assert.equal(npc.ai?.npcState, NpcState.SLEEPING);
});

test('survival need can trespass only after no friendly room candidate exists', () => {
  const world = makeRoutineWorld();
  const hostileKitchen = addTestRoom(world, { id: 1, x: 16, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 1, zoneFaction: ZoneFaction.CULTIST });
  const npc = makeNpc(14, { needs: { food: 100, water: 0, sleep: 100, pee: 0, poo: 0 } });

  runCore(world, npc, CORE_DECIDE_STEPS);

  assert.equal(actorDrive(npc), 'drink');
  assertTargetInRoom(npc, hostileKitchen);
});

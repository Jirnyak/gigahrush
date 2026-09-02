/**
 * Замок класса: «объявленная сюжетная комната Мясного низа обязана штамповаться».
 *
 * Дефект, который тест ловит, был не в данных, а в доставке: `PLOT_ROOMS`
 * объявлял девять комнат, `stampPlotRoom` в `gen/hell/plot_chain.ts` был
 * типизирован литералом ровно на одну (`'hell_anchor_zone'`), и «Обожжённая
 * сторожка» с «Порогом Вестников» физически не могли через него пройти. Слухи и
 * контракты при этом продолжали в них вести.
 *
 * Тест не перечисляет три имени. Он берёт СВЯЗЬ: любая запись `PLOT_ROOMS`,
 * на которую ссылается авторский указатель Мясного низа (слух с `lead.z === -36`,
 * контракт с `target.z === -36`, шаг сюжета с `targetFloorZ === -36`), обязана
 * стоять на сгенерированном этаже, нести `defId` и быть достижимой обычной
 * ходьбой. Следующая забытая комната покраснеет сама.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { CONTRACTS, contractToQuest } from '../src/data/contracts';
import { PLOT_CHAIN } from '../src/data/plot';
import { PLOT_ROOMS } from '../src/data/plot_rooms';
import { RUMORS } from '../src/data/rumors';
import { Cell, EntityType, W, type Entity, type Room } from '../src/core/types';
import type { World } from '../src/core/world';
import { resolveQuestTargetRoom } from '../src/systems/contracts';
import { HERALD_THRESHOLD_ZONE_TAG } from '../src/gen/hell/plot_chain';

const HELL_Z = -36;
const SEEDS = [1, 7, 4242, 99991] as const;

type Generation = ReturnType<typeof generateDesignFloor>;

const cache = new Map<number, Generation>();

function hellFloor(seed: number): Generation {
  let gen = cache.get(seed);
  if (!gen) {
    gen = generateDesignFloor('hell', seed);
    cache.set(seed, gen);
  }
  return gen;
}

/** Имена комнат, на которые указывает авторский контент Мясного низа. */
function hellPointerRoomNames(): Set<string> {
  const names = new Set<string>();
  for (const rumor of RUMORS) {
    const lead = rumor.lead;
    if (lead?.z === HELL_Z && lead.roomDefId) names.add(lead.roomDefId);
  }
  for (const contract of CONTRACTS) {
    if (contract.target.z === HELL_Z && contract.target.roomDefId) names.add(contract.target.roomDefId);
  }
  for (const step of PLOT_CHAIN) {
    if (step.targetFloorZ === HELL_Z && step.targetRoomDefId) names.add(step.targetRoomDefId);
  }
  return names;
}

/** Объявленные сюжетные комнаты, которые этот этаж обязан доставить. */
function requiredHellPlotRoomNames(): string[] {
  const pointed = hellPointerRoomNames();
  return Object.values(PLOT_ROOMS).map(def => def.name).filter(name => pointed.has(name));
}

function walkable(world: World, ci: number): boolean {
  const cell = world.cells[ci];
  return cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER;
}

/** Достижимость ОБЫЧНОЙ ХОДЬБОЙ: без пси-дефазинга и без разрушения стен. */
function walkReachable(world: World, sx: number, sy: number, target: number): boolean {
  const start = world.idx(Math.floor(sx), Math.floor(sy));
  if (!walkable(world, start) || !walkable(world, target)) return false;
  const seen = new Uint8Array(W * W);
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const ci = queue[head++];
    if (ci === target) return true;
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = world.idx(x + dx, y + dy);
      if (seen[ni] || !walkable(world, ni)) continue;
      seen[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return false;
}

function roomByAddress(world: World, name: string): Room | undefined {
  return world.rooms.find(room => room && (room.defId === name || room.name === name));
}

function firstWalkableCellOf(world: World, room: Room): number {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(world.wrap(room.x + dx), world.wrap(room.y + dy));
      if (walkable(world, ci)) return ci;
    }
  }
  return -1;
}

function monsterKindsOf(entities: readonly Entity[]): Set<number> {
  const kinds = new Set<number>();
  for (const e of entities) {
    if (e.alive && e.type === EntityType.MONSTER && e.monsterKind !== undefined) kinds.add(e.monsterKind);
  }
  return kinds;
}

test('каждая объявленная сюжетная комната Мясного низа штампуется и адресуется по defId', () => {
  const required = requiredHellPlotRoomNames();
  assert.ok(required.length >= 3, `авторские указатели Мясного низа исчезли: ${required.length}`);

  for (const seed of SEEDS) {
    const { world } = hellFloor(seed);
    for (const name of required) {
      const room = roomByAddress(world, name);
      assert.ok(room, `seed=${seed}: сюжетная комната «${name}» не поставлена на этаж`);
      assert.equal(room.defId, name, `seed=${seed}: «${name}» не несёт defId, поиск по адресу её не найдёт`);
    }
  }
});

test('сюжетные комнаты Мясного низа достижимы обычной ходьбой от точки входа', () => {
  const required = requiredHellPlotRoomNames();
  for (const seed of SEEDS) {
    const gen = hellFloor(seed);
    for (const name of required) {
      const room = roomByAddress(gen.world, name)!;
      const target = firstWalkableCellOf(gen.world, room);
      assert.notEqual(target, -1, `seed=${seed}: в «${name}» нет ни одной проходимой клетки`);
      assert.ok(
        walkReachable(gen.world, gen.spawnX, gen.spawnY, target),
        `seed=${seed}: «${name}» недостижима обычной ходьбой`,
      );
    }
  }
});

test('зонный тег порога Вестников резолвится через помеченный ящик', () => {
  const threshold = CONTRACTS.filter(c => c.target.z === HELL_Z && c.target.zoneTag === HERALD_THRESHOLD_ZONE_TAG);
  assert.ok(threshold.length >= 2, `контракты порога исчезли: ${threshold.length}`);

  for (const seed of SEEDS) {
    const gen = hellFloor(seed);
    for (const def of threshold) {
      const quest = contractToQuest(def, 1);
      const resolved = resolveQuestTargetRoom(gen.world, quest, { x: gen.spawnX, y: gen.spawnY } as Entity);
      assert.ok(resolved, `seed=${seed}: контракт ${def.id} не нашёл цель`);
      assert.equal(
        resolved.source, 'tagged_container',
        `seed=${seed}: контракт ${def.id} уехал в случайную комнату — тег «${HERALD_THRESHOLD_ZONE_TAG}» не проставлен`,
      );
    }
  }
});

test('монстры, обещанные слухом в сюжетной комнате Мясного низа, стоят на этаже', () => {
  const required = new Set(requiredHellPlotRoomNames());
  const promised = RUMORS.filter(r =>
    r.lead?.z === HELL_Z
    && r.lead.roomDefId !== undefined
    && required.has(r.lead.roomDefId)
    && r.lead.monsterKind !== undefined);
  assert.ok(promised.length >= 4, `слухи сюжетных комнат Мясного низа исчезли: ${promised.length}`);

  for (const seed of SEEDS) {
    const gen = hellFloor(seed);
    const kinds = monsterKindsOf(gen.entities);
    for (const rumor of promised) {
      assert.ok(
        kinds.has(rumor.lead!.monsterKind!),
        `seed=${seed}: слух ${rumor.id} ведёт в «${rumor.lead!.roomDefId}» за монстром, которого на этаже нет`,
      );
    }
  }
});

test('контракт на Вестника закрывается игрой: цель стоит на этаже', () => {
  const kills = CONTRACTS.filter(c =>
    c.target.z === HELL_Z
    && c.target.zoneTag === HERALD_THRESHOLD_ZONE_TAG
    && c.targetMonsterKind !== undefined);
  assert.ok(kills.length >= 1, 'контракт на Вестника исчез');

  for (const seed of SEEDS) {
    const kinds = monsterKindsOf(hellFloor(seed).entities);
    for (const def of kills) {
      assert.ok(
        kinds.has(def.targetMonsterKind!),
        `seed=${seed}: ${def.id} требует убить монстра, которого генерация не ставит`,
      );
    }
  }
});

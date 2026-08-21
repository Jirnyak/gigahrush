/* Замок на договор стартового сиквенса (`data/tutorial_start.ts`).
 *
 * Сиквенс рабочий, и портится он не поломкой, а добавлением контента: кто-то
 * переносит комнату, переименовывает тег, кладёт ключ не туда — и шаги молча
 * разъезжаются с интерфейсом, потому что тот ищет цели ПО СМЫСЛУ, а не по
 * координатам. Здесь проверяется ровно то, на что он смотрит, и ничего больше:
 * размеры, обстановка и место стартовых комнат остаются свободными.
 *
 * Отдельно проверяется достижимость: ключ обязан лежать ДО запертой двери, а не
 * за ней. Это тот же класс, что сломал пролёт камеры пролога, — стартовая зона
 * закрыта замком, и всё, что предполагает выход из неё, обязано это учитывать.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, Feature, type Entity } from '../src/core/types';
import { TUTORIAL_START } from '../src/data/tutorial_start';
import { generateFloor } from '../src/gen/floor_manifest';
import { bfsPath } from '../src/systems/ai/pathfinding';
import type { World } from '../src/core/world';

const SEEDS = [61_061, 7, 12_345];

function tutorialRooms(world: World) {
  return world.rooms.filter(room => room.tags?.includes(TUTORIAL_START.roomTag));
}

function featureSpot(world: World, feature: Feature): { x: number; y: number } | null {
  for (const room of tutorialRooms(world)) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (world.features[world.idx(x, y)] === feature) return { x, y };
      }
    }
  }
  return null;
}

function keyDrop(entities: readonly Entity[]): Entity | null {
  for (const e of entities) {
    if (e.type !== EntityType.ITEM_DROP || !e.alive) continue;
    if (e.inventory?.some(item => item.defId === TUTORIAL_START.keyId)) return e;
  }
  return null;
}

test('tutorial start places every mark the on-screen guide looks for', () => {
  for (const seed of SEEDS) {
    const gen = generateFloor(0, seed, true);
    const world = gen.world;
    const rooms = tutorialRooms(world);

    assert.ok(rooms.length >= 2,
      `сид ${seed}: комнат с тегом "${TUTORIAL_START.roomTag}" найдено ${rooms.length}, а сиквенсу нужны обе`);

    // ШАГ 1 и ШАГ 2 — раковина и уборная. Гид ищет их как Feature внутри
    // помеченной комнаты, поэтому важно и то и другое разом.
    assert.ok(featureSpot(world, Feature.SINK), `сид ${seed}: раковины нет — первый шаг некуда указать`);
    assert.ok(featureSpot(world, Feature.TOILET), `сид ${seed}: уборной нет — второй шаг некуда указать`);

    // ШАГ 3 — ключ лежит предметом на полу, а не в контейнере: гид подсвечивает
    // именно сущность-выброс.
    assert.ok(keyDrop(gen.entities), `сид ${seed}: ключа "${TUTORIAL_START.keyId}" нет на полу`);

    // ШАГ 4 — дверь называет тот же ключ. По этому же полю её находит и гид.
    const lockedDoors = [...world.doors.values()].filter(door => door.keyId === TUTORIAL_START.keyId);
    assert.ok(lockedDoors.length >= 1, `сид ${seed}: ни одна дверь не заперта ключом сиквенса`);

    // ШАГ 5 — Ольга за дверью. Её ищут по id пакета, не по русскому имени.
    const tutor = gen.entities.find(
      e => e.alive && e.type === EntityType.NPC
        && (e as { npcPackageId?: string }).npcPackageId === TUTORIAL_START.tutorNpcPackageId,
    );
    assert.ok(tutor, `сид ${seed}: пакет "${TUTORIAL_START.tutorNpcPackageId}" не поставлен на этаж`);
  }
});

test('the tutorial key lies on the near side of the door it opens', () => {
  for (const seed of SEEDS) {
    const gen = generateFloor(0, seed, true);
    const world = gen.world;
    const sx = Math.floor(gen.spawnX);
    const sy = Math.floor(gen.spawnY);

    const spawnRoom = world.rooms.find(room => room.id === world.roomMap[world.idx(sx, sy)]);
    assert.ok(spawnRoom?.tags?.includes(TUTORIAL_START.roomTag),
      `сид ${seed}: игрок начинает в "${spawnRoom?.name}", а эта комната не помечена как стартовая`);

    const drop = keyDrop(gen.entities);
    assert.ok(drop, `сид ${seed}: ключа нет`);
    const toKey = bfsPath(world, sx, sy, Math.floor(drop!.x), Math.floor(drop!.y));
    assert.ok(toKey.length > 0,
      `сид ${seed}: до ключа нет дороги от точки появления — сиквенс замкнут сам на себя`);

    const sink = featureSpot(world, Feature.SINK);
    assert.ok(sink, `сид ${seed}: раковины нет`);
    const toSink = bfsPath(world, sx, sy, sink!.x, sink!.y);
    assert.ok(toSink.length > 0 || (sink!.x === sx && sink!.y === sy),
      `сид ${seed}: до раковины нет дороги от точки появления`);
  }
});

/* ── Замок Перевалки: вниз только через базу ──────────────────────
 *
 * Замысел этажа держится не на скрипте, а на геометрии: ВСЕ лифты вниз лежат
 * внутри баз четырёх фракций, за дверьми `DoorState.LOCKED` с явным `keyId`.
 * Этот файл — замок замысла. Он не проверяет, что генератор что-то вызвал: он
 * прогоняет настоящую генерацию и спрашивает у `auditReachability()`, можно ли
 * дойти до лифта обычной ходьбой. Ответ обязан быть «только по ключу».
 *
 * Обратная сторона так же важна: лифты ВВЕРХ обязаны остаться свободными.
 * Приехавший сверху игрок встаёт у шахты вверх, и если она окажется внутри
 * запертого объёма, он заперт в чужой базе с первой секунды. Замерено на
 * сиде 0x4453474e до правки: лифт вверх 683,456 сел в стену запертой Времянки.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Cell, DoorState, ItemType, LiftDirection, W } from '../src/core/types';
import { auditReachability, describeReachability, type World } from '../src/core/world';
import { ITEMS } from '../src/data/items';
import { SIDE_QUESTS } from '../src/data/plot';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import {
  NPC_DEFS,
  PEREVALKA_BASES,
  PEREVALKA_KEYHOLDERS,
  PEREVALKA_ROOMS,
  PEREVALKA_Z,
  perevalkaGatesByWorld,
} from '../src/gen/perevalka';
import { designFloorById } from '../src/data/design_floors';
import { findNamedRoom } from '../src/gen/named_rooms';
import '../src/content';

const RUN_SEEDS = [0x4453474e, 0x0be7a1];

function liftCells(world: World, direction: LiftDirection): number[] {
  const out: number[] = [];
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT && world.liftDir[i] === direction) out.push(i);
  }
  return out;
}

function neighbourLabels(world: World, audit: ReturnType<typeof auditReachability>, idx: number): string[] {
  const x = idx % W;
  const y = (idx / W) | 0;
  const labels: string[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ni = world.idx(x + dx, y + dy);
    const cell = world.cells[ni];
    if (cell !== Cell.FLOOR && cell !== Cell.DOOR && cell !== Cell.WATER) continue;
    labels.push(describeReachability(audit, world, ni));
  }
  return labels;
}

test('маршрутный z Перевалки — −16, и этаж на него настроен', () => {
  assert.equal(designFloorById('perevalka')?.z, -16);
  assert.equal(PEREVALKA_Z, -16);
});

test('каждый лифт вниз заперт ключом базы, каждый лифт вверх свободен', () => {
  for (const runSeed of RUN_SEEDS) {
    const gen = generateDesignFloor('perevalka', runSeed);
    const world = gen.world;
    const report = perevalkaGatesByWorld.get(world);
    assert.ok(report, `обнос не отработал на сиде ${runSeed.toString(16)}`);

    const down = liftCells(world, LiftDirection.DOWN);
    const up = liftCells(world, LiftDirection.UP);
    assert.equal(down.length, 16, `лифтов вниз должно быть 16, а не ${down.length}`);
    assert.equal(up.length, down.length, 'число лифтов вверх и вниз разошлось');
    assert.equal(report.conflicts.length, 0, 'остались лифты вниз, которые не удалось обнести');
    assert.equal(report.gates.length, down.length, 'обнесены не все лифты вниз');

    const audit = auditReachability(world, world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));

    for (const idx of down) {
      const labels = neighbourLabels(world, audit, idx);
      assert.ok(labels.length > 0, `к лифту вниз ${idx % W},${(idx / W) | 0} вообще не подойти`);
      assert.ok(
        labels.every(label => label === 'gated by key'),
        `лифт вниз ${idx % W},${(idx / W) | 0} достижим без ключа: ${labels.join(', ')}`,
      );
    }

    for (const idx of up) {
      const labels = neighbourLabels(world, audit, idx);
      assert.ok(
        labels.includes('reachable'),
        `лифт вверх ${idx % W},${(idx / W) | 0} внутри запертого объёма: ${labels.join(', ')}`,
      );
    }
  }
});

test('замок не запечатал этаж: недостижимых клеток и замурованных комнат нет', () => {
  for (const runSeed of RUN_SEEDS) {
    const gen = generateDesignFloor('perevalka', runSeed);
    const world = gen.world;
    const audit = auditReachability(world, world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));

    let unreachable = 0;
    for (let i = 0; i < W * W; i++) {
      if (world.cells[i] === Cell.FLOOR && !audit.reachable[i]) unreachable++;
    }
    assert.equal(unreachable, 0, `${unreachable} клеток пола отрезано на сиде ${runSeed.toString(16)}`);

    const sealed = world.rooms.filter(room => {
      if (!room) return false;
      for (let dy = 0; dy < room.h; dy++) {
        for (let dx = 0; dx < room.w; dx++) {
          const i = world.idx(room.x + dx, room.y + dy);
          if ((world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.DOOR) && audit.reachable[i]) return false;
        }
      }
      return true;
    });
    assert.deepEqual(sealed.map(room => room.name), [], 'на этаже появились замурованные комнаты');
  }
});

test('тамбур — обычный бетон: заряду есть что ломать', () => {
  const gen = generateDesignFloor('perevalka');
  const world = gen.world;
  const report = perevalkaGatesByWorld.get(world)!;
  for (const gate of report.gates) {
    for (let dy = -gate.radius - 1; dy <= gate.radius + 1; dy++) {
      for (let dx = -gate.radius - 1; dx <= gate.radius + 1; dx++) {
        const i = world.idx(gate.x + dx, gate.y + dy);
        if (i === gate.idx) continue; // сама шахта защищена системой лифтов, и это не наше
        assert.equal(world.aptMask[i], 0, `клетка тамбура ${gate.x + dx},${gate.y + dy} получила иммунитет к заряду`);
      }
    }
    const door = world.doors.get(gate.doorIdx);
    assert.ok(door, 'дверь тамбура не попала в world.doors — это невидимая стена');
    assert.equal(door.state, DoorState.LOCKED, 'дверь тамбура не заперта');
    assert.notEqual(door.state, DoorState.HERMETIC_CLOSED, 'гермодверь дала бы иммунитет заряду');
    assert.equal(door.keyId, gate.keyId, 'ключ двери не совпал с ключом базы');
    assert.ok(door.keyId.length > 0, 'пустой keyId открывается дефолтным ключом');
    const room = world.rooms[gate.roomId];
    assert.ok(room, 'тамбур не получил записи комнаты');
    assert.ok(room.doors.includes(gate.doorIdx), 'дверь не попала в room.doors — комната запечатана');
  }
});

test('четыре базы, четыре ключа, по четыре лифта на базу', () => {
  const gen = generateDesignFloor('perevalka');
  const report = perevalkaGatesByWorld.get(gen.world)!;
  const perBase = new Map<string, Set<string>>();
  for (const gate of report.gates) {
    if (!perBase.has(gate.baseId)) perBase.set(gate.baseId, new Set());
    perBase.get(gate.baseId)!.add(gate.keyId);
  }
  assert.equal(perBase.size, PEREVALKA_BASES.length, 'лифты держат не все четыре базы');
  for (const [baseId, keys] of perBase) {
    assert.equal(keys.size, 1, `у базы ${baseId} больше одного ключа`);
  }
  const counts = new Map<string, number>();
  for (const gate of report.gates) counts.set(gate.baseId, (counts.get(gate.baseId) ?? 0) + 1);
  for (const spec of PEREVALKA_BASES) {
    assert.equal(counts.get(spec.id), 4, `у базы ${spec.id} не четыре лифта, а ${counts.get(spec.id)}`);
  }
});

test('ключи баз — настоящие предметы, и каждый добывается всеми путями сразу', () => {
  const keys = PEREVALKA_BASES.map(spec => spec.keyId);
  assert.equal(new Set(keys).size, keys.length, 'две базы делят один ключ');
  for (const spec of PEREVALKA_BASES) {
    const def = ITEMS[spec.keyId];
    assert.ok(def, `ключ ${spec.keyId} не резолвится в ITEMS`);
    assert.equal(def.type, ItemType.KEY, `${spec.keyId} не ключ по типу`);
    assert.equal(def.value, 10000, 'цена ключа решена владельцем: 10 000');
    assert.equal(def.spawnW, 0, 'ключ базы не должен валяться в мире');

    // Путь «убить/обокрасть/купить»: ключ лежит ПЕРВЫМ слотом у хозяина. Один
    // предмет закрывает три пути разом, потому что инвентарь NPC — это и лут
    // при смерти, и прилавок при торге.
    const npc = NPC_DEFS[spec.npcId];
    assert.equal(npc.inventory?.[0]?.defId, spec.keyId, `${spec.npcId} не носит свой ключ первым слотом`);

    // Путь «квест»: ровно один шаг выдаёт ключ наградой.
    const givers = SIDE_QUESTS.filter(step =>
      step.rewardItem === spec.keyId
      || (step.extraRewards ?? []).some(reward => reward.defId === spec.keyId));
    assert.equal(givers.length, 1, `ключ ${spec.keyId} выдаёт ${givers.length} поручений вместо одного`);
  }
});

test('хозяева баз стоят в своих объявленных комнатах', () => {
  const gen = generateDesignFloor('perevalka');
  for (const spec of PEREVALKA_BASES) {
    for (const alias of [spec.hqAlias, spec.workAlias]) {
      const room = findNamedRoom(gen.world, alias);
      assert.ok(room, `объявленная комната ${alias} не вырыта`);
      assert.equal(room.name, PEREVALKA_ROOMS[alias].name, 'имя комнаты разошлось с объявлением');
    }
    const placed = gen.entities.find(entity =>
      (entity as { npcPackageId?: string }).npcPackageId === spec.npcId);
    assert.ok(placed, `держатель ключа ${spec.npcId} не поставлен на этаж`);
    assert.equal(NPC_DEFS[spec.npcId].homeFloorKey, 'design:perevalka', 'домашний этаж пакета уехал в дефолт');
  }
  assert.deepEqual([...PEREVALKA_KEYHOLDERS].sort(), PEREVALKA_BASES.map(s => s.npcId).sort());
});

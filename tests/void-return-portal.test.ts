import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Cell, EntityType, Faction, MonsterKind, QuestType, Tex,
  type Entity,
} from '../src/core/types';
import { World } from '../src/core/world';
import { FLOOR_RUN_VOID_Z } from '../src/data/procedural_floors';
import { setFloorRunState } from '../src/systems/procedural_floors';
import {
  VOID_RETURN_TARGET_Z,
  announceVoidReturn,
  beginVoidReturn,
  isVoidReturnPortalFloor,
  normalizeVoidReturnPortalState,
  openVoidReturnPortalFromCreator,
  readyVoidReturnPortal,
  restoreVoidReturnPortalForCurrentWorld,
  setVoidReturnPortalState,
  voidReturnPortalStateForSave,
} from '../src/gen/void/return_portal';
import { makeGameState, makeTestPlayer } from './helpers';

/* ── Стенд ────────────────────────────────────────────────────────
 * Пустота — маршрутная остановка `void` на z −50. Тест ставит именно её,
 * а не «какой-нибудь этаж с currentZ −50»: вся проверка портала о том,
 * узнаёт ли он свой маршрутный этаж. */
function voidState() {
  const state = makeGameState({ currentZ: FLOOR_RUN_VOID_Z });
  setFloorRunState(state, {
    runSeed: 4242,
    currentZ: FLOOR_RUN_VOID_Z,
    specs: {},
    visited: {},
  });
  return state;
}

function openFloor(): World {
  const world = new World();
  for (let y = 20; y < 40; y++) {
    for (let x = 20; x < 40; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  }
  return world;
}

function makeCreator(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.MONSTER, monsterKind: MonsterKind.CREATOR,
    x, y, angle: 0, alive: true, speed: 1, sprite: 0,
    hp: 1, maxHp: 400, faction: Faction.MONSTER, name: 'Творец',
  } as Entity;
}

test('маршрутная Пустота — этаж портала возврата', () => {
  const state = voidState();
  /* НЕГАТИВНЫЙ КОНТРОЛЬ ЭТОЙ СТРОКИ: до 2026-09-09 предикат требовал запись
   * БЕЗ `designFloorId`, а маршрут на −50 всегда отдаёт дизайн-запись `void`.
   * Значит предикат был ложным всегда, и портал не срабатывал ни разу.
   * Проверка зовёт защищаемую функцию в лоб — не через игровой цикл, чей
   * собственный сторож (`designFloorId === 'void'`) отсёк бы путь раньше. */
  assert.equal(isVoidReturnPortalFloor(state), true);

  const living = makeGameState({ currentZ: 0 });
  setFloorRunState(living, { runSeed: 4242, currentZ: 0, specs: {}, visited: {} });
  assert.equal(isVoidReturnPortalFloor(living), false, 'жилой этаж порталом возврата не является');
});

test('смерть Творца печатает портал и снимает тело с этажа', () => {
  const state = voidState();
  const world = openFloor();
  const player = makeTestPlayer({ x: 25.5, y: 25.5 });
  const creator = makeCreator(77, 30.5, 31.5);
  const entities: Entity[] = [player, creator];

  openVoidReturnPortalFromCreator(world, entities, player, state, creator);

  const cell = world.idx(30, 31);
  assert.equal(world.floorTex[cell], Tex.PORTAL, 'клетка Творца становится порталом');
  assert.equal(world.cells[cell], Cell.FLOOR);
  assert.equal(entities.some(e => e.monsterKind === MonsterKind.CREATOR), false, 'тело Творца снято');

  const portal = voidReturnPortalStateForSave(state);
  assert.equal(portal?.active, true);
  assert.equal(portal?.used, false);
  assert.equal(portal?.cell, cell);
  assert.equal(portal?.playerMustLeaveCell, false, 'игрок стоял не в центре');
});

test('портал впускает только в своём центре и только на своём этаже', () => {
  const state = voidState();
  const world = openFloor();
  const player = makeTestPlayer({ x: 25.5, y: 25.5 });
  const creator = makeCreator(77, 30.5, 31.5);
  const entities: Entity[] = [player, creator];
  openVoidReturnPortalFromCreator(world, entities, player, state, creator);
  const portalCell = world.idx(30, 31);

  assert.equal(
    readyVoidReturnPortal(world, player, state, world.idx(25, 25)),
    null,
    'в стороне от центра портал не срабатывает',
  );

  player.x = 30.5; player.y = 31.5;
  const ready = readyVoidReturnPortal(world, player, state, portalCell);
  assert.ok(ready, 'в центре портал принимает игрока');
  assert.equal(ready?.cell, portalCell);
});

test('портал, раскрывшийся под ногами, требует выйти и вернуться', () => {
  const state = voidState();
  const world = openFloor();
  const player = makeTestPlayer({ x: 30.5, y: 31.5 });
  const creator = makeCreator(77, 30.5, 31.5);
  const entities: Entity[] = [player, creator];
  openVoidReturnPortalFromCreator(world, entities, player, state, creator);
  const portalCell = world.idx(30, 31);

  assert.equal(voidReturnPortalStateForSave(state)?.playerMustLeaveCell, true);
  assert.equal(readyVoidReturnPortal(world, player, state, portalCell), null, 'сразу не впускает');

  // Отошёл — замок снят; вернулся — впустил.
  player.x = 26.5; player.y = 26.5;
  readyVoidReturnPortal(world, player, state, world.idx(26, 26));
  player.x = 30.5; player.y = 31.5;
  assert.ok(readyVoidReturnPortal(world, player, state, portalCell));
});

test('уход через портал помечает запись и уносит судьбу шипа', () => {
  const state = voidState();
  const world = openFloor();
  const player = makeTestPlayer({ x: 30.5, y: 31.5 });
  player.inventory = [{ defId: 'void_spike', count: 1 }];
  const creator = makeCreator(77, 30.5, 31.5);
  const entities: Entity[] = [player, creator];
  openVoidReturnPortalFromCreator(world, entities, player, state, creator);
  const portal = voidReturnPortalStateForSave(state)!;

  const carried = beginVoidReturn(state, player, portal);
  assert.equal(carried.voidSpikeCarried, true);
  assert.equal(carried.voidSpikeResolved, false);
  assert.equal(carried.voidSpikeTag, 'void_spike_carried');
  assert.equal(carried.fromFloor, FLOOR_RUN_VOID_Z);
  assert.equal(portal.used, true);

  // Сданный шип: закрытый FETCH перевешивает наличие в рюкзаке.
  state.quests.push({
    id: 1, type: QuestType.FETCH, desc: 'шип', targetItem: 'void_spike',
    targetCount: 1, done: true, failed: false,
  } as never);
  const left = beginVoidReturn(state, player, { ...portal, used: false });
  assert.equal(left.voidSpikeTag, 'void_spike_left');
});

test('в текстах портала нет обещания отдать шип Жану', () => {
  const state = voidState();
  const world = openFloor();
  const player = makeTestPlayer({ x: 25.5, y: 25.5 });
  const creator = makeCreator(77, 30.5, 31.5);
  const entities: Entity[] = [player, creator];

  openVoidReturnPortalFromCreator(world, entities, player, state, creator);
  const portal = voidReturnPortalStateForSave(state)!;
  announceVoidReturn(state, beginVoidReturn(state, player, portal));

  /* Личность Жана Пустотника удалена из игры целиком (2026-08-16). Обещание
   * отдать ему шип было невыполнимо: получателя нет. Решение владельца
   * 2026-09-09 — шип сдаётся на месте, без разговора. */
  const texts = state.msgs.map(m => m.text).join('\n');
  assert.equal(/Жан/.test(texts), false, `речь портала называет удалённую личность:\n${texts}`);
  assert.match(texts, /сдаётся здесь же/);
});

test('запись портала переживает сейв и чистится от мусора', () => {
  const state = voidState();
  const sane = {
    active: true, used: false, cell: 12345, openedAt: 10, openedTick: 7,
    creatorId: 9, enteredFromFloor: 0,
  };
  setVoidReturnPortalState(state, sane);
  assert.deepEqual(voidReturnPortalStateForSave(state), {
    active: true, used: false, cell: 12345, openedAt: 10, openedTick: 7,
    creatorId: 9, playerMustLeaveCell: false, enteredFromFloor: 0,
    usedAt: undefined, voidSpikeCarried: false, voidSpikeResolved: false,
  });

  assert.equal(normalizeVoidReturnPortalState({ ...sane, cell: -1 }), undefined, 'клетка вне мира отбрасывается');
  assert.equal(normalizeVoidReturnPortalState({ ...sane, cell: 1024 * 1024 }), undefined);
  assert.equal(normalizeVoidReturnPortalState(null), undefined);
  assert.equal(
    normalizeVoidReturnPortalState({ ...sane, enteredFromFloor: 1.5 })?.enteredFromFloor,
    undefined,
    'дробный этаж входа не сохраняется',
  );
  assert.equal(
    normalizeVoidReturnPortalState({ ...sane, enteredFromFloor: 'вниз' })?.enteredFromFloor,
    undefined,
    'нечисловой этаж входа не сохраняется',
  );
});

test('перезагрузка этажа возвращает портал на место', () => {
  const state = voidState();
  const world = openFloor();
  const player = makeTestPlayer({ x: 25.5, y: 25.5 });
  const cell = world.idx(30, 31);
  setVoidReturnPortalState(state, {
    active: true, used: false, cell, openedAt: 5, openedTick: 3, creatorId: 77,
  });

  const entities: Entity[] = [player, makeCreator(77, 30.5, 31.5)];
  assert.equal(restoreVoidReturnPortalForCurrentWorld(world, entities, state), true);
  assert.equal(world.floorTex[cell], Tex.PORTAL);
  assert.equal(entities.length, 1, 'воскресший Творец снимается вместе с печатью портала');

  // Использованный портал не печатается снова.
  setVoidReturnPortalState(state, {
    active: true, used: true, cell, openedAt: 5, openedTick: 3, creatorId: 77,
  });
  const world2 = openFloor();
  assert.equal(restoreVoidReturnPortalForCurrentWorld(world2, [player], state), false);
  assert.notEqual(world2.floorTex[cell], Tex.PORTAL);
});

test('портал возвращает на канонический жилой этаж', () => {
  assert.equal(VOID_RETURN_TARGET_Z, 0);
});

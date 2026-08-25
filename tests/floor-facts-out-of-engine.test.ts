import assert from 'node:assert/strict';
import test from 'node:test';
import { EntityType, Faction, RoomType, Tex, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { npcWealthMultiplier } from '../src/data/economy_rules';
import { floorKeyForDesign } from '../src/data/floor_keys';
import { addItem, useItem } from '../src/systems/inventory';
import { makeGameState } from './helpers';

/* Достаток жителя этажа жил лестницей `if` внутри `systems/alife.ts` и знал
 * этажи по имени. Правило переехало в экономику; тест держит поведение на
 * месте и ловит как потерю этажа из правила, так и расползание правила на
 * чужой этаж. */

test('достаток жителя этажа задан экономикой, а не A-Life', () => {
  // Строка правила — конкретный авторский этаж.
  assert.equal(npcWealthMultiplier(26, floorKeyForDesign('bank_floor')), 6.5);

  // Число правила — весь пояс высоты, включая процедурные этажи на нём.
  assert.equal(npcWealthMultiplier(30, floorKeyForDesign('ministry')), 2.4);
  assert.equal(npcWealthMultiplier(-26, 'proc:whatever:2'), 1.25);
  assert.equal(npcWealthMultiplier(-36, floorKeyForDesign('hell')), 0.45);

  // Этаж без правила живёт на обычные деньги.
  assert.equal(npcWealthMultiplier(0, floorKeyForDesign('living')), 1);
});

function playerAt(x: number, y: number): Entity {
  return {
    id: 1, type: EntityType.NPC, persistentNpcId: 'player',
    x, y, angle: 0, pitch: 0, alive: true, speed: 3, sprite: 0,
    hp: 50, maxHp: 100, inventory: [], weapon: '', faction: Faction.PLAYER, name: 'Вы',
  };
}

function worldWithRoomUnder(e: Entity, type: RoomType): World {
  const world = new World();
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  world.rooms.push({
    id: 0, type, x: x - 1, y: y - 1, w: 3, h: 3,
    doors: [], sealed: false, name: 'зал', apartmentId: -1,
    wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE,
  });
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      world.carve(x + dx, y + dy);
      world.roomMap[world.idx(world.wrap(x + dx), world.wrap(y + dy))] = 0;
    }
  }
  return world;
}

/* Бумага уходит адресату, а не этажу. Раньше эти же сделки проходили в любой
 * точке 15 этажей с нужным ярлыком: документ «продавался на рынке» посреди
 * пустого коридора, потому что у этажа был тег `living`. Тест держит правило с
 * обеих сторон — у прилавка сделка есть, в коридоре её нет. */
test('документ продаётся у прилавка, а не по ярлыку этажа', () => {
  const atCounter = playerAt(0, 0);
  const state = makeGameState({ currentZ: 0 });
  const msgs: Msg[] = [];
  assert.equal(addItem(atCounter, 'p14_gasmask_receipt', 1), true);

  useItem(atCounter, 0, msgs, 30, state, undefined, worldWithRoomUnder(atCounter, RoomType.MARKET));

  assert.equal(atCounter.inventory?.some(item => item.defId === 'p14_gasmask_receipt'), false);
  assert.equal(atCounter.money, 28);
});

test('в коридоре у документа адресата нет: ни денег, ни потери предмета', () => {
  const inCorridor = playerAt(0, 0);
  const state = makeGameState({ currentZ: 0 });
  const msgs: Msg[] = [];
  assert.equal(addItem(inCorridor, 'p14_gasmask_receipt', 1), true);

  useItem(inCorridor, 0, msgs, 30, state, undefined, worldWithRoomUnder(inCorridor, RoomType.CORRIDOR));

  assert.equal(inCorridor.inventory?.some(item => item.defId === 'p14_gasmask_receipt'), true);
  assert.equal(inCorridor.money ?? 0, 0);
});

/* Торговля и досуг в словаре деятельности (`rooms.md`).
 *
 * Три новых типа комнат — лавка, бар и торговый ряд — не приносят своей
 * механики: тяга к ним идёт из общей таблицы affordance, товар доезжает общей
 * возкой, нужда гаснет общей таблицей нужд. Здесь проверяется именно это: что
 * словарь заведён полностью и что поведение возникает само.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import {
  AIGoal, Cell, EntityType, Faction, NpcState, Occupation, RoomType, ZoneFaction,
  type Entity, type GameClock,
} from '../src/core/types';
import { World, auditReachability } from '../src/core/world';
import { ROOM_DEFS } from '../src/data/rooms';
import { ROOM_AFFORDANCES, roomAffordanceWeight } from '../src/data/room_affordances';
import { RESOURCES } from '../src/data/resources';
import { generateFloor } from '../src/gen/floor_manifest';
import { npcUtilityRoomInterest } from '../src/systems/ai/npc_utility';
import { updateNeeds } from '../src/systems/needs';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { setNpcContext, updateNPC } from '../src/systems/ai/npc_fsm';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { addTestRoom, makeTestPlayer } from './helpers';
import {
  TRADE_ROW_BAR_NAME,
  TRADE_ROW_MARKET_NAME,
  TRADE_ROW_SHOP_NAMES,
} from '../src/gen/living/trade_row';

const TRADE_TYPES = [RoomType.SHOP, RoomType.BAR, RoomType.MARKET] as const;

test('словарь заведён целиком: у лавки, бара и ряда есть облик и деятельность', () => {
  for (const type of TRADE_TYPES) {
    const def = ROOM_DEFS[type];
    assert.ok(def && def.name.length > 0, `нет облика у типа ${type}`);
    assert.ok(def.minW > 0 && def.minH > 0);
    const affordance = ROOM_AFFORDANCES[type];
    assert.ok(affordance && affordance.tags.length > 0, `нет деятельности у типа ${type}`);
    assert.ok(
      Object.values(affordance.affordances).some(weight => (weight ?? 0) > 0),
      `тип ${type} ничего не предлагает и потому мёртв`,
    );
  }
});

test('лавка и бар — места, куда возят, а не где хранят', () => {
  // «Куда не хранят, туда и разносят»: нулевой store-вес делает их адресом
  // доставки, а не складом, из которого кладовщик вывозит товар.
  for (const type of TRADE_TYPES) {
    assert.equal(roomAffordanceWeight(type, 'store'), 0, `тип ${type} не должен быть хранилищем`);
  }
  const food = RESOURCES.find(resource => resource.id === 'food');
  const drink = RESOURCES.find(resource => resource.id === 'drink_water');
  assert.ok(food?.roomTypes.includes(RoomType.SHOP), 'лавке положено держать еду');
  assert.ok(drink?.roomTypes.includes(RoomType.BAR), 'бару положено держать питьё');
});

test('в баре скапливаются сами: он перевешивает общий зал и на разговор, и на жажду', () => {
  const social = { intent: 'social' as const };
  assert.ok(
    npcUtilityRoomInterest(RoomType.BAR, social) > npcUtilityRoomInterest(RoomType.COMMON, social),
    'на разговор бар должен тянуть сильнее общего зала',
  );
  // Жажда переехала из намерений старого слоя в НАЗНАЧЕНИЕ комнаты: тело теперь
  // ведёт ядро актора, и «чем комната полезна» спрашивается назначением, а не
  // именем намерения. Проверяется то же самое требование — бар тянет пить.
  // Имя намерения здесь ни при чём: назначение перекрывает его в самом счёте,
  // и `wander` стоит ровно как нейтральная заглушка обязательного поля.
  const thirsty = { intent: 'wander' as const, affordance: 'drink' as const };
  assert.ok(npcUtilityRoomInterest(RoomType.BAR, thirsty) > 0, 'жаждущего бар обязан тянуть');
  assert.ok(
    npcUtilityRoomInterest(RoomType.MARKET, { intent: 'wander' as const })
      > npcUtilityRoomInterest(RoomType.CORRIDOR, { intent: 'wander' as const }),
    'по ряду ходят охотнее, чем по коридору',
  );
});

test('в баре наливают: жажда там гаснет', () => {
  const world = new World();
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  const bar = addTestRoom(world, { id: 0, type: RoomType.BAR, x: 8, y: 8, w: 6, h: 5, zoneId: 0, zoneFaction: ZoneFaction.CITIZEN });
  const drinker: Entity = {
    id: 5, type: EntityType.NPC,
    x: bar.x + 2.5, y: bar.y + 2.5,
    angle: 0, pitch: 0, alive: true, speed: 1, sprite: 0,
    hp: 50, maxHp: 50,
    faction: Faction.CITIZEN, occupation: Occupation.ALCOHOLIC, alifeId: 900,
    needs: { food: 90, water: 20, sleep: 90, pee: 0, poo: 0 },
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0, npcState: NpcState.FREE_TIME },
  };
  const before = drinker.needs!.water;
  // Комнатное восстановление нужд достаётся «холодным» жильцам — тем, кто
  // дальше HOT_NEEDS_RADIUS от игрока. Так устроена и кухня.
  const crowd = [makeTestPlayer({ id: 99, x: 300, y: 300 }), drinker];
  for (let step = 0; step < 4; step++) {
    const time = 100 + step * 6;
    rebuildEntityIndexForSimulation(crowd, time);
    updateNeeds(crowd, 6, time, [], 99, undefined, undefined, world);
  }
  assert.ok(drinker.needs!.water > before, 'в баре жажда обязана убывать, иначе тяга туда врёт');
});

test('жилой этаж строит торговый угол, и он достижим', () => {
  const gen = generateFloor(0, 0x5a7103);
  const world = gen.world;
  const shops = world.rooms.filter(room => room?.type === RoomType.SHOP);
  const bars = world.rooms.filter(room => room?.type === RoomType.BAR);
  const markets = world.rooms.filter(room => room?.type === RoomType.MARKET);

  assert.equal(shops.length, TRADE_ROW_SHOP_NAMES.length, 'лавки должны быть вырыты');
  assert.equal(bars.length, 1, 'бар должен быть вырыт');
  assert.equal(markets.length, 1, 'ряд должен быть вырыт');
  assert.equal(markets[0].name, TRADE_ROW_MARKET_NAME);
  assert.equal(bars[0].name, TRADE_ROW_BAR_NAME);

  // Торговец с товаром в каждой лавке, прилавок в каждой лавке.
  for (const shop of shops) {
    const trader = gen.entities.find(e => e.type === EntityType.NPC && e.assignedRoomId === shop.id && e.occupation === Occupation.STOREKEEPER);
    assert.ok(trader, `в лавке "${shop.name}" некому торговать`);
    assert.ok((trader.inventory ?? []).length > 0, 'магазин — это человек с полными карманами');
    assert.ok(world.containers.some(c => c.roomId === shop.id), 'в лавке должен быть прилавок');
  }

  const audit = auditReachability(world, world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  for (const room of [...shops, ...bars, ...markets]) {
    const inside = world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
    assert.ok(audit.reachable[inside] === 1, `комната "${room.name}" недостижима от спавна`);
  }
});

test('лавочник сам идёт за товаром, когда прилавок опустел', () => {
  const world = new World();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  const shop = addTestRoom(world, { id: 0, type: RoomType.SHOP, x: 8, y: 8, w: 5, h: 5, zoneId: 0, zoneFaction: ZoneFaction.CITIZEN });
  const storage = addTestRoom(world, { id: 1, type: RoomType.STORAGE, x: 30, y: 8, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  world.addContainer({
    id: 1, x: shop.x + 3, y: shop.y + 2, z: 0,
    roomId: shop.id, zoneId: 0,
    kind: 0, name: 'Прилавок', inventory: [],
    access: 'room', faction: Faction.CITIZEN, discovered: true, tags: ['trade'],
  } as never);
  world.addContainer({
    id: 2, x: storage.x + 2, y: storage.y + 2, z: 0,
    roomId: storage.id, zoneId: 1,
    kind: 0, name: 'Стеллаж', inventory: [{ defId: 'bread', count: 6 }],
    access: 'room', faction: Faction.CITIZEN, discovered: true, tags: [],
  } as never);

  const trader: Entity = {
    id: 6, type: EntityType.NPC,
    x: storage.x + 2.5, y: storage.y + 2.5,
    angle: 0, pitch: 0, alive: true, speed: 1, sprite: 0,
    hp: 50, maxHp: 50,
    faction: Faction.CITIZEN, occupation: Occupation.STOREKEEPER, alifeId: 901,
    assignedRoomId: shop.id,
    needs: { food: 95, water: 95, sleep: 95, pee: 5, poo: 5 },
    inventory: [],
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
  const entities = [makeTestPlayer({ id: 99, x: 60, y: 60 }), trader];
  const clock: GameClock = { hour: 12, minute: 0, totalMinutes: 720 };
  for (let step = 0; step < 4; step++) {
    trader.x = storage.x + 2.5;
    trader.y = storage.y + 2.5;
    trader.ai!.path = [];
    trader.ai!.pi = 0;
    trader.ai!.timer = 0;
    const minutes = 720 + step * 4;
    rebuildEntityIndexForSimulation(entities, minutes);
    setPathContext([], minutes);
    setNpcContext([], minutes, 0);
    updateNPC(world, entities, trader, 0, minutes, clock, false);
  }

  assert.ok((trader.inventory ?? []).some(slot => slot.defId === 'bread'), 'с пустым прилавком лавочник обязан сходить за товаром');
});

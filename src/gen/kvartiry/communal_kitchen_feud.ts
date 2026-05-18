/* ── Коммунальная кухня: фракционная бытовая драка ───────────── */

import { Tex, Feature, RoomType, Faction, Occupation, QuestType } from '../../core/types';
import { World } from '../../core/world';
import { type Entity } from '../../core/types';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { createSocialPoiRoom, placeDropNear, setFeatureIfFloor, spawnAmbientNpc, spawnSocialNpc } from './social_helpers';

const RAYA: PlotNpcDef = {
  name: 'Рая Сковородкина',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.COOK,
  sprite: Occupation.COOK,
  hp: 90, maxHp: 90, money: 26, speed: 0.9,
  inventory: [{ defId: 'kasha', count: 3 }, { defId: 'tea', count: 2 }, { defId: 'knife', count: 1 }],
  talkLines: [
    'Это не кухня. Это переговорная с кипятком.',
    'Санёк крутит газ, Феофан шепчет над кашей, ликвидатор нюхает кастрюли.',
    'Принеси пять пачек каши. Я накормлю всех, пока они не вспомнили идеологию.',
    'Крышка от кастрюли сильнее любого протокола, если бить вовремя.',
    'Не трогай левую плиту. Она считает себя начальником сектора.',
  ],
  talkLinesPost: [
    'Каша есть. Теперь спорят о соли, а не о власти.',
    'Садись у стены. У стены меньше летает посуды.',
  ],
};

const SANEK: PlotNpcDef = {
  name: 'Санёк Конфорка',
  isFemale: false,
  faction: Faction.WILD,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 110, maxHp: 110, money: 7, speed: 1.2,
  inventory: [{ defId: 'pipe', count: 1 }, { defId: 'cigs', count: 2 }],
  talkLines: [
    'Кто держит плиту, тот держит этаж.',
    'Рая добрая, пока нож лежит ручкой к ней.',
    'Мне нужны сигареты. Восемь пачек — и я не буду перекрывать газ сегодня.',
    'Ликвидатору скажи: очередь на кипяток вне закона не стоит.',
    'Если кастрюля свистит три раза, значит кто-то врёт.',
  ],
  talkLinesPost: [
    'Ладно, газ открыт. Но это не перемирие, это перекур.',
    'Передай Рае, что я её половник не трогал. Сегодня.',
  ],
};

registerSideQuest('kv_raya_skovorodkina', RAYA, [{
  id: 'kv_kitchen_kasha',
  giverNpcId: 'kv_raya_skovorodkina',
  type: QuestType.FETCH,
  desc: 'Рая Сковородкина: «Пять пачек каши, пока коммунальная кухня не стала фронтом.»',
  targetItem: 'kasha', targetCount: 5,
  rewardItem: 'kompot', rewardCount: 3,
  extraRewards: [{ defId: 'bread', count: 3 }, { defId: 'tea', count: 2 }],
  relationDelta: 14, xpReward: 40, moneyReward: 20,
}]);

registerSideQuest('kv_sanek_konforka', SANEK, [{
  id: 'kv_sanek_cigs',
  giverNpcId: 'kv_sanek_konforka',
  type: QuestType.FETCH,
  desc: 'Санёк Конфорка: «Восемь пачек сигарет, и газ сегодня будет общий.»',
  targetItem: 'cigs', targetCount: 8,
  rewardItem: 'pipe', rewardCount: 1,
  extraRewards: [{ defId: 'water', count: 2 }],
  relationDelta: 8, xpReward: 35, moneyReward: 15,
}]);

export function generateCommunalKitchenFeud(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number }, spawnX: number, spawnY: number,
): number {
  const poi = createSocialPoiRoom(world, nextRoomId, spawnX, spawnY, 'Коммунальная кухня раздора', RoomType.KITCHEN, 15, 10, Tex.TILE_W, Tex.F_TILE, 65, 210, 1.8);
  if (!poi) return nextRoomId;

  for (let x = 2; x < poi.w - 2; x += 3) setFeatureIfFloor(world, poi.x + x, poi.y + 2, Feature.STOVE);
  for (let x = 3; x < poi.w - 2; x += 4) setFeatureIfFloor(world, poi.x + x, poi.y + 6, Feature.TABLE);
  setFeatureIfFloor(world, poi.x + 1, poi.y + 1, Feature.SINK);
  setFeatureIfFloor(world, poi.x + poi.w - 2, poi.y + 1, Feature.LAMP);

  spawnSocialNpc(entities, nextId, RAYA, 'kv_raya_skovorodkina', poi.x + 3, poi.y + 3, { weapon: 'knife' });
  spawnSocialNpc(entities, nextId, SANEK, 'kv_sanek_konforka', poi.x + poi.w - 4, poi.y + 4, { weapon: 'pipe' });
  spawnAmbientNpc(entities, nextId, 'Феофан у кастрюли', Faction.CULTIST, Occupation.PRIEST, poi.x + 7, poi.y + 3, [{ defId: 'kasha', count: 1 }]);
  spawnAmbientNpc(entities, nextId, 'Контролёр кипятка', Faction.LIQUIDATOR, Occupation.HUNTER, poi.x + 9, poi.y + 7, [{ defId: 'ammo_9mm', count: 4 }], 'makarov');

  for (const defId of ['kasha', 'kasha', 'bread', 'bread', 'water', 'tea', 'kompot', 'knife', 'note']) {
    placeDropNear(world, entities, nextId, poi, defId, 1);
  }

  return poi.room.id + 1;
}

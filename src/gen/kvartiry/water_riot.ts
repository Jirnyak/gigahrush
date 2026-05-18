/* ── Водяной бунт у стояка — Kvartiry scarcity POI ───────────── */

import {
  Cell, ContainerKind, Faction, Feature, FloorLevel, Occupation, QuestType, RoomType, Tex,
  type Entity, type Item, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import {
  createSocialPoiRoom,
  placeDropNear,
  roomCell,
  setFeatureIfFloor,
  spawnAmbientNpc,
  spawnSocialNpc,
  type SocialPoiRoom,
} from './social_helpers';

const ZOYA: PlotNpcDef = {
  name: 'Зоя у стояка',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 90, maxHp: 90, money: 14, speed: 0.9,
  inventory: [{ defId: 'water_coupon', count: 2 }, { defId: 'bread', count: 1 }],
  talkLines: [
    'Стояк шипит, а очередь уже говорит кулаками.',
    'Ликвидатор считает бутылки, Костыль считает спины. Мы считаем детей.',
    'Четыре бутылки воды — и очередь разойдётся без мата и крови. На сегодня.',
    'Талон — это не вода. Но без талона тебя даже к пустому ведру не подпустят.',
    'Можешь уйти. Тут все делают вид, что выбор ещё есть.',
  ],
  talkLinesPost: [
    'Вода пришла. Теперь стояк шипит тише людей.',
    'Если Серыгин спросит — это не милость. Это пожар потушили до дыма.',
  ],
};

const SERGIN: PlotNpcDef = {
  name: 'Серыгин Водоучёт',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 125, maxHp: 125, money: 52, speed: 1.0,
  inventory: [{ defId: 'ammo_9mm', count: 10 }, { defId: 'liquidator_token', count: 1 }, { defId: 'water_coupon', count: 3 }],
  talkLines: [
    'Вода выдаётся по списку. Кто спорит со списком, спорит с кобурой.',
    'Зоя хочет раздать сейчас. Дикие хотят вынести всё. Я хочу, чтобы этаж пережил ночь.',
    'Верни шесть водных талонов в ящик. Потом будем говорить о бутылках.',
    'Если ведомственный ящик тронут без допуска, это кража при свидетелях.',
    'Очередь можно жалеть. Нельзя отдавать ей ключи от стояка.',
  ],
  talkLinesPost: [
    'Талоны снова в учёте. Стрелять пока не требуется.',
    'Зое оставил две бутылки. Не из жалости — из расчёта.',
  ],
};

const KOSTYL: PlotNpcDef = {
  name: 'Костыль Канистровый',
  isFemale: false,
  faction: Faction.WILD,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 115, maxHp: 115, money: 9, speed: 1.25,
  inventory: [{ defId: 'crowbar', count: 1 }, { defId: 'cigs', count: 2 }],
  talkLines: [
    'Очередь — это когда сильные стоят зря.',
    'Серыгин прячет талоны, Зоя просит по-хорошему. Я предлагаю быстрее.',
    'Четыре талона на воду — и я не вскрою стояк ломом при детях.',
    'Краденое? Тут даже воздух чужой, пока не вдохнул.',
    'Хочешь уйти — уходи. Но сухие руки потом сами вернутся.',
  ],
  talkLinesPost: [
    'Талоны у нас. Очередь стала короче на один страх.',
    'Серыгин злится? Значит, ящик был не пустой.',
  ],
};

registerSideQuest('kv_zoya_stoyak', ZOYA, [{
  id: 'kv_water_riot_queue_water',
  giverNpcId: 'kv_zoya_stoyak',
  type: QuestType.FETCH,
  desc: 'Зоя у стояка: «Четыре бутылки воды в очередь, пока люди не пошли на ящик ликвидаторов.»',
  targetItem: 'water', targetCount: 4,
  rewardItem: 'water_coupon', rewardCount: 3,
  extraRewards: [{ defId: 'bread', count: 2 }, { defId: 'tea', count: 1 }],
  relationDelta: 16, xpReward: 45, moneyReward: 18,
}]);

registerSideQuest('kv_sergin_vodouchet', SERGIN, [{
  id: 'kv_water_riot_liquidator_coupons',
  giverNpcId: 'kv_sergin_vodouchet',
  type: QuestType.FETCH,
  desc: 'Серыгин Водоучёт: «Шесть водных талонов обратно в ведомость. Без учёта стояк станет фронтом.»',
  targetItem: 'water_coupon', targetCount: 6,
  rewardItem: 'ammo_9mm', rewardCount: 12,
  extraRewards: [{ defId: 'liquidator_token', count: 1 }],
  relationDelta: 12, xpReward: 50, moneyReward: 45,
}]);

registerSideQuest('kv_kostyl_kanistrovy', KOSTYL, [{
  id: 'kv_water_riot_wild_coupons',
  giverNpcId: 'kv_kostyl_kanistrovy',
  type: QuestType.FETCH,
  desc: 'Костыль Канистровый: «Четыре водных талона — и я не разнесу стояк ради одной канистры.»',
  targetItem: 'water_coupon', targetCount: 4,
  rewardItem: 'crowbar', rewardCount: 1,
  extraRewards: [{ defId: 'cigs', count: 3 }, { defId: 'metal_water', count: 2 }],
  relationDelta: 8, xpReward: 45, moneyReward: 12,
}]);

function nextContainerId(world: World): number {
  let id = 1;
  for (const c of world.containers) if (c.id >= id) id = c.id + 1;
  return id;
}

function findContainerCell(world: World, poi: SocialPoiRoom, dx: number, dy: number): { x: number; y: number } | null {
  const preferred = roomCell(poi, dx, dy);
  const pi = world.idx(preferred.x, preferred.y);
  if (world.cells[pi] === Cell.FLOOR || world.cells[pi] === Cell.WATER) return preferred;
  for (let y = 1; y < poi.h - 1; y++) {
    for (let x = 1; x < poi.w - 1; x++) {
      const wx = world.wrap(poi.x + x);
      const wy = world.wrap(poi.y + y);
      const ci = world.idx(wx, wy);
      if (world.roomMap[ci] === poi.room.id && (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER)) return { x: wx, y: wy };
    }
  }
  return null;
}

function addSupplyContainer(
  world: World,
  poi: SocialPoiRoom,
  dx: number,
  dy: number,
  name: string,
  kind: ContainerKind,
  access: WorldContainer['access'],
  inventory: Item[],
  opts: { ownerId?: number; ownerName?: string; faction?: Faction; tags: string[] },
): void {
  const pos = findContainerCell(world, poi, dx, dy);
  if (!pos) return;
  world.addContainer({
    id: nextContainerId(world),
    x: pos.x,
    y: pos.y,
    floor: FloorLevel.KVARTIRY,
    roomId: poi.room.id,
    zoneId: world.zoneMap[world.idx(pos.x, pos.y)],
    kind,
    name,
    inventory,
    capacitySlots: Math.max(8, inventory.length + 2),
    ownerNpcId: opts.ownerId,
    ownerName: opts.ownerName,
    faction: opts.faction,
    access,
    discovered: true,
    tags: ['water_riot', ...opts.tags],
  });
}

function setPuddle(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.cells[ci] = Cell.WATER;
  world.floorTex[ci] = Tex.F_WATER;
}

export function generateWaterRiot(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number }, spawnX: number, spawnY: number,
): number {
  const poi = createSocialPoiRoom(world, nextRoomId, spawnX, spawnY, 'Водораздача у стояка', RoomType.BATHROOM, 16, 9, Tex.TILE_W, Tex.F_TILE, 95, 280, 2.1);
  if (!poi) return nextRoomId;

  setFeatureIfFloor(world, poi.x + 1, poi.y + 1, Feature.LAMP);
  setFeatureIfFloor(world, poi.x + 2, poi.y + 2, Feature.SINK);
  setFeatureIfFloor(world, poi.x + 2, poi.y + 3, Feature.SINK);
  setFeatureIfFloor(world, poi.x + poi.w - 2, poi.y + 1, Feature.SHELF);
  setFeatureIfFloor(world, poi.x + poi.w - 3, poi.y + 1, Feature.DESK);
  for (let y = 2; y < poi.h - 2; y += 2) {
    setFeatureIfFloor(world, poi.x + 6, poi.y + y, Feature.CHAIR);
    setFeatureIfFloor(world, poi.x + 8, poi.y + y, Feature.TABLE);
  }
  for (const p of [[3, 2], [3, 3], [4, 3], [5, 4]] as const) setPuddle(world, poi.x + p[0], poi.y + p[1]);

  spawnSocialNpc(entities, nextId, ZOYA, 'kv_zoya_stoyak', poi.x + 4, poi.y + 5);
  const authorityId = nextId.v;
  spawnSocialNpc(entities, nextId, SERGIN, 'kv_sergin_vodouchet', poi.x + poi.w - 4, poi.y + 3, { weapon: 'makarov' });
  spawnSocialNpc(entities, nextId, KOSTYL, 'kv_kostyl_kanistrovy', poi.x + 10, poi.y + 6, { weapon: 'crowbar' });
  spawnAmbientNpc(entities, nextId, 'Мать с пустой канистрой', Faction.CITIZEN, Occupation.HOUSEWIFE, poi.x + 5, poi.y + 6, [{ defId: 'water_coupon', count: 1 }]);
  spawnAmbientNpc(entities, nextId, 'Слесарь у сухого вентиля', Faction.CITIZEN, Occupation.LOCKSMITH, poi.x + 3, poi.y + 3, [{ defId: 'wrench', count: 1 }], 'wrench');
  spawnAmbientNpc(entities, nextId, 'Очередник без талона', Faction.CITIZEN, Occupation.TRAVELER, poi.x + 7, poi.y + 5, [{ defId: 'note', count: 1 }]);

  addSupplyContainer(world, poi, poi.w - 3, 2, 'Ведомственный ящик воды', ContainerKind.CASHBOX, 'owner', [
    { defId: 'water', count: 5 },
    { defId: 'filtered_water', count: 1 },
    { defId: 'water_coupon', count: 6 },
    { defId: 'ration_registry_extract', count: 1 },
  ], { ownerId: authorityId, ownerName: SERGIN.name, faction: Faction.LIQUIDATOR, tags: ['liquidator', 'theft', 'water'] });
  addSupplyContainer(world, poi, 3, poi.h - 2, 'Общая бочка у стояка', ContainerKind.EMERGENCY_BOX, 'public', [
    { defId: 'metal_water', count: 2 },
    { defId: 'water_coupon', count: 1 },
  ], { tags: ['public', 'water'] });

  for (const defId of ['water', 'water', 'metal_water', 'water_coupon', 'water_coupon', 'bread', 'note']) {
    placeDropNear(world, entities, nextId, poi, defId, 1);
  }

  return poi.room.id + 1;
}

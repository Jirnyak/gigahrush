/* ── Угол потерянного ребёнка — Kvartiry social pressure POI ─── */

import { Tex, Feature, RoomType, Faction, Occupation, QuestType } from '../../core/types';
import { World } from '../../core/world';
import { type Entity } from '../../core/types';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { createSocialPoiRoom, placeDropNear, setFeatureIfFloor, spawnAmbientNpc, spawnSocialNpc } from './social_helpers';

const VERA: PlotNpcDef = {
  name: 'Вера Потеряшкина',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 85, maxHp: 85, money: 12, speed: 0.9,
  inventory: [{ defId: 'tea', count: 1 }, { defId: 'bandage', count: 1 }],
  talkLines: [
    'Тут собирают детей, которых коридор вернул без родителей.',
    'Женя молчит с прошлой сирены. Ему нужна вода и хлеб, не вопросы.',
    'Принесите две бутылки воды. Хлеб я ещё наскребу, без воды дети сдаются быстрее.',
    'Я записываю имена на стене. Стена стирает только тех, кого уже никто не ищет.',
    'Ликвидаторы говорят: эвакуация потом. У детей потом короче, чем у взрослых.',
  ],
  talkLinesPost: [
    'Женя поел. Теперь смотрит на дверь, а не сквозь неё.',
    'Если найдёшь детскую карту, не смейся. Дети рисуют выходы точнее взрослых.',
  ],
};

registerSideQuest('kv_vera_poteryashkina', VERA, [{
  id: 'kv_lost_child_rations',
  giverNpcId: 'kv_vera_poteryashkina',
  type: QuestType.FETCH,
  desc: 'Вера Потеряшкина: «Две бутылки воды для детей, пока коридор их не забрал.»',
  targetItem: 'water', targetCount: 2,
  rewardItem: 'bandage', rewardCount: 2,
  extraRewards: [{ defId: 'bread', count: 2 }, { defId: 'note', count: 2 }],
  relationDelta: 18, xpReward: 45, moneyReward: 10,
}]);

export function generateLostChildCorner(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number }, spawnX: number, spawnY: number,
): number {
  const poi = createSocialPoiRoom(world, nextRoomId, spawnX, spawnY, 'Угол потерянного ребёнка', RoomType.COMMON, 10, 8, Tex.PANEL, Tex.F_CARPET, 75, 230, 1.4);
  if (!poi) return nextRoomId;

  setFeatureIfFloor(world, poi.x + 1, poi.y + 1, Feature.LAMP);
  setFeatureIfFloor(world, poi.x + 2, poi.y + 2, Feature.TABLE);
  setFeatureIfFloor(world, poi.x + 3, poi.y + 2, Feature.CHAIR);
  setFeatureIfFloor(world, poi.x + 6, poi.y + 5, Feature.BED);
  setFeatureIfFloor(world, poi.x + 7, poi.y + 5, Feature.CHAIR);
  setFeatureIfFloor(world, poi.x + poi.w - 2, poi.y + 1, Feature.SHELF);

  spawnSocialNpc(entities, nextId, VERA, 'kv_vera_poteryashkina', poi.x + 2, poi.y + 3);
  spawnAmbientNpc(entities, nextId, 'Женя из сорок третьей', Faction.CITIZEN, Occupation.CHILD, poi.x + 6, poi.y + 4, [{ defId: 'note', count: 1 }]);
  spawnAmbientNpc(entities, nextId, 'Девочка с картой', Faction.CITIZEN, Occupation.CHILD, poi.x + 7, poi.y + 3, [{ defId: 'bread', count: 1 }]);
  spawnAmbientNpc(entities, nextId, 'Сосед-дежурный', Faction.CITIZEN, Occupation.LOCKSMITH, poi.x + 4, poi.y + 5, [{ defId: 'wrench', count: 1 }], 'wrench');

  for (const defId of ['bread', 'bread', 'water', 'water', 'tea', 'bandage', 'note']) {
    placeDropNear(world, entities, nextId, poi, defId, 1);
  }

  return poi.room.id + 1;
}

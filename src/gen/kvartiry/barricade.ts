/* ── Баррикадированный лестничный пролёт — passable POI ──────── */

import { Cell, Tex, Feature, RoomType, Faction, Occupation, QuestType } from '../../core/types';
import { World } from '../../core/world';
import { type Entity } from '../../core/types';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { createSocialPoiRoom, placeDropNear, setFeatureIfFloor, spawnAmbientNpc, spawnSocialNpc } from './social_helpers';

const KARPOV: PlotNpcDef = {
  name: 'Карпов Баррикадный',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.MECHANIC,
  sprite: Occupation.MECHANIC,
  hp: 120, maxHp: 120, money: 22, speed: 0.9,
  inventory: [{ defId: 'wrench', count: 1 }, { defId: 'pipe', count: 1 }, { defId: 'bread', count: 1 }],
  talkLines: [
    'Проход оставил. Узкий, злой, но проход. Баррикада без прохода — это могила.',
    'Дикие давят снизу, ликвидаторы сверху. Мы тут между приказом и голодом.',
    'Нужны трубы и ключи. Три трубы, два ключа — и эта лестница проживёт ещё сирену.',
    'Не ставь шкаф вплотную к двери. Когда туман придёт, шкаф первым попросит выйти.',
    'Если кто скажет, что это незаконно, пусть сам держит пролёт голыми руками.',
  ],
  talkLinesPost: [
    'Железо подошло. Теперь пролёт хотя бы скрипит уверенно.',
    'Проход не расширяй. Широкие проходы любят чужие сапоги.',
  ],
};

registerSideQuest('kv_karpov_barricade', KARPOV, [{
  id: 'kv_barricade_tools',
  giverNpcId: 'kv_karpov_barricade',
  type: QuestType.FETCH,
  desc: 'Карпов Баррикадный: «Три трубы и два гаечных ключа. Иначе пролёт разберут руками.»',
  targetItem: 'pipe', targetCount: 3,
  rewardItem: 'door_kit', rewardCount: 1,
  extraRewards: [{ defId: 'wrench', count: 1 }, { defId: 'bandage', count: 2 }],
  relationDelta: 16, xpReward: 50, moneyReward: 30,
}]);

export function generateBarricade(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number }, spawnX: number, spawnY: number,
): number {
  const poi = createSocialPoiRoom(world, nextRoomId, spawnX, spawnY, 'Баррикадированный пролёт', RoomType.CORRIDOR, 17, 7, Tex.METAL, Tex.F_CONCRETE, 55, 180, 1.7);
  if (!poi) return nextRoomId;

  const midY = poi.y + Math.floor(poi.h / 2);
  const gapX = poi.x + Math.floor(poi.w / 2);
  for (let dx = 2; dx < poi.w - 2; dx++) {
    const x = poi.x + dx;
    if (Math.abs(x - gapX) <= 1) continue;
    const ci = world.idx(x, midY);
    if (world.cells[ci] === Cell.FLOOR) {
      world.cells[ci] = Cell.WALL;
      world.wallTex[ci] = Tex.METAL;
      world.roomMap[ci] = -1;
    }
  }
  setFeatureIfFloor(world, gapX, midY - 1, Feature.TABLE);
  setFeatureIfFloor(world, gapX, midY + 1, Feature.CHAIR);
  setFeatureIfFloor(world, poi.x + 1, poi.y + 1, Feature.LAMP);

  spawnSocialNpc(entities, nextId, KARPOV, 'kv_karpov_barricade', poi.x + 3, poi.y + 2, { weapon: 'wrench' });
  spawnAmbientNpc(entities, nextId, 'Люба с табуретом', Faction.CITIZEN, Occupation.HOUSEWIFE, poi.x + 5, poi.y + 5, [{ defId: 'knife', count: 1 }], 'knife');
  spawnAmbientNpc(entities, nextId, 'Пацан на стрёме', Faction.WILD, Occupation.TRAVELER, poi.x + poi.w - 4, poi.y + 2, [{ defId: 'pipe', count: 1 }], 'pipe');

  for (const defId of ['pipe', 'pipe', 'wrench', 'bandage', 'bread', 'note']) {
    placeDropNear(world, entities, nextId, poi, defId, 1);
  }

  return poi.room.id + 1;
}

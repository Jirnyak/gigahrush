/* ── Пропускное бюро — Ministry admin POI ─────────────────────── */

import {
  Tex, Feature, RoomType, Faction, Occupation, QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import {
  type NextId, createAdminRoom, setFeature, addItemDrop, spawnAdminNpc,
} from './admin_common';
import { genLog } from '../log';

const VERA_DEF: PlotNpcDef = {
  name: 'Вера Пропускова',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 130, maxHp: 130, money: 90, speed: 0.9,
  inventory: [
    { defId: 'ballot', count: 3 },
    { defId: 'note', count: 4 },
    { defId: 'tea', count: 1 },
  ],
  talkLines: [
    'Пропускное бюро слушает. Не стойте на линии ковра без основания.',
    'Пропуск выдается тем, кто уже имеет право на пропуск. Так отделяет порядок от коридора.',
    'Сначала заявление, потом печать, потом архивная карточка. В обратном порядке люди исчезают чаще.',
    'Если вам сказали, что окно закрыто, уточните: какое именно окно. У нас их нет, но формально они работают.',
    'Принесите бюллетени. Я нарежу из них временные корешки, пока шкаф не вспомнит ваш номер.',
    'Не спорьте с очередью. Очередь старше министра.',
    'Если коридор потребует подпись, пишите печатными буквами. Он плохо читает дрожащие руки.',
    'Я видела пропуск без владельца. Он прошёл проверку быстрее всех.',
  ],
  talkLinesPost: [
    'Корешок готов. Не показывайте его дверям, которые смотрят прямо.',
    'Ваше дело пока живое. Это не право, это отсрочка.',
    'Следующее окно примет вас вчера.',
  ],
  talkQuestResponse: 'Передайте, что пропуск без печати является просьбой о допросе.',
};

registerSideQuest('vera_propuskova', VERA_DEF, [
  {
    id: 'permit_ballot_blanks',
    giverNpcId: 'vera_propuskova',
    type: QuestType.FETCH,
    desc: 'Вера Пропускова: «Принесите три бюллетеня. Сделаем временные корешки для пропуска.»',
    targetItem: 'ballot', targetCount: 3,
    rewardItem: 'key', rewardCount: 1,
    extraRewards: [{ defId: 'tea', count: 2 }],
    relationDelta: 14, xpReward: 70, moneyReward: 90,
  },
  {
    id: 'permit_stamp_route',
    giverNpcId: 'vera_propuskova',
    type: QuestType.TALK,
    desc: 'Вера Пропускова: «Отнесите корешок Зое Сургучной в комнату печатей. Без живого слова печать кусается.»',
    targetNpcId: 'zoya_surguchnaya',
    rewardItem: 'note', rewardCount: 2,
    relationDelta: 10, xpReward: 35, moneyReward: 40,
  },
]);

export function generatePermitOffice(
  world: World, nextRoomId: number, entities: Entity[], nextId: NextId, spawnX: number, spawnY: number,
): { nextRoomId: number } {
  const room = createAdminRoom(world, nextRoomId, spawnX, spawnY, {
    type: RoomType.OFFICE,
    name: 'Пропускное бюро',
    w: 11, h: 8,
    minDist: 30, maxDist: 95,
    wallTex: Tex.MARBLE,
    floorTex: Tex.F_GREEN_CARPET,
  });
  if (!room) return { nextRoomId };

  const deskY = room.y + Math.floor(room.h / 2);
  for (let dx = 2; dx < room.w - 2; dx++) {
    setFeature(world, room.x + dx, deskY, Feature.DESK);
  }
  for (let dx = 2; dx < room.w - 2; dx += 2) {
    setFeature(world, room.x + dx, deskY + 1, Feature.CHAIR);
  }
  for (let dy = 1; dy < room.h - 1; dy += 2) {
    setFeature(world, room.x + 1, room.y + dy, Feature.SHELF);
    setFeature(world, room.x + room.w - 2, room.y + dy, Feature.SHELF);
  }
  setFeature(world, room.x + Math.floor(room.w / 2), room.y + 1, Feature.LAMP);
  setFeature(world, room.x + Math.floor(room.w / 2), room.y + room.h - 2, Feature.LAMP);

  addItemDrop(entities, nextId, room.x + 2, room.y + 2, 'ballot', 1);
  addItemDrop(entities, nextId, room.x + room.w - 3, room.y + 2, 'note', 1);
  spawnAdminNpc(entities, nextId, VERA_DEF, 'vera_propuskova', room.x + Math.floor(room.w / 2), deskY - 1);

  genLog(`[MINISTRY_ADMIN] ${room.name} at (${room.x}, ${room.y}) room #${room.id}`);
  return { nextRoomId: room.id + 1 };
}

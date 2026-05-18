/* ── Комната печатей — Ministry admin POI ─────────────────────── */

import {
  Tex, Feature, RoomType, Faction, Occupation, QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import {
  type NextId, createAdminRoom, setFeature, addItemDrop, spawnAdminNpc, spawnNamedCivilian,
} from './admin_common';
import { genLog } from '../log';

const ZOYA_DEF: PlotNpcDef = {
  name: 'Зоя Сургучная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 180, maxHp: 180, money: 140, speed: 0.75,
  inventory: [
    { defId: 'note', count: 5 },
    { defId: 'cigs', count: 2 },
    { defId: 'knife', count: 1 },
  ],
  talkLines: [
    'Не дышите на печати. Они сегодня липкие и нервные.',
    'Я Зоя Сургучная. Ставлю отметки на бумагу, людей и иногда на двери.',
    'Штамп не подтверждает истину. Он подтверждает, что истина стала удобной для шкафа.',
    'Для пропуска нужен корешок, свидетель и что-нибудь красное. Чернила закончились вместе с прошлой сменой.',
    'Принесите записки. Из них выйдут прокладки под печать, чтобы стол не вопил.',
    'Охрана думает, что сторожит меня. На самом деле она сторожит штамп от меня.',
    'Красная дорожка здесь не для красоты. Она показывает, куда печать ползла ночью.',
    'Если услышите хлопок без бумаги, значит кто-то получил отказ заранее.',
  ],
  talkLinesPost: [
    'Печать легла ровно. Это тревожно.',
    'Если бумага начнет греться, не кладите ее к сердцу.',
    'Вера получит отметку. Очередь получит повод.',
  ],
  talkQuestResponse: 'Корешок принят. Скажите Вере: печать не спорила, только шипела.',
};

registerSideQuest('zoya_surguchnaya', ZOYA_DEF, [
  {
    id: 'stamp_room_padding',
    giverNpcId: 'zoya_surguchnaya',
    type: QuestType.FETCH,
    desc: 'Зоя Сургучная: «Пять записок. Подложим под печать, чтобы она не прожгла стол.»',
    targetItem: 'note', targetCount: 5,
    rewardItem: 'psi_mark', rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 3 }],
    relationDelta: 16, xpReward: 80, moneyReward: 120,
  },
  {
    id: 'stamp_archive_route',
    giverNpcId: 'zoya_surguchnaya',
    type: QuestType.TALK,
    desc: 'Зоя Сургучная: «Передайте Осипу Карточному, что печать признала его ящик существующим.»',
    targetNpcId: 'osip_kartochny',
    rewardItem: 'book', rewardCount: 1,
    relationDelta: 10, xpReward: 35, moneyReward: 30,
  },
]);

export function generateStampRoom(
  world: World, nextRoomId: number, entities: Entity[], nextId: NextId, spawnX: number, spawnY: number,
): { nextRoomId: number } {
  const room = createAdminRoom(world, nextRoomId, spawnX, spawnY, {
    type: RoomType.STORAGE,
    name: 'Комната печатей',
    w: 9, h: 7,
    minDist: 45, maxDist: 125,
    wallTex: Tex.MARBLE,
    floorTex: Tex.F_RED_CARPET,
  });
  if (!room) return { nextRoomId };

  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  setFeature(world, cx, cy, Feature.DESK);
  setFeature(world, cx - 1, cy, Feature.TABLE);
  setFeature(world, cx + 1, cy, Feature.TABLE);
  setFeature(world, cx, cy + 1, Feature.CHAIR);
  for (let dx = 1; dx < room.w - 1; dx += 2) {
    setFeature(world, room.x + dx, room.y + 1, Feature.SHELF);
    setFeature(world, room.x + dx, room.y + room.h - 2, Feature.SHELF);
  }
  setFeature(world, cx, room.y + 1, Feature.LAMP);
  setFeature(world, room.x + 1, cy, Feature.LAMP);
  world.wallTex[world.idx(room.x - 1, cy)] = Tex.POSTER_BASE;
  world.wallTex[world.idx(room.x + room.w, cy)] = Tex.PORTRAIT_BASE;

  addItemDrop(entities, nextId, cx - 2, cy - 1, 'note', 1);
  addItemDrop(entities, nextId, cx + 2, cy - 1, 'ballot', 1);
  spawnAdminNpc(entities, nextId, ZOYA_DEF, 'zoya_surguchnaya', cx, cy - 1);
  spawnNamedCivilian(
    entities, nextId, 'Охранник Матвей Пломба', false,
    room.x + 1, room.y + room.h - 2, Occupation.HUNTER, Faction.LIQUIDATOR,
    [{ defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 8 }, { defId: 'note', count: 1 }],
    'makarov',
  );

  genLog(`[MINISTRY_ADMIN] ${room.name} at (${room.x}, ${room.y}) room #${room.id}`);
  return { nextRoomId: room.id + 1 };
}

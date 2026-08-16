/* ── Водомерный пост — radio/water bureaucracy quest hub ─────── */

import { getPlotNpcNumericId } from '../../data/npc_packages';

const HOME_FLOOR_KEY = designNpcFloorKey('maintenance');
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import {
  Tex,
  Feature,
  RoomType,
  Faction,
  Occupation,
  QuestType,
  MonsterKind,
} from '../../core/types';
import { type PlotNpcDef, registerAuthoredNpc, designNpcFloorKey, registerFloorSideQuest } from '../../data/plot';

const AMBIENT_NPC_0: PlotNpcDef = {
  name: 'Практикантка Неля',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 50, maxHp: 50, money: 5, speed: 0.9,
  inventory: [{ defId: 'book', count: 1 }, { defId: 'tea', count: 1 }],
  talkLines: ['...'],
  talkLinesPost: ['...']
};
registerAuthoredNpc({ id: 'maintenance_ambient_0_px4os', npc: AMBIENT_NPC_0, homeFloorKey: HOME_FLOOR_KEY });

import {
  type MaintContentCtx, dropItems, findMaintArea, setFeature, setWater,
  spawnMonstersNear, spawnPlotNpc, stampMaintRoom,
} from './content_helpers';

const SAVA_DEF: PlotNpcDef = {
  name: 'Сава Водомер',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 115, maxHp: 115, money: 90, speed: 0.95,
  inventory: [
    { defId: 'book', count: 1 },
    { defId: 'tea', count: 1 },
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 6 },
  ],
  talkLines: [
    'Сава Водомер. Я считаю воду, которой нет, и недостачу, которая уже была.',
    'Повторитель ловит старый приказ: давление сдать, утечки не признавать.',
    'Если Борис скажет, что зеленое — значит зеленое. Если пол мокрый — пиши красным.',
  ],
  talkLinesPost: [
    'Счетчик опять крутится назад. Хорошо. Значит, долг уходит в стены.',
    'Радио поймало этаж 404. Там тоже требуют показания.',
  ],
};

registerFloorSideQuest(HOME_FLOOR_KEY, 'ag04_watermeter_sava', SAVA_DEF, [
  {
    id: 'ag04_watermeter_tools',
    giverId: getPlotNpcNumericId('ag04_watermeter_sava')!,
    type: QuestType.FETCH,
    desc: 'Сава: «Два ключа для поверки. Один крутит гайку, второй убеждает комиссию.»',
    targetItem: 'wrench', targetCount: 2,
    rewardItem: 'tea', rewardCount: 2,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
    relationDelta: 10, xpReward: 45, moneyReward: 40,
  },
  {
    id: 'ag04_watermeter_relay_talk',
    giverId: getPlotNpcNumericId('ag04_watermeter_sava')!,
    type: QuestType.TALK,
    desc: 'Сава: «Передай Борису: водомер крутится без воды. Пусть подпишет, что это норма.»',
    targetNpcId: getPlotNpcNumericId('ag04_pressure_boris')!,
    rewardItem: 'note', rewardCount: 1,
    relationDelta: 10, xpReward: 35, moneyReward: 25,
  },
  {
    id: 'ag04_watermeter_visit_flooded',
    giverId: getPlotNpcNumericId('ag04_watermeter_sava')!,
    type: QuestType.VISIT,
    desc: 'Сава: «Зайди в затопленную комнату и вернись сухим хотя бы в отчете.»',
    targetRoomType: RoomType.STORAGE,
    rewardItem: 'water', rewardCount: 3,
    relationDelta: 10, xpReward: 35,
  },
  {
    id: 'ag04_watermeter_eye',
    giverId: getPlotNpcNumericId('ag04_watermeter_sava')!,
    type: QuestType.KILL,
    desc: 'Сава: «Один глаз смотрит на счетчик. Убей его, пока он не стал ревизором.»',
    targetMonsterKind: MonsterKind.EYE,
    killNeeded: 1,
    rewardItem: 'makarov', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 12 }],
    relationDelta: 16, xpReward: 70, moneyReward: 90,
  },
  {
    id: 'ag04_watermeter_medicine',
    giverId: getPlotNpcNumericId('ag04_watermeter_sava')!,
    type: QuestType.FETCH,
    desc: 'Сава: «Таблетки нужны для радиосмены. Помехи кусают прямо в затылок.»',
    targetItem: 'pills', targetCount: 2,
    rewardItem: 'antidep', rewardCount: 1,
    extraRewards: [{ defId: 'bandage', count: 2 }],
    relationDelta: 11, xpReward: 50, moneyReward: 55,
  },
]);

export function generateWatermeterPost(ctx: MaintContentCtx): void {
  const cx = Math.floor(ctx.spawnX);
  const cy = Math.floor(ctx.spawnY);
  const pos = findMaintArea(ctx.world, cx, cy, 14, 9, 45, 135);

  const room = stampMaintRoom(
    ctx.world, ctx.world.rooms.length, RoomType.OFFICE,
    pos.x, pos.y, 12, 7,
    'Водомерный пост: давление спорное',
    Tex.METAL, Tex.F_TILE,
  );

  setFeature(ctx.world, room.x + 2, room.y + 2, Feature.DESK);
  setFeature(ctx.world, room.x + 3, room.y + 2, Feature.CHAIR);
  setFeature(ctx.world, room.x + 8, room.y + 2, Feature.APPARATUS);
  setFeature(ctx.world, room.x + 9, room.y + 2, Feature.APPARATUS);
  setFeature(ctx.world, room.x + 6, room.y + 4, Feature.LAMP);
  setFeature(ctx.world, room.x + 10, room.y + 5, Feature.SHELF);
  setWater(ctx.world, room.x + 1, room.y + room.h - 2);
  setWater(ctx.world, room.x + 2, room.y + room.h - 2);

  spawnPlotNpc(ctx, 'ag04_watermeter_sava', SAVA_DEF, room.x + 2, room.y + 3, Math.PI / 2, {
    weapon: 'makarov',
  });
  requireSpawnedPlotNpcFromPackage(ctx.entities, ctx.nextId, 'maintenance_ambient_0_px4os', room.x + 9 + 0.5, room.y + 4 + 0.5, { angle: 0});

  dropItems(ctx, room, ['book', 'note', 'tea', 'water', 'ammo_9mm', 'bandage']);

  spawnMonstersNear(ctx, room.x + 8, room.y + 4, [
    MonsterKind.EYE, MonsterKind.REBAR,
  ], 5, 11);
}

/* ── Дайвер Кот — side quest (maintenance floor) ──────────────── */
/* Дикий ныряльщик из водяных каналов. Жрёт сырое мясо.           */

import {
  W, Cell,
  type Entity, EntityType, AIGoal, Faction, Occupation, QuestType,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';

const NPC_DEF: PlotNpcDef = {
  name: 'Дайвер Кот',
  isFemale: false,
  faction: Faction.WILD,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 200, maxHp: 200, money: 15, speed: 1.5,
  inventory: [
    { defId: 'knife', count: 1 },
    { defId: 'rawmeat', count: 4 },
    { defId: 'flashlight', count: 1 },
  ],
  talkLines: [
    'Хы-хы… Кот меня зовут. Я в воду ныряю. Под полом всё лежит — старое, вкусное.',
    'Канализация — это не канал. Это ВЕНА. По ней хрущ кровь гоняет.',
    'Принеси мне сырого мяса. Шесть кусков. Тварей на нижних ярусах кормить надо.',
    'Зачем кормить? Чтоб пускали. Если не кормишь — жрут самого. Логика, ага.',
  ],
  talkLinesPost: [
    'Хы-хы! Сытно. Твари сегодня меня не тронут.',
    'Если плыть надо — позови. Я знаю где сухие проходы под каналами.',
    'Хороший ты. Кот таких не ест.',
  ],
};

registerSideQuest('diver_kot', NPC_DEF, [
  {
    id: 'kot_meat',
    giverNpcId: 'diver_kot',
    type: QuestType.FETCH,
    desc: 'Кот: «Шесть кусков сырого мяса. Тварей кормить. Иначе — меня сожрут.»',
    targetItem: 'rawmeat', targetCount: 6,
    rewardItem: 'flashlight', rewardCount: 1,
    extraRewards: [
      { defId: 'psi_phase', count: 1 },
      { defId: 'ammo_shells', count: 4 },
    ],
    relationDelta: 12, xpReward: 60, moneyReward: 30,
  },
]);

export function spawnDiverKot(
  world: World, entities: Entity[], nextId: { v: number },
): void {
  for (let i = 0; i < 3000; i++) {
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * W);
    if (world.cells[world.idx(x, y)] !== Cell.FLOOR) continue;
    entities.push({
      id: nextId.v++, type: EntityType.NPC,
      x: x + 0.5, y: y + 0.5,
      angle: Math.random() * Math.PI * 2, pitch: 0,
      alive: true, speed: NPC_DEF.speed, sprite: NPC_DEF.sprite,
      name: NPC_DEF.name, isFemale: NPC_DEF.isFemale,
      needs: freshNeeds(), hp: NPC_DEF.hp, maxHp: NPC_DEF.maxHp, money: NPC_DEF.money,
      ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: NPC_DEF.inventory.map(i => ({ ...i })),
      weapon: 'knife',
      faction: NPC_DEF.faction, occupation: NPC_DEF.occupation,
      plotNpcId: 'diver_kot', canGiveQuest: true, questId: -1,
      isTraveler: true,
    });
    return;
  }
}

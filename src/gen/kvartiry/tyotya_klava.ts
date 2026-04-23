/* ── Тётя Клава — side quest (kvartiry floor) ─────────────────── */
/* Хозяйка-самогонщица. Скупает сахар, варит самогон.              */

import {
  W, Cell,
  type Entity, EntityType, AIGoal, Faction, Occupation, QuestType,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';

const NPC_DEF: PlotNpcDef = {
  name: 'Тётя Клава',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 90, maxHp: 90, money: 60, speed: 0.8,
  inventory: [
    { defId: 'kompot', count: 4 },
    { defId: 'kasha', count: 3 },
    { defId: 'cigs', count: 2 },
  ],
  talkLines: [
    'Заходи, милок, заходи. Тётя Клава рада гостям.',
    'Я тут самогонкой балуюсь. Тише только — Жириновский с ликвидаторами рейды устраивает.',
    'Сахара мне не хватает. Ты бы хлеба принёс — я на нём брагу поставлю. Восемь буханок.',
    'А я тебе компотика налью. Настоящего, на спирту. Мёртвых поднимает.',
  ],
  talkLinesPost: [
    'Уф, теперь до самосбора хватит. Заходи на стопочку.',
    'Ликвидаторам не выдавай меня. Ты мужик.',
    'Если тебе таблеток надо — у меня есть. От головы. И от души.',
  ],
};

registerSideQuest('tyotya_klava', NPC_DEF, [
  {
    id: 'klava_bread',
    giverNpcId: 'tyotya_klava',
    type: QuestType.FETCH,
    desc: 'Тётя Клава: «Восемь буханок хлеба, милок. Брагу поставлю.»',
    targetItem: 'bread', targetCount: 8,
    rewardItem: 'kompot', rewardCount: 6,
    extraRewards: [
      { defId: 'pills', count: 3 },
      { defId: 'cigs', count: 3 },
    ],
    relationDelta: 15, xpReward: 40, moneyReward: 50,
  },
]);

export function spawnTyotyaKlava(
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
      faction: NPC_DEF.faction, occupation: NPC_DEF.occupation,
      plotNpcId: 'tyotya_klava', canGiveQuest: true, questId: -1,
      isTraveler: true,
    });
    return;
  }
}

/* ── Валерий Мухин — side quest content module ──────────────── */
import { Faction, Occupation, QuestType, type Entity } from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { pick } from '../shared';

const NPC_DEF: PlotNpcDef = {
  name: 'Валерий Мухин',
  firstName: 'Валерий',
  lastName: 'Мухин',
  isFemale: false,
  age: 62,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
    level: 10,
    money: 300, inventory: [
    { defId: 'used_gasmask_filter', count: 3 },
    { defId: 'duct_tape', count: 2 },
  ],
  talkLines: [
    'Новый ребризер? Недорого. Собираю сам, гарантия — моё честное слово.',
    'Олевия... талантливая женщина. Мы с ней делаем вещи, которые этот блок ещё не видел.',
    'Фильтры со склада — это дорого. Мои работают не хуже, если изолента не отклеится.',
    'Аргонов? Наркоман обычный. Говорит, мой аппарат сломался. Да он просто дышать не умеет.',
  ],
  talkLinesPost: [
    'Отличный утиль. Замотаю скотчем, промою водой, и можно продавать новичкам.',
    'Бизнес идёт. Главное — чтобы клиент не успел вернуться с претензиями после тревоги.',
    'Олевии передай, что скоро занесу долю. Латекс нынче в цене.',
  ],
};

registerSideQuest('valeriy_mukhin', NPC_DEF, [
  {
    id: 'mukhin_filters',
    giverNpcId: 'valeriy_mukhin',
    type: QuestType.FETCH,
    desc: 'Валерий Мухин: «Мне нужны материалы для новых "чистых" фильтров. Принеси 5 отработанных фильтров, я знаю, как их восстановить.»',
    targetItem: 'used_gasmask_filter', targetCount: 5,
    rewardItem: 'stolen_filter_pack', rewardCount: 1,
    relationDelta: 15, xpReward: 40, moneyReward: 30,
  },
]);

export function spawnMukhin(
  world: World, entities: Entity[], nextId: { v: number },
): void {
  const room = pick(world.rooms);
  if (!room) return;

  requireSpawnedPlotNpcFromPackage(entities, nextId, 'valeriy_mukhin', room.x + Math.floor(room.w / 2) + 0.5, room.y + Math.floor(room.h / 2) + 0.5, {
    angle: Math.random() * Math.PI * 2,
    canGiveQuest: true,
    isTraveler: true,
  });
}

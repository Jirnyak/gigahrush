/* ── Навэльный — side quest NPC for Квартиры floor ────────────── */

import {
  W, Cell,
  type Entity, EntityType, AIGoal, Faction, Occupation, QuestType,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';

/* ── NPC definition ──────────────────────────────────────────── */
const NPC_DEF: PlotNpcDef = {
  name: 'Навэльный',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 200, maxHp: 200, money: 0, speed: 1.0,
  inventory: [
    { defId: 'ballot', count: 5 },
  ],
  talkLines: [
    'Граждане! Хватит терпеть произвол! Мы должны объединиться!',
    'Система прогнила. Ликвидаторы — псы режима. Нам нужно УМНОЕ ГОЛОСОВАНИЕ!',
    'Собери 100 бюллетеней — и мы устроим честные выборы! Бюллетени разбросаны по всему этажу.',
    'Каждый голос на счету! Революция не ждёт!',
    'Они нас боятся — потому что нас больше! Пять тысяч против тысячи!',
    'Мы — оппозиция! Наше оружие — правда и бюллетени!',
    'Не верь пропаганде ликвидаторов. Они служат системе, а не людям.',
    'Когда мы соберём голоса — всё изменится. Я обещаю.',
  ],
  talkLinesPost: [
    'Спасибо! Голоса собраны! Теперь мы изменим этот этаж!',
    'Выборы прошли! Но борьба продолжается!',
    'Ты настоящий гражданин. Вместе мы сила!',
    'Революция свершилась! По крайней мере на бумаге...',
  ],
};

/* ── Register NPC + quest ────────────────────────────────────── */
registerSideQuest('navelny', NPC_DEF, [
  {
    id: 'smart_voting',
    giverNpcId: 'navelny',
    type: QuestType.FETCH,
    desc: 'Навэльный: «Собери 100 бюллетеней для УМНОГО ГОЛОСОВАНИЯ! Бюллетени разбросаны по квартирам.»',
    targetItem: 'ballot', targetCount: 100,
    rewardItem: 'antidep', rewardCount: 5,
    relationDelta: 30, xpReward: 100, moneyReward: 500,
  },
]);

/* ── Spawn Navelny at random floor cell ──────────────────────── */
export function spawnNavelny(
  world: World, entities: Entity[], nextId: { v: number },
): void {
  for (let i = 0; i < 2000; i++) {
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
      plotNpcId: 'navelny', canGiveQuest: true, questId: -1,
      isTraveler: true,
    });
    return;
  }
}

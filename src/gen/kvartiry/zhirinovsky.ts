/* ── Жириновский — side quest (kvartiry floor) ────────────────── */
/* Шумный политик-провокатор. Контрбаланс Навэльному.              */

import {
  W, Cell,
  type Entity, EntityType, AIGoal, Faction, Occupation, QuestType, MonsterKind,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';

const NPC_DEF: PlotNpcDef = {
  name: 'Жириновский',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 250, maxHp: 250, money: 300, speed: 1.2,
  inventory: [
    { defId: 'shotgun', count: 1 },
    { defId: 'ammo_shells', count: 8 },
    { defId: 'cigs', count: 5 },
    { defId: 'kompot', count: 2 },
  ],
  talkLines: [
    'ОДНОЗНАЧНО! Слушайте сюда, я вам сейчас всё объясню!',
    'Я — единственный политик в этом проклятом хруще! Все остальные — ВРАГИ НАРОДА!',
    'Этот ваш Навэльный — провокатор! Он за бюллетени продал бы родную мать!',
    'Тени из стен лезут? А я говорил! Я ВСЕГДА говорил! Теневики — это последствие либерализма!',
    'Принеси мне головы пятерых теневиков! И я тебе покажу настоящую политику!',
    'Сапоги в Индийском океане! Бесплатная водка! Всем по квартире! Я ОБЕЩАЮ!',
  ],
  talkLinesPost: [
    'ОДНОЗНАЧНО ПОБЕДА! Теневики наказаны!',
    'Молодец, патриот. Возьми сигарету. Бесплатно.',
    'Если ещё кого надо устранить — ты знаешь, где меня искать.',
  ],
};

registerSideQuest('zhirinovsky', NPC_DEF, [
  {
    id: 'zhirik_shadows',
    giverNpcId: 'zhirinovsky',
    type: QuestType.KILL,
    desc: 'Жириновский: «ОДНОЗНАЧНО! Пять теневиков! Без них — никакой политики!»',
    targetMonsterKind: MonsterKind.SHADOW,
    killNeeded: 5,
    rewardItem: 'ppsh', rewardCount: 1,
    extraRewards: [
      { defId: 'ammo_9mm', count: 30 },
      { defId: 'cigs', count: 5 },
      { defId: 'kompot', count: 2 },
    ],
    relationDelta: 20, xpReward: 90, moneyReward: 200,
  },
]);

export function spawnZhirinovsky(
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
      weapon: 'shotgun',
      faction: NPC_DEF.faction, occupation: NPC_DEF.occupation,
      plotNpcId: 'zhirinovsky', canGiveQuest: true, questId: -1,
      isTraveler: true,
    });
    return;
  }
}

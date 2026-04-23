/* ── Ветеран Степаныч — side quest content module ─────────────── */
/* Wandering hunter who lost his squad. Wants the player to clean   */
/* zombies. Self-contained: NPC + KILL quest + spawn.               */

import {
  W, Cell,
  type Entity, EntityType, AIGoal, Faction, Occupation, QuestType, MonsterKind,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { Spr } from '../../render/sprite_index';

const NPC_DEF: PlotNpcDef = {
  name: 'Ветеран Степаныч',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Spr.VETERAN,
  hp: 220, maxHp: 220, money: 60, speed: 1.0,
  inventory: [
    { defId: 'pipe', count: 1 },
    { defId: 'cigs', count: 4 },
    { defId: 'kompot', count: 1 },
  ],
  talkLines: [
    'Я Степаныч. Ликвидатор первой волны. Был… Сейчас просто ходок.',
    'Мой взвод полёг в коридоре «Г-7». Мертвяки полезли изо всех щелей. Двенадцать мужиков.',
    'С тех пор я их режу везде где встречу. По одному. По два. Считаю.',
    'Поможешь? Я уже не тот. Руки трясутся. А мертвяков всё больше.',
  ],
  talkLinesPost: [
    'Ты молодец, парень. Взвод бы тобой гордился.',
    'Курить будешь? У меня всегда есть.',
    'Если снова мертвяки полезут — крикни. Приду.',
  ],
};

registerSideQuest('veteran_stepanych', NPC_DEF, [
  {
    id: 'stepanych_zombies',
    giverNpcId: 'veteran_stepanych',
    type: QuestType.KILL,
    desc: 'Степаныч: «Прибей пятерых мертвяков. За мой взвод. Для счёта.»',
    targetMonsterKind: MonsterKind.ZOMBIE,
    killNeeded: 5,
    rewardItem: 'rebar', rewardCount: 1,
    extraRewards: [{ defId: 'kompot', count: 2 }, { defId: 'bandage', count: 2 }],
    relationDelta: 20, xpReward: 60, moneyReward: 80,
  },
]);

export function spawnVeteran(
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
      weapon: 'pipe',
      faction: NPC_DEF.faction, occupation: NPC_DEF.occupation,
      plotNpcId: 'veteran_stepanych', canGiveQuest: true, questId: -1,
      isTraveler: true,
    });
    return;
  }
}

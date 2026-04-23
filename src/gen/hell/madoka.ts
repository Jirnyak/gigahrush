/* ── Медука Мегуку — anime magical girl wanderer (hell) ───────── */
/* Высокий ПСИ, фигачит хамехамехой (psi_beam).                    */

import {
  W, Cell,
  type Entity, EntityType, AIGoal, Faction, Occupation,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { Spr } from '../../render/sprite_index';

const NPC_DEF: PlotNpcDef = {
  name: 'Медука Мегуку',
  isFemale: true,
  faction: Faction.SCIENTIST,
  occupation: Occupation.HUNTER,
  sprite: Spr.MADOKA,
  hp: 3333, maxHp: 3333, money: 0, speed: 1.5,
  inventory: [
    { defId: 'psi_beam', count: 1 },
    { defId: 'psi_strike', count: 5 },
    { defId: 'psi_storm', count: 2 },
    { defId: 'antidep', count: 5 },
    { defId: 'holy_water', count: 2 },
  ],
  talkLines: [
    'Я должна бороться с ведьмами! Это моё желание!',
    'Я должна превозмогать и нести свет в этот мрачный мир!',
    'Кьюбей сказал, что у каждой девочки есть одно желание. У меня — спасти всех!',
    'Магическая девочка не имеет права отступать! Никогда!',
    'Хамехамехаааа!! Прости, это вырвалось.',
    'Чем глубже отчаяние — тем ярче надежда. Так говорила Хомура.',
    'Я ещё не загадала желание. Но я готова. За всех.',
    'Вы тоже видите этих… монстров? Они и есть ведьмы. Я знаю.',
    'Мой посох поёт. Это значит — рядом ведьма. Будьте осторожны.',
    'Свет! Свет! Свет в каждый угол этого ада!',
  ],
  talkLinesPost: [
    'Спасибо что выслушал. Это придаёт сил.',
    'Я буду превозмогать. До конца.',
  ],
};

registerSideQuest('meduka_meguku', NPC_DEF, []);

export function spawnMedukaMeguku(
  world: World, entities: Entity[], nextId: { v: number },
): void {
  for (let i = 0; i < 4000; i++) {
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
      weapon: 'psi_beam',
      faction: NPC_DEF.faction, occupation: NPC_DEF.occupation,
      plotNpcId: 'meduka_meguku', canGiveQuest: false, questId: -1,
      isTraveler: true,
      rpg: {
        level: 12, xp: 0, attrPoints: 0,
        str: 5, agi: 8, int: 20,
        psi: 9999, maxPsi: 9999,
      },
    });
    return;
  }
}

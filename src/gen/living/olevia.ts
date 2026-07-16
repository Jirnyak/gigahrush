/* ── Олевия Кибер — side quest content module ──────────────── */
import { getPlotNpcNumericId } from '../../data/npc_packages';
import { Faction, Occupation, QuestType } from '../../core/types';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';

const NPC_DEF: PlotNpcDef = {
  name: 'Олевия Кибер',
  firstName: 'Олевия',
  lastName: 'Кибер',
  isFemale: true,
  age: 35,
  faction: Faction.SCIENTIST,
  occupation: Occupation.SCIENTIST,
  sprite: Occupation.SCIENTIST,
  homeFloorKey: 'design:slime_nii',
  spawnRoomAlias: 'clean_lab',
    level: 2,
    money: 200, inventory: [
    { defId: 'krona_battery', count: 2 },
    { defId: 'duct_tape', count: 1 },
  ],
  talkLines: [
    'Я — ведущий нейробиолог из МГУ... то есть, из НИИ Слизи. Мои киберкостюмы — прорыв в защите от Самосбора!',
    'Латекс, лампочки, трубки. Это внешний нейроинтерфейс, а не просто изолента, как говорят злые языки.',
    'Мухин обещал принести новые детали для ребризера. У нас с ним... важный научный проект.',
    'Не слушай Аргонова. Он сам виноват, что полез в очаг, не прочитав инструкцию к моему костюму.',
  ],
  talkLinesPost: [
    'Батарейки подошли. Теперь лампочки на груди мигают как надо. Наука спасает жизни!',
    'Нужно больше материалов. Самосбор не ждёт, пока мы тут сидим сложа руки.',
    'Кибернетика — это будущее блока. Главное, чтобы костюм сидел плотно.',
  ],
};

registerSideQuest('olevia_kiber', NPC_DEF, [
  {
    id: 'olevia_batteries',
    giverId: getPlotNpcNumericId('olevia_kiber')!,
    type: QuestType.FETCH,
    desc: 'Олевия Кибер: «Для завершения испытаний внешнего нейроинтерфейса нужны источники питания. Принеси 3 батарейки «Крона».»',
    targetItem: 'krona_battery', targetCount: 3,
    rewardItem: 'hermetic_tape', rewardCount: 2,
    relationDelta: 20, xpReward: 50, moneyReward: 50,
  },
]);



/* ── Аптечный разменник — household medicine crisis POI ─────── */

import { Tex, Feature, RoomType, Faction, Occupation, QuestType } from '../../core/types';
import { World } from '../../core/world';
import { type Entity } from '../../core/types';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { createSocialPoiRoom, placeDropNear, setFeatureIfFloor, spawnAmbientNpc, spawnSocialNpc } from './social_helpers';

const NINA: PlotNpcDef = {
  name: 'Нина Таблеткина',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.DOCTOR,
  sprite: Occupation.DOCTOR,
  hp: 90, maxHp: 90, money: 28, speed: 0.9,
  inventory: [{ defId: 'bandage', count: 2 }, { defId: 'tea', count: 1 }],
  talkLines: [
    'Это не медпункт, это обмен телесными сроками.',
    'У ликвидаторов бинты, у диких таблетки, у детей температура. И все называют это порядком.',
    'Четыре упаковки таблеток дадут нам ночь без крика из сорок шестой.',
    'Если отдашь таблетки Рудневу, он закроет шкаф. Если отдашь мне, он закроет лицо.',
    'Я не спрашиваю, откуда лекарство. Я спрашиваю, кому оно успеет помочь.',
  ],
  talkLinesPost: [
    'Дети уснули. Теперь можно услышать, как спорят взрослые.',
    'Руднев злится тише обычного. Значит, считает.',
  ],
};

const RUDNEV: PlotNpcDef = {
  name: 'Руднев Перевязочный',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.DOCTOR,
  sprite: Occupation.DOCTOR,
  hp: 120, maxHp: 120, money: 45, speed: 1.0,
  inventory: [{ defId: 'ammo_9mm', count: 8 }, { defId: 'bandage', count: 1 }],
  talkLines: [
    'Медикаменты идут по списку. Кто не в списке, тот терпит.',
    'Нина раздаёт таблетки по жалости, Лёха продаёт по страху. Оба портят учёт.',
    'Верни четыре бинта в пост. После сирены я буду помнить, кто держал перевязку.',
    'Если шкаф пустой, коридор лечится прикладом.',
    'Доступ к запасу не право, а дисциплина.',
  ],
  talkLinesPost: [
    'Бинты на месте. Пост сегодня стреляет не в каждого кашляющего.',
    'Нине скажи: жалость не стерильна.',
  ],
};

const LEKHA: PlotNpcDef = {
  name: 'Лёха Меняла',
  isFemale: false,
  faction: Faction.WILD,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 105, maxHp: 105, money: 13, speed: 1.2,
  inventory: [{ defId: 'pipe', count: 1 }, { defId: 'cigs', count: 3 }],
  talkLines: [
    'Таблетка в руке честнее талона в кармане.',
    'Мне нужны два антидепрессанта. Не для души, для переговоров.',
    'Ликвидатор держит шкаф, Нина держит детей, я держу дверь. Выбирай, кому веришь.',
    'Если принёс лекарство сюда, назад оно уже идёт по другой цене.',
    'Не бойся слова "краденое". В хруще всё когда-то было чьим-то.',
  ],
  talkLinesPost: [
    'Дверь пока наша. Проходи быстро, пока цена не проснулась.',
    'Нина смотрит как врач. Руднев смотрит как протокол. Я смотрю как человек с трубой.',
  ],
};

const SERAFIMA: PlotNpcDef = {
  name: 'Серафима Шептунья',
  isFemale: true,
  faction: Faction.CULTIST,
  occupation: Occupation.PRIEST,
  sprite: Occupation.PRIEST,
  hp: 95, maxHp: 95, money: 9, speed: 0.9,
  inventory: [{ defId: 'note', count: 2 }, { defId: 'tea', count: 1 }],
  talkLines: [
    'Стена принимает боль, но таблетки делают её разговорчивой.',
    'Три упаковки таблеток, и я уговорю больных молчать до следующей сирены.',
    'Нина лечит тело. Руднев лечит порядок. Лёха лечит цену.',
    'Если лекарство ушло детям, стена голодна. Если стене, дети слышат её лучше.',
    'Не каждый обмен виден в журнале. Некоторые пишут на коже.',
  ],
  talkLinesPost: [
    'Тише стало. Значит, стена жуёт.',
    'Руднев думает, что это кража. Он не слышал, как лекарство само просилось.',
  ],
};

registerSideQuest('kv_nina_tabletkina', NINA, [{
  id: 'kv_medicine_children',
  giverNpcId: 'kv_nina_tabletkina',
  type: QuestType.FETCH,
  desc: 'Нина Таблеткина: «Четыре упаковки таблеток детям. Иначе этот коридор будет слушать их жар всю ночь.»',
  targetItem: 'pills', targetCount: 4,
  rewardItem: 'bandage', rewardCount: 2,
  extraRewards: [{ defId: 'water', count: 2 }, { defId: 'bread', count: 2 }],
  relationDelta: 16, xpReward: 45, moneyReward: 25,
}]);

registerSideQuest('kv_rudnev_perevyazochny', RUDNEV, [{
  id: 'kv_liquidator_bandages',
  giverNpcId: 'kv_rudnev_perevyazochny',
  type: QuestType.FETCH,
  desc: 'Руднев Перевязочный: «Четыре бинта обратно в пост. Без перевязки зачистка станет расстрелом.»',
  targetItem: 'bandage', targetCount: 4,
  rewardItem: 'ammo_9mm', rewardCount: 12,
  extraRewards: [{ defId: 'canned', count: 1 }, { defId: 'water', count: 1 }],
  relationDelta: 12, xpReward: 50, moneyReward: 45,
}]);

registerSideQuest('kv_lekha_menyala', LEKHA, [{
  id: 'kv_wild_antidep_swap',
  giverNpcId: 'kv_lekha_menyala',
  type: QuestType.FETCH,
  desc: 'Лёха Меняла: «Два антидепрессанта, и дверь останется доброй к тебе.»',
  targetItem: 'antidep', targetCount: 2,
  rewardItem: 'pipe', rewardCount: 1,
  extraRewards: [{ defId: 'cigs', count: 4 }, { defId: 'water', count: 1 }],
  relationDelta: 10, xpReward: 40, moneyReward: 20,
}]);

registerSideQuest('kv_serafima_sheptunya', SERAFIMA, [{
  id: 'kv_cultist_silent_pills',
  giverNpcId: 'kv_serafima_sheptunya',
  type: QuestType.FETCH,
  desc: 'Серафима Шептунья: «Три упаковки таблеток для тех, кто слышит стену слишком громко.»',
  targetItem: 'pills', targetCount: 3,
  rewardItem: 'psi_stabilizer', rewardCount: 1,
  extraRewards: [{ defId: 'tea', count: 2 }, { defId: 'note', count: 2 }],
  relationDelta: 8, xpReward: 55, moneyReward: 10,
}]);

export function generateMedicineSwap(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number }, spawnX: number, spawnY: number,
): number {
  const poi = createSocialPoiRoom(world, nextRoomId, spawnX, spawnY, 'Аптечный разменник', RoomType.MEDICAL, 14, 9, Tex.TILE_W, Tex.F_TILE, 85, 260, 1.9);
  if (!poi) return nextRoomId;

  for (let x = 2; x < poi.w - 2; x += 3) setFeatureIfFloor(world, poi.x + x, poi.y + 2, Feature.SHELF);
  setFeatureIfFloor(world, poi.x + 1, poi.y + 1, Feature.LAMP);
  setFeatureIfFloor(world, poi.x + poi.w - 2, poi.y + 1, Feature.LAMP);
  setFeatureIfFloor(world, poi.x + 3, poi.y + 5, Feature.BED);
  setFeatureIfFloor(world, poi.x + 5, poi.y + 5, Feature.TABLE);
  setFeatureIfFloor(world, poi.x + 6, poi.y + 5, Feature.CHAIR);
  setFeatureIfFloor(world, poi.x + poi.w - 3, poi.y + 6, Feature.DESK);
  setFeatureIfFloor(world, poi.x + poi.w - 4, poi.y + 6, Feature.CHAIR);

  spawnSocialNpc(entities, nextId, NINA, 'kv_nina_tabletkina', poi.x + 2, poi.y + 4);
  spawnSocialNpc(entities, nextId, RUDNEV, 'kv_rudnev_perevyazochny', poi.x + poi.w - 3, poi.y + 3, { weapon: 'makarov' });
  spawnSocialNpc(entities, nextId, LEKHA, 'kv_lekha_menyala', poi.x + 7, poi.y + 6, { weapon: 'pipe' });
  spawnSocialNpc(entities, nextId, SERAFIMA, 'kv_serafima_sheptunya', poi.x + 10, poi.y + 5);
  spawnAmbientNpc(entities, nextId, 'Пациент без талона', Faction.CITIZEN, Occupation.TRAVELER, poi.x + 4, poi.y + 6, [{ defId: 'note', count: 1 }]);
  spawnAmbientNpc(entities, nextId, 'Дежурный у шкафа', Faction.LIQUIDATOR, Occupation.HUNTER, poi.x + poi.w - 5, poi.y + 2, [{ defId: 'ammo_9mm', count: 6 }], 'makarov');
  spawnAmbientNpc(entities, nextId, 'Носильщик с пустой сумкой', Faction.WILD, Occupation.LOCKSMITH, poi.x + 8, poi.y + 2, [{ defId: 'wrench', count: 1 }], 'wrench');

  for (const defId of [
    'pills', 'pills', 'pills', 'pills',
    'bandage', 'bandage', 'bandage',
    'antidep', 'antidep',
    'water', 'bread', 'note', 'cigs',
  ]) {
    placeDropNear(world, entities, nextId, poi, defId, 1);
  }

  return poi.room.id + 1;
}

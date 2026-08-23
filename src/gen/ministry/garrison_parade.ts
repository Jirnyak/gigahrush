/* ── Смотр гарнизона — сцена первого визита на министерство ───────
 *
 * Генерал Заслонов объявляет строю, что самосборы участились, а гарнизон этажа
 * удвоен, и разводит сводные роты по постам. Своего кода у сцены нет: она
 * объявляет актёров и такты, отыгрывает общий проигрыватель (`cutscene.md`).
 *
 * Никто не отпускается тактом `release`, и это не заморозка: цикл AI ведёт
 * актёра сцены наравне со всеми, его держит короткий поводок к своему месту в
 * строю. Строй стоит смирно, но он живой — переминается, слышит шум, отвечает
 * на удар и вступается за своих. Отпускает людей сам развод: `moveTo` снимает
 * роль с названной сводной. Живого фона добавляет и сам этаж — вестибюль стоит
 * на скрещении обеих публичных осей, и служащие ходят через него сами.
 */

import { Faction, Occupation } from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef, registerAuthoredNpc } from '../../data/plot';
import { registerFloorScene, type SceneActorDef } from '../../systems/cinematics';
import { MINISTRY_VESTIBULE_ANCHOR } from './geometry';

export const GARRISON_PARADE_SCENE_ID = 'ministry_garrison_parade' as const;
export const PARADE_GENERAL_ID = 'general_zaslonov' as const;

const MINISTRY_FLOOR_KEY = designNpcFloorKey('ministry');

const GENERAL_VOICE = '#e6ddbe';
const RANKS_VOICE = '#cfe0c8';
const WATCH_VOICE = '#c8bfae';

/**
 * Строй: две полосы по четыре колонны, между ними проход по оси зала.
 *
 * Вестибюль 33x33, то есть смещения лежат в пределах ±16. Полоса отстоит от оси
 * на десять клеток и расходится на шесть: люди занимают ±4..±16, а проход ±3
 * остаётся чистым — по нему сводные и уходят мимо генерала.
 */
const RANK_BAND = 10;
const RANK_SPREAD = 6;
const RANK_COLUMNS = [-12, -4, 4, 12];
const RANK_COUNT = 40;
const RANK_LEVEL = 10;

/**
 * Зрители — по ДРУГУЮ сторону полков от генерала, у восточного торца и дальше в
 * осевом коридоре. Между ними и трибуной весь строй: смотр смотрят из-за спин.
 * Коридор здесь гарантированно открыт — публичная ось режется на всю ширину
 * этажа полосой в тринадцать клеток, то есть oy от −6 до +6.
 */
const WATCH_OX = 20;
const WATCH_SPREAD = 5;

/** Генерал — у западного торца прохода: сводные уходят на запад и идут мимо него. */
const GENERAL_OX = -9;
/** Пост за спиной генерала, уже в осевом коридоре за пределами зала. */
const MARCH_OUT_OX = -22;

/** Роль шеренги по колонне и стороне прохода: `rank_n1`..`rank_s4`. */
function rankRole(column: number, side: number): string {
  return `rank_${side < 0 ? 'n' : 's'}${column + 1}`;
}

function rankActors(): SceneActorDef[] {
  const actors: SceneActorDef[] = [];
  for (let column = 0; column < RANK_COLUMNS.length; column++) {
    for (const side of [-1, 1]) {
      actors.push({
        role: rankRole(column, side),
        count: RANK_COUNT,
        faction: Faction.LIQUIDATOR,
        occupation: Occupation.HUNTER,
        level: RANK_LEVEL,
        ox: RANK_COLUMNS[column],
        oy: RANK_BAND * side,
        spread: RANK_SPREAD,
      });
    }
  }
  return actors;
}

const GENERAL_DEF: PlotNpcDef = {
  name: 'Генерал Заслонов',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  // Спрайт распорядителя, а не охотника: в зале четыреста одинаковых шинелей, и
  // тот, на ком стоит кадр, обязан читаться силуэтом, а не подписью.
  sprite: Occupation.DIRECTOR,
  // Дом объявлен точной комнатой: доставка авторских пакетов ставит по
  // `spawnRoomAlias`, а без него генерал уехал бы на случайную клетку этажа.
  spawnRoomAlias: MINISTRY_VESTIBULE_ANCHOR,
  hp: 1200, maxHp: 1200, money: 1400, speed: 1.1,
  inventory: [
    { defId: 'ppsh', count: 1 },
    { defId: 'ammo_9mm', count: 60 },
    { defId: 'grenade', count: 3 },
    { defId: 'bandage', count: 4 },
  ],
  talkLines: [
    'Генерал Заслонов. Оборона Министерства. Коротко и по делу.',
    'Самосборы участились. Раньше их считали по одному в квартал, теперь — по одному в смену.',
    'Гарнизон этажа удвоен. Людей хватит. Не хватает времени.',
    'Встретите тварь на рубеже — не геройствуйте. Докладывайте живым.',
  ],
  talkLinesPost: [
    'Рубежи держим. Пока держим.',
    'Свободен.',
  ],
};

registerAuthoredNpc({
  id: PARADE_GENERAL_ID,
  npc: GENERAL_DEF,
  homeFloorKey: MINISTRY_FLOOR_KEY,
  tags: ['ministry', 'liquidator', 'parade'],
});

registerFloorScene({
  id: GARRISON_PARADE_SCENE_ID,
  floorKey: MINISTRY_FLOOR_KEY,
  anchorRoomAlias: MINISTRY_VESTIBULE_ANCHOR,
  trigger: { kind: 'first_visit' },
  /* Потолок с запасом на ПОДЛЁТ: игрок приезжает на случайный из шестнадцати
   * лифтов этажа, и дорога до центра бывает вчетверо длиннее прямой. Сама сцена
   * укладывается примерно в две минуты. */
  maxSeconds: 200,
  /* Общий поводок держит РАЗВЕДЁННЫЕ сводные у скрещения: пост за торцом зала
   * лежит в двадцати двух клетках от якоря, и более короткий утащил бы колонну
   * обратно на середине марша. Стоящих смирно он не касается: пока роль сцены на
   * человеке, его держит короткий поводок к СВОЕМУ месту в строю. */
  leash: 26,
  actors: [
    { role: 'general', packageId: PARADE_GENERAL_ID, ox: GENERAL_OX, oy: 0 },
    ...rankActors(),
    /* Служащие министерства смотрят смотр из-за строя. Не отпускаются: на посту
     * человек всё равно живой — переминается, оборачивается, отвечает, если его
     * заденут, — просто не расходится. Толпа зевак, разошедшаяся в первые же
     * секунды, оставила бы кадр без публики. */
    {
      role: 'clerks',
      count: 30,
      faction: Faction.CITIZEN,
      occupation: Occupation.SECRETARY,
      level: 2,
      ox: WATCH_OX,
      oy: -3,
      spread: WATCH_SPREAD,
    },
    {
      role: 'onlookers',
      count: 20,
      faction: Faction.CITIZEN,
      occupation: Occupation.CLEANER,
      level: 1,
      ox: WATCH_OX,
      oy: 3,
      spread: WATCH_SPREAD,
    },
  ],
  beats: [
    // Дальний подлёт: без `look`, кадр смотрит по курсу и поворачивает вместе с
    // коридорами. Точка входа — восточный конец прохода, откуда виден весь строй.
    { kind: 'fly', to: { ox: 14, oy: 8 }, speed: 20, height: 1.1 },

    /* ОДИН длинный проезд вдоль строя, а не четыре коротких.
     *
     * Раньше здесь было четыре пролёта по углам зала: кадр доходил до точки,
     * ВСТАВАЛ, менял субъекта взгляда и трогался снова — шесть остановок и пять
     * смен взгляда на тридцати клетках. Каждая читалась рывком. Теперь камера
     * идёт вдоль южной полосы на запад одним ходом, а взгляд держит НЕПОДВИЖНУЮ
     * точку в северной полосе: строй проходит через кадр сам, без доворотов.
     *
     * Точка внимания взята местом, а не ролью: центр масс роли в сорок человек
     * не совпадает ни с кем, и кадр целился бы в пустоту между шеренгами. */
    { kind: 'fly', to: { ox: -14, oy: 8 }, look: { ox: 0, oy: -8 }, speed: 6, height: 1.8 },
    // Переход поперёк прохода у западного торца. Взгляд УЖЕ на генерале и дальше
    // не меняется до самого облёта: одна смена субъекта вместо пяти.
    { kind: 'fly', to: { ox: -14, oy: -8 }, look: { role: 'general' }, speed: 4, height: 1.5 },
    // Выход на генерала. Радиус облёта — пять: западная стена в семи с половиной
    // клетках от него, и круг вровень с ней скрёб бы простенок весь оборот.
    { kind: 'fly', to: { ox: -3, oy: -2 }, look: { role: 'general' }, speed: 5, height: 0.85 },
    { kind: 'orbit', around: { role: 'general' }, radius: 5, speed: 0.22, height: 0.95, seconds: 6 },

    { kind: 'say', role: 'general', text: 'Товарищи ликвидаторы! Самосборы участились и лезут на жилые этажи.', color: GENERAL_VOICE },
    { kind: 'say', role: 'general', text: 'Наше дело правое. Граждан прикроем собой.', color: GENERAL_VOICE },
    // Голос из-за строя. Публика тут не декорация: у неё своё мнение о защите.
    { kind: 'say', role: 'clerks', text: 'Прикроют. Как в прошлый раз прикрыли.', color: WATCH_VOICE },
    /* Хор отдаётся разным шеренгам: бабл всплывает над случайным человеком роли,
     * и на трёх сотнях людей это читается перекличкой по залу, а не одним
     * голосом из одной точки. */
    { kind: 'say', role: 'rank_n2', text: 'Служим Министерству!', color: RANKS_VOICE },

    { kind: 'fly', to: { ox: 0, oy: -1 }, look: { role: 'general' }, speed: 4, height: 1.9 },
    { kind: 'say', role: 'general', text: 'Партия приказала укрепить рубежи.', color: GENERAL_VOICE },
    { kind: 'say', role: 'general', text: 'И защитить Министерство!', color: GENERAL_VOICE },
    { kind: 'say', role: 'rank_s3', text: 'Ура!', color: RANKS_VOICE },

    { kind: 'orbit', around: { role: 'general' }, radius: 5, speed: -0.2, height: 1.2, seconds: 6 },
    { kind: 'say', role: 'general', text: 'Гарнизон министерского этажа увеличен вдвое.', color: GENERAL_VOICE },
    { kind: 'say', role: 'general', text: 'Мы выстоим! Победа будет за нами!', color: GENERAL_VOICE },
    { kind: 'say', role: 'rank_n4', text: 'Ура-а!', color: RANKS_VOICE },

    /* Развод по постам. Камера уходит ЗА генерала, к торцу: колонна идёт на неё
     * и проходит мимо него прямо в кадре. `moveTo` — вейпойнт, а не поводок:
     * дойдя, человек свободен и живёт дальше, поэтому пост можно ставить один
     * на всю сводную. `walkOut` тут не годится и не задуман — список поручений
     * сцены ограничен тридцатью двумя, а разводить надо три сотни. */
    { kind: 'fly', to: { ox: -14, oy: -3 }, look: { role: 'general' }, speed: 5, height: 0.75 },

    { kind: 'say', role: 'general', text: 'Первая сводная — на северный рубеж. Шаго-ом... марш!', color: GENERAL_VOICE },
    { kind: 'moveTo', roles: ['rank_n1', 'rank_s1'], to: { ox: MARCH_OUT_OX, oy: 0 }, wait: 6 },

    { kind: 'say', role: 'general', text: 'Вторая сводная — рубеж коллекторов. Марш!', color: GENERAL_VOICE },
    { kind: 'moveTo', roles: ['rank_n2', 'rank_s2'], to: { ox: MARCH_OUT_OX, oy: 2 }, wait: 6 },

    { kind: 'say', role: 'general', text: 'Третья — подступы к вестибюлю. Марш!', color: GENERAL_VOICE },
    { kind: 'moveTo', roles: ['rank_n3', 'rank_s3'], to: { ox: MARCH_OUT_OX, oy: -2 }, wait: 6 },

    { kind: 'say', role: 'general', text: 'Четвёртая — резерв Министерства. По местам!', color: GENERAL_VOICE },
    { kind: 'moveTo', roles: ['rank_n4', 'rank_s4'], to: { ox: MARCH_OUT_OX + 1, oy: 0 }, wait: 6 },

    { kind: 'orbit', around: { role: 'general' }, radius: 4, speed: 0.3, height: 1.0, seconds: 6 },
  ],
});

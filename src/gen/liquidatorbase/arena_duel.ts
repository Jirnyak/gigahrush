/* ── Бой на арене: сцена-пролог Базы Ликвидаторов ──────────────────
 *
 * Первый приход на Базу. Гарнизон живёт своим порядком, и порядок этот игрок
 * застаёт не на плацу, а на песке: двое дерутся, полный дом смотрит, Марко Лоло
 * ведёт ставки. Кадр уходит к игроку, не дожидаясь исхода.
 *
 * Своего боя у сцены нет и быть не может (`cutscene.md`, главное правило).
 * Дерутся здесь по той же матрице отношений, что и везде: боец гарнизона —
 * ликвидатор, пленный — культист, а ликвидатор с культистом стоят в таблице на
 * −120 и −96, то есть враждебны друг другу с обеих сторон и без всякого скрипта.
 * Кто кого — решают стволы и жребий загрузки, а не такты.
 *
 * ── Почему трибуны гражданские, а не гарнизонные ──────────────────
 *
 * Это не вкус, а единственная работающая расстановка. Зритель, враждебный
 * одному из бойцов, в дуэль ВСТУПАЕТ — цикл AI ведёт актёра сцены наравне со
 * всеми, и «зритель» его не освобождает. Значит трибуна обязана терпеть обоих.
 *
 * Считано по `BASE_FACTION_MATRIX` (`src/data/relations.ts`), порог вражды −64:
 *
 *   ликвидатор → культист  −120   культист → ликвидатор  −96   ← ДЕРУТСЯ
 *   гражданин  → культист   −56   культист → гражданин   −56   ← терпят
 *   гражданин  → ликвидатор  48   ликвидатор → гражданин −24   ← терпят
 *
 * Гарнизонная трибуна расстреляла бы пленного из зала; дикий вместо культиста
 * поднял бы против себя уже гражданских (−72 в обе стороны). Треугольник ровно
 * один, и он же честен по смыслу: на ставки ходят те, у кого есть деньги.
 *
 * Единственный ликвидатор в кадре — сам Марко, и его держит РАССТОЯНИЕ, а не
 * фракция: см. `ARENA_STAND_ROW`.
 *
 * ЧЕРНОВИК РЕЧИ. Реплики — рабочая заглушка в тоне канона, помечена DRAFT.
 *
 * Контракт сцен — `cutscene.md`.
 */

import { Faction, Occupation } from '../../core/types';
import { designNpcFloorKey } from '../../data/plot';
import { registerFloorScene, type SceneActorDef } from '../../systems/cinematics';
import { ARENA_SAND_HALF, ARENA_STAND_ROW } from './fort';
import { LIQUIDATOR_BASE_ARENA_ANCHOR } from './rooms';

export const ARENA_DUEL_SCENE_ID = 'liquidatorbase_arena_duel' as const;
export const ARENA_DUEL_ANNOUNCER_ID = 'marko_lolo' as const;
export const LIQUIDATOR_BASE_FLOOR_KEY = designNpcFloorKey('liquidatorbase');

const MARKO_VOICE = '#e0c98a';
const CROWD_VOICE = '#c8bfae';
const PRISONER_VOICE = '#b09ccf';

/**
 * Поводок бойца: докуда ему позволено гонять противника.
 *
 * Общего поводка у сцены нет, и он ей не нужен — все роли несут свой (см.
 * объявление). Этот выведен из песка: клетка кончается столами на
 * `ARENA_SAND_HALF`, и поводок на клетку короче держит драку ВНУТРИ ринга, ни
 * разу не срабатывая на самой драке. Это важнее, чем кажется: возврат за
 * поводок гасит бойцу цель, память об ударе и скан на полсекунды
 * (`holdCastNearAnchor`), то есть поводок, задетый в бою, бой и разваливает.
 */
const FIGHTER_LEASH = ARENA_SAND_HALF - 1;
/** Бойцы расходятся на шесть клеток: цель берётся в восьми, ближе незачем. */
const FIGHTER_GAP = 3;
const FIGHTER_LEVEL = 8;

/* Ряд трибуны берётся у геометрии (`ARENA_STAND_ROW`), а не назначается сценой:
 * это место, где стоят кресла, и там же живёт Марко, когда никакой сцены нет.
 *
 * Для сцены важно следствие: ряд минус поводок бойца даёт десять клеток, а
 * боевую цель берут в восьми. Марко — ликвидатор и пленному враг по матрице,
 * и держит его именно этот зазор, а не доброта. Столы ринга вдобавок стоят
 * между песком и трибуной и сбивают прицел (`lineCoverCells`): шальная пуля в
 * зеваку — это драка со ставочниками вместо дуэли, ровно как было в прологе
 * жилого. */
/** Разброс трибуны: люди сидят рядами, а не одной кучей у прохода. */
const STAND_SPREAD = 6;
const STAND_COUNT = 22;

/**
 * Радиус облёта. Мерка `cutscene.md` — половина меньшей стороны минус клетка —
 * даёт здесь двадцать семь: арена 56x56, и тесно тут не бывает. Взят радиус
 * песка минус две клетки: круг проходит низко над столами и первыми рядами,
 * то есть в кадре вместе с бойцом всегда есть трибуна.
 */
const ORBIT_RADIUS = ARENA_SAND_HALF - 2;
/** Точка кадра внутри песка: подлёт и проход над рингом. */
const SAND_CAMERA = ARENA_SAND_HALF - 3;

/** Роль трибуны по стороне света. Четыре — чтобы гул шёл со всех сторон. */
function standActors(): SceneActorDef[] {
  const sides = [
    { role: 'stand_north', ox: 0, oy: -ARENA_STAND_ROW, occupation: Occupation.TRAVELER },
    { role: 'stand_south', ox: 0, oy: ARENA_STAND_ROW, occupation: Occupation.STOREKEEPER },
    { role: 'stand_west', ox: -ARENA_STAND_ROW, oy: 0, occupation: Occupation.ALCOHOLIC },
    { role: 'stand_east', ox: ARENA_STAND_ROW, oy: 0, occupation: Occupation.TRAVELER },
  ];
  return sides.map(side => ({
    role: side.role,
    count: STAND_COUNT,
    faction: Faction.CITIZEN,
    occupation: side.occupation,
    level: 2,
    ox: side.ox,
    oy: side.oy,
    spread: STAND_SPREAD,
  }));
}

registerFloorScene({
  id: ARENA_DUEL_SCENE_ID,
  floorKey: LIQUIDATOR_BASE_FLOOR_KEY,
  anchorRoomAlias: LIQUIDATOR_BASE_ARENA_ANCHOR,
  trigger: { kind: 'first_visit' },
  /* Потолок с запасом на ПОДЛЁТ: форт занимает четверть этажа, и дорога от
   * лифта до сердца форта бывает вчетверо длиннее прямой. Сам кадр
   * укладывается примерно в минуту. */
  maxSeconds: 180,
  /* Общего поводка нет намеренно. Он читается только для ОТПУЩЕННЫХ ролей без
   * своего (`holdCastNearAnchor`), а отпущены здесь ровно двое, и у обоих
   * поводок собственный. Трибуну и распорядителя держит пост. Лишняя ручка,
   * которую никто не читает, — это будущий рассинхрон, а не запас прочности. */
  actors: [
    /* Распорядитель песка уже живёт на этаже — сцена его лишь зовёт. Стоит он у
     * северной трибуны, а не на песке: см. `ARENA_STAND_ROW`. */
    { role: 'marko', packageId: ARENA_DUEL_ANNOUNCER_ID, ox: 0, oy: -ARENA_STAND_ROW },

    /* Двое на песке. Ни имён, ни пакетов: это не личности сюжета, а те, кого
     * сегодня выставили, — и сегодня же одного из них вынесут. */
    {
      role: 'gladiator',
      count: 1,
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.HUNTER,
      level: FIGHTER_LEVEL,
      ox: -FIGHTER_GAP,
      oy: 0,
      leash: FIGHTER_LEASH,
    },
    {
      role: 'prisoner',
      count: 1,
      faction: Faction.CULTIST,
      occupation: Occupation.PILGRIM,
      level: FIGHTER_LEVEL,
      ox: FIGHTER_GAP,
      oy: 0,
      leash: FIGHTER_LEASH,
    },

    /* Трибуны НЕ отпускаются. Это не заморозка: на посту человек живой —
     * переминается, оборачивается, отвечает на удар, — просто не расходится.
     * Толпа, ушедшая по своим делам в первые же секунды, оставила бы бой без
     * зрителя, а зритель здесь и есть смысл кадра. */
    ...standActors(),
  ],
  beats: [
    // Бой идёт с первого кадра: поводок снят раньше, чем камера доехала. Игрок
    // прилетает на уже начавшееся, а не на живую картину, ждущую его.
    { kind: 'release', roles: ['gladiator', 'prisoner'] },

    // Дальний подлёт — без `look`: кадр смотрит по курсу и поворачивает вместе
    // с улицами форта. Высоко: сперва читается чаша с трибунами, потом песок.
    { kind: 'fly', to: { ox: -ARENA_STAND_ROW - 4, oy: -ARENA_STAND_ROW - 4 }, speed: 20, height: 2.4 },
    // Снижение к рингу. Взгляд — на середину песка: там дерутся, и центр
    // выбран местом, а не ролью, чтобы кадр не дёргался за одним из двоих.
    { kind: 'fly', to: { ox: -SAND_CAMERA, oy: -SAND_CAMERA }, look: { ox: 0, oy: 0 }, speed: 7, height: 1.5 },
    { kind: 'orbit', around: { role: 'gladiator' }, radius: ORBIT_RADIUS, speed: 0.3, height: 1.3, seconds: 6 },

    // DRAFT
    { kind: 'say', role: 'marko', text: 'Ставки приняты, ворота на замок! На песке — боец гарнизона и то, что взяли за стеной.', color: MARKO_VOICE },
    // Ось — на говорившем, а не на центре масс роли: иначе бабл уходит за край.
    { kind: 'orbit', around: { speaker: true }, radius: 5, speed: -0.3, height: 1.0, seconds: 4 },

    { kind: 'say', role: 'stand_south', text: 'Дави его! Дави!', color: CROWD_VOICE },
    { kind: 'fly', to: { ox: 0, oy: -SAND_CAMERA }, look: { role: 'prisoner' }, speed: 8, height: 0.9 },
    { kind: 'say', role: 'prisoner', text: 'Вы все на песке. Просто ещё не знаете.', color: PRISONER_VOICE },
    { kind: 'say', role: 'stand_west', text: 'Я на пленного ставил! На пленного!', color: CROWD_VOICE },

    /* Ждём, чем кончится. Такт не назначает исхода: не вынесут пленного за своё
     * ожидание — сцена закроется по нему, и Марко скажет то же самое посреди
     * драки. Ляжет боец гарнизона — тоже допустимый исход, и этаж останется с
     * культистом на песке. */
    { kind: 'awaitDeath', role: 'prisoner', timeout: 26 },

    { kind: 'orbit', around: { role: 'gladiator' }, radius: ORBIT_RADIUS, speed: 0.42, height: 1.6, seconds: 5 },
    // DRAFT
    { kind: 'say', role: 'marko', text: 'Песок всё спишет. Следующий заход — через смену.', color: MARKO_VOICE },

    // Дальше камера сама уходит к игроку. Досматривать нечего: если бой ещё
    // идёт, игрок досмотрит его своими ногами.
  ],
});

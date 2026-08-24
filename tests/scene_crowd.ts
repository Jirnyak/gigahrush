/* Прореживание фона этажа для замков кат-сцен.
 *
 * Замок сцены проверяет СЦЕНУ: её каст, её такты и её камеру. Но играется она на
 * живом этаже, и цикл AI ведёт каждого, кто на этаже есть, — на министерстве это
 * две с небольшим тысячи акторов против трёх с половиной сотен собственного
 * каста сцены. Восемь из девяти кадро-акторов прогона уходят на людей, которые в
 * кадр не попадают и на такты не влияют.
 *
 * Замерено на смотре министерства (сид 61061, сцена идёт 125.8 игровых секунд):
 * симуляция целиком — 239 с, с прореженным фоном — 56 с. На обороне форпоста
 * (сцена 90.3 с): 60 с против 17 с.
 *
 * Правило прореживания выводится из самой сцены, а не из подобранного числа:
 * ФОНА ОСТАЁТСЯ НЕ БОЛЬШЕ, ЧЕМ КАСТА. Этаж остаётся живым и людным по меркам
 * сцены — просто перестаёт быть на порядок люднее её. Отбор идёт равномерным
 * шагом по массиву, то есть по порядку расстановки, а не по расстоянию до
 * кадра: выкосить дальних значило бы оставить в кадре ровно ту толпу, ради
 * удешевления которой всё и делается.
 *
 * Чего прореживание НЕ трогает: игрока, каст сцены (у него `cinematicState`) и
 * всё, что не актор, — предметы, дропы, билборды. Их в цикле AI нет.
 *
 * Считать по этому прогону ПЛОТНОСТЬ расстановки нельзя: свободных клеток
 * становится больше, а мягкий предел акторов — дальше. Факты расстановки
 * снимаются отдельным прогоном, до единого кадра симуляции.
 */

import { EntityType, type Entity } from '../src/core/types';

function isActor(e: Entity): boolean {
  return e.alive && (e.type === EntityType.NPC || e.type === EntityType.MONSTER);
}

function isCast(e: Entity): boolean {
  return (e as Entity & { cinematicState?: unknown }).cinematicState !== undefined;
}

export interface ThinnedCrowd {
  cast: number;
  bystandersBefore: number;
  bystandersAfter: number;
}

/**
 * Убрать из массива лишний фон, оставив игрока, каст сцены и каждого N-го из
 * остальных. Массив правится НА МЕСТЕ: индекс сущностей собирается по ссылке на
 * него, и подмена массива оторвала бы его от прогона.
 */
export function thinSceneBystanders(entities: Entity[], player: Entity): ThinnedCrowd {
  const cast = entities.filter(isCast).length;
  const bystanders = entities.filter(e => e !== player && isActor(e) && !isCast(e));
  const result: ThinnedCrowd = {
    cast,
    bystandersBefore: bystanders.length,
    bystandersAfter: bystanders.length,
  };
  if (cast === 0 || bystanders.length <= cast) return result;

  const stride = Math.ceil(bystanders.length / cast);
  const doomed = new Set<Entity>();
  for (let i = 0; i < bystanders.length; i++) if (i % stride !== 0) doomed.add(bystanders[i]);
  const kept = entities.filter(e => !doomed.has(e));
  entities.splice(0, entities.length, ...kept);
  result.bystandersAfter = bystanders.length - doomed.size;
  return result;
}

/* ── Ясли Тьюринга: свет полулаборатории ───────────────────────────
 *
 * Этаж выходил из генератора с 21 источником на 374 480 проходимых клеток —
 * 0.9% освещённых, самый тёмный на маршруте. Ясли при этом наполовину контора:
 * здесь снимают показания, жгут пробы и ведут журнал, а в темноте не пишут.
 *
 * Но освещать их как лабораторию нельзя, и цель у этажа ниже конторской. Ясли
 * наполовину организм: реакционно-диффузионное поле, по которому нарезаны чаши,
 * мосты и полосы, — это и есть тело этажа. Где поле спит, стоят столы и лампы
 * смены. Где поле разгорелось, лампу не вешают: над живой чашей держат слабый
 * огонь, потому что ровный свет сбивает узор, и потому что чаша светится сама.
 *
 * Поэтому свет тут — карта поля, а не сетка по комнатам. Игрок, идущий из
 * освещённого кабинета в полутьму, переходит не в другую комнату, а в другой
 * режим реакции, и видит границу узора глазами, без прибора.
 *
 * Проход детерминированный: сетка спрашивает то же поле, по которому нарезана
 * геометрия, поэтому свет и форма этажа совпадают по построению, а не по
 * совпадению. Занятые клетки не переписываются: чаши, приборы и авторские
 * источники остаются как объявлены.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { reactionAt, type ReactionField } from './geometry';

/** Порог живого поля. `stainReactionRoom` считает мокрой полосой значения выше
 *  0.3, а `fillBasinWater` наливает чаши по тому же гребню — берём чуть ниже,
 *  чтобы полутьма начиналась на подходе к чаше, а не на её кромке. */
const LIVE_FIELD = 0.28;

/** Спящее поле: сетка смены. Угол сетки шагом 14 отстоит на 9.9 — заметно
 *  дальше, чем светит лампа, поэтому между пятнами остаётся тень даже в сухом
 *  кабинете. Ясли — не министерство: шаг 12 давал 85% освещённых клеток, то
 *  есть залитый светом этаж, и разница с чашами переставала читаться. */
const LAB_STEP = 14;
const LAB_HALF = LAB_STEP >> 1;

/** Живое поле: слабый огонь над чашей, редко. Свеча гаснет к 4.4 клетки, шаг 14
 *  оставляет между огнями настоящую темноту — узор виден, дорога нет. */
const LIVE_STEP = 14;
const LIVE_HALF = LIVE_STEP >> 1;

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки вокруг цели: середина узла почти всегда
 *  занята чашей или стойкой, и без обхода источник в комнату не встаёт. */
function placeNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (placeSource(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

function isLive(field: ReactionField, x: number, y: number): boolean {
  return reactionAt(field, x, y) >= LIVE_FIELD;
}

/** Сетка комнаты. Шаг и источник выбираются поклеточно: одна и та же палата
 *  может лежать половиной на спящем поле, половиной на живом, и разрезать её
 *  по границе узора правильнее, чем по стене. */
function gridRoom(world: World, field: ReactionField, room: Room): void {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const live = isLive(field, x, y);
      const step = live ? LIVE_STEP : LAB_STEP;
      const half = live ? LIVE_HALF : LAB_HALF;
      if ((y - room.y - half) % step !== 0 || (x - room.x - half) % step !== 0) continue;
      placeNear(world, x, y, live ? Feature.CANDLE : Feature.LAMP, 1);
    }
  }
}

export function lightTuringNursery(world: World, field: ReactionField): void {
  for (const room of world.rooms) {
    if (!room) continue;
    const cx = room.x + (room.w >> 1);
    const cy = room.y + (room.h >> 1);
    // Источник в середине — но только если середина спит. Над чашей свет в
    // центре не вешают, ей хватает собственного свечения по кромке узора.
    if (!isLive(field, cx, cy)) placeNear(world, cx, cy, Feature.LAMP, 2);
    gridRoom(world, field, room);
  }

  // Открытая земля: реакционные полосы, мосты и коридоры макросети. Свет сквозь
  // стену не идёт, поэтому у полосы обязана быть своя линия огней.
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const live = isLive(field, x, y);
      const step = live ? LIVE_STEP : LAB_STEP;
      const half = live ? LIVE_HALF : LAB_HALF;
      if (y % step !== half || x % step !== half) continue;
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, live ? Feature.CANDLE : Feature.LAMP, 2);
    }
  }
}

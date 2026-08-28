/* ── Перевалка: свет грузового яруса ──────────────────────────────
 *
 * Ярус выходил из генератора на 10% освещённых клеток: горели шестнадцать
 * фонарей на перекрёстках решётки авеню да пара авторских ламп в галерее. Двор
 * во всю ширину мира, четыре квартала застройки, двенадцать карманов со
 * штабелями — всё это игрок проходил в темноте.
 *
 * Свет здесь принадлежит ГРУЗУ, и распределён он так же, как распределён груз.
 *
 * АВЕНЮ — единственная непрерывная линия света на ярусе. По дороге едет тара,
 * дорога должна быть видна из любой точки квартала, и по свету дороги игрок
 * восстанавливает, где он, не открывая карту. Магистраль светится вся.
 *
 * КРАН И ЭСТАКАДА светят иначе, и это главное отступление прохода. Створ крана
 * и разгрузочная эстакада объявлены высокими: ярусы потолка 7 и 6, четыре с
 * половиной метра над головой (`stacks.ts`). Коридорный шаг ламп сделал бы из
 * пролёта коридор. Поэтому под краном висит РЕДКАЯ цепь: большие пятна света
 * вдоль створа и черные промежутки между ними, как под настоящей фермой, где
 * лампа висит высоко и накрывает много, но их мало.
 *
 * ЖИЗНЬ ЯРУСА (ночлежки, столовая, баня, рынок, медугол) светится плотно: там
 * живут, и это единственные тёплые пятна на весь грузовой двор.
 *
 * СЕРЫЙ ОБХОД, ГРИБНАЯ АРТЕЛЬ И БОКСЫ НАБЛЮДЕНИЯ обходятся свечами. Кто возит
 * мимо весовой и кто растит споры в темноте — тот не вешает себе потолочный
 * свет; тусклое пятно в глубине читается как «здесь есть кто-то, кого не
 * позвали».
 *
 * ДВОР МЕЖДУ ШТАБЕЛЯМИ НЕ ОСВЕЩАЕТСЯ ВОВСЕ. Решётка глухих штабелей с
 * проулками в три-пять клеток — это укрытия и слепые углы, ради которых карман
 * и построен. Залить их светом значит стереть бой в кармане. Служебные
 * шестьдесят процентов яруса — это светлая дорога, светлая жизнь и тёмный
 * груз между ними.
 *
 * Проход детерминированный: линии берутся из той же решётки авеню, что режет
 * двор, остальное — из габаритов и тегов комнат. Жребия нет.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { AVENUE_WIDTH, avenueCoords } from './yard';

/** Шаг фонарей вдоль авеню. Пятно лампы достаёт на 7-8 клеток, шаг 19 оставляет
 *  между фонарями короткий провал: дорога читается всю дорогу, но остаётся
 *  ночной. Шаг 15 сшивал её в сплошную полосу и выводил ярус на 69%. */
const AVENUE_STEP_LAMPS = 19;

/** Шаг цепи под краном и над эстакадой: вдвое реже дороги. Высокий пролёт
 *  светится редкими большими пятнами, между ними — тень фермы. */
const HIGH_BAY_STEP = 30;

/** Шаг ламп в кварталах жизни: единственное место яруса, где свет ставят для
 *  себя, а не для тары. */
const LIFE_STEP = 13;

/** Шаг ламп в прочих помещениях яруса — конторы, склады, посты досмотра. */
const ROOM_STEP = 18;

/** Помещение меньше этого по обеим сторонам освещается одним источником. */
const SMALL_SIDE = 14;

function putLight(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Точка сетки обычно занята: ярус плотно заставлен тарой, стеллажами и
 *  верстаками. Ищем свободное место кольцами вокруг неё. */
function putLightNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let ring = 0; ring <= reach; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (putLight(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

/**
 * Фонарь дороги. Ищет место только по самой дороге: авеню местами застроена
 * комнатами, и фонарь, перепрыгнувший в комнату, отдал бы дорожный свет
 * чужому помещению, у которого свой закон освещения.
 */
function putAvenueLamp(world: World, x: number, y: number, vertical: boolean): boolean {
  const half = AVENUE_WIDTH >> 1;
  for (let n = 0; n <= half; n++) {
    for (const side of n === 0 ? [0] : [-n, n]) {
      const lx = vertical ? x + side : x;
      const ly = vertical ? y : y + side;
      if (world.roomMap[world.idx(lx, ly)] >= 0) continue;
      if (putLight(world, lx, ly, Feature.LAMP)) return true;
    }
  }
  return false;
}

/** Цепь вдоль длинной оси помещения: так светят и высокий пролёт крана, и
 *  разгрузочная эстакада — свет идёт вдоль хода тары, а не по площади. */
function lightAlongAxis(world: World, room: Room, step: number): void {
  const alongX = room.w >= room.h;
  const len = alongX ? room.w : room.h;
  const cross = (alongX ? room.h : room.w) >> 1;
  for (let l = Math.min(step >> 1, Math.max(0, (len - 1) >> 1)); l < len; l += step) {
    const x = room.x + (alongX ? l : cross);
    const y = room.y + (alongX ? cross : l);
    putLightNear(world, x, y, Feature.LAMP, 2);
  }
}

/** Ровная сетка по площади помещения, привязанная к его середине. */
function lightRoomGrid(world: World, room: Room, step: number, feature: Feature): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  const startX = cx - Math.floor((cx - room.x) / step) * step;
  const startY = cy - Math.floor((cy - room.y) / step) * step;
  for (let y = startY; y < room.y + room.h; y += step) {
    for (let x = startX; x < room.x + room.w; x += step) {
      putLightNear(world, x, y, feature, 2);
    }
  }
}

function hasTag(room: Room, tag: string): boolean {
  return room.tags?.includes(tag) === true;
}

export function lightPerevalka(world: World): void {
  // 1. Магистрали. Решётка кольцевая, мир — тор, поэтому линия идёт по всей
  //    стороне и замыкается сама.
  for (const c of avenueCoords()) {
    for (let p = 0; p < W; p += AVENUE_STEP_LAMPS) {
      putAvenueLamp(world, c, p, true);
      putAvenueLamp(world, p, c, false);
    }
  }

  // 2. Помещения яруса — каждое по своему закону.
  for (const room of world.rooms) {
    if (!room) continue;

    if (hasTag(room, 'crane') || hasTag(room, 'ramp')) {
      lightAlongAxis(world, room, HIGH_BAY_STEP);
      continue;
    }

    // Свеча вместо лампы: серый обход, артель и боксы наблюдения не светят.
    const dim = hasTag(room, 'shadow') || hasTag(room, 'wild') || hasTag(room, 'container');
    const feature = dim ? Feature.CANDLE : Feature.LAMP;

    if (room.w <= SMALL_SIDE && room.h <= SMALL_SIDE) {
      putLightNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), feature, 3);
      continue;
    }

    lightRoomGrid(world, room, hasTag(room, 'life') ? LIFE_STEP : ROOM_STEP, feature);
  }
}

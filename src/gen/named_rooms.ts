/* ── Именованные комнаты этажа ────────────────────────────────────
 *
 * Комнаты — основа мира (`rooms.md`), и у той комнаты, на которую ссылается
 * контент, обязано быть имя, известное системе, а не только человеку.
 *
 * Родовые комнаты процедурны: их число зависит от генератора и жребия, и
 * объявлять его нельзя. Объявляются только ИМЕНОВАННЫЕ — оружейная, лаборатория,
 * зал заседаний, — то есть те, на которые ссылается пакет NPC или квест.
 *
 * Объявление и есть источник: этаж перечисляет свои именованные комнаты, и
 * генерация роет их по этой же записи, штампуя `room.defId`. Забыть вырыть
 * объявленное поэтому нельзя — рытьё идёт из той же строки, а `assertNamedRooms`
 * ловит недосмотр на месте.
 *
 * Таблица принадлежит модулю этажа и никому больше: смысл авторской комнаты
 * локален, «оружейная» на жилом и на коллекторах — разные комнаты с одним словом.
 * Глобального реестра авторских комнат в проекте быть не должно.
 */

import { RoomType, type Room } from '../core/types';
import { World } from '../core/world';
import { stampRoom } from './shared';

export interface NamedRoomDef {
  /** Тип = деятельность: что здесь делают. См. таблицу в `rooms.md`. */
  type: RoomType;
  /** Имя для игрока. Системные ссылки идут по псевдониму, а не по нему. */
  name: string;
  /** Дополнительные семантические метки поверх псевдонима. */
  tags?: readonly string[];
}

export type NamedRoomTable = Readonly<Record<string, NamedRoomDef>>;

/**
 * Дать комнате объявленную личность. Генератор волен вырыть её сам или занять
 * подходящую готовую — обе дороги одинаково законны, и обе обязаны заканчиваться
 * здесь, иначе комната останется безымянной для системы.
 */
export function applyNamedRoom(room: Room, alias: string, def: NamedRoomDef): Room {
  room.defId = alias;
  room.name = def.name;
  room.tags = [...new Set([alias, ...(def.tags ?? []), ...(room.tags ?? [])])];
  return room;
}

/**
 * Вырыть объявленную комнату. Геометрию считает генератор — где комната влезет,
 * зависит от раскладки этажа; личность приходит из таблицы.
 */
export function stampNamedRoom(
  world: World,
  id: number,
  alias: string,
  def: NamedRoomDef,
  x: number, y: number, w: number, h: number,
  aptId = -1,
): Room {
  return applyNamedRoom(stampRoom(world, id, def.type, x, y, w, h, aptId), alias, def);
}

/** Комната этажа по псевдониму. Точное совпадение `defId`, без подстрок и без запасной случайной. */
export function findNamedRoom(world: World, alias: string | undefined): Room | undefined {
  if (!alias) return undefined;
  for (const room of world.rooms) {
    if (room?.defId === alias) return room;
  }
  return undefined;
}

/** Псевдонимы, объявленные этажом, но не вырытые генерацией. */
export function missingNamedRooms(world: World, table: NamedRoomTable): string[] {
  return Object.keys(table).filter(alias => findNamedRoom(world, alias) === undefined);
}

/**
 * Объявленное обязано быть вырыто. Молчаливый пропуск здесь стоит дорого:
 * человек, объявивший эту комнату домом, уезжает неизвестно куда, а квест
 * получает недостижимую цель.
 */
export function assertNamedRooms(world: World, floorId: string, table: NamedRoomTable): void {
  const missing = missingNamedRooms(world, table);
  if (missing.length > 0) {
    throw new Error(`[NAMED_ROOMS] ${floorId}: объявлено, но не вырыто — ${missing.join(', ')}`);
  }
}

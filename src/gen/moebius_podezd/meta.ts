import {
  RoomType,
  Tex,
  ZoneFaction,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import { MoebiusDistrictSpec, MoebiusHqSite, MoebiusStationSpec } from "./geometry";

export const MOEBIUS_PODEZD_ROUTE_ID = 'moebius_podezd' as const;

export const MOEBIUS_PODEZD_Z = 2;

export const MOEBIUS_PODEZD_BASE_FLOOR = 60;

export const MOEBIUS_PODEZD_SEED = hashSeed(MOEBIUS_PODEZD_ROUTE_ID);

export const MOEBIUS_PODEZD_ROOM_NAMES = {
  upperStrip: 'Жилая полоса Мёбиуса А',
  lowerStrip: 'Жилая полоса Мёбиуса Б',
  westLoop: 'Безопасная публичная петля западного пролёта',
  eastLoop: 'Безопасная публичная петля восточного пролёта',
  shortcut: 'Рискованный паритетный шов',
  seamNorth: 'Парный шов Мёбиуса северный ориентир',
  seamSouth: 'Парный шов Мёбиуса южный ориентир',
  lostMarker: 'Кладовка потерянной маршрутной метки',
} as const;

export const LOOP_LEFT = 168;

export const LOOP_RIGHT = 856;

export const UPPER_Y = 398;

export const LOWER_Y = 612;

export const STRIP_H = 14;

export const CONNECTOR_W = 14;

export const SHORTCUT_X = 504;

export const SHORTCUT_Y = UPPER_Y + STRIP_H;

export const SHORTCUT_W = 17;

export const SHORTCUT_H = LOWER_Y - SHORTCUT_Y;

export const NORTH_GATE_Y = 492;

export const SOUTH_GATE_Y = 528;

export const SEAM_KEY_ID = 'rubber_door_wedge';

export const FLAT_LABELS = ['17-А', '17-Б', '18-А', '18-Б', '19-А', '19-Б', '20-А', '20-Б'] as const;

export const MICRO_ROOM_W = 18;

export const MICRO_ROOM_H = 11;

export const MICRO_GAP_X = 6;

export const MICRO_GAP_Y = 5;

export const MICRO_SPINE_H = 8;

export const MOEBIUS_HQ_SITES: readonly MoebiusHqSite[] = [
  { owner: ZoneFaction.CITIZEN, x: 74, y: 458, w: 42, h: 24, name: 'Герметичный штаб жильцов прямой стороны', linkX: 184, linkY: 512, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { owner: ZoneFaction.LIQUIDATOR, x: 760, y: 454, w: 40, h: 22, name: 'Герметичный штаб ликвидаторов обратного обхода', linkX: 842, linkY: 512, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.CULTIST, x: 876, y: 686, w: 34, h: 20, name: 'Скрытый культовый штаб паритетного шва', linkX: 846, linkY: 619, wallTex: Tex.ROTTEN, floorTex: Tex.F_MEAT },
  { owner: ZoneFaction.SCIENTIST, x: 458, y: 248, w: 40, h: 22, name: 'Герметичный штаб учёных зеркального паритета', linkX: 512, linkY: 398, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
  { owner: ZoneFaction.WILD, x: 72, y: 688, w: 36, h: 20, name: 'Разорённый штаб диких у нижней петли', linkX: 178, linkY: 619, wallTex: Tex.ROTTEN, floorTex: Tex.F_WOOD },
] as const;

export const MOEBIUS_DISTRICTS: readonly MoebiusDistrictSpec[] = [
  { x: 52, y: 74, cols: 11, rows: 5, linkX: 184, linkY: 405, name: 'Северо-западная зеркальная гряда', owner: ZoneFaction.CITIZEN, reverse: false, wallTex: Tex.PANEL, floorTex: Tex.F_CARPET },
  { x: 362, y: 78, cols: 12, rows: 5, linkX: 512, linkY: 398, name: 'Северная лабораторная гряда паритета', owner: ZoneFaction.SCIENTIST, reverse: true, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
  { x: 696, y: 76, cols: 11, rows: 5, linkX: 846, linkY: 405, name: 'Северо-восточная гряда обратного обхода', owner: ZoneFaction.LIQUIDATOR, reverse: false, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { x: 62, y: 236, cols: 10, rows: 5, linkX: 184, linkY: 405, name: 'Западный подъезд повторной нумерации', owner: ZoneFaction.CITIZEN, reverse: true, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { x: 714, y: 236, cols: 10, rows: 5, linkX: 846, linkY: 405, name: 'Восточный подъезд служебной нумерации', owner: ZoneFaction.LIQUIDATOR, reverse: true, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { x: 72, y: 706, cols: 10, rows: 5, linkX: 178, linkY: 619, name: 'Западная нижняя гряда сбитых дверей', owner: ZoneFaction.WILD, reverse: false, wallTex: Tex.ROTTEN, floorTex: Tex.F_WOOD },
  { x: 714, y: 704, cols: 10, rows: 5, linkX: 846, linkY: 619, name: 'Восточная нижняя гряда шовных слухов', owner: ZoneFaction.CULTIST, reverse: false, wallTex: Tex.ROTTEN, floorTex: Tex.F_MEAT },
  { x: 50, y: 852, cols: 11, rows: 5, linkX: 178, linkY: 619, name: 'Юго-западная жилая лента возвращения', owner: ZoneFaction.CITIZEN, reverse: true, wallTex: Tex.PANEL, floorTex: Tex.F_CARPET },
  { x: 362, y: 848, cols: 12, rows: 5, linkX: 512, linkY: 626, name: 'Южная кладовая лента маршрутных меток', owner: ZoneFaction.WILD, reverse: false, wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE },
  { x: 698, y: 852, cols: 11, rows: 5, linkX: 846, linkY: 619, name: 'Юго-восточная обратная лента печатей', owner: ZoneFaction.CULTIST, reverse: true, wallTex: Tex.ROTTEN, floorTex: Tex.F_WOOD },
] as const;

export const MOEBIUS_STATIONS: readonly MoebiusStationSpec[] = [
  { x: 278, y: 292, w: 70, h: 34, type: RoomType.KITCHEN, name: 'Станция кипятка на прямой стороне Мёбиуса', owner: ZoneFaction.CITIZEN, linkX: 256, linkY: 405, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
  { x: 636, y: 292, w: 72, h: 34, type: RoomType.OFFICE, name: 'Станция сверки обратной стороны Мёбиуса', owner: ZoneFaction.LIQUIDATOR, linkX: 768, linkY: 405, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { x: 318, y: 666, w: 76, h: 36, type: RoomType.STORAGE, name: 'Склад одинаковых дверей нижней стороны', owner: ZoneFaction.WILD, linkX: 256, linkY: 619, wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE },
  { x: 620, y: 666, w: 74, h: 36, type: RoomType.COMMON, name: 'Круг слушателей паритетного шва', owner: ZoneFaction.CULTIST, linkX: 768, linkY: 619, wallTex: Tex.ROTTEN, floorTex: Tex.F_MEAT },
  { x: 466, y: 704, w: 58, h: 38, type: RoomType.MEDICAL, name: 'Пункт измерения тошноты от ориентации', owner: ZoneFaction.SCIENTIST, linkX: 512, linkY: 626, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
] as const;


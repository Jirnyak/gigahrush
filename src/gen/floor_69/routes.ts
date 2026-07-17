/* -- Design floor 69: adult vice, debt, blackmail and refuge ---- */

import {
  DoorState, Feature,
  Tex
  ,
} from '../../core/types';
import { World } from '../../core/world';


import { setFeature, Floor69MacroCounts, carveRouteLine, addRouteGate, addRouteRoom, addHorizontalRooms, decorateRouteLine } from './geometry';
import { registerFloorSideQuest } from './npcs';
import { FLOOR_69_RAID_SHUTTER_KEY, FLOOR_69_RAID_SHUTTER_GATES } from './index';
export function buildFloor69PublicRoutes(world: World, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 64, 512, 948, 512, 3, Tex.F_CARPET, Tex.CURTAIN);
  carveRouteLine(world, 112, 384, 912, 384, 2, Tex.F_CARPET, Tex.CURTAIN);
  carveRouteLine(world, 112, 640, 912, 640, 2, Tex.F_CARPET, Tex.CURTAIN);
  carveRouteLine(world, 176, 320, 176, 704, 2, Tex.F_CARPET, Tex.CURTAIN);
  carveRouteLine(world, 392, 300, 392, 704, 2, Tex.F_CARPET, Tex.CURTAIN);
  carveRouteLine(world, 656, 300, 656, 704, 2, Tex.F_CARPET, Tex.CURTAIN);

  carveRouteLine(world, 300, 256, 736, 256, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 164, 448, 736, 448, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 164, 640, 736, 640, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 300, 812, 736, 812, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 736, 160, 736, 880, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 554, 554, 736, 554, 2, Tex.F_CONCRETE, Tex.DARK);

  decorateRouteLine(world, 512, 96, 920, 11);
  decorateRouteLine(world, 384, 136, 884, 23);
  decorateRouteLine(world, 640, 136, 884, 37);
  counts.loops += 4;
}

export function buildFloor69HotelWings(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  addHorizontalRooms(world, rng, counts, 384, 118, 350, -1, 'hotel', 'Гостиничный номер север', 46);
  addHorizontalRooms(world, rng, counts, 384, 118, 350, 1, 'hotel', 'Гостиничный номер юг', 46);
  addHorizontalRooms(world, rng, counts, 384, 690, 874, -1, 'hotel', 'Красный номер восток', 46);
  addHorizontalRooms(world, rng, counts, 640, 118, 350, -1, 'hotel', 'Тихий номер запад', 46);
  addHorizontalRooms(world, rng, counts, 640, 118, 350, 1, 'hotel', 'Часовой номер запад', 46);
  addHorizontalRooms(world, rng, counts, 640, 690, 874, 1, 'hotel', 'Поздний номер восток', 46);
}

export function buildFloor69BackstageLoop(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 432, 456, 604, 456, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 604, 456, 604, 612, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 604, 612, 432, 612, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 432, 612, 432, 456, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 512, 456, 512, 612, 2, Tex.F_CONCRETE, Tex.DARK);
  counts.loops += 2;

  addHorizontalRooms(world, rng, counts, 456, 438, 574, -1, 'dressing', 'Гримерная кулис', 44);
  addHorizontalRooms(world, rng, counts, 612, 438, 574, 1, 'dressing', 'Костюмерная петля', 44);
  addHorizontalRooms(world, rng, counts, 612, 438, 530, -1, 'refuge', 'Тихий шкаф за сценой', 46);
  setFeature(world, 512, 456, Feature.SCREEN);
  setFeature(world, 604, 512, Feature.LAMP);
}

export function buildFloor69DebtBlock(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 604, 512, 904, 512, 2, Tex.F_PARQUET, Tex.PANEL);
  carveRouteLine(world, 604, 552, 904, 552, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 604, 608, 904, 608, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 904, 512, 904, 608, 2, Tex.F_CONCRETE, Tex.DARK);
  counts.loops++;

  addRouteRoom(world, rng, 'security', 630, 494, 18, 14, 'Второй пост досмотра 69', 620, 512);
  addRouteRoom(world, rng, 'security', 720, 532, 18, 14, 'Пост служебного обхода 69', 736, 552);
  addHorizontalRooms(world, rng, counts, 552, 626, 850, -1, 'debt', 'Долговой кабинет', 48);
  addHorizontalRooms(world, rng, counts, 608, 626, 850, 1, 'debt', 'Архив расписок', 48);
}

export function buildFloor69RefugeClosets(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  addHorizontalRooms(world, rng, counts, 256, 320, 444, -1, 'refuge', 'Верхний тихий шкаф', 42);
  addHorizontalRooms(world, rng, counts, 448, 248, 344, 1, 'refuge', 'Служебное укрытие', 42);
  addHorizontalRooms(world, rng, counts, 812, 320, 444, 1, 'refuge', 'Нижний тихий шкаф', 42);
  addRouteRoom(world, rng, 'refuge', 790, 624, 16, 11, 'Скрытая комната свидетеля 69', 790, 640, DoorState.HERMETIC_OPEN);
}

export function buildFloor69SecurityChokes(world: World, counts: Floor69MacroCounts): void {
  for (const gate of FLOOR_69_RAID_SHUTTER_GATES) {
    addRouteGate(world, gate.x, gate.y1, gate.y2, gate.doorY, DoorState.HERMETIC_OPEN, FLOOR_69_RAID_SHUTTER_KEY);
  }
  counts.securityGates += FLOOR_69_RAID_SHUTTER_GATES.length;
  setFeature(world, 624, 511, Feature.DESK);
  setFeature(world, 756, 511, Feature.DESK);
}


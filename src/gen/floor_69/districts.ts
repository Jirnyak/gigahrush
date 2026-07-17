import { Cell, DoorState, Tex, ZoneFaction } from '../../core/types';
import { type World } from '../../core/world';
import { genLog } from '../log';
import type { FloorGeneration } from '../floor_manifest';
import { Floor69MacroCounts, buildFloor69DenseBlock, buildFloor69MidMicroLayer, buildFloor69MiniHq, tryAddRouteRoom, carveRouteLine, addHorizontalOwnedRooms, addVerticalOwnedRooms } from './geometry';
import { buildFloor69PublicRoutes, buildFloor69HotelWings, buildFloor69BackstageLoop, buildFloor69DebtBlock, buildFloor69RefugeClosets, buildFloor69SecurityChokes } from './routes';
export function expandFloor69FullFloor(generation: FloorGeneration, rng: () => number): void {
  const world = generation.world;
  const counts: Floor69MacroCounts = {
    hotelRooms: 0,
    dressingRooms: 0,
    debtRooms: 0,
    refugeRooms: 0,
    securityGates: 0,
    loops: 0,
  };

  buildFloor69PublicRoutes(world, counts);
  buildFloor69HotelWings(world, rng, counts);
  buildFloor69BackstageLoop(world, rng, counts);
  buildFloor69DebtBlock(world, rng, counts);
  buildFloor69RefugeClosets(world, rng, counts);
  buildFloor69SecurityChokes(world, counts);
  buildFloor69MidMicroLayer(world, rng, counts);

  buildFloor69NorthShadowDistrict(world, rng, counts);
  buildFloor69WestWaitingQuarter(world, rng, counts);
  buildFloor69DeepMidWestLabyrinth(world, rng, counts);
  buildFloor69EastDebtSector(world, rng, counts);
  buildFloor69SouthRefugeSector(world, rng, counts);
  buildFloor69FarOuterPockets(world, rng, counts);

  buildFloor69GlobalPerimeterRing(world, rng, counts);
  buildFloor69NorthDeepSector(world, rng, counts);
  buildFloor69SouthDeepSector(world, rng, counts);
  buildFloor69WestEastDeepSectors(world, rng, counts);
  buildFloor69InnerMonolithGrid(world, rng, counts);

  buildFloor69BeyondPerimeterTunnels(world, rng, counts);
  buildFloor69ExperimentalHydroponics(world, rng, counts);
  buildFloor69UndergroundMarketAndCinema(world, rng, counts);
  buildFloor69SubMonolithLotto(world, rng, counts);
  buildFloor69TrueInterconnectedGridAndAlleys(world, rng, counts);

  genLog(
    `[F69] full geometry rooms=${counts.hotelRooms + counts.dressingRooms + counts.debtRooms + counts.refugeRooms}`
    + ` hotel=${counts.hotelRooms} backstage=${counts.dressingRooms} debt=${counts.debtRooms}`
    + ` refuge=${counts.refugeRooms} gates=${counts.securityGates} loops=${counts.loops}`,
  );
}

export function buildFloor69NorthShadowDistrict(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 176, 230, 656, 230, 2, Tex.F_PARQUET, Tex.PANEL);
  carveRouteLine(world, 300, 230, 300, 256, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 392, 230, 392, 300, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 554, 230, 554, 256, 2, Tex.F_PARQUET, Tex.PANEL);
  counts.loops += 2;

  addHorizontalOwnedRooms(world, rng, counts, 230, 190, 280, -1, 'debt', ZoneFaction.CITIZEN, 'Теневой архив расписок', 34);
  addHorizontalOwnedRooms(world, rng, counts, 230, 320, 370, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Блок изъятых дел', 34);
  addHorizontalOwnedRooms(world, rng, counts, 230, 410, 530, -1, 'refuge', ZoneFaction.CITIZEN, 'Северная тихая ниша', 36);
  addHorizontalOwnedRooms(world, rng, counts, 230, 570, 640, -1, 'dressing', ZoneFaction.WILD, 'Заброшенная костюмерная', 34);
  addHorizontalOwnedRooms(world, rng, counts, 230, 190, 280, 1, 'refuge', ZoneFaction.SCIENTIST, 'Санитарный буфер север', 34);
  addHorizontalOwnedRooms(world, rng, counts, 230, 410, 530, 1, 'hotel', ZoneFaction.CITIZEN, 'Секретный номер север', 36);

  buildFloor69MiniHq(world, rng, ZoneFaction.CITIZEN, 'Северный тайный пост 69', 510, 180, 554, 230);
}

export function buildFloor69WestWaitingQuarter(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 126, 384, 126, 640, 2, Tex.F_CARPET, Tex.CURTAIN);
  carveRouteLine(world, 126, 512, 176, 512, 2, Tex.F_CARPET, Tex.CURTAIN);
  counts.loops++;

  addVerticalOwnedRooms(world, rng, counts, 126, 400, 490, -1, 'hotel', ZoneFaction.CITIZEN, 'Западный капсульный номер', 34);
  addVerticalOwnedRooms(world, rng, counts, 126, 530, 620, -1, 'hotel', ZoneFaction.CITIZEN, 'Западный часовой номер', 34);
  addVerticalOwnedRooms(world, rng, counts, 126, 400, 490, 1, 'refuge', ZoneFaction.CITIZEN, 'Курилка ожидающих запад', 34);
  addVerticalOwnedRooms(world, rng, counts, 126, 530, 620, 1, 'dressing', ZoneFaction.WILD, 'Кулуар ожидания запад', 34);

  buildFloor69MiniHq(world, rng, ZoneFaction.CITIZEN, 'Западный пункт встречи 69', 82, 512, 126, 512);
}

export function buildFloor69DeepMidWestLabyrinth(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 240, 420, 340, 420, 2, Tex.F_TILE, Tex.TILE_W);
  carveRouteLine(world, 240, 420, 240, 448, 2, Tex.F_TILE, Tex.TILE_W);
  carveRouteLine(world, 340, 420, 340, 448, 2, Tex.F_TILE, Tex.TILE_W);
  counts.loops++;

  addHorizontalOwnedRooms(world, rng, counts, 420, 256, 320, -1, 'refuge', ZoneFaction.SCIENTIST, 'Теневой медпункт сверки', 36);
  addVerticalOwnedRooms(world, rng, counts, 240, 426, 442, -1, 'refuge', ZoneFaction.CITIZEN, 'Хранилище чистых справок', 32);
  addVerticalOwnedRooms(world, rng, counts, 340, 426, 442, 1, 'debt', ZoneFaction.SCIENTIST, 'Архив санитарных пропусков', 32);

  carveRouteLine(world, 240, 590, 340, 590, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 240, 554, 240, 590, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 340, 554, 340, 590, 2, Tex.F_CONCRETE, Tex.DARK);
  counts.loops++;

  addHorizontalOwnedRooms(world, rng, counts, 590, 256, 320, 1, 'dressing', ZoneFaction.WILD, 'Глубинная гримерная ниша', 36);
  addVerticalOwnedRooms(world, rng, counts, 240, 560, 580, -1, 'dressing', ZoneFaction.CITIZEN, 'Костюмерный кулуар', 32);
  addVerticalOwnedRooms(world, rng, counts, 340, 560, 580, 1, 'refuge', ZoneFaction.WILD, 'Стихийная лежанка кулис', 32);
}

export function buildFloor69EastDebtSector(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 860, 256, 860, 512, 2, Tex.F_CONCRETE, Tex.METAL);
  carveRouteLine(world, 736, 384, 860, 384, 2, Tex.F_CONCRETE, Tex.METAL);
  carveRouteLine(world, 736, 448, 860, 448, 2, Tex.F_CONCRETE, Tex.METAL);
  counts.loops += 2;

  addVerticalOwnedRooms(world, rng, counts, 860, 270, 360, 1, 'debt', ZoneFaction.LIQUIDATOR, 'Строгий долговой изолятор', 34);
  addVerticalOwnedRooms(world, rng, counts, 860, 400, 490, 1, 'debt', ZoneFaction.LIQUIDATOR, 'Металлический архив протокола', 34);
  addHorizontalOwnedRooms(world, rng, counts, 384, 760, 840, -1, 'debt', ZoneFaction.CITIZEN, 'Контора долговых расписок', 36);
  addHorizontalOwnedRooms(world, rng, counts, 448, 760, 840, 1, 'refuge', ZoneFaction.CITIZEN, 'Тихая комната свидетеля восток', 36);
}

export function buildFloor69SouthRefugeSector(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 176, 726, 736, 726, 2, Tex.F_LINO, Tex.PANEL);
  carveRouteLine(world, 392, 704, 392, 726, 2, Tex.F_LINO, Tex.PANEL);
  carveRouteLine(world, 656, 704, 656, 726, 2, Tex.F_LINO, Tex.PANEL);
  counts.loops += 2;

  addHorizontalOwnedRooms(world, rng, counts, 726, 190, 370, -1, 'refuge', ZoneFaction.CITIZEN, 'Южный тихий шкаф', 36);
  addHorizontalOwnedRooms(world, rng, counts, 726, 410, 630, -1, 'refuge', ZoneFaction.CULTIST, 'Свечная исповедальня юг', 36);
  addHorizontalOwnedRooms(world, rng, counts, 726, 190, 370, 1, 'hotel', ZoneFaction.CITIZEN, 'Южный уединенный номер', 36);
  addHorizontalOwnedRooms(world, rng, counts, 726, 410, 630, 1, 'debt', ZoneFaction.WILD, 'Дикий долговой развал юг', 36);

  buildFloor69MiniHq(world, rng, ZoneFaction.CULTIST, 'Южный свечной оплот 69', 520, 770, 554, 726);
}

export function buildFloor69FarOuterPockets(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.LIQUIDATOR, 'debt', 'Дальний архив протокола 69', 840, 205, 70, 45, 736, 256);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.WILD, 'refuge', 'Дальние лежанки развала 69', 840, 750, 70, 65, 736, 812);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'dressing', 'Склад брошенной мебели 69', 120, 240, 50, 60, 176, 320);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'hotel', 'Апартаменты тайных информаторов 69', 120, 750, 50, 65, 176, 704);
}

export function buildFloor69GlobalPerimeterRing(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 64, 64, 960, 64, 2, Tex.F_CONCRETE, Tex.METAL);
  carveRouteLine(world, 64, 960, 960, 960, 2, Tex.F_CONCRETE, Tex.METAL);
  carveRouteLine(world, 64, 64, 64, 960, 2, Tex.F_CONCRETE, Tex.METAL);
  carveRouteLine(world, 960, 64, 960, 960, 2, Tex.F_CONCRETE, Tex.METAL);
  counts.loops += 4;

  carveRouteLine(world, 176, 64, 176, 230, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 392, 64, 392, 230, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 656, 64, 656, 230, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 736, 64, 736, 230, 2, Tex.F_CONCRETE, Tex.PANEL);

  carveRouteLine(world, 176, 726, 176, 960, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 392, 726, 392, 960, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 656, 726, 656, 960, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 736, 726, 736, 960, 2, Tex.F_CONCRETE, Tex.PANEL);

  carveRouteLine(world, 64, 384, 126, 384, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 64, 512, 126, 512, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 64, 640, 126, 640, 2, Tex.F_CONCRETE, Tex.PANEL);

  carveRouteLine(world, 736, 384, 960, 384, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 736, 512, 960, 512, 2, Tex.F_CONCRETE, Tex.PANEL);
  carveRouteLine(world, 736, 640, 960, 640, 2, Tex.F_CONCRETE, Tex.PANEL);

  addHorizontalOwnedRooms(world, rng, counts, 64, 180, 380, -1, 'hotel', ZoneFaction.CITIZEN, 'Внешний северный отель', 36);
  addHorizontalOwnedRooms(world, rng, counts, 64, 400, 650, -1, 'refuge', ZoneFaction.SCIENTIST, 'Буфер периметра север', 36);
  addHorizontalOwnedRooms(world, rng, counts, 64, 745, 950, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Архив внешнего кольца', 36);
  addHorizontalOwnedRooms(world, rng, counts, 64, 180, 380, 1, 'debt', ZoneFaction.CITIZEN, 'Контора периметра север', 36);
  addHorizontalOwnedRooms(world, rng, counts, 64, 400, 650, 1, 'dressing', ZoneFaction.WILD, 'Склад кулис север', 36);
  addHorizontalOwnedRooms(world, rng, counts, 64, 745, 950, 1, 'refuge', ZoneFaction.LIQUIDATOR, 'Изолятор внешнего кольца', 36);

  addHorizontalOwnedRooms(world, rng, counts, 960, 180, 380, -1, 'hotel', ZoneFaction.CITIZEN, 'Внешний южный отель', 36);
  addHorizontalOwnedRooms(world, rng, counts, 960, 400, 650, -1, 'refuge', ZoneFaction.CULTIST, 'Свечные ниши периметра', 36);
  addHorizontalOwnedRooms(world, rng, counts, 960, 745, 950, -1, 'refuge', ZoneFaction.WILD, 'Дикий южный развал', 36);
  addHorizontalOwnedRooms(world, rng, counts, 960, 180, 380, 1, 'debt', ZoneFaction.CITIZEN, 'Контора периметра юг', 36);
  addHorizontalOwnedRooms(world, rng, counts, 960, 400, 650, 1, 'refuge', ZoneFaction.CULTIST, 'Алтарь периметра юг', 36);
  addHorizontalOwnedRooms(world, rng, counts, 960, 745, 950, 1, 'dressing', ZoneFaction.WILD, 'Стихийная ночлежка юг', 36);

  addVerticalOwnedRooms(world, rng, counts, 64, 80, 370, -1, 'hotel', ZoneFaction.CITIZEN, 'Западный внешний номер', 34);
  addVerticalOwnedRooms(world, rng, counts, 64, 650, 950, -1, 'refuge', ZoneFaction.CITIZEN, 'Западное внешнее убежище', 34);
  addVerticalOwnedRooms(world, rng, counts, 64, 80, 370, 1, 'dressing', ZoneFaction.WILD, 'Стихийный склад запад', 34);
  addVerticalOwnedRooms(world, rng, counts, 64, 650, 950, 1, 'debt', ZoneFaction.CITIZEN, 'Долговая ниша запад', 34);

  addVerticalOwnedRooms(world, rng, counts, 960, 80, 370, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Восточный изолятор периметра', 34);
  addVerticalOwnedRooms(world, rng, counts, 960, 650, 950, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Восточный архив периметра', 34);
  addVerticalOwnedRooms(world, rng, counts, 960, 80, 370, 1, 'refuge', ZoneFaction.CITIZEN, 'Восточное убежище периметра', 34);
  addVerticalOwnedRooms(world, rng, counts, 960, 650, 950, 1, 'refuge', ZoneFaction.WILD, 'Восточная ночлежка периметра', 34);
}

export function buildFloor69NorthDeepSector(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 176, 120, 736, 120, 2, Tex.F_PARQUET, Tex.PANEL);
  counts.loops++;
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'dressing', 'Северо-западный склад резерва', 280, 120, 60, 35, 176, 120);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'debt', 'Северный архив компромата', 520, 120, 80, 35, 392, 120);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.SCIENTIST, 'refuge', 'Лабораторный буфер НИИ 69', 840, 120, 70, 35, 736, 120);
}

export function buildFloor69SouthDeepSector(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 176, 880, 736, 880, 2, Tex.F_LINO, Tex.PANEL);
  counts.loops++;
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CULTIST, 'refuge', 'Свечные катакомбы сектантов', 280, 880, 60, 35, 176, 880);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.WILD, 'refuge', 'Южные дикие ночлежки 69', 520, 880, 80, 35, 392, 880);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.SCIENTIST, 'debt', 'Склады медикаментов 69', 840, 880, 70, 35, 736, 880);
}

export function buildFloor69WestEastDeepSectors(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 92, 384, 92, 640, 2, Tex.F_CARPET, Tex.CURTAIN);
  counts.loops++;
  addVerticalOwnedRooms(world, rng, counts, 92, 395, 500, -1, 'hotel', ZoneFaction.CITIZEN, 'Западный капсульный тупик', 34);
  addVerticalOwnedRooms(world, rng, counts, 92, 525, 630, -1, 'hotel', ZoneFaction.CITIZEN, 'Западный часовой тупик', 34);
  addVerticalOwnedRooms(world, rng, counts, 92, 395, 500, 1, 'refuge', ZoneFaction.CITIZEN, 'Курилка ожидающих тупик', 34);
  addVerticalOwnedRooms(world, rng, counts, 92, 525, 630, 1, 'dressing', ZoneFaction.WILD, 'Кулуар ожидающих тупик', 34);

  carveRouteLine(world, 910, 384, 910, 640, 2, Tex.F_CONCRETE, Tex.METAL);
  counts.loops++;
  addVerticalOwnedRooms(world, rng, counts, 910, 395, 500, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Восточный металлический отсек', 34);
  addVerticalOwnedRooms(world, rng, counts, 910, 525, 630, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Восточный картотечный отсек', 34);
  addVerticalOwnedRooms(world, rng, counts, 910, 395, 500, 1, 'refuge', ZoneFaction.CITIZEN, 'Восточная тихая ниша тупик', 34);
  addVerticalOwnedRooms(world, rng, counts, 910, 525, 630, 1, 'refuge', ZoneFaction.CITIZEN, 'Восточный изолятор тупик', 34);
}

export function buildFloor69InnerMonolithGrid(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 176, 340, 736, 340, 2, Tex.F_PARQUET, Tex.PANEL);
  carveRouteLine(world, 176, 470, 736, 470, 2, Tex.F_PARQUET, Tex.PANEL);
  carveRouteLine(world, 176, 600, 736, 600, 2, Tex.F_PARQUET, Tex.PANEL);
  carveRouteLine(world, 176, 680, 736, 680, 2, Tex.F_PARQUET, Tex.PANEL);

  carveRouteLine(world, 220, 320, 220, 704, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 280, 320, 280, 704, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 450, 300, 450, 704, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 520, 300, 520, 704, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 600, 300, 600, 704, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 690, 300, 690, 704, 2, Tex.F_CONCRETE, Tex.DARK);
  counts.loops += 10;

  const yLines = [340, 470, 600, 680];
  for (const y of yLines) {
    addHorizontalOwnedRooms(world, rng, counts, y, 185, 215, -1, 'debt', ZoneFaction.CITIZEN, 'Центральный архив расписок', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 225, 275, -1, 'refuge', ZoneFaction.SCIENTIST, 'Центральная лаборатория сверки', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 285, 385, -1, 'hotel', ZoneFaction.CITIZEN, 'Центральный секретный номер', 34);
    addHorizontalOwnedRooms(world, rng, counts, y, 400, 445, -1, 'dressing', ZoneFaction.WILD, 'Центральная гримерная', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 455, 515, -1, 'refuge', ZoneFaction.CITIZEN, 'Центральное тихое убежище', 34);
    addHorizontalOwnedRooms(world, rng, counts, y, 525, 595, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Центральный отсек ликвидатора', 34);
    addHorizontalOwnedRooms(world, rng, counts, y, 605, 650, -1, 'dressing', ZoneFaction.WILD, 'Центральный костюмерный склад', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 665, 685, -1, 'refuge', ZoneFaction.CULTIST, 'Центральная свечная ниша', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 695, 730, -1, 'hotel', ZoneFaction.CITIZEN, 'Центральный часовой номер', 32);

    addHorizontalOwnedRooms(world, rng, counts, y, 185, 215, 1, 'refuge', ZoneFaction.CITIZEN, 'Тихая ниша монолита', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 225, 275, 1, 'debt', ZoneFaction.CITIZEN, 'Долговая контора монолита', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 285, 385, 1, 'refuge', ZoneFaction.SCIENTIST, 'Медпост монолита', 34);
    addHorizontalOwnedRooms(world, rng, counts, y, 400, 445, 1, 'hotel', ZoneFaction.CITIZEN, 'Номер монолита', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 455, 515, 1, 'dressing', ZoneFaction.WILD, 'Кулуар монолита', 34);
    addHorizontalOwnedRooms(world, rng, counts, y, 525, 595, 1, 'debt', ZoneFaction.LIQUIDATOR, 'Изолятор монолита', 34);
    addHorizontalOwnedRooms(world, rng, counts, y, 605, 650, 1, 'refuge', ZoneFaction.WILD, 'Ночлежка монолита', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 665, 685, 1, 'refuge', ZoneFaction.CULTIST, 'Алтарь монолита', 32);
    addHorizontalOwnedRooms(world, rng, counts, y, 695, 730, 1, 'hotel', ZoneFaction.CITIZEN, 'Отель монолита', 32);
  }
}

export function buildFloor69BeyondPerimeterTunnels(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 20, 20, 1000, 20, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 20, 1000, 1000, 1000, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 20, 20, 20, 1000, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 1000, 20, 1000, 1000, 2, Tex.F_CONCRETE, Tex.DARK);
  counts.loops += 4;

  const crossLines = [100, 300, 500, 700, 900];
  for (const c of crossLines) {
    carveRouteLine(world, c, 20, c, 64, 2, Tex.F_CONCRETE, Tex.DARK);
    carveRouteLine(world, c, 960, c, 1000, 2, Tex.F_CONCRETE, Tex.DARK);
    carveRouteLine(world, 20, c, 64, c, 2, Tex.F_CONCRETE, Tex.DARK);
    carveRouteLine(world, 960, c, 1000, c, 2, Tex.F_CONCRETE, Tex.DARK);
  }
  counts.loops += 20;

  addHorizontalOwnedRooms(world, rng, counts, 20, 110, 290, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Схрон списанных пломбировщиков', 36);
  addHorizontalOwnedRooms(world, rng, counts, 20, 310, 490, -1, 'refuge', ZoneFaction.SCIENTIST, 'Захоронение провальных биопроб НИИ', 36);
  addHorizontalOwnedRooms(world, rng, counts, 20, 510, 690, -1, 'dressing', ZoneFaction.CULTIST, 'Аномальная жиротопка сектантов', 36);
  addHorizontalOwnedRooms(world, rng, counts, 20, 710, 890, -1, 'hotel', ZoneFaction.CITIZEN, 'Абсолютный тупик свидетелей', 36);

  addHorizontalOwnedRooms(world, rng, counts, 1000, 110, 290, 1, 'debt', ZoneFaction.LIQUIDATOR, 'Глухой изолятор забытых долгов', 36);
  addHorizontalOwnedRooms(world, rng, counts, 1000, 310, 490, 1, 'refuge', ZoneFaction.WILD, 'Катакомбы стихийного отстойника', 36);
  addHorizontalOwnedRooms(world, rng, counts, 1000, 510, 690, 1, 'dressing', ZoneFaction.CULTIST, 'Дальний алтарь свечного осадка', 36);
  addHorizontalOwnedRooms(world, rng, counts, 1000, 710, 890, 1, 'hotel', ZoneFaction.CITIZEN, 'Отель последнего вздоха 69', 36);

  addVerticalOwnedRooms(world, rng, counts, 20, 110, 290, -1, 'refuge', ZoneFaction.CITIZEN, 'Техническая полость зазеркалья', 34);
  addVerticalOwnedRooms(world, rng, counts, 20, 310, 490, -1, 'debt', ZoneFaction.LIQUIDATOR, 'Архив ликвидированных смен', 34);
  addVerticalOwnedRooms(world, rng, counts, 20, 510, 690, -1, 'dressing', ZoneFaction.WILD, 'Склад обрезков свинца', 34);
  addVerticalOwnedRooms(world, rng, counts, 20, 710, 890, -1, 'hotel', ZoneFaction.CITIZEN, 'Тайная ячейка Инфосети Демос', 34);

  addVerticalOwnedRooms(world, rng, counts, 1000, 110, 290, 1, 'refuge', ZoneFaction.WILD, 'Запериметральная дикая ночлежка', 34);
  addVerticalOwnedRooms(world, rng, counts, 1000, 310, 490, 1, 'refuge', ZoneFaction.SCIENTIST, 'Буфер сброса давления', 34);
  addVerticalOwnedRooms(world, rng, counts, 1000, 510, 690, 1, 'debt', ZoneFaction.CITIZEN, 'Контора теневого бартера', 34);
  addVerticalOwnedRooms(world, rng, counts, 1000, 710, 890, 1, 'dressing', ZoneFaction.CITIZEN, 'Кулуар беглых авторитетов', 34);
}

export function buildFloor69ExperimentalHydroponics(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.WILD, 'refuge', 'Грибная ферма наркосиндиката 69', 115, 140, 35, 25, 176, 140);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'hotel', 'Плантация хмеля и самосада', 785, 140, 35, 25, 736, 140);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.SCIENTIST, 'debt', 'Экспериментальный парник НИИ', 115, 810, 35, 25, 176, 810);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CULTIST, 'dressing', 'Священный свечной сад культистов', 785, 810, 35, 25, 736, 810);
}

export function buildFloor69UndergroundMarketAndCinema(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 176, 270, 736, 270, 2, Tex.F_PARQUET, Tex.PANEL);
  carveRouteLine(world, 176, 745, 736, 745, 2, Tex.F_LINO, Tex.PANEL);
  counts.loops += 2;

  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'hotel', 'Теневой кинотеатр архивной хроники', 240, 270, 28, 20, 176, 270);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.WILD, 'dressing', 'Арена подпольных пари 69', 420, 270, 35, 20, 392, 270);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.SCIENTIST, 'refuge', 'Подпольный абортарий и чистка кармы', 630, 270, 28, 20, 656, 270);

  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'debt', 'Стихийный долговой аукцион', 240, 745, 28, 20, 176, 745);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'hotel', 'Караванная перевалочная база 69', 420, 745, 35, 20, 392, 745);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'refuge', 'Курилка высших авторитетов', 630, 745, 28, 20, 656, 745);
}

export function buildFloor69SubMonolithLotto(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  carveRouteLine(world, 345, 270, 345, 745, 2, Tex.F_CONCRETE, Tex.DARK);
  carveRouteLine(world, 645, 270, 645, 745, 2, Tex.F_CONCRETE, Tex.DARK);
  counts.loops += 2;

  addVerticalOwnedRooms(world, rng, counts, 345, 280, 330, -1, 'debt', ZoneFaction.CITIZEN, 'Тайная серверная Инфосети Демос', 34);
  addVerticalOwnedRooms(world, rng, counts, 345, 350, 460, -1, 'refuge', ZoneFaction.CITIZEN, 'Кабинет подделки чистых справок', 34);
  addVerticalOwnedRooms(world, rng, counts, 345, 480, 590, -1, 'dressing', ZoneFaction.WILD, 'Мастерская переплавки свинца', 34);
  addVerticalOwnedRooms(world, rng, counts, 345, 610, 670, -1, 'hotel', ZoneFaction.CITIZEN, 'Узел нелегальной радиосвязи', 34);

  addVerticalOwnedRooms(world, rng, counts, 645, 280, 330, 1, 'debt', ZoneFaction.LIQUIDATOR, 'Пункт прослушки Ликвидаторов', 34);
  addVerticalOwnedRooms(world, rng, counts, 645, 350, 460, 1, 'refuge', ZoneFaction.CULTIST, 'Молитвенная ниша шептунов', 34);
  addVerticalOwnedRooms(world, rng, counts, 645, 480, 590, 1, 'dressing', ZoneFaction.WILD, 'Ночлежка сборщиков слизи', 34);
  addVerticalOwnedRooms(world, rng, counts, 645, 610, 670, 1, 'hotel', ZoneFaction.CITIZEN, 'Секретная переговорная кураторов', 34);
}

export function buildFloor69TrueInterconnectedGridAndAlleys(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  const motifs = ['hotel', 'dressing', 'debt', 'refuge'] as const;
  const owners = [ZoneFaction.CITIZEN, ZoneFaction.WILD, ZoneFaction.SCIENTIST, ZoneFaction.CULTIST, ZoneFaction.LIQUIDATOR];
  const labels = [
    'Блок обеспечения',
    'Пункт досмотра 69',
    'Жилая ячейка монолита',
    'Технический карман',
    'Тайная ячейка Демос',
    'Перевалочный схрон',
    'Герметичный склад',
    'Аномальный тупик',
    'Резервная комната отдыха',
    'Изолятор ликвидаторов',
  ];

  // 1. Интеллектуальная квартальная застройка всех глухих черных пустот (Smart Total Infill)
  // Проходим по всей площади этажа сеткой 25x25 метров
  for (let qx = 35; qx < 980; qx += 25) {
    for (let qy = 35; qy < 980; qy += 25) {
      // Проверяем, свободен ли весь квадрат 25x25 от авторских комнат, лифтов, бездны и воды
      let isVoid = true;
      for (let x = qx; x < qx + 25; x++) {
        for (let y = qy; y < qy + 25; y++) {
          const i = world.idx(x, y);
          if (world.roomMap[i] !== -1 || world.cells[i] === Cell.ABYSS || world.cells[i] === Cell.LIFT || world.cells[i] === Cell.WATER) {
            isVoid = false;
            break;
          }
        }
        if (!isVoid) break;
      }

      // Если это чистая черная пустота, мы ГАРАНТИРОВАННО застраиваем ее микро-кварталом!
      if (isVoid) {
        counts.loops++;
        const midX = qx + 12;
        const midY = qy + 12;

        // Прорубаем локальный крест-переулок шириной 2 метра внутри квартала
        carveRouteLine(world, qx + 2, midY, qx + 23, midY, 2, Tex.F_CONCRETE, Tex.DARK);
        carveRouteLine(world, midX, qy + 2, midX, qy + 23, 2, Tex.F_LINO, Tex.ROTTEN);

        // Гарантированно соединяем этот переулок со внешним миром (ищем ближайший пол во всех 4 направлениях)
        const exitDirs = [
          { dx: 0, dy: -1, startX: midX, startY: qy + 2 }, // Вверх
          { dx: 0, dy: 1, startX: midX, startY: qy + 23 }, // Вниз
          { dx: -1, dy: 0, startX: qx + 2, startY: midY }, // Влево
          { dx: 1, dy: 0, startX: qx + 23, startY: midY }, // Вправо
        ];

        for (const ed of exitDirs) {
          let cx = ed.startX;
          let cy = ed.startY;
          for (let step = 0; step < 80; step++) {
            cx += ed.dx;
            cy += ed.dy;
            if (cx < 15 || cx >= 1009 || cy < 15 || cy >= 1009) break;
            
            const ci = world.idx(cx, cy);
            // Если наткнулись на чужую комнату/лифт/бездну — останавливаем луч
            if (world.roomMap[ci] !== -1 || world.cells[ci] === Cell.ABYSS || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.WATER) {
              break;
            }

            // Прорубаем пол
            world.cells[ci] = Cell.FLOOR;
            world.floorTex[ci] = Tex.F_CONCRETE;
            world.wallTex[ci] = Tex.DARK;

            // Если соединились с существующим полом — успех!
            if (world.cells[ci] === Cell.FLOOR && step > 5) {
              break;
            }
          }
        }

        // Встраиваем 4 полноценные комнаты в образовавшиеся угловые под-квадраты 11x11
        // Северо-запад (выход на midX, qy + 6)
        let motif = motifs[Math.floor(rng() * motifs.length)]!;
        let owner = owners[Math.floor(rng() * owners.length)]!;
        let label = labels[Math.floor(rng() * labels.length)]!;
        tryAddRouteRoom(world, rng, counts, motif, owner, qx + 2, qy + 2, 9, 9, `${label} СЗ-${qx}-${qy}`, midX, qy + 6, DoorState.CLOSED, '');

        // Северо-восток (выход на midX, qy + 6)
        motif = motifs[Math.floor(rng() * motifs.length)]!;
        owner = owners[Math.floor(rng() * owners.length)]!;
        label = labels[Math.floor(rng() * labels.length)]!;
        tryAddRouteRoom(world, rng, counts, motif, owner, midX + 2, qy + 2, 9, 9, `${label} СВ-${qx}-${qy}`, midX, qy + 6, DoorState.CLOSED, '');

        // Юго-запад (выход на midX, qy + 18)
        motif = motifs[Math.floor(rng() * motifs.length)]!;
        owner = owners[Math.floor(rng() * owners.length)]!;
        label = labels[Math.floor(rng() * labels.length)]!;
        tryAddRouteRoom(world, rng, counts, motif, owner, qx + 2, midY + 2, 9, 9, `${label} ЮЗ-${qx}-${qy}`, midX, qy + 18, DoorState.CLOSED, '');

        // Юго-восток (выход на midX, qy + 18)
        motif = motifs[Math.floor(rng() * motifs.length)]!;
        owner = owners[Math.floor(rng() * owners.length)]!;
        label = labels[Math.floor(rng() * labels.length)]!;
        tryAddRouteRoom(world, rng, counts, motif, owner, midX + 2, midY + 2, 9, 9, `${label} ЮВ-${qx}-${qy}`, midX, qy + 18, DoorState.CLOSED, '');
      }
    }
  }

  // 2. Дополнительное органическое зашумление и хаотичные сбойки (Organic Micro-Branches)
  // Запускаем 15000 лучей, которые ищут глухие стены между проходами и прорубают извилистые соединительные тропы
  const attempts = 15000;
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  for (let a = 0; a < attempts; a++) {
    const startX = 30 + Math.floor(rng() * 964);
    const startY = 30 + Math.floor(rng() * 964);

    if (world.cells[world.idx(startX, startY)] !== Cell.FLOOR) continue;

    let currX = startX;
    let currY = startY;
    let dir = dirs[Math.floor(rng() * dirs.length)]!;
    const maxLen = 10 + Math.floor(rng() * 45);

    for (let step = 0; step < maxLen; step++) {
      // С вероятностью 35% делаем изгиб (хаотичный извилистый коридор)
      if (rng() < 0.35) {
        dir = dir.dx !== 0 ? (rng() < 0.5 ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 }) : (rng() < 0.5 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 });
      }

      const nextX = currX + dir.dx;
      const nextY = currY + dir.dy;

      if (nextX < 20 || nextX >= 1004 || nextY < 20 || nextY >= 1004) break;

      const i = world.idx(nextX, nextY);
      if (world.roomMap[i] !== -1 || world.cells[i] === Cell.ABYSS || world.cells[i] === Cell.LIFT || world.cells[i] === Cell.WATER) {
        break;
      }

      world.cells[i] = Cell.FLOOR;
      world.floorTex[i] = rng() < 0.5 ? Tex.F_CONCRETE : Tex.F_LINO;
      world.wallTex[i] = rng() < 0.5 ? Tex.DARK : Tex.ROTTEN;

      currX = nextX;
      currY = nextY;
    }
  }
}


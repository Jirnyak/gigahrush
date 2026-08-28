import { Cell, DoorState, type Entity, type Room, type RoomType, type Tex } from '../../core/types';
import { World as WorldClass } from '../../core/world';
import type { FloorGeneration } from '../floor_manifest';
import { ensureConnectivity, ensurePermanentRoomAccess, protectRoom, sanitizeDoors } from '../shared';
import { newEntityIdCursor } from '../entity_ids';
import { assertNamedRooms } from '../named_rooms';
import { FORT_SIDE, FORT_X0, FORT_Y0, buildLiquidatorFort } from './fort';
import { lightLiquidatorBase } from './lighting';
import { LIQUIDATOR_BASE_NAMED_ROOMS } from './rooms';
import { ORDER_QUARTER, buildGarrisonOrder } from './order';
import { ARENA_QUARTER, buildArenaQuarter } from './arena_quarter';
import { FRONTLINE_QUARTER, buildFrontline } from './frontline';
import { SUPPLY_QUARTER, buildSupplyYard } from './supply';
/* Регистрация контента этажа идёт на импорте: сцена боя на арене объявляет себя
   сама, генератора у неё своего нет — песок роет геометрия форта. */
import './content_manifest';
import { ZoneFaction, W } from '../../core/types';

const SEED = 0x4c495144;

/**
 * База Ликвидаторов — форт гарнизона на четверть этажа и дикие земли вокруг.
 *
 * Этаж собирается СЛОЯМИ, и этот файл — только дирижёр стадий. Форт даёт землю,
 * стены, улицы и безликие кварталы по жребию; поверх ложатся четыре квартала, у
 * каждого своя идея и свой модуль:
 *
 *   `order.ts`         военный распорядок — разводная линейка и служба смены
 *   `arena_quarter.ts` арена как экономика — ложа, ставки, бойцы, ямы
 *   `frontline.ts`     передний край — процедура возвращения от южных ворот
 *   `supply.ts`        снабжение Блинкова — погрузочная линейка и склады
 *
 * Комнат у этажа и без слоёв было 3706 на 399 716 проходимых клеток: комнаты ему
 * не нужны, ему нужно ЛИЦО. Кварталы поэтому не добавляются в пустоту, а
 * ЗАМЕЩАЮТ безликие блоки — каждый объявляет своё пятно константой, форт получает
 * их списком и не раздаёт туда жребия.
 *
 * Порядок стадий обязателен и указан ниже по шагам.
 */
export function generateLiquidatorBaseDesignFloor(): FloorGeneration {
  const world = new WorldClass();
  const entities: Entity[] = [];
  const nextId = newEntityIdCursor();

  // ── Стадия 1: расширение ─────────────────────────────────────────
  // Всё, что режет геометрию, идёт здесь и только здесь. Пятна кварталов
  // объявлены заранее: форт обязан узнать о них ДО раздачи блоков, иначе
  // процедурные комнаты будут перештампованы наполовину и в `world.rooms`
  // останутся записи, чьи клетки уже принадлежат соседу.
  const fort = buildLiquidatorFort(world, SEED,
    [ORDER_QUARTER, ARENA_QUARTER, FRONTLINE_QUARTER, SUPPLY_QUARTER]);
  buildGarrisonOrder(world, entities, nextId, fort.parade);
  buildArenaQuarter(world, fort.arena, entities, nextId);
  buildFrontline(world);
  buildSupplyYard(world, entities, nextId);

  // ── Стадия 2: защита ─────────────────────────────────────────────
  // Защиту носит только то, что по смыслу убежище: штаб за гермостеной. Раньше
  // защищены были все комнаты этажа — 4955 клеток из 4961, — и шахтам лифтов
  // было некуда сесть, отчего с базы нельзя было подняться.
  protectRoom(world, fort.hq.x, fort.hq.y, fort.hq.w, fort.hq.h, fort.hq.wallTex, fort.hq.floorTex);

  // ── Стадия 3: связность ──────────────────────────────────────────
  // Прорубается ДО санации дверей, иначе санация снесёт косяки, которые
  // прорубание только что оставило.
  ensureConnectivity(world, fort.spawnX, fort.spawnY);
  ensurePermanentRoomAccess(world, world.rooms.length);

  // ── Стадия 4: санация дверей ─────────────────────────────────────
  sanitizeDoors(world);

  // ── Стадия 5: страховки ──────────────────────────────────────────
  world.rebuildContainerMap();
  // Свет ставится ПОСЛЕ санации дверей и ДО выпечки: санация двигает косяки, а
  // выпечка — единственный шаг, который переводит фичу в освещённость.
  lightLiquidatorBase(world);
  world.bakeLights();
  // Объявленное обязано быть вырыто: без псевдонима у арены сцена боя не найдёт
  // якоря и молча не начнётся, а визит на этаж при этом не засчитается. Теперь
  // тем же замком держатся все двадцать восемь авторских комнат кварталов.
  assertNamedRooms(world, 'liquidatorbase', LIQUIDATOR_BASE_NAMED_ROOMS);
  const declared = declaredRoomShells(world);

  return {
    isDecentralized: true, world, entities,
    spawnX: fort.spawnX, spawnY: fort.spawnY,
    // `initializeCellTerritory` в манифесте перестраивает владение клетками по
    // долям, и авторские зоны положено переобъявлять здесь — иначе общий проход
    // размажет гарнизон по диким землям. Граница у форта не условная, а
    // физическая: стена. Внутри неё земля ликвидаторов, снаружи — диких.
    onAfterTerritory: (w: WorldClass) => {
      paintFortTerritory(w);
      restoreDeclaredRooms(w, declared);
    },
  };
}

/**
 * Объявленная личность комнаты — та, с которой она вышла из генератора.
 *
 * Снимок берётся ПОСЛЕ `assertNamedRooms` и до того, как этаж уйдёт в общие
 * проходы манифеста: дальше комнату уже никто не роет, только правят.
 */
interface DeclaredShell {
  room: Room;
  type: RoomType;
  wallTex: Tex;
  floorTex: Tex;
  /** Кольцо стен комнаты: гермофлаг и текстура каждой клетки. */
  shell: readonly { idx: number; hermo: number; tex: Tex }[];
  doors: readonly { idx: number; state: DoorState; hermo: number; tex: Tex }[];
}

function forEachShellCell(world: WorldClass, room: Room, visit: (idx: number) => void): void {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      visit(world.idx(room.x + dx, room.y + dy));
    }
  }
}

function declaredRoomShells(world: WorldClass): DeclaredShell[] {
  const declared: DeclaredShell[] = [];
  for (const room of world.rooms) {
    if (!room?.defId || !(room.defId in LIQUIDATOR_BASE_NAMED_ROOMS)) continue;
    const shell: { idx: number; hermo: number; tex: Tex }[] = [];
    forEachShellCell(world, room, idx => {
      if (world.cells[idx] !== Cell.WALL) return;
      shell.push({ idx, hermo: world.hermoWall[idx], tex: world.wallTex[idx] });
    });
    declared.push({
      room,
      type: room.type,
      wallTex: room.wallTex,
      floorTex: room.floorTex,
      shell,
      doors: room.doors.map(idx => ({
        idx,
        state: world.doors.get(idx)?.state ?? DoorState.CLOSED,
        hermo: world.hermoWall[idx],
        tex: world.wallTex[idx],
      })),
    });
  }
  return declared;
}

/**
 * Объявленное обязано ОСТАТЬСЯ объявленным.
 *
 * `initializeCellTerritory` выдаёт каждому хозяину штаб и, не найдя готового,
 * ПРОИЗВОДИТ его из любой подходящей комнаты этажа: пишет `type = HQ`,
 * запечатывает гермостеной, вешает гермодвери (`hardenHqRoom`,
 * `systems/territory.ts`). Авторское ИМЯ этот проход бережёт особо, а тип — нет,
 * и объявленный складом «Склад трофеев снизу» уходил с этажа штабом гарнизона.
 * Тип — это ПОВЕДЕНИЕ (`rooms.md`): по нему, а не по имени и не по тегам, ядро
 * актора выбирает, куда идти работать, спать и обходить.
 *
 * Пятно квартала здесь не помогает: выбор идёт по весу хозяина к типу комнаты и
 * по ПЛОЩАДИ, а самые крупные комнаты этажа — как раз авторские. Кого возьмёт
 * жребий, зависит от раскладки кварталов, поэтому чинится не «эта комната», а
 * правило целиком. Повторный вход на этаж (`initFactionControl` в `main.ts`
 * зовёт тот же проход) уже безопасен: хозяин находит свой штаб — «Штаб
 * гарнизона» — готовым и по чужим комнатам не ходит. Замерено: три входа подряд
 * не двигают ни одной объявленной комнаты.
 */
function restoreDeclaredRooms(world: WorldClass, declared: readonly DeclaredShell[]): void {
  let restored = 0;
  for (const entry of declared) {
    const room = entry.room;
    if (room.type === entry.type) continue;
    room.type = entry.type;
    room.sealed = false;
    room.wallTex = entry.wallTex;
    room.floorTex = entry.floorTex;
    for (const cell of entry.shell) {
      if (world.cells[cell.idx] !== Cell.WALL) continue;
      world.hermoWall[cell.idx] = cell.hermo;
      world.wallTex[cell.idx] = cell.tex;
    }
    for (const door of entry.doors) {
      world.hermoWall[door.idx] = door.hermo;
      world.wallTex[door.idx] = door.tex;
      const live = world.doors.get(door.idx);
      if (live) live.state = door.state;
    }
    restored++;
  }
  if (restored > 0) world.markWallTexDirty();
}

/** Внутри стены — земля гарнизона, снаружи — диких. Граница берётся у геометрии,
 *  а не задаётся отдельным числом: это тот же прямоугольник форта. */
function paintFortTerritory(world: WorldClass): void {
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const inFort = x >= FORT_X0 && x < FORT_X0 + FORT_SIDE && y >= FORT_Y0 && y < FORT_Y0 + FORT_SIDE;
      world.factionControl[world.idx(x, y)] = inFort ? ZoneFaction.LIQUIDATOR : ZoneFaction.WILD;
    }
  }
}

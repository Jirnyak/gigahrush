/* ── Служебный этаж С-15: свет обхода ─────────────────────────────
 *
 * Этаж выходил из генератора на 25.8% освещённых клеток: горело ядро с
 * лифтовой машиной и щитовой, а лебёдочные галереи, лифтовые ядра, дренажные
 * бассейны кабельных фронтов и вся служебная разводка вокруг оставались чёрными.
 *
 * Свет тут ставил не архитектор, а обходчик, и ставил себе. Отсюда правило
 * прохода: СВЕТИТ КРОМКА, А НЕ СЕРЕДИНА. Лампы идут по внутреннему периметру
 * помещения — там, где вдоль стены проложен кабель, стоят щиты и ходит обход, —
 * а середина зала остаётся тёмной. Стотридцатиметровая лебёдочная галерея
 * читается двумя светящимися стенами и провалом посередине: ровно так и
 * выглядит место, куда заходят по делу, а не живут.
 *
 * Служебная разводка вне помещений держит свою линию: лампа на каждом узле
 * обхода, чтобы маршрут между ядрами был проходим без фонаря.
 *
 * ОБЕСТОЧЕННЫЕ УЗЛЫ СВЕТА НЕ ПОЛУЧАЮТ. Щитовая и вентиляционный узел объявлены
 * в `serviceState.powerZones` как `powered: false` — это развилка этажа, её
 * чинит игрок. Дать им потолочный свет значит соврать про питание раньше, чем
 * его восстановили; там стоит одинокая свеча аварийного поста, и по ней узел
 * находят в темноте. Служебные шестьдесят процентов этажа — это освещённый
 * обход и тёмные залы за его спиной.
 *
 * Проход детерминированный: периметр выводится из габаритов помещения, узлы
 * обхода — из шага решётки, жребия нет.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { BREAKER_ROOM, VENT_JUNCTION } from './meta';

/** Шаг ламп вдоль кромки: пятно достаёт на 7-8 клеток, поэтому шаг 20 даёт
 *  пунктир вдоль стены, а не сплошную полосу. Шаг 14 сшивал кромку в линию и
 *  выводил этаж на 81% — контору, а не служебный обход. */
const RIM_STEP = 20;

/** Отступ лампы от стены. Ноль поставил бы её в дверной проём и в угол за
 *  щитом; две клетки — это ширина прохода обходчика. */
const RIM_INSET = 2;

/** Помещение меньше этого по обеим сторонам — не зал, а ниша: периметра у неё
 *  нет, хватает одной лампы. */
const NICHE_SIDE = 16;

/** Шаг узлов обхода вне помещений. Служебная разводка узкая, и узел ищет пол
 *  вокруг себя далеко: решётка задаёт частоту, а не место. */
const PATROL_STEP = 21;

/** Помещения без питания: свет им не положен, пока игрок не поднял зону. */
const UNPOWERED_ROOMS: readonly string[] = [BREAKER_ROOM, VENT_JUNCTION];

function mountLight(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кромка помещения плотно заставлена: щиты, верстаки, стеллажи, аварийные
 *  панели этажа. Ищем свободную клетку кольцами — лампа, не нашедшая места,
 *  оставляет в пунктире кромки провал в два десятка клеток. */
function mountLightNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let ring = 0; ring <= reach; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (mountLight(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

/** Узел обхода живёт только на разводке. Кольцевой поиск специально не пускают
 *  внутрь помещений: иначе узел, попавший в стену галереи, перепрыгивает её и
 *  зажигает тот самый провал, ради которого светит одна кромка, — а рядом со
 *  щитовой ещё и выдаёт свет обесточенной зоне. */
function mountPatrolNode(world: World, x: number, y: number, reach: number): boolean {
  for (let ring = 0; ring <= reach; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (world.roomMap[world.idx(x + dx, y + dy)] >= 0) continue;
        if (mountLight(world, x + dx, y + dy, Feature.LAMP)) return true;
      }
    }
  }
  return false;
}

/** Обход помещения по внутреннему периметру: две горизонтальные кромки и две
 *  вертикальные, углы считаются один раз. */
function lightRoomRim(world: World, room: Room): void {
  const x0 = room.x + RIM_INSET;
  const x1 = room.x + room.w - 1 - RIM_INSET;
  const y0 = room.y + RIM_INSET;
  const y1 = room.y + room.h - 1 - RIM_INSET;
  if (x1 <= x0 || y1 <= y0) return;

  for (let x = x0; x <= x1; x += RIM_STEP) {
    mountLightNear(world, x, y0, Feature.LAMP, 2);
    mountLightNear(world, x, y1, Feature.LAMP, 2);
  }
  for (let y = y0 + RIM_STEP; y < y1; y += RIM_STEP) {
    mountLightNear(world, x0, y, Feature.LAMP, 2);
    mountLightNear(world, x1, y, Feature.LAMP, 2);
  }
}

export function lightServiceFloor(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;

    if (room.name && UNPOWERED_ROOMS.includes(room.name)) {
      // Аварийный пост обесточенного узла: свеча, и только она.
      mountLightNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.CANDLE, 3);
      continue;
    }

    if (room.w <= NICHE_SIDE && room.h <= NICHE_SIDE) {
      mountLightNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP, 3);
      continue;
    }

    lightRoomRim(world, room);
  }

  // Узлы обхода на служебной разводке: коридоры, сшивки маршрутного расширения,
  // подходы к лифтовым ядрам. Внутри помещений узел не нужен — кромка уже
  // светит, и лампа посреди галереи убила бы её провал.
  for (let y = PATROL_STEP >> 1; y < W; y += PATROL_STEP) {
    for (let x = PATROL_STEP >> 1; x < W; x += PATROL_STEP) {
      mountPatrolNode(world, x, y, 3);
    }
  }
}

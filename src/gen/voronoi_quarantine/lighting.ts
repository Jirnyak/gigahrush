/* ── Карантин Лагерра: свет по роли ячейки ─────────────────────────
 *
 * Этаж выходил из генератора с 758 источниками на 835 274 проходимых клетки —
 * 5.4% освещённых, при том что он самый большой на маршруте. Карантин, где
 * пропуск решает всё, нельзя читать вслепую: игрок обязан видеть, куда его
 * пустили, а куда нет.
 *
 * Свет здесь принадлежит роли ячейки, а не её размеру. Посты и клиники светят
 * ярче и чаще прочих: над решёткой и над койкой дежурный свет не гасят никогда,
 * это и есть карантинный режим. Конторы, приёмные, кухни, склады и палаты
 * держат обычную рабочую сетку — там живут и работают, но не смотрят за
 * каждым. Заражённые ячейки и трупные ямы освещены свечами и редко: туда не
 * тянут линию, туда носят огонь в руках, и это видно с порога.
 *
 * Так граница пропусков читается светом. Игрок идёт по ярко освещённому ребру
 * снабжения и упирается в тёмное пятно ямы, не открывая карты.
 *
 * Проход детерминированный: три сетки разного шага по ролям плюс лампа в
 * середине каждой комнаты. Микрокомнаты Вороного мелкие и наглухо стенные,
 * поэтому без комнатной лампы сетка через стену до них не достаёт.
 *
 * Замечание о порядке: `openOwnedCell` раньше красил освещённость каждой
 * захваченной клетки прямо в `world.light` (0.1 / 0.18 / 0.32 по роли) прямо в
 * ходе прорубки. `world.bakeLights()` в конце генерации начинается с
 * `light.fill(0)` и стирал эту заливку целиком — до игры она не доживала ни
 * разу. Возвращать её нельзя: заливка 0.18 по всему этажу подняла бы каждую
 * клетку выше порога темноты, которым пользуется AI (`light < 0.16`), и на
 * восьмистах тысячах клеток не осталось бы ни одного тёмного угла. Тот же
 * замысел теперь несёт плотность источников, а её не стирает и повторный бейк
 * после самосбора.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';
import { OWNER_NONE, type Site } from './geometry';

/** Пост и клиника: дежурный свет над решёткой и над койкой. */
const DUTY_STEP = 8;
/** Обычная ячейка: контора, приёмная, кухня, склад, палата. */
const CELL_STEP = 11;
/** Заражённая ячейка и трупная яма: свеча гаснет к 4.4 клетки, при шаге 13
 *  между огнями остаётся настоящая темнота. */
const FOUL_STEP = 13;

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки вокруг цели: середина ячейки часто занята
 *  нарами, ящиком или панелью, и без обхода источник просто не встанет. */
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

type LightBand = 'duty' | 'cell' | 'foul';

function bandOfSite(site: Site | undefined): LightBand {
  if (!site) return 'cell';
  if (site.infected || site.role === 'corpse_pit') return 'foul';
  if (site.role === 'checkpoint' || site.role === 'clinic') return 'duty';
  return 'cell';
}

/** Полоса освещения клетки: по владеющей ячейке. Ничейная земля между ячейками
 *  освещается как обычная — по ней ходят, и она не должна быть чернее ямы. */
function bandAt(world: World, owner: Int16Array, sites: readonly Site[], x: number, y: number): LightBand {
  const id = owner[world.idx(x, y)];
  if (id === OWNER_NONE) return 'cell';
  return bandOfSite(sites[id]);
}

function gridPass(
  world: World,
  owner: Int16Array,
  sites: readonly Site[],
  band: LightBand,
  step: number,
  feature: Feature,
): void {
  const half = step >> 1;
  for (let y = half; y < W; y += step) {
    for (let x = half; x < W; x += step) {
      if (bandAt(world, owner, sites, x, y) !== band) continue;
      placeNear(world, x, y, feature, 2);
    }
  }
}

export function lightVoronoiQuarantine(world: World, sites: readonly Site[], owner: Int16Array): void {
  // Комнатная лампа первой: микроячейки Вороного меньше шага любой сетки и
  // замкнуты стенами, а свет сквозь стену не проходит вовсе.
  for (const room of world.rooms) {
    if (!room) continue;
    const cx = room.x + (room.w >> 1);
    const cy = room.y + (room.h >> 1);
    const band = bandAt(world, owner, sites, cx, cy);
    placeNear(world, cx, cy, band === 'foul' ? Feature.CANDLE : Feature.LAMP, 2);
  }

  gridPass(world, owner, sites, 'duty', DUTY_STEP, Feature.LAMP);
  gridPass(world, owner, sites, 'cell', CELL_STEP, Feature.LAMP);
  gridPass(world, owner, sites, 'foul', FOUL_STEP, Feature.CANDLE);
}

/* ── Пионерлагерь: свет смены ─────────────────────────────────────
 *
 * Лагерь выходил из генератора с 292 источниками на 117 149 проходимых клеток —
 * это `scatterAmbientLights` россыпью, то есть случайные пятна в темноте. Корпус,
 * столовая, медпункт, сцена вечерней линейки не имели ничего своего, и смена
 * жила на этаже, где не горит ни одно окно.
 *
 * Лагерь — место обжитое, и свет здесь ЗАВЕДЁННЫЙ, а не уцелевший: корпуса и
 * кружки держат ровный внутренний свет, дорожки между ними — гирлянду на
 * столбах, площадь линейки освещена вся, потому что на ней строятся затемно.
 * Костёр у сцены сделан свечами, а не лампой: у огня свет тёплый, короткий и
 * с мягким краем, и по нему сцена читается издалека как отдельная точка.
 *
 * Проход детерминированный, шагом по сетке — жребий здесь не нужен, ровный
 * свет и есть признак живущего лагеря. Занятую клетку проход не переписывает:
 * кровати домиков, столы столовой и авторская россыпь остаются как объявлены.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';
import { type CampRooms } from './meta';

/** Шаг света внутри корпусов и на дорожках. Радиус лампы 8; шаг чуть теснее
 *  диаметра пятна закрывает и углы, куда достаёт только один источник. */
const CAMP_STEP = 10;

/** Кольцо костра у сцены: радиус свечи 5, и три шага по кольцу дают круг
 *  тёплого света, а не заливку. */
const FIRE_RING = 4;

function setLight(world: World, x: number, y: number, feature: Feature): boolean {
  const i = world.idx(x, y);
  if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) return false;
  world.features[i] = feature;
  return true;
}

/** Свет садится на ближайшую свободную клетку. Без кольцевого поиска лампа
 *  спальни исчезает всякий раз, когда середину комнаты занял стол. */
function setLightNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (setLight(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

export function lightPioneerCamp(world: World, rooms: CampRooms): void {
  // Корпуса, кружки, столовая, медпункт: лампа посреди помещения и разводка по
  // шагу. Одной лампы в центре хватает домику, но не столовой на три обеда.
  for (const room of world.rooms) {
    if (!room) continue;
    setLightNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP, 2);
    for (let y = room.y + (CAMP_STEP >> 1); y < room.y + room.h; y += CAMP_STEP) {
      for (let x = room.x + (CAMP_STEP >> 1); x < room.x + room.w; x += CAMP_STEP) {
        setLightNear(world, x, y, Feature.LAMP, 1);
      }
    }
  }

  // Дорожки, площадь линейки, спортплощадка, полосы между корпусами: столбы по
  // той же сетке. Клетки комнат уже прошли выше — здесь только земля лагеря.
  for (let y = CAMP_STEP >> 1; y < W; y += CAMP_STEP) {
    for (let x = CAMP_STEP >> 1; x < W; x += CAMP_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      setLightNear(world, x, y, Feature.LAMP, 2);
    }
  }

  // Костёр перед сценой вечерней линейки. Свечи кольцом: сцена должна читаться
  // как огонь среди ровного лагерного света, а не как ещё один плафон.
  const fireX = rooms.stage.x + (rooms.stage.w >> 1);
  const fireY = rooms.stage.y + (rooms.stage.h >> 1);
  for (let a = 0; a < 8; a++) {
    const dx = Math.round(FIRE_RING * Math.cos((a * Math.PI) / 4));
    const dy = Math.round(FIRE_RING * Math.sin((a * Math.PI) / 4));
    setLightNear(world, fireX + dx, fireY + dy, Feature.CANDLE, 1);
  }
}

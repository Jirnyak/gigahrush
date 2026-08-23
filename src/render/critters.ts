import { crittersEnabled } from '../systems/ui_orchestrator';
import { World } from '../core/world';
import { Cell, Feature } from '../core/types';
import { playRoachCrunch, playSoundAt } from '../systems/audio';
import {
  CRITTER_ACTIVE_SPECIES_CAP,
  CRITTER_SPECIES_STRIDE,
  packCritterSpecies,
} from '../data/critters';
import { designFloorFauna } from '../data/design_floor_profiles';

/**
 * Сторона блока клеток вокруг игрока, из которого шейдер набирает живность.
 * Мобильный блок уже: там дешевле пиксели, а не клетки, но и смотреть в даль
 * на телефоне некуда.
 */
const CRITTER_BLOCK_DESKTOP = 24;
const CRITTER_BLOCK_MOBILE = 14;
/** Слотов на клетку: верхняя граница плотности, реальную решает притяжение. */
const CRITTER_SLOTS_PER_CELL = 3;

function isTouchDevice(): boolean {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

/**
 * Рисуем ли живность. Раньше здесь стоял запрет для тач-устройств: он платил за
 * CPU-симуляцию пула, которой больше нет. Остался ручной тумблер и сторож по FPS.
 */
export function getCritterRenderEnabled(fps?: number): boolean {
  if (fps !== undefined && fps < 30) return false;
  return crittersEnabled();
}

export function critterBlockSize(): number {
  return isTouchDevice() ? CRITTER_BLOCK_MOBILE : CRITTER_BLOCK_DESKTOP;
}

export function critterSlotsPerCell(): number {
  return CRITTER_SLOTS_PER_CELL;
}

const speciesTable = new Float32Array(CRITTER_ACTIVE_SPECIES_CAP * CRITTER_SPECIES_STRIDE);
let packedForFloor: string | undefined;
let packedCount = 0;

/**
 * Таблица активных видов для текущего этажа. Пересобирается только при смене
 * этажа: набор живности — свойство этажа, а не кадра.
 */
export function critterSpeciesTable(designFloorId: string | undefined): {
  data: Float32Array;
  count: number;
} {
  if (designFloorId !== packedForFloor) {
    packedCount = packCritterSpecies(designFloorFauna(designFloorId), speciesTable);
    packedForFloor = designFloorId;
  }
  return { data: speciesTable, count: packedCount };
}

/**
 * Хруст под ногой. Особей в памяти нет, поэтому раздавить конкретного таракана
 * нельзя — но клетка, где шейдер их плодит, определяется теми же полями мира,
 * и на неё можно наступить. Проверяется одна клетка на шаг игрока.
 */
let lastCrunchCell = -1;

export function updateCritterCrunch(world: World, px: number, py: number): void {
  const idx = world.idx(Math.floor(px), Math.floor(py));
  if (idx === lastCrunchCell) return;
  lastCrunchCell = idx;
  if (!getCritterRenderEnabled()) return;
  if (world.cells[idx] !== Cell.FLOOR) return;
  // Тараканье место: съестное или сырость рядом, и достаточно темно.
  if (world.light[idx] > 0.55) return;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const f = world.features[world.idx(Math.floor(px) + dx, Math.floor(py) + dy)];
      if (f === Feature.STOVE || f === Feature.SINK || f === Feature.TOILET || f === Feature.SHELF) {
        playSoundAt(playRoachCrunch, px, py);
        return;
      }
    }
  }
}

/** Смена этажа: следующий шаг снова может хрустнуть. */
export function resetCritterCrunch(): void {
  lastCrunchCell = -1;
}

const GRID_COLS = 5;
const GRID_CELL_UNITS = 22;
const GRID_GAP_UNITS = 24;
const GRID_SCREEN_W = 0.88;
const GRID_SCREEN_H = 0.78;
const GRID_SCALE_MAX = 4;
const GRID_SCALE_TARGET_MIN = 2.2;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface UiRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InventoryPanelLayout {
  scale: number;
  originX: number;
  originY: number;
  grid: UiRect & { cell: number; cols: number; rows: number };
  details: UiRect;
  prep: UiRect & { cols: number; rows: number; tileW: number; tileH: number };
  equip: UiRect;
  vitals: UiRect;
  attr: UiRect;
  close: UiRect;
  use: UiRect;
  drop: UiRect;
}

export function dialogMenuScale(canvasW: number, canvasH: number, sx: number, sy: number): number {
  const raw = Math.min(canvasW / 320, canvasH / 200);
  return Math.max(sx, sy, clamp(raw, 1, 3.35));
}

function scaledRect(originX: number, originY: number, scale: number, x: number, y: number, w: number, h: number): UiRect {
  return { x: originX + x * scale, y: originY + y * scale, w: w * scale, h: h * scale };
}

export function inventoryPanelLayout(canvasW: number, canvasH: number): InventoryPanelLayout {
  const scale = Math.max(0.2, Math.min(4.2, Math.min(canvasW / 320, canvasH / 200)));
  const originX = Math.max(0, (canvasW - 320 * scale) * 0.5);
  const originY = Math.max(0, (canvasH - 200 * scale) * 0.5);
  const grid = scaledRect(originX, originY, scale, 8, 22, 110, 110) as InventoryPanelLayout['grid'];
  grid.cell = 22 * scale;
  grid.cols = 5;
  grid.rows = 5;
  const prep = scaledRect(originX, originY, scale, 128, 22, 184, 40) as InventoryPanelLayout['prep'];
  prep.cols = 4;
  prep.rows = 2;
  prep.tileW = prep.w / prep.cols;
  prep.tileH = prep.h / prep.rows;
  return {
    scale,
    originX,
    originY,
    grid,
    details: scaledRect(originX, originY, scale, 8, 137, 110, 55),
    prep,
    equip: scaledRect(originX, originY, scale, 128, 66, 184, 39),
    vitals: scaledRect(originX, originY, scale, 128, 109, 184, 83),
    attr: scaledRect(originX, originY, scale, 128, 110, 184, 15),
    close: scaledRect(originX, originY, scale, 238, 1, 74, 16),
    use: scaledRect(originX, originY, scale, 10, 176, 50, 14),
    drop: scaledRect(originX, originY, scale, 66, 176, 50, 14),
  };
}

function inventoryGridScale(canvasW: number, canvasH: number, verticalUnits: number): number {
  const raw = Math.min(canvasW / 320, canvasH / 200);
  const twoGridUnits = GRID_CELL_UNITS * GRID_COLS * 2 + GRID_GAP_UNITS;
  const byW = (canvasW * GRID_SCREEN_W) / twoGridUnits;
  const byH = (canvasH * GRID_SCREEN_H) / verticalUnits;
  const fit = Math.min(raw, byW, byH);
  const minScale = Math.max(1, Math.min(GRID_SCALE_TARGET_MIN, byW, byH));
  return clamp(fit, Math.min(minScale, fit), GRID_SCALE_MAX);
}

export function tradeGridScale(canvasW: number, canvasH: number): number {
  return inventoryGridScale(canvasW, canvasH, 28 + GRID_CELL_UNITS * GRID_COLS + 58);
}

export function containerGridScale(canvasW: number, canvasH: number): number {
  return inventoryGridScale(canvasW, canvasH, 30 + GRID_CELL_UNITS * GRID_COLS + 66);
}

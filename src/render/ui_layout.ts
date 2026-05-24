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

export interface HudSafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MobileHudSafeContext {
  enabled: boolean;
  portrait: boolean;
  safeInsets?: Partial<HudSafeInsets>;
}

let mobileHudSafeContext: MobileHudSafeContext = {
  enabled: false,
  portrait: false,
};

export function setMobileHudSafeContext(next: MobileHudSafeContext): void {
  mobileHudSafeContext = {
    enabled: next.enabled,
    portrait: next.portrait,
    safeInsets: next.safeInsets,
  };
}

export function getMobileHudSafeContext(): MobileHudSafeContext {
  return mobileHudSafeContext;
}

export interface HudStackSlot extends UiRect {
  cursorY: number;
  gap: number;
  align: 'left' | 'center' | 'right';
}

export interface HudSlots {
  safe: HudSafeInsets;
  topLeftEvent: HudStackSlot;
  topCenterCritical: HudStackSlot;
  topRightNavigation: HudStackSlot;
  centerInteraction: UiRect;
  centerModal: UiRect;
  bottomVitals: UiRect;
  screenFx: UiRect;
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

function safeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value!) : fallback;
}

function hudSafeInsets(
  canvasW: number,
  canvasH: number,
  sx: number,
  sy: number,
  mobileControls: boolean,
  override?: Partial<HudSafeInsets>,
): HudSafeInsets {
  const base: HudSafeInsets = {
    top: 4 * sy,
    right: 4 * sx,
    bottom: 0,
    left: 4 * sx,
  };
  if (mobileControls) {
    base.top = Math.max(base.top, Math.min(58, canvasH * 0.18));
    base.left = Math.max(base.left, Math.min(118, canvasW * 0.22));
    base.right = Math.max(base.right, Math.min(104, canvasW * 0.24));
    base.bottom = Math.max(base.bottom, Math.min(160, Math.max(104, canvasH * 0.28)));
  }
  return {
    top: safeNumber(override?.top, base.top),
    right: safeNumber(override?.right, base.right),
    bottom: safeNumber(override?.bottom, base.bottom),
    left: safeNumber(override?.left, base.left),
  };
}

function makeStackSlot(
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
  align: HudStackSlot['align'],
): HudStackSlot {
  return { x, y, w: Math.max(0, w), h: Math.max(0, h), cursorY: y, gap, align };
}

export function createHudSlots(
  canvasW: number,
  canvasH: number,
  sx: number,
  sy: number,
  options: {
    mobileControls?: boolean;
    safeInsets?: Partial<HudSafeInsets>;
    bottomVitalsHeight?: number;
    topRightWidth?: number;
  } = {},
): HudSlots {
  const safe = hudSafeInsets(canvasW, canvasH, sx, sy, !!options.mobileControls, options.safeInsets);
  const gap = Math.max(2 * sy, 4);
  const bottomH = Math.max(16 * sy, options.bottomVitalsHeight ?? 20 * sy);
  const bottomY = Math.max(safe.top + 64 * sy, canvasH - safe.bottom - bottomH);
  const topH = Math.max(0, bottomY - safe.top - gap);
  const usableW = Math.max(0, canvasW - safe.left - safe.right);
  const navW = Math.max(80 * sx, Math.min(usableW, options.topRightWidth ?? 176 * sx));
  const topLeftW = Math.max(48 * sx, usableW - navW - 8 * sx);

  return {
    safe,
    topLeftEvent: makeStackSlot(safe.left, safe.top, topLeftW, topH, gap, 'left'),
    topCenterCritical: makeStackSlot(safe.left, safe.top, usableW, topH, gap, 'center'),
    topRightNavigation: makeStackSlot(canvasW - safe.right - navW, safe.top, navW, topH, gap, 'right'),
    centerInteraction: {
      x: safe.left,
      y: canvasH * 0.5 + 24 * sy,
      w: usableW,
      h: Math.max(18 * sy, bottomY - (canvasH * 0.5 + 24 * sy) - gap),
    },
    centerModal: {
      x: safe.left,
      y: safe.top,
      w: usableW,
      h: Math.max(0, bottomY - safe.top),
    },
    bottomVitals: {
      x: options.mobileControls ? safe.left : 0,
      y: bottomY,
      w: options.mobileControls ? usableW : canvasW,
      h: bottomH,
    },
    screenFx: { x: 0, y: 0, w: canvasW, h: canvasH },
  };
}

export function allocateHudSlot(
  slot: HudStackSlot,
  height: number,
  width = slot.w,
  align: HudStackSlot['align'] = slot.align,
): UiRect {
  const rectW = Math.max(0, Math.min(slot.w, width));
  const rectH = Math.max(0, height);
  const x = align === 'right'
    ? slot.x + slot.w - rectW
    : align === 'center'
      ? slot.x + (slot.w - rectW) * 0.5
      : slot.x;
  const y = slot.cursorY;
  slot.cursorY = Math.min(slot.y + slot.h, slot.cursorY + rectH + slot.gap);
  return { x, y, w: rectW, h: rectH };
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

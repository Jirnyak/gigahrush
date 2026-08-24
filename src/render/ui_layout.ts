import { INVENTORY_GRID_COLS, INVENTORY_GRID_ROWS } from '../data/inventory_limits';
import { TRADE_OFFER_SLOT_CAP } from '../systems/trade';

const GRID_COLS = INVENTORY_GRID_COLS;
const GRID_ROWS = INVENTORY_GRID_ROWS;
const GRID_CELL_UNITS = 22;


function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Uniform scale of the canvas menu layer. Draw and hit-test must use the same
 *  clamp: main.ts used to clamp to [0.8, 2] while the panels were painted with
 *  [0.72, 1.68], so on wide tablets taps landed on a different row than the one
 *  drawn. */
export function canvasMenuScale(canvasW: number, canvasH: number, scrW: number, scrH: number): number {
  return clamp(Math.min(canvasW / scrW, canvasH / scrH), 0.72, 1.68);
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
  /** CSS pixels — the same numbers the touch DOM is laid out with. */
  safeInsets?: Partial<HudSafeInsets>;
  /** CSS width of the viewport the insets were measured in. The HUD canvas runs
   *  at a fraction of that (PIXEL_SCALE), so the insets must be rescaled before
   *  they are used as canvas units — unscaled they reserved twice the space and
   *  could collapse every HUD slot to zero width in portrait. */
  viewportWidth?: number;
  viewportHeight?: number;
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
    viewportWidth: next.viewportWidth,
    viewportHeight: next.viewportHeight,
  };
}

/** Mobile safe insets converted from CSS pixels into canvas pixels. */
export function mobileHudSafeInsetsForCanvas(
  context: MobileHudSafeContext,
  canvasW: number,
  canvasH: number,
): Partial<HudSafeInsets> | undefined {
  const insets = context.safeInsets;
  if (!insets) return undefined;
  const vw = context.viewportWidth;
  const vh = context.viewportHeight;
  const scaleX = vw && vw > 0 ? canvasW / vw : 1;
  const scaleY = vh && vh > 0 ? canvasH / vh : 1;
  return {
    top: insets.top === undefined ? undefined : insets.top * scaleY,
    bottom: insets.bottom === undefined ? undefined : insets.bottom * scaleY,
    left: insets.left === undefined ? undefined : insets.left * scaleX,
    right: insets.right === undefined ? undefined : insets.right * scaleX,
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

export interface FullscreenInventoryLayout {
  scale: number;
  textScale: number;
  grid: UiRect & { cell: number; cols: number; rows: number };
  details: UiRect;
  close: UiRect;
  use: UiRect;
  drop: UiRect;
  attr: UiRect;
}

export interface ContainerMenuGridLayout {
  scale: number;
  cell: number;
  gap: number;
  cols: number;
  rows: number;
  startX: number;
  startY: number;
  containerX: number;
  gridTotal: number;
  headerW: number;
  close: UiRect;
}

export type TradePanelSide = 'player' | 'pool' | 'npc';

/** Both baskets share one box in the middle, split in half: your side of the
 *  table on the left, theirs on the right, each column pair reading toward the
 *  inventory it came from. Two full 8x8 baskets cost the inventories half the
 *  screen for slots a deal never uses, so the half is exactly as wide as the
 *  basket cap needs — a staged item is always visible and always reachable. */
export const TRADE_POOL_HALF_COLS = Math.max(1, Math.ceil(TRADE_OFFER_SLOT_CAP / GRID_ROWS));
export const TRADE_POOL_COLS = TRADE_POOL_HALF_COLS * 2;

export interface TradeMenuGridLayout {
  scale: number;
  cell: number;
  cols: number;
  rows: number;
  poolCols: number;
  poolHalfCols: number;
  gridTotal: number;
  poolTotal: number;
  headH: number;
  gridY: number;
  playerX: number;
  poolX: number;
  npcX: number;
  info: UiRect;
  dealX: number;
  dealY: number;
  dealW: number;
  dealH: number;
}

export function tradePanelOrigin(layout: TradeMenuGridLayout, side: TradePanelSide): { x: number; y: number } {
  return {
    x: side === 'player' ? layout.playerX : side === 'pool' ? layout.poolX : layout.npcX,
    y: layout.gridY,
  };
}

export interface CraftMenuLayout {
  scale: number;
  originX: number;
  originY: number;
  title: UiRect;
  list: UiRect;
  detail: UiRect;
  materials: UiRect;
  bottom: UiRect;
  close: UiRect;
  rowH: number;
  materialRowH: number;
  icon: UiRect;
}

export function dialogMenuScale(canvasW: number, canvasH: number, sx: number, sy: number): number {
  const raw = Math.min(canvasW / 320, canvasH / 200);
  return Math.max(sx, sy, clamp(raw, 1, 2.72));
}

/** The NPC dialog is a 440x320-unit box. */
const NPC_MENU_UNITS_W = 440;
const NPC_MENU_UNITS_H = 320;
const NPC_MENU_MARGIN_UNITS = 24;
const NPC_MENU_ROW_UNITS = 17;
const NPC_MENU_LIST_TOP_UNITS = 42;
const NPC_MENU_HINT_UNITS = 20;

export interface NpcMenuLayout extends UiRect {
  scale: number;
  rowH: number;
  listTop: number;
  firstRow: number;
  visibleRows: number;
}

/** One box for the dialog, shared by the renderer and the tap layer.
 *
 *  The scale is capped by the canvas: `dialogMenuScale` takes the HUD scale as a
 *  floor, so on a short canvas the box used to be clipped to the screen while
 *  every offset inside it kept the uncapped scale — the option list, the poker
 *  table and the hint line then drew past the frame and over each other. Capping
 *  the scale instead keeps the 440x320 unit grid honest, and the option window
 *  guarantees a long list never runs out of the box. */
export function npcMenuLayout(
  canvasW: number,
  canvasH: number,
  sx: number,
  sy: number,
  optionCount = 0,
  selected = 0,
): NpcMenuLayout {
  const scale = Math.min(
    dialogMenuScale(canvasW, canvasH, sx, sy),
    canvasW / (NPC_MENU_UNITS_W + NPC_MENU_MARGIN_UNITS),
    canvasH / (NPC_MENU_UNITS_H + NPC_MENU_MARGIN_UNITS),
  );
  const w = NPC_MENU_UNITS_W * scale;
  const h = NPC_MENU_UNITS_H * scale;
  const x = (canvasW - w) / 2;
  const y = (canvasH - h) / 2;
  const rowH = NPC_MENU_ROW_UNITS * scale;
  const listTop = y + NPC_MENU_LIST_TOP_UNITS * scale;
  const listBottom = y + h - NPC_MENU_HINT_UNITS * scale;
  const visibleRows = Math.max(1, Math.floor((listBottom - listTop) / rowH));
  const maxFirst = Math.max(0, optionCount - visibleRows);
  const firstRow = clamp(selected - ((visibleRows - 1) >> 1), 0, maxFirst);
  return { scale, x, y, w, h, rowH, listTop, firstRow, visibleRows };
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
  const bottomVitalsInset = options.mobileControls
    ? Math.max(4 * sy, Math.min(14 * sy, canvasH * 0.04))
    : safe.bottom;
  const bottomY = Math.max(safe.top + 64 * sy, canvasH - bottomVitalsInset - bottomH);
  const topH = Math.max(0, bottomY - safe.top - gap);
  const usableW = Math.max(0, canvasW - safe.left - safe.right);
  const navW = Math.max(80 * sx, Math.min(usableW, options.topRightWidth ?? 176 * sx));
  const topLeftW = Math.max(48 * sx, usableW - navW - 8 * sx);
  const interactionH = Math.max(18 * sy, 1);
  const minInteractionY = safe.top + 36 * sy;
  const maxInteractionY = Math.max(minInteractionY, bottomY - interactionH - gap);
  const interactionY = clamp(Math.min(canvasH * 0.5 + 24 * sy, maxInteractionY), minInteractionY, maxInteractionY);

  return {
    safe,
    topLeftEvent: makeStackSlot(safe.left, safe.top, topLeftW, topH, gap, 'left'),
    topCenterCritical: makeStackSlot(safe.left, safe.top, usableW, topH, gap, 'center'),
    topRightNavigation: makeStackSlot(canvasW - safe.right - navW, safe.top, navW, topH, gap, 'right'),
    centerInteraction: {
      x: safe.left,
      y: interactionY,
      w: usableW,
      h: Math.max(interactionH, bottomY - interactionY - gap),
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

export function fullscreenInventoryLayout(canvasW: number, canvasH: number, sx: number, sy: number): FullscreenInventoryLayout {
  const base = Math.min(sx, sy);
  const fitW = canvasW / (8 + GRID_CELL_UNITS * GRID_COLS + 132);
  const fitH = canvasH / (14 + GRID_CELL_UNITS * GRID_ROWS + 8);
  const scale = Math.max(0.72, Math.min(4.2, base, fitW, fitH));
  const textScale = scale <= 1.2 ? scale : Math.max(1.2, scale * 0.9);
  // The 8x8 grid may not eat the canvas. The right column carries the item
  // description at full text scale, and at full grid scale it was too narrow
  // for it — the last line of every description was cut off.
  // The title line is drawn at text scale (baseline 9, face 7.2), so the grid
  // clears it in text units — measured in grid units alone the header sat on
  // the first row. Below that the grid takes all the height it can get, capped
  // by width so the right column keeps room for the item description.
  const gridY = 18 * textScale;
  const gridScale = Math.max(0.72, Math.min(
    (canvasH - gridY - 6 * textScale) / (GRID_CELL_UNITS * GRID_ROWS),
    (canvasW * 0.5) / (GRID_CELL_UNITS * GRID_COLS + 20),
  ));
  const cell = GRID_CELL_UNITS * gridScale;
  const gridX = 8 * gridScale;
  const gridW = GRID_COLS * cell;
  const gridH = GRID_ROWS * cell;
  const stX = gridX + gridW + 12 * gridScale;
  const rightW = Math.max(72 * scale, canvasW - stX - 8 * scale);
  const detailsY = Math.max(8 * textScale, gridY - 4 * gridScale);
  const detailsH = 58 * textScale;
  const actionW = Math.min(82 * textScale, rightW);
  const actionY = detailsY + 37 * textScale;
  const grid = { x: gridX, y: gridY, w: gridW, h: gridH, cell, cols: GRID_COLS, rows: GRID_ROWS };
  return {
    scale: gridScale,
    textScale,
    grid,
    close: { x: canvasW - 88 * textScale, y: 0, w: 88 * textScale, h: 18 * textScale },
    details: { x: stX, y: detailsY, w: rightW, h: detailsH },
    use: { x: stX, y: actionY, w: actionW, h: 12 * textScale },
    drop: { x: stX + actionW + 6 * textScale, y: actionY, w: actionW, h: 12 * textScale },
    attr: { x: stX, y: detailsY + detailsH + 4 * textScale, w: rightW, h: 14 * textScale },
  };
}



export function containerMenuGridLayout(canvasW: number, canvasH: number): ContainerMenuGridLayout {
  const cellUnits = 28;
  const gapUnits = 16;
  // Access, theft and production status live on the header line above the grids.
  // As a right-hand column they cost both inventories a third of the width for
  // four wrapped words, and the cells shrank on every canvas.
  const headerUnits = 46;
  const verticalUnits = headerUnits + cellUnits * GRID_ROWS + 66;
  const horizontalUnits = cellUnits * GRID_COLS * 2 + gapUnits;

  const raw = Math.min(canvasW / 320, canvasH / 200);
  const byW = (canvasW * 0.94) / horizontalUnits;
  const byH = (canvasH * 0.92) / verticalUnits;
  const fit = Math.min(raw, byW, byH);
  const minScale = Math.max(1, Math.min(2.8, byW, byH));
  const scale = clamp(fit, Math.min(minScale, fit), 5.5);

  const cell = cellUnits * scale;
  const gap = gapUnits * scale;
  const gridTotal = GRID_COLS * cell;
  const totalW = gridTotal * 2 + gap;
  const startX = (canvasW - totalW) / 2;
  const startY = headerUnits * scale;
  return {
    scale,
    cell,
    gap,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    startX,
    startY,
    containerX: startX + gridTotal + gap,
    gridTotal,
    headerW: Math.max(80 * scale, canvasW - 24 * scale),
    close: { x: 0, y: canvasH - 30 * scale, w: canvasW, h: 30 * scale },
  };
}

export function tradeMenuGridLayout(canvasW: number, canvasH: number): TradeMenuGridLayout {
  const cellUnits = 26;
  const headUnits = 12;
  const gapUnits = 14;
  const topUnits = 16;
  const infoGapUnits = 14;
  const infoUnits = 96;
  const horizontalUnits = cellUnits * (GRID_COLS * 2 + TRADE_POOL_COLS) + gapUnits * 2;
  const verticalUnits = topUnits + headUnits + cellUnits * GRID_ROWS + infoGapUnits + infoUnits;

  const raw = Math.min(canvasW / 320, canvasH / 200);
  const byW = (canvasW * 0.98) / horizontalUnits;
  const byH = (canvasH * 0.95) / verticalUnits;
  const fit = Math.min(raw, byW, byH);
  const minScale = Math.max(1, Math.min(2.8, byW, byH));
  const scale = clamp(fit, Math.min(minScale, fit), 5.5);

  const cell = cellUnits * scale;
  const headH = headUnits * scale;
  const gridTotal = GRID_COLS * cell;
  const poolTotal = TRADE_POOL_COLS * cell;
  const gap = gapUnits * scale;
  const totalW = gridTotal * 2 + poolTotal + gap * 2;
  const playerX = Math.max(4 * scale, (canvasW - totalW) / 2);
  const poolX = playerX + gridTotal + gap;
  const npcX = poolX + poolTotal + gap;
  const gridY = (topUnits + headUnits) * scale;
  const infoY = gridY + GRID_ROWS * cell + infoGapUnits * scale;
  const info = {
    x: playerX,
    y: infoY,
    w: totalW,
    h: Math.max(infoUnits * scale, canvasH - infoY - 6 * scale),
  };
  const dealW = Math.min(info.w, 200 * scale);
  return {
    scale,
    cell,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    poolCols: TRADE_POOL_COLS,
    poolHalfCols: TRADE_POOL_HALF_COLS,
    gridTotal,
    poolTotal,
    headH,
    gridY,
    playerX,
    poolX,
    npcX,
    info,
    dealX: info.x + (info.w - dealW) / 2,
    dealY: infoY,
    dealW,
    dealH: 17 * scale,
  };
}

export function craftMenuLayout(canvasW: number, canvasH: number): CraftMenuLayout {
  const raw = Math.min(canvasW / 320, canvasH / 200);
  const scale = Math.max(0.72, Math.min(4.2, raw));
  const baseW = 320 * scale;
  const baseH = 200 * scale;
  const originX = Math.max(0, (canvasW - baseW) * 0.5);
  const originY = Math.max(0, (canvasH - baseH) * 0.5);
  const r = (x: number, y: number, w: number, h: number): UiRect => scaledRect(originX, originY, scale, x, y, w, h);
  return {
    scale,
    originX,
    originY,
    title: r(8, 5, 304, 15),
    list: r(8, 24, 90, 142),
    detail: r(104, 24, 122, 142),
    materials: r(232, 24, 80, 142),
    bottom: r(8, 171, 304, 22),
    close: r(248, 5, 64, 14),
    rowH: 12 * scale,
    materialRowH: 12 * scale,
    icon: r(137, 26, 56, 56),
  };
}

import { getPlotNpcNumericId } from '../src/data/npc_packages';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, EntityType, MonsterKind, QuestType, type Entity, type Quest } from '../src/core/types';
import { World } from '../src/core/world';
import { INVENTORY_GRID_COLS, INVENTORY_GRID_ROWS, MAX_INVENTORY_SLOTS } from '../src/data/inventory_limits';
import { drawControlsMenu } from '../src/render/controls_ui';
import { drawHelpMenu } from '../src/render/help_ui';
import { drawMinimap, mapEntityDotBudget } from '../src/render/map_ui';
import {
  allocateHudSlot,
  containerMenuGridLayout,
  createHudSlots,
  dialogMenuScale,
  fullscreenInventoryLayout,
  npcMenuLayout,
  TRADE_POOL_HALF_COLS,
  tradeMenuGridLayout,
  tradePanelOrigin,
} from '../src/render/ui_layout';
import { CONTROL_ACTIONS } from '../src/systems/controls';
import { TRADE_OFFER_SLOT_CAP } from '../src/systems/trade';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';
import '../src/data/npc_plot_packages';

class CanvasStubContext {
  readonly canvas: { width: number; height: number };
  readonly pathFills: string[] = [];
  readonly texts: string[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  globalAlpha = 1;
  font = '';
  imageSmoothingEnabled = false;
  textBaseline: CanvasTextBaseline = 'alphabetic';

  constructor(width = 200, height = 200) {
    this.canvas = { width, height };
  }

  measureText(text: string): TextMetrics { return { width: text.length * 7 } as TextMetrics; }
  fillText(text: string, _x: number, _y: number): void { this.texts.push(text); }
  fillRect(_x: number, _y: number, _w: number, _h: number): void {}
  strokeRect(_x: number, _y: number, _w: number, _h: number): void {}
  beginPath(): void {}
  rect(_x: number, _y: number, _w: number, _h: number): void {}
  clip(): void {}
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  closePath(): void {}
  stroke(): void {}
  fill(): void { this.pathFills.push(String(this.fillStyle)); }
  save(): void {}
  restore(): void {}
  drawImage(..._args: unknown[]): void {}
}

function drawMinimapPathFills(quest: Quest, target: Entity, activeQuestId?: number): string[] {
  const world = new World();
  const player = makeTestPlayer({ id: 1, x: 12.5, y: 12.5 });
  for (const entity of [player, target]) world.cells[world.idx(Math.floor(entity.x), Math.floor(entity.y))] = Cell.FLOOR;
  const entities = [player, target];
  const state = makeGameState({ currentZ: 0, quests: [quest], activeQuestId });
  rebuildEntityIndex(entities);
  const ctx = new CanvasStubContext();
  drawMinimap(
    ctx as unknown as CanvasRenderingContext2D,
    world,
    entities,
    player,
    1,
    1,
    state.quests,
    undefined,
    0,
    state,
    0,
    { x: 0, y: 0, w: 120, h: 120 },
  );
  return ctx.pathFills;
}

test('NPC dialog text can grow beyond the capped global HUD scale', () => {
  assert.equal(dialogMenuScale(640, 400, 2, 2), 2);
  assert.ok(dialogMenuScale(1920, 1080, 2, 2) > 2.6);
  assert.ok(dialogMenuScale(1920, 1080, 2, 2) <= 2.72);
});

test('NPC dialog box stays inside the canvas at any HUD scale', () => {
  for (const [w, h] of [[640, 400], [1920, 1080], [900, 340], [420, 900]] as const) {
    const box = npcMenuLayout(w, h, 2.4, 2.4);
    assert.ok(box.x >= 0 && box.y >= 0, `box escapes ${w}x${h}`);
    assert.ok(box.x + box.w <= w + 1e-6 && box.y + box.h <= h + 1e-6, `box overflows ${w}x${h}`);
    // Everything inside is placed in 440x320 units, so the scale must follow the box.
    assert.ok(Math.abs(box.w / 440 - box.scale) < 1e-6);
    assert.ok(Math.abs(box.h / 320 - box.scale) < 1e-6);
  }
});

test('NPC option list windows around the selection instead of running off the box', () => {
  const box = npcMenuLayout(900, 340, 2.4, 2.4, 24, 20);
  assert.ok(box.visibleRows >= 1);
  assert.ok(box.firstRow + box.visibleRows <= 24);
  assert.ok(box.firstRow <= 20 && 20 < box.firstRow + box.visibleRows, 'selection must stay visible');
  assert.ok(box.listTop + box.visibleRows * box.rowH <= box.y + box.h);
  assert.equal(npcMenuLayout(900, 340, 2.4, 2.4, 3, 0).firstRow, 0);
});

test('inventory grid is an 8x8 power-of-two actor inventory', () => {
  assert.equal(INVENTORY_GRID_COLS, 8);
  assert.equal(INVENTORY_GRID_ROWS, 8);
  assert.equal(MAX_INVENTORY_SLOTS, 64);
  assert.equal((INVENTORY_GRID_COLS & (INVENTORY_GRID_COLS - 1)), 0);
  assert.equal((INVENTORY_GRID_ROWS & (INVENTORY_GRID_ROWS - 1)), 0);
  assert.equal(MAX_INVENTORY_SLOTS, INVENTORY_GRID_COLS * INVENTORY_GRID_ROWS);
});

test('trade and container inventories use large cells on desktop canvases', () => {
  assert.ok(tradeMenuGridLayout(1920, 1080).cell >= 50);
  assert.ok(containerMenuGridLayout(1920, 1080).cell >= 66);
});

test('trade pool has a cell for every stack a basket can hold', () => {
  // A staged item with no cell is an item the player cannot take back.
  assert.ok(TRADE_POOL_HALF_COLS * INVENTORY_GRID_ROWS >= TRADE_OFFER_SLOT_CAP);
  assert.ok((TRADE_POOL_HALF_COLS - 1) * INVENTORY_GRID_ROWS < TRADE_OFFER_SLOT_CAP, 'no dead columns');
});

test('fullscreen inventory grid clears the title and fills the height it has', () => {
  for (const [w, h] of [[1920, 1080], [1280, 720], [844, 390]] as const) {
    const layout = fullscreenInventoryLayout(w, h, w / 320, h / 200);
    // The title is drawn at 9 text units with a 7.2 face — the grid starts below it.
    assert.ok(layout.grid.y >= 16.2 * layout.textScale, `title overlaps grid at ${w}x${h}`);
    assert.ok(layout.grid.y + layout.grid.h <= h + 0.001, `grid overflows ${w}x${h}`);
    // Either the height or the width cap is tight: no idle space on both axes.
    const spareH = h - (layout.grid.y + layout.grid.h);
    assert.ok(spareH <= 7 * layout.textScale || layout.grid.x + layout.grid.w >= w * 0.44, `grid too small at ${w}x${h}`);
    assert.ok(layout.details.x >= layout.grid.x + layout.grid.w, `columns overlap at ${w}x${h}`);
    assert.ok(layout.details.w >= w * 0.4, `right column too narrow at ${w}x${h}`);
  }
});

test('trade puts the shared pool between both inventories', () => {
  const layout = tradeMenuGridLayout(1280, 720);
  assert.ok(layout.cell > 40, 'three boxes must be roomier than four');
  assert.equal(layout.poolCols, TRADE_POOL_HALF_COLS * 2);
  const player = tradePanelOrigin(layout, 'player');
  const pool = tradePanelOrigin(layout, 'pool');
  const npc = tradePanelOrigin(layout, 'npc');
  assert.ok(player.x >= -0.001);
  assert.equal(player.y, pool.y);
  assert.equal(pool.y, npc.y);
  assert.ok(pool.x >= player.x + layout.gridTotal);
  assert.ok(npc.x >= pool.x + layout.poolTotal);
  assert.ok(npc.x + layout.gridTotal <= 1280 + 0.001);
  assert.ok(player.y - layout.headH >= -0.001);
  // The info band lives under the grids and inside the canvas.
  assert.ok(layout.info.y >= player.y + layout.rows * layout.cell);
  assert.ok(layout.info.y + layout.dealH <= 720 + 0.001);
  assert.ok(layout.dealX >= layout.info.x - 0.001);
  assert.ok(layout.dealX + layout.dealW <= layout.info.x + layout.info.w + 0.001);
});

test('grid scale does not force tiny mobile canvases to overflow', () => {
  const layout = containerMenuGridLayout(280, 180);
  assert.ok(layout.scale < 1);
  assert.ok(layout.startX >= -0.001);
  assert.ok(layout.containerX + layout.gridTotal <= 280 + 0.001);
  assert.ok(layout.startY + layout.gridTotal <= 180 * 0.82 + 0.001);
});

test('fullscreen inventory layout exposes the rendered mobile hit regions', () => {
  const layout = fullscreenInventoryLayout(844, 390, 2.6375, 1.95);

  assert.ok(layout.textScale <= layout.scale);
  assert.equal(layout.grid.cols, INVENTORY_GRID_COLS);
  assert.equal(layout.grid.rows, INVENTORY_GRID_ROWS);
  assert.ok(layout.grid.x + layout.grid.w <= 844);
  assert.ok(layout.grid.y + layout.grid.h <= 390);
  assert.ok(layout.close.x + layout.close.w <= 844);
  assert.ok(layout.details.x >= layout.grid.x + layout.grid.w);
  assert.ok(layout.use.y >= layout.details.y);
  assert.ok(layout.drop.x > layout.use.x);
  assert.ok(layout.attr.x >= layout.grid.x + layout.grid.w);
});

test('fullscreen inventory keeps right-side text compact above the grid bottom', () => {
  const layout = fullscreenInventoryLayout(1920, 1080, 6, 5.4);

  assert.ok(layout.textScale < layout.scale);
  assert.ok(layout.details.y <= layout.grid.y);
  assert.ok(layout.attr.y < layout.grid.y + layout.grid.h * 0.45);
  assert.ok(layout.drop.x + layout.drop.w <= 1920);
});

test('container menu layout shares render and hit-test grid positions', () => {
  const layout = containerMenuGridLayout(844, 390);
  const expectedContainerX = layout.startX + layout.gridTotal + layout.gap;

  assert.ok(layout.cell > 0);
  assert.equal(layout.cols, INVENTORY_GRID_COLS);
  assert.equal(layout.rows, INVENTORY_GRID_ROWS);
  assert.equal(layout.containerX, expectedContainerX);
  assert.ok(layout.startX >= 0);
  assert.ok(layout.containerX + layout.gridTotal <= 844 + 0.001);
  assert.ok(layout.startY + layout.gridTotal <= 390);
  assert.equal(layout.close.w, 844);
});

test('map entity dot budget compresses minimap and dense mobile maps', () => {
  const minimapBudget = mapEntityDotBudget(160, 160, 40);
  assert.ok(minimapBudget <= 240);
  assert.equal(mapEntityDotBudget(320, 180, 200), minimapBudget);
});

test('desktop full map entity dot budget scales but stays bounded', () => {
  const desktopBudget = mapEntityDotBudget(1920, 1080, 200);
  assert.ok(desktopBudget > mapEntityDotBudget(640, 360, 200));
  assert.ok(desktopBudget <= 900);
});

test('map renders monster kill quest targets with red diamonds', () => {
  const monster: Entity = {
    id: 30,
    type: EntityType.MONSTER,
    x: 14.5,
    y: 12.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    monsterKind: MonsterKind.SHADOW,
  };
  const fills = drawMinimapPathFills({
    id: 9,
    type: QuestType.KILL,
    giverId: 10,
    giverName: 'Ванька',
    desc: 'Убей теневика.',
    plotStepIndex: 3,
    targetMonsterKind: MonsterKind.SHADOW,
    killCount: 0,
    killNeeded: 1,
    done: false,
  }, monster);

  assert.ok(fills.includes('#f44'));
  assert.equal(fills.includes('#6cf'), false);
});

test('minimap renders the selected active quest direction arrow', () => {
  const target = makeTestNpc({
    id: 41,
    x: 18.5,
    y: 12.5,
    canGiveQuest: false,
  });
  const fills = drawMinimapPathFills({
    id: 12,
    type: QuestType.TALK,
    giverId: 10,
    giverName: 'Ольга',
    desc: 'Поговорить с соседом.',
    targetNpcId: target.id,
    targetNpcName: target.name,
    done: false,
  }, target, 12);

  assert.ok(fills.includes('#ffd21f'));
});

test('map renders NPC kill quest targets with red diamonds', () => {
  const target = makeTestNpc({
    id: getPlotNpcNumericId('barni') ?? 31,
    x: 14.5,
    y: 12.5,
    canGiveQuest: false,
  });
  const fills = drawMinimapPathFills({
    id: 10,
    type: QuestType.KILL,
    giverId: 12,
    giverName: 'Секретарь',
    desc: 'Убери Баринова.',
    targetNpcId: getPlotNpcNumericId('barni'),
    killCount: 0,
    killNeeded: 1,
    done: false,
  }, target);

  assert.equal(fills.at(-1), '#f44');
});

test('HUD navigation slot stacks minimap and hints without overlap', () => {
  const slots = createHudSlots(640, 400, 2, 2);
  const minimap = allocateHudSlot(slots.topRightNavigation, 160, 160, 'right');
  const route = allocateHudSlot(slots.topRightNavigation, 70, 352, 'right');
  const caravan = allocateHudSlot(slots.topRightNavigation, 58, 352, 'right');

  assert.ok(route.y >= minimap.y + minimap.h);
  assert.ok(caravan.y >= route.y + route.h);
  assert.ok(minimap.x + minimap.w <= 640);
  assert.ok(route.x >= 0);
});

test('controls menu draws reset row before keyboard bindings', () => {
  const state = makeGameState({ showControls: true, controlView: 'keys', controlSel: 0, controlScroll: 0 });
  const ctx = new CanvasStubContext(1600, 900);

  drawControlsMenu(ctx as unknown as CanvasRenderingContext2D, state, 2, 2, 0);

  assert.ok(ctx.texts.includes('Вернуть дефолты'));
  assert.ok(ctx.texts.includes(CONTROL_ACTIONS[0].label));
  assert.ok(ctx.texts.includes('ENTER'));
});

test('F1 help poster draws current help and keybind hints', () => {
  const state = makeGameState({ showHelp: true });
  const ctx = new CanvasStubContext(1600, 900);

  drawHelpMenu(ctx as unknown as CanvasRenderingContext2D, state, 2, 2, 0);

  assert.ok(ctx.texts.some(text => text.includes('HELP')));
  assert.ok(ctx.texts.some(text => text.includes('F1')));
  assert.ok(ctx.texts.some(text => text.includes('Tab')));
});

test('HUD event summary lane ends before the fixed top-right minimap lane', () => {
  const slots = createHudSlots(640, 400, 2, 2, { topRightWidth: 212 * 2 });
  const summary = allocateHudSlot(slots.topLeftEvent, 72, slots.topLeftEvent.w, 'left');
  const minimap = allocateHudSlot(slots.topRightNavigation, 160, 160, 'right');

  assert.equal(minimap.y, slots.safe.top);
  assert.ok(summary.x + summary.w <= minimap.x);
});

test('mobile HUD vitals use bottom center lane between touch controls', () => {
  const slots = createHudSlots(640, 360, 2, 1.8, { mobileControls: true, bottomVitalsHeight: 36 });

  assert.ok(slots.safe.bottom >= 100);
  assert.ok(slots.bottomVitals.y + slots.bottomVitals.h >= 360 - 28);
  assert.ok(slots.bottomVitals.x >= slots.safe.left);
  assert.ok(slots.bottomVitals.x + slots.bottomVitals.w <= 640 - slots.safe.right + 0.001);
});

test('mobile HUD interaction prompt stays above bottom vitals', () => {
  const slots = createHudSlots(844, 390, 2.6375, 1.95, { mobileControls: true, bottomVitalsHeight: 39 });

  assert.ok(slots.bottomVitals.y + slots.bottomVitals.h >= 390 - 32);
  assert.ok(slots.centerInteraction.y + slots.centerInteraction.h <= slots.bottomVitals.y + 0.001);
  assert.ok(slots.centerInteraction.y < slots.bottomVitals.y);
});

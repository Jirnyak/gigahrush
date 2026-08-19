/* ── NPC interaction menu ─────────────────────────────────────── */

import { type Entity, type GameState, Faction } from '../core/types';
import { ITEMS } from '../data/catalog';
import { itemInstanceName } from '../data/items';
import { FACTION_NAMES, OCCUPATION_NAMES } from '../data/relations';
import { controlBindingLabel, controlHint, menuCloseHint } from '../systems/controls';
import { openTabletopGameFor } from '../systems/tabletop';
import { tabletopPanel } from './tabletop_ui';
import {
  getNpcInteractionInterfaceSnapshot,
  getNpcMenuOptions,
  isNpcMenuOptionListTab,
  NPC_MENU_INTERFACE_TAB,
} from '../systems/npc_interaction_options';
import { questDeadlineText, questRemainingMinutes } from '../systems/quest_deadlines';
import { drawNeuroPanel, drawGlitchText, textJitter, flicker } from './hud_fx';
import { npcMenuLayout, tradeMenuGridLayout, tradePanelOrigin } from './ui_layout';
import { drawWrappedText, fitTextStable } from './ui_text';
import './durak_ui';
import './dice_ui';
import './domino_ui';
import './checkers_ui';
import './poker_ui';
import './chess_ui';
import './go_ui';
import './backgammon_ui';
import './battleship_ui';
import {
  questItemStateColor,
  questItemStateLabel,
  tradeCellPriceDisplay,
  tradePriceDisplay,
} from './economy_ui';
import {
  getTradeDealSummary,
  getTradeNpcOffer,
  getTradeOffer,
} from '../systems/trade';
import { drawItemGridIcon } from './item_sprites';

import { PALETTE } from './ui_utils';

export function drawNpcMenu(
  ctx: CanvasRenderingContext2D,
  player: Entity,
  state: GameState,
  entities: Entity[],
  sx: number, sy: number,
  uiTime = state.time,
): void {
  const npc = entities.find(e => e.id === state.npcMenuTarget);
  if (!npc) return;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const listOptions = isNpcMenuOptionListTab(state.npcMenuTab)
    ? getNpcMenuOptions({ state, player, npc, entities })
    : undefined;
  const box = npcMenuLayout(w, h, sx, sy, listOptions?.length ?? 0, state.npcMenuSel);
  sx = box.scale;
  sy = box.scale;
  const pw = box.w;
  const ph = box.h;
  const px = box.x;
  const py = box.y;
  const time = uiTime;

  // Background — neuro-panel
  ctx.fillStyle = PALETTE.bgPanelSolid;
  ctx.fillRect(px, py, pw, ph);
  drawNeuroPanel(ctx, px, py, pw, ph, time, 90);

  // NPC name header
  const fName = npc.faction !== undefined ? FACTION_NAMES[npc.faction as Faction] : '';
  const oName = npc.occupation !== undefined ? OCCUPATION_NAMES[npc.occupation] : '';
  ctx.font = `${9 * sy}px "Press Start 2P", monospace`;
  drawGlitchText(ctx, fitTextStable(ctx, npc.name ?? '???', pw - 16 * sx), px + 8 * sx, py + 10 * sy, time, 900, PALETTE.primary, 9 * sy);
  ctx.fillStyle = PALETTE.textMuted;
  ctx.font = `${6.2 * sy}px "Press Start 2P", monospace`;
  const fj = textJitter(time, 901);
  ctx.fillText(fitTextStable(ctx, `${fName} · ${oName}`, pw - 16 * sx), px + 8 * sx + fj.dx, py + 22 * sy + fj.dy);

  if (isNpcMenuOptionListTab(state.npcMenuTab)) {
    const items = listOptions ?? [];
    const last = Math.min(items.length, box.firstRow + box.visibleRows);
    const labelW = pw - 32 * sx;
    ctx.font = `${8 * sy}px "Press Start 2P", monospace`;
    for (let i = box.firstRow; i < last; i++) {
      const selected = i === state.npcMenuSel;
      const yy = box.listTop + (i - box.firstRow) * box.rowH;
      const mj = textJitter(time, 910 + i);
      ctx.fillStyle = items[i].disabled
        ? selected ? PALETTE.warning : PALETTE.textMuted
        : selected ? `rgba(0,255,102,${flicker(time, 920 + i)})` : PALETTE.textBase;
      ctx.fillText(fitTextStable(ctx, `${selected ? '▶ ' : '  '}${items[i].label}`, labelW), px + 16 * sx + mj.dx, yy + mj.dy);
    }
    if (items.length > box.visibleRows) {
      ctx.fillStyle = PALETTE.textMuted;
      ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
      ctx.textAlign = 'right';
      if (box.firstRow > 0) ctx.fillText('▲', px + pw - 10 * sx, box.listTop);
      if (last < items.length) ctx.fillText('▼', px + pw - 10 * sx, box.listTop + (box.visibleRows - 1) * box.rowH);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#456';
    ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
    ctx.fillText(fitTextStable(ctx, `${controlBindingLabel('menuUp')}/${controlBindingLabel('menuDown')} выбор  |  ${controlHint('gameMenu')} выбрать  |  ${menuCloseHint()} закрыть`, pw - 16 * sx), px + 8 * sx, py + ph - 11 * sy);

  } else if (state.npcMenuTab === 'talk') {
    // Talk: show procedural text
    ctx.fillStyle = '#ccc';
    ctx.font = `${7.8 * sy}px "Press Start 2P", monospace`;
    const maxW = pw - 16 * sx;
    const maxLines = Math.max(1, Math.floor((py + ph - 26 * sy - (py + 40 * sy)) / (11 * sy)));
    drawWrappedText(ctx, state.npcTalkText, px + 8 * sx, py + 40 * sy, maxW, 11 * sy, maxLines);

    ctx.fillStyle = '#555';
    ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
    ctx.fillText(`${controlHint('gameMenu')} назад  |  ${menuCloseHint()} закрыть`, px + 8 * sx, py + ph - 11 * sy);

  } else if (state.npcMenuTab === 'quest') {
    // Quest tab: paginated, one quest per page with word wrap
    const active = state.quests.filter(q => !q.done);
    const total = active.length;
    ctx.font = `${7.8 * sy}px "Press Start 2P", monospace`;
    if (total === 0) {
      ctx.fillStyle = '#888';
      ctx.fillText('Активных заданий нет.', px + 8 * sx, py + 40 * sy);
    } else {
      const page = Math.min(state.questPage, total - 1);
      const q = active[page];
      // Header: page indicator
      ctx.fillStyle = '#888';
      ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
      ctx.fillText(`${page + 1} / ${total}`, px + pw - 40 * sx, py + 10 * sy);
      // Quest giver
      ctx.fillStyle = '#8af';
      ctx.font = `${7.8 * sy}px "Press Start 2P", monospace`;
      ctx.fillText(fitTextStable(ctx, `От: ${q.giverName ?? '???'}`, pw - 16 * sx), px + 8 * sx, py + 38 * sy);
      // Quest description — word-wrapped
      ctx.fillStyle = '#dda';
      const maxW = pw - 16 * sx;
      let ly = py + 54 * sy;
      const maxLines = Math.max(1, Math.floor((py + ph - 42 * sy - ly) / (11 * sy)));
      ly = drawWrappedText(ctx, q.desc, px + 8 * sx, ly, maxW, 11 * sy, maxLines);
      // Progress for KILL quests
      if (q.killNeeded !== undefined) {
        ly += 4 * sy;
        ctx.fillStyle = '#aaa';
        ctx.fillText(`Прогресс: ${q.killCount ?? 0}/${q.killNeeded}`, px + 8 * sx, ly);
      }
      const remaining = questRemainingMinutes(q, state.clock.totalMinutes);
      if (remaining !== undefined) {
        ly += 12 * sy;
        ctx.fillStyle = remaining <= 120 ? PALETTE.danger : remaining <= 360 ? PALETTE.warning : PALETTE.primary;
        ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
        ctx.fillText(fitTextStable(ctx, `Срок: ${questDeadlineText(q, state.clock.totalMinutes)}`, maxW), px + 8 * sx, ly);
      }
    }
    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
    const hint = total > 1
      ? `${controlBindingLabel('menuUp')}/${controlBindingLabel('menuDown')} листать  |  ${controlHint('gameMenu')} назад  |  ${menuCloseHint()} закрыть`
      : `${controlHint('gameMenu')} назад  |  ${menuCloseHint()} закрыть`;
    ctx.fillText(fitTextStable(ctx, hint, pw - 16 * sx), px + 8 * sx, py + ph - 11 * sy);

  } else if (state.npcMenuTab === NPC_MENU_INTERFACE_TAB) {
    // Whatever table is live for this NPC draws itself; the panel names no game.
    const table = openTabletopGameFor(npc.id);
    const drawPanel = table ? tabletopPanel(table.id) : undefined;
    if (table && drawPanel) {
      drawPanel(ctx, table.snapshot() as never, px, py, pw, ph, sx, sy, time);
      return;
    }
    const snapshot = getNpcInteractionInterfaceSnapshot();
    ctx.fillStyle = '#d7f7ff';
    ctx.font = `${9.2 * sy}px "Press Start 2P", monospace`;
    drawGlitchText(ctx, fitTextStable(ctx, snapshot.title || 'ИНТЕРФЕЙС', pw - 16 * sx), px + 8 * sx, py + 38 * sy, time, 940, '#ffd36a', 9.2 * sy);

    ctx.fillStyle = '#888';
    ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
    let ly = py + 56 * sy;
    const maxW = pw - 16 * sx;
    ctx.fillText(fitTextStable(ctx, snapshot.npcName || npc.name || 'NPC', maxW), px + 8 * sx, ly);
    ly += 14 * sy;
    if (snapshot.stakeRubles !== undefined) {
      ctx.fillStyle = PALETTE.warning;
      ctx.fillText(fitTextStable(ctx, `Ставка: ₽${snapshot.stakeRubles}`, maxW), px + 8 * sx, ly);
      ly += 12 * sy;
    }
    if (snapshot.priceRubles !== undefined) {
      ctx.fillStyle = PALETTE.warning;
      ctx.fillText(fitTextStable(ctx, `Цена: ₽${snapshot.priceRubles}`, maxW), px + 8 * sx, ly);
      ly += 12 * sy;
    }
    ctx.fillStyle = PALETTE.textBase;
    ctx.font = `${7.8 * sy}px "Press Start 2P", monospace`;
    for (const line of snapshot.lines) {
      ly = drawWrappedText(ctx, line, px + 8 * sx, ly, maxW, 10.5 * sy, 2) + 3 * sy;
      if (ly > py + ph - 48 * sy) break;
    }
    if (snapshot.message && ly <= py + ph - 36 * sy) {
      ctx.fillStyle = '#8cf';
      ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
      drawWrappedText(ctx, snapshot.message, px + 8 * sx, ly, maxW, 9 * sy, 2);
    }
    ctx.fillStyle = '#555';
    ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
    ctx.fillText(`${controlHint('gameMenu')} назад  |  ${menuCloseHint()} закрыть`, px + 8 * sx, py + ph - 11 * sy);

  } else if (state.npcMenuTab === 'trade') {
    // ── Fullscreen trade: symmetric inventories and offer baskets ──
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const layout = tradeMenuGridLayout(cw, ch);
    sx = layout.scale;
    sy = layout.scale;
    // Overdraw fullscreen background
    drawNeuroPanel(ctx, 0, 0, cw, ch, performance.now() / 1000, 200);
    const gridCols = layout.cols;
    const gridRows = layout.rows;
    const cellSz = layout.cell;
    const gridTotal = layout.gridTotal;
    const info = layout.info;
    const dealX = layout.dealX;
    const dealY = layout.dealY;
    const dealW = layout.dealW;
    const dealH = layout.dealH;

    const npcInv = npc.inventory ?? [];
    const plrInv = player.inventory ?? [];
    const playerOffer = getTradeOffer(state);
    const npcOffer = getTradeNpcOffer(state);
    const deal = getTradeDealSummary(state, npc);
    const stagedCount = (offer: readonly { defId: string; count: number; data?: unknown }[], item: { defId: string; data?: unknown }): number => {
      let count = 0;
      for (const slot of offer) if (slot.defId === item.defId && slot.data === item.data) count += slot.count;
      return count;
    };

    // ── Title (centered) ── baseline 'top' so tall glyphs never clip the canvas edge
    ctx.fillStyle = '#e8eef0';
    ctx.font = `${8 * sy}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ТОРГ', cw / 2, 1.5 * sy);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // ── Framed panels with header strips (money / offer values) ──
    const headH = layout.headH;
    const gridSpanH = gridRows * cellSz;
    const drawColumnFrame = (gx: number, gy: number, gw: number, title: string, value: string, accent: string, stripBg: string) => {
      const fx = gx - 2 * sx;
      const fy = gy - headH;
      const fw = gw + 4 * sx;
      const fh = headH + gridSpanH + 3 * sy;
      drawNeuroPanel(ctx, fx, fy, fw, fh, performance.now() / 1000, fx);
      ctx.fillStyle = stripBg;
      ctx.fillRect(fx, fy, fw, headH);
      ctx.fillStyle = accent;
      ctx.font = `${6.6 * sy}px "Press Start 2P", monospace`;
      ctx.textAlign = 'left';
      // Both ends get half the strip: title 62% + value 50% used to overlap in
      // the middle, and in the narrow pool box they collided outright.
      const halfW = Math.max(1, fw * 0.5 - 5 * sx);
      ctx.fillText(fitTextStable(ctx, title, halfW, 'clip'), fx + 4 * sx, fy + headH - 3.6 * sy);
      if (value) {
        ctx.textAlign = 'right';
        ctx.fillText(fitTextStable(ctx, value, halfW, 'clip'), fx + fw - 4 * sx, fy + headH - 3.6 * sy);
        ctx.textAlign = 'left';
      }
    };
    const playerOrigin = tradePanelOrigin(layout, 'player');
    const poolOrigin = tradePanelOrigin(layout, 'pool');
    const npcOrigin = tradePanelOrigin(layout, 'npc');
    drawColumnFrame(playerOrigin.x, playerOrigin.y, gridTotal, 'ВЫ', `₽${player.money ?? 0}`, '#c2a24c', 'rgba(52,48,8,0.66)');
    // Each half of the strip labels the half of the table under it. The sums are
    // not repeated here — they live in the summary line under the grids, and in
    // a box this narrow a number would eat the word.
    drawColumnFrame(poolOrigin.x, poolOrigin.y, layout.poolTotal, 'ДАЮ', 'БЕРУ', '#bd8f6c', 'rgba(54,34,8,0.62)');
    drawColumnFrame(npcOrigin.x, npcOrigin.y, gridTotal, npc.name?.split(' ')[0] ?? 'ТОРГОВЕЦ', `₽${npc.money ?? 0}`, '#7996a4', 'rgba(8,22,50,0.62)');

    // ── Cell grid helper ──
    // A cell knows which basket it belongs to and its slot in it, so the shared
    // pool can mix both sides in one box without a second cursor space: the
    // cursor still stores (side, slot) exactly as the trade code reads it.
    type TradeCell = {
      item?: { defId: string; count: number; data?: unknown };
      side: 'player' | 'player_offer' | 'npc_offer' | 'npc';
      slot: number;
    };
    const cursorSlot = state.tradeCursorY * gridCols + state.tradeCursorX;
    const drawGrid = (cells: readonly TradeCell[], origin: { x: number; y: number }, cols: number) => {
      const gx = origin.x;
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = cells[row * cols + col];
          const side = cell?.side ?? 'player';
          const cx = gx + col * cellSz;
          const cy = origin.y + row * cellSz;
          const selected = cell !== undefined && cell.slot >= 0 && state.tradeSide === side && cursorSlot === cell.slot;

          ctx.fillStyle = selected ? 'rgba(50, 180, 150, 0.15)' : 'rgba(10, 20, 25, 0.25)';
          ctx.fillRect(cx, cy, cellSz - 2, cellSz - 2);
          ctx.strokeStyle = selected ? '#0fa' : '#2a4a4a';
          ctx.lineWidth = selected ? 2 : 1;
          ctx.strokeRect(cx + 0.5, cy + 0.5, cellSz - 3, cellSz - 3);
          ctx.lineWidth = 1;
          
          // VHS Scanlines effect for cell background
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          for (let sl = 0; sl < cellSz - 2; sl += 3) {
            ctx.fillRect(cx, cy + sl, cellSz - 2, 1);
          }

          if (cell?.item) {
            const item = cell.item;
            const priceMode = side === 'npc' || side === 'npc_offer' ? 'buy' : 'sell';
            const price = tradeCellPriceDisplay(state, npc, item.defId, priceMode);
            const questLabel = questItemStateLabel(price.questState);
            const roleLabel = side === 'npc' ? 'ПРОД' : side === 'npc_offer' ? 'БЕР' : side === 'player_offer' ? 'ОТД' : 'ВАШ';
            const staged = side === 'player'
              ? stagedCount(playerOffer, item)
              : side === 'npc'
                ? stagedCount(npcOffer, item)
                : 0;
            ctx.fillStyle = price.scarcityColor;
            ctx.fillRect(cx + 1 * sx, cy + 1 * sy, Math.max(1, 2 * sx), cellSz - 4 * sy);
            ctx.save();
            ctx.beginPath();
            ctx.rect(cx + 2 * sx, cy + 2 * sy, Math.max(1, cellSz - 5 * sx), Math.max(1, cellSz - 5 * sy));
            ctx.clip();
            const padX = Math.max(3, 2.5 * sx);
            const innerW = Math.max(1, cellSz - padX * 2);
            const topY = cy + 5.3 * sy;
            ctx.font = `${Math.max(4, 4.3 * sy)}px "Press Start 2P", monospace`;
            ctx.fillStyle = side === 'npc' || side === 'npc_offer' ? '#7996a4' : '#c2a24c';
            const questW = questLabel ? Math.min(cellSz * 0.42, Math.max(12 * sx, ctx.measureText(questLabel).width + 2 * sx)) : 0;
            ctx.fillText(fitTextStable(ctx, roleLabel, Math.max(1, innerW - questW)), cx + padX, topY);
            if (questLabel) {
              ctx.fillStyle = questItemStateColor(price.questState);
              ctx.textAlign = 'right';
              ctx.fillText(fitTextStable(ctx, questLabel, questW), cx + cellSz - padX, topY);
              ctx.textAlign = 'left';
            }
            drawItemGridIcon(ctx, item.defId, itemInstanceName(item), cx, cy, cellSz, sx, sy, selected, selected ? 1 : 0.84, {
              nameYUnits: 11,
              iconTopUnits: 12.5,
              bottomReserveUnits: 7.6,
            });
            const countText = staged > 0 ? `→${staged}` : item.count > 1 ? `×${item.count}` : '';
            ctx.fillStyle = price.color;
            ctx.font = `${Math.max(4, 4.7 * sy)}px "Press Start 2P", monospace`;
            const countW = countText ? Math.min(cellSz * 0.42, Math.max(11 * sx, ctx.measureText(countText).width + 3 * sx)) : 0;
            const bottomY = cy + cellSz - 3.7 * sy;
            ctx.fillText(fitTextStable(ctx, price.text, Math.max(1, innerW - countW)), cx + padX, bottomY);
            if (countText) {
              ctx.textAlign = 'right';
              ctx.fillStyle = staged > 0 ? '#c2a24c' : '#6e8a72';
              ctx.fillText(fitTextStable(ctx, countText, countW), cx + cellSz - padX, bottomY);
              ctx.textAlign = 'left';
            }
            ctx.restore();
          }
        }
      }
    };

    const inventoryCells = (
      inv: readonly { defId: string; count: number; data?: unknown }[],
      side: 'player' | 'npc',
    ): TradeCell[] => {
      const cells: TradeCell[] = [];
      for (let i = 0; i < gridCols * gridRows; i++) cells.push({ item: inv[i], side, slot: i });
      return cells;
    };
    // Left half of the pool is what you put on the table, right half what you
    // asked for — each half faces the inventory it came from.
    const half = layout.poolHalfCols;
    const poolCells: TradeCell[] = [];
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < layout.poolCols; col++) {
        const mine = col < half;
        const slot = row * half + (col % half);
        const basket = mine ? playerOffer : npcOffer;
        poolCells.push({ item: basket[slot], side: mine ? 'player_offer' : 'npc_offer', slot });
      }
    }

    drawGrid(inventoryCells(plrInv, 'player'), playerOrigin, gridCols);
    drawGrid(poolCells, poolOrigin, layout.poolCols);
    drawGrid(inventoryCells(npcInv, 'npc'), npcOrigin, gridCols);
    // Divider between the two halves of the table — the only thing separating
    // what you give from what you take.
    const dividerW = Math.max(2, 1.5 * sx);
    ctx.fillStyle = 'rgba(150,178,190,0.7)';
    ctx.fillRect(poolOrigin.x + half * cellSz - dividerW * 0.5, poolOrigin.y, dividerW, gridRows * cellSz);

    const canDeal = ((deal.npcOfferCount ?? 0) > 0 || deal.creditCount > 0) && (player.money ?? 0) >= deal.cashDue;
    const dealSelected = state.tradeSide === 'deal';
    ctx.fillStyle = dealSelected ? (canDeal ? 'rgba(38,84,48,0.9)' : 'rgba(96,58,26,0.9)') : 'rgba(20,28,24,0.94)';
    ctx.fillRect(dealX, dealY, dealW, dealH);
    ctx.strokeStyle = dealSelected ? (canDeal ? '#6e9268' : '#b3663f') : '#466';
    ctx.strokeRect(dealX, dealY, dealW, dealH);
    ctx.textAlign = 'center';
    ctx.font = `${7.2 * sy}px "Press Start 2P", monospace`;
    ctx.fillStyle = canDeal ? '#6e9268' : '#b3663f';
    const dealText = canDeal
      ? deal.cashDue > 0
        ? `ОБМЕН · доплата ${deal.cashDue}₽`
        : deal.changeDue > 0
          ? `ОБМЕН · сдача ${deal.changeDue}₽`
          : (deal.npcOfferCount ?? 0) <= 0
            ? 'ОТДАТЬ NPC'
            : 'ОБМЕН'
      : ((deal.npcOfferCount ?? 0) <= 0 && deal.creditCount <= 0)
        ? 'ОБМЕН · выберите предметы'
        : `НЕ ХВАТАЕТ ${deal.cashDue - (player.money ?? 0)}₽`;
    ctx.fillText(fitTextStable(ctx, dealText, dealW - 8 * sx), dealX + dealW / 2, dealY + dealH * 0.62);
    const unpaidSurplus = Math.max(0, deal.surplus - deal.changeDue);
    ctx.textAlign = 'left';

    // ── Info band under the grids: deal summary, selected item, controls ──
    const infoX = info.x + 4 * sx;
    const infoW = info.w - 8 * sx;
    let infoY = dealY + dealH + 10 * sy;
    ctx.textAlign = 'left';
    ctx.fillStyle = deal.changeDue > 0 ? '#6e9268' : unpaidSurplus > 0 ? '#bd8f6c' : '#99a';
    ctx.font = `${6.1 * sy}px "Press Start 2P", monospace`;
    const summaryLine = deal.changeDue > 0
      ? `NPC ${deal.fullPrice}₽ · вы ${deal.creditValue}₽ · сдача ${deal.changeDue}₽${unpaidSurplus > 0 ? ` · без сдачи ${unpaidSurplus}₽` : ''}`
      : unpaidSurplus > 0
        ? `NPC ${deal.fullPrice}₽ · вы ${deal.creditValue}₽ · сдачи нет (${unpaidSurplus}₽)`
      : `NPC ${deal.fullPrice}₽ · вы ${deal.creditValue}₽ · наличными ${deal.cashDue}₽`;
    infoY = drawWrappedText(ctx, summaryLine, infoX, infoY, infoW, 8 * sy, 3) + 8 * sy;

    const curIdx = state.tradeCursorY * gridCols + state.tradeCursorX;
    const curInv = state.tradeSide === 'player'
      ? plrInv
      : state.tradeSide === 'player_offer'
        ? playerOffer
        : state.tradeSide === 'npc_offer'
          ? npcOffer
          : state.tradeSide === 'npc'
            ? npcInv
            : [];
    if (curIdx < curInv.length) {
      const item = curInv[curIdx];
      const def = ITEMS[item.defId];
      if (def) {
        ctx.fillStyle = '#ccc';
        ctx.font = `${7.2 * sy}px "Press Start 2P", monospace`;
        infoY = drawWrappedText(ctx, `${itemInstanceName(item)} ×${item.count}`, infoX, infoY, infoW, 9 * sy, 2) + 3 * sy;
        ctx.fillStyle = '#888';
        ctx.font = `${6.3 * sy}px "Press Start 2P", monospace`;
        infoY = drawWrappedText(ctx, def.desc, infoX, infoY, infoW, 8 * sy, 5) + 5 * sy;
        const priceMode = state.tradeSide === 'npc' || state.tradeSide === 'npc_offer' ? 'buy' : 'sell';
        const price = tradePriceDisplay(state, player, npc, item.defId, priceMode);
        const action = state.tradeSide === 'player_offer'
          ? `${controlBindingLabel('gameMenu')} убрать единицу из того, что отдаете`
          : state.tradeSide === 'npc_offer'
            ? `${controlBindingLabel('gameMenu')} убрать единицу из того, что берете`
            : state.tradeSide === 'npc'
              ? `${controlBindingLabel('gameMenu')} запросить: ${price.line}`
              : `${controlBindingLabel('gameMenu')} предложить: ${price.line}`;
        ctx.fillStyle = price.color;
        infoY = drawWrappedText(ctx, action, infoX, infoY, infoW, 8 * sy, 3) + 2 * sy;
        if (state.tradeSide === 'npc' || state.tradeSide === 'player') {
          ctx.fillStyle = price.scarcityColor;
          infoY = drawWrappedText(ctx, price.detail, infoX, infoY, infoW, 8 * sy, 3);
        }
      }
    } else if (state.tradeSide === 'deal') {
      ctx.fillStyle = canDeal ? '#8f8' : '#f84';
      ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
      drawWrappedText(ctx, canDeal ? `${controlBindingLabel('gameMenu')} подтвердить сделку` : 'Сделка пока невозможна', infoX, infoY, infoW, 9 * sy, 3);
    } else {
      ctx.fillStyle = '#555';
      ctx.font = `${6.2 * sy}px "Press Start 2P", monospace`;
      ctx.fillText('Пусто', infoX, infoY);
    }

    // ── Controls at the foot of the band, right-aligned ──
    ctx.fillStyle = '#555';
    ctx.font = `${5.8 * sy}px "Press Start 2P", monospace`;
    ctx.textAlign = 'right';
    const hintX = info.x + info.w - 4 * sx;
    const hintY = Math.max(infoY + 8 * sy, ch - 26 * sy);
    ctx.fillText(fitTextStable(ctx, `${controlBindingLabel('menuUp')}/${controlBindingLabel('menuDown')} курсор`, infoW), hintX, hintY);
    ctx.fillText(fitTextStable(ctx, `${controlBindingLabel('gameMenu')} положить/убрать/обмен`, infoW), hintX, hintY + 8 * sy);
    ctx.fillText(fitTextStable(ctx, `${menuCloseHint()} назад`, infoW), hintX, hintY + 16 * sy);
    ctx.textAlign = 'left';

  }
}

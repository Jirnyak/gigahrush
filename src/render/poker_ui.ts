/* ── Панель покера ───────────────────────────────────────────────────────────
 *
 * Модуль рисует себя сам и ничего не знает о соседях: свои масти, фигуры, туз,
 * рубашка и рамка карты живут здесь. Общего карточного модуля нет намеренно —
 * инкапсуляция дороже экономии строк, и перекрасить покер нельзя, задев дурака.
 */

import { registerTabletopPanel } from './tabletop_ui';
import type { PokerCard, PokerSnapshot, PokerSuit } from '../systems/poker';
import { controlBindingLabel, controlHint, menuCloseHint } from '../systems/controls';
import { fitText } from './ui_text';
import { clamp, rect, drawBadge } from './ui_utils';

const CARD_ASPECT = 0.70;
const BOARD_SLOTS = 5;

const RANK_LABELS: Record<PokerCard['rank'], string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'В',
  12: 'Д',
  13: 'К',
  14: 'Т',
};

type PixelMask = readonly string[];
type CourtRank = 11 | 12 | 13;



const SUIT_MASKS: Record<PokerSuit, PixelMask> = {
  diamonds: [
    '000010000',
    '000111000',
    '001111100',
    '011111110',
    '111121111',
    '011111110',
    '001111100',
    '000111000',
    '000010000',
  ],
  hearts: [
    '011000110',
    '111101111',
    '111111111',
    '111121111',
    '011111110',
    '001111100',
    '000111000',
    '000010000',
    '000000000',
  ],
  clubs: [
    '000111000',
    '001111100',
    '001121100',
    '110111011',
    '111111111',
    '011121110',
    '000111000',
    '000121000',
    '001111100',
  ],
  spades: [
    '000010000',
    '000111000',
    '001121100',
    '011111110',
    '111111111',
    '011121110',
    '001111100',
    '000121000',
    '001111100',
  ],
};

const COURT_MASKS: Record<CourtRank, PixelMask> = {
  11: [
    '002222000',
    '022222200',
    '001110000',
    '011111000',
    '001110000',
    '011111100',
    '111121110',
    '001121000',
    '001211000',
    '011110000',
    '111011000',
    '110001100',
    '100000110',
  ],
  12: [
    '000202000',
    '002222200',
    '022222220',
    '001111100',
    '001010100',
    '001111100',
    '000111000',
    '011111110',
    '111121111',
    '011111110',
    '001101100',
    '011000110',
    '110000011',
  ],
  13: [
    '202222202',
    '022222220',
    '002222200',
    '000111000',
    '001111100',
    '001010100',
    '001111100',
    '000121000',
    '011111110',
    '111121111',
    '111111111',
    '001111100',
    '110111011',
    '100000001',
  ],
};

const ACE_MASK: PixelMask = [
  '000020000',
  '000202000',
  '002000200',
  '020000020',
  '200000002',
  '020000020',
  '002000200',
  '000202000',
  '000020000',
];

const SUIT_STYLES: Record<PokerSuit, { primary: string; accent: string; outline: string }> = {
  diamonds: { primary: '#9c302d', accent: '#c8513e', outline: '#6d211d' },
  hearts: { primary: '#9a2e2f', accent: '#c84b48', outline: '#68201f' },
  clubs: { primary: '#111914', accent: '#365541', outline: '#050807' },
  spades: { primary: '#111622', accent: '#33435d', outline: '#05070c' },
};

function maskWidth(mask: PixelMask): number {
  let width = 0;
  for (const row of mask) width = Math.max(width, row.length);
  return width;
}

function drawPixelMask(
  ctx: CanvasRenderingContext2D,
  mask: PixelMask,
  x: number,
  y: number,
  cell: number,
  colors: { primary: string; accent: string; outline?: string },
): void {
  const c = Math.max(1, Math.round(cell));
  const px = Math.round(x);
  const py = Math.round(y);
  if (colors.outline && c > 1) {
    ctx.fillStyle = colors.outline;
    for (let row = 0; row < mask.length; row++) {
      for (let col = 0; col < mask[row].length; col++) {
        const ch = mask[row][col];
        if (ch === '1' || ch === '2') ctx.fillRect(px + col * c - 1, py + row * c - 1, c + 2, c + 2);
      }
    }
  }
  for (let row = 0; row < mask.length; row++) {
    for (let col = 0; col < mask[row].length; col++) {
      const ch = mask[row][col];
      if (ch !== '1' && ch !== '2') continue;
      ctx.fillStyle = ch === '2' ? colors.accent : colors.primary;
      ctx.fillRect(px + col * c, py + row * c, c, c);
    }
  }
}

function suitStyle(suit: PokerSuit): { primary: string; accent: string; outline: string } {
  return SUIT_STYLES[suit];
}

function drawPixelSuit(ctx: CanvasRenderingContext2D, suit: PokerSuit, x: number, y: number, cell: number): void {
  drawPixelMask(ctx, SUIT_MASKS[suit], x, y, cell, suitStyle(suit));
}

function drawCourtIcon(ctx: CanvasRenderingContext2D, card: PokerCard, x: number, y: number, w: number, h: number): void {
  const rank = card.rank as CourtRank;
  const mask = COURT_MASKS[rank];
  const c = Math.max(2, Math.floor(Math.min(w * 0.52 / maskWidth(mask), h * 0.46 / mask.length)));
  const mx = x + w * 0.5 - maskWidth(mask) * c * 0.5;
  const my = y + h * 0.46 - mask.length * c * 0.5;
  drawPixelMask(ctx, mask, mx, my, c, { primary: '#1b211f', accent: '#a88a4b', outline: '#6d654f' });
  const suitCell = Math.max(1, Math.round(c * 0.64));
  drawPixelSuit(ctx, card.suit, x + w * 0.5 - maskWidth(SUIT_MASKS[card.suit]) * suitCell * 0.5, y + h * 0.72 - SUIT_MASKS[card.suit].length * suitCell * 0.5, suitCell);
}

function drawAceIcon(ctx: CanvasRenderingContext2D, card: PokerCard, x: number, y: number, w: number, h: number): void {
  const c = Math.max(2, Math.floor(Math.min(w * 0.60 / maskWidth(ACE_MASK), h * 0.46 / ACE_MASK.length)));
  const mx = x + w * 0.5 - maskWidth(ACE_MASK) * c * 0.5;
  const my = y + h * 0.48 - ACE_MASK.length * c * 0.5;
  drawPixelMask(ctx, ACE_MASK, mx, my, c, { primary: '#6f634e', accent: '#b79851', outline: '#6d654f' });
  const suitCell = Math.max(2, Math.floor(Math.min(w * 0.30 / maskWidth(SUIT_MASKS[card.suit]), h * 0.24 / SUIT_MASKS[card.suit].length)));
  drawPixelSuit(ctx, card.suit, x + w * 0.5 - maskWidth(SUIT_MASKS[card.suit]) * suitCell * 0.5, y + h * 0.48 - SUIT_MASKS[card.suit].length * suitCell * 0.5, suitCell);
}

function drawLargeSuit(ctx: CanvasRenderingContext2D, card: PokerCard, x: number, y: number, w: number, h: number): void {
  const cell = Math.max(2, Math.round(h * 0.034));
  drawPixelSuit(ctx, card.suit, x + w * 0.5 - maskWidth(SUIT_MASKS[card.suit]) * cell * 0.5, y + h * 0.50 - SUIT_MASKS[card.suit].length * cell * 0.5, cell);
}

function drawCardCenter(ctx: CanvasRenderingContext2D, card: PokerCard, x: number, y: number, w: number, h: number, s: number): void {
  if (h < 42 * s) {
    drawLargeSuit(ctx, card, x, y, w, h);
    return;
  }
  if (card.rank >= 11 && card.rank <= 13) {
    drawCourtIcon(ctx, card, x, y, w, h);
    return;
  }
  if (card.rank === 14) {
    drawAceIcon(ctx, card, x, y, w, h);
    return;
  }
  drawLargeSuit(ctx, card, x, y, w, h);
}

function drawCardBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  rect(ctx, x, y, w, h, '#111817', '#55615a');
  rect(ctx, x + 2 * s, y + 2 * s, w - 4 * s, h - 4 * s, '#182321', '#2f403b');

  ctx.fillStyle = '#61736b';
  const step = Math.max(3, Math.round(4 * s));
  const left = Math.round(x + 5 * s);
  const top = Math.round(y + 5 * s);
  const right = Math.round(x + w - 5 * s);
  const bottom = Math.round(y + h - 5 * s);
  for (let yy = top; yy < bottom; yy += step) ctx.fillRect(left, yy, Math.max(1, right - left), 1);
  for (let xx = left; xx < right; xx += step) ctx.fillRect(xx, top, 1, Math.max(1, bottom - top));

  ctx.fillStyle = '#b79851';
  ctx.font = `bold ${Math.max(6, Math.round(h * 0.16))}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ГХ', Math.round(x + w * 0.5), Math.round(y + h * 0.52));
  ctx.restore();
}

function drawCardSlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number): void {
  rect(ctx, x, y, w, h, 'rgba(7,10,10,0.58)', '#353b39');
  const tick = Math.max(2, Math.round(3 * s));
  ctx.fillStyle = '#59615a';
  const ix = Math.round(x + 4 * s);
  const iy = Math.round(y + 4 * s);
  const iw = Math.max(0, Math.round(w - 8 * s));
  const ih = Math.max(0, Math.round(h - 8 * s));
  for (let xx = ix; xx < ix + iw; xx += tick * 2) {
    ctx.fillRect(xx, iy, tick, 1);
    ctx.fillRect(xx, iy + ih, tick, 1);
  }
  for (let yy = iy; yy < iy + ih; yy += tick * 2) {
    ctx.fillRect(ix, yy, 1, tick);
    ctx.fillRect(ix + iw, yy, 1, tick);
  }
}

function drawPlayingCard(
  ctx: CanvasRenderingContext2D,
  card: PokerCard,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  options: { selected?: boolean; playable?: boolean; dimmed?: boolean; trump?: boolean } = {},
): void {
  ctx.save();
  ctx.globalAlpha *= options.dimmed ? 0.66 : 1;
  const border = options.selected ? '#d6b15d' : options.playable ? '#6fbf7d' : options.trump ? '#a88639' : '#2f2b22';
  rect(ctx, x, y, w, h, '#c7bea1', border);
  rect(ctx, x + 2 * s, y + 2 * s, w - 4 * s, h - 4 * s, '#d2c8aa', '#8b826d');

  const style = suitStyle(card.suit);
  const rank = RANK_LABELS[card.rank];
  const font = Math.max(7, Math.round(h * 0.15));
  ctx.fillStyle = style.primary;
  ctx.font = `bold ${font}px "Press Start 2P", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(rank, Math.round(x + 5 * s), Math.round(y + 4 * s));

  const cornerCell = Math.max(1, Math.round(h * 0.017));
  const cornerW = maskWidth(SUIT_MASKS[card.suit]) * cornerCell;
  const cornerH = SUIT_MASKS[card.suit].length * cornerCell;
  drawPixelSuit(ctx, card.suit, x + 5 * s, y + 6 * s + font, cornerCell);
  drawCardCenter(ctx, card, x, y, w, h, s);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(rank, Math.round(x + w - 5 * s), Math.round(y + h - 4 * s));
  drawPixelSuit(ctx, card.suit, x + w - 5 * s - cornerW, y + h - 6 * s - font - cornerH, cornerCell);

  if (options.selected) {
    const b = Math.max(2, Math.round(2 * s));
    const len = Math.max(8 * s, Math.min(w, h) * 0.22);
    rect(ctx, x - b, y - b, len, b, '#d6b15d');
    rect(ctx, x - b, y - b, b, len, '#d6b15d');
    rect(ctx, x + w - len + b, y - b, len, b, '#d6b15d');
    rect(ctx, x + w, y - b, b, len, '#d6b15d');
    rect(ctx, x - b, y + h, len, b, '#d6b15d');
    rect(ctx, x - b, y + h - len + b, b, len, '#d6b15d');
    rect(ctx, x + w - len + b, y + h, len, b, '#d6b15d');
    rect(ctx, x + w, y + h - len + b, b, len, '#d6b15d');
  }
  if (options.playable && !options.selected) {
    rect(ctx, x + 2 * s, y + 2 * s, 7 * s, 2 * s, '#b79851');
    rect(ctx, x + 2 * s, y + 2 * s, 2 * s, 7 * s, '#b79851');
  }
  ctx.restore();
}

function drawHoleRow(
  ctx: CanvasRenderingContext2D,
  cards: readonly PokerCard[],
  hiddenCount: number,
  x: number,
  y: number,
  w: number,
  cardW: number,
  cardH: number,
  s: number,
): void {
  const count = Math.max(cards.length, hiddenCount);
  const gap = 4 * s;
  const totalW = count * cardW + gap * Math.max(0, count - 1);
  const startX = x + (w - totalW) * 0.5;
  for (let i = 0; i < count; i++) {
    const cx = startX + i * (cardW + gap);
    const card = cards[i];
    if (card) drawPlayingCard(ctx, card, cx, y, cardW, cardH, s);
    else drawCardBack(ctx, cx, y, cardW, cardH, s, 0.96);
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, snapshot: PokerSnapshot, x: number, y: number, w: number, h: number, s: number): void {
  rect(ctx, x, y, w, h, 'rgba(6,9,9,0.62)', '#343c38');
  drawBadge(ctx, `БАНК ${snapshot.potRubles}Р`, x + 5 * s, y + 4 * s, 78 * s, 13 * s, s, '#d1aa54');
  drawBadge(ctx, snapshot.streetLabel, x + w - 5 * s - 70 * s, y + 4 * s, 70 * s, 13 * s, s, '#8ca7a1');

  const gap = 5 * s;
  const areaY = y + 22 * s;
  const areaH = Math.max(1, h - 28 * s);
  let cardH = Math.min(52 * s, areaH);
  let cardW = cardH * CARD_ASPECT;
  const maxCardW = (w - 10 * s - gap * (BOARD_SLOTS - 1)) / BOARD_SLOTS;
  if (cardW > maxCardW) {
    cardW = maxCardW;
    cardH = cardW / CARD_ASPECT;
  }
  const totalW = cardW * BOARD_SLOTS + gap * (BOARD_SLOTS - 1);
  const startX = x + (w - totalW) * 0.5;
  const startY = areaY + Math.max(0, (areaH - cardH) * 0.4);
  for (let i = 0; i < BOARD_SLOTS; i++) {
    const cx = startX + i * (cardW + gap);
    const card = snapshot.board[i];
    if (card) drawPlayingCard(ctx, card, cx, startY, cardW, cardH, s);
    else drawCardSlot(ctx, cx, startY, cardW, cardH, s);
  }
}

function drawActionRow(ctx: CanvasRenderingContext2D, snapshot: PokerSnapshot, x: number, y: number, w: number, h: number, s: number): void {
  const actions = snapshot.actions;
  if (actions.length <= 0) {
    drawBadge(ctx, snapshot.finished ? 'РАЗДАЧА ЗАКРЫТА' : 'ХОДИТ СОПЕРНИК', x + w * 0.25, y, w * 0.5, h, s, '#737a75');
    return;
  }
  const gap = 5 * s;
  const bw = (w - gap * (actions.length - 1)) / actions.length;
  for (let i = 0; i < actions.length; i++) {
    const bx = x + i * (bw + gap);
    const selected = i === snapshot.selectedIndex;
    rect(ctx, bx, y, bw, h, selected ? '#16201d' : '#0a0f0f', selected ? '#d6b15d' : '#303936');
    ctx.fillStyle = selected ? '#d8cba0' : '#8d9690';
    ctx.font = `${Math.max(7, Math.round(h * 0.42))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, actions[i].label, bw - 6 * s), Math.round(bx + bw * 0.5), Math.round(y + h * 0.54));
  }
}

function outcomeLine(snapshot: PokerSnapshot): string {
  if (!snapshot.finished) return snapshot.yourTurn ? 'ВАШ ХОД' : 'ЖДЕМ СОПЕРНИКА';
  if (snapshot.winner === 'draw') return 'НИЧЬЯ';
  return snapshot.winner === 'player' ? 'ВЫИГРЫШ' : 'ПРОИГРЫШ';
}

export function drawPokerInterface(
  ctx: CanvasRenderingContext2D,
  snapshot: PokerSnapshot,
  px: number,
  py: number,
  pw: number,
  ph: number,
  sx: number,
  sy: number,
  _time: number,
): void {
  const s = Math.max(0.75, Math.min(2.5, Math.min(sx, sy)));
  const pad = 8 * s;
  const headerY = py + 36 * sy;
  const controlsY = py + ph - 17 * sy;
  const actionH = 16 * sy;
  const actionY = controlsY - actionH - 8 * sy;
  const handCardH = clamp(ph * 0.16, 30 * sy, 54 * sy);
  const handCardW = handCardH * CARD_ASPECT;
  const handY = actionY - handCardH - 20 * sy;
  const topCardH = clamp(handCardH * 0.72, 24 * sy, 42 * sy);
  const topCardW = topCardH * CARD_ASPECT;
  const topY = headerY + 25 * sy;
  const boardY = topY + topCardH + 20 * sy;
  const boardH = Math.max(1, handY - boardY - 18 * sy);
  const innerX = px + pad;
  const innerW = pw - pad * 2;

  ctx.save();
  rect(ctx, px + 4 * sx, py + 32 * sy, pw - 8 * sx, ph - 43 * sy, 'rgba(2,5,5,0.74)', '#27312f');

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#d1aa54';
  ctx.font = `bold ${10 * sy}px "Press Start 2P", monospace`;
  ctx.fillText(fitText(ctx, 'ПОКЕР', pw * 0.22), innerX, headerY);

  ctx.fillStyle = '#8d9690';
  ctx.font = `${7.2 * sy}px "Press Start 2P", monospace`;
  const meta = `АНТЕ ${snapshot.stakeRubles}Р | БАНК ${snapshot.potRubles}Р | ${outcomeLine(snapshot)}`;
  ctx.fillText(fitText(ctx, meta, innerW), innerX, headerY + 13 * sy);

  drawHoleRow(ctx, snapshot.npcHand, snapshot.npcHandCount, innerX, topY, innerW, topCardW, topCardH, s);
  drawBadge(ctx, fitText(ctx, `${snapshot.npcName}: ВНЕС ${snapshot.npcPaid}Р`, innerW - 8 * s), innerX, topY + topCardH + 3 * s, innerW, 13 * s, s, '#8ca7a1');

  drawBoard(ctx, snapshot, innerX, boardY, innerW, boardH, s);
  drawHoleRow(ctx, snapshot.playerHand, snapshot.playerHand.length, innerX, handY, innerW, handCardW, handCardH, s);

  const status = snapshot.message || snapshot.log[snapshot.log.length - 1] || outcomeLine(snapshot);
  const handLine = snapshot.handLabel ? `${snapshot.handLabel.toUpperCase()} | ` : '';
  drawBadge(ctx, fitText(ctx, `${handLine}${status.toUpperCase()}`, innerW - 8 * s), innerX, handY - 17 * sy, innerW, 15 * sy, s, '#c4cdc7');
  drawActionRow(ctx, snapshot, innerX, actionY, innerW, actionH, s);

  const action = snapshot.finished
    ? `${controlHint('gameMenu')} ЗАКРЫТЬ  ${menuCloseHint()} ВЫЙТИ`
    : `${controlBindingLabel('menuLeft')}/${controlBindingLabel('menuRight')} ВЫБОР  ${controlHint('gameMenu')} ХОД  ${controlBindingLabel('drop')} ПАС  ${menuCloseHint()} СДАТЬСЯ`;
  ctx.fillStyle = '#59615d';
  ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, action, innerW), Math.round(px + pw * 0.5), controlsY);
  ctx.restore();
}

registerTabletopPanel('poker', drawPokerInterface as never);

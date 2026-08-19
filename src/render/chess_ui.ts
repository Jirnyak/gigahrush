/* ── Панель шахмат ───────────────────────────────────────────────────────────
 *
 * Рисующая половина игры `chess`; правила живут в `systems/chess.ts` под тем же
 * id. Фигуры — восьмипиксельные маски: доска в панели маленькая, и силуэт из
 * крупных квадратов читается лучше любой векторной резьбы.
 */

import { registerTabletopPanel } from './tabletop_ui';
import type { ChessPieceKind, ChessSnapshot } from '../systems/chess';
import { controlBindingLabel, controlHint, menuCloseHint } from '../systems/controls';
import { fitText } from './ui_text';
import { rect, drawBadge } from './ui_utils';

const PIECE_MASKS: Record<ChessPieceKind, readonly string[]> = {
  pawn: [
    '........',
    '..####..',
    '..####..',
    '...##...',
    '..####..',
    '.######.',
    '########',
    '........',
  ],
  knight: [
    '..####..',
    '.######.',
    '.##.####',
    '.#######',
    '...#####',
    '..#####.',
    '.######.',
    '########',
  ],
  bishop: [
    '...##...',
    '..####..',
    '..#..#..',
    '..####..',
    '...##...',
    '..####..',
    '.######.',
    '########',
  ],
  rook: [
    '.#.##.#.',
    '.######.',
    '..####..',
    '..####..',
    '..####..',
    '..####..',
    '.######.',
    '########',
  ],
  queen: [
    '#.#..#.#',
    '########',
    '.######.',
    '..####..',
    '..####..',
    '.######.',
    '.######.',
    '########',
  ],
  king: [
    '...##...',
    '.######.',
    '...##...',
    '.######.',
    '########',
    '.######.',
    '.######.',
    '########',
  ],
};

const LIGHT_CELL = '#3a4441';
const DARK_CELL = '#27312f';
const PLAYER_FILL = '#d6b15d';
const PLAYER_EDGE = '#8b826d';
const NPC_FILL = '#8d9690';
const NPC_EDGE = '#4a5350';

function resultText(snapshot: ChessSnapshot): string {
  if (snapshot.phase !== 'finished') {
    return snapshot.phase === 'player_turn' ? 'ВАШ ХОД' : 'ХОД ПРОТИВНИКА';
  }
  if (snapshot.winner === 'draw') return 'НИЧЬЯ';
  return snapshot.winner === 'player' ? 'ВЫИГРЫШ' : 'ПРОИГРЫШ';
}

function drawPieceMask(
  ctx: CanvasRenderingContext2D,
  kind: ChessPieceKind,
  side: 'player' | 'npc',
  left: number,
  top: number,
  size: number,
): void {
  const unit = Math.max(1, Math.round(size / 8));
  const originX = Math.round(left + (size - unit * 8) / 2);
  const originY = Math.round(top + (size - unit * 8) / 2);
  const mask = PIECE_MASKS[kind];
  const fill = side === 'player' ? PLAYER_FILL : NPC_FILL;
  const edge = side === 'player' ? PLAYER_EDGE : NPC_EDGE;
  // Тень тем же трафаретом со сдвигом: контур без обводки, силуэт не плывёт.
  // Строка кладётся сплошными отрезками — на доске из 32 фигур это втрое
  // меньше вызовов заливки за кадр.
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? edge : fill;
    const shift = pass === 0 ? Math.max(1, Math.round(unit * 0.35)) : 0;
    for (let row = 0; row < 8; row++) {
      const line = mask[row];
      let runStart = -1;
      for (let col = 0; col <= 8; col++) {
        const filled = col < 8 && line[col] === '#';
        if (filled && runStart < 0) runStart = col;
        if (!filled && runStart >= 0) {
          ctx.fillRect(originX + runStart * unit + shift, originY + row * unit + shift, (col - runStart) * unit, unit);
          runStart = -1;
        }
      }
    }
  }
}

function drawSquareHints(
  ctx: CanvasRenderingContext2D,
  snapshot: ChessSnapshot,
  sq: number,
  cellX: number,
  cellY: number,
  cell: number,
): void {
  if (sq === snapshot.lastFrom || sq === snapshot.lastTo) {
    rect(ctx, cellX, cellY, cell, cell, 'rgba(140,170,155,0.12)');
  }
  if (sq === snapshot.checkSquare) {
    rect(ctx, cellX, cellY, cell, cell, 'rgba(150,60,50,0.42)', '#8c443a');
  }
  if (sq === snapshot.selectedSquare) {
    rect(ctx, cellX, cellY, cell, cell, 'rgba(214,177,93,0.26)', '#d6b15d');
  }
  if (snapshot.moveTargets.includes(sq)) {
    const dot = Math.max(2, Math.round(cell * 0.18));
    rect(ctx, cellX + (cell - dot) / 2, cellY + (cell - dot) / 2, dot, dot, '#7fa88c');
  }
  if (snapshot.captureTargets.includes(sq)) {
    rect(ctx, cellX + 1, cellY + 1, cell - 2, cell - 2, 'rgba(170,90,60,0.20)', '#b0704a');
  }
}

function drawBoardLabels(
  ctx: CanvasRenderingContext2D,
  snapshot: ChessSnapshot,
  boardX: number,
  boardY: number,
  boardSize: number,
  cell: number,
  sy: number,
): void {
  ctx.fillStyle = '#59615d';
  ctx.font = `${5.4 * sy}px "Press Start 2P", monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const files = snapshot.mirrored ? 'hgfedcba' : 'abcdefgh';
  for (let x = 0; x < 8; x++) {
    ctx.fillText(files[x], Math.round(boardX + x * cell + cell / 2), Math.round(boardY + boardSize + 2 * sy));
  }
  ctx.textAlign = 'right';
  for (let y = 0; y < 8; y++) {
    const rank = snapshot.mirrored ? y + 1 : 8 - y;
    ctx.fillText(String(rank), Math.round(boardX - 2 * sy), Math.round(boardY + y * cell + cell * 0.35));
  }
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  snapshot: ChessSnapshot,
  boardX: number,
  boardY: number,
  boardSize: number,
): void {
  const cell = boardSize / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const cellX = boardX + x * cell;
      const cellY = boardY + y * cell;
      rect(ctx, cellX, cellY, cell, cell, (x + y) % 2 === 1 ? DARK_CELL : LIGHT_CELL);
      drawSquareHints(ctx, snapshot, y * 8 + x, cellX, cellY, cell);
      if (snapshot.phase !== 'finished' && snapshot.cursorX === x && snapshot.cursorY === y) {
        rect(ctx, cellX, cellY, cell, cell, 'rgba(214,177,93,0.16)', '#d6b15d');
      }
    }
  }
  for (const piece of snapshot.pieces) {
    drawPieceMask(ctx, piece.kind, piece.side, boardX + piece.x * cell, boardY + piece.y * cell, cell);
  }
}

export function drawChessInterface(
  ctx: CanvasRenderingContext2D,
  snapshot: ChessSnapshot,
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

  ctx.save();
  rect(ctx, px + 4 * sx, py + 32 * sy, pw - 8 * sx, ph - 43 * sy, 'rgba(2,5,5,0.74)', '#27312f');

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#d1aa54';
  ctx.font = `bold ${10 * sy}px "Press Start 2P", monospace`;
  ctx.fillText(fitText(ctx, 'ШАХМАТЫ', pw * 0.3), px + pad, headerY);

  ctx.fillStyle = '#8d9690';
  ctx.font = `${7.2 * sy}px "Press Start 2P", monospace`;
  const turn = snapshot.phase === 'npc_turn'
    ? `${snapshot.npcName} ДУМАЕТ`
    : snapshot.phase === 'finished' ? resultText(snapshot) : 'ВАШ ХОД';
  ctx.fillText(fitText(ctx, `СТАВКА ${snapshot.stakeRubles}Р | ${turn}`, pw - pad * 2), px + pad, headerY + 13 * sy);

  const boardSize = Math.max(64, Math.min(pw - pad * 2 - 10 * sy, ph - 120 * sy));
  const boardX = px + (pw - boardSize) / 2;
  const boardY = headerY + 30 * sy;
  rect(ctx, boardX - 2, boardY - 2, boardSize + 4, boardSize + 4, '#1c2422', '#343c38');
  drawBoard(ctx, snapshot, boardX, boardY, boardSize);
  drawBoardLabels(ctx, snapshot, boardX, boardY, boardSize, boardSize / 8, sy);

  const statusY = boardY + boardSize + 10 * sy;
  const status = snapshot.message || snapshot.log[snapshot.log.length - 1] || resultText(snapshot);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawBadge(ctx, fitText(ctx, status.toUpperCase(), pw - pad * 2 - 8 * s), px + pad, statusY, pw - pad * 2, 16 * sy, s, '#c4cdc7');

  const action = snapshot.phase === 'finished'
    ? `${controlHint('gameMenu')} ЗАКРЫТЬ  ${menuCloseHint()} ВЫЙТИ`
    : `${controlHint('gameMenu')} ВЫБРАТЬ/ХОДИТЬ  ${controlBindingLabel('drop')} ОТМЕНА  ${menuCloseHint()} СДАТЬСЯ`;
  ctx.fillStyle = '#59615d';
  ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(fitText(ctx, action, pw - pad * 2), Math.round(px + pw * 0.5), controlsY);
  ctx.restore();
}

registerTabletopPanel('chess', drawChessInterface as never);

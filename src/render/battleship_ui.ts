import { registerTabletopPanel } from './tabletop_ui';
import {
  BATTLESHIP_BOARD_SIZE,
  BATTLESHIP_CELL,
  BATTLESHIP_COLUMNS,
  BATTLESHIP_FLEET_SIZES,
  type BattleshipSnapshot,
} from '../systems/battleship';
import { controlHint, menuCloseHint } from '../systems/controls';
import { fitText } from './ui_text';
import { rect, drawBadge } from './ui_utils';

const SIZE = BATTLESHIP_BOARD_SIZE;
const FLEET_COUNT = BATTLESHIP_FLEET_SIZES.length;

function resultText(snapshot: BattleshipSnapshot): string {
  if (snapshot.phase !== 'finished') return snapshot.yourTurn ? 'ВАШ ЗАЛП' : 'ЗАЛП ПРОТИВНИКА';
  if (snapshot.winner === 'player') return 'ВЫИГРЫШ';
  if (snapshot.winner === 'npc') return 'ПРОИГРЫШ';
  return 'ПАРТИЯ ОКОНЧЕНА';
}

/** Перекрестие поверх клетки: попадание карандашом крестят, убитый — жирнее. */
function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, width: number): void {
  const inset = size * 0.22;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(x + size - inset, y + size - inset);
  ctx.moveTo(x + size - inset, y + inset);
  ctx.lineTo(x + inset, y + size - inset);
  ctx.stroke();
}

function drawCell(ctx: CanvasRenderingContext2D, code: number, x: number, y: number, size: number): void {
  rect(ctx, x, y, size, size, '#101817', '#25322f');
  if (code === BATTLESHIP_CELL.SHIP) {
    rect(ctx, x + size * 0.16, y + size * 0.16, size * 0.68, size * 0.68, '#5d6763', '#8d9690');
    return;
  }
  if (code === BATTLESHIP_CELL.MISS) {
    ctx.fillStyle = '#4b5450';
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.5, Math.max(1, size * 0.13), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (code === BATTLESHIP_CELL.HIT) drawCross(ctx, x, y, size, '#b45a42', Math.max(1, size * 0.12));
  else if (code === BATTLESHIP_CELL.SUNK) {
    rect(ctx, x, y, size, size, 'rgba(120,45,32,0.34)');
    drawCross(ctx, x, y, size, '#c2664a', Math.max(1.5, size * 0.18));
  }
}

interface BoardLayout {
  x: number;
  y: number;
  cell: number;
  label: number;
}

/** Поле с подписями по краям: буквы сверху, цифры слева, как в тетради. */
function drawBoard(
  ctx: CanvasRenderingContext2D,
  cells: readonly number[],
  layout: BoardLayout,
  title: string,
  cursor: { x: number; y: number } | null,
  s: number,
): void {
  const { x: bx, y: by, cell, label } = layout;
  const gridX = bx + label;
  const gridY = by + label;

  ctx.font = `${Math.max(5, Math.round(cell * 0.5))}px "Press Start 2P", monospace`;
  ctx.fillStyle = '#8d9690';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < SIZE; i++) {
    ctx.fillText(BATTLESHIP_COLUMNS[i], Math.round(gridX + i * cell + cell * 0.5), Math.round(by + label * 0.5));
    ctx.fillText(String(i + 1), Math.round(bx + label * 0.5), Math.round(gridY + i * cell + cell * 0.5));
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      drawCell(ctx, cells[y * SIZE + x] ?? 0, gridX + x * cell, gridY + y * cell, cell);
    }
  }
  if (cursor) {
    rect(ctx, gridX + cursor.x * cell, gridY + cursor.y * cell, cell, cell, 'rgba(209,170,84,0.18)', '#d1aa54');
  }

  ctx.font = `${7 * s}px "Press Start 2P", monospace`;
  ctx.fillStyle = '#59615d';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, title, label + SIZE * cell), Math.round(bx), Math.round(gridY + SIZE * cell + 4 * s));
}

export function drawBattleshipInterface(
  ctx: CanvasRenderingContext2D,
  snapshot: BattleshipSnapshot,
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
  ctx.fillText(fitText(ctx, 'МОРСКОЙ БОЙ', pw * 0.42), px + pad, headerY);

  ctx.fillStyle = '#8d9690';
  ctx.font = `${7.2 * sy}px "Press Start 2P", monospace`;
  const turn = snapshot.phase === 'finished'
    ? resultText(snapshot)
    : snapshot.yourTurn ? 'ВАШ ЗАЛП' : `${snapshot.npcName} ЦЕЛИТСЯ`;
  ctx.fillText(fitText(ctx, `СТАВКА ${snapshot.stakeRubles}Р | ${turn}`, pw - pad * 2), px + pad, headerY + 13 * sy);

  const boardTop = headerY + 28 * sy;
  const statusY = controlsY - 22 * sy;
  const gap = 10 * s;
  const availW = pw - pad * 2;
  const availH = statusY - boardTop - 12 * s;
  const cell = Math.max(4, Math.floor(Math.min((availW - gap) / (SIZE * 2 + 2.4), (availH - 10 * s) / (SIZE + 1.2))));
  const label = Math.round(cell * 1.2);
  const boardW = label + SIZE * cell;
  const leftX = px + (pw - (boardW * 2 + gap)) / 2;

  drawBoard(ctx, snapshot.own, { x: leftX, y: boardTop, cell, label },
    `СВОЕ ПОЛЕ  ПОТЕРЯНО ${snapshot.ownSunk}/${FLEET_COUNT}`, null, s);
  drawBoard(ctx, snapshot.enemy, { x: leftX + boardW + gap, y: boardTop, cell, label },
    `${snapshot.npcName}  УБИТО ${snapshot.enemySunk}/${FLEET_COUNT}`,
    snapshot.phase === 'finished' ? null : { x: snapshot.cursorX, y: snapshot.cursorY }, s);

  const status = snapshot.message || snapshot.log[snapshot.log.length - 1] || resultText(snapshot);
  drawBadge(ctx, fitText(ctx, status.toUpperCase(), pw - pad * 2 - 8 * s), px + pad, statusY, pw - pad * 2, 16 * sy, s, '#c4cdc7');

  const action = snapshot.phase === 'finished'
    ? `${controlHint('gameMenu')} ЗАКРЫТЬ  ${menuCloseHint()} ВЫЙТИ`
    : `${controlHint('gameMenu')} ЗАЛП  ${menuCloseHint()} СДАТЬСЯ`;
  ctx.fillStyle = '#59615d';
  ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, action, pw - pad * 2), Math.round(px + pw * 0.5), controlsY);
  ctx.restore();
}

registerTabletopPanel('battleship', drawBattleshipInterface as never);

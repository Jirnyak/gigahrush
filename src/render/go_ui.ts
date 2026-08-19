/* ── Панель го ───────────────────────────────────────────────────────────────
 *
 * Камни стоят НА пересечениях линий, поэтому сетка рисуется с полуклеточным
 * полем: крайние линии отступают от рамки, а камень садится в узел.
 */

import { registerTabletopPanel } from './tabletop_ui';
import { GO_BLACK, GO_EMPTY, GO_SIZE, GO_WHITE, goIndex, type GoSnapshot } from '../systems/go';
import { controlBindingLabel, controlHint, menuCloseHint } from '../systems/controls';
import { fitText } from './ui_text';
import { rect, drawBadge } from './ui_utils';

/** Хоси на 9×9: четыре угловых и центр (тэнгэн). */
const STAR_POINTS: readonly (readonly [number, number])[] = [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];

function resultText(snapshot: GoSnapshot): string {
  if (snapshot.phase !== 'finished') return snapshot.phase === 'player_turn' ? 'ВАШ ХОД' : 'ХОД ПРОТИВНИКА';
  if (!snapshot.winner) return 'ПАРТИЯ ОКОНЧЕНА';
  return snapshot.winner === 'player' ? 'ВЫИГРЫШ' : 'ПРОИГРЫШ';
}

function stoneColors(stone: number): { fill: string; stroke: string; gloss: string } {
  return stone === GO_BLACK
    ? { fill: '#15191a', stroke: '#404a47', gloss: '#2d3634' }
    : { fill: '#c2cbc4', stroke: '#767f79', gloss: '#e2e8e3' };
}

function drawStone(ctx: CanvasRenderingContext2D, stone: number, cx: number, cy: number, radius: number): void {
  const c = stoneColors(stone);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = c.fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.stroke;
  ctx.stroke();
  // Скупой блик сверху-слева: камень читается как объём без всякого неона.
  ctx.beginPath();
  ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = c.gloss;
  ctx.fill();
}

function drawGoBoard(
  ctx: CanvasRenderingContext2D,
  snapshot: GoSnapshot,
  bx: number,
  by: number,
  size: number,
): void {
  rect(ctx, bx - 2, by - 2, size + 4, size + 4, '#2a2620', '#3d3830');
  rect(ctx, bx, by, size, size, '#3a352c');

  const step = size / GO_SIZE;
  const origin = step * 0.5;
  const nodeX = (x: number) => bx + origin + x * step;
  const nodeY = (y: number) => by + origin + y * step;

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#211e19';
  ctx.beginPath();
  for (let i = 0; i < GO_SIZE; i++) {
    const p = Math.round(nodeX(i)) + 0.5;
    const q = Math.round(nodeY(i)) + 0.5;
    ctx.moveTo(Math.round(nodeX(0)) + 0.5, q);
    ctx.lineTo(Math.round(nodeX(GO_SIZE - 1)) + 0.5, q);
    ctx.moveTo(p, Math.round(nodeY(0)) + 0.5);
    ctx.lineTo(p, Math.round(nodeY(GO_SIZE - 1)) + 0.5);
  }
  ctx.stroke();

  ctx.fillStyle = '#211e19';
  for (const [x, y] of STAR_POINTS) {
    ctx.beginPath();
    ctx.arc(nodeX(x), nodeY(y), Math.max(1.2, step * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  const radius = step * 0.44;
  for (let y = 0; y < GO_SIZE; y++) {
    for (let x = 0; x < GO_SIZE; x++) {
      const stone = snapshot.board[goIndex(x, y)] ?? GO_EMPTY;
      if (stone !== GO_EMPTY) drawStone(ctx, stone, nodeX(x), nodeY(y), radius);
    }
  }

  if (snapshot.koIndex >= 0) {
    const kx = nodeX(snapshot.koIndex % GO_SIZE);
    const ky = nodeY((snapshot.koIndex / GO_SIZE) | 0);
    ctx.strokeStyle = '#8d6f3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(kx - radius * 0.5) + 0.5, Math.round(ky - radius * 0.5) + 0.5, Math.round(radius), Math.round(radius));
  }

  const cx = nodeX(snapshot.cursorX);
  const cy = nodeY(snapshot.cursorY);
  ctx.strokeStyle = snapshot.yourTurn ? '#d6b15d' : '#59615d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(cx - step * 0.5) + 0.5, Math.round(cy) + 0.5);
  ctx.lineTo(Math.round(cx + step * 0.5) + 0.5, Math.round(cy) + 0.5);
  ctx.moveTo(Math.round(cx) + 0.5, Math.round(cy - step * 0.5) + 0.5);
  ctx.lineTo(Math.round(cx) + 0.5, Math.round(cy + step * 0.5) + 0.5);
  ctx.stroke();
  ctx.strokeRect(Math.round(cx - radius) + 0.5, Math.round(cy - radius) + 0.5, Math.round(radius * 2), Math.round(radius * 2));
}

function scoreLine(snapshot: GoSnapshot): string {
  const black = Number.isInteger(snapshot.scoreBlack) ? String(snapshot.scoreBlack) : snapshot.scoreBlack.toFixed(1);
  const white = Number.isInteger(snapshot.scoreWhite) ? String(snapshot.scoreWhite) : snapshot.scoreWhite.toFixed(1);
  return `ЧЕРНЫЕ ${black} | БЕЛЫЕ ${white} (КОМИ ${snapshot.komi})`;
}

export function drawGoInterface(
  ctx: CanvasRenderingContext2D,
  snapshot: GoSnapshot,
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
  ctx.fillText(fitText(ctx, 'ГО', pw * 0.22), px + pad, headerY);

  ctx.fillStyle = '#8d9690';
  ctx.font = `${7.2 * sy}px "Press Start 2P", monospace`;
  const turn = snapshot.phase === 'finished'
    ? resultText(snapshot)
    : snapshot.phase === 'npc_turn' ? `${snapshot.npcName} ДУМАЕТ` : 'ВАШ ХОД';
  const color = snapshot.yourStone === GO_WHITE ? 'ВЫ БЕЛЫМИ' : 'ВЫ ЧЕРНЫМИ';
  ctx.fillText(fitText(ctx, `СТАВКА ${snapshot.stakeRubles}Р | ${color} | ${turn}`, pw - pad * 2), px + pad, headerY + 13 * sy);
  ctx.fillText(fitText(ctx, scoreLine(snapshot), pw - pad * 2), px + pad, headerY + 23 * sy);

  const boardSize = Math.max(40, Math.min(pw - pad * 2, ph - 138 * sy));
  const boardX = px + (pw - boardSize) / 2;
  const boardY = headerY + 40 * sy;
  drawGoBoard(ctx, snapshot, boardX, boardY, boardSize);

  ctx.fillStyle = '#59615d';
  ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
  ctx.textAlign = 'left';
  const takes = `ВЗЯТО ВАМИ ${snapshot.yourCaptures} | У ВАС ${snapshot.theirCaptures}${snapshot.passes > 0 ? ' | ПАС' : ''}`;
  ctx.fillText(fitText(ctx, takes, pw - pad * 2), px + pad, boardY + boardSize + 4 * sy);

  const statusY = boardY + boardSize + 15 * sy;
  const statusH = 16 * sy;
  const status = snapshot.message || snapshot.log[snapshot.log.length - 1] || resultText(snapshot);
  drawBadge(ctx, fitText(ctx, status.toUpperCase(), pw - pad * 2 - 8 * s), px + pad, statusY, pw - pad * 2, statusH, s, '#c4cdc7');

  const action = snapshot.phase === 'finished'
    ? `${controlHint('gameMenu')} ЗАКРЫТЬ  ${menuCloseHint()} ВЫЙТИ`
    : `${controlHint('gameMenu')} ПОСТАВИТЬ  ${controlBindingLabel('drop')} ПАС  ${menuCloseHint()} СДАТЬСЯ`;
  ctx.fillStyle = '#59615d';
  ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, action, pw - pad * 2), Math.round(px + pw * 0.5), controlsY);
  ctx.restore();
}

registerTabletopPanel('go', drawGoInterface as never);

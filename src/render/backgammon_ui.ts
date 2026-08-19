/* ── Панель длинных нард ─────────────────────────────────────────────────────
 *
 * Снимок приходит уже в СВОЕЙ рамке того, кто смотрит: `own[0]` — его голова,
 * `own[23]` — край его дома, `foe[i]` — чужие шашки на том же пункте доски.
 * Поэтому панель не знает про стороны и рисует одну доску для обоих стульев:
 * нижний ряд справа налево — 0..11, верхний слева направо — 12..23, дом
 * оказывается в правом верхнем углу, куда шашки и идут.
 */

import { registerTabletopPanel } from './tabletop_ui';
import type { BackgammonSnapshot } from '../systems/backgammon';
import { controlBindingLabel, controlHint, menuCloseHint } from '../systems/controls';
import { fitText } from './ui_text';
import { clamp, rect, drawBadge } from './ui_utils';

const POINTS = 24;
const ROW = POINTS / 2;
const HOME_START = 18;
const STACK_SHOWN = 5;

const PIPS: Record<number, readonly [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.3, 0.3], [0.7, 0.7]],
  3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
  4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
  6: [[0.3, 0.26], [0.7, 0.26], [0.3, 0.5], [0.7, 0.5], [0.3, 0.74], [0.7, 0.74]],
};

/** Экранная колонка пункта: нижний ряд идёт справа налево, верхний — слева
 *  направо, между шестым и седьмым пунктом традиционный разрыв. */
function pointRect(index: number, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number; up: boolean } {
  const up = index < ROW;
  const col = up ? ROW - 1 - index : index - ROW;
  const gap = w * 0.03;
  const colW = (w - gap) / ROW;
  const cx = x + col * colW + (col >= ROW / 2 ? gap : 0);
  const triH = h * 0.42;
  return { x: cx, y: up ? y + h - triH : y, w: colW, h: triH, up };
}

function drawTriangle(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number; up: boolean }, fill: string, stroke: string): void {
  const inset = r.w * 0.08;
  ctx.beginPath();
  if (r.up) {
    ctx.moveTo(r.x + inset, r.y + r.h);
    ctx.lineTo(r.x + r.w - inset, r.y + r.h);
    ctx.lineTo(r.x + r.w * 0.5, r.y);
  } else {
    ctx.moveTo(r.x + inset, r.y);
    ctx.lineTo(r.x + r.w - inset, r.y);
    ctx.lineTo(r.x + r.w * 0.5, r.y + r.h);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawStack(
  ctx: CanvasRenderingContext2D,
  count: number,
  own: boolean,
  r: { x: number; y: number; w: number; h: number; up: boolean },
  s: number,
): void {
  if (count <= 0) return;
  const radius = Math.min(r.w * 0.34, r.h * 0.14, 9 * s);
  const step = radius * 1.85;
  const baseY = r.up ? r.y + r.h - radius * 1.15 : r.y + radius * 1.15;
  const cx = r.x + r.w * 0.5;
  const shown = Math.min(count, STACK_SHOWN);
  for (let i = 0; i < shown; i++) {
    const cy = baseY + (r.up ? -1 : 1) * i * step;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = own ? '#cdc5a6' : '#39433f';
    ctx.fill();
    ctx.strokeStyle = own ? '#6e6750' : '#78847e';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const topY = baseY + (r.up ? -1 : 1) * (shown - 1) * step;
  ctx.fillStyle = own ? '#2a2a20' : '#c4cdc7';
  ctx.font = `${Math.max(6, Math.round(radius * 1.05))}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${count}`, Math.round(cx), Math.round(topY + radius * 0.08));
}

function drawDie(ctx: CanvasRenderingContext2D, value: number, x: number, y: number, size: number, active: boolean, armed: boolean): void {
  rect(ctx, x, y, size, size, active ? '#cdc5a6' : '#2f3733', armed ? '#d6b15d' : active ? '#6e6750' : '#454f4a');
  const pipR = Math.max(1, size * 0.075);
  ctx.fillStyle = active ? '#1a1c16' : '#5c655f';
  for (const [px, py] of PIPS[value] ?? []) {
    ctx.beginPath();
    ctx.arc(x + size * px, y + size * py, pipR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMiddleBand(ctx: CanvasRenderingContext2D, snapshot: BackgammonSnapshot, x: number, y: number, w: number, h: number, s: number): void {
  const size = clamp(h * 0.72, 12 * s, 22 * s);
  const armed = snapshot.dieChoices[Math.max(0, Math.min(snapshot.dieChoices.length - 1, snapshot.dieIndex))] ?? 0;
  let dx = x + w * 0.5 - size - 3 * s;
  for (const value of snapshot.roll) {
    const left = snapshot.dice.filter(die => die === value).length;
    drawDie(ctx, value, dx, y + (h - size) * 0.5, size, left > 0, left > 0 && value === armed);
    dx += size + 6 * s;
  }
  if (!snapshot.rolled) {
    drawBadge(ctx, 'КОСТИ НЕ БРОШЕНЫ', x + w * 0.5 - 60 * s, y + h * 0.5 - 7 * s, 120 * s, 14 * s, s, '#8d9690');
  } else if (snapshot.dice.length > 2) {
    drawBadge(ctx, `ХОДОВ ${snapshot.dice.length}`, x + w * 0.5 + size * 1.6, y + h * 0.5 - 7 * s, 62 * s, 14 * s, s, '#d6b15d');
  }
  drawBadge(ctx, `СНЯТО ${snapshot.ownOff}/15`, x, y + h * 0.5 - 7 * s, 78 * s, 14 * s, s, '#cdc5a6');
  drawBadge(ctx, `ЧУЖИХ ${snapshot.foeOff}/15`, x + w - 78 * s, y + h * 0.5 - 7 * s, 78 * s, 14 * s, s, '#8d9690');
}

function drawBoard(ctx: CanvasRenderingContext2D, snapshot: BackgammonSnapshot, x: number, y: number, w: number, h: number, s: number): void {
  rect(ctx, x, y, w, h, 'rgba(4,7,6,0.56)', '#2c3732');
  const inner = { x: x + 4 * s, y: y + 4 * s, w: w - 8 * s, h: h - 8 * s };
  const sources = new Set(snapshot.moves.map(move => move.from));
  for (let i = 0; i < POINTS; i++) {
    const r = pointRect(i, inner.x, inner.y, inner.w, inner.h);
    const home = i >= HOME_START;
    const fill = i % 2 === 0 ? '#1b211f' : '#232b28';
    let stroke = home ? '#3d4b44' : '#2c3732';
    if (sources.has(i)) stroke = '#5e7a63';
    if (i === snapshot.targetIndex) stroke = '#8fb08f';
    if (i === snapshot.cursor && snapshot.yourTurn) stroke = '#d6b15d';
    drawTriangle(ctx, r, fill, stroke);
    drawStack(ctx, snapshot.own[i] ?? 0, true, r, s);
    drawStack(ctx, snapshot.foe[i] ?? 0, false, r, s);
  }
  drawMiddleBand(ctx, snapshot, inner.x, inner.y + inner.h * 0.42, inner.w, inner.h * 0.16, s);
  const headR = pointRect(0, inner.x, inner.y, inner.w, inner.h);
  ctx.fillStyle = '#6f7a74';
  ctx.font = `${6.5 * s}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('ГОЛОВА', Math.round(headR.x + headR.w * 0.5), Math.round(inner.y + inner.h));
  ctx.textBaseline = 'top';
  ctx.fillText('ДОМ', Math.round(inner.x + inner.w - headR.w * 1.6), Math.round(inner.y));
  if (snapshot.targetIndex >= POINTS) {
    drawBadge(ctx, 'ВЫБРОС', x + w - 66 * s, y + 3 * s, 62 * s, 14 * s, s, '#8fb08f');
  }
}

function statusText(snapshot: BackgammonSnapshot): string {
  if (snapshot.finished) return snapshot.winner === 'player' ? 'ВЫИГРЫШ' : 'ПРОИГРЫШ';
  if (!snapshot.yourTurn) return `${snapshot.npcName} ДУМАЕТ`;
  if (!snapshot.rolled) return 'БРОСАЙТЕ КОСТИ';
  if (snapshot.moves.length <= 0) return 'ХОДОВ НЕТ';
  return snapshot.canMove ? 'ХОД ГОТОВ' : 'ВЫБЕРИТЕ ПУНКТ';
}

export function drawBackgammonInterface(
  ctx: CanvasRenderingContext2D,
  snapshot: BackgammonSnapshot,
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
  const statusH = 15 * sy;
  const statusY = controlsY - statusH - 9 * sy;
  const boardY = headerY + 27 * sy;
  const boardH = Math.max(70 * sy, statusY - boardY - 8 * sy);

  ctx.save();
  rect(ctx, px + 4 * sx, py + 32 * sy, pw - 8 * sx, ph - 43 * sy, 'rgba(2,5,5,0.74)', '#27312f');

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#d1aa54';
  ctx.font = `bold ${10 * sy}px "Press Start 2P", monospace`;
  ctx.fillText(fitText(ctx, 'НАРДЫ', pw * 0.24), px + pad, headerY);

  ctx.fillStyle = '#8d9690';
  ctx.font = `${7.2 * sy}px "Press Start 2P", monospace`;
  const turn = snapshot.finished ? statusText(snapshot) : snapshot.yourTurn ? 'ВАШ ХОД' : `${snapshot.npcName} ХОДИТ`;
  ctx.fillText(fitText(ctx, `СТАВКА ${snapshot.stakeRubles}Р | ${turn}`, pw - pad * 2), px + pad, headerY + 13 * sy);

  drawBoard(ctx, snapshot, px + pad, boardY, pw - pad * 2, boardH, s);

  const status = snapshot.message || snapshot.log[snapshot.log.length - 1] || statusText(snapshot);
  drawBadge(ctx, fitText(ctx, status.toUpperCase(), pw - pad * 2 - 8 * s), px + pad, statusY, pw - pad * 2, statusH, s, '#c4cdc7');

  const action = snapshot.finished
    ? `${controlHint('gameMenu')} ЗАКРЫТЬ  ${menuCloseHint()} ВЫЙТИ`
    : `${controlBindingLabel('menuLeft')}/${controlBindingLabel('menuRight')} ПУНКТ  ${controlHint('gameMenu')} ${snapshot.rolled ? 'ХОД' : 'БРОСИТЬ'}  ${controlBindingLabel('drop')} КОСТЬ  ${menuCloseHint()} СДАТЬСЯ`;
  ctx.fillStyle = '#59615d';
  ctx.font = `${7 * sy}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, action, pw - pad * 2), Math.round(px + pw * 0.5), controlsY);
  ctx.restore();
}

registerTabletopPanel('backgammon', drawBackgammonInterface as never);

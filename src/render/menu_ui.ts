/* ── Game menu (ESC) ──────────────────────────────────────────── */

import { type GameState } from '../core/types';

export function drawGameMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  _sx: number, sy: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Darken background
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = '#c00';
  ctx.font = `bold ${20 * sy}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('ГИГАХРУЩ', w / 2, h / 2 - 60 * sy);

  // Menu items
  const items = ['Продолжить', 'Новая игра', 'Сохранить', 'Загрузить'];
  ctx.font = `${10 * sy}px monospace`;
  for (let i = 0; i < items.length; i++) {
    const selected = i === state.menuSel;
    const yy = h / 2 - 20 * sy + i * 20 * sy;
    ctx.fillStyle = selected ? '#ee4' : '#888';
    ctx.fillText(`${selected ? '▶ ' : '  '}${items[i]}`, w / 2, yy);
  }

  ctx.fillStyle = '#555';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText('W/S — выбор  |  E — подтвердить  |  ENTER — закрыть', w / 2, h / 2 + 70 * sy);

  ctx.textAlign = 'left';
}

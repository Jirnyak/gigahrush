/* ── Game menu (ESC) ──────────────────────────────────────────── */

import { type GameState } from '../core/types';
import { drawNeuroPanel, textJitter, flicker } from './hud_fx';

export function drawGameMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  _sx: number, sy: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const time = state.time;

  // Darken background
  ctx.fillStyle = 'rgba(0,0,4,0.85)';
  ctx.fillRect(0, 0, w, h);

  // Panel
  const pw = 200 * (w / 320), ph = 160 * sy;
  drawNeuroPanel(ctx, (w - pw) / 2, h / 2 - 80 * sy, pw, ph, time, 70);

  // Title
  ctx.save();
  ctx.shadowColor = 'rgba(200,0,0,0.5)';
  ctx.shadowBlur = 10;
  const tj = textJitter(time, 700);
  ctx.fillStyle = `rgba(200,0,0,${flicker(time, 701)})`;
  ctx.font = `bold ${20 * sy}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('ГИГАХРУЩ', w / 2 + tj.dx, h / 2 - 60 * sy + tj.dy);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Menu items
  const items = ['Продолжить', 'Новая игра', 'Сохранить', 'Загрузить'];
  ctx.font = `${10 * sy}px monospace`;
  ctx.textAlign = 'center';
  for (let i = 0; i < items.length; i++) {
    const selected = i === state.menuSel;
    const yy = h / 2 - 20 * sy + i * 20 * sy;
    const mj = textJitter(time, 710 + i);
    const alpha = flicker(time, 720 + i);
    ctx.fillStyle = selected ? `rgba(0,255,170,${alpha})` : `rgba(100,136,136,${alpha})`;
    ctx.fillText(`${selected ? '▶ ' : '  '}${items[i]}`, w / 2 + mj.dx, yy + mj.dy);
  }

  ctx.fillStyle = '#456';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText('W/S — выбор  |  E — подтвердить  |  ENTER — закрыть', w / 2, h / 2 + 70 * sy);

  ctx.textAlign = 'left';
}

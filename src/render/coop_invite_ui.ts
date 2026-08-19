/* ── Co-op invite prompt ──────────────────────────────────────────────────────
 *
 * Drawn over live gameplay for the invited player only: the world keeps running
 * behind it, so the panel stays small, sits low and never swallows the screen.
 * Answering is a single click either way — left accepts, right refuses — and the
 * bar shows the invite running out of time.
 */

import type { CoopInvite } from '../systems/coop_session';

const PANEL_W = 232;
const PANEL_H = 62;

export function drawCoopInvitePrompt(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  invite: CoopInvite,
  activityTitle: string,
  timeLeft: number,
  timeTotal: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const s = Math.max(0.78, Math.min(2.2, Math.min(sx, sy)));
  const panelW = Math.min(w - 16 * s, PANEL_W * s);
  const panelH = PANEL_H * s;
  const x = (w - panelW) * 0.5;
  // Low enough to leave the crosshair and the centre of the view clear.
  const y = h - panelH - 44 * s;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,9,9,0.88)';
  ctx.fillRect(x, y, panelW, panelH);
  ctx.strokeStyle = '#4a5a52';
  ctx.lineWidth = Math.max(1, s);
  ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

  const pad = 7 * s;
  ctx.textAlign = 'left';
  ctx.font = `${Math.round(8 * s)}px monospace`;
  ctx.fillStyle = '#8cf';
  ctx.fillText(`${invite.fromName} зовет: ${activityTitle}`, x + pad, y + 12 * s);

  ctx.fillStyle = '#c8d4cc';
  ctx.fillText(invite.stake > 0 ? `Ставка ₽${invite.stake} с каждого` : 'Без ставки, вещь на вещь', x + pad, y + 26 * s);

  ctx.fillStyle = '#8f8';
  ctx.fillText('ЛКМ принять', x + pad, y + 42 * s);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f84';
  ctx.fillText('ПКМ отклонить', x + panelW - pad, y + 42 * s);

  // Time bar: the invite lapses on its own, so the wait is visible.
  const frac = timeTotal > 0 ? Math.max(0, Math.min(1, timeLeft / timeTotal)) : 0;
  const barY = y + panelH - 4 * s;
  ctx.fillStyle = 'rgba(140,204,255,0.25)';
  ctx.fillRect(x + pad, barY, panelW - pad * 2, 2 * s);
  ctx.fillStyle = '#8cf';
  ctx.fillRect(x + pad, barY, (panelW - pad * 2) * frac, 2 * s);
  ctx.restore();
}

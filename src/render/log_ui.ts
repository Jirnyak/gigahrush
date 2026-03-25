/* ── Message log (L key) — fullscreen STALKER-style PDA log ───── */

import { type GameState } from '../core/types';

export function drawLogMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sx: number, sy: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Fullscreen dark background
  ctx.fillStyle = 'rgba(0,0,10,0.92)';
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = '#446';
  ctx.lineWidth = 2;
  ctx.strokeRect(4 * sx, 4 * sy, w - 8 * sx, h - 8 * sy);

  // Title
  ctx.fillStyle = '#8af';
  ctx.font = `${10 * sy}px monospace`;
  ctx.fillText('ЖУРНАЛ СООБЩЕНИЙ [L]', 12 * sx, 14 * sy);

  // Separator
  ctx.strokeStyle = '#335';
  ctx.beginPath();
  ctx.moveTo(8 * sx, 22 * sy);
  ctx.lineTo(w - 8 * sx, 22 * sy);
  ctx.stroke();

  const log = state.msgLog;
  if (log.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillText('Пусто.', 12 * sx, 34 * sy);
    return;
  }

  const lineH = 11 * sy;
  const topY = 28 * sy;
  const bottomY = h - 18 * sy;
  const maxW = w - 24 * sx;
  ctx.font = `${8 * sy}px monospace`;

  // Pre-compute stamp width for wrapping
  const sampleStamp = '[Д 0 00:00]  ';
  const stampW = ctx.measureText(sampleStamp).width;
  const textAvailW = maxW - stampW;

  // Word-wrap all log entries into visual lines (cached per draw)
  type VLine = { stamp: string; text: string; color: string; isWrap: boolean };
  const vlines: VLine[] = [];
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const dd = String(entry.day).padStart(2, ' ');
    const lhh = String(entry.hour).padStart(2, '0');
    const lmm = String(entry.minute).padStart(2, '0');
    const stamp = `[Д${dd} ${lhh}:${lmm}]`;
    // Word-wrap the message text
    const words = entry.text.split(' ');
    let line = '';
    let first = true;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > textAvailW) {
        vlines.push({ stamp: first ? stamp : '', text: line, color: entry.color, isWrap: !first });
        line = word;
        first = false;
      } else {
        line = test;
      }
    }
    if (line) vlines.push({ stamp: first ? stamp : '', text: line, color: entry.color, isWrap: !first });
  }

  const visibleLines = Math.floor((bottomY - topY) / lineH);

  // Scroll: 0 = show newest at bottom, higher = scroll up to older
  const scroll = Math.min(state.logScroll, Math.max(0, vlines.length - visibleLines));

  // Draw from bottom up: newest entries at the bottom of the panel
  const endIdx = vlines.length - scroll;           // exclusive upper bound
  const startIdx = Math.max(0, endIdx - visibleLines);

  for (let i = startIdx; i < endIdx; i++) {
    const vl = vlines[i];
    const row = i - startIdx;
    const y = topY + row * lineH;

    if (vl.stamp) {
      ctx.fillStyle = '#666';
      ctx.fillText(vl.stamp, 12 * sx, y);
    }
    ctx.fillStyle = vl.color;
    const textX = 12 * sx + stampW;
    ctx.fillText(vl.text, vl.isWrap ? textX : textX, y);
  }

  // Scrollbar indicator
  if (vlines.length > visibleLines) {
    const barH = h - 40 * sy;
    const barX = w - 10 * sx;
    const barY = 24 * sy;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, 4 * sx, barH);
    const maxScr = Math.max(1, vlines.length - visibleLines);
    const pct = scroll / maxScr;
    const thumbH = Math.max(8 * sy, barH * (visibleLines / vlines.length));
    const thumbY = barY + (1 - pct) * (barH - thumbH);
    ctx.fillStyle = '#556';
    ctx.fillRect(barX, thumbY, 4 * sx, thumbH);
  }

  // Bottom hint
  ctx.fillStyle = '#555';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText(`[W/S] листать  |  ${log.length} сообщ.  |  [L] закрыть`, 12 * sx, h - 8 * sy);
}

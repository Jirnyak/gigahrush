/* ── Quest log panel — paginated, one quest per page ──────────── */

import { type GameState } from '../core/types';

export function drawQuestLog(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sx: number, sy: number,
): void {
  const pw = 200 * sx, ph = 140 * sy;
  const px = (ctx.canvas.width - pw) / 2;
  const py = (ctx.canvas.height - ph) / 2;

  ctx.fillStyle = 'rgba(0,0,10,0.9)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#448';
  ctx.strokeRect(px, py, pw, ph);

  ctx.fillStyle = '#8af';
  ctx.font = `${9 * sy}px monospace`;
  ctx.fillText('ЗАДАНИЯ [Q]', px + 8 * sx, py + 6 * sy);

  const active = state.quests.filter(q => !q.done);
  const done = state.quests.filter(q => q.done);
  const all = [...active, ...done];

  if (all.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillText('Нет заданий. Поговорите с жителями [E].', px + 8 * sx, py + 24 * sy);
    return;
  }

  const page = Math.min(state.questPage, all.length - 1);
  const q = all[page];
  const maxW = pw - 16 * sx;

  // Page indicator
  ctx.fillStyle = '#888';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText(`${page + 1} / ${all.length}`, px + pw - 40 * sx, py + 6 * sy);

  // Quest giver
  ctx.fillStyle = '#8af';
  ctx.font = `${8 * sy}px monospace`;
  ctx.fillText(`От: ${q.giverName ?? '???'}`, px + 8 * sx, py + 24 * sy);

  // Status badge
  const isDone = q.done;
  ctx.fillStyle = isDone ? '#484' : '#dda';
  ctx.font = `${8 * sy}px monospace`;

  // Word-wrapped description
  const prefix = isDone ? '✓ ' : '• ';
  const words = (prefix + q.desc).split(' ');
  let line = '';
  let ly = py + 40 * sy;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, px + 8 * sx, ly);
      line = word;
      ly += 12 * sy;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, px + 8 * sx, ly); ly += 12 * sy; }

  // Progress for KILL quests
  if (!isDone && q.killNeeded !== undefined) {
    ly += 4 * sy;
    ctx.fillStyle = '#aaa';
    ctx.fillText(`Прогресс: ${q.killCount ?? 0}/${q.killNeeded}`, px + 8 * sx, ly);
  }

  // Bottom hint
  ctx.fillStyle = '#555';
  ctx.font = `${7 * sy}px monospace`;
  const hint = all.length > 1 ? '[W/S] листать  |  [Q] закрыть' : '[Q] закрыть';
  ctx.fillText(hint, px + 8 * sx, py + ph - 8 * sy);
}

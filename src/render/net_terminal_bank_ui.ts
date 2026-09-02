import { type NetTerminalBankSnapshot } from '../systems/net_terminal_gen';
import { controlBindingLabel, controlHint, menuCloseHint } from '../systems/controls';
import { drawGlitchText, drawNeuroPanel, drawStaticNoise, textJitter } from './hud_fx';
import { fitText } from './ui_text';

/** Сколько строк списка операций помещается в окно терминала. Строк больше, чем
 *  экрана: счёт, вклад, кредит и по строке на каждую котируемую корпорацию. */
const VISIBLE_ROWS = 5;

function money(value: number): string {
  return `${Math.max(0, Math.floor(value))} руб.`;
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  value: string,
  maxW: number,
  tint: string,
): void {
  ctx.fillStyle = '#8ca0a8';
  ctx.fillText(fitText(ctx, label, maxW * 0.42), x, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = tint;
  ctx.fillText(fitText(ctx, value, maxW * 0.55), x + maxW, y);
  ctx.textAlign = 'left';
}

/** Окно списка едет за курсором и не выезжает за края: строка выбора всегда
 *  видна, а у краёв список замирает вместо прокрутки в пустоту. */
function rowWindowStart(rowIndex: number, rowCount: number): number {
  if (rowCount <= VISIBLE_ROWS) return 0;
  const half = (VISIBLE_ROWS - 1) >> 1;
  return Math.max(0, Math.min(rowCount - VISIBLE_ROWS, rowIndex - half));
}

export function drawNetTerminalBank(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  time: number,
  bank: NetTerminalBankSnapshot,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const s = Math.max(0.8, Math.min(2, Math.min(sx, sy)));
  const pad = 8 * s;
  const panelW = Math.min(w - 12 * s, 340 * s);
  const panelH = Math.min(h - 12 * s, 286 * s);
  const x = (w - panelW) * 0.5;
  const y = (h - panelH) * 0.5;
  const maxTextW = panelW - pad * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0,5,8,0.84)';
  ctx.fillRect(0, 0, w, h);
  drawNeuroPanel(ctx, x, y, panelW, panelH, time, 1240);
  drawStaticNoise(ctx, x, y, panelW, panelH, time, 0.026);

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  drawGlitchText(ctx, 'НЕТ-БАНК', x + pad, y + 10 * s, time, 1241, '#63f6ff', 12 * s);
  ctx.textAlign = 'right';
  ctx.font = `${7 * s}px "Press Start 2P", monospace`;
  ctx.fillStyle = '#55727a';
  ctx.fillText(
    fitText(ctx, bank.terminalIdx >= 0 ? `IDX ${bank.terminalIdx}` : bank.terminalLabel, 92 * s),
    x + panelW - pad,
    y + 13 * s,
  );
  ctx.textAlign = 'left';

  ctx.font = `${8 * s}px "Press Start 2P", monospace`;
  let ly = y + 34 * s;
  const lineH = 12 * s;
  drawLine(ctx, x + pad, ly, 'Нал', money(bank.cashRubles), maxTextW, '#d8f0d0');
  ly += lineH;
  drawLine(ctx, x + pad, ly, 'Счёт', money(bank.accountRubles), maxTextW, '#8fdcff');
  ly += lineH;
  drawLine(ctx, x + pad, ly, 'Вклад', money(bank.depositRubles), maxTextW, '#f0d27a');
  ly += lineH;
  drawLine(ctx, x + pad, ly, 'Долг', money(bank.debtRubles), maxTextW, bank.debtRubles > 0 ? '#ff8a70' : '#789098');
  ly += lineH;
  drawLine(ctx, x + pad, ly, 'Лимит', money(bank.creditAvailable), maxTextW, '#9fb6be');
  ly += lineH;
  drawLine(ctx, x + pad, ly, 'Портфель', money(bank.portfolioRubles), maxTextW, '#b7e0a8');

  // ── Список операций ───────────────────────────────────────────
  const listY = y + 116 * s;
  ctx.strokeStyle = 'rgba(99,246,255,0.28)';
  ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  ctx.moveTo(x + pad, listY - 6 * s);
  ctx.lineTo(x + panelW - pad, listY - 6 * s);
  ctx.stroke();

  const start = rowWindowStart(bank.rowIndex, bank.rows.length);
  const rowH = 12 * s;
  ctx.font = `${8 * s}px "Press Start 2P", monospace`;
  for (let i = 0; i < VISIBLE_ROWS && start + i < bank.rows.length; i++) {
    const row = bank.rows[start + i];
    const ry = listY + i * rowH;
    if (row.selected) {
      ctx.fillStyle = 'rgba(99,246,255,0.14)';
      ctx.fillRect(x + pad - 2 * s, ry - 2 * s, maxTextW + 4 * s, rowH);
    }
    ctx.fillStyle = row.selected ? '#d7f7ff' : '#7d939b';
    ctx.fillText(fitText(ctx, `${row.selected ? '>' : ' '} ${row.label}`, maxTextW * 0.62), x + pad, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = row.selected ? '#63f6ff' : '#5d757d';
    ctx.fillText(fitText(ctx, row.value, maxTextW * 0.36), x + panelW - pad, ry);
    ctx.textAlign = 'left';
  }

  ctx.font = `${7 * s}px "Press Start 2P", monospace`;
  ctx.fillStyle = '#55727a';
  ctx.textAlign = 'right';
  ctx.fillText(`${bank.rowIndex + 1}/${bank.rows.length}`, x + panelW - pad, listY + VISIBLE_ROWS * rowH + 1 * s);
  ctx.textAlign = 'left';

  // ── Выбранная операция ────────────────────────────────────────
  const actionY = listY + VISIBLE_ROWS * rowH + 14 * s;
  ctx.beginPath();
  ctx.moveTo(x + pad, actionY - 7 * s);
  ctx.lineTo(x + panelW - pad, actionY - 7 * s);
  ctx.stroke();

  const jitter = textJitter(time * 1.5, 1242);
  ctx.font = `bold ${10 * s}px "Press Start 2P", monospace`;
  ctx.fillStyle = bank.canSubmit ? '#63f6ff' : '#ff8a70';
  ctx.fillText(
    fitText(ctx, `${bank.actionLabel}: ${bank.presetLabel}`, maxTextW),
    x + pad + jitter.dx,
    actionY + jitter.dy,
  );

  ctx.font = `${8 * s}px "Press Start 2P", monospace`;
  ctx.fillStyle = '#aab8bd';
  const amountLine = bank.shareCount > 0
    ? `${bank.shareCount} шт. на ${money(bank.amountRubles)}`
    : `Сумма: ${money(bank.amountRubles)}`;
  ctx.fillText(fitText(ctx, amountLine, maxTextW), x + pad, actionY + 15 * s);

  ctx.fillStyle = bank.message ? (bank.canSubmit ? '#d7f7ff' : '#f86') : bank.canSubmit ? '#6f8' : '#f86';
  ctx.fillText(
    fitText(ctx, bank.message || (bank.canSubmit ? 'Готово.' : 'Операция недоступна.'), maxTextW),
    x + pad,
    actionY + 28 * s,
  );

  ctx.fillStyle = '#59717a';
  ctx.font = `${7 * s}px "Press Start 2P", monospace`;
  ctx.fillText(fitText(ctx, `${controlBindingLabel('menuUp')}/${controlBindingLabel('menuDown')} операция  ${controlBindingLabel('menuLeft')}/${controlBindingLabel('menuRight')} параметр  ${controlHint('gameMenu')} выполнить  ${menuCloseHint()} закрыть`, maxTextW), x + pad, y + panelH - 14 * s);
  ctx.restore();
}

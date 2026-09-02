/* ── Панель обмена игрок-игрок ────────────────────────────────────
 * Рисует BarterSnapshot из systems/coop_barter: две корзины, свою сумку с
 * курсором и журнал стола. Единственный кооп-стол без «доски» — до этой панели
 * обмен существовал только в протоколе и играть в него было нечем.
 */

import { type BarterSnapshot } from '../systems/coop_barter';
import { ITEMS } from '../data/catalog';
import { controlBindingLabel, controlHint, menuCloseHint } from '../systems/controls';
import { fitText } from './ui_text';
import { rect } from './ui_utils';

function itemLabel(defId: string, count: number): string {
  const name = ITEMS[defId]?.name ?? defId;
  return count > 1 ? `${name} x${count}` : name;
}

export function drawBarterInterface(
  ctx: CanvasRenderingContext2D,
  snapshot: BarterSnapshot,
  px: number,
  py: number,
  pw: number,
  ph: number,
  sx: number,
  sy: number,
  _time: number,
): void {
  const pad = 8 * sx;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  rect(ctx, px + 4 * sx, py + 32 * sy, pw - 8 * sx, ph - 43 * sy, 'rgba(2,5,5,0.74)', '#27312f');

  ctx.fillStyle = '#d1aa54';
  ctx.font = `bold ${10 * sy}px "Press Start 2P", monospace`;
  ctx.fillText(fitText(ctx, 'ОБМЕН', pw * 0.3), px + pad, py + 36 * sy);

  ctx.fillStyle = '#8d9690';
  ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
  const status = snapshot.finished
    ? 'СТОЛ ЗАКРЫТ'
    : snapshot.you.confirmed && snapshot.them.confirmed
      ? 'СДЕЛКА'
      : 'ВЕЩИ НА СТОЛ, ПОТОМ ОБА ПОДТВЕРЖДАЮТ';
  ctx.fillText(fitText(ctx, status, pw - pad * 2 - pw * 0.32), px + pad + pw * 0.32, py + 38 * sy);

  // ── Две корзины: своя слева, оппонента справа ──
  const colW = (pw - pad * 3) / 2;
  const basketY = py + 54 * sy;
  const basketH = Math.max(60 * sy, ph * 0.32);
  const lineH = 9.5 * sy;
  const seats = [
    { x: px + pad, seat: snapshot.you, own: true },
    { x: px + pad * 2 + colW, seat: snapshot.them, own: false },
  ];
  for (const { x, seat, own } of seats) {
    rect(ctx, x, basketY, colW, basketH, 'rgba(10,16,15,0.6)', seat.confirmed ? '#5a8a5a' : '#2c3835');
    ctx.fillStyle = seat.confirmed ? '#8f8' : '#9aa5a0';
    ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
    const header = `${own ? 'ВЫ' : seat.name || 'ОППОНЕНТ'}${seat.confirmed ? ' [ПОДТВЕРДИЛ]' : ''}`;
    ctx.fillText(fitText(ctx, header, colW - 8 * sx), x + 4 * sx, basketY + 4 * sy);
    ctx.font = `${6.2 * sy}px "Press Start 2P", monospace`;
    let ly = basketY + 16 * sy;
    if (seat.offer.length === 0) {
      ctx.fillStyle = '#4c5652';
      ctx.fillText(fitText(ctx, '— пусто —', colW - 8 * sx), x + 4 * sx, ly);
    }
    for (const line of seat.offer) {
      if (ly > basketY + basketH - lineH) break;
      ctx.fillStyle = '#c9d2ce';
      ctx.fillText(fitText(ctx, itemLabel(line.defId, line.count), colW - 8 * sx), x + 4 * sx, ly);
      ly += lineH;
    }
  }

  // ── Своя сумка: окно вокруг курсора ──
  const invY = basketY + basketH + 8 * sy;
  const invH = py + ph - 34 * sy - invY;
  rect(ctx, px + pad, invY, pw - pad * 2, invH, 'rgba(10,16,15,0.6)', '#2c3835');
  ctx.fillStyle = '#9aa5a0';
  ctx.font = `${6.8 * sy}px "Press Start 2P", monospace`;
  ctx.fillText('ВАША СУМКА', px + pad + 4 * sx, invY + 4 * sy);
  ctx.font = `${6.2 * sy}px "Press Start 2P", monospace`;
  const rows = Math.max(1, Math.floor((invH - 18 * sy) / lineH));
  const first = Math.max(0, Math.min(snapshot.cursor - (rows >> 1), snapshot.inventory.length - rows));
  let ly = invY + 16 * sy;
  for (let i = first; i < Math.min(snapshot.inventory.length, first + rows); i++) {
    const line = snapshot.inventory[i];
    const selected = i === snapshot.cursor;
    ctx.fillStyle = selected ? '#ffd36a' : '#c9d2ce';
    const text = `${selected ? '> ' : '  '}${itemLabel(line.defId, line.count)}`;
    ctx.fillText(fitText(ctx, text, pw - pad * 2 - 8 * sx), px + pad + 4 * sx, ly);
    ly += lineH;
  }
  if (snapshot.inventory.length === 0) {
    ctx.fillStyle = '#4c5652';
    ctx.fillText('— пусто —', px + pad + 4 * sx, ly);
  }

  // ── Журнал стола + клавиши ──
  if (snapshot.message) {
    ctx.fillStyle = '#8cf';
    ctx.font = `${6.4 * sy}px "Press Start 2P", monospace`;
    ctx.fillText(fitText(ctx, snapshot.message, pw - pad * 2), px + pad, py + ph - 30 * sy);
  }
  ctx.fillStyle = '#555';
  ctx.font = `${6.4 * sy}px "Press Start 2P", monospace`;
  const hint = `${controlBindingLabel('menuLeft')}/${controlBindingLabel('menuRight')} ВЕЩЬ  ${controlHint('gameMenu')} ВЫЛОЖИТЬ  ${controlBindingLabel('drop')} ЗАБРАТЬ  ${controlBindingLabel('menuUp')} ПОДТВЕРДИТЬ  ${menuCloseHint()} ОТМЕНА`;
  ctx.fillText(fitText(ctx, hint, pw - pad * 2), px + pad, py + ph - 17 * sy);
  ctx.restore();
}

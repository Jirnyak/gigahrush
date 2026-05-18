/* ── Container interaction menu ──────────────────────────────── */

import { type Entity, type GameState } from '../core/types';
import { World } from '../core/world';
import { ITEMS } from '../data/catalog';
import { containerAccessInfo, containerTheftStatus } from '../systems/containers';

export function drawContainerMenu(
  ctx: CanvasRenderingContext2D,
  player: Entity,
  state: GameState,
  world: World,
  sx: number,
  sy: number,
): void {
  const container = world.containerById.get(state.containerMenuTarget);
  if (!container) return;

  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(0, 0, cw, ch);

  const GRID = 5;
  const cellSz = 22 * sx;
  const gap = 24 * sx;
  const gridTotal = GRID * cellSz;
  const totalW = gridTotal * 2 + gap;
  const startX = (cw - totalW) / 2;
  const startY = 30 * sy;
  const containerX = startX + gridTotal + gap;
  const playerInv = player.inventory ?? [];
  const containerInv = container.inventory;
  const access = containerAccessInfo(container, player);

  ctx.fillStyle = '#aaa';
  ctx.font = `${9 * sy}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('КОНТЕЙНЕР', cw / 2, 10 * sy);
  ctx.textAlign = 'left';

  ctx.font = `${8 * sy}px monospace`;
  ctx.fillStyle = '#ee4';
  ctx.fillText(`Вы: ${playerInv.length}/25`, startX, startY - 9 * sy);
  const containerName = container.name.length > 28 ? `${container.name.slice(0, 25)}...` : container.name;
  ctx.fillStyle = access.color;
  ctx.fillText(`${containerName}: ${containerInv.length}/${container.capacitySlots}`, containerX, startY - 9 * sy);
  ctx.fillStyle = access.color;
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText(access.label, containerX, startY - 18 * sy);
  ctx.fillStyle = '#888';
  let infoY = startY + GRID * cellSz + 36 * sy;
  ctx.fillText(access.detail.slice(0, 56), startX, infoY);
  const theftStatus = containerTheftStatus(container);
  if (theftStatus) {
    infoY += 9 * sy;
    ctx.fillStyle = theftStatus.color;
    ctx.fillText(`${theftStatus.label}: ${theftStatus.detail}`.slice(0, 56), startX, infoY);
  }
  if (container.tags.includes('production_output')) {
    const produced = container.lastProducedItemId ? ITEMS[container.lastProducedItemId]?.name ?? container.lastProducedItemId : '';
    const reason = container.productionBlockedReason === 'no_inputs'
      ? 'нет сырья'
      : container.productionBlockedReason === 'container_full'
        ? 'ящик полон'
        : 'нет ящика';
    const status = container.productionBlockedReason
      ? `Цех стоит: ${reason}`
      : produced
        ? `Цех: ${produced} x${container.lastProducedCount ?? 1}`
        : `Цех: ${container.factoryId ?? 'ожидает сырьё'}`;
    ctx.fillStyle = container.productionBlockedReason ? '#fa4' : '#8cf';
    ctx.fillText(status.slice(0, 56), startX, infoY + 9 * sy);
  }

  const drawGrid = (inv: { defId: string; count: number }[], gx: number, side: string) => {
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const idx = row * GRID + col;
        const cx = gx + col * cellSz;
        const cy = startY + row * cellSz;
        const selected = state.containerSide === side && state.containerCursorX === col && state.containerCursorY === row;

        ctx.fillStyle = selected ? 'rgba(80,120,110,0.55)' : 'rgba(30,30,30,0.82)';
        ctx.fillRect(cx, cy, cellSz - 2, cellSz - 2);
        ctx.strokeStyle = selected ? '#0fa' : '#444';
        ctx.strokeRect(cx, cy, cellSz - 2, cellSz - 2);

        if (idx < inv.length) {
          const item = inv[idx];
          const def = ITEMS[item.defId];
          ctx.fillStyle = selected ? '#0fa' : '#ccc';
          ctx.font = `${6 * sy}px monospace`;
          ctx.fillText((def?.name ?? item.defId).slice(0, 6), cx + 2 * sx, cy + 10 * sy);
          if (item.count > 1) {
            ctx.fillStyle = '#8a8';
            ctx.font = `${5 * sy}px monospace`;
            ctx.fillText(`x${item.count}`, cx + cellSz - 16 * sx, cy + cellSz - 5 * sy);
          }
        }
      }
    }
  };

  drawGrid(playerInv, startX, 'player');
  drawGrid(containerInv, containerX, 'container');

  const descY = startY + GRID * cellSz + 8 * sy;
  const curIdx = state.containerCursorY * GRID + state.containerCursorX;
  const curInv = state.containerSide === 'player' ? playerInv : containerInv;
  ctx.textAlign = 'center';
  if (curIdx < curInv.length) {
    const item = curInv[curIdx];
    const def = ITEMS[item.defId];
    ctx.fillStyle = '#ccc';
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillText(`${def?.name ?? item.defId} x${item.count}`, cw / 2, descY);
    ctx.fillStyle = '#888';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText(def?.desc ?? '', cw / 2, descY + 10 * sy);
    const action = state.containerSide === 'container'
      ? access.canTake ? access.theft ? '[E] украсть' : '[E] взять' : 'нет доступа'
      : access.canPut ? '[E] положить' : 'нет доступа';
    ctx.fillStyle = state.containerSide === 'container' && access.theft ? '#f84' : access.color;
    ctx.fillText(action, cw / 2, descY + 22 * sy);
  } else {
    ctx.fillStyle = '#555';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText('Пустой слот', cw / 2, descY + 6 * sy);
  }
  ctx.textAlign = 'left';

  ctx.fillStyle = '#555';
  ctx.font = `${6 * sy}px monospace`;
  ctx.textAlign = 'right';
  ctx.fillText('W/S/стрелки - курсор', cw - 8 * sx, ch - 24 * sy);
  ctx.fillText('E - перенести 1 предмет', cw - 8 * sx, ch - 16 * sy);
  ctx.fillText('ENTER - закрыть', cw - 8 * sx, ch - 8 * sy);
  ctx.textAlign = 'left';
}

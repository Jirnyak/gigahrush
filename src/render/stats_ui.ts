/* ── Inventory panel (fullscreen) ──────────────────────────────── */

import { type Entity, type GameState, ItemType } from '../core/types';
import { ITEMS } from '../data/catalog';
import { getEquippedToolDurability, getWeaponReadiness } from '../systems/inventory';
import { xpForLevel } from '../systems/rpg';
import { zhelemishStatsLine } from '../systems/status';
import { drawNeuroPanel, drawGlitchText, textJitter, flicker } from './hud_fx';

function fitStatText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0) return '';
  if (ctx.measureText(text).width <= maxW) return text;
  let end = text.length - 3;
  while (end > 1 && ctx.measureText(text.slice(0, end) + '...').width > maxW) end--;
  return text.slice(0, Math.max(1, end)) + '...';
}

export function drawInventory(
  ctx: CanvasRenderingContext2D,
  player: Entity, state: GameState,
  sx: number, sy: number,
  uiTime = state.time,
): void {
  const inv = player.inventory ?? [];
  const GRID = 5;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const time = uiTime;

  // Fullscreen neuro-panel background
  drawNeuroPanel(ctx, 0, 0, cw, ch, time, 80);

  // Title + money + close hint
  drawGlitchText(ctx, 'ИНВЕНТАРЬ', 8 * sx, 6 * sy, time, 800, '#6cf', 9 * sy);
  ctx.font = `${9 * sy}px monospace`;
  const mj = textJitter(time, 801);
  ctx.fillStyle = `rgba(238,238,68,${flicker(time, 802)})`;
  ctx.fillText(`₽${player.money ?? 0}`, 88 * sx + mj.dx, 6 * sy + mj.dy);
  ctx.fillStyle = '#456';
  ctx.font = `${7 * sy}px monospace`;
  ctx.textAlign = 'right';
  ctx.fillText('[I] закрыть', cw - 8 * sx, 6 * sy);
  ctx.textAlign = 'left';

  // ── LEFT COLUMN: grid + item desc + weapon + money ───────
  const cellSz = 22 * sx;
  const gridX = 8 * sx;
  const gridY = 18 * sy;
  const gridW = GRID * cellSz;

  // 5×5 Grid
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const idx = row * GRID + col;
      const cx = gridX + col * cellSz;
      const cy = gridY + row * cellSz;
      const selected = idx === state.invSel;

      ctx.fillStyle = selected ? 'rgba(0,60,50,0.6)' : 'rgba(5,15,20,0.8)';
      ctx.fillRect(cx, cy, cellSz - 2, cellSz - 2);
      ctx.strokeStyle = selected ? 'rgba(0,255,200,0.6)' : 'rgba(0,100,80,0.25)';
      ctx.strokeRect(cx, cy, cellSz - 2, cellSz - 2);

      if (idx < inv.length) {
        const item = inv[idx];
        const def = ITEMS[item.defId];
        ctx.fillStyle = selected ? '#0fa' : '#8aa';
        ctx.font = `${6 * sy}px monospace`;
        const name = (def?.name ?? item.defId).slice(0, 6);
        ctx.fillText(name, cx + 2 * sx, cy + 10 * sy);
        if (item.count > 1) {
          ctx.fillStyle = '#6a8';
          ctx.font = `${5 * sy}px monospace`;
          ctx.fillText(`×${item.count}`, cx + cellSz - 16 * sx, cy + cellSz - 5 * sy);
        }
      }
    }
  }

  // Selected item description (under grid, shifted right toward center)
  const descY = gridY + GRID * cellSz + 4 * sy;
  const descX = gridX + gridW / 2;
  ctx.textAlign = 'center';
  if (state.invSel < inv.length) {
    const item = inv[state.invSel];
    const def = ITEMS[item.defId];
    if (def) {
      ctx.fillStyle = '#ccc';
      ctx.font = `${8 * sy}px monospace`;
      ctx.fillText(`${def.name} ×${item.count}`, descX, descY);
      ctx.fillStyle = '#888';
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText(def.desc, descX, descY + 10 * sy);
      ctx.fillStyle = '#da4';
      ctx.fillText(`Цена: ${def.value ?? 0}₽`, descX, descY + 20 * sy);
      if (def.use || def.type === ItemType.WEAPON || def.type === ItemType.TOOL) {
        ctx.fillStyle = '#6a6';
        ctx.fillText('[E] использовать', descX, descY + 30 * sy);
      }
      ctx.fillStyle = '#a86';
      ctx.fillText('[D] выкинуть', descX, descY + 40 * sy);
    }
  } else {
    ctx.fillStyle = '#555';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText('Пустой слот', descX, descY + 6 * sy);
  }
  ctx.textAlign = 'left';

  // ── RIGHT COLUMN: stats ──────────────────────────────────
  const stX = gridX + gridW + 16 * sx;
  const barW = Math.max(24 * sx, cw - stX - 16 * sx);
  let stY = gridY;

  // Name + Level + Attributes on same row
  ctx.fillStyle = '#ee4';
  ctx.font = `${10 * sy}px monospace`;
  const nameStr = player.name ?? 'Вы';
  ctx.fillText(nameStr, stX, stY);
  let nameEndX = stX + ctx.measureText(nameStr + '  ').width;
  if (player.rpg) {
    ctx.fillStyle = '#af4';
    ctx.font = `${10 * sy}px monospace`;
    ctx.fillText(`Ур.${player.rpg.level}`, nameEndX, stY);
    nameEndX += ctx.measureText(`Ур.${player.rpg.level}   `).width;
  }

  // Attributes right of name/level
  if (player.rpg) {
    const rpg = player.rpg;
    const apLabel = rpg.attrPoints > 0 ? `  +${rpg.attrPoints}` : '';
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillStyle = '#e84';
    ctx.fillText(`[1]СИЛ:${rpg.str}`, nameEndX, stY);
    const s1w = ctx.measureText(`[1]СИЛ:${rpg.str}  `).width;
    ctx.fillStyle = '#4e8';
    ctx.fillText(`[2]ЛОВ:${rpg.agi}`, nameEndX + s1w, stY);
    const s2w = ctx.measureText(`[2]ЛОВ:${rpg.agi}  `).width;
    ctx.fillStyle = '#48f';
    ctx.fillText(`[3]ИНТ:${rpg.int}`, nameEndX + s1w + s2w, stY);
    if (apLabel) {
      const s3w = ctx.measureText(`[3]ИНТ:${rpg.int} `).width;
      ctx.fillStyle = '#ee4';
      ctx.fillText(apLabel, nameEndX + s1w + s2w + s3w, stY);
    }
  }
  stY += 14 * sy;

  // Attribute points (always visible)
  if (player.rpg) {
    ctx.fillStyle = player.rpg.attrPoints > 0 ? '#ee4' : '#888';
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillText(`Очков характеристик: ${player.rpg.attrPoints}`, stX, stY);
    stY += 12 * sy;
  }

  // XP bar
  if (player.rpg) {
    const xpNeeded = xpForLevel(player.rpg.level + 1);
    ctx.fillStyle = '#8a8';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText(`XP: ${player.rpg.xp}/${xpNeeded}`, stX, stY);
    stY += 9 * sy;
    drawStatBar(ctx, stX, stY, barW, 4 * sy, xpNeeded > 0 ? player.rpg.xp / xpNeeded : 0, '#af4');
    stY += 8 * sy;
  }

  // HP bar
  ctx.fillStyle = '#aaa';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText(`ХП: ${player.hp ?? 0}/${player.maxHp ?? 100}`, stX, stY);
  stY += 10 * sy;
  drawStatBar(ctx, stX, stY, barW, 5 * sy, (player.hp ?? 0) / (player.maxHp ?? 100), '#e44');
  stY += 8 * sy;

  // PSI bar
  if (player.rpg) {
    ctx.fillStyle = '#a4f';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText(`ПСИ: ${Math.round(player.rpg.psi)}/${player.rpg.maxPsi}`, stX, stY);
    stY += 10 * sy;
    drawStatBar(ctx, stX, stY, barW, 5 * sy, player.rpg.maxPsi > 0 ? player.rpg.psi / player.rpg.maxPsi : 0, '#a4f');
    stY += 8 * sy;
  }

  // Needs
  if (player.needs) {
    const needs: [string, number, string][] = [
      ['Еда', player.needs.food, '#8a4'],
      ['Вода', player.needs.water, '#48c'],
      ['Сон', player.needs.sleep, '#a8f'],
      ['Туалет', Math.max(0, 100 - player.needs.pee), '#da4'],
    ];
    for (const [label, val, color] of needs) {
      ctx.fillStyle = '#aaa';
      ctx.font = `${6 * sy}px monospace`;
      ctx.fillText(`${label}: ${Math.round(val)}`, stX, stY);
      stY += 7 * sy;
      drawStatBar(ctx, stX, stY, barW, 3 * sy, val / 100, color);
      stY += 6 * sy;
    }
  }

  const zhelemishLine = zhelemishStatsLine(player, time);
  if (zhelemishLine) {
    stY += 3 * sy;
    ctx.fillStyle = '#9c6';
    ctx.font = `${6 * sy}px monospace`;
    ctx.fillText(fitStatText(ctx, zhelemishLine, barW), stX, stY);
    stY += 9 * sy;
  }

  // Equipped weapon info — compact facts, right side
  stY += 4 * sy;
  const weapon = getWeaponReadiness(player);
  ctx.fillStyle = '#ccc';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText(
    fitStatText(ctx, `Оружие: ${weapon.name}  ${weapon.role}  Урон:${weapon.damageLabel}`, barW),
    stX, stY,
  );
  stY += 9 * sy;
  ctx.fillStyle = weapon.warning ? '#f84' : '#9d9';
  const weaponState = weapon.cannotFireReason
    ? `${weapon.resourceLabel}  ${weapon.cannotFireReason}`
    : `${weapon.resourceLabel}  ${weapon.cooldownLabel}`;
  ctx.fillText(fitStatText(ctx, weaponState, barW), stX, stY);
  stY += 12 * sy;

  const toolName = player.tool ? (ITEMS[player.tool]?.name ?? player.tool) : 'нет';
  const toolDur = getEquippedToolDurability(player);
  const toolDurLabel = toolDur ? `${Math.max(0, Math.ceil(toolDur.cur))}/${toolDur.max}` : '--';
  ctx.fillStyle = '#8cf';
  ctx.fillText(`Инструмент: ${toolName}  Износ:${toolDurLabel}`, stX, stY);
  stY += 12 * sy;

  // Stats
  ctx.fillStyle = '#888';
  ctx.font = `${7 * sy}px monospace`;
  const day = Math.floor(state.clock.totalMinutes / 1440);
  ctx.fillText(`Выжил дней: ${day}  |  Самосборов: ${state.samosborCount}`, stX, stY);
}

function drawStatBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  pct: number, color: string,
): void {
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
}

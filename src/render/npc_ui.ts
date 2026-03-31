/* ── NPC interaction menu ─────────────────────────────────────── */

import { type Entity, type GameState, Faction } from '../core/types';
import { ITEMS } from '../data/catalog';
import { FACTION_NAMES, OCCUPATION_NAMES } from '../data/relations';
import { drawNeuroPanel, drawGlitchText, textJitter, flicker } from './hud_fx';

export function drawNpcMenu(
  ctx: CanvasRenderingContext2D,
  player: Entity,
  state: GameState,
  entities: Entity[],
  sx: number, sy: number,
): void {
  const npc = entities.find(e => e.id === state.npcMenuTarget);
  if (!npc) return;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const pw = 220 * sx, ph = 160 * sy;
  const px = (w - pw) / 2;
  const py = (h - ph) / 2;
  const time = state.time;

  // Background — neuro-panel
  drawNeuroPanel(ctx, px, py, pw, ph, time, 90);

  // NPC name header
  const fName = npc.faction !== undefined ? FACTION_NAMES[npc.faction as Faction] : '';
  const oName = npc.occupation !== undefined ? OCCUPATION_NAMES[npc.occupation] : '';
  drawGlitchText(ctx, npc.name ?? '???', px + 8 * sx, py + 10 * sy, time, 900, '#0fa', 10 * sy);
  ctx.font = `${10 * sy}px monospace`;
  ctx.fillStyle = '#688';
  ctx.font = `${7 * sy}px monospace`;
  const fj = textJitter(time, 901);
  ctx.fillText(`${fName} · ${oName}`, px + 8 * sx + fj.dx, py + 22 * sy + fj.dy);

  if (state.npcMenuTab === 'main') {
    // Main menu: Talk, Quest, Trade
    const items = ['Разговор', 'Задание', 'Торговля'];
    ctx.font = `${9 * sy}px monospace`;
    for (let i = 0; i < items.length; i++) {
      const selected = i === state.npcMenuSel;
      const yy = py + 40 * sy + i * 16 * sy;
      const mj = textJitter(time, 910 + i);
      ctx.fillStyle = selected ? `rgba(0,255,170,${flicker(time, 920 + i)})` : '#688';
      ctx.fillText(`${selected ? '▶ ' : '  '}${items[i]}`, px + 16 * sx + mj.dx, yy + mj.dy);
    }
    ctx.fillStyle = '#456';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText('W/S — выбор  |  [E] выбрать  |  ENTER — закрыть', px + 8 * sx, py + ph - 8 * sy);

  } else if (state.npcMenuTab === 'talk') {
    // Talk: show procedural text
    ctx.fillStyle = '#ccc';
    ctx.font = `${8 * sy}px monospace`;
    // Word wrap the talk text
    const maxW = pw - 16 * sx;
    const words = state.npcTalkText.split(' ');
    let line = '';
    let ly = py + 38 * sy;
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
    if (line) ctx.fillText(line, px + 8 * sx, ly);

    ctx.fillStyle = '#555';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText('[E/ENTER] назад', px + 8 * sx, py + ph - 8 * sy);

  } else if (state.npcMenuTab === 'quest') {
    // Quest tab: paginated, one quest per page with word wrap
    const active = state.quests.filter(q => !q.done);
    const total = active.length;
    ctx.font = `${8 * sy}px monospace`;
    if (total === 0) {
      ctx.fillStyle = '#888';
      ctx.fillText('Нет активных заданий.', px + 8 * sx, py + 40 * sy);
    } else {
      const page = Math.min(state.questPage, total - 1);
      const q = active[page];
      // Header: page indicator
      ctx.fillStyle = '#888';
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText(`${page + 1} / ${total}`, px + pw - 40 * sx, py + 10 * sy);
      // Quest giver
      ctx.fillStyle = '#8af';
      ctx.font = `${8 * sy}px monospace`;
      ctx.fillText(`От: ${q.giverName ?? '???'}`, px + 8 * sx, py + 38 * sy);
      // Quest description — word-wrapped
      ctx.fillStyle = '#dda';
      const maxW = pw - 16 * sx;
      const words = q.desc.split(' ');
      let line = '';
      let ly = py + 54 * sy;
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
      if (q.killNeeded !== undefined) {
        ly += 4 * sy;
        ctx.fillStyle = '#aaa';
        ctx.fillText(`Прогресс: ${q.killCount ?? 0}/${q.killNeeded}`, px + 8 * sx, ly);
      }
    }
    ctx.fillStyle = '#555';
    ctx.font = `${7 * sy}px monospace`;
    const hint = total > 1 ? '[W/S] листать  |  [E/ENTER] назад' : '[E/ENTER] назад';
    ctx.fillText(hint, px + 8 * sx, py + ph - 8 * sy);

  } else if (state.npcMenuTab === 'trade') {
    // ── Fullscreen trade: two 5×5 grids ──
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    // Overdraw fullscreen background
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, cw, ch);

    const GRID = 5;
    const cellSz = 22 * sx;
    const gap = 24 * sx;               // gap between grids
    const gridTotal = GRID * cellSz;
    const totalW = gridTotal * 2 + gap;
    const startX = (cw - totalW) / 2;
    const startY = 28 * sy;

    const npcInv = npc.inventory ?? [];
    const plrInv = player.inventory ?? [];

    // ── Title (centered) ──
    ctx.fillStyle = '#aaa';
    ctx.font = `${9 * sy}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ТОРГОВЛЯ', cw / 2, 10 * sy);
    ctx.textAlign = 'left';

    // ── Headers with money ──
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillStyle = '#ee4';
    ctx.fillText(`Вы: ₽${player.money ?? 0}`, startX, startY - 8 * sy);
    ctx.fillStyle = '#8cf';
    ctx.fillText(`${npc.name?.split(' ')[0] ?? 'NPC'}: ₽${npc.money ?? 0}`, startX + gridTotal + gap, startY - 8 * sy);

    // ── Draw grid helper ──
    const drawGrid = (inv: { defId: string; count: number }[], gx: number, side: string) => {
      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          const idx = row * GRID + col;
          const cx = gx + col * cellSz;
          const cy = startY + row * cellSz;
          const selected = state.tradeSide === side && state.tradeCursorX === col && state.tradeCursorY === row;

          ctx.fillStyle = selected ? 'rgba(120,120,50,0.5)' : 'rgba(30,30,30,0.8)';
          ctx.fillRect(cx, cy, cellSz - 2, cellSz - 2);
          ctx.strokeStyle = selected ? '#ee4' : '#444';
          ctx.strokeRect(cx, cy, cellSz - 2, cellSz - 2);

          if (idx < inv.length) {
            const item = inv[idx];
            const def = ITEMS[item.defId];
            ctx.fillStyle = selected ? '#ee4' : '#ccc';
            ctx.font = `${6 * sy}px monospace`;
            const name = (def?.name ?? item.defId).slice(0, 6);
            ctx.fillText(name, cx + 2 * sx, cy + 10 * sy);
            if (item.count > 1) {
              ctx.fillStyle = '#8a8';
              ctx.font = `${5 * sy}px monospace`;
              ctx.fillText(`×${item.count}`, cx + cellSz - 16 * sx, cy + cellSz - 5 * sy);
            }
          }
        }
      }
    };

    // Player grid (left), NPC grid (right)
    drawGrid(plrInv, startX, 'player');
    drawGrid(npcInv, startX + gridTotal + gap, 'npc');

    // ── Selected item description ──
    const descY = startY + GRID * cellSz + 6 * sy;
    const curIdx = state.tradeCursorY * GRID + state.tradeCursorX;
    const curInv = state.tradeSide === 'player' ? plrInv : npcInv;
    ctx.textAlign = 'center';
    if (curIdx < curInv.length) {
      const item = curInv[curIdx];
      const def = ITEMS[item.defId];
      if (def) {
        ctx.fillStyle = '#ccc';
        ctx.font = `${8 * sy}px monospace`;
        ctx.fillText(`${def.name} ×${item.count}`, cw / 2, descY);
        ctx.fillStyle = '#888';
        ctx.font = `${7 * sy}px monospace`;
        ctx.fillText(def.desc, cw / 2, descY + 10 * sy);
        ctx.fillStyle = '#da4';
        ctx.fillText(`Цена: ${def.value ?? 0}₽`, cw / 2, descY + 20 * sy);
        ctx.fillStyle = '#6a6';
        ctx.fillText(state.tradeSide === 'npc' ? '[E] купить' : '[E] продать', cw / 2, descY + 30 * sy);
      }
    } else {
      ctx.fillStyle = '#555';
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText('Пустой слот', cw / 2, descY + 6 * sy);
    }
    ctx.textAlign = 'left';

    // ── Hint (bottom-right, stacked) ──
    ctx.fillStyle = '#555';
    ctx.font = `${6 * sy}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('WASD — курсор', cw - 8 * sx, ch - 24 * sy);
    ctx.fillText('E — купить/продать', cw - 8 * sx, ch - 16 * sy);
    ctx.fillText('ENTER — назад', cw - 8 * sx, ch - 8 * sy);
    ctx.textAlign = 'left';
  }
}

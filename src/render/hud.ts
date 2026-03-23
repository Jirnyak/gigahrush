/* ── HUD overlay: needs bars, minimap, messages, inventory ───── */

import { SCR_W, SCR_H } from './engine';
import {
  type Entity, type GameState, EntityType, Cell, Feature,
  RoomType, W, Faction, ItemType,
  ZoneFaction,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS, WEAPON_STATS } from '../data/catalog';
import { FACTION_NAMES, OCCUPATION_NAMES } from '../data/relations';
import { getEquippedDurability, countAmmo } from '../systems/inventory';
import { xpForLevel } from '../systems/rpg';
import { drawDebugOverlay } from '../systems/debug';

const BAR_W = 50, BAR_H = 5;
const MAP_SIZE = 80;

/* ── 64 unique zone colors (HSL-based palette) ─────────────── */
const ZONE_COLORS: [number, number, number][] = [];
for (let i = 0; i < 64; i++) {
  const hue = (i * 137.508) % 360; // golden angle for max spread
  const sat = 0.35 + (i % 3) * 0.15;
  const lit = 0.25 + (i % 4) * 0.06;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lit - c / 2;
  let r1: number, g1: number, b1: number;
  if      (hue < 60)  { r1 = c; g1 = x; b1 = 0; }
  else if (hue < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hue < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hue < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hue < 300) { r1 = x; g1 = 0; b1 = c; }
  else                { r1 = c; g1 = 0; b1 = x; }
  ZONE_COLORS.push([
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ]);
}

const ZONE_FACTION_NAMES: Record<ZoneFaction, string> = {
  [ZoneFaction.CITIZEN]: 'Граждане',
  [ZoneFaction.LIQUIDATOR]: 'Ликвидаторы',
  [ZoneFaction.CULTIST]: 'Культисты',
  [ZoneFaction.SAMOSBOR]: 'Самосбор',
  [ZoneFaction.WILD]: 'Дикие',
};
const MSG_MAX = 6;



/* ── The HUD is drawn on the 2D canvas overlaying the 3D view ── */
export function drawHUD(
  ctx: CanvasRenderingContext2D,
  _scaleX: number, _scaleY: number,
  player: Entity,
  state: GameState,
  world: World,
  entities: Entity[],
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Scale to match low-res viewport
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const sx = w / SCR_W;
  const sy = h / SCR_H;

  ctx.font = `${10 * sy}px monospace`;
  ctx.textBaseline = 'top';

  // ── Bottom status bar ────────────────────────────────────
  const barY = h - 32 * sy;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, barY, w, 32 * sy);

  if (player.needs) {
    const bars: [string, number, string][] = [
      ['ХП',   (player.hp ?? 100), '#e44'],
    ];
    if (player.rpg) {
      bars.push(['ПСИ', (player.rpg.psi / player.rpg.maxPsi) * 100, '#a4f']);
    }
    bars.push(
      ['ЕДА',  player.needs.food,  '#8a4'],
      ['ВОДА', player.needs.water, '#48c'],
      ['СОН',  player.needs.sleep, '#a8f'],
      ['ТУАЛ', Math.max(0, 100 - player.needs.pee), '#da4'],
    );
    if (player.rpg) {
      const xpNeeded = xpForLevel(player.rpg.level + 1);
      const xpPct = xpNeeded > 0 ? (player.rpg.xp / xpNeeded) * 100 : 0;
      bars.push(['XP', xpPct, '#af4']);
    }
    bars.forEach(([label, val, color], i) => {
      const barSpacing = bars.length > 5 ? 44 : 62;
      const barW = bars.length > 5 ? 36 : BAR_W;
      const bx = 8 * sx + i * barSpacing * sx;
      const by = barY + 4 * sy;
      // Label
      ctx.fillStyle = '#aaa';
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText(label, bx, by);
      // Bar bg
      ctx.fillStyle = '#222';
      ctx.fillRect(bx, by + 9 * sy, barW * sx, BAR_H * sy);
      // Bar fill
      ctx.fillStyle = color;
      ctx.fillRect(bx, by + 9 * sy, barW * sx * val / 100, BAR_H * sy);
    });
  }

  // Weapon display with durability/ammo — right side, above status bar
  const wpn = player.weapon ? ITEMS[player.weapon]?.name : 'Кулаки';
  const ws = WEAPON_STATS[player.weapon ?? ''] ?? WEAPON_STATS[''];
  ctx.fillStyle = '#ccc';
  ctx.font = `${8 * sy}px monospace`;
  ctx.textAlign = 'right';
  const weaponY = barY - 14 * sy;
  if (ws.isRanged) {
    const ammo = countAmmo(player);
    ctx.fillText(`${wpn} (${ws.dmg}) 🔫${ammo}`, w - 8 * sx, weaponY);
  } else {
    const dur = getEquippedDurability(player);
    if (dur) {
      ctx.fillText(`${wpn} (${ws.dmg}) [${dur.cur}/${dur.max}]`, w - 8 * sx, weaponY);
    } else {
      ctx.fillText(`${wpn} (${ws.dmg})`, w - 8 * sx, weaponY);
    }
  }
  ctx.textAlign = 'left';

  // Universal [E] interaction prompt (color changes per target object)
  {
    const lookX = player.x + Math.cos(player.angle) * 1.5;
    const lookY = player.y + Math.sin(player.angle) * 1.5;
    const lci = world.idx(Math.floor(lookX), Math.floor(lookY));
    const cell = world.cells[lci];
    let targetId = 0; // unique id for color hashing
    let canInteract = false;
    if (cell === Cell.DOOR) { canInteract = true; targetId = lci + 100000; }
    else if (cell === Cell.LIFT || world.features[lci] === Feature.LIFT_BUTTON) { canInteract = true; targetId = lci + 200000; }
    if (!canInteract) {
      let bestD = 2.0;
      for (const e of entities) {
        if (!e.alive || e.type !== EntityType.NPC) continue;
        const d = world.dist(lookX, lookY, e.x, e.y);
        if (d < bestD) { bestD = d; canInteract = true; targetId = e.id; }
      }
    }
    if (canInteract) {
      // Deterministic color from targetId
      const h0 = ((targetId * 2654435761) >>> 0) % 360;
      const er = Math.round(180 + 75 * Math.cos(h0 * Math.PI / 180));
      const eg = Math.round(180 + 75 * Math.cos((h0 + 120) * Math.PI / 180));
      const eb = Math.round(180 + 75 * Math.cos((h0 + 240) * Math.PI / 180));
      ctx.fillStyle = `rgb(${er},${eg},${eb})`;
      ctx.font = `${9 * sy}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('[E]', w / 2, h / 2 + 30 * sy);
      ctx.textAlign = 'left';
    }
  }

  // ── Messages ─────────────────────────────────────────────
  const now = state.time;
  let my = 4 * sy;
  ctx.font = `${8 * sy}px monospace`;
  for (let i = state.msgs.length - 1; i >= Math.max(0, state.msgs.length - MSG_MAX); i--) {
    const m = state.msgs[i];
    const age = now - m.time;
    if (age > 8) continue;
    const alpha = age > 6 ? 1 - (age - 6) / 2 : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, 4 * sx, my);
    my += 10 * sy;
  }
  ctx.globalAlpha = 1;

  // ── Crosshair ────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(200,200,200,0.5)';
  ctx.lineWidth = 1;
  const cx = w / 2, cy = h / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 6 * sx, cy); ctx.lineTo(cx + 6 * sx, cy);
  ctx.moveTo(cx, cy - 6 * sy); ctx.lineTo(cx, cy + 6 * sy);
  ctx.stroke();

  // ── Minimap (if toggled) ─────────────────────────────────
  if (state.mapMode === 1) {
    drawMinimap(ctx, world, entities, player, sx, sy);
  } else if (state.mapMode === 2) {
    drawFullMap(ctx, world, entities, player, sx, sy);
  }

  // ── Inventory (if toggled) ───────────────────────────────
  if (state.showInventory) {
    drawInventory(ctx, player, state, sx, sy);
  }

  // ── Quest log (if toggled) ───────────────────────────────
  if (state.showQuests) {
    drawQuestLog(ctx, state, sx, sy);
  }

  // ── Game menu (ESC) ──────────────────────────────────────
  if (state.showMenu) {
    drawGameMenu(ctx, state, sx, sy);
  }

  // ── NPC interaction menu ─────────────────────────────────
  if (state.showNpcMenu) {
    drawNpcMenu(ctx, player, state, entities, sx, sy);
  }

  // ── Zone info + time + room (top-left) ──────────────────
  {
    const pci = world.idx(Math.floor(player.x), Math.floor(player.y));
    const zid = world.zoneMap[pci];
    const zone = world.zones[zid];

    // Game clock + day counter — just above status bar
    const hh = String(state.clock.hour).padStart(2, '0');
    const mm = String(state.clock.minute).padStart(2, '0');
    const day = Math.floor(state.clock.totalMinutes / 1440);
    ctx.fillStyle = '#aac';
    ctx.font = `${9 * sy}px monospace`;
    ctx.fillText(`День ${day}  ${hh}:${mm}`, 4 * sx, barY - 42 * sy);

    // Zone
    if (zone) {
      const [zr, zg, zb] = ZONE_COLORS[zid % 64];
      const fLabel = ZONE_FACTION_NAMES[zone.faction];
      ctx.fillStyle = `rgb(${zr},${zg},${zb})`;
      ctx.font = `${8 * sy}px monospace`;
      ctx.fillText(`■ Зона ${zid + 1}  Ур.${zone.level ?? 1}`, 4 * sx, barY - 32 * sy);
      ctx.fillStyle = zone.faction === ZoneFaction.SAMOSBOR ? '#c4f' : '#aaa';
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText(fLabel, 4 * sx, barY - 22 * sy);
    }

    // Room info
    const room = world.roomAt(player.x, player.y);
    if (room) {
      ctx.fillStyle = '#888';
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText(room.name, 4 * sx, barY - 12 * sy);
    }
  }

  // ── SAMOSBOR warning ─────────────────────────────────────
  if (state.samosborActive) {
    ctx.fillStyle = `rgba(255,40,40,${0.3 + Math.sin(now * 8) * 0.2})`;
    ctx.font = `bold ${16 * sy}px monospace`;
    ctx.fillText('⚠ САМОСБОР ⚠', w / 2 - 60 * sx, 20 * sy);
  }

  // ── Game over ────────────────────────────────────────────
  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c00';
    ctx.font = `bold ${24 * sy}px monospace`;
    ctx.fillText('ВЫ ПОГИБЛИ', w / 2 - 80 * sx, h / 2 - 20 * sy);
    ctx.fillStyle = '#888';
    ctx.font = `${10 * sy}px monospace`;
    ctx.fillText('Хрущ поглотил ещё одного', w / 2 - 90 * sx, h / 2 + 10 * sy);
    ctx.fillText('[R] — заново', w / 2 - 40 * sx, h / 2 + 30 * sy);
  }

  // ── Debug screen (~) ─────────────────────────────────────
  if (state.showDebug) {
    drawDebugOverlay(ctx, sx, sy, w, h, world, entities, state.debugSel);
  }

  ctx.restore();
}

/* ── Shared map renderer (used by minimap + fullmap) ──────────── */
function drawMap(
  ctx: CanvasRenderingContext2D,
  world: World, entities: Entity[], player: Entity,
  _sx: number, _sy: number,
  mapX: number, mapY: number, mapW: number, mapH: number,
  radius: number, bgAlpha: number,
): void {
  ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`;
  ctx.fillRect(mapX, mapY, mapW, mapH);

  const pxI = Math.floor(player.x);
  const pyI = Math.floor(player.y);
  const cellW = mapW / (radius * 2);
  const cellH = mapH / (radius * 2);

  for (let dy = -radius; dy < radius; dy++) {
    for (let dx = -radius; dx < radius; dx++) {
      const wx = ((pxI + dx) % W + W) % W;
      const wy = ((pyI + dy) % W + W) % W;
      const ci = wy * W + wx;
      const cell = world.cells[ci];
      if (cell === Cell.WALL) continue;
      if (cell === Cell.ABYSS) {
        ctx.fillStyle = '#100810';
        ctx.fillRect(mapX + (dx + radius) * cellW, mapY + (dy + radius) * cellH, cellW + 0.5, cellH + 0.5);
        continue;
      }
      if (cell === Cell.LIFT) {
        ctx.fillStyle = '#cc0';
        ctx.fillRect(mapX + (dx + radius) * cellW, mapY + (dy + radius) * cellH, cellW + 0.5, cellH + 0.5);
        continue;
      }
      if (cell === Cell.WATER) {
        ctx.fillStyle = '#235';
        ctx.fillRect(mapX + (dx + radius) * cellW, mapY + (dy + radius) * cellH, cellW + 0.5, cellH + 0.5);
        continue;
      }

      const rid = world.roomMap[ci];
      let cr: number, cg: number, cb: number;
      if (rid >= 0) {
        const r = world.rooms[rid];
        if (r) {
          switch (r.type) {
            case RoomType.LIVING:     cr = 68; cg = 68; cb = 102; break;
            case RoomType.KITCHEN:    cr = 85; cg = 85; cb = 68; break;
            case RoomType.BATHROOM:   cr = 68; cg = 85; cb = 85; break;
            case RoomType.STORAGE:    cr = 85; cg = 68; cb = 51; break;
            case RoomType.MEDICAL:    cr = 68; cg = 102; cb = 102; break;
            case RoomType.COMMON:     cr = 68; cg = 68; cb = 68; break;
            case RoomType.PRODUCTION: cr = 85; cg = 85; cb = 68; break;
            default:                  cr = 51; cg = 51; cb = 51;
          }
        } else { cr = 51; cg = 51; cb = 51; }
      } else {
        const zid = world.zoneMap[ci];
        const [zr, zg, zb] = ZONE_COLORS[zid % 64];
        cr = zr >> 1; cg = zg >> 1; cb = zb >> 1;
      }
      if (cell === Cell.DOOR) { cr = 136; cg = 100; cb = 68; }

      if (world.fog[ci] > 50) {
        const f = world.fog[ci] / 255;
        cr = Math.round(cr * (1 - f) + 80 * f);
        cg = Math.round(cg * (1 - f) + 20 * f);
        cb = Math.round(cb * (1 - f) + 120 * f);
      }

      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(mapX + (dx + radius) * cellW, mapY + (dy + radius) * cellH, cellW + 0.5, cellH + 0.5);
    }
  }

  // Entities
  for (const e of entities) {
    if (!e.alive || e.type === EntityType.PLAYER) continue;
    const edx = world.delta(pxI, Math.floor(e.x));
    const edy = world.delta(pyI, Math.floor(e.y));
    if (Math.abs(edx) > radius || Math.abs(edy) > radius) continue;

    ctx.fillStyle = e.type === EntityType.NPC ? '#4a4'
                  : e.type === EntityType.MONSTER ? '#e33'
                  : '#dd4';
    const esx = mapX + (edx + radius) * cellW;
    const esy = mapY + (edy + radius) * cellH;
    ctx.fillRect(esx - 1, esy - 1, 3, 3);
  }

  // Player dot
  const pcx = mapX + radius * cellW;
  const pcy = mapY + radius * cellH;
  ctx.fillStyle = '#fff';
  ctx.fillRect(pcx - 1, pcy - 1, 3, 3);
  // Direction indicator
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(pcx, pcy);
  ctx.lineTo(
    pcx + Math.cos(player.angle) * 4 * cellW,
    pcy + Math.sin(player.angle) * 4 * cellH,
  );
  ctx.stroke();
}

/* ── Minimap ──────────────────────────────────────────────────── */
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  world: World, entities: Entity[], player: Entity,
  sx: number, sy: number,
): void {
  const mw = MAP_SIZE * sx, mh = MAP_SIZE * sy;
  const mx = ctx.canvas.width - mw - 4 * sx;
  const my = 4 * sy;
  drawMap(ctx, world, entities, player, sx, sy, mx, my, mw, mh, 40, 0.75);
}

/* ── Full world map (fullscreen) ─────────────────────────────── */
function drawFullMap(
  ctx: CanvasRenderingContext2D,
  world: World, entities: Entity[], player: Entity,
  sx: number, sy: number,
): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const pad = 4 * sx;
  const mapW = cw - pad * 2;
  const mapH = ch - pad * 2;
  drawMap(ctx, world, entities, player, sx, sy, pad, pad, mapW, mapH, 200, 0.85);

  ctx.fillStyle = '#666';
  ctx.font = `${8 * sy}px monospace`;
  ctx.fillText('[M] закрыть', pad + 4, pad + mapH - 4);
}

/* ── Inventory panel (fullscreen) ──────────────────────────────── */
function drawInventory(
  ctx: CanvasRenderingContext2D,
  player: Entity, state: GameState,
  sx: number, sy: number,
): void {
  const inv = player.inventory ?? [];
  const GRID = 5;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;

  // Fullscreen background
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(0, 0, cw, ch);

  // Title + money + close hint
  ctx.fillStyle = '#aaa';
  ctx.font = `${9 * sy}px monospace`;
  ctx.fillText('ИНВЕНТАРЬ', 8 * sx, 6 * sy);
  ctx.fillStyle = '#ee4';
  ctx.fillText(`₽${player.money ?? 0}`, 88 * sx, 6 * sy);
  ctx.fillStyle = '#555';
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
      if (def.use || def.type === ItemType.WEAPON) {
        ctx.fillStyle = '#6a6';
        ctx.fillText('[E] использовать', descX, descY + 30 * sy);
      }
    }
  } else {
    ctx.fillStyle = '#555';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText('Пустой слот', descX, descY + 6 * sy);
  }
  ctx.textAlign = 'left';

  // ── RIGHT COLUMN: stats ──────────────────────────────────
  const stX = gridX + gridW + 16 * sx;
  const barW = cw - stX - 16 * sx;
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
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText(`${label}: ${Math.round(val)}`, stX, stY);
      stY += 9 * sy;
      drawStatBar(ctx, stX, stY, barW, 4 * sy, val / 100, color);
      stY += 8 * sy;
    }
  }

  // Equipped weapon info — one line, right side
  stY += 4 * sy;
  const wpn2 = player.weapon ? ITEMS[player.weapon]?.name : 'Кулаки';
  const ws2 = WEAPON_STATS[player.weapon ?? ''] ?? WEAPON_STATS[''];
  let durLabel: string;
  if (ws2.isRanged) {
    const ammo = countAmmo(player);
    durLabel = `Патроны:${ammo}`;
  } else {
    const dur2 = getEquippedDurability(player);
    durLabel = dur2 ? `Прочн:${dur2.cur}/${dur2.max}` : 'Прочн:∞';
  }
  ctx.fillStyle = '#ccc';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText(`${wpn2}  Урон:${ws2.dmg}  ${durLabel}`, stX, stY);
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

/* ── Quest log panel — paginated, one quest per page ──────────── */
function drawQuestLog(
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

/* ── Game menu (ESC) ──────────────────────────────────────────── */
function drawGameMenu(
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

/* ── NPC interaction menu ─────────────────────────────────────── */
function drawNpcMenu(
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

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#664';
  ctx.strokeRect(px, py, pw, ph);

  // NPC name header
  const fName = npc.faction !== undefined ? FACTION_NAMES[npc.faction as Faction] : '';
  const oName = npc.occupation !== undefined ? OCCUPATION_NAMES[npc.occupation] : '';
  ctx.fillStyle = '#ee4';
  ctx.font = `${10 * sy}px monospace`;
  ctx.fillText(npc.name ?? '???', px + 8 * sx, py + 10 * sy);
  ctx.fillStyle = '#888';
  ctx.font = `${7 * sy}px monospace`;
  ctx.fillText(`${fName} · ${oName}`, px + 8 * sx, py + 22 * sy);

  if (state.npcMenuTab === 'main') {
    // Main menu: Talk, Quest, Trade
    const items = ['Разговор', 'Задание', 'Обмен'];
    ctx.font = `${9 * sy}px monospace`;
    for (let i = 0; i < items.length; i++) {
      const selected = i === state.npcMenuSel;
      const yy = py + 40 * sy + i * 16 * sy;
      ctx.fillStyle = selected ? '#ee4' : '#aaa';
      ctx.fillText(`${selected ? '▶ ' : '  '}${items[i]}`, px + 16 * sx, yy);
    }
    ctx.fillStyle = '#555';
    ctx.font = `${7 * sy}px monospace`;
    ctx.fillText('W/S — выбор  |  E — подтвердить  |  ENTER — закрыть', px + 8 * sx, py + ph - 8 * sy);

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
    // Trade tab: two columns
    const colW = (pw - 16 * sx) / 2;
    const npcInv = npc.inventory ?? [];
    const plrInv = player.inventory ?? [];
    const lineH = 11 * sy;
    let ty = py + 36 * sy;

    // Headers
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillStyle = state.tradeMode === 'npc' ? '#ee4' : '#888';
    ctx.fillText(`${npc.name?.split(' ')[0] ?? 'NPC'}:`, px + 8 * sx, ty);
    ctx.fillStyle = state.tradeMode === 'player' ? '#ee4' : '#888';
    ctx.fillText('Ваши:', px + 8 * sx + colW, ty);
    ty += 12 * sy;

    // NPC items
    ctx.font = `${7 * sy}px monospace`;
    for (let i = 0; i < Math.max(npcInv.length, 6); i++) {
      const selected = state.tradeMode === 'npc' && i === state.tradeSel;
      const iy = ty + i * lineH;
      if (iy > py + ph - 24 * sy) break;
      if (i < npcInv.length) {
        const def = ITEMS[npcInv[i].defId];
        ctx.fillStyle = selected ? '#ee4' : '#ccc';
        ctx.fillText(`${selected ? '▶' : ' '}${def?.name ?? npcInv[i].defId} ×${npcInv[i].count}`, px + 8 * sx, iy);
      } else {
        ctx.fillStyle = '#333';
        ctx.fillText('  —', px + 8 * sx, iy);
      }
    }

    // Player items
    for (let i = 0; i < Math.max(plrInv.length, 6); i++) {
      const selected = state.tradeMode === 'player' && i === state.tradeSel;
      const iy = ty + i * lineH;
      if (iy > py + ph - 24 * sy) break;
      if (i < plrInv.length) {
        const def = ITEMS[plrInv[i].defId];
        ctx.fillStyle = selected ? '#ee4' : '#ccc';
        ctx.fillText(`${selected ? '▶' : ' '}${def?.name ?? plrInv[i].defId} ×${plrInv[i].count}`, px + 8 * sx + colW, iy);
      } else {
        ctx.fillStyle = '#333';
        ctx.fillText('  —', px + 8 * sx + colW, iy);
      }
    }

    ctx.fillStyle = '#555';
    ctx.font = `${6 * sy}px monospace`;
    ctx.fillText('A/D — колонка | W/S — выбор | E — обменять | ENTER — назад', px + 8 * sx, py + ph - 8 * sy);
  }
}

/* ── NPC info tooltip — REMOVED (shown in NPC interaction menu instead) */

/* ── HUD overlay: needs bars, minimap, messages, inventory ───── */

import { SCR_W, SCR_H } from './engine';
import {
  type Entity, type GameState, EntityType, Cell, Feature,
  ZoneFaction, LiftDirection,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS, WEAPON_STATS } from '../data/catalog';
import { getEquippedDurability, getEquippedToolDurability, countAmmo } from '../systems/inventory';
import { xpForLevel } from '../systems/rpg';
import { drawDebugOverlay } from '../systems/debug';
import { ZONE_COLORS, drawMinimap, drawFullMap } from './map_ui';
import { drawInventory } from './stats_ui';
import { drawQuestLog } from './quest_ui';
import { drawLogMenu } from './log_ui';
import { drawFactionMenu } from './factions_ui';
import { drawGameMenu } from './menu_ui';
import { drawNpcMenu } from './npc_ui';

const BAR_W = 50, BAR_H = 5;

function toPercent(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, current / max * 100));
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
    const bars: [string, number, number, string][] = [
      ['ХП', player.hp ?? 100, player.maxHp ?? 100, '#e44'],
    ];
    if (player.rpg) {
      bars.push(['ПСИ', player.rpg.psi, player.rpg.maxPsi, '#a4f']);
    }
    bars.push(
      ['ЕДА', player.needs.food, 100, '#8a4'],
      ['ВОДА', player.needs.water, 100, '#48c'],
      ['СОН', player.needs.sleep, 100, '#a8f'],
      ['ТУАЛ', Math.max(0, 100 - player.needs.pee), 100, '#da4'],
    );
    if (player.rpg) {
      bars.push(['XP', player.rpg.xp, xpForLevel(player.rpg.level + 1), '#af4']);
    }
    bars.forEach(([label, current, max, color], i) => {
      const barSpacing = bars.length > 5 ? 44 : 62;
      const barW = bars.length > 5 ? 36 : BAR_W;
      const bx = 8 * sx + i * barSpacing * sx;
      const by = barY + 4 * sy;
      const pct = toPercent(current, max);
      // Label
      ctx.fillStyle = '#aaa';
      ctx.font = `${7 * sy}px monospace`;
      ctx.fillText(label, bx, by);
      // Bar bg
      ctx.fillStyle = '#222';
      ctx.fillRect(bx, by + 9 * sy, barW * sx, BAR_H * sy);
      // Bar fill
      ctx.fillStyle = color;
      ctx.fillRect(bx, by + 9 * sy, barW * sx * pct / 100, BAR_H * sy);
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
  const toolY = weaponY - 10 * sy;
  if (player.tool) {
    const toolName = ITEMS[player.tool]?.name ?? player.tool;
    const toolDur = getEquippedToolDurability(player);
    const toolLabel = toolDur ? `${toolName} [${Math.max(0, Math.ceil(toolDur.cur))}/${toolDur.max}]` : toolName;
    ctx.fillStyle = '#8cf';
    ctx.fillText(toolLabel, w - 8 * sx, toolY);
    ctx.fillStyle = '#ccc';
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
    let liftHint = '';
    if (cell === Cell.DOOR && world.doors.has(lci)) { canInteract = true; targetId = lci + 100000; }
    else if (cell === Cell.LIFT || world.features[lci] === Feature.LIFT_BUTTON) {
      canInteract = true; targetId = lci + 200000;
      liftHint = world.liftDir[lci] === LiftDirection.UP ? ' ↑' : ' ↓';
    }
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
      ctx.fillText(`[E]${liftHint}`, w / 2, h / 2 + 30 * sy);
      ctx.textAlign = 'left';
    }
  }

  // ── Messages ─────────────────────────────────────────────
  const now = state.time;
  let my = 4 * sy;
  ctx.font = `${8 * sy}px monospace`;
  const _day = Math.floor(state.clock.totalMinutes / 1440);
  const _hh = String(state.clock.hour).padStart(2, '0');
  const _mm = String(state.clock.minute).padStart(2, '0');
  const _stamp = `[Д${_day} ${_hh}:${_mm}] `;
  for (let i = state.msgs.length - 1; i >= Math.max(0, state.msgs.length - MSG_MAX); i--) {
    const m = state.msgs[i];
    const age = now - m.time;
    if (age > 8) continue;
    const alpha = age > 6 ? 1 - (age - 6) / 2 : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#666';
    ctx.fillText(_stamp, 4 * sx, my);
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, 4 * sx + ctx.measureText(_stamp).width, my);
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
    drawMinimap(ctx, world, entities, player, sx, sy, state.quests);
  } else if (state.mapMode === 2) {
    drawFullMap(ctx, world, entities, player, sx, sy, state.quests);
  }

  // ── Inventory (if toggled) ───────────────────────────────
  if (state.showInventory) {
    drawInventory(ctx, player, state, sx, sy);
  }

  // ── Quest log (if toggled) ───────────────────────────────
  if (state.showQuests) {
    drawQuestLog(ctx, state, sx, sy);
  }

  // ── Faction relations matrix (F) ─────────────────────────
  if (state.showFactions) {
    drawFactionMenu(ctx, player, entities, sx, sy);
  }

  // ── Message log (L) ─────────────────────────────────────
  if (state.showLog) {
    drawLogMenu(ctx, state, sx, sy);
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

  // ── Damage vignette (procedural blood edges) ──────────────
  if (state.dmgFlash > 0) {
    drawDamageVignette(ctx, w, h, state.dmgFlash, state.dmgSeed, state.time);
  }

  // ── Game over ────────────────────────────────────────────
  if (state.gameOver) {
    // No full-screen black — world is still visible through death camera
    // Darken edges gradually
    const deathAlpha = Math.min(0.5, state.deathTimer * 0.15);
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.min(w, h) * 0.7);
    grd.addColorStop(0, `rgba(0,0,0,0)`);
    grd.addColorStop(1, `rgba(0,0,0,${deathAlpha})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // Pulsing red text
    const textAlpha = 0.6 + Math.sin(state.time * 3) * 0.3;
    ctx.fillStyle = `rgba(200,0,0,${textAlpha})`;
    ctx.font = `bold ${24 * sy}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ВЫ ПОГИБЛИ', w / 2, h / 2 - 20 * sy);
    ctx.fillStyle = `rgba(136,136,136,${Math.min(1, state.deathTimer * 0.5)})`;
    ctx.font = `${10 * sy}px monospace`;
    ctx.fillText('Хрущ поглотил ещё одного', w / 2, h / 2 + 10 * sy);
    ctx.fillText('[R] — заново', w / 2, h / 2 + 30 * sy);
    ctx.textAlign = 'left';
  }

  // ── Debug screen (~) ─────────────────────────────────────
  if (state.showDebug) {
    drawDebugOverlay(ctx, sx, sy, w, h, world, entities, state.debugSel);
  }

  // ── Sleep overlay (Z held) ───────────────────────────────
  if (state.sleeping) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a8f';
    ctx.font = `bold ${16 * sy}px monospace`;
    ctx.textAlign = 'center';
    const sleepPct = Math.floor(player.needs?.sleep ?? 0);
    ctx.fillText(`Сон... ${sleepPct}%`, w / 2, h / 2 - 10 * sy);
    ctx.fillStyle = '#666';
    ctx.font = `${8 * sy}px monospace`;
    ctx.fillText('[Z] — отпустите чтобы проснуться', w / 2, h / 2 + 10 * sy);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

/* ── Procedural damage vignette (blood vessel edges) ──────────── */
function drawDamageVignette(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  intensity: number, seed: number, time: number,
): void {
  ctx.save();

  // Edge darkening — radial gradient from center
  const darkA = intensity * 0.4;
  const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.min(w, h) * 0.65);
  grd.addColorStop(0, `rgba(0,0,0,0)`);
  grd.addColorStop(0.6, `rgba(40,0,0,${darkA * 0.3})`);
  grd.addColorStop(1, `rgba(0,0,0,${darkA})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Red overlay with radial gradient (transparent center, red edges)
  const redA = intensity * 0.5;
  const grd2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.min(w, h) * 0.6);
  grd2.addColorStop(0, `rgba(180,0,0,0)`);
  grd2.addColorStop(0.5, `rgba(140,0,0,${redA * 0.2})`);
  grd2.addColorStop(1, `rgba(120,0,0,${redA})`);
  ctx.fillStyle = grd2;
  ctx.fillRect(0, 0, w, h);

  // Procedural blood vessel lines from edges
  ctx.globalCompositeOperation = 'source-over';
  const numVeins = 8 + Math.floor(intensity * 12);
  const s = seed;
  for (let i = 0; i < numVeins; i++) {
    // Seeded pseudo-random for consistent pattern per hit
    const r1 = ((Math.sin(s + i * 127.1) * 43758.5453) % 1 + 1) % 1;
    const r2 = ((Math.sin(s + i * 269.5 + 311.7) * 43758.5453) % 1 + 1) % 1;
    const r3 = ((Math.sin(s + i * 419.2 + 631.2) * 43758.5453) % 1 + 1) % 1;
    const r4 = ((Math.sin(s + i * 173.9 + 967.3) * 43758.5453) % 1 + 1) % 1;

    // Start from a random edge
    const edge = Math.floor(r1 * 4);
    let sx: number, sy: number;
    if (edge === 0) { sx = r2 * w; sy = 0; }           // top
    else if (edge === 1) { sx = r2 * w; sy = h; }      // bottom
    else if (edge === 2) { sx = 0; sy = r2 * h; }      // left
    else { sx = w; sy = r2 * h; }                       // right

    // Draw branching vein toward center
    const veinAlpha = intensity * (0.2 + r3 * 0.4);
    const veinLen = (0.1 + r4 * 0.25) * Math.min(w, h);
    const toX = w / 2 + (r3 - 0.5) * w * 0.3;
    const toY = h / 2 + (r4 - 0.5) * h * 0.3;
    const dx = toX - sx, dy = toY - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist, ny = dy / dist;

    ctx.beginPath();
    ctx.moveTo(sx, sy);

    // Main vein with slight organic wobble
    const steps = 6;
    let cx = sx, cy = sy;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const wobbleT = Math.sin(time * 3 + i * 2 + j) * (4 + r2 * 8);
      cx = sx + nx * veinLen * t + ny * wobbleT;
      cy = sy + ny * veinLen * t - nx * wobbleT;
      ctx.lineTo(cx, cy);
    }

    const lineW = 1 + r3 * 2.5 * intensity;
    ctx.strokeStyle = `rgba(160,0,10,${veinAlpha})`;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Thinner branch
    if (r2 > 0.4 && i < numVeins - 2) {
      const bx = sx + nx * veinLen * 0.5 + ny * (r4 - 0.5) * 20;
      const by = sy + ny * veinLen * 0.5 - nx * (r4 - 0.5) * 20;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + nx * veinLen * 0.2 + ny * (r1 - 0.5) * 30,
                 by + ny * veinLen * 0.2 - nx * (r1 - 0.5) * 30);
      ctx.strokeStyle = `rgba(130,0,10,${veinAlpha * 0.6})`;
      ctx.lineWidth = lineW * 0.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

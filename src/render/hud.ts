/* ── HUD overlay: needs bars, minimap, messages, inventory ───── */

import { SCR_W, SCR_H } from './webgl';
import {
  type Entity, type GameState, EntityType, Cell, Feature,
  ZoneFaction, LiftDirection,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS, WEAPON_STATS } from '../data/catalog';
import { getEquippedDurability, getEquippedToolDurability, countAmmo } from '../systems/inventory';
import { strMeleeDmgMult } from '../systems/rpg';
import { xpForLevel } from '../systems/rpg';
import { drawDebugOverlay } from '../systems/debug';
import { ZONE_COLORS, drawMinimap, drawFullMap } from './map_ui';
import { drawInventory } from './stats_ui';
import { drawQuestLog } from './quest_ui';
import { drawLogMenu } from './log_ui';
import { drawFactionMenu } from './factions_ui';
import { drawGameMenu } from './menu_ui';
import { drawNpcMenu } from './npc_ui';
import {
  textJitter, flicker, drawHoloBar, drawGlitchText,
  drawNeuroPanel, drawGlitchLine, drawStaticNoise,
} from './hud_fx';

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

  const time = state.time;

  // ── Bottom status bar (neuro-interface) ─────────────────
  const barY = h - 32 * sy;
  drawNeuroPanel(ctx, 0, barY, w, 32 * sy, time, 1);

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
      // Label with jitter
      drawGlitchText(ctx, label, bx, by, time, i * 13 + 7, '#8cc', 7 * sy);
      ctx.font = `${7 * sy}px monospace`;
      // Holo bar
      drawHoloBar(ctx, bx, by + 9 * sy, barW * sx, BAR_H * sy, pct, color, time, i);
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
    const wj = textJitter(time, 200);
    ctx.fillStyle = `rgba(200,230,255,${flicker(time, 201)})`;
    ctx.fillText(`${wpn} (${ws.dmg}) 🔫${ammo}`, w - 8 * sx + wj.dx, weaponY + wj.dy);
  } else {
    // Fist base dmg = player level; other melee uses ws.dmg; all × STR
    const baseDmg = (!player.weapon && player.rpg) ? player.rpg.level : ws.dmg;
    const strMult = player.rpg ? strMeleeDmgMult(player.rpg) : 1;
    const effectiveDmg = Math.round(baseDmg * strMult);
    const dur = getEquippedDurability(player);
    const wj = textJitter(time, 202);
    ctx.fillStyle = `rgba(200,230,255,${flicker(time, 203)})`;
    if (dur) {
      ctx.fillText(`${wpn} (${effectiveDmg}) [${dur.cur}/${dur.max}]`, w - 8 * sx + wj.dx, weaponY + wj.dy);
    } else {
      ctx.fillText(`${wpn} (${effectiveDmg})`, w - 8 * sx + wj.dx, weaponY + wj.dy);
    }
  }
  const toolY = weaponY - 10 * sy;
  if (player.tool) {
    const toolName = ITEMS[player.tool]?.name ?? player.tool;
    const toolDur = getEquippedToolDurability(player);
    const toolLabel = toolDur ? `${toolName} [${Math.max(0, Math.ceil(toolDur.cur))}/${toolDur.max}]` : toolName;
    const tj = textJitter(time, 210);
    ctx.fillStyle = `rgba(136,200,255,${flicker(time, 211)})`;
    ctx.fillText(toolLabel, w - 8 * sx + tj.dx, toolY + tj.dy);
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
      // Deterministic color from targetId — shifted to cyan/teal palette
      const h0 = ((targetId * 2654435761) >>> 0) % 360;
      const er = Math.round(100 + 80 * Math.cos(h0 * Math.PI / 180));
      const eg = Math.round(200 + 55 * Math.cos((h0 + 120) * Math.PI / 180));
      const eb = Math.round(200 + 55 * Math.cos((h0 + 240) * Math.PI / 180));
      const ej = textJitter(time, targetId);
      const eAlpha = flicker(time, targetId + 500);
      ctx.fillStyle = `rgba(${er},${eg},${eb},${eAlpha})`;
      ctx.font = `${9 * sy}px monospace`;
      ctx.textAlign = 'center';
      // Subtle glow behind
      ctx.shadowColor = `rgba(${er},${eg},${eb},0.4)`;
      ctx.shadowBlur = 6;
      ctx.fillText(`[E]${liftHint}`, w / 2 + ej.dx, h / 2 + 30 * sy + ej.dy);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
    }
  }

  // ── Messages (with jitter) ────────────────────────────────
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
    const mj = textJitter(time, i * 17 + 300);
    ctx.globalAlpha = alpha * flicker(time, i + 300);
    ctx.fillStyle = '#556';
    ctx.fillText(_stamp, 4 * sx + mj.dx, my + mj.dy);
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, 4 * sx + ctx.measureText(_stamp).width + mj.dx, my + mj.dy);
    my += 10 * sy;
  }
  ctx.globalAlpha = 1;

  // ── Crosshair (neuro-style) ──────────────────────────────
  const cj = textJitter(time, 999);
  const cAlpha = 0.4 + Math.sin(time * 2) * 0.08;
  ctx.strokeStyle = `rgba(0,220,200,${cAlpha})`;
  ctx.lineWidth = 1;
  const cx = w / 2 + cj.dx * 0.3, cy = h / 2 + cj.dy * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - 6 * sx, cy); ctx.lineTo(cx - 2 * sx, cy);
  ctx.moveTo(cx + 2 * sx, cy); ctx.lineTo(cx + 6 * sx, cy);
  ctx.moveTo(cx, cy - 6 * sy); ctx.lineTo(cx, cy - 2 * sy);
  ctx.moveTo(cx, cy + 2 * sy); ctx.lineTo(cx, cy + 6 * sy);
  ctx.stroke();
  // Small dot center
  ctx.fillStyle = `rgba(0,255,220,${cAlpha * 0.6})`;
  ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);

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
    drawFactionMenu(ctx, player, entities, sx, sy, time);
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

  // ── Zone info + time + room (neuro-interface left panel) ──
  {
    const pci = world.idx(Math.floor(player.x), Math.floor(player.y));
    const zid = world.zoneMap[pci];
    const zone = world.zones[zid];

    // Game clock + day counter — just above status bar
    const hh = String(state.clock.hour).padStart(2, '0');
    const mm = String(state.clock.minute).padStart(2, '0');
    const day = Math.floor(state.clock.totalMinutes / 1440);
    drawGlitchText(ctx, `День ${day}  ${hh}:${mm}`, 4 * sx, barY - 42 * sy, time, 400, '#8ac', 9 * sy);
    ctx.font = `${9 * sy}px monospace`;

    // Zone
    if (zone) {
      const [zr, zg, zb] = ZONE_COLORS[zid % 64];
      const fLabel = ZONE_FACTION_NAMES[zone.faction];
      const zj = textJitter(time, 410);
      ctx.fillStyle = `rgba(${zr},${zg},${zb},${flicker(time, 411)})`;
      ctx.font = `${8 * sy}px monospace`;
      ctx.fillText(`■ Зона ${zid + 1}  Ур.${zone.level ?? 1}`, 4 * sx + zj.dx, barY - 32 * sy + zj.dy);
      const fColor = zone.faction === ZoneFaction.SAMOSBOR ? '#c4f' : '#7aa';
      drawGlitchText(ctx, fLabel, 4 * sx, barY - 22 * sy, time, 412, fColor, 7 * sy);
      ctx.font = `${7 * sy}px monospace`;
    }

    // Room info
    const room = world.roomAt(player.x, player.y);
    if (room) {
      drawGlitchText(ctx, room.name, 4 * sx, barY - 12 * sy, time, 420, '#688', 7 * sy);
      ctx.font = `${7 * sy}px monospace`;
    }
  }

  // ── SAMOSBOR warning (intense glitch) ──────────────────────
  if (state.samosborActive) {
    const sj = textJitter(time * 3, 666);
    const sAlpha = 0.5 + Math.sin(now * 8) * 0.3;
    ctx.save();
    ctx.shadowColor = 'rgba(255,0,40,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = `rgba(255,40,40,${sAlpha})`;
    ctx.font = `bold ${16 * sy}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('⚠ САМОСБОР ⚠', w / 2 + sj.dx * 3, 20 * sy + sj.dy * 2);
    // Doubled glitch offset copy
    ctx.fillStyle = `rgba(0,255,200,${sAlpha * 0.2})`;
    ctx.fillText('⚠ САМОСБОР ⚠', w / 2 + sj.dx * 3 + 2, 20 * sy + sj.dy * 2 + 1);
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
    ctx.restore();
    // Extra static noise during samosbor
    drawStaticNoise(ctx, 0, 0, w, h, time, 0.04);
  }

  // ── Damage vignette (procedural blood edges) ──────────────
  if (state.dmgFlash > 0) {
    drawDamageVignette(ctx, w, h, state.dmgFlash, state.dmgSeed, state.time);
  }

  // ── PSI Beam visual (Kamehameha) ──────────────────────────
  if (state.beamFx > 0) {
    drawBeamFx(ctx, w, h, state.beamFx, state.beamAngle, state.beamLen, player.angle, state.time);
  }

  // ── Game over (neuro-interface death) ─────────────────────
  if (state.gameOver) {
    const deathAlpha = Math.min(0.5, state.deathTimer * 0.15);
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.min(w, h) * 0.7);
    grd.addColorStop(0, `rgba(0,0,0,0)`);
    grd.addColorStop(1, `rgba(0,0,0,${deathAlpha})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // Intense static noise
    drawStaticNoise(ctx, 0, 0, w, h, time, 0.06 * Math.min(1, state.deathTimer * 0.3));

    const textAlpha = 0.6 + Math.sin(state.time * 3) * 0.3;
    const dj = textJitter(time * 2, 777);
    ctx.save();
    ctx.shadowColor = 'rgba(255,0,0,0.5)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = `rgba(200,0,0,${textAlpha})`;
    ctx.font = `bold ${24 * sy}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ВЫ ПОГИБЛИ', w / 2 + dj.dx * 2, h / 2 - 20 * sy + dj.dy);
    // RGB split ghost
    ctx.fillStyle = `rgba(0,200,200,${textAlpha * 0.15})`;
    ctx.fillText('ВЫ ПОГИБЛИ', w / 2 + dj.dx * 2 + 3, h / 2 - 20 * sy + dj.dy + 1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(136,136,136,${Math.min(1, state.deathTimer * 0.5)})`;
    ctx.font = `${10 * sy}px monospace`;
    ctx.fillText('Хрущ поглотил ещё одного', w / 2, h / 2 + 10 * sy);
    ctx.fillText('[R] — заново', w / 2, h / 2 + 30 * sy);
    ctx.textAlign = 'left';
    ctx.restore();
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

  // ── Global neuro-interface overlay (always-on) ───────────
  drawGlitchLine(ctx, w, h, time);

  ctx.restore();
}

/* ── Procedural damage vignette (blood vessel edges) ──────────── */
function drawDamageVignette(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  intensity: number, seed: number, time: number,
): void {
  ctx.save();

  // BFG green flash (seed === 2), explosion orange (seed === 3), normal red damage
  const isGreen = seed === 2;
  const isOrange = seed === 3;
  const cR = isGreen ? 0 : 1;
  const cG = isGreen ? 1 : isOrange ? 0.6 : 0;

  // Edge darkening — radial gradient from center
  const darkA = intensity * 0.4;
  const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.min(w, h) * 0.65);
  grd.addColorStop(0, `rgba(0,0,0,0)`);
  grd.addColorStop(0.6, `rgba(${40 * cR},${Math.floor(40 * cG)},0,${darkA * 0.3})`);
  grd.addColorStop(1, `rgba(0,0,0,${darkA})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Color overlay with radial gradient (transparent center, colored edges)
  const colA = intensity * (isGreen ? 0.7 : 0.5);
  const grd2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.min(w, h) * 0.6);
  grd2.addColorStop(0, `rgba(${180 * cR},${180 * cG},0,0)`);
  grd2.addColorStop(0.5, `rgba(${140 * cR},${140 * cG},0,${colA * 0.2})`);
  grd2.addColorStop(1, `rgba(${120 * cR},${120 * cG},0,${colA})`);
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
    ctx.strokeStyle = `rgba(${160 * cR},${160 * cG},10,${veinAlpha})`;
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
      ctx.strokeStyle = `rgba(${130 * cR},${130 * cG},10,${veinAlpha * 0.6})`;
      ctx.lineWidth = lineW * 0.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

/* ── PSI Beam visual (Kamehameha) — bright purple beam from center ── */
function drawBeamFx(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  intensity: number,
  _beamAngle: number,
  _beamLen: number,
  _playerAngle: number,
  time: number,
): void {
  ctx.save();
  const alpha = Math.min(1, intensity * 2.5); // fade from ~0.85 to 0

  const cx = w / 2;
  const cy = h / 2;
  const beamEndX = w;

  // ── Fullscreen purple flash ──
  const flashA = intensity * 0.4;
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
  grd.addColorStop(0, `rgba(180,40,255,${flashA})`);
  grd.addColorStop(0.3, `rgba(120,20,200,${flashA * 0.6})`);
  grd.addColorStop(1, `rgba(40,0,80,0)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // ── Central beam core — horizontal bands ──
  const beamH = h * 0.12 * (0.5 + intensity * 0.5);
  const wobble = Math.sin(time * 30) * beamH * 0.08;

  for (let i = 0; i < 3; i++) {
    const spread = beamH * (0.15 + i * 0.3);
    const lineA = alpha * (1 - i * 0.3);
    const r = i === 0 ? 255 : i === 1 ? 200 : 140;
    const g = i === 0 ? 220 : i === 1 ? 80 : 20;
    const b = 255;
    const grdBeam = ctx.createLinearGradient(0, cy, w, cy);
    grdBeam.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grdBeam.addColorStop(0.15, `rgba(${r},${g},${b},${lineA * 0.3})`);
    grdBeam.addColorStop(0.4, `rgba(${r},${g},${b},${lineA})`);
    grdBeam.addColorStop(0.5, `rgba(${r},${g},${b},${lineA})`);
    grdBeam.addColorStop(0.6, `rgba(${r},${g},${b},${lineA})`);
    grdBeam.addColorStop(0.85, `rgba(${r},${g},${b},${lineA * 0.3})`);
    grdBeam.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grdBeam;
    ctx.fillRect(0, cy - spread + wobble, w, spread * 2);
  }

  // ── Energy tendrils along beam ──
  ctx.globalCompositeOperation = 'lighter';
  const tendrilCount = 6;
  for (let i = 0; i < tendrilCount; i++) {
    const phase = time * 20 + i * 1.7;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const segs = 12;
    for (let j = 1; j <= segs; j++) {
      const t = j / segs;
      const px = cx + (beamEndX - cx) * t;
      const py = cy + Math.sin(phase + t * 8) * beamH * 0.5 * t
        + Math.cos(phase * 1.3 + t * 12) * beamH * 0.2;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `rgba(180,100,255,${alpha * 0.4})`;
    ctx.lineWidth = 1.5 + intensity * 2;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // ── Muzzle flash (hot center dot) ──
  const dotR = Math.min(w, h) * 0.04 * (0.5 + intensity);
  const dotGrd = ctx.createRadialGradient(cx, cy + wobble, 0, cx, cy + wobble, dotR);
  dotGrd.addColorStop(0, `rgba(255,255,255,${alpha})`);
  dotGrd.addColorStop(0.3, `rgba(220,180,255,${alpha * 0.8})`);
  dotGrd.addColorStop(1, `rgba(140,40,220,0)`);
  ctx.fillStyle = dotGrd;
  ctx.fillRect(cx - dotR, cy - dotR + wobble, dotR * 2, dotR * 2);

  ctx.restore();
}

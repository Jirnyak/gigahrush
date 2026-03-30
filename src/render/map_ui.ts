/* ── Map rendering (minimap, full map) ────────────────────────── */

import {
  type Entity, type Quest, EntityType, Cell, RoomType, W, QuestType,
  LiftDirection,
} from '../core/types';
import { World } from '../core/world';

const MAP_SIZE = 80;

/* ── 64 unique zone colors (HSL-based palette) ─────────────── */
export const ZONE_COLORS: [number, number, number][] = [];
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

/* ── Shared map renderer (used by minimap + fullmap) ──────────── */
function drawMap(
  ctx: CanvasRenderingContext2D,
  world: World, entities: Entity[], player: Entity,
  _sx: number, _sy: number,
  mapX: number, mapY: number, mapW: number, mapH: number,
  radius: number, bgAlpha: number,
  quests?: Quest[],
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
      if (cell === Cell.WALL) {
        // Hermetic shelter walls: special unbreakable wall marker.
        if (world.hermoWall[ci]) {
          ctx.fillStyle = '#6ec3ff';
          ctx.fillRect(mapX + (dx + radius) * cellW, mapY + (dy + radius) * cellH, cellW + 0.5, cellH + 0.5);
        }
        continue;
      }
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

  // Quest markers
  if (quests) {
    for (const q of quests) {
      if (q.done) continue;
      let qx: number | undefined, qy: number | undefined;
      if (q.type === QuestType.TALK && q.targetNpcId !== undefined) {
        const tgt = entities.find(e => e.id === q.targetNpcId && e.alive);
        if (tgt) { qx = tgt.x; qy = tgt.y; }
      } else if (q.type === QuestType.VISIT && q.targetRoom !== undefined) {
        const room = world.rooms[q.targetRoom];
        if (room) { qx = room.x + room.w / 2; qy = room.y + room.h / 2; }
      } else if (q.type === QuestType.FETCH && q.giverId !== undefined) {
        const giver = entities.find(e => e.id === q.giverId && e.alive);
        if (giver) { qx = giver.x; qy = giver.y; }
      }
      if (qx === undefined || qy === undefined) continue;
      const qdx = world.delta(pxI, Math.floor(qx));
      const qdy = world.delta(pyI, Math.floor(qy));
      if (Math.abs(qdx) > radius || Math.abs(qdy) > radius) continue;
      const qsx = mapX + (qdx + radius) * cellW;
      const qsy = mapY + (qdy + radius) * cellH;
      // Diamond marker — large, with dark outline for visibility
      const sz = 6;  // half-height of diamond
      const sw = 4;  // half-width of diamond
      ctx.strokeStyle = '#024';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(qsx, qsy - sz);
      ctx.lineTo(qsx + sw, qsy);
      ctx.lineTo(qsx, qsy + sz);
      ctx.lineTo(qsx - sw, qsy);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#4af';
      ctx.fill();
    }
  }

  // Player dot
  const pcx = mapX + radius * cellW;
  const pcy = mapY + radius * cellH;

  // Lift direction arrows
  for (let dy = -radius; dy < radius; dy++) {
    for (let dx = -radius; dx < radius; dx++) {
      const wx = ((pxI + dx) % W + W) % W;
      const wy = ((pyI + dy) % W + W) % W;
      const ci = wy * W + wx;
      if (world.cells[ci] !== Cell.LIFT) continue;
      const lsx = mapX + (dx + radius) * cellW;
      const lsy = mapY + (dy + radius) * cellH;
      const isUp = world.liftDir[ci] === LiftDirection.UP;
      const ah = 7;  // arrow half-height
      const aw = 5;  // arrow half-width
      // Dark outline
      ctx.strokeStyle = '#440';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (isUp) {
        ctx.moveTo(lsx, lsy - ah);
        ctx.lineTo(lsx + aw, lsy + ah);
        ctx.lineTo(lsx - aw, lsy + ah);
      } else {
        ctx.moveTo(lsx, lsy + ah);
        ctx.lineTo(lsx + aw, lsy - ah);
        ctx.lineTo(lsx - aw, lsy - ah);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#ee2';
      ctx.fill();
    }
  }
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
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  world: World, entities: Entity[], player: Entity,
  sx: number, sy: number, quests?: Quest[],
): void {
  const mw = MAP_SIZE * sx, mh = MAP_SIZE * sy;
  const mx = ctx.canvas.width - mw - 4 * sx;
  const my = 4 * sy;
  drawMap(ctx, world, entities, player, sx, sy, mx, my, mw, mh, 40, 0.75, quests);
}

/* ── Full world map (fullscreen) ─────────────────────────────── */
export function drawFullMap(
  ctx: CanvasRenderingContext2D,
  world: World, entities: Entity[], player: Entity,
  sx: number, sy: number, quests?: Quest[],
): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const pad = 4 * sx;
  const mapW = cw - pad * 2;
  const mapH = ch - pad * 2;
  drawMap(ctx, world, entities, player, sx, sy, pad, pad, mapW, mapH, 200, 0.85, quests);

  ctx.fillStyle = '#666';
  ctx.font = `${8 * sy}px monospace`;
  ctx.fillText('[M] закрыть', pad + 4, pad + mapH - 4);
}

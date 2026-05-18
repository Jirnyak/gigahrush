/* ── Map rendering (minimap, full map) ────────────────────────── */

import {
  type Entity, type GameState, type Quest, EntityType, Cell, RoomType, W, QuestType,
  LiftDirection, MonsterKind, Faction, FloorLevel,
} from '../core/types';
import { World } from '../core/world';
import { hasAvailableQuest } from '../data/plot';
import { areFactionsHostile } from '../systems/factions';
import { getActiveSamosborVariant } from '../data/samosbor_variants';
import { getSamosborShelterRoomIds, getSamosborWarningSnapshot } from '../systems/samosbor';
import { getRecentRumorLead } from '../systems/npc_memory';
import { getWrongDoorMapCues } from '../systems/wrong_door';
import { getActiveCultProcessionSnapshots } from '../systems/faction_events';
import { seroburmalineSourceCellState } from '../systems/seroburmaline';
import { getBlackHandMarkCells } from './marks';

const MAP_SIZE = 80;
const activeTalkTargets = new Set<number>();
const activeTalkPlotTargets = new Set<string>();
const activeQuestGivers = new Set<number>();
const activeKillKinds = new Set<MonsterKind>();
const activeTargetRoomTypes = new Set<RoomType>();
const activeFetchItems = new Set<string>();
const drawnTargetRooms = new Set<number>();

function routeFloor(q: Quest): FloorLevel | undefined {
  return q.visitFloor ?? q.targetFloor;
}

function activeVisitLiftDirection(quests: Quest[] | undefined, currentFloor: FloorLevel | undefined): LiftDirection | undefined {
  if (!quests || currentFloor === undefined) return undefined;
  for (const q of quests) {
    const floor = routeFloor(q);
    if (q.done || floor === undefined || floor === currentFloor) continue;
    return floor > currentFloor ? LiftDirection.DOWN : LiftDirection.UP;
  }
  return undefined;
}

function drawQuestDiamond(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  sz: number, sw: number,
  stroke: string, fill: string,
): void {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - sz);
  ctx.lineTo(x + sw, y);
  ctx.lineTo(x, y + sz);
  ctx.lineTo(x - sw, y);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function fitMapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let end = text.length - 3;
  while (end > 1 && ctx.measureText(text.slice(0, end) + '...').width > maxW) end--;
  return text.slice(0, Math.max(1, end)) + '...';
}

function drawSamosborWarningRisk(
  ctx: CanvasRenderingContext2D,
  world: World,
  state: GameState | undefined,
  currentFloor: FloorLevel | undefined,
  uiTime: number,
  pxI: number,
  pyI: number,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  radius: number,
  cellW: number,
  cellH: number,
): void {
  if (!state) return;
  const warning = getSamosborWarningSnapshot(state);
  if (!warning || warning.floor !== currentFloor) return;
  const dx = world.delta(pxI, warning.zoneX);
  const dy = world.delta(pyI, warning.zoneY);
  if (Math.abs(dx) > radius || Math.abs(dy) > radius) return;

  const x = mapX + (dx + radius) * cellW;
  const y = mapY + (dy + radius) * cellH;
  const pulse = 0.55 + 0.35 * Math.sin(uiTime * 8);
  const riskR = Math.max(5, Math.min(18, Math.max(cellW, cellH) * 11));

  ctx.save();
  ctx.globalAlpha = 0.25 + pulse * 0.22;
  ctx.fillStyle = warning.tint;
  ctx.beginPath();
  ctx.arc(x, y, riskR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = warning.tint;
  ctx.lineWidth = Math.max(1, Math.min(3, cellW * 2));
  ctx.beginPath();
  ctx.arc(x, y, riskR + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - riskR - 3, y);
  ctx.lineTo(x + riskR + 3, y);
  ctx.moveTo(x, y - riskR - 3);
  ctx.lineTo(x, y + riskR + 3);
  ctx.stroke();
  if (warning.variantId === 'maronary' && warning.wrongDoorX !== undefined && warning.wrongDoorY !== undefined) {
    const ddx = world.delta(pxI, warning.wrongDoorX);
    const ddy = world.delta(pyI, warning.wrongDoorY);
    if (Math.abs(ddx) <= radius && Math.abs(ddy) <= radius) {
      const doorX = mapX + (ddx + radius) * cellW;
      const doorY = mapY + (ddy + radius) * cellH;
      const markerW = Math.max(5, Math.min(12, cellW * 7));
      const markerH = Math.max(7, Math.min(16, cellH * 10));
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#35ff66';
      ctx.lineWidth = Math.max(1, Math.min(2, cellW * 1.5));
      ctx.strokeRect(doorX - markerW * 0.5, doorY - markerH * 0.5, markerW, markerH);
      ctx.beginPath();
      ctx.moveTo(doorX - markerW * 0.3, doorY);
      ctx.lineTo(doorX + markerW * 0.3, doorY);
      ctx.stroke();
    }
  }
  if (mapW > 140 && mapH > 120) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = warning.variantId === 'veretar' ? '#f4f1df' : '#ffd36a';
    ctx.font = '8px monospace';
    const marker = warning.variantId === 'maronary'
      ? 'МАР'
      : warning.variantId === 'istotit'
      ? 'ИСТ'
      : warning.variantId === 'veretar'
      ? 'ВЕР'
      : 'СБОР';
    ctx.fillText(`${marker} ${warning.secondsLeft}s`, x + riskR + 4, y - 4);
  }
  ctx.restore();
}

function drawCultProcessionOverlays(
  ctx: CanvasRenderingContext2D,
  world: World,
  state: GameState | undefined,
  currentFloor: FloorLevel | undefined,
  uiTime: number,
  pxI: number,
  pyI: number,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  radius: number,
  cellW: number,
  cellH: number,
): void {
  if (!state || currentFloor === undefined) return;
  for (const p of getActiveCultProcessionSnapshots(state)) {
    if (p.floor !== currentFloor) continue;
    const dx = world.delta(pxI, Math.floor(p.x));
    const dy = world.delta(pyI, Math.floor(p.y));
    if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;

    const x = mapX + (dx + radius) * cellW;
    const y = mapY + (dy + radius) * cellH;
    const pulse = 0.5 + 0.35 * Math.sin(uiTime * 7 + p.id);
    const fearR = Math.max(5, Math.min(22, Math.max(cellW, cellH) * p.fearRadius));
    const actionR = Math.max(3, Math.min(12, Math.max(cellW, cellH) * p.actionRadius));
    const color = p.disrupted ? '#fa0' : p.reported ? '#8cf' : p.covered ? '#c8f' : '#b45cff';

    ctx.save();
    ctx.globalAlpha = 0.12 + pulse * 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, fearR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.min(3, cellW * 2));
    ctx.beginPath();
    ctx.arc(x, y, actionR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - actionR - 2, y);
    ctx.lineTo(x + actionR + 2, y);
    ctx.moveTo(x, y - actionR - 2);
    ctx.lineTo(x, y + actionR + 2);
    ctx.stroke();
    if (mapW > 140 && mapH > 120) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color;
      ctx.font = '8px monospace';
      ctx.fillText(`КУЛЬТ ${Math.ceil(p.expiresIn)}s`, x + actionR + 4, y - 4);
    }
    ctx.restore();
  }
}

function drawBlackHandMarks(
  ctx: CanvasRenderingContext2D,
  world: World,
  pxI: number,
  pyI: number,
  mapX: number,
  mapY: number,
  radius: number,
  cellW: number,
  cellH: number,
): void {
  const marks = getBlackHandMarkCells(world);
  if (marks.length === 0) return;
  const size = Math.max(2, Math.min(7, Math.max(cellW, cellH) * 2.2));

  ctx.save();
  ctx.lineWidth = Math.max(1, Math.min(2, size * 0.28));
  for (const mark of marks) {
    const dx = world.delta(pxI, mark.x);
    const dy = world.delta(pyI, mark.y);
    if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;

    const x = mapX + (dx + radius + 0.5) * cellW;
    const y = mapY + (dy + radius + 0.5) * cellH;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = '#050404';
    ctx.strokeStyle = '#b33';
    ctx.beginPath();
    ctx.arc(x, y + size * 0.12, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let i = -1; i <= 2; i++) {
      const fx = x + i * size * 0.18;
      ctx.moveTo(fx, y - size * 0.72);
      ctx.lineTo(fx, y - size * 0.08);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawWrongDoorCues(
  ctx: CanvasRenderingContext2D,
  world: World,
  state: GameState | undefined,
  uiTime: number,
  pxI: number,
  pyI: number,
  mapX: number,
  mapY: number,
  radius: number,
  cellW: number,
  cellH: number,
): void {
  const cues = getWrongDoorMapCues(world, state);
  if (cues.length === 0) return;

  ctx.save();
  ctx.strokeStyle = '#35ff66';
  ctx.fillStyle = '#35ff66';
  ctx.lineWidth = Math.max(1, Math.min(3, cellW * 2));
  for (const cue of cues) {
    const sdx = world.delta(pxI, cue.sourceX);
    const sdy = world.delta(pyI, cue.sourceY);
    if (Math.abs(sdx) > radius || Math.abs(sdy) > radius) continue;

    const tdx = world.delta(pxI, cue.targetX);
    const tdy = world.delta(pyI, cue.targetY);
    const targetVisible = Math.abs(tdx) <= radius && Math.abs(tdy) <= radius;
    const clampedDx = Math.max(-radius + 1, Math.min(radius - 1, tdx));
    const clampedDy = Math.max(-radius + 1, Math.min(radius - 1, tdy));
    const sx = mapX + (sdx + radius + 0.5) * cellW;
    const sy = mapY + (sdy + radius + 0.5) * cellH;
    const tx = mapX + ((targetVisible ? tdx : clampedDx) + radius + 0.5) * cellW;
    const ty = mapY + ((targetVisible ? tdy : clampedDy) + radius + 0.5) * cellH;
    const pulse = 0.55 + 0.35 * Math.sin(uiTime * 9 + cue.id);

    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.setLineDash([Math.max(3, cellW * 2), Math.max(2, cellW)]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.82;
    ctx.strokeRect(sx - 4, sy - 4, 8, 8);
    ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    if (targetVisible) {
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

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
  currentFloor?: FloorLevel,
  state?: GameState,
  uiTime = state?.time ?? 0,
): void {
  ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`;
  ctx.fillRect(mapX, mapY, mapW, mapH);

  const pxI = Math.floor(player.x);
  const pyI = Math.floor(player.y);
  const cellW = mapW / (radius * 2);
  const cellH = mapH / (radius * 2);
  const activeVariant = getActiveSamosborVariant();
  const questLiftDir = activeVisitLiftDirection(quests, currentFloor);
  const [fogR, fogG, fogB] = activeVariant?.fogColor ?? [80, 20, 120];
  const shelterRoomIds = getSamosborShelterRoomIds(state);
  drawnTargetRooms.clear();
  if (quests) {
    activeTalkTargets.clear();
    activeTalkPlotTargets.clear();
    activeQuestGivers.clear();
    activeKillKinds.clear();
    activeTargetRoomTypes.clear();
    activeFetchItems.clear();
    for (const q of quests) {
      if (q.done) continue;
      activeQuestGivers.add(q.giverId);
      if (q.type === QuestType.TALK && q.targetNpcId !== undefined) activeTalkTargets.add(q.targetNpcId);
      if (q.type === QuestType.TALK && q.targetPlotNpcId) activeTalkPlotTargets.add(q.targetPlotNpcId);
      if (q.type === QuestType.KILL && q.targetMonsterKind !== undefined) activeKillKinds.add(q.targetMonsterKind);
      if (
        q.type === QuestType.FETCH &&
        q.targetItem &&
        (q.targetFloor === undefined || q.targetFloor === currentFloor)
      ) activeFetchItems.add(q.targetItem);
      if (
        q.targetRoom === undefined &&
        q.targetRoomType !== undefined &&
        (q.targetFloor === undefined || q.targetFloor === currentFloor)
      ) activeTargetRoomTypes.add(q.targetRoomType);
    }
  } else {
    activeTargetRoomTypes.clear();
    activeFetchItems.clear();
  }

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
        cr = Math.round(cr * (1 - f) + fogR * f);
        cg = Math.round(cg * (1 - f) + fogG * f);
        cb = Math.round(cb * (1 - f) + fogB * f);
      }
      const isSamosborShelter = rid >= 0 && shelterRoomIds.includes(rid);
      if (isSamosborShelter) {
        cr = Math.round(cr * 0.55 + 212 * 0.45);
        cg = Math.round(cg * 0.55 + 166 * 0.45);
        cb = Math.round(cb * 0.55 + 72 * 0.45);
      }

      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(mapX + (dx + radius) * cellW, mapY + (dy + radius) * cellH, cellW + 0.5, cellH + 0.5);
      if (isSamosborShelter) {
        ctx.strokeStyle = '#d6a64b';
        ctx.lineWidth = Math.max(1, Math.min(2, cellW));
        ctx.strokeRect(mapX + (dx + radius) * cellW, mapY + (dy + radius) * cellH, cellW + 0.5, cellH + 0.5);
      }

      if (currentFloor === FloorLevel.MAINTENANCE) {
        const sourceState = seroburmalineSourceCellState(world, wx, wy);
        if (sourceState) {
          const sx0 = mapX + (dx + radius + 0.5) * cellW;
          const sy0 = mapY + (dy + radius + 0.5) * cellH;
          const pulse = sourceState === 'active' ? 0.6 + 0.28 * Math.sin(uiTime * 8) : 0.35;
          ctx.save();
          ctx.globalAlpha = sourceState === 'active' ? 0.62 + pulse * 0.25 : 0.42;
          ctx.strokeStyle = sourceState === 'active' ? '#d58aa8' : '#8a8f88';
          ctx.fillStyle = sourceState === 'active' ? '#563046' : '#4b504c';
          ctx.lineWidth = Math.max(1, Math.min(2, cellW * 0.8));
          ctx.beginPath();
          ctx.arc(sx0, sy0, Math.max(3, Math.min(8, Math.max(cellW, cellH) * 2.2)), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      if (activeTargetRoomTypes.size > 0 && rid >= 0) {
        const r = world.rooms[rid];
        if (r && activeTargetRoomTypes.has(r.type) && !drawnTargetRooms.has(r.id)) {
          const cx = world.wrap(Math.floor(r.x + r.w / 2));
          const cy = world.wrap(Math.floor(r.y + r.h / 2));
          if (wx === cx && wy === cy) {
            const qsx = mapX + (dx + radius) * cellW;
            const qsy = mapY + (dy + radius) * cellH;
            drawQuestDiamond(ctx, qsx, qsy, 5, 3, '#640', '#fc4');
            drawnTargetRooms.add(r.id);
          }
        }
      }
    }
  }

  drawSamosborWarningRisk(ctx, world, state, currentFloor, uiTime, pxI, pyI, mapX, mapY, mapW, mapH, radius, cellW, cellH);
  drawWrongDoorCues(ctx, world, state, uiTime, pxI, pyI, mapX, mapY, radius, cellW, cellH);
  drawCultProcessionOverlays(ctx, world, state, currentFloor, uiTime, pxI, pyI, mapX, mapY, mapW, mapH, radius, cellW, cellH);
  drawBlackHandMarks(ctx, world, pxI, pyI, mapX, mapY, radius, cellW, cellH);

  // Entities
  for (const e of entities) {
    if (!e.alive || e.type === EntityType.PLAYER) continue;
    const edx = world.delta(pxI, Math.floor(e.x));
    const edy = world.delta(pyI, Math.floor(e.y));
    if (Math.abs(edx) > radius || Math.abs(edy) > radius) continue;

    ctx.fillStyle = e.type === EntityType.NPC
                  ? (e.faction !== undefined && areFactionsHostile(Faction.PLAYER, e.faction) ? '#e44' : '#4a4')
                  : e.type === EntityType.MONSTER ? '#e33'
                  : '#dd4';
    const esx = mapX + (edx + radius) * cellW;
    const esy = mapY + (edy + radius) * cellH;
    ctx.fillRect(esx - 1, esy - 1, 3, 3);
    if (
      e.type === EntityType.ITEM_DROP &&
      activeFetchItems.size > 0 &&
      (e.inventory ?? []).some(slot => activeFetchItems.has(slot.defId))
    ) {
      drawQuestDiamond(ctx, esx, esy, 5, 3, '#640', '#fc4');
    }
  }

  // Quest markers — plot NPC markers + VISIT room markers
  if (quests) {
    // Mark all plot NPCs (gold if active quest / new quest available, blue otherwise)
    for (const e of entities) {
      if (!e.alive || !e.plotNpcId) continue;
      const edx = world.delta(pxI, Math.floor(e.x));
      const edy = world.delta(pyI, Math.floor(e.y));
      if (Math.abs(edx) > radius || Math.abs(edy) > radius) continue;

      const isActiveTarget = activeTalkTargets.has(e.id) || (e.plotNpcId !== undefined && activeTalkPlotTargets.has(e.plotNpcId));
      const isActiveGiver = activeQuestGivers.has(e.id);
      const hasNewQuest = hasAvailableQuest(e.plotNpcId, quests);
      const isGold = isActiveTarget || isActiveGiver || hasNewQuest;

      const qsx = mapX + (edx + radius) * cellW;
      const qsy = mapY + (edy + radius) * cellH;
      const sz = 6, sw = 4;
      ctx.strokeStyle = isGold ? '#640' : '#024';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(qsx, qsy - sz);
      ctx.lineTo(qsx + sw, qsy);
      ctx.lineTo(qsx, qsy + sz);
      ctx.lineTo(qsx - sw, qsy);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = isGold ? '#fc4' : '#4af';
      ctx.fill();
    }
    // VISIT quest markers (room targets)
    for (const q of quests) {
      if (q.done) continue;
      if (q.type !== QuestType.VISIT || q.targetRoom === undefined) continue;
      const room = world.rooms[q.targetRoom];
      if (!room) continue;
      const rx = room.x + room.w / 2;
      const ry = room.y + room.h / 2;
      const qdx = world.delta(pxI, Math.floor(rx));
      const qdy = world.delta(pyI, Math.floor(ry));
      if (Math.abs(qdx) > radius || Math.abs(qdy) > radius) continue;
      const qsx = mapX + (qdx + radius) * cellW;
      const qsy = mapY + (qdy + radius) * cellH;
      const sz = 6, sw = 4;
      ctx.strokeStyle = '#640';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(qsx, qsy - sz);
      ctx.lineTo(qsx + sw, qsy);
      ctx.lineTo(qsx, qsy + sz);
      ctx.lineTo(qsx - sw, qsy);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#fc4';
      ctx.fill();
    }
    // KILL quest markers — show target monsters as red diamonds
    if (activeKillKinds.size > 0) {
      for (const e of entities) {
        if (!e.alive || e.type !== EntityType.MONSTER) continue;
        if (e.monsterKind === undefined || !activeKillKinds.has(e.monsterKind)) continue;
        const edx = world.delta(pxI, Math.floor(e.x));
        const edy = world.delta(pyI, Math.floor(e.y));
        if (Math.abs(edx) > radius || Math.abs(edy) > radius) continue;
        const qsx = mapX + (edx + radius) * cellW;
        const qsy = mapY + (edy + radius) * cellH;
        const sz = 5, sw = 3;
        ctx.strokeStyle = '#600';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(qsx, qsy - sz);
        ctx.lineTo(qsx + sw, qsy);
        ctx.lineTo(qsx, qsy + sz);
        ctx.lineTo(qsx - sw, qsy);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = '#f44';
        ctx.fill();
      }
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
      const isQuestLift = questLiftDir !== undefined && world.liftDir[ci] === questLiftDir;
      const ah = 7;  // arrow half-height
      const aw = 5;  // arrow half-width
      // Dark outline
      ctx.strokeStyle = isQuestLift ? '#fff' : '#440';
      ctx.lineWidth = isQuestLift ? 3 : 2;
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
      ctx.fillStyle = isQuestLift ? '#fc4' : '#ee2';
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
  sx: number, sy: number, quests?: Quest[], floorInstanceLabel?: string, currentFloor?: FloorLevel, state?: GameState, uiTime = state?.time ?? 0,
): void {
  const mw = MAP_SIZE * sx, mh = MAP_SIZE * sy;
  const mx = ctx.canvas.width - mw - 4 * sx;
  const my = 4 * sy;
  drawMap(ctx, world, entities, player, sx, sy, mx, my, mw, mh, 40, 0.75, quests, currentFloor, state, uiTime);
  if (floorInstanceLabel) {
    ctx.fillStyle = '#f4a';
    ctx.font = `${7 * sy}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(floorInstanceLabel, mx + mw, my + mh + 3 * sy);
    ctx.textAlign = 'left';
  }
}

/* ── Full world map (fullscreen) ─────────────────────────────── */
export function drawFullMap(
  ctx: CanvasRenderingContext2D,
  world: World, entities: Entity[], player: Entity,
  sx: number, sy: number, quests?: Quest[], floorInstanceLabel?: string, currentFloor?: FloorLevel, state?: GameState, uiTime = state?.time ?? 0,
): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const pad = 4 * sx;
  const mapW = cw - pad * 2;
  const mapH = ch - pad * 2;
  drawMap(ctx, world, entities, player, sx, sy, pad, pad, mapW, mapH, 200, 0.85, quests, currentFloor, state, uiTime);

  ctx.fillStyle = '#666';
  ctx.font = `${8 * sy}px monospace`;
  if (floorInstanceLabel) {
    ctx.fillStyle = '#f4a';
    ctx.fillText(`Лифт: ${floorInstanceLabel}`, pad + 4, pad + 4);
    ctx.fillStyle = '#666';
  }
  const rumorLead = state ? getRecentRumorLead(state.time) : undefined;
  if (rumorLead) {
    ctx.fillStyle = '#d9a';
    ctx.fillText(fitMapText(ctx, `Слух: ${rumorLead.text}`, mapW - 16 * sx), pad + 4, pad + mapH - 14 * sy);
    ctx.fillStyle = '#666';
  }
  ctx.fillText('[M] закрыть', pad + 4, pad + mapH - 4);
}

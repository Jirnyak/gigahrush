/* ── Procedural wall screens / TVs ────────────────────────────── */

import {
  W, Cell, Feature, FloorLevel, RoomType, Tex, ZoneFaction,
  type Room,
} from '../core/types';
import { World } from '../core/world';
import {
  SCREEN_SIGNAL_DEFS,
  screenSignalEligible,
  screenSignalForVariant,
  type ScreenSignalDef,
  type ScreenSignalId,
} from '../data/screen_signals';
import { drawTextCentered } from '../render/text';
import { S, rgba, noise, clamp } from '../render/pixutil';

export const SCREEN_VARIANTS = 8;
export const SCREEN_FRAMES = 4;
const SCREEN_TEX_COUNT = SCREEN_VARIANTS * SCREEN_FRAMES;
const SCREEN_MAX_RATIO = 0.01;

const FLOOR_CAP: Record<FloorLevel, number> = {
  [FloorLevel.MINISTRY]: 180,
  [FloorLevel.KVARTIRY]: 160,
  [FloorLevel.LIVING]: 120,
  [FloorLevel.MAINTENANCE]: 90,
  [FloorLevel.HELL]: 48,
  [FloorLevel.VOID]: 0,
};

const DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function tpx(t: Uint32Array, x: number, y: number, c: number): void {
  if (x >= 0 && x < S && y >= 0 && y < S) t[y * S + x] = c;
}

function fillRect(t: Uint32Array, x: number, y: number, w: number, h: number, c: number): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) tpx(t, xx, yy, c);
}

function strokeRect(t: Uint32Array, x: number, y: number, w: number, h: number, c: number): void {
  for (let i = 0; i < w; i++) { tpx(t, x + i, y, c); tpx(t, x + i, y + h - 1, c); }
  for (let i = 0; i < h; i++) { tpx(t, x, y + i, c); tpx(t, x + w - 1, y + i, c); }
}

function drawLine(t: Uint32Array, x0: number, y0: number, x1: number, y1: number, c: number): void {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    tpx(t, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = err * 2;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function drawCircle(t: Uint32Array, cx: number, cy: number, r: number, c: number, fill: boolean): void {
  const r2 = r * r;
  const inner = Math.max(0, r - 1);
  const inner2 = inner * inner;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d2 = dx * dx + dy * dy;
    if (fill ? d2 <= r2 : d2 <= r2 && d2 >= inner2) tpx(t, cx + dx, cy + dy, c);
  }
}

function screenTex(variant: number, frame: number): Tex {
  return (Tex.SCREEN_BASE + variant * SCREEN_FRAMES + frame) as Tex;
}

function isScreenTex(tex: number): boolean {
  return tex >= Tex.SCREEN_BASE && tex < Tex.SCREEN_BASE + SCREEN_TEX_COUNT;
}

function hash01(x: number, y: number, s: number): number {
  return noise(x, y, s);
}

function drawScreenCase(t: Uint32Array, seed: number, frame: number): void {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, seed) * 22 - 11;
    const seam = (x < 2 || x > S - 3 || y < 2 || y > S - 3) ? -20 : 0;
    t[y * S + x] = rgba(clamp(34 + n + seam), clamp(36 + n + seam), clamp(38 + n + seam));
  }
  fillRect(t, 4, 6, 56, 45, rgba(12, 13, 15));
  strokeRect(t, 4, 6, 56, 45, rgba(78, 82, 88));
  strokeRect(t, 7, 9, 50, 38, rgba(6, 7, 9));
  fillRect(t, 7, 49, 50, 8, rgba(22, 23, 25));
  for (let x = 12; x <= 48; x += 12) {
    const on = ((x + seed + frame * 3) & 1) === 0;
    drawCircle(t, x, 53, 2, on ? rgba(75, 220, 95) : rgba(80, 55, 45), true);
  }
}

function drawScanlines(t: Uint32Array, c = rgba(0, 0, 0, 45)): void {
  for (let y = 11; y < 46; y += 3) for (let x = 8; x < 57; x++) tpx(t, x, y, c);
}

function drawSamosborWarning(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(22, 12, 34));
  for (let y = 10; y < 46; y++) for (let x = 8; x < 56; x++) {
    const n = noise(x + frame * 5, y - frame * 3, 610) * 32;
    tpx(t, x, y, rgba(clamp(28 + n), clamp(8 + n * 0.4), clamp(50 + n)));
  }
  for (let x = 10; x < 55; x += 8) fillRect(t, x, 12, 4, 4, (x + frame) & 8 ? rgba(235, 45, 210) : rgba(255, 210, 40));
  drawLine(t, 18, 36, 32, 14, rgba(245, 220, 60));
  drawLine(t, 32, 14, 46, 36, rgba(245, 220, 60));
  drawLine(t, 46, 36, 18, 36, rgba(245, 220, 60));
  fillRect(t, 30, 20, 4, 10, rgba(245, 220, 60));
  fillRect(t, 30, 33, 4, 3, rgba(245, 220, 60));
  fillRect(t, 8, 38, 48, 8, rgba(45, 8, 60));
  drawTextCentered(t, frame & 1 ? 'ШЛЮЗ' : 'СБОР', 39, rgba(255, 230, 110));
  drawScanlines(t);
}

function drawShortageGraph(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(28, 22, 10));
  for (let x = 12; x < 54; x += 8) drawLine(t, x, 12, x, 44, rgba(20, 70, 48));
  for (let y = 14; y < 44; y += 6) drawLine(t, 10, y, 54, y, rgba(70, 60, 30));
  let px = 10, py = 18;
  for (let i = 0; i < 12; i++) {
    const x = 10 + i * 4;
    const y = 18 + Math.min(24, i * 2 + Math.floor(noise(i, frame, 620) * 6));
    drawLine(t, px, py, x, y, rgba(230, 70, 45));
    px = x; py = y;
  }
  for (let i = 0; i < 7; i++) {
    const h = Math.max(2, 18 - i * 2 + Math.floor(noise(i, frame, 621) * 4));
    fillRect(t, 12 + i * 6, 44 - h, 3, h, i < 3 ? rgba(190, 155, 45) : rgba(130, 55, 45));
  }
  drawTextCentered(t, frame & 1 ? 'ВОДА' : 'ПАЙК', 12, rgba(250, 220, 120));
  drawScanlines(t);
}

function drawFactionMap(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(16, 18, 22));
  const cols = [rgba(210, 160, 55), rgba(80, 155, 220), rgba(165, 65, 205), rgba(160, 55, 45)];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 11 + col * 9;
      const y = 13 + row * 7;
      const c = cols[(row + col + frame) % cols.length];
      fillRect(t, x, y, 7, 5, c);
      if (noise(col, row, 630 + frame) > 0.62) strokeRect(t, x, y, 7, 5, rgba(240, 230, 160));
    }
  }
  drawLine(t, 8, 36, 56, 36, rgba(90, 90, 80));
  drawTextCentered(t, frame & 1 ? 'ШТАБ' : 'ЗОНА', 38, rgba(230, 225, 170));
  drawScanlines(t);
}

function drawLiftAnomaly(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(10, 18, 20));
  strokeRect(t, 20, 13, 24, 25, rgba(95, 115, 120));
  drawLine(t, 32, 13, 32, 38, rgba(55, 70, 75));
  for (let y = 15; y < 37; y += 6) drawLine(t, 22, y, 42, y + ((frame + y) & 1 ? 1 : -1), rgba(32, 52, 58));
  drawLine(t, 14, 18, 14, 30, rgba(60, 230, 210));
  drawLine(t, 14, 18, 10, 22, rgba(60, 230, 210));
  drawLine(t, 14, 18, 18, 22, rgba(60, 230, 210));
  drawLine(t, 50, 30, 50, 18, rgba(230, 80, 70));
  drawLine(t, 50, 30, 46, 26, rgba(230, 80, 70));
  drawLine(t, 50, 30, 54, 26, rgba(230, 80, 70));
  const errY = 40 + (frame & 1);
  fillRect(t, 8, errY, 48, 5, rgba(55, 18, 18));
  drawTextCentered(t, 'ЛИФТ', errY, rgba(245, 120, 90));
  drawScanlines(t);
}

function drawMinistry(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(48, 14, 14));
  strokeRect(t, 10, 12, 44, 28, rgba(190, 160, 80));
  for (let i = 0; i < 5; i++) {
    const y = 15 + i * 5;
    fillRect(t, 13, y, 8, 3, i === frame ? rgba(240, 220, 120) : rgba(125, 95, 65));
    drawLine(t, 25, y + 1, 46 - ((i + frame) % 9), y + 1, rgba(235, 220, 180));
  }
  drawCircle(t, 46, 24, 6, frame & 1 ? rgba(180, 30, 25) : rgba(120, 25, 22), false);
  drawTextCentered(t, frame & 1 ? 'ОКНО' : '№' + (17 + frame), 41, rgba(245, 225, 170));
  drawScanlines(t);
}

function drawHomeTv(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(25, 21, 17));
  if ((frame & 1) === 0) {
    fillRect(t, 12, 14, 12, 18, rgba(120, 90, 45));
    fillRect(t, 28, 18, 8, 14, rgba(80, 130, 170));
    fillRect(t, 40, 16, 9, 16, rgba(165, 70, 50));
    fillRect(t, 8, 36, 48, 10, rgba(50, 28, 18));
    drawTextCentered(t, 'ПАЙК', 38, rgba(245, 225, 155));
  } else {
    for (let i = 0; i < 6; i++) {
      const h = 4 + Math.floor(noise(i, frame, 650) * 18);
      fillRect(t, 12 + i * 7, 34 - h, 4, h, i < 2 ? rgba(210, 175, 80) : rgba(150, 65, 55));
    }
    drawTextCentered(t, 'НЕТ', 38, rgba(245, 120, 80));
  }
  for (let i = 0; i < 80; i++) {
    const x = 8 + Math.floor(noise(i, frame, 650) * 48);
    const y = 10 + Math.floor(noise(frame, i, 651) * 36);
    tpx(t, x, y, rgba(230, 230, 230, 90));
  }
  drawScanlines(t);
}

function drawMaintenance(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(8, 28, 30));
  for (let i = 0; i < 3; i++) {
    const cx = 18 + i * 14;
    drawCircle(t, cx, 23, 6, rgba(82, 130, 125), false);
    const a = -2.4 + noise(i, frame, 660) * 4.8;
    drawLine(t, cx, 23, cx + Math.round(Math.cos(a) * 5), 23 + Math.round(Math.sin(a) * 5), rgba(230, 80, 60));
  }
  for (let x = 10; x < 54; x += 3) {
    const y = 40 + Math.round(Math.sin((x + frame * 7) * 0.45) * 3);
    tpx(t, x, y, rgba(70, 230, 220));
  }
  drawTextCentered(t, 'ДАВЛ', 12, rgba(155, 245, 235));
  drawScanlines(t);
}

function drawHell(t: Uint32Array, frame: number): void {
  fillRect(t, 8, 10, 48, 36, rgba(8, 4, 14));
  for (let y = 10; y < 46; y++) for (let x = 8; x < 56; x++) {
    const n = noise(x + frame * 3, y - frame * 2, 670);
    if (n > 0.72) tpx(t, x, y, n > 0.9 ? rgba(190, 40, 130) : rgba(40, 30, 80));
  }
  for (let i = 0; i < 4; i++) strokeRect(t, 14 + i * 7, 15 + i * 4, 34 - i * 8, 24 - i * 5, rgba(90 + i * 35, 40, 130 + i * 20));
  drawLine(t, 11, 14 + frame * 4, 53, 36 - frame * 3, rgba(205, 45, 160));
  drawLine(t, 16, 40 - frame * 2, 48, 14 + frame * 3, rgba(70, 230, 210));
  drawTextCentered(t, frame & 1 ? 'ПУСТ' : 'VOID', 38, rgba(220, 210, 255));
  drawScanlines(t, rgba(40, 0, 0, 70));
}

export function generateProceduralScreenTextures(textures: Uint32Array[]): void {
  for (let variant = 0; variant < SCREEN_VARIANTS; variant++) {
    for (let frame = 0; frame < SCREEN_FRAMES; frame++) {
      const t = textures[screenTex(variant, frame)];
      drawScreenCase(t, 600 + variant * 40, frame);
      switch (variant) {
        case 0: drawSamosborWarning(t, frame); break;
        case 1: drawShortageGraph(t, frame); break;
        case 2: drawFactionMap(t, frame); break;
        case 3: drawLiftAnomaly(t, frame); break;
        case 4: drawMinistry(t, frame); break;
        case 5: drawHomeTv(t, frame); break;
        case 6: drawMaintenance(t, frame); break;
        default: drawHell(t, frame); break;
      }
    }
  }
}

function floorScreenCap(floor: FloorLevel): number {
  return Math.min(FLOOR_CAP[floor], Math.floor(W * W * SCREEN_MAX_RATIO));
}

function baseWallTexFor(floor: FloorLevel): Tex {
  switch (floor) {
    case FloorLevel.MINISTRY: return Tex.MARBLE;
    case FloorLevel.MAINTENANCE: return Tex.PIPE;
    case FloorLevel.HELL: return Tex.MEAT;
    default: return Tex.PANEL;
  }
}

function restoreExistingScreens(world: World, floor: FloorLevel): void {
  for (const ci of world.screenCells) {
    if (world.cells[ci] !== Cell.WALL) continue;
    const x = ci % W;
    const y = (ci / W) | 0;
    let restored = false;
    for (const [dx, dy] of DIRS) {
      const ni = world.idx(x + dx, y + dy);
      const rid = world.roomMap[ni];
      const room = rid >= 0 ? world.rooms[rid] : undefined;
      if (room) {
        world.wallTex[ci] = room.wallTex;
        restored = true;
        break;
      }
    }
    if (!restored) world.wallTex[ci] = baseWallTexFor(floor);
    if (world.features[ci] === Feature.SCREEN) world.features[ci] = Feature.NONE;
  }
  world.screenCells.length = 0;
}

function isPlainWallTexture(tex: number): boolean {
  return tex === Tex.CONCRETE || tex === Tex.BRICK || tex === Tex.PANEL || tex === Tex.TILE_W
    || tex === Tex.METAL || tex === Tex.PIPE || tex === Tex.MARBLE || tex === Tex.MEAT || tex === Tex.GUT;
}

function isRoomEligible(floor: FloorLevel, room: Room): boolean {
  if (room.name === 'Актовый зал') return false;
  switch (floor) {
    case FloorLevel.MINISTRY:
      return room.type === RoomType.OFFICE || room.type === RoomType.COMMON || room.type === RoomType.CORRIDOR
        || room.type === RoomType.MEDICAL || room.type === RoomType.STORAGE;
    case FloorLevel.KVARTIRY:
      return room.type === RoomType.LIVING || room.type === RoomType.KITCHEN || room.type === RoomType.COMMON
        || room.type === RoomType.OFFICE || room.type === RoomType.SMOKING;
    case FloorLevel.LIVING:
      return room.type === RoomType.LIVING || room.type === RoomType.COMMON || room.type === RoomType.PRODUCTION
        || room.type === RoomType.OFFICE || room.type === RoomType.MEDICAL;
    case FloorLevel.MAINTENANCE:
      return room.type === RoomType.PRODUCTION || room.type === RoomType.OFFICE || room.type === RoomType.MEDICAL
        || room.type === RoomType.COMMON;
    default:
      return false;
  }
}

function roomChance(floor: FloorLevel, room: Room): number {
  const area = room.w * room.h;
  const scale = area >= 100 ? 1.45 : area >= 45 ? 1 : 0.55;
  let base = 0;
  switch (floor) {
    case FloorLevel.MINISTRY:
      base = room.type === RoomType.COMMON ? 0.20 : room.type === RoomType.OFFICE ? 0.10 : 0.07;
      break;
    case FloorLevel.KVARTIRY:
      base = room.type === RoomType.LIVING ? 0.018 : room.type === RoomType.COMMON ? 0.032 : 0.014;
      break;
    case FloorLevel.LIVING:
      base = room.type === RoomType.PRODUCTION || room.type === RoomType.MEDICAL ? 0.10 : 0.045;
      break;
    case FloorLevel.MAINTENANCE:
      base = room.type === RoomType.PRODUCTION || room.type === RoomType.OFFICE ? 0.16 : 0.08;
      break;
  }
  return Math.min(0.35, base * scale);
}

function collectRoomWallCells(world: World, room: Room): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const x = world.wrap(room.x + dx);
      const y = world.wrap(room.y + dy);
      const ci = world.idx(x, y);
      if (seen.has(ci)) continue;
      seen.add(ci);
      if (world.cells[ci] !== Cell.WALL) continue;
      if (world.features[ci] !== Feature.NONE) continue;
      if (!isPlainWallTexture(world.wallTex[ci])) continue;
      let facesRoom = false;
      let nearDoor = false;
      for (const [ox, oy] of DIRS) {
        const ni = world.idx(x + ox, y + oy);
        if (world.cells[ni] === Cell.DOOR) nearDoor = true;
        if (world.cells[ni] === Cell.FLOOR && world.roomMap[ni] === room.id) facesRoom = true;
      }
      if (facesRoom && !nearDoor) out.push(ci);
    }
  }
  return out;
}

function shuffleNumbers(a: number[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
}

function placeScreenAt(world: World, ci: number, variant: number): void {
  const x = ci % W;
  const y = (ci / W) | 0;
  const frame = Math.floor(hash01(x, y, 700) * SCREEN_FRAMES);
  world.wallTex[ci] = screenTex(variant, frame);
  world.features[ci] = Feature.SCREEN;
  world.screenCells.push(ci);
}

function isNearLift(world: World, x: number, y: number): boolean {
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.LIFT || world.features[ci] === Feature.LIFT_BUTTON) return true;
    }
  }
  return false;
}

function signalWeight(
  def: ScreenSignalDef,
  floor: FloorLevel,
  room: Room | undefined,
  zoneFaction: ZoneFaction | undefined,
  nearLift: boolean,
): number {
  if (!screenSignalEligible(def, floor, room?.type, zoneFaction)) return 0;
  let w = def.weight;
  if (nearLift && def.id === 'elevator_anomaly') w *= 5;
  if (zoneFaction === ZoneFaction.SAMOSBOR && def.id === 'samosbor_warning') w *= 4;
  if (floor === FloorLevel.MINISTRY && def.id === 'ministry_queue') w *= room?.type === RoomType.COMMON ? 2 : 1.4;
  if (floor === FloorLevel.MAINTENANCE && def.id === 'maintenance_pressure') w *= room?.type === RoomType.PRODUCTION ? 2 : 1.3;
  if (floor === FloorLevel.HELL && def.id === 'void_protocol') w *= 3;
  return w;
}

function pickSignal(world: World, floor: FloorLevel, room: Room | undefined, ci: number): ScreenSignalDef {
  const x = ci % W;
  const y = (ci / W) | 0;
  const zoneFaction = world.zones[world.zoneMap[ci]]?.faction;
  const nearLift = isNearLift(world, x, y);
  let total = 0;
  for (const def of SCREEN_SIGNAL_DEFS) total += signalWeight(def, floor, room, zoneFaction, nearLift);
  if (total <= 0) return SCREEN_SIGNAL_DEFS[0];
  let roll = hash01(x, y, 701) * total;
  for (const def of SCREEN_SIGNAL_DEFS) {
    roll -= signalWeight(def, floor, room, zoneFaction, nearLift);
    if (roll <= 0) return def;
  }
  return SCREEN_SIGNAL_DEFS[0];
}

function pickVariant(def: ScreenSignalDef, x: number, y: number): number {
  const variants = def.textureVariants;
  return variants[Math.floor(hash01(x, y, 703) * variants.length)] ?? variants[0] ?? 0;
}

function placeRoomScreens(world: World, floor: FloorLevel, cap: number): void {
  for (const room of world.rooms) {
    if (world.screenCells.length >= cap) break;
    if (!room || !isRoomEligible(floor, room)) continue;
    if (Math.random() > roomChance(floor, room)) continue;
    const cells = collectRoomWallCells(world, room);
    if (cells.length === 0) continue;
    shuffleNumbers(cells);
    const count = room.w * room.h > 140 && Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < count && i < cells.length && world.screenCells.length < cap; i++) {
      const ci = cells[i];
      const signal = pickSignal(world, floor, room, ci);
      placeScreenAt(world, ci, pickVariant(signal, ci % W, (ci / W) | 0));
    }
  }
}

function placeHellScreens(world: World, cap: number): void {
  for (let attempt = 0; attempt < 7000 && world.screenCells.length < cap; attempt++) {
    const ci = Math.floor(Math.random() * W * W);
    if (world.cells[ci] !== Cell.WALL || world.features[ci] !== Feature.NONE) continue;
    if (world.wallTex[ci] !== Tex.MEAT && world.wallTex[ci] !== Tex.GUT) continue;
    const x = ci % W;
    const y = (ci / W) | 0;
    let facesFloor = false;
    for (const [dx, dy] of DIRS) {
      const ni = world.idx(x + dx, y + dy);
      if (world.cells[ni] === Cell.FLOOR) { facesFloor = true; break; }
    }
    if (!facesFloor) continue;
    if (Math.random() < 0.10) {
      const signal = pickSignal(world, FloorLevel.HELL, undefined, ci);
      placeScreenAt(world, ci, pickVariant(signal, x, y));
    }
  }
}

export function placeProceduralScreens(world: World, floor: FloorLevel): void {
  restoreExistingScreens(world, floor);
  const cap = floorScreenCap(floor);
  if (cap <= 0) return;
  if (floor === FloorLevel.HELL) placeHellScreens(world, cap);
  else placeRoomScreens(world, floor, cap);
}

export function flashSamosborWarningScreens(world: World, cx: number, cy: number, radius: number, maxScreens: number): number {
  if (world.screenCells.length === 0 || radius <= 0 || maxScreens <= 0) return 0;
  const r2 = radius * radius;
  let changed = 0;
  for (const ci of world.screenCells) {
    if (changed >= maxScreens) break;
    const tex = world.wallTex[ci];
    if (!isScreenTex(tex)) continue;
    const x = ci % W;
    const y = (ci / W) | 0;
    if (world.dist2(cx + 0.5, cy + 0.5, x + 0.5, y + 0.5) > r2) continue;
    const frame = Math.floor(hash01(x, y, 704) * SCREEN_FRAMES);
    const desired = screenTex(0, frame);
    if (tex === desired) continue;
    world.wallTex[ci] = desired;
    changed++;
  }
  if (changed > 0) world.markWallTexDirty();
  return changed;
}

export function updateProceduralScreens(world: World, time: number): boolean {
  if (world.screenCells.length === 0) return false;
  const step = Math.floor(time / 1.2);
  let dirty = false;
  for (const ci of world.screenCells) {
    const tex = world.wallTex[ci];
    if (!isScreenTex(tex)) continue;
    const variant = Math.floor((tex - Tex.SCREEN_BASE) / SCREEN_FRAMES);
    const phase = Math.floor(hash01(ci % W, (ci / W) | 0, 702) * SCREEN_FRAMES);
    const desired = screenTex(variant, (step + phase) % SCREEN_FRAMES);
    if (tex !== desired) {
      world.wallTex[ci] = desired;
      dirty = true;
    }
  }
  return dirty;
}

export interface ProceduralScreenSummary {
  total: number;
  unknown: number;
  bySignal: Partial<Record<ScreenSignalId, number>>;
  lines: string[];
}

export function summarizeProceduralScreens(world: World): ProceduralScreenSummary {
  const bySignal: Partial<Record<ScreenSignalId, number>> = {};
  let unknown = 0;
  for (const ci of world.screenCells) {
    const tex = world.wallTex[ci];
    if (!isScreenTex(tex)) { unknown++; continue; }
    const variant = Math.floor((tex - Tex.SCREEN_BASE) / SCREEN_FRAMES);
    const signal = screenSignalForVariant(variant);
    if (signal) bySignal[signal.id] = (bySignal[signal.id] ?? 0) + 1;
    else unknown++;
  }
  const lines = [`screens=${world.screenCells.length}`];
  for (const def of SCREEN_SIGNAL_DEFS) {
    const count = bySignal[def.id] ?? 0;
    if (count > 0) lines.push(`${def.id}=${count}`);
  }
  if (unknown > 0) lines.push(`unknown=${unknown}`);
  return { total: world.screenCells.length, unknown, bySignal, lines };
}

/* ── Wolfenstein-style DDA raycaster on toroidal world ────────── */

import { W, Cell, DoorState, TEX, Tex, MAX_DRAW, Feature, type Entity, EntityType } from '../core/types';
import { World } from '../core/world';
import type { TexData } from './textures';
import type { SpriteData } from './sprites';
import { noise } from './pixutil';

/* ── Screen constants ─────────────────────────────────────────── */
export const SCR_W = 320;
export const SCR_H = 200;
export const FOV = Math.PI / 3;       // 60 degrees
export const HALF_FOV = FOV / 2;

/* ── Per-column depth buffer (for sprite clipping) ────────────── */
export const zBuf = new Float64Array(SCR_W);

/* ── Raycaster render ─────────────────────────────────────────── */
export function renderScene(
  buf: Uint32Array,       // SCR_W * SCR_H output buffer
  world: World,
  textures: TexData[],
  sprites: SpriteData[],
  entities: Entity[],
  px: number, py: number, pAngle: number, pPitch: number,
  fogDensity: number,
  glitch: number,
  camHeight = 0.5,        // camera height: 0=floor, 1=ceiling, 0.5=default
  flashlight = 0,         // 0..1 dynamic radial light around camera
  time = 0,
): void {
  // Y-shearing: shift horizon based on pitch (-1..1)
  const horizonShift = Math.floor(pPitch * SCR_H);
  const HALF_H = Math.floor(SCR_H / 2) + horizonShift;
  const dirX = Math.cos(pAngle);
  const dirY = Math.sin(pAngle);
  // Camera plane (perpendicular to direction, scaled by FOV)
  const planeLen = Math.tan(HALF_FOV);
  const planeX = -dirY * planeLen;
  const planeY =  dirX * planeLen;

  // Fog color: purple if player is in fogged area, otherwise dark
  const pci = world.idx(Math.floor(px), Math.floor(py));
  const purpleFog = world.fog[pci] > 50;
  const fogR = purpleFog ? 20 : 5;
  const fogG = purpleFog ? 5 : 5;
  const fogB = purpleFog ? 30 : 8;
  const AMBIENT = 0.12; // base darkness level — very dark without lamps
  const flashlightBoost = (dist: number): number => {
    if (flashlight <= 0) return 0;
    const radius = 8.5;
    if (dist >= radius) return 0;
    const t = 1 - dist / radius;
    return flashlight * t * t * 0.95;
  };

  /* ── Cast walls ─────────────────────────────────────────── */
  for (let col = 0; col < SCR_W; col++) {
    const camX = 2 * col / SCR_W - 1; // -1..1
    const rayDX = dirX + planeX * camX;
    const rayDY = dirY + planeY * camX;

    let mapX = Math.floor(px);
    let mapY = Math.floor(py);
    const ddx = Math.abs(1 / rayDX);
    const ddy = Math.abs(1 / rayDY);
    const stepX = rayDX < 0 ? -1 : 1;
    const stepY = rayDY < 0 ? -1 : 1;
    let sdx = rayDX < 0 ? (px - mapX) * ddx : (mapX + 1 - px) * ddx;
    let sdy = rayDY < 0 ? (py - mapY) * ddy : (mapY + 1 - py) * ddy;

    let side = 0;
    let hit = false;
    let dist = MAX_DRAW;
    let wallTex = Tex.CONCRETE;
    let hitAbyss = false;

    for (let step = 0; step < MAX_DRAW * 2; step++) {
      if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
      else           { sdy += ddy; mapY += stepY; side = 1; }

      const wx = ((mapX % W) + W) % W;
      const wy = ((mapY % W) + W) % W;
      const ci = wy * W + wx;
      const cell = world.cells[ci];

      if (cell === Cell.WALL) {
        dist = side === 0 ? sdx - ddx : sdy - ddy;
        wallTex = world.wallTex[ci] || Tex.CONCRETE;
        hit = true;
        break;
      }
      if (cell === Cell.LIFT) {
        dist = side === 0 ? sdx - ddx : sdy - ddy;
        wallTex = Tex.LIFT_DOOR;
        hit = true;
        break;
      }
      if (cell === Cell.ABYSS) {
        dist = side === 0 ? sdx - ddx : sdy - ddy;
        wallTex = Tex.DARK;
        hit = true;
        hitAbyss = true;
        break;
      }
      if (cell === Cell.DOOR) {
        const door = world.doors.get(ci);
        if (!door) {
          // Orphaned Cell.DOOR with no data — render as wall
          dist = side === 0 ? sdx - ddx : sdy - ddy;
          wallTex = world.wallTex[ci] || Tex.CONCRETE;
          hit = true;
          break;
        }
        if (door.state !== DoorState.OPEN && door.state !== DoorState.HERMETIC_OPEN) {
          dist = side === 0 ? sdx - ddx : sdy - ddy;
          wallTex = door.state === DoorState.LOCKED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
          hit = true;
          break;
        }
      }
    }

    zBuf[col] = dist;
    if (!hit) { dist = MAX_DRAW; }
    if (dist < 0.001) dist = 0.001;

    // Wall height (y-sheared), shifted by camera height
    const lineH = Math.floor(SCR_H / dist);
    let drawStart = Math.max(0, HALF_H - Math.floor(lineH * (1 - camHeight)));
    let drawEnd   = Math.min(SCR_H - 1, HALF_H + Math.floor(lineH * camHeight));

    // Texture X coordinate
    let wallX: number;
    if (side === 0) wallX = py + dist * rayDY;
    else            wallX = px + dist * rayDX;
    wallX -= Math.floor(wallX);
    let texX = Math.floor(wallX * TEX) & (TEX - 1);
    // Flip textures so text reads correctly from the viewing side
    if (side === 0 && rayDX < 0) texX = TEX - 1 - texX;
    if (side === 1 && rayDY > 0) texX = TEX - 1 - texX;

    // Fetch texture
    const tex = textures[wallTex] ?? textures[0];
    const fogF = Math.min(1, dist * fogDensity);

    // Draw wall column (abyss walls render as dark edge)
    if (hitAbyss) {
      // Abyss wall: render short dark edge, then infinite pit below
      const edgeH = Math.min(lineH, Math.floor(SCR_H * 0.15));
      const edgeMid = HALF_H;
      const edgeStart = Math.max(0, edgeMid - Math.floor(edgeH / 2));
      const edgeEnd = Math.min(SCR_H - 1, edgeMid + Math.floor(edgeH / 2));
      const tex = textures[Tex.DARK] ?? textures[0];
      for (let y = edgeStart; y <= edgeEnd; y++) {
        const d = y - edgeStart;
        const texY = Math.floor((d / edgeH) * TEX) & (TEX - 1);
        let c = darken(tex[texY * TEX + texX], 0.3);
        c = applyFog(c, Math.min(1, dist * fogDensity), fogR, fogG, fogB);
        buf[y * SCR_W + col] = c;
      }
      // Below edge: deep void gradient
      for (let y = edgeEnd + 1; y < SCR_H; y++) {
        const depthF = (y - edgeEnd) / (SCR_H - edgeEnd);
        const v = Math.max(0, Math.floor(4 * (1 - depthF)));
        buf[y * SCR_W + col] = ((0xFF << 24) | (v << 16) | (v << 8) | v) >>> 0;
      }
      // Above edge: dark ceiling fading up
      for (let y = 0; y < edgeStart; y++) {
        const upF = (edgeStart - y) / edgeStart;
        const v = Math.max(0, Math.floor(3 * (1 - upF)));
        buf[y * SCR_W + col] = ((0xFF << 24) | ((v + 2) << 16) | (v << 8) | v) >>> 0;
      }
    } else {
    // Normal wall rendering
    const hitWX = ((mapX % W) + W) % W;
    const hitWY = ((mapY % W) + W) % W;
    const hitCI = hitWY * W + hitWX;
    const lit = Math.min(1, AMBIENT + world.light[hitCI] * (1 - AMBIENT) + flashlightBoost(dist));
    const surfWall = world.surfaceMap.get(hitCI);
    for (let y = drawStart; y <= drawEnd; y++) {
      const d = y - (HALF_H - lineH * (1 - camHeight));
      const texY = Math.floor((d / lineH) * TEX) & (TEX - 1);
      let c = tex[texY * TEX + texX];
      // Surface overlay BEFORE lighting (blood, bullet holes, etc.)
      if (surfWall) {
        const bx = texX >> 2, by = texY >> 2;
        const si = (by * 16 + bx) << 2;
        const sa = surfWall[si + 3];
        if (sa > 0) {
          const a = sa / 255;
          const cr = (c & 0xFF), cg = ((c >> 8) & 0xFF), cb = ((c >> 16) & 0xFF);
          const nr = Math.floor(cr * (1 - a) + surfWall[si]     * a);
          const ng = Math.floor(cg * (1 - a) + surfWall[si + 1] * a);
          const nb = Math.floor(cb * (1 - a) + surfWall[si + 2] * a);
          c = ((0xFF << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
        }
      }
      if (isHellOrganicWall(wallTex)) {
        c = applyHellEyeOverlay(c, texX, texY, hitWX, hitWY, px, py, time);
      }
      // Darken side
      if (side === 1) c = darken(c, 0.7);
      c = darken(c, lit);
      // Fog
      c = applyFog(c, fogF, fogR, fogG, fogB);
      buf[y * SCR_W + col] = c;
    }

    // ── Floor & ceiling casting (y-sheared) ───────────────
    let fwx: number, fwy: number;
    if (side === 0 && rayDX > 0)      { fwx = mapX;     fwy = mapY + wallX; }
    else if (side === 0 && rayDX < 0) { fwx = mapX + 1; fwy = mapY + wallX; }
    else if (side === 1 && rayDY > 0) { fwx = mapX + wallX; fwy = mapY; }
    else                              { fwx = mapX + wallX; fwy = mapY + 1; }

    // Floor: from below wall to bottom of screen
    for (let y = drawEnd + 1; y < SCR_H; y++) {
      const rowDist = y - HALF_H;
      if (rowDist <= 0) continue;
      const currentDist = (SCR_H * camHeight) / rowDist;
      const weight = Math.min(currentDist / dist, 1.0);
      const floorX = weight * fwx + (1.0 - weight) * px;
      const floorY = weight * fwy + (1.0 - weight) * py;

      const fxi = ((Math.floor(floorX) % W) + W) % W;
      const fyi = ((Math.floor(floorY) % W) + W) % W;
      const fi = fyi * W + fxi;

      const ftx = Math.floor(floorX * TEX) & (TEX - 1);
      const fty = Math.floor(floorY * TEX) & (TEX - 1);
      const ff = Math.min(1, currentDist * fogDensity);
      const cellLight = Math.min(1, AMBIENT + world.light[fi] * (1 - AMBIENT) + flashlightBoost(currentDist));

      const isAbyssF = world.cells[fi] === Cell.ABYSS;
      const isWaterF = world.cells[fi] === Cell.WATER;
      if (isAbyssF) {
        const voidF = Math.min(1, currentDist * 0.12);
        const v = Math.floor(3 * (1 - voidF));
        buf[y * SCR_W + col] = ((0xFF << 24) | (v << 16) | (v << 8) | v) >>> 0;
      } else {
        const floorTexId = isWaterF ? Tex.F_WATER : (world.floorTex[fi] || Tex.F_CONCRETE);
        const fTex = textures[floorTexId] ?? textures[0];
        let fc = fTex[fty * TEX + ftx];
        // Surface overlay BEFORE lighting (blood, urine, bullet holes, etc.)
        const bx = ftx >> 2, by = fty >> 2;
        const surfCell = world.surfaceMap.get(fi);
        if (surfCell) {
          const si = (by * 16 + bx) << 2;
          const sa = surfCell[si + 3];
          if (sa > 0) {
            const a = sa / 255;
            const cr = (fc & 0xFF), cg = ((fc >> 8) & 0xFF), cb = ((fc >> 16) & 0xFF);
            const nr = Math.floor(cr * (1 - a) + surfCell[si]     * a);
            const ng = Math.floor(cg * (1 - a) + surfCell[si + 1] * a);
            const nb = Math.floor(cb * (1 - a) + surfCell[si + 2] * a);
            fc = ((0xFF << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
          }
        }
        fc = darken(fc, cellLight);
        buf[y * SCR_W + col] = applyFog(fc, ff, fogR, fogG, fogB);
      }
    }

    // Ceiling: from top of screen down to above wall
    for (let y = drawStart - 1; y >= 0; y--) {
      const rowDist = HALF_H - y;
      if (rowDist <= 0) continue;
      const currentDist = (SCR_H * (1 - camHeight)) / rowDist;
      const weight = Math.min(currentDist / dist, 1.0);
      const floorX = weight * fwx + (1.0 - weight) * px;
      const floorY = weight * fwy + (1.0 - weight) * py;

      const fxi = ((Math.floor(floorX) % W) + W) % W;
      const fyi = ((Math.floor(floorY) % W) + W) % W;
      const fi = fyi * W + fxi;

      const ftx = Math.floor(floorX * TEX) & (TEX - 1);
      const fty = Math.floor(floorY * TEX) & (TEX - 1);
      const ff = Math.min(1, currentDist * fogDensity);
      const cellLight = Math.min(1, AMBIENT + world.light[fi] * (1 - AMBIENT) + flashlightBoost(currentDist));

      const isAbyssC = world.cells[fi] === Cell.ABYSS;
      if (isAbyssC) {
        const voidF = Math.min(1, currentDist * 0.12);
        const v = Math.floor(4 * (1 - voidF));
        buf[y * SCR_W + col] = ((0xFF << 24) | ((v + 1) << 16) | (v << 8) | v) >>> 0;
      } else {
        const feat = world.features[fi];
        let cc: number;
        if (feat === Feature.LAMP) {
          const glow = Math.max(0, 1.0 - currentDist * 0.15);
          const lr = Math.min(255, Math.floor(220 * glow));
          const lg = Math.min(255, Math.floor(180 * glow));
          const lb = Math.min(255, Math.floor(80 * glow));
          cc = (0xFF << 24 | lb << 16 | lg << 8 | lr) >>> 0;
        } else {
          const cTex = textures[Tex.CEIL] ?? textures[0];
          cc = darken(cTex[fty * TEX + ftx], cellLight);
        }
        buf[y * SCR_W + col] = applyFog(cc, ff, fogR, fogG, fogB);
      }
    }
    } // end else (non-abyss wall)
  }

  /* ── Glitch effect ──────────────────────────────────────── */
  if (glitch > 0) {
    for (let y = 0; y < SCR_H; y++) {
      if (Math.random() < glitch * 0.3) {
        const shift = Math.floor((Math.random() - 0.5) * glitch * 20);
        const row = y * SCR_W;
        if (shift > 0) {
          for (let x = SCR_W - 1; x >= shift; x--) buf[row + x] = buf[row + x - shift];
        } else if (shift < 0) {
          for (let x = 0; x < SCR_W + shift; x++) buf[row + x] = buf[row + x - shift];
        }
      }
    }
  }

  /* ── Sprite rendering ───────────────────────────────────── */
  renderSprites(buf, world, textures, sprites, entities, px, py, pAngle, dirX, dirY, planeX, planeY, fogDensity, fogR, fogG, fogB, HALF_H, camHeight);
}

/* ── Sprite rendering with depth sorting ──────────────────────── */
function renderSprites(
  buf: Uint32Array, _world: World, _textures: TexData[], sprites: SpriteData[],
  entities: Entity[], px: number, py: number, _pAngle: number,
  dirX: number, dirY: number, planeX: number, planeY: number,
  fogDensity: number, fogR: number, fogG: number, fogB: number,
  halfH: number, camHeight: number,
): void {
  // Collect visible entities with toroidal distance
  const visible: { e: Entity; dx: number; dy: number; dist: number }[] = [];
  for (const e of entities) {
    if (!e.alive || e.type === EntityType.PLAYER) continue;
    let dx = e.x - px;
    let dy = e.y - py;
    if (dx >  W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    if (dy >  W / 2) dy -= W;
    if (dy < -W / 2) dy += W;
    const dist = dx * dx + dy * dy;
    if (dist < MAX_DRAW * MAX_DRAW) {
      visible.push({ e, dx, dy, dist });
    }
  }
  // Sort far to near
  visible.sort((a, b) => b.dist - a.dist);

  const invDet = 1.0 / (planeX * dirY - dirX * planeY);

  for (const { e, dx, dy, dist } of visible) {
    // Transform to camera space
    const txf = invDet * (dirY * dx - dirX * dy);
    const tyf = invDet * (-planeY * dx + planeX * dy);
    if (tyf <= 0.1) continue; // behind camera

    const spriteScreenX = Math.floor((SCR_W / 2) * (1 + txf / tyf));
    const rawH = Math.abs(Math.floor(SCR_H / tyf));
    const scale = e.spriteScale ?? 1.0;
    const spriteH = Math.floor(rawH * scale);
    const spriteW = spriteH; // square sprites

    // Vertical offset: spriteZ 0=ground, 0.5=eye level
    const spriteZ = e.spriteZ ?? 0;
    const footY = halfH + Math.floor(rawH * camHeight) - Math.floor(rawH * spriteZ);
    const drawStartY = Math.max(0, footY - spriteH);
    const drawEndY   = Math.min(SCR_H - 1, footY);
    const drawStartX = Math.max(0, spriteScreenX - Math.floor(spriteW / 2));
    const drawEndX   = Math.min(SCR_W - 1, spriteScreenX + Math.floor(spriteW / 2));

    const spr = sprites[e.sprite] ?? sprites[0];
    if (!spr) continue;
    const ff = Math.min(1, Math.sqrt(dist) * fogDensity);
    const isProjectile = e.type === EntityType.PROJECTILE;

    for (let x = drawStartX; x <= drawEndX; x++) {
      if (tyf >= zBuf[x]) continue; // behind wall
      const texX = Math.floor((x - (spriteScreenX - spriteW / 2)) / spriteW * TEX) & (TEX - 1);
      for (let y = drawStartY; y <= drawEndY; y++) {
        const texY = Math.floor((y - drawStartY) / spriteH * TEX) & (TEX - 1);
        const c = spr[texY * TEX + texX];
        if ((c >>> 24) < 128) continue; // transparent
        if (isProjectile) {
          // Additive glow blend for projectiles
          const idx = y * SCR_W + x;
          const bg = buf[idx];
          const sr = (c & 0xFF), sg = ((c >> 8) & 0xFF), sb = ((c >> 16) & 0xFF);
          const br = (bg & 0xFF), bgg = ((bg >> 8) & 0xFF), bb = ((bg >> 16) & 0xFF);
          const glow = 1 - ff * 0.5; // less fog fade for glow
          const nr = Math.min(255, br + Math.floor(sr * glow));
          const ng = Math.min(255, bgg + Math.floor(sg * glow));
          const nb = Math.min(255, bb + Math.floor(sb * glow));
          buf[idx] = ((0xFF << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
        } else {
          buf[y * SCR_W + x] = applyFog(c, ff, fogR, fogG, fogB);
        }
      }
    }
  }
}

/* ── Color helpers ────────────────────────────────────────────── */
function darken(c: number, f: number): number {
  const r = (c & 0xFF) * f;
  const g = ((c >> 8) & 0xFF) * f;
  const b = ((c >> 16) & 0xFF) * f;
  const a = (c >>> 24);
  return ((a << 24) | (Math.floor(b) << 16) | (Math.floor(g) << 8) | Math.floor(r)) >>> 0;
}

function applyFog(c: number, f: number, fr: number, fg: number, fb: number): number {
  const r = (c & 0xFF);
  const g = ((c >> 8) & 0xFF);
  const b = ((c >> 16) & 0xFF);
  return (
    (0xFF << 24) |
    (Math.floor(b + (fb - b) * f) << 16) |
    (Math.floor(g + (fg - g) * f) << 8) |
    Math.floor(r + (fr - r) * f)
  ) >>> 0;
}

function isHellOrganicWall(tex: Tex): boolean {
  return tex === Tex.MEAT || tex === Tex.GUT;
}

function applyHellEyeOverlay(base: number, texX: number, texY: number, cellX: number, cellY: number, px: number, py: number, time: number): number {
  const marker = noise(cellX, cellY, 901);
  if (marker < 0.84) return base;

  const eyeCount = marker > 0.97 ? 3 : marker > 0.915 ? 2 : 1;
  const blinkSpeed = 0.25 + noise(cellX, cellY, 902) * 0.9;
  const cycle = (time * blinkSpeed + noise(cellX, cellY, 903) * 5.0) % 1;
  const eyelid = cycle < 0.16 ? Math.max(0.04, Math.abs(cycle - 0.08) / 0.08) : 1;
  const toPlayerX = toroidalDelta(cellX + 0.5, px);
  const toPlayerY = toroidalDelta(cellY + 0.5, py);
  const playerDist = Math.sqrt(toPlayerX * toPlayerX + toPlayerY * toPlayerY);
  const track = playerDist < 7.5 ? (1 - playerDist / 7.5) : 0;

  let color = base;
  for (let eyeIndex = 0; eyeIndex < eyeCount; eyeIndex++) {
    const ox = 12 + noise(cellX + eyeIndex * 17, cellY, 904) * 40;
    const oy = 14 + noise(cellX, cellY + eyeIndex * 23, 905) * 36;
    const rx = 6 + noise(cellX + eyeIndex * 31, cellY, 906) * 7;
    const ry = Math.max(1.2, rx * (0.12 + eyelid * 0.42));
    const dx = texX - ox;
    const dy = texY - oy;
    const norm = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (norm > 1) continue;

    color = mixColor(color, 230, 216, 182, 0.78);

  const idleShiftX = (noise(cellX, cellY, 907 + eyeIndex) - 0.5) * 1.4;
  const idleShiftY = (noise(cellX, cellY, 909 + eyeIndex) - 0.5) * 1.1;
  const irisShiftX = idleShiftX + clampSigned(toPlayerX * 0.55 * track, rx * 0.24);
  const irisShiftY = idleShiftY + clampSigned(toPlayerY * 0.55 * track, ry * 0.28);
    const irisR = rx * 0.42;
    const pupilR = rx * 0.18;
    const ix = texX - (ox + irisShiftX);
    const iy = texY - (oy + irisShiftY);
    const irisNorm = (ix * ix + iy * iy) / (irisR * irisR);
    if (irisNorm < 1 && eyelid > 0.18) {
      color = mixColor(color, 186, 46, 28, 0.82);
    }
    const pupilNorm = (ix * ix + iy * iy) / (pupilR * pupilR);
    if (pupilNorm < 1 && eyelid > 0.22) {
      color = mixColor(color, 18, 8, 6, 0.92);
    }
    const glint = (texX - (ox - rx * 0.18)) ** 2 + (texY - (oy - ry * 0.22)) ** 2;
    if (glint < 3.5 && eyelid > 0.35) {
      color = mixColor(color, 255, 248, 238, 0.85);
    }
  }

  return color;
}

function mixColor(base: number, r: number, g: number, b: number, alpha: number): number {
  const br = base & 0xFF;
  const bg = (base >> 8) & 0xFF;
  const bb = (base >> 16) & 0xFF;
  const nr = Math.floor(br * (1 - alpha) + r * alpha);
  const ng = Math.floor(bg * (1 - alpha) + g * alpha);
  const nb = Math.floor(bb * (1 - alpha) + b * alpha);
  return ((0xFF << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
}

function toroidalDelta(a: number, b: number): number {
  let d = b - a;
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
}

function clampSigned(v: number, limit: number): number {
  if (v > limit) return limit;
  if (v < -limit) return -limit;
  return v;
}

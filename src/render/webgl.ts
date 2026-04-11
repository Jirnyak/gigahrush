/* ── WebGL raycaster engine ────────────────────────────────────── *
 * GPU-accelerated DDA raycasting via fragment shader.             *
 * Replaces the software raycaster loop from engine.ts.             *
 * World data is uploaded as data textures; all 64×64 game         *
 * textures are packed into a single atlas.                        *
 * ────────────────────────────────────────────────────────────── */

import {
  W, Cell, TEX, Tex, MAX_DRAW, Feature,
  type Entity, EntityType, ProjType,
} from '../core/types';
import { World } from '../core/world';
import type { TexData } from './textures';
import type { SpriteData } from './sprites';
import type { BloodParticle } from './blood';

/* ── Constants ─────────────────────────────────────────────────── */
export const SCR_W = 320;
export const SCR_H = 200;
const FOV = Math.PI / 3;
const HALF_FOV = FOV / 2;

/** Per-column depth buffer — unused (GPU depth test handles sprite clipping) */

/* ── Texture atlas layout ─────────────────────────────────────── *
 * All game textures (64×64 each) are packed into a single 2D     *
 * texture atlas. Layout: ATLAS_COLS textures per row.             */
const ATLAS_COLS = 8;             // 8 textures per row
const ATLAS_TEX_SIZE = TEX;       // 64px each texture

/* ── GLSL Shaders ─────────────────────────────────────────────── */

const VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;        // 0..1
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// The raycaster fragment shader — performs DDA per pixel column
const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

/* ── Uniforms ─────────────────────────────────────────────────── */
uniform vec2  uResolution;       // screen size (320, 200)
uniform vec2  uPos;              // player position
uniform float uAngle;            // player angle
uniform float uPitch;            // camera pitch (-1..1)
uniform float uFogDensity;
uniform float uGlitch;
uniform float uCamHeight;        // 0..1 (0.5 = default)
uniform float uFlashlight;       // 0..1
uniform float uTime;
uniform int   uPurpleFog;        // 1 if player is in fogged area

/* ── Data textures ────────────────────────────────────────────── */
uniform highp usampler2D uCells;      // W×W: cell type (uint8)
uniform highp usampler2D uWallTex;    // W×W: wall texture id
uniform highp usampler2D uFloorTex;   // W×W: floor texture id
uniform highp usampler2D uFeatures;   // W×W: features
uniform sampler2D uLight;             // W×W: lightmap (float)
uniform highp usampler2D uFog;        // W×W: fog density
uniform highp usampler2D uDoorStates; // W×W: door states (0=open, 1=closed, 2=locked, 3=hopen, 4=hclosed)

/* ── Texture atlas ────────────────────────────────────────────── */
uniform sampler2D uAtlas;             // packed texture atlas
uniform vec2  uAtlasSize;             // atlas dimensions in pixels

/* ── Surface marks overlay (blood, bullet holes, etc.) ────────── */
uniform sampler2D uSurfaceAtlas;      // 512×512 RGBA atlas of 16×16 cell overlays
uniform highp usampler2D uSurfaceIdx; // W×W: cell → atlas slot (0=none, 1+ = slot)

/* ── Depth output (for sprite clipping on CPU) ────────────────── */
// We write depth into a color attachment that gets read back
out vec4 fragColor;

const int W_SIZE = ${W};
const int MAX_STEPS = ${MAX_DRAW * 2};
const float MAX_DIST = ${MAX_DRAW.toFixed(1)};
const float TEX_F = ${TEX.toFixed(1)};
const int TEX_I = ${TEX};
const int ATLAS_COLS_I = ${ATLAS_COLS};
const float AMBIENT = 0.12;
const float PI = 3.14159265;

/* ── Helpers ──────────────────────────────────────────────────── */
int wrapI(int v) {
  return ((v % W_SIZE) + W_SIZE) % W_SIZE;
}

vec2 wrapF(vec2 v) {
  return mod(mod(v, float(W_SIZE)) + float(W_SIZE), float(W_SIZE));
}

// Sample world data texture (W×W) — textures use NEAREST
uint sampleCell(ivec2 p) {
  ivec2 wp = ivec2(wrapI(p.x), wrapI(p.y));
  return texelFetch(uCells, wp, 0).r;
}

uint sampleWallTex(ivec2 p) {
  ivec2 wp = ivec2(wrapI(p.x), wrapI(p.y));
  return texelFetch(uWallTex, wp, 0).r;
}

uint sampleFloorTex(ivec2 p) {
  ivec2 wp = ivec2(wrapI(p.x), wrapI(p.y));
  return texelFetch(uFloorTex, wp, 0).r;
}

uint sampleFeature(ivec2 p) {
  ivec2 wp = ivec2(wrapI(p.x), wrapI(p.y));
  return texelFetch(uFeatures, wp, 0).r;
}

float sampleLight(ivec2 p) {
  ivec2 wp = ivec2(wrapI(p.x), wrapI(p.y));
  return texelFetch(uLight, wp, 0).r;
}

uint sampleFog(ivec2 p) {
  ivec2 wp = ivec2(wrapI(p.x), wrapI(p.y));
  return texelFetch(uFog, wp, 0).r;
}

uint sampleDoor(ivec2 p) {
  ivec2 wp = ivec2(wrapI(p.x), wrapI(p.y));
  return texelFetch(uDoorStates, wp, 0).r;
}

// Sample from texture atlas by texture id and texel coordinates
vec4 sampleAtlas(uint texId, int tx, int ty) {
  int txi = int(texId);
  int atlasX = (txi % ATLAS_COLS_I) * TEX_I + (tx & (TEX_I - 1));
  int atlasY = (txi / ATLAS_COLS_I) * TEX_I + (ty & (TEX_I - 1));
  return texelFetch(uAtlas, ivec2(atlasX, atlasY), 0);
}

/* Surface overlay: blend mark on top of base color */
const int SURF_ATLAS_COLS = 32; // 32 slots per row in 512px atlas
vec3 blendSurface(vec3 base, ivec2 cell, int subX, int subY) {
  uint slot = texelFetch(uSurfaceIdx, cell, 0).r;
  if (slot == 0u) return base;
  int s = int(slot) - 1; // 0-based slot index
  int ax = (s % SURF_ATLAS_COLS) * 16 + (subX & 15);
  int ay = (s / SURF_ATLAS_COLS) * 16 + (subY & 15);
  vec4 m = texelFetch(uSurfaceAtlas, ivec2(ax, ay), 0);
  float a = m.a;
  if (a < 0.004) return base;
  return mix(base, m.rgb, a);
}

vec3 fogColor() {
  return uPurpleFog == 1 ? vec3(20.0/255.0, 5.0/255.0, 30.0/255.0)
                         : vec3(5.0/255.0, 5.0/255.0, 8.0/255.0);
}

vec3 applyFogV(vec3 c, float f) {
  vec3 fc = fogColor();
  return mix(c, fc, f);
}

float flashlightBoost(float dist) {
  if (uFlashlight <= 0.0) return 0.0;
  float radius = 8.5;
  if (dist >= radius) return 0.0;
  float t = 1.0 - dist / radius;
  return uFlashlight * t * t * 0.95;
}

// Hash noise for hell eye overlay (matches pixutil.noise on CPU)
float noiseI(int x, int y, int s) {
  int n = x * 374761393 + y * 668265263 + s * 1274126177;
  n = (n ^ (n >> 13)) * 1103515245;
  n = n ^ (n >> 16);
  return float(n & 0x7fff) / 32767.0;
}

float clampSigned(float v, float lim) {
  return clamp(v, -lim, lim);
}

float toroidalDelta(float a, float b) {
  float d = b - a;
  if (d > float(W_SIZE) * 0.5) d -= float(W_SIZE);
  if (d < -float(W_SIZE) * 0.5) d += float(W_SIZE);
  return d;
}

vec3 applyHellEye(vec3 base, int texXi, int texYi, int cellX, int cellY) {
  float marker = noiseI(cellX, cellY, 901);
  if (marker < 0.84) return base;

  int eyeCount = marker > 0.97 ? 3 : (marker > 0.915 ? 2 : 1);
  float blinkSpeed = 0.25 + noiseI(cellX, cellY, 902) * 0.9;
  float cycle = fract(uTime * blinkSpeed + noiseI(cellX, cellY, 903) * 5.0);
  float eyelid = cycle < 0.16 ? max(0.04, abs(cycle - 0.08) / 0.08) : 1.0;
  float toPlayerX = toroidalDelta(float(cellX) + 0.5, uPos.x);
  float toPlayerY = toroidalDelta(float(cellY) + 0.5, uPos.y);
  float playerDist = sqrt(toPlayerX * toPlayerX + toPlayerY * toPlayerY);
  float track = playerDist < 7.5 ? (1.0 - playerDist / 7.5) : 0.0;

  float tx = float(texXi);
  float ty = float(texYi);
  vec3 color = base;

  for (int ei = 0; ei < 3; ei++) {
    if (ei >= eyeCount) break;
    float ox = 12.0 + noiseI(cellX + ei * 17, cellY, 904) * 40.0;
    float oy = 14.0 + noiseI(cellX, cellY + ei * 23, 905) * 36.0;
    float rx = 6.0 + noiseI(cellX + ei * 31, cellY, 906) * 7.0;
    float ry = max(1.2, rx * (0.12 + eyelid * 0.42));
    float dx = tx - ox;
    float dy = ty - oy;
    float norm = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (norm > 1.0) continue;

    // Sclera
    color = mix(color, vec3(230.0/255.0, 216.0/255.0, 182.0/255.0), 0.78);

    float idleShiftX = (noiseI(cellX, cellY, 907 + ei) - 0.5) * 1.4;
    float idleShiftY = (noiseI(cellX, cellY, 909 + ei) - 0.5) * 1.1;
    float irisShiftX = idleShiftX + clampSigned(toPlayerX * 0.55 * track, rx * 0.24);
    float irisShiftY = idleShiftY + clampSigned(toPlayerY * 0.55 * track, ry * 0.28);
    float irisR = rx * 0.42;
    float pupilR = rx * 0.18;
    float ix = tx - (ox + irisShiftX);
    float iy = ty - (oy + irisShiftY);
    float irisNorm = (ix * ix + iy * iy) / (irisR * irisR);
    if (irisNorm < 1.0 && eyelid > 0.18) {
      color = mix(color, vec3(186.0/255.0, 46.0/255.0, 28.0/255.0), 0.82);
    }
    float pupilNorm = (ix * ix + iy * iy) / (pupilR * pupilR);
    if (pupilNorm < 1.0 && eyelid > 0.22) {
      color = mix(color, vec3(18.0/255.0, 8.0/255.0, 6.0/255.0), 0.92);
    }
    float glintDx = tx - (ox - rx * 0.18);
    float glintDy = ty - (oy - ry * 0.22);
    float glint = glintDx * glintDx + glintDy * glintDy;
    if (glint < 3.5 && eyelid > 0.35) {
      color = mix(color, vec3(1.0, 248.0/255.0, 238.0/255.0), 0.85);
    }
  }
  return color;
}

/* ── Main fragment shader ─────────────────────────────────────── */
void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  // Flip Y: WebGL has origin at bottom-left, our screen has origin at top-left
  float col = fragCoord.x;
  float row = uResolution.y - 1.0 - fragCoord.y;
  float pixelDepth = 1.0; // per-pixel depth for gl_FragDepth (0=near, 1=far)

  float horizonShift = floor(uPitch * uResolution.y);
  float HALF_H = floor(uResolution.y * 0.5) + horizonShift;

  float dirX = cos(uAngle);
  float dirY = sin(uAngle);
  float planeLen = tan(PI / 6.0); // tan(HALF_FOV) = tan(30°)
  float planeX = -dirY * planeLen;
  float planeY =  dirX * planeLen;

  float camX = 2.0 * col / uResolution.x - 1.0;
  float rayDX = dirX + planeX * camX;
  float rayDY = dirY + planeY * camX;

  int mapX = int(floor(uPos.x));
  int mapY = int(floor(uPos.y));
  float ddx = abs(1.0 / rayDX);
  float ddy = abs(1.0 / rayDY);
  int stepX = rayDX < 0.0 ? -1 : 1;
  int stepY = rayDY < 0.0 ? -1 : 1;
  float sdx = rayDX < 0.0 ? (uPos.x - float(mapX)) * ddx : (float(mapX) + 1.0 - uPos.x) * ddx;
  float sdy = rayDY < 0.0 ? (uPos.y - float(mapY)) * ddy : (float(mapY) + 1.0 - uPos.y) * ddy;

  int side = 0;
  bool hit = false;
  float dist = MAX_DIST;
  uint wallTexId = 0u;
  bool hitAbyss = false;

  /* ── DDA loop ───────────────────────────────────────────── */
  for (int step = 0; step < MAX_STEPS; step++) {
    if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
    else            { sdy += ddy; mapY += stepY; side = 1; }

    ivec2 wp = ivec2(wrapI(mapX), wrapI(mapY));
    uint cell = texelFetch(uCells, wp, 0).r;

    if (cell == ${Cell.WALL}u) {
      dist = side == 0 ? sdx - ddx : sdy - ddy;
      wallTexId = texelFetch(uWallTex, wp, 0).r;
      if (wallTexId == 0u) wallTexId = ${Tex.CONCRETE}u;
      hit = true;
      break;
    }
    if (cell == ${Cell.LIFT}u) {
      dist = side == 0 ? sdx - ddx : sdy - ddy;
      wallTexId = ${Tex.LIFT_DOOR}u;
      hit = true;
      break;
    }
    if (cell == ${Cell.ABYSS}u) {
      dist = side == 0 ? sdx - ddx : sdy - ddy;
      wallTexId = ${Tex.DARK}u;
      hit = true;
      hitAbyss = true;
      break;
    }
    if (cell == ${Cell.DOOR}u) {
      uint doorState = texelFetch(uDoorStates, wp, 0).r;
      // 0=OPEN, 3=HERMETIC_OPEN — these are passable
      if (doorState != 0u && doorState != 3u) {
        dist = side == 0 ? sdx - ddx : sdy - ddy;
        wallTexId = doorState == 2u ? ${Tex.DOOR_METAL}u : ${Tex.DOOR_WOOD}u;
        hit = true;
        break;
      }
    }
  }

  if (!hit) dist = MAX_DIST;
  if (dist < 0.001) dist = 0.001;

  float lineH = uResolution.y / dist;
  float drawStart = max(0.0, HALF_H - lineH * (1.0 - uCamHeight));
  float drawEnd   = min(uResolution.y - 1.0, HALF_H + lineH * uCamHeight);

  // Texture X coordinate
  float wallHitX;
  if (side == 0) wallHitX = uPos.y + dist * rayDY;
  else           wallHitX = uPos.x + dist * rayDX;
  wallHitX -= floor(wallHitX);
  int texXi = int(floor(wallHitX * TEX_F)) & (TEX_I - 1);
  if (side == 0 && rayDX < 0.0) texXi = TEX_I - 1 - texXi;
  if (side == 1 && rayDY > 0.0) texXi = TEX_I - 1 - texXi;

  float fogF = min(1.0, dist * uFogDensity);

  vec3 pixel = fogColor(); // default = fog

  if (hitAbyss) {
    // Abyss rendering
    float edgeH = min(lineH, uResolution.y * 0.15);
    float edgeMid = HALF_H;
    float edgeStart = max(0.0, edgeMid - edgeH * 0.5);
    float edgeEnd = min(uResolution.y - 1.0, edgeMid + edgeH * 0.5);

    if (row >= edgeStart && row <= edgeEnd) {
      float d = row - edgeStart;
      int texYi = int(floor(d / edgeH * TEX_F)) & (TEX_I - 1);
      vec3 c = sampleAtlas(${Tex.DARK}u, texXi, texYi).rgb * 0.3;
      pixel = applyFogV(c, min(1.0, dist * uFogDensity));
      pixelDepth = min(1.0, dist / MAX_DIST);
    } else if (row > edgeEnd) {
      float depthF = (row - edgeEnd) / (uResolution.y - edgeEnd);
      float v = max(0.0, 4.0 * (1.0 - depthF)) / 255.0;
      pixel = vec3(v, v, v);
    } else {
      float upF = (edgeStart - row) / max(1.0, edgeStart);
      float v = max(0.0, 3.0 * (1.0 - upF)) / 255.0;
      pixel = vec3(v, v + 2.0/255.0, v);
    }
  } else {
    // Compute hit cell for lighting
    ivec2 hitCell = ivec2(wrapI(mapX), wrapI(mapY));
    float cellLit = min(1.0, AMBIENT + sampleLight(hitCell) * (1.0 - AMBIENT) + flashlightBoost(dist));

    if (row >= drawStart && row <= drawEnd) {
      // ── Wall ──
      float d = row - (HALF_H - lineH * (1.0 - uCamHeight));
      int texYi = int(floor(d / lineH * TEX_F)) & (TEX_I - 1);
      vec3 c = sampleAtlas(wallTexId, texXi, texYi).rgb;
      // Surface overlay (blood, bullet holes)
      c = blendSurface(c, hitCell, texXi >> 2, texYi >> 2);
      // Hell eye overlay on organic walls
      if (wallTexId == ${Tex.MEAT}u || wallTexId == ${Tex.GUT}u) {
        c = applyHellEye(c, texXi, texYi, hitCell.x, hitCell.y);
      }
      if (side == 1) c *= 0.7;
      c *= cellLit;
      pixel = applyFogV(c, fogF);
      pixelDepth = min(1.0, dist / MAX_DIST);
    } else if (row > drawEnd) {
      // ── Floor ──
      float rowDist = row - HALF_H;
      if (rowDist > 0.0) {
        float currentDist = (uResolution.y * uCamHeight) / rowDist;
        float weight = min(currentDist / dist, 1.0);
        float fwx, fwy;
        if (side == 0 && rayDX > 0.0)      { fwx = float(mapX);     fwy = float(mapY) + wallHitX; }
        else if (side == 0 && rayDX < 0.0)  { fwx = float(mapX) + 1.0; fwy = float(mapY) + wallHitX; }
        else if (side == 1 && rayDY > 0.0)  { fwx = float(mapX) + wallHitX; fwy = float(mapY); }
        else                                { fwx = float(mapX) + wallHitX; fwy = float(mapY) + 1.0; }
        float floorX = weight * fwx + (1.0 - weight) * uPos.x;
        float floorY = weight * fwy + (1.0 - weight) * uPos.y;

        ivec2 fCell = ivec2(wrapI(int(floor(floorX))), wrapI(int(floor(floorY))));
        int ftx = int(floor(floorX * TEX_F)) & (TEX_I - 1);
        int fty = int(floor(floorY * TEX_F)) & (TEX_I - 1);
        float ff = min(1.0, currentDist * uFogDensity);
        float fLit = min(1.0, AMBIENT + sampleLight(fCell) * (1.0 - AMBIENT) + flashlightBoost(currentDist));

        uint fCellType = texelFetch(uCells, fCell, 0).r;
        if (fCellType == ${Cell.ABYSS}u) {
          float voidF = min(1.0, currentDist * 0.12);
          float v = 3.0 * (1.0 - voidF) / 255.0;
          pixel = vec3(v, v, v);
        } else {
          uint floorTexId = fCellType == ${Cell.WATER}u
            ? ${Tex.F_WATER}u
            : texelFetch(uFloorTex, fCell, 0).r;
          if (floorTexId == 0u) floorTexId = ${Tex.F_CONCRETE}u;
          vec3 fc = sampleAtlas(floorTexId, ftx, fty).rgb;
          // Surface overlay (blood, urine, etc.)
          fc = blendSurface(fc, fCell, ftx >> 2, fty >> 2);
          fc *= fLit;
          pixel = applyFogV(fc, ff);
          pixelDepth = min(1.0, currentDist / MAX_DIST);
        }
      }
    } else {
      // ── Ceiling ──
      float rowDist = HALF_H - row;
      if (rowDist > 0.0) {
        float currentDist = (uResolution.y * (1.0 - uCamHeight)) / rowDist;
        float weight = min(currentDist / dist, 1.0);
        float fwx, fwy;
        if (side == 0 && rayDX > 0.0)      { fwx = float(mapX);     fwy = float(mapY) + wallHitX; }
        else if (side == 0 && rayDX < 0.0)  { fwx = float(mapX) + 1.0; fwy = float(mapY) + wallHitX; }
        else if (side == 1 && rayDY > 0.0)  { fwx = float(mapX) + wallHitX; fwy = float(mapY); }
        else                                { fwx = float(mapX) + wallHitX; fwy = float(mapY) + 1.0; }
        float floorX = weight * fwx + (1.0 - weight) * uPos.x;
        float floorY = weight * fwy + (1.0 - weight) * uPos.y;

        ivec2 cCell = ivec2(wrapI(int(floor(floorX))), wrapI(int(floor(floorY))));
        int ftx = int(floor(floorX * TEX_F)) & (TEX_I - 1);
        int fty = int(floor(floorY * TEX_F)) & (TEX_I - 1);
        float ff = min(1.0, currentDist * uFogDensity);
        float cLit = min(1.0, AMBIENT + sampleLight(cCell) * (1.0 - AMBIENT) + flashlightBoost(currentDist));

        uint cCellType = texelFetch(uCells, cCell, 0).r;
        if (cCellType == ${Cell.ABYSS}u) {
          float voidF = min(1.0, currentDist * 0.12);
          float v = 4.0 * (1.0 - voidF) / 255.0;
          pixel = vec3(v, v + 1.0/255.0, v);
        } else {
          uint feat = texelFetch(uFeatures, cCell, 0).r;
          if (feat == ${Feature.LAMP}u) {
            float glow = max(0.0, 1.0 - currentDist * 0.15);
            pixel = applyFogV(vec3(220.0/255.0 * glow, 180.0/255.0 * glow, 80.0/255.0 * glow), ff);
            pixelDepth = min(1.0, currentDist / MAX_DIST);
          } else {
            vec3 cc = sampleAtlas(${Tex.CEIL}u, ftx, fty).rgb;
            cc *= cLit;
            pixel = applyFogV(cc, ff);
            pixelDepth = min(1.0, currentDist / MAX_DIST);
          }
        }
      }
    }
  }

  // Encode depth into alpha for CPU readback (sprite clipping)
  float normDist = dist / MAX_DIST;
  fragColor = vec4(pixel, normDist);
  gl_FragDepth = pixelDepth;
}
`;

/* ── Sprite vertex/fragment shaders ───────────────────────────── */
const SPRITE_VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;       // quad corner (-0.5..0.5)
in vec2 aTexCoord;  // 0..1

uniform vec2  uResolution;
uniform float uScreenX;     // sprite center X on screen
uniform float uSpriteW;     // sprite width in pixels
uniform float uSpriteH;     // sprite height in pixels
uniform float uStartY;      // top Y in pixels
uniform float uDepth;       // normalized depth for z-test

out vec2 vTexCoord;
out float vDepth;

void main() {
  float px = uScreenX + aPos.x * uSpriteW;
  float py = uStartY + (0.5 - aPos.y) * uSpriteH;

  // Convert to NDC: x: [0, res.x] → [-1, 1], y: [0, res.y] → [-1, 1] (flipped)
  float ndcX = (px / uResolution.x) * 2.0 - 1.0;
  float ndcY = 1.0 - (py / uResolution.y) * 2.0;

  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
  vTexCoord = aTexCoord;
  vDepth = uDepth;
}
`;

const SPRITE_FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec2 vTexCoord;
in float vDepth;
uniform sampler2D uSpriteTex;
uniform float uFogF;
uniform vec3  uFogColor;
uniform int   uIsProjectile;
uniform float uTime;
uniform float uSeed;

out vec4 fragColor;

/* ── procedural flame noise ── */
float fHash(float n) { return fract(sin(n) * 43758.5453123); }
float fNoise(vec2 p, float s) {
  vec2 ip = floor(p), fp = fract(p);
  fp = fp * fp * (3.0 - 2.0 * fp);
  float n = ip.x + ip.y * 157.0 + s * 113.0;
  return mix(mix(fHash(n), fHash(n+1.0), fp.x),
             mix(fHash(n+157.0), fHash(n+158.0), fp.x), fp.y);
}
float fFbm(vec2 p, float s) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += fNoise(p, s) * a; p *= 2.13; a *= 0.48; s += 137.0;
  }
  return v;
}

void main() {
  /* ── Procedural flame tongue (uIsProjectile == 2) ── */
  if (uIsProjectile == 2) {
    vec2 uv = vTexCoord - 0.5;

    // Quick circular discard to avoid wasting fragments on corners
    float rawR = length(uv);
    if (rawR > 0.48) discard;

    // Flame widens at base (uv.y<0), tapers at top (uv.y>0)
    float taper = 1.0 + uv.y * 0.8;
    float dist = length(uv * vec2(2.5 * taper, 1.6));

    // Animated noise scrolling upward — unique per projectile
    float t = uTime * 7.0;
    float sd = uSeed;
    vec2 nUV = uv * 6.0 + vec2(sin(sd * 7.13) * 10.0, -t);

    float n1 = fFbm(nUV, sd);
    float n2 = fFbm(nUV * 1.7 + 3.7, sd + 77.0);
    float n3 = fNoise(nUV * 4.5 + 1.3, sd + 200.0);

    // Core + noise − strong radial falloff
    float core = max(0.0, 1.0 - dist * 1.3);
    float flame = core * 1.2 + n1 * 0.45 + n2 * 0.25 - dist * 0.65;
    flame += n3 * 0.1;

    // Aggressive discard — anything dim gets tossed
    if (flame < 0.15) discard;

    // Temperature → color: hot white → yellow → orange → dark red
    float heat = clamp(flame * 1.5, 0.0, 1.0);
    vec3 col;
    if (heat > 0.75) {
      col = mix(vec3(1.0, 0.9, 0.4), vec3(1.0, 1.0, 0.9), (heat - 0.75) * 4.0);
    } else if (heat > 0.42) {
      col = mix(vec3(1.0, 0.45, 0.05), vec3(1.0, 0.9, 0.4), (heat - 0.42) / 0.33);
    } else {
      col = mix(vec3(0.6, 0.08, 0.0), vec3(1.0, 0.45, 0.05), heat / 0.42);
    }

    float alpha = smoothstep(0.15, 0.4, flame);
    float glow = 1.0 - uFogF * 0.15;  // flames punch through fog hard
    gl_FragDepth = vDepth;
    fragColor = vec4(col * alpha * glow * 2.2, 1.0);
    return;
  }

  vec4 c = texture(uSpriteTex, vec2(vTexCoord.x, 1.0 - vTexCoord.y));
  if (c.a < 0.5) discard;
  gl_FragDepth = vDepth;

  vec3 rgb = c.rgb;
  if (uIsProjectile == 1) {
    // Additive glow: boost brightness, resist fog heavily
    float glow = 1.0 - uFogF * 0.3;
    rgb *= glow * 1.5;
    // Pre-multiplied additive: write bright color with full alpha
    fragColor = vec4(rgb, 1.0);
  } else {
    rgb = mix(rgb, uFogColor, uFogF);
    fragColor = vec4(rgb, c.a);
  }
}
`;

/* ── Blit shader (render low-res FBO to screen) ───────────────── */
const BLIT_VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const BLIT_FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uGlitch;
uniform float uTime;
uniform float uSamosborActive; // 1.0 during samosbor
out vec4 fragColor;

/* ── Noise helpers ────────────────────────────────────────────── */
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = vUV;
  float t = uTime;

  /* ── VHS tracking distortion (always-on, subtle) ────────────── */
  float slowWave = sin(uv.y * 2.7 + t * 0.5) * 0.0008;
  float fastWiggle = sin(uv.y * 23.0 + t * 3.1) * 0.0004;
  uv.x += slowWave + fastWiggle;

  /* ── Samosbor glitch: heavy horizontal shift ────────────────── */
  if (uGlitch > 0.0) {
    float scanline = floor(uv.y * 200.0);
    float h = fract(sin(scanline * 12.9898 + t * 43758.5453) * 43758.5453);
    if (h < uGlitch * 0.35) {
      uv.x += (h - 0.5) * uGlitch * 0.08;
    }
    // Block glitch: shift entire horizontal bands
    float blockY = floor(uv.y * 25.0);
    float blockH = hash21(vec2(blockY, floor(t * 4.0)));
    if (blockH > 1.0 - uGlitch * 0.12) {
      uv.x += (blockH - 0.5) * 0.05 * uGlitch;
      uv.y += (hash21(vec2(blockY + 100.0, floor(t * 6.0))) - 0.5) * 0.008 * uGlitch;
    }
  }

  /* ── Random sporadic glitch bars (always-on, very rare) ─────── */
  {
    float barSeed = floor(t * 2.5);
    float barY = floor(uv.y * 200.0);
    float barH = hash21(vec2(barY * 0.37, barSeed));
    float threshold = 0.997 - uGlitch * 0.05;
    if (barH > threshold) {
      uv.x += (hash21(vec2(barY, t * 1.7)) - 0.5) * 0.025;
    }
  }

  /* ── Chromatic aberration ───────────────────────────────────── */
  float caBase = 0.0008;
  float caGlitch = uGlitch * 0.004;
  float caPulse = sin(t * 1.3) * 0.0002;
  float ca = caBase + caGlitch + caPulse;
  vec2 caOff = vec2(ca, ca * 0.3);
  float r = texture(uTex, uv + caOff).r;
  float g = texture(uTex, uv).g;
  float b = texture(uTex, uv - caOff).b;
  vec3 color = vec3(r, g, b);

  /* ── Scanlines (subtle CRT) ─────────────────────────────────── */
  float scanY = gl_FragCoord.y;
  float scanPhase = mod(scanY, 3.0);
  float scanDark = 0.0;
  if (scanPhase < 1.0) scanDark = 0.06;
  else if (scanPhase < 2.0) scanDark = 0.02;
  scanDark += uGlitch * 0.04;
  color *= 1.0 - scanDark;

  /* ── Interlace jitter (odd/even frame shift) ────────────────── */
  float framePhase = mod(floor(t * 30.0), 2.0); // ~30fps flicker
  float interlace = mod(scanY + framePhase, 2.0) < 1.0 ? 0.97 : 1.0;
  color *= interlace;

  /* ── Film grain / sensor noise ──────────────────────────────── */
  float grain = hash21(vUV * 800.0 + fract(t * 11.3)) * 0.07 - 0.035;
  grain += (hash21(vUV * 400.0 + fract(t * 7.7 + 1.0)) - 0.5) * 0.02;
  color += grain;

  /* ── VHS color bleed (horizontal chroma smear) ──────────────── */
  float bleedStr = 0.12 + uGlitch * 0.1;
  vec3 lSample = texture(uTex, uv - vec2(2.0 / 320.0, 0.0)).rgb;
  vec3 rSample = texture(uTex, uv + vec2(2.0 / 320.0, 0.0)).rgb;
  vec3 bleed = (lSample + color + rSample) / 3.0;
  color = mix(color, bleed, bleedStr);

  /* ── VHS tracking line (moving horizontal bright bar) ───────── */
  float trackSpeed = 0.025 + uGlitch * 0.04;
  float trackY = fract(t * trackSpeed);
  float trackDist = abs(uv.y - trackY);
  if (trackDist < 0.008) {
    float trackStr = (1.0 - trackDist / 0.008) * 0.12;
    color += trackStr;
    uv.x += trackStr * 0.01; // slight horizontal shift near tracking line
  }

  /* ── Subtle vignette ────────────────────────────────────────── */
  vec2 vc = uv - 0.5;
  float vig = 1.0 - dot(vc, vc) * 0.6;
  color *= vig;

  /* ── Phosphor glow tint (slight cyan-green shift like old CRT) ─ */
  color.g *= 1.02;
  color.b *= 0.98;

  /* ── Samosbor: extra purple tint + noise burst ──────────────── */
  if (uSamosborActive > 0.5) {
    float noiseBurst = valueNoise(vUV * 60.0 + t * 5.0) * 0.06;
    color.r += noiseBurst * 0.5;
    color.b += noiseBurst;
    // Occasional white flash lines
    float flashLine = hash21(vec2(floor(uv.y * 100.0), floor(t * 8.0)));
    if (flashLine > 0.993) {
      color += 0.15;
    }
  }

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/* ── Blood particle shaders (flat-color quads in screen space) ── */
const PARTICLE_VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;       // quad corner (-0.5..0.5)
uniform vec2  uResolution;
uniform float uScreenX;
uniform float uScreenY;
uniform float uSize;
uniform float uDepth;
out float vDepth;
void main() {
  float px = uScreenX + aPos.x * uSize;
  float py = uScreenY + aPos.y * uSize;
  float ndcX = (px / uResolution.x) * 2.0 - 1.0;
  float ndcY = 1.0 - (py / uResolution.y) * 2.0;
  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
  vDepth = uDepth;
}
`;

const PARTICLE_FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
in float vDepth;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  gl_FragDepth = vDepth;
  fragColor = uColor;
}
`;

/* ── WebGL State ──────────────────────────────────────────────── */
interface GLState {
  gl: WebGL2RenderingContext;
  // Raycaster
  rayProgram: WebGLProgram;
  rayVAO: WebGLVertexArrayObject;
  rayFBO: WebGLFramebuffer;
  rayColorTex: WebGLTexture;
  rayDepthBuf: WebGLRenderbuffer;
  // Blit
  blitProgram: WebGLProgram;
  blitVAO: WebGLVertexArrayObject;
  // Particle rendering
  particleProgram: WebGLProgram;
  particleVAO: WebGLVertexArrayObject;
  particleUniforms: Record<string, WebGLUniformLocation | null>;
  // Data textures
  cellsTex: WebGLTexture;
  wallTexTex: WebGLTexture;
  floorTexTex: WebGLTexture;
  featuresTex: WebGLTexture;
  lightTex: WebGLTexture;
  fogTex: WebGLTexture;
  doorStatesTex: WebGLTexture;
  atlasTex: WebGLTexture;
  // Sprite rendering
  spriteProgram: WebGLProgram;
  spriteVAO: WebGLVertexArrayObject;
  spriteTextures: WebGLTexture[];   // individual sprite textures
  // Surface marks
  surfaceAtlasTex: WebGLTexture;    // 512×512 RGBA atlas of 16×16 overlays
  surfaceIdxTex: WebGLTexture;      // W×W R16UI cell→slot mapping
  // Uniforms cache
  rayUniforms: Record<string, WebGLUniformLocation | null>;
  blitUniforms: Record<string, WebGLUniformLocation | null>;
  spriteUniforms: Record<string, WebGLUniformLocation | null>;
}

let glState: GLState | null = null;

/* ── Shader compilation helpers ───────────────────────────────── */
function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${log}`);
  }
  return prog;
}

function createProgram(gl: WebGL2RenderingContext, vSrc: string, fSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fSrc);
  const prog = linkProgram(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function getUniforms(gl: WebGL2RenderingContext, prog: WebGLProgram, names: string[]): Record<string, WebGLUniformLocation | null> {
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return u;
}

/* ── Create fullscreen quad VAO ───────────────────────────────── */
function createQuadVAO(gl: WebGL2RenderingContext, prog: WebGLProgram): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // Two triangles covering [-1,1]
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

/* ── Create data texture (R8UI or R32F) ───────────────────────── */
function createDataTexR8UI(gl: WebGL2RenderingContext, w: number, h: number, data: Uint8Array): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
  return tex;
}

function createDataTexR32F(gl: WebGL2RenderingContext, w: number, h: number, data: Float32Array): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
  return tex;
}

/* ── Build texture atlas from TexData[] ───────────────────────── */
function buildAtlas(gl: WebGL2RenderingContext, textures: TexData[]): WebGLTexture {
  const count = textures.length;
  const rows = Math.ceil(count / ATLAS_COLS);
  const atlasW = ATLAS_COLS * ATLAS_TEX_SIZE;
  const atlasH = rows * ATLAS_TEX_SIZE;
  // TexData is Uint32Array in 0xAABBGGRR format — need to convert to RGBA8
  const pixels = new Uint8Array(atlasW * atlasH * 4);

  for (let i = 0; i < count; i++) {
    const td = textures[i];
    const ax = (i % ATLAS_COLS) * ATLAS_TEX_SIZE;
    const ay = Math.floor(i / ATLAS_COLS) * ATLAS_TEX_SIZE;
    for (let y = 0; y < ATLAS_TEX_SIZE; y++) {
      for (let x = 0; x < ATLAS_TEX_SIZE; x++) {
        const c = td[y * ATLAS_TEX_SIZE + x];
        const dstIdx = ((ay + y) * atlasW + (ax + x)) * 4;
        pixels[dstIdx + 0] = c & 0xFF;            // R
        pixels[dstIdx + 1] = (c >> 8) & 0xFF;     // G
        pixels[dstIdx + 2] = (c >> 16) & 0xFF;    // B
        pixels[dstIdx + 3] = 255;                  // A
      }
    }
  }

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlasW, atlasH, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return tex;
}

/* ── Build individual sprite textures ─────────────────────────── */
function buildSpriteTextures(gl: WebGL2RenderingContext, sprites: SpriteData[]): WebGLTexture[] {
  const result: WebGLTexture[] = [];
  for (const spr of sprites) {
    const pixels = new Uint8Array(ATLAS_TEX_SIZE * ATLAS_TEX_SIZE * 4);
    for (let i = 0; i < ATLAS_TEX_SIZE * ATLAS_TEX_SIZE; i++) {
      const c = spr[i];
      pixels[i * 4 + 0] = c & 0xFF;
      pixels[i * 4 + 1] = (c >> 8) & 0xFF;
      pixels[i * 4 + 2] = (c >> 16) & 0xFF;
      pixels[i * 4 + 3] = (c >>> 24) & 0xFF;
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_TEX_SIZE, ATLAS_TEX_SIZE, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    result.push(tex);
  }
  return result;
}

/* ── Build door state map from World ──────────────────────────── */
function buildDoorStates(world: World): Uint8Array {
  // Default: 0 = OPEN (passable). Cells without doors stay 0.
  const ds = new Uint8Array(W * W);
  for (const [ci, door] of world.doors) {
    ds[ci] = door.state;
  }
  return ds;
}

/* ── Surface marks atlas ─────────────────────────────────────── *
 * Pack surfaceMap entries into a 512×512 RGBA atlas (32×32 grid   *
 * of 16×16 tiles = max 1024 cells). Returns atlas pixels + index. */
const SURF_ATLAS_SIZE = 512;         // 512×512 total
const SURF_ATLAS_COLS = 32;          // 32 tiles per row
const SURF_MAX_SLOTS = SURF_ATLAS_COLS * SURF_ATLAS_COLS; // 1024

function buildSurfaceData(world: World, camX: number, camY: number): { pixels: Uint8Array; index: Uint16Array } {
  const pixels = new Uint8Array(SURF_ATLAS_SIZE * SURF_ATLAS_SIZE * 4);
  const index = new Uint16Array(W * W); // 0 = no mark

  // Sort cells by toroidal distance to camera — nearest 1024 get atlas slots
  const entries = Array.from(world.surfaceMap.entries());
  if (entries.length > SURF_MAX_SLOTS) {
    const camCX = Math.floor(camX), camCY = Math.floor(camY);
    entries.sort((a, b) => {
      const ax = a[0] % W, ay = (a[0] / W) | 0;
      const bx = b[0] % W, by = (b[0] / W) | 0;
      let dax = ax - camCX; if (dax > W / 2) dax -= W; else if (dax < -W / 2) dax += W;
      let day = ay - camCY; if (day > W / 2) day -= W; else if (day < -W / 2) day += W;
      let dbx = bx - camCX; if (dbx > W / 2) dbx -= W; else if (dbx < -W / 2) dbx += W;
      let dby = by - camCY; if (dby > W / 2) dby -= W; else if (dby < -W / 2) dby += W;
      return (dax * dax + day * day) - (dbx * dbx + dby * dby);
    });
  }

  let slot = 0;
  for (const [ci, cellData] of entries) {
    if (slot >= SURF_MAX_SLOTS) break;
    slot++; // 1-based slot numbers (0 = "no mark")
    index[ci] = slot;
    const s = slot - 1;
    const ax = (s % SURF_ATLAS_COLS) * 16;
    const ay = Math.floor(s / SURF_ATLAS_COLS) * 16;
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const si = (py * 16 + px) << 2;
        const di = ((ay + py) * SURF_ATLAS_SIZE + (ax + px)) * 4;
        pixels[di]     = cellData[si];
        pixels[di + 1] = cellData[si + 1];
        pixels[di + 2] = cellData[si + 2];
        pixels[di + 3] = cellData[si + 3];
      }
    }
  }
  return { pixels, index };
}

function createDataTexR16UI(gl: WebGL2RenderingContext, w: number, h: number, data: Uint16Array): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, data);
  return tex;
}

/* ── Initialize WebGL ─────────────────────────────────────────── */
export function initWebGL(
  canvas: HTMLCanvasElement,
  textures: TexData[],
  sprites: SpriteData[],
  world: World,
): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  })!;
  if (!gl) throw new Error('WebGL2 not supported');

  // Enable float textures
  const floatExt = gl.getExtension('EXT_color_buffer_float');
  if (!floatExt) {
    // Fallback: we can still work without it, will use RGBA8 readback
    console.warn('EXT_color_buffer_float not available — depth readback via RGBA');
  }

  // ── Raycaster program ──
  const rayProgram = createProgram(gl, VERT_SRC, FRAG_SRC);
  const rayVAO = createQuadVAO(gl, rayProgram);
  const rayUniforms = getUniforms(gl, rayProgram, [
    'uResolution', 'uPos', 'uAngle', 'uPitch', 'uFogDensity',
    'uGlitch', 'uCamHeight', 'uFlashlight', 'uTime', 'uPurpleFog',
    'uCells', 'uWallTex', 'uFloorTex', 'uFeatures', 'uLight', 'uFog',
    'uDoorStates', 'uAtlas', 'uAtlasSize', 'uSurfaceAtlas', 'uSurfaceIdx',
  ]);

  // ── Blit program ──
  const blitProgram = createProgram(gl, BLIT_VERT_SRC, BLIT_FRAG_SRC);
  const blitVAO = createQuadVAO(gl, blitProgram);
  const blitUniforms = getUniforms(gl, blitProgram, ['uTex', 'uGlitch', 'uTime', 'uSamosborActive']);

  // ── Sprite program ──
  const spriteProgram = createProgram(gl, SPRITE_VERT_SRC, SPRITE_FRAG_SRC);
  const spriteVAO = createSpriteVAO(gl, spriteProgram);
  const spriteUniforms = getUniforms(gl, spriteProgram, [
    'uResolution', 'uScreenX', 'uSpriteW', 'uSpriteH', 'uStartY', 'uDepth',
    'uSpriteTex', 'uFogF', 'uFogColor', 'uIsProjectile', 'uTime', 'uSeed',
  ]);

  // ── Particle program ──
  const particleProgram = createProgram(gl, PARTICLE_VERT_SRC, PARTICLE_FRAG_SRC);
  // Reuse the sprite VAO (same quad geometry, only uses aPos)
  const particleVAO = createSpriteVAO(gl, particleProgram);
  const particleUniforms = getUniforms(gl, particleProgram, [
    'uResolution', 'uScreenX', 'uScreenY', 'uSize', 'uDepth', 'uColor',
  ]);

  // ── FBO for low-res raycaster output ──
  const rayColorTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, rayColorTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SCR_W, SCR_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const rayDepthBuf = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, rayDepthBuf);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SCR_W, SCR_H);

  const rayFBO = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, rayFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rayColorTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rayDepthBuf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // ── Data textures ──
  const cellsTex = createDataTexR8UI(gl, W, W, world.cells);
  const wallTexTex = createDataTexR8UI(gl, W, W, world.wallTex);
  const floorTexTex = createDataTexR8UI(gl, W, W, world.floorTex);
  const featuresTex = createDataTexR8UI(gl, W, W, world.features);
  const lightTex = createDataTexR32F(gl, W, W, world.light);
  const fogTex = createDataTexR8UI(gl, W, W, world.fog);
  const doorStatesTex = createDataTexR8UI(gl, W, W, buildDoorStates(world));

  // ── Surface marks atlas & index ──
  const surfData = buildSurfaceData(world, 0, 0);
  const surfaceAtlasTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, surfaceAtlasTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SURF_ATLAS_SIZE, SURF_ATLAS_SIZE, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, surfData.pixels);
  const surfaceIdxTex = createDataTexR16UI(gl, W, W, surfData.index);

  // ── Texture atlas ──
  const atlasTex = buildAtlas(gl, textures);

  // ── Sprite textures ──
  const spriteTextures = buildSpriteTextures(gl, sprites);

  glState = {
    gl,
    rayProgram, rayVAO, rayFBO, rayColorTex, rayDepthBuf,
    blitProgram, blitVAO,
    particleProgram, particleVAO, particleUniforms,
    cellsTex, wallTexTex, floorTexTex, featuresTex, lightTex, fogTex,
    doorStatesTex, atlasTex,
    spriteProgram, spriteVAO, spriteTextures,
    surfaceAtlasTex, surfaceIdxTex,
    rayUniforms, blitUniforms, spriteUniforms,
  };

  return gl;
}

/* ── Create sprite quad VAO ───────────────────────────────────── */
function createSpriteVAO(gl: WebGL2RenderingContext, prog: WebGLProgram): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // Quad: position + texcoord
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    // pos.x, pos.y, uv.x, uv.y
    -0.5, -0.5, 0, 0,
     0.5, -0.5, 1, 0,
    -0.5,  0.5, 0, 1,
    -0.5,  0.5, 0, 1,
     0.5, -0.5, 1, 0,
     0.5,  0.5, 1, 1,
  ]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'aPos');
  const texLoc = gl.getAttribLocation(prog, 'aTexCoord');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  if (texLoc >= 0) {
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
  }
  gl.bindVertexArray(null);
  return vao;
}

/* ── Update world data textures (call after world changes) ────── */
export function updateWorldData(world: World): void {
  if (!glState) return;
  const { gl } = glState;

  gl.bindTexture(gl.TEXTURE_2D, glState.cellsTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_BYTE, world.cells);

  gl.bindTexture(gl.TEXTURE_2D, glState.wallTexTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_BYTE, world.wallTex);

  gl.bindTexture(gl.TEXTURE_2D, glState.floorTexTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_BYTE, world.floorTex);

  gl.bindTexture(gl.TEXTURE_2D, glState.featuresTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_BYTE, world.features);

  gl.bindTexture(gl.TEXTURE_2D, glState.lightTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED, gl.FLOAT, world.light);

  // Also update dynamic data
  updateDynamicData(world);
}

/** Lightweight per-frame update: fog, door states, wallTex (for slides) */
export function updateDynamicData(world: World, camX = 0, camY = 0): void {
  if (!glState) return;
  const { gl } = glState;

  gl.bindTexture(gl.TEXTURE_2D, glState.wallTexTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_BYTE, world.wallTex);

  gl.bindTexture(gl.TEXTURE_2D, glState.fogTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_BYTE, world.fog);

  // Door states
  gl.bindTexture(gl.TEXTURE_2D, glState.doorStatesTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_BYTE, buildDoorStates(world));

  // Surface marks (blood, bullet holes, etc.)
  const surfData = buildSurfaceData(world, camX, camY);
  gl.bindTexture(gl.TEXTURE_2D, glState.surfaceAtlasTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SURF_ATLAS_SIZE, SURF_ATLAS_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, surfData.pixels);
  gl.bindTexture(gl.TEXTURE_2D, glState.surfaceIdxTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.UNSIGNED_SHORT, surfData.index);
}

/* ── Render scene via WebGL ───────────────────────────────────── */
export function renderSceneGL(
  world: World,
  textures: TexData[],
  sprites: SpriteData[],
  entities: Entity[],
  px: number, py: number, pAngle: number, pPitch: number,
  fogDensity: number,
  glitch: number,
  camHeight = 0.5,
  flashlight = 0,
  time = 0,
  bloodParticles: BloodParticle[] = [],
  samosborActive = false,
): void {
  if (!glState) return;
  const { gl } = glState;

  // Check if player is in purple fog
  const pci = world.idx(Math.floor(px), Math.floor(py));
  const purpleFog = world.fog[pci] > 50 ? 1 : 0;

  // ── Pass 1: Raycaster into FBO ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, glState.rayFBO);
  gl.viewport(0, 0, SCR_W, SCR_H);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(glState.rayProgram);
  const ru = glState.rayUniforms;
  gl.uniform2f(ru['uResolution']!, SCR_W, SCR_H);
  gl.uniform2f(ru['uPos']!, px, py);
  gl.uniform1f(ru['uAngle']!, pAngle);
  gl.uniform1f(ru['uPitch']!, pPitch);
  gl.uniform1f(ru['uFogDensity']!, fogDensity);
  gl.uniform1f(ru['uGlitch']!, glitch);
  gl.uniform1f(ru['uCamHeight']!, camHeight);
  gl.uniform1f(ru['uFlashlight']!, flashlight);
  gl.uniform1f(ru['uTime']!, time);
  gl.uniform1i(ru['uPurpleFog']!, purpleFog);

  // Bind data textures to texture units
  const texUnits = [
    { tex: glState.cellsTex,     loc: ru['uCells']!,     unit: 0 },
    { tex: glState.wallTexTex,   loc: ru['uWallTex']!,   unit: 1 },
    { tex: glState.floorTexTex,  loc: ru['uFloorTex']!,  unit: 2 },
    { tex: glState.featuresTex,  loc: ru['uFeatures']!,  unit: 3 },
    { tex: glState.lightTex,     loc: ru['uLight']!,     unit: 4 },
    { tex: glState.fogTex,       loc: ru['uFog']!,       unit: 5 },
    { tex: glState.doorStatesTex,loc: ru['uDoorStates']!, unit: 6 },
    { tex: glState.atlasTex,     loc: ru['uAtlas']!,     unit: 7 },
    { tex: glState.surfaceAtlasTex, loc: ru['uSurfaceAtlas']!, unit: 8 },
    { tex: glState.surfaceIdxTex,   loc: ru['uSurfaceIdx']!,  unit: 9 },
  ];
  for (const { tex, loc, unit } of texUnits) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  // Atlas size
  const atlasRows = Math.ceil(textures.length / ATLAS_COLS);
  gl.uniform2f(ru['uAtlasSize']!, ATLAS_COLS * ATLAS_TEX_SIZE, atlasRows * ATLAS_TEX_SIZE);

  // Draw fullscreen quad — enable depth write via gl_FragDepth
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.ALWAYS);
  gl.bindVertexArray(glState.rayVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // ── Render sprites into FBO (with depth test against raycaster) ──
  gl.depthFunc(gl.LESS);
  renderSpritesGL(world, sprites, entities, px, py, pAngle, pPitch, fogDensity, purpleFog, camHeight, time);

  // ── Render blood particles into FBO ──
  if (bloodParticles.length > 0) {
    renderParticlesGL(bloodParticles, px, py, pAngle, pPitch, camHeight);
  }

  gl.disable(gl.DEPTH_TEST);

  // ── Pass 2: Blit FBO to screen with glitch ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.useProgram(glState.blitProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glState.rayColorTex);
  gl.uniform1i(glState.blitUniforms['uTex']!, 0);
  gl.uniform1f(glState.blitUniforms['uGlitch']!, glitch);
  gl.uniform1f(glState.blitUniforms['uTime']!, time);
  gl.uniform1f(glState.blitUniforms['uSamosborActive']!, samosborActive ? 1.0 : 0.0);

  gl.bindVertexArray(glState.blitVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/* ── Sprite rendering (GL) ────────────────────────────────────── */
function renderSpritesGL(
  _world: World,
  _sprites: SpriteData[],
  entities: Entity[],
  px: number, py: number, pAngle: number, pPitch: number,
  fogDensity: number, purpleFog: number,
  camHeight: number,
  time: number,
): void {
  if (!glState) return;
  const { gl } = glState;

  const dirX = Math.cos(pAngle);
  const dirY = Math.sin(pAngle);
  const planeLen = Math.tan(HALF_FOV);
  const planeX = -dirY * planeLen;
  const planeY = dirX * planeLen;
  const horizonShift = Math.floor(pPitch * SCR_H);
  const halfH = Math.floor(SCR_H / 2) + horizonShift;
  const invDet = 1.0 / (planeX * dirY - dirX * planeY);

  // Fog color
  const fogR = purpleFog ? 20 / 255 : 5 / 255;
  const fogG = purpleFog ? 5 / 255 : 5 / 255;
  const fogB = purpleFog ? 30 / 255 : 8 / 255;

  // Collect visible entities
  const visible: { e: Entity; dx: number; dy: number; dist: number }[] = [];
  for (const e of entities) {
    if (!e.alive || e.type === EntityType.PLAYER) continue;
    let dx = e.x - px;
    let dy = e.y - py;
    if (dx > W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    if (dy > W / 2) dy -= W;
    if (dy < -W / 2) dy += W;
    const dist = dx * dx + dy * dy;
    if (dist < MAX_DRAW * MAX_DRAW) {
      visible.push({ e, dx, dy, dist });
    }
  }
  // Sort far to near
  visible.sort((a, b) => b.dist - a.dist);

  gl.useProgram(glState.spriteProgram);
  // Depth test is already enabled by caller with LESS func
  // Enable blending for alpha-tested sprites
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const su = glState.spriteUniforms;
  gl.uniform2f(su['uResolution']!, SCR_W, SCR_H);
  gl.uniform3f(su['uFogColor']!, fogR, fogG, fogB);
  gl.uniform1f(su['uTime']!, time);
  gl.bindVertexArray(glState.spriteVAO);

  for (const { e, dx, dy, dist } of visible) {
    const txf = invDet * (dirY * dx - dirX * dy);
    const tyf = invDet * (-planeY * dx + planeX * dy);
    if (tyf <= 0.1) continue;

    const spriteScreenX = Math.floor((SCR_W / 2) * (1 + txf / tyf));
    const rawH = Math.abs(Math.floor(SCR_H / tyf));
    const scale = e.spriteScale ?? 1.0;
    const spriteH = Math.floor(rawH * scale);
    const spriteW = spriteH;

    const spriteZ = e.spriteZ ?? 0;
    const footY = halfH + Math.floor(rawH * camHeight) - Math.floor(rawH * spriteZ);
    const startY = footY - spriteH;

    const ff = Math.min(1, Math.sqrt(dist) * fogDensity);
    const isProjectile = e.type === EntityType.PROJECTILE
      ? (e.projType === ProjType.FLAME ? 2 : 1)
      : 0;
    const normDepth = Math.min(1.0, tyf / MAX_DRAW);

    // Set uniforms
    gl.uniform1f(su['uScreenX']!, spriteScreenX);
    gl.uniform1f(su['uSpriteW']!, spriteW);
    gl.uniform1f(su['uSpriteH']!, spriteH);
    gl.uniform1f(su['uStartY']!, startY);
    gl.uniform1f(su['uDepth']!, normDepth);
    gl.uniform1f(su['uFogF']!, ff);
    gl.uniform1i(su['uIsProjectile']!, isProjectile);
    if (isProjectile === 2) {
      gl.uniform1f(su['uSeed']!, (e.id % 997) * 0.137);
    }

    // Switch blend mode: additive for projectiles (incl. flame), alpha for everything else
    if (isProjectile) {
      gl.blendFunc(gl.ONE, gl.ONE);
      // Flame: disable depth write — purely additive visual, should not occlude
      if (isProjectile === 2) gl.depthMask(false);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    // Bind sprite texture
    const sprIdx = e.sprite ?? 0;
    if (sprIdx >= 0 && sprIdx < glState.spriteTextures.length) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, glState.spriteTextures[sprIdx]);
      gl.uniform1i(su['uSpriteTex']!, 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Restore depth mask if it was disabled for flame
    if (isProjectile === 2) gl.depthMask(true);
  }

  gl.disable(gl.BLEND);
}

/* ── Blood particle rendering ─────────────────────────────────── */
function renderParticlesGL(
  particles: BloodParticle[],
  px: number, py: number, pAngle: number, pPitch: number,
  _camHeight: number,
): void {
  if (!glState || particles.length === 0) return;
  const { gl } = glState;

  const dirX = Math.cos(pAngle);
  const dirY = Math.sin(pAngle);
  const planeLen = Math.tan(HALF_FOV);
  const planeX = -dirY * planeLen;
  const planeY = dirX * planeLen;
  const horizonShift = Math.floor(pPitch * SCR_H);
  const halfH = Math.floor(SCR_H / 2) + horizonShift;
  const invDet = 1.0 / (planeX * dirY - dirX * planeY);

  gl.useProgram(glState.particleProgram);
  // Depth test already enabled by caller
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const pu = glState.particleUniforms;
  gl.uniform2f(pu['uResolution']!, SCR_W, SCR_H);
  gl.bindVertexArray(glState.particleVAO);

  for (const p of particles) {
    let dx = p.x - px;
    let dy = p.y - py;
    if (dx > W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    if (dy > W / 2) dy -= W;
    if (dy < -W / 2) dy += W;

    const txf = invDet * (dirY * dx - dirX * dy);
    const tyf = invDet * (-planeY * dx + planeX * dy);
    if (tyf <= 0.1) continue;

    const sx = Math.floor((SCR_W / 2) * (1 + txf / tyf));
    if (sx < -4 || sx >= SCR_W + 4) continue;

    const sy = Math.floor(halfH + SCR_H / (tyf * 2) - p.z * SCR_H / tyf); // at impact height
    if (sy < -4 || sy >= SCR_H + 4) continue;

    const alpha = Math.min(1, p.life * 5);
    const normDepth = Math.min(0.999, tyf / MAX_DRAW);

    gl.uniform1f(pu['uScreenX']!, sx);
    gl.uniform1f(pu['uScreenY']!, sy);
    gl.uniform1f(pu['uSize']!, p.size * 2);
    gl.uniform1f(pu['uDepth']!, normDepth);
    gl.uniform4f(pu['uColor']!, p.r / 255, p.g / 255, p.b / 255, alpha);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  gl.disable(gl.BLEND);
}

/* ── Dispose all GL resources ─────────────────────────────────── */
export function disposeWebGL(): void {
  if (!glState) return;
  const { gl } = glState;
  gl.deleteProgram(glState.rayProgram);
  gl.deleteProgram(glState.blitProgram);
  gl.deleteProgram(glState.spriteProgram);
  gl.deleteProgram(glState.particleProgram);
  gl.deleteFramebuffer(glState.rayFBO);
  gl.deleteRenderbuffer(glState.rayDepthBuf);
  gl.deleteTexture(glState.rayColorTex);
  gl.deleteTexture(glState.cellsTex);
  gl.deleteTexture(glState.wallTexTex);
  gl.deleteTexture(glState.floorTexTex);
  gl.deleteTexture(glState.featuresTex);
  gl.deleteTexture(glState.lightTex);
  gl.deleteTexture(glState.fogTex);
  gl.deleteTexture(glState.doorStatesTex);
  gl.deleteTexture(glState.atlasTex);
  gl.deleteTexture(glState.surfaceAtlasTex);
  gl.deleteTexture(glState.surfaceIdxTex);
  for (const t of glState.spriteTextures) gl.deleteTexture(t);
  glState = null;
}

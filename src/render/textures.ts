/* ── Procedural texture generator (64×64, retro horror style) ── */

import { Tex } from '../core/types';
import { generateSlideTextures } from '../gen/living';
import { S, rgba, noise, clamp } from './pixutil';

export type TexData = Uint32Array; // S*S RGBA pixels (0xAABBGGRR little-endian)

/* ── Generate all game textures ───────────────────────────────── */
export function generateTextures(): TexData[] {
  const textures: TexData[] = [];
  for (let i = 0; i < Tex.COUNT; i++) textures.push(new Uint32Array(S * S));

  gen_concrete(textures[Tex.CONCRETE], 140, 140, 140, 42);
  gen_brick(textures[Tex.BRICK]);
  gen_panel(textures[Tex.PANEL]);
  gen_tile(textures[Tex.TILE_W]);
  gen_metal(textures[Tex.METAL]);
  gen_rotten(textures[Tex.ROTTEN]);
  gen_curtain(textures[Tex.CURTAIN]);
  gen_dark(textures[Tex.DARK]);
  gen_concrete(textures[Tex.F_CONCRETE], 120, 120, 118, 37);
  gen_lino(textures[Tex.F_LINO]);
  gen_floorTile(textures[Tex.F_TILE]);
  gen_wood(textures[Tex.F_WOOD]);
  gen_carpet(textures[Tex.F_CARPET]);
  gen_concrete(textures[Tex.CEIL], 80, 78, 76, 99);
  gen_doorWood(textures[Tex.DOOR_WOOD]);
  gen_doorMetal(textures[Tex.DOOR_METAL]);
  gen_abyss(textures[Tex.F_ABYSS]);
  gen_liftDoor(textures[Tex.LIFT_DOOR]);
  gen_pipe(textures[Tex.PIPE]);
  gen_water(textures[Tex.F_WATER]);
  gen_meat(textures[Tex.MEAT]);
  gen_meatFloor(textures[Tex.F_MEAT]);
  gen_desk(textures[Tex.DESK]);
  gen_target(textures[Tex.TARGET]);
  generateSlideTextures(textures);

  return textures;
}

/* ── Individual texture generators ────────────────────────────── */

function gen_concrete(t: TexData, br: number, bg: number, bb: number, seed: number) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, seed) * 30 - 15;
    const crack = (noise(x * 3, y * 3, seed + 7) > 0.92) ? -40 : 0;
    t[y * S + x] = rgba(clamp(br + n + crack), clamp(bg + n + crack), clamp(bb + n + crack));
  }
}

function gen_brick(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / 8);
    const offset = (row & 1) ? 16 : 0;
    const bx = (x + offset) % 32;
    const by = y % 8;
    const mortar = bx < 1 || by < 1;
    const n = noise(x, y, 11) * 20 - 10;
    if (mortar) {
      t[y * S + x] = rgba(clamp(100 + n), clamp(95 + n), clamp(85 + n));
    } else {
      const shade = noise(Math.floor((x + offset) / 32), row, 33) * 30;
      t[y * S + x] = rgba(clamp(140 + shade + n), clamp(60 + shade / 2 + n), clamp(50 + shade / 3 + n));
    }
  }
}

function gen_panel(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const seam = (x % 32 < 1 || y % 32 < 1) ? -30 : 0;
    const n = noise(x, y, 22) * 16 - 8;
    t[y * S + x] = rgba(clamp(170 + n + seam), clamp(165 + n + seam), clamp(150 + n + seam));
  }
}

function gen_tile(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const grout = (x % 16 < 1 || y % 16 < 1) ? -50 : 0;
    const n = noise(x, y, 33) * 10 - 5;
    t[y * S + x] = rgba(clamp(200 + n + grout), clamp(205 + n + grout), clamp(210 + n + grout));
  }
}

function gen_metal(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 44) * 25 - 12;
    const rivet = (x % 16 === 8 && y % 16 === 8) ? 40 : 0;
    const streak = Math.sin(y * 0.5 + noise(x, 0, 44) * 4) * 10;
    t[y * S + x] = rgba(clamp(90 + n + rivet + streak), clamp(95 + n + rivet + streak), clamp(105 + n + rivet + streak));
  }
}

function gen_rotten(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n1 = noise(x, y, 55) * 40 - 20;
    const n2 = noise(x * 2, y * 2, 56) * 30;
    const veins = Math.sin(x * 0.3 + noise(x, y, 57) * 5) * 15;
    const r = clamp(60 + n1 + veins);
    const g = clamp(80 + n1 + n2 + veins);
    const b = clamp(40 + n1);
    t[y * S + x] = rgba(r, g, b);
  }
}

function gen_curtain(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fold = Math.sin(x * 0.4) * 25;
    const n = noise(x, y, 66) * 10;
    t[y * S + x] = rgba(clamp(120 + fold + n), clamp(20 + fold / 3 + n), clamp(25 + fold / 3 + n));
  }
}

function gen_dark(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 77) * 15;
    t[y * S + x] = rgba(clamp(30 + n), clamp(28 + n), clamp(32 + n));
  }
}

function gen_lino(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const pattern = ((x + y) % 16 < 8) ? 10 : 0;
    const n = noise(x, y, 88) * 15 - 7;
    t[y * S + x] = rgba(clamp(90 + pattern + n), clamp(100 + pattern + n), clamp(80 + pattern + n));
  }
}

function gen_floorTile(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const checker = ((Math.floor(x / 16) + Math.floor(y / 16)) & 1) ? 40 : 0;
    const grout = (x % 16 < 1 || y % 16 < 1) ? -30 : 0;
    const n = noise(x, y, 99) * 8;
    t[y * S + x] = rgba(clamp(150 + checker + grout + n), clamp(155 + checker + grout + n), clamp(160 + checker + grout + n));
  }
}

function gen_wood(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const plank = Math.floor(x / 8);
    const grain = Math.sin(y * 0.8 + plank * 3.7 + noise(x, y, 101) * 3) * 15;
    const edge = (x % 8 < 1) ? -25 : 0;
    const n = noise(x, y, 100) * 12;
    t[y * S + x] = rgba(clamp(130 + grain + edge + n), clamp(95 + grain + edge + n), clamp(55 + grain / 2 + edge + n));
  }
}

function gen_carpet(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 111) * 20 - 10;
    const pattern = Math.sin(x * 0.3) * Math.sin(y * 0.3) * 15;
    t[y * S + x] = rgba(clamp(100 + pattern + n), clamp(30 + pattern / 2 + n), clamp(25 + pattern / 2 + n));
  }
}

function gen_doorWood(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const panel = (x > 8 && x < 28 && y > 8 && y < 56) ? 15 : 0;
    const panel2 = (x > 36 && x < 56 && y > 8 && y < 56) ? 15 : 0;
    const grain = Math.sin(y * 0.5 + x * 0.1) * 8;
    const n = noise(x, y, 120) * 10;
    // Handle
    const handle = (x > 29 && x < 35 && y > 28 && y < 36) ? 50 : 0;
    t[y * S + x] = rgba(
      clamp(110 + grain + panel + panel2 + handle + n),
      clamp(75 + grain + panel + panel2 + handle / 2 + n),
      clamp(40 + grain / 2 + n),
    );
  }
}

function gen_doorMetal(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const border = (x < 3 || x > 60 || y < 3 || y > 60) ? -20 : 0;
    const n = noise(x, y, 130) * 15;
    const lock = (x > 48 && x < 56 && y > 28 && y < 36) ? 40 : 0;
    t[y * S + x] = rgba(clamp(80 + border + n + lock), clamp(85 + border + n + lock), clamp(90 + border + n + lock));
  }
}

function gen_abyss(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 200) * 8;
    const edge = noise(x * 4, y * 4, 201) > 0.85 ? 12 : 0;
    t[y * S + x] = rgba(clamp(6 + n + edge), clamp(4 + n), clamp(10 + n + edge));
  }
}

/* ── Lift door: industrial metal doors with yellow/black stripe ── */
function gen_liftDoor(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 210) * 12;
    // Two door panels
    const gap = Math.abs(x - S / 2) < 1;
    const border = x < 2 || x > S - 3 || y < 2 || y > S - 3;
    // Yellow-black hazard stripe at top
    const stripe = y < 8 && ((x + y) % 8 < 4);
    const panel = (x > 4 && x < S / 2 - 2) || (x > S / 2 + 2 && x < S - 4);
    let r: number, g: number, b: number;
    if (stripe) {
      r = 200; g = 180; b = 20;
    } else if (gap) {
      r = 15; g = 15; b = 20;
    } else if (border) {
      r = 50; g = 55; b = 60;
    } else if (panel) {
      r = 85 + Math.floor(n); g = 90 + Math.floor(n); b = 95 + Math.floor(n);
      // Vertical ribbing
      if (x % 4 === 0) { r -= 10; g -= 10; b -= 10; }
    } else {
      r = 60 + Math.floor(n); g = 65 + Math.floor(n); b = 70 + Math.floor(n);
    }
    // Buttons (call panel)
    const btnX = x > S / 2 + 8 && x < S / 2 + 14;
    const btnUp = btnX && y > 26 && y < 30;
    const btnDn = btnX && y > 32 && y < 36;
    if (btnUp) { r = 60; g = 200; b = 60; }
    if (btnDn) { r = 200; g = 60; b = 60; }
    t[y * S + x] = rgba(clamp(r), clamp(g), clamp(b));
  }
}

/* ── Pipe: rusty pipe texture for maintenance tunnels ─────────── */
function gen_pipe(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 220) * 25 - 12;
    // Horizontal pipes at different heights
    const pipe1 = y > 8 && y < 18;
    const pipe2 = y > 32 && y < 42;
    const pipe3 = y > 52 && y < 58;
    const bracket = (x % 16 < 2) && (pipe1 || pipe2);
    let r: number, g: number, b: number;
    if (bracket) {
      r = 70; g = 70; b = 75;
    } else if (pipe1) {
      const shade = Math.sin((y - 13) * 0.6) * 20;
      const rust = noise(x * 2, y, 221) > 0.7 ? 30 : 0;
      r = 110 + Math.floor(shade + n + rust);
      g = 80 + Math.floor(shade + n);
      b = 50 + Math.floor(shade / 2 + n);
    } else if (pipe2) {
      const shade = Math.sin((y - 37) * 0.6) * 15;
      r = 60 + Math.floor(shade + n);
      g = 90 + Math.floor(shade + n);
      b = 60 + Math.floor(shade + n);
    } else if (pipe3) {
      const shade = Math.sin((y - 55) * 0.8) * 10;
      r = 80 + Math.floor(shade + n);
      g = 80 + Math.floor(shade + n);
      b = 90 + Math.floor(shade + n);
    } else {
      // Concrete background
      r = 65 + Math.floor(n);
      g = 63 + Math.floor(n);
      b = 60 + Math.floor(n);
    }
    t[y * S + x] = rgba(clamp(r), clamp(g), clamp(b));
  }
}

/* ── Water: dark murky canal water ────────────────────────────── */
function gen_water(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wave = Math.sin(x * 0.2 + y * 0.15) * 10 + Math.sin(x * 0.4 - y * 0.3) * 5;
    const n = noise(x, y, 230) * 15;
    const foam = noise(x * 3, y * 3, 231) > 0.9 ? 25 : 0;
    const r = clamp(20 + Math.floor(n + wave));
    const g = clamp(40 + Math.floor(n + wave + foam));
    const b = clamp(55 + Math.floor(n + wave + foam));
    t[y * S + x] = rgba(r, g, b);
  }
}

/* ── Meat: corrupted organic wall texture for hell ────────────── */
function gen_meat(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n1 = noise(x, y, 240) * 40 - 20;
    const n2 = noise(x * 2, y * 2, 241) * 25;
    const veins = Math.sin(x * 0.15 + noise(x, y, 242) * 8) * 20;
    const pulse = Math.sin(y * 0.3 + x * 0.1) * 10;
    const r = clamp(120 + Math.floor(n1 + n2 + veins + pulse));
    const g = clamp(35 + Math.floor(n1 / 2 + pulse));
    const b = clamp(30 + Math.floor(n1 / 3));
    t[y * S + x] = rgba(r, g, b);
  }
}

/* ── Meat floor: fleshy ground for hell ───────────────────────── */
function gen_meatFloor(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 250) * 30 - 15;
    const pool = noise(x * 2, y * 2, 251) > 0.8 ? -20 : 0;
    const tissue = Math.sin(x * 0.2 + y * 0.2) * 8;
    const r = clamp(90 + Math.floor(n + tissue + pool));
    const g = clamp(25 + Math.floor(n / 2 + pool));
    const b = clamp(28 + Math.floor(n / 2 + pool));
    t[y * S + x] = rgba(r, g, b);
  }
}

/* ── Desk: school desk (wooden top, metal legs visible) ───────── */
function gen_desk(t: TexData) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 260) * 12;
    // Desk body is a green-brown wooden surface (Soviet school desk)
    const topH = 40; // desk surface height in texture
    if (y < 4) {
      // Top edge — darker wood trim
      const grain = Math.sin(x * 0.6) * 4;
      t[y * S + x] = rgba(clamp(60 + Math.floor(n + grain)), clamp(45 + Math.floor(n + grain)), clamp(25 + Math.floor(n)));
    } else if (y < topH) {
      // Desk surface — classic Soviet green
      const shade = Math.sin(x * 0.3 + y * 0.1) * 6;
      const seam = (x === 31 || x === 32) ? -15 : 0;
      t[y * S + x] = rgba(
        clamp(50 + Math.floor(n + shade + seam)),
        clamp(85 + Math.floor(n + shade + seam)),
        clamp(55 + Math.floor(n / 2 + seam)),
      );
    } else if (y < topH + 3) {
      // Edge/apron
      t[y * S + x] = rgba(clamp(70 + Math.floor(n)), clamp(55 + Math.floor(n)), clamp(30 + Math.floor(n)));
    } else {
      // Below desk: metal legs + dark space
      const leg = (x > 4 && x < 8) || (x > 56 && x < 60);
      if (leg) {
        t[y * S + x] = rgba(clamp(70 + Math.floor(n)), clamp(72 + Math.floor(n)), clamp(75 + Math.floor(n)));
      } else {
        t[y * S + x] = rgba(clamp(20 + Math.floor(n / 2)), clamp(18 + Math.floor(n / 2)), clamp(22 + Math.floor(n / 2)));
      }
    }
  }
}

/* ── TARGET: Soviet shooting range paper target (мишень) ──────── */
function gen_target(t: TexData) {
  const cx = S / 2, cy = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x, y, 350) * 8;
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Cardboard background
    let r = 196 + n, g = 168 + n, b = 130 + n;
    // Concentric rings (black) at radii 28, 20, 12
    if (Math.abs(dist - 28) < 1.2 || Math.abs(dist - 20) < 1.2 || Math.abs(dist - 12) < 1.2) {
      r = 30 + n; g = 30 + n; b = 30 + n;
    }
    // Center bullseye — red fill within radius 5
    if (dist < 5) { r = 180 + n; g = 30 + n / 2; b = 30 + n / 2; }
    // Crosshair lines (thin)
    if ((Math.abs(dx) < 0.8 && dist < 28) || (Math.abs(dy) < 0.8 && dist < 28)) {
      r = Math.min(r, 60 + n); g = Math.min(g, 60 + n); b = Math.min(b, 60 + n);
    }
    t[y * S + x] = rgba(clamp(r), clamp(g), clamp(b));
  }
}

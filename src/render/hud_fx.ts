/* ── Neuro-interface HUD visual effects ───────────────────────── *
 * Procedural VHS / neural-interface distortion for HUD overlay.   *
 * All state-free — pure functions of time.                        *
 * ────────────────────────────────────────────────────────────── */

/* ── Seeded pseudo-random ─────────────────────────────────────── */
function hash(n: number): number {
  let x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
}

function hash2(a: number, b: number): number {
  return hash(a * 12.9898 + b * 78.233);
}

/* ── Text jitter: small XY offset that varies over time ───────── *
 * Each text element gets a unique `seed` for distinct motion.     */
export function textJitter(time: number, seed: number): { dx: number; dy: number } {
  // Slow drift + fast micro-jitter
  const phase = time * 0.7 + seed * 137.1;
  const drift = Math.sin(phase) * 0.6;
  const jitterX = (hash2(Math.floor(time * 12), seed) - 0.5) * 1.2;
  const jitterY = (hash2(Math.floor(time * 10), seed + 50) - 0.5) * 0.8;
  return {
    dx: drift + jitterX,
    dy: jitterY,
  };
}

/* ── Alpha flicker: procedural opacity pulsation ──────────────── */
export function flicker(time: number, seed: number): number {
  const base = 0.92;
  const pulse = Math.sin(time * 2.3 + seed * 7.1) * 0.03;
  const glitch = hash2(Math.floor(time * 6), seed) > 0.93 ? -0.15 : 0;
  return Math.max(0.5, Math.min(1, base + pulse + glitch));
}

/* ── Draw neuro-panel background with glitch border ───────────── */
export function drawNeuroPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  time: number, seed = 0,
): void {
  ctx.save();

  // Main background — dark with subtle cyan tint
  ctx.fillStyle = 'rgba(2,8,16,0.92)';
  ctx.fillRect(x, y, w, h);

  // Scanline overlay inside panel
  const lineH = 2;
  ctx.fillStyle = 'rgba(0,255,200,0.015)';
  for (let ly = 0; ly < h; ly += lineH * 2) {
    ctx.fillRect(x, y + ly, w, lineH);
  }

  // Horizontal noise lines (rare, procedural)
  const barSeed = Math.floor(time * 3) + seed;
  for (let i = 0; i < 3; i++) {
    const rh = hash2(barSeed, i + seed * 10);
    if (rh > 0.85) {
      const ly = y + rh * h;
      const alpha = (rh - 0.85) * 2;
      ctx.fillStyle = `rgba(0,220,180,${alpha * 0.08})`;
      ctx.fillRect(x, ly, w, 1);
    }
  }

  // Border — thin glowing lines with occasional breaks
  ctx.strokeStyle = 'rgba(0,200,180,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Corner accents
  const cornerLen = Math.min(12, w * 0.1, h * 0.1);
  ctx.strokeStyle = 'rgba(0,255,220,0.5)';
  ctx.lineWidth = 1.5;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(x, y + h - cornerLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerLen, y + h);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen);
  ctx.stroke();

  ctx.restore();
}

/* ── Draw holographic status bar ──────────────────────────────── */
export function drawHoloBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  pct: number, color: string, time: number, seed = 0,
): void {
  ctx.save();
  const fillW = w * Math.max(0, Math.min(1, pct / 100));

  // Background track
  ctx.fillStyle = 'rgba(10,20,30,0.8)';
  ctx.fillRect(x, y, w, h);

  // Fill with animated scanlines
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85 + Math.sin(time * 1.5 + seed) * 0.1;
  ctx.fillRect(x, y, fillW, h);

  // Inner scanline pattern
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  for (let ly = 0; ly < h; ly += 2) {
    ctx.fillRect(x, y + ly, fillW, 1);
  }
  ctx.globalAlpha = 1;

  // Glow edge at fill boundary
  if (fillW > 2) {
    const glowX = x + fillW - 1;
    const grd = ctx.createLinearGradient(glowX - 4, 0, glowX + 2, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(glowX - 4, y, 6, h);
  }

  // Thin border
  ctx.strokeStyle = 'rgba(0,200,180,0.2)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, w, h);

  ctx.restore();
}

/* ── Draw text with procedural jitter and optional glow ───────── */
export function drawGlitchText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  time: number, seed: number,
  color = '#ccc',
  fontSize = 8,
): void {
  const j = textJitter(time, seed);
  const alpha = flicker(time, seed + 77);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px monospace`;

  // Occasional character dropout (1 char replaced with noise)
  const dropIdx = hash2(Math.floor(time * 4), seed) > 0.92
    ? Math.floor(hash2(Math.floor(time * 4) + 1, seed) * text.length)
    : -1;

  let rendered = text;
  if (dropIdx >= 0 && dropIdx < text.length) {
    const glitchChars = '░▒▓█▄▀│┤╡╢';
    const gc = glitchChars[Math.floor(hash2(Math.floor(time * 8), seed + 3) * glitchChars.length)];
    rendered = text.substring(0, dropIdx) + gc + text.substring(dropIdx + 1);
  }

  ctx.fillText(rendered, x + j.dx, y + j.dy);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── Static noise overlay on a rectangular region ─────────────── */
export function drawStaticNoise(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  time: number, intensity = 0.03,
): void {
  ctx.save();
  const step = 4; // pixel block size for performance
  const timeSeed = Math.floor(time * 15);
  ctx.globalAlpha = intensity;
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const n = hash2(timeSeed + py * 317 + px, timeSeed * 7);
      const v = Math.floor(n * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x + px, y + py, step, step);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── Horizontal glitch line across the HUD ────────────────────── */
export function drawGlitchLine(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  time: number,
): void {
  const lineSeed = Math.floor(time * 2.5);
  const chance = hash(lineSeed * 13.7);
  if (chance > 0.7) return; // only draw ~30% of the time

  const ly = hash(lineSeed * 31.3) * h;
  const lineH = 1 + hash(lineSeed * 47.1) * 2;
  const alpha = 0.03 + hash(lineSeed * 61.9) * 0.04;

  ctx.save();
  ctx.fillStyle = `rgba(0,255,200,${alpha})`;
  ctx.fillRect(0, ly, w, lineH);
  ctx.restore();
}

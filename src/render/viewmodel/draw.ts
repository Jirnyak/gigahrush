/**
 * Общие примитивы рисования по холсту вьюмодели.
 *
 * Это НЕ попытка свести пакеты оружия к одному генератору: силуэт каждого
 * ствола остаётся его собственным делом. Здесь только то, что иначе каждый
 * пакет обязан был бы помнить сам — арифметика буфера 128×128, смешивание по
 * альфе и общий контракт освещения корпуса. Ровно тот же уровень, что
 * `core/pixutil` держит для спрайтов сущностей.
 */

import { CLEAR, clamp, noise, rgba } from '../../core/pixutil';
import { VM } from './types';

/** Пустой холст вьюмодели. */
export function viewmodelBuffer(): Uint32Array {
  return new Uint32Array(VM * VM).fill(CLEAR);
}

/** Точка. Вне холста — молча ничего. */
export function put(buf: Uint32Array, x: number, y: number, color: number): void {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= VM || iy >= VM) return;
  buf[iy * VM + ix] = color;
}

/** Точка со смешиванием по альфе поверх того, что уже лежит. */
export function blend(buf: Uint32Array, x: number, y: number, color: number, alpha: number): void {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= VM || iy >= VM) return;
  if (alpha >= 1) { buf[iy * VM + ix] = color; return; }
  if (alpha <= 0) return;
  const idx = iy * VM + ix;
  const dst = buf[idx];
  const da = (dst >>> 24) & 0xff;
  const sr = color & 0xff, sg = (color >>> 8) & 0xff, sb = (color >>> 16) & 0xff, sa = (color >>> 24) & 0xff;
  if (da === 0) { buf[idx] = rgba(sr, sg, sb, clamp(sa * alpha)); return; }
  const dr = dst & 0xff, dg = (dst >>> 8) & 0xff, db = (dst >>> 16) & 0xff;
  buf[idx] = rgba(
    clamp(dr + (sr - dr) * alpha),
    clamp(dg + (sg - dg) * alpha),
    clamp(db + (sb - db) * alpha),
    clamp(Math.max(da, sa * alpha)),
  );
}

/** Заполненный прямоугольник. */
export function rect(buf: Uint32Array, x: number, y: number, w: number, h: number, color: number): void {
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(VM, (x + w) | 0);
  const y1 = Math.min(VM, (y + h) | 0);
  for (let py = y0; py < y1; py++) {
    const row = py * VM;
    for (let px = x0; px < x1; px++) buf[row + px] = color;
  }
}

/** Отрезок по Брезенхэму с толщиной. */
export function line(buf: Uint32Array, x0: number, y0: number, x1: number, y1: number, color: number, width = 1): void {
  let ax = x0 | 0, ay = y0 | 0;
  const bx = x1 | 0, by = y1 | 0;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  const half = Math.max(0, (width - 1) >> 1);
  for (;;) {
    if (width <= 1) put(buf, ax, ay, color);
    else rect(buf, ax - half, ay - half, width, width, color);
    if (ax === bx && ay === by) break;
    const e2 = err * 2;
    if (e2 >= dy) { err += dy; ax += sx; }
    if (e2 <= dx) { err += dx; ay += sy; }
  }
}

/** Заполненный эллипс по центру и полуосям. */
export function ellipse(buf: Uint32Array, cx: number, cy: number, rx: number, ry: number, color: number): void {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const x1 = Math.min(VM - 1, Math.ceil(cx + rx));
  const y1 = Math.min(VM - 1, Math.ceil(cy + ry));
  for (let py = y0; py <= y1; py++) {
    const ny = (py - cy) / ry;
    for (let px = x0; px <= x1; px++) {
      const nx = (px - cx) / rx;
      if (nx * nx + ny * ny <= 1) buf[py * VM + px] = color;
    }
  }
}

/**
 * Цилиндрическая заливка корпуса: столбец тем светлее, чем ближе к оси.
 *
 * Ствол, рукоять и труба — всё это круглое в сечении, и без этого они читаются
 * плоскими плашками. Отдельного шейдера ради такого заводить незачем.
 */
export function tube(
  buf: Uint32Array,
  x: number, y: number, w: number, h: number,
  base: readonly [number, number, number],
  seed: number,
  wear = 0,
): void {
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(VM, (x + w) | 0);
  const y1 = Math.min(VM, (y + h) | 0);
  if (x1 <= x0 || y1 <= y0) return;
  const horizontal = w >= h;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      // Поперечная координата 0..1 поперёк тела, 0.5 — ось.
      const t = horizontal ? (py - y) / Math.max(1, h) : (px - x) / Math.max(1, w);
      const lit = 1.18 - Math.abs(t - 0.38) * 1.55;
      const n = (noise(px, py, seed) - 0.5) * (12 + wear * 46);
      const rust = wear > 0 && noise(px * 3, py * 3, seed + 7) < wear * 0.32;
      const r = rust ? base[0] * 0.62 + 58 : base[0];
      const g = rust ? base[1] * 0.5 + 26 : base[1];
      const b = rust ? base[2] * 0.44 + 14 : base[2];
      buf[py * VM + px] = rgba(clamp(r * lit + n), clamp(g * lit + n), clamp(b * lit + n));
    }
  }
}

/**
 * Тёмный контур по силуэту. Без него оружие сливается с бетоном ровно так же,
 * как сливались бы спрайты, — там `outline` стоит по той же причине.
 */
export function contour(buf: Uint32Array, color = rgba(8, 7, 9, 235)): void {
  const edges: number[] = [];
  for (let y = 0; y < VM; y++) {
    for (let x = 0; x < VM; x++) {
      const idx = y * VM + x;
      if ((buf[idx] >>> 24) & 0xff) continue;
      const near =
        (x > 0 && ((buf[idx - 1] >>> 24) & 0xff) > 0) ||
        (x < VM - 1 && ((buf[idx + 1] >>> 24) & 0xff) > 0) ||
        (y > 0 && ((buf[idx - VM] >>> 24) & 0xff) > 0) ||
        (y < VM - 1 && ((buf[idx + VM] >>> 24) & 0xff) > 0);
      if (near) edges.push(idx);
    }
  }
  for (let i = 0; i < edges.length; i++) buf[edges[i]] = color;
}

/**
 * Кисть руки. Рисуется каждым пакетом самостоятельно, потому что хват у пилы и
 * у пистолета разный, но сама плоть у всех одна и та же.
 */
export function hand(
  buf: Uint32Array,
  cx: number, cy: number, w: number, h: number,
  tone: readonly [number, number, number],
  seed: number,
): void {
  ellipse(buf, cx, cy, w * 0.5, h * 0.5, rgba(tone[0], tone[1], tone[2]));
  const py1 = Math.min(VM, cy + h * 0.5) | 0;
  const px1 = Math.min(VM, cx + w * 0.5) | 0;
  for (let py = Math.max(0, cy - h * 0.5) | 0; py < py1; py++) {
    for (let px = Math.max(0, cx - w * 0.5) | 0; px < px1; px++) {
      const idx = py * VM + px;
      if (!((buf[idx] >>> 24) & 0xff)) continue;
      const n = (noise(px, py, seed) - 0.5) * 22;
      const shade = 1 - Math.max(0, (py - cy) / Math.max(1, h)) * 0.35;
      buf[idx] = rgba(clamp(tone[0] * shade + n), clamp(tone[1] * shade + n), clamp(tone[2] * shade + n));
    }
  }
}

/** Оттенок кожи, выведенный из зерна ствола, чтобы руки не были у всех одни. */
export function skinTone(rand: () => number): readonly [number, number, number] {
  const t = rand();
  return [clamp(150 + t * 58), clamp(112 + t * 46), clamp(94 + t * 38)] as const;
}

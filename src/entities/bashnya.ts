/* ── Башня: неподвижная линейная турель ──────────────────────────
 *   Стоит на линии и простреливает её насквозь. Не ходит вообще —
 *   как идол, только бетонная и с прожектором вместо глаз.
 *
 *   Сторону башня носит в младшем бите спрайтового сида: чётный —
 *   ликвидаторская сталь, нечётный — дикая ржавчина. Отдельного
 *   канала для этого нет, `generateProceduralMonsterSprite` знает о
 *   существе только вид и сид, а различать стороны глазом обязательно.
 */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../core/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.BASHNYA,
  name: 'Башня',
  hp: 260,
  speed: 0,
  dmg: 18,
  attackRate: 1.15,
  sprite: 0,
  isRanged: true,
  projSpeed: 16,
  projSprite: 0,   // ноль-заглушка: спрайт раздаёт MONSTER_VISUALS -> Spr.HOSTILE_PLASMA_BOLT
  aiFlags: ['sided'],
  counterplay: 'Башня не ходит и бьёт только вдоль линии: подходите вплотную по стене или пропускайте вперёд чужих бойцов.',
  lootHint: 'обломки прожектора, стреляная гильза, редкий фокусирующий кристалл',
};

export function generateSprite(): Uint32Array {
  return generateBashnyaSprite(0);
}

function put(t: Uint32Array, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  t[y * S + x] = rgba(r, g, b, a);
}

function box(t: Uint32Array, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, seed: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const n = noise(x, y, seed) * 26 - 10;
      const edge = (x === x0 || x === x1 || y === y0) ? -22 : 0;
      put(t, x, y, clamp(r + n + edge), clamp(g + n + edge), clamp(b + n + edge));
    }
  }
}

export function generateBashnyaSprite(seed: number): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const wild = (seed & 1) === 1;
  const cx = S >> 1;

  // Сторона читается цветом корпуса: сталь против ржавчины.
  const br = wild ? 96 : 74;
  const bg = wild ? 72 : 82;
  const bb = wild ? 54 : 96;
  const mr = wild ? 178 : 96;
  const mg = wild ? 84 : 168;
  const mb = wild ? 40 : 214;

  // Основание — широкая бетонная тумба, чтобы силуэт не путался с бойцом.
  box(t, cx - 11, 50, cx + 11, 61, 92, 90, 86, seed + 11);
  for (let i = 0; i < 6; i++) {
    const x = cx - 9 + i * 4;
    put(t, x, 52 + (i & 1), 58, 56, 52);
    put(t, x + 1, 57, 58, 56, 52);
  }

  // Ствол башни: сужается кверху, по нему идёт цветная полоса стороны.
  for (let y = 18; y < 50; y++) {
    const half = 3 + Math.round((50 - y) * 0.09);
    for (let x = cx - half; x <= cx + half; x++) {
      const shade = Math.abs(x - cx) * 5;
      const n = noise(x, y, seed + 21) * 22;
      put(t, x, y, clamp(br + n - shade), clamp(bg + n - shade), clamp(bb + n - shade));
    }
    if (y % 9 === 0) {
      for (let x = cx - half; x <= cx + half; x++) put(t, x, y, clamp(mr - 40), clamp(mg - 40), clamp(mb - 40));
    }
  }
  for (let y = 20; y < 48; y++) put(t, cx, y, mr, mg, mb, 235);

  // Площадка и прожектор — источник выстрела, читается издалека.
  box(t, cx - 8, 12, cx + 8, 18, clamp(br + 26), clamp(bg + 26), clamp(bb + 26), seed + 31);
  for (let y = 6; y <= 12; y++) {
    const half = 5 - Math.abs(9 - y) * 0.4;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const n = noise(x, y, seed + 41) * 18;
      put(t, x, y, clamp(mr * 0.5 + n), clamp(mg * 0.5 + n), clamp(mb * 0.5 + n));
    }
  }
  for (let y = 7; y <= 10; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      const d = Math.hypot(x - cx, y - 8.5);
      if (d > 3.2) continue;
      const glow = clamp(230 - d * 34);
      put(t, x, y, glow, clamp(glow * (wild ? 0.62 : 0.86)), clamp(glow * (wild ? 0.3 : 1)));
    }
  }
  put(t, cx, 8, 255, 250, 230);

  // Растяжки к тумбе: без них силуэт читается как труба.
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const x0 = cx + side * 3;
    const x1 = cx + side * (9 + (i & 1) * 2);
    const steps = 30;
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      put(t, Math.round(x0 + (x1 - x0) * k), Math.round(20 + k * 30), 64, 62, 58, 210);
    }
  }

  return t;
}

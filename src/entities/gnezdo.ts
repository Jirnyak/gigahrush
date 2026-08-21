/* ── Гнездо: неподвижный источник бойцов ─────────────────────────
 *   Стоит в глубине своей половины и шлёт бойцов по линиям. Само не
 *   ходит и почти не дерётся: его убивают, чтобы поток кончился.
 *
 *   Каденция и приплод объявлены в `MonsterDef.source`, шагает их общий
 *   источник в `systems/matka_source.ts`. Сторона — младший бит сида,
 *   как у башни.
 */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../core/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.GNEZDO,
  name: 'Гнездо',
  hp: 900,
  speed: 0,
  dmg: 10,
  attackRate: 2.4,
  sprite: 0,
  aiFlags: ['sided'],
  source: {
    childKinds: [MonsterKind.BOEC],
    cooldownSec: 14,
    cap: 10,
    childName: 'Боец линии',
  },
  counterplay: 'Гнездо не ходит и не догоняет: поток бойцов кончается только вместе с ним.',
  lootHint: 'сырьё гнезда, обломки каркаса, редкий узел линии',
};

export function generateSprite(): Uint32Array {
  return generateGnezdoSprite(0);
}

function put(t: Uint32Array, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  t[y * S + x] = rgba(r, g, b, a);
}

export function generateGnezdoSprite(seed: number): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const wild = (seed & 1) === 1;
  const cx = S >> 1;

  const br = wild ? 84 : 66;
  const bg = wild ? 66 : 74;
  const bb = wild ? 48 : 88;
  const mr = wild ? 196 : 108;
  const mg = wild ? 92 : 176;
  const mb = wild ? 44 : 224;

  // Приземистый купол во всю ширину: гнездо должно читаться как здание,
  // а не как крупный монстр — иначе игрок побежит от него, а не к нему.
  for (let y = 20; y < 60; y++) {
    const k = (y - 20) / 40;
    const half = 6 + k * 20;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const dx = Math.abs(x - cx) / half;
      const n = noise(x, y, seed + 51) * 30 - 12;
      const shade = dx * dx * 34;
      put(t, x, y, clamp(br + n - shade), clamp(bg + n - shade), clamp(bb + n - shade));
    }
  }

  // Рёбра каркаса — вертикали от зева к основанию.
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = (Math.floor(i / 2) + 1) * 6;
    for (let y = 26; y < 59; y++) {
      const k = (y - 26) / 33;
      put(t, Math.round(cx + side * spread * k), y, clamp(br - 26), clamp(bg - 26), clamp(bb - 26), 225);
    }
  }

  // Зев: горящее устье, из которого выходят бойцы.
  for (let y = 30; y < 52; y++) {
    const half = 7 - Math.abs(41 - y) * 0.26;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const d = Math.hypot((x - cx) / half, (y - 41) / 11);
      if (d > 1) continue;
      const glow = clamp(40 + (1 - d) * 150);
      put(t, x, y, clamp(mr * glow / 255 + 22), clamp(mg * glow / 255 + 18), clamp(mb * glow / 255 + 14));
    }
  }

  // Верхняя надстройка с сигнальным огнём стороны.
  for (let y = 12; y < 22; y++) {
    const half = 4 + (y - 12) * 0.3;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const n = noise(x, y, seed + 61) * 20;
      put(t, x, y, clamp(br + 30 + n), clamp(bg + 30 + n), clamp(bb + 30 + n));
    }
  }
  for (let y = 8; y <= 12; y++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      const d = Math.hypot(x - cx, y - 10);
      if (d > 2.4) continue;
      put(t, x, y, clamp(mr + 40), clamp(mg + 40), clamp(mb + 40));
    }
  }

  return t;
}

/* ── Paragraph: hostile paper clause, ranged psi bolt ────────── */

import { FloorLevel, MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.PARAGRAPH,
  name: 'Параграф',
  hp: 42,
  speed: 1.1,
  dmg: 12,
  attackRate: 2.0,
  sprite: 0,
  isRanged: true,
  projSpeed: 7,
  projSprite: 0,
  aiFlags: ['rangedClause'],
  floors: [FloorLevel.MINISTRY, FloorLevel.VOID],
  counterplay: 'Ломайте линию видимости и сближайтесь: параграф опасен на средней дистанции.',
  lootHint: 'порванный приказ',
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;

  for (let y = 7; y < 57; y++) {
    const bend = Math.sin(y * 0.13) * 2;
    for (let x = cx - 12; x <= cx + 12; x++) {
      const px = Math.floor(x + bend);
      if (px < 0 || px >= S) continue;
      const n = noise(px, y, 8500) * 15;
      t[y * S + px] = rgba(clamp(205 + n), clamp(198 + n), clamp(165 + n));
    }
  }

  for (let y = 14; y < 50; y += 5) {
    const len = 10 + Math.floor(noise(y, 0, 8501) * 10);
    for (let x = cx - 9; x < cx - 9 + len; x++) {
      if (x >= 0 && x < S) t[y * S + x] = rgba(35, 35, 35);
    }
  }

  for (let y = 20; y < 42; y++) {
    if (y % 3 === 0) t[y * S + cx] = rgba(150, 20, 35);
  }
  return t;
}

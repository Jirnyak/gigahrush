/* ── Pechateed: document eater, smells notes and keys ────────── */

import { FloorLevel, MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.PECHATEED,
  name: 'Печатеед',
  hp: 55,
  speed: 1.7,
  dmg: 9,
  attackRate: 1.35,
  sprite: 0,
  aiFlags: ['documentHunter'],
  floors: [FloorLevel.MINISTRY, FloorLevel.LIVING, FloorLevel.KVARTIRY],
  counterplay: 'Сбросьте лишние записки/ключи или держите дистанцию: он выбирает носителей бумаг.',
  lootHint: 'испорченные бумаги, чернила',
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;

  for (let y = 8; y < 56; y++) {
    const halfW = y < 20 ? 9 : y < 44 ? 12 : 8;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      if (x < 0 || x >= S) continue;
      const fold = (Math.floor((x + y) / 5) & 1) ? -12 : 10;
      const n = noise(x, y, 8300) * 18;
      t[y * S + x] = rgba(clamp(185 + n + fold), clamp(172 + n + fold), clamp(135 + n + fold));
    }
  }

  for (let y = 18; y < 45; y += 4) {
    for (let x = cx - 9; x < cx + 9; x++) {
      if ((x + y) % 5 === 0) t[y * S + x] = rgba(40, 25, 20);
    }
  }

  for (let x = cx - 8; x <= cx + 8; x++) t[31 * S + x] = rgba(80, 10, 10);
  t[21 * S + (cx - 4)] = rgba(20, 10, 8);
  t[21 * S + (cx + 4)] = rgba(20, 10, 8);
  return t;
}

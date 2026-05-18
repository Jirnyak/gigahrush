/* ── Nelyud: false human, attacks only at close distance ─────── */

import { FloorLevel, MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../render/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.NELYUD,
  name: 'Нелюдь',
  hp: 80,
  speed: 1.8,
  dmg: 18,
  attackRate: 1.4,
  sprite: 0,
  aiFlags: ['closeReveal'],
  floors: [FloorLevel.LIVING, FloorLevel.KVARTIRY, FloorLevel.MINISTRY],
  counterplay: 'Проверяйте дистанцией: нелюдь не раскрывается, пока не подпустить близко.',
  lootHint: 'поддельные бытовые вещи',
};

export function generateSprite(): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S / 2;

  for (let y = 5; y < 18; y++) for (let x = cx - 5; x <= cx + 5; x++) {
    const dx = (x - cx) / 5;
    const dy = (y - 11) / 7;
    if (dx * dx + dy * dy < 1) {
      const n = noise(x, y, 8600) * 18;
      t[y * S + x] = rgba(clamp(145 + n), clamp(120 + n), clamp(105 + n));
    }
  }

  for (let y = 18; y < 46; y++) {
    const halfW = y < 24 ? 8 : 7;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      if (x < 0 || x >= S) continue;
      const cloth = noise(x, y, 8601) > 0.45;
      t[y * S + x] = cloth ? rgba(65, 72, 85) : rgba(55, 55, 60);
    }
  }

  for (let y = 46; y < 60; y++) {
    t[y * S + (cx - 3)] = rgba(35, 35, 38);
    t[y * S + (cx + 3)] = rgba(35, 35, 38);
  }

  t[11 * S + (cx - 2)] = rgba(20, 20, 20);
  t[11 * S + (cx + 2)] = rgba(20, 20, 20);
  t[14 * S + cx] = rgba(160, 20, 30);
  return t;
}

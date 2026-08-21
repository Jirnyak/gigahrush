/* ── Логово: неубиваемый источник лесного лагеря ─────────────────
 *   Дыра в толще бетона за лесным карманом, из которой лезет местная
 *   живность. Стороны у логова нет и быть не должно: приплод остаётся
 *   обычной экологией, враждебной и обеим командам, и игроку.
 *
 *   Неубиваемость держится не хитами, а геометрией — генератор ставит
 *   логово ВНУТРЬ скалы, куда нет ни прохода, ни линии выстрела. Это
 *   местная идиома (защищённые комнаты, гермостены), а не крутка чисел:
 *   магическое число хитов пришлось бы поддерживать в каждой ветке урона.
 */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../core/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.LOGOVO,
  name: 'Логово',
  hp: 200,
  speed: 0,
  dmg: 6,
  attackRate: 3.0,
  sprite: 0,
  source: {
    // Обитатели — существующая экология глубины. Ни один не «roamer»,
    // поэтому выводок топчется у своего кармана, а не уходит на линии.
    childKinds: [MonsterKind.SHADOW, MonsterKind.POLZUN, MonsterKind.KRYSNOZHKA, MonsterKind.TVAR],
    cooldownSec: 90,
    cap: 3,
    childName: 'Лесной житель',
  },
  counterplay: 'Лагерь не вычищается насовсем: логово в скале не достать. Берите добычу и уходите, пока не собралась новая тройка.',
  lootHint: 'ничего: логово в камне, добыча остаётся на его жильцах',
};

export function generateSprite(): Uint32Array {
  return generateLogovoSprite(0);
}

function put(t: Uint32Array, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  t[y * S + x] = rgba(r, g, b, a);
}

export function generateLogovoSprite(seed: number): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const cx = S >> 1;

  // Кусок скалы во всю плитку: логово — часть стены, а не существо.
  for (let y = 8; y < 62; y++) {
    const half = 24 - Math.abs(34 - y) * 0.22;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const n = noise(x, y, seed + 101) * 34 - 14;
      const dx = Math.abs(x - cx) / half;
      put(t, x, y, clamp(74 + n - dx * 20), clamp(70 + n - dx * 20), clamp(66 + n - dx * 20));
    }
  }

  // Трещины по камню — читается как порода, а не как бетонный блок.
  for (let i = 0; i < 9; i++) {
    let x = cx - 18 + Math.floor(noise(i, 3, seed + 111) * 36);
    let y = 12 + Math.floor(noise(i, 4, seed + 112) * 40);
    for (let s = 0; s < 14; s++) {
      put(t, x, y, 44, 42, 40, 220);
      x += noise(i, s, seed + 113) > 0.5 ? 1 : -1;
      y += 1;
    }
  }

  // Устье: тёмный зев с тёплым нутром, из которого выходит выводок.
  for (let y = 26; y < 54; y++) {
    const half = 11 - Math.abs(40 - y) * 0.3;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const d = Math.hypot((x - cx) / half, (y - 40) / 14);
      if (d > 1) continue;
      const glow = Math.max(0, 1 - d);
      put(t, x, y, clamp(18 + glow * 96), clamp(14 + glow * 44), clamp(12 + glow * 30));
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    put(t, Math.round(cx + Math.cos(a) * 9), Math.round(40 + Math.sin(a) * 12), 96, 88, 78, 240);
  }

  return t;
}

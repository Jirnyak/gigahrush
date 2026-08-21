/* ── Боец: идущий по линии крип ──────────────────────────────────
 *   Выходит из гнезда и идёт к чужому гнезду. Своего кода движения у
 *   него нет: гнездо ставит ему `ai.homeRoomId` на ВРАЖЕСКУЮ комнату, а
 *   территориальный режим стаи (`pack.mode: 'territorial'`) сам ведёт
 *   монстра к дому, стоит тому отойти дальше поводка. Линия — это
 *   геометрия этажа, других проходов на карте нет.
 *
 *   Сторона — младший бит спрайтового сида, как у башни и гнезда.
 */

import { MonsterKind } from '../core/types';
import type { MonsterDef } from './monster';
import { S, rgba, noise, clamp, CLEAR } from '../core/pixutil';

export const DEF: MonsterDef = {
  kind: MonsterKind.BOEC,
  name: 'Боец',
  hp: 46,
  speed: 1.05,
  dmg: 9,
  attackRate: 1.0,
  sprite: 0,
  aiFlags: ['melee', 'sided'],
  counterplay: 'Боец идёт по линии и не сворачивает: уступите линию чужой стороне или встречайте его в узком месте.',
  lootHint: 'паёк линии, гильзы, обломок нашивки',
};

export function generateSprite(): Uint32Array {
  return generateBoecSprite(0);
}

function put(t: Uint32Array, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  t[y * S + x] = rgba(r, g, b, a);
}

function limb(t: Uint32Array, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, w: number): void {
  const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const x = Math.round(x0 + (x1 - x0) * k);
    const y = Math.round(y0 + (y1 - y0) * k);
    for (let d = -w; d <= w; d++) put(t, x + d, y, r, g, b);
  }
}

export function generateBoecSprite(seed: number): Uint32Array {
  const t = new Uint32Array(S * S).fill(CLEAR);
  const wild = (seed & 1) === 1;
  const cx = S >> 1;

  const cr = wild ? 92 : 62;
  const cg = wild ? 74 : 76;
  const cb = wild ? 50 : 96;
  const mr = wild ? 194 : 104;
  const mg = wild ? 88 : 170;
  const mb = wild ? 42 : 220;

  // Ноги в шаге: силуэт должен читаться идущим даже одним кадром.
  const stride = 3 + Math.floor(noise(seed, 1, 71) * 3);
  limb(t, cx - 2, 42, cx - 3 - stride, 60, clamp(cr - 16), clamp(cg - 16), clamp(cb - 16), 2);
  limb(t, cx + 2, 42, cx + 3 + stride, 60, clamp(cr - 24), clamp(cg - 24), clamp(cb - 24), 2);

  // Корпус с цветной перевязью стороны.
  for (let y = 22; y < 44; y++) {
    const half = 7.5 - Math.abs(33 - y) * 0.1;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const shade = Math.abs(x - cx) * 4;
      const n = noise(x, y, seed + 81) * 24;
      put(t, x, y, clamp(cr + n - shade), clamp(cg + n - shade), clamp(cb + n - shade));
    }
  }
  for (let i = 0; i < 18; i++) {
    const y = 24 + i;
    put(t, cx - 5 + Math.floor(i * 0.5), y, mr, mg, mb, 240);
    put(t, cx - 4 + Math.floor(i * 0.5), y, clamp(mr - 30), clamp(mg - 30), clamp(mb - 30), 240);
  }

  // Руки: одна прижата, вторая с коротким дрыном вперёд.
  limb(t, cx - 6, 25, cx - 10, 38, clamp(cr - 10), clamp(cg - 10), clamp(cb - 10), 1);
  limb(t, cx + 6, 25, cx + 11, 33, clamp(cr - 10), clamp(cg - 10), clamp(cb - 10), 1);
  limb(t, cx + 11, 33, cx + 16, 26, 118, 106, 88, 1);

  // Голова с глухим забралом — лиц у линии нет.
  for (let y = 10; y < 24; y++) {
    for (let x = cx - 6; x <= cx + 6; x++) {
      const d = Math.hypot((x - cx) / 5.6, (y - 17) / 7);
      if (d > 1) continue;
      const n = noise(x, y, seed + 91) * 22;
      put(t, x, y, clamp(cr + 20 + n), clamp(cg + 20 + n), clamp(cb + 20 + n));
    }
  }
  for (let x = cx - 3; x <= cx + 3; x++) put(t, x, 17, clamp(mr * 0.8), clamp(mg * 0.8), clamp(mb * 0.8), 245);
  put(t, cx + 2, 17, clamp(mr + 30), clamp(mg + 30), clamp(mb + 30));

  return t;
}

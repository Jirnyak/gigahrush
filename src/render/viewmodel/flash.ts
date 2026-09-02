/**
 * Дульная вспышка.
 *
 * Одна картинка на всю игру: форма у вспышки общая, а цвет приносит квад из
 * акцента ствола — энергетика бьёт бирюзой, порох жёлтым. Держать по вспышке на
 * каждый ствол значило бы платить кэшем за то, что решается умножением.
 */

import { CLEAR, clamp, noise, rgba } from '../../core/pixutil';
import { VM } from './types';

let cached: Uint32Array | undefined;

/** Ключ кэша текстуры вспышки. Стабилен: картинка одна. */
export const MUZZLE_FLASH_KEY = 'viewmodel:flash';

export function muzzleFlashSprite(): Uint32Array {
  if (cached) return cached;
  const buf = new Uint32Array(VM * VM).fill(CLEAR);
  const c = VM * 0.5;
  const core = VM * 0.13;
  for (let y = 0; y < VM; y++) {
    for (let x = 0; x < VM; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      // Звезда, а не пятно: четыре луча по диагонали корпуса плюс горячее ядро.
      const a = Math.atan2(dy, dx);
      const spikes = 0.58 + 0.42 * Math.abs(Math.cos(a * 2));
      const reach = core * (1.9 + spikes * 3.4);
      if (d > reach) continue;
      const t = 1 - d / reach;
      const grain = 0.82 + noise(x, y, 91) * 0.36;
      const i = Math.pow(t, 1.7) * grain;
      if (i <= 0.02) continue;
      buf[y * VM + x] = rgba(clamp(255 * i), clamp(238 * i), clamp(196 * i), clamp(255 * Math.min(1, i * 1.35)));
    }
  }
  cached = buf;
  return buf;
}


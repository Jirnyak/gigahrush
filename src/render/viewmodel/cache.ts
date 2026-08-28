/**
 * Откуда берётся картинка руки и почему её не считают каждый кадр.
 *
 * Порядок разрешения тот же, что у спрайтов сущностей: сначала запечённый арт
 * художника, потом собственный пакет вещи, потом пакет её силуэта. Промах на
 * каждом шаге — это ПУСТОЙ результат, а не ветка `if (есть арт)`: пакет,
 * который ничего не нарисовал, откатывается сам, и отсутствие ассета никогда не
 * стирает вещь из рук.
 */

import { CLEAR } from '../../core/pixutil';
import { hashSeed, seededRandom } from '../../core/rand';
import { viewmodelArchetype } from './archetype';
import { viewmodelBuffer } from './draw';
import { getGeneratedViewmodelFrame, GENERATED_VIEWMODEL_SIDE } from './generated_frames';
import { viewmodelDef, viewmodelResolveFrame } from './registry';
import { viewmodelSkin } from './skin';
import { VM } from './types';
import type { ViewmodelFrameKey, ViewmodelSlot } from './types';

/** Спрайтов в кэше. В руках одновременно две вещи, ещё одна уезжает при смене. */
const CACHE_MAX = 48;
const CACHE_TARGET = 36;

interface CacheEntry {
  sprite: Uint32Array | undefined;
  usedAt: number;
}

const CACHE = new Map<string, CacheEntry>();
let clock = 0;

function trim(): void {
  if (CACHE.size <= CACHE_MAX) return;
  const keys = [...CACHE.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
  for (let i = 0; i < keys.length && CACHE.size > CACHE_TARGET; i++) CACHE.delete(keys[i][0]);
}

/**
 * Какой пакет отвечает за вещь в этой руке.
 *
 * Собственный пакет вещи сильнее силуэта: так ствол получает право на свою
 * картинку, не заводя новый архетип и не трогая соседей.
 */
export function viewmodelDefIdFor(slot: ViewmodelSlot, itemId: string | undefined): string | undefined {
  /* Силуэт спрашивается ПЕРВЫМ, хотя решает не он: без него `generate` всё
   * равно не сможет собрать облик, и две функции понимали бы «годный пакет»
   * по-разному — одна возвращала бы имя, вторая по нему ничего не рисовала. */
  const archetype = viewmodelArchetype(slot, itemId);
  if (!archetype) return undefined;
  const own = itemId ? viewmodelDef(itemId) : undefined;
  if (own && own.slot === slot) return own.id;
  const byArchetype = viewmodelDef(archetype);
  return byArchetype && byArchetype.slot === slot ? byArchetype.id : undefined;
}

function generate(slot: ViewmodelSlot, itemId: string, defId: string, frame: ViewmodelFrameKey): Uint32Array | undefined {
  // Арт художника сильнее любой процедуры и берётся как есть, без нормализации:
  // у вьюмодели положение в кадре несёт смысл, обрезать её нельзя.
  const art = getGeneratedViewmodelFrame(`${itemId}:${frame}`);
  if (art && art.length === VM * VM && GENERATED_VIEWMODEL_SIDE === VM) return art;

  const def = viewmodelDef(defId);
  if (!def) return undefined;
  const archetype = viewmodelArchetype(slot, itemId);
  if (!archetype) return undefined;

  const buf = viewmodelBuffer();
  def.draw({
    buf,
    frame: viewmodelResolveFrame(defId, frame),
    skin: viewmodelSkin(archetype, itemId),
    rand: seededRandom(hashSeed(itemId, 0x11ee)),
  });
  // Пакет, не написавший ни пикселя, считается несуществующим — это и есть
  // откат по пустому результату.
  for (let i = 0; i < buf.length; i++) if (buf[i] !== CLEAR) return buf;
  return undefined;
}

/** Картинка вещи в руке. Считается один раз на пару «вещь + кадр». */
export function viewmodelSprite(
  slot: ViewmodelSlot,
  itemId: string | undefined,
  frame: ViewmodelFrameKey,
): Uint32Array | undefined {
  const defId = viewmodelDefIdFor(slot, itemId);
  if (!defId) return undefined;
  const key = `${slot}|${itemId ?? ''}|${defId}|${frame}`;
  const hit = CACHE.get(key);
  if (hit) { hit.usedAt = ++clock; return hit.sprite; }
  const sprite = generate(slot, itemId ?? '', defId, frame);
  CACHE.set(key, { sprite, usedAt: ++clock });
  trim();
  return sprite;
}

/** Сбросить процедурные картинки: смена этажа, пересборка визуала, тесты. */
export function resetViewmodelSpriteCache(): void {
  CACHE.clear();
  clock = 0;
}

/** Размер кэша для отладочных панелей. */
export function viewmodelSpriteCacheSize(): number {
  return CACHE.size;
}

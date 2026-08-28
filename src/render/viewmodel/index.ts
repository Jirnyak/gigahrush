/**
 * Вьюмодель: точка сборки и весь публичный вход.
 *
 * Импорты ниже — побочный эффект регистрации: пакет существует ровно потому,
 * что он здесь перечислен. Пакеты равнозначны и намеренно повторяют друг друга;
 * сливать их в общий генератор нельзя — перекрасить дробовик, задев пилу, было
 * бы регрессом модульности, а не экономией строк.
 */

import './defs/bare_hands';
import './defs/blade';
import './defs/blunt';
import './defs/chainsaw';
import './defs/energy';
import './defs/flamer';
import './defs/flashlight';
import './defs/launcher';
import './defs/lighter';
import './defs/machinegun';
import './defs/pistol';
import './defs/polearm';
import './defs/psi_hand';
import './defs/rifle';
import './defs/shotgun';
import './defs/smg';
import './defs/thrown';
import './defs/tool_generic';
import './defs/uv_spotlight';

export { viewmodelArchetype, type ViewmodelArchetype } from './archetype';
export { resetViewmodelSpriteCache, viewmodelDefIdFor, viewmodelSprite, viewmodelSpriteCacheSize } from './cache';
export { createViewmodelPass, type ViewmodelPassContext, type ViewmodelPassHandle } from './pass';
export { registerViewmodel, viewmodelDef, viewmodelDefIds, viewmodelDefsForSlot } from './registry';
export { resetViewmodelRuntime, updateViewmodel, viewmodelFrame, type ViewmodelUpdate } from './runtime';
export { viewmodelSkin } from './skin';
export { VM, type ViewmodelDef, type ViewmodelFrameState, type ViewmodelSkin, type ViewmodelSlot } from './types';

import { resetViewmodelSpriteCache } from './cache';
import { resetViewmodelRuntime } from './runtime';

/** Сброс всего недолговечного: смена этажа, пересборка визуала, потеря контекста. */
export function resetViewmodel(): void {
  resetViewmodelSpriteCache();
  resetViewmodelRuntime();
}

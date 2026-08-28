/**
 * Реестр пакетов вьюмодели.
 *
 * Реестр не знает ни одного ствола по имени. Он знает только идентификаторы, а
 * кто под каким идентификатором зарегистрирован — дело самих пакетов, которые
 * подключаются побочным эффектом из `index.ts`.
 */

import type { ViewmodelDef, ViewmodelFrameKey, ViewmodelSlot } from './types';
import { VIEWMODEL_BASE_FRAME } from './types';

const DEFS = new Map<string, ViewmodelDef>();

const ID_RE = /^[a-z0-9_]+$/;

/** Регистрация пакета. Дубликат и кривой идентификатор — ошибка сборки контента. */
export function registerViewmodel(def: ViewmodelDef): void {
  if (!ID_RE.test(def.id)) throw new Error(`viewmodel: bad id "${def.id}"`);
  if (DEFS.has(def.id)) throw new Error(`viewmodel: duplicate id "${def.id}"`);
  if (!def.frames.includes(VIEWMODEL_BASE_FRAME)) {
    throw new Error(`viewmodel "${def.id}": no "${VIEWMODEL_BASE_FRAME}" frame`);
  }
  DEFS.set(def.id, def);
}

/** Пакет по идентификатору. */
export function viewmodelDef(id: string | undefined): ViewmodelDef | undefined {
  return id ? DEFS.get(id) : undefined;
}

/** Все зарегистрированные идентификаторы. Для тестов и отладочных панелей. */
export function viewmodelDefIds(): string[] {
  return [...DEFS.keys()].sort();
}

/** Есть ли у пакета такой кадр; иначе зовущий обязан откатиться на `idle`. */
export function viewmodelHasFrame(id: string, frame: ViewmodelFrameKey): boolean {
  const def = DEFS.get(id);
  return !!def && def.frames.includes(frame);
}

/** Кадр, который пакет реально нарисует по запросу. */
export function viewmodelResolveFrame(id: string, frame: ViewmodelFrameKey): ViewmodelFrameKey {
  return viewmodelHasFrame(id, frame) ? frame : VIEWMODEL_BASE_FRAME;
}

/** Пакеты одной руки. Для тестов покрытия. */
export function viewmodelDefsForSlot(slot: ViewmodelSlot): ViewmodelDef[] {
  return [...DEFS.values()].filter((d) => d.slot === slot);
}

/** Только для тестов: снести реестр между прогонами. */
export function _resetViewmodelRegistry(): void {
  DEFS.clear();
}

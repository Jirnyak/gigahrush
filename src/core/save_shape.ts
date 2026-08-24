/* ── Версия формы браузерного сейва ──────────────────────────────
 *
 * Лист без единой зависимости: константа и чистая проверка версии. Раньше они
 * жили в `systems/save_runtime.ts` вместе со сборкой всего payload, и любой, кому
 * нужно было только число, тянул за собой пол-рантайма. Ровно так `platform_bridge`
 * держал рантайм-цикл на 70 файлов: ему нужны отсюда две строчки, а приезжал
 * весь save_runtime с A-Life, экономикой, производством и редактором карты.
 *
 * Поддерживается ТОЛЬКО текущая форма. Ломающая правда о персистентности —
 * это бамп числа и явный отказ старому сейву, а не миграция (см. `save.md`).
 */

export const SAVE_SHAPE_VERSION = 26;

export type SaveShapeVersionStatus = 'missing' | 'old' | 'current' | 'newer' | 'invalid';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function saveShapeVersionStatus(input: unknown): SaveShapeVersionStatus {
  if (!isRecord(input)) return 'invalid';
  const version = input.version;
  if (version === undefined) return 'missing';
  if (typeof version !== 'number' || !Number.isFinite(version)) return 'invalid';
  const normalized = Math.floor(version);
  if (normalized !== version || normalized < 0) return 'invalid';
  if (normalized < SAVE_SHAPE_VERSION) return 'old';
  if (normalized > SAVE_SHAPE_VERSION) return 'newer';
  return 'current';
}

export function saveShapeVersionSupported(input: unknown): boolean {
  return saveShapeVersionStatus(input) === 'current';
}

/* ── Отображаемые имена и цвета этажей по тематическому тегу ──────
 * Чистые словари: ни генерации, ни рантайма. Лежат в data/, потому что
 * их читают и systems/ (контракты, каталог этажей, самосбор), и gen/.
 */

export const FLOOR_NAMES: Record<string, string> = {
  'ministry': 'Министерство',
  'kvartiry': 'Квартиры',
  'living': 'Жилая зона',
  'maintenance': 'Коллекторы',
  'hell': 'Мясной низ',
  'void': 'Пустота',
};

export function floorLevelDisplayName(themeTags?: readonly string[]): string {
  if (!themeTags || themeTags.length === 0) return 'Неизвестно';
  for (const tag of themeTags) {
    if (FLOOR_NAMES[tag]) return FLOOR_NAMES[tag];
  }
  return themeTags[0];
}

export const FLOOR_MESSAGE_COLORS: Record<string, string> = {
  'ministry': '#fc4',
  'kvartiry': '#fa4',
  'living': '#4af',
  'maintenance': '#4af',
  'hell': '#f44',
  'void': '#0f8',
};

export interface UiElementDef {
  id: string;
  group: string;
  label: string;
  defaultEnabled: boolean;
  locked?: boolean;
}

export const UI_ELEMENT_DEFS = [
  { id: 'bottom_tabs', group: 'Основа', label: 'Нижние табы', defaultEnabled: true, locked: false },
  { id: 'weapon_panel', group: 'Бой', label: 'Оружие и инструмент', defaultEnabled: true, locked: false },
  { id: 'crosshair', group: 'Бой', label: 'Прицел, цель, попадания', defaultEnabled: true, locked: false },
  { id: 'interaction_prompt', group: 'Бой', label: 'Подсказка действия', defaultEnabled: true, locked: false },
  { id: 'damage_feedback', group: 'Опасность', label: 'Урон и сон', defaultEnabled: true, locked: true },
  { id: 'hazard_warning', group: 'Опасность', label: 'Предупреждения угроз', defaultEnabled: true, locked: false },
  { id: 'messages', group: 'Инфо', label: 'Стенографическая сводка', defaultEnabled: false, locked: false },
  { id: 'location_panel', group: 'Инфо', label: 'Время, зона, комната', defaultEnabled: false, locked: false },
  { id: 'minimap', group: 'Карта', label: 'Миникарта', defaultEnabled: true, locked: false },
  { id: 'route_hints', group: 'Навигация', label: 'Маршрут и VOID', defaultEnabled: false, locked: false },
  { id: 'caravan_hints', group: 'Навигация', label: 'Караванные метки', defaultEnabled: false, locked: false },
  { id: 'status_hints', group: 'Состояние', label: 'Статусы и мутации', defaultEnabled: false, locked: false },
  { id: 'anomaly_hints', group: 'Аномалии', label: 'Смог и аномальные индикаторы', defaultEnabled: false, locked: false },
  { id: 'screen_fx', group: 'Экран', label: 'Нейрошум и помехи', defaultEnabled: false, locked: false },
  { id: 'samosbor_text', group: 'Системное', label: 'Текст самосбора', defaultEnabled: true, locked: true },
  { id: 'credits', group: 'Системное', label: 'Титры и финальные экраны', defaultEnabled: true, locked: true },
] as const satisfies readonly UiElementDef[];

export type UiElementId = typeof UI_ELEMENT_DEFS[number]['id'];
type UiSettings = Record<UiElementId, boolean>;

export interface UiPresetDef {
  id: string;
  label: string;
  hint: string;
  enabled: readonly UiElementId[];
}

export const UI_PRESETS = [
  {
    id: 'novice',
    label: 'Новичок',
    hint: 'Первый запуск: бой, угрозы, миникарта и чистый экран.',
    enabled: [
      'bottom_tabs',
      'weapon_panel',
      'crosshair',
      'interaction_prompt',
      'damage_feedback',
      'hazard_warning',
      'minimap',
    ],
  },
  {
    id: 'minimal',
    label: 'Минимум',
    hint: 'Нижние показатели, действие и базовая опасность.',
    enabled: [
      'bottom_tabs',
      'interaction_prompt',
      'damage_feedback',
      'hazard_warning',
      'minimap',
    ],
  },
  {
    id: 'combat',
    label: 'Бой',
    hint: 'Оружие, прицел, попадания, урон и ближайшие угрозы.',
    enabled: [
      'bottom_tabs',
      'weapon_panel',
      'crosshair',
      'interaction_prompt',
      'damage_feedback',
      'hazard_warning',
      'messages',
      'minimap',
    ],
  },
  {
    id: 'route',
    label: 'Маршрут',
    hint: 'Лифты, маршрутные подсказки и базовая карта.',
    enabled: [
      'bottom_tabs',
      'interaction_prompt',
      'damage_feedback',
      'hazard_warning',
      'messages',
      'minimap',
      'route_hints',
    ],
  },
  {
    id: 'full',
    label: 'Полный',
    hint: 'Все игровые поверхности кроме отладки.',
    enabled: [
      'bottom_tabs',
      'weapon_panel',
      'crosshair',
      'interaction_prompt',
      'damage_feedback',
      'hazard_warning',
      'messages',
      'location_panel',
      'minimap',
      'route_hints',
      'caravan_hints',
      'status_hints',
      'anomaly_hints',
      'screen_fx',
    ],
  },
] as const satisfies readonly UiPresetDef[];

export type UiPresetId = typeof UI_PRESETS[number]['id'];
export const DEFAULT_UI_PRESET_ID: UiPresetId = 'novice';

export type UiSettingsRow =
  | { kind: 'preset'; preset: typeof UI_PRESETS[number] }
  | { kind: 'element'; element: typeof UI_ELEMENT_DEFS[number] };

const UI_STORAGE_KEY = 'gigahrush_ui_orchestrator_v6';

const defsById = new Map<UiElementId, typeof UI_ELEMENT_DEFS[number]>(
  UI_ELEMENT_DEFS.map(def => [def.id, def]),
);
const presetsById = new Map<UiPresetId, typeof UI_PRESETS[number]>(
  UI_PRESETS.map(preset => [preset.id, preset]),
);

let settings = loadUiSettings();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function settingsFromEnabledIds(enabledIds: readonly UiElementId[]): UiSettings {
  const enabled = new Set<UiElementId>(enabledIds);
  const out = {} as UiSettings;
  for (const def of UI_ELEMENT_DEFS) out[def.id] = def.locked || enabled.has(def.id);
  return out;
}

function defaultUiSettings(): UiSettings {
  return settingsFromEnabledIds(presetsById.get(DEFAULT_UI_PRESET_ID)?.enabled ?? []);
}

function normalizeUiSettings(raw: unknown): UiSettings {
  const out = defaultUiSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const def of UI_ELEMENT_DEFS) {
    if (def.locked) {
      out[def.id] = true;
      continue;
    }
    const value = src[def.id];
    if (typeof value === 'boolean') out[def.id] = value;
  }
  return out;
}

function loadUiSettings(): UiSettings {
  const s = storage();
  if (!s) return defaultUiSettings();
  try {
    return normalizeUiSettings(JSON.parse(s.getItem(UI_STORAGE_KEY) ?? 'null'));
  } catch {
    return defaultUiSettings();
  }
}

function saveUiSettings(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(UI_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The in-memory settings still apply if browser storage is blocked.
  }
}

export function uiElementEnabled(id: UiElementId): boolean {
  const def = defsById.get(id);
  if (def?.locked) return true;
  return settings[id] ?? def?.defaultEnabled ?? false;
}

export function normalizeVisibleMapMode(current: number, minimapEnabled = uiElementEnabled('minimap')): number {
  const mode = Math.floor(current);
  if (mode === 2) return 2;
  if (mode === 1 && minimapEnabled) return 1;
  return 0;
}

export function nextVisibleMapMode(current: number, minimapEnabled = uiElementEnabled('minimap')): number {
  const modes = minimapEnabled ? [0, 1, 2] : [0, 2];
  const normalized = normalizeVisibleMapMode(current, minimapEnabled);
  const idx = modes.indexOf(normalized);
  return modes[(idx + 1) % modes.length] ?? 0;
}

export function setUiElementEnabled(id: UiElementId, enabled: boolean): boolean {
  const def = defsById.get(id);
  if (!def) return false;
  if (def.locked) {
    settings[id] = true;
    saveUiSettings();
    return true;
  }
  settings[id] = enabled;
  saveUiSettings();
  return settings[id];
}

export function toggleUiElement(id: UiElementId): boolean {
  return setUiElementEnabled(id, !uiElementEnabled(id));
}

export function resetUiElement(id: UiElementId): boolean {
  const def = defsById.get(id);
  if (!def) return false;
  settings[id] = def.locked ? true : def.defaultEnabled;
  saveUiSettings();
  return settings[id];
}

export function resetUiSettings(): void {
  settings = defaultUiSettings();
  saveUiSettings();
}

export function applyUiPreset(id: UiPresetId): boolean {
  const preset = presetsById.get(id);
  if (!preset) return false;
  settings = settingsFromEnabledIds(preset.enabled);
  saveUiSettings();
  return true;
}

export function activeUiPresetId(): UiPresetId | undefined {
  for (const preset of UI_PRESETS) {
    const enabled = new Set<UiElementId>(preset.enabled);
    let matches = true;
    for (const def of UI_ELEMENT_DEFS) {
      if (def.locked) continue;
      if (uiElementEnabled(def.id) !== enabled.has(def.id)) {
        matches = false;
        break;
      }
    }
    if (matches) return preset.id;
  }
  return undefined;
}

export function uiSettingsRowCount(): number {
  return UI_PRESETS.length + UI_ELEMENT_DEFS.length;
}

export function uiSettingsRowAt(index: number): UiSettingsRow | undefined {
  if (index < 0) return undefined;
  if (index < UI_PRESETS.length) return { kind: 'preset', preset: UI_PRESETS[index] };
  const element = UI_ELEMENT_DEFS[index - UI_PRESETS.length];
  return element ? { kind: 'element', element } : undefined;
}

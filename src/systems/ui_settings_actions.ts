/* ── Применение выбранной строки настроек ─────────────────────────
 *
 * Игрок выбрал строку в настройках UI или в легенде карты — здесь она
 * превращается в переключение и в сообщение об этом. Настройки хранит
 * `ui_orchestrator`, строки перечисляет он же; тут только развилка «какая
 * строка — что дёрнуть — что сказать».
 *
 * Жило в `main.ts`. Точка входа владеет циклом кадра, DOM-ручками и панелями, а
 * не текстом «Помехи экрана: слабые»; из всего кластера меню наружу выносится
 * ровно этот кусок, потому что он замкнут: `GameState` для сообщений и вызовы
 * `ui_orchestrator`, ничего из `main.ts`. Открытие/закрытие панелей, тап-слой и
 * удержание прокрутки остались там же, где живут `hudCanvas`, `syncPauseState`
 * и остальные панели.
 *
 * Отдельный лист, а не метод `ui_orchestrator`, ради одного шва: `systems/audio`
 * импортирует `ui_orchestrator`, и вызов `syncAudioSettings()` отсюда замкнул бы
 * их в цикл.
 */
import { msg, type GameState } from '../core/types';
import { syncAudioSettings } from './audio';
import {
  adjustCameraFov,
  adjustMobileLookSensitivity,
  adjustMusicVolume,
  adjustSfxVolume,
  applyUiPreset,
  cycleHudMotionMode,
  cycleLightingQualityMode,
  cycleScreenInterferenceMode,
  cycleVisualGeometryMode,
  lightingQualityModeLabel,
  mapLegendRowAt,
  resetAudioSettings,
  resetGraphicsSettings,
  resetMapLegendSettings,
  resetUiSettings,
  toggleAutoPickup,
  toggleCrittersEnabled,
  toggleMapHighContrast,
  toggleMapLegendToggle,
  toggleMasterAudioEnabled,
  toggleUiElement,
  uiSettingsRowAt,
  visualGeometryModeLabel,
} from './ui_orchestrator';

/** `dir` — знак шага для строк со шкалой (громкость, FOV, чувствительность). */
export function applyUiSettingsSelection(state: GameState, index: number, dir = 1): void {
  const row = uiSettingsRowAt(index, state.uiSettingsView);
  if (!row) return;
  if (row.kind === 'reset_interface') {
    resetUiSettings();
    state.msgs.push(msg('UI сброшен: Новичок', state.time, '#8cf'));
    return;
  }
  if (row.kind === 'reset_graphics') {
    resetGraphicsSettings();
    state.msgs.push(msg('Графика сброшена: FOV 90°, помехи критично, HUD меньше движения, 3D высокая', state.time, '#8cf'));
    return;
  }
  if (row.kind === 'reset_audio') {
    resetAudioSettings();
    syncAudioSettings();
    state.msgs.push(msg('Аудио сброшено по умолчанию', state.time, '#8cf'));
    return;
  }
  if (row.kind === 'master_audio') {
    const enabled = toggleMasterAudioEnabled();
    syncAudioSettings();
    state.msgs.push(msg(`ОБЩИЙ ЗВУК: ${enabled ? 'ВКЛ' : 'ВЫКЛ'}`, state.time, enabled ? '#8cf' : '#fc8'));
    return;
  }
  if (row.kind === 'music_volume') {
    const vol = adjustMusicVolume(dir);
    syncAudioSettings();
    state.msgs.push(msg(`Музыка: ${Math.round(vol * 100)}%`, state.time, '#8cf'));
    return;
  }
  if (row.kind === 'sfx_volume') {
    const vol = adjustSfxVolume(dir);
    syncAudioSettings();
    state.msgs.push(msg(`Эффекты: ${Math.round(vol * 100)}%`, state.time, '#8cf'));
    return;
  }
  if (row.kind === 'preset') {
    if (applyUiPreset(row.preset.id)) {
      state.msgs.push(msg(`UI пресет: ${row.preset.label}`, state.time, '#8cf'));
    }
    return;
  }
  if (row.kind === 'mobile_sensitivity') {
    const sensitivity = adjustMobileLookSensitivity(dir);
    state.msgs.push(msg(`Мобильный обзор: ${Math.round(sensitivity * 100)}%`, state.time, '#8cf'));
    return;
  }
  if (row.kind === 'camera_fov') {
    const fov = adjustCameraFov(dir);
    state.msgs.push(msg(`FOV: ${fov}°`, state.time, '#8cf'));
    return;
  }
  if (row.kind === 'screen_interference') {
    const mode = cycleScreenInterferenceMode(dir);
    const label = mode === 'off' ? 'выкл' : mode === 'full' ? 'полные' : 'слабые';
    state.msgs.push(msg(`Помехи экрана: ${label}`, state.time, mode === 'off' ? '#fc8' : '#8cf'));
    return;
  }
  if (row.kind === 'hud_motion') {
    const mode = cycleHudMotionMode();
    state.msgs.push(msg(`Движение HUD: ${mode === 'reduced' ? 'меньше' : 'норма'}`, state.time, '#8cf'));
    return;
  }
  if (row.kind === 'visual_geometry') {
    const mode = cycleVisualGeometryMode(dir);
    state.msgs.push(msg(`3D детализация: ${visualGeometryModeLabel(mode).toLowerCase()}`, state.time, mode === 'off' ? '#fc8' : '#8cf'));
    return;
  }
  if (row.kind === 'lighting_quality') {
    const mode = cycleLightingQualityMode(dir);
    state.msgs.push(msg(`Качество света: ${lightingQualityModeLabel(mode).toLowerCase()}`, state.time, mode === 'off' ? '#fc8' : '#8cf'));
    return;
  }
  if (row.kind === 'map_contrast') {
    const enabled = toggleMapHighContrast();
    state.msgs.push(msg(`Карта: контраст ${enabled ? 'вкл' : 'выкл'}`, state.time, enabled ? '#8cf' : '#fc8'));
    return;
  }
  if (row.kind === 'auto_pickup') {
    const enabled = toggleAutoPickup();
    state.msgs.push(msg(`Автоподбор предметов: ${enabled ? 'вкл' : 'выкл'}`, state.time, enabled ? '#8cf' : '#fc8'));
    return;
  }
  if (row.kind === 'critters') {
    const enabled = toggleCrittersEnabled();
    state.msgs.push(msg(`Живность: ${enabled ? 'вкл' : 'выкл'}`, state.time, enabled ? '#8cf' : '#fc8'));
    return;
  }
  if (row.kind === 'element') toggleUiElement(row.element.id);
}

export function applyMapLegendSelection(state: GameState, index: number): void {
  const row = mapLegendRowAt(index);
  if (!row) return;
  if (row.kind === 'reset_map_legend') {
    resetMapLegendSettings();
    state.msgs.push(msg('Легенда карты сброшена', state.time, '#8cf'));
    return;
  }
  if (row.kind === 'map_contrast') {
    const enabled = toggleMapHighContrast();
    state.msgs.push(msg(`Карта: контраст ${enabled ? 'вкл' : 'выкл'}`, state.time, enabled ? '#8cf' : '#fc8'));
    return;
  }
  const enabled = toggleMapLegendToggle(row.toggle.id);
  state.msgs.push(msg(`Карта: ${row.toggle.label} ${enabled ? 'вкл' : 'выкл'}`, state.time, enabled ? '#8cf' : '#fc8'));
}

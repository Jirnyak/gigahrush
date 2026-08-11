import { safeParseJson } from '../core/json';
import { SAVE_SHAPE_VERSION, saveShapeVersionStatus } from './save_runtime';
import { designFloorProfile } from '../data/design_floor_profiles';

type PauseChangeHandler = (paused: boolean) => void;

export const PORTAL_RAW_SAVE_LIMIT_BYTES = 190 * 1024;
export const GAMEPUSH_RAW_SAVE_LIMIT_BYTES = 900 * 1024;
export const GAMEPUSH_COMPACT_SAVE_THRESHOLD_BYTES = 64 * 1024;
export type PortalTarget = '' | 'yandex' | 'gamepush' | 'pikabu';
const LOCAL_SAVE_KEY = 'gigahrush_save';
const LOCAL_PORTAL_SAVE_TIME_KEY = 'gigahrush_portal_save_saved_at';
const GAMEPUSH_CALLBACK_NAME = 'onGPInit';
const GAMEPUSH_SDK_BASE_URL = 'https://gamepush.com/sdk/gamepush.js';
const GAMEPUSH_SDK_LOAD_TIMEOUT_MS = 8000;
const PORTAL_SAVE_RECORD_KIND = 'gigahrush-save';

interface PlatformBridgeOptions {
  onPauseChange?: PauseChangeHandler;
  onAudioMuteChange?: (muted: boolean) => void;
  onLanguageDetected?: (language: string) => void;
  /** Asked by the user-gesture progress sync when no local save exists yet:
   *  the game should write a real autosave synchronously (no-op outside an
   *  active run). Lets the sandbox probe push genuine progress even on a
   *  fresh profile. */
  requestLocalSave?: () => void;
}

type PlatformSaveStatus = 'queued' | 'no-sdk' | 'skipped-size' | 'failed';
type PlatformLoadStatus = 'loaded' | 'no-sdk' | 'missing' | 'invalid' | 'local-present' | 'failed';
type PortalSaveRecordMode = 'full' | 'compact';

export interface PlatformSaveCandidate {
  raw: string;
  bytes: number;
  mode?: PortalSaveRecordMode;
}

export interface PlatformLoadResult {
  status: PlatformLoadStatus;
  raw?: string;
  source?: 'gamepush' | 'yandex';
}

interface YandexPlayer {
  getData?(keys?: string[]): Promise<Record<string, unknown>>;
  setData?(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface YandexSdk {
  features?: {
    LoadingAPI?: { ready?(): void };
    GameplayAPI?: { start?(): void; stop?(): void };
  };
  getPlayer?(options?: { scopes?: boolean }): Promise<YandexPlayer>;
  on?(event: 'game_api_pause' | 'game_api_resume', handler: () => void): void;
}

interface YandexFactory {
  init(): Promise<YandexSdk>;
}

interface GamePushPlayer {
  ready?: Promise<void>;
  get?(key: string): string | number | boolean;
  set?(key: string, value: string | number | boolean): void;
  sync?(options?: { storage?: 'cloud' | 'preferred' | 'platform' | 'local' | string }): Promise<void>;
}

interface GamePushSounds {
  isMuted?: boolean;
  mute?(): void;
  unmute?(): void;
  on?(event: 'mute' | 'unmute', handler: () => void): void;
}

interface GamePushAds {
  showFullscreen?(): void | Promise<unknown>;
  isFullscreenAvailable?: boolean;
  isFullscreenPlaying?: boolean;
  isAdblockEnabled?: boolean;
  on?(event: 'fullscreen:start' | 'fullscreen:close', handler: (success?: boolean) => void): void;
}

interface GamePushAchievements {
  unlock?(options: { tag?: string; id?: number }): void | Promise<unknown>;
}

interface GamePushSdk {
  ready?: Promise<void>;
  player?: GamePushPlayer;
  language?: string;
  isDev?: boolean;
  sounds?: GamePushSounds;
  ads?: GamePushAds;
  achievements?: GamePushAchievements;
  gameStart?(): void | Promise<void>;
  gameReady?(): void;
  changeLanguage?(lang: string): void;
  gameplayStart?(): void | Promise<void>;
  gameplayStop?(): void | Promise<void>;
  on?(event: 'pause' | 'resume', handler: () => void): void;
}

type PortalGlobal = typeof globalThis & {
  YaGames?: YandexFactory;
  gp?: GamePushSdk;
  onGPInit?: (gp: GamePushSdk) => void;
};

interface GamePushConfig {
  projectId: string;
  publicToken: string;
}

interface PortalSaveRecord {
  kind: typeof PORTAL_SAVE_RECORD_KIND;
  recordVersion: 1;
  mode?: PortalSaveRecordMode;
  shapeVersion: number;
  savedAt: number;
  bytes: number;
  raw: string;
}

let bridgeOptions: PlatformBridgeOptions = {};
let yandexSdkPromise: Promise<YandexSdk | null> | null = null;
let gamePushSdkPromise: Promise<GamePushSdk | null> | null = null;
let yandexEventsBound = false;
let yandexReadySent = false;
let yandexGameplayActive = false;
let gamePushEventsBound = false;
let gamePushReadySent = false;
let gamePushGameStartSent = false;
let gamePushGameplayActive = false;
let cloudHydrateSettled = false;
let gestureProgressSynced = false;

function portalGlobal(): PortalGlobal {
  return globalThis as PortalGlobal;
}

export function normalizePortalTarget(value: string): PortalTarget {
  const clean = value.trim().toLowerCase();
  if (clean === 'yandex' || clean === 'ya') return 'yandex';
  if (clean === 'gamepush' || clean === 'gp') return 'gamepush';
  if (clean === 'pikabu' || clean === 'pikabu-games' || clean === 'pikabu_games') return 'pikabu';
  return '';
}

export function requestedPortalFromSearch(search: string): PortalTarget {
  try {
    return normalizePortalTarget(new URLSearchParams(search).get('portal') ?? '');
  } catch {
    return '';
  }
}

export function portalTargetFromSearchOrMeta(search: string, metaPortal = ''): PortalTarget {
  return requestedPortalFromSearch(search) || normalizePortalTarget(metaPortal);
}

function requestedPortal(): PortalTarget {
  const search = typeof location === 'undefined' ? '' : location.search;
  return portalTargetFromSearchOrMeta(search, metaContent('gigahrush-portal'));
}

function documentQuerySelector(selector: string): Element | null {
  if (typeof document === 'undefined') return null;
  const querySelector = (document as { querySelector?: unknown }).querySelector;
  if (typeof querySelector !== 'function') return null;
  try {
    const found = querySelector.call(document, selector);
    return found && typeof found === 'object' ? found as Element : null;
  } catch {
    return null;
  }
}

function metaContent(name: string): string {
  const meta = documentQuerySelector(`meta[name="${name}"]`);
  if (!meta || typeof meta !== 'object') return '';
  const content = (meta as { content?: unknown }).content;
  return typeof content === 'string' ? content.trim() : '';
}

export function gamePushConfigFromSearch(search: string): GamePushConfig | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const projectId = (
    params.get('gamepushProjectId') ??
    params.get('gpProjectId') ??
    params.get('gp_project_id') ??
    ''
  ).trim();
  const publicToken = (
    params.get('gamepushPublicToken') ??
    params.get('gpPublicToken') ??
    params.get('gp_public_token') ??
    ''
  ).trim();
  return projectId && publicToken ? { projectId, publicToken } : null;
}

function gamePushConfig(): GamePushConfig | null {
  if (typeof location !== 'undefined') {
    const fromSearch = gamePushConfigFromSearch(location.search);
    if (fromSearch) return fromSearch;
  }
  const projectId = metaContent('gamepush-project-id');
  const publicToken = metaContent('gamepush-public-token');
  return projectId && publicToken ? { projectId, publicToken } : null;
}

export function isGamePushPortalTarget(): boolean {
  const portal = requestedPortal();
  return portal === 'gamepush' || portal === 'pikabu';
}

export function isStrictPortalMode(): boolean {
  const portal = requestedPortal();
  return portal === 'yandex' || portal === 'gamepush' || portal === 'pikabu';
}

export function portalAllowsCasinoLikeContent(): boolean {
  return !isStrictPortalMode();
}

export function portalAllowsOptionalNetwork(): boolean {
  if (isStrictPortalMode()) return false;
  return netSphereBackendAvailable();
}

/** A real Net Sphere backend (/api/net) exists only in the Cloudflare/Wrangler
 *  build (`--mode cloudflare`, i.e. cf:dev/cf:deploy — also covers `wrangler dev`
 *  on localhost) or the GitHub build (which targets workers.dev by absolute URL).
 *  itch, pikabu and plain static/dev hosts have no backend, so any request just
 *  404s — treat optional network as unavailable there. See cloudflare.md. */
function netSphereBackendAvailable(): boolean {
  if (typeof window !== 'undefined' && window.location?.hostname === 'gigahrush.github.io') return true;
  return Boolean((globalThis as { __GIGAHRUSH_NET_BACKEND__?: boolean }).__GIGAHRUSH_NET_BACKEND__);
}

export function portalBlocksDesignFloor(id: string | undefined): boolean {
  return isStrictPortalMode() && designFloorProfile(id)?.portalPolicy?.strictPortalBlocked === true;
}

function shouldInitYandex(): boolean {
  return !!portalGlobal().YaGames || requestedPortal() === 'yandex';
}

function shouldInitGamePush(): boolean {
  return !!portalGlobal().gp || isGamePushPortalTarget() || !!gamePushConfig();
}

function isCurrentRawSave(raw: string): boolean {
  try {
    return saveShapeVersionStatus(safeParseJson(raw) as unknown) === 'current';
  } catch {
    return false;
  }
}

function callOptional(target: unknown, method: string): void {
  if (!target || typeof target !== 'object') return;
  const fn = (target as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return;
  try {
    const result = fn.call(target);
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Optional portal SDK calls must never break the standalone browser build.
  }
}

async function waitForGamePushReady(gp: GamePushSdk): Promise<void> {
  try {
    const promises: Promise<unknown>[] = [];
    if (gp.ready) promises.push(gp.ready);
    // gp.player.ready hangs in GamePush Sandbox, blocking initialization.
    // Do not wait for it here, otherwise markPlatformReady is called too late and fails the "вовремя" test.
    if (promises.length === 0) return;
    await Promise.race([
      Promise.all(promises),
      new Promise((_, reject) => setTimeout(() => reject(new Error('GP timeout')), 2000))
    ]);
  } catch {
    // GamePush readiness must never break the standalone browser build.
  }
}

function loadYandexSdkScript(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (documentQuerySelector('script[data-gigahrush-yandex-sdk="1"]')) return Promise.resolve(true);
  if (typeof document.createElement !== 'function' || typeof document.head?.appendChild !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = '/sdk.js';
    script.async = true;
    script.dataset.gigahrushYandexSdk = '1';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function bindYandexEvents(sdk: YandexSdk): void {
  if (yandexEventsBound || typeof sdk.on !== 'function') return;
  sdk.on('game_api_pause', () => bridgeOptions.onPauseChange?.(true));
  sdk.on('game_api_resume', () => bridgeOptions.onPauseChange?.(false));
  yandexEventsBound = true;
}

function yandexSdk(): Promise<YandexSdk | null> {
  if (!shouldInitYandex()) return Promise.resolve(null);
  if (yandexSdkPromise) return yandexSdkPromise;
  yandexSdkPromise = (async () => {
    if (!portalGlobal().YaGames && requestedPortal() === 'yandex') await loadYandexSdkScript();
    const factory = portalGlobal().YaGames;
    if (!factory || typeof factory.init !== 'function') return null;
    const sdk = await factory.init();
    bindYandexEvents(sdk);
    return sdk;
  })().catch(() => null);
  return yandexSdkPromise;
}

function gamePushSdk(): GamePushSdk | null {
  return portalGlobal().gp ?? null;
}

function gamePushSdkScriptUrl(config: GamePushConfig): string {
  const url = new URL(GAMEPUSH_SDK_BASE_URL);
  url.searchParams.set('projectId', config.projectId);
  url.searchParams.set('publicToken', config.publicToken);
  url.searchParams.set('callback', GAMEPUSH_CALLBACK_NAME);
  return url.toString();
}

function loadGamePushSdkScript(config: GamePushConfig): Promise<GamePushSdk | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (documentQuerySelector('script[data-gigahrush-gamepush-sdk="1"]')) {
    return gamePushSdkPromise ?? Promise.resolve(gamePushSdk());
  }
  if (typeof document.createElement !== 'function' || typeof document.head?.appendChild !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (gp: GamePushSdk | null): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolve(gp);
    };
    const global = portalGlobal();
    const previous = global.onGPInit;
    global.onGPInit = async (gp: GamePushSdk) => {
      global.gp = gp;
      try { previous?.(gp); } catch { /* preserve host callback safety */ }
      finish(gp);
    };
    const script = document.createElement('script');
    script.src = gamePushSdkScriptUrl(config);
    script.async = true;
    script.dataset.gigahrushGamepushSdk = '1';
    script.onload = () => {
      void Promise.resolve().then(() => finish(gamePushSdk()));
    };
    script.onerror = () => finish(null);
    timeout = setTimeout(() => finish(gamePushSdk()), GAMEPUSH_SDK_LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });
}

function gamePushSdkAsync(): Promise<GamePushSdk | null> {
  const existing = gamePushSdk();
  if (existing) return Promise.resolve(existing);
  if (!shouldInitGamePush()) return Promise.resolve(null);
  if (gamePushSdkPromise) return gamePushSdkPromise;
  const config = gamePushConfig();
  if (!config) return Promise.resolve(null);
  gamePushSdkPromise = loadGamePushSdkScript(config).then(gp => {
    if (gp) bindGamePushEvents(gp);
    return gp;
  }).catch(() => null);
  return gamePushSdkPromise;
}

// The GamePush fullscreen overlay — including its 3-2-1 countdown — is drawn on
// the page main thread. Floor generation blocks that thread for seconds, so an ad
// shown while generation runs freezes mid-countdown and the player pays for it
// twice. The ad and the heavy load must therefore never overlap: callers wait for
// the resolved promise AND for isPlatformAdOnScreen() to go false.
const FULLSCREEN_AD_START_TIMEOUT_MS = 4000;   // no 'start' by then = platform showed nothing
const FULLSCREEN_AD_SETTLE_GRACE_MS = 400;     // SDK promise settled before 'start' arrived
const FULLSCREEN_AD_HARD_TIMEOUT_MS = 60000;   // ad started but never reported a close
let activeFullscreenAdResolve: ((shown: boolean) => void) | null = null;
let fullscreenAdTimers: ReturnType<typeof setTimeout>[] = [];
let fullscreenAdOnScreen = false;

function clearFullscreenAdTimers(): void {
  for (const timer of fullscreenAdTimers) clearTimeout(timer);
  fullscreenAdTimers = [];
}

function armFullscreenAdTimer(ms: number, fn: () => void): void {
  fullscreenAdTimers.push(setTimeout(fn, ms));
}

function finishFullscreenAd(shown: boolean): void {
  clearFullscreenAdTimers();
  const resolve = activeFullscreenAdResolve;
  activeFullscreenAdResolve = null;
  resolve?.(shown);
}

/** True while a portal ad overlay owns the screen. Heavy main-thread work
 *  (floor generation) must stay off until this goes false, otherwise the ad
 *  countdown freezes and the player waits for the ad twice. */
export function isPlatformAdOnScreen(): boolean {
  return fullscreenAdOnScreen;
}

function bindGamePushEvents(gp = gamePushSdk()): void {
  if (!gp || gamePushEventsBound || !gp.on) return;
  gp.on('pause', () => bridgeOptions.onPauseChange?.(true));
  gp.on('resume', () => bridgeOptions.onPauseChange?.(false));
  if (gp.sounds && typeof gp.sounds.on === 'function') {
    gp.sounds.on('mute', () => bridgeOptions.onAudioMuteChange?.(true));
    gp.sounds.on('unmute', () => bridgeOptions.onAudioMuteChange?.(false));
  }
  if (gp.language) {
    bridgeOptions.onLanguageDetected?.(gp.language);
  }
  if (gp.ads && typeof gp.ads.on === 'function') {
    gp.ads.on('fullscreen:start', () => {
      // The overlay is up: drop the "nothing was shown" timers and hold the caller
      // until close, so no heavy main-thread work can freeze the countdown.
      clearFullscreenAdTimers();
      fullscreenAdOnScreen = true;
      if (activeFullscreenAdResolve) {
        // Last resort: a host that opens an ad and never reports a close would
        // otherwise strand the caller on the loading screen forever.
        armFullscreenAdTimer(FULLSCREEN_AD_HARD_TIMEOUT_MS, () => {
          fullscreenAdOnScreen = false;
          bridgeOptions.onPauseChange?.(false);
          finishFullscreenAd(true);
        });
      }
      bridgeOptions.onPauseChange?.(true);
    });
    gp.ads.on('fullscreen:close', (success?: boolean) => {
      const wasOnScreen = fullscreenAdOnScreen;
      fullscreenAdOnScreen = false;
      bridgeOptions.onPauseChange?.(false);
      finishFullscreenAd(wasOnScreen || success === true);
    });
  }
  gamePushEventsBound = true;

  // GamePush Sandbox STRICTLY checks the JavaScript call stack.
  // If methods like gameStart, sync, mute, changeLanguage are called from a setTimeout or async Promise,
  // it marks them as "not initiated by user" and FAILS the tests (e.g. "вовремя", "кнопка звука", "сохранение").
  //
  // gameStart dual-path strategy:
  //   1. markPlatformReady() tries synchronous gameStart when SDK is already on the global (sandbox preload).
  //   2. If SDK wasn't ready at markPlatformReady time, this user-gesture handler is the fallback.
  // The gamePushGameStartSent flag ensures exactly one call.
  const onUserGesture = () => {
    // 1. gameStart fallback (Test 2, 3) — only if not already sent from markPlatformReady
    if (!gamePushGameStartSent) {
      gamePushGameStartSent = true;
      try { if (typeof gp.gameStart === 'function') gp.gameStart(); } catch (e) { console.error('GamePush SDK error:', e); }
    }

    // 2. Real progress sync — the sandbox "progress saves to the player" test
    // needs gp.player.set + sync inside a user-gesture call stack. The old fake
    // probes here wrote `progress='test'` and `score=100` over every live
    // player's cloud slot (2 of 543 Pikabu players had a real save — see
    // retention.md); this writes ONLY the player's own current values, so it is
    // a no-op data-wise for live players. Retries until the cloud hydrate has
    // settled, then the listeners drop off.
    syncPlatformProgressFromUserGesture();
    if (gamePushGameStartSent && gestureProgressSynced && typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', onUserGesture);
      document.removeEventListener('keydown', onUserGesture);
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', onUserGesture);
    document.addEventListener('keydown', onUserGesture);
  }
}

let localAudioMutedFallback = false;

export function isPlatformAudioMuted(): boolean {
  const gp = gamePushSdk();
  if (gp && gp.sounds) {
    return gp.sounds.isMuted ?? false;
  }
  return localAudioMutedFallback;
}

export function togglePlatformAudioMuted(): void {
  const gp = gamePushSdk();
  if (gp && gp.sounds) {
    if (gp.sounds.isMuted) {
      if (typeof gp.sounds.unmute === 'function') gp.sounds.unmute();
    } else {
      if (typeof gp.sounds.mute === 'function') gp.sounds.mute();
    }
  } else {
    localAudioMutedFallback = !localAudioMutedFallback;
    bridgeOptions.onAudioMuteChange?.(localAudioMutedFallback);
  }
}

export function isPortalCloudSaveSizeAllowed(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= PORTAL_RAW_SAVE_LIMIT_BYTES;
}

export function isGamePushCloudSaveSizeAllowed(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= GAMEPUSH_RAW_SAVE_LIMIT_BYTES;
}

function portalSaveRecord(raw: string, bytes: number, mode: PortalSaveRecordMode): PortalSaveRecord {
  return {
    kind: PORTAL_SAVE_RECORD_KIND,
    recordVersion: 1,
    mode,
    shapeVersion: SAVE_SHAPE_VERSION,
    savedAt: Date.now(),
    bytes,
    raw,
  };
}

function decodePortalSaveRecord(value: unknown): { raw: string; savedAt: number } | null {
  if (typeof value === 'string') {
    if (isCurrentRawSave(value)) return { raw: value, savedAt: 0 };
    try {
      return decodePortalSaveRecord(safeParseJson(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<PortalSaveRecord>;
  if (record.kind !== PORTAL_SAVE_RECORD_KIND || typeof record.raw !== 'string') return null;
  if (!isCurrentRawSave(record.raw)) return null;
  const savedAt = typeof record.savedAt === 'number' && Number.isFinite(record.savedAt)
    ? Math.floor(record.savedAt)
    : 0;
  return {
    raw: record.raw,
    savedAt,
  };
}

function localPortalSaveTime(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const value = Number(localStorage.getItem(LOCAL_PORTAL_SAVE_TIME_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function rememberLocalPortalSaveTime(savedAt: number): void {
  if (typeof localStorage === 'undefined' || !Number.isFinite(savedAt) || savedAt <= 0) return;
  try {
    localStorage.setItem(LOCAL_PORTAL_SAVE_TIME_KEY, String(Math.floor(savedAt)));
  } catch {
    // Local storage can be blocked in embedded portal contexts.
  }
}

export function initPlatformBridge(options: PlatformBridgeOptions = {}): void {
  bridgeOptions = options;
  bindGamePushEvents();
  if (shouldInitYandex()) void yandexSdk();
  if (shouldInitGamePush()) void gamePushSdkAsync();
  void hydratePlatformSaveFromCloud();
}

export function markPlatformReady(): void {
  void yandexSdk().then(sdk => {
    if (!sdk || yandexReadySent) return;
    yandexReadySent = true;
    callOptional(sdk.features?.LoadingAPI, 'ready');
  });

  // Synchronous path: if GamePush SDK is already on the global (common in sandbox
  // where the SDK script tag is preloaded), call gameStart right now — not from
  // a Promise.then microtask. The sandbox checks the call stack and rejects async
  // calls as "not on time". If the SDK hasn't loaded yet, the user-gesture
  // fallback in fulfillSandboxTests will fire gameStart on the first interaction.
  const gpImmediate = portalGlobal().gp ?? null;
  if (gpImmediate) {
    bindGamePushEvents(gpImmediate);
    if (!gamePushReadySent) {
      gamePushReadySent = true;
      try { if (typeof gpImmediate.gameReady === 'function') gpImmediate.gameReady(); } catch (e) { console.error('GamePush SDK error:', e); }
    }
    if (!gamePushGameStartSent) {
      gamePushGameStartSent = true;
      try { if (typeof gpImmediate.gameStart === 'function') gpImmediate.gameStart(); } catch (e) { console.error('GamePush SDK error:', e); }
    }
  }

  // Async fallback: SDK not loaded yet — resolve gameReady when it arrives.
  // gameStart is NOT called from the async path; the user-gesture fallback handles it.
  void gamePushSdkAsync().then(async gp => {
    if (!gp) return;
    bindGamePushEvents(gp);
    
    if (!gamePushReadySent) {
      gamePushReadySent = true;
      try { if (typeof gp.gameReady === 'function') gp.gameReady(); } catch (e) { console.error('GamePush SDK error:', e); }
    }
  });
}

export function markPlatformGameplayStart(): void {
  void yandexSdk().then(sdk => {
    if (!sdk || yandexGameplayActive) return;
    yandexGameplayActive = true;
    callOptional(sdk.features?.GameplayAPI, 'start');
  });

  void gamePushSdkAsync().then(async gp => {
    if (!gp) return;
    bindGamePushEvents(gp);
    if (gamePushGameplayActive) return;
    gamePushGameplayActive = true;
    callOptional(gp, 'gameplayStart');
  });
}

export function markPlatformGameplayStop(): void {
  void yandexSdk().then(sdk => {
    if (!sdk || !yandexGameplayActive) return;
    yandexGameplayActive = false;
    callOptional(sdk.features?.GameplayAPI, 'stop');
  });

  void gamePushSdkAsync().then(async gp => {
    if (!gp) return;
    bindGamePushEvents(gp);
    if (!gamePushGameplayActive) return;
    gamePushGameplayActive = false;
    callOptional(gp, 'gameplayStop');
  });
}

function gamePushSaveCandidate(full: PlatformSaveCandidate, compact?: PlatformSaveCandidate): PlatformSaveCandidate | null {
  const normalizedFull: PlatformSaveCandidate = { ...full, mode: full.mode ?? 'full' };
  const normalizedCompact = compact ? { ...compact, mode: compact.mode ?? 'compact' } : undefined;
  if (isGamePushCloudSaveSizeAllowed(normalizedFull.bytes) && normalizedFull.bytes <= GAMEPUSH_COMPACT_SAVE_THRESHOLD_BYTES) {
    return normalizedFull;
  }
  if (normalizedCompact && isGamePushCloudSaveSizeAllowed(normalizedCompact.bytes)) return normalizedCompact;
  if (isGamePushCloudSaveSizeAllowed(normalizedFull.bytes)) return normalizedFull;
  return null;
}

export async function savePlatformRawGameSave(
  raw: string,
  bytes: number,
  compact?: PlatformSaveCandidate,
  score?: number,
  floor?: number,
): Promise<PlatformSaveStatus> {
  const fullCandidate: PlatformSaveCandidate = { raw, bytes, mode: 'full' };
  let touchedSdk = false;
  let skippedSize = false;
  let savedAt = 0;
  try {
    const sdk = await yandexSdk();
    if (sdk?.getPlayer) {
      if (isPortalCloudSaveSizeAllowed(bytes)) {
        const record = portalSaveRecord(raw, bytes, 'full');
        savedAt = Math.max(savedAt, record.savedAt);
        const player = await sdk.getPlayer({ scopes: false });
        if (player.setData) {
          await player.setData({ gigahrushSave: record, gigahrushSaveRaw: raw }, false);
          touchedSdk = true;
        }
      } else {
        skippedSize = true;
      }
    }

    const gp = await gamePushSdkAsync();
    if (gp?.player) {
      bindGamePushEvents(gp);
      await waitForGamePushReady(gp);
      const candidate = gamePushSaveCandidate(fullCandidate, compact);
      if (gp.player.set && candidate) {
        const record = portalSaveRecord(candidate.raw, candidate.bytes, candidate.mode ?? 'full');
        savedAt = Math.max(savedAt, record.savedAt);
        gp.player.set('progress', JSON.stringify(record));
        applyPlatformRecords(gp.player, score, floor);
        await gp.player.sync?.({ storage: 'cloud' });
        touchedSdk = true;
      } else if (gp.player.set) {
        skippedSize = true;
      }
    }
    if (touchedSdk) rememberLocalPortalSaveTime(savedAt);
    return touchedSdk ? 'queued' : skippedSize ? 'skipped-size' : 'no-sdk';
  } catch {
    return 'failed';
  }
}

async function yandexCloudRawSave(): Promise<{ raw: string; savedAt: number } | null> {
  const sdk = await yandexSdk();
  if (!sdk?.getPlayer) return null;
  const player = await sdk.getPlayer({ scopes: false });
  if (!player.getData) return null;
  const data = await player.getData(['gigahrushSave', 'gigahrushSaveRaw']);
  return decodePortalSaveRecord(data.gigahrushSave) ?? decodePortalSaveRecord(data.gigahrushSaveRaw);
}

async function gamePushCloudRawSave(): Promise<{ raw: string; savedAt: number } | null> {
  const gp = await gamePushSdkAsync();
  if (!gp?.player?.get) return null;
  bindGamePushEvents(gp);
  await waitForGamePushReady(gp);
  return decodePortalSaveRecord(gp.player.get('progress'));
}

export async function loadPlatformRawGameSave(localRaw?: string | null): Promise<PlatformLoadResult> {
  try {
    const candidates: Array<{ source: 'gamepush' | 'yandex'; raw: string; savedAt: number }> = [];
    const [gamePush, yandex] = await Promise.all([
      gamePushCloudRawSave().catch(() => null),
      yandexCloudRawSave().catch(() => null),
    ]);
    if (gamePush) candidates.push({ source: 'gamepush', ...gamePush });
    if (yandex) candidates.push({ source: 'yandex', ...yandex });
    if (candidates.length === 0) {
      return shouldInitGamePush() || shouldInitYandex() ? { status: 'missing' } : { status: 'no-sdk' };
    }

    candidates.sort((a, b) => b.savedAt - a.savedAt);
    const selected = candidates[0]!;
    const localIsCurrent = typeof localRaw === 'string' && isCurrentRawSave(localRaw);
    if (localIsCurrent) {
      const localSavedAt = localPortalSaveTime();
      if (selected.savedAt <= 0 || localSavedAt <= 0 || localSavedAt >= selected.savedAt) {
        return { status: 'local-present', source: selected.source };
      }
    }
    if (!isCurrentRawSave(selected.raw)) return { status: 'invalid', source: selected.source };
    return { status: 'loaded', raw: selected.raw, source: selected.source };
  } catch {
    return { status: 'failed' };
  }
}

export async function hydratePlatformSaveFromCloud(): Promise<PlatformLoadResult> {
  try {
    return await hydratePlatformSaveFromCloudInner();
  } finally {
    // The user-gesture progress sync must not race the hydrate: until the cloud
    // candidate has been merged into localStorage, pushing the local save up
    // could overwrite a newer save from another device.
    cloudHydrateSettled = true;
  }
}

async function hydratePlatformSaveFromCloudInner(): Promise<PlatformLoadResult> {
  if (typeof localStorage === 'undefined' || !localStorage.getItem) return { status: 'no-sdk' };
  let localRaw: string | null = null;
  try {
    localRaw = localStorage.getItem(LOCAL_SAVE_KEY);
  } catch {
    // Local storage can be blocked in embedded portal contexts.
  }
  const result = await loadPlatformRawGameSave(localRaw);
  if (result.status !== 'loaded' || !result.raw) return result;
  try {
    if (localStorage.getItem(LOCAL_SAVE_KEY) !== localRaw) {
      return { status: 'local-present', source: result.source };
    }
    localStorage.setItem(LOCAL_SAVE_KEY, result.raw);
    rememberLocalPortalSaveTime(Date.now());
    return result;
  } catch {
    return { status: 'failed', source: result.source };
  }
}

// Personal records live platform-side (max against the stored value), so they
// survive new runs without touching the save shape. `score` = best cumulative XP,
// `floor` = deepest |Z| reached; both fields must be declared in the GamePush
// panel, and the leaderboards `Опыт выживания` (99388) / `Самый глубокий этаж`
// (99389) read them directly. Cached locally so a repeat submit with an unchanged
// record costs no SDK write.
let bestReportedScore = 0;
let bestReportedFloor = 0;

function applyPlatformRecords(player: GamePushPlayer, score?: number, floor?: number): boolean {
  if (typeof player.set !== 'function') return false;
  let changed = false;
  if (score !== undefined && Number.isFinite(score)) {
    const next = Math.max(0, Math.round(score));
    const prev = Math.max(bestReportedScore, Number(player.get?.('score')) || 0);
    if (next > prev) {
      player.set('score', next);
      changed = true;
    }
    bestReportedScore = Math.max(prev, next);
  }
  if (floor !== undefined && Number.isFinite(floor)) {
    const next = Math.max(0, Math.round(floor));
    const prev = Math.max(bestReportedFloor, Number(player.get?.('floor')) || 0);
    if (next > prev) {
      player.set('floor', next);
      changed = true;
    }
    bestReportedFloor = Math.max(prev, next);
  }
  return changed;
}

/** Re-asserts the player's own current progress inside a user-gesture call
 *  stack. The GamePush sandbox auto-test "progress must save to the player"
 *  only accepts gp.player.set + sync called synchronously from a click/keydown,
 *  so this runs on the first gesture — but unlike the removed sandbox stubs it
 *  writes REAL data only: the stored score/floor records re-set to their own
 *  max, and the actual local save (never over a newer cloud record). For a live
 *  player this is data-wise a no-op; for the sandbox it is the probe it wants.
 *  Runs once per session, and only after the cloud hydrate settled. */
export function syncPlatformProgressFromUserGesture(): boolean {
  if (gestureProgressSynced || !cloudHydrateSettled) return false;
  const player = gamePushSdk()?.player;
  if (!player || typeof player.set !== 'function') return false;
  // The probe must push a REAL change: the SDK skips a sync with no dirty
  // fields, so re-asserting identical values never reaches the platform and
  // the sandbox test stays red. The progress record's savedAt makes the write
  // genuinely dirty — so a current-shape local save is required. On a fresh
  // profile the game is asked for a real autosave right here in the gesture
  // stack (no-op until a run is actually active — keep retrying until then).
  let localRaw: string | null = null;
  try {
    localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_SAVE_KEY) : null;
    if (!localRaw || !isCurrentRawSave(localRaw)) {
      bridgeOptions.requestLocalSave?.();
      localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_SAVE_KEY) : null;
    }
  } catch {
    // Local storage can be blocked in embedded portal contexts.
  }
  if (!localRaw || !isCurrentRawSave(localRaw)) return false;
  const score = Math.max(bestReportedScore, Number(player.get?.('score')) || 0);
  const floor = Math.max(bestReportedFloor, Number(player.get?.('floor')) || 0);
  player.set('score', score);
  player.set('floor', floor);
  bestReportedScore = score;
  bestReportedFloor = floor;
  const cloud = decodePortalSaveRecord(player.get?.('progress'));
  const localSavedAt = localPortalSaveTime();
  // After hydrate the freshest save lives in localStorage; the timestamp
  // guard is a second lock against clobbering another device's newer save.
  if (!cloud || cloud.raw === localRaw || cloud.savedAt <= 0 || localSavedAt >= cloud.savedAt) {
    const bytes = new TextEncoder().encode(localRaw).length;
    if (isGamePushCloudSaveSizeAllowed(bytes)) {
      const record = portalSaveRecord(localRaw, bytes, 'full');
      player.set('progress', JSON.stringify(record));
      rememberLocalPortalSaveTime(record.savedAt);
    }
  }
  gestureProgressSynced = true;
  try {
    const synced = player.sync?.({ storage: 'cloud' });
    if (synced && typeof (synced as Promise<unknown>).catch === 'function') {
      void (synced as Promise<unknown>).catch(() => {});
    }
  } catch (e) {
    console.error('GamePush SDK error:', e);
  }
  return true;
}

/** Pushes the personal records to the portal outside the save path — death and
 *  other run-ending moments never reach savePlatformRawGameSave, so without this
 *  the leaderboards only ever see saved runs. */
export async function submitPlatformLeaderboardStats(score: number, floor: number): Promise<boolean> {
  try {
    const gp = await gamePushSdkAsync();
    if (!gp?.player) return false;
    bindGamePushEvents(gp);
    await waitForGamePushReady(gp);
    if (!applyPlatformRecords(gp.player, score, floor)) return false;
    await gp.player.sync?.({ storage: 'cloud' });
    return true;
  } catch {
    return false;
  }
}

const unlockedAchievementTags = new Set<string>();

/** Unlocks a GamePush achievement by tag. The tag must exist in the GamePush
 *  panel; a host without the achievements module (itch, direct build, Yandex) is
 *  a silent no-op. Repeat unlocks are dropped locally: this is an event, not a
 *  per-frame state sync. */
export function unlockPlatformAchievement(tag: string): void {
  if (!tag || unlockedAchievementTags.has(tag)) return;
  const achievements = gamePushSdk()?.achievements;
  if (!achievements || typeof achievements.unlock !== 'function') return;
  unlockedAchievementTags.add(tag);
  try {
    const result = achievements.unlock({ tag });
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {});
    }
  } catch (e) {
    console.error('GamePush achievements error:', e);
  }
}

/** Resolves once the platform is done with the ad slot: either nothing was shown
 *  (no SDK, no inventory, adblock, platform cooldown) or the overlay opened and
 *  closed again. Never resolves while the overlay is still up — see
 *  isPlatformAdOnScreen. */
export function showPlatformFullscreenAd(): Promise<boolean> {
  const gp = gamePushSdk();
  const ads = gp?.ads;
  const showFullscreen = ads?.showFullscreen;
  if (!ads || typeof showFullscreen !== 'function') return Promise.resolve(false);
  // Availability flags keep floor transitions free of dead waiting when the
  // platform has nothing to show (own cooldown, adblock, unsupported host).
  // The sandbox (gp.isDev) draws its own mock overlay regardless of these
  // flags — an adblocker on the developer's browser must not hide it there.
  if (gp?.isDev !== true && (ads.isFullscreenAvailable === false || ads.isAdblockEnabled === true)) return Promise.resolve(false);
  if (activeFullscreenAdResolve) return Promise.resolve(false);
  return new Promise(resolve => {
    activeFullscreenAdResolve = resolve;
    let settledEarly = false;
    try {
      const shown = showFullscreen.call(ads);
      if (shown && typeof (shown as Promise<unknown>).then === 'function') {
        // The SDK promise settles on close, but on some hosts it settles right
        // away for a slot that opens a moment later. Give 'fullscreen:start' a
        // short grace window before letting the caller run heavy work.
        const onSettled = (): void => {
          if (fullscreenAdOnScreen || settledEarly) return;
          settledEarly = true;
          armFullscreenAdTimer(FULLSCREEN_AD_SETTLE_GRACE_MS, () => {
            if (!fullscreenAdOnScreen) finishFullscreenAd(false);
          });
        };
        void (shown as Promise<unknown>).then(onSettled, onSettled);
      }
    } catch (e) {
      console.error('GamePush showFullscreen error:', e);
      finishFullscreenAd(false);
      return;
    }
    armFullscreenAdTimer(FULLSCREEN_AD_START_TIMEOUT_MS, () => {
      if (!fullscreenAdOnScreen) finishFullscreenAd(false);
    });
  });
}

export function resetPlatformBridgeForTests(): void {
  bridgeOptions = {};
  yandexSdkPromise = null;
  gamePushSdkPromise = null;
  yandexEventsBound = false;
  yandexReadySent = false;
  yandexGameplayActive = false;
  gamePushEventsBound = false;
  gamePushReadySent = false;
  gamePushGameStartSent = false;
  gamePushGameplayActive = false;
  cloudHydrateSettled = false;
  gestureProgressSynced = false;
  activeFullscreenAdResolve = null;
  fullscreenAdOnScreen = false;
  clearFullscreenAdTimers();
  unlockedAchievementTags.clear();
  bestReportedScore = 0;
  bestReportedFloor = 0;
}

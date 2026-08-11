import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  initPlatformBridge,
  isPlatformAdOnScreen,
  resetPlatformBridgeForTests,
  showPlatformFullscreenAd,
  syncPlatformProgressFromUserGesture,
} from '../src/systems/platform_bridge';
import { SAVE_SHAPE_VERSION } from '../src/systems/save_runtime';
import { reportPlatformProgress, resetPlatformProgressForTests } from '../src/systems/platform_progress';
import type { Entity, GameState } from '../src/core/types';

type AdHandler = (success?: boolean) => void;

interface FakeAds {
  isFullscreenAvailable?: boolean;
  isAdblockEnabled?: boolean;
  shows: number;
  showFullscreen(): Promise<void> | void;
  on(event: string, handler: AdHandler): void;
}

interface FakeGamePush {
  on?(event: string, handler: () => void): void;
  isDev?: boolean;
  ads?: FakeAds;
  achievements?: { unlocked: string[]; unlock(options: { tag?: string }): void };
  player?: {
    values: Record<string, string | number | boolean>;
    syncs: number;
    get(key: string): string | number | boolean;
    set(key: string, value: string | number | boolean): void;
    sync(): Promise<void>;
  };
}

function fakeAds(settleImmediately: boolean, handlers: Map<string, AdHandler>): FakeAds {
  return {
    shows: 0,
    showFullscreen() {
      this.shows++;
      // Some hosts settle the SDK promise before the overlay is actually up.
      return settleImmediately ? Promise.resolve() : new Promise<void>(() => {});
    },
    on(event, handler) { handlers.set(event, handler); },
  };
}

function fakePlayer(): NonNullable<FakeGamePush['player']> {
  return {
    values: {},
    syncs: 0,
    get(key) { return this.values[key]; },
    set(key, value) { this.values[key] = value; },
    async sync() { this.syncs++; },
  };
}

async function withGamePush<T>(gp: FakeGamePush, run: () => Promise<T>): Promise<T> {
  const globals = globalThis as typeof globalThis & { gp?: unknown };
  const original = globals.gp;
  // GamePush event binding needs a top-level `on`; without it the ads handlers
  // are never registered — exactly the shape the live SDK has.
  globals.gp = { on: () => {}, ...gp };
  try {
    return await run();
  } finally {
    if (original !== undefined) globals.gp = original;
    else delete globals.gp;
  }
}

async function withPikabuPortal<T>(run: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '?portal=pikabu' } });
  try {
    return await run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'location', original);
    else delete (globalThis as typeof globalThis & { location?: Location }).location;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('fullscreen ad stays unresolved while the overlay owns the main thread', async () => {
  resetPlatformBridgeForTests();
  const handlers = new Map<string, AdHandler>();
  const gp: FakeGamePush = { ads: fakeAds(true, handlers) };

  await withGamePush(gp, async () => {
    initPlatformBridge({});
    let resolved: boolean | undefined;
    const pending = showPlatformFullscreenAd().then(shown => { resolved = shown; });

    handlers.get('fullscreen:start')?.();
    assert.equal(isPlatformAdOnScreen(), true);
    // The SDK promise already settled; the caller must still wait, otherwise
    // floor generation would block the countdown mid-flight.
    await sleep(60);
    assert.equal(resolved, undefined);

    handlers.get('fullscreen:close')?.(true);
    await pending;
    assert.equal(resolved, true);
    assert.equal(isPlatformAdOnScreen(), false);
    assert.equal(gp.ads?.shows, 1);
  });
  resetPlatformBridgeForTests();
});

test('fullscreen ad is skipped without a platform slot instead of stalling the load', async () => {
  resetPlatformBridgeForTests();
  const handlers = new Map<string, AdHandler>();
  const ads = fakeAds(false, handlers);
  ads.isFullscreenAvailable = false;

  await withGamePush({ ads }, async () => {
    initPlatformBridge({});
    assert.equal(await showPlatformFullscreenAd(), false);
    assert.equal(ads.shows, 0);

    ads.isFullscreenAvailable = true;
    ads.isAdblockEnabled = true;
    assert.equal(await showPlatformFullscreenAd(), false);
    assert.equal(ads.shows, 0);
  });
  resetPlatformBridgeForTests();
});

test('fullscreen ad resolves when the platform shows nothing at all', async () => {
  resetPlatformBridgeForTests();
  const handlers = new Map<string, AdHandler>();
  const ads = fakeAds(true, handlers);

  await withGamePush({ ads }, async () => {
    initPlatformBridge({});
    assert.equal(await showPlatformFullscreenAd(), false);
    assert.equal(ads.shows, 1);
    assert.equal(isPlatformAdOnScreen(), false);
  });
  resetPlatformBridgeForTests();
});

async function withLocalStorage<T>(entries: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const globals = globalThis as typeof globalThis & { localStorage?: unknown };
  const original = globals.localStorage;
  const store = new Map<string, string>(Object.entries(entries));
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  };
  try {
    return await run();
  } finally {
    if (original !== undefined) globals.localStorage = original;
    else delete globals.localStorage;
  }
}

function currentShapeSaveRaw(marker: string): string {
  return JSON.stringify({ version: SAVE_SHAPE_VERSION, marker });
}

test('sandbox dev mode shows the ad even when availability flags say no', async () => {
  resetPlatformBridgeForTests();
  const handlers = new Map<string, AdHandler>();
  const ads = fakeAds(true, handlers);
  ads.isFullscreenAvailable = false;
  ads.isAdblockEnabled = true;

  await withGamePush({ ads, isDev: true }, async () => {
    initPlatformBridge({});
    await showPlatformFullscreenAd();
    assert.equal(ads.shows, 1);
  });
  resetPlatformBridgeForTests();
});

test('user-gesture progress sync retries until a real save exists, then latches', async () => {
  resetPlatformBridgeForTests();
  const player = fakePlayer();

  await withLocalStorage({}, async () => {
    await withGamePush({ player }, async () => {
      initPlatformBridge({});
      await sleep(10); // let the cloud hydrate settle; the gesture sync waits for it
      // No save yet: an unchanged-values sync would be dropped by the SDK and
      // the sandbox would see nothing — so nothing is written and no latch.
      assert.equal(syncPlatformProgressFromUserGesture(), false);
      assert.equal(player.syncs, 0);
      assert.equal(player.values.score, undefined);

      localStorage.setItem('gigahrush_save', currentShapeSaveRaw('mid-run'));
      assert.equal(syncPlatformProgressFromUserGesture(), true);
      assert.equal(player.values.score, 0);
      assert.equal(player.values.floor, 0);
      assert.equal(JSON.parse(String(player.values.progress)).marker, undefined);
      assert.equal(JSON.parse(String(JSON.parse(String(player.values.progress)).raw)).marker, 'mid-run');
      assert.equal(player.syncs, 1);
      // Once per session: a second gesture must not spam the rate limit.
      assert.equal(syncPlatformProgressFromUserGesture(), false);
      assert.equal(player.syncs, 1);
    });
  });
  resetPlatformBridgeForTests();
});

test('sandbox dev mode probe forces a changed score even before any save exists', async () => {
  resetPlatformBridgeForTests();
  const player = fakePlayer();
  player.values.score = 7;

  await withLocalStorage({}, async () => {
    await withGamePush({ player, isDev: true }, async () => {
      initPlatformBridge({});
      await sleep(10);
      assert.equal(syncPlatformProgressFromUserGesture(), true);
      assert.equal(player.values.score, 8);
      assert.equal(player.values.progress, undefined);
      assert.equal(player.syncs, 1);
    });
  });
  resetPlatformBridgeForTests();
});

test('user-gesture progress sync asks the game for a fresh autosave on a clean profile', async () => {
  resetPlatformBridgeForTests();
  const player = fakePlayer();

  await withLocalStorage({}, async () => {
    await withGamePush({ player }, async () => {
      let saveRequests = 0;
      initPlatformBridge({
        requestLocalSave: () => {
          saveRequests++;
          localStorage.setItem('gigahrush_save', currentShapeSaveRaw('gesture-autosave'));
        },
      });
      await sleep(10);
      assert.equal(syncPlatformProgressFromUserGesture(), true);
      assert.equal(saveRequests, 1);
      const record = JSON.parse(String(player.values.progress));
      assert.equal(JSON.parse(record.raw).marker, 'gesture-autosave');
      assert.equal(player.syncs, 1);
    });
  });
  resetPlatformBridgeForTests();
});

test('user-gesture progress sync pushes the real local save to the cloud slot', async () => {
  resetPlatformBridgeForTests();
  const player = fakePlayer();
  player.values.score = 4200;
  const localRaw = currentShapeSaveRaw('local');

  await withLocalStorage({ gigahrush_save: localRaw }, async () => {
    await withGamePush({ player }, async () => {
      initPlatformBridge({});
      await sleep(10);
      assert.equal(syncPlatformProgressFromUserGesture(), true);
      // Records re-assert their own max — never lowered, never invented.
      assert.equal(player.values.score, 4200);
      const record = JSON.parse(String(player.values.progress));
      assert.equal(record.raw, localRaw);
      assert.equal(record.shapeVersion, SAVE_SHAPE_VERSION);
      assert.equal(player.syncs, 1);
    });
  });
  resetPlatformBridgeForTests();
});

test('user-gesture progress sync never clobbers a newer cloud save', async () => {
  resetPlatformBridgeForTests();
  const player = fakePlayer();
  const cloudRaw = currentShapeSaveRaw('cloud-newer');
  const cloudRecord = JSON.stringify({
    kind: 'gigahrush-save',
    recordVersion: 1,
    mode: 'full',
    shapeVersion: SAVE_SHAPE_VERSION,
    savedAt: Date.now() + 1_000_000,
    bytes: cloudRaw.length,
    raw: cloudRaw,
  });
  player.values.progress = cloudRecord;

  // Local save exists but this device has no portal save timestamp: the newer
  // cloud record must survive, while score/floor still sync for the sandbox.
  await withLocalStorage({ gigahrush_save: currentShapeSaveRaw('local-stale') }, async () => {
    await withGamePush({ player }, async () => {
      initPlatformBridge({});
      await sleep(10);
      assert.equal(syncPlatformProgressFromUserGesture(), true);
      assert.equal(player.values.progress, cloudRecord);
      assert.equal(player.syncs, 1);
    });
  });
  resetPlatformBridgeForTests();
});

function progressState(overrides: Partial<GameState>): GameState {
  return {
    currentZ: 0,
    samosborCount: 0,
    samosborActive: false,
    gameOver: false,
    trailerMode: false,
    ...overrides,
  } as unknown as GameState;
}

function progressPlayer(level: number, xp: number, alive = true): Entity {
  return { alive, rpg: { level, xp } } as unknown as Entity;
}

test('portal progress reports real records and milestones instead of sandbox stubs', async () => {
  resetPlatformBridgeForTests();
  resetPlatformProgressForTests();
  const unlocked: string[] = [];
  const player = fakePlayer();
  const gp: FakeGamePush = {
    player,
    achievements: { unlocked, unlock({ tag }) { if (tag) unlocked.push(tag); } },
  };

  await withPikabuPortal(async () => {
    await withGamePush(gp, async () => {
      reportPlatformProgress(progressState({ currentZ: -6 }), progressPlayer(5, 40));
      await sleep(20);
      assert.equal(player.values.floor, 6);
      assert.equal(typeof player.values.score, 'number');
      assert.ok(Number(player.values.score) > 0);
      assert.notEqual(player.values.progress, 'test');
      assert.deepEqual(unlocked, ['FIRST_DESCENT', 'DEPTH_5', 'LEVEL_5']);

      // Shallower floor must not lower the personal record.
      const before = player.syncs;
      reportPlatformProgress(progressState({ currentZ: -2 }), progressPlayer(5, 40));
      await sleep(20);
      assert.equal(player.values.floor, 6);
      assert.equal(player.syncs, before);

      // A survived samosbor and a death both push the record without a save.
      reportPlatformProgress(progressState({ currentZ: -6, samosborCount: 1, samosborActive: true }), progressPlayer(5, 40));
      reportPlatformProgress(progressState({ currentZ: -6, samosborCount: 1 }), progressPlayer(5, 90));
      await sleep(20);
      assert.ok(unlocked.includes('SAMOSBOR_SURVIVED'));

      reportPlatformProgress(progressState({ currentZ: -6, gameOver: true }), progressPlayer(6, 10, false));
      await sleep(20);
      assert.ok(Number(player.values.score) > 0);
      assert.ok(player.syncs > before);
    });
  });
  resetPlatformProgressForTests();
  resetPlatformBridgeForTests();
});

test('portal progress stays silent off-portal and in the title trailer world', async () => {
  resetPlatformBridgeForTests();
  resetPlatformProgressForTests();
  const unlocked: string[] = [];
  const player = fakePlayer();
  const gp: FakeGamePush = {
    player,
    achievements: { unlocked, unlock({ tag }) { if (tag) unlocked.push(tag); } },
  };

  await withGamePush(gp, async () => {
    reportPlatformProgress(progressState({ currentZ: -9 }), progressPlayer(9, 10));
    await sleep(10);
    assert.deepEqual(unlocked, []);
    assert.equal(player.syncs, 0);
  });

  await withPikabuPortal(async () => {
    await withGamePush(gp, async () => {
      reportPlatformProgress(progressState({ currentZ: -9, trailerMode: true }), progressPlayer(9, 10));
      await sleep(10);
      assert.deepEqual(unlocked, []);
      assert.equal(player.syncs, 0);
    });
  });
  resetPlatformProgressForTests();
  resetPlatformBridgeForTests();
});

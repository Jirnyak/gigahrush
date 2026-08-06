import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  initPlatformBridge,
  isPlatformAdOnScreen,
  resetPlatformBridgeForTests,
  showPlatformFullscreenAd,
} from '../src/systems/platform_bridge';
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

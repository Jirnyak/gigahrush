import type { Entity, GameState } from '../core/types';
import { isGamePushPortalTarget, submitPlatformLeaderboardStats, unlockPlatformAchievement } from './platform_bridge';
import { totalXpForLevel } from './rpg';

/** Portal progress reporting: personal records for the two GamePush leaderboards
 *  (`Опыт выживания` = player field `score`, `Самый глубокий этаж` = `floor`) and
 *  milestone achievements.
 *
 *  Both are event-driven, never per-frame writes: this runs on the shared
 *  progress-report tick and only touches the SDK when a record actually moves.
 *  Achievement tags must exist in the GamePush panel with exactly these ids;
 *  anywhere else (itch, direct build, Yandex) every call is a no-op. */
const DEPTH_ACHIEVEMENTS: ReadonlyArray<{ depth: number; tag: string }> = [
  { depth: 1, tag: 'FIRST_DESCENT' },
  { depth: 5, tag: 'DEPTH_5' },
  { depth: 10, tag: 'DEPTH_10' },
  { depth: 20, tag: 'DEPTH_20' },
];

const LEVEL_ACHIEVEMENTS: ReadonlyArray<{ level: number; tag: string }> = [
  { level: 5, tag: 'LEVEL_5' },
  { level: 10, tag: 'LEVEL_10' },
];

const SAMOSBOR_SURVIVED_TAG = 'SAMOSBOR_SURVIVED';

let deepestFloor = 0;
let bestLevel = 0;
let seenSamosborCount = 0;
let awaitingSamosborEnd = false;
let deathReported = false;

export function resetPlatformProgressForTests(): void {
  deepestFloor = 0;
  bestLevel = 0;
  seenSamosborCount = 0;
  awaitingSamosborEnd = false;
  deathReported = false;
}

export function reportPlatformProgress(state: GameState, player: Entity): void {
  if (!isGamePushPortalTarget() || state.trailerMode) return;

  let submitRecords = false;

  const depth = Math.abs(state.currentZ);
  if (depth > deepestFloor) {
    deepestFloor = depth;
    submitRecords = true;
    for (const entry of DEPTH_ACHIEVEMENTS) {
      if (depth >= entry.depth) unlockPlatformAchievement(entry.tag);
    }
  }

  const level = player.rpg?.level ?? 1;
  if (level > bestLevel) {
    bestLevel = level;
    for (const entry of LEVEL_ACHIEVEMENTS) {
      if (level >= entry.level) unlockPlatformAchievement(entry.tag);
    }
  }

  // samosborCount increments when a samosbor STARTS, so the survival milestone
  // waits for it to end with the player still alive.
  if (state.samosborCount > seenSamosborCount) {
    seenSamosborCount = state.samosborCount;
    awaitingSamosborEnd = true;
  }
  if (awaitingSamosborEnd && !state.samosborActive && player.alive && !state.gameOver) {
    awaitingSamosborEnd = false;
    unlockPlatformAchievement(SAMOSBOR_SURVIVED_TAG);
    submitRecords = true;
  }

  // Death never reaches savePlatformRawGameSave (autosave is gated on !gameOver),
  // so without this the leaderboards would only ever see saved runs.
  if (state.gameOver) {
    if (!deathReported) {
      deathReported = true;
      submitRecords = true;
    }
  } else {
    deathReported = false;
  }

  if (submitRecords) {
    const score = totalXpForLevel(level) + (player.rpg?.xp ?? 0);
    void submitPlatformLeaderboardStats(score, deepestFloor);
  }
}

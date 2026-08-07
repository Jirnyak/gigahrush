# PR 102: Portal contract repair — ads, cloud save, leaderboards, achievements

Date: 2026-08-07.

Type: **code change**, not a campaign action. No post, comment, submission, upload, email,
vote, rating, form action or account action was made in this pass. Follows directly from
`PRCampaign/PR_101_audience_audit_retention_2026-08-07.md` and root `retention.md`.

## Owner request

Owner asked to work on retention and to fix the leaderboards, achievements and the ad banner
on GamePush/Пикабу. Reported symptom: the ad banner freezes during loading — the player sees
it, but its `3-2-1` countdown does not run, and after the load finishes they wait another
~3 seconds. The owner's intent was that the ad should consume the loading wait as "free time".

Owner decisions taken in-session: keep the fullscreen ad on every load; do not touch the title
screen. Final call on the ad, after seeing that ad and generation cannot share the main thread:
**overlap them deliberately.** The load waits only for the overlay to appear, generation then runs
underneath it, the countdown freezes for the load and finishes afterwards, and the player closes
the banner into a ready game. The owner's reasoning: the wait then reads as the ad's cost, not
the game's, and it is one wait instead of ad and load back to back.

## What was actually broken (source-verified)

1. **The ad timing was an `800` ms race.** `showPlatformFullscreenAd()` ignored the promise
   returned by `gp.ads.showFullscreen()` and instead waited up to `800` ms for a
   `fullscreen:start` event, so whether generation began before, during or after the overlay
   was pure luck. The GamePush overlay — including its countdown — is drawn on the page main
   thread, which generation blocks, so in the losing case the banner froze mid-flight.
2. **Ad and load cannot truly run in parallel.** Measured `generateFloor` (node, `tsx`): z=0
   `6851` ms, z=-1 `7504` ms, z=-2 `2194` ms — one synchronous call over world state and
   WebGL, not movable to a worker at reasonable cost. So the choice is only *which* order the
   player perceives; the owner chose overlap (see above), and the race was replaced by a
   deterministic "wait for the overlay, then generate under it" rule.
3. **No availability check.** Every `scheduleLoading` — floor change, samosbor rebuild,
   teleport, restart — requested an ad and burned the full `800` ms even when the platform had
   nothing to show.
4. **Sandbox scaffolding was still in production.** `fulfillSandboxTests` wrote
   `gp.player.set('score', 100)`, `gp.player.set('progress', 'test')` and called
   `changeLanguage` on the first `pointerdown`/`keydown` of every live player. `gamepush.md`
   claimed this had been removed; only the `mute`/`unmute` part had been. This is the cause of
   `2` real cloud saves out of `543` players, `238` players with `progress='test'`, and both
   leaderboards (`99388`, `99389`) reading a constant `100`.
5. **Leaderboards only ever saw saved runs.** Records were written exclusively inside
   `savePlatformRawGameSave`, and autosave is gated on `!gameOver` — a death, the most common
   run ending, never reported anything.
6. **Achievements did not exist in the code at all** — no `gp.achievements` call anywhere.

## What shipped

`src/systems/platform_bridge.ts`

- `showPlatformFullscreenAd()` rewritten: uses the SDK promise plus `fullscreen:close`, a `4` s
  "platform showed nothing" window, a `400` ms grace for a late `fullscreen:start` after an
  early promise settle, and a `60` s hard safety release. It resolves only once the slot is
  genuinely done, which is what lets the caller tell "nothing to show" from "showing now".
  Skips instantly when `isFullscreenAvailable === false` or `isAdblockEnabled === true`.
- New `isPlatformAdOnScreen()`: true while the overlay owns the screen.
- New `applyPlatformRecords()` (shared by the save path) writing `score` and `floor` only when
  the personal record actually grows, and new `submitPlatformLeaderboardStats(score, floor)`
  for run endings that never reach a save.
- New `unlockPlatformAchievement(tag)` over `gp.achievements.unlock({ tag })`, no-op off-portal,
  repeat unlocks dropped locally.
- `fulfillSandboxTests` reduced to the `gameStart` fallback only; the fake `score`/`progress`/
  language writes are gone.

`src/main.ts`

- The loading orchestration gained an explicit ad phase: the ad is requested once per load, the
  loop waits up to `PORTAL_AD_OPEN_WAIT_MS` (`1200` ms) for the overlay to appear, and then runs
  generation underneath it. The ad-driven pause is ignored for the duration of that load
  (`pageHiddenPause` still stops everything), and after generation the game sits paused behind
  the overlay on the normal `platformPause` path until the player closes the banner.
- One call to the new progress reporter in the existing progress-report site.

`src/systems/platform_progress.ts` (new) — depth/level/samosbor milestones and record submission
on death, new deepest floor and survived samosbor. Silent off-portal and in the title trailer world.

`tests/platform-ads-progress.test.ts` (new, 5 tests) — the ad stays unresolved while the overlay
is up, unavailable slots resolve instantly without calling the SDK, a slot that shows nothing
still resolves, records/milestones are real values, and nothing is reported off-portal.

## Owner action required (not doable from code)

- **Declare the achievement tags in the GamePush panel** for project `28314`, exactly:
  `FIRST_DESCENT`, `DEPTH_5`, `DEPTH_10`, `DEPTH_20`, `LEVEL_5`, `LEVEL_10`, `SAMOSBOR_SURVIVED`.
  Until they exist the SDK rejects the unlock; the game is unaffected either way.
- **Confirm the `floor` player field exists in the panel** (leaderboard `99389` reads it).
  Unknown fields raise `Field '...' not exists on player model` — see `gamepush.md` §3.
- After the next portal upload, re-check the two leaderboards: they should stop showing a
  constant `100` and start receiving real XP and depth values.

## Checks

`npm run typecheck` clean. `npm run check:readonly` exit `0`. `npm run test:unit`:
`1893` tests, `1892` pass, `0` fail, `1` skipped. Build and headless smoke run separately —
see the KPI line for the result. Live portal iframe QA is still owner-side and has not been done.

## Not done in this pass (explicitly)

- Funnel instrumentation (Полоса A in `retention.md`) — untouched.
- The double floor generation at boot (title trailer world, then a second `initGame` on "Начать")
  — owner chose not to touch the title screen this session. It remains the largest known
  time-to-play cost and the prime suspect behind the `56%` no-input rate.
- Build weight — untouched, and the earlier `11 476 096` byte figure was an online-mode build,
  not an older one. Offline (`npm run build`, itch and Pikabu) is `24 974 281` bytes
  (`5.93` MB gzip); Cloudflare/Pages is `11 482 610` bytes (`3.53` MB gzip) because it swaps
  `src/data/markov_compiled_matrix.ts` (`15 411 045` bytes, compiled 2026-08-06 12:24) for the
  stub. `src/data/bad_apple_frame_pack.ts` (`4 313 636` bytes) is inlined in both. The Pikabu ZIP is effectively unchanged (`13 034 160` bytes
  now versus `13 031 440` on 2026-08-06), so the download is the same size but the browser
  parses `25` MB of JS before the first frame. Fetching the corpus lazily, as music already is,
  is the open lever.

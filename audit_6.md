# audit_6.md - AI, Pathfinding, Movement, Actor Cadence

## Assignment

You are subagent 6. Audit active-floor AI, NPC/monster finite-state behavior, pathfinding, broadphase use, movement and actor update cadence. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `ai.md`
- `fight.md`
- `optimization.md`
- `block.md`

Then inspect focused code and tests:

- `src/systems/ai/`
- `src/systems/entity_index.ts`
- `src/systems/movement_collision.ts`
- `src/core/path_blockers.ts`
- `src/systems/fog_shark.ts`
- monster AI hooks
- movement/pathfinding tests under `tests/`

## Scope

Find concrete problems and improvements around:

- per-frame full-world scans or per-actor expensive path work
- actor-local cooldowns, bounded slices and cache invalidation
- AI logic that is player-bubble biased despite the full-pass isotropic contract
- storage-order truncation of actors, rooms, targets or threats
- duplicated passability, LOS, target scoring or movement code
- path blockers not respected consistently by player and AI movement
- stale paths after geometry mutation, samosbor or door changes
- allocation-heavy closures/objects in hot AI loops
- AI hardcoding one faction, NPC, monster or quest instead of using definitions/events

Prioritize issues that can become tests or clear runtime fixes.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Every finding must cite file and line evidence.

## Audit Results

### Coverage

- Files and docs reviewed:
  - `README.md`
  - `AGENTS.md`
  - `architecture.md`
  - `ai.md`
  - `fight.md`
  - `optimization.md`
  - `block.md`
  - `src/systems/ai/index.ts`
  - `src/systems/ai/combat.ts`
  - `src/systems/ai/monster.ts`
  - `src/systems/ai/pathfinding.ts`
  - `src/systems/ai/npc_fsm.ts`
  - `src/systems/ai/npc_utility.ts`
  - `src/systems/ai/npc_emergency.ts`
  - `src/systems/ai/tactics.ts`
  - `src/systems/entity_index.ts`
  - `src/systems/movement_collision.ts`
  - `src/systems/combat_stimulus.ts`
  - `src/systems/fog_shark.ts`
  - `src/core/path_blockers.ts`
  - focused tests: `tests/ai-full-pass.test.ts`, `tests/ai-pathfinding.test.ts`, `tests/ai-tactics.test.ts`, `tests/entity-index.test.ts`, `tests/path-blockers-movement.test.ts`, `tests/player-damage.test.ts`
- Commands run:
  - `git status --short`
  - `sed -n ... README.md audit_6.md AGENTS.md architecture.md ai.md fight.md optimization.md block.md`
  - `rg --files src/systems/ai src/systems src/core tests | rg '(ai/|entity_index|movement_collision|path_blockers|fog_shark|path|movement|monster|blocker)'`
  - `nl -ba ... | sed -n ...` on the focused source and test files above
  - `rg -n ...` for `queryRadiusCapped`, `queryPathRadius`, path assignment, room scans, combat stimulus, blocker versions and target-memory terms
  - `git diff -- audit_6.md`
- Areas not covered and why:
  - No runtime tests or npm checks were run because this audit's rule set permits read-only inspection and forbids write-producing validation commands.
  - I did not inspect every monster-specific branch in the 9k-line `monster.ts` end to end; I traced shared target acquisition, common update flow, and rg-selected hooks around pathing, targeting, damage and capped queries.
  - I did not inspect archive/reference material because the active assignment named root docs and current source/tests only.

### Findings

- `A6-01`
- Severity: `major`
- Location: `src/systems/entity_index.ts:607`, `src/systems/entity_index.ts:634`, `src/systems/entity_index.ts:657`, `src/main.ts:3034`, `src/main.ts:3136`, `src/main.ts:3140`
- Evidence:
  - `queryPathRadius()` accepts a cap but appends candidates in bucket/sample traversal order and returns immediately when `out.length >= maxResults` (`src/systems/entity_index.ts:607`, `src/systems/entity_index.ts:634`, `src/systems/entity_index.ts:657`).
  - Projectile collision uses that capped path query with `PROJECTILE_HIT_QUERY_CAP = 48` and `FLAME_HIT_QUERY_CAP = 64` (`src/main.ts:3034`) before selecting `nearestHit` only from the returned subset (`src/main.ts:3136`, `src/main.ts:3140`).
  - Existing tests prove capped radius queries keep nearest results (`tests/entity-index.test.ts:151`) and one uncapped toroidal swept projectile query works (`tests/player-damage.test.ts:219`), but there is no capped path-query ordering test.
- Why this is a real problem:
  - In a dense beam/projectile lane, the cap can exclude the actual first actor along the projectile path if earlier bucket traversal fills `out` first. The later nearest-hit pass is then correct only within a biased subset. That can make bullets/flame/webs hit the wrong actor or miss a closer actor under crowd density, and the bias is storage/bucket traversal rather than gameplay scoring.
- 100% doable improvement:
  - Make `queryPathRadius()` use the same "keep best capped candidates" discipline as `queryRadiusCapped()`, ordered by path hit parameter `t`, perpendicular distance, then stable id. Alternatively, keep `queryPathRadius()` broad and add a projectile-specific capped collector that never early-returns before proving later buckets cannot beat the current worst hit.
- Validation after fix:
  - Add an entity-index test with more than `maxResults` actors near a line where the closest path hit is encountered after cap-filling bucket entries, then assert the closest hit is retained.
  - Add a projectile collision test with dense NPCs around the sweep and assert the projectile damages the earliest valid actor along the path.
- Related systems touched:
  - `systems/entity_index.ts`, projectile collision in `main.ts`, `tests/entity-index.test.ts`, `tests/player-damage.test.ts`.

- `A6-02`
- Severity: `major`
- Location: `src/systems/ai/monster.ts:2800`, `src/systems/ai/monster.ts:2807`, `src/systems/ai/monster.ts:8906`, `src/systems/ai/monster.ts:9071`, `src/systems/ai/monster.ts:9080`, `src/systems/ai/pathfinding.ts:855`
- Evidence:
  - `findCombatTarget()` validates cached targets only while they remain alive, type-allowed, hostile and inside `rangeSq`; otherwise it clears `combatTargetId` (`src/systems/ai/monster.ts:2800`, `src/systems/ai/monster.ts:2807`).
  - When `updateMonster()` has no target, it cancels some special state and falls through to noise/wander/idling (`src/systems/ai/monster.ts:8906`).
  - Chase path assignment runs every 2 seconds, but the return status from `tryAssignPathToCell()` is ignored (`src/systems/ai/monster.ts:9071`, `src/systems/ai/monster.ts:9080`).
  - Shared `followPath()` resets a stuck actor to `AIGoal.IDLE` after 3 seconds but does not feed an unreachable penalty back into target scoring (`src/systems/ai/pathfinding.ts:855`).
- Why this is a real problem:
  - The damage-stimulus work added short target memory, but generic monster acquisition still has no last-known-position pursuit or unreachable/frustration penalty. A monster can drop a target as soon as it exits detect range or become a repeated "assign path to blocked chase cell, fail, reset, retry" loop. This weakens the stated fight contract that mobs should not lose a target after one corner and should recover from dead wall aggression.
- 100% doable improvement:
  - Store transient `lastKnownTargetX/Y`, `targetLostUntil`, and `targetPathFailures` on `AIState` when a target is valid or comes from `getRecentCombatThreat()`. If the current target leaves range briefly, chase the last known cell before clearing. If `tryAssignPathToCell()` returns `not_found` or `followPath()` clears stuck state repeatedly, penalize that target or force a short retarget/search window.
- Validation after fix:
  - Unit test: monster sees/damages a player/NPC, target moves just outside detect or behind a wall corner, monster moves toward last known cell for a bounded window instead of instantly wandering.
  - Unit test: unreachable target behind sealed/locked topology increments path failure and is dropped or deprioritized after a bounded number of failures.
- Related systems touched:
  - `systems/ai/monster.ts`, `systems/ai/pathfinding.ts`, `systems/combat_stimulus.ts`, `tests/ai-full-pass.test.ts`, `tests/ai-pathfinding.test.ts`.

- `A6-03`
- Severity: `major`
- Location: `src/systems/combat_stimulus.ts:274`, `src/systems/combat_stimulus.ts:288`, `src/systems/combat_stimulus.ts:290`, `src/systems/ai/npc_fsm.ts:481`, `src/systems/ai/npc_fsm.ts:483`
- Evidence:
  - `notifyActorDamaged()` records threat memory and applies reaction only to the damaged victim (`src/systems/combat_stimulus.ts:274`, `src/systems/combat_stimulus.ts:288`, `src/systems/combat_stimulus.ts:290`).
  - The helper publishes player-hurt-NPC and kill events, but it does not query nearby allies/witnesses or apply any local alert to them (`src/systems/combat_stimulus.ts:291`, `src/systems/combat_stimulus.ts:292`).
  - Nearby NPC threat awareness currently relies on the ordinary utility snapshot's later capped local scan (`src/systems/ai/npc_fsm.ts:481`, `src/systems/ai/npc_fsm.ts:483`) rather than an immediate local event/witness reaction.
  - Existing combat-stimulus tests cover victim flee/fight and kill events (`tests/ai-full-pass.test.ts:363`, `tests/ai-full-pass.test.ts:383`, `tests/ai-full-pass.test.ts:427`), but not ally/witness response.
- Why this is a real problem:
  - Group behavior remains weaker than the local-event contract: a guard next to an attacked citizen may not get a same-frame alert unless its own later scan sees a hostile inside its local utility radius and cadence. Ranged damage, explosions, or attacks just outside the utility scan radius produce victim reaction but no bounded "call allies / witness panic" propagation.
- 100% doable improvement:
  - In `notifyActorDamaged()`, run one capped `EntityIndex.queryRadiusCapped()` around the victim or attacker, e.g. 16-24 actors inside a small radius. For same-faction armed/brave allies, set a short combat hint toward the attacker; for civilians/scientists, set a brief flee/panic hint or publish a compact witnessed damage event. Keep it transient, capped, and cooldowned.
- Validation after fix:
  - Test: monster damages an unarmed citizen near an armed liquidator; the citizen flees and the liquidator gets `combatTargetId` for the monster without waiting for a utility rethink.
  - Test: player accidentally wounds an NPC; nearby same-faction NPCs get relation/alert consequences through a capped witness path, not global knowledge.
- Related systems touched:
  - `systems/combat_stimulus.ts`, `systems/entity_index.ts`, `systems/ai/combat.ts`, `systems/events.ts`, `tests/ai-full-pass.test.ts`.

- `A6-04`
- Severity: `major`
- Location: `src/systems/ai/tactics.ts:372`, `src/systems/ai/tactics.ts:377`, `src/systems/ai/tactics.ts:378`, `src/systems/ai/tactics.ts:381`, `src/systems/ai/tactics.ts:407`, `src/systems/ai/tactics.ts:559`
- Evidence:
  - `assignAndFollow()` calls `tryAssignPathToCell()` but ignores whether it returned `assigned`, `same`, or `not_found`, then always follows and returns `true` (`src/systems/ai/tactics.ts:372`, `src/systems/ai/tactics.ts:377`, `src/systems/ai/tactics.ts:378`, `src/systems/ai/tactics.ts:381`).
  - `tryFleeFromPoint()` treats any coarse `walkableCell()` candidate as success because it returns `assignAndFollow()` directly (`src/systems/ai/tactics.ts:407`, `src/systems/ai/tactics.ts:408`).
  - `slimeFleeCrowd()` converts that success into a handled tactic (`src/systems/ai/tactics.ts:559`), preventing fallback to generic monster behavior for the frame.
- Why this is a real problem:
  - A tactic can claim the actor handled the frame even when no path was assigned. In blocked or disconnected geometry, the profiled actor can repeatedly consume its AI frame without moving, attacking, or falling back. This is especially visible for the slime woman crowd flee/wet retreat/isolated ambush profile, and the pattern is risky for future profiles using this generic runner.
- 100% doable improvement:
  - Make `assignAndFollow()` return `false` on `not_found`. In `tryFleeFromPoint()`, continue trying alternate distances/bends when assignment fails. For retreat/ambush targets, either return `none` on failure so generic monster AI can run or add a bounded local sidestep using `canActorOccupy()`.
- Validation after fix:
  - Add a tactic test with a slime woman whose first flee/retreat target is coarse-walkable but unreachable; assert the tactic tries another candidate or returns unhandled instead of setting a handled no-op.
- Related systems touched:
  - `systems/ai/tactics.ts`, `systems/ai/pathfinding.ts`, `systems/movement_collision.ts`, `tests/ai-tactics.test.ts`.

- `A6-05`
- Severity: `minor`
- Location: `src/systems/ai/pathfinding.ts:537`, `src/systems/ai/pathfinding.ts:556`, `src/systems/ai/pathfinding.ts:970`, `src/systems/ai/pathfinding.ts:992`, `src/systems/ai/pathfinding.ts:846`, `src/systems/ai/pathfinding.ts:857`
- Evidence:
  - `tryAssignPathToCell()` builds a coarse cell path to the target cell and does not reject a fine-blocked target center before assigning (`src/systems/ai/pathfinding.ts:537`, `src/systems/ai/pathfinding.ts:556`).
  - `wanderNearby()` and `wanderInRoom()` filter candidate cells with `world.solid()` only (`src/systems/ai/pathfinding.ts:970`, `src/systems/ai/pathfinding.ts:992`).
  - Fine blockers are enforced later during movement by `canActorOccupy()` (`src/systems/ai/pathfinding.ts:846`), and the fallback on repeated failure is a generic stuck reset (`src/systems/ai/pathfinding.ts:857`).
  - Path-blocker tests cover occupancy and sliding (`tests/path-blockers-movement.test.ts:52`, `tests/path-blockers-movement.test.ts:68`), while AI pathfinding tests cover path smoothing and door topology but not fine-blocked final targets (`tests/ai-pathfinding.test.ts:282`).
- Why this is a real problem:
  - This respects the "coarse pathfinding remains cell-level" contract, but target selection can still choose the center of a passable cell occupied by a table/bed/container blocker. The actor then walks toward a valid coarse cell and only discovers the blocker while following the path, producing avoidable stuck resets and repeated retargeting near dense furniture.
- 100% doable improvement:
  - Keep nav coarse, but make target resolution choose an occupiable subcell before assignment. `tryAssignPathToCell()` can keep its coarse API while callers such as `wanderNearby()`, `wanderInRoom()`, room-center targeting and tactic targets use a helper like `resolveActorOccupiableTargetInCell(world, e, tx, ty)` with a few deterministic offsets checked through `canActorOccupy()`.
- Validation after fix:
  - Add an AI pathfinding test that stamps a table-like path blocker in the target room center, asks an NPC to wander/goto that room, and asserts it selects a clear offset or returns `not_found` without accumulating stuck.
- Related systems touched:
  - `systems/ai/pathfinding.ts`, `systems/movement_collision.ts`, `core/path_blockers.ts`, `tests/ai-pathfinding.test.ts`, `tests/path-blockers-movement.test.ts`.

### Hot Loop / Cadence Table

| Area | Current bound/cadence | Audit result | Proposed bounded alternative |
| --- | --- | --- | --- |
| `updateAI()` live actor pass (`src/systems/ai/index.ts:145`) | Full pass over `entityIndex.ai` every simulation frame; player skipped by identity | Matches full-pass isotropic contract; not a finding | Keep full pass, continue moving expensive choices behind actor-local cooldowns and capped queries |
| Entity index simulation rebuild (`src/systems/entity_index.ts:253`) | Dynamic entities rebucketed per simulation frame; static visible layer reindexed/pruned separately | Improved over the older full static rebuild; not a finding | Preserve dynamic/static split and add equivalence tests when query semantics change |
| Capped radius query (`src/systems/entity_index.ts:520`) | Keeps nearest capped results by distance and id | Good bounded pattern | Use the same scoring discipline for path/swept queries |
| Capped path query (`src/systems/entity_index.ts:607`) | Stops when cap is filled in bucket/sample order | Finding `A6-01` | Maintain capped best candidates by path hit `t`, perpendicular distance and id |
| Monster target scan (`src/systems/ai/monster.ts:2820`) | Cached target plus periodic capped radius rescan | Mostly bounded, but target loss/path failure has no last-known/unreachable state | Add transient last-known pursuit and bounded failure penalty |
| NPC utility threat scan (`src/systems/ai/npc_fsm.ts:481`) | Radius 16, cap 32, on utility cadence | Good for routine utility, too delayed for witness/ally combat reaction | Add same-frame capped local propagation in damage stimulus |
| Routine room targeting (`src/systems/ai/npc_fsm.ts:852`) | Stable actor/intent scan start, max 96 rooms, candidate cap 8 after scoring | Acceptable actor-keyed rotated window; not fixed-prefix | Keep rotated window, add fine-blocker-aware target offset selection |
| Behavior flow fields (`src/systems/ai/pathfinding.ts:313`) | Cached by world/cell version/room count, max 16 fields | Good shared pathing pattern | Keep cache; add source-specific invalidation only if future non-room source providers need it |
| Tactic facts (`src/systems/ai/tactics.ts:291`) | Profile sense interval plus jitter, capped actor scans | Good cadence, but path assignment status is ignored | Return false on `not_found`, try alternate local candidates before claiming handled |

### Highest-Impact Fix Order

1. Fix `queryPathRadius()` capped ordering before tuning projectile combat. This is the clearest correctness bug with a deterministic unit test.
2. Add target last-known/search and path-failure penalties to generic monster chasing. This directly affects perceived mob danger and prevents dead wall aggression.
3. Extend `notifyActorDamaged()` with capped ally/witness propagation. This gives groups readable local reactions without a broad AI rewrite.
4. Make tactic path assignment status-aware. This prevents profiled monsters from consuming frames on no-op path failures.
5. Add fine-blocker-aware target offset resolution for routine/room/tactic path targets. This is lower severity because movement collision already prevents clipping, but it reduces avoidable stuck churn.

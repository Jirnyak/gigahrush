# audit_7.md - Combat, Weapons, Damage, PSI, Possession

## Assignment

You are subagent 7. Audit combat systems, projectiles, weapon stats, PSI tools, damage routing, target pressure and possession/player-entity behavior. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `fight.md`
- `items.md`
- `balance.md`
- `ai.md`

Then inspect focused code and tests:

- `src/systems/ai/combat.ts`
- `src/systems/weapon_beams.ts`
- combat/damage/projectile systems under `src/systems/`
- `src/data/weapons.ts`
- `src/data/psi.ts`
- weapon and PSI items in `src/data/items.ts`
- possession/player-reference logic in systems and `src/main.ts`
- relevant tests under `tests/`

## Scope

Find concrete problems and improvements around:

- inconsistent damage application between player, NPCs and monsters
- player-only special cases that should use current `player` entity reference
- weapon stat definitions not matching item/resource/ammo hooks
- PSI stat definitions, possession restore behavior and lower-INT targeting
- projectile/beam line traversal, toroidal math and bounded deletion effects
- friendly fire, faction hostility and event publishing gaps
- combat target scoring, tactical readability and hardcoded threat choices
- duplicate damage, cooldown, ammo, hit or LOS code
- missing tests for weapon/PSI behavior that already has clear contracts

Focus on concrete, implementable findings rather than broad combat redesign.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Every finding must cite file and line evidence.

### Coverage

- Files and docs reviewed: `README.md`, `AGENTS.md`, `architecture.md`, `fight.md`, `items.md`, `balance.md`, `ai.md`; `src/systems/ai/combat.ts`, `src/systems/weapon_beams.ts`, `src/systems/combat_stimulus.ts`, `src/systems/psi.ts`, `src/systems/player_actor.ts`, `src/systems/factions.ts`, `src/systems/monster_armor.ts`, `src/systems/monster_traits.ts`, `src/systems/monster_counterplay.ts`, focused `src/main.ts` combat/projectile/player sections, `src/data/weapons.ts`, `src/data/psi.ts`, focused `src/data/items.ts`, `src/data/catalog.ts`, `src/core/types.ts`; focused tests under `tests/ai-full-pass.test.ts`, `tests/psi-system.test.ts`, `tests/player-damage.test.ts`, `tests/data-ids.test.ts`, `tests/inventory-rpg.test.ts`, `tests/items_058_pistol_grenade_launcher.test.ts`, `tests/items_067_pbrog1_foam_launcher.test.ts`.
- Commands run: `git status --short`; `sed -n ...`; `nl -ba ... | sed -n ...`; `rg -n ...`; `rg --files ...`.
- Areas not covered and why: I did not run build/check/test commands because the assignment forbids write-producing commands and asks for a read-only audit. I did not exhaustively line-read all of `src/systems/ai/monster.ts` because it is very large; I used focused searches for combat stimulus, projectile, player-damage and special-damage call sites, then inspected the relevant surrounding ranges.

### Findings

#### A7-01

- Severity: major
- Location: `src/main.ts:3182`, `src/main.ts:3317`, `src/systems/ai/combat.ts:536`, `src/systems/factions.ts:454`
- Evidence: Visual projectile hits apply relation/faction consequences only when `e.type === EntityType.NPC && isPlayerOwnedProjectile(p)` (`src/main.ts:3182`). Explosion splash does the same only for player-owned projectiles (`src/main.ts:3317`). The non-visual distant NPC ranged path does apply `applyDamageRelationPenalty(e.faction, target.faction, dmg, target, e, state)` for NPC shooters (`src/systems/ai/combat.ts:536`), and the relation helper already supports NPC-vs-NPC Demos relation deltas (`src/systems/factions.ts:454`).
- Why this is a real problem: The same NPC shooter has different social consequences depending on whether the runtime path uses real visual projectiles or the distant/simple path. NPC-owned bullets, pellets and explosions can hurt neutral/allied NPCs without personal relation, faction relation, Demos relation or karma consequences, while player-owned friendly fire is penalized.
- 100% doable improvement: In projectile direct-hit and explosion paths, resolve `actor = projectileActor(p)` once and call `applyDamageRelationPenalty(actor.faction, e.faction, damage, e, actor, state)` for any actor-owned hit on an NPC. Keep the existing `recordFactionClashPlayerHit()` as the player-specific extra hook. If same-faction accidental fire should be gentler, put the threshold/cooldown inside this generic projectile damage branch, not only in player code.
- Validation after fix: Add tests where an NPC-owned projectile and an NPC-owned explosion hit a same-faction or neutral NPC and assert the relation/Demos delta path fires; keep an existing player-owned projectile relation test to prove player behavior did not regress.
- Related systems touched: projectile update, explosion damage, factions, Demos social relation deltas, NPC combat.

#### A7-02

- Severity: major
- Location: `src/systems/psi.ts:199`, `src/systems/psi.ts:235`, `src/systems/psi.ts:482`, `src/systems/psi.ts:525`, `src/main.ts:2776`, `src/main.ts:3186`, `src/systems/combat_stimulus.ts:274`
- Evidence: `castStorm()` directly subtracts HP (`src/systems/psi.ts:199`), `castBrainBurn()` directly sets `hp = 0` and `alive = false` (`src/systems/psi.ts:235`), `castBeam()` directly subtracts HP (`src/systems/psi.ts:482`), and `psiAoeExplosion()` directly subtracts HP (`src/systems/psi.ts:525`). These paths do not call `notifyActorDamaged()`, unlike player melee (`src/main.ts:2776`) and projectile hits (`src/main.ts:3186`). The generic stimulus hook is the shared damage reaction/event path (`src/systems/combat_stimulus.ts:274`).
- Why this is a real problem: Instant PSI and PSI splash damage bypass the shipped combat stimulus layer. NPC victims do not get threat memory/flee/fight hints, `player_hurt_npc` events do not fire for non-lethal hits, and PSI splash lacks the relation handling covered in A7-01. It also makes PSI damage feel like a separate private combat system instead of the same actor-oriented damage route.
- 100% doable improvement: Give PSI damage helpers a small damage context `{ state, actor, source, weaponId }` and route every damaging PSI effect through one shared actor damage helper that applies HP, `notifyActorDamaged()`, player damage recording, relation penalties and kill handling. Non-damaging PSI effects can stay as direct status changes.
- Validation after fix: Add tests for `psi_storm` or `psi_beam` hitting a weak NPC: HP drops, `combatTargetId`/flee reaction is set through combat stimulus, and a local `player_hurt_npc` event appears for player-caused non-lethal damage.
- Related systems touched: PSI, combat stimulus, events, factions, NPC combat.

#### A7-03

- Severity: major
- Location: `src/main.ts:3167`, `src/main.ts:3209`, `src/main.ts:3214`, `src/main.ts:3284`, `src/systems/psi.ts:518`, `tests/items_058_pistol_grenade_launcher.test.ts:35`
- Evidence: On projectile body hit, the direct path subtracts `e.hp -= dmg` (`src/main.ts:3167`). For grenade/BFG hits it then triggers explosion (`src/main.ts:3209`), and for other AoE projectiles it calls `psiAoeExplosion()` (`src/main.ts:3214`), whose loop can hit the same target again unless it is the owner (`src/systems/psi.ts:518`). At the same time, `triggerExplosion()` skips the projectile owner entirely (`src/main.ts:3284`), and `psiAoeExplosion()` also skips `proj.ownerId` (`src/systems/psi.ts:518`). The pistol grenade launcher is explicitly tagged `self_risk` in its test contract (`tests/items_058_pistol_grenade_launcher.test.ts:35`).
- Why this is a real problem: AoE impact damage is ambiguous and likely inflated: a direct-hit victim can take direct projectile damage plus full/near-full splash. The shooter, however, is immune to their own blast, which contradicts self-risk tags and item copy such as "throw and hide" style explosive behavior. This weakens tactical readability and makes blast weapons safer and spikier than their stats/descriptions suggest.
- 100% doable improvement: Pick one explicit AoE contract. Recommended: AoE projectiles detonate on body/wall/floor impact and the blast pass is the only damage pass, with optional direct-impact bonus as a separate stat if ever needed. Then allow owner splash after a short arming grace or minimum distance rule so self-risk weapons can actually self-damage.
- Validation after fix: Add direct-hit tests for `grenade` and `psi_rupture` that assert one expected damage route, plus a close-range owner splash test for `pistol_grenade_launcher` or hand grenade.
- Related systems touched: projectile update, explosion damage, PSI AoE, item/weapon balance tests.

#### A7-04

- Severity: design-intended, not a bug
- Location: `src/main.ts:2704`, `src/main.ts:2943`, `src/main.ts:2948`, `src/systems/psi.ts:356`, `src/main.ts:1157`, `src/main.ts:7432`, `src/core/types.ts:616`
- Evidence: Projectiles store only `ownerId` (`src/core/types.ts:616`), and player-fired projectiles set it to the current `player.id` at fire time (`src/main.ts:2704`). Later, `projectileActor()` returns the current `player` only if `p.ownerId === player.id`, otherwise it looks up the owner by id (`src/main.ts:2943`). `isPlayerOwnedProjectile()` is dynamic: it checks `p.ownerId === player.id || isPlayerEntity(projectileActor(p))` (`src/main.ts:2948`). PSI possession stores previous/target ids (`src/systems/psi.ts:356`), swaps the global `player` reference (`src/main.ts:1157`), and update loop restores through `makeCurrentPlayer(updatePsiEffects(...).player)` (`src/main.ts:7432`).
- Why this is intentional: Projectile ownership changes meaning when the current player entity changes because possession is an emergent body-swap mechanic. A grenade fired by the native body before possession can stop counting as player-owned if it lands after possession; a projectile fired while possessing another actor can stop counting as player-owned if possession expires before impact. That is part of the isotropic world contract: the world reads entities, not a hidden original-player attribution layer.
- Do not fix away: Do not snapshot hidden control ownership onto all projectiles just to preserve player credit, XP, relation penalties or event blame across possession. Consequences should remain attached to the acting entity unless a future PSI effect explicitly defines a psychic signature.
- Allowed improvement: Add UI/log clarity or tests that lock this possession contract as intended design. If a future spell needs traceable consciousness, introduce a specific `psychic_signature`-style rule rather than changing generic projectile ownership.
- Related docs: `psi.md`.

#### A7-05

- Severity: major
- Location: `src/data/weapons.ts:81`, `src/data/weapons.ts:112`, `src/main.ts:2675`, `src/systems/ai/combat.ts:471`, `src/systems/ai/combat.ts:561`, `src/systems/weapon_beams.ts:210`
- Evidence: `gravity_beam_emitter` and `ato41_atomic_flamer` are declared with `deletionBeam: true` (`src/data/weapons.ts:81`, `src/data/weapons.ts:112`). The player ranged branch checks `ws.deletionBeam` and calls `fireDeletionBeam()` (`src/main.ts:2675`). The NPC ranged commit path only handles ammo/PSI and then calls `npcFireProjectile()` (`src/systems/ai/combat.ts:471`), whose projectile construction just copies `projType`/damage into a normal projectile (`src/systems/ai/combat.ts:561`). The deletion beam kill path itself sets target HP to 0 and `alive = false` directly (`src/systems/weapon_beams.ts:210`).
- Why this is a real problem: The same executable weapon stat does not mean the same thing for player and NPCs. A player GBE deletes cells/containers/targets; an NPC with the same weapon fires an ordinary high-damage projectile. Separately, beam target kills bypass the regular damage/armor/stimulus route, so armored or counterplay monsters cannot participate unless the bypass is deliberately declared.
- 100% doable improvement: Centralize deletion-beam firing behind a shared weapon-fire helper. Either explicitly disallow NPC auto-use of deletion beams, or teach `npcCommitRangedShot()` to call the same bounded beam path with state/kill handling. For target damage, use the shared damage helper with `ProjType.BEAM`/weapon id unless deletion beams are intentionally unresistable, in which case publish a distinct bypass event.
- Validation after fix: Add a focused test that an NPC carrying `gravity_beam_emitter` either cannot select it or produces the same cell/target beam result as the player. Add an armored-monster beam test for the intended armor/counterplay behavior.
- Related systems touched: weapon stats, NPC ranged combat, deletion beam, monster armor/counterplay, events.

#### A7-06

- Severity: minor
- Location: `src/main.ts:2746`, `src/main.ts:2750`, `src/main.ts:2754`
- Evidence: Player melee queries actors around the swing point (`src/main.ts:2746`), then chooses the target with the smallest `entityIndex.orderOf(candidate)` (`src/main.ts:2754`) rather than by forward projection, angle, distance to swing center, or reach line. The README/architecture contract forbids gameplay-visible storage-order bias.
- Why this is a real problem: In a crowded fight, the actor hit by a melee swing can depend on entity array/index insertion order, not the visible body closest to the weapon path. That makes melee unreliable and violates the project's storage-order-is-not-physics rule.
- 100% doable improvement: Score melee candidates by geometric fit: in-front projection along `player.angle`, perpendicular distance to the swing line/arc, distance from the swing point, then stable id as a final tie-breaker. Do not use entity index order except as a deterministic final tie.
- Validation after fix: Add a test with two overlapping melee candidates in reversed entity-array order; the same geometrically best target should be hit both times.
- Related systems touched: player melee targeting, entity index tests.

### Combat Consistency Matrix

| Area | Item/stat contract | Runtime path | Event/reaction path | Current tests | Mismatch |
| --- | --- | --- | --- | --- | --- |
| Physical player melee | `WEAPON_STATS` melee damage/range/durability | `playerActions()` applies armor, HP, blood, durability | `notifyActorDamaged()`, relation penalty for NPC targets, kill events | RPG/inventory and damage tests cover parts | Target choice is storage-order biased in crowds. |
| NPC melee/distant simple ranged | Shared `WEAPON_STATS` | `tryFactionCombat()` applies melee or distant ranged damage | Uses `notifyActorDamaged()` and NPC relation penalty | `ai-full-pass` covers damage stimulus reactions | Mostly coherent. |
| Visual projectile direct hit | `WEAPON_STATS` projectile fields, owner id only | Swept toroidal path hits one nearest body, applies armor/counterplay | `notifyActorDamaged()` runs, but relation penalty is player-owned only | Toroidal swept query test exists | NPC-owned friendly fire lacks relation/social consequences. |
| Explosion / AoE projectile | `aoeRadius`/`aoeDmg`, explosive self-risk tags for some weapons | Direct hit damage can be followed by blast damage; owner skipped | `notifyActorDamaged()` in `triggerExplosion()`, player-owned relation penalty only | Item stat tests cover values/tags, not runtime blast semantics | Direct-hit double damage and missing owner self-risk are untested. |
| Instant PSI damage | `PSI_WEAPON_STATS` instant effects and costs | `psi.ts` subtracts HP directly for storm/beam/AoE and kills directly for brain burn | No combat stimulus or relation path for non-lethal hits | PSI tests cover shield/possession/catalog coherence | PSI damage is outside the generic actor damage route. |
| Possession/projectile ownership | Current player entity can swap | Projectiles store only `ownerId` | Player-owned check is dynamic against current `player` | Possession expiry/lower-INT tests exist | Intended possession contract: delayed projectile credit can change when player entity changes. |
| Deletion beam | Weapon stat says `deletionBeam` | Player uses `fireDeletionBeam()`; NPC path fires normal projectile | Beam target kill bypasses ordinary damage route | Item tests cover stat flag only | Player/NPC behavior mismatch and armor/stimulus bypass. |

### Highest-Impact Fix Order

1. Add a small shared actor-damage helper or extend the current combat stimulus call sites so projectile, explosion and PSI damage consistently apply HP, relation, events, stimulus and kill handling.
2. Fix NPC-owned projectile/explosion friendly-fire consequences using the resolved projectile actor, not only `isPlayerOwnedProjectile()`.
3. Decide and test the AoE damage contract: direct-hit-only, blast-only, or explicit direct-plus-blast, then restore real self-risk for explosive weapons.
4. Centralize deletion beam firing for player/NPC parity or explicitly gate it away from NPC auto-use.
5. Replace player melee target selection by entity-index order with geometric swing scoring.

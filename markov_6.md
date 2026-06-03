# Markov Batch 6: Final Orchestrator

> Run this only after `markov_1.md` through `markov_5.md` have completed and
> their tests pass. You are integrating parallel work into one gameplay path.

## Objective

Wire the Markov NPC Text system into the game so all ordinary procedural speech
surfaces use one router while authored/exact text remains untouched.

This orchestrator may edit existing integration files:

- `src/systems/dialogue.ts`
- `src/systems/rumor.ts`
- `src/systems/quests.ts`
- `src/systems/ai/barks.ts`
- `src/systems/world_log.ts`
- `src/systems/demos.ts`
- `src/render/demos_ui.ts`
- focused tests
- `README.md`, `save.md`, `demos.md` only if shipped facts change
- save files only if persistent Demos feed is deliberately shipped

Do not edit `main.ts`, `core/world.ts` or `render/webgl.ts` unless a truly
generic hook is unavoidable. Prefer narrow module imports.

## Mandatory Intake

Read:

- `AGENTS.md`
- `README.md`
- `architecture.md`
- `scenarist.md`
- `markov.md`
- `markov_0.md`
- `markov_1.md` through `markov_5.md`
- all new Markov modules and tests
- touched integration files

Check:

```bash
git status --short
```

Do not revert unrelated dirty files.

## Integration Order

1. Run targeted tests from workers if practical.
2. Review exported APIs and remove duplicate type definitions if parallel
   workers created compatible local copies.
3. Wire `dialogue.ts`:

```txt
plot/authored locked exact
ordinary context Markov/router
rumor flavor Markov/router
AI state exact fallback
curated_pool fallback through router
```

4. Wire `rumor.ts` only so selected rumor facts stay authoritative and optional
   flavor comes from router.
5. Wire `quests.ts` only for procedural quest speech/description surfaces.
   Authored plot and side quest copy remains exact.
6. Wire `ai/barks.ts` only for ambient/lead/witness flavor. Combat, flee,
   wounded critical and samosbor safety lines remain exact.
7. Keep `world_log.ts` structural `eventText()` exact. Add or route only
   explicit NPC speech events if worker modules support them.
8. Wire Demos transient feed:
   - import `demos_posts` system;
   - expose feed snapshot in `demos.ts`;
   - draw ready view model in `demos_ui.ts` or nested feed helper;
   - do not generate text in render.
9. Decide persistence:
   - default: transient feed, no save change;
   - if persistent feed/reactions are shipped, bump `SAVE_SHAPE_VERSION`, add
     serializer/sanitizer/caps, reject stale saves, update `save.md`.

## Required Integration Tests

Add or update focused tests proving:

- ordinary NPC talk can use router;
- authored plot talk remains byte-for-byte exact;
- rumor flavor preserves `rumorId`;
- procedural quest text cannot invent target/reward/deadline;
- ambient bark can use router;
- alert/combat bark remains exact;
- structural world log remains exact;
- Demos post/reaction text reconstructs deterministically;
- fallback rate is not dominant in a small context matrix;
- no generated line contains unresolved slots or forbidden tone terms.

## Validation

Run:

```bash
npm run check
```

Also run:

```bash
npm run check:browser
```

when Demos UI/render or browser behavior changes and Chrome is available.

If any check fails, inspect the real error and fix it. If skipped, report exact
reason.

## Acceptance

- one speech router handles ordinary procedural speech surfaces;
- no authored plot/side/design text is regenerated;
- no exact critical warning or combat command becomes variable;
- no generated output invents facts;
- no per-frame full-world/A-Life scan;
- no save shape change unless persistent Demos feed is actually implemented;
- docs updated only for shipped facts.

## Anti-Patterns

Reject:

- broad AI rewrite;
- content-specific logic in red files;
- render-side text generation;
- JSON graph Demos persistence;
- ordinary NPC refill;
- hiding missing gameplay facts behind generated prose;
- replacing all `world_log.ts` messages with Markov text.

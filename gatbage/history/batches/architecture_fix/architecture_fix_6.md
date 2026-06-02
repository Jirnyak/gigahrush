# architecture_fix_6: финальный оркестратор после пяти параллельных агентов

## Mission

This is the final integration lane. Use it after `architecture_fix_1.md` through `architecture_fix_5.md` have produced their patches. The orchestrator does not start new broad feature work. It merges, reconciles, validates and documents the unified architecture.

## Intake

Read:

- all `architecture_fix_*.md` files;
- each agent's final response or branch diff;
- `README.md`, `architecture.md`, `factions.md`, `ai.md`, `alife.md`, `floors.md`, `save.md`, `tests.md`;
- `git status --short`;
- `git diff --stat`;
- relevant source files touched by agents.

## Merge order

Prefer this order because it minimizes semantic conflicts:

1. Agent 2 territory API and tests.
2. Agent 1 room affordance registry and tests.
3. Agent 3 floor theme composition helper and tests.
4. Agent 4 AI routine integration.
5. Agent 5 cross-system consumers, UI/debug, audit and docs.

Reasoning:

- AI and consumers should consume territory and room helpers, not invent local duplicates.
- Floor theme can compose existing registries before generation call sites move.
- Docs should be finalized after source truth is known.

## Conflict policy

If two agents changed the same behavior:

- Keep the more generic helper/API.
- Drop local duplicate wrappers after all call sites compile.
- Preserve existing behavior unless a test or source contract says the old behavior was wrong.
- Do not revert unrelated dirty files.
- Do not keep both parallel systems "for compatibility"; this project rejects legacy scaffolding unless explicitly requested.

If a change requires red files:

- `src/core/types.ts`: only accept primitive shape changes with clear integration need.
- `src/main.ts`: accept only removal of content-specific orchestration or tiny generic wiring.
- `src/render/webgl.ts`: accept only display reads, not gameplay ownership.
- save runtime: accept only with shape bump, sanitizers and tests.

## Required reconciliation checks

Run these source inspections:

```bash
rg -n "zone\\.faction" src
rg -n "world\\.factionControl|factionControl\\[" src
rg -n "SAVE_SHAPE_VERSION" README.md architecture.md save.md factions.md src/systems/save_runtime.ts
rg -n "RoomType\\." src/systems/ai src/systems src/gen src/data | sed -n '1,220p'
```

For each result:

- `zone.faction`: must be derived UI/debug/generation fallback, not ownership truth.
- `factionControl`: direct access allowed in territory internals, low-level world copy/save, generation initialization, tests or clearly bounded helpers.
- `SAVE_SHAPE_VERSION`: docs and source must agree on the current number.
- `RoomType`: data weights are fine; AI routine meaning should flow through room affordance helpers where possible.

## Acceptance matrix

| Domain | Required final state |
| --- | --- |
| Rooms | One registry/helper explains room affordances. AI or tests consume it. |
| Territory | `territory.ts` is the path for owner queries. `zone.faction` is derived metadata. |
| Floor theme | Story/design/procedural route stops can expose a composed floor theme profile. |
| AI | Routine target selection combines intent, room affordance and friendly territory with explicit exceptions. |
| A-Life | No refill, no off-floor need/path/combat simulation, no silent replacement. |
| Samosbor | Temporary samosbor territory remains bounded and same-floor-key. |
| Economy/quests | Ownership consequences use cell/room territory; ids/facts over display-name lookup. |
| Render/UI | Displays state only; no gameplay ownership decisions. |
| Save | Source and docs agree on shape version; any shape change has rejection/sanitize tests. |
| Tests | Cheap unit fixtures first; generation matrix only for broad floor coverage. |

## Validation sequence

Run in this order:

```bash
npm run typecheck
npm run test:unit
npm run content:audit
npm run check
```

If any browser/render/HUD/input code changed:

```bash
npm run check:browser
```

If broad generation/floor-theme call sites changed:

```bash
npm run test:generation
```

If save shape changed:

- verify `SAVE_SHAPE_VERSION` bump;
- verify stale saves are rejected;
- verify current malformed payload sanitization;
- run `npm run check`.

## Review checklist before final answer

- What changed and why?
- Which files became the official room, territory and floor-theme APIs?
- Where can the player observe the result: NPC room use, territory ownership, faction panel, containers, production, quests, shelters?
- Which floor or route verifies the behavior?
- How does samosbor affect it?
- Does it touch A-Life, factions, economy, quests, events, save/load, localization or render?
- What cap, cadence, cache or placement-time work prevents frame-time growth?
- Were docs updated only for shipped facts?
- Which checks passed?

## Final output expected from orchestrator

The final response should be short and factual:

- list the merged lanes;
- list the main source files changed;
- list validation commands and outcomes;
- mention any skipped checks with exact reason;
- mention any residual known risks, especially if a lane remained partial.


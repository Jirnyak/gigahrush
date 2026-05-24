# rework_05_route_lift_objective_clarity

Target model: GPT-5.5 worker.

Mode: implementation worker. Dirty tree is normal; do not revert unrelated UI or route work.

## Goal

Make objective, route and lift choices legible without redesigning the existing map.

The map is considered broadly acceptable. Do not split it into new modes, do not redesign the minimap, and do not remove existing map readability. The player-facing problem to solve here is that route facts are scattered across lift prompts, quest text, HUD messages and log lines.

## Feedback This Addresses

- Players do not know where to go.
- The map should not become the main place where the first objective is explained.
- The game promises expeditions, floors and samosbor, but the first route does not read as one clear trip.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `src/render/hud.ts`
- `src/systems/route_cues.ts`
- `src/systems/procedural_floors.ts`
- `src/systems/interactions.ts`
- `src/systems/contracts.ts`
- `src/gen/living/geometry.ts`
- `src/gen/living/expedition_prep.ts`
- `src/render/map_ui.ts` only to understand existing behavior; avoid editing it unless the orchestrator approves a tiny marker/label fix.

Run `git status --short`.

## Route Clarity Contract

At any moment during a normal expedition, the UI should answer:

- current objective
- target floor or current-floor target
- next lift direction if needed
- danger/risk in compact language
- return path or nearest known return lift

Do not add autopilot pathfinding. A bearing, marker and lift direction are enough.

## Map Non-Goals

The map/minimap was reported as basically fine. Treat it as a stable surface.

Do not:

- create multiple map modes;
- convert the minimap into a new route widget;
- remove existing markers or advanced map information;
- redesign map colors, crowd bins or exploration behavior;
- move first-session guidance into map-only UI.

Allowed:

- preserve existing map behavior while adding a separate current-objective/route chip in HUD;
- make a very small marker/label fix if a worker proves the current map actively blocks the first route;
- update tests only to prevent regressions in current map behavior.

## Lift And Objective Language

Focus on language outside the map:

- current objective chip
- interaction prompt while looking at a lift
- quest route hint
- log line after route transition
- expedition prep board text

Lift prompt should say, in compact form:

- direction
- route label or `Z`
- danger/risk if known
- whether this lift matches the current objective
- whether it is a return/safe known route

## First-Hour Public Reveals

The cartographer and route cue systems already support reveals, but first-route clarity should not depend on paying a cartographer or opening the full map.

Add or reuse a public reveal from one of:

- Olga's first instruction
- Barni's range
- expedition prep board
- Living hub geometry signs

The reveal should expose only:

- Olga/Barni/Yakov starter path
- nearest route/prep direction
- safe return/shelter basics, if already known by the route systems

## Suggested File Ownership

Likely touched:

- `src/render/hud.ts` for a route/objective chip only if not owned by `rework_03`.
- `src/systems/route_cues.ts`
- `src/systems/interactions.ts` for lift prompt clarity.
- focused tests for route/lift helper functions if practical.

Possible:

- `src/gen/living/expedition_prep.ts` for public route board/reveal text.
- `src/render/map_ui.ts` only for tiny regression-safe preservation fixes approved by the orchestrator.

Avoid:

- New `FloorLevel`.
- Hardcoded lift coordinates.
- Full pathfinding/autowalk.
- Revealing the whole 1024x1024 floor for free.
- Reworking map/minimap modes, colors, layer structure or marker philosophy.

## Acceptance Criteria

- New player can identify Olga/Barni/Yakov starter route through objective/lift/HUD language without needing to study the map.
- Looking at a lift communicates direction and whether it matches active objective.
- Existing map/minimap behavior is preserved unless a tiny bug fix was explicitly made.
- Full map remains available as-is and is not the only route explanation.
- No route content goes into `main.ts` except generic wiring if unavoidable.

## Verification

```bash
npm run typecheck
npm run test:unit
npm run check:browser
```

Visual check required only if HUD or map rendering changed. If `map_ui.ts` was not touched, verify route/lift/objective flow instead.

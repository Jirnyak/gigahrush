# Agent Instructions

## Project Identity

ГИГАХРУЩ is a zero-runtime-dependency TypeScript/Vite browser game: a procedural survival-horror life-sim inside a 1024x1024 toroidal concrete megastructure. It ships as one HTML file with procedural textures, procedural sprites, procedural sound, WebGL raycasting, canvas HUD, flat entity arrays, and data-oriented world storage.

Core taste: elegant, modular, natural, minimal, universal. Minimum code, maximum playable function. Do not add frameworks, abstraction theater, or refactor loops.

## Source Of Truth

- Read `README.md` before changing gameplay or content. It is the factual implementation map.
- Read `architecture.md` before touching shared systems or adding integration points.
- Read the relevant source files under `src/` before assuming a pattern.
- Keep docs factual. `README.md` documents shipped behavior, not intent.

## Stack And Commands

- Pure TypeScript, Vite, WebGL/canvas, browser APIs.
- No unowned frontend frameworks, imported UI kits, physics engines, ECS libraries, asset pipelines, or linters outside `package.json`.
- Use existing npm scripts:
  - `npm run typecheck`
  - `npm run test:unit`
  - `npm run build`
  - `npm run smoke`
  - `npm run check` for larger changes.

## Code Style

- Follow local TypeScript style in the file being edited.
- Keep strict TypeScript clean. `noUnusedLocals` and `noUnusedParameters` are enforced.
- Prefer plain functions, plain objects, typed arrays, numeric ids, string ids, and small registries.
- Use comments only when they explain non-obvious mechanics, math, or performance constraints.
- Russian in player-facing game text is normal. Do not translate existing content by accident.

## Architecture Rules

- Keep the five layers intact: `core`, `data`, `gen`, `systems`, `render`.
- `core/` owns primitive types, enums, `World`, constants. Treat edits here as integration work.
- `data/` owns definitions only: ids, weights, items, quests, text, variants, prices, recipes.
- `gen/` owns construction: rooms, corridors, POIs, initial NPCs/items, floor content.
- `systems/` owns generic runtime behavior. Systems consume definitions; they do not hardcode one content module.
- `render/` reads state and draws. It must not own gameplay decisions.

## Content Pattern

- Prefer one self-contained content module over scattered edits.
- Add floor content through manifests, registries, side-effect registration, or existing helper hooks.
- Do not put content-specific logic in `main.ts`, `core/world.ts`, `render/webgl.ts`, broad AI, or shared generator utilities.
- Use ids and existing registries instead of importing another agent's unfinished module.
- Important runtime facts should publish through `systems/events.ts` before inventing another event bus.

## File Organization

- One file = one responsibility.
- Do not split files to satisfy an arbitrary line count.
- Split only for a real boundary: pure data vs runtime, pure logic vs DOM/canvas, reusable utilities used by 3+ consumers, or shared types.
- Avoid growing already-large integration files. Add generic hooks once, then keep content in modules.
- A large encapsulated generator or renderer is acceptable when it has one job. Mixed responsibilities are not.

## Performance Rules

- Performance buys atmosphere. Optimize to afford denser visuals, more NPCs, better feedback, and smoother play.
- No per-frame full-world scans. Use generation-time work, slow ticks, cooldowns, radius caps, dirty flags, caches, and fixed-size buffers.
- Avoid hot-loop allocation. No per-entity closures, temporary object churn, JSON work, or DOM work in update/render paths.
- Use `world.idx`, `world.wrap`, `world.delta`, `world.dist`, and `world.dist2` for toroidal math.
- Prefer `dist2` when only comparing distance.
- Keep dense per-cell state in typed arrays on `World`. Use sparse `Map`s only for rare cell data.
- Prefer cinematic fakes over simulation: texture marks, fog tint, room state, spawn weights, HUD/log feedback, and deterministic tricks beat fluids/steam/market physics.

## Gameplay And Data

- Systems are data-driven and data-oriented.
- New content must be reachable in game or through a clear debug path.
- Every meaningful module should give the player a decision: trade, steal, repair, escort, kill, hide, forge, expose, reroute, or flee.
- Do not preserve legacy code paths just because they exist. This is early development.
- Save compatibility is not sacred. If a save shape changes, update normalization or explicitly invalidate stale data.

## UI And Rendering

- This is canvas/WebGL HUD and raycaster UI, not DOM component UI.
- Use procedural textures, sprites, marks, particles, HUD panels, minimap overlays, and logs consistent with existing render code.
- Do not add CSS frameworks or DOM-heavy interfaces.
- After UI/render changes, run the game or smoke test and visually check scaling, clipping, unreadable text, and blank canvas failures.

## Validation

- For narrow data/content changes, run at least `npm run typecheck`.
- For systems, rendering, save/load, AI, inventory, economy, quests, or generation changes, run `npm run check` unless blocked by environment.
- If a check fails, inspect the real error and fix it. Do not report success from assumption.
- Report skipped checks explicitly with the reason.

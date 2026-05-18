# Expansion 04: Heatline Zero Implementation Plan

Version: 0.1 planning  
Owner: EXP04_HEAT  
Scope: playable MVP for `Docs/Expansions/04_heatline_zero/expansion.md`

## Ground Rules

Heatline Zero ships as an infrastructure slice inside `MAINTENANCE`, not as a new floor. The MVP uses discrete heat nodes, valve state changes, bounded timers, existing rooms, existing fog data, and renderer-safe overlays. It must not introduce continuous fluid simulation, per-cell temperature simulation, global pressure propagation, or renderer coupling that blocks other agents.

The player-facing loop is: enter a hot maintenance pocket, read a blocked route, find a valve or diagram, change one valve, survive a short venting window, then use steam once as hazard, route control, or local fog suppression. Every phase below must preserve that loop.

## Relevant Mandates

| Mandate | Application in this expansion |
| --- | --- |
| Room/pocket MVP before floor growth | First implementation is a small `MAINTENANCE` pocket with linked rooms, not `FloorLevel.HEAT`. |
| Cinematic cheat protocol | Steam is tint, noise strips, HUD warning, damage ticks, and fog delta. No particles required for MVP. |
| Frame time dictatorship | Heat state changes run on interaction or rare ticks. Target cost is below 0.1 ms/frame and usually 0 when idle. |
| Math LOD scalability | Low, middle, high, ultra tiers change tick frequency and visuals, not core gameplay truth. |
| Predictability over realism | Pressure is `0..3`; valves are `open`, `closed`, `jammed`, or `venting`; results are visible in one room hop. |
| Debug visibility | Debug commands expose node state, force valve state, cool nodes, and dump recent telemetry. |
| Black box | Critical heat state writes the last 300 high-level frames to a fixed ring buffer when implemented in code. |

## Phase 0: Data Contract And Pocket Layout

The first step is to define the future code contract before touching systems. `HeatNodeDef` describes static content: stable id, room id, linked node ids, initial pressure, initial heat, safe window seconds, fog burn radius, and visual hint. `HeatNodeRuntime` stores only bounded runtime fields: pressure `0..3`, heat `0..3`, valve state, cooldown, last change tick, and flags.

The pocket must fit the existing collector grammar: pipe walls, sparse light, water channels, one-cell doors, and functional rooms fully enclosed. It should be generated as a stamped maintenance cluster around six rooms: entry sluice, main heat node, steam corridor, asbestos storage, emergency shower, and pressure dispatch. The old boiler is a locked or risky branch for a later phase, but the MVP must reserve its connector.

Definition of Done: there is a written static node graph with at least five nodes, two route-affecting valves, one fog interaction node, and one safe fallback path. A future code implementer can add the data without inventing room names or graph edges.

Rejected alternative: generating a whole heat floor first. That creates pathing, renderer, and content dependencies before the mechanic is proven.

Estimated runtime cost: 0 microseconds per frame until code exists; future static data lookup is estimated below 5 microseconds per valve action.

## Phase 1: Valve Interaction MVP

Valve interaction must be command-like and atomic. The player uses a valve; the system validates range and state; the local node and directly linked nodes update; a HUD message reports the consequence. No system scans the world for pipe networks.

The first MVP needs two valves. Valve A opens the steam corridor for 12-18 seconds while increasing pressure in the old boiler branch. Valve B vents pressure from the dispatch side but turns the entry corridor into a damage zone for a short interval. A jammed state exists for content but should not be random in the first slice; randomness would hide cause and effect.

Definition of Done: two valves change route availability in different ways, state changes are deterministic from current node state, and player feedback states the node name plus pressure level.

Risk: players may treat valves as binary keys. Countermeasure: each valve changes a visible tradeoff, not just a door flag.

Estimated runtime cost: under 20 microseconds per interaction for direct linked-node updates; idle cost remains 0 if implemented as event-driven state changes.

## Phase 2: Steam Hazard And Burns

Steam is a room or cell tag produced by heat node state. Damage is periodic and bounded: a hot zone applies a burn tick at a fixed interval while the player remains inside. It must never become invisible unavoidable damage. The room must show red lamps, hiss text, manometer state, or fog tint before damage starts.

Burns should start as existing HP damage plus a short status label. A later medical expansion can read the same event and attach treatment, but Heatline Zero must not require the hospital expansion. Emergency shower is the local countermeasure: it clears minor burn status, reduces heat damage cooldown, or provides a narrow safe rest point while risking contaminated water if another system is present.

Definition of Done: entering active steam gives readable warning before or during first tick, damage is capped, shower or route retreat exists, and no steam hazard can spawn on the only exit without a safety window.

Risk: steam becomes cheap monster deletion. Countermeasure: monsters receive reduced or archetype-specific effects, and steam draws attention by emitting a noise event.

Estimated runtime cost: below 15 microseconds per active player hazard check; no full map scan.

## Phase 3: Fog Interaction

Heat may suppress samosbor fog locally, never globally. A venting node can apply a temporary negative fog delta in a small room or radius. The effect expires or decays; it does not change permanent zone ownership and does not mark the zone cleansed. The player gets a shortcut window, not a victory button.

Fog interaction must use the existing fog representation through an adapter. If the current fog system is cell-density based, the heat system submits a bounded list of affected cells. If fog is zone/event based in a future branch, the adapter records a temporary room modifier. The heat code should not own samosbor state.

Definition of Done: at least one vent action temporarily lowers visible fog or fog danger in a small area, fog returns after the window, and samosbor capture rules remain unchanged.

Risk: cross-agent conflict with samosbor changes. Countermeasure: define `HeatFogRequest` as data-only and allow `systems/samosbor.ts` to consume it when ready.

Estimated runtime cost: low tier below 25 microseconds per vent event for a tiny room list; high tier may spend up to 100 microseconds on visual-only fog shimmer but not on logic.

## Phase 4: Content Slice

The MVP content is a compact narrative of infrastructure failure. The dispatcher gives the valve diagram. The burned worker explains that pressure lies. The asbestos storage contains one protective item or note. The emergency shower gives relief and a contaminated-water warning. The old boiler is visible but not mandatory; it is the high-risk branch where the player can weaponize steam once.

Documents must teach rules through diegetic fragments: a diagram with valve order, a burn ward note, a maintenance shift log, and a liquidation memo warning that steam clears fog only for minutes. NPCs give decisions, not lore dumps.

Definition of Done: the content manifest names every MVP room, NPC, hazard, document, and debug command needed to test the loop.

Risk: content becomes a list of flavor rooms with no mechanical pressure. Countermeasure: every room has one required gameplay purpose in the manifest.

Estimated runtime cost: content data has no frame cost except normal entity and room rendering.

## Phase 5: Debug, Telemetry, And Verification

Debug controls must exist before balancing. Required commands are: list heat nodes, inspect nearest node, set valve state, force vent, cool all nodes, and dump heat telemetry. The black-box buffer records 300 recent frames or high-level ticks with node id, room id, pressure, heat, valve state, player room, fog delta hash, and flags.

Verification is practical, not decorative. A test run starts at the entry, reads the diagram, opens Valve A, crosses the steam corridor during the safe window, uses Valve B to vent fog, retreats to shower after burn damage, and confirms that fog returns. A build check must pass after any code implementation. Since this pass is documentation-only, verification is limited to scope audit and Markdown review.

Definition of Done: future implementation has debug observability for each state transition and a deterministic manual test route. Documentation DOD is complete when this plan, manifest, contract, status, rationale, and log exist.

Risk: heat bugs become invisible state bugs. Countermeasure: node state must be visible through debug and recent telemetry before adding additional heat content.

Estimated runtime cost: telemetry write is a fixed ring-buffer assignment, target below 3 microseconds per recorded frame when enabled.

## Math LOD

| Tier | Logic | Visuals | Content consequence |
| --- | --- | --- | --- |
| Low | 3-5 nodes, interaction-only updates, room-level damage, no decay scan. | HUD text, red lamp tint, static pipe texture reuse. | Playable valve route with one fog burn window. |
| Middle | 5-8 nodes, rare tick every 10-30 game seconds, linked-node pressure updates. | Steam strips, heat haze tint, manometer UI text. | Two valve tradeoffs and one optional boiler branch. |
| High | 8-12 nodes, NPC route avoidance via room flags, noise events for monsters. | Layered alpha bands, dripping/hissing audio cues, richer minimap hint. | Factions can contest heat access and NPCs comment on open routes. |
| Ultra | Same logic as high; extra calculations are visual-only. | Dense procedural steam, pulsing lamps, condensation, screen-edge scorch, sound layering. | Visual overkill without new gameplay truth or save format risk. |

## Test And Check Plan

| Check | Method | Pass condition |
| --- | --- | --- |
| Scope audit | `git status --short` limited to EXP04 files. | No code, README, root docs, index, or other expansion folders changed. |
| Markdown review | Read generated docs back with `sed`. | Required DOD, risks, LOD, and checks are present. |
| Build safety | `npm run build` after documentation edit. | Build still passes; any unrelated failure is logged without modifying code. |
| Future manual playtest | Use debug to place player at heat entry and walk the MVP route. | Two valves alter routes, steam damages clearly, fog suppression expires. |
| Future telemetry test | Force vent and dump buffer. | Dump contains bounded recent node states and no unbounded allocation path. |

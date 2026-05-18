# Procedural Floor Anomaly Contract

This document is for agents adding new procedural floor anomaly profiles.

## Current Entry Points

- Definitions: `src/data/procedural_floors.ts`
- Application code: `src/gen/procedural_floor.ts`
- Runtime sparse topology: `World.anomalyTeleports`
- Route/save state: `src/systems/procedural_floors.ts`

Do not create a new event bus or renderer-owned gameplay state for an anomaly. Use existing world arrays, sparse maps and `systems/events.ts` if the anomaly needs public facts.

## What An Anomaly Profile Is

An anomaly profile is data that modifies an otherwise normal procedural floor:

- `id`: lowercase snake case, stable.
- `title`: short Russian HUD/debug title.
- `weight`: relative chance.
- `minDanger`: minimum danger level before it can appear.
- `dangerBias`: danger modifier after selection.
- `tags`: hooks for loot, monsters, contracts, rumors and screens.

## Existing Profiles

- `none`: no anomaly.
- `smog`: creates bounded smoke-heavy rooms/corridor pockets, one source marker and pressure/counterplay hooks.
- `teleport_cells`: pairs rare floor cells through `world.anomalyTeleports`.
- `mushroom_mycelium`: seeds mushroom loot, apparatus-like growth points and green marks.
- `false_safe_block`: creates a quiet, too-clean shelter block with black-hand marks, a missing-siren panel, cult-owned supplies and an interactable marker.
- `hladon`: marks a few bounded cold rooms with pale frost, applies local slow/needs pressure and supports heat/steam/fire counterplay.
- `samosbor_seed`: marks zones as samosbor-tainted, adds fog, meat/gut floor marks and extra monsters.

## Adding An Anomaly

1. Add the id to `FloorAnomalyId`.
2. Add a `FloorAnomalyDef` to `FLOOR_ANOMALIES`.
3. Add loot/monster tag entries if the anomaly changes spawn weights.
4. Add a small `apply...()` function in `src/gen/procedural_floor.ts`.
5. Keep runtime behavior bounded: cooldowns, sparse maps, radius caps or generation-time state.
6. Publish a `WorldEvent` only when the player or simulation needs to remember it.

## Good Anomaly Effects

- Changes route topology: paired cells, one-way shortcuts, sealed pockets.
- Changes visibility: fog, light failure, screen noise.
- Changes risk: monster bias, zone faction, samosbor pressure.
- Changes loot: unique item bias, contaminated supplies, faction caches.
- Gives a decision: avoid, exploit, loot, repair, expose, flee.

## Rules

- No full-world per-frame scans.
- No DOM UI.
- No new texture atlas entries unless existing `Tex` ids cannot express the effect.
- Do not make an anomaly a hidden instant death.
- Do not make an anomaly depend on a named story room or NPC.

## Validation

Run at least:

```bash
npm run typecheck
npm run test:unit
```

For runtime movement, render or save/load changes, run:

```bash
npm run check
```

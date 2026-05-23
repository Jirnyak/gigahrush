# Design Floor Rework Orchestrator

This file is for the integration pass after the 19 shipped-route floor reworks and the proposed 20th authored-floor brief land. Filename intentionally follows the requested batch name: `rework_orchectrator.md`.

## Goal

Verify that every routed design floor now has a real population field and still keeps its own gameplay identity. The rework is not "add more actors everywhere"; it is a coherent vertical model:

- near `z=0`: high human habitation, lower-level NPCs, moderate monsters;
- toward `abs(z)=30`: fewer but stronger humans, more monsters, better loot;
- past `abs(z)=40`: ordinary NPCs vanish or become explicit authored exceptions, monsters dominate;
- special floors override the curve for identity, but must explain the override.

## Intake

Read first:

1. `README.md`
2. `architecture.md`
3. `Docs/DesignFloors/floor_contract.md`
4. all `Docs/DesignFloors/rework_floor_*.md`
5. changed files under `src/data/`, `src/gen/design_floors/`, `src/gen/population_placement.ts`, `src/data/population_profiles.ts`, tests.

Check dirty work with `git status --short` before editing. Do not revert parallel agents' changes.

## Integration Checklist

- Every design floor has a declared NPC and monster population target in code, tests, debug output or a nearby profile.
- Broad placement uses generation-time placement fields, not hand-piled actors.
- `entitySpawnSlots()` protects NPC/monster caps.
- Ordinary NPCs are compatible with A-Life materialization; named quest actors keep stable identity.
- No refill-to-cap loop was added.
- No content-specific logic landed in `main.ts`, `core/world.ts` or `render/webgl.ts`.
- Route floors at `z<=-48` remain NPC-free.
- The new symmetric top/bottom intent is represented somewhere generic, not as nineteen unrelated hacks.
- Parallel workers tuned `src/data/design_floor_population.ts` or geometry/room/zone signals for broad density; local generators contain authored content, not duplicate crowd systems.
- Roof, attic and antenna floors do not become ordinary settlements.
- Pioneer camp keeps its child-heavy protected override and does not become a top-end slaughter arena.
- Crossroads, communal ring, Floor 69 and Market 88 are dense but pathable.
- Underhell, Podad and Darkness are monster-heavy but still have reachable routes and readable exits.
- `slime_nii`, if implemented in this batch, claims `z=+12` as a routed design floor without adding a new `FloorLevel`; if it remains docs-only, `README.md` and shipped counts stay unchanged.

## Existing Generic Helper

The pre-pass ships a generic design-floor population helper in `src/data/design_floor_population.ts` and `src/gen/design_floors/population.ts`. Parallel floor workers should tune their floor through that profile, room types and zone signals, not by adding unrelated broad spawn loops.

The current shape is intentionally close to:

```ts
interface DesignFloorPopulationProfile {
  routeId: DesignFloorId;
  z: number;
  npcTarget: number;
  monsterTarget: number;
  npcFactionWeights: readonly unknown[];
  monsterBiasTags: readonly string[];
  npcPlacement: PlacementFieldProfile;
  monsterPlacement: PlacementFieldProfile;
}
```

The helper derives defaults from `abs(z)` and allows local modifiers:

- residential/social override;
- administrative override;
- industrial override;
- top-extreme no-NPC override;
- lower-extreme no-NPC override;
- special authored-enclave override.

Keep it data-oriented and generation-time. Do not create a runtime population manager during integration.

Current safe tuning surface is room types, zone factions, placement kind and profile targets. `DesignPlacementFieldProfile` does not yet expose literal anchors; if floor workers need anchors for sealed cameras, antennas or gates, expose them once in the generic profile and sampling adapter instead of adding per-floor broad spawns.

## Per-Floor Acceptance Matrix

| Route id | Expected result |
| --- | --- |
| `roof` | no ordinary NPCs, high monster field, sky remains visible |
| `chthonic_attic` | no/near-no humans, root/service monster maze |
| `antenna_court` | small scientist/liquidator enclaves, large signal/slime field |
| `pioneer_camp` | calm populated center, child-heavy NPC field, monster edges |
| `upper_bureau` | thinning but busy bureaucracy, paper/archive monsters |
| `bank_floor` | bank crowd, guarded value, debt/vault choices |
| `raionsovet_archive` | queues and clerks, archive/document monsters |
| `registry_morgue` | small living staff, stronger morgue monsters |
| `manhattan_crossroads` | dense road traffic, wild gangs, wrong-turn monsters |
| `communal_ring` | dense residential social field, low monster pressure |
| `floor_69` | adult-only crowd, debt/refuge choices, bounded monsters |
| `black_market_88` | dense market crowd, guarded contraband, backroom monsters |
| `production_belt` | workers and guards, industrial monsters and repair loot |
| `service_floor` | small repair crews, machine-maze monster pressure |
| `silicon_net_well` | НИИ enclaves, silicon/slime monsters, bounded hack backlash |
| `dark_metro` | small armed groups, heavy tunnel monsters, trains still work |
| `underhell` | rare elite humans, several-thousand monster threshold |
| `podad` | no ordinary NPCs, near-cap meat/topology monster field |
| `darkness` | NPC-free, dark monster/hazard field, exits readable |
| `slime_nii` proposed | scientists/guards in lab nests, sealed cameras, slime quarantine monsters, no duplicate `silicon_net_well` fantasy |

## Validation

Minimum final gate after integration:

```bash
npm run check
```

Also run:

```bash
npm run check:browser
```

when roof sky, darkness lighting, train interaction, mobile HUD prompts or render-facing monster density changes are touched and Chrome is available.

If checks fail, inspect the real error and fix the integration. Do not reduce population targets just to hide a performance or pathing bug; use placement fields, LOD, caps, bucket limits and route readability.

# Rework Floor 13: Производственный пояс

Route id: `production_belt`. Z: `-14`. Base floor: `MAINTENANCE`. Owned source: `src/gen/design_floors/production_belt.ts`.

## Problem

Production should be noisy and useful: machines, workers, guards, repair parts, concentrate, quotas and industrial monsters. Sparse actors make it feel like a decorative factory instead of a system feeding other floors.

## Rework Target

Make the belt a medium-density industrial floor. It should have workers and liquidator/security control, but monsters and machine hazards are already rising as the route descends.

Population targets:

- NPC field: `900..1800`;
- NPC mix: workers/mechanics, liquidators, citizen labor, a few wild scavengers;
- monsters: `700..1600`;
- level/loot: medium-high tools/resources, locked industrial caches, repair value.

## Gameplay Identity

The player should choose repair, sabotage, steal output, escort a worker, reroute power, trade parts, expose quotas or fight through a broken line. Production should visibly connect to market, living scarcity, ministry quotas and service-floor repair.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=1300`, `monsterTarget=1250`, industrial placement. Workers, guards and mechanics are generic templates unless they own a repair/contract decision.

Tune machine lines, workshops, guard rooms, break rooms and storage through room types and faction zones. Industrial monsters should be field-driven through production/storage/corridor weights, not hand-piled in one line.

## Implementation Notes

- Tune worker fields around safe machine lines and shift rooms.
- Tune monster fields around broken conveyors, waste pockets, dead lines and overheated rooms.
- Use existing factory/resource/event registries before adding new systems.
- Keep hazards generation-time or bounded; no per-frame full factory scans.

## Samosbor

Samosbor should jam machines, reroute conveyors, contaminate output, trap workers or open emergency repair rewards. Aftermath can alter local resource stock and route cues.

## Verification

- Production is populated by workers and monsters in distinct bands.
- Repair/sabotage/steal decisions are reachable.
- Industrial loot remains capped and contextual.
- Run `npm run check`.

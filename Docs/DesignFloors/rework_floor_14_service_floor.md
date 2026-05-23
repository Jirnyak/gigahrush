# Rework Floor 14: Служебный этаж

Route id: `service_floor`. Z: `-18`. Base floor: `MAINTENANCE`. Owned source: `src/gen/design_floors/service_floor.ts`.

## Problem

The service floor should be a functional underside: lifts, pressure, repair access, tools, water/pipes and dangerous maintenance routes. It cannot feel empty, but it also should not be as socially dense as near-zero residential floors.

## Rework Target

Make it a sparse-human, rising-monster maintenance floor. Small repair crews and liquidators operate around safe anchors; monsters own the machine maze and pressure tunnels.

Population targets:

- NPC field: `500..1100`;
- NPC mix: mechanics, liquidators, utility workers, a few wild scavengers;
- monsters: `900..2200`;
- level/loot: medium-high tools/filters/repair parts, strong route utility.

## Gameplay Identity

The player should choose repair, bypass, drain/pressurize, steal tools, rescue a worker, use a hidden service route or flee a machine corridor. The floor should make lower-route preparation practical.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=780`, `monsterTarget=1600`, industrial placement. Repair crews are mostly generic industrial NPC templates; named crews exist only for rescue, repair or betrayal scenes.

Use machine rooms, shafts, breaker offices, pump rooms, storage and liquidator checkpoints as room/zone signals. Do not add a maintenance refill loop after crews die.

## Implementation Notes

- Tune NPC room/zone signals around workshops, lift controls, pump rooms and safe break rooms.
- Tune monster room/zone signals in machine maze, pipe corridors, flooded/pressure zones and old shafts.
- Use existing lift/route/repair systems; do not put service-floor special cases in `main.ts`.
- Keep any pressure runtime bounded by existing samosbor/hazard cadence patterns.

## Samosbor

Samosbor should make service systems dangerous: pressure spikes, door relays, flooded corridors, emergency panels and worker evacuation. Aftermath can leave repair opportunities or blocked shortcuts.

## Verification

- Service floor has visible repair crews and high monster pressure.
- Core service decisions are reachable from spawn.
- No unbounded runtime scan or refill is added.
- Run `npm run check`.

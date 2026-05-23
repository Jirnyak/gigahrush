# Rework Floor 02: Чердак техслужб

Route id: `chthonic_attic`. Z: `+46`. Base floor: `MINISTRY`. Owned source: `src/gen/design_floors/chthonic_attic.ts`.

## Problem

The attic has useful architecture: roots, service voids, shafts and old maintenance pockets. It currently risks reading as a large atmospheric shell with too few active threats. At `abs(z)=46`, ordinary life should be gone or nearly gone; the floor should be a monster-heavy service ecosystem.

## Rework Target

Turn the attic into a high-density top-side monster maze with small protected technical traces. Human presence is not a crowd; it is abandoned service tags, trapped specialist squads, dead workers, or one bounded repair scene.

Population targets:

- ordinary NPC field: `0`;
- explicit veteran/repair NPCs: `0..40` only if the floor implements a real repair/rescue decision;
- monsters: `3000..6000`;
- level/loot: high; utility loot, cables, filters, antenna parts, sealed shaft caches.

## Gameplay Identity

This is a crawlspace above the ministries: low ceilings, vents, old shafts, cable roots, machine hum and routes that fork around inaccessible service doors. The player should decide whether to cut through root tunnels, reroute power, steal from old lockers, or flee when the attic starts moving.

Monster bias should emphasize root/pipe/shaft ecology: tube, rebar, shadows, crawling or fog-linked monsters. Keep any large monster clusters spread through the field so the attic is navigable and not one arena.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=0`, `monsterTarget=4300`, industrial monster placement. A floor worker should tune `src/data/design_floor_population.ts` plus room typing for roots, shafts, storage pockets and service cavities; do not add a local floor-wide spawn loop.

Repair squads, if added, are named authored/event actors outside the generic NPC field. They should enter through a rescue/repair decision and never become refillable background technicians.

## Implementation Notes

- Tune the existing attic population override through shared placement fields.
- Weight monsters toward root networks, shaft rooms and fogged service cavities.
- Use bucket limits so thousands of monsters do not concentrate beside spawn.
- If adding repair NPCs, declare them as authored event actors, not ordinary refill.
- Preserve route-wide connectivity and avoid sealing lift/hatch paths.

## Samosbor

Samosbor should twist service shafts: temporary wall movement, pressure venting, broken lights, cable-root spread and hatch lock changes. The floor is exempt from normal civilian refugee logic because the ordinary NPC field is zero.

## Verification

- Generation count shows a real monster field, not a few hand placements.
- No broad NPC population is created above `z=+40`.
- Spawn-to-exit path survives after expansion and samosbor rebuild.
- Run `npm run check`.

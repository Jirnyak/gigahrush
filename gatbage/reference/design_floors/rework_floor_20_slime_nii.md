# Rework Floor 20: НИИ слизи

Route id: `slime_nii`. Route z: `+12`, between `FloorLevel.KVARTIRY` at `+14` and `manhattan_crossroads` at `+8`. Base floor: `KVARTIRY`. Owned source: `src/gen/design_floors/slime_nii.ts`, with route data in `src/data/design_floors.ts` and population override in `src/data/design_floor_population.ts`.

Status: shipped authored design floor. Route data, generator, manifest registration, population profile and route tests are present.

## Problem

The current route has a useful gap between dense apartments and the road fantasy of Crossroads. It lacks a biological science floor that explains where slime medicine, slime weapons, quarantines and lab rumors come from. `silicon_net_well` already covers NЕТ, silicon and Safeguard; it should not also own every НИИ/lab fantasy.

## Rework Target

Add a closed, inhabited research institute grown into residential fabric: scientists, liquidator guards, technicians, secretaries, patients, infected volunteers and sealed cameras with monsters or trapped people. The floor should feel active because laboratories are working under pressure, not because a generic office crowd was pasted into a lab.

Population targets for implementation:

- NPC field: `900..1600`, proposed profile target `1300`;
- NPC mix: scientists, doctors, liquidator guards, technicians, secretaries, a few civilians and wild intruders;
- monsters: `1100..2200`, proposed profile target `1700`;
- monster bias: `SLIMEVIK`, `SLIME_WOMAN`, `CHERNOSLIZ`, `HEAD_SLUG`, `BEZEKHIY` or the closest existing slime/quarantine kinds;
- level/loot: medium-high; samples, filters, antidotes, lab passes, locked specimen cabinets, no free high-tier weapon flood.

## Gameplay Identity

This is not a clean sci-fi lab. It is a Soviet-style НИИ occupying apartments, school corridors and utility shafts: white tile corridors, clipboard checkpoints, sealed bathrooms converted to specimen rooms, cold storage, quarantine glass, leaking green drains and offices where scientists argue over whether the slime is fuel, medicine, weapon or tenant disease.

The key fantasy is containment. Doors, locks and windows matter. A camera can hold a monster, an infected NPC, a volunteer, a debtor sold to the lab, or a useful sample. Opening it is a decision, not decoration.

## Generic Population Profile

When implemented, broad density should go through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Add a route-local override for `slime_nii` instead of writing a local floor-wide spawn loop.

Safe first profile:

- `npcTarget=1300`, `monsterTarget=1700`;
- NPC factions: `SCIENTIST 48`, `LIQUIDATOR 28`, `CITIZEN 18`, `WILD 6`;
- NPC occupations: `SCIENTIST 42`, `DOCTOR 18`, `SECRETARY 12`, `HUNTER 10`, `ELECTRICIAN/LOCKSMITH 10`, `TRAVELER 8`;
- NPC placement: admin/industrial lab nests, checkpoints, offices, clean rooms;
- monster placement: industrial/quarantine rooms, cameras, storage, drains, specimen corridors.

Current safe tuning surface is room types and zone factions. If the implementation needs literal placement anchors for sealed cameras, add them generically to `DesignPlacementFieldProfile` and `src/gen/design_floors/population.ts`; do not special-case broad placement in `slime_nii.ts`.

## Decisions

- Open a sealed camera to rescue an NPC, kill a specimen or loot a sample; leaving it closed keeps the floor safer.
- Help scientists collect a live sample, sell it to `black_market_88`, hand it to liquidators, or burn it.
- Escort an infected person through quarantine, surrender them to guards, or hide them among residents.
- Forge or steal a lab pass to reach clean rooms and cold storage.
- During samosbor, choose between hermetically sealing a block with people inside or venting slime into a bypass corridor.

## Implementation Notes

- Add route data only when the generator is real: `src/data/design_floors.ts`, `src/gen/design_floors/slime_nii.ts`, `src/gen/design_floors/manifest.ts`.
- Use real rooms and doors for cameras: each sealed cell needs room records, door state, lock/readability and a reachable decision surface.
- Broad NPCs are A-Life templates. Named chief scientists, infected witnesses, special guards and quest actors need stable ids.
- Camera contents are generation-time placed or bounded event actors. No refill after the player releases or kills them.
- Slime leaks should be marks, room state, bounded events or interaction consequences. Do not add a per-frame whole-floor infection scan.
- Keep separation from `silicon_net_well`: this floor is biological slime, quarantine, medicine and people in cameras; the well remains NЕТ, silicon, Safeguard and rare tech.

## Samosbor

Samosbor should break containment: locks reverse, cameras fog, drains pulse, clean-room lights fail and loudspeakers issue mutually contradictory quarantine orders. Aftermath can leave opened cameras, sealed dead zones, contaminated water and lab notes that change market/science rumors.

## Verification

- Route registration places `slime_nii` at `z=+12` without adding a new `FloorLevel`.
- Generated floor has working rooms, sealed cameras, doors, exits and a path from spawn to lift.
- Debug counts match the population profile within placement/cap limits.
- Opening a camera changes live gameplay without creating refill loops.
- Run `npm run check`; add generation tests for route availability, pathability and capped population.

# Rework Floor 16: Темная пересадка

Route id: `dark_metro`. Z: `-32`. Base floor: `MAINTENANCE`. Owned source: `src/gen/design_floors/dark_metro.ts`.

## Problem

The dark metro has a strong existing mechanic: fixed-route trains that board/exit and crush entities. At `abs(z)=32`, the floor should feel hostile and underpopulated by humans, but not empty. There should be small high-level groups and many monsters/hazards.

## Rework Target

Make the metro a high-pressure transit floor: few human bands, lots of monsters, dangerous train timing and scarce safe platforms.

Population targets:

- NPC field: `80..300`;
- NPC mix: wild bands, liquidator patrols, stranded travelers, no ordinary crowd;
- monsters: `2500..4500`;
- level/loot: high; route tokens, transit caches, train-side risk.

## Gameplay Identity

The player should choose ride/walk, wait/flee, join or ambush a band, rescue a stranded passenger, steal from platform caches, lure monsters onto rails, or use trains as a lethal shortcut.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=180`, `monsterTarget=3400`, metro placement. The low NPC target is defended-platform and veteran group density, not residential life.

Shape trains, platforms, control rooms, safe alcoves and tunnel mouths so the shared field keeps people on defensible ground and monsters in tunnels/tracks. Do not add hidden runtime tunnel spawners.

## Implementation Notes

- Preserve train mechanics and crush rules.
- Tune monster placement fields along tunnels, dark platform edges and wrong transfer paths.
- Add or tune small NPC room/zone signals on defended platforms only.
- Make platform safety legible; avoid spawning dense monsters directly inside every boarding area.

## Samosbor

Samosbor should desync train schedules, darken platforms, trigger wrong arrivals and push monsters along tracks. Aftermath can leave a blocked train, temporary shortcut or crushed loot field.

## Verification

- Trains remain interactive and do not softlock the player.
- Small human groups are present but not a crowd.
- Monster density is high and distributed around transit geometry.
- Run `npm run check`; run browser/smoke validation if train interaction/render changes.

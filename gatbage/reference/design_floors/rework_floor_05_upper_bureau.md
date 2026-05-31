# Rework Floor 05: Верхнее бюро

Route id: `upper_bureau`. Z: `+34`. Base floor: `MINISTRY`. Owned source: `src/gen/design_floors/upper_bureau.ts`.

## Problem

The upper bureau already has a bureaucracy game: appointments, staff routes, zero files, tolls and ambushes. It needs enough live population to feel like the upper administrative machine is operating under pressure, while still reflecting that `z=+34` is near the dangerous upper band.

## Rework Target

Make it a busy but thinning administrative floor: queues, clerks, guards and auditors in the legal zones; paper monsters and ambush pressure in archives and back routes.

Population targets:

- NPC field: `350..900`;
- NPC mix: citizens/secretaries, liquidator auditors, a few scientists;
- monsters: `600..1500`;
- level/loot: high bureaucracy loot, strong guards, medium-high document monsters.

## Gameplay Identity

The upper bureau should play differently from Ministry: fewer broad offices, more controlled access layers. The player should choose legal appointment, bribe/toll, staff-route stealth, forged paper, audit exposure or violence.

Monster pressure should not erase the social puzzle. Keep monster density heavier in archives, denied corridors, zero-file rooms and sealed back offices.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=650`, `monsterTarget=1100`, admin NPC/monster placement. Clerks, guards and queue bodies belong to this generic profile unless they own a named interaction.

Make queue halls, offices, access windows, archives and back corridors real room/zone signals so the profile can pull people and monsters naturally. Do not add bespoke clerk-crowd spawning in `upper_bureau.ts`.

## Implementation Notes

- Tune the existing admin placement profile for clerks/queues/guards and paper monsters.
- Keep current quest NPCs and side quests, but surround them with a real ambient field.
- Make liquidator/auditor pockets control access rather than simply stand at spawn.
- Publish events for audit heat, exposed file, staff-route use and forged-document backlash.

## Samosbor

Samosbor should jam the paperwork layer: queues panic, doors relabel, archives spawn paper monsters, toll windows close or become theft opportunities. It should not silently refill dead clerks afterward.

## Verification

- Ambient NPC count is high enough to read as a bureau, but below residential floors.
- Monster count is enough to pressure archives and staff routes.
- Appointment, staff route and illegal combat paths remain reachable.
- Run `npm run check`.

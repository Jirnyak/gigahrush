# Rework Floor 07: Райсовет и архив картотек

Route id: `raionsovet_archive`. Z: `+22`. Base floor: `MINISTRY`. Owned source: `src/gen/design_floors/raionsovet_archive.ts`.

## Problem

Райсовет should be one of the bureaucratic hubs of the game: documents, forms, access, social friction and archives. If it is sparsely populated, the core fantasy breaks. It needs queues and offices with enough people to make paper power visible.

## Rework Target

Make the floor a medium-dense administrative population field: citizens in queues, secretaries and clerks in offices, liquidator guards and archive monsters deeper inside.

Population targets:

- NPC field: `700..1600`;
- NPC mix: citizens, clerks/secretaries, liquidators, a few wild fixers;
- monsters: `400..1000`;
- level/loot: documents and permits above raw loot; archive danger rises with depth.

## Gameplay Identity

Decisions should include wait, bribe, steal a form, forge a signature, expose a duplicate record, escort a petitioner, trade document access, or fight through an archive shortcut. The floor should connect naturally to bank, morgue, market, hospital-like future content and route access.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=1200`, `monsterTarget=820`, admin placement. Queue, clerk and archive density should come from room typing, zone faction weights and the shared profile, not from generator-side archive crowd spawning.

Named clerks, record keepers and quest witnesses can keep stable ids only when they own decisions. Ordinary counter traffic remains A-Life materialization templates.

## Implementation Notes

- Tune population room/zone signals for queue hall, form windows, clerk rooms, archive stacks and black side offices.
- Ordinary citizens should materialize through A-Life templates where possible.
- Keep document ids and event payloads compact; no Russian display-name lookups in hot logic.
- Make archive monsters a field, not a few static blockers.

## Samosbor

Samosbor should turn paperwork into threat: lost queue numbers, duplicate records, doors requiring wrong forms, archive-stack monster bursts and clerk evacuation. Aftermath can mark documents as spoiled or suspicious.

## Verification

- The queue/office layer reads as populated.
- At least three document decisions are reachable.
- No broad runtime scan is added for archive state.
- Run `npm run check`.

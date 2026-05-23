# Rework Floor 08: Морг регистраций

Route id: `registry_morgue`. Z: `+18`. Base floor: `MINISTRY`. Owned source: `src/gen/design_floors/registry_morgue.ts`.

## Problem

The morgue has a strong premise: dead records, medical/cartographic paperwork, bodies as archive objects. It should not be only a few rooms with a few actors. It needs a pressure field that makes the player choose between clerical safety and corpse/archive horror.

## Rework Target

Make the floor a mixed bureaucratic-horror space: fewer living people than Райсовет, more monsters and dead-record hazards. People work in lit registration pockets; monsters own cold rooms, body storage and misfiled corridors.

Population targets:

- NPC field: `250..700`;
- NPC mix: registrars, doctors, liquidator guards, a few petitioners;
- monsters: `700..1600`;
- level/loot: medium-high medical/document loot, strict ownership and contamination.

## Gameplay Identity

The player should choose whether to correct a death record, steal from body storage, expose a living-dead duplicate, get a medical document, fight/avoid cold-room monsters, or hide during a registry audit.

Avoid turning the morgue into free medicine. Loot budget must stay bounded and locked where valuable.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=480`, `monsterTarget=1150`, admin NPC placement with void-style monster placement. This is deliberately smaller living staff plus a stronger morgue monster field.

Duplicate/death-record NPCs should be authored identities or A-Life templates depending on whether they own a decision. Corpse hazards, records and cold-room consequences are local content, not a replacement population model.

## Implementation Notes

- Tune separate field room/zone signals for registration desks, cold rows, body archive, quarantine shelves and service corridors.
- Monster profile should favor morgue/document/dead-echo kinds already in the ecology.
- NPC profile should be smaller and more specialized than Райсовет.
- Publish events for record correction, false death, morgue theft and quarantine paper use.

## Samosbor

Samosbor should desync records and bodies: lights fail, tags change, bodies move as monsters, registration queues panic or disappear. Aftermath can leave duplicated NPC records or contaminated medical loot.

## Verification

- Morgue has a real NPC field but is monster-heavier than nearby administrative floors.
- Loot remains bounded and owned/locked.
- Record/body decisions are reachable from spawn.
- Run `npm run check`.

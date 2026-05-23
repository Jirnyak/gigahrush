# Rework Floor 10: Коммунальное кольцо

Route id: `communal_ring`. Z: `+4`. Base floor: `KVARTIRY`. Owned source: `src/gen/design_floors/communal_ring.ts`.

## Problem

At `z=+4`, this should be one of the most inhabited design floors. A communal ring without people is just corridor geometry. It needs the same kind of lived-in pressure that makes Kvartiry work: crowds, disputes, kitchens, queues, liquidator response and occasional monsters.

## Rework Target

Make the ring a high-density social survival floor: many residents and wild/citizen disputes, fewer monsters than Crossroads, but enough threat to keep movement risky.

Population targets:

- NPC field: `2500..4500`;
- NPC mix: citizens/residents, wild agitators, liquidator patrols, cooks/storekeepers;
- monsters: `250..700`;
- level/loot: mostly low-level residential loot, with owned scarcity and conflict.

## Gameplay Identity

The player should navigate social pressure: borrow food, steal bread, mediate or exploit a kitchen feud, hide someone, expose a thief, choose sides when liquidators clear a protest, or take a risky ring shortcut.

This is the near-zero habitation side of the model. It should feel alive first, monster-infested second.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=3800`, `monsterTarget=420`, social placement. This profile is the main density solution for kitchens, common rooms and corridors.

Improve kitchens, common rooms, shared bathrooms, laundry corners and corridor room mapping so the shared field does the work. Do not add bespoke residential spawn code or refill dead residents.

## Implementation Notes

- Use `KVARTIRY_POPULATION_PROFILE` as calibration, but tune the existing `communal_ring` design-floor override.
- Weight NPCs to kitchens, common rooms, laundry/bath queues, corridors and protest knots.
- Weight monsters to sealed side rooms, garbage shafts and samosbor residue.
- Preserve A-Life death persistence; no social refill.

## Samosbor

Samosbor should create evacuation decisions: who fits in a shelter, who steals food, which corridor is sealed, whether liquidators clear or protect the ring. Aftermath can shift faction control and scarcity.

## Verification

- The ring is one of the densest design floors but remains pathable.
- Social decisions are reachable without killing through a wall of NPCs.
- Monsters are present but not the main population.
- Run `npm run check`.

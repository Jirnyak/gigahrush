# Rework Floor 03: Антенный двор

Route id: `antenna_court`. Z: `+42`. Base floor: `MINISTRY`. Owned source: `src/gen/design_floors/antenna_court.ts`.

## Problem

The antenna court already has a strong subject: open technical yards, signal equipment and НИИ/scientist flavor. The missing piece is a living pressure field. At this height, it should be dangerous and mostly non-civilian, not a sparse courtyard with token actors.

## Rework Target

Make the floor a signal-yard ecosystem: scientists in sealed islands, liquidator guards around working equipment, slime/electric/signal monsters in the open. Ordinary citizens should not populate the field.

Population targets:

- ordinary NPC field: `0`;
- scientist/liquidator enclave NPCs: `20..80`;
- monsters: `2200..4500`;
- level/loot: high; antenna parts, sample containers, batteries, signal documents.

## Gameplay Identity

The player comes here for signal, not settlement. Decisions should include calibrate/steal antenna gear, protect or betray a small НИИ crew, route around monster-filled open courts, hack a terminal, or use signal equipment to reveal/alter route cues.

Monster bias should lean into slimes, eyes, signal parasites, electric or pipe monsters, and any existing НИИ/silicon ecology hooks. Keep scientist areas readable as defended pockets in a hostile yard.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=60`, `monsterTarget=3400`, scientist/liquidator enclave mix, roof-style monster placement. These 60 NPCs are protected specialist templates, not ordinary civilian settlement density.

Tune sealed НИИ pods, generator sheds and antenna-yard rooms through room types and zone factions first. If a worker needs literal placement anchors, that should be a small generic extension to `DesignPlacementFieldProfile`, not a local hundred-entity spawn exception.

## Implementation Notes

- Tune room and zone signals for antenna arrays, cable trenches, generator sheds and sealed НИИ pods; add literal anchors only through a generic profile extension.
- NPC field should be enclave-based and capped; do not scatter hundreds of scientists across open sky.
- Monster field should own the broad open area and pressure crossings.
- Publish a compact event for major signal choices so roof, ministry or Net content can react later.

## Samosbor

Samosbor should jam signal, duplicate route cues, make loudspeakers lie and increase slime/signal monsters around antenna anchors. The floor can leave broken antenna marks as aftermath.

## Verification

- `generateDesignFloor('antenna_court')` has high monster density and only bounded scientist/liquidator pockets.
- Player can reach at least one signal decision and an exit without crossing an unbounded empty field.
- Run `npm run check`.

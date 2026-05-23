# Rework Floor 17: Нижний пропускник

Route id: `underhell`. Z: `-38`. Base floor: `HELL`. Owned source: `src/gen/design_floors/underhell.ts`.

## Problem

Underhell should be the threshold to the meat bottom. If it has only a few monsters, it fails its route role. It should be a brutal but still readable transition: small veteran human groups, huge monster pressure, clear gated routes.

## Rework Target

Make Underhell a denser-than-normal Hell threshold but not yet the final impossible crush. Humans are rare: liquidator squads, cult veterans or trapped specialists. Monsters own the field.

Population targets:

- NPC field: `0..120`;
- NPC mix: elite liquidators/cultists only, no ordinary residents;
- monsters: `4500..8000`;
- level/loot: very high, combat/PSI/meat loot, strong scarcity.

## Gameplay Identity

The player should choose whether to sneak through a guarded threshold, help or betray a veteran squad, open a meat gate, steal lower-route supplies, fight through a nest or retreat before Podad.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=80`, `monsterTarget=6400`, hell placement. Rare humans are elite authored squads or a tiny veteran template field, never ordinary residents.

Tune gates, cages, meat chambers, checkpoint stores and conveyor corridors through room/zone signals so monster pressure is broad but routes stay readable. Do not add normal refugee or clerk population here.

## Implementation Notes

- Use Hell population as calibration, but make the design-floor field distinct with gates and threshold room/zone signals.
- Keep NPCs as explicit high-level groups, not a general population.
- Spread monsters through meat pockets, lower gates, route side chambers and retreat paths.
- Make exits and shelters readable under pressure.

## Samosbor

Samosbor should behave like a meat-pressure lock: gates close, walls pulse, monsters reroute, rare squads may be lost permanently. Aftermath can open a lower shortcut or seal a supply room.

## Verification

- Monster count is several thousand and below cap.
- Human presence is rare and high-level.
- Route gate and retreat decisions are playable.
- Run `npm run check`.

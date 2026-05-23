# Rework Floor 01: Крыша

Route id: `roof`. Z: `+50`. Base floor: `MINISTRY`. Owned source: `src/gen/design_floors/roof.ts`, with route expansion in `src/gen/design_floors/full_floor.ts` and the generic dynamic-sky hook.

## Problem

The roof has one strong shipped feature: sky. The dynamic ceiling, open sightlines, slabs and antennas make it distinct. The weak part is population pressure: the top of the building should not feel like four NPCs and four monsters standing in a big empty set. At `abs(z)=50`, the route logic should treat this as an extreme summit, not an inhabited office annex.

## Rework Target

Make the roof the upper mirror of deep endgame pressure: no ordinary NPC population field, huge monster pressure, rare traces of people. Existing human quest roles should be converted into records, radio calls, dead/evacuated traces, or at most one explicit survivor event. Do not leave a normal social cast as the population solution.

Population targets for implementation:

- ordinary NPC field: `0`;
- authored survivor/event NPCs: `0..1`, only with an explicit reason;
- monsters: `4500..7000`, capped through `entitySpawnSlots()`;
- level/loot: very high, sky/signal/weather loot, no free settlement stockpile.

## Gameplay Identity

The roof is not safe because it is open. It is safe-looking because it has sky. The player should choose between crossing exposed slabs, using ventilation hatches, repairing/stealing signal gear, hiding in machine rooms, or sprinting through monster sightlines during weather shifts.

Monster bias should favor things that read well in the open: eyes, shadows, rebar/antenna monsters, flying/line-of-sight pressure if existing kinds support it. Avoid making the floor only a flat combat field; anchor pressure around antennas, cloud glitches, water tanks, parapets and hatch exits.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=0`, `monsterTarget=5600`, roof placement kind. A floor worker should tune `src/data/design_floor_population.ts` and the roof geometry/room/zone signals; do not add a local floor-wide spawn loop. If actual generated monster count is lower because roof islands have too few legal slots, fix playable roof footprint and placement weights rather than bypassing `entitySpawnSlots()`.

Any living human on the roof is an authored event actor: radio survivor, trapped repairer, liquidator corpse record, or similar. It is not part of the ordinary NPC field and must have an explicit story/event reason.

## Implementation Notes

- Tune the existing roof monster profile in `src/data/design_floor_population.ts`.
- Keep dynamic sky generic; do not put gameplay decisions into `render/webgl.ts`.
- Use roof islands, hatches, antenna rooms and zone tags as field weights.
- Mark shelters and exits clearly through existing route cues and rooms.
- If current side quests are preserved, route them through non-normal-NPC surfaces: documents, radio logs, sealed-room consequences or one named survivor.

## Samosbor

Roof samosbor should be sky-first: frozen clouds, wind siren, desaturated light, eyes at long range. Aftermath can break antenna output, leave ash marks, contaminate water tanks or open a hatch shortcut.

## Verification

- `generateDesignFloor('roof')` produces a broad playable footprint, nonblank sky and high monster density below the monster cap.
- No ordinary NPCs remain on the roof unless a single authored event explicitly owns them.
- Player can reach at least one antenna, one shelter and one exit from spawn.
- Run `npm run check`; use browser validation if sky/render behavior changes.

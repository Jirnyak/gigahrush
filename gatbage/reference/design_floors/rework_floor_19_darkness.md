# Rework Floor 19: Темный отсек

Route id: `darkness`. Z: `-48`. Base floor: `VOID`. Owned source: `src/gen/design_floors/darkness.ts`.

## Problem

Darkness already has the correct high-level rule: no ambient light, endgame route, no NPCs through current route gating. It still needs enough non-human pressure and reward structure to avoid becoming only an empty black geometry test.

## Rework Target

Keep it NPC-free. Add a darkness-specific monster/hazard field that uses visibility, sound, tools and route protocol as the main threat. Do not try to solve Darkness with social content.

Population targets:

- NPC field: `0`;
- monsters/hazards: `3000..7000`, with visibility and AI cost considered;
- level/loot: endgame; protocol/void loot, light/tool scarcity, no civilian stock.

## Gameplay Identity

The player should choose when to spend light, when to listen, when to flee, when to fight unseen pressure, when to follow a protocol clue and when to abandon loot. The floor should teach that darkness is a mechanic, not a palette.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=0`, `monsterTarget=5200`, void placement. NPC-free identity is enforced by profile and route position; do not add social fallback content.

Workers may tune monster/hazard placement, lighting counterplay, route cues and exit readability only. Any voice, record or protocol presence should be text/event/audio-like content, not a live ordinary NPC.

## Implementation Notes

- Use the existing zero-ambient rendering behavior.
- Tune monster placement fields away from spawn but close enough to force decisions.
- Prefer monsters with readable audio/mark/counterplay in low light.
- Keep NPC-free enforcement intact.
- Avoid huge particle/render costs; browser validation matters here.

## Samosbor

Samosbor in Darkness should be almost indistinguishable from the floor until it is too late: light drains, protocol cues lie, monsters move through unlit zones, exits become costly. Aftermath can leave temporary light scars or reveal protocol caches.

## Verification

- No NPCs are generated.
- Monster/hazard pressure is present and capped.
- Player can still find an exit with tools/cues.
- Run `npm run check`; run browser validation for lighting/render changes.

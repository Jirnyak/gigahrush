# Rework Floor 18: Подад

Route id: `podad`. Z: `-40`. Base floor: `HELL`. Owned source: `src/gen/design_floors/podad.ts`.

## Problem

Podad already uses living tunnels, moving walls and a denser-than-Hell monster profile. The rework should make it the clear lower extreme before Darkness/Void: almost no people, maximum monster field, topology threat and still a playable route.

## Rework Target

Make Podad a near-cap monster floor with no ordinary NPC field. Any humans must be explicit story/cult/herald/veteran actors with a reason. The main population is meat topology plus monsters.

Population targets:

- ordinary NPC field: `0`;
- explicit authored NPCs: `0..60`;
- monsters: `6500..9500`, never above the `10000` cap;
- level/loot: extreme; rare loot must require route risk.

## Gameplay Identity

The player should choose between moving-wall timing, living-tunnel shortcuts, fighting through meat pockets, baiting monsters into shifting sections, following/defying a Herald clue or retreating. Podad should be hostile even before samosbor.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=0`, `monsterTarget=8200`, hell placement. Ordinary NPC field remains zero; Herald/story actors and explicit sacrificial scenes stay local.

During implementation, reconcile any existing local Podad monster spawning with the generic `podad` override to avoid double broad population. Keep local code for topology, gates and named story actors, not for a second floor-wide monster field.

## Implementation Notes

- Keep topology anomaly hooks generic; do not put Podad one-offs into shared runtime.
- Use field placement around living tunnels, section-shift tags, gates and false-safe pockets.
- Preserve `floorRunZAllowsNpcs()` endgame behavior and expand toward a symmetric top/bottom gate through the orchestrator, not in this one file.
- Avoid rare monster spam; cap rare kinds separately if needed.

## Samosbor

Samosbor should intensify topology: walls move, sections shift, flesh corridors close, monsters reroute. Aftermath can leave scars, opened meat doors or sealed shortcuts.

## Verification

- Podad remains denser than Hell but below monster cap.
- No ordinary NPC population appears.
- Moving-wall and section-shift paths remain reachable.
- Run `npm run check`.

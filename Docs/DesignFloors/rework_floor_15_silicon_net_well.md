# Rework Floor 15: Кремниевый НЕТ-колодец

Route id: `silicon_net_well`. Z: `-22`. Base floor: `MAINTENANCE`. Owned source: `src/gen/design_floors/silicon_net_well.ts`.

## Problem

The silicon well already has a distinct subject: NЕТ access, silicon life, special terminals, Safeguard backlash and rare energy weapon loot. It needs a stronger field so the well feels inhabited by НИИ enclaves and overrun by silicon/slime ecology, not just a small scripted pocket.

## Rework Target

Make it a mid-deep science/monster floor. Humans are protected specialists and administrators; silicon life and slimes dominate the broad space.

Population targets:

- NPC field: `350..900`;
- NPC mix: scientists, administrators, liquidator security, rare Sibo-linked actors;
- monsters: `1200..2600`;
- level/loot: high tech/NЕТ/silicon loot, strict backlash and access risk.

## Gameplay Identity

The player should choose hack, bargain, steal rare tech, protect or betray scientists, provoke Safeguard, harvest silicon samples or reroute NЕТ access. Failed hacks should feel like a population/event consequence, not one isolated spawn.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=560`, `monsterTarget=1900`, industrial placement with scientist/liquidator enclave mix. НИИ/admin humans are enclave templates plus named Sibo/specialists where needed.

Hack backlash remains a bounded event spawn path and must not become a population refill mechanism. Tune protected pods, server rooms, cable rooms and crystallized service corridors through room/zone signals.

## Implementation Notes

- Tune scientist enclave room/zone signals and monster/slime field signals separately.
- Use existing `net_terminal_hack_failed`, special terminals and Safeguard logic; keep payloads bounded.
- Bias monsters toward slime/silicon/НИИ counterplay kinds.
- Keep rare weapon access gated; do not let population growth flood the floor with high-tier loot.

## Samosbor

Samosbor should corrupt terminal output, crystallize paths, wake silicon monsters and temporarily isolate НИИ pods. Aftermath can leave samples or broken NЕТ wells.

## Verification

- The floor has meaningful scientist pockets and high monster/slime pressure.
- Hack backlash remains bounded and cannot create an infinite spawn loop.
- Rare weapon and terminal decisions remain reachable.
- Run `npm run check`.

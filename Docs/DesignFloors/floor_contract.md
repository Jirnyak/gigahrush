# Design Floor Implementation Contract

Status: historical planning contract. Use it for floor-agent constraints, but use `README.md`, `src/data/design_floors.ts`, `src/gen/design_floors/manifest.ts` and `src/data/procedural_floors.ts` for shipped route facts.

These docs defined the authored design-floor wave. They are not interstitial procedural floors and they are not `FloorLevel` enum facts; shipped design floors remain string-id route stops wired through the route and generator registries.

## Hard Rules

- One design floor starts as one owned TypeScript module: `src/gen/design_floors/<id>.ts`.
- If a floor grows beyond one real responsibility, convert it to `src/gen/<id>/index.ts` plus `content_manifest.ts`; do not scatter content through `main.ts`.
- Between any two design floors the future `FloorRun` must insert exactly three procedural floors.
- Design floor route ids are lowercase snake case and stable. Use them in quests, rumors, debug and save data.
- Every floor must have its own NPCs, at least three playable decisions and one debug entry path.
- Use existing registries and hooks first: `registerSideQuest`, content manifests, containers, contracts, rumors, events, faction/economy state.
- New `FloorLevel` enum values are integrator work. A floor agent may add content modules and data, but must not casually expand core enums.
- Use `world.idx`, `world.wrap`, `world.delta`, `world.dist` and `world.dist2` for coordinates.
- No per-frame full-world scans. Floor state updates by generation, interaction, bounded event hooks or slow ticks.
- Player-facing Russian text is normal. Keep it short and playable.

## Default Module Shape

```ts
export const DESIGN_FLOOR_ID = '<id>' as const;

export function generate<FloorName>(): FloorGeneration {
  // create World, topology, lifts, rooms, NPCs, containers, lights
}

export function register<FloorName>Content(): void {
  // side quests, rumors, documents, contract templates
}
```

The eventual integrator can adapt this to `FloorLevel` or a string-id floor route. Floor agents should not block on that integration. They should make their floor self-contained and provide a debug generator hook.

## Required Gameplay Loop

Each design floor must provide this minimum loop:

1. Entry clue: rumor, contract, lift label, NPC request, document or debug command.
2. Preparation: item, weapon, document, water, filter, light, money, trust or faction pass.
3. Risk path: hostile room, social pressure, patrol, monster, hazard, anomaly or samosbor timing.
4. Decision: trade, steal, repair, escort, kill, hide, forge, expose, reroute or flee.
5. Consequence: event, reward, reputation change, container state, route unlock, scarcity, rumor or backlash.

## Debug And Verification

Every floor implementation must expose:

- force-enter debug command or debug menu row;
- route id, seed and z in debug output;
- at least one deterministic smoke path from spawn to exit;
- one test or manual checklist for softlock prevention;
- `npm run typecheck` minimum, `npm run check` for systems/render/save/generation changes.

## Route Scale

The design docs use future z anchors spaced by 4. The three numbers between anchors are procedural floors.

Example:

```txt
z=-20 DESIGN: raionsovet_archive
z=-19 procedural
z=-18 procedural
z=-17 procedural
z=-16 DESIGN: registry_morgue
```

The exact current game route is still the README source of truth until code changes.

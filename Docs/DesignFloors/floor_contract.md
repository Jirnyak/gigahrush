# Design Floor Implementation Contract

Status: historical planning contract. Use it for floor-agent constraints, but use `README.md`, `src/data/design_floors.ts`, `src/gen/design_floors/manifest.ts` and `src/data/procedural_floors.ts` for shipped route facts.

These docs defined the authored design-floor wave. They are not interstitial procedural floors and they are not `FloorLevel` enum facts; shipped design floors remain string-id route stops wired through the route and generator registries.

## Hard Rules

- One design floor starts as one owned TypeScript module: `src/gen/design_floors/<id>.ts`.
- If a floor grows beyond one real responsibility, convert it to `src/gen/<id>/index.ts` plus `content_manifest.ts`; do not scatter content through `main.ts`.
- The original brief assumed anchors every four z-levels with three procedural floors between them. Shipped route data now spans `z=-50..+50`, reserves even z-slots for future authored/story floors, and uses seeded procedural fallback for every unoccupied slot; use `README.md` and source for the current gap count.
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

The routed implementation uses string-id floor stops from `src/data/design_floors.ts`; story anchors remain `FloorLevel` stops from `src/data/procedural_floors.ts`. New floor agents should make content self-contained and provide a debug generator hook instead of adding new `FloorLevel` enum values.

## Required Gameplay Loop

Each design floor must provide this minimum loop:

1. Entry clue: rumor, contract, lift label, NPC request, document or debug command.
2. Preparation: item, weapon, document, water, filter, light, money, trust or faction pass.
3. Risk path: hostile room, social pressure, patrol, monster, hazard, anomaly or samosbor timing.
4. Decision: trade, steal, repair, escort, kill, hide, forge, expose, reroute or flee.
5. Consequence: event, reward, reputation change, container state, route unlock, scarcity, rumor or backlash.

## Population Field Rework Contract

Use the shipped story floors as calibration, not as copy-paste templates:

- `LIVING` is the near-zero survival/exploration baseline: busy enough to feel inhabited, with low-level humans and a bounded monster fluctuation.
- `KVARTIRY` is the dense social-chaos exemplar: thousands of citizens/wild/liquidators are scattered by `sampleNaturalPopulationCells()` rather than piled into one arena.
- `MINISTRY` is the bureaucratic exemplar: offices, queues, guards, documents and lower monster pressure, with danger coming from access, paper and patrol routes.
- `HELL` is the combat-density exemplar: thousands of monsters plus a small human/cultist/liquidator edge, still bounded by `ENTITY_SOFT_LIMITS`.
- `VOID` and endgame darkness prove that zero-NPC route space is valid when monsters, light, protocol and loot carry the floor.

All reworked design floors should gain an explicit population field. Do not solve emptiness by adding a dozen hand-placed actors. Add a compact data profile and generation-time placement:

- Define desired live density through a reusable route profile: route `z`, `abs(z)`, local floor identity, faction override, anomaly/hazard pressure, room/zone signals and future generic anchors where needed.
- Use `sampleNaturalPopulationCells()` / `samplePlacementFieldCells()` and `entitySpawnSlots()` for broad scattering.
- Respect `ENTITY_SOFT_LIMITS`: current caps are `NPC=5000`, `MONSTER=10000`, `ITEM_DROP=100000`.
- Broad ordinary NPCs should be A-Life materialization templates where possible; named quest NPCs can keep `plotNpcId`.
- No periodic refill-to-cap, no silent replacement of killed people, no per-frame full-world scans.
- Do not hardcode one z-specific exception when an `abs(z)` curve plus route-local modifiers can express it.

After the 2026 pre-pass, routed design floors already have a generic source of truth in `src/data/design_floor_population.ts` and `src/gen/design_floors/population.ts`. Floor workers should change broad density there, then shape it through room types, zone factions, placement kind and route geometry. Local floor generators own named NPCs, authored encounters, locked rooms, hazards, loot and decisions; they should not add a second floor-wide population system.

Broad ordinary NPCs are A-Life materialization templates. Named floor actors need stable authored identity when their death, relation, quest or memory matters. No worker should add refill logic after those people die.

The current design-floor profile supports room and zone weights, not literal placement anchors. If a floor needs true anchors for sealed cameras, antennas, gates or camps, add anchors as one generic field feature and test it once. Do not simulate anchors by pushing hundreds of entities from local code.

Recommended route curve for the rework batch:

| `abs(z)` band | NPC field | NPC level | Monster field | Loot/monster level |
| ---: | --- | --- | --- | --- |
| `0..10` | very high, mostly ordinary residents/traders | low with a few veterans | low to medium | low to medium |
| `11..30` | medium; specialists, guards, workers, factions | mixed, rising | medium, rising | medium |
| `31..40` | low; small veteran groups or protected enclaves | high | high | high |
| `41..50` | ordinary NPC field is zero or near-zero; only explicit authored survivors if the floor needs them | elite only | very high | very high |

This is a baseline, not a straitjacket. Floors can override it for identity: `pioneer_camp` keeps a calmer child-heavy social center despite high `z`; `bank_floor` stays busy because money attracts people; `roof` should become a no-ordinary-NPC monster-pressure summit.

Every floor worker should state its chosen targets in code comments/tests or debug output:

- approximate NPC field target and faction mix;
- approximate monster target and kind bias;
- level/loot pressure relative to `abs(z)`;
- placement signals/anchors and bucket limits;
- samosbor aftermath behavior.

## Debug And Verification

Every floor implementation must expose:

- force-enter debug command or debug menu row;
- route id, seed and z in debug output;
- at least one deterministic smoke path from spawn to exit;
- one test or manual checklist for softlock prevention;
- `npm run typecheck` minimum, `npm run check` for systems/render/save/generation changes.

## Route Scale

The historical examples below use planned z anchors spaced by 4. They are not the shipped source of truth: the current route spans `z=-50..+50`, keeps `LIVING` at `z=0`, and leaves unoccupied even slots as procedural fallback until authored floors claim them.

Example:

```txt
z=+22 DESIGN: raionsovet_archive
z=+21 procedural
z=+20 procedural fallback
z=+19 procedural
z=+18 DESIGN: registry_morgue
```

The exact current game route is `README.md`, `src/data/design_floors.ts` and `src/data/procedural_floors.ts`.

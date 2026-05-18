# Expansion 01: Mushroom Shift Implementation Plan

Status: playable MVP plan  
Owner scope: `Docs/Expansions/01_mushroom_shift/**`  
Target implementation style: TypeScript/Vite, data-driven room production, no new permanent `FloorLevel` for MVP

## 1. Implementation Intent

Mushroom Shift must ship first as a small survival-production loop inside existing floors, not as a new hydroponics megafloor. The playable MVP is one mushroom cellar in `LIVING`, one substrate/water source in `MAINTENANCE`, one ration-pressure endpoint in `KVARTIRY`, and one market hook. The player must be able to acquire spores, prepare one bed, survive one meaningful risk window, harvest food or corrupted output, and see social pressure change.

The system is intentionally room-level. A farm is not a cloud of entities and not a cellular biology simulation. One room state owns the active strain, phase, humidity, contamination, owner, last tick, and samosbor mutation flag. Visual density comes from textures, room features, sprites, HUD messages, documents, and sound cues. The saved CPU budget buys atmosphere, not fake accuracy.

Relevant mandates identified from available project documents and the supplied agent rules:

| Mandate | Application in Mushroom Shift |
| --- | --- |
| Scope isolation | Only future files under mushroom-related data/systems/generation should be touched by implementers; this planning pass writes only Expansion 01 docs and logs. |
| Data-driven content | Strains, recipes, documents, events, and debug commands must be registry data, not UI hardcode. |
| Room-level production | Farm state is attached to a room/profile, with containers for inputs/outputs when container systems exist. |
| Slow tick, bounded state | Growth updates run on coarse game-time cadence or lazy room entry, never per frame across all rooms. |
| Existing-floor MVP | Use `LIVING`, `MAINTENANCE`, `KVARTIRY`, and market content before any `HYDROPONICS` floor instance. |
| Event-first integration | Farm actions publish structured events for rumors, economy, journal, NPC reactions, and debug visibility. |
| Math LOD scaling | Weak devices get one lazy room and static visuals; higher tiers spend cycles on additional farms and visual overload. |
| Samosbor remains antagonist | Harvest success creates risk, debt, inspection, theft, contamination, or faction claims. |

## 2. Phase 0: Contract-Only Preparation

Phase 0 creates no runtime feature. It records the expected interfaces, content IDs, risk boundaries, and test criteria so parallel agents do not invent incompatible mushroom systems. This phase is complete when `implementation_plan.md`, `content_manifest.md`, and `integration_contract.md` exist and agree with `expansion.md`, `README.md`, `desdoc.md`, and `Docs/Expansions/INDEX.md`.

Definition of Done:

| Check | Required result |
| --- | --- |
| Scope | No code, root docs, index files, or other expansion folders changed. |
| Architecture | MVP stays inside existing floors and uses room-level state. |
| Content | Required rooms, NPCs, items, documents, events, and debug commands have stable proposed IDs. |
| Parallel safety | Integration contract names optional dependencies and fallback behavior. |
| Verification | Docs can be reviewed without needing unimplemented files. |

Risk: planning can over-specify code that other agents are already changing. Countermeasure: this plan names contracts and IDs, but leaves concrete imports and signatures to future implementers after code inspection.

## 3. Phase 1: Data Skeleton and Debug Slice

Phase 1 creates the smallest runnable mechanic behind debug commands. Add `src/data/mushrooms.ts` with eight strain definitions and `src/systems/mushrooms.ts` with a minimal room-state API. Register one farm room in `src/gen/living/mushroom_cellar.ts` or the nearest existing living content index after checking current generation patterns. Do not add a new floor, new renderer pass, or broad economy rewrite.

Minimum API expected by the phase:

```ts
export interface MushroomStrainDef {
  id: string;
  name: string;
  tags: readonly string[];
  growHours: number;
  waterNeed: number;
  substrateNeed: readonly string[];
  foodValue: number;
  toxicity: number;
  psiAffinity: number;
  baseValue: number;
  samosborMutation?: string;
}

export interface MushroomFarmState {
  roomId: number;
  strainId: string;
  phase: 'empty' | 'spawned' | 'mycelium' | 'fruiting' | 'harvestable' | 'spoiled';
  humidity: number;
  contamination: number;
  ownerFaction?: string;
  ownerNpcId?: number;
  lastTickMinute: number;
  mutatedBySamosbor: boolean;
}
```

Debug-first controls are mandatory: create farm at player room, give one spore print and substrate, advance growth by one phase, force contamination, force samosbor mutation, and print active farm states. The debug path is not a substitute for gameplay, but it prevents blind balancing.

Definition of Done:

| Check | Required result |
| --- | --- |
| Build | `npm run build` passes after implementation, unless an unrelated parallel-agent break is documented with compiler output. |
| Hot path | No per-frame scan of all rooms or all NPCs. |
| Debug | A tester can create, tick, mutate, and harvest one farm without walking the full route. |
| Save safety | If farm state is not persisted in Phase 1, the loss is explicit and does not corrupt existing saves. |
| UI feedback | The player receives at least one HUD/log line per major farm transition. |

Primary rejected alternative: simulating individual mushrooms as entities. It increases pathing/render/NPC interaction cost with no gameplay advantage for MVP.

## 4. Phase 2: Playable Route Across Existing Floors

Phase 2 turns the debug slice into a real route. The player hears a rumor, finds the cellar, obtains or steals access, fetches substrate from `MAINTENANCE`, brings water, plants, waits through at least one slow tick, and harvests. The route must cross existing floor mechanics without requiring a new `FloorLevel`.

Required rooms:

| Floor | Room | Purpose |
| --- | --- | --- |
| `LIVING` | `mushroom_cellar_first_shift` | Main farm, owner NPC, tutorial documents, output container. |
| `MAINTENANCE` | `substrate_store_wet_bags` | Substrate source, technical water, pipe hazard, optional monster pressure. |
| `KVARTIRY` | `ration_pressure_counter` | Social consequence endpoint for food shortage or successful harvest. |
| market module | `mushroom_buyer_stall` | Optional sell/buy loop and price visibility. |

The player-facing loop ends when one harvested batch produces food, medicine, money, or contaminated output and one external system reacts. Acceptable first reactions are a ration queue calming down, a hungry NPC asking for a share, a market price changing locally, or a sanitary NPC demanding inspection.

Definition of Done:

| Check | Required result |
| --- | --- |
| Gameplay loop | Rumor, access, input collection, planting, risk, harvest, consequence. |
| Navigation | All MVP rooms are reachable through existing floor transitions and toroidal coordinate handling remains intact. |
| Content | At least 4 named NPCs and 10 short original documents are present. |
| Balance | One harvest helps survival but does not erase hunger/economy pressure. |
| Failure | Contamination or theft can produce loss without soft-locking the quest. |

Risk: the route becomes a fetch quest with a different noun. Countermeasure: the cellar state must be inspectable and change after player or samosbor actions.

## 5. Phase 3: Samosbor and Social Pressure

Phase 3 connects farms to samosbor variants, room events, and A-Life. It should not rewrite samosbor. Use existing or emerging event hooks. If structured world events exist, publish facts. If not, store a small local consequence and emit HUD/journal messages through current messaging until the event bus lands.

Required samosbor effects:

| Variant | Farm effect | Player consequence |
| --- | --- | --- |
| Classic purple | Low chance of PSI mutation. | Higher value output or dangerous strange spore. |
| Wet | Growth accelerates, contamination increases. | Faster harvest, higher spoilage and mold hazard. |
| Electric | Lamp failure or dark-room flag. | Slower growth unless repaired; ambush risk. |
| Meat resonance | Organic corruption replaces part of yield. | Cultists value it, citizens/sanitarians punish it. |

Social pressure must trigger from output, not from abstract morality. Successful food production creates claims: citizens ask for rations, liquidators demand sanitary control, cultists want mutated batches, market traders push price manipulation, and Ministry-style bureaucracy can later demand a humidity log.

Definition of Done:

| Check | Required result |
| --- | --- |
| Samosbor | At least two variants alter farm output in MVP; four variants are specified for later. |
| NPC reaction | At least one NPC behavior, rumor, or dialogue changes after a harvest or spoiled batch. |
| Event visibility | Debug can show the last farm event and reason for mutation/spoilage. |
| Performance | Farm update count is bounded by active farm count and coarse time delta. |
| Horror tone | A successful farm causes obligation, inspection, theft, or contamination. |

Rejected alternative: airborne spore particle simulation. Use room flags, text, texture swaps, and bounded event rolls.

## 6. Phase 4: Production Economy Bridge

Phase 4 integrates with production rooms, containers, contracts, and prices only after those systems exist. Until then, Mushroom Shift must work with direct item rewards and local dialogue shops. The bridge should consume generic room production interfaces rather than owning a separate economy.

Expected integration:

| System | Mushroom behavior |
| --- | --- |
| `resources/economy` | Publish `mushroom_mass`, `spores`, `technical_water`, and scarcity deltas by zone. |
| `factory/production` | Treat farm as a `ProductionRoomProfile` with input and output containers. |
| `containers` | Store spores/substrate/yield in wet boxes rather than floor spam. |
| `contracts` | Generate delivery, protection, sanitation, sabotage, and debt quests. |
| `rumors/memory` | Spread facts about harvests, thefts, contamination, and generosity. |

Definition of Done:

| Check | Required result |
| --- | --- |
| Optional dependency | Farm MVP still runs if economy, contracts, or containers are absent. |
| Data path | Recipes use item/resource IDs, not string literals scattered through rooms. |
| Market | Local price or reward changes after food supply changes. |
| Containers | Output goes to a known container when container APIs exist. |
| Contracts | At least three contract templates can target farm rooms. |

Risk: economy scope creep. Countermeasure: Mushroom Shift only publishes aggregate supply and consumes existing interfaces; it does not implement a full market engine.

## 7. Phase 5: Hydroponics Pocket, Not Permanent Floor Yet

Only after Phase 1-4 are playable and verified should the expansion add a hydroponics pocket or floor instance. The first advanced target is a generated pocket reachable by elevator anomaly, maintenance hatch, or faction-controlled door. It has a room cluster, not a new global layer of rules.

Pocket rooms: wet racks, spore archive, lamp garden, quarantine greenhouse, drying room, humidity dispatch, dead shift bunks, inspection booth, blocked service hatch. The pocket uses the same farm state and recipes as the MVP, proving that the system scales by data and generation, not by rewriting logic.

Definition of Done:

| Check | Required result |
| --- | --- |
| Reuse | Pocket farms use the same strain definitions and farm system as MVP. |
| Navigation | Entry and exit rules are explicit and do not trap the player without warning. |
| Density | More rooms mean more choices, not more per-frame simulation. |
| Visuals | Higher-tier visuals are additive and can be disabled by Math LOD. |
| Lore | The pocket does not explain samosbor; it shows how residents industrialize survival around it. |

## 8. Math LOD Plan

Math LOD is functional design, not graphics options bolted on later.

| Tier | Simulation | Visuals | Social/economy |
| --- | --- | --- | --- |
| Low | One active farm per loaded floor; lazy update on room entry or 120-second global tick. | One wet rack sprite, one mold texture, no animated lights. | Direct quest rewards and one local NPC reaction. |
| Middle | Several farms; 60-second tick; contamination and humidity tracked per farm. | Texture swaps, simple lamp color, damp floor decals near farms. | Ration queue pressure and local market price adjustment. |
| High | Faction-owned farms and raids; 30-second tick only for active farms. | Extra sprites, layered mold overlays, richer sound cues, event log detail. | Contracts, rumors, theft, sanitary inspections, worker schedules. |
| Ultra | Hydroponics pocket with dense visual dressing and more event variants. | Wet specular cheats, pulsing lamps, procedural silhouettes, audio bursts. | Multi-zone supply deltas and faction demands, still bounded by coarse ticks. |

Low-end target is acceptable if the player understands state and stakes. Ultra target is not more biology; it is more readable menace.

## 9. Tests and Checks

Implementation must include cheap checks before content expansion:

| Area | Check |
| --- | --- |
| Build | Run `npm run build`. If failing from unrelated work, record exact error owner and do not edit foreign code. |
| Unit-like data validation | Validate strain IDs, mutation targets, recipe IDs, and nonnegative grow/water/value numbers. |
| Runtime debug | Spawn farm, plant, tick to harvest, force wet mutation, force spoilage, harvest all outputs. |
| Save/load | If persisted, save during `mycelium`, reload, verify phase and last tick. |
| Performance | Log active farm count and tick duration; suspicious if farm update exceeds 0.1 ms in ordinary MVP. |
| Gameplay | New game remains playable; route to cellar does not destroy protected apartment/atrium invariants. |
| Regression | Existing hunger, inventory, quest, samosbor, and floor-switching flows still function. |

## 10. MVP Definition of Done

The Mushroom Shift MVP is done when the player can complete this exact scenario in a normal run or debug-assisted test: hear about the cellar, enter it, obtain a spore print, fetch substrate and water, plant one safe food strain, experience a samosbor or forced farm risk, harvest useful or spoiled output, and observe one social/economic reaction outside the farm room.

Anything less is decoration. Anything more before this loop is stable is scope creep.

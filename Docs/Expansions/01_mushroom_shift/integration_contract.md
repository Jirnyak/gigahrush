# Expansion 01: Mushroom Shift Integration Contract

Status: future implementation contract  
Purpose: define expected shared interfaces and safe integration boundaries for parallel agents  
Hard rule: no implementation may assume another agent's unmerged file exists without a fallback

## 1. Scope and Ownership

Mushroom Shift owns the mushroom production concept, strain definitions, farm room state, and content IDs listed in this expansion folder. It does not own the global economy engine, samosbor scheduler, event bus, container system, NPC memory, item enum policy, floor architecture, or renderer.

Future implementation may create or edit mushroom-specific runtime files only after checking the live codebase. Proposed runtime files are:

| Future file | Owner expectation | Responsibility |
| --- | --- | --- |
| `src/data/mushrooms.ts` | Mushroom Shift | Strain definitions, phase metadata, mutation mapping, validation helper. |
| `src/systems/mushrooms.ts` | Mushroom Shift | Farm state API, slow tick, planting, harvest, contamination, event publication adapter. |
| `src/gen/living/mushroom_cellar.ts` | Living generation integration with Mushroom Shift content | First cellar room and NPC placement. |
| `src/gen/maintenance/substrate_store.ts` | Maintenance generation integration | Substrate source and technical water room. |
| `src/gen/kvartiry/ration_pressure.ts` | KVARTIRY/social integration | Queue reaction to harvest supply. |
| `src/data/mushroom_notes.ts` or shared notes file | Items/documents owner plus Mushroom Shift | Document definitions from manifest. |
| `src/data/mushroom_events.ts` or shared event defs | Events owner plus Mushroom Shift | Event ID definitions if event registry exists. |

Do not create duplicate systems named `economy`, `events`, `containers`, `rumors`, or `samosbor` for this expansion. Mushroom Shift must adapt to those systems through narrow helper calls or optional adapters.

## 2. Required Shared Interfaces

The ideal implementation consumes existing shared interfaces. If an interface is absent, the fallback must be local and removable.

| Interface | Expected shape | Fallback if absent |
| --- | --- | --- |
| Room identity | Stable `roomId`, floor, bounds, type, optional tags/subtype. | Store farm state by generated room index or deterministic local key; do not scan all tiles. |
| Item definitions | Item IDs with value/use/spawn metadata. | Use existing food/medicine IDs for outputs and keep new IDs behind one data file. |
| Event publication | `publishEvent` or world event buffer accepting structured type, location, severity, payload. | Push HUD/journal message and append to local fixed farm event ring for debug. |
| Samosbor variant hook | Current variant and post-effect callback or query. | Poll coarse samosbor state on farm tick and apply generic purple/wet/meat fallback by available flags. |
| Debug registration | Existing debug menu/command registry. | Add commands in the current debug pattern only; avoid creating a second debug UI. |
| Containers | Input/output container IDs with ownership. | Keep input/output in farm state and player inventory transactions until containers exist. |
| Economy supply | Zone/floor supply delta or price multiplier API. | Trader dialogue uses local fixed price table with one supply flag. |
| NPC memory/rumor | Observe event or add rumor fact by NPC/zone. | Static dialogue line changes by quest/farm flags. |
| Save normalization | Versioned load defaults for new state. | Treat farm state as runtime-only in earliest debug phase and document non-persistence. |

## 3. Mushroom Runtime Contract

The mushroom system should expose a small surface:

```ts
export type MushroomFarmPhase =
  | 'empty'
  | 'spawned'
  | 'mycelium'
  | 'fruiting'
  | 'harvestable'
  | 'spoiled';

export interface MushroomFarmState {
  roomId: number;
  strainId: string;
  phase: MushroomFarmPhase;
  humidity: number;
  contamination: number;
  ownerFaction?: string;
  ownerNpcId?: number;
  lastTickMinute: number;
  mutatedBySamosbor: boolean;
}

export interface MushroomTickResult {
  changed: boolean;
  events: readonly string[];
  outputPreview?: readonly string[];
}
```

Expected operations:

| Operation | Behavior |
| --- | --- |
| `createFarm(roomId, owner)` | Registers one room-level state; no tile entity swarm. |
| `plantFarm(roomId, strainId, inputs)` | Validates strain and consumes inputs through inventory/container adapter. |
| `tickMushroomFarms(nowMinute, context)` | Advances only due farms by coarse time delta. |
| `applySamosborToFarm(roomId, variant, modifier)` | Changes contamination, mutation, lamp/power flags, or output mapping. |
| `harvestFarm(roomId, actor)` | Produces bounded outputs and publishes a harvest event. |
| `getFarmDebugSnapshot()` | Returns active count, phases, contamination, last tick, and mutation flags without allocations in hot path if possible. |

Implementation detail: if JavaScript allocation cannot be avoided in debug output, keep it outside gameplay ticks.

## 4. Event Contract

Farm events are facts. They should be low-cardinality and dedupable.

| Field | Requirement |
| --- | --- |
| `type` | One manifest event ID such as `mushroom_farm_harvested`. |
| `severity` | 1-5; mutation, theft, and spoilage are important. |
| `floor` | Existing floor enum value or string accepted by current event system. |
| `zoneId` | Include when available for economy/rumor effects. |
| `roomId` | Required for farm events. |
| `actorId` | Player or NPC if known. |
| `faction` | Owner or claimant if relevant. |
| `itemId` | Output/input item where relevant. |
| `dedupeKey` | Type + roomId + phase/output class, not random text. |

Consumers must not assume every event has every field. Parallel systems should treat mushroom events as optional facts.

## 5. Samosbor Contract

Mushroom Shift listens to samosbor; it does not own samosbor. Required integration is a narrow effect mapping.

| Samosbor condition | Farm adapter effect |
| --- | --- |
| Classic/purple or unknown active samosbor | Add small contamination and possible `strain_fioletovyy_provodnik` mutation. |
| Wet variant/modifier | Increase humidity and growth progress; increase mold risk. |
| Electric variant/modifier | Set lamp failure or slow growth until repaired. |
| Meat resonance | Convert part or all output to `strain_myasnoy_isporchennyy`/`infected_mushroom`. |
| Post-effect mold | Mark room as contaminated and trigger sanitary reaction. |

Do not modify global samosbor timing, fog spread, door behavior, or monster spawn rules for Mushroom Shift MVP. If samosbor APIs are unstable, debug commands must force farm effects directly.

## 6. Economy and Container Contract

Mushroom production should become a `ProductionRoomProfile` when the production economy exists. Until then, it is a compatible room state.

Expected future recipe mapping:

| Recipe ID | Inputs | Outputs | Cycle |
| --- | --- | --- | ---: |
| `grow_mushroom_food` | `spore_print x1`, `water x2`, `substrate_sack x1` | `mushroom_mass x4` or existing food fallback | 360 min |
| `grow_mushroom_wet` | `spore_print x1`, `technical_water x2`, `substrate_sack x1` | `mushroom_mass x5`, contamination risk | 240 min |
| `grow_mushroom_psi` | `spore_print x1`, `strange_clot x1`, water | `psi_spore x1` | 720 min |
| `dry_mushroom_mass` | `mushroom_mass x2` | `dried_mushroom x1` | 180 min |

Container expectations:

| Container | Purpose |
| --- | --- |
| `wet_spore_box` | Spores and labels. |
| `substrate_crate` | Input sacks and technical water. |
| `harvest_tray` | Output before collection/theft. |
| `sanitary_lockbox` | Spoiled or inspected batches. |

If containers are absent, the farm stores compact counts and item IDs in its state. The fallback must be small enough to migrate into containers later.

## 7. A-Life and NPC Contract

NPC behavior must be event-driven or schedule-driven. No agent should implement farm reactions by checking every NPC against every farm each frame.

Expected reactions:

| Trigger | NPC reaction |
| --- | --- |
| Farm planted | Owner NPC comments or guards room. |
| Harvest ready | Trader/queue/hungry NPC can request or buy output. |
| Harvest delivered to queue | Ration pressure reduces temporarily. |
| Spoilage | Sanitary NPC demands cleanup or locks access. |
| Meat corruption | Cult NPC offers trade; citizen trust drops if exposed. |
| Theft | Owner spreads rumor or starts small recovery quest. |

If NPC memory is unavailable, reactions can be quest flags and static dialogue substitutions. If memory exists, publish facts and let memory/rumor systems decide propagation.

## 8. Debug and Telemetry Contract

Debug is part of MVP, not polish. The system must expose enough state to explain failures.

Required debug data:

| Metric | Reason |
| --- | --- |
| Active farm count | Detect accidental world-scale simulation. |
| Last tick duration estimate | Enforce 0.1 ms suspicion threshold for ordinary MVP. |
| Room IDs and phases | Verify placement and growth. |
| Contamination/humidity | Explain spoilage. |
| Last mutation reason | Explain samosbor output changes. |
| Last 32 farm events | Local black-box fallback until global event buffer is used. |

If a full black-box circular buffer exists for critical systems, Mushroom Shift can write farm state snapshots there. If not, keep a bounded local ring for debug; do not dump unbounded JSON every tick.

## 9. Parallel-Agent Safety Rules

| Rule | Required behavior |
| --- | --- |
| No direct dependency on unmerged systems | Feature-detect or adapter-wrap events, economy, containers, memory, and contracts. |
| No root doc edits from this expansion | README and indexes update only when implementation exists and the owner allows it. |
| No enum expansion without inspection | Prefer tags/subtypes; if enum is required, coordinate with item/type owner. |
| No foreign module rewrites | Integrate through small registration calls or exported adapters. |
| No duplicated registries | One mushroom data registry, one farm system. |
| No global scans | Update farms by active farm list and coarse cadence. |
| No hidden build debt | If compile breaks, fix own code or mark blocked with exact dependency. |
| No save corruption | Add default normalization before persisted state reaches released saves. |

## 10. Verification Contract

Future implementers must verify:

| Verification | Command or method |
| --- | --- |
| Type/build | `npm run build` after code changes. |
| Debug loop | Spawn farm, give kit, plant, advance phase, force wet, force meat, spoil, harvest, dump. |
| Gameplay loop | Complete MVP route from rumor to social consequence in a new game. |
| Samosbor | Force at least two farm effects without modifying global samosbor logic. |
| Performance | Print farm tick count and duration; investigate anything over 0.1 ms in MVP. |
| Parallel safety | Run `git diff --name-only` and confirm only owned implementation files changed. |

## 11. Blockers and Fallbacks

| Missing dependency | Do this | Do not do this |
| --- | --- | --- |
| No event bus | Local bounded farm event ring plus HUD/log messages. | Implement a second world event system. |
| No economy | Local trader price and ration flag. | Build a full market engine inside mushrooms. |
| No containers | Compact farm input/output state. | Scatter dozens of floor items. |
| No NPC memory | Dialogue/quest flags. | Rewrite AI or memory. |
| No samosbor variants exposed | Debug-forced farm effects and generic active-samosbor mutation. | Change global samosbor scheduler. |
| Item enum conflict | Use existing outputs and document desired IDs. | Break item definitions for mushroom-only naming. |

The contract is satisfied when Mushroom Shift can be implemented as a removable, data-driven production module that uses shared systems when present and degrades cleanly when they are not.

## 12. Director Integration

Mushroom Shift must integrate with `00_samosbor_director` through data-driven beats and read-only signals, not through direct scheduler ownership. The authoritative hook list for this expansion is `director_hooks.md`.

Future implementation should expose one `DirectorSignalProvider` with ID `mushroom_shift`. It may report cellar discovery, active farm counts, recent harvest/spoilage/mutation facts, ration pressure, market supply class, and sanitary risk. Signal collection must be bounded by active farm state and recent fixed-size event buffers; it must not scan all world cells or all NPCs.

Director-owned beats may reveal rumors, mark social claims, request sanitary pressure, adjust local trader demand, or advance cross-expansion chain state. They must not advance farm growth, mutate item stacks, spawn large NPC groups, lock global doors, alter samosbor timing, or create a HYDROPONICS floor.

Required director chain slots for Mushroom Shift:

| Chain | Mushroom role | Required facts |
| --- | --- | --- |
| `fungal_shortage_chain` | Spoilage rumor -> market demand -> sanitary notice. | Known cellar plus recent spoilage, clean harvest, or dirty/meat output. |
| `fungal_relief_chain` | Cellar whisper -> harvest claim -> market demand. | Food scarcity, cellar discovery state, clean harvest, ration pressure. |
| `mutated_crop_chain` | Wet growth gamble -> meat/PSI fork -> sanitary notice. | Samosbor mutation fact and Act 2+ unless debug-forced. |

Director traces for mushroom beats must include `expansionId: 01_mushroom_shift`, selected beat ID, reason code, cooldown key, budget state, chain ID when active, and room/zone/event IDs when known. Missing adapters are valid rejection reasons and must be logged as `missing_signal_provider:mushroom_shift` or `missing_cross_expansion:<id>`.

Debug validation must prove both legal selection and rejection. The minimum path is: discover hint under food scarcity, block duplicate discovery after cellar-known, force spoilage into `fungal_shortage_chain`, force clean harvest into ration or market pressure, force wet mutation into one samosbor aftermath cooldown, and force meat corruption only when Act and danger budget allow it.

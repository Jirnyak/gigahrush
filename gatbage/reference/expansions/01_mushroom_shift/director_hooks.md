# Expansion 01: Mushroom Shift Director Hooks

Status: implementation-ready director contract
Owner scope: `gatbage/reference/expansions/01_mushroom_shift/**`
Director dependency: `gatbage/reference/expansions/00_samosbor_director` rare-tick scheduler, beat registry, chain state, and trace buffer
Runtime rule: Mushroom Shift exposes signals and effects through adapters; the director must not tick mushroom farms, mutate inventory directly, scan NPCs, or alter samosbor timing.

## 1. Integration Purpose

Mushroom Shift gives the director a small set of food-production beats: discovery, spoilage, harvest, ration pressure, market demand, sanitary control, and samosbor mutation. These beats are not a separate quest chain and not a hidden farming scheduler. They are campaign pacing decisions that select when existing mushroom facts become visible outside the farm room.

The director may choose a mushroom beat only from compact signals: active farm count, known farm access, recent farm events, harvest/spoilage state, ration scarcity, local market pressure, samosbor variant, and cooldowns. All mushroom state changes remain owned by the mushroom farm system or its fallback debug adapter.

## 2. Director Signal Provider

Future implementation should register one read-only provider:

| Field | Required value |
| --- | --- |
| Provider ID | `mushroom_shift` |
| Expansion ID | `01_mushroom_shift` |
| Collection cadence | Director rare tick or event-bound director tick only. Never render loop. |
| Allocation rule | Caller provides `out: DirectorSignal[]`; provider appends bounded primitive facts only. |
| Missing implementation behavior | Beats requiring mushroom signals reject with `missing_signal_provider:mushroom_shift`. |

Required signal facts:

| Signal ID | Payload contract | Source | Purpose |
| --- | --- | --- | --- |
| `mushroom.cellar_known` | `{ roomId, floor, zoneId }` | Farm discovered event or quest flag. | Allows director to start food-pressure beats only after the player can understand the cellar. |
| `mushroom.farm_active` | `{ count, harvestableCount, spoiledCount, mutatedCount }` | Farm debug snapshot or farm state list. | Prevents director from selecting beats about non-existent farms. |
| `mushroom.harvest_recent` | `{ roomId, zoneId, outputClass, clean, amountClass }` | `mushroom_farm_harvested`. | Triggers ration relief, market demand, or social claim. |
| `mushroom.spoilage_recent` | `{ roomId, zoneId, contaminationClass, mutationReason? }` | `mushroom_farm_spoiled`. | Triggers rumor, sanitary notice, and failure branch of shortage chain. |
| `mushroom.samosbor_mutation_recent` | `{ roomId, zoneId, variant, targetStrain, outputClass }` | `mushroom_farm_samosbor_mutated`. | Lets director chain purple/wet/meat consequences without owning mutation math. |
| `mushroom.ration_pressure` | `{ zoneId, pressure: 0..3, hungryNpcSeen: boolean }` | KVARTIRY ration hook or fallback quest flag. | Decides whether harvest should create relief or conflict. |
| `mushroom.market_supply` | `{ zoneId, supplyClass: 'none'|'scarce'|'normal'|'glut', illegalDemand: boolean }` | Trader/economy adapter or local price flag. | Allows market demand beat without full economy dependency. |
| `mushroom.sanitary_risk` | `{ roomId, zoneId, risk: 0..3, locked?: boolean }` | Contamination state, meat output, or inspector quest flag. | Gates inspection and quarantine beats. |

Signals are facts, not commands. If the farm system is absent, debug can emit equivalent facts manually for director validation.

## 3. Beat Candidates

Beat definitions below are owned by Mushroom Shift when implemented. They are eligible for registration only if the expansion module exists. IDs are stable and should not be renamed after save-state cooldowns ship.

| Beat ID | Act | Weight | Cooldown | Max runs | Tags | Visible trace |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `mushroom_cellar_whisper` | 0-1 | 80 | 8h | 1 | `rumor`, `discovery`, `relief_seed` | A ration-line rumor points at a wet cellar that can feed people. |
| `mushroom_first_access_pressure` | 0-1 | 55 | 12h | 1 | `access`, `social`, `living` | Someone else claims the cellar before the player can treat it as private loot. |
| `mushroom_spoilage_rumor` | 1-2 | 95 | 10h | 4 | `spoilage`, `scarcity`, `chain:fungal_shortage` | The ration queue hears that the harvest went moldy. |
| `mushroom_market_demand` | 1-3 | 70 | 18h | 5 | `market`, `supply`, `chain:fungal_shortage`, `cross:05` | A buyer raises the price for clean mushroom mass. |
| `mushroom_sanitary_notice` | 1-3 | 75 | 24h | 4 | `sanitary`, `inspection`, `chain:fungal_shortage`, `cross:03`, `cross:07` | A sanitary notice demands a humidity log and a clean batch. |
| `mushroom_harvest_claim` | 1-3 | 85 | 12h | 6 | `harvest`, `ration`, `choice` | Hungry neighbors ask for a share before traders can take it. |
| `mushroom_wet_growth_gamble` | 1-3 | 60 | 16h | 4 | `samosbor`, `wet`, `risk_relief` | Wet samosbor makes the crop grow fast and smell wrong. |
| `mushroom_meat_corruption_offer` | 2-4 | 45 | 36h | 3 | `samosbor`, `meat`, `cult`, `danger` | A cult buyer wants the corrupted batch before inspectors see it. |
| `mushroom_psi_spore_hint` | 2-4 | 35 | 48h | 2 | `psi`, `yakov`, `mutation`, `science` | A violet mutation becomes a research lead instead of generic loot. |
| `mushroom_theft_after_glut` | 2-4 | 45 | 30h | 3 | `theft`, `market`, `backlash` | A visible surplus attracts a quiet theft or debt claim. |

## 4. Conditions And Blocks

Conditions must be evaluated against `CampaignSnapshot`, director cooldown state, and mushroom signals. Exact function names are implementation-owned by the director, but the semantics are fixed here.

| Condition ID | Passes when | Used by |
| --- | --- | --- |
| `has_open_expansion:01_mushroom_shift` | `openExpansionIds` includes Mushroom Shift or a mushroom signal provider is present. | All beats. |
| `mushroom_cellar_not_known` | No `mushroom.cellar_known` signal and no recent discovery event. | `mushroom_cellar_whisper`. |
| `mushroom_cellar_known` | Farm room is discovered or access quest reached. | All post-discovery beats. |
| `mushroom_active_farm_exists` | Active farm count is greater than zero. | Harvest, spoilage, sanitary, samosbor beats. |
| `recent_event:mushroom_farm_spoiled` | A spoilage event exists in the recent important-event window or local farm ring. | `mushroom_spoilage_rumor`, `mushroom_sanitary_notice`. |
| `recent_event:mushroom_farm_harvested` | A harvest event exists in the recent important-event window or local farm ring. | `mushroom_harvest_claim`, `mushroom_market_demand`, `mushroom_theft_after_glut`. |
| `recent_event:mushroom_farm_samosbor_mutated` | A mutation event exists with known variant or generic purple fallback. | `mushroom_wet_growth_gamble`, `mushroom_meat_corruption_offer`, `mushroom_psi_spore_hint`. |
| `scarcity:food_or_ration` | Snapshot scarcity tags include food/ration or `mushroom.ration_pressure.pressure >= 2`. | Discovery, harvest claim, spoilage rumor. |
| `samosbor_variant:wet` | Last or active samosbor variant is wet, or mutation signal variant is wet. | `mushroom_wet_growth_gamble`. |
| `samosbor_variant:meat` | Last or active samosbor variant is meat resonance, or mutation output is meat/corrupt. | `mushroom_meat_corruption_offer`. |
| `mushroom_clean_supply_available` | Recent harvest was clean and supply is not `none`. | `mushroom_market_demand`, `mushroom_harvest_claim`. |
| `mushroom_dirty_or_meat_output` | Spoilage, contamination risk, infected output, or meat mutation exists. | `mushroom_sanitary_notice`, `mushroom_meat_corruption_offer`. |
| `danger_budget_at_least:1` | Director danger budget can afford a small social threat. | Sanitary, theft, meat offer. |
| `relief_budget_at_least:1` | Director relief budget can afford a useful lead or market outlet. | Whisper, market demand, PSI hint. |

Blocking conditions:

| Block ID | Blocks when | Reason |
| --- | --- | --- |
| `chain_id_validation:fungal_shortage` | Blocks registration if a beat references any fungal shortage chain ID other than `fungal_shortage_chain`. | Prevents silent chain-name drift. |
| `mushroom_farm_absent` | No active farm and beat is not discovery/access. | No fake reports about invisible production. |
| `mushroom_already_overpressured` | Recent beat IDs contain two mushroom danger beats inside the last 24h. | Stops director from turning one farm failure into spam. |
| `samosbor_active_heavy_crisis` | Active samosbor plus danger budget is zero. | Director must not stack sanitary/theft beats into an active survival spike. |
| `missing_cross_expansion:05_black_market_88` | Market demand requires market adapter but no fallback trader is registered. | Use ration or sanitary beat instead. |
| `missing_cross_expansion:07_hospital_block` | Sanitary notice wants hospital quarantine escalation but hospital adapter is absent. | Keep notice local to inspector/fallback. |

## 5. Effects Contract

Director effects are small and reversible. They set flags, enqueue facts, or ask another system adapter to perform its own operation. They do not change farm growth timers, item stacks, fog, pathfinding, or global samosbor.

| Effect ID | Target adapter | Required behavior | Fallback |
| --- | --- | --- | --- |
| `mushroom_reveal_cellar_hint` | Rumor/journal/map marker adapter | Adds one hint toward `mushroom_cellar_first_shift` without teleporting player. | HUD/log line with stable room/zone clue. |
| `mushroom_mark_access_contested` | Mushroom quest/farm adapter | Marks first cellar as socially claimed by owner or queue. | Dialogue flag on Egor/Marfa path. |
| `mushroom_emit_queue_spoilage_rumor` | Rumor/NPC memory adapter | Records that the queue heard about mold. | World log/HUD line and local ring entry. |
| `mushroom_adjust_market_demand` | Economy/trader adapter | Sets local clean-mushroom demand class for a cooldown window. | Trader dialogue price flag only. |
| `mushroom_request_harvest_share` | Quest/dialogue adapter | Opens choice: give share to queue, sell, keep, or hide. | One quest flag plus journal line. |
| `mushroom_call_sanitary_notice` | Sanitary/quest adapter | Creates inspection pressure for contaminated/meat farm. | Inspector dialogue flag; no forced door lock unless local mushroom system owns it. |
| `mushroom_apply_wet_director_note` | Mushroom farm adapter | Records director-visible wet-growth consequence; farm math already happened elsewhere. | Trace-only if farm effect was already applied by debug. |
| `mushroom_offer_meat_buyer` | Cult/trader adapter | Makes corrupted output valuable but socially dangerous. | Log a cult buyer rumor with no spawn. |
| `mushroom_emit_psi_research_hint` | Yakov/science adapter | Points violet mutation toward existing science/PSI route. | Journal note only. |
| `mushroom_schedule_theft_attempt` | Mushroom/social adapter | Marks output as theft-risk for the next farm tick or room visit. | One delayed rumor; no instant item removal from director. |

Effect failure must record `effect_failed:<effectId>` and consume no cooldown unless the target adapter explicitly reports a partial committed state.

## 6. Cooldowns, Runs, And Budgets

Mushroom beats are allowed to create pressure, but food production is an early survival loop. Cooldowns must stop repetitive punishment.

| Beat group | Shared cooldown key | Rule |
| --- | --- | --- |
| Discovery/access | `mushroom.discovery` | One discovery hint and one access-pressure beat per campaign unless debug-forced. |
| Spoilage/sanitary | `mushroom.contamination_pressure` | At least 10h between spoilage rumor and sanitary notice unless the player causes a second distinct contaminated farm. |
| Market/trade | `mushroom.market_pressure` | Demand can recur, but not more than once per 18h and not while supply is `none`. |
| Harvest claim | `mushroom.ration_claim` | Can recur across harvests; max once per 12h and only if food/ration pressure exists. |
| Samosbor mutation | `mushroom.samosbor_aftermath` | One wet/meat/psi aftermath beat per samosbor cycle. |
| Theft/backlash | `mushroom.backlash` | Requires at least one earlier relief or market beat since the last theft beat. |

Budget costs:

| Beat | Danger cost | Relief cost |
| --- | ---: | ---: |
| `mushroom_cellar_whisper` | 0 | 1 |
| `mushroom_first_access_pressure` | 1 | 0 |
| `mushroom_spoilage_rumor` | 1 | 0 |
| `mushroom_market_demand` | 0 | 1 |
| `mushroom_sanitary_notice` | 2 | 0 |
| `mushroom_harvest_claim` | 1 | 0 |
| `mushroom_wet_growth_gamble` | 1 | 1 |
| `mushroom_meat_corruption_offer` | 2 | 0 |
| `mushroom_psi_spore_hint` | 0 | 1 |
| `mushroom_theft_after_glut` | 2 | 0 |

## 7. Chain Slots

Mushroom Shift owns the first step of one director MVP chain and can occupy slots in later cross-expansion chains.

### `fungal_shortage_chain`

| Slot | Beat | Required prior state | Output state |
| ---: | --- | --- | --- |
| 0 | `mushroom_spoilage_rumor` | Spoilage or contaminated output is recent; ration pressure exists. | Queue knows food production failed. |
| 1 | `mushroom_market_demand` | Queue rumor or clean harvest exists; market adapter or fallback trader exists. | Clean mushroom supply becomes economically visible. |
| 2 | `mushroom_sanitary_notice` | Spoilage, meat output, or repeated market demand exists. | Sanitary/social conflict is active. |

The chain can skip slot 1 if market integration is absent. It must not skip directly from no known cellar to sanitary notice.

### `fungal_relief_chain`

| Slot | Beat | Required prior state | Output state |
| ---: | --- | --- | --- |
| 0 | `mushroom_cellar_whisper` | Food scarcity and no cellar knowledge. | Player gains a concrete lead. |
| 1 | `mushroom_harvest_claim` | Clean harvest recent. | Player chooses who gets food. |
| 2 | `mushroom_market_demand` | Player sold or exposed clean supply. | Supply pressure becomes trade pressure. |

This chain is the relief counterpart. It gives access and trade before backlash.

### `mutated_crop_chain`

| Slot | Beat | Required prior state | Output state |
| ---: | --- | --- | --- |
| 0 | `mushroom_wet_growth_gamble` | Wet samosbor affected a farm. | Fast harvest risk is visible. |
| 1 | `mushroom_meat_corruption_offer` or `mushroom_psi_spore_hint` | Mutation output class is meat or psi. | Player receives a faction/science fork. |
| 2 | `mushroom_sanitary_notice` | Dirty output was exposed or ignored. | Inspection pressure closes the loop. |

This chain is Act 2+ unless debug-forced. It must never teach mutation before the player has seen ordinary planting and harvest.

## 8. Trace Entries

Every selected or rejected mushroom beat must be explainable in the director trace. Required extension fields can live in a generic payload map if the director trace stays small.

| Field | Requirement |
| --- | --- |
| `chosenBeatId` | Stable beat ID from this document. |
| `reasonCode` | One of `mushroom_discovery_seed`, `mushroom_recent_harvest`, `mushroom_recent_spoilage`, `mushroom_samosbor_aftermath`, `mushroom_budget_blocked`, `mushroom_missing_signal`, `mushroom_chain_step`, `effect_failed:<effectId>`. |
| `expansionId` | `01_mushroom_shift`. |
| `chainId` | `fungal_shortage_chain`, `fungal_relief_chain`, `mutated_crop_chain`, or omitted. |
| `roomId` | Required when a known farm is involved. |
| `zoneId` | Required when market/ration/sanitary pressure is involved and zone is known. |
| `eventId` | Recent mushroom event that made the beat legal, if any. |
| `samosborVariant` | Required for wet/meat/psi aftermath beats when known. |
| `dangerBudget` / `reliefBudget` | Values before applying the beat. |
| `cooldownKey` | Shared cooldown key consumed by the beat. |

Rejected top candidate examples:

| Rejection code | Meaning |
| --- | --- |
| `missing_signal_provider:mushroom_shift` | Expansion not implemented or provider not registered. |
| `blocked:mushroom_farm_absent` | Beat referenced farm consequences before discovery/planting. |
| `blocked:mushroom_already_overpressured` | Two recent mushroom danger beats were already applied. |
| `blocked:samosbor_active_heavy_crisis` | Active crisis consumed danger budget. |
| `cooldown:mushroom.samosbor_aftermath` | Same samosbor cycle already received a mushroom aftermath. |

## 9. Debug Validation

Director debug must prove selection and rejection, not just list beat IDs.

| Debug command | Required validation |
| --- | --- |
| `director snapshot` | Shows mushroom provider present/absent, active farm count, recent harvest/spoilage/mutation flags, ration pressure, and market supply class. |
| `director roll` | Can select `mushroom_cellar_whisper` from food scarcity with no known cellar and records `mushroom_discovery_seed`. |
| `director force mushroom_spoilage_rumor` | Requires a spoilage signal unless debug override is explicit; records chain slot 0. |
| `director force mushroom_market_demand` | Fails with `missing_cross_expansion:05_black_market_88` only when no trader fallback exists; otherwise applies local fallback. |
| `director force mushroom_sanitary_notice` | Requires dirty/meat/spoilage state or explicit override; never locks global samosbor doors. |
| `director trace` | Shows reason code, cooldown key, room/zone when known, and budget cost. |
| `director chains` | Shows `fungal_shortage_chain`, `fungal_relief_chain`, and `mutated_crop_chain` step index and last beat time. |
| Mushroom debug bridge | `debug_mushroom_force_wet`, `debug_mushroom_force_meat`, `debug_mushroom_spoil`, and `debug_mushroom_harvest` must create facts that director can consume on the next event-bound or rare tick. |

Minimum manual validation path:

| Step | Expected result |
| ---: | --- |
| 1 | Start with food scarcity and no cellar knowledge; `director roll` chooses or ranks `mushroom_cellar_whisper` if relief budget is available. |
| 2 | Mark cellar known and spawn one active farm; discovery beat becomes illegal with max-run/cellar-known rejection. |
| 3 | Force spoilage; `mushroom_spoilage_rumor` becomes legal and enters `fungal_shortage_chain` slot 0. |
| 4 | Force clean harvest; `mushroom_harvest_claim` or `mushroom_market_demand` becomes legal depending on ration pressure and market fallback. |
| 5 | Force wet mutation during or after wet samosbor; `mushroom_wet_growth_gamble` consumes `mushroom.samosbor_aftermath` and blocks repeat mutation beats in the same cycle. |
| 6 | Force meat corruption after Act 2; `mushroom_meat_corruption_offer` is legal only with danger budget and dirty/meat output. |

## 10. Performance And Math LOD

Low tier collects at most eight primitive mushroom signals per director tick and supports one active farm per loaded floor. Middle tier can expose several farms and local market/ration classes. High tier adds chain state and theft/sanitary pressure. Ultra does not increase director tick frequency; it spends saved cycles on richer text, audio cues, and visual aftermath owned by other systems.

Steady-state cost target remains `0 us/frame`. Director evaluation is rare-tick or event-bound. Mushroom signal collection must be O(active mushroom farms + recent bounded events), never O(world cells) or O(all NPCs x farms).

## 11. Non-Interference Rules

The director must not:

| Forbidden action | Correct owner |
| --- | --- |
| Advance mushroom growth phases. | `src/systems/mushrooms.ts` or future production adapter. |
| Add/remove inventory items directly. | Inventory/container/farm harvest adapter. |
| Spawn inspectors, traders, cultists, or thieves directly. | NPC/content modules through existing spawn or dialogue hooks. |
| Lock doors globally or alter samosbor timers. | Samosbor and local room systems. |
| Create a HYDROPONICS floor. | Future expansion implementation after MVP. |
| Scan all rooms, NPCs, or world cells for farms. | Mushroom signal provider with bounded active farm list. |

This contract is satisfied when director can schedule mushroom beats from facts, explain every choice in trace, and degrade cleanly when market, hospital, memory, or economy adapters are absent.

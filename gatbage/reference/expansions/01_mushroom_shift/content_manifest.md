# Expansion 01: Mushroom Shift Content Manifest

Status: technical content manifest for future implementation  
Scope: rooms, NPCs, items/resources, documents, events, debug commands  
Implementation rule: stable IDs first, runtime code later

## 1. Manifest Rules

This manifest is not a bullet pool. Each entry exists because it supports the MVP loop: discover the farm, obtain inputs, grow a batch, survive a risk, harvest, and trigger a social consequence. Names and IDs are proposed as implementation anchors. Future code should inspect current registries before final enum additions and should prefer tags/subtypes over broad enum expansion.

MVP content must fit existing floors:

| Floor or module | Role in loop |
| --- | --- |
| `LIVING` | The first farm and owner conflict. |
| `MAINTENANCE` | Wet substrate, technical water, pipe hazard. |
| `KVARTIRY` | Ration pressure and hungry social consequence. |
| market/living content | Trader, price signal, optional black-market bridge. |

## 2. Rooms

| ID | Floor | Type/tag expectation | Required occupants | Gameplay purpose | MVP state |
| --- | --- | --- | --- | --- | --- |
| `mushroom_cellar_first_shift` | `LIVING` | `STORAGE` or `PRODUCTION` with tags `mushroom_farm`, `wet`, `restricted` | Eгор Плесень, one hungry NPC visitor | Main farm room with two racks, one wet box, one locked note shelf, and one bad lamp. | Required |
| `mushroom_cellar_airlock_niche` | `LIVING` | small connector with `airlock_adjacent`, `inspection` | optional sanitary NPC | Gives a door-control pressure point and inspection staging area without changing hermodoor rules. | Required if room layout allows |
| `substrate_store_wet_bags` | `MAINTENANCE` | `STORAGE` with tags `substrate`, `technical_water`, `pipe_leak` | Борис Сухарь or maintenance worker | Source of substrate sacks and technical water; risk is wet floors, pipe noise, or local monster. | Required |
| `maintenance_condensate_tank` | `MAINTENANCE` | `UTILITY` or tagged storage | none required | Optional water source if existing maintenance generation has a suitable pump/tank. | Optional MVP |
| `ration_pressure_counter` | `KVARTIRY` | `KITCHEN`/queue content with tag `ration_pressure` | Марфа Талонница, hungry family member | Converts harvest success or failure into social pressure, price, rumor, or request. | Required |
| `mushroom_buyer_stall` | market/living | `MARKET` or existing trader spot tagged `mushroom_trade` | Ринат Мокрый Рубль | Lets player sell legal or illegal batches and see price impact. | Required if trading hook exists |
| `spore_archive_locker` | future archive/Ministry bridge | `OFFICE`/`STORAGE` with tag `spore_archive` | archive clerk later | Holds rare archival spore prints for post-MVP. | Deferred |
| `hydroponics_wet_racks` | future pocket | `PRODUCTION` with `hydroponics`, `mushroom_farm` | shift crew | Dense advanced farm room for Phase 5 pocket. | Deferred |
| `hydroponics_lamp_garden` | future pocket | `PRODUCTION` with `lamp_garden` | electrician/hydroponicist | Turns light/power failures into farm modifiers. | Deferred |
| `hydroponics_quarantine_greenhouse` | future pocket | `MEDICAL`/`PRODUCTION` with `quarantine` | sanitary NPC, scientist | Contains high-risk mutated strains and locked documents. | Deferred |

Room placement constraints:

| Constraint | Reason |
| --- | --- |
| Do not overwrite protected atrium/apartment masks. | README states protected `aptMask` invariants matter during samosbor. |
| Do not require a new `FloorLevel` for MVP. | Expansion index requires small playable slice before new floor. |
| Use room tags or subtype if available. | `desdoc.md` discourages enum growth when tags solve the distinction. |
| Keep interactables bounded. | One farm state per room, not individual mushroom entities. |

## 3. NPCs

| ID | Name | Floor | Faction/role | Function | MVP state |
| --- | --- | --- | --- | --- | --- |
| `npc_egor_plesen` | Егор Плесень | `LIVING` | citizen or wild-aligned mushroom keeper | Owns the first cellar, teaches the player enough to plant, may lie about contamination. | Required |
| `npc_boris_sukhar` | Борис Сухарь | `MAINTENANCE` | maintenance worker / substrate dryer | Guards or sells substrate sacks; hates wet samosbor because it ruins drying. | Required |
| `npc_marfa_talonnitsa` | Марфа Талонница | `KVARTIRY` | ration controller | Turns harvest into queue pressure, requests part of yield, generates social consequence. | Required |
| `npc_rinat_mokry_rubl` | Ринат Мокрый Рубль | market/living | trader | Buys mushrooms, pays less after supply, pays more for mutated batches if lawless. | Required if market hook exists |
| `npc_olga_sanpropusk` | Ольга Санпропуск | `LIVING`/inspection niche | sanitary inspector, liquidator-adjacent | Demands clean batch or quarantine; gives the player a non-combat pressure check. | Required for social pressure if queue hook is absent |
| `npc_yakov_mushroom_comment` | Яков Давидович hook | existing `LIVING` lab | scientist | Optional dialogue bridge for PSI strains; should not be a hard dependency for MVP. | Optional |
| `npc_yana_fioletovaya` | Яна Фиолетовая | cult/wild route | cultist buyer | Wants meat-resonance output and creates moral/faction risk. | Deferred |
| `npc_oksana_spora` | Оксана Спора | future hydroponics pocket | courier/hydroponicist | Moves rare spore prints between pocket and market. | Deferred |

NPC behavior constraints:

| Constraint | Implementation effect |
| --- | --- |
| No global NPC scan for farms. | Reactions trigger by room tag, quest state, structured event, or coarse scheduler. |
| No required dependency on memory system. | If NPC memory is absent, use dialogue flags and world events as fallback. |
| No faction absolutism. | Citizens, liquidators, cultists, and traders all have practical claims on food. |

## 4. Items and Resources

MVP should use existing item IDs when they can carry the loop. New IDs are justified only when the player cannot understand production without them.

| Proposed ID | Category | Use | Add timing |
| --- | --- | --- | --- |
| `spore_print` | quest/resource item | Starts a known strain in a farm bed. | MVP required |
| `substrate_sack` | resource item | Consumed with water to plant or refresh farm. | MVP required |
| `mushroom_mass` | food/resource item | Generic harvest output; can convert to food, trade, or recipe input. | MVP required unless existing food IDs are used directly |
| `infected_mushroom` | dangerous food/resource | Spoiled or samosbor-mutated output; trade/cult/medicine hook. | MVP required if contamination is visible through inventory |
| `psi_spore` | PSI/medical component | Output from PSI strain or purple mutation. | Post-MVP |
| `dried_mushroom` | food/trade item | Safer shelf-stable output from drying room. | Post-MVP |
| `mold_scraper` | tool | Reduces contamination or harvests mold safely. | Post-MVP |
| `humidity_log` | document/quest item | Bureaucratic inspection object. | MVP document or post-MVP item |
| `fungicide_ampoule` | medical/utility | Removes contamination at a cost. | Post-MVP |

Existing items to reuse:

| Existing item role | Mushroom usage |
| --- | --- |
| water | Required input or reward trade. |
| kasha/bread/canned equivalents | Safe output fallback if adding `mushroom_mass` is delayed. |
| pills/antidep | Medical output from later strains. |
| strange clot / PSI items | Rare mutation component; optional. |
| pipe/wrench | Maintenance repair or access checks. |
| rubles | Trader and ration pressure reward. |

## 5. Strains

| Strain ID | Name | Core tags | Grow target | Risk | MVP state |
| --- | --- | --- | --- | --- | --- |
| `strain_belaya_stolovaya` | Белая столовая | `food`, `stable`, `citizen` | Cheap edible mass. | Low food value if grown dry. | Required |
| `strain_seraya_lekarstvennaya` | Серая лекарственная | `medical`, `bitter` | Pills/antidepressant bridge. | Needs cleaner water. | MVP optional |
| `strain_sonnaya_vachta` | Сонная вахта | `sedative`, `trade` | Sleepy food/drink component. | Can debuff player/NPC. | Post-MVP |
| `strain_zhelchnaya_yadovitaya` | Желчная ядовитая | `toxic`, `weaponizable` | Poison/trade risk. | Harmful if eaten. | Post-MVP |
| `strain_fioletovyy_provodnik` | Фиолетовый проводник | `psi`, `mutation` | PSI spore or strange output. | Samosbor attraction. | MVP mutation target |
| `strain_mokryy_kollektornyy` | Мокрый коллекторный | `wet`, `maintenance` | Fast food after wet samosbor. | High contamination. | Required as wet variant |
| `strain_myasnoy_isporchennyy` | Мясной испорченный | `meat`, `cult`, `corrupt` | Cult trade or destroy objective. | Citizen/liquidator penalty. | Required as meat mutation target |
| `strain_arhivnyy_sukhoy` | Архивный сухой | `rare`, `document`, `slow` | Rare post-MVP document/permit bridge. | Slow, theft magnet. | Deferred |

## 6. Documents

Documents must be short, original, and usable as world texture/log content. MVP needs at least 10.

| ID | Title | Location | Gameplay use |
| --- | --- | --- | --- |
| `doc_mushroom_poster_rasti` | `РАСТИ ГРИБЫ!` | cellar wall | Introduces the room without tutorial text. |
| `doc_humidity_log_01` | Журнал влажности N1 | cellar shelf | Shows expected humidity and missing entries. |
| `doc_substrate_receipt` | Накладная на мокрые мешки | substrate store | Points player from cellar to maintenance. |
| `doc_sanitary_warning_mold` | Предписание о плесени | inspection niche | Explains contamination consequence. |
| `doc_ration_claim_queue` | Заявление очереди на урожай | ration counter | Makes social claim explicit. |
| `doc_boris_drying_note` | Записка Бориса о сушке | substrate store | Explains why wet variant is good and bad. |
| `doc_spore_print_label` | Этикетка спорового отпечатка | wet box | Identifies strain. |
| `doc_failed_batch_report` | Акт о списании партии | cellar shelf | Sets up spoilage/failure state. |
| `doc_cult_meat_recipe` | Рецепт мясного дара | cult/trader path | Marks corrupted output as dangerous value. |
| `doc_market_price_sheet_mushrooms` | Лист цен на грибы | trader stall | Communicates price impact. |
| `doc_yakov_margin_note` | Пометка Якова на полях | optional lab hook | Connects PSI strain to science without explaining samosbor. |
| `doc_shift_roll_call_dead` | Перекличка мертвой смены | future hydroponics pocket | Late content atmosphere and quest seed. |

## 7. Events

Events should be structured if `worldEvents` or a future event bus is available. If not, local logs/debug records must use these IDs so migration stays mechanical.

| Event ID | Severity | Trigger | Expected consumers |
| --- | ---: | --- | --- |
| `mushroom_farm_discovered` | 2 | Player enters first cellar or hears verified rumor. | Journal, rumor unlock, debug. |
| `mushroom_farm_planted` | 3 | Player or NPC plants a strain. | Farm system, NPC memory, journal. |
| `mushroom_farm_tick` | 1 | Coarse growth update. | Debug only by default. |
| `mushroom_farm_harvest_ready` | 3 | Farm reaches harvestable phase. | HUD, owner NPC, trader. |
| `mushroom_farm_harvested` | 4 | Player/NPC collects output. | Economy, ration queue, rumors. |
| `mushroom_farm_spoiled` | 4 | Contamination crosses threshold. | Sanitary NPC, mold rumor, quest failure. |
| `mushroom_farm_stolen` | 4 | Output disappears or wild NPC steals. | Owner reaction, rumor, theft quest. |
| `mushroom_farm_samosbor_mutated` | 5 | Samosbor variant changes strain/output. | Journal, cult/science reactions. |
| `mushroom_ration_pressure_reduced` | 3 | Food output delivered to queue. | KVARTIRY tension, NPC dialogue. |
| `mushroom_sanitary_inspection_called` | 4 | Spoiled/meat batch or dirty farm detected. | Liquidator/sanitary path, access lock. |
| `mushroom_market_price_changed` | 2 | Supply changes local price. | Trader UI/dialogue, debug. |
| `mushroom_hydroponics_pocket_opened` | 5 | Post-MVP pocket access granted. | Late quest, map, rumors. |

## 8. Quest and Objective Beats

The MVP quest should be short and mechanically complete.

| Beat ID | Objective | Completion result |
| --- | --- | --- |
| `mushroom_rumor_start` | Learn that a wet cellar grows food. | Cellar marker or dialogue hint. |
| `mushroom_get_access` | Talk, pay, steal, or bypass cellar access. | Farm inspect action available. |
| `mushroom_get_substrate` | Bring substrate sack from maintenance source. | Plant action unlocked. |
| `mushroom_get_water` | Provide water or use technical water with risk. | Humidity set. |
| `mushroom_plant_first` | Plant `strain_belaya_stolovaya` or wet collector strain. | Farm enters growth phase. |
| `mushroom_survive_risk` | Wait through growth tick or forced samosbor event. | Harvest or mutation path set. |
| `mushroom_harvest_first` | Collect output. | Food/resource gained. |
| `mushroom_social_claim` | Decide who receives part of harvest. | Queue/trader/sanitary/cult consequence. |

## 9. Debug Commands

Debug commands must be explicit and testable.

| Command label | Proposed action ID | Effect |
| --- | --- | --- |
| Spawn mushroom farm here | `debug_mushroom_spawn_farm` | Creates/marks current room as farm with empty state. |
| Give mushroom MVP kit | `debug_mushroom_give_kit` | Adds spore print, substrate, and water or nearest equivalents. |
| Advance mushroom phase | `debug_mushroom_advance_phase` | Moves selected farm one phase with deterministic reason. |
| Force wet mutation | `debug_mushroom_force_wet` | Applies wet samosbor farm effect. |
| Force meat corruption | `debug_mushroom_force_meat` | Converts output toward meat/cult path. |
| Spoil active farm | `debug_mushroom_spoil` | Sets contamination above threshold. |
| Harvest active farm | `debug_mushroom_harvest` | Produces output and publishes harvest event. |
| Print mushroom farms | `debug_mushroom_dump` | Shows active farm count, room IDs, phases, last tick, mutation flags. |
| Toggle farm LOD tier | `debug_mushroom_lod_cycle` | Cycles low/middle/high/ultra behavior for profiling. |
| Show mushroom economy delta | `debug_mushroom_supply` | Shows local supply/price fallback or economy integration state. |

## 10. Acceptance Matrix

| Content axis | MVP minimum | Deferred expansion |
| --- | --- | --- |
| Rooms | 3 core rooms plus trader or inspection fallback. | Hydroponics pocket with 8+ rooms. |
| NPCs | 4 named NPCs. | Couriers, cult buyers, inspectors, shift crew. |
| Items | 2-4 new IDs or existing fallback outputs. | Full resource/medicine/PSI catalog. |
| Documents | 10 short documents. | 30+ logs, recipes, permits, shift records. |
| Events | 8 core farm events. | Contracts, raids, family requests, pocket events. |
| Debug | Create, grow, mutate, spoil, harvest, dump. | Economy page, stress simulator, pocket generator. |

The content is acceptable only if it forms the production survival loop. A room with a poster and loot is not Mushroom Shift.

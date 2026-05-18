# Черный рынок 88: director hooks

Статус: implementation-ready contract for connecting Black Market 88 to `00_samosbor_director` without editing shared source during this pass. This document defines beat data, signal requirements, effect boundaries, cooldowns, chain slots, trace rows and debug validation for future implementation.

## Boundary

The director may select market beats. It may not own market state, calculate prices, write item stacks, create debt records directly, mutate trader stock directly or spawn patrol systems. Market code owns heat, trust, access, stock locks, debt lifecycle, price calculation and trader text. AG10 economy/contracts/container systems own base values, quest/contract runtime and stack transfer.

The accepted flow is: director snapshot reads compact signals; director chooses a legal beat; the beat calls a market adapter or emits an event; market systems apply bounded effects; director writes trace. If an adapter is missing, the beat is rejected with `missing_signal_provider` and no cooldown is consumed.

## Signal Contract

Market signal providers expose compact facts only. They do not scan all world cells, containers or NPC inventories during director tick.

| Signal id | Type | Source owner | Meaning | Required cap |
| --- | --- | --- | --- | --- |
| `market88.open` | flag | market | At least one market entry is unlocked. | one boolean |
| `market88.access.password` | flag | market/rumor | Player knows the living password entry. | one boolean |
| `market88.access.maintenance_guide` | flag | market | Player can use the hatch route or owes guide debt. | one boolean |
| `market88.heat` | integer 0-100 | market | Raid/audit pressure. | one scalar |
| `market88.trust` | integer -5..5 | market | Market willingness to offer better terms. | one scalar |
| `market88.raidCooldownHours` | timestamp/hour | market | Next legal raid time. | one scalar |
| `market88.activeDebtCount` | integer | market | Number of unresolved player market debts. | capped at 64 |
| `market88.overdueDebtSeverity` | integer 0-5 | market | Highest overdue severity. | one scalar |
| `market88.stockLaneLow.survival` | flag | market/economy adapter | Survival stock lane is low. | lane flag |
| `market88.stockLaneLow.weapons` | flag | market/economy adapter | Weapon/ammo stock lane is low. | lane flag |
| `market88.stockLaneLow.documents` | flag | market/economy adapter | Document lane is low or locked. | lane flag |
| `scarcity.survival` | tag | AG10 economy or fallback | Water, bread, bandages or pills are scarce. | tag list |
| `scarcity.energy` | tag | AG10 economy or fallback | Batteries/energy cells matter after electric events. | tag list |
| `scarcity.documents` | tag | AG10 economy/Ministry adapter | Document pressure is high. | tag list |
| `samosbor.variant.classic` | tag | samosbor/director snapshot | Last aftermath was classic. | last variant only |
| `samosbor.variant.quiet` | tag | samosbor/director snapshot | Last aftermath was quiet. | last variant only |
| `samosbor.variant.wet` | tag | samosbor/director snapshot | Last aftermath was wet. | last variant only |
| `samosbor.variant.electric` | tag | samosbor/director snapshot | Last aftermath was electric. | last variant only |
| `samosbor.variant.meat` | tag | samosbor/director snapshot | Last aftermath was meat resonance. | last variant only |
| `faction.liquidatorPressure` | integer 0-5 | faction adapter | Liquidators can plausibly raid or extort. | one scalar |
| `faction.ministrySuspicion` | integer 0-5 | ministry/document adapter | Audit pressure after forged documents. | one scalar |
| `player.marketRecentTrade` | flag | event bus | Player traded recently enough for a follow-up beat. | recent event flag |

## Effect Contract

Director effects are requests, not direct writes. Each effect must return success/failure and a reason code for trace.

| Effect id | Owner adapter | Allowed mutation | Explicitly forbidden mutation |
| --- | --- | --- | --- |
| `market88.effect.setDemandLane` | market | Set one lane demand modifier with expiry and source beat id. | Recalculate global economy. |
| `market88.effect.offerContract` | market/contracts | Offer one `market88` tagged contract through existing quest/contract cap. | Bypass active quest cap or mutate `PLOT_CHAIN`. |
| `market88.effect.warnDebt` | market/world log | Advance debt from created to warned, emit one warning trace. | Spawn enemies on every warning. |
| `market88.effect.matureDebt` | market | Mark one due debt overdue and apply one bounded consequence. | Process all debts per frame. |
| `market88.effect.lockTraderLane` | market | Lock one trader or lane until timestamp. | Delete uncapped stock arrays. |
| `market88.effect.raiseHeat` | market | Add bounded heat delta with clamp. | Change samosbor timer frequency. |
| `market88.effect.startRaid` | market | Apply one raid state, lock lanes, emit event, optionally request one encounter hook. | Spawn large patrols or loot farm. |
| `market88.effect.grantRelief` | market | Lower heat, extend raid cooldown or unlock a safe trade after relief budget. | Make market permanently safe. |
| `market88.effect.emitRumor` | rumor/event fallback | Add one market rumor/access hint. | Create a separate rumor truth source. |
| `market88.effect.traceOnly` | director | Write director trace when visible gameplay effect is blocked. | Consume cooldown for failed gameplay effects. |

## Beat Rows

Beat ids are stable data ids. Weights are relative and should be tuned by director owner after the global registry exists.

| Beat id | Act | Tags | Weight | Cooldown | Max runs | Requires | Blocks | Effects | Visible trace | Debug summary |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| `market88.beat.password_whisper` | 0-1 | relief, access, rumor | 8 | 6h | 2 | `!market88.open`, `reliefBudget >= 1`, recent civilian or trader contact | active samosbor, dangerBudget exhausted | `emitRumor(market88.entry.living_password)`, trace | A citizen sells a half-password instead of a map. | Seed first market access without direct map reveal. |
| `market88.beat.samosbor_panic_buying` | 1-3 | scarcity, samosbor, survival | 10 | 12h | 6 | `market88.open`, last variant classic or quiet, `scarcity.survival` or recent samosbor aftermath | active raid | `setDemandLane(survival,+)`, `raiseHeat(+1)` | Cashier hides water and bandages after the siren. | Survival demand rises after classic/quiet aftermath. |
| `market88.beat.wet_filter_shortage` | 1-3 | scarcity, samosbor, wet | 8 | 18h | 4 | `market88.open`, `samosbor.variant.wet` | active raid | `setDemandLane(survival_dry,+)`, `offerContract(deliver_night_stock)` | Damp stock rots; dry goods become currency. | Wet variant drives filter/dry-food demand. |
| `market88.beat.electric_cell_currency` | 1-4 | scarcity, samosbor, energy | 7 | 18h | 4 | `market88.open`, `samosbor.variant.electric` or `scarcity.energy` | active raid | `setDemandLane(energy,+)`, `lockTraderLane(weapons,short)` | Quartermaster prices ammunition in cells for one night. | Electric aftermath changes energy-cell demand. |
| `market88.beat.meat_cult_premium` | 2-4 | scarcity, cult, psi | 5 | 24h | 3 | `market88.open`, `samosbor.variant.meat`, act >= 2 | reliefBudget required, cult lane disabled by implementation | `setDemandLane(psi_cult,+)`, `raiseHeat(+2)` | A covered counter opens for red-stained components. | Meat resonance opens dangerous PSI/cult demand. |
| `market88.beat.debt_first_warning` | 1-4 | debt, warning | 9 | 8h | 8 | `market88.activeDebtCount > 0`, debt due soon, `player.marketRecentTrade` | overdue severity >= 3 | `warnDebt`, `raiseHeat(+1)` | The accountant remembers the date before the player does. | Warn before maturing low debt. |
| `market88.beat.debt_overdue_contract` | 1-4 | debt, contract, pressure | 9 | 12h | 6 | `market88.overdueDebtSeverity >= 2`, contract slots available | active raid, dangerBudget exhausted | `offerContract(settle_bad_debt)`, `lockTraderLane(discount,medium)` | The debt becomes a job with witnesses. | Convert overdue debt into settlement contract. |
| `market88.beat.debt_access_revoked` | 1-4 | debt, access, pressure | 6 | 24h | 3 | `market88.overdueDebtSeverity >= 3`, `market88.access.maintenance_guide` or password entry used | no alternate access exists and reliefBudget > dangerBudget | `lockTraderLane(entry_secondary,medium)`, `raiseHeat(+2)` | The hatch guide stops answering. | Severe debt damages one access route without softlock. |
| `market88.beat.liquidator_sweep_warning` | 1-4 | raid, warning, liquidator | 8 | 12h | 4 | `market88.heat >= 45`, `faction.liquidatorPressure >= 2` | active raid | `emitRumor(sanitary_warning)`, `lockTraderLane(weapons,short)` | Weapon crates disappear before boots arrive. | Telegraph raid and remove exploit stock. |
| `market88.beat.liquidator_sweep` | 2-4 | raid, danger, liquidator | 7 | 36h | 4 | `market88.heat >= 70`, raid cooldown elapsed, dangerBudget >= 2 | active samosbor, active raid, reliefBudget forced | `startRaid(liquidator_sweep)`, `lockTraderLane(weapons,long)`, `raiseHeat(-15)` | The market survives by shutting its teeth. | Timed liquidator raid without patrol simulation. |
| `market88.beat.ministry_audit` | 2-4 | raid, documents, ministry | 5 | 48h | 3 | `faction.ministrySuspicion >= 3`, document lane used or forged-doc event | active raid | `startRaid(ministry_audit)`, `lockTraderLane(documents,long)` | Stamps stop working for exactly the wrong people. | Document consequence and audit lock. |
| `market88.beat.cult_collection` | 2-4 | raid, cult, psi | 4 | 48h | 2 | `samosbor.variant.meat`, `market88.heat >= 50`, cult/psi lane opened | active raid, act < 2 | `startRaid(cult_collection)`, `setDemandLane(psi_cult,volatile)` | A buyer arrives with no face and exact change. | Meat resonance creates one cult pressure beat. |
| `market88.beat.deliver_night_stock` | 1-3 | contract, scarcity, relief | 10 | 10h | 8 | `market88.open`, survival or medicine lane low, contract slots available | active raid | `offerContract(deliver_night_stock)` | Stock can be saved if the player carries it. | Offer short delivery contract during scarcity. |
| `market88.beat.hide_courier` | 1-3 | contract, access, pressure | 7 | 16h | 5 | `market88.trust >= 1`, `market88.heat >= 25`, contract slots available | active samosbor | `offerContract(hide_courier)`, `raiseHeat(+1)` | A courier needs a room more than a hero. | Offer courier hide/escort beat. |
| `market88.beat.steal_stamp` | 2-4 | contract, documents, ministry | 6 | 24h | 4 | act >= 2, document scarcity or ministry suspicion, contract slots available | active raid | `offerContract(steal_stamp)`, `setDemandLane(documents,+)` | A clean stamp is worth more dirty work. | Offer document theft contract. |
| `market88.beat.break_sanitary_raid` | 2-4 | contract, raid, relief | 5 | 36h | 3 | raid warning active or heat >= 60, contract slots available, reliefBudget >= 1 | raid already active | `offerContract(break_sanitary_raid)` | The raid can be bent before it starts. | Give player agency against raid pressure. |
| `market88.beat.after_raid_relief_trade` | 1-4 | relief, trade | 7 | 24h | 5 | recent market raid, reliefBudget >= 2 | active raid | `grantRelief`, `setDemandLane(common,-)` | Someone sells at a human price because fear needs witnesses. | Post-raid relief and cooldown extension. |

## Scarcity Beats

Scarcity beats only alter lane pressure. They do not create or remove global resources. Price formula consumers may read the demand lane until expiry, then fall back to AG10 economy or static lane defaults.

| Lane | Beat sources | Expiry target | Market consequence | Player-facing consequence |
| --- | --- | ---: | --- | --- |
| `survival` | classic/quiet aftermath, hospital debt, food shortage | 12-24h | survival markup, limited stock, delivery contract offer | water/bandages cost more, delivery becomes worthwhile |
| `survival_dry` | wet aftermath, maintenance flood, filter shortage | 18-36h | dry food/filter demand | wet corridors make dry goods valuable |
| `energy` | electric aftermath, factory outage, metro route error | 18-36h | energy cell premium, weapon lane partly priced in cells | cells become barter currency |
| `documents` | ministry audit, archive route, forged pass failure | 24-48h | document trader lock or premium | papers become access, not generic loot |
| `psi_cult` | meat resonance, cult pressure, HELL hook | 24-48h | dangerous high-risk trades | rare PSI/cult goods appear with heat |

## Debt Beats

Debt beats must respect the lifecycle `created -> warned -> overdue -> resolved`. The director may select a debt beat when market signals say a lifecycle transition is legal. The market adapter chooses the concrete debt id and owner.

| Lifecycle point | Legal director beat | Required condition | Effect | Cooldown rule |
| --- | --- | --- | --- | --- |
| Created and due soon | `market88.beat.debt_first_warning` | due within next market warning window | warning line, heat +1 | one warning per debt owner per 8h |
| Due and unpaid | `market88.beat.debt_overdue_contract` | severity 2+ or repeated warning | settlement contract or trader lock | one settlement offer per 12h |
| Severe overdue | `market88.beat.debt_access_revoked` | severity 3+ and alternate route exists | one access/trader route lock | one access hit per 24h |
| Raid-linked debt | `market88.beat.liquidator_sweep_warning` or `liquidator_sweep` | severity 4+ or protection debt failed | raid warning or raid | raid cooldown always applies |
| Relief after payment | `market88.beat.after_raid_relief_trade` or market local beat | debt resolved and relief budget available | heat decrease or temporary fair trade | not more than once per 24h |

## Raid Beats

Raids are single bounded incidents. They may request one encounter hook if the combat/AI owner provides it, but the default implementation is state lock plus trace/log.

| Raid id | Director beat | Trigger | Market effect | Anti-exploit rule |
| --- | --- | --- | --- | --- |
| `market88.raid.liquidator_sweep` | `market88.beat.liquidator_sweep` | heat threshold, liquidator pressure, overdue protection debt | weapon lane locked, guard pressure, raid cooldown reset | raid stock is destroyed/hidden, not dropped |
| `market88.raid.ministry_audit` | `market88.beat.ministry_audit` | forged document failure, high ministry suspicion | document lane locked, suspicion trace | documents become inaccessible, not farmable |
| `market88.raid.cult_collection` | `market88.beat.cult_collection` | meat resonance and PSI/cult lane opened | cult demand spike, one dangerous buyer/encounter hook | rare goods cost risk; no free cult loot |

## Contract Beats

Market contracts are director-offered only when the existing quest/contract cap allows it. The market adapter is responsible for converting the row to an existing Quest/Contract shape with `market88` and `illegal` tags.

| Contract id | Director beat | Objective | Completion effect | Failure effect |
| --- | --- | --- | --- | --- |
| `market88.contract.deliver_night_stock` | `market88.beat.deliver_night_stock` | deliver survival/medicine goods to a market container | trust +1, stock lane relief, small rubles | goods lost, heat +1 |
| `market88.contract.hide_courier` | `market88.beat.hide_courier` | hide or escort one courier through a bounded route | trust +1, information access | local witness event, heat +2 |
| `market88.contract.steal_stamp` | `market88.beat.steal_stamp` | steal/recover one document stamp | document access, rubles | ministry suspicion +1 or audit beat unlocked |
| `market88.contract.break_sanitary_raid` | `market88.beat.break_sanitary_raid` | bribe/sabotage a raid trigger before it starts | raid cooldown extended, heat -10 | immediate raid beat becomes legal |
| `market88.contract.settle_bad_debt` | `market88.beat.debt_overdue_contract` | settle a player or NPC debt through item/payment/intimidation | debt resolved, trust restored partly | debt severity +1, lane lock |

## Chain Slots

Chain slots are named join points for `src/data/director_chains.ts`. They do not import the partner expansion. A chain step is legal only when every required signal provider exists.

| Chain slot id | Market role | Requires | Emits/effect | Intended partner |
| --- | --- | --- | --- | --- |
| `chain.market88.scarcity_sink` | Turns external shortage into trade pressure. | external `scarcity.*` tag and market open | demand lane modifier and delivery contract | mushrooms, hospital, factory, heatline |
| `chain.market88.debt_settlement` | Converts external debt/medical need into market obligation. | debt or treatment signal, contract cap | settlement contract or ruble note | hospital, factory, school |
| `chain.market88.document_broker` | Turns document pressure into access/fraud gameplay. | ministry/archive suspicion or missing pass | stamp theft contract or document lane lock | raionsovet/archive, 404, metro |
| `chain.market88.route_broker` | Sells or corrupts transport access. | route/token signal and trust >= 1 | route rumor, metro wagon entry, possible wrong-route beat | metro/lift loop |
| `chain.market88.raid_pressure` | Converts heat/faction pressure into crackdown. | heat threshold and faction pressure | raid warning, raid or break-raid contract | liquidators, ministry, cult |
| `chain.market88.after_samosbor_market` | Converts samosbor aftermath into concrete economy change. | last samosbor variant and market open | lane demand, heat, visible stock staging | director/samosbor |

## Trace Entries

Every selected or rejected market beat must write a director trace row. Market adapters should add market-specific details into `debugSummary` or an expansion detail field if the final trace type supports it.

| Field | Required value |
| --- | --- |
| `chosenBeatId` | Stable beat id or `none`. |
| `rejectedTopBeatId` | Highest scored market beat that failed, when applicable. |
| `reasonCode` | `selected`, `cooldown`, `act_gate`, `missing_signal_provider`, `budget_blocked`, `market_closed`, `contract_cap`, `raid_active`, `effect_failed`, `no_legal_beat`. |
| `dangerBudget` | Snapshot value before effect. |
| `reliefBudget` | Snapshot value before effect. |
| `samosborVariant` | Last variant when the beat uses aftermath. |
| `marketHeat` | Heat signal at selection time when available. |
| `marketTrust` | Trust signal at selection time when available. |
| `marketDebtSeverity` | Highest overdue severity when available. |
| `effectResult` | Adapter result: success, fallback, rejected, failed. |

## Debug Validation

Debug is mandatory for implementation. If the existing debug menu cannot fit the exact command names, equivalent log-printing helpers are acceptable.

| Debug command | Required proof |
| --- | --- |
| `Director: list market88 beats` | Shows all registered market beats, act range, cooldown, run count and legal/blocked state. |
| `Director: explain market88` | Prints current market signals, top scored beat, rejection reason and budgets. |
| `Director: force market88.beat.samosbor_panic_buying` | Applies survival demand or reports missing market adapter without cooldown consumption. |
| `Director: force market88.beat.debt_overdue_contract` | Offers settlement contract only when contract cap allows; otherwise reports `contract_cap`. |
| `Director: force market88.beat.liquidator_sweep` | Applies raid state, trader lock and trace without spawning a loot farm. |
| `Director: force market88.beat.after_raid_relief_trade` | Proves relief budget can reduce pressure after a raid. |
| `Market88: status` | Shows heat, trust, active debts, overdue severity, demand lanes, raid cooldown and access flags. |
| `Market88: prices` | Shows base value, scarcity, heat, trust and final price for representative goods. |
| `Market88: mature debts` | Creates a legal overdue signal for director validation. |
| `Market88: samosbor demand` | Cycles at least classic/quiet, wet and electric demand effects. |

## Failure Behavior

No legal market beat is valid behavior. The director records `no_legal_beat` and does nothing.

If market state is missing, beats requiring it are rejected as `missing_signal_provider`. Password rumor beats may still be legal if rumor/event fallback exists.

If a market effect fails after selection, trace records `effect_failed`. Cooldown is not consumed unless the adapter reports that a visible partial effect already happened.

If danger budget is exhausted, only relief beats and trace-only diagnostics are legal. If relief budget is forced, raid and severe debt escalation beats are blocked.

## Performance Contract

Stable frame cost target is 0 us. Director evaluates market beats only on rare director tick or explicit event-bound ticks. Market signal collection uses scalar flags, bounded arrays and caller-provided output buffers. No hook may require full-world scan, full inventory scan, live buyer simulation, pathfinding patrol creation or DOM work.

Low tier uses password whisper, static demand lanes, one pocket and debt flags. Middle tier uses event-updated scarcity, overdue debt and one raid cooldown. High tier consumes faction, samosbor and production signals. Ultra tier adds richer market staging and lines, but no extra hot-path logic.

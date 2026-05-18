# Expansion 07: Hospital Quarantine Director Hooks

Status: implementation-ready director contract  
Owner: `DIRPASS_EXP07`  
Scope: local integration contract between `07_hospital_quarantine` and `00_samosbor_director`  
Runtime rule: this document authorizes no source edits by itself

## Boundary

Hospital Quarantine exposes medical, quarantine, morgue and treatment-debt facts to the Samosbor Director. The director may select a hospital beat, advance a cross-expansion chain slot, request one bounded local effect and write trace. It must not own medical condition state, treatment math, quarantine access checks, morgue records, NPC AI, item transfer, HP math, save normalization or samosbor variant logic.

The accepted flow is: the hospital runtime keeps compact aggregates; a `hospital_quarantine` signal provider emits scalar facts into the director snapshot; the director chooses one legal beat; the effect is routed to hospital, document, market or event adapters; the owning system applies or rejects it; the director records the reason. If the hospital adapter is missing, hospital beats are rejected with `missing_signal_provider` or `effect_adapter_missing` and consume no cooldown.

Steady-state target is `0 us/frame`. Hospital hooks are evaluated only on director rare ticks, explicit medical events, samosbor aftermath ticks or debug force. No hook may scan all rooms, all NPCs, all corpses, all inventory stacks or all records during selection.

## Applied Mandates

| Mandate | Hospital director rule |
| --- | --- |
| Domain boundary | This pass defines only expansion-local docs and agent logs. Future code must keep medical ownership inside Expansion 07 adapters. |
| Simultaneous execution | Director integration uses ids, signals, events and chain slots. No direct dependency on unfinished market, heatline, school, metro, industry or archive code. |
| Cinematic cheat protocol | Quarantine is flags, room state, documents, queues and trace, not cell-by-cell contagion or physiology simulation. |
| Frame time dictatorship | Signals are cached scalars or bounded counters; no director hook may add frame work. |
| Predictability over realism | Beats are finite rows with act gates, cooldowns, max runs, explicit effects and visible traces. |
| Math LOD scalability | Low through Ultra scale presentation and consequence breadth, not live disease simulation. |
| Black box | Every accepted/rejected hospital beat must be explainable through director trace plus medical telemetry when hospital runtime exists. |
| Debug evidence | Each beat has a force path and a pass condition. Missing adapters are visible failures, not silent behavior. |

## Signal Provider

Hospital implements one optional `DirectorSignalProvider` with id `hospital_quarantine`. It appends compact facts into caller-owned output. The provider is read-only and must be backed by cached medical status, recent medical events, room flags and capped record counters.

```ts
export interface HospitalDirectorSignals {
  expansionId: '07_hospital_quarantine';
  pocketDiscovered: boolean;
  playerInHospitalPocket: boolean;
  nearestHospitalRoomId?: number;
  activePlayerConditionCount: number;
  highestPlayerSeverity: 0 | 1 | 2 | 3;
  hasBleeding: boolean;
  hasBurn: boolean;
  hasMoldInfection: boolean;
  hasPsiExhaustion: boolean;
  hasSedated: boolean;
  hasQuarantineMark: boolean;
  quarantineSeverity: 0 | 1 | 2 | 3;
  quarantineRoomContaminated: boolean;
  receptionQueuePressure: 0 | 1 | 2 | 3;
  dressingSterility: 0 | 1 | 2 | 3;
  burnShowerAvailable: boolean;
  psychServiceAvailable: boolean;
  pharmacyScarcity: 0 | 1 | 2 | 3;
  unpaidTreatmentDebtSeverity: 0 | 1 | 2 | 3;
  recentTreatmentCompleted: boolean;
  recentTreatmentRefused: boolean;
  recentSanitarCheckFailed: boolean;
  morgueContradictionAvailable: boolean;
  morgueRecordCorrupted: boolean;
  recentMorgueInspection: boolean;
  lastHospitalVariantHook?: 'classic' | 'quiet' | 'wet' | 'electric' | 'meat';
  hospitalCooldownHours: number;
}
```

Low tier can emit only `pocketDiscovered`, player condition flags, quarantine severity, queue pressure, one morgue contradiction flag and local cooldown. Middle and above can add room/service/debt fields. Unknown or absent medical state emits no provider or emits `ok: true` with zeroed safe values; it must not fabricate conditions.

## Signal Vocabulary

The director evaluates hospital beats against named signals. These ids are stable data contracts; final implementation may map them to compact signal structs.

| Signal id | Type | Source owner | Meaning | Required cap |
| --- | --- | --- | --- | --- |
| `hospital.open` | flag | hospital | Hospital pocket discovered or activated. | one boolean |
| `hospital.player_in_pocket` | flag | hospital | Player is in or adjacent to hospital rooms. | one boolean |
| `medical.condition.bleeding` | flag | medical | Player has active `bleeding`. | one boolean |
| `medical.condition.burn` | flag | medical | Player has active `burn`. | one boolean |
| `medical.condition.mold_infection` | flag | medical | Player has active mold condition. | one boolean |
| `medical.condition.psi_exhaustion` | flag | medical | Player has active PSI exhaustion. | one boolean |
| `medical.condition.sedated` | flag | medical | Player is sedated. | one boolean |
| `medical.condition.severity_max` | integer 0-3 | medical | Highest active player condition severity. | one scalar |
| `medical.quarantine.marked` | flag | medical/quarantine | Player has quarantine mark. | one boolean |
| `medical.quarantine.severity` | integer 0-3 | medical/quarantine | Current quarantine severity. | one scalar |
| `hospital.room.contaminated` | flag | hospital | Infection corridor or reception has contamination flag. | one boolean |
| `hospital.queue.pressure` | integer 0-3 | hospital | Reception is overloaded. | one scalar |
| `hospital.dressing.sterility` | integer 0-3 | hospital | Dressing service quality; 0 means unsafe. | one scalar |
| `hospital.burn_shower.available` | flag | hospital | Burn shower can legally run. | one boolean |
| `hospital.psych.available` | flag | hospital | Psych office can legally run. | one boolean |
| `hospital.pharmacy.scarcity` | integer 0-3 | hospital/economy adapter | Medical supplies are locally scarce. | one scalar |
| `hospital.treatment.completed_recently` | flag | event bus/medical | Treatment completed inside recent window. | recent event flag |
| `hospital.treatment.refused_recently` | flag | event bus/medical | Player refused/failed treatment recently. | recent event flag |
| `hospital.debt.unpaid_severity` | integer 0-3 | medical/economy adapter | Treatment generated unpaid obligation. | one scalar |
| `hospital.sanitar.failed_recently` | flag | event bus/quarantine | Sanitar check failed recently. | recent event flag |
| `hospital.morgue.contradiction_available` | flag | morgue | One unresolved contradiction exists. | one boolean |
| `hospital.morgue.record_corrupted` | flag | morgue | Last meat/electric hook corrupted a record. | one boolean |
| `samosbor.variant.classic` | tag | director/samosbor | Last aftermath variant was classic. | last variant only |
| `samosbor.variant.quiet` | tag | director/samosbor | Last aftermath variant was quiet. | last variant only |
| `samosbor.variant.wet` | tag | director/samosbor | Last aftermath variant was wet. | last variant only |
| `samosbor.variant.electric` | tag | director/samosbor | Last aftermath variant was electric. | last variant only |
| `samosbor.variant.meat` | tag | director/samosbor | Last aftermath variant was meat resonance. | last variant only |
| `heatline.recent_scald` | optional flag | heatline | Heatline burn chain seed exists. | optional provider |
| `mushroom.mold_pressure` | optional integer 0-3 | mushroom | External mold pressure can justify quarantine. | optional provider |
| `market88.medical_debt_sink` | optional flag | market | Market can consume treatment debt. | optional provider |
| `raionsovet.document_pressure` | optional integer 0-3 | archive/documents | Paperwork pressure is active. | optional provider |

Optional partner signals are never hard requirements for hospital-local beats. They only unlock chain steps. If missing, the chain candidate is rejected as `missing_signal_provider`.

## Condition Vocabulary

| Condition id | Meaning | Rejection reason |
| --- | --- | --- |
| `hospital_open` | `hospital.open` is true or debug force supplies a valid pocket. | `missing_signal_provider` |
| `in_or_near_hospital` | Player is inside hospital pocket or adjacent service corridor. | `wrong_floor_or_zone` |
| `has_treatable_condition` | At least one of bleeding, burn, mold infection or PSI exhaustion is active. | `medical_condition_missing` |
| `has_burn_or_scald` | `medical.condition.burn` or optional `heatline.recent_scald` is present. | `no_burn_signal` |
| `has_mold_or_wet_risk` | Mold infection, contaminated room or wet variant aftermath is present. | `no_infection_signal` |
| `has_psi_pressure` | `psi_exhaustion` is active or psych office signal exists. | `no_psi_signal` |
| `is_sedated` | `medical.condition.sedated` is present. | `sedation_absent` |
| `quarantine_marked` | Player has `quarantine_mark` or quarantine severity above 0. | `quarantine_absent` |
| `quarantine_clearable` | A clearance service, fake document or wait route exists. | `quarantine_not_clearable` |
| `player_in_hospital_pocket` | `hospital.player_in_pocket` is true. | `wrong_floor_or_zone` |
| `queue_pressure_at_least_2` | Reception queue pressure is 2 or 3. | `queue_pressure_low` |
| `dressing_unsafe` | Dressing sterility is 0 or 1. | `dressing_safe` |
| `burn_shower_available` | Burn shower service can legally run. | `burn_shower_unavailable` |
| `psych_service_available` | Psych office service can legally run. | `psych_service_unavailable` |
| `morgue_contradiction_ready` | Morgue has unresolved contradiction available. | `morgue_no_contradiction` |
| `morgue_corrupted` | Morgue record was corrupted by variant hook. | `morgue_not_corrupted` |
| `treatment_recent` | A hospital treatment completed in the recent window. | `no_recent_treatment` |
| `treatment_cost_unpaid` | Recent treatment has unpaid cost, scarce supply surcharge or donor obligation. | `no_unpaid_treatment_cost` |
| `treatment_debt_unpaid` | Unpaid treatment debt severity is at least 1. | `no_treatment_debt` |
| `sanitar_failed_recent` | Recent sanitar check failed. | `no_failed_sanitar_check` |
| `samosbor_context` | Samosbor is active or a recent aftermath window is still valid. | `recent_event_missing` |
| `wet_aftermath` | Last samosbor variant is wet. | `wrong_samosbor_variant` |
| `meat_aftermath` | Last samosbor variant is meat resonance. | `wrong_samosbor_variant` |
| `electric_aftermath` | Last samosbor variant is electric. | `wrong_samosbor_variant` |
| `silent_aftermath` | Last samosbor variant is quiet. | `wrong_samosbor_variant` |
| `danger_budget_available` | Director `dangerBudget >= 1`. | `danger_budget_exhausted` |
| `relief_budget_available` | Director `reliefBudget >= 1`. | `relief_budget_unavailable` |
| `not_recent_hospital` | No hospital beat in recent beat list and local cooldown is expired. | `cooldown_active` |

These condition ids map to director `DirectorConditionDef` rows. Hospital-specific rejection reasons may be encoded in `debugSummary` if the initial director reason enum is still generic.

## Effect Vocabulary

Director effects are requests. The owning adapter validates current state again before mutation.

| Effect id | Owner adapter | Allowed mutation | Explicitly forbidden mutation |
| --- | --- | --- | --- |
| `hospital.effect.traceOnly` | director/world log | Write one visible trace or debug trace. | Consume cooldown when no gameplay effect happened unless configured as trace beat. |
| `hospital.effect.requestTriage` | hospital/medical | Mark one service as prompted, queue one doctor/sanitar line, optional medcard trace. | Heal directly from director. |
| `hospital.effect.requestTreatmentWindow` | hospital/medical | Offer one legal treatment service with expiry and risk tags. | Bypass required items/documents/time cost. |
| `hospital.effect.applyQuarantineHint` | hospital/quarantine | Set one local quarantine prompt, room warning or sanitar branch. | Lock global trade, metro, school or whole floor. |
| `hospital.effect.contaminateRoom` | hospital | Mark one hospital room contaminated with expiry. | Spread infection cell by cell or to every NPC. |
| `hospital.effect.setServiceRisk` | hospital | Temporarily set sterility/queue/pharmacy risk with source beat id. | Permanently disable all medical services. |
| `hospital.effect.writeMedicalRecord` | medical/records | Write one medcard, prescription, quarantine notice or morgue tag through record API. | Write arbitrary save fields or duplicate item records. |
| `hospital.effect.offerClearanceRoute` | hospital/documents | Offer one clearance, fake certificate check or timed isolation route. | Clear quarantine without cost/check. |
| `hospital.effect.createTreatmentDebt` | hospital/economy adapter | Create or raise one bounded treatment debt record. | Directly mutate market debt internals. |
| `hospital.effect.requestMarketDebtSink` | market adapter | Ask market to convert medical debt into one contract or pressure. | Require market implementation to exist. |
| `hospital.effect.scrambleMorgueRecord` | morgue | Corrupt or swap one morgue record and write trace. | Spawn a wave, create free loot, corrupt all records. |
| `hospital.effect.revealMorgueContradiction` | morgue/records | Reveal one contradiction and optional document clue. | Rewrite NPC identity globally. |
| `hospital.effect.emitRumor` | rumor/event fallback | Add one hospital rumor/access warning. | Create a second truth source for condition state. |
| `chain.effect.seed` | director chain state | Start or advance one named chain slot. | Serialize partner system internals. |

Effect adapters return success, rejection reason and optional effect detail. If any required effect fails, the director records `effect_failed`; cooldown is consumed only when a visible or stateful partial effect succeeded and the beat contract allows it.

## Beat Rows

Beat ids are stable data ids. Weights are relative and should be tuned by the director owner after the global registry exists.

| Beat id | Act | Tags | Weight | Cooldown | Max runs | Requires | Blocks | Effects | Visible trace | Debug summary |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| `hospital.beat.triage_queue_overload` | 1-3 | hospital, queue, danger, samosbor | 8 | 8h | 5 | `hospital_open`, `queue_pressure_at_least_2`, `danger_budget_available` | active high-priority danger chain, no hospital adapter | `traceOnly`, `setServiceRisk(queue+)`, optional `emitRumor` | Приемный покой забит: лечат тех, у кого бумага чище крови. | Turns queue pressure into a service risk, not a safe hub. |
| `hospital.beat.quick_triage_offer` | 1-3 | hospital, relief, treatment | 9 | 6h | 6 | `hospital_open`, `has_treatable_condition`, `relief_budget_available` | quarantine severity 3 without clearance route, no treatment service | `requestTriage`, `requestTreatmentWindow`, `writeMedicalRecord` | Фельдшер предлагает процедуру: быстрее бинта, медленнее побега. | Offers legal treatment window with record consequence. |
| `hospital.beat.burn_shower_paper_seed` | 1-3 | hospital, burn, heatline, chain_seed | 8 | 12h | 3 | `has_burn_or_scald`, `hospital_open`, `burn_shower_available` | water shortage with no alternative, recent same beat | `requestTreatmentWindow(burn_shower)`, `writeMedicalRecord(burn_card)`, `chain.seed(steam_burn_paper_chain:hospital_triage)` | Ожог стал талоном: душ снимет боль, карта оставит след. | Connects heatline scald or burn to hospital paperwork. |
| `hospital.beat.mold_quarantine_warning` | 1-3 | hospital, quarantine, mold, warning | 9 | 10h | 5 | `has_mold_or_wet_risk`, `hospital_open` | quarantine already severity 3 and no clear route | `applyQuarantineHint`, `writeMedicalRecord(quarantine_notice)`, optional `contaminateRoom` | Санитар не ищет врага. Он ищет носителя. | Teaches quarantine as access state, not contagion sim. |
| `hospital.beat.quarantine_gate_escalation` | 1-4 | hospital, quarantine, danger, sanitar | 7 | 16h | 4 | `quarantine_marked`, `sanitar_failed_recent`, `danger_budget_available` | no alternate route, active samosbor trap, severe recent danger spam | `applyQuarantineHint`, `setServiceRisk(queue+)`, `chain.seed(quarantine_paper_chain:sanitar_fail)` | Метка закрывает не дверь, а право объяснять. | Escalates failed sanitar check without global floor lock. |
| `hospital.beat.clearance_route_offer` | 1-4 | hospital, quarantine, relief, documents | 8 | 12h | 5 | `quarantine_marked`, `quarantine_clearable`, `relief_budget_available` | no document/clearance adapter, combat crisis active | `offerClearanceRoute`, `writeMedicalRecord(absence_of_infection)`, optional `emitRumor` | Справка об отсутствии заражения стоит времени, воды или лжи. | Gives agency against quarantine mark. |
| `hospital.beat.psych_referral_pressure` | 1-4 | hospital, psi, documents, risk | 6 | 18h | 4 | `has_psi_pressure`, `hospital_open`, `psych_service_available` | act < 1, no psych service | `requestTreatmentWindow(psych_eval)`, `writeMedicalRecord(psychiatric_referral)` | Психиатрия лечит дрожь и заводит папку. | Trades PSI relief for bureaucratic trace. |
| `hospital.beat.sedation_bad_timing` | 1-3 | hospital, sedation, danger, samosbor | 5 | 18h | 3 | `is_sedated`, `samosbor_context`, `danger_budget_available` | no safe retreat, recent sedation warning | `traceOnly`, `applyQuarantineHint(slow_response)`, optional `setServiceRisk(queue+)` | Таблетка работает. Сирена тоже. | Makes sedation risky without changing core timers. |
| `hospital.beat.treatment_debt_created` | 1-4 | hospital, debt, economy | 8 | 12h | 6 | `treatment_recent`, `treatment_cost_unpaid` | no economy/debt adapter and trace-only disallowed | `createTreatmentDebt`, `writeMedicalRecord(donor_receipt|debt_note)`, `chain.seed(treatment_debt_industry_chain:hospital_debt)` | Лечение закончилось. Счет только начался. | Creates bounded debt from treatment consequence. |
| `hospital.beat.treatment_debt_market_sink` | 2-4 | hospital, market, debt, chain | 7 | 24h | 4 | `treatment_debt_unpaid`, optional `market88.medical_debt_sink`, `relief_budget_available` | market adapter missing, debt severity 0 | `requestMarketDebtSink`, `chain.seed(treatment_debt_industry_chain:market_sink)` | Черный рынок покупает не лекарства, а должников. | Converts medical debt into optional market contract. |
| `hospital.beat.morgue_wrong_card_reveal` | 1-4 | hospital, morgue, documents, mystery | 7 | 20h | 4 | `morgue_contradiction_ready`, `hospital_open` | recent morgue reveal, no record adapter | `revealMorgueContradiction`, `writeMedicalRecord(morgue_tag)`, optional `chain.seed(quarantine_paper_chain:morgue_card)` | В морге нашли живого человека. На бумаге. | Reveals one record contradiction with mechanical document clue. |
| `hospital.beat.morgue_meat_record_swap` | 2-4 | hospital, morgue, samosbor, meat | 6 | 24h | 3 | `meat_aftermath`, `hospital_open`, `morgue_contradiction_ready` or `morgue_corrupted` | no morgue adapter, recent meat swap | `scrambleMorgueRecord`, `writeMedicalRecord(death_record)`, `chain.seed(after_samosbor_hospital_chain:morgue_swap)` | После мясного резонанса тела не ожили. Ожили карточки. | Meat hook corrupts one record, not a zombie wave. |
| `hospital.beat.wet_infection_room` | 1-4 | hospital, wet, mold, quarantine | 8 | 16h | 4 | `wet_aftermath`, `hospital_open`, `danger_budget_available` | contamination already active, no clear route and no relief budget | `contaminateRoom(infection_corridor)`, `applyQuarantineHint`, `chain.seed(after_samosbor_hospital_chain:wet_infection)` | Мокрый самосбор оставил в перевязочной запах плесени. | Wet variant raises local infection risk only. |
| `hospital.beat.electric_false_record` | 2-4 | hospital, electric, records, warning | 5 | 24h | 2 | `electric_aftermath`, `hospital_open`, `morgue_contradiction_ready` or `psych_service_available` | no record adapter | `writeMedicalRecord(false_monitor_trace)`, optional `scrambleMorgueRecord`, `traceOnly` | Аппарат показал смерть на минуту раньше тела. | Electric aftermath creates false record, not global machine sim. |
| `hospital.beat.silent_admission_trap` | 1-3 | hospital, quiet, queue, danger | 6 | 18h | 3 | `silent_aftermath`, `player_in_hospital_pocket`, `danger_budget_available` | no safe route signal, active severe condition 3 without relief | `setServiceRisk(queue+)`, `applyQuarantineHint(late_lockdown)`, `traceOnly` | Больница продолжала прием, когда двери уже должны были закрыться. | Quiet variant delays warning locally. |

## Condition Beats

Condition beats are legal only when their condition exists or a partner beat seeded it. They never apply a medical condition directly unless the medical adapter confirms a legal source.

| Condition | Director beat | Required state | Primary effect | Anti-bloat rule |
| --- | --- | --- | --- | --- |
| `bleeding` | `hospital.beat.quick_triage_offer` | Active bleeding severity 1-3 and hospital open. | Offer dressing service and write treatment slip. | No director HP math. |
| `burn` | `hospital.beat.burn_shower_paper_seed` | Burn/scald signal and burn shower available. | Offer burn shower, write burn card, seed paper chain. | No heatline dependency required; heatline signal is optional. |
| `mold_infection` | `hospital.beat.mold_quarantine_warning` or `hospital.beat.wet_infection_room` | Mold condition, wet aftermath or contaminated room. | Quarantine hint/notice and local room contamination. | No contagion spread beyond flagged room/service. |
| `psi_exhaustion` | `hospital.beat.psych_referral_pressure` | PSI condition or psych-service pressure. | Psych eval window and psychiatric referral. | No hidden sanity simulation. |
| `sedated` | `hospital.beat.sedation_bad_timing` | Sedated flag during samosbor context. | Visible warning and service risk. | Does not alter global samosbor timing. |
| `quarantine_mark` | `hospital.beat.quarantine_gate_escalation` or `hospital.beat.clearance_route_offer` | Active quarantine mark. | Gate pressure or clearance route. | Never blocks whole game; at least one clear/fake/wait route must exist. |

## Quarantine Beats

Quarantine is an access state and campaign pressure, not a disease simulator.

| Quarantine state | Legal beat | Effect | Player decision |
| --- | --- | --- | --- |
| Suspected exposure | `hospital.beat.mold_quarantine_warning` | Write quarantine notice or warning line. | Accept isolation, flee, fake clean paper later. |
| Marked and stopped | `hospital.beat.quarantine_gate_escalation` | Sanitar branch, queue pressure, one gate denial. | Show papers, reroute, bribe through another expansion, or clear mark. |
| Marked but clearable | `hospital.beat.clearance_route_offer` | Timed isolation, clearance certificate or fake certificate hook. | Spend time/resource/document risk to regain access. |
| Wet aftermath contamination | `hospital.beat.wet_infection_room` | Contaminate one room/service with expiry. | Use hospital anyway or delay treatment. |
| Silent admissions | `hospital.beat.silent_admission_trap` | Queue continues too long, late lockdown warning. | Finish treatment or retreat before doors trap route. |

Quarantine effects must be local to hospital or routed through partner adapters. If metro, school, market or archive integrations are absent, the beat records missing consumer and still keeps the local hospital consequence valid.

## Morgue Beats

The morgue is a document-and-body contradiction layer. It is not a loot cave and not a combat spawner.

| Morgue record | Beat | Interaction | Reward/consequence | Limit |
| --- | --- | --- | --- | --- |
| `drawer_wrong_queue_patient` | `hospital.beat.morgue_wrong_card_reveal` | Compare drawer tag to queue/medcard record. | Morgue tag, rumor, archive/raionsovet chain slot. | One active contradiction per pocket. |
| `drawer_empty_body_present` | `hospital.beat.morgue_wrong_card_reveal` | Ledger claims occupied drawer; drawer state disagrees. | Sanitar suspicion or route clue. | No free medicine by default. |
| `ledger_meat_resonance_swap` | `hospital.beat.morgue_meat_record_swap` | Meat aftermath swaps two local records. | Death record confusion, chain trace. | One swap per aftermath cooldown. |
| `false_monitor_death` | `hospital.beat.electric_false_record` | Electric aftermath writes impossible monitor time. | Evidence record or psych/Ministry suspicion. | No global NPC rewrite. |

Morgue loot budget remains one document clue plus at most one minor medical item when a future implementation explicitly spends that reward. Director hooks never add generic stash loot.

## Medical Debt Beats

Treatment debt connects hospital to economy without making the director a market or contract system.

| Debt lifecycle | Legal director beat | Required condition | Effect | Cooldown rule |
| --- | --- | --- | --- | --- |
| Treatment completed with unpaid cost | `hospital.beat.treatment_debt_created` | Recent treatment and scarce supply/price gap. | Create one bounded medical debt and medcard/debt record. | One debt creation per treatment event. |
| Debt active and mild | `hospital.beat.treatment_debt_created` follow-up trace only | Severity 1, no market sink. | Reminder line or record trace. | No repeated pressure inside 12h. |
| Debt active and market available | `hospital.beat.treatment_debt_market_sink` | Severity 1-3 and market sink signal. | Request one settlement contract or pressure note. | One sink request per 24h. |
| Debt severe and documents pressured | future document consumer via `quarantine_paper_chain` | Severity 2-3 and raionsovet/archive signal. | Request paperwork debt consequence. | Partner-owned. |

Debt records are capped by hospital/market owners. Missing economy or market adapters produce `missing_signal_provider`; local hospital treatment still remains valid.

## Samosbor Variant Hooks

Hospital variant responses are local aftermath hooks. They never change global samosbor scheduling.

| Variant | Beat | Local response | Forbidden response |
| --- | --- | --- | --- |
| Classic | `hospital.beat.triage_queue_overload` | Reception queue pressure and one service risk. | Global NPC migration to hospital. |
| Quiet | `hospital.beat.silent_admission_trap` | Admissions continue too long; late lockdown trace. | Changing samosbor timer or door rules globally. |
| Wet | `hospital.beat.wet_infection_room` | Infection corridor/dressing contamination and quarantine notice. | Tile-by-tile mold spread. |
| Electric | `hospital.beat.electric_false_record` | False monitor/record trace or one impossible timestamp. | Global apparatus simulation. |
| Meat resonance | `hospital.beat.morgue_meat_record_swap` | Swap/corrupt one morgue record. | Zombie wave, unlimited corpse loot, global identity rewrite. |

MVP implementation should ship wet and meat hooks first. Classic queue overload is cheap fallback. Electric and quiet are documented as legal later rows.

## Cross-Expansion Chain Slots

Chain state belongs to the director. Hospital only emits stable slots and consumes optional partner signals.

| Chain id | Slot | Hospital beat source | Intended next consumers | TTL | Purpose |
| --- | --- | --- | --- | ---: | --- |
| `steam_burn_paper_chain` | `hospital_triage` | `hospital.beat.burn_shower_paper_seed` | raionsovet incident form, market medicine debt, heatline aftermath | 48h | A heatline injury becomes treatment, then paperwork or debt. |
| `quarantine_paper_chain` | `sanitar_fail` | `hospital.beat.quarantine_gate_escalation` | raionsovet/archive, market fake certificate, metro route denial | 36h | Quarantine mark becomes document pressure. |
| `quarantine_paper_chain` | `morgue_card` | `hospital.beat.morgue_wrong_card_reveal` | archive contradiction, 404 prep, ministry suspicion | 72h | Morgue paperwork contradicts living records. |
| `treatment_debt_industry_chain` | `hospital_debt` | `hospital.beat.treatment_debt_created` | market settlement, industry supply job, school medicine shortage | 48h | Treatment cost becomes supply/economy pressure. |
| `treatment_debt_industry_chain` | `market_sink` | `hospital.beat.treatment_debt_market_sink` | market debt contract, industry reagent supply | 48h | Medical debt leaves hospital through optional economy route. |
| `after_samosbor_hospital_chain` | `wet_infection` | `hospital.beat.wet_infection_room` | mushroom pressure, school absence, market dry-goods demand | 24h | Wet aftermath becomes a finite quarantine beat. |
| `after_samosbor_hospital_chain` | `morgue_swap` | `hospital.beat.morgue_meat_record_swap` | raionsovet archive contradiction, 404 prep | 72h | Meat resonance changes records, not corpses. |

If a consumer expansion is unavailable, the slot expires or is skipped with trace reason `chain_consumer_missing`. The hospital beat itself can still succeed if its local effects are legal.

## Cooldown And Budget Rules

Hospital beats share a local family cooldown keyed as `hospital_family`. It prevents repeated medical paperwork from drowning out the rest of the campaign.

| Rule | Value |
| --- | ---: |
| Minimum delay between accepted hospital beats | 1 director tick |
| Maximum hospital danger beats in recent 6 accepted beats | 2 |
| Maximum hospital relief beats in recent 6 accepted beats | 3 |
| Maximum quarantine escalations per 24h | 1 |
| Maximum morgue reveals per 20h | 1 |
| Maximum variant hooks per samosbor aftermath | 1 local hospital hook |
| Maximum active treatment debt offers | 3 capped by hospital/market adapter |

Danger beats consume `dangerBudget`: queue overload, quarantine escalation, wet infection room, meat record swap, sedation bad timing and silent admission trap. Relief beats consume `reliefBudget`: quick triage offer and clearance route offer. Burn shower can be relief or chain seed; it consumes relief only when it offers an actual treatment window.

After two hospital danger beats, the director should prefer a relief beat or `no_legal_beat` unless a samosbor aftermath hook has explicit priority. No hospital beat may create an unavoidable death/softlock state.

## Trace Entries

Every selected or rejected hospital candidate must write a director trace row. Hospital adapters should add medical details into `debugSummary` or an expansion detail field when the final trace type supports it.

| Field | Required hospital value |
| --- | --- |
| `chosenBeatId` | Stable hospital beat id or none. |
| `rejectedTopBeatId` | Highest scored hospital candidate that failed, when applicable. |
| `reasonCode` | `selected`, `cooldown_active`, `act_too_low`, `missing_signal_provider`, `medical_condition_missing`, `quarantine_absent`, `budget_blocked`, `effect_adapter_missing`, `effect_failed`, `chain_consumer_missing`, `no_legal_beat`. |
| `dangerBudget` / `reliefBudget` | Snapshot values before effect application. |
| `samosborVariant` | Last variant for wet/electric/meat/quiet/classic hooks. |
| `hospitalRoomId` | Nearest or targeted room id when available. |
| `conditionMask` | Bitmask or hash for bleeding/burn/mold/psi/sedated/quarantine. |
| `quarantineSeverity` | Severity at selection time. |
| `morgueRecordId` | Target record id or stable hash when morgue effect is used. |
| `medicalDebtSeverity` | Debt severity when debt beat is used. |
| `effectResult` | Adapter result: success, fallback, rejected, failed. |

Medical telemetry remains hospital-owned. If the hospital runtime detects NaN progress, impossible severity, unknown service hard failure or corrupted record normalization, it must dump medical telemetry as specified in `integration_contract.md` and expose enough trace to reconstruct the last 300 high-level medical frames.

## Debug Validation

Debug is mandatory for implementation. Exact UI labels can differ, but the following proof paths must exist.

| Debug command | Validation target | Pass condition |
| --- | --- | --- |
| `director providers hospital_quarantine` | signal provider | Shows emitted count, pocket flag, condition mask, quarantine severity, queue pressure and last reason. |
| `director force hospital.beat.quick_triage_offer` | treatment relief | Offers one legal treatment window or reports missing adapter; writes trace and record request. |
| `director force hospital.beat.burn_shower_paper_seed` | heatline/burn chain | With burn/scald signal, creates burn-shower offer and active `steam_burn_paper_chain:hospital_triage` slot. |
| `director force hospital.beat.mold_quarantine_warning` | quarantine warning | Writes quarantine notice or prompt; no cell-by-cell spread. |
| `director force hospital.beat.quarantine_gate_escalation` | sanitar gate | Blocks/redirects one service only; shows clear/fake/wait options if available. |
| `director force hospital.beat.clearance_route_offer` | quarantine relief | Creates one clearance route and med record; does not clear mark for free. |
| `director force hospital.beat.psych_referral_pressure` | psych document | Creates psych eval request and psychiatric referral trace. |
| `director force hospital.beat.treatment_debt_created` | medical debt | Creates one capped treatment debt or reports missing economy adapter. |
| `director force hospital.beat.treatment_debt_market_sink` | market chain | Requests market debt sink or rejects with `missing_signal_provider`; hospital state remains valid. |
| `director force hospital.beat.morgue_wrong_card_reveal` | morgue contradiction | Reveals one record contradiction and no generic loot. |
| `director force hospital.beat.morgue_meat_record_swap` | meat hook | Swaps/corrupts one morgue record and starts `after_samosbor_hospital_chain:morgue_swap`. |
| `director force hospital.beat.wet_infection_room` | wet hook | Contaminates one hospital room/service with expiry; no full-world spread. |
| `director trace 20` | black box | Recent hospital rows show chosen/rejected reason, budget, condition hash and effect result. |
| `medical status` | hospital owner state | Shows active player conditions, quarantine state, recent records, debt count and room contamination flags. |
| `hospital dump_records` | record audit | Lists medcards/morgue records, unknown ids and contradictions without mutating state. |

## Failure Behavior

No legal hospital beat is valid. The director records `no_legal_beat` and does nothing.

If hospital state is absent, beats requiring it reject as `missing_signal_provider`. Hospital access rumors or trace-only diagnostics may still be legal only if they do not claim medical state exists.

If an effect adapter fails after selection, trace records `effect_failed`. Cooldown is not consumed unless the adapter reports that a visible partial effect already happened.

If danger budget is exhausted, quarantine escalation, contaminated room, morgue swap and sedation danger beats are illegal. If relief budget is unavailable, quick triage and clearance route offers are illegal unless debug-forced.

If a chain consumer is missing, the local beat can succeed but the chain slot records `chain_consumer_missing` or expires. Missing market, heatline, mushroom, school, industry, metro, raionsovet or 404 integrations must never break hospital selection.

## LOD Behavior

| Tier | Director hooks | Effect fidelity | Cost rule |
| --- | --- | --- | --- |
| Low | 4-5 beats: quick triage, quarantine warning, clearance offer, one morgue reveal, wet hook. | Text trace, one room flag, one record request. | Signal collection from cached player and room flags only. |
| Middle | Full MVP beat set, family cooldown, burn/mold/psych/debt paths. | Treatment windows, sanitar branch, local contamination expiry, debt record. | Bounded adapter calls on rare tick/event only. |
| High | Cross-expansion consumers react to burn paperwork, quarantine papers, treatment debt and morgue contradictions. | Richer rumors, market/raionsovet hooks, event-log feedback. | No wider scan frequency; partner signals are optional aggregates. |
| Ultra | More unique trace lines, monitor lies, morgue ambience and service presentation. | Dense visuals/audio chosen by hospital/render owners. | Gameplay truth unchanged; no hot-loop director work. |

Ultra is not a full hospital simulation. It spends saved CPU on presentation and consequences from the same finite state.

## Implementation DOD

The hospital director integration is ready for code only when all of the following remain true: hospital beats register without importing director internals directly; the signal provider emits compact aggregate facts without allocation-heavy scans; every beat has act gates, cooldowns, max runs and typed rejection; every effect has a local owner and fallback behavior; quarantine always has at least one clear/fake/wait path; morgue hooks reveal records rather than spawning loot/combat; treatment debt is capped and adapter-owned; wet and meat samosbor hooks are local; chain slots expire cleanly; debug can explain accepted and rejected hospital candidates; idle runtime cost remains `0 us/frame`.

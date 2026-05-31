# Director Hooks: Expansion 08 Concentrate Industry

Status: director-hook contract for future implementation
Owner: `DIRPASS_EXP08`
Scope: `gatbage/reference/expansions/08_concentrate_industry` only
Runtime rule: this document authorizes no source edits by itself

## Purpose

The director uses Concentrate Industry as the campaign source of work-shift pressure, factory failure, bad concentrate, supply relief and industrial moral debt. It must not simulate production. Industry owns line state, shift state, quality decisions, supply deltas and factory telemetry. The director owns pacing: when a factory beat is allowed, which cross-expansion chain slot advances, which cooldown blocks spam, and which trace explains the choice.

Steady-state target remains `0 us/frame`. Director integration is evaluated only on director rare tick, explicit production event, samosbor aftermath, contract completion or debug force. No beat may require scanning all NPCs, rooms, containers or item stacks.

## Director Signal Provider

Future implementation may expose one provider:

```ts
export const INDUSTRY08_DIRECTOR_PROVIDER_ID = 'industry08.director.provider';

export type Industry08DirectorSignalId =
  | 'industry08.line.briquette.present'
  | 'industry08.line.briquette.blocked'
  | 'industry08.line.briquette.repaired_recently'
  | 'industry08.line.briquette.batch_ready'
  | 'industry08.line.briquette.bad_batch_ready'
  | 'industry08.shift.day.hungry'
  | 'industry08.shift.day.injured'
  | 'industry08.shift.day.fear_high'
  | 'industry08.shift.day.sabotage_risk'
  | 'industry08.supply.food_shortage'
  | 'industry08.supply.clean_ration_surplus'
  | 'industry08.supply.defective_surplus'
  | 'industry08.quality.hold_pending'
  | 'industry08.quality.divert_available'
  | 'industry08.failure.inputs_missing'
  | 'industry08.failure.jammed_press'
  | 'industry08.failure.contaminated_paste'
  | 'industry08.samosbor.classic_contamination'
  | 'industry08.samosbor.meat_resonance_output'
  | 'industry08.contract.repair_available'
  | 'industry08.contract.guard_available';
```

Signal collection rules:

| Signal family | Source aggregate | Scope | Cost rule |
| --- | --- | --- | --- |
| line state | one `FactoryLineState` for `industry08.line.briquette_press` | room/zone | read bounded line array only |
| shift state | one `WorkShiftState` for `industry08.shift_day_briquette` | room/faction | no NPC scan; schedules feed aggregate elsewhere |
| supply | `IndustrySupplySnapshot` or last `IndustrySupplyDelta` | resource/zone | read compact counters and recent event seq |
| quality | pending quality decision state | room/document | one flag plus defect/quality quantized value |
| samosbor | last industry samosbor effect | floor/zone | consume samosbor variant/event fact, no fog scan |
| contract | local contract availability flags | room | respect quest cap through contract adapter |

Suggested quantization: `value01` carries condition, contamination, defect, morale, injury, hunger, fear or shortage. `valueInt` carries capped output buffer amount, pending contract count or last event sequence. Signals expire after 2-12 game hours depending on beat table below.

If the provider is absent, all industry-owned beats reject with `missing_signal_provider`. Cross-expansion chain templates must tolerate that result and keep the chain blocked or expired, not crash.

## Beat Definitions

Beat ids use the `industry08.` prefix. Effects name requests into industry/economy/rumor/contract adapters; they are not direct mutations.

| Beat id | Act | Trigger conditions | Blocks | Effects | Cooldown / max | Trace |
| --- | --- | --- | --- | --- | --- | --- |
| `industry08.shift.hunger_warning` | 1-3 | `industry08.line.briquette.present`; `industry08.shift.day.hungry >= 0.45`; relief budget available | recent same beat within 8h; active samosbor danger budget exhausted | `add_rumor` to worker/market lane; `request_price_pressure` for food input demand severity 1; optional contract offer `deliver_inputs` | 8h / 4 | `industry08_shift_hunger_warning` |
| `industry08.shift.injury_slowdown` | 1-4 | `industry08.shift.day.injured >= 0.35`; hospital or medical scarcity signal present if available | `industry08.line.briquette.blocked` from no inputs; recent hospital crisis beat under 6h | `emit_world_fact` `industry_shift_changed`; `adjust_pressure` labor down severity 2; optional contract offer `guard_shift` or medicine delivery | 10h / 3 | `industry08_shift_injury_slowdown` |
| `industry08.factory.jammed_press_contract` | 2-4 | `industry08.failure.jammed_press`; `industry08.contract.repair_available`; danger budget >= 1 | quest cap signal blocked; repair beat cooldown active | `emit_world_fact` `industry_line_blocked`; `set_campaign_flag` `industry08.needs_repair`; `debug_marker` repair target | 12h / 3 | `industry08_jammed_press_contract` |
| `industry08.factory.inputs_missing_supply` | 2-4 | `industry08.failure.inputs_missing`; `industry08.supply.food_shortage >= 0.35` or market shortage signal | recent input delivery contract under 8h | `request_price_pressure` food/packaging input demand; `add_rumor` storekeeper shortage; optional contract `deliver_packaging` | 8h / 4 | `industry08_inputs_missing_supply` |
| `industry08.factory.sabotage_risk` | 2-5 | `industry08.shift.day.sabotage_risk >= 0.50`; faction pressure or fear signal present | samosbor active; guard contract already active | `emit_world_fact` `industry_shift_changed`; request contract `guard_shift`; `adjust_pressure` industrial danger +1 | 14h / 3 | `industry08_sabotage_risk` |
| `industry08.quality.bad_batch_hold` | 2-5 | `industry08.line.briquette.bad_batch_ready`; `industry08.quality.hold_pending`; defect signal >= 0.40 | recent quality decision under 12h | `emit_world_fact` `industry_defect_found`; `set_campaign_flag` `industry08.bad_batch_pending`; `debug_marker` quality office | 12h / 4 | `industry08_bad_batch_hold` |
| `industry08.quality.release_dirty_batch` | 2-5 | `industry08.quality.hold_pending`; `industry08.supply.food_shortage >= 0.60`; danger budget >= 1 | relief budget dominant; school child-risk chain already active | `request_price_pressure` cheap food relief severity 2; `emit_world_fact` `industry_quality_decision` with `release`; chain slot `bad_concentrate_school_chain.step0` | 24h / 2 | `industry08_release_dirty_batch` |
| `industry08.quality.divert_to_cult_buyer` | 2-5 | `industry08.quality.divert_available`; `industry08.supply.defective_surplus >= 1`; cult pressure signal if available | recent cult escalation under 12h | `emit_world_fact` `industry_quality_decision` with `divert`; `adjust_pressure` cult +1; `add_rumor` defect store | 24h / 2 | `industry08_divert_to_cult_buyer` |
| `industry08.supply.clean_batch_relief` | 2-5 | `industry08.line.briquette.batch_ready`; `industry08.supply.clean_ration_surplus >= 1`; relief budget available | bad batch pending; market raid active | `request_price_pressure` lower ration scarcity severity 1; `emit_world_fact` `industry_batch_ready`; optional market/queue supply hook | 10h / 6 | `industry08_clean_batch_relief` |
| `industry08.samosbor.classic_contaminates_line` | 1-5 | recent samosbor aftermath; last variant `classic`; line present | contamination already high >= 0.80; same aftermath applied for event seq | `request_samosbor_aftermath` target `industry08.line.briquette_press`; `emit_world_fact` contamination delta; chain slot factory failure | 18h / 4 | `industry08_classic_contaminates_line` |
| `industry08.samosbor.meat_resonance_concentrate` | 2-5 | recent samosbor aftermath; last variant `meat`; line present | act below 2; meat resonance cooldown active | `request_samosbor_aftermath` output override `suspect_concentrate`; `set_campaign_flag` `industry08.meat_batch_possible`; `add_rumor` quality horror | 36h / 2 | `industry08_meat_resonance_concentrate` |
| `industry08.samosbor.wet_packaging_spoilage` | 2-4 | recent samosbor aftermath; last variant `wet`; packaging/input signal present | no packaging or line absent | `emit_world_fact` `industry_defect_found`; `request_price_pressure` packaging demand severity 1; optional contract `deliver_packaging` | 20h / 3 | `industry08_wet_packaging_spoilage` |
| `industry08.samosbor.electric_equipment_burn` | 2-5 | recent samosbor aftermath; last variant `electric`; condition <= 0.70 | jammed press already active; repair contract active | `emit_world_fact` `industry_line_blocked`; `set_campaign_flag` `industry08.electric_repair_needed`; `debug_marker` press | 24h / 3 | `industry08_electric_equipment_burn` |
| `industry08.control.liquidator_supply_demand` | 2-5 | clean batch or future filter/rebar signal; liquidator pressure signal | no industry line present; recent faction demand under 12h | `request_price_pressure` filters/door kits/rations; `emit_world_fact` control demand; optional contract handoff | 18h / 3 | `industry08_liquidator_supply_demand` |
| `industry08.control.worker_relief_after_repair` | 2-5 | `industry08.line.briquette.repaired_recently`; shift fear or hunger below 0.40; relief budget available | recent relief beat under 10h | `add_rumor` worker gratitude; `request_price_pressure` ration relief; `adjust_pressure` industry danger -1 | 10h / 4 | `industry08_worker_relief_after_repair` |

## Conditions And Rejection Codes

Industry beats must use typed director conditions, never custom string logic.

| Condition need | Director condition | Failure reason |
| --- | --- | --- |
| industry implemented | `flag_present: expansion.industry08.open` or provider signal present | `missing_required_flag` or `missing_signal_provider` |
| line exists | `signal_present: industry08.line.briquette.present` | `missing_signal` |
| defect threshold | `signal_value_at_least: industry08.line.briquette.bad_batch_ready` or defect signal | `signal_below_threshold` |
| shortage threshold | `signal_value_at_least: industry08.supply.food_shortage` | `signal_below_threshold` |
| not spammed | `cooldown_ready` and `run_count_below` | `cooldown_active` or `max_runs_reached` |
| chain position | `chain_step_ready` | `chain_not_ready` |
| danger pressure | `budget_available: danger` | `danger_budget_exhausted` |
| relief pressure | `budget_available: relief` | `relief_budget_unavailable` |
| quest/contract capacity | contract adapter signal `quest_cap_available` | `missing_signal` or `effect_failed` |

`no_legal_beat` is valid if the factory is stable, the provider is absent, cooldowns are active or budgets block escalation.

## Effect Requests

The director may request only these effect payloads from industry or adjacent systems:

| Effect payload id | Owning adapter | Required behavior | Reject behavior |
| --- | --- | --- | --- |
| `industry08.effect.mark_repair_needed` | industry line adapter | set or confirm bounded repair flag for briquette press | `effect_adapter_missing` aborts beat |
| `industry08.effect.offer_deliver_inputs` | contract adapter | create idempotent delivery/packaging contract if quest cap allows | cap full returns `effect_failed`; consume no cooldown |
| `industry08.effect.offer_guard_shift` | contract adapter | create guard-shift contract tied to shift id | missing quest path aborts only this effect |
| `industry08.effect.apply_samosbor_variant` | industry samosbor adapter | apply variant deltas to line aggregate once per samosbor event seq | duplicate seq returns `ok` with no mutation |
| `industry08.effect.flag_bad_batch_pending` | campaign/director flags | set compact flag for chain and debug | invalid flag is implementation error trace |
| `industry08.effect.release_quality_batch` | supply sink | apply `IndustrySupplyDelta` with quality/defect fields | missing sink falls back to local snapshot |
| `industry08.effect.divert_quality_batch` | supply/faction adapter | route defective supply to cult/black-market pressure | missing adapter degrades to trace + local snapshot |
| `industry08.effect.ration_relief` | economy/market adapter | lower ration scarcity or add clean supply pressure | missing adapter is `skip_effect` if industry event emitted |
| `industry08.effect.worker_rumor` | rumor/world-log adapter | add one bounded rumor/log line | missing adapter is `trace_only` |

The director must not spawn floor items, directly change container contents, directly edit NPC schedules, alter samosbor timers, create new room geometry or force pathfinding changes. Concrete items are created only by industry/container/quest owners.

## Chain Slots

Industry participates in cross-expansion chains through named slots. Chain ownership remains in director data; industry contributes signals and effect targets.

| Chain template | Industry step | Preconditions | Output to next step |
| --- | --- | --- | --- |
| `bad_concentrate_school_chain` | step 0: `industry08.quality.release_dirty_batch` or bad batch world fact | act >= 2, bad batch pending, food shortage high | signal `industry08.chain.bad_concentrate_released`, payload quality/defect quantized |
| `treatment_debt_industry_chain` | step 2: debt labor pressure creates guard/repair shift demand | hospital debt or injury signal, line present | signal `industry08.chain.debt_labor_pressure`, optional repair/guard contract |
| `fungal_shortage_chain` | step 2: mushroom/paste input shortage blocks briquette line | fungal shortage or paste shortage signal, inputs missing | signal `industry08.chain.paste_shortage`, market/queue demand pressure |
| `steam_burn_debt_chain` | step 1: injured workers reduce output after heatline event | heat injury signal, shift injury above threshold | signal `industry08.chain.worker_burn_slowdown`, hospital demand |
| `factory_failure_chain` | local/director utility chain for industry failure -> market shortage -> repair | jammed/electric/inputs missing | signal `industry08.chain.factory_failure`, repair target |
| `samosbor_aftermath_supply_chain` | aftermath converts variant into supply defect or relief | recent samosbor event seq, line present | signal `industry08.chain.aftermath_supply`, defect/clean supply tag |

Chain slots carry only ids, quantized values, room/zone ids and event sequence numbers. They never serialize `FactoryLineState`, `WorkShiftState`, container internals or quest internals.

## Trace Entries

Every selected or top-rejected industry beat must be traceable through the director ring. Industry-specific trace data fits in signal/flag hashes and payload ids; no long strings in hot path.

| Trace field | Industry requirement |
| --- | --- |
| `chosenBeatId` | one of the beat ids in this document |
| `reasonCode` | stable director rejection/effect reason, not prose |
| `signalHash` | hash of line id, blocked reason, defect bucket, shift bucket and supply bucket |
| `flagsHash` | includes `industry08.needs_repair`, `industry08.bad_batch_pending`, `industry08.meat_batch_possible` if present |
| `chainTemplateId` | set for bad concentrate, treatment debt, fungal shortage, heat injury or aftermath slots |
| `samosborVariant` | set for all aftermath beats |
| `dangerBudget` / `reliefBudget` | recorded before effect execution |

Suggested industry debug expansion for trace print:

```txt
industry08 line=briquette condition=Q contamination=Q defect=Q blocked=hash shift=Q supply=Q eventSeq=N
```

On NaN in industry aggregates, future runtime must write its own production telemetry dump path from the industry contract and emit or expose a director trace with `reasonCode = 'invalid_snapshot'` or `effect_failed`.

## Debug Validation

Future debug commands must prove the director hooks without relying on chat reports.

| Debug command | Validation |
| --- | --- |
| `director.providers` | lists `industry08.director.provider`, emitted signal count and last reason |
| `director.beats industry08` | shows all registered `industry08.*` beats, act gates, cooldowns and run counts |
| `director.force industry08.factory.jammed_press_contract` | with jammed signal, emits `industry_line_blocked` or repair marker; without signal, reports forced bypass in trace |
| `director.force industry08.quality.bad_batch_hold` | bad batch signal creates `industry08.bad_batch_pending` flag and quality-office marker |
| `director.force industry08.samosbor.meat_resonance_concentrate` | applies meat aftermath once per event sequence and prints output override/defect bucket |
| `director.roll` after `debug_industry08_break_press` | selects repair/input/sabotage beat or records typed rejection |
| `director.trace 10` | shows selected or rejected industry beat with signal hash, budget and cooldown result |
| `debug_industry08_status` | enough line/shift/supply detail to explain why director did or did not select an industry beat |

Acceptance requires three negative tests: provider absent returns `missing_signal_provider`; quest cap full returns effect failure without consuming cooldown; duplicate samosbor event seq does not apply the same contamination twice.

## Scale And Math LOD

| Tier | Director-visible logic | Presentation allowed | Cost rule |
| --- | --- | --- | --- |
| Low | one briquette line, one shift, one shortage signal, repair and bad-batch beats | static room marker, one log/rumor | 0 us/frame; provider reads <= 1 line and <= 1 shift |
| Middle | inputs, injury, morale, two failure modes, clean/defect supply beats | warning lamp, crate fill state, worker lines | rare tick/event only; no NPC/container scans |
| High | faction pressure, samosbor variants, quality divert, cross-expansion chains | richer POI feedback, local sparks/noise near player | same director beat cap; effects remain adapter calls |
| Ultra | more registered industry lines after MVP but same aggregate contract | visual overkill in pocket, audio announcements, better rumors | CPU logic cap does not increase; spend budget on visible feedback |

Higher tiers may add more beat definitions after the MVP line exists, but they may not replace aggregate production with live factory simulation.

## Implementation Readiness Checklist

Before code registers these hooks, the implementer must verify:

| Check | Required result |
| --- | --- |
| provider state | line/shift/supply/quality aggregates exist or provider is not registered |
| ids | beat ids and signal ids use `industry08.` and do not collide |
| cooldowns | every beat has non-zero cooldown except debug-only beats |
| effects | every effect has an owner adapter or declared fallback snapshot/log behavior |
| chains | bad concentrate chain can remain blocked if school/market adapters are absent |
| trace | forced and natural selection write director trace with stable reason codes |
| source boundaries | no imports from market, school, hospital or samosbor implementation files are required by industry beat data |
| validation | docs-only pass does not claim runtime implementation or build success |

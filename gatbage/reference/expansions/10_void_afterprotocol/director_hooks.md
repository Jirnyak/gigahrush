# Expansion 10: Void Afterprotocol Director Hooks

Status: implementation-ready director contract
Owner scope: `gatbage/reference/expansions/10_void_afterprotocol/**`
Director dependency: `gatbage/reference/expansions/00_samosbor_director` rare-tick scheduler, beat registry, chain state, and trace buffer
Runtime rule: the director may unlock, pace, hint, arm, and explain Void protocol opportunities. It must not apply a protocol directly, rewrite samosbor, mutate routes globally, or scan the world for anchors.

## 1. Integration Purpose

Void Afterprotocol is the late-act pressure valve for systems the player already understands. The director uses it after `Act 4: После ада` to schedule rare protocol opportunities, readable backlash, trace echoes, and post-final return beats. This is not a victory scheduler. It creates local chances to preserve one door, record, route, room, or memory, then makes the building answer.

The Void protocol system remains the owner of protocol possession, target validation, cooldowns, marks, backlash state, and protocol traces. The director receives compact signals from that owner and emits small effect requests back through an adapter. If the Void system is absent, all Void beats reject cleanly with `missing_signal_provider:void_afterprotocol` or `effect_adapter_missing:void_afterprotocol`.

## 2. Director Signal Provider

Future implementation should register one read-only provider.

| Field | Required value |
| --- | --- |
| Provider ID | `void_afterprotocol` |
| Expansion ID | `10_void_afterprotocol` |
| Collection cadence | Director rare tick, samosbor aftermath tick, protocol apply event, or debug tick only. Never render loop. |
| Allocation rule | Caller provides `out: DirectorSignal[]`; provider appends bounded primitive facts only. |
| Missing implementation behavior | Beats requiring Void signals reject with `missing_signal_provider:void_afterprotocol`. |

Required signal facts:

| Signal ID | Payload contract | Source | Purpose |
| --- | --- | --- | --- |
| `void.access_ready` | `{ act, sourceFlag, floor?, zoneId? }` | Late plot flag, `VOID` chamber visit, Herald/Creator/Yakov flag, or debug override. | Allows first unlock only after late-game context exists. |
| `void.protocol_owned` | `{ protocolId, cooldownRemainingHours, activeMarkCount }` | `VoidProtocolState.owned` and cooldown state. | Prevents duplicate unlocks and gates protocol-specific beats. |
| `void.anchor_candidate_seen` | `{ protocolId, scope, targetKey, floor, zoneId?, roomId?, anchorTagsHash }` | Current interact target resolver or latest debug target. | Lets the director hint a local target without scanning for one. |
| `void.seal_seam_candidate` | `{ targetKey, floor, zoneId?, roomId?, baseReliabilityClass }` | Door/hermdoor target adapter when the player is near an eligible target. | Drives `seal_seam` beats and the `void_backlash_chain`. |
| `void.mark_active` | `{ protocolId, markId, targetKey, floor, zoneId?, roomId?, effectState }` | Bounded active Void marks. | Allows director to wait for samosbor or schedule explanation. |
| `void.backlash_pending` | `{ protocolId, backlashKind, markId, floor, zoneId?, roomId?, candidateClass }` | `VoidBacklashState.state === 'armed'`. | Lets director choose when to reveal compensation without random-feeling punishment. |
| `void.backlash_recent` | `{ protocolId, backlashKind, targetKey?, floor, zoneId?, severity }` | Recent resolved backlash trace. | Blocks spam and can trigger late reaction lines. |
| `void.trace_recent` | `{ traceType, protocolId?, targetKey?, severity, dedupeHash }` | Latest bounded `VoidProtocolTrace` entries. | Enables trace echo beats and debug explanation. |
| `void.adapter_status` | `{ adapterId, supported: 0|1 }` | Void protocol adapter registry. | Lets beat rejection distinguish absent archive/route/NPC adapters from ordinary cooldown. |

Signals are high-level facts. They do not include full target objects, text logs, arbitrary JSON, or mutable references. The provider may inspect only bounded Void protocol state, latest interact target, recent important events, and adapter status.

## 3. Beat Candidates

Beat IDs are stable and save-facing once cooldowns ship. The director can register these beats only when the Void Afterprotocol module exists.

| Beat ID | Act | Weight | Cooldown | Max runs | Tags | Visible trace |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `void_protocol_p46_unlock` | 4-Endless | 90 | 72h | 1 | `void`, `unlock`, `protocol`, `relief_seed` | A broken P-46 instruction offers one local protocol, not an answer. |
| `void_seal_seam_target_hint` | 4-Endless | 75 | 18h | 4 | `void`, `seal_seam`, `door`, `choice` | A known seam is worth stabilizing before the next samosbor. |
| `void_seal_seam_relief_window` | 4-Endless | 65 | 24h | 3 | `void`, `seal_seam`, `relief`, `chain:void_backlash` | The director gives room to spend `seal_seam` before escalating backlash. |
| `void_backlash_compensation_due` | 4-Endless | 100 | 12h | 8 | `void`, `backlash`, `samosbor`, `chain:void_backlash` | A stabilized seam demands compensation from a nearby route or warning. |
| `void_trace_echo` | 4-Endless | 55 | 8h | 8 | `void`, `trace`, `world_log` | The building repeats the protocol trace in a readable, diegetic form. |
| `void_late_record_contradiction` | 4-Endless | 40 | 36h | 3 | `void`, `document`, `restore_record`, `cross:03` | A restored fact returns with one wrong line. |
| `void_tenant_memory_aftershock` | 4-Endless | 35 | 36h | 3 | `void`, `npc`, `tenant_memory`, `memory` | A tenant remembers an impossible event and becomes less stable. |
| `void_blind_route_warning` | 4-Endless | 45 | 48h | 2 | `void`, `route`, `blind_elevator`, `cross:09` | One wrong route can be blinded, but another begins waiting. |
| `void_cooldown_refusal` | 4-Endless | 30 | 10h | 6 | `void`, `refusal`, `cooldown` | The protocol refuses a second rewrite before the mark cools. |

`void_protocol_p46_unlock`, `void_seal_seam_target_hint`, `void_backlash_compensation_due`, and `void_trace_echo` are the minimum director-facing slice. The record, tenant, and route beats are adapter targets and must reject without noise until those systems exist.

## 4. Conditions And Blocks

Conditions are evaluated against `CampaignSnapshot`, director cooldowns, run counts, chain state, recent events, and Void signals.

| Condition ID | Passes when | Used by |
| --- | --- | --- |
| `has_open_expansion:10_void_afterprotocol` | `openExpansionIds` includes Void Afterprotocol or the provider `void_afterprotocol` is present. | All beats. |
| `act_at_least:4` | Campaign act is `4` or Endless. | All beats except debug-forced validation. |
| `void_access_ready` | `void.access_ready` signal exists or debug override explicitly sets late access. | Unlock and first hint beats. |
| `void_protocol_not_owned:seal_seam` | No `void.protocol_owned` signal for `seal_seam`. | `void_protocol_p46_unlock`. |
| `void_protocol_owned:seal_seam` | `seal_seam` is owned and not permanently blocked. | Seal seam hint and relief beats. |
| `void_protocol_cooldown_ready:seal_seam` | `seal_seam` cooldown is zero or absent. | Seal seam target hint and relief beats. |
| `void_seal_seam_candidate_present` | `void.seal_seam_candidate` or matching `void.anchor_candidate_seen` exists. | Seal seam target hint and relief beats. |
| `void_mark_active:seal_seam` | Active `seal_seam` mark exists with `effectState` `armed` or `consumed`. | Backlash and trace beats. |
| `void_backlash_pending` | A bounded backlash signal exists and has not been resolved. | `void_backlash_compensation_due`. |
| `void_trace_recent_severity:3` | A recent Void trace has severity at least 3. | `void_trace_echo`, late reaction beats. |
| `samosbor_recent_or_active` | Snapshot says samosbor is active or recent important events include samosbor start/end. | Backlash compensation, `seal_seam` consumption explanation. |
| `relief_budget_at_least:1` | Director relief budget can afford a local protocol chance. | Unlock, seal seam hint, relief window. |
| `danger_budget_at_least:1` | Director danger budget can afford backlash or aftershock. | Backlash, memory aftershock, route warning. |

Blocking conditions:

| Block ID | Blocks when | Reason |
| --- | --- | --- |
| `void_late_act_not_reached` | Act is below 4 and no debug override exists. | VOID protocols must not teach late mechanics early. |
| `void_no_local_anchor` | No eligible current target or anchor candidate exists for a target-specific beat. | Prevents fake reports about invisible protocol targets. |
| `void_protocol_spam_recent` | Two Void danger beats or two Void trace echoes fired within the last 12h. | Keeps late-game weirdness rare and readable. |
| `void_backlash_already_visible` | Pending backlash for the same mark was already resolved or echoed. | Prevents duplicate compensation. |
| `samosbor_active_heavy_crisis` | Active samosbor plus danger budget is zero. | Do not stack protocol punishment into a survival spike. |
| `missing_cross_expansion:03_raionsovet` | Record contradiction requires archive/document adapter and no fallback record exists. | Reject document beat cleanly. |
| `missing_cross_expansion:09_elevator_loop_404` | Blind route warning requires route/404 adapter and no fallback wrong-route signal exists. | Reject route beat cleanly. |
| `missing_npc_memory_adapter` | Tenant memory aftershock has no named tenant or memory adapter. | Use trace echo instead. |

## 5. Effects Contract

Director effects are requests. The Void protocol system decides whether they commit and writes the authoritative protocol trace.

| Effect ID | Target adapter | Required behavior | Fallback |
| --- | --- | --- | --- |
| `void_request_protocol_unlock:seal_seam` | Void protocol adapter | Calls the public grant API with source `director` or equivalent traced source; no duplicate ownership. | World log hint only if grant adapter is absent; beat aborts if no ownership change occurs. |
| `void_emit_p46_hint` | World log/rumor/VOID room adapter | Emits a late P-46 instruction pointing to anchor use without explaining cosmology. | Single HUD/log line marked debug-visible. |
| `void_request_target_hint:seal_seam` | Void target/debug adapter | Marks current eligible door/hermdoor as a suggested protocol target for a short window. | Trace-only with target key if target exists; abort if target missing. |
| `void_open_relief_window` | Director state only | Spends relief budget and suppresses another Void danger beat for a short cooldown. | Trace-only; does not alter samosbor. |
| `void_request_backlash_resolution` | Void protocol adapter | Resolves one pending backlash through the protocol system, preserving mark id and reason. | Trace-only rejection `effect_adapter_missing:void_afterprotocol`; no fake backlash text. |
| `void_emit_trace_echo` | World log/voice adapter | Converts one recent structured Void trace into short player-facing text. | Debug trace print only. |
| `void_request_record_contradiction` | Document/archive adapter | Asks the document owner to mark one related fact suspicious/false. | Reject with `missing_cross_expansion:03_raionsovet`. |
| `void_request_memory_aftershock` | NPC memory/dialogue adapter | Adds fear/suspicion or a one-line reaction to a named tenant who saw the protocol. | Reject with `missing_npc_memory_adapter`. |
| `void_request_wrong_route_warning` | Route/404 adapter | Marks one alternate wrong route as more likely or warns the player through a route trace. | Reject with `missing_cross_expansion:09_elevator_loop_404`. |
| `void_emit_cooldown_refusal` | World log/debug adapter | Explains why a repeated protocol attempt failed without granting power. | Debug-only if no player-facing UI path exists. |

Effect failures record `effect_failed:<effectId>` in director trace. Cooldown is consumed only when the effect commits or when the beat is explicitly a refusal/explanation beat.

## 6. Cooldowns, Runs, And Budgets

Void beats must stay rare. They are late-game connective tissue, not a constant director channel.

| Beat group | Shared cooldown key | Rule |
| --- | --- | --- |
| Unlock | `void.unlock` | One real `seal_seam` unlock per campaign unless debug-forced. |
| Seal seam hints | `void.seal_seam_hint` | At least 18h between target hints; requires an eligible local candidate. |
| Relief window | `void.relief_window` | At least 24h; must block immediate Void danger spam. |
| Backlash | `void.backlash` | At least 12h between visible backlash beats, but pending backlash should not remain hidden forever after samosbor. |
| Trace echo | `void.trace_echo` | At least 8h and deduped by recent trace hash. |
| Adapter beats | `void.adapter_late` | At least 36h across record, memory, and route late beats. |
| Refusal | `void.refusal` | At least 10h; only after an actual rejected protocol attempt or cooldown signal. |

Budget costs:

| Beat | Danger cost | Relief cost |
| --- | ---: | ---: |
| `void_protocol_p46_unlock` | 0 | 1 |
| `void_seal_seam_target_hint` | 0 | 1 |
| `void_seal_seam_relief_window` | 0 | 1 |
| `void_backlash_compensation_due` | 1 | 0 |
| `void_trace_echo` | 0 | 0 |
| `void_late_record_contradiction` | 1 | 0 |
| `void_tenant_memory_aftershock` | 1 | 0 |
| `void_blind_route_warning` | 1 | 0 |
| `void_cooldown_refusal` | 0 | 0 |

## 7. Chain Slots

Void Afterprotocol occupies late slots. Chains must be bounded and comprehensible without direct dependencies on other expansions.

### `void_backlash_chain`

| Slot | Beat | Required prior state | Output state |
| ---: | --- | --- | --- |
| 0 | `void_protocol_p46_unlock` | Act 4+, Void access ready, `seal_seam` not owned. | Player owns `seal_seam` or has a visible P-46 unlock path. |
| 1 | `void_seal_seam_target_hint` or `void_seal_seam_relief_window` | `seal_seam` owned, cooldown ready, local seam candidate exists. | Player receives a local reason to apply the protocol before samosbor pressure. |
| 2 | `void_backlash_compensation_due` | Active or consumed `seal_seam` mark plus pending backlash. | Backlash resolves through the Void protocol system and writes a trace. |
| 3 | `void_trace_echo` | Recent application, effect consumption, or backlash trace exists. | Player sees a readable consequence linking the protocol to the response. |

This chain may skip slot 0 if `seal_seam` was granted by plot or debug. It must not skip directly from no protocol ownership to backlash.

### `afterprotocol_return_chain`

| Slot | Beat | Required prior state | Output state |
| ---: | --- | --- | --- |
| 0 | `void_trace_echo` | Player used any protocol or resolved any backlash. | The world log proves the intervention was recorded. |
| 1 | `void_late_record_contradiction`, `void_tenant_memory_aftershock`, or `void_blind_route_warning` | Matching adapter signal exists for document, NPC, or route. | One old expansion receives a local late-game aftershock. |
| 2 | `void_cooldown_refusal` or `void_seal_seam_target_hint` | Protocol cooldown or new target candidate exists. | Player is pushed toward a bounded next decision instead of permanent power. |

This chain is optional and adapter-driven. If all adapter beats are unavailable, it ends at trace echo and records missing adapters in debug.

## 8. Trace Entries

Director trace must explain why a Void beat was selected, rejected, or deferred. Required fields can live in a compact generic payload while the foundation trace remains fixed-size.

| Field | Requirement |
| --- | --- |
| `chosenBeatId` | Stable beat ID from this document. |
| `reasonCode` | One of `void_access_ready`, `void_protocol_owned`, `void_anchor_candidate`, `void_mark_active`, `void_backlash_pending`, `void_trace_recent`, `void_budget_blocked`, `void_missing_signal`, `void_adapter_missing`, `void_chain_step`, or `effect_failed:<effectId>`. |
| `expansionId` | `10_void_afterprotocol`. |
| `chainId` | `void_backlash_chain`, `afterprotocol_return_chain`, or omitted. |
| `protocolId` | Required for protocol-specific beats; usually `seal_seam` in MVP. |
| `markId` | Required when an active mark or backlash is involved. |
| `backlashKind` | Required for backlash beats when known. |
| `targetKey` | Required for target hint, seal seam, backlash, route, and record beats when known. |
| `floor` / `zoneId` / `roomId` | Required when the signal provides them. |
| `voidTraceId` | Required for `void_trace_echo` when echoing a structured Void trace. |
| `dangerBudget` / `reliefBudget` | Values before applying the beat. |
| `cooldownKey` | Shared cooldown consumed or checked by the beat. |

Rejected top candidate examples:

| Rejection code | Meaning |
| --- | --- |
| `missing_signal_provider:void_afterprotocol` | Void protocol implementation or provider is absent. |
| `blocked:void_late_act_not_reached` | The campaign has not reached Act 4 or an equivalent debug override. |
| `blocked:void_no_local_anchor` | A target-specific beat had no current target/anchor candidate. |
| `blocked:void_protocol_spam_recent` | Recent Void beats would make the late layer noisy. |
| `cooldown:void.backlash` | A visible backlash was already delivered recently. |
| `effect_adapter_missing:void_afterprotocol` | Director selected a legal beat but the Void effect adapter is absent. |

The Void protocol system also keeps its own `VoidProtocolTrace`. Director trace is not a replacement for that black box. Cross-reference is by `voidTraceId`, `markId`, and `targetKey`.

## 9. Debug Validation

Director debug must prove both legal selection and correct rejection.

| Debug command | Required validation |
| --- | --- |
| `director snapshot` | Shows `void_afterprotocol` provider present/absent, Act 4 gate, owned `seal_seam`, active mark count, pending backlash count, latest trace severity, and current candidate target key when known. |
| `director roll` | Can select `void_protocol_p46_unlock` only when `void.access_ready` exists, `seal_seam` is not owned, and relief budget is available. |
| `director force void_protocol_p46_unlock` | Grants `seal_seam` through the Void adapter or returns `effect_adapter_missing:void_afterprotocol`; never creates duplicate ownership. |
| `director force void_seal_seam_target_hint` | Requires `void.seal_seam_candidate` unless debug override names a target key; records `void_anchor_candidate`. |
| `director force void_backlash_compensation_due` | Requires pending backlash; resolves through Void adapter and records mark id/backlash kind. |
| `director force void_trace_echo` | Requires a recent Void trace; output includes `voidTraceId`, protocol id, target key when known, and dedupe hash. |
| `director chains` | Shows `void_backlash_chain` and `afterprotocol_return_chain` step, state, last beat id, and timeout. |
| `director trace` | Shows reason code, cooldown key, budget cost, protocol id, mark id, backlash kind, target key, and adapter rejection if any. |
| Void debug bridge | `void grant seal_seam`, `void target`, `void apply seal_seam`, `void force samosbor`, `void force backlash`, and `void traces` must create facts the director can consume on the next rare or event-bound tick. |

Minimum manual validation path:

| Step | Expected result |
| ---: | --- |
| 1 | Start before Act 4; `director roll` rejects Void beats with `blocked:void_late_act_not_reached`. |
| 2 | Set late access/debug access; `director roll` ranks or chooses `void_protocol_p46_unlock` when relief budget exists. |
| 3 | After grant, repeat unlock; it rejects with owned/max-run/cooldown rather than granting again. |
| 4 | Stand near an eligible hermdoor target; `void_seal_seam_target_hint` becomes legal and records target key. |
| 5 | Apply `seal_seam`, force samosbor, then expose pending backlash; `void_backlash_compensation_due` resolves one backlash and records mark id. |
| 6 | Run trace echo; output links the protocol application/effect/backlash to `voidTraceId` and dedupes repeat echo. |

## 10. Performance And Math LOD

Low tier collects at most nine primitive Void signals and supports the `void_backlash_chain` with `seal_seam` only. Middle tier adds trace echo and cooldown refusal. High tier adds adapter-backed document, memory, and route aftershocks. Ultra does not increase director tick frequency or signal scan breadth; it spends saved budget on richer Void presentation, voice lines, distorted UI, and debug trace inspection owned by render/content systems.

Steady-state director cost remains `0 us/frame`. Signal collection is O(active Void marks + recent bounded Void traces + one current target candidate). It must never scan all doors, documents, NPCs, rooms, or routes.

## 11. Non-Interference Rules

The director must not:

| Forbidden action | Correct owner |
| --- | --- |
| Apply `seal_seam` or any protocol directly. | `src/systems/void_protocols.ts` future implementation. |
| Change samosbor timing, variant selection, or global warning behavior. | Samosbor system and Void protocol backlash adapter. |
| Search the world for all hermdoors or routes. | Current interact target resolver or owning route/door adapter. |
| Mutate archive facts, NPC memory, market debt, or route odds directly. | Owning expansion/system adapter. |
| Spawn monsters or assign `void_tagged_spawn` directly. | Spawn/monster system through a bounded request. |
| Treat missing adapters as success. | Director trace with typed rejection. |
| Explain the cosmology of VOID through player text. | Expansion content remains procedural, incomplete, and local. |

This contract is satisfied when the director can schedule late Void unlocks, `seal_seam` target hints, backlash resolution, and trace echoes from bounded facts, explain every selected/rejected beat in trace, and degrade cleanly when archive, NPC memory, route, or Void protocol adapters are absent.

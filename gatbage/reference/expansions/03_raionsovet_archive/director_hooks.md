# Director Hooks: Райсовет и Живой архив

Статус: director-hook contract для Expansion 03
Scope: document corruption, access pressure, archive misinformation, chain slots
Authority: `expansion.md`, `content_manifest.md`, `integration_contract.md`, `gatbage/reference/expansions/00_samosbor_director/expansion.md`, `gatbage/reference/expansions/00_samosbor_director/integration_contract.md`
Boundary: этот файл не требует source code changes. Все hooks являются data definitions для будущей регистрации в director registry. MVP остается внутри `MINISTRY`; новый `FloorLevel.ADMIN` не появляется.

## Director Role

Райсоветский expansion дает director не новый scheduler, а набор маленьких бюрократических beats. Director может портить документ, задерживать доступ, подсовывать архивную ошибку, открывать временный бумажный обход или запускать cross-expansion chain, но не владеет документной системой. Все эффекты должны проходить через будущие document/access/archive adapters или через локальные flags EXP03.

Director не должен выдавать игроку крупную награду без интеракции. Его работа здесь - сделать бумагу последствием мира: самосбор размыл печать, очередь ожила после дефицита, архив выдал карточку с неправильной датой, охранник проверил не тот приказ. Каждый beat обязан оставить trace, чтобы отказ доступа или странная карточка имели объяснение.

## Signal Provider

EXP03 может предоставить director read-only provider `raionsovet_archive`. Provider собирает только агрегаты и никогда не сканирует весь мир. Если document system еще не реализован, provider возвращает только статические открытые flags и `missing_signal_provider` для beats, требующих runtime facts.

| Signal | Type | Source | Meaning |
| --- | --- | --- | --- |
| `has_valid_archive_pass` | boolean | player document lookup | есть действующий `archive_entry` |
| `has_forged_ministry_permit` | boolean | player document flags | у игрока есть forged `ministry_permit` |
| `document_suspicion` | 0..100 | document/access state | накопленный риск проверок |
| `recent_document_denial` | boolean | document telemetry last 300 | последняя проверка отказала |
| `recent_archive_query` | boolean | archive telemetry last 300 | игрок недавно пользовался архивом |
| `archive_reliability` | enum | archive state | `official`, `stale`, `rumor`, `warped`, `future_dated` |
| `queue_pressure` | 0..3 | room/local flag | очередь спокойна, спорит, давит, блокирует |
| `stamp_integrity` | 0..3 | room/document flags | печати целые, стертые, мокрые, ложные |
| `speaker_order_ready` | boolean | speaker node phase-2 flag | ложный приказ можно показать как aftermath |
| `ministry_lockdown` | boolean | room/samosbor flag | проверки могут отказать даже valid paper |

Provider writes into caller-owned signal storage. Signal ids are stable strings for debug output; runtime implementation may hash them for hot path.

## Beat Contract

All beat ids use prefix `exp03.`. Cooldowns are in game hours. `danger` adds pressure, `relief` creates controlled access or information, `neutral` only changes trace/context.

| Beat ID | Act | Budget | Cooldown | Max Runs | Required signals | Effect |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `exp03.queue_ticket_whisper` | 0-2 | relief | 4 | 3 | `queue_pressure <= 2`, no recent same beat | adds local rumor pointing to `doc_bureau_queue_ticket` path |
| `exp03.archive_pass_window` | 1-3 | relief | 8 | 2 | missing `has_valid_archive_pass`, `dangerBudget < 3` | enables temporary bureau offer for `doc_temp_archive_pass` |
| `exp03.forgery_heat` | 1-4 | danger | 6 | 4 | `has_forged_ministry_permit` or `document_suspicion >= 20` | raises next checker suspicion delta and emits `forgery_rumor` |
| `exp03.wet_stamp_decay` | 1-4 | danger | 10 | 3 | samosbor aftermath wet/classic, `stamp_integrity <= 2` | marks one eligible paper as `wet` or `stamp_damaged` on next access check |
| `exp03.false_order_broadcast` | 2-4 | danger | 12 | 2 | quiet/electric samosbor or `speaker_order_ready` | creates one-zone false order; next checker may allow once with delayed suspicion |
| `exp03.archive_stale_card` | 2-4 | neutral | 8 | 3 | `recent_archive_query`, `archive_reliability != warped` | next archive query can return `stale` card with visible reliability |
| `exp03.future_dated_file` | 3-4 | danger | 18 | 1 | act >= 3, samosbor aftermath, `recent_archive_query` | next player-related card becomes `future_dated` and logs warning trace |
| `exp03.penalty_review_relief` | 2-5 | relief | 16 | 2 | `document_suspicion >= 30`, no lockdown | opens penalty review hook to reduce one administrative debuff at a price |
| `exp03.checker_lockdown` | 2-4 | danger | 14 | 2 | `ministry_lockdown` or recent samosbor, `reliefBudget < dangerBudget` | next checker post requires stricter access result `deny_samosbor_lockdown` |
| `exp03.archive_cross_reference` | 2-5 | relief | 10 | 3 | any cross-expansion scarcity tag, valid archive access | returns bounded clue linking document tag to another expansion |

No beat may spawn NPC groups, create a new room, modify pathfinding, or mutate all player documents. Effects are single-target, interaction-bound, and legal to skip if the relevant adapter is missing.

## Conditions

Conditions are deterministic gates, not hidden dice rolls. Weighted selection may choose between legal beats only after all gates pass.

`requires.act` follows director act numbers. `requires.expansionOpen` must include `03_raionsovet_archive` for all beats and may include another expansion only for chain beats. `requires.signal` references the signal table above. `blocks.recentBeat` prevents repetition even if cooldown load fails. `blocks.dangerOverflow` rejects pressure beats when danger budget is already exhausted. `blocks.noAdapter` rejects any beat that needs unavailable document or archive adapter and records `missing_signal_provider`.

The minimum required runtime conditions for MVP are act gate, cooldown, max run count, adapter present, and one signal check. Faction, scarcity and cross-expansion conditions are phase-later and must fail closed.

## Effects

Director effects are requests, not direct ownership of EXP03 state. A future implementation should map these effect names to document/access/archive helpers.

| Effect ID | Target | Runtime request | Visible result | Failure behavior |
| --- | --- | --- | --- | --- |
| `offer_document_route` | bureau/queue | set local dialogue/room flag for one legal document path | NPC mentions a usable form | no-op with trace `effect_failed_missing_room` |
| `mutate_document_flag` | one document instance | add `wet`, `stamp_damaged`, `warped` or `false_order` | inspect text/reason code changes | consume no cooldown if no eligible document |
| `raise_next_access_suspicion` | next access check | add bounded suspicion delta to one checker interaction | guard reacts harder | clamp to documented suspicion range |
| `set_archive_reliability_once` | next archive query | force `stale`, `warped` or `future_dated` reliability once | card labels unreliable data | return official card if query never happens before expiry |
| `emit_local_document_event` | optional event bridge | publish concise document/archive event | HUD/log line or room trace | local telemetry only if bridge missing |
| `open_penalty_review_offer` | penalty office phase-2 | expose one relief transaction | administrative debt can be reduced | skip if phase-2 room absent |
| `set_checker_lockdown_once` | checker post | next access request may return lockdown denial | door/guard explains lockdown | one-shot flag expires after 2 game hours |

Single-target mutation prevents inventory-wide work. The target selector should prefer the most recently checked or most recently issued document, then the lowest-risk eligible document. It must never allocate a list of all documents per frame.

## Cross-Expansion Chain Slots

EXP03 provides chain steps, not whole chains. Another expansion may start or finish the chain, but the director owns sequencing and cooldown.

| Slot ID | Chain Template | Position | Input | EXP03 Beat | Output |
| --- | --- | --- | --- | --- | --- |
| `exp03.chain.steam_burn_paper` | Паровой ожог | middle | hospital/heat injury or steam event | `exp03.archive_pass_window` or `exp03.penalty_review_relief` | medical/admin form becomes next objective |
| `exp03.chain.route_error_archive` | Ошибка маршрута | middle | metro route anomaly | `exp03.archive_cross_reference` | archive clue points to wrong-line permit or 404 prep |
| `exp03.chain.mushroom_sanitary_queue` | Грибной дефицит | middle | mushroom spoilage/scarcity | `exp03.queue_ticket_whisper` | sanitary clearance demand reaches market/hospital |
| `exp03.chain.market_license_heat` | Черный рынок 88 | middle | illegal trade/license scarcity | `exp03.forgery_heat` | forged trade papers increase guard pressure |
| `exp03.chain.void_future_file` | Пустотный откат | late | VOID/HELL opened | `exp03.future_dated_file` | archive card creates late backlash trace |
| `exp03.chain.supply_requisition` | Смена брака | middle | promzone bad supply | `exp03.archive_cross_reference` | requisition act becomes legal/illegal supply lever |

Chain state must store only `chainId`, `stepIndex`, `sourceBeatId`, `expiresAtHour` and one small payload id such as access tag or archive query key. If a foreign expansion is absent, the slot is not registered and director records no dependency.

## Trace Entries

Each selected or rejected EXP03 beat must be debuggable through the director trace ring. The director trace entry should include the standard fields and these expansion-specific fields when present:

```ts
export interface RaionsovetDirectorTracePayload {
  expansionId: '03_raionsovet_archive';
  beatId: string;
  signalMaskHash: number;
  targetDocumentDefId?: string;
  targetDocumentInstanceId?: number;
  accessTag?: string;
  archiveQueryKey?: string;
  archiveReliability?: 'official' | 'stale' | 'rumor' | 'warped' | 'future_dated';
  effectCode:
    | 'offer_document_route'
    | 'mutate_document_flag'
    | 'raise_next_access_suspicion'
    | 'set_archive_reliability_once'
    | 'emit_local_document_event'
    | 'open_penalty_review_offer'
    | 'set_checker_lockdown_once';
  reasonCode:
    | 'chosen'
    | 'cooldown'
    | 'max_runs'
    | 'act_gate'
    | 'danger_budget'
    | 'relief_budget'
    | 'missing_signal_provider'
    | 'effect_failed'
    | 'no_eligible_document';
}
```

The payload is diagnostic. Runtime may store hashes/numeric enums in the 300-entry ring and expand to strings only in debug.

## Debug Validation

Future debug support must prove the hooks without relying on random pacing:

| Command | Scenario | Expected trace |
| --- | --- | --- |
| `director.listBeats exp03` | list registered beats | ten `exp03.*` ids, act gates, cooldowns |
| `director.force exp03.wet_stamp_decay` | player has eligible document | chosen trace plus `mutate_document_flag` |
| `director.force exp03.wet_stamp_decay` | no eligible document | `no_eligible_document`, no cooldown consumed |
| `director.force exp03.archive_stale_card` | after archive query | next `archive.query` returns `stale` once |
| `director.force exp03.forgery_heat` | forged permit present | next checker access shows raised suspicion |
| `director.force exp03.checker_lockdown` | lockdown signal set | next checker access can deny with lockdown reason |
| `director.trace exp03 20` | after forced beats | shows chosen/rejected reason, budgets, payload |
| `director.chain exp03.chain.route_error_archive` | metro slot available | chain step stores bounded payload and expiry |

Validation fails if a forced beat silently mutates global state, consumes cooldown after adapter failure, creates a new floor, or produces an archive card without reliability metadata.

## Math LOD

Low: 4-6 beats registered, document route offer, one document mutation, one archive reliability override, no cross-expansion slots. Target cost remains 0 us/frame; all work is director rare tick or interaction-bound.

Middle: full ten beats, suspicion pressure, one-shot checker lockdown, bounded archive corruption, two active chain slots.

High: chain payloads connect to market, metro, hospital, mushroom and promzone scarcity tags; archive cross-reference chooses stronger clue text from existing static ids.

Ultra: logic does not become heavier. Saved CPU buys presentation: flickering archive lamps, damaged paper marks, distorted loudspeaker lines and richer visible traces.

## Acceptance

The director-hook pass is complete when this file exists, local `integration_contract.md` references director integration, status/rationale/log are written, and no source code or shared expansion documents are modified.

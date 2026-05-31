# Expansion 10 Content Manifest: Void Afterprotocol

Версия: 0.1 planning  
Agent: EXP10_VOID  
Purpose: content inventory for playable MVP and controlled growth

## Content Rule

Content exists to support the protocol loop: access, anchor, local effect, backlash, trace. Anything that only explains the cosmology is deferred. The playable slice should feel bureaucratic and impossible, not empowering. The player receives a procedure, applies it to one mundane target, then watches the building answer.

## Protocol Catalog

| ID | Name | MVP State | Target Scope | Primary Anchor | Effect | Backlash | Trace Severity |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| `seal_seam` | Закрепить шов | playable | `door` | гермодверь, door journal, repair kit, witnessed samosbor | one door resists next samosbor better | nearby route degrades or siren becomes silent in zone | 4 |
| `restore_record` | Вернуть запись | data + adapter | `document` | archive card, log entry, permit, corpse tag | one lost/false fact becomes usable again | another fact gains false wording or suspicious owner | 4 |
| `quiet_room` | Тихая комната | data | `room` | room id, shelter sign, radio silence, survivor witness | post-samosbor spawn pressure reduced in one room | NPC warning/hearing quality drops nearby | 3 |
| `tenant_memory` | Память жильца | data + dialogue preview | `npc` | named NPC, pocket witness, personal item, old event | NPC remembers impossible route/event | fear/suspicion rises, rumor distortion chance rises | 3 |
| `blind_elevator` | Слепой лифт | reserved | `route` | elevator panel, 404 trace, wrong-floor ticket | one wrong route is blocked or deprioritized | another wrong route becomes more likely | 4 |
| `market_erasure` | Списание долга | reserved adapter | `document` | debt note, black market mark, witness ledger | one debt/contract soft-resets | access or price penalty moves to another NPC/faction | 3 |
| `line_stabilizer` | Стабилизатор линии | reserved adapter | `room` | industrial batch id, valve, ration card | one production line avoids one disruption | neighboring line creates defective output | 3 |

MVP ships only `seal_seam` as complete gameplay. The rest are implementation targets that prevent the API from being door-only. They must remain cheap data until the relevant expansion systems exist.

## Anchor Types

Anchors are not collectibles by default. They are proof that the target is local and consequential. An anchor can be a physical item, existing event, target identity, room state, NPC witness or document. The resolver should accept anchors by tags and validate them against current state.

| Anchor Tag | Acceptable Sources | Used By | Validation |
| --- | --- | --- | --- |
| `door_hermetic` | hermdoor cell, door kit, door log | `seal_seam` | target is interactable door/hermdoor, near player, same floor |
| `samosbor_witnessed` | recent `samosbor_started`, `samosbor_zone_captured`, survivor line | `seal_seam`, `quiet_room`, `tenant_memory` | recent event exists in zone or NPC memory |
| `official_record` | archive card, permit, world log event, personal file | `restore_record`, `market_erasure` | record id exists or adapter returns restorable false fact |
| `named_tenant` | plot NPC, stable NPC id, family id | `tenant_memory` | NPC exists, not dead unless adapter supports ghost trace |
| `wrong_route` | elevator error, 404 trace, route id | `blind_elevator` | route adapter reports active or known wrong route |
| `room_shelter` | school shelter, hospital ward, kitchen, room id | `quiet_room`, `line_stabilizer` | room exists and has matching tags |
| `void_trace` | protocol chamber log, P-46 note, ghost overlay | all | player has obtained late-game protocol access |

Rejected anchor style: global flags like "player reached final, therefore can rewrite zone". That removes local decision-making and breaks survival horror.

## Backlash Catalog

Backlash must be readable, bounded and related to the target. It is not random punishment. It is the building compensating for a local rule change.

| Backlash ID | Scope | Player Read | Mechanical Result | Hard Limit |
| --- | --- | --- | --- | --- |
| `route_degraded` | local route | "Соседний проход стал хуже после закрепления шва." | one nearby door/route gets jam risk or longer unlock | max 1 route per applied protocol |
| `silent_warning` | zone | "Сирена в зоне сработала не полностью." | warning message delayed or muted for marked zone | never disables all warnings globally |
| `false_record` | document | "Архив вернул запись с чужой строкой." | one related fact becomes suspicious/false | cannot corrupt main quest irreversibly |
| `fear_memory` | npc | "Жилец помнит то, чего не должен." | fear/suspicion increase, rumor distortion | capped per NPC cooldown |
| `wrong_detour` | route | "Один слепой лифт замолчал. Другой начал ждать." | alternate wrong route chance increases | adapter must cap route count |
| `defective_neighbor` | room | "Соседняя линия отдала брак." | nearby production output flagged defective | one batch, no permanent economy collapse |
| `void_tagged_spawn` | room/zone | "Тварь вышла с меткой протокола." | next small spawn gets visual/tag marker | no new monster family required for MVP |

Backlash text should appear through world log, HUD or voice. Debug must show protocol id, target key, selected backlash id, and reason.

## VOID Rooms And Pocket Nodes

| Room ID | MVP State | Gameplay Role | Geometry Cheat | Required Content |
| --- | --- | --- | --- | --- |
| `protocol_chamber_p46` | MVP | grants first protocol and explains anchor requirement through broken instruction | normal rectangular room with white/black palette, missing wall slices rendered as static texture | terminal, journal П-46, one voice, exit |
| `blank_archive` | reserved | teaches `restore_record` with one false/empty card | reused archive layout with blank labels | card cabinet, false stamp, whisper |
| `door_without_room` | reserved | demonstrates `seal_seam` target preview | single door in `VOID` that opens to same room | door prop, log message |
| `silent_queue` | reserved | foreshadows `silent_warning` backlash | queue desks repeated via cheap tile pattern | 3 ghost silhouettes, speaker |
| `creator_counter` | reserved late | Творец/imitator offers protocol as procedure, not truth | existing NPC/sprite slot with pale palette | no full exposition, only forms and refusals |

VOID presentation should use static procedural textures, palette swaps, sprite overlays and UI distortion. No continuous geometry solver. No fluid, proton, metaphysics or room-wide physics simulation.

## NPC And Voices

| ID | Type | Role | Line Discipline | MVP |
| --- | --- | --- | --- | --- |
| `yakov_afterprotocol` | plot NPC reaction | frames protocol as experiment and diagnostic failure | scientific, scared, no magic explanation | yes if Yakov access exists |
| `herald_incomplete` | voice/NPC | gives contradictory instruction and warns about price | incomplete, imperative, never helpful enough | optional |
| `creator_counterfeit` | voice/NPC | treats protocol as administrative procedure | bureaucratic, denies authorship | reserved |
| `olga_protocol_fear` | plot NPC reaction | sees the stabilized door as a triage problem | practical, medical, worried | optional |
| `barney_protocol_suspicion` | plot NPC reaction | suspects trap or enemy marker | tactical, short | optional |
| `tenant_witness` | generic NPC | proves local consequence to player | fear first, lore second | MVP fallback |
| `void_log_voice` | non-entity voice | reads trace in diegetic style | dry technical fragments | MVP |

NPC memory integration is optional for MVP, but reaction priority is mandatory: immediate danger and needs override protocol lore. A starving or wounded NPC should not discuss metaphysics.

## Trace And World Log Entries

Trace is the proof that the system is not faking reports. Every protocol application and backlash writes a structured trace. The player-facing log can be short; debug stores the hard fields.

| Trace Type | Trigger | Player Text | Debug Fields |
| --- | --- | --- | --- |
| `void_protocol_obtained` | protocol granted | "Получен протокол: Закрепить шов." | protocol id, source, floor, time |
| `void_protocol_rejected` | invalid apply attempt | debug only by default | protocol id, reason, target key, anchor tags |
| `void_protocol_applied` | valid apply | "Шов закреплен. Дом это заметил." | protocol id, target scope, target key, zone, cooldown until |
| `void_effect_consumed` | samosbor/effect reads mark | "Гермодверь выдержала дольше обычного." | protocol id, target key, samosbor id/phase, result |
| `void_backlash_armed` | backlash selected | "Компенсация назначена." or hidden until visible | backlash id, candidate key, reason |
| `void_backlash_resolved` | backlash becomes visible | "Соседний проход отвечает за чужой шов." | backlash id, affected target, mechanical value |
| `void_trace_dumped` | impossible state/NaN | debug + file note | buffer range, checksum/hash, failure code |

Bounded buffers: MVP can keep 64-128 traces in save-visible state and 300 high-level telemetry frames in runtime black box. No unbounded text arrays.

## Debug Commands

| Command | Purpose | Output |
| --- | --- | --- |
| `void grant seal_seam` | give MVP protocol | owned protocol list and source trace |
| `void list` | inspect owned protocols, cooldowns and active marks | ids, cooldowns, marks count |
| `void target` | print current interact target eligibility | target scope, target key, anchor tags, reject reason |
| `void apply seal_seam` | apply to current target if valid | trace id or reject reason |
| `void force backlash` | resolve pending backlash now | backlash id, affected target |
| `void force samosbor` | start next samosbor with marks active | samosbor state plus protocol marks |
| `void traces` | show latest protocol traces | last 10-20 traces, buffer size |
| `void dump` | write black-box dump for impossible state | path `gatbage/history/agent_logs/Dump_EXP10_VOID.bin` |
| `void clear` | clear protocol state for test save | confirmation and removed counts |

Debug output must be deterministic and short. Expensive formatting only runs when the menu is open or command is invoked.

## Items, Documents And UI Text

MVP documents: `protocol_p46_fragment`, `door_journal_blank`, `afterprotocol_receipt`. They are not lore dumps. Each one gives an action rule, one warning and one missing field. UI label should say "Протокол" or "Процедура", not "spell".

Potential item tags: `void_trace`, `official_record`, `door_hermetic`, `wrong_route`, `named_tenant`, `room_shelter`. Items should reuse existing note/document/item infrastructure unless future code proves a dedicated item type is cheaper.

## Content DOD

Content manifest is implementation-ready when every playable protocol has target scope, anchor tags, backlash, trace type, debug path and one player-readable consequence. MVP content is complete when `protocol_chamber_p46`, `seal_seam`, `tenant_witness` or `void_log_voice`, and the trace/backlash messages are enough to play the loop without reading this document.

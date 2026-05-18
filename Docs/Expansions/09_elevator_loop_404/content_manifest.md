# Expansion 09 Content Manifest: Лифтовая петля 404

Статус: MVP content manifest  
Scope: pocket rooms, local rules, NPC/traces, rewards, exits, documents, debug commands  
Правило: content below specifies future data and pocket generation for EXP09 only. It does not authorize edits to other expansion folders or permanent `FloorLevel` growth.

## Playable Content Slice

MVP content is one numbered pocket: `numbered.404.not_found`. The loop is short and testable. The player enters from an elevator anomaly, sees the elevator indicator fail to show a number, loses trust in map markers, follows physical contradictions, exits through the door that the map marks as wrong, and receives one bounded reward or consequence.

`556`, `777` and `1337` are reserved as data defs and debug labels, not full room sets in the MVP. Their content rows exist so later phases have stable ids and tests can verify fallback behavior.

## Pocket Rooms

| Room ID | Name | Runtime role | Required nodes | Map behavior | Notes |
| --- | --- | --- | --- | --- | --- |
| `404_elevator_hall` | Лифтовой холл без номера | entry, warning, stable return anchor | lift door, blank floor display, wall journal | map shows known source floor or empty label | must be reachable after reload |
| `404_lost_storage` | Потерянная кладовая | reward/recovery | locked shelf, false item slot, inventory receipt | marker points one room aside | recovers one bounded lost item or spawns counterfeit |
| `404_empty_queue` | Пустая очередь | audio/NPC trace | numbered tickets, murmuring queue source, absent clerk chair | map shows NPC dots with no bodies | no full crowd simulation |
| `404_wrong_label_corridor` | Коридор неправильных табличек | rule teaching | three labeled doors, one label contradicts geometry | minimap arrow points to wrong door | teaches exit rule before final |
| `404_archive_dead_end` | Архивный тупик | document/lore hook | cabinet, `doc_order_404_not_found`, torn map | hidden on map until entered | optional EXP03 hook later |
| `404_service_closet` | Шкаф лифтовых тросов | risk/exit clue | frayed cable, breaker, sound cue | map shows wall | optional in low tier, required middle+ |
| `404_repeated_flat` | Квартира с тем же входом | disorientation without maze bloat | table, duplicate lift notice, family photo without people | map loops icon back to hall | high-tier optional |
| `404_wrong_exit` | Неправильная дверь | final exit | door plaque "not exit", unlock check, event trigger | map says dead end | required; exits when player distrusts map |

Room count target is 5-8. Do not grow the MVP into a full floor. Pocket size is measured by decision quality, not square meters.

## Local Rules

| Rule ID | Applies to | Player-facing effect | Technical constraint | DOD check |
| --- | --- | --- | --- | --- |
| `rule_404_map_lies` | 404 pocket | minimap labels, markers and room hints are unreliable | collision, doors and actual coordinates stay truthful | player can solve by physical clues |
| `rule_404_wrong_door_exit` | final exit | door marked wrong/dead end is the valid exit | exit condition is deterministic by seed and room id | debug can print selected exit |
| `rule_404_one_recovery` | lost storage | one lost item or false item can be claimed | no duplicate reward across same instance | double interaction blocked |
| `rule_404_memory_mark` | NPC/rumor follow-up | player/NPC can remember a false number or fear lifts | short flag only; no complex amnesia simulation | debug shows memory flag |
| `rule_404_timeout_fallback` | optional failure | overstaying or wrong loop exits to valid but risky stable floor | never invalid floor/coords | force timeout returns safely |

## NPC And Traces

MVP does not need a full unique NPC with heavy AI. It needs evidence that the place is socially real.

| ID | Type | Location | Function | Runtime cost |
| --- | --- | --- | --- | ---: |
| `trace_lifter_simon_404` | trace/dialogue source | elevator hall/service closet | lift journal line: the ride happened, but floor field is blank | 0 us idle |
| `trace_bella_lost_items` | optional merchant silhouette | lost storage | later hook for lost-item trader; MVP can be note-only | active only on interaction |
| `trace_empty_queue_murmur` | sound/text trace | empty queue | warns that visible NPC dots may lie | no NPC pathing |
| `npc_conductor_loop_404` | phase-2 optional NPC | wrong label corridor | can guide or mislead player once | cap 1 active NPC |
| `trace_archive_clerk_absent` | document trace | archive dead end | explains `doc_order_404_not_found` without exposition wall | 0 us idle |

Rejected content: simulated queue crowd, persistent 404 residents, full liftman schedule. They are too expensive for the MVP and add little to the core rule.

## Rewards And Consequences

| Reward/Consequence ID | Type | Source | Effect | Anti-exploit rule |
| --- | --- | --- | --- | --- |
| `reward_404_lost_item_low` | item recovery | lost storage | returns one recent low/mid-tier item if recoverable | once per instance; tier cap |
| `reward_404_false_item` | trap item | lost storage | gives item with suspicious/false tag for later archive/market hooks | cannot be sold as original without check |
| `reward_doc_order_404` | document | archive dead end | adds "Приказ N 404 о ненайденном этаже" | one copy per instance |
| `reward_404_route_hint` | information | wrong exit | unlocks rumor or debug-visible clue about numbered floors | flag, not direct fast travel |
| `consequence_404_memory_mark` | memory flag | exit/failure | NPC line or player log references a false floor number | bounded boolean/string enum |
| `consequence_404_bad_exit` | risk | timeout/wrong loop | exits to valid dangerous zone or recent unstable floor | no invalid coordinates |

Rewards are local wins. They must not turn 404 into a farm or universal shortcut.

## Exits

| Exit ID | Trigger | Destination | Result | Failure behavior |
| --- | --- | --- | --- | --- |
| `exit_404_wrong_door` | interact with deterministic wrong door after seeing clue | last stable floor or configured stable elevator | success event, optional reward | blocked until clue flag or debug override |
| `exit_404_lift_return` | return to entry lift before rule solved | last stable floor | no reward, memory mark possible | allowed to prevent softlock |
| `exit_404_timeout` | duration limit or repeated wrong loop | valid risky stable floor/zone | bad-exit event, no reward | never sends to missing floor |
| `exit_404_debug` | debug command | chosen stable floor | prints override reason | debug-only |

Exit rules must be deterministic from instance state. No hidden per-frame random escape checks.

## Documents And Readables

| Doc ID | Title | Location | Mechanical role | Text budget |
| --- | --- | --- | --- | --- |
| `doc_order_404_not_found` | Приказ N 404 о ненайденном этаже | archive dead end | archive/void hook, validates 404 discovery | 3-5 short lines |
| `doc_lift_operator_no_shaft` | Инструкция лифтера: не смотреть в шахту | service closet/elevator hall | warns against trusting lift display | 2-4 short lines |
| `doc_room_404_letter` | Письмо из комнаты 404 | lost storage/repeated flat | hints wrong-door rule and memory mark | 3-5 short lines |
| `doc_ticket_blank_floor` | Талон очереди без этажа | empty queue | proof item for rumors/debug | 1-2 short lines |
| `doc_p46_protocol_stub` | Протокол П-46/556 | reserved 556 def | later unlock for 556 | stub only |
| `doc_777_safety_receipt_stub` | Расписка о безопасном пребывании | reserved 777 def | later debt/memory hook | stub only |
| `doc_1337_radio_code_stub` | Радиокод лифта 1337 | reserved 1337 def | later DATA/radio hook | stub only |

Readables must be short. The horror is in rules and consequences, not long prose.

## Debug Commands

| Command | Input | Output | DOD use |
| --- | --- | --- | --- |
| `numbered.listDefs` | none | ids, titles, playable status, generator ids | validate registry |
| `numbered.forceEnter` | `defId`, optional seed | creates active instance or fallback error | enter 404 without setup |
| `numbered.rollAnomaly` | floor/lift/variant/debug seed | normal vs instance entry, warning ids, chance breakdown | verify elevator resolver |
| `numbered.dumpState` | none | active instance, last stable floor/pos, flags, rewards | save/load and softlock debugging |
| `numbered.setMapPolicy` | policy id | active map distortion mode | verify 404 readability |
| `numbered.claimReward` | reward id/debug mode | reward result and dedupe reason | test anti-farm |
| `numbered.forceExit` | exit id | destination and event reason | prove all exits |
| `numbered.simulateMissingLoad` | missing `def` or `generator` | normalization result | prove save tolerance |
| `numbered.clearInstance` | none/debug reason | closes active instance | recovery during QA |

Commands must run only on explicit debug call. They do not poll or allocate every frame.

## Test Scenarios

Normal route scenario: use a known elevator with no anomaly conditions; resolver returns normal floor transition and no active instance.

Intentional 404 scenario: give `doc_room_404_letter` or debug flag, use elevator, see warning ids, enter 404, solve wrong-door rule, receive `reward_doc_order_404`.

Lost item scenario: mark one recoverable item, enter lost storage, claim once, reload or interact again, verify duplicate block.

Memory scenario: exit 404 with memory mark, talk to a generic NPC or inspect debug, verify a bounded line/flag references false floor memory.

Failure scenario: force timeout or wrong loop, verify player returns to valid stable coordinates with bad-exit event.

Save tolerance scenario: save inside 404, reload normally; then simulate missing def/generator and verify fallback to last stable floor with reason code.

Samosbor scenario: force quiet and electric/classic variants, roll anomaly, verify chance/type changes are visible in debug.

## Content Risks

The primary risk is fake bug presentation: broken map, blank elevator number and wrong exit can look like a defect. Every contradiction therefore needs a physical clue, document, audio cue or debug reason. The second risk is meme sprawl. 404 must remain a small systemic pocket, not a joke list. The third risk is reward farming. Rewards are one-shot per instance and modest.


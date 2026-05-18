# Director Hooks Contract: Expansion 06 OBZh School

Status: director-hook planning contract  
Owner: `DIRPASS_EXP06`  
Scope: `Docs/Expansions/06_obzh_school` only  
Runtime rule: this document authorizes no source edits by itself

## Purpose

The school expansion exposes local school pressure to the Samosbor Director without letting the director own school simulation. The director may schedule a lesson beat, request a local evacuation drill, warn about bad food entering the canteen, or arm a quiet alarm beat. The school module still owns rooms, lessons, group evacuation state, panic math, documents, NPC memory and outcome records.

The integration must stay declarative. Future code registers beat definitions and a bounded school signal provider. The director reads signals, applies cooldowns, writes trace and sends small effect requests. It must not import school internals, spawn child NPCs, pathfind for evacuation groups, mutate school route arrays, or rewrite the global samosbor timer.

Steady-state target is `0 us/frame`. School signal collection runs only on director rare ticks, samosbor aftermath ticks, explicit school event completion, or debug requests.

## Expansion Identity

| Field | Value |
| --- | --- |
| Expansion id | `exp06_obzh_school` |
| Primary POI id | `school_obzh_main` |
| Director provider id | `school_director_signals` |
| Effect adapter id | `school_director_effects` |
| Local event state owner | future school evacuation system |
| Required fallback | if provider or adapter is absent, beats reject with `missing_signal_provider` or `effect_adapter_missing` and the game continues |

The provider may report facts only for stamped school POIs and bounded active school state. If no school POI exists in the current world, it emits `school.absent` and no beat requiring the POI is legal.

## Signal Contract

School signals are aggregate facts, not object lists. They are generated from school-local state, quest/perk flags, recent world events and cached POI metadata. The provider must never scan all rooms, all NPCs, all containers or all world cells.

| Signal id | Scope | Value | Meaning |
| --- | --- | --- | --- |
| `school.poi_present` | `room` | `valueInt = roomId` | Main school POI exists and can receive local director effects. |
| `school.player_near` | `room` | `value01 = 0..1` | Player is close enough for a school beat to be visible without teleporting pressure. |
| `school.prep_level` | `global` | `valueInt = 0..5` | Number of completed school prep lessons or equivalent readiness flags. |
| `school.lesson_available` | `room` | `tag = lessonId` | A lesson beat can be offered without duplicating completed work. |
| `school.radio_ready` | `room` | `value01 = 0 or 1` | Pasha/radio prep can classify quiet or false alarms. |
| `school.evac_recent` | `room` | `tag = outcome` | A school evacuation ended inside the recent-event window. |
| `school.evac_risk` | `route` | `value01 = 0..1` | Cached route pressure from jammed doors, fog adjacency, wet canteen or active panic. |
| `school.ration_stock` | `resource` | `valueInt = stock` | Emergency box/canteen ration count if the school owns that aggregate. |
| `school.bad_food_pressure` | `resource` | `value01 = 0..1` | Bad concentrate, mold, or suspect ration signal reached school supply. |
| `school.quiet_alarm_pressure` | `protocol` | `value01 = 0..1` | Silent variant or missing-siren pressure is plausible for the school. |
| `school.parent_pressure` | `faction` | `value01 = 0..1` | Parent complaint or queue conflict is available as aftermath relief/pressure. |
| `school.lesson_cooldown_open` | `global` | `tag = lessonId` | Optional helper signal for debug-readable lesson cooldown state. |

Provider emission cap for MVP is 16 signals. High/Ultra may still emit at most 32 signals; richer presentation must come from text/audio/visual tables keyed by the selected beat, not from larger director scans.

## Beat Definitions

The future school module registers the following DirectorBeatDef records only when the school content module exists. All beat ids are stable. Titles are debug-facing; player-facing strings remain in school dialogue, notes or world log content.

### Lesson Beat: Siren Discipline

```ts
{
  id: 'school.lesson.siren_discipline',
  title: 'School lesson: siren discipline',
  actMin: 2,
  actMax: 3,
  expansionIds: ['exp06_obzh_school'],
  tags: ['school', 'lesson', 'relief', 'samosbor_prep'],
  priority: 20,
  weight: 70,
  cooldownHours: 24,
  maxRuns: 1,
  requires: [
    { kind: 'signal_present', key: 'school.poi_present', reasonOnFail: 'missing_signal' },
    { kind: 'signal_present', key: 'school.lesson_available:lesson_listen_siren', reasonOnFail: 'missing_signal' },
    { kind: 'signal_value_at_least', key: 'school.player_near', threshold: 0.4, reasonOnFail: 'signal_below_threshold' },
    { kind: 'budget_available', key: 'relief', threshold: 1, reasonOnFail: 'relief_budget_unavailable' },
  ],
  blocks: [
    { kind: 'recent_event_present', key: 'school_evac_started', windowHours: 6, reasonOnFail: 'recent_event_blocked' },
  ],
  effects: [
    { kind: 'emit_world_fact', targetExpansionId: 'exp06_obzh_school', targetId: 'school_obzh_main', severity: 1, payloadId: 'offer_lesson_listen_siren', tags: ['lesson'], onReject: 'abort_beat' },
  ],
  visibleTrace: 'В школе снова проверяют, кто слышит сирену до того, как она становится приказом.',
  debugSummary: 'Offers listen-siren lesson if school exists, player is near and no recent evacuation is active.',
}
```

This beat buys relief by giving the player a small preparation lever. It must not grant global samosbor prediction. The only valid future effect is a school-local quest/dialogue/log opportunity that can unlock `perk_siren_margin`.

### Evacuation Beat: Local Drill

```ts
{
  id: 'school.evac.local_drill',
  title: 'School evacuation drill',
  actMin: 2,
  actMax: 4,
  expansionIds: ['exp06_obzh_school'],
  tags: ['school', 'evacuation', 'pressure', 'local_alarm'],
  priority: 50,
  weight: 55,
  cooldownHours: 48,
  maxRuns: 3,
  chainTemplateIds: ['school_quiet_alarm_chain'],
  requires: [
    { kind: 'signal_present', key: 'school.poi_present', reasonOnFail: 'missing_signal' },
    { kind: 'signal_value_at_least', key: 'school.prep_level', threshold: 1, reasonOnFail: 'signal_below_threshold' },
    { kind: 'budget_available', key: 'danger', threshold: 2, reasonOnFail: 'danger_budget_exhausted' },
    { kind: 'cooldown_ready', key: 'school.evac.local_drill', reasonOnFail: 'cooldown_active' },
  ],
  blocks: [
    { kind: 'recent_event_present', key: 'school_evac_completed', windowHours: 12, reasonOnFail: 'recent_event_blocked' },
  ],
  effects: [
    { kind: 'request_route_warning', targetExpansionId: 'exp06_obzh_school', targetId: 'school_obzh_main', severity: 2, payloadId: 'start_school_drill_classic', tags: ['evacuation', 'classic'], onReject: 'abort_beat' },
  ],
  visibleTrace: 'Журнал эвакуации требует повторной тренировки, пока маршрут еще помнят.',
  debugSummary: 'Requests a classic local school evacuation drill through the school adapter.',
}
```

The adapter interprets `start_school_drill_classic` as `startSchoolEvacuation({ variant: 'classic', source: 'director' })` in future code. If no adapter exists, the effect fails with `effect_adapter_missing`; cooldown is not consumed.

### Bad Food Beat: Canteen Concentrate

```ts
{
  id: 'school.canteen.bad_food_warning',
  title: 'School canteen bad concentrate warning',
  actMin: 2,
  actMax: 4,
  expansionIds: ['exp06_obzh_school', 'exp08_industry', 'exp05_market'],
  tags: ['school', 'canteen', 'bad_food', 'supply_chain', 'pressure'],
  priority: 45,
  weight: 60,
  cooldownHours: 72,
  maxRuns: 2,
  chainTemplateIds: ['bad_concentrate_school_chain'],
  requires: [
    { kind: 'signal_present', key: 'school.poi_present', reasonOnFail: 'missing_signal' },
    { kind: 'signal_value_at_least', key: 'school.bad_food_pressure', threshold: 0.5, reasonOnFail: 'signal_below_threshold' },
    { kind: 'signal_value_at_least', key: 'school.ration_stock', threshold: 1, reasonOnFail: 'signal_below_threshold' },
    { kind: 'budget_available', key: 'danger', threshold: 1, reasonOnFail: 'danger_budget_exhausted' },
  ],
  effects: [
    { kind: 'emit_world_fact', targetExpansionId: 'exp06_obzh_school', targetId: 'school_canteen', severity: 2, payloadId: 'flag_school_bad_food_batch', tags: ['bad_food', 'canteen'], onReject: 'abort_beat' },
    { kind: 'add_rumor', targetExpansionId: 'exp06_obzh_school', targetId: 'school_parent_queue', severity: 1, payloadId: 'rumor_school_bad_concentrate', tags: ['parent', 'supply'], onReject: 'skip_effect' },
  ],
  visibleTrace: 'В школьную столовую пришла партия, которую взрослые называют нормой выдачи.',
  debugSummary: 'Marks suspect canteen food when industry/market signals say bad concentrate reached school supply.',
}
```

This beat is not poison simulation. The cinematic cheat is a canteen flag, a parent complaint, one ration-box decision and possible panic modifier during a later event. No digestion, disease spread, per-NPC sickness or inventory flood is authorized by this hook.

### Quiet Alarm Beat: Radio Before Siren

```ts
{
  id: 'school.alarm.quiet_radio',
  title: 'School quiet alarm through radio',
  actMin: 2,
  actMax: 4,
  expansionIds: ['exp06_obzh_school', 'exp00_samosbor_director'],
  tags: ['school', 'quiet_alarm', 'radio', 'samosbor_variant', 'pressure'],
  priority: 65,
  weight: 50,
  cooldownHours: 96,
  maxRuns: 2,
  chainTemplateIds: ['school_quiet_alarm_chain'],
  requires: [
    { kind: 'signal_present', key: 'school.poi_present', reasonOnFail: 'missing_signal' },
    { kind: 'signal_value_at_least', key: 'school.quiet_alarm_pressure', threshold: 0.5, reasonOnFail: 'signal_below_threshold' },
    { kind: 'budget_available', key: 'danger', threshold: 2, reasonOnFail: 'danger_budget_exhausted' },
  ],
  blocks: [
    { kind: 'recent_event_present', key: 'school_evac_started', windowHours: 12, reasonOnFail: 'recent_event_blocked' },
  ],
  effects: [
    { kind: 'request_route_warning', targetExpansionId: 'exp06_obzh_school', targetId: 'school_radio_club', severity: 3, payloadId: 'arm_school_silent_alarm', tags: ['quiet_alarm', 'radio'], onReject: 'abort_beat' },
  ],
  visibleTrace: 'Радиокружок слышит тревогу раньше школы, но это еще не делает ее настоящей.',
  debugSummary: 'Arms a silent or false school alarm; radio lesson changes classification but not global samosbor timing.',
}
```

If `school.radio_ready` is absent, the beat may still run, but the school adapter must choose the worse branch: delayed warning, false classification or higher initial panic. If the radio is ready, it can lower panic or reveal `false_alarm` without reducing global danger budget retroactively.

### Aftermath Beat: Parent Complaint

```ts
{
  id: 'school.aftermath.parent_complaint',
  title: 'School parent complaint aftermath',
  actMin: 2,
  actMax: 5,
  expansionIds: ['exp06_obzh_school'],
  tags: ['school', 'aftermath', 'document', 'relief_or_pressure'],
  priority: 35,
  weight: 45,
  cooldownHours: 36,
  maxRuns: 4,
  requires: [
    { kind: 'signal_present', key: 'school.evac_recent', reasonOnFail: 'recent_event_missing' },
    { kind: 'signal_value_at_least', key: 'school.parent_pressure', threshold: 0.4, reasonOnFail: 'signal_below_threshold' },
  ],
  effects: [
    { kind: 'emit_world_fact', targetExpansionId: 'exp06_obzh_school', targetId: 'school_teacher_room', severity: 1, payloadId: 'write_school_parent_complaint', tags: ['document', 'aftermath'], onReject: 'abort_beat' },
  ],
  visibleTrace: 'После тревоги взрослые требуют бумагу, потому что бумага проще памяти.',
  debugSummary: 'Creates documented school aftermath after an evacuation outcome.',
}
```

This beat converts event outcome into a document/dialogue hook. It is the relief valve after high pressure: the game records the consequence instead of stacking another active crisis.

## Effect Adapter Payloads

Future school code may implement an optional adapter for director effect requests. The adapter accepts only the payload ids below.

| Payload id | Adapter action | Allowed outcome |
| --- | --- | --- |
| `offer_lesson_listen_siren` | Open or mark lesson `lesson_listen_siren` as currently offered. | School dialogue/log opportunity; no forced completion. |
| `start_school_drill_classic` | Start local evacuation with variant `classic` and source `director`. | Active school event or `effect_failed` if already active. |
| `flag_school_bad_food_batch` | Mark canteen/emergency box as suspect batch. | Canteen flag, document/rumor hook, optional panic/ration modifier. |
| `rumor_school_bad_concentrate` | Add school-parent rumor through existing rumor/log path if available. | Optional; may skip without aborting the beat. |
| `arm_school_silent_alarm` | Arm silent or false school alarm using school route state. | Local warning/event setup; no global timer mutation. |
| `write_school_parent_complaint` | Add aftermath document/dialogue flag from last school outcome. | Document id or dialogue flag; no new UI required. |

The adapter must be idempotent for already-open lessons, already-armed alarms and repeated aftermath attempts. It must reject impossible state with `effect_failed`, write school telemetry in future code and leave director cooldown unconsumed unless the effect explicitly completed.

## Conditions And Cooldowns

School beats have three hard gates: act gate, POI presence and cooldown. Pressure beats also require danger budget. Lesson and aftermath beats may consume relief budget or no budget depending on the final director implementation.

| Beat id | Cooldown | Max runs | Budget | Primary blockers |
| --- | ---: | ---: | --- | --- |
| `school.lesson.siren_discipline` | 24 h | 1 | relief 1 | lesson already completed, player not near, recent evacuation |
| `school.evac.local_drill` | 48 h | 3 | danger 2 | no prep, recent school evacuation, active school event |
| `school.canteen.bad_food_warning` | 72 h | 2 | danger 1 | no bad food signal, empty ration stock, missing market/industry signal |
| `school.alarm.quiet_radio` | 96 h | 2 | danger 2 | recent school evacuation, active samosbor overload, missing quiet pressure |
| `school.aftermath.parent_complaint` | 36 h | 4 | relief 0-1 | no recent outcome, parent pressure below threshold |

`no_legal_beat` is a valid result when the school has nothing useful to say. The director must not force a school alarm only because the POI exists.

## Chain Slots

School participates in short director chains. Each chain step remains understandable alone; no chain may require the player to complete a 40-step script.

| Chain template id | School step ids | Role |
| --- | --- | --- |
| `bad_concentrate_school_chain` | `school.canteen.bad_food_warning` -> optional `school.aftermath.parent_complaint` | Industry or market bad supply becomes a school ration conflict and then a document/social consequence. |
| `school_quiet_alarm_chain` | `school.lesson.siren_discipline` -> `school.alarm.quiet_radio` -> `school.evac.local_drill` | Prep lesson increases interpretability before a quiet or false alarm applies pressure. |
| `steam_burn_debt_chain` | optional future `school.evac.route_blocked_by_heat` | Heat/maintenance route danger may block a school corridor without fluid simulation. |
| `fungal_shortage_chain` | optional future canteen ration shortage beat | Mushroom scarcity may reduce emergency ration stock. |

MVP requires only `bad_concentrate_school_chain` compatibility and the local quiet-alarm slot. Missing upstream expansions reject upstream conditions as `missing_signal_provider`; school beats still remain valid when their local signals are present.

## Trace Entries

Director trace entries for school beats must include enough state to explain why pressure was or was not applied.

| Trace field | Required school value |
| --- | --- |
| `chosenBeatId` | One of the school beat ids above. |
| `reasonCode` | `ok`, `missing_signal`, `signal_below_threshold`, `danger_budget_exhausted`, `cooldown_active`, `effect_adapter_missing`, `effect_failed`, or `no_legal_beat`. |
| `chainTemplateId` | Present when selected through `bad_concentrate_school_chain` or `school_quiet_alarm_chain`. |
| `dangerBudget` / `reliefBudget` | Budget state before effect application. |
| `signalHash` | Hash must include POI present, prep level, radio ready, ration stock, evac risk and bad-food pressure. |
| `flagsHash` | Hash must include completed lessons, active school event, last school outcome and suspect canteen flag. |
| `samosborVariant` | Present for quiet/silent interaction or aftermath ticks if known. |

School-local black-box telemetry remains separate from director trace. Future school evacuation code still owns `SchoolEvacTelemetryEntry[300]` and dumps `Docs/AgentLogs/Dump_EXP06_SCHOOL.bin` on impossible evacuation state. Director trace explains selection; school telemetry explains execution.

## Debug Validation

Future debug commands must prove director integration without direct mutation of private school arrays.

| Command | Required output |
| --- | --- |
| `director.providers` | `school_director_signals`, emitted count, last reason. |
| `director.beats school` | five school beat ids, act ranges, cooldowns, max runs, last rejection reason. |
| `director.force school.lesson.siren_discipline` | effect result, trace seq, lesson offer state. |
| `director.force school.evac.local_drill` | effect result, active group count, school event variant. |
| `director.force school.canteen.bad_food_warning` | canteen suspect flag, rumor effect result, trace seq. |
| `director.force school.alarm.quiet_radio` | alarm armed state, radio-ready branch, trace seq. |
| `director.trace school` | latest chosen/rejected school beat, reason code, budgets, signal hash. |
| `school.debug.groups` | school-local group snapshot after director-started evacuation. |

Validation flow:

1. With no school POI, `director.roll` rejects school beats by `missing_signal` and does not throw.
2. With school POI and no prep, the lesson beat can be legal; evacuation drill rejects by `signal_below_threshold`.
3. After one prep flag, forcing `school.evac.local_drill` starts a local classic event or returns `effect_adapter_missing` if code is not linked.
4. With bad-food pressure and ration stock, forcing `school.canteen.bad_food_warning` marks the canteen and writes a trace.
5. With quiet pressure, forcing `school.alarm.quiet_radio` arms a silent or false alarm without changing the global samosbor timer.
6. After a school event completes, aftermath beat can create one complaint/document and then obey cooldown.

## Rejected Patterns

Director-driven per-child spawning is rejected. Director mutation of route arrays is rejected. Director-specific school pathfinding is rejected. Disease, water, crowd pressure or food poisoning simulation is rejected for this hook; bad food is a room/resource flag plus consequence text and bounded panic modifiers. A new `FloorLevel.SCHOOL` is rejected until the POI proves the loop. Global samosbor timing changes are rejected; quiet alarm uses local warning/classification only.

## Implementation Readiness

This hook contract is ready for future code when the director registry exists. The first implementation pass should add only:

1. static school beat definitions;
2. a bounded school signal provider;
3. an optional school effect adapter for the payload ids above;
4. debug output showing provider, beat and trace state;
5. no direct imports from director into school internals beyond registry registration.

Any missing adapter must degrade into typed rejection. The absence of school code must never break the director.

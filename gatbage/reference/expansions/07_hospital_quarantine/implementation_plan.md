# Expansion 07 Implementation Plan: Больничный блок карантина

Статус: planning artifact for future implementation. Этот документ не утверждает наличие кода. Он задает phased playable MVP для `gatbage/reference/expansions/07_hospital_quarantine/expansion.md` и не требует нового `FloorLevel` до доказанного room/pocket slice.

## Scope Lock

Playable MVP размещается как компактный hospital quarantine pocket в `LIVING`, желательно на маршруте между жилой зоной и бюрократическими комнатами `MINISTRY`. Больница не становится безопасным хабом и не заменяет существующие медпункты. Она добавляет тело как учетную единицу: состояние, лечение, запись, проверка, последствие.

Запрещенный объем для MVP: новый постоянный `FloorLevel.HOSPITAL`, клеточная симуляция заражения, body-part medicine, сложная фармакология, непрерывные vitals, массовая AI-симуляция пациентов, переписывание save/load core, переписывание A-Life FSM, глобальная блокировка торговли/метро/школы без адаптера.

## Relevant Mandates Used

Локальный каталог `.agents-skills/` в репозитории не найден. Для этого документа применены мандаты из переданного пользователем блока и доступных проектных документов:

| Mandate | Применение к Expansion 07 |
| --- | --- |
| Domain boundary | Изменяются только документы Expansion 07 и агентские status/log/rationale. |
| Simultaneous execution | Будущий код обязан идти через data contracts, events, room tags and adapters, без прямой зависимости от незавершенных expansion. |
| Cinematic Cheat Protocol | Болезни и карантин работают как finite flags, records and room states, не как физическая/биологическая симуляция. |
| Frame Time Dictatorship | Medical decay редкий и bounded; runtime queries должны быть дешевле 0.1 ms в активном pocket. |
| Math LOD | Low, middle, high, ultra различаются глубиной последствий и визуалом, а не размером мира для симуляции. |
| Black Box | Для будущей реализации нужен fixed circular buffer последних 300 medical/quarantine frames. |
| Evidence-based docs | README трактуется как факт текущей игры, expansion/desdoc как план. |
| Scalability pillar | На weak devices больница читаемая и дешевая; на top-tier устройствах визуально перегруженная, но логически finite. |

## Phase 0: Contract And Placement Gate

Цель фазы - зафиксировать ids и границы до кода. Будущая реализация должна создать data file для condition definitions, thin medical system for apply/remove/decay, hospital pocket generator and debug commands. Если в коде уже появится generic `status_effects.ts`, medical system должен быть adapter поверх него. Если нет, MVP хранит маленький bounded condition list внутри medical module.

Hospital pocket должен состоять из приемного покоя, перевязочной, инфекционного коридора, психкабинета, морга и аптечного склада. Комнаты используют существующие room types как fallback: `MEDBAY`, `HALL`, `STORAGE`, `ACCOUNTING` or closest existing type. Новые enum values допустимы только после проверки blast radius. Pocket не трогает `aptMask`, стартовый атриум и чужие POI.

Definition of Done: перечислены stable ids для conditions, rooms, NPC, documents and debug commands; выбран placement strategy без нового floor; описан fallback для отсутствующих global systems. Проверка: future implementer can add a minimal data table and one pocket generator without editing unrelated expansion folders.

## Phase 1: Finite Medical Conditions MVP

MVP conditions: `bleeding`, `burn`, `mold_infection`, `psi_exhaustion`, `sedated`, `quarantine_mark`. Каждая condition имеет severity 1-3, source tag, decay cadence, gameplay effect, treatment tags, untreated outcome and document trace. Condition count is bounded. Player gets full MVP support; named/key NPC support is allowed, generic 1024 NPC support is deferred.

The first playable loop should be blunt: player receives `bleeding` or `burn`, uses quick item treatment with partial result or hospital procedure with time/resource/document consequence. Treatment never becomes one-click safety. A bed or shower procedure advances time, risks samosbor interruption and writes a medical record.

Definition of Done: at least 4 condition defs work through one apply/remove path, quick item treatment and hospital treatment produce different outcomes, HUD/dialogue feedback exists, ignored severity can worsen on rare tick. Checks: no per-frame allocation, condition lookup is stable by id, unknown condition ids are contained on load.

## Phase 2: Hospital Pocket MVP

The pocket is a room-scale playable slice, not a new floor. It should read as Soviet institutional medicine: white tile, peeling paint, benches, numbered doors, paper cards, locked medicine cabinet, flickering lamp, a wet shower room and a mortuary ledger. Geometry should remain raycaster-readable: 7x7 to 13x11 rooms, one or two corridor turns, no maze inside a pocket.

Room functions are strict. Reception gates services by document/queue. Dressing room treats `bleeding`. Burn shower treats `burn` and wet/heat consequences. Infection corridor applies or clears `quarantine_mark`. Psych office trades PSI stabilization for diagnosis risk. Morgue produces records and limited evidence, not free medicine. Pharmacy storage is a contested container, not floor loot.

Definition of Done: player can enter, identify services, speak to doctor or sanitar, treat one condition, trigger one quarantine denial and inspect one morgue record. Checks: room connectivity survives samosbor regeneration, container access is bounded, service prompts do not claim unavailable mechanics.

## Phase 3: Quarantine And Sanitar Checks

Quarantine is an access state. It should open some medical help and close some civilian services. The MVP needs one direct gate: a player with `quarantine_mark` is stopped by a sanitar at reception or blocked from a non-medical service inside the pocket. The mark can be cleared by treatment, fake document or waiting through a risky timer.

Sanitars are not monsters by default. They are bureaucracy with legs. A failed check can redirect the player, demand paper, apply a diagnosis, call a liquidator only in escalation, or lock a room flag. This keeps quarantine scary without turning every condition into combat.

Definition of Done: at least one service/door queries quarantine state, one sanitar dialogue branch handles clean/marked/fake-document outcomes, and one debug command can force or clear quarantine. Checks: no global floor lock, no cell-by-cell spread, no direct dependency on future metro/school code.

## Phase 4: Records, Morgue And Documents

Every meaningful hospital treatment writes a trace. The trace can be a medcard entry, prescription, psychiatric referral, death tag, quarantine notice or sanitized absence certificate. These are gameplay documents: they can gate treatment, affect prices, trigger suspicion, unlock morgue inspection or produce an archive contradiction later.

The morgue is an archive of bodies, not a loot cave. MVP record examples: body listed as alive in queue, patient who died before the player met him, death tag with the wrong room, record overwritten during meat resonance. Loot budget: one document, one minor medical item at most, one rare key/evidence only behind risk.

Definition of Done: treatment creates one medcard trace, morgue inspection can reveal one contradiction, and documents have at least one mechanical consequence. Checks: generated records are stable in save/load, loot does not exceed budget, text is concise enough for existing UI.

## Phase 5: Samosbor Variant Hooks

Hospital reacts to samosbor variants through local risk modifiers. Classic overloads reception queue. Wet increases mold/infection risk and ruins dressing room sterility. Electric disables apparatus and creates false monitor/record states. Meat resonance corrupts morgue records and body tags. Silent keeps admissions open too long and delays lockdown warnings.

MVP only needs two variant hooks: wet and meat resonance. Wet can add `mold_infection` risk or quarantine room contamination. Meat resonance can scramble one morgue record or apply a wrong document trace. Other variants stay documented until core loop is stable.

Definition of Done: two variants change hospital risk without changing global samosbor rules; debug can force the hospital variant response; player sees a concrete choice between treatment and shelter. Checks: variant hooks are local, bounded and optional if samosbor variant data is absent.

## Math LOD And Performance

| Tier | Logic | Content | Visual overkill budget | Target cost |
| --- | --- | --- | --- | --- |
| Low | Player-only conditions, one key NPC, decay on interaction or 30-60s tick, quarantine as boolean/tag. | One pocket, four services, one morgue record. | Static props, existing textures, minimal HUD icon/text. | Under 20 us idle, under 80 us active service interaction. |
| Middle | Key NPC patients, room quarantine flags, sanitar checks, treatment timers. | Six rooms, doctor/sanitar/patient/morgue keeper, two samosbor hooks. | Flicker flags, wet floor tint, locked cabinet prompts. | Under 40 us idle near pocket, under 150 us active event tick. |
| High | Medcards connect to world events, prices, faction suspicion and future archive hooks. | More records, limited black-market tie, donor request event. | More sprites, record UI summaries, queue ambience. | Under 0.1 ms per rare medical tick outside debug formatting. |
| Ultra | Same finite logic, richer local presentation only. | More room dressing and conditional dialogue variants. | Lamp stutter, gurney silhouettes, frosted glass figures, morgue drawer audio. | Same logic budget; visuals degrade by distance/setting. |

No tier is allowed to upgrade into full contagion, continuous vitals or per-NPC hospital pathfinding. Performance is currency for better fear presentation, not an excuse for simulation.

## Test And Verification Plan

Docs-only verification: changed paths must stay inside allowed scope, generated docs must not claim code exists, and `npm run build` must still pass because concurrent agents can break code even when this task is documentation-only.

Future implementation checks:

| Check | Expected result |
| --- | --- |
| Apply `bleeding` severity 2 | Player receives bounded active condition, HUD/dialogue feedback appears, no allocation spike. |
| Treat with bandage | Severity reduces or timer clears with partial document trace. |
| Treat at dressing room | Condition clears, time/resources consumed, medcard record written. |
| Force `quarantine_mark` | Sanitar blocks one service or redirects to infection corridor. |
| Load old save without `medical` | Normalizes to empty medical state, no crash. |
| Load save with unknown condition id | Preserves safe unknown record or drops with warning event, no hard failure. |
| Force wet samosbor hook | Infection risk/room contamination changes only inside hospital pocket. |
| Force meat resonance hook | Morgue record contradiction appears without spawning a wave. |
| Debug dump on invalid state | Last 300 medical telemetry frames written to `gatbage/history/agent_logs/Dump_EXP07_HOSPITAL.bin`. |

## Risks And Countermeasures

| Risk | Failure mode | Countermeasure |
| --- | --- | --- |
| Medicine becomes pure punishment | Player resents statuses and avoids hospital content. | Every condition has at least two treatments: quick partial field care and slower hospital care with document consequence. |
| Simulation bloat | Infection updates all rooms/NPC and breaks frame time. | Finite condition ids, bounded active arrays, room flags, rare ticks and explicit events. |
| Hospital becomes safe hub | Player hides in hospital and trivializes samosbor. | Queues, quarantine locks, sanitar checks, contaminated rooms, morgue consequences and variant hooks. |
| Save fragility | New optional state breaks old saves. | Versioned `MedicalSaveV1`, normalizers, unknown id tolerance, clamped severity/progress. |
| Cross-expansion collisions | Metro/school/market links assume code not merged yet. | Adapters and optional events only; no direct dependency on unavailable modules. |
| Tone drift | Generic hospital horror or modern clean sci-fi. | Soviet bureaucracy, paper records, linoleum, queue, talons, wrong stamps and local body horror. |

## MVP Acceptance

The MVP is complete when the player can receive a finite medical condition, choose quick treatment or hospital procedure, get a medcard trace, face at least one quarantine restriction or sanitar check, inspect one morgue record with mechanical consequence, and verify the state through debug commands.

Non-acceptance examples: a room named "hospital" with passive loot; conditions that only subtract HP; a quarantine flag that never gates anything; a morgue that only gives pills; a plan requiring a new floor before the pocket loop works.

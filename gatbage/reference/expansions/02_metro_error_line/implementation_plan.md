# EXP02 Metro Error Line - Implementation Plan

Статус: план будущей реализации. Код не менялся. Документ описывает playable MVP метро в рамках `gatbage/reference/expansions/02_metro_error_line/expansion.md` и не требует немедленного расширения `FloorLevel`.

## Applied Mandates

Registry `.agents-skills` в репозитории не найден. Для этого плана применены релевантные mandates из полученного assignment и проектных документов:

| Mandate | Применение в EXP02 |
| --- | --- |
| Playable slice first | MVP обязан дать полный loop: слух, жетон, станция, маршрут, поезд-хаб, нормальная или ошибочная высадка, запись в журнале/debug. |
| Data-driven systems | Станции, маршруты, жетоны, ошибки, документы и debug-команды планируются как данные, не как UI-хардкод. |
| Cheap by default | Метро не симулирует километры рельсов; маршрут резолвится таймером и destination hook. |
| No enum bloat before proof | Новый `FloorLevel` запрещен для MVP; используются pocket rooms или `floorInstance` hooks. |
| Event/log visibility | Каждая посадка, прибытие, ошибка маршрута, закрытие станции и жетон публикуются как future event/log candidates. |
| Predictability over realism | Ошибочная высадка имеет предвестники и risk modifiers, а не чистый random. |
| Math LOD ladder | Low/middle/high/ultra отделены по расчетам и визуальному оверхеду. |
| Shared interface restraint | Интеграция идет через route/floor-instance/debug hooks; чужие expansion-папки и root docs не меняются этим планом. |

## MVP Definition

Playable MVP метро готов только если игрок может из `MAINTENANCE` найти вход на станцию, получить или украсть жетон, дождаться состава, выбрать маршрут, провести ограниченное время в вагоне-хабе и выйти в другой существующий этаж или депо. MVP обязан содержать минимум три станции, два штатных маршрута, одну ошибочную высадку с предвестниками, один способ снизить риск и debug-команды для воспроизводимости.

Не считается готовностью: декоративная платформа без маршрута, один телепорт без риска, новый большой этаж без loop, чистый fast travel без стоимости, случайная высадка без объяснения игроку.

## Phase 0 - Domain Lock And Data Shape

Цель: до кода зафиксировать минимальный контракт данных, чтобы другие агенты могли работать рядом без прямых зависимостей.

Работа: описать `MetroStationDef`, `MetroRouteDef`, `MetroTokenDef`, `MetroEventDef`, `MetroDocumentDef` и future debug command IDs. Станция должна ссылаться на существующий floor или на opaque `floorInstanceId`; маршрут хранит цену, риск, travelMinutes, possibleErrors и visibleWarningIds. Ошибка маршрута хранит не только шанс, но и player-facing signs: табло, голос, чужой билет, повторяющийся пассажир, карта с номером 404.

DoD: типы можно реализовать в будущем в `src/data/metro_routes.ts` без импорта из других expansion-папок; маршрут можно проверить unit-like debug сценарием; добавление новой станции не требует изменений в UI-коде.

Rejected alternative: полноценный graph pathfinding тоннелей. Это дороже, не нужно для MVP и превращает метро в отдельный dungeon вместо транспортной системы.

Estimated frame cost: 0 us idle, 5-20 us на старт поездки при выборе маршрута, 0 us per-frame кроме активного train timer.

## Phase 1 - Station Pocket MVP

Цель: сделать три станции как небольшие room/pocket instances, не как новый глобальный floor.

Станции MVP: `station_living`, `station_pipes`, `station_red`. Депо `depot_no_rails` служит safe debug arena и местом ремонта состава, но не становится постоянным домом игрока. Вход MVP идет из `MAINTENANCE` через future `metro_hatch` или комнату-диспетчерскую.

Генерация должна использовать комнатный принцип: замкнутый периметр, одно-две контролируемые двери, аварийный ящик, касса, табло и несколько статичных props. Для LIVING/KVARTIRY выходы должны уважать инвариант гермодверей и не оставлять дыр в комнатных стенах. Для HELL edge станция "Красная" должна быть мясным карманом, а не обязательным полноценным HELL floor transition.

DoD: каждая станция имеет координату выхода, spawn slots для 1-4 NPC, 1-2 контейнера, station sign, debug teleport target и минимум одну запись/слух.

Rejected alternative: отдельная бесконечная линия метро. Нельзя поддержать дешевый MVP и предсказуемую навигацию.

Estimated frame cost: generation-time only; runtime idle 0 us, station props рендерятся как обычные sprites/features.

## Phase 2 - Route Runtime

Цель: реализовать поездку как state machine: idle -> boarding -> in_train -> arriving -> resolved.

При посадке система фиксирует `routeId`, seed, departureAt, arrivalAt, tokenUsed, riskScore и selectedWarnings. Во время поездки маршрут не pathfind'ит; он показывает train hub, тикает таймер и разрешает ограниченные действия: разговор, barter, лечение, чтение документа, emergency stop. При прибытии резолвится нормальный destination или ошибочный destination.

Риск считается один раз при отправлении, затем может быть изменен только явными действиями: предъявить документ диспетчера, заплатить правильным жетоном, поговорить с метрошником, проигнорировать предупреждение, ехать во время самосбора. Это дает предсказуемость и не создает per-frame симуляцию.

DoD: два штатных маршрута работают в обе стороны, одна ошибка воспроизводится debug-командой, arrival всегда оставляет запись в world log/msgLog candidate, маршрут не ломает save/load при mid-trip через future serialized transit state.

Rejected alternative: считать wrongExitChance каждый tick. Это делает исход шумным, сложнее дебажится и не дает игроку читать признаки.

Estimated frame cost: 0-10 us на обычный tick таймера; 20-60 us на resolve arrival из-за выбора destination/event/log.

## Phase 3 - Train Hub

Цель: поезд должен быть временным опасным хабом, а не безопасным fast travel menu.

Вагон представлен одной малой room instance с фиксированными spawn slots: метрошник, торговец жетонами, беженец, раненый ликвидатор, пассажир-слух, культист без символов. Одновременно активно 3-6 NPC, остальные пассажиры передаются текстом, звуком и спрайтовыми silhouettes. Контейнеры ограничены: аптечка, ящик инструментов, чужой чемодан с theft risk.

События хаба должны быть редкими: застрявшая дверь, погасший свет, объявление неверной станции, обход контролера, пассажир просит воду, культист меняет табличку маршрута. Любое событие должно иметь короткую HUD-обратную связь и будущий event id.

DoD: у вагона есть countdown, выход заблокирован до остановки или emergency case, минимум два интерактивных NPC, один barter жетона, один слух, один документ, один theft-risk контейнер.

Rejected alternative: поезд как статичный teleport screen. Это быстро, но не дает социальной сцены, риска и survival horror tension.

Estimated frame cost: как маленькая комната с NPC; целевой budget 0.03-0.08 ms active, 0 us inactive.

## Phase 4 - Samosbor And Wrong Exit Rules

Цель: самосбор меняет работу метро локально, но не отключает глобальную систему и не объясняет природу самосбора.

MVP использует два variants: silent samosbor suppresses announcements, wet samosbor floods `route_pipes_red`. Дополнительные modifiers: electrical switch error, meat resonance near red station. Wrong exit не должен быть наказанием без сигнала: если риск высок, система выбирает 2-3 warning ids и показывает их через табло, NPC line, найденный билет или map glitch.

DoD: минимум две samosbor conditions меняют доступность/риск станции; wrong exit имеет pre-warning и post-fact log; игрок может снизить риск документом или диалогом; debug может force normal, force wrong, force samosbor modifier.

Rejected alternative: случайно телепортировать игрока в HELL. Это разрушает trust и выглядит как баг.

Estimated frame cost: 0 us idle; route availability пересчитывается только при samosbor start/end или debug.

## Phase 5 - Content And Economy Slice

Цель: дать достаточно предметов, NPC и документов, чтобы метро было игровой системой, а не пустым переходом.

MVP economy использует существующие item/value принципы: жетон можно купить, выменять за еду/воду/лекарство, украсть из чемодана или получить за micro-quest. Документы снижают риск или открывают маршрут: диспетчерская записка, маршрутная схема, мокрый приказ, талон ночной смены.

DoD: content manifest реализуем без новых глобальных factions; метрошники идут как `occupation/tag: metro`; один маршрут требует жетон, один допускает взлом/документ, один dangerous route имеет warning stack.

Rejected alternative: новая полноценная фракция метрошников в MVP. Это добавляет отношения, патрули и дипломатию до доказательства транспортного loop.

Estimated frame cost: content data 0 us; barter/quest checks по событию interaction.

## Phase 6 - Debug, Telemetry, Save Compatibility

Цель: future implementation должна быть проверяемой без ручного забега через половину мира.

Debug commands: открыть все станции, вызвать поезд, force route, force wrong exit, force station closed, dump metro state, give token, show route risk. Telemetry должна держать fixed-size ring buffer последних route states: station, route, risk, warning ids, destination, samosbor flags. При NaN/invalid destination будущая система должна dumping-ready состояние в `gatbage/history/agent_logs/Dump_EXP02_METRO.bin`, если это будет разрешено task scope будущего кода.

DoD: каждый acceptance scenario воспроизводится debug-командой; metro state можно вывести в debug overlay; save normalization умеет отсутствие metro state.

Rejected alternative: проверять только ручным playtest. Метро зависит от timing/risk, значит без debug force оно будет ломаться тихо.

Estimated frame cost: 0 us unless debug overlay open; telemetry write target 1-3 us per metro state change, not per frame.

## Math LOD

| Tier | Runtime model | Visual model | Content model | Target |
| --- | --- | --- | --- | --- |
| Low | Route resolves once at departure; station availability only on samosbor/debug events. | Static platform, single train room, no tunnel animation. | 3 stations, 2 routes, 1 wrong exit, 3 NPC. | Toaster/MX350: метро не должно быть заметно в frame time. |
| Middle | Route risk has small modifier table for token, document, samosbor, faction control. | Flicker lights, sign changes, 2-3 passenger silhouettes. | Depot, 5 NPC roles, theft container, 4 documents. | Обычные ноутбуки: readable atmosphere without AI load. |
| High | Zone capture and faction control can close stations via event hooks; NPC migration is aggregated. | Scrolling tunnel texture and sound cues while in train. | Dynamic rumors from route events, controlled station lockdowns. | Good desktop: buy tension with event reactivity. |
| Ultra | Same logic as High; extra visuals only. | Multi-layer tunnel parallax, brightness pulses, rare window hallucination sprites. | Extra ambience variants, no new systemic cost. | $5000 machine: visual overkill without simulating rails. |

No tier may introduce per-frame global route simulation. Ultra spends cycles on fakes, not realism.

## Tests And Checks

Build-level checks for future code: `npm run build`, new start, route debug smoke, save/load without metro state, save/load while in train if serialized. Data checks: duplicate station ids, missing route endpoints, route with no destination, wrong exit with no warning ids, token required but not obtainable, document referenced by route but absent from manifest.

Playable checks:

| Scenario | Expected result |
| --- | --- |
| Enter from MAINTENANCE hatch | Player reaches `station_pipes`, sees platform feedback and route options. |
| Buy/steal token | Inventory/relations/event candidates update; route can consume token. |
| Normal route pipes -> living | Timer completes, player exits at existing destination, log records arrival. |
| Force wrong exit | Warnings appear before arrival; player exits depot or red pocket; log says route error, not generic teleport. |
| Samosbor active on station | At least one route closes or risk rises; announcement reflects local disturbance. |
| Debug route risk | Overlay reports route id, base risk, modifiers, selected warnings, destination. |

## Risks

Fast travel risk: метро can erase survival distance. Countermeasure: rare departure, token cost, wrong exit risk, station closures and limited routes.

Navigation trust risk: wrong exit can look like a bug. Countermeasure: warnings before, deterministic seed, post-fact log and debug trace.

Dependency risk: future numbered floors may not exist. Countermeasure: MVP targets existing floors and depot pocket; numbered destinations are hooks only.

Performance risk: train hub can become a crowded NPC simulation. Countermeasure: active passenger cap and aggregate migration/events.

Scope risk: metro can absorb black market, archive and elevator-loop responsibilities. Countermeasure: EXP02 owns route transport only; documents/access are hooks to future archive/market systems.

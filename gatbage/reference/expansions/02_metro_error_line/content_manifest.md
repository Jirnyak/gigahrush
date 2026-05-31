# EXP02 Metro Error Line - Content Manifest

Статус: планируемый контент для playable MVP. Имена и ids стабильны для будущих data files, но код в этом шаге не меняется.

## Content Rules

Контент метро должен поддерживать loop "слух -> жетон -> станция -> маршрут -> поезд-хаб -> высадка -> последствие". Каждый объект ниже обязан либо открывать маршрут, либо менять риск, либо объяснять ошибку, либо давать debug visibility. Декорации без системной функции остаются secondary.

## Stations

| ID | Name | Floor/pocket hook | Function | MVP contents | Risk notes |
| --- | --- | --- | --- | --- | --- |
| `station_pipes` | Станция "Трубы" | `MAINTENANCE`, hatch/dispatcher room | Первый вход, сервисный доступ, tutorial station. | Метрошник, касса без денег, мокрая схема, аварийный ящик, затопленный край платформы. | Wet samosbor raises flood warning and blocks red route. |
| `station_living` | Станция "Жилая" | `LIVING` or `KVARTIRY` vestibule pocket | Возврат в населенный слой, рынок слухов. | Торговец жетонами, беженец, доска объявлений, чемодан, табло. | High faction pressure can require token or document. |
| `station_red` | Станция "Красная" | `HELL` edge or meat pocket | Dangerous destination, cult pressure, wrong-exit target. | Культист без символов, красные лампы, чужие билеты, мясная стена за служебной дверью. | Meat resonance increases wrongExitChance. |
| `depot_no_rails` | Депо "Без рельсов" | isolated pocket/floorInstance | Debug-safe arena, train repair, controlled combat/event. | Сломанный состав, инструментальный шкаф, диспетчерская записка, один hostile event. | Used as non-lethal wrong exit before numbered floors exist. |

Station MVP rule: no station may require a new permanent `FloorLevel`. Every station needs a known return path and a debug spawn id.

## NPC Manifest

| ID | Role | Spawn | Gameplay purpose | Lines/behavior |
| --- | --- | --- | --- | --- |
| `npc_metro_duty_valentin` | Метрошник-дежурный | `station_pipes` / train | Explains route risk, sells first cheap token, can reduce risk once. | Dry official speech, warns about wrong announcements. |
| `npc_token_trader_klava` | Торговец жетонами | `station_living` / train | Barter token for water, bread, medicine or document. | Treats route info as commodity. |
| `npc_refugee_sonya` | Беженка | train hub | Gives passenger rumor, requests water, can reveal warning sign. | Human cost; not route authority. |
| `npc_liquidator_wounded_barsukov` | Раненый ликвидатор | train hub / depot | Offers risky shortcut or emergency stop info for bandage. | Wants control of evacuation routes. |
| `npc_child_repeat_misha` | Повторяющийся ребенок | train hub, rare | Warning NPC for wrong exit; appears twice with same line. | Not a quest dispenser; omen and rumor source. |
| `npc_plain_cultist_egor` | Культист без символов | `station_red` / train | Raises red route risk, hints at meat resonance. | Speaks like commuter until samosbor. |
| `npc_depot_foreman_ira` | Механик депо | `depot_no_rails` | Repair/escape micro-objective after wrong exit. | Gives practical task, not lore dump. |

NPC cap for MVP: active metro NPC 3-6 in train, 1-4 per station pocket. Any extra "crowd" is visual/text ambience.

## Routes

| Route ID | From -> To | Requirement | Travel minutes | Base risk | Wrong exits | Warnings |
| --- | --- | --- | ---: | ---: | --- | --- |
| `route_pipes_living_local` | `station_pipes` -> `station_living` | `token_copper_route` or duty permission | 8 | 0.08 | `depot_no_rails` | wrong voice, map smudge |
| `route_living_pipes_return` | `station_living` -> `station_pipes` | any metro token | 7 | 0.06 | `station_red` rare | dead lights, wet tickets |
| `route_pipes_red_service` | `station_pipes` -> `station_red` | `doc_dispatcher_note` or lockpick/hack future hook | 11 | 0.22 | `depot_no_rails`, future `floor_404_hook` | red timetable, repeated child, tabloid "404" |
| `route_red_living_last` | `station_red` -> `station_living` | `token_red_shift` | 10 | 0.18 | `depot_no_rails` | cult hymn over speaker, no station number |

Route MVP rule: route availability is evaluated on route selection and samosbor start/end, not every frame.

## Tokens And Access Items

| ID | Name | Source | Use | Risk effect |
| --- | --- | --- | --- | --- |
| `token_copper_route` | Медный жетон линии | Buy from duty/trader, steal from suitcase, reward from water request. | Basic pipes/living routes. | -0.03 if route matches. |
| `token_red_shift` | Красный жетон смены | Rare barter, station red container, liquidator trade. | Red route return or dangerous access. | -0.05 on red return, +0.02 suspicion at living station. |
| `pass_torn_transfer` | Рваная пересадка | Found on platform floor or corpse. | One-way emergency boarding. | No discount; adds warning "ticket not yours". |
| `doc_dispatcher_note` | Записка диспетчера | Depot desk or station office. | Opens service route, lowers wrong-exit risk. | -0.08 when presented before boarding. |
| `map_wet_schema` | Мокрая схема линии | Station pipes prop/container. | Reveals route warnings before purchase. | No direct risk change; gives player information. |
| `receipt_no_station` | Квитанция без станции | Cash desk, wrong exit aftermath. | Lore/evidence item, future archive hook. | Marks player saw anomaly; future rumor seed. |

## Events

| Event ID | Trigger | Consequence | Log candidate |
| --- | --- | --- | --- |
| `metro_station_discovered` | Player first enters a station. | Unlocks route list/debug target. | `Открыта станция: {station}.` |
| `metro_token_acquired` | Token bought, traded, stolen or rewarded. | Access update; possible theft relation hit. | `Получен жетон метро: {token}.` |
| `metro_boarded_train` | Player boards selected route. | Transit state begins. | `Посадка на маршрут {route}.` |
| `metro_warning_seen` | Warning sign selected/displayed. | Can reduce "bug feeling"; potential rumor. | `На маршруте замечен признак сбоя: {warning}.` |
| `metro_arrived` | Normal route resolved. | Player exits expected destination. | `Поезд прибыл: {station}.` |
| `metro_wrong_exit` | Route resolves anomaly. | Player exits wrong station/pocket, route error remembered. | `Ошибка маршрута: {from} -> {actual}.` |
| `metro_station_closed_samosbor` | Samosbor affects station. | Route blocked or risk raised. | `Станция {station} закрыта самосбором.` |
| `metro_depot_repaired` | Depot micro-objective done. | Escape route opens, future reward. | `Состав в депо запущен вручную.` |

## Documents And Readables

| ID | Location | Purpose | Text tone |
| --- | --- | --- | --- |
| `note_dispatcher_shift_12` | station office/depot | Teaches that route errors are tracked, not random magic. | Dry duty note with missing station numbers. |
| `poster_token_rules` | station living | Explains tokens and penalties in-world. | Bureaucratic fare rules. |
| `wet_line_schema` | station pipes | Shows three stations and one scratched-out depot. | Practical map with water damage. |
| `red_platform_order` | station red | Indicates cult/ministry conflict over red platform. | Official stamp overwritten by hymn fragment. |
| `depot_repair_log` | depot | Micro-objective hint for escape/repair. | Maintenance checklist, not lore monologue. |
| `passenger_lost_ticket` | train suitcase | Warning source and theft bait. | Human note: wrong date, wrong floor. |

Readable rule: documents may unlock warnings or lower risk, but cannot explain samosbor globally.

## Debug Commands

| Command ID | Purpose | Required output |
| --- | --- | --- |
| `metro.unlockAllStations` | Enables route testing without world travel. | Station ids and route count. |
| `metro.spawnAtStation` | Places player at station by id. | Station id, floor/pocket hook, coordinates. |
| `metro.callTrain` | Starts boarding at current station. | Available routes, departure timer. |
| `metro.forceRoute` | Starts route by id, ignoring token for test. | Route id, from, to, risk. |
| `metro.forceWrongExit` | Forces next arrival to selected wrong exit. | Warning ids and destination. |
| `metro.giveToken` | Adds token/access item. | Token id and inventory result. |
| `metro.closeStation` | Simulates station blocked by samosbor/faction. | Station id and affected routes. |
| `metro.showRisk` | Prints risk breakdown. | Base risk, modifiers, final risk, warning ids. |
| `metro.dumpState` | Prints current metro state/telemetry. | Current phase, route id, seed, timers, destination. |

Debug commands must never become player-facing UI labels. They exist to make implementation falsifiable.

## Content Acceptance

Content is ready when each station has at least one systemic object, each route has an explicit requirement and wrong-exit policy, each wrong exit has warning content, and debug can reproduce all route outcomes. The manifest must remain a bounded MVP: no full metropoliten, no permanent metroworld faction, no dependency on future numbered floors.

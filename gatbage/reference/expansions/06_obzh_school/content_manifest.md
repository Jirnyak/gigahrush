# Expansion 06 Content Manifest: School MVP

Статус: planning manifest. Содержимое перечисляет будущий minimum playable slice и не является отчетом о реализованных ассетах.

## Content Boundaries

Школа ОБЖ - социальный survival POI, а не новый образовательный этаж. Контент должен работать в одной school area на `LIVING`, использовать существующие типы комнат, предметов, NPC и квестов там, где это возможно, и не требовать изменений root expansion/index до появления кода.

Игровая петля контента: игрок приходит по просьбе Нины или родителя, готовит школу через 2-3 бытовых задачи, получает один micro-perk, переживает тревогу с grouped evacuation, затем получает документированный outcome.

## Rooms

| Room id | Название | Existing room type | Игровая функция | MVP interaction | Risk |
| --- | --- | --- | --- | --- | --- |
| `school_obzh_class` | Кабинет ОБЖ | HALL/ACCOUNTING fallback | Правила, плакаты, старт уроков | Прочитать схему, поговорить с Ниной | Ложная уверенность: схема может устареть после самосбора. |
| `school_workshop` | Кабинет труда | WORKSHOP | Ремонт, простые детали | Принести `parts`/`bandage`/`wrench`, уплотнить дверь | Заклинивание двери при плохом ремонте. |
| `school_radio_club` | Радиокружок | HALL/WORKSHOP fallback | Предвестники, слухи, false alarm check | Настроить радио Паши | Тихая тревога, ложный сигнал, связь с будущим метро/556. |
| `school_gym_shelter` | Спортзал-убежище | HALL | Target room эвакуации | Закрыть группу внутри, проверить аварийный ящик | Большое помещение, трудно контролировать двери. |
| `school_canteen` | Столовая | KITCHEN | Пайки, конфликт снабжения | Взять/пополнить emergency ration | Мокрый вариант блокирует короткий route. |
| `school_teacher_room` | Учительская | ACCOUNTING | Ключи, документы, моральные решения | Получить журнал/ключ/приказ | Бюрократический конфликт с родителем/ликвидатором. |
| `school_inventory_basement` | Подвал инвентаря | STORAGE | Лут и опасность | Достать фильтры/детали/противогаз | Монстр, туман, закрытая дверь. |

Room implementation note: если enum раздувается, использовать room names/tags в future data layer, а не добавлять `RoomType.SCHOOL_*` для каждой комнаты.

## Key NPC

| NPC id | Имя | Faction | Occupation fallback | Роль в MVP | Gameplay state |
| --- | --- | --- | --- | --- | --- |
| `school_nina_obzh` | Нина ОБЖ | CITIZEN/SCIENTIST fallback | DIRECTOR or SCIENTIST | Учитель, дает prep chain, снижает panic если жива и рядом | Anchor для группы, remembers outcome. |
| `school_pasha_radio` | Паша Радиокружок | CITIZEN | CHILD | Ученик, радио, предвестники | Единственный индивидуальный child NPC в MVP. |
| `school_melikhov_zavhoz` | Завхоз Мелихов | CITIZEN | MECHANIC | Ключи, детали, дверной ремонт | Может открыть подвал или ускорить door fix. |
| `school_parent_queue` | Мать из очереди | CITIZEN | HOUSEWIFE | Конфликт: забрать ребенка до приказа или ждать | Может снизить дисциплину или дать reward. |
| `school_liquidator_instructor` | Ликвидатор-инструктор | LIQUIDATOR | HUNTER/MECHANIC fallback | Переводит учения в зачистку, проверяет документы | Optional escalation после первого успеха. |

NPC tone constraints: дети не являются расходным ресурсом ради шока. Последствия серьезные, но камера держится на ответственности, документах, взрослых решениях и памяти.

## Evacuation Groups

| Group id | Count MVP | Start room | Target room | Leader | Panic baseline | Special rule |
| --- | ---: | --- | --- | --- | ---: | --- |
| `class_5b` | 12 | `school_obzh_class` | `school_gym_shelter` | `school_nina_obzh` | 25 | Core MVP group. |
| `radio_pair` | 2 | `school_radio_club` | `school_gym_shelter` | `school_pasha_radio` | 35 | Middle tier; can detect silent alarm. |
| `canteen_shift` | 8 | `school_canteen` | `school_gym_shelter` | none | 45 | Middle/high; wet route pressure. |
| `basement_leftovers` | 3 | `school_inventory_basement` | `school_gym_shelter` | `school_melikhov_zavhoz` | 55 | High; delayed group with risk. |

MVP ships only `class_5b`. Other groups are reserved content and must remain data-only until the group contract is stable.

## Lessons

| Lesson id | Source room/NPC | Player action | Result |
| --- | --- | --- | --- |
| `lesson_listen_siren` | Нина, кабинет ОБЖ | Проверить схему и пройти к двери | Enables earlier school warning by small fixed offset. |
| `lesson_door_to_self` | Завхоз, кабинет труда | Уплотнить гермодверь using cheap item | Reduces school door interaction delay. |
| `lesson_no_fog_run` | Нина, спортзал | Провести группу без sprint panic | Lowers panic gain near fog. |
| `lesson_ration_circle` | Столовая | Пополнить аварийный ящик | Reduces failure chance for one blocked wait. |
| `lesson_radio_ruler` | Паша, радиокружок | Настроить радио | Improves silent/false alarm recognition. |

Lesson acceptance: lesson completion must be visible through quest/log/perk state and must influence one later school event. Pure lore-only lessons are notes, not mechanics.

## Micro-Perks

| Perk id | Player-facing name | Effect | Boundaries |
| --- | --- | --- | --- |
| `perk_siren_margin` | Слушай сирену | School warning appears a few seconds earlier when event has warning. | No global samosbor prediction in MVP. |
| `perk_fast_hermetic` | Дверь на себя | Interaction time with school marked hermetic doors reduced by small fixed percent. | Does not unlock locked doors. |
| `perk_fog_discipline` | Не беги в туман | Panic gain for active school group reduced near fog route. | Does not reduce player damage/fog rules. |
| `perk_ration_wait` | Кружок пайки | One blocked wait consumes ration to prevent panic spike. | Requires stocked emergency box. |
| `perk_radio_filter` | Радиолинейка | Better chance to classify false/silent alarm in school event. | Does not reveal all variants. |

Perks are tiny levers. Any perk that adds combat damage, permanent speed, global immunity or guaranteed prediction is rejected for this expansion.

## Documents And Notes

| Document id | Name | Function |
| --- | --- | --- |
| `doc_school_evac_scheme` | Схема эвакуации 5-Б | Shows route nodes and first prep objective. |
| `doc_hermodoor_journal` | Журнал гермодверей школы | Records repaired/failed doors and outcome. |
| `doc_false_alarm_act` | Акт о неподтвердившейся тревоге | Consequence for false alarm; can affect parent/administration dialogue. |
| `doc_missing_lesson_page` | Страница урока, которой нет | Lore hook for silent/memory variants; no MVP mechanics. |
| `doc_parent_complaint` | Жалоба матери из очереди | Social consequence after partial/fail outcome. |
| `doc_liquidator_drill_order` | Приказ о тренировке Л-4 | Opens optional liquidator escalation. |

Documents should use existing notes/log systems when possible. They should not require a new document UI for MVP.

## Items And Containers

| Object id | Existing item fallback | Use |
| --- | --- | --- |
| `school_chalk` | `note` or low-value misc | Fetch target for lesson; no new system needed. |
| `school_door_gasket` | `bandage`/`parts` fallback | Door prep material. |
| `school_radio_part` | `battery`/`energy_cell` fallback | Radio lesson material. |
| `school_emergency_ration` | `bread`/`water` fallback | Consumed to prevent panic spike. |
| `school_filter_mask` | `filter`/`medkit` fallback | Basement reward or future wet/electric protection. |
| `school_emergency_box` | Future container or static room feature | Stores rations; public during school event. |

If containers are not implemented, emergency box behavior is a room flag with fixed stock count. No floor litter flood.

## Debug Commands

| Command id | Label | Action | Required output |
| --- | --- | --- | --- |
| `debug_school_start_drill` | Школа: учебная тревога | Starts classic evacuation event without global samosbor. | Active groups, route, panic. |
| `debug_school_start_silent` | Школа: тихая тревога | Starts silent warning variant. | Warning delay, radio result. |
| `debug_school_start_false` | Школа: ложная тревога | Starts false alarm, no fog/global capture. | Outcome and document id. |
| `debug_school_dump_groups` | Школа: группы | Prints group states and last outcome. | group id/count/panic/routeState. |
| `debug_school_block_next_door` | Школа: клин двери | Marks next route door blocked for test. | door id/room segment. |
| `debug_school_reset_event` | Школа: сброс | Clears active evacuation event. | Reset confirmation, no orphan group. |

Debug acceptance: commands must not require hidden knowledge from the developer console. The debug panel should show enough state to reproduce an outcome.

## DOD Summary

MVP content is done when one school POI exists, one prep chain grants one working perk, one evacuation group can be sealed or fail, two alarm variants change conditions, and one document or dialogue records the result. Anything outside that is reserved, not partial success.


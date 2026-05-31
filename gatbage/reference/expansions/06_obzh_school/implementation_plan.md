# Expansion 06 Implementation Plan: Школа ОБЖ имени гермодвери

Статус: planning artifact for future implementation. Этот документ не утверждает наличие кода. Он задает phased MVP для `gatbage/reference/expansions/06_obzh_school/expansion.md` и не требует нового `FloorLevel` до доказанного room/pocket slice.

## Scope Lock

Playable MVP размещается как один крупный `LIVING` POI или school pocket, созданный через существующий zone-content подход. Школа не заменяет стартовый актовый зал, Ольгу, Барни или Якова. Она включается после базового обучения и проверяет более тяжелую петлю: подготовка эвакуации, тревога, маршрут, закрытие гермодвери, последствия в памяти NPC и документе.

Запрещенный объем для MVP: индивидуальная симуляция каждого ребенка, новый большой этаж, переписывание A-Life FSM, новый глобальный pathfinder, новая save-схема без миграции, постоянная симуляция школы вне активного события.

## Relevant Mandates Used

Локальный каталог `.agents-skills/` в репозитории не найден. Для этого документа применены мандаты из переданного пользователем блока и доступных проектных документов:

| Mandate | Применение к Expansion 06 |
| --- | --- |
| Domain boundary | Изменяются только документы Expansion 06 и агентские status/log/rationale. |
| Simultaneous execution | Контракт идет через будущие интерфейсы, events и bounded data, без прямых зависимостей на чужой незавершенный код. |
| Cinematic Cheat Protocol | Толпа детей отображается агрегатами, звуком и спрайтовыми кластерами, а не физической crowd simulation. |
| Frame Time Dictatorship | Активная эвакуация тикает редко и ограничивает число групп; все дорогое вынесено в debug/событие. |
| Math LOD | Low, middle, high, ultra различаются логикой и визуальным слоем без low/ultra дихотомии. |
| Black Box | Для будущей реализации требуется фиксированный circular buffer последних 300 кадров события эвакуации. |
| Evidence-based docs | README трактуется как факт текущей игры, expansion/desdoc как план. |

## Phase 0: Data Contract And Placement Gate

Цель фазы - добавить только минимальный проектный каркас перед кодом: school id, room tags, evacuation group ids, lesson ids, perk ids, debug command ids. Реализация должна выбрать одну существующую генераторную точку: `src/gen/living/zone_content.ts` предпочтительнее нового floor, потому что индекс expansion запрещает большой этаж до MVP.

School POI должен занимать ограниченную прямоугольную область, не перетирать `aptMask` и проходить правило стен: функциональные комнаты полностью окружены стенами, двери одноклеточные, внешний маршрут подключен к лабиринту одной или двумя контролируемыми точками. Если zone-content слот занят другим агентом, школа должна быть параметризована как standalone generator function и подключаться позже через реестр, без прямого импорта в чужой незавершенный модуль.

Definition of Done для фазы: есть перечисленные ids, карта комнат, список эвакуационных узлов и список событий, которые будущий код сможет публиковать. Проверка: документированный маршрут от кабинета ОБЖ до спортзала-убежища имеет не больше трех дверных решений и минимум одну блокировку.

## Phase 1: School POI MVP

MVP-комнаты: кабинет ОБЖ, кабинет труда, радиокружок, спортзал-убежище, столовая, учительская, подвал инвентаря. Комнаты должны быть маленькими и читаемыми в raycaster: 7x7 до 13x11, без декоративной гигантомании. Визуальный язык дешевый: парты, плакаты, шкафы, лампы, спортзал как широкая arena, подвал как рискованный loot pocket.

Генерация должна использовать существующие клетки, features и procedural textures. Новые текстуры допустимы только если уже есть pipeline для автоиндексации; иначе плакаты и журналы идут как notes/items, а визуал собирается из столов, полок, ламп и дверей. Гермодверь школы должна быть обычной системной дверью с отмеченным evacuation role, а не особым физическим объектом.

Definition of Done: игрок может войти в школу, найти Нину ОБЖ, увидеть безопасный маршрут до спортзала и получить prep-задачу. Проверки: `repairRoomWalls()` не оставляет дыр, миникарта различает комнаты по существующим room types, school POI не ломает стартовый атриум.

## Phase 2: Lessons And Micro-Perks

Уроки - это не отдельная RPG-школа. Каждый урок дает один маленький micro-perk через короткое действие: закрыть дверь по инструкции, принести мел/бинт/детали, настроить радио, заполнить журнал, проверить аварийный ящик. Перки должны быть ограничены числом и эффектом, чтобы не превращать игрока в спасателя-героя.

Первый playable chain:

| Step | Игровое действие | Результат |
| --- | --- | --- |
| Prep 1 | Нина ОБЖ просит проверить схему эвакуации в кабинете. | Открыт lesson `listen_siren`; HUD предупреждение тревоги появляется чуть раньше только в school event. |
| Prep 2 | Завхоз просит детали/бинт для уплотнения двери. | Открыт `door_to_self`; interaction window с school hermetic door короче. |
| Prep 3 | Паша Радиокружок просит настроить радио. | Открыт `radio_ruler`; тихая или ложная тревога распознается с шансом выше. |

Definition of Done: минимум три micro-perks определены, один гарантированно влияет на evacuation event, остальные видны через debug/status или диалог. Проверки: перк не меняет глобальный баланс вне школы до отдельного design review; отказ от урока не ломает событие, а ухудшает исход.

## Phase 3: Group Evacuation Event

Эвакуация запускается как локальное событие школы: учебная тревога, ложная тревога или настоящий school-linked самосбор. В MVP одна группа детей и один teacher anchor. Группа имеет `count`, `panic`, `currentRoomId`, `targetRoomId`, `routeState`, `lastTick`, `leaderEntityId`. Она не состоит из N pathfinding NPC.

Tick идет только пока событие активно. Базовая частота: 4 Hz для low/middle и до 8 Hz для high/ultra, но только для агрегатов. Pathfinding не считается каждый tick: маршрут выбирается из заранее подготовленных route segments между school rooms. Если дверь заблокирована, group state становится `blocked`, а игрок получает понятное действие: открыть, уплотнить, выбрать запасной маршрут, успокоить через Нину или радио.

Событие должно иметь проверяемую петлю: input -> risk -> decision -> result -> consequence -> debug visibility. Пример: сирена началась, группа ждет в кабинете, короткий маршрут проходит через мокрую столовую, длинный маршрут через учительскую, игрок выбирает, panic растет, дверь закрывается, журнал фиксирует сколько дошло и почему.

Definition of Done: одна группа проходит states `waiting`, `moving`, `blocked`, `sealed`; игрок может улучшить или ухудшить исход; outcome попадает в журнал/диалог/документ. Проверки: event можно запустить debug-командой, повторный запуск корректно сбрасывает временное состояние, отсутствие игрока рядом завершает событие cheap fallback-результатом.

## Phase 4: Samosbor Variants And Consequences

MVP поддерживает два варианта: classic и silent/false. Classic проверяет базовую эвакуацию, silent снижает предупреждение и повышает ценность радио. Middle build добавляет wet/electric как условия, но не симулирует жидкость или электричество: мокрый вариант блокирует room segment и добавляет статус риска, электрический гасит lights/radio flags.

Последствия обязаны быть системными, а не только текстовыми. Нина, Паша, Завхоз и родитель меняют реплики. Журнал эвакуации получает запись. Отношение группы к игроку меняется. Возможен документ: акт учебной тревоги, акт ложной тревоги, лист пропавших, схема с исправлениями. Если общий event bus доступен, публикуются `school_evac_started`, `school_group_sealed`, `school_evac_failed`, `school_lesson_completed`.

Definition of Done: минимум два варианта меняют условия, outcome имеет три градации (`clean`, `partial`, `failed`) и виден в разговоре/журнале/debug. Проверки: ложная тревога не запускает глобальный самосбор, настоящий самосбор не отключается школой, school event не меняет глобальную таймерную модель без явного hook.

## Phase 5: Debug, Telemetry, And Black Box

Debug не является опциональным. Минимальные команды: старт учебной тревоги, старт тихой тревоги, старт ложной тревоги, вывести состояние групп, заблокировать следующую school door, сбросить school event. Для будущего кода нужен fixed-size circular buffer на последние 300 кадров активной эвакуации: frame/time, variant, group ids, route states, panic, counts, door flags, player room, outcome hash.

Dump path для аварий будущей реализации: `gatbage/history/agent_logs/Dump_EXP06_SCHOOL.bin`. Документы не создают bin-файл заранее, но контракт требует dump при NaN, невозможном room id, отрицательном count или routeState, который не может завершиться.

Definition of Done: debug показывает текущие группы и последний outcome; telemetry пишет bounded entries без GC в hot path; crash dump имеет enough state для ответа "какая дверь, какая группа, какой tick".

## Math LOD

| Tier | Логика | Визуал | Цель бюджета |
| --- | --- | --- | --- |
| Low | 1 группа, 1 основной route, panic как целое 0-100, tick 4 Hz, no dynamic re-path. | 1-2 cluster sprites, HUD text, минимум звука. | < 50 us/event tick, ноль работы вне события. |
| Middle | 2-3 группы, precomputed alternate route, door blockage, teacher modifier. | Разные school props, короткие barks, map marker. | < 100 us/event tick, no per-child AI. |
| High | Parent/faction reactions, radio false-positive logic, event bus consequences. | Толпа через sprite clusters, сирена/радио layers, room lighting flags. | < 200 us/event tick during event only. |
| Ultra | Те же агрегаты, больше cosmetic traces: плакаты, журнал, звуки за дверью, post-event scene. | Визуальный overkill без новой физики: decals/text notes/soundscape. | Логика не растет пропорционально визуалу. |

## Risks

Главный технический риск - внедрить crowd simulation под видом эвакуации. Это запрещено для MVP: ребенок как индивидуальный NPC допускается только для ключевого Паши, остальные являются группой. Второй риск - школьный блок станет tutorial и ослабит horror. Контрмера: запускать его после базового обучения, делать тревогу нестабильной и последствия бюрократическими. Третий риск - зависимость от будущих expansion-систем. Контрмера: все связи с архивом, теплом, рынком, больницей и метро оформлять как optional hooks/events.

## Test And Verification Matrix

| Area | Проверка |
| --- | --- |
| Build | После будущих code changes: `npm run build`. Для текущей docs-only работы build не обязан менять результат. |
| Generation | School POI не пересекает `aptMask`, имеет связный вход и sealed rooms. |
| Evacuation | Debug запускает event; group reaches `sealed` or documented failure. |
| Variants | Classic and silent/false variants produce different warning and route pressure. |
| Performance | Active event tick bounded; no allocations in group loop except event publication object if existing bus requires it. |
| Save/load | MVP can reconstruct inactive school state from simple flags or degrade to no active event after load. |
| UX | Игрок видит риск, действие и последствие без чтения design docs. |


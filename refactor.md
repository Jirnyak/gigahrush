# Единая система этажей: Четные и Нечетные

Вся кодовая база перешла на единую систему этажей. Больше нет искусственного разделения на старые "story" и "design" этажи, все они объединены в единую архитектуру.

## 1. Единые механики (applyFloorPopulationField и др.)
Функция `applyFloorPopulationField` и прочие универсальные функции расчета сложности (по `abs(Z)`) **затрагивают всех**.
Математическая прогрессия является единой: около 0 почти нет монстров, только низкие уровни врагов; на 50-х уровнях — максимальные уровни и только монстры. Эта базовая глобальная логика едина и больше не должна перекрываться хардкодом в стиле "здесь 0 жителей и 300 монстров".

## 2. Архитектурное разделение: Четные и Нечетные этажи

### Четные этажи (Z % 2 === 0)
- Четные этажи уходят в пакет каждого этажа по его номеру для **детальной генерации**.
- Геометрия, уникальные механики, зоны, квесты и сюжетное наполнение (например, квартиры, министерство, ад) генерируются через свои пакеты (в `src/gen/<имя>/index.ts`).
- Но при этом базовое заселение и расчет лимитов всё равно подчиняются единым законам (кривой `abs(Z)`), если только пакет не спавнит специфичных для него NPC/боссов. От ручного массового спавна дефолтных монстров и граждан в пакетах мы избавились.

### Нечетные этажи (Z % 2 !== 0)
- Нечетные этажи собираются процедурно, рандом-комбинаторно.
- Они формируются из кусочков (комнат, модулей) и процедурных аномалий, не привязываясь к конкретному пакету детальной генерации, но при этом подчиняясь тем же единым законам распределения популяции и сложности.

## 3. Единая система NPC ID (Сюжетные 1..N и процедурный хвост) [Case Study]

Синхронизирована глобальная система идентификации NPC и устранена проблема сдвига в Demos UI:
- Старые строковые ID (`'alife:boris'`) полностью выпилены. Везде используется числовой `plotNpcId`.
- **1-indexed Plot IDs:** Счетчик `nextPlotNpcId` (`src/data/npc_packages.ts`) строго стартует с `1`. Все сюжетные NPC получают стабильные числовые ID от `1` до `N` (`getPlotNpcCount()`).
- **Двухпроходная генерация `AlifeState` (`buildAlifeStateFromPopulationPlan`):**
  1. **Pass 1 (Жесткая аллокация слотов):** Сюжетные персонажи размещаются строго в ячейку `alife.npcs[plotNpcId - 1]` с `record.id = plotNpcId`. Благодаря этому гарантируется тождество `alifeId === plotNpcId` для всех сюжетных персонажей от `1` до `N`, и исключается смещение профилей при обходе бакетов.
  2. **Pass 2 (Процедурный хвост):** Обычные процедурные жители получают ID от `N+1` и заполняют оставшийся массив до `boundedTotal`.
- **Контракт:** Любой ID `<= N` однозначно указывает на сюжетного персонажа, запись которого всегда доступна за `O(1)` по индексу `alife.npcs[id - 1]`.

## Итог
- Отказ от ручных хардкодных спавнеров (`placeMonsters` / `spawnFamilies`) в индексных файлах этажей.
- Вместо этого используются конфигурации в `DESIGN_FLOOR_POPULATION_OVERRIDES` для задания базовой плотности (`npcMult`, `monsterMult`) и фракций, чтобы очертить идею каждого четного этажа.
- Единая математическая модель сложности (уровней и плотности мобов) для всей игры как база.
- Четные = уникальный дизайн и геометрия (из пакета) + конфигурация плотности/фракций.
- Нечетные = процедурная сборка.

## 3. Точечное заселение (Моби, НПЦ, Фракции) на Четных (Дизайн) этажах
Глобальная логика `applyFloorPopulationField` расселяет общую (процедурную) «серую массу» (гражданских и базовых монстров) по всему Гигахрущу.
**Однако**, если четный этаж (Дизайн-пакет) требует специфических существ (например, уникальных боссов, спавна определенной фракции, квестовых НПЦ или конкретного типа монстров, привязанных к его лору), то **это заселение должно происходить внутри самого пакета генерации этажа** (в `src/gen/<имя>/index.ts`).

- Дизайн-пакет имеет полный доступ к добавленным комнатам и зонам.
- Скрипт пакета спавнит уникальных сущностей напрямую в свои комнаты после генерации геометрии, но до (или после) прохода глобального поля `applyFloorPopulationField`.
- Таким образом, мы сохраняем единую математику плотности, но при этом даем каждому Дизайн-этажу возможность инжектить свой "авторский" контент прямо в свой локальный скрипт, не засоряя глобальные файлы хардкодом.

### 4. Критические регрессии после рефакторинга Z-координат (ИСПРАВЛЕНО И ЗАВЕРШЕНО)
Последние коммиты по унификации Z-координат внесли сломы в генерацию и системы. Следующие пункты были успешно исправлены и покрыты тестами:

### 4.1 Ошибочное сравнение Z-координаты и Enum'а биома (FloorLevel)
При замене свойства `state.currentFloor` на `state.currentZ` были оставлены старые проверки `if (state.currentZ === FloorLevel.XYZ)`. 
`FloorLevel` — это константа биома (например, `MINISTRY = 0`, `MAINTENANCE = 3`), а `currentZ` — это физическая высота этажа (например, 14, -10). Из-за этого контентные скрипты этажей почти никогда не срабатывают на своих высотах.
**Где исправлять (заменить на проверку реального биома/роли маршрута):**
- [src/main.ts](file:///Users/jirnyak/Mirror/gigahrush/src/main.ts#L2516) (и строки 3469, 4409, 4416, 9641, 9814, 9815)
- [src/systems/metro.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/metro.ts#L141)
- [src/systems/pneumomail.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/pneumomail.ts#L374)
- [src/systems/seroburmaline.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/seroburmaline.ts#L214) (и строка 313)
- [src/gen/maintenance/remontnik_bez_smeny.ts](file:///Users/jirnyak/Mirror/gigahrush/src/gen/maintenance/remontnik_bez_smeny.ts#L356)
- [src/gen/maintenance/paritel_steam_bridge.ts](file:///Users/jirnyak/Mirror/gigahrush/src/gen/maintenance/paritel_steam_bridge.ts#L338) (и строка 375)
- [src/gen/maintenance/betonoed_shortcut.ts](file:///Users/jirnyak/Mirror/gigahrush/src/gen/maintenance/betonoed_shortcut.ts#L410) (и строка 448)
- [src/render/hud.ts](file:///Users/jirnyak/Mirror/gigahrush/src/render/hud.ts#L237)
- [src/gen/living/plombirovshchik.ts](file:///Users/jirnyak/Mirror/gigahrush/src/gen/living/plombirovshchik.ts#L457) (и строка 471)
- [src/gen/ministry/liquidator_archive.ts](file:///Users/jirnyak/Mirror/gigahrush/src/gen/ministry/liquidator_archive.ts#L245)
- [src/gen/ministry/document_gate.ts](file:///Users/jirnyak/Mirror/gigahrush/src/gen/ministry/document_gate.ts#L621) (и строки 671, 690)
- [src/systems/heatline.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/heatline.ts#L283)
- [src/systems/ai/index.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/ai/index.ts#L119)
- [src/systems/samosbor.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/samosbor.ts#L4719)
- [src/systems/contracts.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/contracts.ts#L764)
- [src/systems/noise.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/noise.ts#L520) (и строка 576)
- [src/systems/inventory.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/inventory.ts#L1643) (и строки 1644, 1720, 1721, 1795, 1798, 1823, 1836, 1892)

### 4.2 Сломанный Fallback в procedural_floors.ts
В файле `src/systems/procedural_floors.ts` внутри функции `currentFloorRunEntry()` логика фоллбека для неизвестных Z-координат была жестко захардкожена на `FloorLevel.LIVING`:
**Где исправлять:**
- [src/systems/procedural_floors.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/procedural_floors.ts#L497) (строка 497). Вернуть определение корректного `baseFloor` и `storyFloor` на основе Z (например, через маппинг Z в биомы `zForStoryFloor`, либо передавать правильный контекст, так как хардкод `FloorLevel.LIVING` ломает все остальные этажи без явной specs-записи).

### 4.3 Разрушение баланса популяции в авторских этажах (Design Floors)
Коммит, убравший жесткие лимиты популяции, сломал тесты генерации. Единое динамическое скалирование заливает авторские этажи избыточными NPC.
Например, в тесте `bolnichny_korpus` ([tests/bolnichny-korpus.test.ts](file:///Users/jirnyak/Mirror/gigahrush/tests/bolnichny-korpus.test.ts#L97)) ожидалось `1050` NPC, а генерируется `3390`. Аналогично сломались тесты для `attractor_dvor`, `bank_floor`, `black_market_88`.
**Что делать:**
- Дизайн-этажи должны использовать свои заготовленные лимиты, а не слепо подчиняться единой глобальной формуле скалирования, которая раздувает их бюджет.
- Либо (если это было задумано) нужно актуализировать ассерты в этих тестах.

### 4.4 Нулевые и отрицательные веса в профилях A-Life
Снятие лимитов сломало статические веса для профилей миграции и профессий A-Life.
Падают тесты в [tests/alife-migration-data.test.ts](file:///Users/jirnyak/Mirror/gigahrush/tests/alife-migration-data.test.ts#L85):
- `design:pioneer_camp` и `design:turing_nursery` (ошибка: `occupation weights has non-positive weight`).
- Профили миграции `rest_hide`, `refugee_shift`, `home_return` (та же ошибка на строке 317).
**Что делать:**
- Проверить формулы распределения весов (вероятно, в `src/systems/alife.ts` или данных `src/data/alife_migration_data.ts`), чтобы они не уходили в ноль или отрицательные значения при новом скейлинге (когда базовый кап популяции стал огромным).

**СТАТУС:** Все вышеперечисленные регрессии устранены. Модульные тесты подтверждают стабильность работы систем экономики, торговли, генерации тем, метрополитена и маршрутов миграции A-Life после Z-рефакторинга.

## 5. Задачи для будущего рефакторинга (Выявлены аудитом)

### 5.1 Исторические хардкоды Z-координат (140, 100, 60 и т.д.) [ВЫПОЛНЕНО]
**В чем проблема:** 
Раньше игра использовала `enum FloorLevel`, где этажи были не физическими координатами, а абстрактными идентификаторами тем (Жилые = 60, Квартиры = 100, Министерство = 120, Коллекторы = 140, Мясной низ = 180, Пустота = 220).
При переходе на новую элегантную архитектуру реальных Z-координат (строго от -50 до +50) старые идентификаторы (например, `140`) остались захардкожены в базах данных (контракты, слухи, тесты) и локальных контекстах процедурных генераторов (например, `MaintContentCtx`). 

Поскольку `140` далеко выходит за пределы игрового мира [-50, +50], контракты, отправляющие игрока на Z=140, ведут в никуда, ломая тесты (`expedition-proof`, `monster-bait`, `consequence-residue`).

**Как мы это решили:**
- **Контракты и Слухи (`src/data/contracts.ts`, `src/data/rumors.ts`):** Полностью избавились от старых констант. Заменили ссылки на абстрактные `140` или `100` на реальные координаты флагманских этажей. Например, старые Коллекторы (`140`) теперь маппятся на `z: -14` (`production_belt`), Жилая зона (`60`) на `z: -6` (`obschezhitie_smeny`), Квартиры (`100`) на `z: 2` (`moebius_podezd`).
- **Процедурные генераторы (`src/gen/maintenance/*` и т.д.):** В их локальный контекст прокидывается реальный `z: number` генерируемого этажа, чтобы они больше не хардкодили `140` при создании сущностей.
- **Скрипт миграции:** Написан скрипт (`scratch/replace_legacy_z.js`), который массово вычистил старые Z-строки.
- **Тесты:** Восстановлены и адаптированы все тесты (1799/1799). Никаких TypeError и прочих регрессий из-за несовпадающих Z-координат.


### 5.2 Предвзятость массивов (Array Prefix Bias / Fairness) [ВЫПОЛНЕНО]
Многие системы (например, `src/systems/demos_social.ts`, `demos.ts`) переведены на честный `shuffleWith(rng, array)` вместо жесткого `slice(0, N)`, гарантируя детерминированность без позиционного искажения данных (bias). Тесты актуализированы.

### 5.3 Хрупкие квестовые цели (Quest Target Truth) [ВЫПОЛНЕНО]
В `src/systems/quests.ts` и `npc_interaction_options.ts` использовалось хардкодное сравнение по строкам (например, `room.name === target.roomName`, `npc.name === 'Мастер Арены'`). Это ломало квесты при изменении описаний или локализации. Проверки успешно переведены на уникальные `id` и `defId`.

### 5.4 Mesh pop-in и просадки ФПС (Render vs Entity Query) [ВЫПОЛНЕНО]
В рендеринге `src/render/mesh/scene_collect.ts` использовался тяжелый вызов `queryRadiusCapped()`. Отрисовка 3D-мешей (биллбордов) теперь развязана от динамической итерации сущностей и запекается в кэш тайлов/чанков при сканировании тумана войны (`scanCell`), что существенно повысило производительность.

###**[DONE] 5.5 Легаси ключи `story:*` (искоренение `story`)**  
- Все строковые префиксы и названия файлов со словом `story` заменены на `design` или `plot` в зависимости от контекста. Концепт `story` как тип этажа или кармана полностью ликвидирован, тесты и генераторы переведены на новую конвенцию `Z`.

### [ВЫПОЛНЕНО] 5.6 Единая Числовая ID-система для NPC (Устранение дубликатов)
Перевод сюжетных NPC на общую A-Life ID систему без хардкода строк и констант.
- **Функциональное резервирование:** Создана функция `registerPlotNpc`, которая при объявлении пакета сюжетного NPC автоматически выдает ему инкрементный числовой ID (начиная с 1).
- **Разделение A-Life пула:** При инициализации A-Life пула сюжетные NPC занимают свои законные первые места (от 1 до `N`), а вся процедурная масса генерируется вслед за ними (с `N+1` до 100000). Логика `buildAlifeStateFromPopulationPlan` теперь работает в два прохода (Сначала пробежаться по всем reserved во всех ведрах этажей и выдать им id от 1 до N. Потом пройтись второй раз и забить остаток (хвост) процедурными с id от N+1 до 100 000).
- **Ликвидация строк:** Квесты и логика используют только выданный функцией числовой ID (`npc.plotNpcId`). 
- **Единый спавн:** При генерации этажей используется этот же числовой A-Life ID, устраняя проблему дублирования (когда на этаже сущность имела ID из `nextId.v`, а в пуле другой). Модульные тесты исправлены и адаптированы под числовые проверки.

### 5.7 Восстановление генерации имен и квестовых признаков NPC (Исправлено)
**В чем проблема:** 
При рефакторинге системы идентификации сюжетных NPC (`isPlotNpc`), проверка была переведена со старого `e.id` на `e.alifeId`. Это привело к двум регрессиям:
1. Сюжетные NPC на процедурных этажах (спавнящиеся через `requireSpawnedPlotNpcFromPackage`) перестали опознаваться как сюжетные, так как им не прокидывался `alifeId`. Из-за этого у них пропал статус квестовых (пропали зеленые ромбики) и они перестали выдавать задания.
2. Процедурные NPC, ранее ошибочно классифицируемые как сюжетные (так как их ID на этаже попадал в диапазон от 1 до N), перестали получать имена сюжетных персонажей. Однако из-за отсутствия правильного генератора имен для случайно спавнящихся NPC, система падала на fallback-имя `Житель ${id}`, что выглядело как числовые имена у процедурных NPC.

**Как мы это решили:**
- В функции спавна сюжетных персонажей (`spawnPlotNpcFromPackage`) добавлено явное присвоение `alifeId = getPlotNpcNumericId(plotNpcId)`. Теперь сюжетные персонажи (Ольга, Баринов и др.) вновь корректно получают квесты и зеленые ромбики.
- В функции резервирования и регистрации случайных NPC в A-Life (`arrivalRecordFromEntity`) добавлена полноценная генерация имен через `nameForRecord`, если у сущности не было изначального имени. Теперь процедурные NPC больше не безымянны (и не называются цифрами), а получают осмысленные сгенерированные имена в зависимости от фракции и специализации.

### 5.8 Устранение безымянных процедурных НПЦ (??? / Цель) и склонение фамилий по родам [ВЫПОЛНЕНО]
**В чем проблема:**
1. **Безымянные НПЦ (`???` и «Цель»):** Часть процедурных НПЦ на этажах спавнились напрямую генераторами зон (например, `spawnApartmentFamilies`, сталкеры в аномалиях) сразу с положительным `id` (например, `8738`), но без `alifeId`. При финальной инициализации этажа в `materializeAlifeFloorPopulation` проверка кандидатов `isAmbientNpcCandidate` требовала жесткое условие `(!entity.id || entity.id <= 0)`. Из-за этого уже созданные локальные НПЦ пропускались системой A-Life, не получали `alifeId` и не регистрировались в реестре. В результате UI HUD и сеть Демос не могли найти их запись по `alifeId` и выводили `???` или системное имя «Цель».
2. **Ошибки рода в фамилиях («Вениамин Щукина»):** В генераторе семей `spawnApartmentFamilies` (`src/gen/living/npcs.ts`) общая фамилия семьи (`familyLastName`) сохранялась точно в том виде, в каком она выпала главе семьи. Если главой оказывалась женщина, то мужчины в семье получали женскую форму фамилии без изменения по роду.

**Как мы это решили:**
- Обновлена функция `isAmbientNpcCandidate` и расширен цикл `materializeAlifeFloorPopulation` в `src/systems/alife.ts`: теперь все оставшиеся на этаже обычные НПЦ (включая тех, что заспавнились напрямую с `id > 0`, а также шаблоны с `id <= 0`) гарантированно получают `alifeId` и постоянную запись в A-Life при загрузке этажа.
- Создана функция `adjustLastNameForGender` в `src/data/names.ts` (и экспортирована через `catalog.ts`) для правильного склонения русских фамилий по полу (`-ов/ова`, `-ин/ина`, `-ый/ая` и т.д.). В `spawnApartmentFamilies` общая фамилия теперь автоматически склоняется под пол каждого члена семьи.
- Устранены дублирующиеся свойства `tags` в `src/data/samosbor_variants.ts` (`SamosborAftermathBeatDef`) и официально добавлено поле `floors` в интерфейсы вариантов Самосбора.

### 5.9 Изоляция обучающих комнат от процедурного спавна (Туториал) [ВЫПОЛНЕНО]
**В чем проблема:**
В стартовом туториале (Актовый зал, Столовая, Уборная, Оружейная) регулярно спавнились случайные процедурные путники, монстры и выпадал лишний процедурный лут (например, идолы Чернобога), что ломало обучающий процесс и нарушало задуманный сценарий Ольги Дмитриевны.
Проблема была в том, что генераторы `spawnTravelers`, `sampleNaturalPopulationCells` и спавн идолов ориентировались только на наличие свободного пола (`Cell.FLOOR`), игнорируя то, что эти комнаты являются квестовыми.

**Как мы это решили:**
- В интерфейс `Room` (`src/core/types.ts`) добавлено поле `tags?: string[]`.
- Комнатам стартового блока в `src/gen/living/tutor_room.ts` присвоен тег `['tutorial']`.
- В функции выбора ячеек для процедурного заселения (`isPopulationPlacementCandidateCell` в `src/gen/population_placement.ts`) и в функции спавна случайных путников и лута (`spawnTravelers`, `spawnRoomItems` в `src/gen/living/npcs.ts`) добавлена жесткая проверка: если клетка/комната принадлежит комнате с тегом `'tutorial'`, то она полностью исключается из выборки. Теперь обучающий сегмент гарантированно защищен от непредсказуемого процедурного вмешательства.

## 6. Глубокий системный аудит кодовой базы (Баги, Легаси, Хардкод, Костыли, Дубликаты и Расхождения с документацией)

Проведен полный статический и архитектурный аудит всех слоев проекта (`core/`, `data/`, `gen/`, `systems/`, `render/`, `tests/`). Ниже зафиксирован исчерпывающий перечень всех выявленных нарушений архитектурных контрактов, опасных конструкций и технического долга.

### 6.1 100% Баги и критические нарушения базовой безопасности (Runtime Bugs & Crash Risks)

В `AGENTS.md` и `problems.md` закреплен жесткий архитектурный контракт: **мир — это тор 1024×1024 (`W = 1024`)**, и любое прямое умножение координат (`cy * W + cx` или `y * 1024 + x`) без обращения к `world.idx(cx, cy)` или предварительной нормализации через `world.wrap()` строго запрещено. При выходе float или физических координат за границы это вызывает `RangeError: visual cell index out of range` или `undefined` / `NaN` в логике.

| Файл и строка | Нарушение | Чем грозит (100% баг / риск) |
| :--- | :--- | :--- |
| [npc_fsm.ts:L1049](file:///Users/jirnyak/Mirror/gigahrush/src/systems/ai/npc_fsm.ts#L1049) | `danger: world.dangerField[Math.floor(room.y + room.h/2) * 1024 + Math.floor(room.x + room.w/2)] / 255` | 1. Прямой хардкод `* 1024` вместо `world.idx`.<br>2. Если центр комнаты оказывается у края карты или float-координаты дают выход за `[0, 1023]`, обращение к `dangerField[...]` возвращает `undefined` (или ошибочную ячейку). Вычисление `undefined / 255` даёт **`NaN`**, что приводит к `NaN` в расчете полезности (`scoreNpcUtilityTargetPreference`), поломке FSM и зависанию AI. |
| [main.ts:L1153](file:///Users/jirnyak/Mirror/gigahrush/src/main.ts#L1153) | `const idx = cy * W + cx;` при проверке интеракта с дверью | Прямое умножение вопреки запрету из `problems.md`. Даже если `cx, cy` обернуты выше через `world.wrap()`, ручной пересчет нарушает инкапсуляцию централизованной функции `world.idx(cx, cy)`. |
| [danger_field.ts:L39, L59, L101, L141](file:///Users/jirnyak/Mirror/gigahrush/src/systems/danger_field.ts#L39) | `const row = cy * W;`, `const rowBase = cy * W;`, `const ni = ny * W + nx;` | Системный расчет поля опасности в цикле обходит `world.idx` при переборе соседей. |
| [surface_marks.ts:L490](file:///Users/jirnyak/Mirror/gigahrush/src/systems/surface_marks.ts#L490) | `const ci = ncy * W + ncx;` | При генерации пятен (кровь/слизь) идет прямой пересчет индекса ячейки. |
| [blood_fx.ts:L319](file:///Users/jirnyak/Mirror/gigahrush/src/systems/blood_fx.ts#L319) | `if (world.cells[wy * W + wx] !== Cell.WALL)` | Если разлет частиц крови уходит за край (например, `wy < 0` из-за float-толчка), индекс становится отрицательным (`-125`), что приводит к `undefined !== Cell.WALL` и тихой ошибке позиционирования декалей или падению в строгих проверках. |
| [breach_charge.ts:L127](file:///Users/jirnyak/Mirror/gigahrush/src/systems/breach_charge.ts#L127) | `const idx = ty * W + tx;` | Взрыв пробивающего заряда использует ручное умножение при проверке целевых клеток. |
| [dialogue.ts:L51-L54](file:///Users/jirnyak/Mirror/gigahrush/src/systems/dialogue.ts#L51-L54) | `performance.now() / 1000` / `Date.now() / 1000` в `performanceNowSeconds()` | Диалоговая система и марковские тайм-ауты используют реальное время стенных часов в JS-хипе вместо симуляционного `world.time`. При паузе вкладки (когда `world.time` стоит на месте) диалоги продолжают истекать по реальным секундам, вызывая рассинхрон состояния. |

### 6.2 Легаси, Хардкод и Костыли (Legacy, Hardcode & Type Safety Crutches)

#### A. Массовый обход типизации (`as any`) в генераторах дизайн-этажей
Во всех модулях децентрализованных дизайн-этажей типизация интерфейса генератора сломана и маскируется костылем `as any`.
- **Список файлов, где используется `applyDesignFloorPopulationField(generation as any, ...)` и `return { ...generation, isDecentralized: true } as any;`:**
  - [antenna_court/index.ts:L124-L125](file:///Users/jirnyak/Mirror/gigahrush/src/gen/antenna_court/index.ts#L124-L125)
  - [registry_morgue/index.ts:L268](file:///Users/jirnyak/Mirror/gigahrush/src/gen/registry_morgue/index.ts#L268)
  - [kvartiry/index.ts:L482](file:///Users/jirnyak/Mirror/gigahrush/src/gen/kvartiry/index.ts#L482)
  - [chthonic_attic/index.ts:L158](file:///Users/jirnyak/Mirror/gigahrush/src/gen/chthonic_attic/index.ts#L158)
  - [ministry/index.ts:L593](file:///Users/jirnyak/Mirror/gigahrush/src/gen/ministry/index.ts#L593)
  - [oranzhereya_betona/index.ts:L58](file:///Users/jirnyak/Mirror/gigahrush/src/gen/oranzhereya_betona/index.ts#L58)
  - [raionsovet_archive/index.ts:L166](file:///Users/jirnyak/Mirror/gigahrush/src/gen/raionsovet_archive/index.ts#L166)
  - [attractor_dvor/index.ts:L84](file:///Users/jirnyak/Mirror/gigahrush/src/gen/attractor_dvor/index.ts#L84)
  - [hell/index.ts:L56](file:///Users/jirnyak/Mirror/gigahrush/src/gen/hell/index.ts#L56)
  - [pioneer_camp/index.ts:L116](file:///Users/jirnyak/Mirror/gigahrush/src/gen/pioneer_camp/index.ts#L116)
- **Причина костыля:** Интерфейс `DesignFloorGeneration` и ожидания `applyDesignFloorPopulationField` не согласованы между собой (отсутствуют или требуют необязательные поля, в частности `isDecentralized`), из-за чего проверка типов `tsc` была отключена через `as any` для 100% авторских этажей.

#### B. Костыли `as any` в определениях монстров и сущностей
- [sculpture.ts:L16](file:///Users/jirnyak/Mirror/gigahrush/src/entities/sculpture.ts#L16): `aiFlags: ['weepingAngel' as any], // We will add 'weepingAngel' to MonsterAIFlag in monster.ts`
- [gnome.ts:L15](file:///Users/jirnyak/Mirror/gigahrush/src/entities/gnome.ts#L15): `aiFlags: ['melee' as any], // We use 'as any' since 'melee' is not in MonsterAIFlag type yet`
- **Причина костыля:** Флаги `weepingAngel` и `melee` не были добавлены в строгий union-тип `MonsterAIFlag` в `src/entities/monster.ts`.

#### C. Костыли `as any` в анимациях
- [auto.ts:L16, L20, L29](file:///Users/jirnyak/Mirror/gigahrush/src/render/animations/defs/auto.ts#L16): `.map(m => (m.type === 'monster_kind' ? (m as any).monsterKind : null))` и `getGeneratedAnimationFramePack(packId as any)` — приведение `as any` вместо корректного использования discriminated union.

#### D. Нарушение детерминизма в `net_sphere.ts`
- [net_sphere.ts:L697](file:///Users/jirnyak/Mirror/gigahrush/src/systems/net_sphere.ts#L697): `id: Date.now() + Math.random()`. Использование некриптографического `Math.random()` без документирующего комментария (вопреки правилам `AGENTS.md`).

#### E. Файлы-заглушки (`STUB = true`)
В проекте присутствуют пустые файлы-призраки, оставленные после параллельных генераций агентов (`export const STUB = true; // Stub file created for parallel Jules agents`), которые загромождают структуру и обманывают при поиске модулей:
- [stalker_hunter.ts](file:///Users/jirnyak/Mirror/gigahrush/src/entities/stalker_hunter.ts)
- [barks.ts](file:///Users/jirnyak/Mirror/gigahrush/src/data/barks.ts)
- [outskirts/index.ts](file:///Users/jirnyak/Mirror/gigahrush/src/gen/outskirts/index.ts)
- [factions_war.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/factions_war.ts)
- [companion.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/companion.ts)
- [sound_propagation.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/sound_propagation.ts)
- [achievements.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/achievements.ts)

#### F. Костыль фолбэк-позиций в `shared.ts`
- [shared.ts:L141-L344](file:///Users/jirnyak/Mirror/gigahrush/src/gen/shared.ts#L141-L344): Сосредоточено огромное количество переплетений проверок и фолбэк-стратегий (`fallback_any_lift`, `fallback_same_xy`, `fallback_near_generator_spawn` и т.д.) для спавна, если геометрия этажа оказалась заблокирована.

### 6.3 Дубликаты систем и механик (System Duplications)

1. **Два параллельных способа позиционирования в A-Life (`floorKey` vs `z`):**
   В коде параллельно сосуществуют строковые ключи этажей (`floorKey`, например `story:living` / `design:ministry`) и точные числовые координаты `Z`. Это зафиксировано в `problems.md` как *NPC Location / floorKey Spaghetti*. Разные системы пытаются парсить префиксы или синхронизировать строковый ключ с числом `Z`, что усложняет Demos UI и планы миграции.
2. **Дублирование логики поиска ближайшей комнаты (`nearestRoomByName` / `nearestRoomOfType`):**
   - [quests.ts:L1548-L1551, L1668-L1671](file:///Users/jirnyak/Mirror/gigahrush/src/systems/quests.ts#L1548): Дублируются блоки проверок `(step as any).targetRoomType !== undefined` и ручного ветвления поиска комнаты вместо вызова единого хелпера из `shared.ts`.
3. **Разрозненная очистка чисел в `banking.ts` vs глобальная нормализация:**
   - [banking.ts:L31-L41](file:///Users/jirnyak/Mirror/gigahrush/src/systems/banking.ts#L31-L41): Написаны локальные велосипеды `cleanNumber`, `cleanMoney`, `cleanTime`, дублирующие общие утилиты безопасного парсинга и валидации из `core/`.

### 6.4 Расхождение кода и документации (Code vs Docs Discrepancies)

В ходе сверки реального состояния кода с центральным документом проблем (`problems.md`) выявлено **критическое расхождение — документация отстает от уже исправленного кода (и при этом не фиксирует активные баги)**:

1. **Устаревший пункт про `Math.random()` в генераторах (`problems.md` L47):**
   В таблице активных проблем `problems.md` утверждается, что `generateFloor()` и подмодули внутри генераторов (`procedural_screens.ts`, living content, hell content, maintenance content, `admin_common.ts`) используют прямой `Math.random()` вместо seeded RNG.
   **Фактическое состояние в коде:** Поиск по директории `src/gen/` на предмет `Math.random()` вернул **0 результатов**. Все генераторы успешно переведены на детерминированный `seededRandom` / `rng()`. Пункт в `problems.md` устарел и должен быть закрыт.
2. **Устаревший пункт про регрессии Z-координат (`problems.md` L48):**
   В `problems.md` указано, что при замене `floor` на `z` в параметры передаются строки, из-за чего возникает `z = NaN` и краш `dangerBias` на `undefined`.
   **Фактическое состояние в коде:** Запуск `npm run check:readonly` (1800 юнит-тестов и полный аудит контента) проходит без единого `NaN` или `TypeError`. Все тесты и вызовы передают строгие числа `z`. Пункт в `problems.md` устарел.
3. **Неуказанная проблема сырых индексов (`* W`) в активных системах:**
   В `problems.md` (раздел «Запрещенные классы ошибок -> Raw Coordinate Array Indexing») строго написано, что `cy * W + cx` запрещено. Но документ не указывает, что прямо сейчас в `main.ts`, `danger_field.ts`, `surface_marks.ts` и `npc_fsm.ts` висят активные нарушения этого правила.

### 6.5 Что точно можно 100% улучшить (Чеклист для последующего рефакторинга)

1. **Искоренить сырые пересчеты индексов (`* W`, `* 1024`) в горячих путях:**
   - Заменить `cy * W + cx` на `world.idx(cx, cy)` в [main.ts:L1153](file:///Users/jirnyak/Mirror/gigahrush/src/main.ts#L1153), [danger_field.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/danger_field.ts) и [surface_marks.ts](file:///Users/jirnyak/Mirror/gigahrush/src/systems/surface_marks.ts).
   - Исправить критический баг/потенциальный `NaN` в [npc_fsm.ts:L1049](file:///Users/jirnyak/Mirror/gigahrush/src/systems/ai/npc_fsm.ts#L1049) (`world.dangerField[...] / 255`), завернув координаты центра комнаты в безопасный `world.idx()`.
2. **Очистить костыли `as any` в типизации генераторов:**
   - Выровнять интерфейс `DesignFloorGeneration` с тем, что возвращают генераторы (`isDecentralized: true`), и с требованиями `applyDesignFloorPopulationField`. Это позволит удалить десятки конструкций `as any` из всех файлов `src/gen/*/index.ts`.
   - Добавить недостающие флаги `'weepingAngel'` и `'melee'` в enum/тип `MonsterAIFlag` в `src/entities/monster.ts`, убрав `as any` из `sculpture.ts` и `gnome.ts`.
3. **Удалить пустые файлы-заглушки (`STUB = true`):**
   - Удалить или превратить в полноценные модули файлы-призраки (`stalker_hunter.ts`, `barks.ts`, `factions_war.ts`, `companion.ts`, `sound_propagation.ts`, `achievements.ts`, `outskirts/index.ts`).
4. **Актуализировать документацию (`problems.md`):**
   - Перенести решенные пункты (*Generation non-determinism (`Math.random`)* и *Blind Z-coordinate refactoring regressions*) из таблицы активных проблем в закрытые, и добавить в активные задачи устранение оставшихся сырых индексов в `systems/`.


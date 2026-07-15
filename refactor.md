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

## 4. Критические регрессии после рефакторинга Z-координат (ИСПРАВЛЕНО)
Последние коммиты по унификации Z-координат внесли сломы в генерацию и системы. Следующие пункты были успешно исправлены:

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

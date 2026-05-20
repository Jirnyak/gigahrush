# plan_1: политика сохранений и legacy

## Цель

Подготовить проект к новой политике: legacy-системы и совместимость старых сохранений не являются обязательством. При breaking change формы сейва сборка должна явно отрезать старые сейвы, а не тащить миграции ради прошлых dev-состояний.

Это не значит удалить всю защиту от битого `localStorage`. Нужна граница:

- текущая версия сейва должна безопасно санитизироваться;
- старые/безверсийные сейвы должны отклоняться;
- при изменении shape повышается `SAVE_SHAPE_VERSION`;
- docs и тесты фиксируют отказ старой версии.

## Текущее состояние кода

Главные save/load точки:

- `src/systems/save_runtime.ts`: `SAVE_SHAPE_VERSION = 2`, `saveShapeVersionSupported()` сейчас принимает любой `version <= SAVE_SHAPE_VERSION`, а отсутствие версии считается `0`.
- `src/main.ts`: `loadGame()` и большой набор `normalize*` функций восстанавливают старые/частичные секции через fallback.
- `src/systems/procedural_floors.ts`: `floorRunSaveHasRestorableRoute()`, `setFloorRunState()`, `floorRunStateForSave()` восстанавливают маршрут.
- `src/systems/floor_instances.ts`: нормализация номерных лифтов и intended route.
- `src/systems/net_terminal_gen.ts`: `normalizeNetTerminalGenState()` пересчитывает цель по route seed.
- `src/systems/map_editor.ts`: нормализация текущих floor patches.
- `src/systems/containers.ts`: `restoreValidContainers()` фильтрует сохраненные контейнеры под текущий мир.
- `src/systems/production.ts`, `economy.ts`, `banking.ts`, `stock_market.ts`, `events.ts`, `lift_arachna.ts`: секционные `normalize*State` / `*ForSave`.
- `src/systems/save_payload.ts`: альтернативный builder/summary, по текущему `rg` не импортируется из runtime.

## Новое правило документации

`README.md` должен явно говорить:

- save хранится в `localStorage` под `gigahrush_save`;
- save имеет shape version из `src/systems/save_runtime.ts`;
- старые сейвы не являются контрактом проекта;
- при breaking shape изменении версия повышается, старые сейвы могут быть отклонены;
- loader обязан не падать на мусорном `localStorage`, но не обязан мигрировать старые версии.

`architecture.md` должен явно говорить:

- save compatibility is not sacred;
- legacy paths are not preserved by default;
- current-shape sanitizers допустимы, cross-version migration не нужна;
- если система хранит persistent state, она дает current serializer/sanitizer и тест на reject старой версии при shape break.

## План изменений

1. Зафиксировать policy в `README.md` и `architecture.md`.

2. Ввести strict gate в `src/systems/save_runtime.ts`: вместо `version <= SAVE_SHAPE_VERSION` загрузка только `version === SAVE_SHAPE_VERSION`. Лучше заменить boolean на reason API:
   - `missing`
   - `old`
   - `current`
   - `newer`
   - `invalid`

3. Обновить `loadGame()` в `src/main.ts`: старый/безверсийный сейв получает отдельное сообщение вроде `Сохранение старой версии: начните новую игру.` Новая версия по-прежнему блокируется как `Сохранение новее этой сборки`.

4. Не удалять все `normalize*` сразу. Сначала переименовать их роль в docs/code comments: это защита текущей версии от повреждения, не legacy migration.

5. При первом breaking cleanup поднять `SAVE_SHAPE_VERSION` с `2` на `3`, чтобы все старые permissive сейвы были отрезаны.

6. Разобрать `src/systems/save_payload.ts`: либо удалить отдельной cleanup-задачей после `rg`, либо сделать единым builder вместо дублирования `createGameSavePayload()`.

7. Для новых persistent секций требовать:
   - `sectionForSave()`;
   - `set/ensureSectionState()` для текущего shape;
   - unit test для reject old shape;
   - отсутствие обещаний миграции в README.

8. Убрать legacy-комментарии в коде по мере затрагивания файлов. Не трогать их отдельным массовым refactor pass.

## Риски

- Жесткий gate отрежет dev-сейвы без версии. Это ожидаемое поведение по новой политике.
- Слишком агрессивное удаление нормализации может сделать битый текущий сейв crashy. Оставить bounds/cap checks.
- Секционные `ensure*State()` часто нужны в runtime, не только на load. Нельзя превращать их в reject-only функции.

## Проверки

- Минимум для docs-only: `npm run typecheck`.
- Для strict gate: unit test на versions `undefined`, `1`, `SAVE_SHAPE_VERSION`, `SAVE_SHAPE_VERSION + 1`.
- Для load path: `npm run check`.
- Для UI-сообщения загрузки: `npm run smoke`, если доступен Chrome.

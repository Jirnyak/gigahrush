# plan_3: динамический малый и средний самосбор

## Цель

Оставить крупные самосборы как сейчас: active phase заканчивается, затем происходит heavy rebuild через `pendingLoad + rebuildWorld()`.

Добавить малый/средний самосбор: он начинается из выбранной точки и во время активной фазы распространяет волну пересборки в реальном времени. Волна меняет стены, пустоты, проходы и малые комнаты постепенно, с учетом текущей геометрии этажа.

## Текущий flow

`src/systems/samosbor.ts`:

- `updateSamosbor()` ведет warning/start/active/end.
- При старте active phase выбирается variant, вызываются `captureZone()`, `spawnMonsters()`, `spawnRandomMapMonsters()`.
- Во время active phase каждый tick идет `spreadFog()` и периодический `spawnFogMonsters()`.
- При окончании `updateSamosbor()` возвращает `true`.

`src/main.ts`:

- если `updateSamosbor()` вернул `true`, ставится `pendingLoad`;
- вызывается `currentRouteRebuildGeneration()`;
- затем `rebuildWorld()`.

`rebuildWorld()`:

- не-LIVING и route replacement: full `replaceWorldFromGeneration()`;
- LIVING: `regrowMaze()` пересобирает весь volatile слой, apartments защищены через `aptMask`.

Это атомарно и надежно, но не дает видимой real-time пересборки.

## Новая система

Добавить `src/systems/samosbor_wave.ts`.

Runtime состояние v1 держать module-local, как текущие runtime поля самосбора. При load активный самосбор уже сбрасывается, значит активная wave тоже может сбрасываться без save migration.

Структура:

```ts
interface SamosborWave {
  active: boolean;
  scale: 'small' | 'medium';
  seed: number;
  originIdx: number;
  radius: number;
  budgetCellsPerTick: number;
  frontier: number[];
  head: number;
  queued: Uint8Array;
  touched: number[];
  dirtyRooms: number[];
  finished: boolean;
}
```

Правила производительности:

- без per-frame full-world scan;
- каждый tick обрабатывает ограниченный budget, например 64-256 frontier cells;
- `frontier` работает через head index, без `shift()`;
- `queued` существует только пока wave активна;
- dirty версии (`markCellsDirty`, `markWallTexDirty`, `markFloorTexDirty`, `markFogDirty`) bump один раз за batch, не на каждую клетку.

## Геометрия волны

Не пытаться инкрементально вызывать `generateVolatileMaze()`. Нужен локальный deterministic stencil:

- cell role = floor/wall/abyss/door/residue по seed + origin + ring;
- не трогать `aptMask`, `hermoWall`, лифты, critical route cells, current player shelter room;
- новые floor cells должны соседствовать с walkable anchor или новым floor этой же wave;
- wall/abyss чистят `roomMap`, `features`, `surfaceMap`, container cell state;
- новые floor cells получают `floorTex`, wall cells получают `wallTex`;
- двери добавляются только между patch-room и существующим reachable floor.

Для LIVING v1: volatile-only. `aptMask` и permanent POI не трогать.

Для design/procedural floors v1: либо только cosmetic/residue wave, либо small/medium разрешать после отдельного protected-mask pass.

## Entities и sparse state

- Projectiles в touched cells удалить сразу.
- Item drops в исчезающих cells удалить или перенести на ближайший новый floor.
- Player проверять каждый batch; если оказался в стене, relocate в ближайший floor.
- NPC/monsters relocate на завершении или bounded по touched bbox.
- Containers в touched cells удалить/перенести; `rebuildContainerMap()` только по завершении или если touched container count выше threshold.
- Route cues: нужен bounded `pruneRouteCuesInCells()` / `pruneRouteCuesInRooms()`, а не full reset.

## Этапы

1. Добавить scale defs: `small | medium | full` с весами, radius и budget. Крупный scale оставляет текущий rebuild.

2. Реализовать `samosbor_wave.ts`:
   - `startSamosborWave()`;
   - `tickSamosborWave()`;
   - `finishSamosborWave()`;
   - `cancelSamosborWave()`;
   - debug lines.

3. Встроить hook в `updateSamosbor()`:
   - после `captureZone()` выбрать scale;
   - для `full` ничего не менять;
   - для `small/medium` стартовать wave и tick-ать ее рядом с fog/director cadence;
   - в конце active phase не возвращать `true`, если full rebuild не нужен.

4. Добавить локальные patch helpers в `samosbor_wave.ts`. В `core/world.ts` добавлять общий API только если helper реально нужен нескольким системам.

5. Для aftermath: сейчас pending aftermath применяется внутри `rebuildWorld()`. Для wave нужен отдельный exported `applyPendingSamosborAftermathAfterWave()` или другой аккуратный hook после completion.

6. Добавить debug trigger: запустить small wave у игрока и вывести origin/frontier/touched/budget.

## Риски

- Достижимость: wave может отрезать лифт или route corridor. На первом этапе ограничить LIVING volatile cells и добавить bounded reachability audit.
- Lightmap: `world.bakeLights()` сканирует весь мир. V1 не ставит новые lamps или делает fake bounded light до окончания active phase.
- Save/load: активная wave не persistent. Если игрок сохранит после частичной geometry mutation и загрузит, этаж сейчас регенерируется и patch потеряется. По новой save policy это допустимо для v1; persistent replay добавлять только позже.
- Route cues и containers могут ссылаться на удаленные клетки. Нужны bounded prune/cleanup helpers.

## Проверки

- `npm run typecheck`.
- Unit tests:
  - no `aptMask` writes;
  - toroidal wrap;
  - no duplicate queued cells;
  - budget respected;
  - roomMap/doors/containerMap consistent after patch.
- Для system/generation changes: `npm run check`.
- После visual changes: `npm run smoke`.
- Ручная проверка: small wave на LIVING видимо меняет геометрию, гермы не ломаются, full rebuild продолжает работать старым путем.

# MASTER PROMPT — Полный аудит ГИГАХРУЩА (передача в новый чат)

> **Назначение.** Это стартовый промпт-передача для СВЕЖЕГО агентского чата, который продолжит
> полный аудит проекта (дочистка хардкода / легаси / дупликатов / спагетти) и **фиксы всего**.
> Он заменяет весь контекст предыдущего чата: всё, что было найдено, сделано и решено, — здесь.
> Читается ВМЕСТЕ с `CLAUDE.md` (обязательные правила поведения) — этот файл их не дублирует,
> а ссылается. Если что-то в этом файле противоречит `CLAUDE.md` — приоритет у `CLAUDE.md`.
>
> Дата передачи: **2026-07-27**. Автор-предшественник: агент Opus (сессия аудита + фаза 1 + ship-bug батчи SB1–SB6). Обновлено в сессии SB5/SB6.

---

> ## ⚡ РЕЖИМ: БЕЗЛИМИТНЫЕ ТОКЕНЫ (директива владельца, 2026-07-27, В СИЛЕ)
>
> **«У нас БЕЗЛИМИТНЫЕ ТОКЕНЫ. Не экономь их — наоборот, активно расходуй ВО БЛАГО ПРОЕКТА.»**
>
> Это ПЕРЕОПРЕДЕЛЯЕТ «token economy» из `CLAUDE.md` в части бюджета. Практически:
> — читай широко и глубоко (файл целиком, соседний код, доки, git-историю) прежде чем судить;
> — гоняй субагентов пачками для параллельного покрытия, верификации находок, A/B;
> — верифицируй каждую находку на источнике, не по памяти; пиши корректностные тесты;
> — не сворачивай исследование рано и не «останавливайся, как только можно действовать».
>
> ⚠️ Что НЕ отменяется token-режимом (ортогонально бюджету): **АНТИНЮКИНГ** (читать файл целиком → хирургическая локальная правка, беречь сложность), запрет деструктивного git, save/RNG-правила. Расходуй токены на ПОНИМАНИЕ и ПРОВЕРКУ; сами правки всё равно держи минимальными и точечными.

---

## 0. Прежде чем что-либо трогать

1. Прочитай `CLAUDE.md` целиком — это жёсткий контракт поведения (антинюкинг, запрет `git reset`/`checkout`, RNG-правила, save-правила, слои, гейты). Он ПЕРЕОПРЕДЕЛЯЕТ дефолты.
2. Прочитай `README.md` (карта реализации), затем `architecture.md` (контракты владения слоёв) — до любых правок общих систем.
3. Прочитай память проекта: `.claude/.../memory/MEMORY.md` и файлы `gen-suite-pre-broken.md`, `nav-local-patch-philosophy.md`, `smoke-flaky-dev-server.md`.
4. `git status --short` — НЕ перезаписывай и НЕ откатывай чужую грязь. В дереве уже лежит незакоммиченная работа фазы 1 (см. §3). Её нельзя терять.
5. Никогда не «нюкай» файлы наивными версиями. Читай файл целиком перед правкой. Правки — хирургические, локальные. См. раздел о нюкинге в `CLAUDE.md` — он написан кровью.

---

## 1. Миссия аудита

Владелец заказал **глубокий аудит максимального качества** («бесконечно токенов, не торопимся, макс качество, спрашивай если не уверен»). Цель — дочистить последствия перехода на новые универсальные системы. Три «хребта миграции» (migration spines):

1. **Единый патфайндинг.** Навигация патчится локально в рантайме; полный bake (`bakeNavigationTree`/`bakeLights`) только при загрузке этажа и после самосбор-стежки. Никогда не O(W²) в активной симуляции. См. `optimization.md` Iron Law и память `nav-local-patch-philosophy`. Статус: в основном на месте; аудит проверяет остатки старых per-actor BFS / прямых пересчётов.
2. **Единая система дизайн-этажей.** Чётные Z — самостоятельные модули; нечётные Z — процедурная сборка. Общий вход `generateDesignFloor(id, runSeed=DEFAULT_DESIGN_FLOOR_SEED, isTutorial)` в `src/gen/design_floors/manifest.ts:139`. **Миграция НЕ докручена** (см. §5.1, §5.3) — `full_floor.ts` удалён, но его логика (expansion + population + lnLights) не полностью инлайнена в генераторы.
3. **Единая лут-таблица.** Цель фазы 2: убрать хардкод-дропы и завести всё через `lootTable` / `generateContainerLoot` (см. §6, Phase 2).

Плюс: все однострочные баги, проблемы, оптимизации — по ходу.

**Новое расширение цели (решение владельца 2026-07-27):** аудит теперь ЯВНО включает
- (a) **дозавершение недокрученной миграции движка** — она сама по себе является проблемой/легаси;
- (b) **дочистку самого тест-сьюта** — тесты «далеко не оптимальны и не универсальны, некоторые глупы, примитивны и ошибочны» (хардкод точных счётчиков блокирует рост контента — напр. тест «должно быть 399 иконок предметов» мешает добавлять новые иконки). Тесты — тоже легаси, подлежащее чистке. См. §5.2, Phase 5/6.

---

## 2. Приоритет и стиль работы (авторизовано владельцем, В СИЛЕ)

- **«Всё по порядку»** — фазы последовательно.
- **Лут → мигрировать в `lootTable`** (не оставлять хардкод).
- **God-файлы: «нельзя сломать монолит и породить кучу мелких систем, которые запутаются»** — не дроби God-файлы на россыпь микросистем. Только внутренние dispatch-таблицы/локальный порядок, с подтверждением ДО структурных изменений.
- **Orphans: «Сохранить фичи»** — латентные, но настоящие фичи не удалять; удалять только очевидный мусор.
- **«если в чём-то не уверен — спрашивай, я выберу»** — при развилках задавай вопрос владельцу, не угадывай.
- **Бюджет токенов — БЕЗЛИМИТНЫЙ** (см. callout вверху файла): читай / верифицируй / шли субагентов щедро. НО правки всё равно минимальные и хирургические (антинюкинг ортогонален бюджету — он про сохранность кода, а не про экономию).

---

## 3. Состояние дерева на момент передачи (⚠️ НЕЗАКОММИЧЕНО)

`HEAD` = `4806821f optimization.md: P0 floor-memory секция приведена к shipped delta-сейву`.

В рабочем дереве на момент этого апдейта — **~77 изменённых src/доков + 3 untracked** (`master_prompt.md`, `tests/bake-lights-local.test.ts`, `tests/faction-relations-persist.test.ts`; всегда сверяйся с `git status --short`). Это грязь фазы 1 (карта ниже, см. §4) **плюс ship-bug батчи SB1–SB5** (пофайловая атрибуция — §4A). Они **зелёные на авторитетном гейте `check:readonly`** (typecheck + test:unit + content:audit, `EXIT=0`, `Errors: none`). **Не потеряй и не откати их.** ⬆️ ХЕНДОФФ (конец сессии SB5/SB6): фаза 1 + SB1–SB5 + этот док **ЗАКОММИЧЕНЫ и запушены в `origin/main`** — смотри `git log`. Дерево должно быть чистым → работай от последнего коммита. SB6 (§4B) в коммит НЕ входит (код не применён). Точный дифф каждого файла смотри через `git diff <path>` — не доверяй пересказу, читай реальный дифф.

Карта грязи (best-effort атрибуция; при сомнении — `git diff`):

- **Удалённый мусор (Phase 1a, 13 файлов):** `src/data/achievements.ts`, `src/data/barks.ts`, `src/data/perks.ts`, `src/entities/stalker_hunter.ts`, `src/gen/collapsed_sector/index.ts`, `src/gen/outskirts/index.ts`, `src/gen/outskirts_conflict/index.ts`, `src/render/samosbor_fx.ts`, `src/systems/achievements.ts`, `src/systems/companion.ts`, `src/systems/factions_war.ts`, `src/systems/sound_propagation.ts` (это были 4-строчные орфанные ре-экспорт-стабы), и `src/gen/living/index.ts.orig` (158-строчный merge-артефакт `.orig`). `content:audit` подтверждает «Unimported content modules: none detected» — висячих импортов нет.
- **Правки src (Phase 1b–1d, P0-баги / корректность / детерминизм):** `src/core/world.ts` (+13, интеграционный хук — RED-файл, правка минимальна), `src/gen/design_floors/manifest.ts` (±18), `src/systems/faction_events.ts`, `src/systems/inventory.ts`, `src/systems/floor_memory.ts` (±31), `src/systems/map_exploration.ts`, `src/systems/needs.ts`, `src/systems/quests.ts`, `src/systems/samosbor.ts`, `src/systems/samosbor_variants_runtime.ts`, `src/systems/void_protocols.ts` (±4 — Phase 1d, `rng() < 0.04` вместо `Math.random`).
- **Правки тестов (2):**
  - `tests/void-floor.test.ts` — рефактор-рename `territorySharesForStoryFloor` → `territorySharesForDesignFloor` (устаревший импорт от миграции). **Зелёный** при индивидуальном прогоне. Легитимный фикс.
  - `tests/voronoi-quarantine.test.ts` — **НЕЗАВЕРШЁННАЯ правка** времён расследования (рename `VORONOI_QUARANTINE_ROOM_NAMES` → `VORONOI_QUARANTINE_ROOM_DEF_IDS`). Тест **всё ещё падает** (см. §5.2 — он сам противоречив и хардкоден). Новый агент должен решить: чинить тест правильно или откатить мою частичную правку. Оба файла — импортёры `../src/gen/`, поэтому идут в `test:generation`, а НЕ в `check:readonly` (см. §9).

**Рекомендация (спросить владельца):** возможно, стоит закоммитить фазу 1 (зелёную на `check:readonly`) отдельным коммитом ДО рискованных фаз, чтобы её нельзя было потерять. Коммитить только по явному разрешению владельца (правило `CLAUDE.md`). Трейлер коммита: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## 4. Что уже сделано — Phase 1 (ЗАВЕРШЕНА, зелёная на `check:readonly`)

- **1a — удаление проверенного мусора.** Орфанные 4-строчные стабы + `.orig`-артефакт (см. §3). Проверено `content:audit`.
- **1b — P0 gameplay-баги.** Точечные фиксы в inventory/needs/quests/map_exploration/faction_events/samosbor (см. `git diff`).
- **1c — P0 корректность / save.** floor_memory (delta-сейв активного этажа vs регенерируемая база — часть уже в `HEAD`, часть в грязи), samosbor_variants_runtime, world.ts хук.
- **1d — детерминизм: чистка `Math.random` в игровой логике.** Дискретные/персистентные игровые события переведены на `rng()` из `src/core/rand.ts` (напр. `void_protocols.ts` `rng() < 0.04`). **Визуальные/пофреймовые/аудио/UI-розыгрыши ОСТАЮТСЯ на `mathRng()`** (санкционировано) — не конвертируй их. Крипто/сетевая идентичность — `secureRandom()`, с комментарием-обоснованием. Правило: конвертируй в `rng()` только то, что влияет на детерминизм симуляции/тестов.

Гейт: `npm run check:readonly` → `EXIT=0`, `Errors: none`. Это доказательство, что вся фаза 1 чистая на авторитетном гейте.

---

## 4A. Ship-bug батчи SB1–SB6 (сделано ПОСЛЕ фазы 1, по прямому указанию владельца «сначала ship-баги»)

> **Контекст.** После записи §4 владелец дал поправку: **«Здесь, сначала ship-баги»** — сперва починить всё, что влияет на играбельность, в ЭТОМ чате, батчами SB1→SB6, каждый гейтится через `check:readonly`, и лишь затем Фазы 2–6. Ниже — что каждый батч сделал. Точный дифф каждого файла — через `git diff <path>` (не доверяй пересказу).

- **SB1 — A4-1 базовый слой object/decor placement.** ✅ SHIPPED+gated. Пере-ключевание `BASE_FLOOR_OBJECT_PROFILE_LAYERS` numeric→biome-строки; индекс через `themeTags?.[0]`; оба `@ts-ignore` удалены; сопряжённый `craft_station_placement`/gen-коллеры мигрированы z→biome, захардкоженный `140` убит. Файлы: `src/data/floor_object_placement.ts`, `src/data/craft_station_placement.ts`, `src/gen/craft_stations.ts`, `src/gen/floor_object_placement.ts`. Детали + урок read-before-conclude — Приложение A · A4-1.
- **SB2 — A10-1/2/3 постпроцесс OFF по дефолту.** ✅ SHIPPED+gated. `main.ts:9977` CRT/interference `0.32→0`; `hud.ts:2106` neuro-noise гейтнут на opt-in `interferenceMode==='full'`; `localization.ts:363` text-glitch base per-mille `10→0`. Escalation под samosbor/low-HP сохранён везде. Файлы: `src/main.ts`, `src/render/hud.ts`, `src/systems/localization.ts`. Детали — A10-1/2/3.
- **SB3 — A2 регрессия популяции design-этажей.** ✅ SHIPPED+gated. Почин missing-populate + align-guard no-op (A2-1/A2-2/A2-5): генераторы снова эмитят ambient-шаблоны, align-предикаты чинены (невозможный `id===undefined`-guard → корректный ambient-candidate тест). Затронуто ~25 gen-файлов: `design_floors/manifest.ts`, `design_floors/population.ts`, `data/design_floor_population.ts`, плюс `*/npcs.ts` (attractor_dvor, hyperbolic_switchyard, silicon_net_well, underhell, moebius_podezd, turing_nursery, production_belt, oranzhereya_betona), `voronoi_quarantine/geometry.ts`, `slime_nii/index.ts` и stale-comment чистки в ~12 `*/index.ts`. Полные якоря — Приложение A · A2. ⚠️ Точные диффы — `git diff src/gen/design_floors/`.
- **SB4 — A11-1 фракц-стендинг игрока персистит между этажами.** ✅ SHIPPED+gated. Решение владельца: **«Сбросить только МОЮ репутацию»** — персистится PLAYER-строка матрицы, не вся. `switchFloor` больше не хард-ресетит стендинг игрока; добавлена save-секция `factionRelations` (плоский `FACTION_COUNT²` Int8-снимок). **`SAVE_SHAPE_VERSION` 24→25** (подтв. `save_runtime.ts:22`, `save.md:13`). Файлы: `src/data/relations.ts`, `src/systems/save_payload.ts`, `src/systems/save_runtime.ts`, `src/main.ts`; тесты `tests/faction-relations-persist.test.ts` (новый), `tests/markov-demos-posts.test.ts` (assert версии 24→25). Детали — A11-1.
- **SB5 — A1-F1/F2 Iron-Law: flow-field prewarm + `bakeLightsLocal`.** ✅ SHIPPED+gated (этот чат). Решения владельца: F1 = **гибрид** (mobile/low-mem → фолбэк на region-tree в `gotoNearestRoomOfTypes`, БЕЗ flow fields; desktop → off-frame prewarm 3 известных ключей за лоадскрином); F2 = **оконный `bakeLightsLocal(box)`**.
  - **F1 (`ai/pathfinding.ts`, +46):** low-mem guard в начале `tryAssignBehaviorFlowPath` (`useLowMemNav()→'not_found'` — 64 MiB alloc невозможен независимо от коллера); `PREWARM_ROOM_TYPE_SETS` = `[[OFFICE],[LIVING],[LIVING,HQ,COMMON]]` (в синхроне с 3 литеральными call-site в `npc_fsm.ts`); `prewarmBehaviorFlowFields(world)` (no-op при frozen/low-mem); `gotoNearestRoomOfTypes` на low-mem берёт ближайшую комнату по прямой + роут через region-tree. Вызов prewarm — в `main.ts finishDeferredLoad` после `prewarmNavigationTreeAsync`, за (worker-rendered) лоадскрином.
  - **F2 (`core/world.ts`, +162/-58):** извлечён приватный `propagateLightSource(i, params)` (дословный BFS-тело старого `bakeLights`, на уровень меньше вложенности); `bakeLights()` теперь loop+вызов (поведение идентично); добавлен `bakeLightsLocal(centerIdx)` — чистит ±R бокс, ре-пропагирует все источники в ±2R (R=`LIGHT_MAX_RADIUS`=8). `setFeatureAt` роутит одноклеточную смену light-фичи через `bakeLightsLocal` + бампает `lightVersion`; **bulk-путь `markFeaturesDirty(true)` остаётся полным `bakeLights`** (floor-load/gen-time, ~55 коллеров). Побочно чинит per-cell samosbor-штампы (`setFeatureAt(…,true,…)`), раньше делавшие полный bake на клетку.
  - **Корректность:** `tests/bake-lights-local.test.ts` (новый, unit-lane — импортит только `../src/core/*`) доказывает инвариант «после одноклеточной мутации + `bakeLightsLocal` весь lightmap == свежий полный `bakeLights`» для add / remove / overlap (снятие одной из двух ламп восстанавливает вклад другой) + `setFeatureAt`-интеграция + non-light no-op. 4/4 зелёные. Доказательство: радиус источника ≤ R, одноклеточная смена меняет только клетки в Чебышёв-R; чистим ±R, ре-пропагируем все источники в ±2R (любой источник, светящий в очищенную клетку, в пределах Чебышёв-2R); внешние клетки не тронуты, ре-пропагация идемпотентна (max-combine). Детали — A1-F1/F2.
- **SB6 — A5-1 arena de-hardcode.** 🟡 ПРОАНАЛИЗИРОВАНО + РЕШЕНИЕ ВЛАДЕЛЬЦА ПРИНЯТО, **КОД НЕ ПРИМЕНЁН**. Владелец выбрал подход к телепорту: **скан `world.rooms` по `RoomType`+tag** (НЕ по display-name). Ни одна строка arena.ts / npc_interaction_options.ts ещё не изменена — это первая задача след. агента. Полный план + оставшийся непроверенный факт (дискриминатор комнат) — §4B. НЕ входит в хендофф-коммит.

Гейт после SB1–SB5: `npm run check:readonly` → зелёный (typecheck + 1771/1772 unit pass, 0 fail + content:audit `Errors: none`). SB5-тест верифицирован и отдельным прогоном (`npx tsx --test tests/bake-lights-local.test.ts` = 4/4).

---

## 4B. SB6 — arena: план (РЕШЕНИЕ ВЛАДЕЛЬЦА ПРИНЯТО, код НЕ применён — задача для след. агента)

Файл-цель: `src/systems/arena.ts` (155 строк, стаб с mock-логикой — комменты «let's pretend / create mocks for now»). Достижим: `interactions.ts:671/694` (overlay-ввод) ← опция `arena` (`npc_interaction_options.ts:527-535`) ← talk к `arena_master`/`marko_lolo`.

> **СТАТУС SB6:** только анализ + решение владельца. **НИ ОДНА строка кода ещё не изменена** (arena.ts и npc_interaction_options.ts прочитаны, но не редактированы; факты ниже verified чтением на 2026-07-27). Всё ниже — план для следующего агента; в хендофф-коммит SB6 НЕ входит.

**Готовые к применению фиксы (verified чтением arena.ts — точные строки подтверждены):**
1. **BUG · slug-опечатка (опция невидима для Марко Лоло):** `npc_interaction_options.ts:531` проверяет `getPlotNpcNumericId('marco_lolo')`, но канонический id — `'marko_lolo'` (пакет `npc_plot_packages.ts:120`, спавн `liquidatorbase/index.ts:142`). Резолвер `getPlotNpcNumericId` (`npc_packages.ts:335`) делает `findIndex(pack.id===stringId)` → `'marco_lolo'` даёт `undefined` → `ctx.npc.id===undefined` всегда false → опция «Арена» НИКОГДА не видна у Марко Лоло. **Фикс:** `'marco_lolo'`→`'marko_lolo'`.
2. **DEAD ternary:** `arena.ts:93` `const max = arenaRuntime.npcName === 'Марко Лоло' ? 6 : 6;` → `const max = 6;`.
3. **DE-HARDCODE display-name identity** (суть A5-1): `arena.ts` ветвит геймплей на русском display-name в 4 местах (`:54` exclude-fighters по имени, `:70`/`:72`/`:109` `npcName==='Марко Лоло'`). Заменить на стабильный id: в `openArena` сложить `arenaRuntime.isDirectEntry = ctx.npc.id === getPlotNpcNumericId('marko_lolo')`; в `findFighters` исключать хостов по id (`arena_master`, `marko_lolo`), не по имени. `getPlotNpcNumericId` уже в этом слое.

**✅ РЕШЕНО — телепорт входа на арену (замена хардкода `arena.ts:110-112` `player.x=100; player.y=63`):**
`(100,63)` НЕВЕРНА — попадает в стену/пустоту далеко от реальной арены. Найдено ДВЕ разные арен-комнаты + hell-вариант:
- `generateLiquidatorBaseDesignFloor` (`liquidatorbase/index.ts:41`) строит комнату `arena` с именем **`'liquidator_arena_main'`** (НЕ `'Арена'`!) рядом со `spawnX/Y=100/100`, ring-центр ≈ `(arena.x+25, arena.y+25)`; **`marko_lolo` спавнится в HQ** (`:142`), не в арене.
- `generateLiquidatorBaseArena` (`arena_poi.ts`, POI в maintenance-манифесте `:209`) стемпит ОТДЕЛЬНУЮ комнату с именем **`'Арена'`** возле `W/2 ± irand(50)`, ring-центр ≈ `(cx+25, cy+25)`.
- hell `altar_arena.ts` — СВОЯ система (`entryX/entryY`, волны), НЕ роутится через `arena.ts`.
- `arena_master` — side-quest NPC (`plot.ts:847`, faction LIQUIDATOR, tag `arena`); где именно спавнится относительно арен-комнаты — НЕ подтверждено.

Важно: `activateArenaSelection` вызывается с `ctx: Pick<InteractionContext,'world'|'state'|'player'|'switchFloor'>` (`interactions.ts:684`) → **`ctx.world` доступен**, скан `world.rooms` на активации в рамках Iron-Law (дискретное действие, O(rooms), не per-frame, не O(W²)).

**✅ РЕШЕНИЕ ВЛАДЕЛЬЦА (2026-07-27): вариант (A) — скан `world.rooms` по `RoomType`+tag** (НЕ по display-name; display-name — ровно тот анти-паттерн, что и чиним). План для след. агента:
- На активации (`activateArenaSelection`; `ctx.world` доступен через `Pick<InteractionContext,'world'|…>` — `interactions.ts:684`) сканировать `world.rooms`, найти арен-комнату по `RoomType` и/или tag, взять ring-центр из её bounds, телепортнуть туда; fallback на безопасную клетку, если комната не найдена.
- ⚠️ **НЕПРОВЕРЕННЫЙ ФАКТ (субагент-маппер был отменён владельцем ДО ответа):** есть ли у ОБЕИХ арен-комнат (`'liquidator_arena_main'` в `liquidatorbase/index.ts` и `'Арена'` в `arena_poi.ts`) общий `RoomType` и/или tag. **СНАЧАЛА проверить:** (1) enum `RoomType` в `core/types.ts` — есть ли арен-тип; (2) конструкцию обеих комнат — какой `RoomType`/tags они получают; (3) есть ли на типе `Room` поле `tags`; (4) прецедент рантайм-скана `world.rooms` по типу/тегу в `systems/`, чтобы повторить идиому. Если общего дискриминатора НЕТ — по решению владельца допустимо добавить единый `RoomType`/tag обеим комнатам на gen-time (маленькая правка в 2 генератора), затем сканировать по нему.
- Готовые фиксы 1–3 (§ выше) применить в том же батче. Проверка: `npm run check:readonly` + ручной проход к арене на liquidatorbase (talk к Марко Лоло → «Арена» → вход).

---

## 5. Главные находки (проверено, не по памяти)

### 5.1 `test:generation` глубоко КРАСНЫЙ и осиротевший (корень — недокрученная миграция движка)

- На чистом `main` HEAD: **~172 индивидуальных фейла + 42 файла крашатся при загрузке**. **Это НЕ регрессия аудита** — доказано reversible A/B: `git stash push -u` всей грязи → те же фейлы на чистом дереве → `git stash pop`. Всегда делай A/B против чистого дерева, прежде чем винить свой патч.
- **Ни один shipped-гейт его не запускает** (`check`, `check:readonly`, `check:full`, `check:release` = typecheck + test:unit + content:audit [+ build/smoke]). Поэтому поломка копилась невидимо.
- **Корень:** незавершённая многокоммитная миграция движка (git log: «Remove STORY and FloorLevel (WIP - compilation broken)», string→numeric-z, «remove full_floor.ts», «Decentralize floor modules»).
- **Категории фейлов (горстка корней, а не 172 бага):**
  - (a) **Устаревшие импорты в тестах** — напр. item-тесты импортируют удалённый экспорт `BLACK_MARKET_88_STOCK` из `src/gen/black_market_88` (`items_036_shock_baton.test.ts`).
  - (b) **Устаревшие asserts формы данных** — напр. `report.target.floor.LIVING` (`items_019_body_bag_roll.test.ts:34`): `.floor` теперь числовой z, а не объект с ключом FloorLevel → `reading 'LIVING'` кидает.
  - (c) **~7 тест-файлов с esbuild-синтаксисом** — напр. `sprites-floors.test.ts:30` «Expected ")" but found "any"».
  - (d) **РЕАЛЬНЫЕ регрессии генераторов** — см. §5.3.
  - (e) **Поведенческие** — самосбор, караваны, квесты, демос.

### 5.2 Сам тест-сьют — легаси (не универсален, местами глуп/противоречив)

Владелец прямо указал: тесты — часть проблемы. Паттерн-антипаттерн — **хардкод точных счётчиков**, который блокирует рост контента:
- `tests/population-profiles.test.ts:269` — `assert.equal(procedural.npcs, 898)`.
- `tests/penrose-laundry.test.ts:141` — `assert.equal(state.tiles.length, 13)`.
- `tests/mesh-voxel.test.ts:224` — `assert.equal(exposed.triangleCount, 108)`.
- Пример владельца «должно быть 399 иконок предметов» — в дереве нет литерала `399` (иллюстрация по памяти; вероятно похожий count-гейт в `content:audit`/реестре предметов). Класс проблемы подтверждён примерами выше.

**Противоречивый/глупый тест (конкретика):** `tests/voronoi-quarantine.test.ts` внутренне несогласован — строка ~201 ПРОПУСКАЕТ владельца `ZoneFaction.SAMOSBOR`, а строка ~240 ТРЕБУЕТ территорию `SAMOSBOR`; плюс требует `ambientTotal >= 900`, что невозможно, пока генератор не зовёт populate (§5.3). Такой тест надо переписать в **диапазонные/универсальные** проверки (инварианты «>= порога», «связность», «есть представитель класса»), а не точные магические числа.

**Задача Phase 5:** дехардкодить count-asserts → диапазоны/инварианты; починить/выкинуть противоречивые тесты; сделать сьют универсальным (не ломающимся от добавления контента). Судить по каждому фейлу: тест неправ (чинить тест) или генератор неправ (чинить генератор, §5.3).

### 5.3 Реальная регрессия генераторов: пропущенный populate → ambient NPC = 0

~8 дизайн-этажей имеют `align<Floor>AmbientNpcTerritory(world, entities)` (контракт «переселить ambient на свою территорию»), но **никогда не зовут** общий gen-time популятор `applyDesignFloorPopulationField(generation, route)` (`src/gen/design_floors/population.ts:210`). Результат: ambient NPC = 0, align впустую, тесты route-scale падают. Этажи: `voronoi_quarantine`, `hyperbolic_switchyard`, `underhell`, `harmonic_bathhouse`, `hilbert_depot`, `spectral_chasovnya`, `number_registry`, `silicon_net_well`. Это прямое следствие удаления `full_floor.ts` (популяция жила там).

**Дешёвый централизованный фикс (проверено):** `applyDesignFloorPopulationField` **идемпотентна** (`requested = Math.max(0, profile.npcTarget - existing)`), а `route` (`DesignFloorRouteDef` в `src/data/design_floors.ts:55`) уже несёт все нужные поля: `id`, `z`, `danger`, `themeTags`. Манифест `generateDesignFloor` **ещё не импортирует** популятор. → Потенциально **одна идемпотентная центральная строка** в манифесте покрывает все этажи (у тех, кто уже зовёт её внутри — `requested=0`, дубля не будет). **НО** это интеграционное решение (порядок относительно `initializeCellTerritory` и `align*`: популяция должна идти ДО них, т.к. align переселяет уже существующих NPC). **Спросить владельца** перед централизацией: центральная строка в манифесте vs правка 8 генераторов. Часть этажей (`moebius`, `turing`) популятор зовут, но всё равно падают на route-scale («doors 34») — это ОТДЕЛЬНАЯ сломанная/no-op регрессия expansion-геометрии, чинить отдельно.

### 5.4 Статус трёх хребтов

- **Патфайндинг:** ок в философии (local-patch); аудит ищет остаточные per-actor BFS/O(W²) в рантайме.
- **Дизайн-этажи:** единый вход есть, но миграция недокручена (§5.1/§5.3).
- **Лут:** ещё не мигрирован — Phase 2.

---

## 6. ПЛАН — что НЕ доделано (по пунктам)

> Порядок — предложение; при развилке спрашивай владельца. Каждый пункт: что, где, как проверить.

### Phase 2 — Единая лут-таблица (хребет №3)
- Мигрировать ~67 монстров: `rareDrops` → `lootTable`. Файлы: `src/entities/*` + реестр `src/entities/monster.ts`, определения дропа.
- Хардкод-лут маршрутов завести через `generateContainerLoot`: `src/gen/hell/index.ts:299-320`, `src/gen/void/index.ts:132-143`.
- Согласовать дублирующую выдачу в `main.ts:4516` vs `main.ts:4523` (RED-файл — минимальный хук, контент не в main.ts).
- Проверка: `npm run check` + профильные тесты предметов/лута.

### Phase 3 — Подключить латентные фичи («Сохранить фичи»)
- `src/systems/banking.ts`, `src/systems/stock_market.ts` — есть, но не подключены к достижимому геймплей-пути. Завести через существующие терминалы/интеракции (`interactions.ts`, `E`-диспетчер) и события.
- Chunk cache `MeshWorldVersions` в `src/render/.../chunk_cache.ts` — проверить, что dirty-версии реально дёргаются при мутациях геометрии (`cellVersion`/`surfaceVersion` и т.п.).
- Проверка: `npm run check` (+ `check:browser`/`check:full` для рендер-путей, если доступен Chrome).

### Phase 4 — God-файлы (СНАЧАЛА подтвердить у владельца, с конкретикой)
- `src/systems/ai/monster.ts` (~9162 строк) → внутренняя dispatch-таблица (НЕ россыпь микросистем — правило владельца).
- `src/gen/procedural_floor.ts` (~16270 строк) — только с конкретным планом и явным «да» владельца. Не структурировать вслепую.
- Помни антинюкинг: читать целиком, хирургические правки, беречь сложность (aptMask, dirty-флаги, carving, рендер-пассы).

### Phase 5 — Дехардкодинг / универсализация тест-сьюта (НОВОЕ, §5.2)
- Заменить точные count-asserts на диапазоны/инварианты: `population-profiles.test.ts:269` (npcs 898), `penrose-laundry.test.ts:141` (tiles 13), `mesh-voxel.test.ts:224` (triangleCount 108), и найти остальные (`rg -n "\.length[,)] *(===|==) *[0-9]{2,}" tests/`; берегись base64-блобов в `src/data/*_b64`/`bad_apple_*` — они забивают grep, исключай их).
- Переписать противоречивые тесты (напр. `voronoi-quarantine.test.ts` — конфликт SAMOSBOR owner, §5.2).
- Найти «399 иконок»-подобный count-гейт (вероятно в `content:audit`/реестре) и сделать его ростоустойчивым.
- Принцип: тест проверяет ИНВАРИАНТ (связность, достижимость, наличие класса, порог), а не магическое число.

### Phase 6 — Дозавершить миграцию движка → озеленить `test:generation` (НОВОЕ, §5.1)
- Триаж каждого фейла: тест неправ (→ Phase 5) или генератор неправ (→ чинить генератор).
- (a) устаревшие импорты, (b) устаревшие data-shape asserts, (c) esbuild-синтаксис в ~7 тест-файлах — механическая чистка.
- (d) генераторные регрессии §5.3 (populate → ambient; expansion-геометрия moebius/turing).
- (e) поведенческие (самосбор/караваны/квесты/демос) — по одному, с пониманием причины.
- **После озеленения — завести `test:generation` в гейт** (напр. в `check:full` или отдельный `check:gen`), чтобы сьют больше не гнил невидимо. Обсудить с владельцем время прогона (~8+ мин, нужен `GIGAHRUSH_GENERATION_MATRIX=1`).

---

## 7. Жёсткие ограничения (сводка; полное — в `CLAUDE.md`)

- **АНТИНЮКИНГ.** Никогда не переписывай файл наивной версией. Читай целиком → хирургическая локальная правка. Уважай существующую сложность.
- **ЗАПРЕТ деструктивного git.** Никаких `git reset --hard` / `git checkout .` / `git clean` без ЯВНОГО разрешения. Reversible A/B через `git stash push -- <file>` + `git stash pop` — допустимо (использовалось успешно).
- **RNG.** Никакого `Math.random()` в игровой логике (только `mathRng()` для визуала/аудио/UI и `secureRandom()` для крипто/сети — с комментарием). Всё игровое — через `src/core/rand.ts`.
- **Save.** Только текущая форма (`SAVE_SHAPE_VERSION` в `src/systems/save_runtime.ts`). Ломаешь форму — бампай версию и отвергай старьё. Никаких кросс-версионных миграций. «Никаких сохранений и загрузок; всё тестируем в НОВОЙ версии; не ищи причину бага в старых сейвах».
- **Область чтения.** Не читай `../gatbage/**`, `dist/**`, `itch/**` по умолчанию.
- **Не трогай чужую грязь**, не переводи русские строки, не черни `.DS_Store`/генерённое.
- **Коммит/пуш — только по явной просьбе.** Трейлер: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## 8. Гейты и проверка

- `npm run check:readonly` — **авторитетный** агентский гейт: typecheck + test:unit + content:audit. Быстрый, безопасный. Фаза 1 на нём зелёная.
- `npm run check` — + build (`dist/`). Для системных изменений.
- `npm run check:browser` / `check:full` — для рендер/UI/мобайл/ввод/smoke, когда доступен Chrome.
- `npm run test:generation` — **осиротевший**, сейчас красный (§5.1), нужен `GIGAHRUSH_GENERATION_MATRIX=1`, ~8+ мин. Цель Phase 6 — озеленить и завести в гейт.
- **Топология сьютов (важно!):** `run-generation-tests.mjs:16` берёт тест-файлы, чей исходник `includes("../src/gen/")`; `run-unit-tests.mjs` их резервирует. → сьюты **непересекающиеся**. `check:readonly` гоняет ТОЛЬКО `test:unit` (не-`src/gen` импортёры). Поэтому мои две правки тестов (обе импортируют `src/gen/`) НЕ покрыты `check:readonly` — проверяй их через `npx tsx --test tests/<file>.test.ts` или `test:generation`.

---

## 9. Ловушки (проверено на своей шкуре)

- **`rg -r`.** `-r` — это `--replace`, берёт следующие символы как значение замены. `-rln` = `-r ln`, `-rn` = `-r n` → совпадения переписываются в выводе (файлы не меняются, но результаты мусорные). **Никогда не кластери `-r` во флагах ripgrep.** Для поиска — просто `-n`.
- **base64-блобы забивают grep.** `src/data/bad_apple_theme_lofi.ts` и подобные `*_b64` содержат гигантские base64-строки. При поиске по числам/паттернам исключай их (`--glob '!**/*b64*'` или пост-фильтр `rg -iv "b64|SUQ|AAAA"`).
- **gen-suite pre-broken.** Не вини свой патч в фейлах генерации без A/B против чистого дерева (§5.1). См. память `gen-suite-pre-broken`.
- **smoke флейкает даже на свежем `dist/` (обновлено 2026-07-27).** Ложные фейлы `start and move`/`inventory panel` (CDP-инъекция ввода гонит cold-start кадры). Прежний воркэраунд «свежий dist = зелёный» БОЛЬШЕ НЕ ВЕРЕН — `build && smoke` тоже падает на этих шагах. Авторитетный гейт — `check:readonly` (зелёный, пока smoke ложно красный). A/B доказал: те же фейлы без SB1 (`liveAi 2264` vs `2270`, `itemCount 7371` vs `7446`). См. память `smoke-flaky-dev-server`.
- **[NEW · perf · найдено через smoke 2026-07-27] floor-0 cold-start AI спайк.** Старт-этаж (`currentZ:0`) материализует `liveAi≈2270` (`npcCount≈2140` + 126 монстров), `aiSkipped:0` на `ai.frame:2` → `aiMs≈122ms` спайк на холодном старте (`simMs≈128`, `tick` едва растёт). НЕ от SB1/SB2 (A/B: без SB1 то же). Кандидат: AI-LOD/skip не включён на первых кадрах, ИЛИ переполнение популяции старт-этажа. Пересекается с A2 (populate) и `optimization.md` (AI cadence/LOD). Чинить отдельно — SB2 не блокирует.
- **Смещение аргументов при мульти-replace.** При правке сигнатур/вызовов следи, чтобы не проглотить переменную (пропущенная запятая → сдвиг аргументов, TS молча передаёт `undefined` в хвост). Тройная проверка диффа.

---

## 10. Память проекта (durable facts)

- `gen-suite-pre-broken.md` — `test:generation` предсломан/осиротевший (обновить: добавить факт о непересекающихся сьютах §8).
- `nav-local-patch-philosophy.md` — навигация патчится локально; полный bake только на новом этаже + пост-самосбор.
- `smoke-flaky-dev-server.md` — smoke ложно падает на :5173.
- Индекс: `MEMORY.md`.

---

## 11. Первый шаг нового чата

1. Прочитать `CLAUDE.md`, `README.md`, `architecture.md`, память (§10), этот файл (особенно callout про БЕЗЛИМИТНЫЕ ТОКЕНЫ вверху и §4A/§4B).
2. `git status --short` — фаза 1 + SB1–SB5 + этот док ЗАКОММИЧЕНЫ и запушены в `origin/main` в конце сессии SB5/SB6 (см. `git log`). Дерево должно быть чистым; работай от последнего коммита.
3. Прогнать `npm run check:readonly` — подтвердить зелёный старт.
4. **Реализовать SB6** (§4B — код ещё НЕ применён): фиксы 1–3 (slug / dead-ternary / de-hardcode по id) + телепорт скан-`world.rooms`-по-`RoomType`+tag (владелец уже выбрал этот подход; сначала проверь дискриминатор комнат — §4B). Гейт `check:readonly`. Затем — Фазы 2–6 по §6 (populate-фикс §5.3 УЖЕ сделан в SB3). Спрашивать владельца на развилках.

---

## Приложение A — Верифицированные находки аудита (2026-07-27)

> Результаты 13 параллельных read-only субагентов по слоям. Все находки с якорями `file:line`,
> проверены на источнике. **Интегрировано 12/13 линий** (A1–A12). A13 (orphan-export sweep) ещё
> крутится — confirmatory к A9-orphan-table (O1–O11), план не меняет; будет свёрнута по приходу.

### A3. Лут-спайн (хребет №3) — worklist миграции

**Итог:** единый спайн РЕАЛЬНО существует — `src/systems/procedural_loot.ts`: `buildLootPool:40` / `pickLootFromPool:76` + 4 публичных роллера: `generateContainerLoot:149`, `generateNpcLoadout:94`, `generateMerchantStock:177`, `generateMonsterLoot:200` (читает `ecology.lootTable`). Референс-паттерны уже соответствуют: `containers.ts:148 seedInventory`, `zombie_apocalypse.ts:712`, `ministry/npcs.ts:30`, `alife.ts:1086/1094`, `samosbor.ts:3721`. **НО спайн обходят почти везде, где лут реально появляется.** Рендер-граница чистая (в `render/webgl.ts` только отрисовка спрайтов ITEM_DROP), `generateMerchantStock` конкурентов не имеет.

**Worklist (по убыванию влияния):**

| # | Локация `file:line` | Что | Как захардкожено | Цель через спайн | Риск |
|---|---|---|---|---|---|
| 1 | `data/monster_ecology.ts:34 rareDrops` (70 из 80 defs) + `chooseMonsterRareDrop:1932` + `monster_drops.ts:14 dropMonsterRareLoot` | Редкий дроп с монстра | 70 инлайн `rareDrops`, роллятся ПАРАЛЛЕЛЬНЫМ роллером; `lootTable` заполнен лишь у 3 (BETONOED/GNOME/ZOMBIE) | Свернуть `rareDrops` → `lootTable` (`MonsterLootEntry`), всё через `generateMonsterLoot`; удалить `rareDrops`/`chooseMonsterRareDrop`/`dropMonsterRareLoot` + эхо `:1957` | **Поведенческий:** `rareDrops` — только при убийстве игроком, `lootTable` — при любой смерти. Решить правило явно. Трогает всех монстров. |
| 2 | `gen/procedural_floor.ts:3405 chooseItem` / `:3484 seedProceduralLootInventory` (вызов :3495) | Содержимое контейнеров на нечётных (proc) этажах — половина игры | Локальный `ITEMS_BY_ROOM` + вес `spawnW*1000/(value+10)`; `generateContainerLoot` не зовётся | `generateContainerLoot(def.tags, valueCap, z, rolls)` (как `containers.ts:127`) | Сохранить `proceduralContainerValueCap:3480` и `lootBiasIds`. Механически. |
| 3 | `gen/procedural_floor.ts:3963 npcLoadout` (вызовы :3997/:9482/:15471) | Оружие+патроны NPC на proc-этажах | Хардкод `{weapon:'ak47'…}` по фракции | `generateNpcLoadout(faction,level,danger,…)` | Ничего не теряет. 3 сайта. |
| 4 | `systems/samosbor.ts:2760-2777` | Скаттер в volatile-комнаты при ребилде | Инлайн `1000/(value+10)` + `weightedPick` | Спайн-пул + tag/cap | Только на ребилде — безопасно. Копия формулы #1. |
| 5 | `gen/living/npcs.ts:31-46 spawnItems` | Скаттер в living-зоне | Инлайн пул, идентичный #4 | То же | Копия формулы #2. Блок `idol_chernobog` :49-62 — авторский, не трогать. |
| 6 | `gen/hell/index.ts:299-318 seedLoot` | До 280 дропов | `drops=[14 ids]`+`pick` | `generateContainerLoot` + tag `hell` + cap | Сохранить бюджет count. |
| 7 | `gen/maintenance/index.ts:478 placeItems` (:483) | Скаттер по всему Maintenance | `defs=[…'grenade']`+`pick` | `generateContainerLoot` tags tools/maintenance | `grenade` в плоском массиве — cap чинит. |
| 8 | `gen/ministry/index.ts:494 placeMinistryItems` (:498) | Скаттер по Ministry | `defs=['bread'…'note']`+`pick` | tags paper/office | Ядро. |
| 9 | `gen/black_market_88/market.ts:197` | 10 дропов у прилавков | `lootPool=[8 ids]` | tags market/valuable | Флейвор через tag-профиль. |
| 10 | `gen/maintenance/flooded_lab.ts:172` | Скаттер лаборатории | `lootPool=[8 ids]` | tags science/medical | Мелко. |
| 11 | `gen/ministry/secret_smoking.ts:170` | Скаттер курилки | `lootPool=[8 ids]` | tags smoking/paper | Мелко. |
| 12 | `gen/kvartiry/red_corner.ts:175` | Скаттер красного уголка | `lootPool=[ballot,book,…]` | Либо авторский (ballot-флейвор), либо `generateContainerLoot`+forced ballot | Граничный — `ballot` намеренный. Низкий приоритет. |
| — | `gen/kvartiry/index.ts:486-497` | 500× `ballot` | Одиночный флейвор | Оставить авторским | Не кандидат в пул. |

**Ключевые находки:**
- **A3-1 (High):** монстр-`rareDrops` — полноценный ПАРАЛЛЕЛЬНЫЙ спайн (70/80); унифицированный путь `generateMonsterLoot` читает только `lootTable`, который заполнен у 3. Реальная экономика дропа живёт на хардкод-массиве.
- **A3-2 (High):** `main.ts:4516 dropMonsterLoot` vs `:4523 dropMonsterRareLoot` — НЕ дубликат, а два параллельных грант-пути из РАЗНЫХ данных, на одной смерти, с двумя лог-строками (:4520 «С монстра упало…» / :4526 «На месте боя осталось…»). Асимметрии: (a) `dropMonsterLoot` — любая смерть, `dropMonsterRareLoot` — только `killerIsPlayer`; (b) оба жрут ОДИН `dropRng` (:4515) последовательно → схлопывание меняет RNG-последовательность/детерминизм/тесты. Третий путь `spawnStoryDeathDrops:4528` (`plot_outcomes.ts:151`) — авторский, оставить. Делать ПОСЛЕ A3-1.
- **A3-3 (High):** proc-этажи полностью минуют `generateContainerLoot` (`seedProceduralLootInventory:3484`).
- **A3-4 (High):** параллельный NPC-loadout роллер `procedural_floor.ts:3963`.
- **A3-5 (High):** формула value-decay `spawnW=1000/(value+10)*min(1,(threshold+5)/max(1,value))` скопирована 3× (`living/npcs.ts:33`, `samosbor.ts:2762`, ядро в `procedural_floor.ts:3419`). Свернуть в `buildLootPool`.
- **A3-6 (High/Med):** 9 хардкод-массивов скаттера в генераторах (см. worklist #6–12).
- **A3-7 (High, вне пула):** ~110 сайтов `EntityType.ITEM_DROP`, большинство — авторские квест/сцена-дропы (конкретный ключ/документ/образец): `slimevik.ts:350`, `void_protocols.ts:490`, `contracts.ts:825`, `arena_rewards.ts:8/18`, пакеты NPC. Легитимно захардкожены, НЕ мигрировать. Общие спавн-хелперы (`dropItem:3435`, `content_helpers.ts:175`, `procedural_anomalies/common.ts:146`, `main.ts:4424 dropEntityInventory`) — ок.

**Канон-цель:** всё через `buildLootPool`+`pickLootFromPool`; рычаг миграции — словарь тегов (`food/medical/weapon/ammo/tools/paper/valuable`) + value cap. `weightedPick` (`shared.ts:1710`) остаётся как generic-селектор для не-лут нужд. Детерминизм на этих сайтах уже ок (используют `core/rand`, не `Math.random`).

### A1. Патфайндинг-спайн (хребет №1)

**Итог:** сам роутинг-хребет в отличном состоянии — миграция на HPA* (region/portal + плотная next-hop матрица + low-mem column-BFS вариант) чистая: нет легаси nav-полей на World, нет конкурирующего A*/Dijkstra, единый вход запроса `buildBakedTreePath`, корректный accept-stale на runtime-правках, freeze-during-samosbor с ref-count, async-бейк на воркерах за лоадскрином. Запросы путей throttled (`ai.timer`, same-target guard, noise `scanInterval`) — BFS-шторма нет. **Главные риски — на ДВУХ других руках Железного Закона (flow fields и light maps), которые НЕ получили дисциплину «бейк за лоадскрином».**

- **A1-F1 [✅ SHIPPED · SB5 · был P1 · Iron-Law] flow fields строятся ЛЕНИВО во время геймплея.** `ai/pathfinding.ts:1150` (+1118, 46-48, 1169): `ensureBehaviorFlowField` заливает `Int32Array(SW²)`, `SW²=(1024·4)²=16 777 216` сабселлов (64 MB, коммент :296-299). `prewarmNavigationTree`/`…Async` греют только region-tree, НЕ flow fields → первый NPC на home/work роутинге (`npc_fsm.ts:1150/1154/1158`, `gotoNearestRoomOfTypes`) триггерит 16.7M-BFS + 64 MB alloc на одном кадре. `unfreezeNavigationCacheForWorld` чистит `_behaviorFlowFields` (:398,:413) → хитч ПОВТОРЯЕТСЯ после каждого самосбора. **Фикс:** в `prewarmNavigationTree(Async)` после region-бейка прогреть 3 известных ключа (`roomTypeSourceProvider` для `[OFFICE]`, `[LIVING]`, `[LIVING,HQ,COMMON]`). Пересекается с mobile-memory (Jetsam). **✅ SHIPPED (SB5, гибрид): mobile→region-tree фолбэк + low-mem guard в `tryAssignBehaviorFlowPath`; desktop→`prewarmBehaviorFlowFields` за лоадскрином. См. §4A.**
- **A1-F2 [✅ SHIPPED · SB5 · был P1 · Iron-Law] `bakeLights()` — полный O(W²) на runtime-смене фичи.** `core/world.ts:288` (триггер :481/:518-522). `setFeatureAt` по умолчанию `rebakeLights=true`; `markFeaturesDirty(true)`→`bakeLights()`. Runtime-вызовы: `weapon_beams.ts:162` (в карве луча — возможно несколько бейков/кадр!), `void_protocols.ts:599`, `samosbor.ts:3866/3982/4144` (фронт самосбора, много клеток/тик). Дословный запрещённый анти-паттерн. **Фикс:** `bakeLightsLocal(idx, radius)` — чистит+перепропагирует только окно радиуса ~8; звать из `markFeaturesDirty`; либо defer к плановому бейку (accept-stale). Пересекается с render/lighting. **✅ SHIPPED (SB5): оконный `bakeLightsLocal(idx)` — чистит ±R, ре-пропагирует ±2R; `setFeatureAt` роутит одноклеточную смену через него; bulk `markFeaturesDirty(true)` остаётся полным. Корректностный тест `bake-lights-local` 4/4. См. §4A.**
- **A1-F3 [P2 · dead-code] nav-dirty-set машинерия собирается, но НЕ потребляется.** `ai/pathfinding.ts:224-225,1044-1050` (+911-912,1085-1086): `_navDirtyCells`/`_navDirtyFull`/`NAV_PATCH_MAX_CELLS` + экспорт `markNavigationCellsDirty()` пишутся 4 подсистемами (`door_state.ts:16/56`, `weapon_beams.ts:92`, `breach_charge.ts:247`, `main.ts:6538/6636/6664`), но единственное чтение — self-guard внутри самой `markNavigationCellsDirty` (:1045); `patchNavigationRegions`(:1085)/`finishNavigationBake`(:911) их лишь `.clear()`. Коммент :1073-1079 признаёт «advisory». **Фикс:** удалить set+функцию+4 сайта (accept-stale — контракт), либо реально подключить локальный инкрементальный апдейтер.
- **A1-F4 [P2 · test-gap] low-mem (mobile) роутер — вторая реализация без тестов.** `ai/pathfinding.ts:134,180,122`: on-demand next-hop КОЛОНКИ (`computeRegionNextColumn`, LRU `regionColumnFor`) вместо плотной матрицы. `useLowMemNav()` в Node = `false` (:139, нет `matchMedia`) → `tests/ai-pathfinding.test.ts` гоняет только desktop-путь. `region_next.ts:118-120`: колоночный кернел «может выбрать другую цепочку равной длины» — расхождение без parity-теста → мобильные игроки на непроверенном роутере. **Фикс:** тест-хук форсит low-mem, assert reachability-parity.
- **A1-F5 [P2 · perf hot-path] `localRegionMacroBfs` аллоцирует `const nb=[…]` на каждой dequeue-клетке** — `ai/pathfinding.ts:717-722,742-747`, на query-time (из `buildBakedTreePath:1357/1379/1389`). Рядом flow-BFS (:1198-1201) уже инлайнит `nW/nE/nN/nS`. **Фикс:** инлайн 4 тороид-соседей + разворот цикла.
- **A1-F6 [P2 · dup] `REGION_NONE=0`/`REGION_UNREACHABLE=65535` объявлены дважды** — `ai/pathfinding.ts:54-55` vs `region_next.ts:16-17` (canon). Два источника истины для sentinel 65535. **Фикс:** импортить из `region_next`, удалить :54-55.
- **A1-F7 [P3 · perf] `followPath` string-pulling каждый кадр** — `pathfinding.ts:1699-1716`, до 20 `hasLineOfSight` DDA/кадр на актора; масштабируется с популяцией. Bounded, не Iron-Law. Опц. фикс: пересчитывать lookahead только при сдвиге `ai.pi`.
- **A1-F8 [P3 · dead] dev-монолог в проде** `pathfinding.ts:1210-1224` («Wait, …», `reachable: totalReachable // not exact anymore»`) — диагностика, врёт flow-стат. **A1-F9 [P3 · dead]** `SteeringPathAssignment.cellVersion`/`pathBlockerVersion` пишутся, не читаются (`pathfinding.ts:1606-1607,1630-1631`). **A1-F10 [P3 · doc]** header `bfsPath` (:1, экспорт :344) описывает до-миграционный BFS, сейчас HPA*.
- **Чисто (не находки):** path-blocker слой (`rebuildPathBlockersFromWorldObjects` full-W² только в no-cell-list ветке; все runtime-вызовы дают bounded cell-list; version bumps ок). `danger_field.ts` — 2 Hz diffusion, bbox-tracked, не роутинг.

### A2. Дизайн-этажи (хребет №2) — единая система + незавершённая популяция

**Итог:** унификация design-floor частично подключена, но миграция незавершена так, что **молча убирает обычную толпу с ~19–23 из 50 route-этажей**. Задуманный пайплайн: генератор эмитит *nameless ambient-шаблоны* через `applyDesignFloorPopulationField` (`population.ts:210`) → `initializeCellTerritory` назначает faction-ownership → `align<Floor>AmbientNpcTerritory` репозиционирует шаблоны → на входе на этаж `materializeAlifeFloorPopulation` (`alife.ts:2441`) накладывает persistent A-Life identity поверх шаблонов. Доказано end-to-end: последний шаг гейтится `if (templates.length > 0)` (`alife.ts:2452`) — генератор без populate даёт 0 шаблонов → 0 обычной толпы, **независимо от богатства population-оверрайда**. Только **23 из 50** генераторов зовут populate. Counts (все с якорями): 50 генераторов (`manifest.ts:70–123`); 23 populate; 13 align-call (`manifest.ts:159–177`); 16+ align-def (4 никогда не зовутся); ~19 crowd-plausible этажей = 0 толпы.

- **A2-1 [P1 · REAL core-regression] 27 из 50 генераторов не эмитят ambient-шаблоны → 0 A-Life обычной толпы.** producer `population.ts:210` ↔ consumer `alife.ts:2451-2471`: `materializeAlifeFloorPopulation` зовёт `extractAmbientNpcTemplates:2416` (матч nameless по `entity.name===undefined`), гейтит ВСЮ обычную материализацию за `if(templates.length>0):2452`, переиспользуя шаблон как слот (`templates[slot]:2465`). Оверрайды в `design_floor_population.ts` только питают off-floor пул (`alife_population_plan.ts:148 designBucket`), слотов НЕ создают. Пустые при том что роль требует толпу: radon_exchange(44, **0 NPC вообще**), spetspriemnik(40, «задержанные…бунт»), cayley_byuro(36, override:589), upper_bureau(34, manifest:179 «handled in generator» но никто не populate → **0 NPC**, override:629), istinniy_labirint(28,:709), bank_floor(26, ключ `bank_z`:742 недостижим), critical_leak_archive(24,:749), markov_stairwell(20,:874), communal_ring(4, соц-хаб), obschezhitie_smeny(-6, спящие), penrose_laundry(-8), liquidatorbase(-16, HQ+торговля), shahta_atrium(-24) + align-only группа ниже.
- **A2-2 [P1 · REAL dead-code/logic-bug] `align*AmbientNpcTerritory` — универсальный no-op из-за невозможного id-guard.** Все 16 предикатов требуют `entity.id === undefined`/`!entity.id` (attractor_dvor/npcs.ts:74, silicon_net_well/npcs.ts:99, underhell/npcs.ts:46, voronoi_quarantine/geometry.ts:1304, hyperbolic_switchyard/npcs.ts:138…), но у каждой заспавненной сущности `id>0` → фильтр не матчит НИЧЕГО, align репозиционирует 0 сущностей даже на «здоровых» этажах. **4 align-only этажа выглядят подключёнными, но дают 0 толпы:** voronoi_quarantine(z6, align@:166), hyperbolic_switchyard(-20,@:168), silicon_net_well(-22,@:172), underhell(-38,@:173) — align зовётся, populate нет. **+4 мёртвых align-экспорта (def есть, call нет):** number_registry/npcs.ts:139, harmonic_bathhouse/npcs.ts:213, hilbert_depot/npcs.ts:40 (**0 NPC вообще**), spectral_chasovnya/npcs.ts:137. **Фикс:** guard → `id>0 && name===undefined && npcPackageId===undefined && questId===-1 && alifeId===undefined` (как `isAmbientNpcCandidate`). Чинить ДО/ВМЕСТЕ с A2-1 — no-op маскирует missing-populate.
- **A2-3 [P1 · REAL dead-code] хук `onAfterTerritory` определён+выставлен, но не вызывается нигде.** def `floor_manifest.ts:19` + `floor_69/meta.ts:107`; SET на `moebius_podezd/index.ts:43`, `communal_ring/index.ts:482`; INVOKE: нигде (`manifest.ts:139-186` не зовёт `gen.onAfterTerritory`). Manifest хардкодит per-id align/reinforce (`:159-177`) вместо generic-хука → авторский reinforce moebius/communal_ring не запускается. **Фикс:** после `initializeCellTerritory`(:158) `gen.onAfterTerritory?.(gen.world, gen.entities)`, мигрировать per-id в хуки.
- **A2-4 [P1 · REAL broken-geometry] moebius_podezd/turing_nursery валят route-scale doors.** `moebius_podezd/index.ts:51`+`turing_nursery/index.ts:48`: тест FAIL на `world.doors.size>=200` (набл. ~34), `rooms>=520` PASS. Инлайн-`expand*RouteGeometry` строит сотни комнат карвом-проёмами, но регистрирует ~34 `Door`; `finalizeExpandedFloor`(shared.ts:2350)→`sanitizeDoors` двери из проёмов не синтезирует. Удалённый `full_floor.ts` экспортил `retuneDesignFloorAfterCellTerritory` (door-synth пасс), не воспроизведён при инлайнинге. **Фикс:** звать `addDoorAt`(geometry.ts:543)/`connectRooms`(:577) на границах expanded-комнат либо восстановить door-synth. (repro: `npx tsx --test tests/moebius-podezd.test.ts tests/turing-nursery.test.ts`)
- **A2-5 [recommendation] «одна идемпотентная центральная строка populate».** Место: после `initializeCellTerritory`(`manifest.ts:158`), чтобы populate-чтение faction (`territoryOwnerAtIndex` population.ts:135) видело реальный ownership. Идемпотентность OK: `spawnAmbientNpcTemplates` `requested=max(0,npcTarget-existing)`(:128), `spawnDesignMonsters` тоже(:149) — двойного спавна нет. ГДЕ НЕВЕРНО без гардов: (a) NPC-free стрипаются `withoutNpcEntities`@:185, но monster-половина populate всё равно сработает; (b) `basePopulationTotalAtDefaultSoftLimit(_z)`(`population_profiles.ts:289`) **игнорирует z** → hostile void/hell без явного `npcTarget:0` получат базовую гражданскую толпу; (c) децентрализованные floor'ы зовущие populate ДО manifest-territory (attractor_dvor/index.ts:85) — идемпотентность скипнет, оставив pre-territory faction. **Порядок:** (i) фикс align-guard A2-2 или дроп align, (ii) `npcTarget:0` оверрайды для void/podad/cantor, (iii) z-scaling для `basePopulationTotalAtDefaultSoftLimit`, (iv) центральная строка на :158. Net-positive и в одиночку (чинит ~19 пустых), но переполнит hostile до (ii). `entitySpawnSlots` cap (entity_limits.ts, population.ts:129/150) уже бандит любой центр-фикс.
- **A2-6 [P2 · debris]:** (a) **3 сломанных тест-импорта** (load-time errors): `number-registry.test.ts:10` + `manhattan-crossroads-genfix-043.test.ts:10` импортят `expandDesignFloorGeneration`/`retuneDesignFloorAfterCellTerritory` из удалённого `full_floor`; `raionsovet-archive.test.ts:11` импортит `applyDesignFloorPopulationField` из неверного `../src/gen/population` (верно `…/design_floors/population`). (b) **`bank_z` key mismatch** — `design_floor_population.ts:742` ключ `bank_z`, route id `bank_floor`(design_floors.ts:79) → оверрайд silently не находится. (c) **`designMonsterFloor` мёртв** — `population.ts:68-75` `@ts-ignore return route.themeTags`(string[] as number), вызов :155 не читается. (d) **hardcoded populate-z**: darkness -52 vs route -48(index.ts:57), production_belt -20 vs route -14(:61) → неверный z для профиля/danger; фикс: передавать `route`. (e) `finalizeExpandedFloor(generation,_route,_rng)`(shared.ts:2350) игнорит `_route`/`_rng` — stub-сигнатура из миграции. (f) orphan-комменты «Hooks moved from full_floor.ts» (oranzhereya_betona:43, pioneer_camp:102, attractor_dvor:66, silicon_net_well:39, dark_metro:169, production_belt:33). (g) FloorLevel-остатки в этом слое: чисто (0); `territorySharesForStoryFloor`→`territorySharesForDesignFloor`(floor_territory.ts:37) полностью.
- **Здоровые (populate есть, crowd работает):** roof/chthonic_attic/antenna_court/pioneer_camp/raionsovet_archive/registry_morgue/bolnichny_korpus/slime_nii/manhattan_crossroads/oranzhereya_betona/floor_69/black_market_88/production_belt/service_floor/dark_metro/attractor_dvor + biome-базы (kvartiry/ministry/maintenance/hell). **Exempt:** living(own path index.ts:183), void(NPC-free z<-48), podad/cantor_pustoty(hostile-theme). **Cross-cut:** align-no-op (A2-2) МАСКИРУЕТ missing-populate (A2-1) — авторы добавили align, думая что он размещает NPC. Procedural (нечётные) НЕ затронуты (свой `carveSumpAmbientField`). Прямо кормит Фазу 6 и [[gen-suite-pre-broken]].

### A4. Остатки незавершённой миграции движка (string-id/`FloorLevel` → numeric-`z` + `floorKey`)

**Итог:** на shipped-пути миграция ПРАКТИЧЕСКИ завершена и зелёная. `core/types.ts` без `FloorLevel`; идентичность этажа = `currentZ:number` (`types.ts:1215`); `biome` вычищен (0 ссылок); `main.ts` чист. Дебри выжили **потому что не могут уронить `npm run check`**: `tsconfig.json include=["src","functions","vite.config.ts"]` (tsc не видит `tests/`/`scripts/`); 2 реально-сломанных shipped-сайта скрыты за `@ts-ignore`; мёртвые данные не исполняются; сломанные тесты — в незагейченном `test:generation`.

- **A4-1 [✅ SHIPPED · был P1 · REAL] базовый слой object-placement молча теряется на КАЖДОМ этаже.** `data/floor_object_placement.ts:764` (`route.themeTags`) и `:777` (`spec.themeTags`) индексируют `BASE_FLOOR_OBJECT_PROFILE_LAYERS` (`Record<number>` ключи 30/60/140, def :212) через `string[]`, скрыто `@ts-ignore` (:763/:776) → всегда `undefined`. Design+proc этажи собирают object/feature/decor профиль БЕЗ базового density-слоя. Самый весомый остаток, единственный влияет на live-контент shipped-пути.
  - **✅ SHIPPED (этот чат, 4 файла): ФИКС НЕ `route.z`** — тот диапазон −50..50 не совпадал с легаси-ключами {30..200}, так что «подтверждённая 2-строчка» была бы НЕВЕРНА. Реальный фикс: пере-ключевать `BASE_FLOOR_OBJECT_PROFILE_LAYERS` numeric→**biome-строки** {ministry/kvartiry/living/maintenance/hell/void}, индекс через `route.themeTags?.[0]`/`spec.themeTags?.[0]`, оба `@ts-ignore` удалены. Сопряжённый `craft_station_placement.ts` (`STORY_FLOOR_CRAFT_STATION_PROFILES` + `craftStationProfileForStoryFloor(biome)`) и gen-коллеры (`gen/craft_stations.ts`, `gen/floor_object_placement.ts`) мигрированы z→biome, захардкоженный `140` убит. Оракулы `floor-object-placement`/`craft-stations` 13/0 зелёные; `check:readonly` зелёный. **Урок:** никогда не применять «подтверждённый» фикс не прочитав реальные ключи (см. [[gen-suite-pre-broken]] дисциплину read-before-conclude). ⚠️ **Не путать** с NPC-populate-регрессией (см. Фаза 6 / [[gen-suite-pre-broken]]): та отдельная — ~8 design-этажей не зовут `applyDesignFloorPopulationField(generation, route)` → ambient NPC = 0. A4-1 = ОБЪЕКТЫ/декор, populate = NPC. Два разных «молча теряется».
- **A4-2 [P2 · REAL] `black_market_88/economy.ts` осиротел после децентрализации.** `BLACK_MARKET_88_STOCK`/`_DEBTS` (+типы `Market88StockRow`/`Market88DebtTemplate`) не потребляются НИЧЕМ в проде (ни `market.ts`, ни `npcs.ts`, ни barrel `index.ts` — реэкспортит только meta/geometry/npcs). Авторские stock/debt таблицы мертвы; 4 теста импортят через barrel → `undefined`. **Решение владельца:** переподключить `economy.ts` в генерацию рынка (+`export * from './economy'`) ЛИБО удалить. (Владелец уже сказал «сохранить фичи» → скорее переподключить.)
- **A4-3 [P2 · REAL] tutorial-intro route-objective недостижим.** `data/route_objective_fallbacks.ts:18` `storyFloor:100` + `route_cues.ts:306` `themeTags.includes('100')` — никогда не true → HUD fallback `living_tutorial_intro` не рендерится.
- **A4-4 [P2 · MECH] 2 теста импортят удалённый `src/gen/full_floor`** — `expandDesignFloorGeneration`, `retuneDesignFloorAfterCellTerritory` (`number-registry.test.ts:10,25`; `manhattan-crossroads-genfix-043.test.ts:10,37,43`). Символов нет нигде в `src/`; путь переехал в per-floor генераторы + `shared.ts` (`finalizeExpandedFloor`).
- **A4-5 [P2 · MECH] 8 покорёженных `.floor.LEVEL` ассертов** в 7 тестах кидают `TypeError` (нет поля `.floor`) — артефакт авто-переписи при удалении `FloorLevel`: `caravans.test.ts:356`, `monster_04_pustoy_sosed.test.ts:108`, `population-profiles.test.ts:135`, `items_019_body_bag_roll.test.ts:34,35`, `items_030_smoke_candle_check.test.ts:77`, `items_110_hermodoor_service_log.test.ts:39`, `items_157_mutant_tissue_sample.test.ts:81`. Интент ассерта утерян — реконструировать против `.z`/`floorKey`, не удалять.
- **A4-6 [P3 · MECH] полу-мигрированное поле `storyFloor:number`** — `systems/floor_keys.ts:35-36` (тип number, но `String(entry.storyFloor)` как design-id); мёртвое `currentStoryFloor:180` в `scripted_arrivals.ts:37,54` (0 читателей). **A4-7 [P3]** `scripts/render-procedural-floor-map.ts:5,17,328-333,337` импортит удалённые `FloorLevel`/`zForStoryFloor` (вне tsc-скоупа, гниёт). **A4-8 [P3]** stale WIP-комменты: `dark_metro/index.ts:185-188` (ложно «scatterAmbientLights потеряна» — она в `shared.ts:2314`), 6× `// Hooks moved from full_floor.ts`, `content-audit.mjs:1712` мёртвый allowlist.
- **Канон пост-миграции (якорь для завершающего):** runtime = `GameState.currentZ:number`; авторские = string `DesignFloorId` через `designFloorAtZ(z)`/`designFloorById(id)`; персист/роутинг = `floorKey` строки `design:<id>`/`procedural:<key>`/`floor_instance:<id>` (`data/floor_keys.ts`); dual-shape `FloorGeneration.isDecentralized?` vs `DesignFloorGeneration.isDecentralized:true` (`floor_manifest.ts:13-23`) — намеренно. Профиль-мапы ключуются по numeric z. **Removed** (не путать с renamed): `FloorLevel`,`STORY`,`biome`,`full_floor.ts`,`expandDesignFloorGeneration`,`retuneDesignFloorAfterCellTerritory`,`zForStoryFloor`,`storyFloorAtZ`. **Renamed-но-жив:** `…ForStoryFloor`/`isCurrentStoryFloor`/`designFloorAtZ` берут numeric z и работают. Единственное мёртвое поле — `storyFloor`/`currentStoryFloor`.
- **⚠️ Для завершения миграции:** гейты зелёные ПО ПОСТРОЕНИЮ, не по полноте. Кто «доделывает» — обязан гонять `test:generation` и починить покрытие `tsconfig`/`@ts-ignore`, чтобы дебри стали видимы CI.

### A5. Хардкод в игровой логике

**Итог:** RNG-миграция (Phase 1d) для генерации по сути завершена — `src/gen/`, `src/entities/`, `src/data/` содержат **ноль** `Math.random()`. Остаток `Math.random()` — визуал (`render/critters.ts`), аудио (`systems/audio.ts` ~50 сайтов), 1 меню-ролл (`main.ts:676`), 2 сетевых id-генератора. **Детерминированного геймплейного `Math.random()` не осталось.** `core/world.ts` чист. AI-спецкейсы монстров корректно ключуются на `MonsterKind`/snake_case `profile.id` (санкц. паттерн) — НЕ нарушение. Главные проблемы: **идентичность-по-русскому-display-name в generic-логике** и **контент-спецкейсы в RED-файлах**.

- **A5-1 [🚧 IN PROGRESS · SB6 · был P0] `systems/arena.ts` — live-фича на display-name identity + магик-коорды + мёртвый код.** :54,70,72,93,109 ветвят геймплей на `'Мастер Арены'`/`'Марко Лоло'`; :93 мёртвый `? 6 : 6`; :111-112 телепорт на хардкод `(100,63)`; :46-48 scaffolding-комменты («let's pretend / mocks for now»). Достижимо: `interactions.ts:671/694` + `plot.ts:847 registerSideQuest('arena_master')`. **Фикс:** роль арены через `NpcInteractionContext`/quest-tag/`plotNpcId`; вход по room-anchor/mark, не `(100,63)`; удалить мёртвый тернар. **🚧 SB6 IN PROGRESS: фиксы 1–3 (slug typo / dead ternary / de-hardcode) verified и готовы; телепорт: владелец выбрал скан `world.rooms` по RoomType+tag. **КОД НЕ ПРИМЕНЁН** — реализация в след. сессии. Полный план — §4B.**
- **A5-2 [P1 · RED-leak] `main.ts` — void-return-portal / creator-kill эндгейм-подсистема инлайн** (~90+ строк): `hasVoidSpike:2534`, `voidSpikeResolved:2540`, `creatorKillQuestSatisfied:2546`, `isVoidReturnPortalFloor:2552`, `removeCreatorFromResolvedVoid:2557`, `restoreVoidReturnPortalForCurrentWorld:2573`, `openVoidReturnPortalFromCreator:2598+`. **Фикс:** вынести в `systems/void_return_portal.ts` с generic-хуком.
- **A5-3 [P1 · RED-leak] безымянные магик-этаж-sentinel'ы в `main.ts`:** :5371 `nextFloor===200`, :5511 `===180`, :5518 `===200`, :5549-5551 `===100/180/200` (синематик), :5552-5560 OR-цепь на `designFloorId==='liquidatorbase'/'horrorfloor'/'cave_floor'`. Это target-коды ≠ реальному Z (void = `FLOOR_RUN_VOID_Z=-50`). **Фикс:** флаг `cinematic?`/endgame-role в `data/design_floors.ts`/`procedural_floors.ts`; назвать 100/180/200 константами рядом с `FLOOR_RUN_*_Z`.
- **A5-4 [P1] дефолт HP/maxHp/money `?? 100` дублируется ≥27×** (16 в `main.ts`: 854,879-880,2106,2190,2380,2678-2679,2684,4472,5362-5363,5368,9533,9796,9803; +`net_sphere.ts:447`,`scripted_arrivals.ts:116`,`online_client.ts:149`,`alife.ts`×2,`cell_hazards.ts`,`procedural_anomalies.ts`×2,`samosbor_director.ts:166-167`,`debug_cheats.ts:23`,`context.ts:112`). **`src/data/balance.ts` НЕ существует** — баланс doc-only. **Фикс:** `DEFAULT_MAX_HP=100`/`DEFAULT_MONEY=100` в `core/` или новом `data/balance.ts`.
- **A5-5 [P2] прочие display-string ветвления:** `main.ts:7460/8918` `access.label==='ЗАПЕРТО'` (дубль) → `access.reason` enum; `void_protocols.ts:827` `e.name==='Счетчик пошлины'` → mark/id; `heatline.ts:38-41` `name.includes('ремонт'/…)`; `caravans.ts:519` `room.name.includes('Караван'/'рынок'/'88')`; `quests.ts:1786` `'88'/'Толкучка'`, `:1979` `'архив'/'кабин'`; `territory.ts:489` `startsWith('Комната'/'Миништаб')`; `world_log.ts:780/297/299`; render/UI матчинг своих строк (`hud.ts:671/982-985`, `fast_elevator_ui.ts:107`, `net_sphere.ts:624/648`). **Фикс:** теги комнат на gen-time / структурные поля.
- **A5-6 [P2] `ai/monster.ts:705`** «громкое оружие» = хардкод-лист `'shotgun'|'toz_shotgun'|'noise_can'` в AI. **Фикс:** `loud?:boolean`/`noiseSeverity` на `WeaponDef` (fallback `severity>=4` уже рядом). **A5-7 [P2] `main.ts:5328`** `if (currentZ>=34) return; // Upper Bureau` — сырой литерал при живой `FLOOR_RUN_MAX_Z=50`. **A5-8 [P2/3] `render/webgl.ts:3708`** `hasTumannikRenderOffset()` спецкейсит `MonsterKind.TUMANNIK` — предпочесть generic render-флаг.
- **A5-9 [P3] Math.random-гигиена:** добавить exception-коммент в `online_client.ts:181 generateRoomCode` и `net_sphere.ts:697` (msg-id); перевести `render/critters.ts` (:48,50,51,60,70,71,75,79,160,184,191,198,206,207) и `systems/audio.ts` на `mathRng()`/`mathIrand()`, чтобы `rg Math.random` показывал только wrapper+crypto. **A5-10 [P3]** gen-модули ищут свои комнаты по `name===` (`black_market_88/geometry.ts:767-791`, `antenna_court`, `oranzhereya_betona`, `dark_metro:837-838`, `manhattan_crossroads:83-84/1221-1223`, `upper_bureau:1503-1507`, `istinniy_labirint`, `hyperbolic_switchyard:481`) — мигрировать на теги/retained refs.
- **Прочее:** `procedural_screens.ts` floor-Z магик `30/60/100/140/180` (:67-69,:123-154); `context.ts:182-183` пороги hunger/thirst `<20`; self-labeled temp: `main.ts:3452`,`9182` (WebKit heartbeat).

### A6. Runtime-системы и save/load (анти-паттерны)

**Итог:** дисциплина ИСКЛЮЧИТЕЛЬНО сильная. Железный Закон соблюдён везде: каждый `W*W`-скан — floor-load/gen-time или discrete-event (samosbor start, fog-boss death, scripted-arrival), НИКОГДА не per-frame. **Ни одного critical/high.** Нет per-module `setInterval` игрового кадра, нет refill-to-cap спавнера, нет JSON в per-frame hot-path, нет renderer-owned персист-стейта, нет осиротевших/пропущенных save-сериализаторов, нет cross-version миграции.

- Перф (все LOW): `scripted_arrivals.ts:72` full 1M-скан для LIFT-клеток (только при событии прибытия; кэшировать lift-индексы на floor-load); `main.ts:9469-9521` online host AOI (nested dist2 + sort, **online-host only**, `shouldSendHostSync`-gated); `main.ts:1118` `peerChanged` двойной `JSON.stringify` скаляров (**online-peer only**; заменить на `!==`); `render/webgl.ts:2728-2751` surface full-rebuild fallback (throttled 10 Hz, `>1024` marks + camera crosses tile; основной путь — partial `texSubImage2D`); `samosbor.ts:4665/4993` event-time zone-сканы (LOW-INFO); `render/critters.ts` `Math.random` в game-loop update (косметика, дублирует A5-9).
- Save/load — GOOD: `SAVE_SHAPE_VERSION=25` (`save_runtime.ts:22`; был 24, бамп в SB4 за `factionRelations`); `loadGame` (`main.ts:6272`) отвергает old/newer/invalid (:6280-6289); per-section sanitize/clamp (:6297-6467); active samosbor сбрасывается на load. Компактно: A-Life (`alife.ts:2696`) = seed+total+sparse overrides(cap)+deadIds(cap); floor-memory = XOR-RLE дельты vs регенерируемая база (1 активная запись, byte-budget); caps везде (`SAVE_CONTAINER_CAP=2048`, feature_loot исключён); events = fixed-ring + `trimEventHistoryForSave`; `msgLog` cap 500. Все 21 `*ForSave` подключены с matching restore. Save on-demand (1 caller `main.ts:7213`, нет autosave-интервала).
- **A6-min [VERY LOW]** `floor_memory.ts:951 sanitizedRleArray` — `data: stringValue(..., MAX_SAFE_INTEGER)` без явного len-cap (митигировано `validateRleArray:928` = должно декодиться ровно в `W*W` + byte-budget). Дешёвый defensive cap не помешает.
- **Намеренно НЕ в сейве** (детерм. регенерация, не gap): rumor, npc_memory, room_memory, map_exploration, contracts, caravans, territory/factionControl, faction *relations*. Персист-факты игрока (relation/karma/kills/deaths) свёрнуты в A-Life overrides. Таймеры чисты (`setTimeout` только async platform/network; кадр — tick-driven).

### A7. Квесты / плот / интерактив (E-dispatcher) / события

**Итог:** ЗДОРОВЫЙ слой. Квест-вайринг ключуется на `giverId === entity.id` (верно), plot-identity через numeric `plotNpcId` с **нулём** string/numeric спецкейсов в generic-системах, events-шина чистая и без контента, все `gen/living` модули достижимы. E-dispatcher импортит только sibling `systems/*` (0 импортов из `gen/`/`entities/`) — НЕ layer-violation.

- **A7-F1 [MED · dead] `spawnPendingPlotNpcsForFloor`** (`gen/plot_npc_spawn.ts:127-167`) — экспорт, **0 вызовов** во всём `src/ tests/ scripts/`. Superseded A-Life materialization + `requireSpawnedPlotNpcFromPackage`. **Фикс:** удалить (+unused imports `allNpcPackages`/`pickRandomRoom`/`findRandomFloorCell`), либо (по «сохранить фичи») подключить в реальный generic floor-spawn хук.
- **A7-F2 [LOW-MED · hardcode] `quests.ts:1979`** `room.name.includes('архив')||includes('кабин')` определяет «document work» (reward-tuning) по русскому display-тексту. Дублирует `RoomType.OFFICE`. **Фикс:** убрать `.includes`, опереться на `RoomType` (+`RoomType.ARCHIVE`/тег). (Тот же сайт всплыл в A5-5.)
- **A7-F3 [LOW · structure] E-dispatcher — хардкод priority-цепь**, не registry: `interactions.ts` ~20 `if (tryUseX()) return`. Bounded/корректно, partial generic-хук уже есть (`content_hooks.ts` `findContentInteractionTarget`/`tryUseContentInteraction`). Опц.: мигрировать хендлеры на self-register `{priority,tryTarget,tryUse}`.
- **A7-F4 [LOW · cosmetic] `plot.ts`** дубль `// Step 12` (:346,:361), комменты off-by-one vs индексы (chain 0-18). Runtime корректен (`plotStepIndex=i` :828; gate `requiresPlotStepDone:12` :608/:625 валиден). `storyNpcFloorKey`(~:103) с `@ts-ignore` non-exhaustive return — глянуть.
- **Позитив:** `events.ts` — эталон (ring-buffers, `compactEventData`, `cleanTags`, observer-caps, 0 контент-импортов). Plot-identity гигиена образцовая. `npc_interaction_options.ts`(642)/`dialogue.ts`(49) без хардкода. Нет осиротевшего контента.

### A8. Тесты (легаси / брутальные exact-count / незагейченный red)

**Итог:** 571 `*.test.ts`, два ДИЗЪЮНКТНЫХ раннера (`run-unit-tests.mjs:13-17` / `run-generation-tests.mjs:13-17`): файл «generation-coupled» ⟺ его исходник содержит `"../src/gen/"` ИЛИ имя матчит `/^items_\d+_/` (минус 1 исключение) → **299 gen-bucket + 272 unit-bucket**. `check:readonly` гоняет ТОЛЬКО `test:unit` (272, ЗЕЛЁНЫЙ); `test:generation` (299) — в НИ ОДНОМ гейте, глубоко RED. Два слоя долга: (1) брутальные exact-count в UNIT-suite (шипятся, ломают гейт при росте контента); (2) осиротевший gen-red = 5 корней, только 2 — реальные регрессии.

- **A8-1 [P1 · тот самый «399 иконок»] `art-sprite-manifest.test.ts:108` `assert.equal(ART_SPRITE_MANIFEST.length, 30)`** — проходит 5/5 сегодня; 31-й арт-спрайт ломает **shipped** `check:readonly`. Точный аналог жалобы владельца. Спутники в UNIT (тоже шипятся): `mesh-voxel.test.ts:224-225` (`triangleCount===108`/greedy `12`), `surface_marks.test.ts:74` (`stampedCount===48`), `territory.test.ts:121` (`changed===15`). **Только эти 4 брутальных сидят в shipped-гейте** — чинить ПЕРВЫМИ ради content-velocity. Юниверсал-переписи: `>= N` + инвариант (у art-manifest per-row инварианты уже есть :112-129; у mesh — `greedy < exposed && > 0`; у territory — `changed>0 && <=totalCells`).
- **A8-2 [НЕ ТРОГАТЬ — легит caps/контракты]:** `save_payload.test.ts:77` (16=`SAVE_DATA_KEY_CAP`), `platform-bridge:166-170` (64/1024/16 compaction caps), `crafting*` `materials.length===9` + `item-composition-def` `comp.length===9` (**CraftVector 9-мерен по контракту**, зеркалится `content-audit.mjs:1432`), `alife.test.ts:701` (65536 dead-id cap), `markov-demos-posts:288` (`saveShapeVersion()===24`), `sprites-floors:406` (`zones===64`=8×8 world-zoning), все `item-sprites` `Set(hashes).size===ids.length` (**инвариант РАЗЛИЧИМОСТИ силуэтов — эталонный паттерн**), `net-sphere` len-caps. **`content:audit` НЕ имеет content-count гейта** (только структурные `CraftVector.length!==9` :477/481, `CRAFT_MATERIAL_IDS` ровно 9 упорядочены :1432-1452). Иконочный гейт — это ТЕСТ (A8-1), не audit.
- **A8-3 [P2 · брутальные в GEN-suite]** (moot пока suite осиротевший, но плохой стиль → чинить в Фазе 5 заодно): `radon-exchange:106-107` (48/3800), `population-profiles:269-270` (898/53) + `:280` (`===ACTIVE_ACTOR_SOFT_LIMIT`, падает 1934≠2048), `penrose-laundry:141/148` (13/2), `maze-graph:42/43/128` (80/7/5), `events-economy:1110` (13), `pioneer-camp:70` (4), `hyperbolic-switchyard:70` (4), `monster_23_matka_dokumentov:25` (6), `number-registry:64` (3), `decision-triangles:113` (300).
- **A8-4 [дурацкие/противоречивые]:** **D1 always-fail single-arg `assert.equal(...)`** (2 семейства, 1 корень — авто-сед `FloorLevel`→z): Family A `.floor.ENUM` (упало `, FloorLevel` → member-access → `TypeError`): `items_019:34-35`, `items_110:39`, `items_157:81`, `items_030:77`, `monster_04:108`, `monster_13:29`, `kvartiry_communal_kitchen_feud:49`, `caravans:356`, `population-profiles:135`. Family B `===N` (запятая→`===` → boolean как единств. арг → `ERR_MISSING_ARGS`): `procedural-floors:629,798,825,878,888,2598`, `bank-floor:113`. Все в GEN → не ломают `check:readonly`, но зафиксированы сломанными и ничего не утверждают → переписать в 2-арг форму, НЕ «подгонять под pass». **D2 `voronoi-quarantine`** несогласованный SAMOSBOR-контракт (loop исключает SAMOSBOR :201/:183-184, отдельный тест ТРЕБУЕТ его :240) + невозможный `ambientTotal>=900` (:214, ambient=0). **D3 `cinematic_actors:122-123`** дубль-ключ `roomAt:()=>null` дважды (esbuild crash).
- **A8-5 [классификация `test:generation` red]:** (a) **18 файлов crash at load** — barrel `black_market_88/index.ts` реэкспортит meta/geometry/npcs, но НЕ `./economy` → `BLACK_MARKET_88_STOCK/_DEBTS/_CONTRACT_ROWS/Market88*` = undefined (`items_005/036/051/053/070/079/138/160/161/165/166/167/187/195/196/200`, `black-market-88`, `data-ids` — включая 52 KB `data-ids.test.ts`). **ONE-LINE FIX:** `export * from './economy';` (единственный split-dir barrel без реэкспорта economy). (b) always-fail `.floor` (=D1-A). (c) **8 esbuild syntax-corruption** (exhaustive): `sprites-floors:30` (`( as any)`), `cinematic_actors:122-123` (dup key), `items_115_water_reservoir_quota:14`/`items_156_water_reservoir_sample:15` (merged params `floor: resourceId:`), `items_147_lice_shampoo:58`/`items_193_bottle_empty:60`/`items_184_import_toiletpaper:58`/`items_186_roller_brush:42` (stray `)` в rolls-массиве). (d) **РЕАЛЬНАЯ регрессия (доминирует):** ambient/population = **0** → каскад в ~20+ файлов с ПРАВИЛЬНО-спроектированными range-асертами (`turing-nursery:163`, `voronoi-quarantine:214`, `production-belt:66,191`, `pioneer-camp:73`, `shahta-atrium:139`, `silicon-net-well-genfix-073:138`, `procedural-floors:5481/5761-5765/5837/5888/5992/6024/6469`, `moebius-podezd:215`, `maintenance-geometry:197`, `bank-floor:238`, `attractor-dvor:207,226`, `black-market-88:169`, `harmonic-bathhouse:203`, `slime-nii-genfix-039:118`) + `population-profiles:280` (1934≠2048). (e) behavioral tail (decision/quest-id mismatch, часто каскад из (d)). Load-crash total = 26 (8 syntax + 18 barrel); ~42 оценка = доп. missing-export цепи (Node ESM-линкер, статически не перечислить).
- **Кросс-cutting:** matrix env-gate прячет асерты (`generator_helpers.ts:38` skip `testGenerationMatrix` без `GIGAHRUSH_GENERATION_MATRIX=1`) → часть падений видна только внутри осиротевшего suite. Хороший паттерн УЖЕ есть (`procedural-floors` `>=400`/band, `item-sprites` distinctness) — брутальные это выбросы. Мусор: `art-sprite-manifest.test.ts.bak` (stale backup). Дебри (a)(b)(c)/D1 — механический полу-применённый сед; (d) — единственная настоящая engine-регрессия.

### A10. Render / UI / HUD / mobile

**Итог:** на высшей оси — ЧИСТО: **нет мутаций gameplay/persist-стейта в `render/`** (все «записи» render-локальны: dirty-версии в `glState`, map-маркеры из quest-стейта, thumbnail-пиксели). `input.ts` чист, `mobile.ts` современный (pointer events, capture/release, safe insets, data-driven rail). Долг в 2 запрещённых правилами корзинах: (1) **always-on фуллскрин-постпроцесс, ЗАДЕФОЛ�чен ON в 3 слоях**; (2) контент-спецификой в generic-рендере.

- **A10-1 [✅ SHIPPED · был P1 · taste-rule] always-on CRT/interference → выкл по дефолту.** ✅ Применено: `main.ts:9977` `0.32`→`0`; escalation `0.65` (samosbor/gameOver) сохранён; шейдер бьёт zero-cost early-out в норме; `check:readonly` зелёный. `webgl.ts:1873` `baselineStrength=interferenceMode*0.34`; дефолт-режим `'critical'` (`ui_orchestrator.ts:60`, метка «Слабо») → non-critical `screenInterference=0.32` (`main.ts:9975-9977`) → `baselineStrength≈0.109` каждый кадр → гонит весь блок `webgl.ts:1886-1940` (drift/chromatic+bleed/scanline/grain/vignette/phosphor). Дословно запрещённый «always-on grain/scanline/chromatic/vignette». **ФИКС (1 строка):** `0.32`→`0` в `main.ts:9977` → шейдер бьёт zero-cost early-out (`webgl.ts:1878`) в норме, эффект только на hazard. High.
- **A10-2 [✅ SHIPPED · был P1 · taste-rule] always-on HUD neuro-noise → выкл по дефолту.** ✅ Применено: `hud.ts:2106` — `drawStaticNoise`+`drawGlitchLine` гейтнуты на opt-in `interferenceMode==='full'`; samosbor-veils (`:1947-48`) отдельны, не тронуты. `hud.ts:2106-2108` `drawStaticNoise(...,0.0035)` + `drawGlitchLine` при `screenFxVisible` (`hud.ts:1434`, `screen_fx` дефолт true `ui_orchestrator.ts:31`, interference≠off). Второй always-on слой поверх A10-1. Дёшево (cached noise `hud_fx.ts:243-249`) → это taste/читаемость, не перф. **ФИКС:** гейт на реальный hazard/low-HP/samosbor вместо всегда-true `interferenceMode!=='off'`, или `0.0035`→`0`. High.
- **A10-3 [✅ SHIPPED · был P1 · taste-rule · overlaps SYSTEMS] global text-glitch → выкл по дефолту.** ✅ Применено: `localization.ts:363` `CANVAS_TEXT_GLITCH_BASE_PER_MILLE` `10`→`0`; low-HP/samosbor pressure-scaling (`50‰`, до `100‰`) сохранён; `loading_screen.ts` — отдельная копия глитча (loading-тема), вне scope. Оригинальный always-on `fillText`-monkey-patch → тихий на full-HP в норме. `systems/localization.ts:363` `CANVAS_TEXT_GLITCH_BASE_PER_MILLE=10` → ~1% букв КАЖДОЙ canvas-строки заменяются на `#%&*+=?/\<>[]{}` (:361), ре-ролл 85ms (:389), патчит `CanvasRenderingContext2D.prototype.fillText/strokeText` в `installCanvasLocalization` (:421+). `text_glitch` дефолт true (`ui_orchestrator.ts:34`). Нарушает «HUD/canvas текст читаем» + инвазивный глобальный prototype-patch (render-эффект спрятан в systems). **ФИКС:** base per-mille→`0` (глитч только под samosbor/low-HP — pressure-fn :378-382 уже масштабирует), или `text_glitch` дефолт false. Med-High.
- **A10-4 [P2 · content-leak · overlaps CORE] 2 именованных статус-эффекта захардкожены в generic blit-шейдер.** `webgl.ts:1858-1859` uniforms `u_istotitLevel`/`u_veretarLevel`, :1958-1968 tint-ветки, CPU-загрузка :3662-3667; те же в HUD `hud.ts:1318-1348` (`drawIcon 'icon_istotit'/'icon_veretar'`), лейблы :667-668/678/694; корень — не-generic 2-поле `statusEffects?:{istotit?;veretar?}` в `core/types.ts:676`. 3-й эффект = правка ~5-6 сайтов. **ФИКС:** generic status-tint канал (реестр `{id,tintColor,iconLabel,iconColor}` + keyed-map в core).
- **A10-5 [P2 · content-leak] `MonsterKind.TUMANNIK` dual-render спецкейс в горячем entity-loop.** `webgl.ts:3707-3711 hasTumannikRenderOffset` + :3909-3954, зовётся 3×/entity/кадр (:3909/3910/3933). (= A5-8.) **ФИКС:** generic `e.renderGhostOffsetX/Y`+`renderGhostReal` от AI; предикат 1×/entity.
- **A10-6 [P3 · content-leak] samosbor variant-id захардкожены в HUD-veil.** `hud.ts:1947-1948` `variantId==='maronary'→drawMaronaryProofNoise`, `==='veretar'→drawVeretarVeil`. Контраст — чистый data-driven `samosborScreenFxCode` switch (`webgl.ts:3694`). **ФИКС:** `hudOverlayFx` id на variant-def + реестр.
- **A10-7..15 [P2-Low]:** `critters.ts` 14× `Math.random` (:48,50,51,60,70,71,75,79,160,184,…) = A5-9/A6 (High, чинить); `critters.ts:34-107` render-модуль владеет per-frame симуляцией+аудио (`playSoundAt` :107) → вынести пул в `systems/critters.ts` (Med-Low); **`sprites.ts` нет guard `sprites.length===Spr.TOTAL`** (`sprite_index.ts:33-38` `TRAVELER_COUNT=3/PRIEST_COUNT=1/PERFORMER_COUNT=1` руками ↔ pushes `sprites.ts:32-38`) → тихий index-drift ломает ВСЕ последующие спрайты; **ФИКС: `throw` в конце `generateSprites()`** (текстуры уже безопасны через `Tex.COUNT`) — дешёвый must (Med); `webgl.ts:3436-3457 renderSceneGL` 21 позиционный параметр (call `main.ts:10031-10033`) — ровно arg-shift hazard из CLAUDE.md → `RenderSceneParams` объект (Med-Low); `hud.ts:1351-2119 drawHUD` ~768-строк god-функция (Med-Low); `input.ts:16 JOYSTICK_CONFIG.maxRadius:80` мёртв → удалить (High-conf); `sprite_index.ts:132-144` руч. `ART_NUDE_0..3`/`F69_FEMALE_NPC_0..7` (Low); `mobile.ts:206-208` type-unsafe cast (Low); `mobile.ts:91-102` магик-инсеты (Low).
- **Позитив (НЕ трогать):** нет gameplay-мутаций в render/; `drawNeuroPanel` — общий дровер (нет дубля панелей); gambling/card UI законно self-contained; raycaster на `Cell.DOOR/ABYSS` enum; blit-шейдер имеет zero-cost early-out (A10-1/2 = дефолт-value проблема, не отсутствие машинерии).

### A11. Экономика / фракции / A-Life

**Итог:** data-слои ОБРАЗЦОВЫ (цены из `def.value`, sparse-capped A-Life save, coherent corp→factory, нет refill-to-cap, смерти персистентны). Проблемы — **вайринг и персист**, не архитектура.

- **A11-1 [✅ SHIPPED · SB4 · был P1 · gameplay/persist-bug] фракц-стендинг игрока сбрасывается КАЖДЫЙ этаж и НЕ сохраняется.** `factionRels` — module-global `Int8Array(36)` (`data/relations.ts:12`), НЕ на `GameState`. `initFactionRelations()` (`relations.ts:46`) хард-ресетит к `BASE_FACTION_MATRIX`, зовётся в `switchFloor` (`main.ts:5435` — КАЖДЫЙ лифт!) + loadGame(6394)+initGame(3245)+void-return(2756)+death-continue(2317). Нет в save-whitelist (`save_payload.ts:94-129`, `save_runtime.ts:63-85`). → ~60 сайтов `addFactionRelMutual(PLAYER,…)` (ration_coupons/containers/contracts/faction_events/`caravans:319`/inventory/`quests:1247`/samosbor/gen) СТИРАЮТСЯ при переходе. `isHostile`→`areFactionsHostile` (`factions.ts:96,114`) читает эту матрицу → репутационные последствия не копятся. Персональный per-NPC канал ПЕРСИСТИТ верно (A-Life `getNpcPlayerRelation` `npc_relations.ts:20`, save `alife.ts:2740`). **ФИКС:** персистить PLAYER-строку в `GameState`+save; в `switchFloor` восстанавливать стендинг ПОСЛЕ `initFactionRelations()`, не хард-ресетить. (Объём intentful-сайтов ⇒ персист был задуман.) **✅ SHIPPED (SB4): решение владельца «сбросить только МОЮ репутацию» — персистится только PLAYER-строка; save-секция `factionRelations`, `SAVE_SHAPE_VERSION` 24→25. См. §4A.**
- **A11-2 [P1/HIGH · latent] 3 готовые подсистемы без reachable-пути** (владелец: «сохранить фичи» → ВАЙРИТЬ, не удалять): **stock** `stock_market.ts:272 buyShares`/`:302 sellShares`/`:514 summarize` (тикает `main.ts:9789`, рендер read-only `economy_ui.ts:200-330`, saved) → wire net-terminal overlay (parallel `'bank'` mode `net_terminal_gen.ts:123`); **bank** `banking.ts:204 openDeposit`/`:217 closeDeposit`/`:228 takeLoan`/`:242 repayLoan` (тик `main.ts:9788` no-op'ит, snapshot уже даёт `depositRubles`/`debtRubles`/`creditLimit` :827-828) → расширить `NetTerminalBankAction` (:124) + `activateNetTerminalBank` (:790); **caravan** 8 решений `caravans.ts:879/892/905/917/935/954/974/986` (+`summarize:1108`) — 0 вызовов, но несут faction-rel+resource+events → E-dispatch у каравана (зеркало `tryInteractCultProcession` `interactions.ts:621`, ближайший через `getNearestSmallCaravan` `hud.ts:1506`). (Караваны тикают/спавнятся `factions.ts:362`→`updateSmallCaravans`, HUD-хинт есть — инертны только глаголы-решения.) `buyFromNpc/sellToNpc` (`trade.ts:637/691`) — tests-only (шипнутый бартер = `executeTradeDeal` `main.ts:7570`).
- **A11-3 [MED · content-in-generic] «Lost Child» захардкожен в generic-материализаторе** `alife.ts:2518-2545` (`age<16 && dist2>400` → `canGiveQuest=true`). → вынести в `registerSideQuest`/`registerZoneContent`.
- **A11-4 [MED · persist] `state.caravans` не в whitelist** (есть normalize/sanitize+caps `caravans.ts:142-262`, но `ensureCaravanState` пересоздаёт дефолты на load) — добавить в `save_runtime.ts` ПОСЛЕ вайринга A11-2. **A11-5 [LOW]** `caravans.ts:519` name-includes `'Караван'/'рынок'/'88'` (= A5-5; следующая строка уже скорит по `room.type`) → убрать substring. **A11-6 [LOW]** `faction_events.ts:202-214` runtime module-global не-saved; баг: reset-clear (:1179-1189) ОПУСКАЕТ `activeFactionResidueSites`+`nextProcessionId` → residue прошлого рана линяет до z/expiry-prune.
- **A11-7 [ПОЗИТИВ · контракт A-Life ВЫПОЛНЕН]:** пул растёт только до `ALIFE_POPULATION=131072` (`alife_population_plan.ts:92`), рециклит `reserveArrivalRecordIndex` (:2108); `arrivalRecordReusable` (:2097) ОТКАЗЫВАЕТ dead/reserved-plot/touched/relation/kill-записям → убитые не заменяются молча; все callers — declared-reason; смерти персистентны (`recordAlifeNpcDeath:1728`+`deadPlotNpcIds`); `alifeForSave:2696` = seed+sparse-overrides+deadIds, capped. Эталон проекта. Цены data-driven (`economy.ts:508 basePrice=def.value`, множители capped :88-94); фабрики live; `banking`/`stockMarket`/`economy`/`production` имеют сериализаторы+в whitelist.

### A9. Дубликаты / спагетти / орфаны / god-файлы

**Итог:** архитектура ЗДОРОВА где важно — 5-слойный контракт держится, нет content→generic-system протечек, рендер не владеет gameplay-стейтом, RNG-дисциплина цела, циклических импортов НЕТ. Долг **КОНЦЕНТРИРОВАН, не системен**, и почти каждый пункт = **недоделанная миграция к УЖЕ существующему в репо паттерну** → рецепт всегда «доделать начатый механизм», НЕ «расколоть монолит на микросистемы» (совпадает с решением владельца). Долг в 4 местах: `gen/procedural_floor.ts` (16 270 строк), `systems/ai/monster.ts` (9 162), latent/test-only орфаны, cross-module micro-dup. `main.ts` (10 371) — де-факто третий god-file, но легит wiring/loop, НЕ контент → вне scope рефактора.

- **A9-D1 [P0 · HIGH leverage/LOW risk] hand-rolled proxy-grid хелперы vs canonical `proxy_grid.ts`.** `procedural_floor.ts` УЖЕ импортит canonical @L117-123, но ~6 recipe-семейств переизобретают toroidal downsample coord/index/delta: `smogProxyDelta@4394`, `collectorProxyDelta@4724`/`clampCollectorProxyCoord@4741`, `atticProxyCoord@5580`/`atticProxyIndex@5585`, `livingProxyCoord@7741`/`@7745`(dead O2), `sumpProxyIndex@9548`, `serviceProxyCoord@10612`/`@10617`, `myceliumProxyIndex@11987`/`@11993`. Canon: `proxy_grid.ts` (`createProxyGrid@101`, `wrapProxyCoord@121`, `proxyIndex@126`, `proxyCoord@130`, `proxySample01@167`). Каждое семейство инстанцирует один `ProxyGrid` своего размера + зовёт shared-хелперы; удалить per-family. Завершение начатой адопции, детерминизм сохраняется.
- **A9-D2 [P0] дублированный fmix32/lowbias32 hash-finalizer — 8 копий.** Идентичная цепь констант `0x85ebca6b/0xc2b2ae35/0x7feb352d/0x846ca68b/0x165667b1`. VarA (`h=seed^…`): `fieldHash01@1030`, `smogHash01@4401`, `collectorHash01@4731`. VarB (`x=(…)>>>0`): `atticHash01@5570`, `sumpHash01@9538`, `serviceHash01@10602`, `hashUnit3@14851`, `hashUnit@11997`. Canon: один `hash01(seed,a,b,salt)` рядом с seeded-утилями (или reuse `proxySample01@167` — уже этот хеш). Детерминизм сохраняется (те же константы).
- **A9-D3 [MED] `selectCinematicExtras` определён дважды дивергентно.** `systems/cinematic_actors.ts:4` (фильтрует `role===NpcRole.CINEMATIC_ACTOR`) vs `systems/alife.ts:2857` (доб. `_world:World` параметр, ДРОПАЕТ фильтр). Ни у одной нет src-caller; каждая гоняется своим тестом (dup+orphan, см. O5). Оставить `cinematic_actors.ts` (более корректная), удалить другую, обновить 2 теста.
- **A9-D4 [LOW cosmetic] cross-module clamp/wrap/hash.** canon `clamp` `core/math.ts:1`; toroidal wrap/dist через `World` (`wrap`/`delta`/`dist2`). Fold opportunistically при касании файла.
- **Не-дубликат (де-флаг, чтобы не гонять):** `procedural_anomalies` под И `gen/` И `systems/` — легит build-time-vs-runtime split (`conway_life` 203 gen строк vs 553 sys). Только крошечные shared-константы/`hash32` пересекаются. НЕ консолидировать.
- **A9-S1 [P1 · spaghetti] `generateProceduralFloor@16182` — ~55-call ordered overlay pipeline (`L16188-16267`).** Плоская строго-упорядоченная последовательность `applyX/placeX/spawnX/ensureX(world,rooms,spec,…)`; порядок load-bearing (geometry→zones→lifts→landmarks→loot→npcs/monsters→anomalies→connectivity-repair→bake). Sequential, НЕ tangled — но 55 inline вызовов = нечитаемо/небезопасно реордерить вручную. **Фикс (internal):** `const FLOOR_STAGES: FloorStage[]` из `{id,phase,run(ctx)}`-дескрипторов, один loop по shared `ctx`, по модели УЖЕ существующего `RECIPE_REGISTRY@procedural_geometry_recipes.ts:1125`+`executeRecipe@1138`. НЕ разбивать семейства на файлы.
- **A9-S2 [P1] `updateMonster@8885` — 45 хардкод `monsterKind===` веток** vs 104 уже-мигрированных `hasAIFlag()` (миграция ~70% done). Плюс kind-switch хелперы `rangedMonster*@6733-6890`, `wallTerrainTag/Text@3747-3784`. **Фикс:** доконвертить в `MonsterAIFlag`-lookups + per-kind update-registry `Record<MonsterKind,MonsterUpdateFn>`. Behavior-parity обязателен (⇒ P1). Per-creature кластеры — легит density, НЕ split.
- **A9-S3 [MED] barrel `gen/black_market_88/index.ts` пропускает `./economy`** (= A4-2 / A8-5a): re-экспортит meta/geometry/npcs, но не economy → `BLACK_MARKET_88_STOCK/_DEBTS` через barrel = `undefined` (`index.ts:6,65,66`; consumed broken-тестами). Фикс: `export * from './economy';`.
- **A9 Orphan-table (owner: «сохранить фичи» ⇒ wire, НЕ delete-on-sight):**
  - **O1 [LATENT·wire]** `arena_rewards.ts:9 grantArenaChampionRewards` — нет src-caller, но downstream полностью подключён (event `core/types.ts`, `rumor.ts`, `data/rumors.ts`). Вайрить в arena-win path. (= Фаза 3.)
  - **O2 [LATENT]** `procedural_floor.ts` living-block island `livingProxyCoord@7741→buildLivingBlockAt@8008→buildLivingBlockRooms@8161` (~L7741-8239, ~500 строк) — полный генератор, 0 live-caller. Owner: wire как recipe/anomaly ИЛИ delete.
  - **O3 [LATENT/superseded]** `buildArchiveWarrenRooms@2212` (~L2212-2503, ~290) — 0 caller; фича ЖИВА через иначе-названный `applyArchiveWarrens@6574`. Проверить exclusive-хелперы перед delete.
  - **O4 [JUNK-lean]** `roomSize@367` — 0 caller, superseded sizing. Delete after confirm (единственный чистый delete-кандидат в коде).
  - **O5 [LATENT dead]** `cinematic_actors.ts` (весь файл, 4 экспорта) — test-only; `selectCinematicExtras` дивергентно дублирован (= D3). Consolidate+wire или delete файл.
  - **O6 [LATENT]** test-only: `systems/markov_log_speech.ts`, `systems/demos_ai_social.ts`, `render/material_patterns.ts`. Keep, wire когда фича придёт.
  - **O7 [LATENT]** `gen/black_market_88/economy.ts` `BLACK_MARKET_88_STOCK@82`/`_DEBTS@275` — 0 prod-consumer (barrel скипает; только broken-тесты). = A4-2. Owner: re-hook или delete.
  - **O8 [LATENT parked]** `systems/procedural_anomalies/bad_apple_world_experiment.ts` (581 строк) — parked; live-path stub; флаг `BAD_APPLE_EXPERIMENT_ENABLED=false` НИКОГДА не читается. Keep, note dead flag.
  - **O9 [НЕ orphan]** `render/blood.ts` (`export * from '../systems/blood_fx'`) — ЖИВ (`main.ts:74`, `webgl.ts:22`). Опц. inline.
  - **O10 [НЕ orphan]** `data/markov_compiled_matrix_stub.ts`, `systems/demos_runtime.ts` — wired (vite build-alias / side-effect import `main.ts:5`). Keep, НЕ удалять.
  - **O11 [JUNK]** `tests/art-sprite-manifest.test.ts.bak` — не гоняется. Safe delete (= Фаза 1a добор).
- **A9 явно-проверенные подсистемы (⚠️ reconcile с A11-2):** **Banking** — на МОДУЛЬ-уровне wired: `tickBankingInterest@main.ts:9788`, `bankingSummary→render/economy_ui.ts`, сериализован. **Stock market** — wired: `tickStockMarket@main.ts:9789`, `stockMarketSnapshot→economy_ui.ts`, `stockMarketForSave`. **НО это НЕ отменяет A11-2:** A9 проверил tick/snapshot/save (пассивная симуляция + рендер + персист идут), A11-2 проверил player-action-глаголы (`buyShares/sellShares/openDeposit/closeDeposit/takeLoan/repayLoan` + 8 caravan-decisions) — у них 0 callers, нет reachable UI/E-dispatch. **Итог: симуляция крутится, но игрок НЕ может депнуть/купить.** Фаза 3 (A11-2 wiring) остаётся в силе. **Companion** — системы НЕТ (слово только в base64-blob `data/markov_compiled_matrix.ts:7916`). **Achievements** — 0 ссылок в src/tests, системы нет.
- **A9 god-file seam-recs (INTERNAL structure only, НЕ фрагментировать):** `monster.ts` (9162, 350 fns) → доделать `aiFlags`-миграцию (A9-S2). `procedural_floor.ts` (16270, 2 экспорта) → (1) `FLOOR_STAGES` stage-table (A9-S1); (2) доделать `proxy_grid`+`hash01` (D1/D2); (3) удалить ~800-1100 dead строк (O2/O3/O4, `roomSize` delete-ready). Section-maps детально в отчёте субагента (не дублирую).
- **A9 приоритеты:** P0 = F1(D1+D2 механич./детерм.), F2(O2/O3/O4 dead ~800-1100 строк classify). P1 = F3(S2 aiFlags), F4(S1 stage-table), F5(O1 arena wire), F6(D3/O5 cinematic), F7(S3/O7 barrel). P2 = F8(O6), F9(O8 flag), F10(O9 inline), F11(O11 .bak), F12(D4). **Тема:** оба god-файла ~70% мигрированы к уже-в-репо паттернам (`hasAIFlag`; `proxy_grid`+`RECIPE_REGISTRY`) — «доделать» удовлетворяет no-micro-systems by construction.

### A12. Дрейф доков vs код

**Итог:** контракт-доки ТОЧНЫ (`save.md` v24/caps, `ai.md` nav = Region-Portal HPA* line-for-line, `optimization.md` Iron Law зеркалит `pathfinding.ts:1096-1099` дословно; `architecture.md` §4 ownership + §11 Floor Arch переписаны корректно под post-migration `src/gen/<floor>/`). Дрейф СКОНЦЕНТРИРОВАН на floor-migration поверхности (FloorLevel→numeric-z / `full_floor.ts` removal оставлен полу-задокументированным) — доки противоречат САМИ СЕБЕ. Ничего не over-promise'ит unshipped-систему как shipped; отказы = stale конструкты/пути/счётчики. **`FloorLevel` — single highest-yield термин: `rg -n "FloorLevel" README.md architecture.md floors.md alife.md` = точные строки к правке (0 ссылок в `src/`).**

- **A12-HIGH:**
  - `README.md:303-312` печатает `FloorLevel` enum-таблицу (`MINISTRY=0…VOID=5`) как current + «определены в `FloorLevel` в `src/core/types.ts`» — но `rg FloorLevel src/`=**0**. Противоречит `README:287` («полностью консолидирована») и `README:314` (те же 6 корректно в 50 `DESIGN_FLOOR_ROUTES`). Double-documented. Фикс: убрать enum-framing, оставить design-floor route-stops.
  - `architecture.md:35` «6 FloorLevel + 41 design + 54 procedural» → реально `DESIGN_FLOOR_ROUTES`=**50** (`design_floors.ts:67`) + `PROCEDURAL_FLOOR_COUNT`=**50** (`procedural_floors.ts:208`); 6 базовых сложены в 50 design.
  - `architecture.md:412` + `optimization.md:428` называют удалённый `full_floor.ts` «integration layer»/«bakes again after expansion» — файл MISSING; expansion децентрализован в per-floor `index.ts` («Hooks moved from full_floor.ts»); nav-bake lazy @`pathfinding.ts:375/1104`.
  - `architecture.md:44` save version `21` → реально `24` (`save_runtime.ts:21`; `save.md:13` корректен). Инженерный контракт-док устарел на 2 релиза.
- **A12-MED:**
  - `README:199` code-map «`floor_manifest.ts FloorLevel→карта`» + `architecture.md:410` «FloorLevel→generator, story floor» → реально string theme-tag dispatch (`FLOOR_NAMES`/`FLOOR_MESSAGE_COLORS` по theme-тегам; импортит `designFloorAtZ`/`generateProceduralFloor`).
  - `architecture.md:414` `design_floors/roof.ts` MISSING → реально `src/gen/roof/geometry.ts:1233` (`rebuildRoofSkyPixels`/`RoofSkyTextureProvider`). `architecture.md:75` type-list вкл. removed `FloorLevel`.
  - `floors.md:9/33/63` «базовый FloorLevel»/«не добавлять новый FloorLevel» — конструкт удалён (заменить на floor-key/z); `floors.md:29` «генератором в `design_floors/`» → генераторы в per-floor `src/gen/<floor>/`, регистрация через `design_floors/manifest.ts`.
  - `alife.md:168/217/312` «base FloorLevel byte column» → реально `floorKeyIndex:Uint16Array` (`alife.ts:292`) в interned `floorKeys:string[]` (`alife.ts:326`). (`architecture.md:43` age/sex byte-columns — ТОЧНО, ошибочен только floor-column и только в `alife.md`.)
  - `optimization.md:176/194` `render/marks.ts` MISSING → `systems/surface_marks.ts` + `surfaceVersion`-bumps `core/world.ts:108,414,429,435`.
  - `README:384` «20 аномалий» перечисляет 17; id `hladon_cold_pocket`→реально `hladon` (`procedural_floors.ts:43,414`); `FloorAnomalyId` union = **19** real + `none`; body пропускает `bad_apple_world`+`sandpile_perekrytie`.
  - `README:223` events «(512/128/32)» → реально `1024/512/128` (`types.ts:889-891`). `README:560`+table «18 сюжетных шагов» → `PLOT_CHAIN`=**19** (`plot.ts:190`), одна строка недокументирована.
- **A12-LOW:** `README:371` «34 модуля зон `registerZoneContent`» → **35**; `README:449` «446 предметных ID» → **~452** (`items.ts:377-848`=411 literal + `DOCUMENT_ACCESS_ITEMS`=35 + `CHERNOBOG_DOCKET_ITEMS`=6; 2 dynamic-spread @`items.ts:816-817` → README лишь marginally off); `README:186` «577 слухов» → `BASE_RUMORS`≈**571** (`rumors.ts:61`); `README:70/84` `test:generation` без caveat (orphaned/не gate-clean).
- **A12 cross-cut:** доки внутренне НЕПОСЛЕДОВАТЕЛЬНЫ (мигрированная + stale половины рядом; doc-pass обновил «как строятся этажи», но пропустил enum-таблицы/fact-map/import-contention). Нужен **точечный sweep конкретных строк, НЕ переписывание**. Контракт-доки (`save.md`/`ai.md` nav/`optimization.md` Iron Law) — trustworthy tier. **Не-drift (не трогать):** `architecture.md:720` `src/content.ts` (пример анти-паттерна), `:593`/`floor_catalog.ts` («data-only future» честно), `README:412` MonsterKind=69 (verified `types.ts:197`). → правки в Фазу 6 (после кода) или отдельный docs-sweep.

---

## Продолжение сессии 2026-07-28 (docs-supplement по прямому указанию владельца)

> Владелец: «дополняй master_prompt.md своим контекстом и всё что сделал и что план ещё пополни README.md и сопутствующие документы всем что сделал». Это ДОБАВЛЕНИЕ к handoff, не переписывание. Docs-only → runtime-гейт не требуется (`git diff --check` чист); коммита НЕТ без явного разрешения.

### Сделано в этой сессии (только доки, 0 правок кода)
- **README.md — 4 хирургических правки, ПРИМЕНЕНЫ** (закрывают часть A12-дрейфа, всё сверено с source, не по памяти):
  1. `:199` code-map: `floor_manifest.ts FloorLevel→карта` → `карта генераторов по z и theme-тегам` (A12-MED).
  2. `:223` event-caps `(512/128/32)` → `(1024/512/128)` (сверено `types.ts:889-891`; A12-MED).
  3. `:303` заголовок+рамка: убрано «определены в `FloorLevel` в `src/core/types.ts`», вписано «прежний enum `FloorLevel` удалён — 0 ссылок в `src/`, идентичность этажа = числовая координата `z`» (A12-HIGH bullet 1).
  4. `:305-312` таблица биомов: первый столбец `MINISTRY=0`…`VOID=5` → theme-теги `ministry/kvartiry/living/maintenance/hell/void`; ВСЕ z/generator/role данные сохранены дословно (ministry z=+30, kvartiry z=+14, living z=0, maintenance z=−26, hell z=−36, void z=−50).
- **problems.md — 8 строк в таблицу «Активные проблемы», ПРИМЕНЕНЫ** (формат `[Аудит 2026-07-28 · DEFERRED]`, зеркалит существующую `[РЕШЕНО]`-конвенцию; каждая = симптом+anchor+критерий закрытия): #9 (побочки giverId-frozen), #25 (3 TALK-контракта), #45 (эндшпиль-лифты одностор.), #149 (main-quest STEP 11 hard-blocker), #109 (малые караваны, +маскирует #110/#111), #171/#181 (stale `_z`-ключи оверрайдов), #170 (radon_exchange инертен), #179/#180 (самосбор варианты/aftermath). Полные доказательства — во внешнем ledger (см. ниже); в problems.md только симптом+критерий, без пересказа audit-логов.
- **master_prompt.md — этот раздел** (context+сделанное+план).

### Внешний ledger — единый источник по находкам
Полный реестр находок живёт в agent-memory ВНЕ репозитория (не коммитить, не ссылаться из repo-доков): `~/.claude/projects/-Users-jirnyak-Mirror-gigahrush/memory/confirmed-audit-bugs-deferred.md` (~486KB — читать только через `grep`, не целиком). Индекс — `MEMORY.md` (строка 8 = указатель на #1–#181). **Нумерация: последняя заведённая находка = #181, следующая свободная = #182.** Новые находки вставлять ПЕРЕД якорем `**Wave-2 NEGATIVE lanes …**`. Формат: #1–65 = `NN.`, #100+ = `**#NNN —**`. Все находки #1–#181 = **DEFERRED**: применять/коммитить только после sign-off владельца (см. дисциплину ниже).

### Коррекция §5.3 (populate-regression — STALE, снята)
Прежнее утверждение «design floors зовут `align…AmbientNpcTerritory`, но не `applyDesignFloorPopulationField` → 0 ambient NPC» — **НЕВЕРНО/устарело**. `applyDesignFloorPopulationField` И `full_floor.ts` УДАЛЕНЫ. Популяция теперь ЦЕНТРАЛИЗОВАНА безусловно для каждого design-этажа в `src/gen/design_floors/manifest.ts` (`:171 populateDesignFloorAmbientNpcs(gen, route)` + `:175 populateDesignFloorMonsters`, гейт `:178 floorRunZAllowsNpcs(route.z) ? gen : withoutNpcEntities(gen)`), читает `design_floor_population.ts designFloorPopulationProfile`. «Дыры missing-call» НЕТ. Реальные остаточные дефекты популяции — иной механизм: **#170** (radon z=44) и **#171** (stale-ключи оверрайдов). См. [[gen-suite-pre-broken]].

### Чистые NEGATIVE-полосы, прочёсанные в этой сессии (НЕ пере-запускать — пусто)
- item-use dispatch — корректен.
- document-floors-gate — ограничен ровно #163 (уже в ledger), новых нет.
- weapon→ammo резолв — 20/20 разрешаются.
- craft-рецепты — генеративны (не hardcode), источники `craft_recipe_sources.ts` 40/40 разрешаются в реальные ITEM id.

### В работе на момент паузы (кандидат в #182)
Полоса occupation-profile phantom-item: `occupation_profiles.ts` кладёт medkit/pencil в `tradeItems`, metal/tools в `questFetchItems`. Крукс — фильтруются ли эти пулы против реального `ITEMS` реестра в `generateNpcTradeItems` (`quests.ts:785-810`) и quest-fetch пулах (`quests.ts:2062/2081`). Если фантом реально доходит до игрока — завести как **#182 DEFER**; если пулы фильтруют — записать как чистую NEGATIVE-полосу. Проверка не докручена.

### Состояние репозитория (важно для следующего агента)
- HEAD = `18b69100` «Аудит: фаза 2» на `origin/main`.
- **Рабочее дерево ГРЯЗНОЕ чужой параллельной UI-работой:** `M src/render/{economy_ui,hud,item_sprites,npc_ui,stats_ui,ui_layout}.ts` + `?? scripts/ui-shots.mjs`. **НЕ трогать / не стейджить / не ревертить / не коммитить / не редактировать эти файлы; hud.ts — особо off-limits; не заводить в них находок.**
- `git stash@{0}` = `gemini-floorlevel-string-refactor-WIP-broken-2026-06-13` (427 файлов) — припаркованный сломанный рефактор Gemini. НЕ `pop`/`apply`/`drop` без явного указания владельца.
- Мои правки этой сессии добавляют к грязному дереву только: `M README.md`, `M problems.md`, `M master_prompt.md`. `git diff --check` чист.

### Остаточный drift-delta README (в отложенный docs-sweep, НЕ фиксил — риск фабрикации/churn)
Осознанно НЕ тронуто (правка = либо выдумывание из памяти, либо частый churn-счётчик — сверять с source в момент sweep):
- `README:384` «20 аномалий» (перечислено 17; id `hladon_cold_pocket`→`hladon`; пропущены `bad_apple_world`+`sandpile_perekrytie`; `FloorAnomalyId` union=19 real+`none`).
- `README:560`+таблица «18 сюжетных шагов» → `PLOT_CHAIN`=19 (`plot.ts:190`); достроить таблицу из памяти = фабрикация, к тому же 19-й шаг и #149 soft-lock — отложенные баги; при sweep добавить строку + сноску про #149.
- `README:371` «34 модуля зон»→35; `README:449` «446 предметных ID»→~452; `README:186` «577 слухов»→~571; `README:70/84` `test:generation` без caveat (orphaned/не gate-clean).
- **НЕ тронуты вовсе в этой сессии** (только README получил 4 правки): FloorLevel-дрейф в `architecture.md` (`:35/:44/:75/:410/:412/:414`), `floors.md` (`:9/:29/:33/:63`), `alife.md` (`:168/:217/:312`), `optimization.md` (`:176/:194/:428`) — все перечислены в A12 выше, ждут точечного sweep (правка конкретных строк, НЕ переписывание).

### Дисциплина автономии (неизменна — управляет ЛЮБЫМ действием над кодом)
SHIP автономно ТОЛЬКО если ВСЁ верно: byte-identical при нормальной первой игре И byte-identical для любого входа кроме точного багового случая И механично И не-RED файл И без изменения gameplay/баланса/reachability И не включает мёртвый код И направление фикса — не design-call. Иначе DEFER. В этой сессии правок КОДА = 0. Doc-задача была явно санкционирована владельцем; коммит по-прежнему требует явного разрешения.

---

## Продолжение сессии 2026-07-29 (фаза-3 SHIPPED в LOCAL main + пуш по прямому указанию владельца)

> Владелец: «дополняй всё что сделал в master_prompt.md, а также дополни README.md и все сопутствующие документы, а потом коммит и пуш на гитхаб». Это **явно санкционирует пуш** (снимает прежнее «только LOCAL main, не пушить») и правку master_prompt.md/README.md/доков. Правки — хирургические аддитивные; чужая UI-работа в грязном дереве (`src/render/*.ts` + `scripts/ui-shots.mjs`) НЕ трогается / не стейджится / не коммитится.

### Что такое фаза-3
После sign-off владельца (2026-07-28) в LOCAL `main` лёг **code-forced ship-safe** подмножество находок аудита A1–A12 (полный реестр — во внешнем ledger, симптомы — в §4A/§4B/Appendix A выше) — ровно те, что проходят «Дисциплину автономии» § выше: механичные, не-RED, byte-identical на нормальной первой игре, без изменения баланса/дизайна/reachability сверх точечного багового случая. Балансовые, RED-файловые и design-call находки остались **DEFERRED**. Итог: **25 коммитов `Аудит: фаза 3 — …`** (19 фиксов + 6 регресс-замков), `origin/main` был на `18b69100` (фаза 2). Все 25 гейт-зелёные (`npm run check` EXIT=0; `test:unit` без регрессий). Пушатся в этой сессии.

### Батч фиксов (19 коммитов) — реставрация мёртвого/замороженного авторского контента, без новых систем
- `5bd3ce5c` **#9** — `giverId` сайд-квестов размораживается бэкфиллом после регистрации NPC-пакета → 416/421 побочек снова выдаются (`plot.ts` + `black_market_88`/`silicon_net_well` npcs + `quests.ts`; со-коммитнут `tests/side-quest-giver-backfill.test.ts`).
- `28ab0689` **#97–99, #168, #169** — double-dip взаимоисключающих сайд-квестов закрыт: ВСЕ ЧЕТЫРЕ abandon+block-связи (инвариант #96: неполный fix оставлял дыру).
- `9d86353c` **#25, #125** — ленивый резолв целевого NPC контрактов + TALK-матч с фолбэком (`contracts.ts` + `quests.ts`); контракты и кросс-этажные TALK-сайдквесты засчитываются (`tests/contract-target-npc-resolve.test.ts`).
- `44ba61e3` **#1, #2, #3, #6** — запечатанные комнаты (orphan `Cell.DOOR`) распечатаны + `room.doors` базы ликвидаторов.
- `42ec69b2` **#24** — контрплей серобурмалина «не смотреть» оживлён.
- `d057f75b` **#40, #50–54** + `af4ebd83` — мёртвые биом-механики восстановлены (инвертированный theme-gate; второй коммит — тот же класс для pneumomail).
- `0c63e21c` **#113, #60** + `c9a5939b` (social_pressure + npc_package_speech) — регрессия `.id`-всегда-истинно (git-регрессия `83062ee1`: `.plotNpcId`→`.id`) восстановлена.
- `99c9394f` **#149 [HARD BLOCKER]** — главный квест, шаг 11 (VISIT Ministry) конструируется: +`visitFloorZ` +`targetRoute.designFloorId:'ministry'` (ветка B `generatePlotQuest` + позиционный route-резолв z=30) → цепочка доходит до финала (шаги 12–18: Podad→Марфа→Вестники→Пустота→Творец).
- `631e7134` **#35** — голова-слизень: detached-стадия попадает в ключ спрайта.
- `f73f6f2a` **#64, #174** — поле `z` маркеров маршрута (WRONG-FIELD + снятие `@ts-ignore`).
- `08533b9a` **#109** + `97d14d73` **#111** — малые караваны: `smallCaravanMemberEligible` снова пускает `isPlotNpc` (караваны спавнятся) + статус `'escorted'` терминальный (стоп двойной доставки).
- `681919f9` **#61** + `793683a2` **#67** — самосбор: вес вариантов и пост-биты гейтятся по `def.floors` (theme-токены), не `def.tags` (WRONG-FIELD).
- `459928c3` **#119** — A-Life миграция: селектор учитывает `minAbsZ` (dead-authored-field).
- `b6772a00` **#127** — A-Life лидерборд не считает тело игрока (death-continuation) своим соперником.
- `51b87309` **#171, #181** — stale `_z` ключи 3 design-этажных оверрайд-мап → реальные `route.id` (`bank_floor`/`service_floor`/`horrorfloor`).

### Регресс-замки (6 коммитов) — все попадают в gated `test:unit`
Замки импортят только из `data`/`systems`/`entities`/`core` (никогда `../src/gen/`), иначе раннер шунтирует их в осиротевший `test:generation` вне гейта (см. §5.2/A8):
- `e9e68d01` + `33ca2c30` — theme-gate теплотрассы (замок полярности `d057f75b`); второй коммит — `git mv` из `tests/systems/` (раннер её НЕ сканирует) в `tests/`, где тест реально исполняется (+ suite `summarizeHeatline`).
- `995f21c5` **#61/#67** — область самосбора по `.floors`, не `.tags`.
- `32021916` **#127** — доска A-Life не считает вселённое тело соперником.
- `f56288f2` **#35** — ключ спрайта отделившейся стадии головы-слизня.
- `093f4737` **#149** — конструируемость шага 11 главного квеста.

### Всё ещё DEFERRED (нужен свежий sign-off — НЕ применять/не пушить фиксы без него)
- **#45** — эндшпиль-маршрут запечатан (roof z=+50 / void z=−50 недостижимы обычным лифтом; `ensureReachableRouteLifts` built-but-unwired). RED (`gen/shared.ts`) + design-call (одностор. gate намеренный?). **Единственный оставшийся top-blocker.**
- **#170** — radon_exchange (z=44): авторский NPC-профиль инертен (author-intent: явный `npcTarget` vs граница `|z|>=44`).
- **#179/#180** — самосбор variant+aftermath биом-гейты (FIELD-MIGRATION-RENAME — отдельный класс от `#61/#67` WRONG-FIELD, тем батчем НЕ закрыт).
- Балансовые/RED: combat/armor resist, #73 (`alife` floorKey→band-z), #110 (caravan save-секция), arena payout unwired, plot_outcomes route-tag mismatches.

### Сопутствующие доки, обновлённые в этой сессии
- **problems.md** — 6 DEFERRED-строк аудита переведены в `[РЕШЕНО 2026-07-29 · фаза-3]` с фиксом+SHA (конвенция строк `[РЕШЕНО 2026-07-27]`): #9, #25, #149, #109/#111, #171/#181, самосбор #61/#67. Оставлены DEFERRED: #45 (эндшпиль-лифты), #170 (radon).
- **README.md** — фаза-3 реставрирует поведение, которое README уже описывает как рабочее (главный квест проходим, побочки выдаются, комнаты распечатаны), поэтому shipped-факты README не менялись под фаза-3; вместо этого добит остаточный A12-drift (счётчики сверены с source в этой сессии, НЕ по памяти). Применено 6 правок: `577→582` слуха (`BASE_RUMORS`, `rumors.ts:61`, независимо подтверждено 582); `34→33` модуля зон (`registerZoneContent`: 38 grep − 1 определение = 37 регистраций в 33 модулях, «34» считало файл-определение); `20→19` аномалий (`FloorAnomalyId` union = 19 real + `none`; 18 активны [7 inline + 11 module] + `bad_apple_world` `mode:'none'`; исправлен фантомный id `hladon_cold_pocket→hladon`, добавлены пропущенные `sandpile_perekrytie`+`bad_apple_world`); `18→19` сюжетных шагов + достроена строка 19 таблицы (Жан Пустотник / FETCH / вернуть пустотный шип — финальный `void_warning`-шаг `plot.ts:428`, «18» промахивалось из-за дублированного `// Step 12`). **`446 предметных ID` перепроверено и ВЕРНО** (413 literal + 27 `DOCUMENT_ACCESS_ITEMS` + 6 `CHERNOBOG_DOCKET_ITEMS`) — не менялось. Прежние оценки §498 (`~452`/`~571`/`35`) были приблизительными («~») и заменены этими сверёнными числами. FloorLevel-drift в `architecture.md`/`floors.md`/`alife.md`/`optimization.md` — по-прежнему в отложенном docs-sweep (перечислен в §498 выше).

### Состояние репозитория (обновление к §488 выше — та секция писалась до фаза-3 и устарела)
- HEAD = `093f4737`; **25 коммитов впереди `origin/main` (`18b69100`)**; пуш в этой сессии по указанию владельца.
- Грязное дерево (НЕ моё, НЕ трогать/не стейджить/не ревертить): `M src/render/{economy_ui,hud,item_sprites,npc_ui,stats_ui,ui_layout}.ts` + `?? scripts/ui-shots.mjs` — параллельная UI-работа владельца.
- Мои docs-правки этой сессии (стейджатся отдельным docs-коммитом поверх фаза-3): `master_prompt.md` (этот раздел), `problems.md`, `README.md`.
- `git stash@{0}` = `gemini-floorlevel-string-refactor-WIP-broken` — по-прежнему НЕ трогать.
- Полный реестр находок #1–#181 — во внешнем ledger (`~/.claude/.../memory/confirmed-audit-bugs-deferred.md`), не в репо.

# Problems Audit

| Mystical A-Life Test Failures | Тесты `alife.test.ts` (например, ожидающие, что `id: 1` — это обычный прохожий с деньгами) внезапно упали, хотя сами тесты и логика A-Life не менялись с 4 июля, а после этого было множество успешных деплоев. Причина: `id: 1` стал сюжетным NPC (Ольга Дмитриевна из `MAIN_PLOT_NPC_PACKAGES`), который не спавнится как обычная массовка. **Мистика и бред** в том, как эти тесты вообще проходили в CI всё это время. | Использовать `populationPlan: 'empty_packages'` в тестовом `setAlifeState`, чтобы изолировать тесты массовки от сюжетных NPC и вернуть `id: 1` обычным бомжам. |
> Центральный документ проблемных механик.
>
> Роль: здесь остаются только актуальные проблемы, которые уже существуют в коде и еще не встроены чисто в один центральный системный документ. Закрытые правки, журналы проходов, списки архивов и отчеты проверок сюда не добавляются.

Актуально на 2026-07-27. Фокус файла: текущие системные долги, которые создают частные связи между `core`, `data`, `gen`, `systems`, `render`, сохранениями, квестами, A-Life и UI.

## Правило ведения

Каждый пункт должен содержать:

- текущий симптом в коде или поведении;
- почему это системная проблема, а не разовая косметика;
- критерий закрытия, который можно проверить тестом, аудитом или browser-check.

Не хранить здесь:

- закрытые пункты;
- пересказы `audit_N`, `fixes_N` и командных логов;
- архивные пути;
- списки уже прошедших проверок;
- обещания будущих систем без наблюдаемого текущего симптома.

## Активные проблемы

| Область | Текущий симптом | Критерий закрытия |
| --- | --- | --- |
| Core/data/render ownership | В `core` и broad AI еще видны content-specific расширения, а render-side sprite generation может влиять на monster definitions/readability. Это смешивает владельцев данных, генерации и отображения. | Sprite/readability выводятся из data/helper path без render side effects; content-specific core формы удалены или явно закреплены как generic contract в `architecture.md`. |
| Save/load current shape | Quest target markers, restored floor-memory entity blobs и отдельные A-Life/mobility subsection versions требуют более узких current-version sanitizer tests. Риск: битая current-shape запись возвращает невозможные runtime факты. | Тесты покрывают round-trip quest markers, oversized floor-memory entities и wrong subsection versions. Старые формы отклоняются без migration scaffolding. |
| Quest target truth | Kill/fetch/contract/runtime target matching местами опирается на неполную цель, длинный `desc`, display-name context или implicit recipe policy. Риск: квест засчитывается не той смертью/предметом/комнатой или становится недостижимым. | Общие helpers для kill target matching и compact event target names; stable tags вместо русских display-name проверок; production tests доказывают reachable runtime recipe policy. |
| A-Life and Demos fairness | Материализация, arrivals/departures и Demos author selection еще нуждаются в защите от storage-order/prefix bias. Риск: порядок массива становится социальным или миграционным правилом. | Deterministic tests с перемешанным storage order доказывают одинаковый класс результата без зависимости от первого префикса массива. |
| Net Sphere public boundary | Server ownership, event/market budgets и публичные payloads еще требуют жесткой проверки: клиент не должен быть источником прав собственности, лимитов или раскрытия топологии. | Worker/runtime tests отклоняют forged ownership, over-budget events/markets и public profile payloads с implementation topology. |
| Combat/AI consequences | Path failure, last-known targets, stimulus propagation, projectile/AoE ownership consequences, corpse lookup и tactic assignment все еще требуют одного связного combat-AI pass. | Entity-index/cadence tests показывают spatial target/corpse choice, ally/witness stimulus and relation consequences for NPC-owned damage. |
| Monsters/ecology/generation truth | Design-floor `monsterBiasKinds` может ссылаться на редких или zero-weight monsters, rumor unlocks дублируют ecology data, base-floor spawn stats требуют audit against `MONSTERS`. | Static generation audit ловит unreachable bias kinds or marks them authored-only; runtime event tests emit ecology rumor ids; generation tests prove stats derive from definitions plus declared multipliers. |
| Render/UI performance boundaries | Visible sprite cap применяется до camera culling; full-map base raster может перерисовываться while WebGL keeps rendering; surface-mark overflow and door-state uploads need proportional dirty paths. | Pure culling/cache/dirty tests плюс `check:browser` сценарии для mesh high/off, map legend and damage-over-map. |
| Floor loading time | `ensureFloorRouteLiftLayout` в `floor_memory.ts` вызывала BFS по 1024×1024 сетке 8+ раз за загрузку, каждый раз аллоцируя `new Uint8Array(1M)` + `new Int32Array(1M)` = 5MB. Суммарно ~40MB аллокаций + GC pressure. Финальная верификация делала **отдельный BFS на каждый lift anchor**, а `while`-цикл дополнения лифтов вызывал `collectFloorLiftAnchors` (линейный скан 1M клеток) в условии каждой итерации. Результат: `editableFloor` фаза занимала 1.2–1.5s из 4–7s общей загрузки. **Исправлено**: (1) статические буферы `_bfsSeen`/`_bfsCells` с `.fill(0)` вместо аллокации; (2) финальная верификация переиспользует один `reachable` вместо BFS-per-anchor; (3) `while`-цикл использует счётчик вместо полного скана. | `editableFloor` ≤ 600ms на типичных этажах; `check:readonly` проходит; `npm run test:unit` без регрессий в навигации и лифтах. |
| iOS Safari краш при загрузке / во время игры | Симптом: на iPhone Safari игра крашится и перезагружается 2–3 раза, потом работает стабильно. DuckDuckGo на том же iPhone не крашит. **Причина 1 (OOM spike)**: `import.meta.glob('../../music/*.ogg', { eager: true })` загружал все 10 OGG файлов (7MB → ~9.3MB base64 data URL) в JS heap при парсинге модуля, ещё до титульного экрана. iOS Safari имеет жёсткие лимиты на пиковую память и убивает вкладку. **Исправлено**: `eager: false` — треки загружаются лениво по первому `tick()` музыкальной системы. Помогает ВСЕМ платформам (меньше parse time и GC при старте). **Причина 2 (context loss)**: iOS Safari агрессивно отбирает GPU-ресурсы при memory pressure. Без обработчика `webglcontextlost` все GL-вызовы начинают кидать ошибки → необработанный крэш → перезагрузка. **Исправлено**: обработчики `webglcontextlost`/`webglcontextrestored` в `webgl.ts` + авто-восстановление в game loop `main.ts`. На десктопе события никогда не срабатывают (нулевая цена). **Причина 3 (nav-матрица OOM)**: плотная all-pairs next-hop матрица `_regionNext = Uint16Array(R·R)` на среднем этаже = 250MB–1GB (R≈12k→276MB, R≈23k→1057MB) — гарантированный Jetsam на iOS. **Исправлено**: low-mem режим навигации (`useLowMemNav()` в `pathfinding.ts`; детект `any-hover:none` **и** нет `any-pointer:fine` **и** touch — PC-bias, телефон-как-ПК лучше чем ПК-как-телефон) вообще не строит плотную матрицу: `regionPath` считает одну next-hop **колонку** на цель через `computeRegionNextColumn` (BFS от цели) + LRU на 16 колонок ≈ 1MB вместо сотен. ПК-путь бит-в-бит прежний. **Остаток (отдельная проблема, НЕ навигация)**: Safari всё ещё может крашиться на пике памяти самой `generateFloor` (жилой этаж) и на GPU-текстурах; DuckDuckGo на том же WebKit после low-mem фикса работает стабильно. Три фикса (lazy music, context-loss, low-mem nav) независимы — откатываются по отдельности. | Проверка на iPhone Safari: игра не должна крашиться на холодном старте. В консоли `[WebGL] Context lost` / `[WebGL] Context restored` при потере контекста вместо молчаливого краша. Low-mem nav подтверждён на iPhone (iOS 18.7): DDG больше не крашится, typed-arrays мира ≈42MB, плотной nav-матрицы нет. Owner должен прогнать `npm run typecheck` / `npm run check`. |
| **[РЕШЕНО 2026-07-27]** Floor memory: RAM-удержание этажей = мобильный OOM + основной вес сейва | `captureFloorMemory` при уходе с этажа (`main.ts:5189/5349`) удерживает ЖИВОЙ `World` каждого посещённого этажа (все typed-массивы; `pathBlockers` 4096²=16MB, итого ~30–50MB/этаж) в `floorMemory`. Бюджет `floorMemoryByteBudget()`: на iOS Safari нет `navigator.deviceMemory`/`performance.memory` → дефолт `FLOOR_MEMORY_DEFAULT_BUDGET_BYTES = 1 GiB` (Android Chrome: deviceMemory×0.5, ≤3 GiB); cap `MAX_FLOOR_MEMORY_ENTRIES=128`. Триммер срабатывает только ПОСЛЕ превышения бюджета → до ~1GB старых этажей копится по мере хождения; мобильного gating НЕТ. Вероятный источник тихого Jetsam-краша (растёт с числом переходов → «инконсистентно»), крупнее flow-field кэша (~200MB, 3 ключа). Сейв: `floorMemoryStateForSave` пакует до `MAX_FLOOR_MEMORY_SAVE_ENTRIES=24` этажей в бюджет 1.5MB — основной вес payload. README §3 декларирует «хранение громоздкой геометрии упразднено» — код этому ПРОТИВОРЕЧИТ. Статус краша: на dev :5173 (тяжелее dist) не воспроизводится, инконсистентно; рацион-48 снят как безвредный; залит временный forensic-heartbeat (`localStorage['gigahrush_hb']`) для различения CPU-watchdog vs память. | Этажи = чистая функция `(runSeed,z)`: при переходе не удерживать старый `World` (свернуть NPC в A-Life → отбросить); секцию `floorMemory` сейва убрать или свести к ≤1 активному этажу; bump `SAVE_SHAPE_VERSION`; README §3 становится правдой. Проверка: во время игры `floorMemoryStats().bytes` ≈ вес одного этажа; сейв < 5MB; iPhone Safari переживает длинный маршрут. **Исправлено (2026-07-27):** `main.ts` больше не captures этажи при уходе (death-as-NPC, void-return, lift-departure сняты); `captureCurrentFloorMemory` вызывается только при сохранении → затем `clearFloorMemory()` сбрасывает транзиент; `MAX_FLOOR_MEMORY_ENTRIES`/`MAX_FLOOR_MEMORY_SAVE_ENTRIES = 1` (живой RAM = один `World`, сейв = один активный этаж + A-Life); byte-budget/deviceMemory-код оставлен инертным (не удалён); `SAVE_SHAPE_VERSION 22→23`; синематики ключевых этажей гейтятся через `playedCinematicKeys` (персист в сейве), не через `hasFloorMemory`. **Part 2 (delta-сейв, 2026-07-27):** снапшот активного этажа кодируется дельтой поверх заново сгенерированной по `(runSeed,z)` базы (XOR 12 мировых массивов + разреженные diff комнат/дверей; сущности, контейнеры, зоны — абсолютны); хэш-страж `baseHash` при дрейфе генератора между save и load откатывает к честной регенерации этажа, а не к порче сетки. Плотный этаж укладывается в 5MB; `SAVE_SHAPE_VERSION 23→24`. |
| Loading UX: прогресс-индикатор | Экран загрузки показывал только «ЗАГРУЗКА...» с glitch-эффектом и советами, без информации о текущем этапе. При 3–7 секундах загрузки игрок не понимал что происходит. **Исправлено**: loading worker принимает `progress` сообщения с этапом и процентом. В `initGame` и `switchFloor` добавлены `loadingProgress()` вызовы между тяжёлыми фазами: «Рисуем лабиринт этажа» → «Заселяем этаж» → «Расставляем лифты и двери» → «Генерируем текстуры» → «Запускаем рендер» → «Финальные штрихи». Worker на отдельном потоке, получает сообщения даже когда main thread заблокирован. Тонкий прогресс-бар + текст этапа с glitch-эффектом между заголовком и советом. | Визуальная проверка: при загрузке видны этапы и прогресс-бар. `check:readonly` проходит. Можно откатить удалением `loadingProgress()` вызовов и `progress` handler в worker — никакая логика от этого не зависит. |
| Mobile interaction | Mobile menu accept, map legend, fullscreen/direct-page behavior and Net Sphere touch path остаются отдельным UX-risk cluster. | Browser/mobile smoke covers menu selection, legend readability, fullscreen availability and touch path without desktop-only assumptions. |
| Validation gates | Generation/mobile gates and build-size enforcement are not uniformly wired into default broad checks. Риск: regressions survive because the right command is optional or content-specific smoke owns generic reachability. | Named generation/mobile/size gates exist or docs state exact release owner; content wiring lives in `content:audit`, not ad hoc smoke logic. |
| Human speed source of truth | После пересадки в обычного NPC runtime нормализует human movement, но старые NPC `speed` literals remain in constructors/templates. Риск: новые gameplay-visible paths снова начнут читать raw speed as truth. | Decide whether NPC `Entity.speed` is gameplay-authoritative, status-derived or monster/projectile-only. Add audit/test that rejects new raw NPC movement speed without AGI/status reason. |
| Mesh draw radius vs pop-in | Меши (стены, предметы) пропадают или возникают из ниоткуда при движении камеры. Увеличение общего радиуса рендера приводит к падению FPS из-за лимита энтити/вокселей. | Развязать радиус culling/draw мешей от тяжелых запросов энтити (`queryRadiusCapped`), обеспечив отрисовку до границы тумана без просадки производительности. |
| Tutorial room isolation | Стартовый блок (Актовый зал, столовая, туалет) изолируется костыльно: `ensureConnectivity` и `carveCorridor` сначала прорубают к ним коридоры и двери, а затем в `index.ts` эти двери принудительно удаляются и заменяются глухими стенами, оставляя обрезанные тупиковые коридоры снаружи. | Переписать логику генерации стартового блока (например, улучшить поддержку `sealed=true`), чтобы изолированные комнаты элегантно игнорировались системами пробивки коридоров и дверей, не создавая мусорную геометрию, которую нужно отрезать пост-обработкой. |
| NPC Location / `floorKey` Spaghetti | Использование строковых ключей `floorKey` (напр. `story:living`) для локаций NPC вместо простых координат `Z`. Поскольку координата `Z` строго 1-к-1 соответствует этажу, строковые ключи создают избыточность (нарушение Бритвы Оккама) и требуют ручной синхронизации (например, `homeFloorKey` в дефинициях), а UI Демоса страдает от парсинга префиксов. | Заменить строковые `floorKey` на прямую координату `Z` как источник истины о местоположении во всех A-Life структурах, определениях NPC и Demos UI, убрав систему строковых префиксов этажей из этих модулей. |
| **[РЕШЕНО 2026-07-27]** Generation geometry determinism (`Math.random` в `src/gen`) | `generateFloor()` оборачивает основной генератор в `withSeededRandom(seed, ...)`, но вызовы после обёртки (`applyStoryFloorObjects`, `initializeCellTerritory`, `fillVisualSlotsForWorldFeatures`, `initializeLampBlinks`) и подмодули внутри генераторов (`procedural_screens.ts`, living content, hell content, maintenance content, `admin_common.ts`) используют прямой `Math.random()` вместо seeded RNG. При одинаковом seed два клиента получают разную геометрию, текстуры, лампы и расположение мешей. Блокирует корректный онлайн-мультиплеер: у хоста проход, у пира — стена. **Решение**: `withSeededRandom` должен оборачивать ВСЮ цепочку генерации от входа `generateFloor` до возврата, включая post-processing; внутренние модули не должны использовать `Math.random()` — только переданный `RandomSource`/`SeedRng` или полагаться на подменённый `Math.random`. | `npm run check:readonly` после patch; онлайн-пир видит идентичную геометрию хоста; `grep -rn 'Math\.random()' src/gen/` возвращает 0 результатов (или все вызовы находятся внутри `withSeededRandom` scope). **Статус (2026-07-27):** `rg 'Math\.random\(\)' src/gen/` = 0 подтверждено; `rng()` — seeded xorshift32 (не `Math.random`), `withSeededRandom(floorSeed, …)` оборачивает всю цепочку (`floorSeed=f(runSeed,z)`, `runSeed` персистится) → геометрия/территория/лампы детерминированы, ревизит через лифт даёт идентичный этаж (цель рефактора сейвов достигнута). Остаток `Math.random()` в `systems/render/core` — намеренный `mathRng()` (визуал/аудио/UI, «to avoid breaking deterministic seeds»), НЕ влияет на геометрию; единственный открытый пункт — строгий online host/peer parity рантайм-FX, не single-player ревизит. |
| Blind Z-coordinate refactoring regressions | **В основном закрыто 2026-08-13** (ранее частично 2026-08-12: квестовый слой, караваны, `storyNpcFloorKey`, `zForBaseFloor`, `state.currentZ` на загрузке). Сессия 2026-08-13 закрыла: строки вместо `z` в тестах (`samosbor-shelter`, `hermodoor_borer`, `floor-instances`); мёртвые импорты 11 тест-файлов после переездов модулей; `data-ids.test.ts` полностью зелёный (стухшие поля `giverNpcId`/`target.floor`/`reveals[].floor`/`baseFloor`); карманные этажи лифта получили числовой якорь `z` (`floor_instances.ts`), `@ts-ignore` над передачей `themeTags` как z снят, генерация карманов не падает; самосбор-варианты/биты/директор переведены на числовые z, производные от `designFloorZsByTheme()`; подсистема экранов мигрирована из старого пространства 30/60/100/140/180/200; контракты пересажены со стухших представителей (living/kvartiry были перепутаны) на базовые этажи тем; underhell вернул маршрутное расширение, turing_nursery — двери; зоны достраиваются централизованно в манифесте. Остаток: `@ts-ignore`+`themeClass: 100` у `floor_69` (`design_floors.ts:93`); хвост `test:generation` — счётчики населения (`procedural-floors`, `hilbert-depot`) и точные хардкод-ассерты (владелец одобрил перевод в инварианты). | Все вызовы с параметром `z`/`currentZ` принимают числовые Z; `npm run test:generation` зелёный целиком; остаточный `themeClass`-артефакт очищен. |
| Тороидальный поиск пути (Spanning Tree LCA Flaw) | **[РЕШЕНО]** Алгоритм 4/64-корневого леса (`Spanning Forest`), использующий LCA для поиска пути, был фундаментально сломан для тороидальной топологии: остовное дерево (BFS) всегда разрывает циклы, создавая невидимые "швы" / cuts. Если монстр и цель стоят по разные стороны шва, LCA-путь шёл до корня и обратно (240+ шагов). Сдвиг корней в 4/64 деревья не помогал — швы пересекались в широких комнатах. **Решение (commit `2735dbac`)**: полная замена на **Region-Portal HPA*** — rooms = natural regions, corridors = 16×16 cluster regions, portals на границах, Floyd-Warshall на разреженном портальном графе, O(1) cross-region queries через `_fwNext` матрицу. Zero seam artifacts. RAM: ~40MB → ~20MB. Все 15 pathfinding тестов проходят. | Закрыто. Регрессионный контроль: `tests/ai-pathfinding.test.ts` (15 tests), `npm run check:readonly`. |
| **[Аудит 2026-07-28 · РЕШЕНО 2026-07-29 · фаза-3]** Побочные квесты недостижимы (giverId frozen at import-time) | `registerSideQuest` (`src/data/plot.ts:761-775`) резолвит `giverId` через `getPlotNpcNumericId(...)` в **аргументе** вызова — до того как тело функции регистрирует numeric id этого NPC → `giverId` замерзает `undefined`; оба offer-гейта (`quests.ts:1586`, `plot.ts:838`) скипают по `sq.giverId !== plotId`. First-party: 416 из 421 побочек имеют `giverId===undefined`; предлагаются лишь ~5 (ссылаются на hoisted main-plot NPC). Симптом: почти весь авторский слой побочных квестов не выдаётся ни одним NPC. | Бэкфилл `giverId ?? getPlotNpcNumericId(npcId)` после регистрации NPC-пакета; `getSideQuestRegistrySnapshot()` даёт 0 `undefined`; квесты предлагаются в игре. **DEFER: включает ~416 dead-квестов разом (spawnMonstersOnAccept / экономика / A-Life) → sign-off владельца + плейтест.** **РЕШЕНО (2026-07-29 · фаза-3 · `5bd3ce5c`):** giverId бэкфиллится после регистрации NPC-пакета; 416/421 снова выдаются; регресс-тест `tests/side-quest-giver-backfill.test.ts`. |
| **[Аудит 2026-07-28 · РЕШЕНО 2026-07-29 · фаза-3]** 3 TALK-контракта неисполнимы (targetNpcId frozen) | Тот же класс, что строка выше, другой реестр: `contracts.ts:345/2058/2112` используют eager `targetNpcId: getPlotNpcNumericId('…')!` в литерале CONTRACTS, но эти NPC регистрируются позже → поле замерзает `undefined`; `checkTalkQuest:1053-1055` матчит только по id (без name-фолбэка) → контракт принят, NPC найден, разговор — ничего не засчитывается. | Добавить `targetPlotNpcStringId?: string` в `ContractDef` + ленивый резолв в `contractToQuest`; talk засчитывается. DEFER (net-new scaffolding + sign-off). **РЕШЕНО (2026-07-29 · фаза-3 · `9d86353c`):** ленивый резолв целевого NPC контрактов + TALK-фолбэк (contracts.ts + quests.ts); #25 и кросс-этажные TALK #125 засчитываются; регресс-тест `tests/contract-target-npc-resolve.test.ts`. |
| **[Аудит 2026-07-28 · DEFERRED]** Эндшпиль-маршрут запечатан (маршрутные лифты в одну сторону) | ministry (z=30, `ministry/index.ts:563`), underhell (z=−38, `underhell/geometry.ts:677`), podad (z=−40, `podad/geometry.ts:559`) ставят маршрутные лифты только в одном направлении → roof (z=+50) и void/«конец» (z=−50) недостижимы обычным лифтом; при этом `floorRunLiftPrompt` показывает «↑ следующий этаж» (HUD-ложь). **[ЗАКРЫТО 2026-07-30]** `ensureReachableRouteLifts` (`shared.ts:2005`) теперь вызывается из обеих точек генерации: `src/gen/design_floors/manifest.ts:156` и `src/gen/procedural_floor.ts:16232`, направления берутся из `routeExpectedLiftDirections(z)`. | Закрыто. Остаточное расхождение (не блокер): на терминусе `z=−50` gen-контракт `routeExpectedLiftDirections` возвращает `[]` («no lifts, no return»), а рантайм `floorRunEntryLiftDirections` возвращает `[UP]`, и нормализация лифтов в `floor_memory` ставит там 16 лифтов вверх — рантайм перетирает работу генератора. Нужен один источник истины. |
| **[РЕШЕНО 2026-08-06]** Дыра маршрута на `z=−12` отрезала нижнюю половину авторского контента | Единственный чётный `z` без дизайн-этажа и не процедурный: `entryForZ(-12)` возвращал `null`, `switchFloor` уходил в fallback `currentZ−2` без `commitFloorRunEntry`, курсор `run.currentZ` застревал на −11, и вниз шли только нечётные процедурные этажи — maintenance, hell, underhell, podad, darkness, void и финальные шаги сюжета были недостижимы обычным лифтом. | **Исправлено:** добавлен дизайн-этаж `perevalka` «Перевалка» (z=−12, грузовой ярус между Чёрным рынком 88 и Производственным поясом: погрузочная площадка, весовая и пост досмотра ликвидаторов, серый обход Wild, гермоубежище, четыре времянки, лифты обоих направлений). Проверено генерацией: 10 комнат, 10 дверей (`world.doors` == `Cell.DOOR`), 0 комнат без дверей, весь проходимый объём достижим от спавна, оба лифта достижимы. Инвариант залочен тестом `tests/route-slot-coverage.test.ts` («каждый z в [-50,50] резолвится»). Первая версия компактная — авторские NPC, побочные квесты и механика досмотра наращиваются поверх. |
| **[Аудит 2026-07-28 · РЕШЕНО 2026-07-29 · фаза-3]** Главный квест: STEP 11 — hard-blocker всей цепочки | `PLOT_CHAIN[11]` (`plot.ts:337-345`, тип VISIT) несёт только `targetFloorZ:30` — ни `visitFloorZ`, ни `targetRoute`, ни `targetRoom/RoomType` (соседи [10]/[12] несут `visitFloorZ:180`+`targetRoute`) → не матчит ни одну из двух VISIT-веток `generatePlotQuest` → шаг не конструируется, а шаги 12-18 гейтятся за `previousStepsDone` → весь бэк-энд основного сюжета + кульминация (Podad→Марфа→Вестники→Пустота→Творец) недостижимы; HUD вечно указывает на Майора Громного. | Добавить триггер-поле (`visitFloorZ` или `targetRoute`) как у соседних шагов; шаг 11 предлагается и засчитывается; цепочка доходит до финала. **DEFER — TOP-priority sign-off; форма фикса (`visitFloorZ:30` vs 180-sentinel+`targetRoute`) — design call.** **РЕШЕНО (2026-07-29 · фаза-3 · `99c9394f`):** шагу 11 добавлены `visitFloorZ` + `targetRoute.designFloorId:'ministry'` → конструируется, цепочка доходит до финала; регресс-замок `tests/plot-ministry-visit.test.ts` (`093f4737`). |
| **[Аудит 2026-07-28 · РЕШЕНО 2026-07-29 · фаза-3]** Малые караваны никогда не спавнятся | `smallCaravanMemberEligible` (`systems/caravans.ts:585`): `if (npc.id || …) return false` — `npc.id` у ambient-NPC всегда ≥1 → eligibility всегда false → 0 караванов на всех этажах; HUD-трекер, эскорт/рейд/reroute/seat — все no-op. Git-регрессия commit 83062ee1 (`.plotNpcId`→`.id`). Маскирует #110 (`state.caravans` не сериализуется — load-side sanitizer без serializer) и #111 (эскорт доставляет груз дважды: `'escorted'` — единственный не-terminal исход). | `npc.id`→`npc.plotNpcId`; караван спавнится, `getNearestSmallCaravan` находит, глаголы-решения достижимы; затем save-секция caravans + классификация `'escorted'` terminal. **DEFER — 1-токенный механический фикс, но ре-активирует полностью мёртвую подсистему (крупная reachability) → sign-off.** **РЕШЕНО (2026-07-29 · фаза-3 · `08533b9a` + `97d14d73`):** `smallCaravanMemberEligible` снова пускает `isPlotNpc` (караваны спавнятся); `'escorted'` сделан терминальным (#111). Остаток #110 (save-секция caravans) — по-прежнему DEFERRED. |
| **[Аудит 2026-07-28 · РЕШЕНО 2026-07-29 · фаза-3]** Оверрайды профилей теряются: stale-ключи `_z` vs `route.id` | 3 мапы, читаемые по `[route.id]`, несут устаревшие ключи из route-rename миграции (`…_z`→`…_floor/…floor`): `DESIGN_FLOOR_POPULATION_OVERRIDES` (`design_floor_population.ts:742/1322/1942` — `bank_z`/`service_z`/`horrorz`), `DESIGN_FLOOR_CRAFT_STATION_PROFILES` (`craft_station_placement.ts:213` — `service_z`), `DESIGN_OBJECT_PROFILE_OVERRIDES` (`floor_object_placement.ts:438` — `service_z`). Реальные id: `bank_floor`/`service_floor`/`horrorfloor` → lookup падает в `{}` → служебный/банк/horror-этажи молча получают generic популяцию/крафт/объекты вместо авторских. Класс полностью ограничен: ровно 3 `[route.id]`-мапы. | Переименовать ключи под `route.id`; этажи получают bespoke-профили. DEFER (canonical-сторона ключей — крошечный design call). **РЕШЕНО (2026-07-29 · фаза-3 · `51b87309`):** ключи 3 оверрайд-мап переименованы под `route.id` (`bank_floor`/`service_floor`/`horrorfloor`); этажи получают авторские профили. |
| **[Аудит 2026-07-28 · DEFERRED]** radon_exchange (z=44): авторский NPC-профиль инертен | `baseNpcTarget` (`design_floor_population.ts`) отдаёт 0 при `|z|>=44`; radon z=44 → базовая цель 0, а его override (полный профиль «операторов заслонок»: факции/профессии/4-anchor placement) НЕ задаёт явный `npcTarget` → 0 ambient NPC на тематически людном этаже. Контраст: underhell задаёт `npcTarget:0` явно+комментом. | Явный `npcTarget` для radon ИЛИ смягчить границу `|z|>=44`. DEFER (author-intent). |
| **[Аудит 2026-07-28 · РЕШЕНО 2026-07-29 · фаза-3]** Самосбор: 4/7 вариантов и 31/44 aftermath-бита недостижимы | Гейт `def.tags.some(t => floorTags.includes(t))` (`samosbor_variants.ts` floorWeight + `getSamosborAftermathBeats`) сравнивает variant-NAME/семантические теги дефа с `floorTags`, а те — только 6 биом-токенов → classic/istotit/veretar/maronary весят 0 на каждом этаже (istotit/veretar/maronary не появляются даже через debug — forced-путь гейтится тем же условием), classic — только как void-fallback; aftermath фактически только на maintenance/hell/void, а ministry/kvartiry/living самосборы резолвятся без aftermath-бита. Реальный список биомов стрендед в мёртвом `def.floors`. | Гейтить на `def.floors` ИЛИ дать 4 вариантам/civil-битам биом-теги; 3 variant-дерева + aftermath на ministry/kvartiry/living достижимы. **DEFER — поведенчески крупный (разблокирует контент-деревья + переweight), НЕ byte-identical.** **РЕШЕНО (2026-07-29 · фаза-3 · `681919f9` + `793683a2`):** floorWeight и `getSamosborAftermathBeats` гейтятся по `def.floors` (фолбэк на `.tags` только для theme-tagged wet/electric/meat); veretar/maronary/istotit и civil-aftermath достижимы, off-scope=0; регресс-замок `tests/samosbor-variant-scope.test.ts` (`995f21c5`). |
| Невидимые декали: дробная `intensity` у `stampSurfaceSplat` | Параметр `intensity` у `stampMark`/`stampSurfaceSplat` — это альфа 0..255, а `newA = Math.floor(intensity * alpha)`. Авторские вызовы во многих модулях передают дробь (0.14…0.75), как будто это альфа 0..1 — такой след не пишет НИ ОДНОГО пикселя и просто не существует в игре. Замер 2026-08-12: **224 вызова в 63 файлах** передают дробную интенсивность (для сравнения, всего вызовов ~308). Кластер «хладона» починен в этот же день (иней внутри кармана, по границе и новая кромка снаружи), остальное не трогалось: это широкая визуальная правка, которую нужно смотреть глазами по этажам. | Пройти по списку (`intensity < 1` в аргументе 7) и перевести в шкалу 0..255 с визуальной проверкой этажей; либо явно задокументировать, что часть следов задумана невидимой. Тест-замок: хотя бы один след появляется на этаже с авторской декалью. |

## Запрещенные классы ошибок

### Stable Prefix Bias

Bounded scan не должен брать стабильный первый кусок живого массива, если порядок массива не является authored priority. Иначе очередь хранения начинает управлять физикой, AI, A-Life, миграциями, экономикой или квестами.

Пример класса: routine targeting смотрит первые `N` комнат или акторов и тем самым синхронизирует NPC в одну сторону; arrival anchors берут первый cached lift; faction/economy picker режет `.slice(0, cap)` before scoring/randomization.

Допустимые формы:

- actor-local cursor;
- deterministic offset salted by actor/floor/run id;
- spatial query before cap;
- score all candidates before top-N truncation;
- explicit authored priority documented in data.

### Portal Probe Blindness

Зонды для внешних чекеров площадок (GamePush Sandbox и аналоги) не должны быть ни фейковыми, ни «чистыми». Кейс 2026-08-11 (тест «Прогресс должен сохраняться в игрока», полный разбор в `gamepush.md`) дал три ловушки этого класса:

- **Фейковый зонд для всех**: пробные записи (`score=100`, `progress='test'`) на первый жест каждого игрока затирают живые облачные сейвы — реальный сейв остался у 2 из 543 игроков Пикабу.
- **Чистый зонд невидим**: запись поля тем же значением не делает его «грязным», SDK молча пропускает `sync()` без изменений, и внешний чекер не видит сохранения вовсе. Зонд, который «прошёл» локально, но ничего не изменил, — это отсутствие зонда.
- **Слепая верификация**: чекер площадки гоняет загруженный в консоль артефакт, а не деплой. Фикс, не перезалитый ZIP-ом (и не сверенный по версии `[ vHASH ]` на титуле), физически не тестируется — можно бесконечно «чинить» уже исправленное.

Допустимая форма: реальные данные игрока в стеке жеста + гарантированное изменение только под явным маркером среды разработки (`gp.isDev === true`), где живых игроков не бывает; эмпирически подтверждённые сигнатуры вызовов (здесь — `gp.player.sync()` без аргументов) не «улучшать» без проверки в чекере.

### Map As Message Bus

Карта не должна быть лентой внутренних сообщений. На карте допустимы базовая геометрия, fog-of-war, лифты, игрок, обычные entity dots, квестовые NPC/room/item/kill markers и surface-map marks.

Не выводить на карту raw ids, route keys, event names, таймеры, caravan statuses, samosbor internals, Demos labels или технические фазы. Эти факты должны жить в HUD, журнале, слухах, диалогах, системных сообщениях или в самой сцене.

### Cross-Layer Side Effects

`render/` читает состояние и рисует. Он не должен создавать gameplay facts, мутировать data definitions или решать доступность механики. Аналогично `core/` не должен становиться складом частных content branches, если факт можно выразить data registry, event id, room tag, faction id or system helper.

Критерий: владелец состояния находится в одном слое, остальные слои получают компактный id/fact через существующий канал.

### Raw Coordinate Array Indexing

Вычисление индексов массивов клеток через прямое умножение `cy * W + cx` или `cy * 1024 + cx` из сырых координат (особенно полученных из позиции сущностей, физики или частиц, например `Math.floor(ex)`) запрещено. 
Поскольку мир является тором, любые координаты, даже слегка вышедшие за пределы `[0, W-1]` (из-за float-погрешности, толчка физики до wrap'а или спавна у края), при прямой формуле могут дать отрицательный или выходящий за границы индекс (например, `-125`). Это приводит к тихой порче данных при записи в TypedArray или к жестким крашам (например, `Uncaught RangeError: visual cell index out of range: -125`) в строгих ассертах.

Допустимые формы:
- Использовать исключительно `world.idx(x, y)` для перевода 2D координат в 1D индекс ячейки карты. Этот метод гарантированно оборачивает координаты через `world.wrap`.
- Использовать `world.wrap(x)`, если для расчетов (например, дистанции или векторов на краях) требуются сами нормализованные координаты.

### Unclamped Frame Delta (Negative dt)

Использование сырого `dt` (разницы времени между кадрами) без проверки на отрицательные значения или NaN запрещено. 
На старте игры, при смене вкладок или из-за особенностей `requestAnimationFrame` в некоторых браузерах (когда таймстемпы коллбека и `performance.now()` рассинхронизированы), вычисление `now - lastTime` может дать отрицательный `rawDt`. Это приводит к тому, что таймеры уходят в "прошлое", а зависимые от времени прогресс-множители и интерполяции выходят за пределы `[0, 1]`. Это вызывает тихие логические баги или жесткие краши нативных API (например, `IndexSizeError` при установке отрицательного `.volume` у `HTMLMediaElement`).

Допустимые формы:
- Базовый игровой `dt` на уровне `main.ts` должен быть жестко зажат в безопасные рамки снизу и сверху (например, `Math.max(0, Math.min(rawDt, 0.05))`).
- При вычислении долей и процентов (`p`), используемых в формулах интерполяции, цвета, громкости или UI, всегда ограничивать результат: `Math.max(0, Math.min(1, p))`, так как плавающая точка может дать погрешность даже при валидном `dt`.

### Подмена понятий Enum и Z-координаты (currentZ vs FloorLevel)

При рефакторинге и замене `state.currentFloor` на `state.currentZ` многие скрипты систем, генерации и тестов сохранили проверки вида `state.currentZ === FloorLevel.MINISTRY`. 
Поскольку `currentZ` — это физическая координата от -50 до +50, а `FloorLevel` — это константа биома (например, MINISTRY = 0, LIVING = 2), прямая проверка сравнивает физическую Z с магическим числом биома, полностью ломая логику этажей (например, скрипты Министерства срабатывают только на Z=0, что является биомом Жилой Зоны).

**Допустимые формы:**
Для определения текущего биома/типа этажа на любой Z-координате используйте `currentFloorRunEntry(state).baseFloor === FloorLevel.MINISTRY` вместо прямого сравнения `currentZ`.
В тестах вместо задания прямого enum-номера в Z-координате (`currentZ: FloorLevel.LIVING`) используйте хелпер `currentZ: zForStoryFloor(FloorLevel.LIVING)` или явно задавайте числовую координату, соответствующую нужному этажу.

### Слепая автозамена (find-and-replace) аргументов и ключей при миграции этажей на Z

При замене параметров `floor` на `z` (и удалении старых строковых идентификаторов этажей из сигнатур функций) запрещено использовать слепую автозамену (включая регулярные выражения вроде `/floor: 'ministry'/g` или автозамену по всему проекту без проверки контекста).
**Почему это критично и что ломается:**
1. **Несовпадение типов и проверка четности (`z % 2 !== 0`)**: Когда сигнатура `rebuildWorld` или `generateFloor` меняется с `floor: string | FloorLevel` на `z: number`, передача строки `'maintenance'` приводит к тому, что `'maintenance' % 2 !== 0` вычисляется как `NaN !== 0` → `true`. Система ошибочно считает этаж процедурным (нечетным) и вызывает `generateProceduralFloor(NaN)`, что приводит к крашам при обращении к профилям опасности (`dangerBias` на `undefined`).
2. **Искажение ключей в реестрах**: Автозамена слова `floor` на `z` в ключах объектов и реестрах (например, превращение `fractal_floor` в `fractal_z` в `PROCEDURAL_ANOMALY_GENERATION_REGISTRY`) ломает связь с дефинициями в `procedural_floors.ts`, где ожидается исходный ключ.
3. **Маскировка ошибок через `@ts-ignore` и `any`**: Вместо корректной очистки устаревших свойств (`baseFloor` в `floor_instances.ts`, `themeClass` в `design_floors.ts`) или исправления вызовов в тестах, добавление `@ts-ignore` или приведение `as any` скрывает критические поломки генерации от `npm run typecheck` (особенно с учетом того, что папка `tests/` не входит в `tsconfig.json`).

**Допустимые формы:**
- При изменении типа параметра на `z: number` необходимо вручную или типизированно проверить все точки вызова (включая файлы в `tests/`), заменяя строковые имена (напр. `'ministry'`, `'maintenance'`, `'living'`, `'hell'`, `'void'`) на реальные числовые Z-координаты (`30`, `-26`, `0`, `-36`, `-50` или вызов `zForStoryFloor()`).
- Все ключи реестров и интерфейсы данных должны быть синхронизированы без использования `@ts-ignore`.

### Дупликация данных и неэлегантный хардкод ключей (story vs design)

Историческое разделение на `story:ministry` и `design:ministry` привело к страшному хардкоду: разные системы плодили дублирующие сущности (например, в A-Life планах `storyBucket` и `designBucket` создавали по бакету для каждого базового этажа). После рефакторинга (когда оба начали отдавать `design:ministry`) это стоило нам часов дебага, так как дубликаты бакетов удваивали зарезервированную популяцию (NPC, квестовиков), ломая тесты популяции (`98631 !== 98348`) из-за того, что `targetCount` и `reserved.length` накапливались дважды.
**Запрещено:** дублировать бизнес-сущности и плодить параллельные хардкодные структуры для "сюжета" и "дизайна", обходя единую процедурную/маршрутную логику. Это не только неэлегантно, но и хрупко.
**Допустимо:** пропускать всё через единый пайплайн (один источник истины, дедупликация через `Set` при объединении массивов, один уникальный префикс).

## Элегантные паттерны (Утвержденные решения)

### Region-Portal HPA* (Решение проблемы LCA-швов в поисках пути) [РЕАЛИЗОВАНО]

**Исторический контекст и провал LCA:**
Алгоритм `4-Anchor Spanning Forest` (позже расширенный до 64 деревьев) на базе LCA остовного дерева был фундаментально неприменим для тороидальных графов с циклами. Любое остовное дерево разрывает циклы, создавая "швы". Пути между точками по разные стороны шва вынуждены были идти через корень дерева (LCA), рисуя петли на 240+ шагов через весь экран. Промежуточный план "64-Anchor Packed Subcell Flow Fields" (536 МБ RAM) так и не был реализован из-за неприемлемого потребления памяти.

**Реализованное решение (Region-Portal HPA*):**
Полный отказ от остовных деревьев и поиска предков (LCA). Переход на **двухуровневую HPA* (Hierarchical Pathfinding A*)** архитектуру:

1. **Регионы**: комнаты — естественные регионы; коридорные/открытые клетки — кластеры 16×16 через flood fill. Хранение: `_regionMap` (Int32Array, 4 МБ).
2. **Порталы**: контигуальные границы между смежными регионами группируются в портальные записи. Каждый портал хранит обе стороны (regionA, regionB) и координаты граничных клеток. Макс ~1500 порталов на этаж.
3. **Floyd-Warshall на портальном графе**: all-pairs shortest paths с skip-оптимизацией. Результат: `_fwDist` + `_fwNext` (Float32Array + Uint16Array, ≤4.5 МБ динамически). O(1) cross-region query.
4. **Local BFS при запросе**: same-region маршруты через ограниченный BFS (≤256 клеток). Cross-region: цепочка порталов из `_fwNext` → intra-region routing между порталами → subcell waypoints через `macroCellPathToSubcells`.
5. **Acoustic distance**: `getAcousticDistance` возвращает Euclidean для same-region, портальный путь для cross-region.

**Ключевые свойства:**
- Zero seam artifacts на торусе — нет остовных деревьев, нет разрывов.
- RAM: ~20 МБ (вдвое меньше старых 40 МБ).
- Bake-time: при загрузке этажа и после samosbor stitch.
- Freeze/unfreeze: навигационный кэш замораживается во время samosbor.
- Public API без изменений — все 19 файлов-потребителей работают без правок.

### Hysteresis (Анти-флаппинг при преследовании и блуждании)

**В чем проблема:**
Игроки жаловались: *"у монстра постоянно меняются цели пути (никто не успевает выполнить свой путь)"*. Визуальный дебагер в Арене показывал, что цель пути монстра мерцает и прыгает, а сам монстр дергается.
Это происходило по двум причинам:
1. **WANDER-таймер:** При блуждании (`wanderNearby`) монстр выбирал случайную точку в 10 клетках, но таймер перерасчета пути составлял `1.5 - 4.0` секунды. Монстр успевал пройти лишь часть пути, таймер истекал, путь безусловно сбрасывался (`ai.timer <= 0`), и монстр выбирал *новую* случайную точку, так никогда и не доходя до изначальной.
2. **LCA Path Flapping (историческое, устранено):** До перехода на HPA* при преследовании (`HUNT`) алгоритм менял выбор дерева каждые 2 секунды, из-за чего путь скакал лево→право→лево. С Region-Portal HPA* портальный граф детерминированно выбирает один кратчайший маршрут, и flapping при одной цели физически невозможен.

**Элегантное решение:**
1. **Hysteresis в `tryAssignPathToCell`:** Добавлена проверка: если текущая субклетка цели совпадает с уже назначенной (`ai.tx, ai.ty`) и активный путь всё ещё валиден (`ai.path.length > 0`), алгоритм мгновенно возвращает `'same'` и не вызывает дорогой `buildBakedTreePath`.
2. **Освобождение WANDER от жесткого таймера:** Таймер для `wanderNearby` увеличен до `8-12` секунд, чтобы монстр успевал гарантированно дойти до конца назначенного пути перед выбором новой случайной точки (при этом `ai.stuck` всё ещё гарантирует сброс пути, если монстр физически застрял).
### Изоляция метаданных при децентрализации этажей (`meta.ts` против Temporal Dead Zone)

При разделении монолитных файлов этажей (или модульном проектировании новых дизайн-этажей) на отдельные подмодули (`geometry.ts`, `npcs.ts`, `index.ts`) возникает риск циклических зависимостей в стандартах ES Modules:
Если `index.ts` ре-экспортирует подмодули (`export * from './npcs'`) в верхней части файла, а затем ниже объявляет общие константы (`HOME_FLOOR_KEY`, `ROUTE_ID`, списки реплик или типы), то при импорте из `npcs.ts` этих констант обратно из `./index` Node.js выбрасывает ошибку `ReferenceError: Cannot access '...' before initialization` (Temporal Dead Zone). Загрузка модуля ставится на паузу ради подмодуля, когда константы еще не проинициализированы.

**Элегантное решение (`meta.ts`):**
Все статические метаданные, типы, константы идентификаторов (`ROUTE_ID`, `DESIGN_FLOOR_Z`, ключи, массивы реплик, структуры стейта) выносятся в отдельный чистый файл `meta.ts`.
- `meta.ts` находится в корне папки этажа, не импортирует ни `geometry.ts`, ни `npcs.ts` и не имеет side-effects.
- В `index.ts` первой строкой идет `export * from './meta';`, а затем ре-экспортируются остальные подмодули.
- Все подмодули (`geometry.ts`, `npcs.ts`, `routes.ts`) импортируют статику и типы строго из `./meta`, а не из `./index`.
Это математически гарантирует отсутствие циклических зависимостей и ошибок инициализации при любом порядке загрузки графа импортов в Vite или Node.js.

### Модульная децентрализация дизайн-этажей (Утвержденный паттерн)

После рефакторинга мы окончательно перешли на систему децентрализованных дизайн-этажей (четные `Z`).
Каждый этаж теперь поощряется делать как **отдельную игру со своими правилами**. 
Вместо того чтобы тянуть сложную условную логику в центральные генераторы, мы изолируем этажи: начиная от уникальной 2D геометрии, заканчивая собственной динамикой, популяцией и логикой поведения.
Каждый дизайн-этаж описывается своим подмодулем в `src/gen/`, где он имеет полное право определять свои правила спавна, архитектуру комнат и механики, опираясь только на базовые контракты `World`.

### Транзит квестовых предметов (Quest Item Handoff Continuity)

Если по сюжету NPC просит принести ему предмет, но затем этот же предмет нужно нести другому персонажу (следующий шаг квеста), **не нужно** усложнять логику квестов специальными флагами, запретом потребления предмета (consumeItem) или созданием дубликатов.

**Элегантное решение:**
Оформляем первый шаг как обычный `QuestType.FETCH` на нужный предмет, но в `rewardItem` указываем этот же самый предмет. Таким образом NPC технически "забирает" предмет для зачета квеста и немедленно "возвращает" его игроку в качестве награды. Игрок получает системное уведомление, и у него на руках остается нужный предмет для старта следующего шага. Это использует стандартный флоу квестов без единого костыля в `src/systems/quests.ts`.

### 5.7 Боль с рефакторингом ID Сюжетных NPC (Unified Numeric ID) [ВЫПОЛНЕНО]
**В чем проблема:** 
В рамках ликвидации строк и дубликатов мы перевели сюжетных NPC с отдельного свойства `plotNpcId` (строка) на единый с движком `id` (число). Все сюжетные NPC теперь жестко занимают ID от `1` до `N` (`getPlotNpcCount()`).
Это вызвало каскадное падение более 50 тестов (A-Life, Quests, UI). 
- **Хардкод `nextId.v = 10` в тестах:** Многие тесты процедурных систем начинали раздавать ID с 1, 10 или 30. Это привело к тому, что обычные процедурные монстры и граждане внезапно стали классифицироваться как сюжетные NPC (ведь их ID попал в интервал `1..N`).
- **Слепые строковые ID в квестах:** Тесты на квесты хардкодили цели вроде `targetNpcId: getPlotNpcNumericId('plot_pechateed')`. Но такого NPC никогда не существовало в базе! Раньше строковый ID проглатывался, а теперь функция вернула `undefined`, и целевой квест на убийство стал квестом "убить любого безымянного монстра".

**Было ли это ошибкой? (Критический взгляд)**
**Нет, это было правильным решением.** 
Переход на единый числовой `id` вскрыл огромный пласт технического долга, когда сущность могла иметь две параллельные идентичности (числовую для физики и строковую для сюжета), что порождало ошибки дублирования и "призраков" в сохранениях. Строгая резервация первых `N` идентификаторов под сюжетный пул математически гарантирует отсутствие коллизий между A-Life-массовкой и сюжетными NPC. Вся боль рефакторинга пришлась исключительно на тестовые фикстуры и хардкод, а не на реальную бизнес-логику. В итоге архитектура стала строже, быстрее (сравнение чисел вместо строк) и защищеннее от опечаток.

**Как мы это решили:**
- Убрали из интерфейса `Entity` поле `plotNpcId`.
- В тестах все `nextId.v = 10` заменены на `nextId.v = getPlotNpcCount() + 1000`.
- Очистили квесты от невалидных строковых ID, перевели все моки на существующие пакеты (например, `barni`, `olga`).

### 5.8 Интеграция сюжетных NPC в Demos Social (Отвязка от хардкода ID) [ВЫПОЛНЕНО]
**В чем проблема:**
После рефакторинга ID сюжетных NPC (переход с `plotNpcId` на общий числовой `id`), пропали дизайнерские отношения в Demos Social (например, Ольга Дмитриевна и Барни). Причина: старый код использовал хардкодные строковые ID (`'olga'`, `'barni'`) для инициализации графа отношений, что ломалось при использовании динамического числового пула.

**Как мы это решили (Элегантный паттерн):**
- Полностью удален хардкод числовых ID (например, `id: 1`) из тестов и генерации социальных графов.
- Отношения теперь опираются на `getPlotNpcNumericId('barni')` для динамического определения нужного `id` по строковому ключу из `MAIN_PLOT_NPC_PACKAGES`.
- Внедрено строгое требование вызывать `ensureAlifeState()` перед работой с отношениями сюжетных NPC в тестах, что гарантирует правильное развертывание пула перед любыми социальными вычислениями.

### 5.9 Динамические телепорты в Debug Menu (Устранение дубликатов этажей) [ВЫПОЛНЕНО]
**В чем проблема:**
Debug Menu содержал хардкодные команды `teleport_living` и `teleport_maintenance` в перечислении `BaseDebugCommandId`, которые дублировали динамическую систему маршрутных телепортов (`DESIGN_FLOOR_ROUTES`). При рефакторинге это привело к рассинхронизации ID команд, из-за чего сломался `smoke-playability.mjs` и тесты `debug-commands.test.ts`.

**Как мы это решили:**
- Команды телепортации на конкретные этажи (`teleport_living`, `teleport_maintenance`) были исключены из статичного массива.
- Теперь они используют динамический префикс `teleport_design_z: <DesignFloorId>`, который генерируется прямо из `DESIGN_FLOOR_ROUTES`.
- Smoke-тесты (`SMOKE_DEBUG_COMMAND_IDS`) и юнит-тесты были обновлены для использования динамического префикса (`teleport_design_z: living`). Это делает систему масштабируемой и исключает появление дублирующих хардкодных команд для новых этажей.

### 5.10 Универсальная трансляция Звука в Зрение (Без поломки уникальной экологии) [ВЫПОЛНЕНО]
**В чем проблема:**
У нас была разрозненная система микро-целей `investigate_noise`, из-за которой монстры не всегда корректно реагировали на шум, а если реагировали — могли "зависать", блуждать и не использовать полноценный поиск пути. 
При первой попытке унифицировать звук и зрение (глобальное преобразование любого услышанного шума в `AIGoal.HUNT` в начале тика), сломались тесты уникальной экологии мобов:
- Чернослиз перестал корректно реагировать на всплески в воде (например, от брошенной консервной банки) для выхода из засады.
- Зеленая Собака перестала пугаться ударов по металлическим трубам и просто бежала в атаку.
Глобальный перехват шума лишил монстров права на их уникальные скриптовые реакции.

**Как мы это решили (Элегантный паттерн):**
- Установлен строгий порядок: **Сначала экология, затем унификация**.
- Специфические проверки (на страх, засаду, уникальные триггеры) оставлены внутри блоков конкретных мобов в `updateMonster`.
- Глобальная конвертация `noise -> vision` встроена в самом низу цикла (в fallback-функцию `tryFollowNoise`).
- Теперь, если шум не перехвачен уникальным правилом, он легально транслируется в зрение (`ai.lastSeenTargetId = noise.actorId`), моб переходит в `HUNT` и использует честный тороидальный поиск пути (`4-Anchor Spanning Forest`), чтобы прийти точно к источнику звука без застреваний.

## REMOVED content

| Что удалено | Почему удалено | Возможность возврата |
| --- | --- | --- |
| Скрипт `src/gen/living/govnyak_smoke_den.ts` (Засада говняков / Дымная комната) | Нарушал архитектуру A-Life, спавня «спонтанных» NPC напрямую на этаже в обход глобального пула населения. Из-за этого ломалась консистентность имен и логика распределения ролей, а сами NPC висели как оторванные от мира болванчики. Модуль не являлся критичным для целостности игры. | Вернуть можно, если предварительно перенести всех персонажей из этого скрипта (Трофим Дымарь, Павел Подзалог и др.) в `npc_packages.ts` как легальных A-Life сюжетных NPC и спавнить их через `spawnPlotNpcFromPackage` с учетом их `alifeId`. |
| Скрипт `src/gen/living/apartment_raid.ts` (Рейд квартир налетчиками) | Та же проблема: модуль пытался быть «динамическим событием», но хардкодил спавн сюжетных по сути NPC (Мира Под Столом, Степан Налет) прямо в процессе генерации локального этажа. Это ломало логику распознавания квестовых NPC и приводило к багам, когда A-Life не мог их корректно легализовать при сохранении. | Если потребуется вернуть рейды, их нужно будет переписать как легальные A-Life события (Event system), где участники рейда будут выбираться из существующих жителей пула или иметь четко прописанные `alifeId` из резерва сюжетных NPC. |

### Динамический сдвиг индексов сюжетных NPC (Plot NPC ID vs A-Life Indexing) [ВЫПОЛНЕНО / Case Study]

**Симптом:**
В UI Демоса и социальных взаимодействиях профили персонажей (Ольга, Баринов, Яков) отображались со сдвигом: имена, пол, возраст и отношения не соответствовали сюжетным дефинициям (`MAIN_PLOT_NPC_PACKAGES`), персонажи получали чужой пол или смещались на 1 или несколько позиций.

**Причина (Case Study):**
1. Счетчик `nextPlotNpcId` в `src/data/npc_packages.ts` использовал 0-индексацию (раздавая ID от `0` до `N-1`), в то время как Demos и `alife.ts` во многих местах ожидали или преобразовывали ID как 1-indexed (`alife.npcs[plotNpcId - 1]` в `getPlotNpcNumericId`), либо наоборот делали прямые выборки из массива без гарантии точного позиционирования.
2. При инициализации `alife.npcs` в `buildAlifeStateFromPopulationPlan` зарезервированные сюжетные NPC (`reserved`) добавлялись в массив последовательно (`npcs.push(record)`) по мере случайного обхода этажей/бакетов, а не жестко закреплялись за своим точным слотом. Из-за этого индекс в массиве `alife.npcs` разъезжался с `plotNpcId`, порождая хаос в UI и отношениях.

**Элегантное решение и строгий контракт:**
- **1-indexed Plot IDs:** В `src/data/npc_packages.ts` счетчик `nextPlotNpcId` строго переведен на 1-indexed (`let nextPlotNpcId = 1;`). Все сюжетные NPC получают стабильные числовые ID от `1` до `N` (`getPlotNpcCount()`).
- **Жесткая аллокация слотов (Pass 1):** Функция `buildAlifeStateFromPopulationPlan` в первом проходе гарантированно размещает каждого сюжетного персонажа `k` (`1 <= k <= plotCountToEnsure`) ровно в ячейку `alife.npcs[k - 1]` с `record.id = k`.
- **Процедурный хвост:** Обычные процедурные жители (`procedural NPCs`) получают ID начиная с `N + 1` и заполняют оставшуюся часть массива `alife.npcs` до `boundedTotal`.
- **Итог:** Теперь для любого сюжетного персонажа `plotNpcId = k` гарантируется точное тождество `alifeId === plotNpcId === k`, а запись всегда доступна за `O(1)` по индексу `alife.npcs[k - 1]` без риска смещения или подмены сущности.


### 1. Lazy music (`eager: false`) — **полностью безопасно, помогает ВСЕМ платформам**

Было: все 10 OGG файлов (7MB) декодируются при парсинге JS модуля — ещё до того как страница загрузилась.

Стало: загружаются по первому `tick()` — когда игрок уже ходит по этажу.

- На десктопе: быстрее парсинг бандла, меньше GC при старте
- Музыка и так не играет на титульном экране и во время загрузки
- Единственный «риск»: 1 кадр (~16ms) задержка до первого трека. Незаметно

### 2. WebGL context loss — **стандартная практика, нулевая цена на десктопе**

- На Chrome/Firefox десктоп: **события никогда не срабатывают**. Обработчики просто висят без дела — 0 CPU, 0 памяти
- На мобилках (не только Safari — Android Chrome тоже): защищает от краша при memory pressure
- `e.preventDefault()` — это **стандарт WebGL**. Без него контекст теряется навсегда

**Единственная агрессивность**: `return` в game loop при потере контекста пропускает HUD на 1-2 кадра. Но без GL context рисовать сцену всё равно невозможно — альтернатива хуже (необработанные GL ошибки → краш).

### Объём изменений

Это не «столько всего» — это:
- `music.ts`: `true` → `false` + 30 строк lazy-resolve
- `webgl.ts`: +15 строк (event handlers + 2 флага)
- `main.ts`: +12 строк (recovery check)

**Ни одна строка существующей логики не изменена.** Всё аддитивное.

### Универсальный флаг `e.phasing` для Line-of-Sight (Phasing vs Flying) [Утвержденный паттерн]

**Симптом:**
Монстры при поиске цели (LOS) могли "читерить" и видеть игрока сквозь стены, либо наоборот — застревать и пытаться атаковать через непробиваемые препятствия. Когда мы добавили проверку `hasClearLine`, Духи (Shadow Spirit), которые должны проходить сквозь стены, "ослепли" и перестали видеть цели. 
Попытка использовать флаг `aiFlags: ['flying']` как исключение для проверки LOS привела к новой проблеме: Глаз (`Eye`) тоже является летающим (`flying`), но он стреляет снарядами и не должен уметь смотреть или стрелять сквозь бетон.

**Причина (Семантика флагов):**
- `flying` — это лишь иммунитет к мелким препятствиям (пропасти, вода, кислота) в системе коллизий (`entityIgnoresFineBlockers`). Это не дает способности смотреть сквозь стены.
- Зрение сквозь стены должно соответствовать физической способности проходить сквозь эти стены (крупные препятствия).

**Элегантное решение:**
- Вместо парсинга строковых флагов AI, проверка видимости (`hasClearLine`) теперь обходится только в том случае, если сущность физически имеет свойство `e.phasing` (либо специфические флаги `falsePhase` / `noclip`).
- Это универсально, так как `e.phasing` — это свойство базовой `Entity`. В игре есть ПСИ-способности, которые могут временно наделить ЛЮБОГО персонажа (NPC или игрока) свойством `phasing`.
- Таким образом, "рентгеновское зрение" автоматически достается любой сущности, которая физически переходит в фазовое состояние, делая ИИ абсолютно консистентным с физикой мира без костылей и хардкода конкретных видов монстров.

### Делегирование генерации NPC системе A-Life (Templates vs Full Entities) [ВЫПОЛНЕНО / Case Study]

**Симптом:**
Процедурные NPC (например, семьи ликвидаторов или путники), генерируемые на жилых этажах, получали при спавне имена, инвентарь и характеристики, но не попадали в систему A-Life (`alifeId` оставался `undefined`). Из-за этого они не появлялись в "Демосе", ломались квесты, а социальные взаимодействия с ними были неполноценными. Ошибка возникала стабильно даже на свежих сохранениях новой игры.

**Причина (Case Study):**
1. **Баг в fallback-цикле:** В функции `materializeAlifeFloorPopulation` (в `src/systems/alife.ts`) стоял `early return`, который моментально прерывал работу функции, если на этаже не было найдено "безымянных шаблонов" (ambient NPC templates).
2. **Перехват имен генераторами:** Функции `spawnFamilies` и `spawnTravelers` в `src/gen/living/npcs.ts` самостоятельно генерировали полные профили персонажей (вызывали `randomName()`, раздавали оружие, выставляли HP). Поскольку у таких сущностей поле `name` было заполнено, функция-фильтр `isAmbientNpcCandidate` их игнорировала. В итоге A-Life не считала их шаблонами, требующими материализации, и они оставались "отсоединенными" от макропопуляции.

**Элегантное решение и строгий контракт:**
- **Исправление раннего возврата:** Убран ошибочный `return` в `materializeAlifeFloorPopulation`. Теперь цикл материализации проходит всегда, даже если шаблонов нет, подхватывая всех NPC, кому еще требуется назначить `alifeId` (например, сюжетным скриптовым персонажам).
- **Голые аватары-шаблоны (Templates):** Генераторы этажей (`spawnFamilies`, `spawnTravelers`) больше **не генерируют** имена, характеристики, фракции, профессии или инвентарь. Вместо этого они выставляют на этаж минимальные "голые болванки" (entity templates без `name`).
- **Слияние через A-Life:** Система A-Life видит эти безымянные аватары на этапе загрузки этажа и автоматически запрашивает подходящих (честных, существующих в макропопуляции с самого старта игры) персонажей из своего пула. Эти NPC получают реальные имена, фракции, инвентарь и все мета-данные напрямую из `AlifeNpcRecord`.
- **Итог:** Разделение ответственности восстановлено. Генератор этажа решает **"где и сколько"** (расставляет шаблоны по комнатам), а A-Life решает **"кто именно"** (вселяет в них конкретных жителей Гигахруща со своей историей и кошельком). "Семья" на этаже теперь работает как настоящая коммуналка, куда заселяются реальные личности.

### Универсальный модуль взаимодействия актёров с дверьми (люди открывают, монстры ломают) [ВЫПОЛНЕНО]

**Симптом (исходный):**
После рефакторинга поиска пути на Region-Portal HPA* обычные NPC доходили до закрытой (`CLOSED`) двери и **вставали перед ней намертво**, не открывая. Первая заплатка (открывать дверь по вектору движения в `followPath`) чинила NPC, но открывала двери **для кого угодно**, включая монстров — а мы хотим ровно противоположного контроля.

**Причина (рассогласование двух определений «проходимости»):**
1. `world.solid()` (`src/core/world.ts:571`) считает `CLOSED`-дверь **твёрдой** — физика её блокирует.
2. Навигация (`isSubcellNavPassable`, `hasLineOfSight`) считает `CLOSED`-дверь **прозрачной** (непроходимы только `LOCKED` / `HERMETIC_CLOSED`).
3. String-pulling lookahead прыгает `ai.pi` за клетку двери (LOS видит сквозь неё), поэтому waypoint-открывалки целились за дверь, оставляя её закрытой; актёр утыкался в твёрдую дверь.

**Элегантное решение — единый диспетчер `actorContactDoor` (`src/systems/door_state.ts`):**
Вся политика «кто и какую дверь проходит» живёт в **одной** функции. Любой актёр, идущий по пути, при контакте с дверью проходит через неё (обёртки `openPathDoor` / `openPathDoorAtWorld` в `pathfinding.ts` теперь просто зовут `actorContactDoor(world, e, idx)` и передают актёра):
- **Люди** (`EntityType.NPC` / player-kind) — открывают обычную `CLOSED`-дверь (`OPEN` + auto-close timer). `LOCKED` / `HERMETIC` не трогают: барьер, нужен ключ/панель.
- **Монстры** (`EntityType.MONSTER`) — не умеют пользоваться ручкой: **бьют** дверь на своей боевой каденции (`e.attackCd`, урон `MONSTERS[kind].dmg`, скорость `attackRate`), пока не сломают или пока их не отвлекут. Обычная `CLOSED` (50 HP) ломается за пару ударов, `LOCKED` (150), гермо (500) — дольше.

**Разрушение = удаление (по решению владельца):**
Сломанная дверь теперь не превращается в `OPEN`, а **удаляется** через `world.removeDoorAt` (`DOOR`-клетка → `FLOOR`, вычищается из `room.doors`, dirty-флаги для nav/render). Настоящая дыра, а не распахнутая створка. Совместимо с accept-stale навигацией: live subcell-маска сразу читает `FLOOR`, перепекания нет. HP/броня уже заложены в `damageDoor` (`defaultDoorMaxHp` по типу) — расширяемо под будущую систему прочности/материалов дверей без правки вызовов.

**Точки:** `door_state.ts:76` (`actorContactDoor`), `door_state.ts:38` (`damageDoor` → destroy), `pathfinding.ts` (`openPathDoor` / `openPathDoorAtWorld` — тонкие обёртки, все 4 follower-контакта передают `e`). Авторские спец-ветки монстров (`monster.ts`: Собранный ломает слабые двери, фазеры фазятся) остаются как приоритетные способности поверх универсального фолбэка.

**Критерий закрытия:** обычный NPC открывает `CLOSED`-дверь и проходит; NPC перед `HERMETIC`/`LOCKED` не проходит; монстр, упёршийся в дверь, бьёт её до разрушения (клетка становится `FLOOR`, дверь исчезает из `world.doors` и меша); `npm run typecheck` чист. Регрессия — `tests/ai-pathfinding.test.ts`.



**В чем проблема:**
Монстры на поворотах (особенно в спиралях и узких углах) бесконечно бились об угол, перестраивали путь и зависали. 
Причина крылась в конфликте двух систем:
1. `hasLineOfSight` (строковый алгоритм сглаживания пути) позволял диагонально срезать углы, если алгоритм Брезенхема касался диагонального вертекса стены.
2. `canActorOccupyCoarse` использовал float-радиус (`0.18`), который при таком "срезании" математически накладывался на соседнюю макро-клетку стены (Math.floor(x + radius) переваливал за границу).
В результате AI считал путь идеальным (строка не пересекает центры сплошных клеток), но коллизия на следующем кадре видела перекрытие радиуса со стеной, вызывала `unstuckActorFromBlockers`, отбрасывала монстра назад и удаляла путь. Это порождало бесконечный цикл.

**Элегантное решение:**
- Полный отказ от float-радиусов в `canActorOccupyCoarse` — переход на квантовую систему дискретных радиусов (если центр логически прошел в 1 субклетку 4x4, значит сущность проходит целиком).
- Строгая проверка ортогональных соседей в `hasLineOfSight`: если алгоритм шагает диагонально, ОБА ортогональных соседа должны быть проходимы. Это гарантирует, что float-линия стрингуллинга физически никогда не коснется угла стены.
- Возврат к 4-деревянному Spanning Forest (LCA) для обхода швов тора, так как A* был избыточен и не решал фундаментальную проблему коллизий, а лишь маскировал её.

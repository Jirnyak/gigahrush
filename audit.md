# AUDIT — ГИГАХРУЩ

> Живой аудиторский документ. Роль: независимая проверка кода и документации
> проекта на баги, регрессии, хардкод, легаси, дубликаты и расхождения
> доков с реализацией; плюс критическая оценка игры как продукта.
>
> **Аудитор код НЕ меняет.** Здесь только находки, доказательства (file:line),
> сценарии отказа и рекомендации. Правки — решение владельца.

Дата начала прохода: **2026-07-29**. Ветка: `main`. Аудит выполнен поверх
рабочего дерева с незакоммиченной WIP-правкой палитры UI (де-неон) и свежего
коммита `06349513` (сквозная прозрачность потолков).

## Как читать этот документ

- **Severity**: `BLOCKER` (ломает прохождение/краш) · `HIGH` (система мертва/
  двойная награда/потеря данных) · `MED` (заметный, но локальный дефект) ·
  `LOW` (косметика/доки/инертный код).
- **Статус**: `CONFIRMED` (прочитаны обе стороны, воспроизводимо по коду) ·
  `PLAUSIBLE` (сильное подозрение, нужна доигровая проверка).
- Каждая находка помечена, если это НОВЫЙ экземпляр уже известного класса из
  внутреннего реестра прошлых аудитов (#1–#181), чтобы не дублировать.
- **Prior-audit ledger**: findings #1–#181 задокументированы в приватной памяти
  аудитора (не в репозитории). Этот файл — публичная запись НОВОГО прохода.

---

## РАЗДЕЛ A. Точность документации (Documentation Accuracy)

Проверка «не копируй счётчики по памяти — верифицируй из исходника»
(AGENTS.md §Source Of Truth). Все числа README пересчитаны рантайм-импортом
дефиниций через `tsx`.

| README claim | Actual (verified) | Verdict |
| --- | --- | --- |
| 446 предметных ID | `Object.keys(ITEMS).length === 446` | ✅ точно |
| 69 пакетов монстров (`MonsterKind`) | enum = 69 членов | ✅ точно |
| 50 дизайн-маршрутов (`DESIGN_FLOOR_ROUTES`) | 50 | ✅ точно |
| 19 шагов PLOT_CHAIN | `PLOT_CHAIN.length === 19` | ✅ точно |
| 18 PSI-видов оружия | `PSI_WEAPON_STATS` = 18 | ✅ точно |
| 12 типов фабрик / 42 рецепта | `FACTORIES.length === 12`, рецептов 42 | ✅ точно |
| 582 статических слуха | `RUMORS.length === 582` | ✅ точно |
| **70 физических + 18 PSI = 88 оружий** | **`PHYS_WEAPON_STATS` = 71 → 71+18 = 89** | ⚠️ **A1: drift (off-by-one)** |

### A1 — README/items.md занижали счётчик оружия на 1 · LOW · CONFIRMED · ✅ ИСПРАВЛЕНО (docs)

- **Где**: `README.md:464` («Оружие (70 физических + 18 PSI = 88 видов)») и
  `items.md:52` («70 физических weapon stat entries и 18 PSI»).
- **Факт**: рантайм-импорт → `PHYS_WEAPON_STATS` = **71**, `PSI_WEAPON_STATS` =
  **18**, итог **89** (не 88). Один физический ствол добавлен без обновления
  обоих доков.
- **Действие аудитора**: это правка **документации** (в рамках мандата
  «можешь улучшать и дополнять документации»), код не тронут. Обе строки
  исправлены на «71 … = 89». Проверено рантайм-импортом.
- **Рекомендация на будущее**: завести рантайм-тест, печатающий счётчики
  реестров, чтобы doc-drift ловился гейтом `check:readonly`.

### A2 — Контракт случайности в README/AGENTS/CLAUDE неполон · LOW · CONFIRMED

- **Где**: `README.md` §2 «Генерация случайных чисел», `AGENTS.md` §Randomness,
  `CLAUDE.md` §Randomness — все три заявляют **абсолютный** запрет
  `Math.random()` с ЕДИНСТВЕННЫМ исключением «крипто/сетевая идентичность».
- **Факт**: в `src/core/rand.ts:28-35` есть санкционированные обёртки
  `mathRng()` / `mathIrand()` («Local game RNG — based on Math.random()… for
  visual, audio, and UI»), и они используются **92 раза** в 23 файлах
  (`audio.ts`, `music.ts`, `critters.ts`, `blood_fx.ts`, `needs.ts` сообщения,
  `damage.ts:117` dmg-flash, `faction_events.ts` residue-jitter, мини-игры
  `durak/dice/domino/gambling/checkers`, `camera.ts`, `void_protocols.ts` FX и др.).
- **Оценка**: это НЕ баг кода — `problems.md` подтверждает намеренность
  («остаток `Math.random()` … намеренный `mathRng()` … НЕ влияет на геометрию»).
  Но три **авторитетных** контракта (README/AGENTS/CLAUDE) о нём молчат и прямо
  говорят «строго запрещено … единственное исключение — крипто». Агент, читающий
  только их, посчитает 92 живых вызова нарушением.
- **Проверка на утечку в детерминизм**: выборочно прочитаны «пограничные»
  вызовы — `damage.ts:117` (только `state.dmgFlash`, визуал) и
  `faction_events.ts:1948` (джиттер позиции декоративной метки). Геймплейный
  результат от них не зависит; десинк тестов/онлайна не наблюдается. ✅
- **Действие аудитора (docs, в рамках мандата)**: добавлен абзац о
  `mathRng`/`mathIrand` в §Randomness всех трёх авторитетных доков — `README.md`
  (после списка API), `AGENTS.md:294`, `CLAUDE.md:296`. Формулировка **не меняет
  политику**, а лишь документирует уже отгруженную обёртку из `rand.ts`:
  разрешено только для косметики (визуал/аудио/UI, не влияющие на симуляцию),
  запрещено в геометрии/генерации/AI/луте/спавне/сейв-логике; сырой
  `Math.random()` — по-прежнему только крипто/сеть. Код не тронут.
- **Эффект**: следующий аудит/интегратор больше не будет считать 92 живых
  `mathRng`-вызова нарушением «строгого запрета».

### A3 — Мелкая несогласованность расширений импорта · LOW · CONFIRMED (косметика)

- `src/systems/music.ts` импортирует с явным `.js` (`'../core/types.js'`,
  `'./audio.js'`), тогда как ~весь остальной `src/` — без расширения.
  `tsconfig` (`moduleResolution: bundler`, `allowImportingTsExtensions`) и Vite
  собирают оба варианта, поэтому это не ошибка сборки — но стилевой дубликат
  соглашения. Незначительно.

### A4 — `desdoc.md` описывает удалённый тип `FloorLevel` как текущую опору + два устаревших счётчика (446→«434», items.md исправлен) · LOW · CONFIRMED · ✅ ЧАСТИЧНО ИСПРАВЛЕНО (docs)

- **Где**: `desdoc.md:74` — «6 `FloorLevel`: `MINISTRY`, `KVARTIRY`, `LIVING`,
  `MAINTENANCE`, `HELL`, `VOID`» в разделе **«1. Текущая Точка Опоры»** (то, что
  документ подаёт как *актуальное* состояние кода). И `desdoc.md:80` — «434 item
  ids» + `items.md:11` — «registry содержит 434 item id».
- **Факт (верифицировано из исходника)**: тип `FloorLevel` **полностью удалён**
  из кода — `rg "FloorLevel" src` даёт **0 совпадений**. Это прямое следствие
  коммита `71d18f2b` «Refactor: Remove STORY and **FloorLevel**». Реестр
  предметов = **446** (рантайм-импорт `Object.keys(ITEMS).length`), README:473
  уже говорит правильные «446», а `items.md`/`desdoc.md` отстали на 12.
- **Классификация**: `desdoc.md:76` **сам** оговаривает, что volatile-счётчики
  не считаются shipped-фактом — поэтому число «434» в desdoc я НЕ трогаю (это
  плановый док, его counters самодисквалифицированы). НО «6 `FloorLevel`» — это
  **структурное** утверждение об удалённом типе, а не volatile-счётчик, и стоит
  в разделе «текущая точка опоры». Это **doc-footprint кластера C12/C13**:
  рефактор «eradicate legacy Z / remove FloorLevel» оставил дрейф и в коде
  (C10/C12/C13), и в документации.
- **Действие аудитора (docs, в рамках мандата)**: исправлен `items.md:11`
  (434→446, сверено с авторитетным README:473 и рантайм-импортом). `desdoc.md`
  **намеренно не тронут**: это плановый документ, его counters
  самодисквалифицированы строкой :76, а структурную правку строки :74
  («6 FloorLevel») оставляю владельцу как часть решения по всему кластеру
  легаси-Z (см. C13 «Итог кластера») — точечно менять desdoc в отрыве от
  решения по коду означало бы зафиксировать полу-состояние. Код не тронут.
- **Рекомендация**: раздел «Текущая Точка Опоры» в desdoc — единственное место,
  где структурные факты (а не counters) стоит держать в синхроне; при закрытии
  кластера C12/C13 обновить строку :74 (нет `FloorLevel` → route-Z + string-id
  design floors) тем же коммитом.

---

## РАЗДЕЛ B. Незакоммиченная WIP-правка (working-tree review)

Рабочее дерево содержит правку владельца (де-неон палитра UI + переверстка
витальных баров + `columnCap` для уличных этажей). Проверено на регрессии.

### B0 — WIP чист (не находка, а подтверждение)

- `src/render/hud.ts`: удалены `BAR_W`/`BAR_H`, витальные бары переписаны на
  сплошную заливку + рамку; проверено — `BAR_W/BAR_H` больше нигде не читаются
  (0 ссылок), `drawHoloBar` всё ещё используется в оружейной панели (не осиротел),
  `NEEDS_PANEL_H` жив. Промпт-лок панель теперь измеряет/переносит текст через
  `wrapHudText` перед расчётом высоты — устраняет обрезку. Регрессий нет.
- `src/data/floor_object_placement.ts` + `src/gen/floor_object_placement.ts`:
  новое поле `columnCap` (явный кап декоративных колонн; `0` для
  `manhattan_crossroads`, чтобы уличные колонны не тянулись в небо на открытом
  потолке). Композиция слоёв и `profileLayerHasContent` обновлены согласованно.
  Соответствует свежей see-through-механике. Корректно.
- Палитра де-неон согласуется с taste-памятью проекта («muted System-Shock/BLAME,
  no neon»); цветовые правки не логические. Не баги.
- `src/render/critters.ts` (свежая WIP владельца, появилась во время прохода):
  добавлено поле `Critter.heading` (радианы, локальный зигзаг-блуждание), удалён
  `hasAdjacentWall`. Проверено:
  - `heading` инициализируется во **всех** точках: пул (`:38` = 0), спавн
    (`:82` = случайный), обновление на ретаргете (`:164`, `:178`) — нет
    неинициализированного/NaN-пути.
  - `hasAdjacentWall` удалён начисто: `rg` по `src/` → ноль висящих ссылок;
    `getAdjacentFloors` всё ещё используется. Безопасный рефактор.
  - Вся случайность через `mathRng()` — корректно (криттеры чисто визуальные,
    в симуляцию/сейв не входят; см. A2).
  Регрессий нет. **Аудитор файл НЕ трогал** (согласно мандату и предупреждению
  CLAUDE.md о незакоммиченной работе).
- `scripts/ui-shots.mjs`, `scripts/ui-shots-inject.mjs` — untracked
  скриншот-утилиты владельца (mtime сразу после see-through коммита). Не
  трогались.

### B1 — WIP владельца разросся в широкий UI/де-неон пасс + оптимизацию `surface_marks` (переоценка на текущем HEAD) · наблюдение · CONFIRMED

- **Что изменилось с момента оценки B0**: рабочее дерево выросло с ~10 до **24
  грязных `src/`-файлов** — фактически весь UI-слой `render/*_ui.ts`
  (container/controls/craft/demos/economy/factions/feedback/help/log/map/menu/
  net_sphere/npc/quest/stats/ui_settings + hud) плюс `mesh/scene_collect.ts`,
  `item_sprites.ts`, `critters.ts` и **`systems/surface_marks.ts`**. Правки
  UI-файлов мелкие (±2–8 строк, цвет/раскладка), крупные — `hud.ts` (+155),
  `map_ui.ts` (+139), `npc_ui.ts` (+136), `stats_ui.ts`, `economy_ui.ts`.
  Профиль соответствует координированному де-неон/переверстка-пассу (см.
  taste-память «muted System-Shock/BLAME»).
- **`systems/surface_marks.ts` (+53) — единственный НЕ-render файл в WIP,
  проверен построчно**: владелец ограничил рост `world.surfaceMap` —
  `SURFACE_MAP_MAX_CELLS = 1024` + FIFO-эвикция **только** ambient-ячеек
  (`surfaceFlags === 0`), функциональные метки (мел-подсказки, craft/interactive)
  не выселяются. Через `acquireSurfaceCell(world, ci)` заменены 3
  дублированных get-or-alloc блока. **Верифицировано:**
  - **Инвариант из комментария соблюдён**: `SURFACE_MAP_MAX_CELLS (1024)` ==
    `SURF_MAX_SLOTS (SURF_ATLAS_COLS² = 1024, webgl.ts:2771)`. Это ровно тот
    порог, за которым рендерер (`webgl.ts:3003/3483`) бросает инкрементальный
    upload и делает полный O(N log N) re-sort + ~3 МБ re-upload на каждое
    движение камеры. Кап держит рендерер на дешёвом пути. Правильная,
    прицельная правка реального драйвера FPS-деградации.
  - **Ленивая аллокация корректна**: call-site радиус-штампа
    (`if (!cell) cell = acquireSurfaceCell(...)`) выделяет 1КБ-тайл только
    когда пиксель реально проходит порог alpha/intensity — не плодит пустые
    ячейки. Умно, не баг.
  - **Единственная придирка (LOW, не регрессия)**: кап `==`, не `<`
    `SURF_MAX_SLOTS` — нулевой запас. В теории при 1024 сплошь функциональных
    ячеек эвиктор выходит вхолостую, `acquireSurfaceCell` всё равно аллоцирует,
    map перескакивает порог и рендерер уходит на дорогой путь. На практике
    функциональных меток мало (комментарий это оговаривает), так что край
    почти недостижим. Стоит держать `SURFACE_MAP_MAX_CELLS < SURF_MAX_SLOTS`
    для явного запаса — но это замечание владельцу, не баг текущего HEAD.
- **Границы моей проверки (честно)**: широкий UI-цвет/раскладка-пасс — это
  **активно движущаяся** правка владельца; я НЕ вычитывал попиксельно все 22
  render-файла (это не входит в мандат «баги/регрессии/легаси/дубликаты» и
  дерево меняется под аудитом). Проверил структурно: правки не логические
  (цвет/позиция/перенос текста), риск-класс тот же, что B0. Единственный
  системный файл (`surface_marks`) вычитан построчно — чист. **Аудитор ни один
  файл WIP не трогал.** Финальная визуальная приёмка UI-пасса — за владельцем
  (клиппинг/читаемость на desktop+mobile), как и требует мандат «долго
  грузится → проверяй сам визуально при наличии dev-сервера».

---

## РАЗДЕЛ C. Находки по подсистемам (subsystem findings)

> Каждая находка: severity, file:line, доказательство, сценарий отказа, класс.

### C1 — Мёртвая полу-реализованная фича «гоп-стоп» (mugging) · MED · CONFIRMED · NEW

- **Где**: `src/systems/ai/mugging_utility.ts` (весь файл, 32 строки) +
  `src/core/types.ts:1024-1027`.
- **Факт**:
  - `scoreMuggingIntent()` и `updateMuggingTactics()` — чистые заглушки
    (`return 0;` / пустое тело, оба с `// TODO: jules, реализуй…`).
  - **Ноль импортёров**: `rg mugging_utility|scoreMuggingIntent|updateMuggingTactics`
    вне самого файла — пусто. Функции не вызываются из AI-диспетчера
    (`npc_utility.ts`, `tactics.ts`, `npc_fsm.ts`).
  - При этом `core/types.ts` (RED-файл) держит **4 зарезервированных типа
    события** под фичу: `mugging_start`, `mugging_payment`, `mugging_refusal`,
    `mugging_end` — и **ни один не публикуется и не обрабатывается** нигде
    (`rg` по каждому вне types.ts — пусто).
- **Сценарий отказа**: не крашит игру (просто мёртвый код), но:
  1. Загрязняет RED-файл `core/types.ts` четырьмя фантомными событиями —
     каждый следующий интегратор считает их живым контрактом.
  2. Параметры заглушек типизированы как `any` (`_npc: any`, `_player: any`) —
     точка потери типобезопасности, если кто-то начнёт их звать.
  3. Классический AGENTS.md анти-паттерн «Dead data with no reachable gameplay
     or debug path».
- **Класс**: DEAD-AUTHORED-FEATURE (заглушка + зарезервированные,
  неиспользуемые типы событий). Родственно ledger-классу
  DEAD-AUTHORED-FIELD, но здесь мёртв весь вертикальный срез фичи.
- **Рекомендация владельцу (не аудитора)**: либо доимплементировать гоп-стоп
  (WILD-фракция, ≥3 вооружённых, playerRelation<0, cooldown — как в докстринге),
  либо удалить `mugging_utility.ts` и 4 события из `core/types.ts`. Пока это
  «обещание незавершённой работы» в самом защищённом слое.

### C2 — Подтверждение ledger-blocker #45: маршрутные хелперы лифтов мертвы · BLOCKER · CONFIRMED (известное, DEFERRED)

- **Где**: `src/gen/shared.ts:1998` (`routeLiftDirections`), `:2005`
  (`ensureReachableRouteLifts`).
- **Независимая верификация** (не по памяти): у обеих функций **ноль вызовов**
  (`rg …\( | grep -v 'export function'` → 0). Полностью написанные,
  корректные хелперы (чистят неожиданные лифты, гарантируют достижимость от
  спавна, ставят fallback-лифт нужного направления) — но никто их не зовёт.
- **Как лифты ставятся на самом деле**: каждый дизайн-этаж вызывает свой
  локальный `placeLifts(world, N, LiftDirection.UP)` **и** `…DOWN` с
  захардкоженным N (напр. `manhattan_crossroads/index.ts:63-64` — по 16 в обе
  стороны), **независимо от позиции этажа в маршруте**. Значит направление
  лифта не привязано к `routeLiftDirections(z, minZ, maxZ)`, и на концах
  маршрута (крыша `z=+50`, войд `z=−50`, границы `FLOOR_RUN_MIN/MAX_Z` в
  `data/procedural_floors.ts:186-188`) нет route-aware гарантии достижимого
  подъёма/спуска.
- **Статус**: это уже известный **#45** (endgame route sealed), помечен в
  реестре как RED+design, **DEFERRED** до решения владельца. Здесь — только
  свежая независимая перепроверка, что находка всё ещё живая на текущем HEAD.
  **Не действие аудитора.**

### C3 — Коммит see-through потолков (`06349513`): инвариант «два рендерера синхронны» соблюдён · ⚠️ но см. C16 (третий аспект — регрессия)

> **Пере-оценка.** Эта находка изначально была помечена «регрессий НЕ
> найдено · чисто». Это было **слишком широкое** заключение: C3 проверял
> только два аспекта коммита (синхронность двух рендереров + порог `SKY_TIER`)
> и оба они **подтверждены чистыми повторно** (см. ниже). Но третий аспект —
> *достижимость* терминала неба в raycaster-марше — C3 не рассматривал, и там
> есть HIGH-регрессия. Вынесена отдельно в **C16**. Заголовок и вердикт C3
> сужены до реально проверенного.

Проверенные и **подтверждённые чистыми** аспекты:

- Проверен по памяти-заметке «see-through столбы идут из ДВУХ рендереров»
  (raycaster DDA в `webgl.ts` + инстансный меш в `scene_collect.ts`).
- **Оба** пути клампят по общему порогу: `SKY_TIER_THRESHOLD = 8`
  (`gen/ceiling_heights.ts:49`, экспорт) и `SKY_TIER = 8.0`
  (`render/webgl.ts:240`, GLSL-константа). На каждой стороне стоит парный
  cross-reference комментарий «Keep in sync». Значения совпадают. ✅
- `scene_collect.ts applyCeilingHeight` клампит `min(rawTier, SKY_TIER-1)` —
  меш-колонны/висящие фикстуры не тянутся до неба. Скайлайн-высоты на
  WALL-клетках не несут колонн-инстансов (проверено субагентом). ✅
- `ceiling_heights.ts` pass-2 переписан аккуратно: всё под `world.hasOpenSky`,
  легаси-ветка (`globalCeilingTier`) сохранена дословно (закрытые этажи —
  байт-в-байт, подтверждено `git show 06349513^`). DOOR/LIFT/ABYSS больше не
  уходят столбами вверх. ✅
- WIP-правка `columnCap:0` (placement-time, `manhattan_crossroads`) и рендер-
  кламп (draw-time) ортогональны и не конфликтуют.
- **Вывод (сужен)**: инвариант «два рендерера синхронны» и порог-синк —
  соблюдены и чисты. **Но** динамическое небо на открытых этажах не рисуется —
  см. C16.

### C4 — Здоровье кодовой базы по маркерам хрупкости (fragility markers)

Быстрый сплошной срез (severity per-item — LOW, приведён как фон, не как
отдельные баги):

- `Math.random()` в `src/`: **только** санкционированные места —
  `core/rand.ts` (обёртки `mathRng`/`mathIrand`) + `net_sphere.ts:698`
  (`Date.now()+Math.random()` для id) + `online_client.ts:182` (peer-id).
  Оба сетевых — задокументированное исключение. **Геймплейных нарушений
  RNG-контракта нет.** ✅
- `@ts-ignore`/`@ts-expect-error`: 96 вхождений. Не критично, но заметная
  масса подавленных проверок типов — точечный техдолг.
- `as any`: 34 — умеренно.
- Реальных `TODO`/`FIXME` (по границе слова, вне net_hack-именования): **2**,
  оба в мёртвом `mugging_utility.ts` (см. C1). Кодовая база на удивление
  свободна от «оставлю на потом»-маркеров.
- `console.*` вызовов: ~34 в 11 файлах. Проверены горячие кандидаты
  (`webgl.ts`, `main.ts`, `events.ts`): **все на путях ошибок / context-loss /
  инициализации, ни один в per-frame цикле**; `events.ts:106` даже капит логи
  (`MAX_OBSERVER_ERROR_LOGS`). Перф-проблемы нет; максимум — шум в консоли
  релизной сборки. ✅

### C5 — 15× `@ts-ignore` маскируют неверное имя поля (`z` вместо `floor`) в POI-метаданных · LOW · CONFIRMED · NEW

- **Где**: `src/gen/maintenance/content_manifest.ts` (11 сайтов),
  `src/gen/ministry/content_manifest.ts` (2), `src/gen/kvartiry/content_manifest.ts`
  (1), `src/gen/kvartiry/social_macro_graph.ts` (1). Тип —
  `src/gen/content_manifest_utils.ts:31-39`.
- **Факт**: интерфейс `PoiGenerationMetadata` имеет поле `floor?: string` и
  **не имеет** поля `z`. Все 15 сайтов пишут `// @ts-ignore` + `z: 'maintenance'`
  / `'ministry'` / `'kvartiry'`. Итог:
  1. `@ts-ignore` глушит ошибку «object literal may only specify known
     properties» — то есть подавляет именно ту проверку, что ловит опечатку.
  2. Задуманное поле `floor` остаётся `undefined` во **всех** POI-записях.
  3. `z` попадает в хранилище фантомным нетипизированным свойством (spread в
     `recordPoiGenerationMetadata`).
- **Почему сейчас инертно**: `getPoiGenerationMetadata()` имеет **ноль
  читателей** во всём `src/` — метаданные POI сегодня write-only. Это
  санкционированная точка расширения (AGENTS.md: «POI audit/debug metadata»),
  ждущая потребителя, а не анти-паттерн сам по себе.
- **Сценарий отказа (отложенный)**: как только появится debug/map/audit-
  потребитель, читающий `meta.floor`, он получит `undefined` на каждом POI, а
  реальная метка этажа будет лежать в нечитаемом `meta.z`. Тихая потеря данных
  на будущем гейте.
- **Класс**: WRONG-KEY-NAME (родственно ledger WRONG-ID-SPACE / WRONG-KEY-vs-
  ROUTE-ID) + SUPPRESSED-TYPE-ERROR. `@ts-ignore` здесь скрывает именно
  контрактное расхождение, а не необходимую хитрость.
- **Рекомендация владельцу**: заменить `z:` → `floor:` во всех 15 сайтах и снять
  `@ts-ignore` (тип тогда пройдёт без подавления). Либо, если поле реально
  нужно как `z`, добавить `z?: string` в интерфейс и убрать `@ts-ignore`.
  Инертно сегодня — но это ровно тот класс, что «всплывёт» на следующем аудите.

---

## РАЗДЕЛ C-sub. Находки субагентов (verified, deduped)

Ниже — находки параллельных проверок подсистем. Каждая сверена с реестром
#1–#181, помечена NEW/known, severity и file:line сохранены.

### C6 — `psi_storm` не применяет митигацию по трейтам монстров (в отличие от двух других PSI-путей урона) · HIGH · CONFIRMED · NEW

- **Где**: `src/systems/psi.ts:202-204` (`castStorm`).
- **Факт**: `castStorm` вычитает урон сырым (`e.hp -= dmg;`), тогда как **оба**
  других HP-наносящих PSI-пути маршрутизируют урон через
  `applyMonsterIncomingDamage(world, e, …)`:
  - `castBeam` (`psi.ts:494-495`, Хамехамеха),
  - `psiAoeExplosion` (`psi.ts:539-540`, PSI-граната/AoE).
  Хелпер `applyMonsterIncomingDamage` (`src/systems/monster_traits.ts:168-172`)
  применяет **Panelnik wall-brace** и **Lotochnik drain-armor (×0.58)**.
  `castStorm` — единственный из трёх `.hp -=` в psi.ts (строки 203/495/540), кто
  не зовёт ни `applyMonsterIncomingDamage`, ни `calculateDamage`.
- **Сценарий отказа**: против wall-braced Панельника или drain-armored
  Лоточника Пси-буря (`data/psi.ts:11`, dmg 18, `psiEffect:'storm'`) наносит
  полный немитигированный урон, тогда как луч и граната — сниженный. Контрплей
  «броня монстра» тихо ломается ровно для одного заклинания; Пси-буря
  аномально сильна против этих трейтов. Достижимо: каст Пси-бури →
  `castInstantSpell` case `'storm'` (`psi.ts:62`).
- **Класс**: ASYMMETRIC-BRANCH (внутри-PSI расхождение; отсутствует
  trait-mitigation хук на одном из трёх сиблинг-путей). Комментария-исключения
  нет.
- **Отличие от known**: это НЕ «projectile/AoE bypass `calculateDamage`»
  (там про armor-*resistances*) и НЕ #93 (PSI AoE double-*application*). Здесь —
  под-применение: пропущена митигация по **трейтам** монстра, которую два
  других PSI-пути вызывают. Новый экземпляр.

### C7 — HUD/телеметрия урона по игроку логирует ДО-броневое число, а HP теряет ПОСЛЕ-броневое · LOW (косметика) · CONFIRMED · NEW

- **Где**: системно в `src/systems/ai/monster.ts` — напр. `4035-4036`,
  `5359-5361`, `5432-5434`, `5735-5737`, `5890-5892`, `6161-6163`, `7058-7066`.
- **Факт**: HP уменьшается на `_dmg = calculateDamage(damage, …, player)`
  (после резиста брони игрока), но `recordPlayerDamage(state, e, damage, …)`
  и интенсивность `spawnBloodHit` используют **сырой** `damage`.
  `recordPlayerDamage` (`systems/damage.ts`) — только телеметрия, HP не мутирует
  (проверено — это НЕ двойной урон), заполняет `state.lastDamage`.
- **Сценарий**: игрок в кинетик-резист броне видит в HUD «-18», а реально
  теряет, скажем, 11 HP. Отображаемое число завышает реальную потерю при любом
  совпадающем резисте. Чисто читаемость/телеметрия, не ошибка матемодели урона.
- **Класс**: DISPLAY-vs-APPLIED mismatch. Спорно, баг ли (можно трактовать как
  «показываем силу атаки»); claim по коду — HIGH, severity — LOW.

### C-sub combat: отклонённые версии (swept, НЕ баги)

- `weapon_beams.ts:175` idx-key mismatch — ОТКЛОНЕНО (`world.idx` флорит оба
  операнда, ключи идентичны).
- `combat.ts:28-29` не-торический knockback — это **known #106**, не
  переоткрываю.
- DEAD-AUTHORED sweep по `WeaponStats`/`ItemDef` — новых мёртвых полей нет
  (у всех кандидатов есть читатели).
- Магазин/патроны — новых сверх known #142/#143 нет.
- Двойного урона в melee/AoE/projectile монстров — не найдено.

### C8 — Крафт-станция `net_terminal` нигде не открывается → целый класс рецептов неизлечимо не-craftable · HIGH · CONFIRMED · NEW

- **Где**: `src/data/craft_recipes.ts:68` (+`:108` присваивает
  `station: stationForItem(...)`), `src/data/interactive.ts:225/249/273`
  (открываются только `lathe`/`workbench`/`lab`), `src/systems/crafting.ts:241`
  (правило матча станции), `src/gen/craft_stations.ts` (плейсмент).
- **Факт (перепроверено независимо)**:
  - `CraftStationKind` включает `'net_terminal'` (`craft_recipes.ts:12`), и
    `stationForItem` (`:60-68`) возвращает `'net_terminal'` для всего, что
    помечено `net`/`terminal`/`cybernetics` или является meta/rareCyber.
  - `crafting.ts:241`: рецепт собирается только если
    `recipe.station === 'any' || recipe.station === station`. `'net_terminal'`
    **не** удовлетворяется `'any'`.
  - **Ни один** источник не открывает крафт-меню со станцией `'net_terminal'`:
    `rg "craftStation:\s*'net_terminal'"` → **пусто**; в `interactive.ts`
    только `lathe/workbench/lab`; в `craft_stations.ts` плейсмент ставит только
    станции этих трёх; в рантайме `state.craftStationKind` = только
    `lathe/workbench/lab` (`main.ts`). Даже debug-меню не открывает
    `net_terminal` крафт (пункты «НЕТ-ГЕН» — это **взлом** сети, не крафт).
- **Затронутые рецепты (learnable, но uncraftable)**: `ammo_energy`,
  `gravity_beam_emitter` (учит `item_blueprint_t3_folder`,
  `craft_recipe_sources.ts:69`), `psi_phase` (учит `item_frozen_item_shard`,
  `:105`), плюс `bfg`, `gauss`, `plasma`, `grn420_gravizhernov`,
  `ato41_atomic_flamer`, `psi_possession`, `psi_void_needle`, `void_spike` и
  всё с тегами `net`/`terminal`/`cybernetics`. T3-чертёж и frozen-shard реально
  добываются оффлайн (фабрика `factories.ts:551`; процедурный дроп
  `procedural_floor.ts:12470/12491`) — путь достижим в обычной игре.
- **Сценарий отказа**: игрок тратит редкий T3-чертёж / frozen-shard, чтобы
  выучить, скажем, энергоячейку или GBE, — и **никогда** не может это собрать:
  ни одна станция в мире (или в debug) не открывает `net_terminal`. Рецепт
  навсегда `station_mismatch`; материалы/чертёж потрачены впустую.
- **Класс**: UNREACHABLE-RECIPE + `net_terminal`-ветка `stationForItem` —
  фактически DEAD-authored вывод. Отлично от known **#164** (тот про *веса
  количества* NET-терминалов в `net_terminal_gen`, не про `CraftStationKind`).
- **Рекомендация владельцу**: либо (a) добавить интерактивную крафт-станцию
  `net_terminal` (def в `interactive.ts` + плейсмент в `craft_stations.ts`),
  либо (b) переназначить эти рецепты на существующую станцию (напр. `lab`),
  сузив/убрав `net_terminal`-ветку в `stationForItem`. До этого — потерянные
  чертежи в обычном прохождении.

### C9 — `CorporationDef.rumorTags` — мёртвое авторское поле · LOW · CONFIRMED · NEW

- **Где**: `src/data/corporations.ts:20` (объявление), заполнено на всех 10
  корпорациях (`:43,57,71,85,99,113,127,141,155,169`).
- **Факт**: `rg "\.rumorTags"` по `src/` → **ноль** чтений свойства (единственные
  другие вхождения — несвязанный `eventData.rumorTags` в
  `gen/maintenance/remontnik_bez_smeny.ts`, это поле world-события). Соседние
  поля живут: `positiveEventTags`/`negativeEventTags` кормят `STOCK_SIGNALS`/
  `eventImpulseForCorp`; `factoryIds`/`resourceIds`/`sector` читаются в
  `stock_market.ts:377/398`.
- **Сценарий**: функционального слома нет — 40 тегов на 10 корпораций, которые
  никто не читает; задуманная связка «корп-слух ↔ биржа» не подключена.
- **Класс**: DEAD-AUTHORED-FIELD. Родственно широкому классу из реестра
  #1–#181. Low severity.

### C-sub economy: отклонённые версии (verified NOT bugs)

- Все 40 item-id в `craft_recipe_sources` существуют в `ITEMS`.
- `slime_sample_silver/_open` в `item_composition.ts` = реальные id.
- Bad-batch в обход `maxOutputItemCount` (`production.ts:825`) — намеренно
  (остаток от джема).
- `labor` с пустым `itemIds` — намеренный абстрактный ресурс из floor-stock.
- Stock buy/sell-квоты всегда заполнены (`createStockMarketState` сеет все
  корпорации) — краша нет.
- Все три тика (`tickProduction`/`tickBankingInterest`/`tickStockMarket`)
  подключены в `main.ts:9822-9824`.
- Депозит-сложный vs заём-простой процент (`banking.ts:277-286`) — баланс/дизайн.

### C10 — Незавершённая миграция координаты этажа: авторские сайд-квесты используют легаси base-floor номера (60/100/140/…) в `targetFloorZ`/`visitFloorZ`, которые не совпадают ни с одним route-Z → целый класс завершений мёртв · HIGH · CONFIRMED · NEW

**Класс:** WRONG-COORD-SPACE / LEGACY-MIGRATION-STRANDS-COMPLETION (родствен, но
ОТДЕЛЬНЫЙ от `#149` builder-gap и `#9` giverId-freeze).

**Механизм (проверено сквозным чтением, не со слов субагента):**
завершение квеста с этажным гейтом идёт через
`isQuestTargetOnCurrentFloor` (`systems/contracts.ts`):
```
const route = questTargetRoute(q);                 // = q.targetRoute (позиционный)
if (routeHasPositionalTarget(route)) return entryMatchesRouteTarget(...);
const floor = questRouteFloor(q);                  // = q.targetFloorZ ?? q.visitFloorZ (сырой Z)
if (floor === undefined) return true;
return isCurrentStoryFloor(state, floor);          // design.z === floor
```
`isCurrentStoryFloor` (`systems/procedural_floors.ts`) истинна **только если
route-Z текущего design-этажа === переданному числу**. Все реальные design-Z
лежат в `[-50, 50]` (`data/design_floors.ts`, подтверждено: min −50 / max 50).
Легаси base-floor числа **60 / 100 / 140 / 180 / 200 не равны ни одному
design.z**, поэтому гейт **никогда** не срабатывает.

**Почему сюжет (PLOT_CHAIN) выжил, а сайд-квесты — нет:** каждый плот-шаг с
легаси-Z (`plot.ts` шаги 10/11/12/14: `targetFloorZ:180/200`) **дополнительно
несёт** позиционный `targetRoute:{z:-36}` / `{designFloorId:'ministry'}` / `{z:-50}`,
который короткозамыкает гейт в `entryMatchesRouteTarget` **до** чтения сырого
числа. Ни один из ~22 gen-файлов сайд-квестов **не имеет** `targetRoute`
(проверено: `rg -c targetRoute src/gen/**` = 0 во всех), поэтому у них сырое
число доходит до сломанного гейта. Это классический след **недоведённой
миграции координат**: сюжет пропатчили `targetRoute`-ами, слой сайд-квестов —
забыли.

**Только два типа квестов реально читают этот Z (остальные — инертные легаси):**
- **VISIT** — гейт на `quests.ts:261/268` (`checkVisitQuestAtPlayer`).
- **KILL-по-виду-монстра** — гейт в `notifyKill` (`quests.ts:932`):
  `if (!isQuestTargetOnCurrentFloor(q, state)) continue;` → `killCount` **не
  инкрементится** на легаси-этаже. (Этот KILL-подкласс субагент пропустил; я
  подтвердил его отдельно.)
- **FETCH** (ручная сдача, `quests.ts:1066/1097`) и **TALK** (`quests.ts:1051`,
  по смерти/`targetNpcId`) — floor-Z **не читают вообще**. Их `targetFloorZ`
  здесь — мёртвые данные (легаси-запах), не баг завершения.

**Подтверждённо НЕзавершаемые (harmful) экземпляры:**

| Файл | id / тип | Z | Почему мёртв |
| --- | --- | --- | --- |
| `gen/living/external_cell_neighbor.ts:307` | `ag77_use_route_rumor` · VISIT | 140 | **актив­но раздаётся** (giver — сюжетный `yakov`, один из 5 «выживших» из #9); desc зовёт в Коллекторы (real z=−26), гейт ждёт 140 |
| `gen/living/cartographer_zone_map.ts:52` | `ag43_cartographer_maintenance_lead` · VISIT | 140 | тот же «спустись в Коллекторы», гейт=140 |
| `gen/bolnichny_korpus/hospital_quarantine.ts:279` | ZOMBIE · KILL | 100 | `notifyKill` не считает килы (bolnichny real z=+16) |
| `gen/kvartiry/false_neighbor.ts:61` | NELYUD · KILL | 60 | то же (kvartiry-биом, z≠60) |
| `gen/kvartiry/chernobozhiy_svod.ts:262` | IDOL · KILL | 60 | то же |
| `gen/kvartiry/barricade.ts:148` | REBAR · KILL | 60 | то же |
| `gen/living/veretar_window_rescue.ts:86` | `ag95_mark_white_shortcut` · VISIT | 100 | **двойной**: `targetRoomDefId`-only ветка не строится билдером (`#149`-класс) **и** спурьёзный `targetFloorZ:100` |

**Инертные (мёртвые данные, не баг завершения):** ~60 остальных вхождений — все
FETCH/TALK-шаги в `slime_sample_post`, `scientist_escort_sample`,
`communal_kitchen_feud`, `belaya_prislushka`, `water_riot`, `medicine_swap`,
`ration_queue`, `pustoy_sosed`, `diver_kot`, `mushroom_cellar`,
`emergency_medpost`, `lost_child_corner`, `slime_deactivation_furnace`,
`ostavshiysya_likvidator` и т.д. Их стоит вычистить для гигиены, но геймплей
они не ломают.

**Полный список файлов с легаси-Z (60/100/140/180/200), 69 вхождений в 22
файлах:** `data/plot.ts`(10, БЕЗОПАСНЫ — с `targetRoute`),
`slime_sample_post`(6), `scientist_escort_sample`(6), `hospital_quarantine`(6),
`communal_kitchen_feud`(5), `belaya_prislushka`(4), `water_riot`(4),
`medicine_swap`(4), `chernobozhiy_svod`(4), `ostavshiysya_likvidator`(3),
`barricade`(3), `slime_deactivation_furnace`(2), `ration_queue`(2),
`pustoy_sosed`(2), + 8 файлов по 1.

**Взаимодействие с #9 (честность):** большинство giver-ов сейчас также
заморожены import-time freeze `#9`. НО предложенный фикс #9 (backfill giverId)
**не** трогает `targetFloorZ`/`visitFloorZ` — как только #9 починят, `ag77`
станет активно раздаваемым **и** незавершаемым. То есть C10 — независимый долг,
который #9-фикс раскроет, а не закроет.

**Направление фикса (для владельца, НЕ применяю — код не трогаю):** дать каждому
harmful-квесту позиционный `targetRoute` (`{designFloorId:…}` или `{z:…}` в
диапазоне −50..+50), как уже сделано у плот-шагов; для `ag95` — либо ветка
билдера под `targetRoomDefId`, либо `targetRoom`/`targetRoomType`. Инертные
FETCH/TALK-Z — просто удалить. Так как это data-правки в GREEN/YELLOW gen-файлах
и один общий контракт — стоит одобрения, но не RED.

**Проверка:** `npm run typecheck` не поймает (числа валидны как `number`); нужен
таргетный тест «каждый авторский VISIT/KILL-квест разрешается в реальный
route-Z или несёт `targetRoute`». Такого регресс-замка в наборе нет.

---

### C11 — Асимметрии санитайзеров save/load: `economy.floors` восстанавливается без cap-а количества (в отличие от соседнего `routes`) + 3 более мелких сиблинг-асимметрии · HIGH (F1) / LOW (F2–F4) · CONFIRMED · NEW

**Класс:** ASYMMETRIC-CAP / MISSING-SANITIZATION (в `normalize*`-восстановителях
недоверенного `localStorage`; противоречит прежнему CLEAN-вердикту реестра
Wave-16C «economy … fully restored+clamped»). Проверено чтением обеих сторон.

**F1 (HIGH) — `economy.floors` без cap-а количества, а сосед `routes` — с cap=128.**
- Запись: `systems/economy.ts:329-331` (`economyForSave`) отдаёт **живой,
  ненормализованный** объект; `floors` копит по записи на каждый посещённый Z
  без run-cap-а (писатели `economy.ts:341/410/429/642`) → restore — единственный
  страж.
- Восстановление: `data/economy.ts:110-131` фильтрует **только диапазон ключа**
  (`floorNumber < -9999 || > 9999` ≈ 20 000 слотов × 17 ресурсов) и **не
  ставит cap на количество**. Сосед `routes` прямо ниже (`:133-142`) режется
  `ECONOMY_ROUTE_STATE_CAP = 128` (`:35`).
- Сценарий: подделанный `gigahrush_save` с тысячами ключей `economy.floors` в
  [-9999,9999] принимается целиком → до ~20k floor-state (~340k объектов)
  строится в `normalizeEconomyState` → всплеск памяти/времени нормализации.
  Соседний `routes` от ровно этого защищён — `floors` нет.

**F2 (LOW) — `floors[z].lastTickAt` без finite/range-клампа**, тогда как все
соседи в той же функции клампятся. `data/economy.ts:129`:
`normalized.lastTickAt = existing?.lastTickAt ?? 0;` — сырой pass-through против
`clamp(finiteOr(...))` у `stock`/`target`/`lastDelta` (`:118-124`). Влияние ≈0:
поле **пишется, но не читается** (grep: только `:422/:13/:46/:129`). Чистая
сиблинг-асимметрия внутри санитайзера недоверенных данных.

**F3 (LOW) — `economy.routes`: полный normalize+cap путь при НУЛЕ рантайм-писателей
(мёртвое чтение).** `data/economy.ts:133-142` + весь shape `EconomyRouteState`/
`createEconomyRouteState`/`normalizeEconomyRouteState`/`ECONOMY_ROUTE_STATE_CAP`
— restore-путь без продюсера. `createEconomyState()` инициализирует
`routes:{}`, писателей нет (grep по `systems/`/`gen/`/`main.ts`, исключая
несвязанные `black_market_88`/`production_belt` `RouteState`) → легальный save
всегда отдаёт `routes:{}`. DEAD-AUTHORED-подкласс. (Смежно C10/C1/C9 — общий
паттерн авторского кода без читателя.)

**F4 (LOW) — map_editor `patch.themeTags` без cap-а длины и без валидации
элементов**, тогда как соседи `patches`/`ops`/`skipped` все ограничены.
`systems/map_editor.ts:386`: `themeTags: Array.isArray(src.themeTags) ? src.themeTags : ['living']`
против `slice(0, PATCH_OP_CAP=4096)`/`slice(-12)`/`PATCH_FLOOR_CAP=48` у соседей.
Влияние — раздувание save-файла (поле не читается для логики; реплей ест только
`patch.ops`). Вторичная косметика того же блока: `z` (`:387`)/`createdAt`
(`:388`) через `typeof==='number'` без `Number.isFinite` → `NaN`/`Infinity`
переживают в display-snapshot.

**Отклонено как симметричное / не новое (проверено):** top-level wiring
(`save_runtime.ts:54-93`, каждая секция имеет `set*`/`normalize*`/`restore*`);
banking/stock_market (обе стороны гоняют один нормализатор, всё клампится);
demos_save/computers/net_hack/alife_migration/net_terminal_gen; A-Life
override round-trip; FloorRunState; playedCinematics/voidReturnPortal/
containers/worldEvents/factionRelations (все capped+клампятся). `isTutorialExit`
через `sanitizeDoorEntries` = уже ledger **#68**. A-Life `sanitizeFloor` 30..200
(alife.ts:1650) = write-time дизайн Z-колонки в популяционной линии; `floorKey`
строкой round-trip-ится корректно — не save-асимметрия.

**Направление (владельцу, не применяю):** F1 — добавить count-cap на
`economy.floors` по образцу `routes` (единственная гейм-значимая правка); F2 —
клампить `lastTickAt` как соседей; F3 — либо подключить `routes`-читателя, либо
удалить мёртвый shape; F4 — cap+валидация элементов `themeTags`, `Number.isFinite`
на `z`/`createdAt`. Все — YELLOW/data-санитайзеры; F1 стоит теста «отклонить/
обрезать save с раздутым `economy.floors`».

---

### C12 — Кластер РЕГРЕССИЙ незавершённой миграции «eradicate legacy Z»: самосбор-директор и вся A-Life z-колонка застряли в мёртвом легаси-Z · HIGH · CONFIRMED · NEW (регрессия)

**Класс:** LEGACY-MIGRATION-REGRESSION (тот же корень, что C10; общий источник —
незавершённый рефактор координат этажа). Проверено чтением исходника **и**
git-историей. Регрессия введена коммитами:
- `71d18f2b` «Remove STORY and FloorLevel (**WIP - compilation broken**)»
- `15c46666` «fully eradicate legacy Z-coordinates … **Tests passing.**»

Оба заявляли завершённость («Tests passing»), но тесты не покрывают эти пути —
классический silent-regression под зелёным гейтом.

**F1 (HIGH) — самосбор-директор гейтит биты на 6 route-z, которых не бывает на
игровых этажах → директор инертен во всём обычном геймплее.**
- `data/samosbor_director.ts:46-52`: `ALL_FLOORS=[34,2,-6,-14,-40,-48]`,
  `CIVIL=[34,2,-6]`, `SERVICE=[2,-6,-14]`, `MAINTENANCE=[-14]`, `HELL=[-40]`,
  `VOID=[-48]`.
- Гейт `systems/samosbor_director.ts:199,737`:
  `if (!beat.floors.includes(snapshot.z)) return 'floor_mismatch';`, где
  `snapshot.z = state.currentZ` (`:179`).
- `state.currentZ` на базовых этажах = `{0,14,30,-26,-36,-50}` (living/kvartiry/
  ministry/maintenance/hell/void; `design_floors.ts:113-118`, `main.ts:2703`,
  `procedural_floors.ts:476`). Пересечение с `ALL_FLOORS` = **пусто** → каждый
  бит падает в `floor_mismatch` на всех основных этажах. Весь директор
  предупреждения/актив/послед (туман-остаток, патрули, слух-семена, кража из
  контейнеров, дефицит ресурса, монстр-афтершок, вариантные реплики) молча
  мёртв.
- **Git-доказательство:** до `15c46666` было `CIVIL=[30,14,0]`,
  `SERVICE=[14,0,-26]`, `HELL=[-36]`, `VOID=[-50]` → union `{0,14,30,-26,-36,-50}`
  = ровно шесть канонических базовых этажей. Рефактор сделал сломанную 1:1
  замену на несвязанные design-route-z. Подтверждено `git show 15c46666^`.

**F2 (HIGH) — A-Life z-колонка испорчена (`z: bucket.themeTags`) под `@ts-ignore`
→ вся фоновая популяция генерится как будто каждый этаж = легаси z=100.**
- `systems/alife.ts:1261-1267` (LIVE data-plan путь `normalizePopulationPlan`):
  `// @ts-ignore` над `.map`, внутри `z: bucket.themeTags` — `string[]`
  присваивается числовому полю `z`.
- Потребление: `populationBucketToFloorPlan` (`:1198`) →
  `sanitizeFloor(bucket.z, 100)`; `sanitizeFloor` (`:1650`) требует
  `typeof==='number' && >=30 && <=200`. `string[]` не число → **fallback 100**
  для каждого бакета.
- `plan.z(=100)` пишется в z-колонку NPC (`setRecordFloor` :1180→498) и правит
  фракции/занятия/богатство: `factionProfileWeight` (`:897`
  `floorWeights[plan.z]`), `occupationForRecord` (`:915/918` `plan.z===140/30`),
  `wealthForRecord` (`:1062` `plan.z===30/140/180`). Этаж-условная генерация не
  срабатывает никогда.
- **Дополнительное подтверждение того же корня:** `resolvedFloorForAlifeKey`
  (`:1773`) всё ещё перечисляет легаси z-пространство `[30,60,100,140,180,200]`
  и возвращает захардкоженный `100` для любого реального этажа; клампа
  `sanitizeFloor` `30..200` (`:1651`) отвергает все текущие **отрицательные**
  route-z (living=0, maintenance=−26, hell=−36, void=−50) → fallback 100.
  A-Life координатная под­система вообще не мигрирована.
- **Git-доказательство:** `71d18f2b` заменил `floor: bucket.baseFloor` →
  `z: bucket.themeTags` (rename + вставка неверного выражения-источника),
  замаскировано существовавшим `// @ts-ignore` на `:1261`. Подтверждено
  `git show 71d18f2b -- src/systems/alife.ts` (`floor:`→`z:` по всему файлу,
  включая `Uint8Array`).

**F3 (LOW) — `CultProcessionDef.coverSec` — мёртвое авторское поле.**
`data/faction_events.ts:68` (тип), `:413` (единственное `coverSec: 30`). `rg
coverSec src/` = ровно 2 хита, ноль рантайм-чтений. Механика «прикрытия»
процессии реально идёт через `p.coverUntil` + константы
`PROCESSION_RESIST_GRACE_SEC`/`PROCESSION_RESIST_ACTION_SEC`
(`:587/652/668`); авторское `coverSec` не читается. Соседи (`activeSec`/
`actionRadius`/`fearRadius`/`controlRadius`) — читаются. DEAD-AUTHORED-подкласс
(смежно C1/C9/C11-F3).

**Отклонено (проверено, НЕ баги):** все 11 anomaly-runtime само-лечатся per-floor
(`WeakMap<World>`/guard, `replaceWorldFromGeneration` даёт новый World);
A-Life leaderboard = уже #127-FIXED (skip-guard `:2828`); `samosbor_wave`
`activeWave`/`lastWaveSnapshot` чистятся в `cancelSamosborWave`;
`samosbor_variants_runtime` = #61-scope floors→tags; demos
`FLOOR_LABELS[snapshot.z]` — косметика с `?? этаж ${z}` (потребляет тот же
испорченный z из F2, но fallback не крашит); `alife_migration.themeTags` —
латентная неиспользуемая способность, не баг.

**Severity-обоснование:** F1+F2 — это тихое отключение **двух больших систем**
(нарратив самосбора + этаж-специфичность всей A-Life) на всех реальных этажах,
без краша и без падения тестов. Именно то, что мандат называет РЕГРЕССИЯМИ и
ЛЕГАСИ. **Направление (владельцу, не применяю — RED-зона `alife.ts`/data):**
F1 — вернуть базовые route-z в director-константы (свериться с
`design_floors.ts`); F2 — заменить `z: bucket.themeTags` на реальный
route-z бакета и расширить кламп `sanitizeFloor` на `−50..+50` (или полностью
уйти от числового окна к `floorKey`), затем снять `@ts-ignore` чтобы компилятор
ловил такое впредь; F3 — подключить или удалить `coverSec`. **Нужен тест-замок**
на «директор-бит совпадает хотя бы на одном базовом этаже» и «materialized NPC
получает реальный route-z, не 100».

**Связь с C10:** C10 (сайд-квесты, легаси 60/100/140) + C12 (самосбор+A-Life) —
**один незавершённый рефактор**. `15c46666` заявил «Tests passing», но по факту
оставил ≥3 подсистемы в мёртвом легаси-Z, потому что ни одна из них не покрыта
регресс-тестом. Это ключевой процессный вывод раздела D.

---

### C13 — Полный census легаси-Z выживших: тот же незавершённый рефактор дотянулся до data + gen + systems + main; 1 живой баг, 5 инертных/самосогласованных/косметических остатков · MED (F1) / LOW (F2–F6) · CONFIRMED · NEW

> Систематический sweep всего дерева по сигнатуре легаси base-floor set
> `{60,100,140,180,200}` и клампов `>=30 && <=200`. Каждый кандидат
> протриажен **по тому, в каком пространстве читается значение**: route-Z
> (`state.currentZ`/`snapshot.z`, −50..+50) → баг; литерал, переданный самим
> генератором и сверяемый с таким же литералом → самосогласованный островок;
> поле без читателей → мёртвая авторская данность. Это добивает мандатный
> охват «ЛЕГАСИ»/«РЕГРЕССИЙ» и завершает кластер C10/C12.

**F1 — ЖИВОЙ баг (MED, WRONG-COORD-SPACE + reachability).**
`src/data/documents_access.ts` — действия `shelter_seat_card` (:475) и
`shelter_seat_forgery` (:489) несут `floors: [100, 60]`. Гейт —
`src/systems/inventory.ts:1397`: `if (action.floors && state && !action.floors.includes(state.currentZ))` →
сообщение «здесь нет нужного окна выдачи.» и `return true` (действие
съедено, но **не выполнено**). `state.currentZ` — это route-Z (−50..+50),
никогда не 100/60 → **оба handoff-действия заблокированы на всех этажах
навсегда**. Из 8 `DIRECT_DOCUMENT_ACTION_ITEMS` (`inventory.ts:96`) только у
этих двух есть `floors`-гейт; остальные 6 (`ammo_coupon_*`,
`fuel_issue_stamp`, `foam_grenade_act`, `water_reservoir_quota`,
`concentrate_bonus_coupon`) без гейта и работают. Иного пути сдачи
shelter-seat карты нет (`rg` даёт только inventory-гейт + спрайты) → реальная
потеря контента: сдача карточки места у гермодвери (механика укрытия
самосбора) недостижима. **Fix-направление (владельцу):** заменить `[100, 60]`
на базовые route-z, где реально стоят гермодвери укрытия (свериться с
samosbor-shelter генерацией), либо снять `floors`-гейт если сдача допустима
везде.

**F2 — инертная мёртвая данность (LOW, DEAD-AUTHORED-FIELD).**
`src/data/zhelemish_defs.ts:40/56/72` `sourceFloors: [60, 100]` (×3).
Единственный потребитель — `:108` проверка контент-аудита
`if (def.sourceFloors.length === 0)`. Значения никогда не читаются для
размещения/спавна → чистая легаси-данность, безвредна, но вводит в
заблуждение.

**F3 — самосогласованный легаси-островок (LOW, наблюдение).**
`src/data/screen_signals.ts` (`ALL_SIGNAL_FLOORS = [30,60,100,140,180,200]`,
per-def `floors:[30]`/`[140]`/`[180,200]`) + `src/gen/procedural_screens.ts`
(`z===180`, `placeHellScreens`, `pickSignal(world, 180, …)`). **НЕ баг
сегодня:** генераторы сами зовут `placeProceduralScreens(world, N)` с теми же
легаси-литералами (hell→180, living→100, kvartiry→60, maintenance→140,
ministry→30, `ANTENNA_COURT_BASE_FLOOR`/`UPPER_BUREAU_BASE_FLOOR`), а
`screenSignalEligible` (:143) сверяет `def.floors.includes(z)` с тем же
литералом → экраны ставятся. Но это хрупкий изолированный островок в старой
системе координат: `void_protocol floors:[180,200]` частично мёртв (void
экранов не ставит → `200` недостижим, `180` от hell работает), и любая
«починка» одной стороны тихо сломает другую. Помечено как долг, не как
регресс.

**F4 — смешанный легаси+route массив, инертные хвосты (LOW).**
`src/data/rumors.ts` — ряд def-ов с легаси-хвостами в `floors`:
`slime_seroburmaline_no_look` `[200,-40,-14]`, `monster_chervie_avatar_screen`
`[30,-14,200]`, `ecology_chervie_avatar_disconnect` `[30,-14,200]` и др.
Сверяются `rumor.ts:294` с `snapshot.z` (route-Z, `= rumor.lead?.z ?? event?.z`,
:579). Токены `200`/`180` как route-Z недостижимы (мёртвые записи фильтра), но
каждый такой def **также** содержит валидные route-z (−14/30/−40) → слух всё
равно срабатывает. Хвосты инертны, вреда нет, но это легаси-мусор в данных.

**F5 — инертная ветка поверх сломанной A-Life z-колонки (LOW, downstream C12).**
`src/systems/demos_profiles.ts:268`
`if (h === 0) return snapshot.z === 180 || snapshot.z === 200 ? 'fear_monster' : 'fear_samosbor';`.
`snapshot.z` — это `AlifeNpcSnapshot.z`, т.е. **сломанная A-Life z-колонка из
C12-F2** (fallback 100, никогда не 180/200; а после починки станет route-Z
−50..+50). Итог: ветка `fear_monster` **никогда** не берётся — NPC на
hell/void не получают этот demos-трейт, всегда `fear_samosbor`. Двойной
легаси: и координата, и зависимость от C12. Косметический demos-флавор → LOW.

**F6 — мёртвые числовые фолбэки в `main.ts`, косметическое последствие (LOW).**
`src/main.ts` `nextFloor === 100/180/200` (:5390, :5531, :5538, :5569–5571).
`nextFloor` **всегда** route-Z (`runEntry.z` | `currentZ ± 2` |
`route.targetFloorZ`, :5340/5345/5348/5357). Строки 5531/5538/5569 имеют
**живой primary** `generatedRunEntry?.themeTags.includes('hell'|'void')` /
`designFloorId===…` — числовой литерал там мёртвый фолбэк. Строка 5390
`if (nextFloor === 200) setVoidEntryFromFloor(state, fromFloor)` **без**
themeTags-primary → на входе в void берётся `else` и `voidEntryFromFloor`
удаляется. **Последствие косметическое:** реальная точка возврата из Пустоты
захардкожена `state.currentZ = zForBaseFloor(100)` (:2703), а испорченный
`enteredFromFloor` утекает только в `data`-payload телеметрии события (:2795).
Сиблинг death-continuation (:2284) использует **правильный**
`targetEntry.themeTags.includes('void')` — авторы знают верную идиому, 5390
просто отстал от рефактора. Реальная застрявшая сверка, но без геймплейного
эффекта.

**Полнота census (LIVE-паттерн проверен сплошняком).** Сплошной sweep по трём
живым сигнатурам — `(currentZ|snapshot.z|.z) (===|!==) {60,100,140,180,200}`,
`.includes(currentZ|snapshot.z)`, и клампы `>=30 && <=200` — дал ровно
следующие сайты, каждый протриажен:

- `inventory.ts:1397` `.includes(state.currentZ)` с `[100,60]` → **C13-F1
  (живой баг)**.
- `samosbor_director.ts:199/737` `.includes(snapshot.z)` → **C12-F1**.
- `rumor.ts:294` `.includes(snapshot.z)` → **C13-F4** (инертные хвосты).
- `demos_profiles.ts:268` `snapshot.z===180||200` → **C13-F5** (поверх C12-F2).
- `alife.ts:915/1064/1065` `plan.z===140/180` (`occupationForRecord`,
  `wealthForRecord`) → **прямые потребители сломанной A-Life z-колонки C12-F2**:
  ветки `plan.z===140`(оккупации механик/электрик) и `===140/180`(множители
  богатства) **никогда не берутся** (колонка всегда fallback-100). Подтверждает
  геймплейный охват C12-F2, отдельным багом не нумеруется.
- `gen/void/ekrannik.ts:122` `event.z !== 200` → **самосогласованный островок**
  (класс C13-F3): экранник **сам публикует** свои события с `z:200` (:335/:520)
  и **сам** их фильтрует `!== 200`; route-Z `state.currentZ` не читает →
  продюсер и консьюмер согласованы, работает. Хрупкий легаси, не баг.
- `maronary_shaving.ts:133` `.includes(state.currentZ)` — поле
  `rule.match.floorLevels` **опционально и нигде не заполнено** (0 литералов
  `floorLevels:` в файле) → гейт короткозамыкается на `undefined`, никогда не
  блокирует. Инертное опциональное поле, не баг.
- `procedural_floor.ts:15284` `spec.z===140`, `alife.ts` прочее — часть
  самосогласованных base-floor вызовов генераторов (класс C13-F3).

Итог проверки: **ни одного нового живого бага сверх C13-F1** — census закрыт.

**Итог кластера C10 + C12 + C13:** незавершённый рефактор «eradicate legacy Z»
(`71d18f2b` + `15c46666`) оставил выживших в **пяти слоях** — `data/`
(quests, zhelemish, documents_access, screen_signals, rumors), `gen/`
(procedural_screens + все floor-index вызовы + `void/ekrannik`), `systems/`
(samosbor_director, alife, demos_profiles, inventory, maronary_shaving), и
`main.ts`. Из всего кластера
**геймплейно-ломающие только**: C10 (7 VISIT/KILL сайд-квестов), C12-F1/F2
(самосбор-нарратив + A-Life этаж-специфичность), C13-F1 (shelter-seat handoff).
Всё остальное — инертный легаси-мусор или самосогласованные островки.
**Первопричина одна: отсутствие регресс-теста на «route-Z ↔ base-floor», из-за
чего `15c46666` смог заявить „Tests passing“ при ≥6 застрявших подсистемах.**
Один тест-замок вида «каждый авторский `floors`/`targetFloorZ`/`snapshot.z`,
сверяемый с `currentZ`, лежит в диапазоне активных route-z» отловил бы весь
кластер разом.

---

### C14 — RED-слой на хардкод: `webgl.ts`/`world.ts`/`main.ts` практически чисты; единственная content-specific ветка в рендерере (`MonsterKind.TUMANNIK`) избыточна · LOW · CONFIRMED · NEW (в основном ПОЛОЖИТЕЛЬНОЕ наблюдение)

> Сплошной срез мандатной категории «ХАРДКОД» по самому защищённому классу —
> content-specific литералы (id этажей/монстров/квестов) в RED-интеграторах,
> которые CLAUDE.md §Anti-Patterns ставит нарушением №1.

- **`core/world.ts`**: **ноль** content-id литералов (`living/hell/void`,
  `MonsterKind.*`, `QuestType.*`, `plotNpc`) — слой держит контракт «только
  примитивы». ✅
- **`render/webgl.ts`** (3800+ строк): **ровно одна** ветка на конкретный
  `MonsterKind` за всю простыню — `hasTumannikRenderOffset` (:3787). Всё
  остальное рисование идёт через generic-каналы (spriteIdx, screenFx enum,
  texture slots). Это ровно тот контракт «reads state, draws», который требует
  архитектура. ✅
- **`main.ts`**: строковые id этажей встречаются только как теги событий
  (`'void'` в `tags:[…]`, :2640/2787) и через `themeForDesignFloor('living')`
  дефолт (:2125) — не как ветки геймплейной логики по конкретному этажу. ✅
- **Единственная придирка (LOW):** `hasTumannikRenderOffset` (:3787,
  потребители :3989/3990/4013) стартует с `if (e.monsterKind !== MonsterKind.TUMANNIK) return false;`,
  затем читает `ai.fogOffsetX/Y`. Поле `fogOffsetX/Y` (`core/types.ts:551`,
  коммент «Туманник: fake visible silhouette offset») **выставляется
  исключительно** AI туманника (`systems/ai/monster.ts:7826`). Значит любая
  сущность с ненулевым offset — туманник **по построению**, и kind-guard
  избыточен: проверка `Math.abs(fogOffsetX)>0.05 || …` уже сама по себе
  достаточна и даёт идентичное поведение. Это **не** истинный анти-паттерн
  «рендерер владеет геймплей-состоянием» (offset считает AI, рендерер только
  читает) — это мягкая избыточная связка: renderer знает *имя* монстра там,
  где хватило бы generic-поля.
- **Оценка**: находка **несерьёзная** и приведена честности ради (мандат просил
  ХАРДКОД) — но общий вывод **положительный**: RED-слой дисциплинирован, а
  единственное исключение косметическое и легко обобщается. **Fix-направление
  (владельцу, если чистить):** снять kind-guard, оставить порог по offset —
  тогда `webgl.ts` станет полностью свободен от `MonsterKind`-веток. Аудитор код
  не трогает (RED-файл + «ТЫ НЕ МЕНЯЕШЬ КОД»).

---

### C15 — Реестры без дубликатов id (проверено рантайм-импортом) — чисто

- Мандат просил «ДУБЛИКАТОВ». Сплошная проверка ключевых реестров:
  - `ITEMS` — `Object.keys(ITEMS).length === 446`, **0** дубликатов id, **0**
    расхождений `key ≠ .id` (рантайм-импорт `tsx`). Три источника
    (`items.ts` + spread `DOCUMENT_ACCESS_ITEMS` + `CHERNOBOG_DOCKET_ITEMS`) —
    **0** взаимных коллизий id (3-way `comm -12`).
  - `weapons.ts` (`WEAPON_STATS`-ключи), `plot.ts` (quest id) — дубликатов нет.
  - Кросс-файловых коллизий `registerSideQuest`/interactable/monster-kind не
    обнаружено.
- **Вывод**: класс «дубликаты реестров» чист. (Замечание: `items.md:11` и
  `desdoc.md:80` показывали устаревшее «434» — это дрейф документации A4, не
  дубликат кода.)

---

### C16 — Регрессия того же коммита see-through (`06349513`): динамическое небо на открытых этажах (крыша z=+50, внешний район z=+48) не рисуется — терминал неба недостижим по счётчику шагов марша + старый sky-потолок отключён · HIGH · CONFIRMED · NEW (регрессия)

Тот же коммит, что C3, но **другой аспект** (достижимость, не синхронность).
Проверено аудитором независимо от субагента: **прочитан шейдер построчно +
`git show 06349513^` + арифметика марша с первых принципов**.

**Дефект (мёртвый код + отключённый старый путь):**

1. **Терминал неба недостижим.** Единственная ветка, рисующая динамическое небо
   в open-sky марше, — `webgl.ts:1459-1466`:
   ```glsl
   if (skyEscape && uHasOpenSky == 1) { ... texture(uDynamicSky, skyUv) ... }
   ```
   `skyEscape` объявлен `false` (`:1419`) и пишется в `true` **ровно в одном
   месте** — `:1448` `if (dEnter > MAX_DIST) { skyEscape = true; break; }`.
   Но `MAX_DIST = 40.0` (`MAX_DRAW=40`, `core/types.ts:5`), а цикл марша
   ограничен `SKY_STEPS = 24` (`:241`). Лучи единичной длины: DDA-шаг
   увеличивает `dEnter` максимум на ~1.0 по параметру t за итерацию (худший
   случай — осевой луч; диагонали растут ещё медленнее, т.к. пересекают больше
   сеточных линий на единицу t). За 24 шага `dEnter ≤ ~24 < 40`, поэтому
   `dEnter > MAX_DIST` **никогда не выполняется** внутри цикла → `skyEscape`
   всегда `false` → блок `:1459-1466` — **мёртвый код**. (Для сравнения: главный
   DDA-цикл стен использует `MAX_STEPS = 80 = MAX_DRAW*2` (`:229`), чего хватает
   на всю дистанцию; марш потолка получил вдвое меньший под-лимит.)
2. **Старый sky-потолок отключён (git-регрессия).** По `git show 06349513^`
   гейт потолка динамического неба был безусловным: `if (uUseDynamicSky == 1)`
   (родитель, `webgl.ts:1476`; ни `skyEscape`, ни `SKY_STEPS`, ни `uHasOpenSky`
   в родителе НЕТ — весь see-through марш новый). Коммит сузил гейт до
   `if (uUseDynamicSky == 1 && uHasOpenSky == 0)` (`:1540`). Итог: на открытых
   этажах старый путь неба **выключен**, а задуманная замена (терминал `:1462`)
   **недостижима** → регрессия, а не рефактор-в-ноль.

**Сценарий отказа (реальные этажи):** `world.hasOpenSky` + `skyProvider`
существуют только на **крыше (route-Z +50)** и **внешнем районе (route-Z +48)**.
Игрок на этих этажах: верхние строки потолка выходят за `MAX_DIST` и остаются
`pixel = fogColor()` (`:1259`, дефолт-туман); ближние к горизонту строки бьют в
реальную `Tex.CEIL`-плоскость и рисуют **бетонную крышку** (`:1548-1550`, т.к.
гейт `&& uHasOpenSky == 0` ложен). Динамическое небо (`uDynamicSky` — время
суток, солнце, облака) **не появляется ни в одном пикселе**. Визуально: плоский
туман сверху + бетонный «потолок» у горизонта вместо открытого неба.

**Почему это важно как регрессия, а не «фича не доехала»:** коммит называется
«универсальная сквозная прозрачность потолков» и его цель — открытое небо
сверху. До коммита `uUseDynamicSky` рисовал небо-потолок безусловно (пусть и
плоско-спроецированный). После — открытые этажи потеряли и старое небо, и новое.
Проекция самого неба (`uDynamicSky`) существует и работает на закрытых этажах
через ветку `:1540` (там `uHasOpenSky == 0`), т.е. ассет/аплоад живы — не
рисуется именно на тех этажах, ради которых см. C3 писался see-through.

**Направления правки (решение владельца; RED-файл `webgl.ts` + «ТЫ НЕ МЕНЯЕШЬ
КОД» — аудитор не трогает):**
- либо рисовать динамическое небо в fall-through по исчерпании цикла, когда
  `uHasOpenSky == 1` (а не только при `skyEscape`);
- либо поднять `SKY_STEPS` к `MAX_STEPS` (перф-стоимость: +шаги марша потолка
  только на open-sky этажах — их два);
- либо снять условие `&& uHasOpenSky == 0` на `:1540`, вернув старый sky-потолок
  как fallback (минимально-инвазивно, но теряет «сквозную» глубину силуэтов).

**Подтверждено чистым (НЕ баги, отсеяно):** расхождение двух рендереров
(`scene_collect.ts:2286-2302` клампит по открытой клетке самого инстанса),
порог-синк (C3), закрытые этажи (байт-в-байт с родителем), а также рабочий
WIP UI-де-неон пасс (hud/economy_ui/stats_ui/npc_ui/ui_layout/item_sprites) —
без регрессий раскладки/клиппинга/логики, миграция `fitText`→`fitTextStable`
сигнатурно совместима, `typecheck` проходит (см. B1).

---

_Все запланированные под-проходы этого раунда завершены (save/load → C11,
combat/PSI → C6/C7, quests → C8/C10, economy → C8/C9, samosbor/A-Life →
C12/C13, rendering → C3/C16). Save-симметрия `procedural_floors`/`routes`
разобрана в C11-F3. Дальнейшие находки — при следующем проходе._

---

## РАЗДЕЛ D. Оценка игры как продукта (Product Critique)

> Критическая оценка ГИГАХРУЩА **как продукта**, а не как кодовой базы.
> Основано на фактах из исходника, README/desdoc и наблюдений этого прохода.

### D.0 Масштаб (объективно)

- **876** TS-файлов в `src/`, **~403 000** строк, **606** тест-файлов.
  Zero-runtime-dependency, single-file браузерная сборка. Это не прототип —
  это зрелая, очень крупная кодовая база одного (в основном) движка.
- Крупнейшие узлы сложности: `gen/procedural_floor.ts` (**16 245** строк),
  `render/item_sprites.ts` (15 559), `render/generated_art_sprites.ts` (13 509),
  `main.ts` (10 406), `systems/ai/monster.ts` (9 178), `systems/samosbor.ts`
  (5 036), `render/webgl.ts` (4 530).

### D.1 Сильные стороны (что реально работает как продукт)

1. **Уникальность вижна.** Процедурный survival-horror life-sim/ARPG внутри
   бесконечной бетонной мегаструктуры, с полностью процедурными текстурами,
   спрайтами, звуком и WebGL-рейкастингом, без единой рантайм-зависимости —
   это редкая и цельная эстетическая позиция (System-Shock/BLAME!). Ниша
   узнаваема и не разбавлена.
2. **Инженерная дисциплина выше среднего по инди.** Детерминированный RNG-
   контракт, «железный закон» запрета O(W²) в рантайме, 5-слойная архитектура
   с зонами владения файлов, компактная дельта-сериализация сейва под 5 МБ
   `localStorage`, 606 тестов. Доки (README/save.md/architecture) на удивление
   **точны** — почти все счётчики сошлись с исходником (см. Раздел A).
3. **Глубина систем.** A-Life с персистентной идентичностью 100k NPC,
   самосбор с укрытием/перестройкой, экономика с фабриками/караванами/банком,
   19-шаговый основной квест, 50 авторских дизайн-этажей, 69 монстров, 89
   оружий. По широте контента это уже полноценная игра, а не демо.
4. **Свежая работа над визуалом идёт в верном направлении.** Коммит
   see-through потолков (`06349513`) и WIP де-неон палитры — это работа над
   читаемостью силуэтов/глубины/материала, ровно то, что просит `taste.md`
   («improve material/lighting/silhouettes, not hide weak visuals under
   postprocess»). Не постпроцесс-грязь. Хорошая продуктовая интуиция. *Оговорка:*
   у этого же коммита есть незамеченная HIGH-регрессия — динамическое небо на
   открытых этажах (крыша/внешний район) сейчас не рисуется (C16); интуиция
   верная, но конкретно open-sky-выигрыш до экрана не доехал.

### D.2 Продуктовые риски (критично)

1. **Достижимость эндшпиля — экзистенциальный риск.** Ledger-blocker **#45**
   (подтверждён независимо в C2): маршрутные хелперы лифтов
   (`ensureReachableRouteLifts`, `routeLiftDirections`) написаны, но **не
   подключены**; концы вертикального маршрута (крыша z=+50, войд z=−50) не имеют
   route-aware гарантии достижимого лифта. Если на практике игрок может
   застрять и не дойти до Void/Creator-климакса — **это ломает обещание
   продукта** (пройти структуру до конца). Это #1 по продуктовому приоритету,
   выше любого визуала. Требует решения владельца (RED-файлы + дизайн).
   *Двойной удар по кульминации:* крыша (z=+50) — это и есть эндшпильная цель
   маршрута, и одновременно один из двух open-sky этажей, чьё небо сейчас не
   рисуется (C16). Даже если игрок дойдёт — визуальная награда «вышел на крышу
   структуры под открытое небо» сломана.
2. **«Широта против завершённости».** AGENTS.md сам предупреждает: «одна
   работающая достижимая цепочка важнее широких недоделанных систем». Находки
   C1 (мёртвая фича «гоп-стоп» с зарезервированными событиями в RED-файле) и
   реестр #1–#181 (уместившие десятки DEAD-AUTHORED-FIELD/полу-подключённых
   систем) показывают: **есть системный крен в сторону задела, который не
   дострелен до игрока.** Для продукта это значит, что часть заявленной глубины
   игрок никогда не увидит, а стоимость поддержки платится. Продуктовое
   лечение — не добавлять новое, а **дошивать вертикальные срезы до
   достижимости** (или удалять мёртвое).
3. **Порог входа и объяснимость.** Комбинаторная глубина (PSI-трейты брони
   монстров, самосбор, экономика, карма/ранг, соц-граф Демоса) огромна.
   Риск: игрок не понимает, почему что-то произошло. C6 (Пси-буря игнорирует
   броню монстра, а луч/граната — нет) — микромодель этой проблемы: даже
   **внутри одной подсистемы** правила расходятся, и игрок не может построить
   верную ментальную модель. Для продукта каждая такая асимметрия — это тихая
   эрозия доверия к «честности» правил.
4. **Онбординг/первые 10 минут не аудированы здесь**, но по коду видно, что
   игра «долго грузится» (замечание владельца) и стартует сразу в глубокую
   симуляцию. Для браузерной игры (особенно с портала/itch) первые секунды —
   решающие для удержания. Это стоит измерить (TTI, первый осмысленный выбор).
5. **Тихая смерть уже готового контента (регрессия, не недодел) — новый риск
   этого прохода.** Кластер C10+C12+C13 — это не «широта против завершённости»
   (п.2), а нечто хуже: контент, который **работал**, был **молча убит**
   рефактором `15c46666`, коммит которого заявил «Tests passing». По факту
   мёртвы: 7 VISIT/KILL сайд-квестов (в т.ч. main-plot `ag77`/`ag95`),
   самосбор-нарратив на всех этажах, этаж-специфичность всей A-Life (100k NPC
   получают fallback-профиль этажа-100), сдача карточки укрытия. **Для продукта
   это ловушка доверия к собственному пайплайну:** «зелёные тесты» перестали
   означать «контент жив», потому что ни одна из этих подсистем не покрыта
   регресс-тестом на связь route-Z ↔ base-floor. Пока такого замка нет, любой
   следующий рефактор координат может так же тихо выкосить контент, а гейт
   этого не заметит.

### D.3 Наблюдение о процессе (мета)

- Реестр аудита #1–#181 + фаза-2/фаза-3 коммиты + этот проход показывают
  **зрелый, но дорогой** цикл контроля качества: много находок, аккуратные
  regression-locks, консервативные DEFERRED для RED/дизайн-правок. Это здорово
  для надёжности, но養 создаёт «долг решений» — накопление подтверждённых, но
  не одобренных владельцем правок (особенно #45). Продукту нужен ритм принятия
  этих решений, иначе аудит становится археологией, а не драйвером релиза.

### D.4 Вердикт как продукта

**Технически — сильно; как поставляемый продукт — упирается в достижимость и
завершённость, а не в объём.** Движок, эстетика и широта систем уже на уровне,
которого достаточно для релиза нишевого хита. Три вещи отделяют «впечатляющий
проект» от «игры, которую проходят»:

1. **Закрыть достижимость эндшпиля (#45)** — без этого остальное вторично.
2. **Дошить или вырезать полу-подключённые вертикальные срезы** (C1 и класс
   DEAD-AUTHORED из реестра) — чтобы заявленная глубина = играемая глубина.
3. **Выровнять внутрисистемные асимметрии правил** (C6-класс) — чтобы игрок мог
   доверять и изучать модель мира.
4. **Воскресить тихо-убитый контент и поставить один регресс-замок route-Z ↔
   base-floor** (кластер C10/C12/C13) — самая дешёвая по стоимости/эффекту
   правка из всех: один тест защищает 6 подсистем сразу и не даёт будущим
   рефакторам координат снова их выкосить.

Визуальный полёт (see-through, де-неон) — правильный, но это множитель, а не
фундамент; он ценен **после** того, как маршрут до финала гарантированно
проходим.

---

## Сводка находок этого прохода

| ID | Severity | Статус | Класс | Действие |
| --- | --- | --- | --- | --- |
| A1 | LOW | ✅ исправлено (docs) | DOC-DRIFT | счётчик оружия 70→71/88→89 в README+items.md |
| A2 | LOW | ✅ исправлено (docs) | DOC-GAP | документирован `mathRng` в README/AGENTS/CLAUDE |
| A3 | LOW | наблюдение | STYLE | `.js`-расширения в `music.ts` (не ошибка) |
| A4 | LOW | ✅ частично (docs) | DOC-DRIFT + REMOVED-TYPE | `desdoc.md:74` описывает удалённый `FloorLevel` (footprint C12/C13); `items.md` 434→446 исправлен, desdoc оставлен владельцу |
| B0 | — | ✅ чисто | — | WIP владельца (де-неон + columnCap) без регрессий |
| B1 | LOW (1 придирка) | наблюдение | WIP-REVIEW | WIP разросся до 24 файлов (широкий UI-пасс); `surface_marks` cap-fix вычитан построчно — корректен, кап `==` без запаса |
| C1 | MED | NEW · owner | DEAD-AUTHORED-FEATURE | мёртвый «гоп-стоп» + 4 фантом-события в RED |
| C2 | BLOCKER | known #45 · DEFERRED | UNWIRED-HELPER | подтверждена мёртвость route-lift хелперов |
| C3 | — | ⚠️ сужено | RENDER-SYNC-OK | see-through: 2 рендерера + порог-синк чисты; вердикт «без регрессий» сужен → см. C16 |
| C4 | LOW | фон | HEALTH | RNG-контракт чист; console вне hot-path; 96 ts-ignore |
| C5 | LOW | NEW · owner | WRONG-KEY-NAME | 15× `@ts-ignore` маскируют `z` вместо `floor` в POI-мете |
| C6 | HIGH | NEW · owner | ASYMMETRIC-BRANCH | Пси-буря не применяет митигацию трейтов монстра |
| C7 | LOW | NEW · owner | DISPLAY-MISMATCH | HUD урона логирует до-броневое число |
| C8 | HIGH | NEW · owner | UNREACHABLE-RECIPE | станция `net_terminal` не открывается → рецепты не-craftable |
| C9 | LOW | NEW · owner | DEAD-AUTHORED-FIELD | `CorporationDef.rumorTags` без читателей |
| C10 | HIGH | NEW · owner | WRONG-COORD-SPACE | легаси base-floor Z (60/100/140) в сайд-квестах → 7 VISIT/KILL незавершаемы; ~60 инертных |
| C11 | HIGH (F1) / LOW (F2–F4) | NEW · owner | ASYMMETRIC-CAP | `economy.floors` restore без count-cap-а (сосед `routes` capped=128) + 3 сиблинг-асимметрии |
| C12 | HIGH | NEW · owner | LEGACY-MIGRATION-REGRESSION | самосбор-директор (15c46666) + A-Life z-колонка (71d18f2b) застряли в мёртвом легаси-Z → 2 системы инертны; тот же корень, что C10 |
| C13 | MED (F1) / LOW (F2–F6) | NEW · owner | LEGACY-Z-SURVIVORS | полный census легаси-Z по 5 слоям: 1 живой баг (shelter-seat handoff заблокирован, `documents_access`+`inventory:1397`) + 5 инертных/самосогласованных/косметических; закрывает кластер C10/C12 |
| C14 | LOW | NEW · owner | HARDCODE-CLEAN (+1 придирка) | RED-слой чист от content-хардкода; единственная `MonsterKind.TUMANNIK`-ветка в `webgl.ts:3787` избыточна (generic-поле `fogOffset` уже достаточно) |
| C15 | — | ✅ чисто | NO-DUPLICATES | реестры `ITEMS`(446)/weapons/quests без дубликатов id и коллизий (рантайм-импорт); класс «дубликаты» чист |
| C16 | HIGH | NEW · owner | RENDER-REGRESSION | коммит `06349513`: динамич. небо на open-sky этажах (крыша z+50 / внешний район z+48) не рисуется — терминал неба недостижим (`SKY_STEPS=24` < `MAX_DIST=40`, `webgl.ts:1448/1459`) + старый sky-потолок отключён (`:1540`, git-регресс vs `06349513^`) |

**Итог прохода.** 16 находок раздела C + 6 (A/B). По severity:
**1 BLOCKER** (C2/#45, известный, DEFERRED) · **6 HIGH** (C6, C8, C10, C11-F1,
C12, C16) · **2 MED** (C1, C13-F1 — живой shelter-seat баг) · остальное LOW/
наблюдения/чисто. Из HIGH: **C16 — единственная НОВАЯ рендер-регрессия этого
прохода** (не из ledger #1–#181); **C10/C12/C13** — один кластер незавершённого
рефактора «eradicate legacy Z» (общий корень, лечится одной регресс-проверкой
route-Z ↔ base-floor); **C6/C8/C11** — независимые живые дефекты. Класс
«дубликаты» (C15) и RED-хардкод (C14) — чисты. Аудитор код не менял; все правки
в этом файле — только доки (`audit.md` + `items.md:11`).

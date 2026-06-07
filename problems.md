# Problems Audit

> Центральный документ проблемных механик.
>
> Роль: сюда попадает все, что уже существует, но еще не встроено чисто в один из центральных системных документов: `ai.md`, `alife.md`, `anomalies.md`, `floors.md`, `fight.md`, `economics.md`, `items.md`, `monsters.md`, `quests.md`, `architecture.md` or `balance.md`. Это список целей для будущего рефакторинга, консолидации или удаления частных связок.

Актуально на 2026-06-07. Файл фиксирует оставшиеся активные разрозненные механики, которые уже создают лишние частные связки между системами, картой и UI. Цель: резать map-only сигналы, оставлять только работающие игровые контуры и приводить похожие случаи к одному универсальному правилу.

## Правило карты

Карта не должна быть лентой сообщений или витриной частных систем. На карте допустимы только базовая геометрия и fog-of-war, лифты, игрок, обычные точки сущностей, квестовые NPC/room/item/kill-маркеры и игровые surface-map отметки. Названия внутренних событий, одноразовые подписи, слухи, статусы караванов, зоны влияния, самосборные подсказки, route-cue/wrong-door/cartographer сигналы и текстовые расшифровки должны жить в HUD, журнале, слухах, диалогах, системных сообщениях или в самой игровой сцене.

## Найденные связки

Активных связок из текущей ревизии после прохода `fixes_6.md` не осталось. Старая `PLOT_NPCS` projection удалена из `src/`: сюжетные и authored NPC читаются через package registry, а `PlotNpcDef` остался только входным адаптером для registration API.

## Долг: базовая скорость людей

После фикса продолжения за случайного NPC runtime считает движение human/NPC через общий базовый `2.0` и разброс от ловкости (`+5%` speed за пункт AGI). Это закрывает тупую ситуацию, где игрок после пересадки в тело обычного NPC внезапно становится намного медленнее только из-за старого `speed`-литерала.

Остается непонятный балансировочный долг: в исходниках все еще есть старые NPC `speed` значения вроде `1.2`, `0.7`, `0.9`, `1.4` в A-Life шаблонах, authored/generator defs и тестовых конструкторах. После runtime-нормализации часть этих чисел стала мертвым историческим шумом, часть может быть попыткой описать архетип, возраст, рану или роль, но сейчас это не единый источник правды.

Нужно отдельно решить:

- является ли `Entity.speed` для NPC вообще допустимым gameplay-полем или оно должно остаться только для monsters/vehicles/projectiles/debug fixtures;
- финален ли общий human base speed `2.0` или это временная база до отдельного balance-pass по ходьбе, бою, размерам комнат и времени реакции;
- должны ли старые `1.2`-style значения удаляться, переноситься в AGI/RPG, превращаться в статусные эффекты вроде раны/усталости или становиться data-only flavor без влияния на движение;
- какой аудит должен закрывать проблему: например, запретить новые gameplay-visible NPC movement paths, которые читают raw `entity.speed`, и запретить новые NPC constructors с частной базовой скоростью без явного статуса/AGI-причины.

## Срочный Аудит: Prefix-Cap Bias

Найден и исправлен опасный класс ошибки: bounded scan, который берет стабильный первый кусок живого массива и тем самым превращает порядок хранения в игровое поведение. Конкретный сломанный пример был в live-AI routine targeting: обычная рутина смотрела первые `96` комнат `world.rooms`, что на Kvartiry-scale этаже могло синхронизировать NPC в одну сторону. Такой паттерн недопустим для A-Life, AI, economy, factions, quests, migrations, shelters and route anchors.

Закрыто текущим проходом:

- Kvartiry routine room targeting больше не использует первый префикс комнат: assigned/preferred rooms проверяются напрямую, общий bounded window получает deterministic offset.
- Kvartiry ambient residents больше не помечаются travel-акторами по умолчанию.
- A-Life arrival anchors без preferred coordinates больше не берут первый cached lift/button anchor; выбор солится `alifeId`.
- A-Life migration room-anchor cache больше не стартует всегда с `world.rooms[0]`, если scan cap не покрывает весь floor.

Оставшиеся watchpoints для следующего целевого аудита:

- Любой `SCAN_CAP`/`ROOM_CAP`/`ANCHOR_CAP` в `src/systems/**`, если он режет живой массив без actor-local cursor, deterministic offset, spatial index or post-score top-N.
- `world.rooms.find(...)`, `candidates[0]`, `.slice(0, cap)` and first-match selection in runtime systems when the source order is generation/storage order rather than authored priority.
- Economy/faction/quest target pickers must prove that definition order is authored priority or that candidate order is randomized/scored before truncation.

Критерий закрытия: добавить static/source audit or focused tests that fail on gameplay-visible stable-prefix scans, then clear or document every remaining exception by owner and reason.

## Партия fixes 2026-06-06

Рабочая партия `fixes_0.md`..`fixes_6.md` обновлена после закрытия старых блокеров. Предыдущая root-партия перенесена в `../gatbage/history/batches/fixes_2026-06-06_wave2_orchestrated/`; более старая партия `0..8` остается в `../gatbage/history/batches/fixes_2026-06-06_previous/`.

| Пакет | Цель | Критерий исправления |
| --- | --- | --- |
| `fixes_1.md` | Living named NPC package migration. | Все stable named/quest NPC constructors in `src/gen/living/**` route through package-backed spawn or leave exact file-line blockers. |
| `fixes_2.md` | Kvartiry, Ministry and Maintenance named NPC migration. | Story-floor authored NPCs in these folders stop hand-building package-owned live actors; strict helpers stay strict. |
| `fixes_3.md` | Hell, Void and design-floor named NPC migration. | Hell/Void/design-floor stable actors use `NpcPackageDef`; ordinary ambient population and bounded event actors remain separate and classified. |
| `fixes_4.md` | Remove `PLOT_NPCS` projection and migrate tests. | Source no longer exports or reads `PLOT_NPCS`; runtime/tests resolve plot NPCs through package registry/quest metadata. |
| `fixes_5.md` | Migration guardrails, role profiles and problem ledger. | Static tests/audit catch new package-less named spawns and floor-only occupation regressions without blocking valid ambient templates. |
| `fixes_6.md` | Финальный оркестратор NPC-migration. | Parallel results are reconciled, `problems.md` is narrowed by source evidence, and `npm run check` plus `npm run test:generation` pass or exact blockers are reported. |

Закрыто этой партией: прямые stable named/quest `plotNpcId` live-spawn ветки в story, Hell/Void and authored design-floor modules переведены на strict package-backed path through `requireSpawnedPlotNpcFromPackage()` or equivalent package construction. Remaining `EntityType.NPC` constructors are ordinary ambient templates, bounded event/arrival actors, A-Life materialization, debug/editor paths or generic pressure actors, not package-less authored identity fallback.

## Перфоманс-долг: Hell 4096 живых акторов

Профилирование в Opera/Chromium DevTools на Hell-density показало, что цель `4096` одновременно живых монстров/NPC сейчас находится на грани playable. Это не выглядит как один простой leak; это сумма горячих per-frame AI/path/render работ. По практическому ощущению `2048` живых акторов должно быть намного ближе к нормальному FPS, а `4096` еще можно пытаться выжать, но текущая архитектура активного этажа требует следующего performance-pass.

Текущий диагноз из CPU/Memory профилей:

- `updateMonster` остается главным зонтиком затрат на плотной Hell-сцене.
- `findImmediateCombatTarget` был одним из главных прямых потребителей: раньше на Hell виделось примерно `2660-2710` NPC-immediate запросов/кадр и около `560` actor-immediate запросов/кадр.
- В Bottom-Up профиле были заметны `findImmediateCombatTarget`, `queryRadius`, `collectImmediateTopCandidates`, `followMonsterPath`, `followPath`, `hasAIFlag`, `rebuildDynamicForSimulation`, а также отдельная render-ветка `buildSurfaceData`.
- Memory Sampling показывал крупные allocation hotspots в pathfinding/waypoint selection and immediate-candidate handling. Это не доказывает постоянный heap leak, но объясняет GC/CPU давление и crash-risk при долгом dense stress.
- Наивная замена `aiFlags.includes(...)` на `Set.has` уже проверялась отдельно и стала хуже в benchmark (`25.09ms` -> `28.34ms`). Значит `hasAIFlag` нельзя лечить простым `Set`; если лезть, то только через битмаску с A/B замером.

Что уже сделано в проходе 2026-06-07:

- `src/systems/ai/pathfinding.ts`: `followPath` заменил reach-check через `world.dist()` на `world.dist2()` против квадрата порога. Поведение waypoint reach не должно меняться; убран лишний `sqrt` на горячей дороге.
- `src/systems/ai/monster.ts`: `findImmediateCombatTarget` получил frame-local cache кандидатов по spatial bucket, query mask and radius. Финальный выбор цели остался per-actor exact: те же alive/self/type/hostility filters, точный `dist2`, тот же nearest-choice contract.
- `src/systems/ai/monster.ts`: `collectImmediateTopCandidates` убрал горячие `splice()` из top-N maintenance и использует fixed top buffer с тем же cap/order by distance/id. Это должно снизить CPU/GC без смены игровых правил.
- `src/systems/ai/monster.ts`: `updateZhornayaTvar` больше не сканирует обычный запах еды/носителей каждый кадр; запах обновляется примерно раз в `0.14-0.19s`, cached scent валидируется каждый кадр. Monster bait path оставлен frame-responsive.
- Не менялись A-Life ownership, общий AI-pass, faction/hostility rules, save/load, ordinary actor identity and player-in-monster friendliness. Игрок в теле монстра должен оставаться "своим" для монстров; это закрыто focused test.

Честная оценка результата: патчи должны убрать часть лишней работы и аллокаций, но это не финальное решение проблемы `4096`. После патча был пройден `npm run check`, однако отдельный post-profile в DevTools нужен обязательно. Если improvement есть, он ожидается как локальный выигрыш в `findImmediateCombatTarget`/`collectImmediateTopCandidates`/`followPath`, а не как полный переход `4096` в стабильный режим.

Следующие разумные направления, если `4096` остается на грани:

- измерить post-profile на той же Hell-сцене и сравнить self/total time для `findImmediateCombatTarget`, `collectImmediateTopCandidates`, `queryRadius`, `followMonsterPath`, `followPath`, `hasAIFlag`, `buildSurfaceData`;
- вынести `hasAIFlag` в битовую маску только с benchmark and gameplay tests, не через `Set`;
- ограничить immediate combat sensor не потерей точности цели, а более умным shared/event-driven threat cache, actor-local cadence or dirty-stimulus reuse;
- снизить pathfinding churn: replan cadence, path request budget, reuse baked paths/waypoint chunks, fewer allocation paths inside `buildBakedTreePath`/`selectPathWaypoint`;
- проверить render-side `buildSurfaceData` отдельно, чтобы AI-оптимизации не маскировались surface rebuild cost;
- решить, является ли `4096` полноценной target density для shipped gameplay или debug stress ceiling, а нормальным высокоплотным режимом должен считаться `2048`.

## Следующий проход

При добавлении новой механики проверять:

- есть ли у нее владелец в `data`/`systems`/`gen`, а не только подпись в `render`;
- достижима ли она игроком без debug-only знания;
- сохраняется ли нужное состояние, если это не чистый текущий след;
- не печатает и не рисует ли карта внутренние ids, фазы, таймеры, названия событий, зоны влияния или route-cue/samosbor/caravan сигналы;
- можно ли выразить ее через существующие универсальные каналы: событие, слух, HUD warning, surface mark, quest marker, обычная entity-точка или реальная сцена.

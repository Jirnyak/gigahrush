# Система квестов, персонажей и событий

> Центральный документ ключевой системы.
>
> Роль: описывает ручные сюжетные квесты, побочные задания, процедурные assignments/contracts, персонажей, route targets, награды, дедлайны, события и связь текста с симуляцией. Связан с `scenarist.md`, `balance.md`, `economics.md`, `alife.md`, `floors.md`, `items.md` и `architecture.md`.

## Главная модель

Квест в ГИГАХРУЩЕ - это не отдельный UI-скрипт, а системный повод выйти на этаж, принять решение и оставить след в мире. Квест должен связывать:

- персонажа или источник задания;
- route/floor/room/container/monster/NPC target;
- предмет, документ, разговор, убийство, доставка, ремонт, сопровождение, проверку или выживание;
- награду: XP, деньги, item, faction relation, доступ, rumor, route knowledge, economy impulse;
- риск: самосбор, дедлайн, долг, фракция, монстр, дефицит, свидетель, потеря предмета;
- событие: `publishEvent()` для публичных фактов, слухов, журнала, faction/economy consequences.

Ручной сюжет и процедурные задания должны использовать один язык: `Quest`, `QuestType`, `targetRoute`, `contractId`, `plotNpcId`, item ids, monster kinds, faction ids, room ids/tags and event tags. Нельзя завязывать выполнение на русское display-name сравнение или hidden renderer state.

## Основной сюжет

Главный plot начинается в tutorial/living path через Ольгу Дмитриевну, сержанта Баринова и Якова Давидовича, затем ведет игрока через природу Самосбора, НИИ/документы/фракции, нижние этажи, Вестников, Ад, VOID и финальный конфликт с Творцом. Это не "коридорный туториал"; это позвоночник, который объясняет игроку вылазку, подготовку, взаимодействие, бой, исследование этажей и цену решений.

### Цепочка расширена до 27 шагов (2026-08-27)

Пошаговая таблица с дающими и наградами — `manifest.md`, «Основная сюжетная цепочка (PLOT_CHAIN)». Здесь — то, что важно для системы квестов.

**Было 19 шагов, стало 27.** Вставка идёт между «Яков закрыл акт» и первым заданием майора Громного, плюс блок НИИ слизи после снятия чёрной руны. Хвост цепочки (Подад → Вестники → Пустота → Творец) сохранён целиком и только сместился.

**Две новые личности:**

- **Старшина Блинков** (`blinkov`, `LIQUIDATOR`/`ENGINEER`, дом `design:liquidatorbase`) — старшина снабжения. Объясняет, что низ закрыт не завалом, а приказом: самосборы участились, ниже промзоны ходят по спецдопуску.
- **Завлаб Гущин** (`nii_gushchin`, `SCIENTIST`, дом `design:slime_nii`) — однокашник Якова, заведующий баковым цехом; читает чёрную руну по реакции колонии. Олевию Кибер намеренно НЕ брали: она нейробиолог с комической ролью, и четыре шага главной цепочки сломали бы ей голос.

Шаг 10 берёт уже существующего **министра Ротенбергова**; новой личности под него не заводили. Слоты обеих новых личностей дописаны **в конец** `PLOT_NPC_ID_ORDER` — порядок заморожен, сейв хранит числа.

**Блокада — гейт физический, а не шаг журнала.** Блинков и министр только объясняют, почему низ закрыт; упирается игрок в запертые лифты Перевалки и решает вопрос с одной из четырёх баз. Отдельного задания под это в цепочке нет и заводить его не надо: система замка уже описана в `floors.md`.

**Жребий видов вместо записанных в данных целей.** Три шага НИИ слизи просят образцы тканей трёх РАЗНЫХ видов монстров, и виды разыгрываются от сида прогона, а не лежат в `PLOT_CHAIN`. Устройство:

- `plotSampleKindsForSeed(seed)` (`src/data/plot.ts`) берёт три вида взвешенно по `rankMonsterEcology` — она сама отбрасывает нулевой вес, поэтому «мебельные» виды (гнёзда, башни, псевдолифт, Творец) в жребий не попадают; `floorAffinity: 'none'` снимает привязку к этажу, потому что охота засчитывается везде.
- `applyPlotSampleLottery` вписывает вид, описание и подсказку в шаги; зовётся из `generatePlotQuest` (`src/systems/quests.ts`) — только там видны `state` и русские имена монстров. Идемпотентно по сиду.
- Ограничение, из-за которого это работает: значение обязано доехать до **квеста** (`Quest.targetMonsterKind`), а не остаться в шаге. После загрузки шаг не перечитывается, восстанавливается `Quest`, и значение проходит `normalizeMonsterKind` в санитайзере — то есть обязано быть валидным членом enum.
- Три шага находятся **по метке** `eventTags: ['nii','nii_sample','black_rune']`, а не по номеру. Прецедент жребия в проекте был ровно один — `pickKillKind` в процедурных квестах; у авторского контента его не было нигде.
- **Подсказки, где искать, нет, и это решение владельца.** `resolveQuest` (`systems/target_guide.ts`) умеет только NPC и комнату, у KILL с одним видом скобка не рисуется вовсе, маркер на карте появится, только если монстр нужного вида уже стоит на текущем этаже. Механики «подскажи этаж по виду» в игре нет и не заводится: это охота.
- Замок — `tests/plot-chain-samples.test.ts`.

**Шаг 14 (снятие чёрной руны) — FETCH без дающего в СЕРЕДИНЕ цепочки, и это форма, а не оговорка.** Убийство генерала Заслонова шагом цепочки не является: после такта `defect` он просто враждебен, игрок дерётся по обычным правилам, `black_rune` выпадает из его инвентаря вместе со всем остальным (`dropEntityInventory` высыпает инвентарь целиком, 100%, без рандома), и подбор закрывает шаг. Ни одной скриптовой развязки. `tests/plot-giverless-steps.test.ts` требует, чтобы ПЕРВЫЙ giverless-шаг был FETCH, — этот им и стал.

**Перестановка цепочки ломает сейвы.** `Quest.plotStepIndex` уезжает в сейв числом и на загрузке не ремапится, поэтому `SAVE_SHAPE_VERSION` поднят 27 → 28 и старые сейвы отвергаются явно. Жёстко зашитые индексы (`plotStepIndex` в `data/plot_outcomes.ts`, `requiresPlotStepDone` в `data/plot.ts` и `gen/ministry/chernobog_archive_docket.ts`, `questId: 'plot:N'` в `data/craft_recipe_sources.ts`) правились руками: шаги 0–6 не двигались, поэтому реально сдвинулся ровно один — передача адскому контакту, `12 → 20`.

**Что пережило перестановку без правок** — читатели цепочки ПО СОДЕРЖАНИЮ, а не по индексу: `data/plot_events.ts` (шаг с `HERALD`×3, шаг с `designFloorId: 'podad'`), `systems/scripted_arrivals.ts` (по `eventTags`), `systems/npc_package_speech.ts`. Это и есть правило для нового контента: цепляйся за тег, тип и цель, а не за номер.

**Мир меняется после снятия руны.** `src/gen/maintenance/garrison_reinforcement.ts` слушает `quest_completed` с ПАРОЙ тегов `zaslonov_betrayal` + `black_rune` — во всей цепочке эта пара принадлежит ровно одному шагу, и уникальность закреплена ассертом в тесте; номеров шагов в модуле нет. Волна ликвидаторов переезжает с Базы Ликвидаторов в гарнизон Громного через `migrateAlifePopulation` — это перевозка существующих личностей, а не спавн, донор редеет ровно на приехавших (`alife.md`). Однократность держит список `alife.migrations` в сейве, а не свой флаг. Замок — `tests/maintenance-garrison-reinforcement.test.ts`.

Сюжетные NPC должны иметь stable `plotNpcId`, room/content anchor, readable dialogue, age/sex demographic context, death handling and quest state. Если NPC может умереть, квестовая система должна либо принять смерть как consequence, либо иметь явный authored replacement/event path. Нельзя тихо респавнить quest giver как будто смерти не было.

### След покойного: дневник вместо разговора

Смерть авторской личности не обрывает цепочку и не воскрешает никого. Она оставляет вещь.

- Любой сюжетный NPC (`isPlotNpc`) при смерти уносит в свой обычный дроп **дневник** — `npc_diary`, тип `ItemType.NOTE`, привязка к личности лежит в `Item.data.plotNpcId` (`src/systems/plot_trace.ts`). Записка читается общим путём записок, а `NOTE`-дропы не вытесняются по FIFO.
- Дневник в рюкзаке игрока **говорит за покойного**, и читают это ровно три места в `src/systems/quests.ts`: `grantGiverlessPlotStep` выдаёт его шаг как `giverless`, `questNeedsNoLiveReceiver` разрешает закрыть его FETCH/KILL без сдачи, `plotTalkClosedByDiary` закрывает TALK, где он цель. Отдельного состояния под это нет: носитель — сам предмет, а инвентарь уже сохраняется.
- Отсутствие дневника — **условие его появления, а не потеря**. Выброшенный, проданный или не поднятый дневник воплощается заново на месте смерти (`ensurePlotDiaryOnDeathSpot`), координаты берутся из записи A-Life: `recordAlifeNpcDeath` пишет `record.x/y` и приколачивает `floorKey` к этажу гибели, а `alifeForSave` оставляет мёртвому сюжетному слоту компактный оверрайд с местом — иначе после перезагрузки след искать негде. Новой секции сейва под это нет, канал оверрайдов уже существовал, `SAVE_SHAPE_VERSION` не тронут.
- Дневник не размножается и не фермится: воплощение проверяет весь этаж — дропы, инвентари NPC и контейнеры (`plotDiaryOnFloor`). Спрятать вещь в ящик и получить вторую нельзя. Если место гибели замуровано самосбором, дневник ложится игроку под ноги: молча не поставить его — значит запереть цепочку.
- Застрявших перебирают всех: покойник с другого этажа не задерживает того, чьё тело лежит здесь.
- Прежнее автозакрытие TALK по факту смерти цели **снято**: два пути на один факт не держим. Пока цель мертва, а дневника нет, `getCurrentObjective` подменяет невыполнимую строку цели на выполнимую — забрать записи там, где человек погиб.
- Замок — `tests/plot-diary.test.ts` и `tests/quest-death-reset.test.ts`, обе стороны правила.

## Побочные квесты и персонажи этажей

Побочные квесты держатся через `src/data/plot.ts` registries: `registerSideQuest()` and `registerSideQuestSteps()`. Living zone content and floor packages can attach NPCs, rooms, quest hooks and local decisions without writing content-specific logic in `main.ts`.

Хороший side quest:

- находится на конкретном floor/zone/room;
- имеет персонажа, голос, бытовую причину and material target;
- дает выбор: trade, steal, repair, escort, kill, hide, forge, expose, reroute, flee;
- использует existing items/resources/documents/monsters/factions where possible;
- уважает age/sex context, если задание связано с детьми, взрослыми ролями, семьёй, Floor 69, медпомощью, долгами или социальными поручениями;
- публикует событие for public consequences;
- переживает samosbor или явно объясняет why it is exempt/current-floor only.

### Побочный эффект заморозки слотов (2026-08-15)

Литералы вида `targetNpcId: getPlotNpcNumericId('X')!` внутри вызова `registerSideQuest`
вычисляются ДО регистрации, поэтому пока слот выдавался счётчиком, они замерзали в
`undefined`, если `X` регистрировался позже. `registerSideQuest` умел чинить только
`giverId` (бэкфилл, см. комментарий в `src/data/plot.ts`); остальные поля так и оставались
пустыми. После заморозки слотов в `src/data/npc_plot_ids.ts` резолвится всё сразу, и 32
поля у 30 квестов ожили. Это не новая механика, это переставший быть мёртвым контент,
но поведение изменилось:

- **19 квестов получили `targetNpcId`.** 17 из них типа TALK и раньше НЕ ПРЕДЛАГАЛИСЬ
  вовсе: `systems/quests.ts` пропускает TALK без цели. Среди них `permit_stamp_route`,
  `stamp_archive_route`, `ag104_report_ministry`, `crossroads_zebra_escort`,
  `prod_worker_escort`, `f69_hide_worker`, `underhell_free_witness`,
  `turing_nursery_expose_growth_child`, `m13_rescue_anya_from_prislushka`.
- **2 квеста KILL** (`kantselev_kill_makhno`, `ag83_clear_cult_workshop`) перестали
  засчитывать любое убийство монстра и требуют именную цель. Обе цели спавнятся.
- **9 эскортов получили `failOnNpcDeathId`** и стали проваливаемыми: `ag72_*`, `ag81_*`,
  `bolnichny_escort_infected_patient`, `labyrinth_rescue_lost_pavel`,
  `morgue_relative_escort`, `ostliq_aid_broken_respirator`,
  `voronoi_quarantine_escort_infected`. Провал ловится только при убийстве игроком:
  `notifyNpcKill` зовётся из `main.ts` при `killerActor === player`.
- **4 идол-квеста в `src/data/plot.ts` получили `giverId`** — сегодня no-op, сырых
  читателей поля нет, гивер и раньше резолвился через `giverPlotNpcId`.

**Проверено прогоном генераторов, а не по ссылкам.** Все 19 целей и все 9 подопечных
эскортов реально спавнятся: сгенерированы все 51 дизайн-этаж, у каждого entity взят
`npcPackageId`, сверено с целью квеста. Ни одной недостижимой цели нет — квесты
проходимы. Четыре цели (`zoya_surguchnaya`, `osip_kartochny`, `ag83_cult_foreman_omeljan`,
`ag81_mitya_defector`) появляются не на том этаже, который объявлен у них в
`placement.homeFloorKey`, — но появляются: это отдельный системный дефект, описанный
строкой «Домашний этаж пакета NPC врёт у трети реестра» в `problems.md`, а не поломка
квеста. Проиграть 17 оживших TALK-квестов вживую всё равно стоит: раньше их никто не
видел, и текст в них не проверялся.

## Системные задания и контракты

Contracts/assignments live in `src/data/contracts.ts` and runtime conversion in `src/systems/contracts.ts`. Они покрывают `FETCH`, `VISIT`, `KILL`, `TALK`, route targets, room resolution, target items, monster kinds, faction issuer, rank, deadline, money/XP/relation rewards and failure events.

Процедурное задание не должно быть мертвым текстом. Оно должно указывать floor/route, иметь достижимую цель, использовать scarcity/danger/depth for reward, and leave a compact fact when created, completed or failed. Quest rewards should be calculated through shared reward/economy paths instead of hardcoded one-off payouts.

## Связи с другими системами

- `scenarist.md`: тон, персонажи, реплики, слухи, записки, quest copy.
- `balance.md`: XP, деньги, level pressure, reward bands.
- `economics.md`: item/resource/faction reward value, scarcity, contract payouts, caravan/economy consequences.
- `alife.md`: persistent NPC identity, deaths, personal relation, future migration.
- `demos.md`: age/sex tags, profile graph and social context for procedural notices and posts.
- `ai.md` and `fight.md`: NPC survival, hostility, escort/combat consequences, witness reaction.
- `floors.md`: route targets, room anchors, floor memory, samosbor aftermath.
- `items.md`: quest items, documents, tools, rewards, contraband, samples.
- `problems.md`: квесты, которые требуют частных branches или не встроены в систему, должны попадать туда.

## Правила добавления квеста

1. Проверить, ручной это story/side quest или procedural contract.
2. Использовать stable ids: quest id, `plotNpcId`, item id, `contractId`, `routeId`, room/tag id.
3. Дать player-facing русский текст через `scenarist.md` style.
4. Дать reachable target and debug/test path.
5. Дать reward through `quest_rewards`, `economy`, item/resource/faction paths where applicable.
6. Опубликовать compact event for important state changes.
7. Учесть смерть NPC, samosbor, floor transition, save/load and failed objective.

Квест готов только когда игрок может понять, куда идти, что поставить на кон, что получить и что изменилось в мире после выполнения или провала.

### Выдача обязана уметь построить шаг (с 2026-08-27)

Достижимость по реестру («дающий есть, предмет есть, маршрут существует») ничего
не говорит о том, способна ли ВЫДАЧА собрать этот шаг. Условия жили двумя
независимыми списками: ветвлением внутри `generatePlotQuest` и `hasAvailableQuest`
в `data/plot.ts`, который рисует «!» над дающим. Списки разошлись, и **29 из 437
сайд-квестов не существовали для игрока**: 23 типа VISIT, чья цель задана одним
лишь `targetRoomDefId`, не проходили ни одну ветку выдачи (цикл молча уходил к
следующему квесту), плюс шесть, ждавших их в цепочке. Завершение при этом умело
их закрывать: `visitNeedsConcreteTarget` знает и `targetRoomDefId`, и
`targetZoneTag`. Потеряны были обе банковские механики, законный путь получения
пропуска в Министерстве, ревизия НИИ, обе линии Перевалки, обе линии
спецприёмника и развилка Митьки Сорванного из пяти взаимоисключающих исходов.
Над десятком дающих при этом вечно горел восклицательный знак.

Теперь предикат один — `sideQuestIsIssuable()` в `data/plot.ts`, и по нему живут
обе стороны: выдача строит, маркер гаснет. Место назначения VISIT можно объявить
любым из пяти способов (`visitFloorZ`, `targetRoomType`, `targetRoom`,
`targetRoomDefId`, `targetZoneTag`/`targetFloorZ`), и любого одного достаточно.
Замок — `tests/side-quest-issuable.test.ts`, обе стороны правила.

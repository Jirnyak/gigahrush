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

Сюжетные NPC должны иметь stable `plotNpcId`, room/content anchor, readable dialogue, age/sex demographic context, death handling and quest state. Если NPC может умереть, квестовая система должна либо принять смерть как consequence, либо иметь явный authored replacement/event path. Нельзя тихо респавнить quest giver как будто смерти не было.

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

Все цели проверены: каждая ссылается на реальный пакет (`tests/data-ids.test.ts`,
`tests/content-registry.test.ts`). Что стоит посмотреть глазами при случае — проходимы ли
17 оживших TALK-квестов вживую: раньше их никто не видел, и играть их не пробовали.

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

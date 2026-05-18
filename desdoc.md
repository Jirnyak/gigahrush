# GIGAHRUSH Design Doc: Current Planning Snapshot

Версия: 4.2
Дата: 2026-05-18
Статус: planning/design snapshot для следующей итерации и новой лорной волны контента; не authoritative факт-карта билда
Жанровая цель: **S.T.A.L.K.E.R.-like survival ARPG sim shooter в самосборной мегаструктуре**

`README.md` фиксирует факт текущего билда. Этот документ отвечает на другой вопрос: **что делать дальше в первую очередь, чтобы игра стала сильнее именно как survival ARPG sim shooter, а не просто больше по объему**. Фактические счетчики в секции 1 сверены через `scripts/content-audit.mjs`, точечные AST-счеты по data-файлам и `find`/`wc`; остальные секции остаются planning/backlog, а не описанием гарантированно shipped behavior.

## 1. Текущая Точка Опоры

Код уже не прототип:

- 6 `FloorLevel`: `MINISTRY`, `KVARTIRY`, `LIVING`, `MAINTENANCE`, `HELL`, `VOID`.
- Старт на `LIVING`; обычный лифтовой маршрут доходит до `VOID` на `z=36`; `VOID` также открывается порталом из Hell/Underhell.
- `src/` содержит 301 TypeScript-файл и 96 641 строку TypeScript без `dist/` и `node_modules`.
- Есть 12 `node:test` файлов; `tests/net-sphere.test.ts` покрывает optional Cloudflare Net Sphere config/schema/API path.
- Optional Cloudflare Net Sphere уже в текущем билде: клиент `src/systems/net_sphere.ts`, canvas overlay `src/render/net_sphere_ui.ts`, Pages Functions `functions/api/net/`, D1 schema `cloudflare/d1/net_sphere.sql`, guarded setup/schema scripts `cf:setup` и `cf:schema`.
- 240 item ids.
- `PHYS_WEAPON_STATS`: 31 запись, включая пустой unarmed fallback; из них 30 usable физических оружий.
- `PSI_WEAPON_STATS`: 16 ПСИ-оружий.
- 24 базовых монстра и 23 варианта.
- 16 шагов основного сюжета.
- 200 plot NPC ids: 9 базовых и 191 side-effect registered.
- 246 side quest steps.
- 67 системных контрактов.
- 17 ресурсов экономики, 10 описаний производств, 17 production recipes, контейнеры и production ticks.
- 303 статических слуха плюс слухи из событий.
- 8 вариантов самосбора, 21 модификатор, 36 aftermath-последствий и 16 baseline director beats.
- 8 номерных лифтовых инстансов.
- Вертикальный `FloorRun`: 15 design floor routes/generators и 60 процедурных сидовых этажей между ручными сюжетными якорями без добавления новых `FloorLevel`.
- Manifest-imported content modules: `living` 24, `ministry` 13, `kvartiry` 18, `maintenance` 36, `hell` 6, `void` 4.

Значит, следующая итерация не должна начинаться с "добавим еще 20 этажей". Нужен проход, который превращает существующий объем в плотный stalker-like игровой цикл.

## 2. Игровое Обещание

Игрок - не избранный герой и не турист. Он вооруженный жилец-сталкер, который ходит в вылазки по живому дому:

- берет заказ или слух;
- готовит оружие, патроны, воду, бинты, документы;
- идет через фракционные зоны и опасные комнаты;
- стреляет, прячется, торгуется, ворует, ремонтирует, договаривается;
- переживает самосбор как локальный выброс;
- возвращается с лутом, долгом, ранением, новым врагом или новой репутацией.

Главное чувство: **каждая вылазка должна иметь цель, риск, цену, возвращение и след в симуляции**.

## 3. Приоритеты Жанра

Порядок важен.

1. **Вылазка важнее энциклопедии.** Любой новый модуль должен создавать маршрут, риск и награду.
2. **Стрельба должна читаться.** Оружие, враги, попадания, нехватка патронов, звук и HUD должны давать ясное решение в бою.
3. **Самосбор - местный выброс.** Не фон и не таймер смерти, а событие с предупреждением, укрытием, последствиями, лутом и слухами.
4. **A-Life должен производить ситуации.** NPC не просто ходят: они видят кражи, разносят слухи, прячутся, дерутся, несут вещи, создают контракты.
5. **Экономика должна давить на решения.** Дефицит воды, патронов, медицины и документов должен менять цены, награды и маршруты.
6. **ARPG-прогрессия должна открывать риск, а не отменять страх.** Уровни, статы и редкое оружие дают новые способы захода, но сирена и закрытая дверь остаются опасными.

## 4. Не Делать В Следующей Итерации

- Не добавлять новый `FloorLevel`, пока существующие 6 этажей не получат плотные роли в вылазках.
- Не писать общие лор-разделы без задачи, файла и проверки в игре.
- Не добавлять еще сотни предметов без loot table, цены, дефицита, квестового применения или production recipe.
- Не расширять enum ради одного модуля; сначала string ids, tags, registries.
- Не делать новые UI-экраны в DOM. Это canvas/WebGL HUD.
- Не превращать мем-NPC в центр игры. Мемы допустимы как городские легенды, слухи, побочные POI.
- Не делать игрока героем, который "решает" самосбор. Победы локальны.

## 5. P0: Что Делать Первым

### P0.1 Shooter Readability Pass

Цель: бой должен быть понятен за 3 секунды без чтения таблиц.

Файлы:

- `src/data/weapons.ts`
- `src/data/items.ts`
- `src/systems/inventory.ts`
- `src/systems/ai/combat.ts`
- `src/render/hud.ts`
- `src/render/hud_fx.ts`
- `src/render/sprites.ts`
- `src/systems/audio.ts`

Сделать:

- Развести роли оружия: нож/труба как аварийный ближний бой; пистолет как дешевый точный; дробовик как коридорный стоппер; ППШ/АК как расход патронов; гвоздомет/гарпун как industrial tier; энергооружие как редкий поздний tier.
- В HUD явно показывать выбранное оружие, тип боеприпаса, остаток ammo и reload/attack cooldown, если уже есть данные.
- Для ranged-врагов и ПСИ дать более читаемые projectile sprites/impact feedback.
- Сбалансировать стартовую оружейную так, чтобы Макаров полезен, но патроны не снимают survival pressure.
- Smoke/debug path: через debug-оружие и стартовое стрельбище можно проверить каждую роль оружия.

Definition of Done:

- У каждого оружия есть понятная причина существовать.
- Урон/скорострельность/боеприпас не дублируют соседнее оружие без причины.
- Игрок понимает, почему умер или почему промахнулся.
- `npm run check` проходит или блокер явно описан.

### P0.2 Monster Counterplay Pass

Цель: монстр - не просто HP/speed, а поведение, которое меняет тактику.

Файлы:

- `src/entities/*.ts`
- `src/entities/monster.ts`
- `src/data/monster_ecology.ts`
- `src/data/monster_variants.ts`
- `src/systems/ai/monster.ts`
- `src/systems/ai/combat.ts`
- `src/data/rumors.ts`

Сделать:

- Для каждого часто встречающегося монстра задать одно боевое правило:
  - `SBORKA`: быстрый расход патронов, слабый по HP.
  - `TVAR`: средняя угроза, вынуждает держать дистанцию.
  - `POLZUN`: медленный танк, опасен в тесных проходах.
  - `EYE`: ranged enemy, ломает открытую линию коридора.
  - `SHADOW`: ambush/темнота, требует движения и света/дистанции.
  - `REBAR`: притворяется мусором/опасен рядом со стенами и складами.
  - `PECHATEED`/`PARAGRAPH`: бюрократические угрозы Министерства, наказывают документы/дистанцию.
  - `TUBE_EEL`: вода и трубы.
  - `NELYUD`: ложный человек, опасен на близкой дистанции.
- Экологию монстров связать с этажами, комнатами, слухами и loot hints.
- Новые варианты добавлять только если они меняют тактику: armored, ambush, ranged, water, document, lamp, wall.

Definition of Done:

- У каждого нового/измененного монстра есть counterplay text в data.
- Есть способ встретить его на подходящем этаже.
- Слух или экран может намекнуть на опасность.

### P0.3 Expedition Contracts

Цель: контракт должен быть настоящей вылазкой, а не абстрактным fetch.

Файлы:

- `src/data/contracts.ts`
- `src/systems/contracts.ts`
- `src/systems/quests.ts`
- `src/render/quest_ui.ts`
- `src/render/map_ui.ts`
- `src/systems/events.ts`
- `src/systems/rumor.ts`

Сделать:

- Каждый новый контракт должен указывать floor/zone/room bias через tags или existing context.
- Добавить больше контрактов типов kill, retrieve from container, deliver, repair, escort-like TALK, inspect VISIT.
- Награды привязать к дефициту ресурсов: вода, медицина, ammo, документы.
- Контракты должны публиковать `contract_created/completed/failed` и рождать слухи.
- На карте и миникарте цель контракта должна быть читаемой не хуже сюжетной цели.

Definition of Done:

- Контракт можно взять debug-командой и пройти без знания исходников.
- Он ведет игрока в конкретный рискованный участок.
- Он меняет деньги, отношения, событие или дефицит.

### P0.4 Samosbor As Blowout

Цель: самосбор должен быть главным драматическим циклом вылазки.

Файлы:

- `src/systems/samosbor.ts`
- `src/data/samosbor_variants.ts`
- `src/data/samosbor_director.ts`
- `src/systems/samosbor_director.ts`
- `src/systems/events.ts`
- `src/render/hud_fx.ts`
- `src/render/map_ui.ts`
- `src/systems/world_log.ts`

Сделать:

- Предупреждение: сирена, экраны, NPC bark, зона риска на карте.
- Укрытие: гермодвери, комнаты, риск сломанной двери, выбор "бежать дальше или закрыться".
- Активная фаза: туман, монстры, local beat, опасные коридоры.
- Aftermath: ресурсы сдвинулись, контейнер вскрыт, поздний монстр остался, слух родился, маршрут перестроился.
- На `MINISTRY/KVARTIRY/LIVING` больше социального aftermath; на `MAINTENANCE` вода/электрика/давление; на `HELL/VOID` мясо/аномалия/ПСИ.

Definition of Done:

- Один самосбор создает минимум один структурированный `WorldEvent`, один HUD/log сигнал и одну игровую проблему после отбоя.
- Игрок может пережить событие умным укрытием, а не только DPS.

### P0.5 Loot, Containers, Scarcity

Цель: лут должен быть причиной маршрута и конфликта.

Файлы:

- `src/data/container_defs.ts`
- `src/systems/containers.ts`
- `src/data/resources.ts`
- `src/data/factories.ts`
- `src/systems/economy.ts`
- `src/systems/production.ts`
- `src/render/container_ui.ts`

Сделать:

- У каждого важного POI должны быть 1-3 контейнера с владельцем, доступом и риском.
- Кража из фракционного/owner контейнера должна быть заметна, если рядом NPC или позже audit.
- Production output должен попадать в контейнер, который игрок может легально получить, купить, украсть или открыть ключом.
- Дефицит должен менять цену и награды, но не делать предмет бесконечно дорогим.
- Контейнеры должны поддерживать квестовые цели без новых специальных систем.

Definition of Done:

- В новом POI игрок выбирает: купить, украсть, взломать, выполнить услугу или уйти.
- События контейнеров попадают в лог/слух/отношения.

## 6. P1: Роли Этажей

Этажи уже есть, а между ними появился процедурный слой. Следующая задача - сделать ручные этажи и процедурные прослойки разными типами вылазок.

| Этаж | Роль | Первичные решения игрока |
| --- | --- | --- |
| `LIVING` | hub + бытовой survival | кому помочь, где взять припасы, что украсть, куда идти по слуху |
| `MINISTRY` | документы, пропуска, бюрократический stealth/combat | легально пройти, подделать, украсть, подкупить, зачистить |
| `KVARTIRY` | плотный социальный riot-floor | вмешаться в бунт, обойти толпу, спасти, ограбить, договориться |
| `MAINTENANCE` | industrial shooter expedition | ремонт, давление, вода, форпост, редкий тех-лут, жесткий бой |
| `HELL` | high-threat combat/ПСИ floor | выжить, выбить босса, прорвать порог, не задерживаться |
| `VOID` | late-game anomaly/boss space | рискнуть правилами, закрыть последствия, завершить run |

Правило: новый контент должен усиливать роль этажа. Если модуль одинаково работает на любом этаже, он недостаточно конкретен.

### P1.1 Procedural Floor Combinatorics

Цель: каждая новая игра получает вертикальный маршрут с узнаваемыми ручными сюжетными якорями и случайными вылазочными этажами между ними.

Сейчас реализовано:

- `src/data/procedural_floors.ts` - 5 geometry-профилей, 5 majority faction-профилей, 7 anomaly-профилей, danger и seed-biased loot/monster списки.
- `src/systems/procedural_floors.ts` - run seed, текущий `z`, 60 процедурных spec, save/load и лифтовой маршрут.
- `src/gen/procedural_floor.ts` - базовый универсальный генератор без сюжетных NPC.
- `world.anomalyTeleports` - редкие пары клеток для топологической аномалии.
- VISIT-квесты по этажам закрываются только на ручных story anchors, не на процедурных этажах с тем же базовым `FloorLevel`.

Следующие улучшения:

- Добавлять новые geometry-профили через `Docs/ProceduralFloors/geometry.md`, не через ручные story generators.
- Добавлять новые anomaly-профили через `Docs/ProceduralFloors/anomaly.md`; каждая аномалия должна менять маршрут, риск, видимость, лут, монстров или решение игрока.
- Сделать контракты aware of `FloorRun`: заказ должен уметь вести не только на `FloorLevel`, но и на procedural spec tags вроде `workshop`, `smog`, `mushroom`.
- Дать слухам и экранам текст о текущей комбинации этажа: тип, главная фракция, danger, аномалия.
- Не превращать procedural floors в копии ручных: ручные этажи держат сюжет и named content, процедурные - вылазку, вариативность, риск и добычу.

## 7. P1: ARPG Progression

Цель: прогрессия дает стиль игры, а не только числа.

Файлы:

- `src/systems/rpg.ts`
- `src/core/types.ts`
- `src/render/stats_ui.ts`
- `src/systems/inventory.ts`
- `src/data/weapons.ts`
- `src/data/psi.ts`

Сделать:

- STR: ближний бой, carry/устойчивость, тяжелое оружие.
- AGI: движение, скорострельность, уклонение/перезарядка, stealth-like кража.
- INT: ПСИ, контракты/документы, экономика/цены, редкие dialogue outcomes.
- Добавлять perks только после того, как STR/AGI/INT реально меняют решения.
- Scaling монстров держать в рамках: высокий уровень открывает опасные зоны, но не превращает коридор в тир.

Definition of Done:

- При получении уровня игрок выбирает стиль следующей вылазки.
- В HUD/инвентаре понятно, что изменилось.

## 8. P1: A-Life Situations

Цель: симуляция должна сама создавать stalker-like истории.

Файлы:

- `src/systems/ai/*`
- `src/systems/npc_memory.ts`
- `src/systems/context.ts`
- `src/systems/rumor.ts`
- `src/systems/faction_events.ts`
- `src/data/faction_events.ts`
- `src/systems/events.ts`

Сделать:

- NPC видит важное: кража, убийство, самосбор, фракционный бой, rare monster, production shortage.
- NPC запоминает кратко: fear/trust/knownRumorIds/recent facts, без больших object graphs.
- Слух должен быть полезной подсказкой: floor, room type, monster, resource, contract, danger.
- Фракционные события должны оставлять физический след: NPC, дроп, контейнер, смена зоны, лог.
- Патрули и гражданские должны не только спавниться, но создавать наблюдаемые столкновения.

Definition of Done:

- Игрок слышит о событии, может найти место события и увидеть последствия.
- Нет per-frame full-world scans.

## 9. P2: Контент-Модули Следующего Прохода

Добавлять не "просто комнаты", а POI с gameplay contract.

Каждый новый POI обязан иметь:

- floor role;
- входной риск;
- 1 NPC или 1 контейнер или 1 monster setup;
- 1 решение игрока: trade, steal, repair, escort, kill, hide, forge, expose, reroute, flee;
- 1 событие или слух;
- debug/reachable path;
- `aptMask` и проверенную связность, если это постоянный POI на `LIVING`.

Предыдущие примеры уже в основном приземлены в manifest-backed modules: `LIVING` получил склад патронов, медпост, картографа, подготовку вылазки и несколько cellar/medical/social POI; `MINISTRY` получил document/permit/archive/audit rooms; `KVARTIRY` получил water riot, barricade, ration queue, print room, ammo smelter and cult/social rooms; `MAINTENANCE` получил pressure/water/steam/lift/slime/production POI; `HELL` и `VOID` получили свои plot/protocol/combat anchors.

Следующие POI выбирать по реальным пробелам после playtest: где нет маршрута, читаемой награды, риска, события или последствий. Не повторять уже существующие room concepts только ради еще одного файла.

## 10. Баланс-Ориентиры

Эти числа не закон, а начальная линейка для проверки.

| Контур | Цель |
| --- | --- |
| Стартовая вылазка | 5-10 минут до первого значимого выбора и риска |
| Патроны | достаточно для защиты, недостаточно для зачистки всего |
| Еда/вода | давление каждые 10-20 минут, не постоянный UI tax |
| Самосбор | игрок должен успеть среагировать, если не игнорирует предупреждения |
| Бой | обычный монстр опасен пачкой; особый монстр опасен правилом |
| Контракт | цель, риск и награда видны до принятия или из слуха |
| Экономика | дефицит меняет маршрут, но не ломает прохождение |

## 11. Бэклог Для Следующих Агентов

1. **Combat HUD pass**: ammo/cooldown/weapon role feedback.
2. **Weapon balance audit**: стартовое, mid-tier, late-tier оружие без дублей; учесть 30 usable physical weapons plus unarmed fallback.
3. **Monster counterplay audit**: проверить ecology/rumors/encounter readability для 24 monster kinds и 23 variants.
4. **Ranged readability**: projectile sprite, impact, sound, HUD damage cue.
5. **Samosbor UX pass**: warning, shelter, aftermath and log/map clarity across 8 variants.
6. **Contract target markers**: системные контракты должны быть читаемыми как plot quests, включая procedural `FloorRun` targets.
7. **Container ownership consequences**: witness/audit для owner/faction контейнеров.
8. **Production/container audit**: 10 factories and 17 recipes should create reachable trade/steal/reward decisions.
9. **Rumor-to-place pass**: слух у NPC ведет в конкретный POI/контейнер/монстра или опасный floor spec.
10. **Faction event residue**: после столкновения остаются дроп, marks, слух, NPC behavior or zone-control change.
11. **ARPG stat effects audit**: STR/AGI/INT visibly affect combat/survival/dialogue.
12. **Smoke scenario update**: smoke должен проверять старт, бой, лифт, контракт/квест, самосбор and at least one current domain loop.
13. **README fact update after code**: обновлять только shipped behavior после проверки.

## 12. Definition Of Done Для Любой Фичи

Фича считается готовой, если:

- ее можно встретить в игре или вызвать через debug;
- она дает игроку решение, а не только текст;
- она публикует существующее событие, если меняет мир;
- она не сканирует весь мир каждый кадр;
- она учитывает toroidal math;
- она не ломает слой `core/data/gen/systems/render`;
- она имеет краткую фактическую запись в README только после реализации;
- для systems/render/save/load/generation изменений пройден `npm run check` или указан реальный блокер.

## 13. Короткая Формула Для Агентов

Не "добавь контент".
Делай **вылазку**:

**слух -> подготовка -> маршрут -> риск -> бой/сделка/кража/ремонт -> самосборный сбой -> лут -> событие -> последствия в NPC/экономике/зоне.**

Если модуль не вставляется в эту цепочку, он второстепенный для следующей итерации.

## 14. Лорная Волна: Источники И Отбор

Эта секция добавлена после внешнего ресерча по самосборной вики, тредовым следам, НИИ Слизи, культу Чернобога, Желемышу, говняку, Истотиту, Веретару и Маронарию. Источники противоречат друг другу, потому что самосборная вселенная коллективная и тредовая. Для игры это плюс: канон ГИГАХРУЩА должен брать устойчивые мотивы и превращать их в игровые системы, а не копировать пасты.

Правило отбора:

- устойчивый мотив из вики или нескольких тредовых следов можно брать как базу;
- одиночную шутку можно брать только как слух, граффити, предмет, сон, экран или побочный POI;
- прямой матерный/эротический/форсный тредовый текст не переносить в player-facing контент;
- мем не должен ломать survival horror: Желемыш, говняк, Маронарий и Веретар работают только если дают риск, маршрут и последствия.

Рабочая карта источников:

| Источник | Что брать | Как использовать |
| --- | --- | --- |
| [САМОСБОР вики: Самосбор](https://samosbor.fandom.com/ru/wiki/%D0%A1%D0%B0%D0%BC%D0%BE%D1%81%D0%B1%D0%BE%D1%80) | самосбор не объяснен, предупреждается сиреной, переживается за гермодверью, после него приходят ликвидаторы | усилить warning/shelter/aftermath loop, не давать игроку "решить" самосбор |
| [САМОСБОР вики: Гигахрущёвка](https://samosbor.fandom.com/ru/wiki/%D0%93%D0%B8%D0%B3%D0%B0%D1%85%D1%80%D1%83%D1%89%D1%91%D0%B2%D0%BA%D0%B0) | кубические строения, коридоры вместо улиц, заводы/НИИ/больницы/школы, автономная экономика, талоны, вторсырье | строить новые POI как части хозяйства, а не как isolated rooms |
| [САМОСБОР вики: Последствия самосбора](https://samosbor.fandom.com/ru/wiki/%D0%9F%D0%BE%D1%81%D0%BB%D0%B5%D0%B4%D1%81%D1%82%D0%B2%D0%B8%D1%8F_%D1%81%D0%B0%D0%BC%D0%BE%D1%81%D0%B1%D0%BE%D1%80%D0%B0) | монстры почти не классифицируются; слизь токсична и бывает разных типов; люди могут мутировать | добавить slime ecology, residue cleanup, monster counterplay and sample contracts |
| [САМОСБОР вики: Ликвидаторы](https://samosbor.fandom.com/ru/wiki/%D0%9B%D0%B8%D0%BA%D0%B2%D0%B8%D0%B4%D0%B0%D1%82%D0%BE%D1%80%D1%8B) | зачистка, РБХОПЗ, дробовики, топор, огнеметы, жернов, ПТРС, УФ-прожектор | сделать ликвидаторские инструменты источником новых боевых ролей и cleanup-контрактов |
| [Хрущепедия / ShoutWiki index](https://samosbor.shoutwiki.com/) | широкий список флоры/фауны, ресурсов, НИИ, коммуникаций, религии, технологий | использовать как каталог будущих доменов: бетоноеды, гермоточильщики, лифтовая арахна, пневмопочта, Бионет |
| [Author.Today: НИИ "Слизи"](https://author.today/post/531103) | НИИ как сеть филиалов; ученые проектируют гермодвери, оружие и бытовые устройства; собирают образцы с ликвидаторами | создать научно-полевую ветку с образцами, допусками, экспериментальными инструментами и морально грязной экономикой |
| [Самосбор Вики: Слизь](https://samosbors8878.fandom.com/ru/wiki/%D0%A1%D0%BB%D0%B8%D0%B7%D1%8C) | слизь как распространенное остаточное последствие; черная/прозрачная базовые; редкие цвета опаснее | сделать slime residue не просто декором, а ресурсом/опасностью/уликой |
| [Самосбор вики: Культ Чернобога](https://samosb0r.fandom.com/ru/wiki/%D0%9A%D1%83%D0%BB%D1%8C%D1%82_%D0%A7%D0%B5%D1%80%D0%BD%D0%BE%D0%B1%D0%BE%D0%B3%D0%B0) | крупнейшая религиозная угроза, центральная и внешняя ячейки, конфликт с ликвидаторами | развить культистов как человеческую A-Life фракцию с вербовкой, саботажем и block takeover |
| [Самосбор вики: Чернобожники](https://samosb0r.fandom.com/ru/wiki/%D0%A7%D0%B5%D1%80%D0%BD%D0%BE%D0%B1%D0%BE%D0%B6%D0%BD%D0%B8%D0%BA%D0%B8) | Чернобог как психо-религиозный паттерн, знаки, черные ладони, блоки с общими биологическими/поведенческими признаками | делать культ не "магами", а заражающей социальной практикой, которую игрок распознает по следам |
| [Мракопедия: Маронарий](https://mrakopedia.net/wiki/%D0%9C%D0%B0%D1%80%D0%BE%D0%BD%D0%B0%D1%80%D0%B8%D0%B9) и `maronary.md` | зеленый свет, писк, пение, потеря телесности, золотая стружка | редкий `SamosborVariantDef`, bounded marks, не отдельная система |
| `istotit.md` | золотой церковный самосбор, укрытые комнаты, социальный долг | редкий вариант самосбора с shelter choice и aftermath-долгом |
| `veretar.md` | белая внешняя область, песок, отсутствие солнца, зараженное наблюдение | редкий вариант самосбора с area leak, shortcut и опасными уликами |
| [2ch.life archive 229287446](https://2ch.life/b/arch/res/229287446.html) | Веретар, Желемыш, говняк, Маронарий и Истотит встречаются рядом как шумный тредовый фольклор | брать только мотивы: область, зеленый источник, дым/забытье, дубленая кожа, слово-зараза |
| [2ch archive 618654](https://2ch.hk/sn/arch/2020-08-10/res/618654.html) | Маронарий привязан к хрущевке, экранам, писку и исчезающей телесности | уже учтено в `maronary.md`, не дублировать прямые пасты |
| [Самосбор Minecraft: Грибоводство](https://samosborminecraft.fandom.com/ru/wiki/%D0%93%D1%80%D0%B8%D0%B1%D0%BE%D0%B2%D0%BE%D0%B4%D1%81%D1%82%D0%B2%D0%BE) | Желемыш существует как грибной ресурс среди других грибов/плесени | адаптировать как опасную food/medicine/faction economy, не как Minecraft-механику |
| Тредовые следы Желемыша | гриб/желе/телесная дубленость, навязчивое слово, сельско-кладбищенский и бытовой тон | грибной/телесный ресурс с плохой ценой, не веселый бафф |
| Тредовые и игровые следы говняка | дешевый наркотический продукт, дым, забытье, черный рынок | survival pressure valve: краткая выгода против зависимости, долгов, слухов и галлюцинаций |

## 15. Масштаб: После Рубежа 100k

Текущий `src/**/*.ts`: 301 файл, 96 641 строка. Проект уже почти у рубежа 100k, поэтому 100k+ больше не цель сама по себе. Для ГИГАХРУЩА масштаб считается не строками, а количеством playable contracts, проверенных маршрутов и последствий в симуляции.

Хороший рост кода:

- новый POI с генерацией, NPC/контейнером/монстром, слухом, событием и проверяемым маршрутом;
- новый самосборный вариант через существующие variant/aftermath/event hooks;
- новый monster kind или variant с counterplay;
- новый контракт, который ведет на floor/run spec и оставляет событие;
- новый ресурс/предмет только если есть trade/use/quest/production/steal decision.

Плохой рост кода:

- 200 предметов без контейнеров, цен, рецептов и квестов;
- новый `FloorLevel` ради одной комнаты;
- новый event bus, новый UI framework или отдельная "система лора";
- enum для каждого мема;
- длинные тексты без маршрута, риска и награды.

Ориентир для следующей большой волны:

| Масштаб | Что реально нужно | Ориентир |
| --- | --- | --- |
| 100k строк | текущий диапазон; нужен cleanup, playtest и smoke-покрытие текущей плотности | не выдавать как отдельную цель |
| 150k строк | новые packages только после проверки уже landed slime/cult/zhelemish/govnyak/variant loops | примерно +50k TS |
| 200k строк | системные passes, новая экология и процедурные варианты только с playable contracts | примерно +100k TS |

Каждый package должен быть маленьким и закончить свою цепочку: data -> gen -> systems/event -> render/HUD/log -> smoke/debug. Если package не имеет DoD, его не брать в работу.

## 16. Домены Контента: Статус И Следующий Шаг

Часть "новой волны" уже в коде. Эти anchors нельзя выдавать как unstarted work; новый агент должен читать текущие файлы и формулировать только недостающий шаг.

| Домен | Что уже есть в коде | Следующий полезный зазор |
| --- | --- | --- |
| НИИ Слизи | `src/data/slime_defs.ts`, ресурс `slime_samples`, maintenance/living slime POI, deactivation furnace, sample/cleanup rooms | проверка readability: как игрок находит site, чем рискует, кому сдает образец |
| Чернобог/культ | `chernobog_docket`, external neighbor, cult kitchen/workshop, false-safe procedural anomaly, cult rumors/events | больше наблюдаемых социальных последствий, меньше новых алтарей |
| Редкие самосборы | `maronary`, `istotit`, `veretar` уже в `SAMOSBOR_VARIANTS`; есть modifiers, aftermath и director beats | debug/smoke coverage, HUD/map/log clarity, no new variant before these are readable |
| Говняк | item/status/system hooks, contraband resource, smoke den, smog/procedural hooks | bounded debt/addiction clarity; не glamorized buff |
| Желемыш | defs/resource/items, living cellar, fake medpost, sample/contract hooks | понятная цена raw/use/sell choices и реакция NPC |
| Биота/монстры | часть кандидатов уже имеет entities/systems/POI: lift arachna, Hladon, paritel, krysnozhka, kostorez, carnivorous fungus, betonoed shortcut | counterplay and encounter readability pass before adding more species |

Общее правило осталось прежним: новый module должен давать route -> risk -> decision -> event/consequence. Если он только добавляет noun или lore text, его не брать.

## 17. Backlog Hygiene

Старые AG61-AG120 prompts больше не являются чистым backlog: многие соответствующие файлы уже существуют. Для новой задачи писать не "сделай AGXX", а:

1. какие current files уже покрывают домен;
2. какой конкретный behavior still missing;
3. какой debug/reachable path проверит результат;
4. какие counters или README facts изменятся только после shipped behavior.

Высокий приоритет для следующего прохода:

- Combat HUD/weapon-role pass.
- Contract target readability, включая procedural `FloorRun` specs.
- A-Life residue: witness, rumor, loot/drop/zone trace after events.
- Smoke scenario over current domains: slime sample, cult conflict, rare samosbor, return.
- README fact pass only after behavior is verified in game.

## 18. Integration Hooks

Сначала использовать существующие rails:

- `systems/events.ts` для фактов мира;
- `contracts`, `containers`, `economy`, `production` для награды, дефицита и кражи;
- floor `content_manifest.ts` files для additive modules;
- `procedural_floors` defs для geometry/faction/anomaly, без нового `FloorLevel`;
- existing status/domain systems such as `govnyak`, `hladon`, `carnivorous_fungus`, `floor_instances` when they already match the behavior.

Новые narrow APIs допустимы только под конкретный blocked module: small condition ids, item-id variants for samples, event tags, or debug force hooks. Не начинать с universal disease/drug/mutation framework, new event bus, ECS rewrite, or DOM document UI.

## 19. Шаблон Промпта Для Следующего Агента

Использовать как основу для выдачи задач:

```txt
Ты работаешь в /Users/jirnyak/Mirror/gigahrush.
Прочитай README.md, architecture.md, desdoc.md и relevant source files.
Твоя задача: AGXX <название>.
Ownership: <files/modules>.
Не трогай main.ts/core/world.ts/render/webgl.ts без крайней необходимости.
Сделай playable slice: rumor/lead -> route -> risk -> decision -> reward/consequence.
Добавь debug или reachable path.
Публикуй важный факт через systems/events.ts, если меняется мир.
Для generation/systems/render/save changes запусти npm run check; для data-only минимум npm run typecheck.
README обновлять только если поведение реально shipped.
```

## 20. Новый Критерий "Много Контента"

Много контента в ГИГАХРУЩЕ - это не количество nouns. Это количество ситуаций, где игрок меняет план.

Хорошая метрика следующего прохода:

- 10+ audited routes through existing POI/contracts/samosbor consequences;
- 10+ rumor-to-place chains that point to concrete risk and reward;
- 6+ event residues that leave visible loot, marks, NPC behavior, economy or zone change;
- 1 smoke/debug path that covers slime sample, cult conflict, rare samosbor and return;
- 0 new nouns without use, route, price, theft, contract or consequence.

Если после волны игрок чаще думает "куда идти, чем рисковать, кому верить, что сдать, что скрыть", цель достигнута. Если он просто видит больше названий в инвентаре, цель провалена.

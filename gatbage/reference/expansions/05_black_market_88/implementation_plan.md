# Черный рынок 88: implementation plan

Статус: planning package для будущего playable MVP. Этот документ не объявляет код реализованным и не требует нового большого `FloorLevel`. Цель среза: игрок находит нелегальный вход, покупает один дефицитный товар, берет короткий контракт, пользуется долгом и видит последствие heat/raid/просрочки.

## Техническая рамка

Рынок не является второй экономикой. Он является нелегальным фасадом над текущими системами инвентаря, AG10 economy/contracts/containers и будущими expansion-поставками. Scarcity хранится агрегированно, цены считаются по запросу, контракты конвертируются в обычные задания, долги остаются малым bounded state. В runtime запрещены full-world scans, per-frame price updates и симуляция покупателей.

MVP должен жить в одном скрытом pocket/room cluster с двумя входами: жилой парольный вход и технический люк. Этаж 88 остается поздней визуальной рамкой после доказанного цикла. Если будущий numbered-floor слой появится раньше, рынок подключается через адаптер входа, но не требует его.

## Фаза 0: preflight и data ownership

Перед кодом исполнитель перечитывает `README.md` фактические секции про торговлю, рубли, AG10 economy/contracts/containers/debug; `desdoc.md` секции про экономику, события, production rooms и контракты черного рынка; `gatbage/reference/expansions/05_black_market_88/expansion.md`; AG10 status/rationale. Выход фазы: короткая implementation note с выбранными existing item ids и source-file ownership.

Definition of Done: список item ids, trader ids, contract ids и debug hooks согласован с существующим `src/data/contracts.ts` и `src/systems/economy.ts`; не создано новых enums без необходимости. Проверка: `rg "contractId|EconomyState|Container"` по коду, затем baseline `npm run build`.

Риск фазы: разработчик начнет с нового рынка как отдельного симулятора. Контрмера: market state должен быть меньше production/economy state и ссылаться на них, а не дублировать.

## Фаза 1: hidden entry and room slice

Создать минимальный market pocket как один контент-модуль, предпочтительно `src/gen/living/black_market_entry.ts`, с явным вызовом из living orchestrator только после договоренного source ownership. Комната должна иметь два входных правила: `password` через слух/реплику и `maintenance_guide` через люк. Внутри нужны 3 trader NPC, 1 касса/container, 1 locked stash, 1 охранник и 1 документ-прайс.

Технически pocket использует существующие room/cell/feature patterns. Пароль не должен быть глобальной строкой в UI; это state flag, полученный через rumor/dialogue/contract. При отсутствии AG09 rumor integration допускается debug выдача пароля и прямой NPC prompt.

Definition of Done: игрок может открыть хотя бы один вход, увидеть NPC, открыть рынок через interaction/debug, и покинуть pocket без softlock. Проверка: новая игра, `npm run build`, ручной проход до комнаты или debug teleport/spawn.

Риск: вход станет permanent shortcut без цены. Контрмера: первый вход cheap, второй требует проводника/жетон/долг; heat растет при повторных входах.

## Фаза 2: market state and price adapter

Добавить bounded state вида `MarketAccessState`, `MarketTraderState`, `MarketDebtState`, не больше 64 debts и 16 trader rows в MVP. Цена товара считается функцией `base ItemDef.value + economy scarcity multiplier + trader trust + market heat + raid lock penalty`. Если AG10 economy state недоступен, fallback использует static scarcity table из market data.

Market state обновляется только по событиям: вход, покупка дорогого товара, принятие долга, завершение контракта, самосбор, рейд. Стабильный кадр не платит за рынок ничего.

Definition of Done: одна покупка меняет stock, trust/heat влияет на цену, debug показывает расчет цены по компонентам. Проверка: купить один бинт/патроны, изменить scarcity debug-командой AG10, увидеть другую цену.

Риск: exploit денег через buy/sell loop. Контрмера: limited stock, spread между buy/sell, debt heat и запрет обратной продажи редких reward items тому же trader.

## Фаза 3: debts as delayed consequences

Долг открывает доступ сейчас и создает scheduled consequence. MVP должен поддержать пять шаблонов: товарный, денежный, защитный, информационный, фракционный. Каждый долг имеет owner, due time, severity, settlement options и consequence id. Долг без владельца запрещен.

Просрочка не должна спавнить армию. Она сначала меняет market heat, блокирует скидку, добавляет угрозу в журнал/реплику, затем может породить один raid/ambush/contract demand на cooldown.

Definition of Done: игрок берет долг, получает предмет/доступ, время/действие доводит долг до просрочки, consequence видна в HUD/log/debug. Проверка: debug advance due time, `Market: list debts`, trigger overdue.

Риск: долг станет flavor-текстом. Контрмера: просрочка обязательно меняет хотя бы одно из: access, price, faction suspicion, contract availability, raid cooldown.

## Фаза 4: contracts without replacing quests

Черный рынок использует существующий contract wrapper AG10. Market-specific contract defs добавляют issuer, illegal tag, risk, heatDelta, debtSettlementIds и reward table. Runtime создает обычный Quest с `contractId`; completion/failure идет через existing quest path. Если общий contracts system меняется будущим агентом, market module оставляет только adapter.

MVP включает три коротких контракта: доставить дефицитный товар, спрятать/провести курьера, украсть/вернуть документ. Каждый контракт должен занимать один локальный отрезок, а не становиться отдельной кампанией.

Definition of Done: debug или trader создает contract quest; активный лимит квестов соблюдается; completion меняет trust/heat/scarcity/debt. Проверка: принять контракт при свободном журнале, заполнить журнал до cap и убедиться, что рынок отказывает без corrupt state.

Риск: market contracts начнут конкурировать с сюжетными PLOT_CHAIN. Контрмера: они не используют story npc ids, не меняют main quest chain и имеют отдельный tag namespace `market88.*`.

## Фаза 5: raids and samosbor reaction

Рейд является rare scripted event, не patrol simulation. Триггеры: высокий heat, просроченный долг, фракционный контроль зоны, самосбор variant aftermath. Рейд закрывает часть stock/trader access, добавляет охрану или временный lock, публикует событие/лог и дает игроку выбор: переждать, защитить, сдать, выкупить.

Самосбор меняет demand table: классический повышает медицину/патроны/гермокомплекты, мокрый повышает фильтры/сухую еду/грибную продукцию, электрический повышает энергоячейки, мясной открывает cult/psi trades, тихий повышает panic heat.

Definition of Done: два variant hooks меняют demand/heat; один raid можно принудительно вызвать debug-командой; после raid рынок остается playable. Проверка: force samosbor variant, inspect demand, force raid, inspect trader lock.

Риск: рейды превратятся в бесплатный loot farm. Контрмера: raid loot low, stock destruction abstract, guards despawn/lock after event, reward идет через contract result.

## Фаза 6: verification and polish

Финальная проверка должна доказать цикл: вход -> покупка -> долг -> контракт -> последствие. Обязательные проверки: `npm run build`, новая игра, debug market status, debt overdue path, contract cap path, raid path, save/load tolerance if state persisted.

Polish запрещает расширять MVP в полноценный floor 88. Улучшения идут через readable price breakdown, concise trader lines, visible locked stash, two documents and heat/trust debug. Если фаза не помещается в frame budget, визуал режется первым; агрегированная логика остается.

## Math LOD

| Tier | Логика | Визуал | Target cost |
| --- | --- | --- | ---: |
| Low | static stock, 1 hidden room, fixed scarcity fallback, debt flags | 3 NPC, 1 касса, 1 locked stash | 0 us/frame steady, <100 us interaction |
| Middle | event-updated scarcity/trust/heat, overdue debts, one raid cooldown | trader lock states, small signage, basic log lines | 0 us/frame steady, 100-300 us per event |
| High | AG10 economy multipliers, contract adapter, samosbor demand hooks | more props, guard state, stock changes after raid | 0 us/frame steady, <500 us rare event |
| Ultra | richer trader roster, cross-expansion goods, denser scene, procedural notices | visual overkill in pocket only; no live buyers | 0 us/frame steady, bounded explicit events |

## Test matrix

| Check | Required result |
| --- | --- |
| Build | `npm run build` passes after implementation. |
| Entry | Two access paths can be proven by interaction or debug. |
| Trade | Price explanation shows base value, scarcity, trust, heat. |
| Debt | One debt matures and causes a mechanical consequence. |
| Contract | Three market contracts wrap existing Quest/Contract path. |
| Raid | Forced raid changes access/stock without softlock. |
| Samosbor | At least two variants modify market demand/heat. |
| Save tolerance | Old saves load without market fields; new fields normalize. |


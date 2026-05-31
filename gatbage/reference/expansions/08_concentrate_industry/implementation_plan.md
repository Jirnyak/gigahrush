# Промзона концентрата: implementation plan

Статус: planning package для будущего playable MVP. Документ не объявляет код реализованным и не требует нового `FloorLevel`. Цель среза: игрок входит в промышленный pocket, чинит или ломает одну брикетную линию, видит изменение supply/контейнера/цен, получает реакцию смены и сталкивается с решением о браке концентрата.

## Техническая рамка

Промзона не должна становиться вторым симулятором экономики. Она является производственным источником для уже описанных AG10 economy/contracts/containers и будущих expansion-поставок. Runtime хранит bounded state линий и смен, считает производство редким tick или debug-командой, а конкретные item stacks создает только в output container, reward или событии. В стабильном кадре промзона должна стоить 0 us, кроме уже существующего рендера комнаты/NPC.

MVP живет в одном промышленном pocket рядом с `MAINTENANCE` или `LIVING` рынком. Полная промзона, мясокомбинат, оружейная линия и грузовой лифт остаются reserved scope до доказанного vertical slice. Если общий production/economy слой уже есть, Expansion 08 подключается через адаптеры. Если слой меняется другим агентом, этот expansion обязан сохранить локальный контракт данных и не импортировать нестабильные concrete implementation paths.

## Preflight ownership

Перед кодом исполнитель перечитывает фактические секции `README.md` про контракты, экономику, контейнеры, debug-команды 9-14, а также `desdoc.md` разделы 9, 10.3, 78-80. Затем сверяет существующие item ids для воды, еды, брикетов, инструментов, pipe/wrench, контейнеров и contract ids через `rg` по `src/data` и `src/systems`.

Definition of Done: выбран список existing item/resource ids, namespace `industry08.*`, один room tag для pocket, один factory line id и список debug hooks. Проверка: `rg "production|economy|container|contractId|debug"` по коду, baseline `npm run build`, zero edits outside assigned implementation files.

Риск фазы: начать с нового этажа или общего production rewrite. Контрмера: phase exit требует pocket-only decision и explicit adapter names, а не concrete file ownership чужих систем.

## Фаза 1: промышленный pocket и статический slice

Создать один `concentrate_briquette_pocket` как cluster из 5-7 комнат: брикетный цех, склад сырья, склад брака, комната мастера, отдел качества, душевые рабочих и короткий service corridor. Визуально pocket должен читаться как производство: conveyor strip, press unit, output crate, quality desk, warning lamps. Логически это обычные rooms/tags поверх существующих cell/feature patterns.

Первый проход допускает static placement без live production: игрок может найти мастера, открыть output crate, прочитать сменный журнал и увидеть broken line state. Брикетная линия начинается в `blockedReason=no_inputs` или `jammed_press`, чтобы loop не был декоративным.

Definition of Done: pocket достижим без softlock, имеет минимум один вход/выход, один output container или fallback room feature, три named NPC hooks и note с составом концентрата. Проверка: новая игра или debug spawn/teleport к pocket, inspect room tags, no full-world scan в генерации.

Риск: pocket станет набором декораций. Контрмера: любой room в slice должен иметь функцию в production loop: input, output, repair, morale, quality или risk.

## Фаза 2: FactoryLineState и abstract supply

Добавить data-driven definition для одной линии `industry08.briquette_press`. Линия потребляет `water`, `concentrate_paste`/fallback food resource, `packaging`/fallback paper, `workerMinutes` и малую `powerNeed`. Output идет в abstract supply buckets: `food`, `rations`, `defective_food`, а concrete items создаются только при `claimOutput`, contract reward или debug tick.

`FactoryLineState` хранит progress, condition, contamination, defectRate, ownerFaction, blockedReason, lastTickMinute и output buffer. Tick запускается не чаще 60 игровых секунд, а лучше только production scheduler/debug-командой. Формула output должна быть целочисленной и deterministic: `effectiveBatch = baseBatch * conditionMul * workerMul * inputQualityMul`, затем capped defect conversion.

Definition of Done: debug tick меняет line progress/supply, дефицит входов ставит `blockedReason`, успешный batch кладет ограниченный output в контейнер или supply ledger. Проверка: force tick без inputs, force inputs + tick, inspect supply delta, inspect output crate count cap.

Риск: производство начнет спавнить лут по всему миру. Контрмера: только abstract supply + one crate; floor drops разрешены только как авария/разграбление.

## Фаза 3: агрегированная рабочая смена

Смена рабочих не симулируется как 40 NPC. MVP использует один `WorkShiftState` на линию: morale, injury, hunger, fear, pressure, workerMinutes, sabotageRisk и currentDemand. Индивидуальные NPC в pocket являются anchors для разговора и квестов, но output считается агрегатом.

Игрок влияет на смену четырьмя действиями: принести еду/воду, выдать медицину, починить пресс, пригрозить или подкупить мастера. Положительный путь поднимает morale/condition и снижает defectRate. Насильственный путь дает быстрый output, но повышает injury/fear/sabotageRisk и генерирует плохие слухи.

Definition of Done: два player actions меняют `WorkShiftState`, state влияет на output или defectRate, shift status виден через debug и одну реплику NPC. Проверка: apply morale item, force tick, compare supply; apply threat/debug pressure, force tick, compare defect/sabotage.

Риск: смена станет flavor text. Контрмера: каждый field должен иметь хотя бы один mechanical consumer или не входить в MVP.

## Фаза 4: контракты и совместимость с рынком

Контракты промзоны не заменяют Quest. Они создают обычный quest wrapper с `contractId` и industry payload. MVP включает четыре контракта: `repair_briquette_press`, `deliver_packaging`, `guard_shift`, `sabotage_quality_report`. Completion меняет line state, supply ledger, faction reputation или market scarcity.

Совместимость с черным рынком и AG10 economy строится через abstract events: `industry_batch_ready`, `industry_line_blocked`, `industry_defect_found`, `industry_control_changed`. Если market/economy consumer отсутствует, события пишутся в log/debug и локальный supply snapshot.

Definition of Done: один contract создается debug-командой или master NPC, completion вызывает production/economy adapter, active quest cap соблюдается, повторное завершение idempotent. Проверка: принять контракт при свободном журнале, заполнить журнал до cap, завершить repair path, inspect supply/line state/event log.

Риск: промзона напрямую импортирует конкретный market module другого expansion. Контрмера: только interface call or event payload; no direct dependency on Expansion 05 files.

## Фаза 5: самосбор, брак и моральное решение

MVP должен поддержать минимум два варианта самосбора. Классический туман повышает contamination и defectRate. Мясной резонанс открывает output `suspect_concentrate`, который дешевле и питательнее, но повышает moral cost, cult interest и poisoning risk. Мокрый/электрический варианты можно оставить as reserved behavior, но interface должен иметь поля для water bonus и equipment burn.

Ключевая сцена playable slice: отдел качества предлагает списать партию, мастер просит выпустить ее, рынок/очередь нуждаются в еде. Решение игрока дает видимый outcome: больше пайков с риском отравления, меньше еды но чистая партия, sabotage/black-market diversion или cult delivery.

Definition of Done: force two samosbor variants changes line state differently; quality decision changes output target and one world consequence. Проверка: debug set variant classic/meat, tick line, inspect defect/consequence; choose release/hold/divert and inspect supply/rumor/contract result.

Риск: мораль сведется к бинарной кнопке без системного эффекта. Контрмера: outcome должен изменить хотя бы два слоя: supply/price/container and NPC/faction/log.

## Фаза 6: verification, telemetry и polish

Финальная проверка доказывает полный loop: вход в pocket -> диагноз линии -> добыть input или repair -> shift decision -> batch output -> market/supply consequence -> debug inspection. Документация обновляется только в expansion folder и agent logs до появления кода.

Для critical production state внедрить black-box ring buffer when code phase starts: последние 300 production frames/events с lineId, gameMinute, inputHash, outputHash, blockedReason, defectRate, ownerFaction, NaN flags. При NaN/crash dump path: `gatbage/history/agent_logs/Dump_EXP08_INDUSTRY.bin`.

Definition of Done: `npm run build` passes, manual/debug acceptance сценарий пройден, production tick не добавляет steady-frame work, status/rationale/log обновлены. Проверка: build, new game smoke, debug tick, debug dump line, forced samosbor variants, contract cap.

Риск: polish распухнет до полного factory sim. Контрмера: polish only improves readability, debug state, visible output crate, line sparks/noise as cheap visual fake. Additional factory lines stay data-only until MVP is playable.

## Math LOD

| Tier | Логика | Визуал | Target cost |
| --- | --- | --- | ---: |
| Low | 1 line, static inputs, manual/debug tick, 1 shift aggregate, 1 output crate | static press sprite/feature, 3 NPC anchors, warning sign | 0 us/frame steady, <150 us per explicit tick |
| Middle | scheduled slow tick, two failure modes, morale/injury/hunger affect output, contract wrapper | conveyor strip animation by existing clock, two lamp states, crate fill label | 0 us/frame steady, <300 us per production event |
| High | faction control, two samosbor variants, defect routing, market/economy adapter events | sparks/noise decals near player only, richer room props, quality desk state | 0 us/frame steady, <600 us rare event |
| Ultra | multiple industry lines after MVP, raids, weapon-mod service, richer cross-expansion supply | visual overkill in pocket: moving belts, steam bursts, lamp flicker, audio layers | 0 us/frame steady; visuals distance/visibility gated |

Low, middle, high and ultra use the same deterministic production math. Higher tiers spend saved budget on visible industrial horror, not more per-frame simulation.

## Test matrix

| Check | Required result |
| --- | --- |
| Build | `npm run build` passes after implementation. |
| Scope | No edits outside agreed source files and Expansion 08 docs/logs. |
| Pocket | Player/debug can enter and leave industrial pocket without softlock. |
| Line blocked | Tick without inputs sets `blockedReason` and publishes/prints shortage. |
| Line output | Tick with inputs creates bounded abstract supply and fills one output container. |
| Shift | Morale/injury/hunger modify output or defect rate and are visible in debug. |
| Contracts | Repair/delivery contract wraps existing Quest cap and completion path. |
| Economy | Supply delta can be read by economy/market adapter or fallback snapshot. |
| Samosbor | At least two variants change contamination/failure/output differently. |
| Quality decision | Release/hold/divert defective batch changes supply plus NPC/faction/log consequence. |
| Telemetry | Last 300 line states are retained in fixed ring buffer once code exists. |


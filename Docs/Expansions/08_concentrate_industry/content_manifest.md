# Expansion 08 Content Manifest: Concentrate Industry MVP

Статус: planning manifest. Содержимое описывает future minimum playable slice и не является отчетом о реализованных ассетах.

## Content Boundaries

Промзона концентрата - production horror POI, а не новый полноценный этаж. MVP работает в одном промышленном pocket и использует existing room types/tags, items, containers, contracts and economy hooks where possible. Новые сущности допустимы только как data ids, room tags, notes and optional sprites/features после согласования code ownership.

Игровая петля контента: игрок приходит по supply или repair contract, находит остановленную брикетную линию, выбирает ресурсный/социальный/силовой способ запуска, получает партию с нормальным или бракованным output и видит последствие в supply, цене, контейнере, слухе или faction reaction.

## Factory Lines

| Line id | Название | MVP status | Inputs | Outputs | Failure modes | Player levers |
| --- | --- | --- | --- | --- | --- | --- |
| `industry08.briquette_press` | Пресс пищебрикетов БК-08 | Core MVP | water, concentrate_paste fallback `canned`/food, packaging fallback `paper`, workerMinutes, low power | ration/food supply, `briquette_ration` fallback existing food item, `defective_briquette`, `suspect_concentrate` | `no_inputs`, `jammed_press`, `contaminated_paste`, `quality_hold` | repair, deliver inputs, raise morale, release/hold/divert batch |
| `industry08.packaging_table` | Упаковочный стол | Data-only support | paper/cloth, labor | packaging units, lower spoilage | missing paper, wet spoilage | delivery contract, wet variant hook |
| `industry08.quality_desk` | Отдел качества | Decision node | batch report, inspector labor | approved batch, rejected batch, blackmail note | forged report, cult pressure | sign act, steal recipe, alter defect rating |
| `industry08.rebar_bench` | Арматурный участок | Reserved | scrap_metal, power, labor | pipe, wrench, door_kit supply | injury, sparks, sabotage | future repair economy |
| `industry08.filter_line` | Линия фильтров | Reserved | cloth, charcoal/filter media, water, labor | filter supply | wet clog, toxic leak | future samosbor protection |

MVP ships only `industry08.briquette_press` as a functional line. Other lines exist to keep naming and integration stable, but must not be counted as playable until they have state, tests and visible output.

## Work Shifts

| Shift id | Line | Composition | State fields | MVP interaction | Consequence |
| --- | --- | --- | --- | --- | --- |
| `industry08.shift_day_briquette` | briquette press | master + 6 abstract workers | morale, injury, hunger, fear, workerMinutes, sabotageRisk | feed shift, give bandage, repair press, threaten output | output multiplier and defect rate change |
| `industry08.shift_quality_pair` | quality desk | inspector + clerk | pressure, corruption, fear | sign or reject batch report | faction/market target changes |
| `industry08.shift_night_leftovers` | briquette press | 2 abstract workers, no master | fatigue, injury, theftRisk | optional later night contract | lower output, higher theft/defect |

Shift state is aggregate. Named NPC are anchors for dialogue and quest routing, not per-worker simulation. If no named NPC exists at runtime, the state remains valid and debug/contracts can still drive the loop.

## Rooms

| Room id | Название | Existing room type/tag | Function | MVP interaction | Risk |
| --- | --- | --- | --- | --- | --- |
| `industry08_briquette_hall` | Брикетный цех | `PRODUCTION` + `industry`, `briquette` | Main line, noise, repair target | Inspect press, repair jam, start tick | Noise attracts monsters if later event hook exists. |
| `industry08_input_store` | Склад сырья | `STORAGE` + `industry_input` | Input containers | Deliver water/paste/packaging | Theft and faction access conflict. |
| `industry08_defect_store` | Склад брака | `STORAGE` + `defect` | Risk loot and moral pressure | Loot defective food, divert batch | Poisoning, cult interest, black-market theft. |
| `industry08_master_room` | Комната мастера | `OFFICE` + `foreman` | Contract start, shift journal | Talk to master, read shift log | Bureaucracy hides real failure. |
| `industry08_quality_office` | Отдел качества | `OFFICE` + `quality` | Moral decision and documents | Approve/reject/forge report | Bad report affects supply and reputation. |
| `industry08_worker_showers` | Душевые рабочих | `HALL`/`STORAGE` + `worker_life` | Rumors and morale | Hear shift complaints, find injury evidence | Can become pure flavor if not tied to morale. |
| `industry08_service_corridor` | Сервисный коридор | `CORRIDOR` + `maintenance_link` | Entry/exit and sabotage route | Enter pocket, optional ambush | Must not trap player behind one-way route. |

Every MVP room must map to a production role: input, line, quality, labor, output or consequence.

## Key NPC

| NPC id | Имя | Faction | Occupation fallback | Роль в MVP | Gameplay state |
| --- | --- | --- | --- | --- | --- |
| `industry08_master_gryaznov` | Мастер Грязнов | CITIZEN or ADMIN fallback | MECHANIC/WORKER | Gives repair/delivery/pressure contracts | Wants plan fulfilled even if batch is bad. |
| `industry08_worker_klava_press` | Клава у пресса | CITIZEN | WORKER | Human face of shift morale/injury | Reacts to food, medicine, threats. |
| `industry08_quality_senkevich` | Инспектор Сенкевич | SCIENTIST/ADMIN fallback | SCIENTIST/DIRECTOR | Quality decision gate | Can approve, reject or blackmail. |
| `industry08_storekeeper_boroda` | Кладовщик Борода | CITIZEN | WORKER/TRADER fallback | Container access and theft suspicion | Controls input/output store access. |
| `industry08_cult_buyer` | Тихий покупатель брака | CULTIST | PILGRIM fallback | Optional divert target | Pays for suspect concentrate, raises cult pressure. |
| `industry08_liquidator_auditor` | Ликвидатор-аудитор | LIQUIDATOR | HUNTER/MECHANIC fallback | Optional guard/raid consequence | Demands filters, clean supply, door kits later. |

NPC tone constraint: промзона is morally dirty, but not cartoon evil. Workers want survival, master wants plan, inspector wants cover, factions want supply.

## Output And Defect Rules

| Output id | Type | Source | Use | Risk |
| --- | --- | --- | --- | --- |
| `supply.food.ration` | abstract supply | approved briquette batch | Lowers food scarcity, fills market/queue/container | Scarcity exploit if uncapped. |
| `item.briquette_ration` | concrete item/fallback food | claim output or contract reward | Visible reward and crate content | Must use existing food id until item catalog is owned. |
| `supply.food.defective` | abstract defect supply | contaminated or rushed batch | Black market/cult/cheap queue route | Poisoning, reputation damage. |
| `item.defective_briquette` | concrete risky item | defect store | Loot, evidence, contract target | Should not flood floor. |
| `note.quality_report_08` | document/note | quality office | Shows defect rate and moral decision | Pure text unless tied to release/hold/divert. |
| `event.industry_batch_ready` | event payload | successful tick | Economy/market/rumor hook | Needs fallback log if event bus absent. |

Concrete output is bounded. MVP crate capacity should be small and deterministic; supply ledger carries bulk meaning.

## Contracts

| Contract id | Issuer | Objective | Success effect | Failure/alternate effect |
| --- | --- | --- | --- | --- |
| `industry08.repair_briquette_press` | Master | Fix jammed press with wrench/parts/labor action | condition up, blockedReason cleared, morale up | line remains blocked, master pressure up |
| `industry08.deliver_packaging` | Storekeeper | Bring paper/packaging or approve fallback packaging | input store filled, next batch spoilage down | wet spoilage or no_inputs persists |
| `industry08.guard_shift` | Worker or liquidator | Keep line safe during short production event | workerMinutes up, sabotageRisk down | injury/fear up, output lower |
| `industry08.quality_release` | Quality inspector | Decide release/hold/divert suspect batch | supply and faction consequence applied | reputation/market/cult path changes |
| `industry08.steal_recipe` | Cult buyer or black market | Steal concentrate composition note | illegal reward, cult/market supply hook | quality locks office, worker trust down |

Contracts convert to normal Quest entries with `contractId`. They must not bypass active quest cap or main plot chain.

## Documents And Notes

| Document id | Name | Function |
| --- | --- | --- |
| `doc_industry08_shift_log` | Журнал смены БК-08 | Shows hunger/injury/failure history and points to repair objective. |
| `doc_industry08_quality_act` | Акт качества партии 08-К | Carries defectRate and release/hold/divert choice. |
| `doc_industry08_recipe_fragment` | Фрагмент рецептуры концентрата | Moral/lore hook and steal target. |
| `doc_industry08_defect_inventory` | Опись склада брака | Explains why defect store contains valuable but unsafe goods. |
| `doc_industry08_liquidator_notice` | Предписание о снабжении фильтрами | Future bridge to filter/rebar lines. |

Documents use existing notes/log systems. No new document UI is required for MVP.

## Items, Containers And Fallbacks

| Object id | Existing fallback | Use | Access |
| --- | --- | --- | --- |
| `industry08_input_crate` | production/storage container | Inputs: water, food/paste, paper | room/faction/locked by storekeeper |
| `industry08_output_crate` | storage/food crate | Approved batch visible output | room/public after contract |
| `industry08_defect_bin` | locked/secret container | Defective goods and evidence | locked/secret; theft consequences |
| `industry08_tool_locker` | iron cabinet | wrench/parts for repair | room/faction |
| `industry08_quality_file_cabinet` | file cabinet/safe | reports, recipe fragment | locked/owner |
| `industry08_worker_soap_box` | low-value container | small morale item/note | public/room |

If containers are absent in a target branch, use room flags with bounded stock counters and emit the same abstract events. Do not spawn piles of floor items.

## Debug Commands

| Command id | Label | Action | Required output |
| --- | --- | --- | --- |
| `debug_industry08_status` | Промзона: статус линии | Prints line, shift, supply, blockedReason, defectRate | line id, minute, condition, morale, output buffer |
| `debug_industry08_tick` | Промзона: тик партии | Runs one explicit production tick | input consumed, output/defect delta, event ids |
| `debug_industry08_fill_inputs` | Промзона: сырье + | Adds bounded test inputs to input store/snapshot | input counts and cap |
| `debug_industry08_break_press` | Промзона: заклинить пресс | Sets `jammed_press` and condition low | blockedReason and repair target |
| `debug_industry08_set_variant` | Промзона: вариант самосбора | Applies classic/meat/wet/electric test modifier | contamination, waterBonus, equipmentBurn |
| `debug_industry08_quality_choice` | Промзона: решение партии | Forces release/hold/divert path | supply delta and faction/log consequence |
| `debug_industry08_dump_blackbox` | Промзона: dump telemetry | Writes ring buffer when implemented | dump path, entry count, last hash |

Debug acceptance: the panel output must be enough to reproduce a bad batch without reading developer console internals.

## DOD Summary

MVP content is done when one industrial pocket exists, one briquette line can be blocked and restarted, one aggregate shift affects output, one quality decision changes supply plus social consequence, two samosbor variants affect defect/failure differently, and debug can inspect and force every branch. Reserved lines, meat plant, full industry floor, raids and weapon mods are not partial success until the core loop works.


# Черный рынок 88: content manifest

Статус: manifest для MVP и ближайшего расширения. Имена и ids являются design targets; реализация должна сверить существующие item ids в `src/data/items.ts` и не добавлять новые предметы, если старые закрывают механику.

## Entry points

| ID | Location | Unlock | Runtime effect | Failure/heat |
| --- | --- | --- | --- | --- |
| `market88.entry.living_password` | hidden room near existing living market/communal route | rumor password or trader intro | opens primary door and sets `access.passwordKnown` | wrong answer adds small heat, no combat |
| `market88.entry.maintenance_hatch` | maintenance/living service hatch | guide debt or maintenance token | bypasses witness zone, starts with higher monster risk | guide debt if player cannot pay |
| `market88.entry.ministry_archive` | later admin/archive pass | forged document or archive favor | unlocks document trader and lower suspicion once | failed check raises ministry suspicion |
| `market88.entry.metro_wagon` | later metro route | token and route contract | enables cross-expansion access to 88 pocket | wrong route can send player to unrelated danger |

MVP requires the first two entries. The ministry and metro entries stay stubbed as contract hooks so future expansions can attach without rewriting market access.

## Traders

| ID | Role | Stock lane | Gate | Mechanical identity |
| --- | --- | --- | --- | --- |
| `market88.trader.mikhail_debt` | black accountant | debts, settlement, ruble exchange | available after first entry | owns debt records; every debt references him or another explicit owner |
| `market88.trader.zlata_silence` | rumor broker | passwords, routes, compromise documents | trust >= 1 or information debt | sells access facts, not combat power |
| `market88.trader.zhoka_knife` | guard quartermaster | ammo, melee, repair kits | heat < raid threshold or protection debt | expensive weapons, limited stock, no buyback exploit |
| `market88.trader.uliana_cash` | cashier/container owner | common goods, hidden stash, raid bribes | default trader | stable MVP trade surface and stock audit |
| `market88.trader.paramon_spore` | future mushroom buyer | mushroom mass, medicine, narcotic goods | requires mushroom expansion goods | cross-expansion sink for production |
| `market88.trader.archive_rat` | future document fixer | passes, stamps, false records | requires archive expansion | adapter for document scarcity |

MVP uses the first four. Future traders must not add new market runtime; they add rows to data and optional stock lanes.

## Goods

| Lane | Example existing items | Scarcity drivers | Rules |
| --- | --- | --- | --- |
| Survival | water, bread, canned, kasha, bandage, pills | samosbor, production shortage, raid | low margin, useful for recovery, cannot bankrupt market |
| Weapons | ammo_9mm, ammo_shells, nails, makarov, pipe, wrench | faction control, liquidator raids | limited stock, high heat for firearms |
| Tools | door_kit, block_kit, flashlight, jackhammer if present | maintenance damage, heatline failures | access/repair utility over raw damage |
| Documents | bulletin, notes, forged pass/stamp if present | ministry control, archive contracts | should unlock routes/contracts, not act as generic loot |
| PSI/Cult | strange_clot, psi items, idol-related goods | meat resonance, cult influence | gated by trust and heat; high risk |
| Expansion inputs | mushroom mass, metro token, filters, medicine lots, factory batches | future expansions | represented as optional ids until those expansions own final data |

Price formula target: `baseValue * scarcityMultiplier * traderMarkup * heatMultiplier * trustDiscount`, with rounding and min/max clamps. Buy and sell prices must differ.

## Debt templates

| ID | Owner | Player receives | Due condition | Consequence |
| --- | --- | --- | --- | --- |
| `market88.debt.goods_front` | trader who fronts item | item now, payment later | game time or next market visit | price penalty and stock lock |
| `market88.debt.ruble_note` | Mikhail Debt | rubles or bribe coverage | due timestamp | debt contract demand |
| `market88.debt.protection` | Zhoka Knife | safe entry during raid/heat | next raid or failed payment | guards refuse protection; heat rises |
| `market88.debt.information` | Zlata Silence | password/route/rumor | player completes unrelated market action | rumor leak or access revoked |
| `market88.debt.faction_marker` | faction-linked trader | faction pass or contraband access | zone ownership check or inspection | faction suspicion and market lock |

Every debt stores `id`, `ownerId`, `createdAt`, `dueAt`, `severity`, `settlement`, `consequenceId`, `resolved`. No anonymous debt. No debt without mechanical consequence.

## Contracts

| ID | Objective | Inputs | Reward | Failure |
| --- | --- | --- | --- | --- |
| `market88.contract.deliver_night_stock` | deliver scarce food/medicine to market container | common survival items or future mushroom goods | trust + stock + rubles | goods lost, heat +1 |
| `market88.contract.hide_courier` | escort or hide one courier NPC until timer/room target | password access | trust + information | courier panic creates local witness event |
| `market88.contract.steal_stamp` | recover stamp/document from office/archive room | stealth or combat route | document access + rubles | ministry suspicion |
| `market88.contract.return_ammo_crate` | fetch limited ammo crate from danger room | weapon risk | weapon stock unlock | guard trader locks firearms |
| `market88.contract.break_sanitary_raid` | sabotage raid trigger or bribe cashier | rubles/document | raid cooldown reset | immediate raid |
| `market88.contract.settle_bad_debt` | settle NPC debt through item/payment/intimidation | active debt | clears player debt or trust | new hostile debtor flag |

MVP implements three: deliver, hide courier, steal stamp. Others are rows for later phases. All contracts convert to existing Quest with `contractId` and `market88` tag.

## Raids and market events

| ID | Trigger | Gameplay result | Cheap implementation |
| --- | --- | --- | --- |
| `market88.raid.liquidator_sweep` | heat threshold or debug | closes weapon trader, spawns/marks guard pressure | one timed market lock, not live patrol simulation |
| `market88.raid.ministry_audit` | forged document failure | document lane unavailable, suspicion log | state flag and dialogue response |
| `market88.raid.cult_collection` | meat resonance demand | PSI lane becomes dangerous/expensive | demand multiplier and one hostile encounter hook |
| `market88.event.samosbor_panic` | quiet/classic samosbor aftermath | survival goods price spike | demand table update |
| `market88.event.electric_shortage` | electric samosbor | batteries/energy cells become currency-like | scarcity modifier |

Raids must damage access, trust, stock or debt state. They should not be loot pinatas.

## Documents and notes

| ID | Surface | Purpose |
| --- | --- | --- |
| `market88.doc.price_list_wet` | note/notice | explains changing prices through moisture, filters, dry goods |
| `market88.doc.debt_receipt` | debt item/log entry | tells player who owns the debt and due condition |
| `market88.doc.black_entry_map` | rare document | unlocks or hints maintenance hatch |
| `market88.doc.sanitary_warning` | wall note | telegraphs ministry/medical raid |
| `market88.doc.no_buyback_rule` | cashier notice | diegetic explanation for anti-exploit spread |
| `market88.doc.false_stamp_memo` | archive hook | future bridge to Raionsovet/archive expansion |

Documents should be short, mechanical and readable. No long lore dump before the market loop works.

## Debug commands

| Command | Required output/action |
| --- | --- |
| `Market88: status` | heat, trust, active debts, raid cooldown, access flags |
| `Market88: prices` | price breakdown for 5 representative goods |
| `Market88: grant password` | sets password entry flag |
| `Market88: add debt` | creates one selected debt template with near due time |
| `Market88: mature debts` | forces overdue processing |
| `Market88: spawn contract` | creates market Quest through existing contract adapter |
| `Market88: force raid` | applies raid state without requiring random trigger |
| `Market88: samosbor demand` | cycles demand modifier for at least two variants |

Debug is part of DOD. If a command cannot fit the existing debug menu, implementation must expose equivalent log-printing helpers in `src/systems/debug.ts`.


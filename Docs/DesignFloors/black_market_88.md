# Design Floor: Черный рынок 88

Status: planning artifact for future full floor. Current implemented content is a hidden Living pocket; README remains source of truth.

Future route id: `black_market_88`. Future anchor: `z=8`. Existing references: `src/gen/living/black_market_88.ts`, `Docs/Expansions/05_black_market_88/`.

## Role

The full Floor 88 turns the hidden debt counter into an authored illegal-economy floor. It remains a market of risks, not a shopping mall. The player trades access, debt, contraband, documents, medicine, ammo, route information and silence.

Primary decisions: buy, steal, pay, owe, protect, betray, smuggle, forge, flee a raid.

## Generation

- Market lanes, guarded debt office, document booth, weapon stall, medicine locker, hidden courier rooms, service hatch.
- At least three entry points: public password door, maintenance hatch, document-only door.
- Containers must have owners/access rules.
- No live buyer simulation; use aggregate scarcity/heat/trust.

## NPCs

Existing hidden-pocket NPCs can graduate into floor anchors:

- `market88_marta_broker`
- `market88_ryzhiy_guard`
- `market88_lena_supplier`
- `market88_nina_informer`
- plus `market88_debt_judge` for full floor route arbitration.

## Quests

- `market88_deliver_night_stock`: deliver scarce goods from Production/Living.
- `market88_hide_courier`: hide/escort courier through Manhattan Crossroads.
- `market88_steal_stamp`: steal Ministry/Raionsovet stamp.
- `market88_return_ammo_crate`: recover ammo from Production/Service.
- `market88_settle_bad_debt`: settle or weaponize someone else's debt.

## Systems

Use the expansion contract:

```txt
heat, trust, scarcity lanes, debt templates, raid cooldown, stock locks
```

All updates happen on interaction, quest completion, scarcity event, raid or slow director beat.

## Samosbor

Samosbor changes prices and trust. Classic raises ammo/medicine demand; wet raises filters/dry food; electric makes batteries valuable; meat opens cult-risk trades; quiet causes panic demand.

## Cross-Floor Hooks

- Floor 69 shares debt/blackmail.
- Production supplies market lanes.
- Ministry/Raionsovet create license and raid pressure.
- Metro/Dark Metro provide route risk.
- Living receives scarcity consequences.

## DoD

- Full floor keeps hidden pocket state compatible or migratable.
- One purchase, one contract, one debt and one raid/raid warning are playable.
- Anti-exploit: limited stock, bounded rewards, debt heat.


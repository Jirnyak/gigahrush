# Rework Floor 06: Банковский этаж

Route id: `bank_floor`. Z: `+26`. Base floor: `MINISTRY`. Owned source: `src/gen/design_floors/bank_floor.ts`.

## Problem

The bank already has good mechanical seeds: cash hall, teller line, deposit row, credit window, debtor queue, vault and service bypass. It still needs a stronger population field so it feels like a working financial pressure-cooker, not a small quest room.

## Rework Target

Make the bank a Ministry-like floor with bank-specific social density. There should be crowds in queues, guards around value, debtors near credit, and monsters where money/paper turns wrong.

Population targets:

- NPC field: `800..1800`;
- NPC mix: citizens/debtors, bank clerks, liquidator guards, a few wild debt collectors;
- monsters: `300..900`;
- level/loot: high-value but locked/owned; vault theft must carry risk.

## Gameplay Identity

The player should feel money as a rule system: wait, bribe, deposit, borrow, repay, forge debt paper, steal, enter service bypass, expose collector abuse or fight through a vault alarm. This is not a global banking ledger unless an owner explicitly implements one; existing money/items/containers/events are enough.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=1400`, `monsterTarget=650`, admin placement with bank-specific faction and occupation mix. Broad customers, guards and debtors are A-Life templates; only tellers, fixers, debt bosses and quest traders should be authored identities.

Tune bank density through queue rooms, vault approaches, debt offices, guard posts and back-office storage. Do not create a second bank crowd system in the floor generator.

## Implementation Notes

- Tune bank crowd placement: cash hall and debtor queue dense, vault guarded, service bypass sparse and risky.
- Keep container ownership/locks meaningful; do not compensate density by making vault loot free.
- Tune bank monster placement toward vault, overdue archive, fake deposit rows and black bypass.
- If new systemic hooks are needed, use compact banking events rather than DOM/UI-heavy systems.

## Samosbor

Samosbor should freeze teller lines, lock vault routes, panic debtors, open a theft window or spawn debt-paper monsters. Aftermath can alter local debt/permit rumors without adding a refill loop.

## Verification

- Bank has a clear NPC crowd and guarded value path.
- Vault/service bypass choices remain playable and risky.
- Monster pressure exists but does not turn the bank into Hell.
- Run `npm run check`.

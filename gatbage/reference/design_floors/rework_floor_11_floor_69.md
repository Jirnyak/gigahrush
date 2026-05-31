# Rework Floor 11: Этаж 69

Route id: `floor_69`. Z: `-4`. Base floor: `MAINTENANCE`. Owned source: `src/gen/design_floors/floor_69.ts`.

## Problem

This floor already has a route identity and an ambient adult population seed. It sits close to zero, so it should be active and social, not a small side scene. The rework should make its existing crowd logic match the general population-field contract and avoid special-case density code drifting away from the rest of the game.

## Rework Target

Make Floor 69 a dense, adult-only social/debt/refuge route with real ambient movement, guards and witnesses. Monster pressure should exist as route risk and samosbor residue, not as the main identity.

Population targets:

- NPC field: `1700..3200`;
- NPC mix: adult citizens, staff, debtors, guards/liquidators, doctors/accountants;
- monsters: `200..700`;
- level/loot: low-to-medium social floor, high-value blackmail/medical/debt containers are owned or locked.

## Gameplay Identity

The player should choose witness protection, debt exploitation, clinic refuge, blackmail theft, guard bribery, service-route access or exposure to higher bureaucracy. Keep the current non-graphic adult-only constraint.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=2200`, `monsterTarget=380`, social placement. During implementation, reconcile or remove any duplicate broad local population helper such as `spawnFloor69ReachablePopulation()` if it still overlaps the generic field.

Broad adult crowd members are A-Life templates. Keep only authored adult NPCs, clinic witnesses, debt holders and quest actors in local code, and give them stable identities when they can be killed or remembered.

## Implementation Notes

- Fold the existing ambient population into the shared placement-field pattern where possible.
- Keep female-majority ambient variants if they remain a deliberate floor identity, but avoid making sprite distribution the only design feature.
- Use route rooms, clinic, debt office, staff corridor and checkpoint as room/zone signals.
- Broad NPCs should be ordinary A-Life candidates; named side-quest actors keep stable ids.

## Samosbor

Samosbor should threaten refuge and witness routes: guard raids, debt ledgers exposed, clinic overloaded, quiet rooms sealed or opened. No refill of dead witnesses or replaced guards.

## Verification

- The floor remains adult-only, non-graphic and route-relevant.
- Population uses the same field principles as other reworks.
- Debt/refuge/blackmail decisions remain reachable.
- Run `npm run check`.

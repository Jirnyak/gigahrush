# Rework Floor 12: Черный рынок 88

Route id: `black_market_88`. Z: `-10`. Base floor: `LIVING`. Owned source: `src/gen/design_floors/black_market_88.ts`.

## Problem

The black market should be busy by premise: traders, guards, debtors, couriers, thieves, buyers and faction informants. Near `abs(z)=10`, the route curve still supports heavy NPC habitation. If the market is sparse, the economy fantasy collapses.

## Rework Target

Make Market 88 a dense but dangerous trade floor. People dominate the bazaar, monsters dominate closed service guts and abandoned stock zones.

Population targets:

- NPC field: `1600..3000`;
- NPC mix: citizens/traders, wild gangs, liquidators, smugglers, a few scientists/fixers;
- monsters: `300..900`;
- level/loot: medium; contraband is valuable but owned, guarded or reputation-linked.

## Gameplay Identity

The player should decide whether to buy, fence, steal, forge, protect a caravan, betray a supplier, pay debt, use black route papers or fight a gang. This floor should tie naturally to bank debt, Райсовет documents, production goods and metro routes.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=2200`, `monsterTarget=700`, social NPC placement and industrial monster placement. Bazaar crowds are generic templates; stall owners, fixers, debt bosses and quest traders are stable authored NPCs.

Use stall rows, clinics, backrooms, storage, guard posts and service alleys as room/zone signals. Do not solve the market by pushing a hand-built crowd into one bazaar room.

## Implementation Notes

- Tune crowd fields for stalls, debt rows, contraband lanes and back rooms.
- Tune monster fields toward storage tunnels, closed market guts and contaminated stock.
- Use existing economy/trade/container/event systems; do not build a separate market UI unless a specific owner takes it.
- Publish compact events for theft, debt settlement, supplier betrayal and market scarcity.

## Samosbor

Samosbor should trigger shutters, panic buying, gang protection rackets, spoiled stock and monster leakage from closed stalls. Aftermath can change local prices through existing economy hooks, not through an unbounded loop.

## Verification

- Market has a visible crowd and faction mix.
- At least three trade/crime decisions are playable.
- Valuable containers remain owned/locked.
- Run `npm run check`.

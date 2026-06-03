# Korovan 3: active-floor arrivals and departures

> Parallel Agent 3 plan.
>
> Owns visible materialization of completed journeys on the player's current floor and visible departures of live NPCs from the current floor. This packet turns cold migration into something the player can see without making NPCs pop out of empty rooms.

## Purpose

Implement the active-floor boundary:

- completed journey to active `floorKey` becomes a live NPC near a route anchor;
- live ordinary NPCs can decide to leave, walk to a lift, fold into A-Life, then become off-floor journey/record state.
- loading a floor uses the prefilled `floorIndex[floorKey]` as the list of possible people; generator ambient NPCs are placement templates only.

This packet must not implement destination profile weights or caravan lane semantics.

## Files

Primary:

- `src/systems/alife_migration.ts`

Possible helper tests:

- `tests/alife-migration-active.test.ts`

Avoid editing:

- `src/systems/alife.ts` except if Agent 1 asks for a tiny helper adjustment.
- `src/systems/caravans.ts`
- `src/systems/scripted_arrivals.ts`
- `src/systems/samosbor_director.ts`
- `main.ts` until orchestrator.

## Public functions

Add functions that the orchestrator and Agent 5 can call:

```ts
export function processAlifePendingArrivals(
  state: GameState,
  world: World,
  entities: Entity[],
  nextId: { v: number },
  opts?: { maxArrivals?: number; activeFloorKey?: string },
): number

export function enqueueAlifeArrival(
  state: GameState,
  arrival: AlifeArrival,
): boolean

export function startActiveAlifeDeparture(
  state: GameState,
  world: World,
  entity: Entity,
  toFloorKey: string,
  intentId: string,
  reason: AlifeMigrationReason,
): boolean

export function updateActiveAlifeDepartures(
  state: GameState,
  world: World,
  entities: Entity[],
  dt: number,
): number
```

If `alife_migration.ts` does not exist yet in the branch, add only a small module section and let the orchestrator merge with Agent 2.

## Anchor selection

Implement:

```ts
function findAlifeArrivalAnchor(world: World, preferredX?: number, preferredY?: number): { x: number; y: number; angle?: number } | null
```

Priority:

1. passable cells adjacent to `Cell.LIFT`;
2. passable cells around `Feature.LIFT_BUTTON`;
3. route mirror/known lift anchor if source data exposes it;
4. current floor spawn fallback only if no lift/lift-button anchor exists.

Rules:

- Use `world.idx`, `world.wrap`, `world.dist2`.
- Bound search radius, for example 8, 16, 32, then stop.
- Do not scan the whole 1024x1024 map every arrival. If a bounded local search fails, use one bounded sampled scan with a hard cap, or defer arrival.
- Prefer floor/water passable cells accepted by existing movement helper.
- Return center coordinates `x + 0.5`, `y + 0.5`.

Tests should build a tiny room with lift and button cells, like `caravans.test.ts`.

## Pending arrival processing

`processAlifePendingArrivals()`:

- get mobility state;
- resolve `activeFloorKey` with `currentAlifeFloorKey(state)`;
- process at most `maxArrivals`, default 2;
- skip arrivals for other floor keys;
- if active floor disallows NPCs, delay and increment tries;
- if actor soft limit has no NPC slot, delay;
- find anchor;
- call Agent 1 `materializeAlifeArrival()`;
- publish a local/public event:
  - `tags`: `alife_migration`, `arrival`, reason, intent id;
  - include `fromFloorKey`, `floorKey`, `alifeId`;
- remove successful arrival from queue;
- keep failed arrivals with `tries + 1`;
- drop or cancel only after a capped retry count, and publish a compact failure event. Do not replace the person.

Do not materialize plot-dead or A-Life-dead records.

Do not ask the active floor generator for a new NPC identity. The arriving `alifeId` must already exist in the prefilled population or in an explicit reserved identity created at run start.

## Active departure selection

Selection rules for `startActiveAlifeDeparture()`:

- entity is alive `EntityType.NPC`;
- has `alifeId`;
- not player and not `persistentNpcId === 'player'`;
- no `plotNpcId`;
- no active quest target/giver role:
  - `questId === undefined || questId === -1`;
  - avoid `canGiveQuest` if it currently offers an authored/procedural quest;
- not currently in NPC menu target if that state is available cleanly;
- not in immediate combat unless `reason === 'samosbor' || reason === 'refugee'`;
- current floor allows departure and has route anchors.

Do not make a cold tick vanish active NPCs directly.
Do not create a departure record for a non-persistent ordinary NPC; first decide whether it is a valid reserved/event identity or leave it as local event pressure.

## Departure movement

Use existing AI fields, not a new behavior system:

- set `entity.isTraveler = true`;
- set `ai.goal = AIGoal.GOTO`;
- set target to nearest route anchor;
- store compact departure state in mobility state:

```ts
interface ActiveAlifeDeparture {
  entityId: number;
  alifeId: number;
  toFloorKey: string;
  intentId: string;
  reason: AlifeMigrationReason;
  startedAt: number;
  anchorX: number;
  anchorY: number;
}
```

If adding this field to mobility state, cap it, for example 32.

`updateActiveAlifeDepartures()`:

- process bounded departures, max 8 per tick;
- if entity missing/dead, cancel or let death foldback handle it;
- if entity is within lift radius, call `captureAlifeFloorState()` or a smaller Agent 1 capture helper, then create/complete journey:
  - if using journeys: add journey from active floor to target;
  - if immediate direct move: call `moveAlifeNpcRecord()` to target;
- remove entity from live `entities`;
- publish local event;
- remove departure state.

If player leaves before the departure completes, normal floor capture keeps the NPC on source floor. Do not pretend it left unless the departure reached the anchor.

## Samosbor

- During active samosbor, do not process normal arrivals.
- Refugee/panic departures may be started only by explicit samosbor migration logic, not by generic routine.
- If samosbor rebuilds the active floor, pending arrivals must re-run anchor search after the rebuild.
- Do not use samosbor to refill a cleared floor.

## Tests

Required:

- floor load materialization consumes prefilled bucket records; extra generator slots stay empty when the bucket is smaller;
- pending arrival to active floor materializes one NPC near `Cell.LIFT`;
- pending arrival uses same `alifeId` and `persistentNpcId`;
- pending arrival does not spawn on solid cells;
- pending arrival is delayed when actor cap fails or no anchor exists;
- pending arrival to non-active floor stays queued or completes off-floor through Agent 2, not active materialization;
- active departure assigns `AIGoal.GOTO` to a lift anchor;
- departure does not start for player, plot NPC, quest NPC or dead NPC;
- departure reaching lift removes live entity and moves record to target key;
- departure not reaching lift before floor capture does not teleport the record.

Use small handmade `World` fixtures. Avoid full generation.

## Done

This packet is done when arrivals and departures are player-believable:

- people arrive at lifts;
- people leave by walking to lifts;
- loaded-floor NPCs come from prefilled A-Life buckets, not from floor-local identity creation;
- no ordinary active-floor NPC disappears because an off-floor tick moved its record;
- retries are bounded;
- no replacement actor is created when materialization fails.

# Korovan 0: parallel implementation index

> Оркестрационный индекс для пяти параллельных GPT-5 агентов и финального интегратора.
>
> Это план разработки, не shipped behavior и не README-обещание. Базовый дизайн описан в `korovan.md`; этот пакет разбивает полную реализацию холодного A-Life, межэтажных миграций и караванов на независимые рабочие дорожки.

## Source context

Перед работой каждый агент обязан перечитать:

- `README.md`: shipped behavior, A-Life/floor/caravan facts.
- `architecture.md`: layer ownership, A-Life integration contract, floor memory.
- `alife.md`: persistent identity, no refill, event actor policy.
- `floors.md`: route keys, single active floor, NPC-forbidden floors.
- `economics.md`: caravan/economy/resource pressure and no economy refill.
- `save.md`: current save shape, sanitization, version bump policy.
- `tests.md`: cheap deterministic tests and generation gate split.
- `optimization.md`: bounded cadence, no full hidden simulation.
- `samosbor.md`: samosbor/A-Life/floor memory boundary.
- `korovan.md`: master plan and spawn-vs-migration rule.

Source files to inspect before editing:

- `src/systems/alife.ts`
- `src/systems/caravans.ts`
- `src/data/caravans.ts`
- `src/systems/scripted_arrivals.ts`
- `src/systems/samosbor_director.ts`
- `src/data/samosbor_director.ts`
- `src/systems/faction_events.ts`
- `src/systems/procedural_floors.ts`
- `src/data/design_floors.ts`
- `src/data/procedural_floors.ts`
- `src/systems/save_runtime.ts`
- `src/systems/save_payload.ts`
- `src/systems/events.ts`
- existing tests: `tests/alife.test.ts`, `tests/procedural-alife.test.ts`, `tests/caravans.test.ts`, `tests/save-runtime.test.ts`, `tests/events-economy.test.ts`.

## Global rules

- No ordinary NPC refill.
- Run start owns population truth: after title setup/seed selection and before first floor generation, one universal population plan assigns the fixed `100_000` identities to route `floorKey` buckets.
- Floor generation never decides who exists. It builds geometry and placement slots; A-Life materializes already assigned records.
- Story/authored NPCs that can persist belong inside the same `100_000` population as reserved identities, not in a separate hidden population.
- No hidden off-floor AI, pathfinding, combat, needs, room scans or floor-memory world scans.
- No new `FloorLevel` for 69, 88, НИИ, bank, lower stops, caravan lanes or route stops.
- A natural human arrival is migration, not creation.
- True new NPC creation is allowed only for istotit, NET-terminal/map-editor tooling, debug/stress paths and service reconstruction of the player body.
- Every persistent ordinary person is owned by A-Life: `alifeId`, `persistentNpcId`, `floorKey`, death and foldback.
- Event actors that survive beyond their scene must reserve or receive persistent identity.
- Active-floor arrivals appear through believable route anchors: lift cells, lift buttons or route entrances.
- Active-floor departures must be visible: NPC goes to a lift/exit before being removed.
- Save state is compact: ids, route keys, journey facts, caps. No live entity arrays.
- If persistent journey state is added, bump `SAVE_SHAPE_VERSION` and reject stale saves. Do not add legacy migration scaffolding.

## Shared target architecture

The final shape should be:

```txt
src/data/alife_population_plan.ts
  universal run-start floor population plan, route buckets, story/reserved identities

src/data/alife_migration.ts
  route groups, destination selectors, intent profiles, reason metadata, validation

src/systems/alife.ts
  run-start prefill from population plan, public record movement/reservation/materialization helpers

src/systems/alife_migration.ts
  cold mobility state, cadence, journey queue, pending arrivals, active departures

src/systems/caravans.ts
  caravan member persistent ids and lane-driven A-Life movement

src/systems/scripted_arrivals.ts
  authored arrivals reclassified as migrations/reserved identities

src/systems/samosbor_director.ts
  extra patrols reclassified as migrated faction/samosbor response

src/systems/save_runtime.ts / save_payload.ts
  only if persistent mobility state is included

tests/
  focused unit fixtures for movement, profiles, cold tick, arrival anchors, caravans, save caps
```

`main.ts` should receive only one narrow generic hook after systems are ready, for example a call near existing caravan/faction cadence. No route-specific logic belongs there.

## Work packets

| Packet | Agent | Primary file | Role | Depends on |
| --- | --- | --- | --- | --- |
| `korovan_1.md` | Agent 1 | `src/systems/alife.ts` | A-Life run-start prefill consumer, movement API, snapshots, reservation, arrival materialization primitive | Agent 2 population-plan shape may be stubbed |
| `korovan_2.md` | Agent 2 | `src/data/alife_population_plan.ts`, `src/data/alife_migration.ts`, `src/systems/alife_migration.ts` | universal population plan data, migration data profiles, mobility state, cold batch, save serializer plan | Agent 1 API signatures |
| `korovan_3.md` | Agent 3 | `src/systems/alife_migration.ts` | active-floor arrivals/departures near lifts, pending arrivals | Agent 1 API, Agent 2 state shape |
| `korovan_4.md` | Agent 4 | `src/systems/caravans.ts`, `src/data/caravans.ts` | caravans carry persistent identities and route-key movement | Agent 1 API, Agent 2 profile ids |
| `korovan_5.md` | Agent 5 | scripted/event systems | normalize existing spawns into migrations or allowed exceptions | Agent 1 API, Agent 3 arrival helper |
| `korovan_6.md` | Orchestrator | integration | merge branches, resolve save shape, main hook, final validation | all packets |

The five implementation agents may work in parallel if they keep to file ownership. If an agent needs an API from another packet, code against the declared signature and leave the final import/compile reconciliation to the orchestrator. Do not duplicate helpers across packets just to make a local branch compile.

## Shared public types

All agents should converge on these names unless source inspection proves a better local pattern:

```ts
interface AlifePopulationPlan {
  version: 1;
  total: 100000;
  buckets: AlifePopulationBucket[];
  reserved: AlifeReservedIdentitySpec[];
}

interface AlifePopulationBucket {
  floorKey: string;
  baseFloor: FloorLevel;
  targetCount: number;
  populationProfileId: string;
  tags: string[];
}

interface AlifeReservedIdentitySpec {
  id: string;
  kind: 'plot' | 'authored' | 'event_reserved';
  floorKey: string;
  plotNpcId?: string;
  tags: string[];
}

type AlifeMigrationReason =
  | 'routine'
  | 'market'
  | 'work'
  | 'rest'
  | 'research'
  | 'caravan'
  | 'faction'
  | 'samosbor'
  | 'quest'
  | 'refugee';

interface AlifeJourney {
  id: string;
  alifeId: number;
  fromFloorKey: string;
  toFloorKey: string;
  intentId: string;
  reason: AlifeMigrationReason;
  startedAt: number;
  etaAt: number;
  risk: 1 | 2 | 3 | 4 | 5;
  laneId?: string;
  sourceEventId?: number;
  status: 'moving' | 'arrived' | 'lost' | 'cancelled';
}

interface AlifeArrival {
  alifeId: number;
  floorKey: string;
  reason: AlifeMigrationReason;
  intentId: string;
  etaAt: number;
  tries: number;
  fromFloorKey?: string;
  laneId?: string;
}
```

Caps for the final implementation:

- `journeys`: 512.
- `pendingArrivals`: 256.
- cold records processed per tick: 64 by default, no more than 256.
- completed active-floor arrivals per tick: 1-4.
- active-floor departure candidates per tick: 1-2.
- public migration events per cold tick: 1-3 aggregate events.
- small caravan persistent members per active run: existing `template.memberCount`, never a population refill.

## Merge order

1. Agent 2 population plan data can land first if it is data-only; otherwise Agent 1 may use a local stub and the orchestrator reconciles.
2. Agent 1: merge run-start prefill consumer, A-Life API and tests.
3. Agent 2: merge migration profiles and cold state behind no-op or force-only tests.
4. Agent 3: merge active arrival/departure using Agent 1 helpers.
5. Agent 4: merge caravan identity movement.
6. Agent 5: merge spawn normalization.
7. Orchestrator: connect runtime hook, save shape, debug summary, final tests and docs.

If two branches edit `src/systems/alife_migration.ts`, the orchestrator keeps Agent 2's state/data ownership and Agent 3's active-floor functions as separate sections in the same file.

## Validation ladder

Per packet:

- docs-only changes: `git diff --check`.
- A-Life/data/profile tests: `npm run typecheck` and focused `node --import tsx --test tests/<file>.test.ts` if available.
- system integration packets: `npm run check:readonly`.
- final orchestrator: `npm run check`; add `npm run check:browser` only if render/input/HUD changed.

Final acceptance:

- ordinary killed A-Life NPCs do not reappear;
- all `100_000` records are assigned to floor buckets by a universal prefill plan before first floor generation;
- story/authored persistent NPCs are reserved inside the same fixed population;
- no normal gameplay path creates new ordinary people except istotit/tooling/debug exceptions;
- one off-floor NPC can migrate to `design:black_market_88`, `design:floor_69`, `story:ministry` or a lab route and persist through save;
- active-floor arrivals spawn near lifts with the same persistent identity;
- active-floor departures walk to a lift before being removed;
- a small caravan can carry `memberAlifeIds`;
- scripted Hell arrivals and samosbor liquidator patrols are represented as migrations/reserved identities;
- no off-floor `World`, room list or entity array is scanned by the cold tick.

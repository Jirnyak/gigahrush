# architecture_fix_1: Agent 1 - единая микро-система комнат

## Mission

Сделать `Room` / `RoomType` чистым микро-слоем жизненных affordances. Комната должна отвечать "что здесь можно делать", но не "чья это территория" и не "какая это тема этажа".

Этот агент не внедряет новую фракционную политику и не переписывает A-Life. Он создает или выравнивает маленькую универсальную основу, которую потом смогут читать AI, генерация, interactives, контейнеры и тесты.

## Intake

Обязательно прочитать:

- `README.md`
- `architecture.md`, раздел `Room, Territory And Floor Theme Hierarchy`
- `interactive.md`
- `ai.md`, разделы `Routine Target Model`, `NPC Utility Intents`, `Work Without Synchronized Streams`
- `src/core/types.ts`
- `src/data/rooms.ts`
- `src/systems/ai/npc_utility.ts`
- `src/systems/ai/npc_fsm.ts`
- `src/systems/ai/npc_emergency.ts`
- `src/gen/floor_object_placement.ts`
- `src/data/floor_object_placement.ts`

## Current baseline

Сейчас `RoomType` уже несет смысл:

- `LIVING`: sleep/hide/home
- `KITCHEN`: eat/drink
- `BATHROOM`: toilet/water relief
- `PRODUCTION`: work
- `OFFICE`: paperwork/work, ministry sleep fallback
- `MEDICAL`: heal
- `STORAGE`: loot/supplies
- `COMMON`, `SMOKING`, `HQ`: social, patrol, shelter/faction spaces

Но эти значения размазаны по коду: `npc_utility`, `npc_fsm`, `npc_emergency`, placement profiles, item spawn rooms and tests. Нужен один небольшой слой, который позволит агентам не дублировать смысл комнат.

## Implementation plan

### Step 1 - audit room semantics

Собрать таблицу фактического использования `RoomType`:

```bash
rg -n "RoomType\\." src/data src/gen src/systems tests
```

Разделить применения:

- definition/data weights, которые можно оставить декларативными;
- AI routine decisions, которые должны читать общий helper;
- emergency/shelter scoring;
- item/monster spawn affinities, которые являются контентными data weights;
- tests, которые закрепляют конкретные floor facts.

Не менять поведение на этом шаге.

### Step 2 - add a room affordance registry

Предпочтительный новый файл:

```txt
src/data/room_affordances.ts
```

Минимальный shape:

```ts
export type RoomAffordanceId =
  | 'sleep'
  | 'hide'
  | 'eat'
  | 'drink'
  | 'toilet'
  | 'work'
  | 'heal'
  | 'store'
  | 'social'
  | 'patrol'
  | 'shelter';

export interface RoomAffordanceDef {
  roomType: RoomType;
  affordances: Partial<Record<RoomAffordanceId, number>>;
  expectedFeatures?: readonly Feature[];
  tags: readonly string[];
}
```

Helpers:

```ts
roomAffordanceWeight(type, affordance)
roomSupports(type, affordance)
roomAffordanceTags(type)
roomExpectedFeatures(type)
```

Keep it data-only. No world mutation, no NPC references, no territory logic.

### Step 3 - wire no-behavior-change helpers

Replace duplicated direct room meaning only where it is safe and local:

- `npcUtilityRoomTypeWeightForIntent()` can delegate to the registry for base room affordance weights, while preserving occupation-specific overrides.
- `npc_fsm.applyRoomRestoration()` can read `KITCHEN`, `BATHROOM`, `MEDICAL`, `sleep` logic from a local helper or registry values, but do not change numeric restoration rates unless explicitly measured.
- `npc_emergency` can use registry shelter/social/hide tags for scoring, while preserving current faction/role behavior.

Do not touch territory checks in this agent except to preserve imports. Territory belongs to Agent 2 and Agent 4.

### Step 4 - tests

Add focused tests, preferably:

```txt
tests/room-affordances.test.ts
```

Test pure data first:

- every `RoomType` has a registry row;
- kitchens support `eat` and `drink`;
- bathrooms support `toilet` and `drink`;
- living rooms support `sleep`, `hide`, `shelter`;
- production/offices support `work`;
- medical supports `heal`;
- storage supports `store`;
- common/smoking/HQ support `social` with HQ also supporting `patrol`/`shelter`.

Optional cheap system test with a handmade `World` only if needed. Do not generate all floors just to test the registry.

### Step 5 - docs

If behavior is unchanged, do not update README. If a shipped fact changes, update `README.md` narrowly. Otherwise, mention the new module in `architecture.md` only if it becomes the official API.

## File boundaries

Green:

- new `src/data/room_affordances.ts`
- new `tests/room-affordances.test.ts`

Yellow, edit narrowly:

- `src/systems/ai/npc_utility.ts`
- `src/systems/ai/npc_fsm.ts`
- `src/systems/ai/npc_emergency.ts`
- `architecture.md` if the API becomes official

Avoid:

- `src/core/types.ts` unless a truly missing primitive exists
- `src/main.ts`
- `src/render/*`
- `src/systems/territory.ts`

## Validation

Minimum after pure data/test changes:

```bash
npm run typecheck
npm run test:unit
```

If AI files change:

```bash
npm run check
```

## Done when

- Room affordance meaning is readable in one registry/helper.
- Existing AI behavior remains equivalent unless an intentional difference is documented.
- Tests protect the room semantics without broad generation cost.
- No code starts using room type as faction ownership.


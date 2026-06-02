# architecture_fix_4: Agent 4 - NPC AI/A-Life routine integration

## Mission

Make live NPC routine behavior consume the hierarchy cleanly:

```txt
need/role/intent -> room affordance -> friendly territory -> bounded target/path
```

The NPC should go to toilets, kitchens, work rooms, bedrooms, shelters and social rooms for real reasons, but routine life should prefer territory owned by the NPC's faction or explicitly allied territory. Trespass must be a visible exception: travel, raid/capture, quest, caravan, samosbor emergency, monster pressure, hack backlash or authored scene.

## Intake

Обязательно прочитать:

- `README.md`
- `architecture.md`
- `ai.md`
- `alife.md`
- `factions.md`
- `samosbor.md`
- `src/systems/ai/npc_utility.ts`
- `src/systems/ai/npc_fsm.ts`
- `src/systems/ai/npc_emergency.ts`
- `src/systems/ai/pathfinding.ts`
- `src/systems/territory.ts`
- `src/systems/alife.ts`
- `tests/ai-pathfinding.test.ts`
- `tests/needs.test.ts`
- `tests/territory.test.ts`

## Current baseline

Good current behavior already exists:

- `npc_utility.ts` scores core intents: safety, combat, flee, toilet, drink, eat, sleep, work, heal, social, patrol, wander.
- `npc_fsm.ts` has actor-local rethink timers and local room/territory scoring.
- `gotoOwnedRoomOfTypes()` prefers rooms whose `territoryRoomOwner()` is friendly.
- patrol avoids hostile cells for early attempts.
- `npc_emergency.ts` scores shelters and reads territory owner.
- A-Life owns identity and no ordinary refill.

Known risk:

- room semantics are still partially hardcoded in AI files;
- routine anchors are transient or `assignedRoomId`, not a fully persistent home/work contract;
- direct room type arrays can drift from future room affordance rules;
- emergency exceptions must not become a backdoor for routine use of enemy rooms.

## Implementation plan

### Step 1 - add cheap behavioral tests first

Use handmade `World` fixtures, not full floor generation.

Test cases:

- citizen with high food/water pressure prefers a citizen kitchen over an enemy kitchen when both reachable;
- citizen with toilet pressure can use a friendly bathroom and avoids hostile bathroom for routine target if an alternative exists;
- worker uses assigned work room when it supports work and is friendly;
- traveler can wander/trespass more freely than ordinary worker;
- samosbor active can override routine territory preference for shelter, but the decision remains bounded and explicit;
- hostile territory gives local utility penalty for work/social/wander but not a global AI freeze.

Possible files:

```txt
tests/npc-room-territory-routine.test.ts
tests/npc-emergency-territory.test.ts
```

### Step 2 - consume room affordance API when available

If Agent 1 has landed `room_affordances.ts`, replace duplicated room-type intent checks with that helper. If not, add local wrapper functions inside AI files and let the orchestrator fold them into Agent 1's API later.

Do not change numeric behavior broadly in the first pass. Preserve current rates and hysteresis unless the new tests require a correction.

### Step 3 - make routine target selection explicit

For ordinary NPC routine target selection:

- target room must support the intent;
- friendly territory is preferred and can be required for work/social/patrol/owned-room targets;
- fallback to non-owned room only for survival needs when no friendly room is reachable, and mark it as trespass/emergency in transient AI state or debug label if practical;
- hunters/travelers/pilgrims/quest actors can have explicit relaxed rules.

Do not make this a full planner. Keep current bounded scan caps and path helper style.

### Step 4 - routine anchors and A-Life boundary

Do not add persistent fields casually. First use current fields:

- `assignedRoomId`
- family/home room from existing helpers
- deterministic identity seed through `npcUtilityIdentityFromEntity()`
- occupation/faction role

If a future implementation needs persistent `homeRoomId`, `workRoomId`, `routineSeed` or traits in A-Life records:

- add them through `systems/alife.ts` owning APIs;
- cap/sanitize them;
- bump `SAVE_SHAPE_VERSION` if current shape compatibility breaks;
- add save tests.

For this pass, prefer transient materialization-time anchors over save-shape changes unless the task explicitly requires persistence.

### Step 5 - preserve performance

Maintain:

- actor-local utility rethink cadence;
- room scan caps;
- entity-index radius caps;
- cached path/flow field patterns;
- no off-floor AI;
- no full `world.rooms` scan per frame without timer/cap.

If adding a target cache, key it by `World` and relevant dirty versions; do not serialize it.

## File boundaries

Green:

- new focused AI routine tests

Yellow:

- `src/systems/ai/npc_utility.ts`
- `src/systems/ai/npc_fsm.ts`
- `src/systems/ai/npc_emergency.ts`
- `src/systems/ai/pathfinding.ts`

Red, avoid unless essential:

- `src/systems/alife.ts`
- `src/systems/save_runtime.ts`
- `src/main.ts`

Avoid:

- generator-wide edits
- render/UI changes
- new persistent fields without save plan
- creating/replacing NPC identities from AI

## Validation

AI source changes require:

```bash
npm run check
```

If persistent A-Life/save fields are touched:

```bash
npm run check
npm run test:generation
```

Browser gate only if HUD/render/input behavior changes:

```bash
npm run check:browser
```

## Done when

- AI routine target selection clearly reads room function and territory.
- Friendly territory is a consistent routine preference/requirement with explicit exceptions.
- The player can still see local life: toilets, kitchens, work rooms, sleep/shelter, social rooms.
- No ordinary refill, off-floor need simulation or per-frame full-world scan was added.


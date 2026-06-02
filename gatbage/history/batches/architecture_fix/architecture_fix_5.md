# architecture_fix_5: Agent 5 - cross-system consumers, events, UI/debug and audit

## Mission

Ensure all non-AI consumers use the same hierarchy:

```txt
room function for affordance
cell/room territory for ownership and consequences
floor theme for starting package and authored context
```

This agent audits and cleans consumers: economy, quests, containers, production, samosbor, interactions, events, context, UI/debug and docs. It should not create new AI behavior and should not rewrite floor generation.

## Intake

Обязательно прочитать:

- `README.md`
- `architecture.md`
- `factions.md`
- `interactive.md`
- `economics.md`
- `quests.md`
- `samosbor.md`
- `save.md`
- `problems.md`
- `tests.md`
- `src/systems/containers.ts`
- `src/systems/production.ts`
- `src/systems/quests.ts`
- `src/systems/faction_events.ts`
- `src/systems/context.ts`
- `src/systems/wrong_door.ts`
- `src/systems/samosbor.ts`
- `src/systems/interactive.ts`
- `src/render/factions_ui.ts`
- `src/render/hud.ts`
- `scripts/content-audit.mjs`

## Current baseline

Good shipped integrations:

- containers and production already read `territoryRoomOwner()` in places;
- faction events use `territoryOwnerAt()` in current paths;
- context and wrong-door systems have territory imports;
- interactive layer separates visual primitives from gameplay actions;
- `problems.md` already removed/forbids many map-only private overlays.

Risks:

- remaining direct `zone.faction` reads can treat aggregate sector metadata as ownership;
- direct `factionControl` writes outside territory helpers can drift from sync/event rules;
- event payloads can carry internal labels instead of compact ids;
- docs disagree on save shape version;
- UI can blur "sector" and "owner";
- static audit may not protect the new architecture.

## Implementation plan

### Step 1 - consumer audit

Run:

```bash
rg -n "zone\\.faction|world\\.factionControl|factionControl\\[" src/systems src/render scripts tests
rg -n "territoryOwnerAt|territoryRoomOwner|territoryFactionAt|currentTerritoryZoneId" src/systems src/render tests
```

For each runtime consumer, answer:

- Is it asking "who owns this exact place"?
- Is it asking for a UI/debug sector aggregate?
- Is it writing territory as a bounded gameplay effect?
- Is it only copying/saving/sanitizing world data?

Only the first category must be converted to territory APIs. Do not change tests and generation helpers blindly.

### Step 2 - economy/access/quest consistency

Check:

- `containers.ts`: owner, theft, access, audit and container UI should use `territoryRoomOwner()` or cell owner.
- `production.ts`: factory/room owner should use room territory.
- `quests.ts` and contract conversion: generated targets should store route/floor/room ids or tags, not Russian display-name lookup.
- `economy.ts`, `caravans.ts`, `banking.ts`: if a local owner is needed, read territory owner; if off-floor macro owner is needed, use compact route/floor theme or event fact.

Do not rebalance economy here. Only ownership/source-of-truth cleanup.

### Step 3 - samosbor and event payloads

For samosbor:

- `ZoneFaction.SAMOSBOR` remains a temporary territory owner, not a social faction.
- aftermath patches must be bounded and sync zone metadata.
- shelter facts should carry room ids/cell owner/floor key when useful.

For events:

- prefer ids and compact facts: `floorKey`, `routeId`, `roomId`, `zoneId`, `owner`, `actorFaction`, `targetFaction`, tags.
- do not rely on Russian display names for identity.
- keep event buffers bounded.

### Step 4 - UI/debug wording

Review `factions_ui.ts`, HUD location panel and debug summaries:

- show current cell owner as territory owner;
- show sector id/zone only as grouping/navigation metadata;
- avoid implying that `zone.faction` is the authority;
- do not re-add faction overlays to the full map if `problems.md` removed them.

Render must read facts and draw; no gameplay decisions in render.

### Step 5 - static audit guard

If practical, add a conservative content audit rule:

- flag `zone.faction` in runtime systems unless file is allowlisted;
- flag direct `world.factionControl[...] =` outside territory/generation allowlist;
- do not block legitimate world copy/save/test code.

If this becomes noisy, write the audit plan in the final response and leave code untouched for the orchestrator.

### Step 6 - doc synchronization

If docs are touched:

- `save.md` should match current `SAVE_SHAPE_VERSION`.
- `factions.md` remains the detailed territory contract.
- `architecture.md` remains the layer contract.
- README changes only for shipped implementation facts.

## File boundaries

Green:

- focused tests for consumers
- small docs fixes

Yellow:

- `src/systems/containers.ts`
- `src/systems/production.ts`
- `src/systems/quests.ts`
- `src/systems/faction_events.ts`
- `src/systems/context.ts`
- `src/systems/wrong_door.ts`
- `src/systems/samosbor.ts`
- `src/render/factions_ui.ts`
- `src/render/hud.ts`
- `scripts/content-audit.mjs`

Avoid:

- `src/systems/ai/*`
- broad floor generator edits
- save shape changes unless truly needed
- map overlay feature expansion
- `src/main.ts` except removal of an already identified content-specific branch under orchestrator control

## Validation

For systems/consumer changes:

```bash
npm run check
```

For render/HUD/UI changes:

```bash
npm run check:browser
```

For docs-only:

```bash
git diff --check
```

## Done when

- Consumer systems use cell/room territory for ownership and consequences.
- UI/debug wording separates owner from sector.
- Events carry compact ids/facts and remain bounded.
- Static audit either protects the architecture or a concrete allowlist plan is ready for the orchestrator.


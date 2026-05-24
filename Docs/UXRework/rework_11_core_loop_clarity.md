# rework_11_core_loop_clarity

Target model: GPT-5.5 worker.

Mode: implementation worker after the first feedback UX/design changes have landed or are being integrated. The tree is expected to be dirty. Do not revert unrelated feedback fixes, generated artifacts or PR docs.

## Goal

Make the shipped core loop visible in the first session.

The current build already has quests, loot, trade, weapons, route floors, samosbor, return paths and expedition-prep content. Fresh thread feedback says players still read the game as if the loop is missing: one player spent about 20 minutes looting, trading and shooting but did not do quests and forgot the quest key; another explicit gamedev response was "корлупа нет". Treat this as a presentation/activation problem first, not as proof that the simulation needs a new subsystem.

Target loop to expose:

`ЦЕЛЬ -> СБОРЫ -> ВЫХОД -> РИСК -> ДОБЫЧА/РЕШЕНИЕ -> ВОЗВРАТ -> СДАЧА/ПОСЛЕДСТВИЕ`

## Feedback This Addresses

- Players forget or miss that quests exist.
- The objective chip can say where to go, but not yet why this is a repeatable run loop.
- Loot/trade/shooting are discoverable, but they can feel like wandering without a trip frame.
- "До -50 этажа дойти" is too distant as the first perceived purpose.
- The game needs a clear small loop before the large Daggerfall/A-Life promise matters.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `desdoc.md`
- all current `Docs/UXRework/rework_*.md`
- `src/data/plot.ts`
- `src/data/contracts.ts`
- `src/gen/living/expedition_prep.ts`
- `src/systems/quests.ts`
- `src/systems/route_cues.ts`
- `src/systems/interactions.ts`
- `src/systems/inventory.ts`
- `src/render/hud.ts`
- `src/render/stats_ui.ts`
- `src/render/npc_ui.ts`
- `tests/first-playable-path.test.ts`
- `tests/expedition-proof.test.ts`

Run `git status --short` and inspect dirty diffs for every file you plan to touch.

## Design Contract

Do not add a separate tutorial mode. Do not block free exploration. Do not add content-specific logic to `main.ts` or `render/webgl.ts`.

Represent the loop through generic quest/route/inventory facts:

- active quest or first available plot offer
- target floor/room/route/risk
- current inventory readiness
- lift direction and return direction
- quest completion or delivery target
- compact aftermath event/log line

Use Russian player-facing text. Keep it short, concrete and procedural.

## Implementation Plan

### 1. Add A Derived Expedition Phase Helper

Create a small pure helper in `src/systems/quests.ts` or a new bounded system file such as `src/systems/expedition_loop.ts`.

It should derive, not persist, the current phase:

- `no_goal`: no active quest; show "Возьми задание у Ольги, Лиды или контракт у доски."
- `talk_to_giver`: first plot/quest offer is available nearby.
- `prep`: accepted objective exists, but basic readiness has missing critical slots.
- `outbound`: objective points away from current room/floor.
- `on_site`: target is on current floor/current room/nearby marker.
- `return`: target item/proof/kill/visit condition is satisfied and reward giver is the next target.
- `turn_in`: player is near giver/target NPC and can finish.

Inputs should be `GameState`, `World`, player `Entity`, live entities and current route facts. No per-frame full-world scan: reuse existing active quest arrays, current objective helpers, inventory summary and resolved target room.

### 2. Make Objective Chip Show Loop Step, Not Just Destination

Extend `getObjectiveRouteHud()` output or add a sibling HUD model so the top-right chip can show one compact phase prefix:

- `1 ЦЕЛЬ`
- `2 СБОРЫ`
- `3 ЛИФТ`
- `4 НА МЕСТЕ`
- `5 ВОЗВРАТ`
- `6 СДАТЬ`

Example first-hour copy:

- `1 ЦЕЛЬ: Ольга -> Барни`
- `2 СБОРЫ: вода 1, бинт 1, патроны 8`
- `3 ЛИФТ: вниз к Коллекторам / риск 2/5`
- `5 ВОЗВРАТ: лифт ↑ к Жилой зоне`
- `6 СДАТЬ: Яков, лаборатория`

This should replace duplicate "what now" text, not create another always-on panel.

### 3. Surface Prep Readiness In Inventory And Prep Room

`getInventoryPrepSummary()` already exists but is not player-visible enough. Wire it into the inventory or a compact prep block:

- weapon
- ammo
- medicine
- water
- food
- documents/tool

Use tone colors already present in the summary. In `Пункт сборов вылазки`, containers and Lida's text should point to this checklist as a game mechanic, not only as flavor.

Acceptance copy:

`Сборы: ствол, патроны, вода, еда, бинт, бумага. Красное - не запрет, а риск.`

### 4. Turn The Expedition Prep Room Into A Loop Hub

Keep `src/gen/living/expedition_prep.ts` as the first optional hub, but make its role explicit:

- public kit remains public and bounded;
- route board offers at least one concrete contract/lead if the player has no active objective;
- Lida's quest should be framed as "first repeatable expedition prep", not just a fetch task;
- the board should mention return and turn-in, not only what to bring.

Do not create refill logic. The public kit can stay a one-time placed resource because it is generation-time content.

### 5. Make Quest Completion Flip The Objective To Return

When a fetch/kill/visit objective becomes completable, the current objective should stop looking outbound and start saying return/turn-in.

Likely hooks:

- `checkQuestProgress()` / quest completion helpers in `src/systems/quests.ts`
- `questObjectiveLine()`
- `getCurrentObjective()`
- `getObjectiveRouteHud()`

Avoid storing a new persistent quest phase unless existing quest state cannot express it. Prefer a derived `questCanTurnIn(q, player, entities, state)` style helper.

### 6. Add A First Loop Debug/Smoke Path

Build on `tests/expedition-proof.test.ts` and existing debug commands:

1. prep kit and objective active;
2. lift prompt marks objective direction;
3. arrive at target route;
4. objective says on-site;
5. target item/proof acquired or simulated;
6. objective says return;
7. turn-in target is readable.

This is the regression test for "корлупа есть и видна".

## File Ownership

Likely touched:

- `src/systems/quests.ts`
- `src/systems/route_cues.ts`
- `src/systems/inventory.ts`
- `src/render/hud.ts`
- `src/render/stats_ui.ts`
- `src/gen/living/expedition_prep.ts`
- `tests/first-playable-path.test.ts`
- `tests/expedition-proof.test.ts`

Possible:

- `src/data/plot.ts` for first-hour objective wording only.
- `src/data/contracts.ts` if the first repeatable contract lacks a concrete return-readable target.
- `scripts/smoke-playability.mjs` if browser smoke should assert the loop chip.

Avoid:

- new `FloorLevel`;
- route-specific calls in `main.ts`;
- broad map redesign;
- new save state or migration;
- runtime refill spawners;
- additional HUD panels that compete with the current objective chip.

## Acceptance Criteria

- A fresh player sees a loop step, not only a destination.
- If the player has no quest, the UI points to a nearby way to get one.
- If the player accepts a quest, the UI says what to pack before leaving.
- Lift prompts indicate objective/return direction as they do now, but the phase language makes the trip frame obvious.
- After acquiring the quest item/proof or satisfying the objective, the chip says return/turn in.
- Inventory or prep room exposes readiness without forcing the player to read docs.
- The player can still ignore all of this and free-roam.

## Verification

Minimum for pure helper/text wiring:

```bash
npm run typecheck
npm run test:unit
```

Preferred after HUD/inventory/interaction changes:

```bash
npm run check:readonly
npm run check:browser
```

Manual first-session check:

- fresh start;
- see Olga objective;
- accept Barni path;
- see prep/readiness language after starter path;
- open inventory and read prep status;
- inspect lift prompt;
- simulate or complete expedition proof path;
- verify objective flips to return/turn-in.

## Notes For Orchestrator

This plan should run after the current UX campaign compiles. It depends on the already-added objective panel, UI presets, route/lift prompt suffixes and localized message triage.

If current dirty work already implements part of this, keep the existing generic helper and only add the missing phase/readiness/return pieces. Do not duplicate objective displays.

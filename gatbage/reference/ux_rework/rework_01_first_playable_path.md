# rework_01_first_playable_path

Target model: GPT-5.5 worker.

Mode: implementation worker, not brainstorm. The tree is expected to be dirty because feedback fixes are already in progress. Do not revert or overwrite unrelated dirty work.

## Goal

Make the first three minutes readable and playable.

The intended first route already exists in source:

`Ольга -> Барни -> shoot/check weapon -> return to Ольга -> Яков -> expedition prep/lift`

The current problem is presentation and activation, not missing content. A new player can start with no active quest, no visible interaction prompt, and no clear reason to talk to Olga.

## Feedback This Addresses

- Players ask what the goal is.
- Players do not understand where to go.
- The first NPC interaction can feel broken because "talk" and "quest" are separate concepts.
- The game has a strong world, but it does not expose one reachable first path before the simulation noise starts.

## Mandatory Intake

Read before touching files:

- `README.md`
- `architecture.md`
- `src/main.ts`
- `src/data/plot.ts`
- `src/systems/quests.ts`
- `src/systems/interactions.ts`
- `src/render/npc_ui.ts`
- `src/render/quest_ui.ts`
- `src/gen/living/tutor_room.ts`
- `src/gen/living/index.ts`
- `src/gen/living/expedition_prep.ts`
- `tests/helpers.ts`

Also run `git status --short` and inspect dirty changes in the files you plan to touch.

## Current Code Facts To Verify

- New game initializes `state.quests` as an empty array in `initGame()`.
- Olga, Barni and the player spawn in the start area through `generateTutorRoom()`.
- `PLOT_CHAIN` already defines Olga -> Barni -> Olga -> Yakov.
- NPC interaction opens a menu; ambient `Говорить` and `Задание` are separate actions.
- UI defaults may hide `messages` and `interaction_prompt`, so the start message is not enough.

## Desired Player Experience

On a fresh run, without opening menus, the player must be able to answer:

1. What do I do now?
2. Who is the first person?
3. Which key interacts?
4. What changes after I speak to them?
5. Why am I sent to Barni?

Minimum first objective text:

`Цель: поговорить с Ольгой Дмитриевной в актовом зале.`

Do not over-explain the whole game. This slice should be short and concrete.

## Implementation Direction

Prefer one of these, in order:

1. Add a generic current-objective HUD/source that can show a soft objective before formal quest acceptance.
2. Or create/offer the first plot step immediately at new game start, if this fits the existing quest code without special cases.
3. Or make Olga's first NPC menu default to the quest action until step 0 is accepted.

The cleanest result is likely a combination:

- New run has a visible soft objective pointing to Olga.
- Looking at Olga shows an interaction prompt.
- Opening Olga's menu makes the quest path obvious.
- Choosing `Говорить` before step 0 should not be a dead ambient loop.

Keep the work generic. Do not hardcode Olga into `render/` or broad AI. If a generic "available important quest" selection helper is needed, put it in systems/data code and keep content ids in data.

## Suggested File Ownership

Likely touched:

- `src/main.ts` for initial state wiring or menu default only if required.
- `src/systems/quests.ts` for a generic helper to find/offer first available plot objective.
- `src/render/npc_ui.ts` for selection/default/menu labeling.
- `src/render/hud.ts` only if this task owns a small current-objective display.
- `src/data/plot.ts` only for text clarity if current wording blocks first comprehension.
- focused tests under `tests/`.

Avoid:

- Adding route-specific gameplay to `main.ts`.
- Blocking all exploration until tutorial completion.
- New save migration. If persistent new state is unavoidable, follow save shape rules.

## Acceptance Criteria

- Fresh run visibly points the player to Olga before any menu diving.
- Looking at Olga shows an interaction affordance when onboarding UI is enabled.
- A player cannot accidentally spend the first interaction only cycling ambient lines and leave without understanding that Olga has the first task.
- After Olga -> Barni, the active objective points to Barni and indicates the armory/shooting range.
- After Barni -> Olga, the objective points back to Olga.
- After Olga -> Yakov, the objective explains that Yakov is the first real field-work bridge.
- Existing later plot steps still work.

## Verification

Minimum:

```bash
npm run typecheck
npm run test:unit
```

Preferred after integration:

```bash
npm run check
```

If HUD/render behavior changes, the orchestrator should also run:

```bash
npm run check:browser
```

## Notes For Orchestrator

This task may conflict with UI preset work and HUD objective work. If both exist, keep one generic current objective surface and remove duplicate first-objective displays.

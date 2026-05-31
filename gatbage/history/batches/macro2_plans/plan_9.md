# plan_9: малые караваны лифтовиков

## Суть

Экономика получает малые караваны между route floors: носильщики, ремонтники, контрабандисты. Игрок решает: сопроводить, ограбить, сдать, перенаправить, купить место или бросить караван при самосборе.

## Файлы

- `src/data/caravans.ts`: templates.
- `src/data/contracts.ts`: escort/raid/reroute tasks.
- `src/systems/caravans.ts`: slow tick and state.
- `src/systems/economy.ts`: scarcity/tariff consequences.
- `src/systems/quests.ts`.
- `src/systems/ai/*`.
- `src/systems/events.ts`.
- `src/gen/design_floors/*`: spawn hooks near lift/market/service nodes.

## Gameplay decisions

- сопровождать;
- ограбить;
- сдать ликвидаторам;
- перенаправить через рискованный route;
- купить место;
- бросить во время самосбора.

## Этапы

1. Добавить caravan templates: origin/destination tags, cargo, risk.
2. Спавнить малую группу у lift/market/service nodes.
3. Добавить assignment patterns для escort/raid/reroute.
4. События меняют scarcity/tariff/reputation.
5. HUD/map показывает только ближайший караван и статус.

## Риски

- NPC pathfinding через floor transitions.
- Entity count.
- Конфликт с уже существующими supply lanes.

## Проверки

- `npm run check`.
- Manual debug: взять escort, довести/ограбить, увидеть economy consequence.

# plan_7: аварийные щитки ЖЭКа

## Суть

На procedural/service/maintenance floors появляются щитки света, воды, вентиляции и дверей. Игрок решает: чинить, обесточить, вскрыть, перегрузить или уйти.

Эффекты локальные:

- свет;
- fog;
- двери;
- контейнеры;
- патрули;
- шум/события.

## Файлы

- `src/data/procedural_floors.ts`: tags/weights.
- `src/gen/procedural_floor.ts`: placement.
- Новый `src/data/emergency_panels.ts`.
- Новый `src/systems/emergency_panels.ts`.
- `src/systems/events.ts`.
- `src/systems/factions.ts`.
- `render/hud.ts` через общий interaction prompt из `plan_2`.

## Gameplay decisions

- починить за ресурсы;
- перегрузить ради shortcut;
- выключить свет и привлечь монстров;
- открыть двери ценой тревоги;
- ничего не трогать.

## Этапы

1. Добавить defs `panel_power`, `panel_water`, `panel_doors`, `panel_vent`.
2. При генерации service/collectors/workshops ставить 1-3 щитка в доступных комнатах.
3. Добавить interaction через общий dispatcher.
4. Локально менять light/fog/door state через bounded room/cell lists.
5. Публиковать events для слухов, контрактов и faction response.

## Риски

- Door effects могут создать softlock.
- Light/fog mutation может забыть dirty flags.
- Нельзя продублировать heatline один-в-один; щитки должны быть generic domain.

## Проверки

- Reachability после генерации.
- `npm run check`.
- Manual: щиток не ломает путь до обоих лифтов, эффекты видимы и bounded.

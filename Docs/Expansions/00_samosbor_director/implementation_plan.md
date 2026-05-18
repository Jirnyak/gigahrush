# Implementation Plan: Диспетчер Самосбора

Статус: technical plan  
Цель MVP: связать expansion-системы через cheap campaign director, не переписывая самосбор и не создавая hot-loop нагрузку.

## Phase 0: Preflight

Сначала нужно инвентаризировать уже существующие события и debug hooks: `src/systems/events.ts`, `src/systems/world_log.ts`, `src/systems/samosbor.ts`, `src/systems/debug.ts`, `src/data/samosbor_variants.ts`, `src/core/types.ts`. Если AG01/AG10/AG09 уже добавили events/economy/rumors, director должен подключаться как optional adapter, а не как hard dependency.

Выход фазы: короткая таблица доступных источников snapshot и список missing adapters.

## Phase 1: Director Core

Добавить `DirectorBeatDef`, `CampaignSnapshot`, `DirectorTraceEntry`. Реализовать static registry и rare tick. Tick вызывается не чаще одного раза в 5 игровых минут или вручную через debug. На первом этапе effect может быть no-op trace plus HUD/world log note.

Никаких прямых изменений в generator, AI или renderer. Director должен существовать как thin orchestration system.

## Phase 2: First Beats

Добавить 20 beat defs:

- 4 mushroom/scarcity beats;
- 4 document/access beats;
- 3 heat/maintenance beats;
- 3 market/debt beats;
- 2 hospital/quarantine beats;
- 2 metro/route beats;
- 1 404 prep beat;
- 1 Void locked beat, который не активируется до late-game.

Каждый beat обязан иметь act gate, cooldown, visible trace и rejection reason.

## Phase 3: Chain State

Реализовать два chain templates: `fungal_shortage_chain` и `route_error_chain`. Chain хранит текущий step, timeout и lastBeatId. Step не должен требовать, чтобы предыдущий beat был выполнен идеально; если мир изменился, chain gracefully expires.

## Phase 4: Debug And Black Box

Добавить debug-команды:

- `director snapshot`;
- `director beats`;
- `director force <id>`;
- `director cooldowns`;
- `director trace`;
- `director chain <id>`.

Trace ring строго bounded на 300 entries. Debug должен показывать не только выбранный beat, но и лучший отклоненный beat с reason.

## Phase 5: Integration With Samosbor Aftermath

Подключить aftermath hook после завершения самосбора. Director получает variant, floor, zone, severity и выбирает максимум один aftermath beat, если dangerBudget позволяет. Никаких изменений частоты самосбора в MVP.

## Definition of Done

MVP готов, если через debug можно форсировать грибной дефицит, увидеть три связанных beat, получить trace каждого выбора, убедиться что cooldown блокирует повтор, и сборка проходит.

## Testing

- Unit-style manual debug: force 5 beats подряд, проверить cooldowns.
- Save/load tolerance: отсутствие director state в старом save не ломает загрузку.
- Build: `npm run build`.
- Performance sanity: director не вызывается из render loop.


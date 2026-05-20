# plan_4: БЛЕЙМ-ветка, НЕТ-интерфейс и GBE

## Цель

Добавить route design floor, вдохновленный BLAME: Сибо, ученый киборг, администраторы, кремниевая жизнь, связь с НЕТ-веткой, Gravitational Beam Emitter как редкое оружие и ошибку взлома, которая вызывает Safeguard.

Этаж делать как routed design floor, а не как новый `FloorLevel`.

## Floor route

Файлы:

- `src/data/design_floors.ts`
  - добавить `DesignFloorId`, например `silicon_net_well`;
  - добавить `DESIGN_FLOOR_ROUTES` entry;
  - выбрать свободный procedural gap ниже `z=36`, иначе сработает NPC-free endgame правило.
- `src/gen/design_floors/silicon_net_well.ts`
  - self-contained generator: комнаты, лифты, NPC, терминалы, silicon life, контейнеры, награды.
- `src/gen/design_floors/manifest.ts`
  - импорт и `DESIGN_FLOOR_GENERATORS` entry.
- `src/gen/design_floors/full_floor.ts`
  - route-specific expansion только если нужен большой город/колодец; иначе положиться на `ensureRouteWideFootprint()`.
- `Docs/DesignFloors/silicon_net_well.md`
  - design contract.
- `Docs/DesignFloors/INDEX.md`
  - строка этажа.

Debug teleport появится автоматически, потому что `src/systems/debug.ts` строит команды из `DESIGN_FLOOR_ROUTES`.

## Content

NPC:

- Сибо: `PlotNpcDef` / local content NPC, quest giver, связана с НЕТ-доступом.
- Ученый киборг: `Faction.SCIENTIST`, может объяснять GBE и hack risk.
- Администраторы: guards/checkers через `Faction.LIQUIDATOR` или citizen/admin pattern.
- Кремниевая жизнь: на первом проходе можно использовать `ROBOT`, `SPIRIT`, `PARAGRAPH` с локальными names/variants; отдельный monster kind только если нужен новый behavior.

Gameplay decisions:

- помочь Сибо подключиться к НЕТ;
- выдать ученого администраторам;
- украсть GBE;
- открыть обход через терминалы;
- провалить взлом и вызвать Safeguard;
- применить GBE для удаления угрозы/стены и потерять часть лута/доступа.

## НЕТ и hacking

НЕТ-взлом должен идти через `plan_2` interactions. Для BLAME-этажа нужен только floor-local content и failure response.

Файлы:

- `src/data/net_terminal_gen.ts`: параметры терминалов/сложности.
- `src/systems/net_terminal_gen.ts` или новый `src/systems/net_hack.ts`: chance, cooldown, success/failure.
- `src/systems/events.ts`: event publication. Если не хватает типа, добавить `net_terminal_hacked` / `net_terminal_hack_failed` в typed event set.

Failure response:

- spawn 1 Safeguard рядом с терминалом;
- cooldown на terminal idx/floor key;
- publish event с tags `net`, `hack_failed`, `safeguard`, `silicon_net_well`;
- warning до spawn, чтобы игрок понял причину.

## GBE

GBE должен быть generic weapon effect, не hardcoded floor gimmick.

Файлы:

- `src/data/items.ts`: item `gravity_beam_emitter`, spawnW 0, выдавать только через floor content.
- `src/data/weapons.ts`: weapon stats, expensive cooldown, energy ammo or unique charge.
- `src/core/types.ts`: использовать существующий `ProjType.BEAM`, либо добавить отдельный deletion beam type если нужно отличать от PSI beam.
- `src/systems/weapon_beams.ts`: ray-march effect.
- `src/main.ts`: тонкий call из attack flow, если weapon stats помечены deletion beam.
- `render/hud.ts` / existing beam FX: визуальный state без знания про silicon floor.

Effect:

- bounded max range;
- toroidal ray march through `world.delta`/`world.idx`;
- kills entities on line;
- turns limited walls/doors/features into floor/residue marks;
- cleans affected doors/containers carefully;
- publishes event;
- never scans whole world.

## Границы

- Не добавлять `FloorLevel`.
- Не добавлять floor-specific logic в `main.ts`, `render/webgl.ts`, broad AI или `core/world.ts`.
- Не делать отдельный DOM UI.
- Не делать GBE особым случаем BLAME-этажа: этаж является source/reward, weapon effect generic.
- Safeguard из `plan_5` все же отдельный `MonsterKind`, потому что это отдельная задача апдейта.

## Этапы

1. Добавить route id/data/docs.
2. Создать базовый `silicon_net_well.ts` с лифтами, терминальным залом, NPC и silicon guardians.
3. Подключить generator в manifest.
4. Добавить GBE item/stat.
5. Реализовать generic deletion beam system.
6. Добавить НЕТ-hack failure hook и Safeguard spawn.
7. Связать floor quests/rewards с GBE и терминальным риском.
8. README обновить только после shipped implementation.

## Проверки

- `npm run check`.
- `npm run smoke`.
- Ручной debug:
  - teleport на floor;
  - оба лифта работают;
  - терминал работает без/с НЕТ-ГЕН;
  - failed hack spawns one Safeguard with cooldown;
  - GBE удаляет walls/entities и не ломает doors/container maps;
  - beam FX visible, canvas не blank.

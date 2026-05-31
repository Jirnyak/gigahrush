# plan_5: Safeguard

## Цель

Добавить нового сильного монстра Safeguard: белый гуманоид с клинковыми конечностями, быстрый late-game охранитель НЕТ/БЛЕЙМ-ветки. Он появляется редко в deep content и гарантированно как bounded наказание за ошибку взлома.

## Интеграционные файлы

Обязательные:

- `src/core/types.ts`: добавить `MonsterKind.SAFEGUARD`.
- `src/entities/safeguard.ts`: новый `MonsterDef` и `generateSprite()`.
- `src/entities/monster.ts`: импорт, `MONSTERS`, `MONSTER_SPRITES`, `NEW_MONSTER_KINDS`, `NEW_MONSTERS_BY_FLOOR`.
- `src/data/monster_ecology.ts`: ecology entry.
- `src/systems/ai/monster.ts`: readable melee elite behavior.
- `src/data/rumors.ts`: слухи.
- `src/systems/world_log.ts`: короткое имя/тексты, если текущий world log требует явного mapping.

Sprite index пересчитывается автоматически в `src/render/sprite_index.ts`, если registry обновлен.

## Статы v1

- name: `Сейфгард` или `Охранитель`.
- `hp: 185`
- `speed: 2.15`
- `dmg: 24`
- `attackRate: 2.4`
- `isRanged: false`
- `rare: true`
- floors: `MAINTENANCE`, `VOID`, future `silicon_net_well` as local generator spawn.
- rooms: `OFFICE`, `HQ`, `PRODUCTION`, `CORRIDOR`.
- `minSamosborCount: 7`.
- spawnWeight outside BLAME: very low, around `0.18`.

## Поведение

Роль: быстрее Костореза, но с читаемым клинковым windup.

Правила:

- detect around 24 cells;
- windup `0.75-0.9s`;
- burst range around `2.6`;
- line-of-sight/wall/door/machine break cancels strike;
- shotgun pellets stagger during windup;
- straight corridors are dangerous;
- failed hack gives warning before spawn.

Implementation path:

1. Reuse Kostorez-like windup where possible.
2. If duplication grows, extract small local blade-elite helper in `systems/ai/monster.ts`, not a broad AI rewrite.
3. Add event tags `safeguard`, `hack_error`, `blade`, `late_game`.

## Spawn

Normal ecology:

- rare deep spawn only;
- late samosbor only;
- not common civil corridor monster.

Hack failure:

- function like `spawnSafeguardHackBacklash(world, entities, nextId, state, x, y, reason)`;
- choose nearest walkable cell near terminal;
- spawn exactly one in v1;
- terminal/floor cooldown prevents farming;
- publish `net_terminal_hack_failed` with safeguard data.

BLAME floor:

- local authored spawns in `silicon_net_well.ts`;
- stronger presence than global ecology;
- some named Safeguards can guard GBE/terminal rooms.

## Sprite

Use 64x64 procedural style like `creator.ts` and `kostorez.ts`:

- cold white humanoid silhouette;
- narrower than Creator;
- black joint gaps;
- two long diagonal forearm blades;
- blade-like leg extensions;
- small red/cyan error slit face;
- avoid green so it does not read as Creator.

Readable at distance:

- high contrast white torso;
- four blade tips outside silhouette;
- red `access denied` face mark.

## Риски

- `MonsterKind` enum expansion cascades through `Record<MonsterKind, ...>`.
- If AI branch is too special, `systems/ai/monster.ts` grows more. Keep it to blade elite constants/helpers.
- White sprite must remain visible on pale floor/VOID backgrounds; add black outline/gaps.
- Hack failure spawn must be bounded and cooldowned.

## Проверки

- Monster-only: `npm run typecheck`, `npm run test:unit`.
- AI/spawn/hack/floor integration: `npm run check`.
- Render-facing: `npm run build`, `npm run smoke`.
- Manual:
  - sprite visible and not blank;
  - windup message appears before damage;
  - shotgun/LOS counterplay interrupts;
  - failed hack spawns one Safeguard;
  - normal lift/floor travel still works.

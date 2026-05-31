# plan_6: пропускной долг

## Суть

Документы, печати и долги становятся малым маршрутизатором доступа. Игрок может получить пропуск честно, купить, подделать, украсть или сдать владельца.

Работает через Министерство, Райсовет, Банк, Архив и procedural admin floors.

## Файлы

- `src/data/items.ts`: пропуска, печати, долговые бумаги.
- Новый `src/data/permits.ts`: definitions доступа.
- `src/gen/design_floors/*`: сейфы/столы/NPC на admin floors.
- `src/systems/quests.ts`: checks предъявления/подделки/кражи.
- `src/systems/factions.ts`: реакция на подделку/донос.
- `src/systems/events.ts`: `permit_forged`, `permit_exposed`, `access_granted`.
- Canvas UI только через существующие HUD/log/menu каналы.

## Gameplay decisions

- оформить пропуск;
- украсть;
- подделать;
- купить;
- сдать владельца;
- пройти силой и получить долг/розыск.

## Этапы

1. Добавить 6-10 item ids пропусков/штампов.
2. Добавить data defs с access tags и faction cost.
3. Разложить документы в сейфах/столах на admin/design floors.
4. Добавить generic quest/access checks.
5. Публиковать события и слухи.
6. Добавить debug path: выдать/проверить/испортить пропуск.

## Риски

- Quest special-cases могут расползтись.
- Подделка может стать слишком сильным shortcut.
- Persistent access flags требуют save-shape решения.

## Проверки

- `npm run typecheck`.
- Для quest/faction/save: `npm run check`.
- Ручной debug: получить пропуск, подделать, пройти проверку, провалить проверку.

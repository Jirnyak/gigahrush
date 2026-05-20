# plan_2: универсальные interactable-объекты и НЕТ-расширение

## Цель

Сделать расширяемую систему объектов, с которыми игрок взаимодействует через `E`, без роста `main.ts` и дублирования логики в HUD/mobile. Новые объекты должны добавляться как data/system/render модули:

- рулетка и слоты с денежными ставками;
- компьютеры с историей, инфо и локальными архивами;
- НЕТ-взлом терминала как миниигра, где успех зависит от сложности терминала, этажа, рандома, уровня игрока и интеллекта.

## Текущее состояние кода

Сейчас `E`-поток вручную собран в `src/main.ts` внутри `playerActions()`:

- cult procession;
- `tryUseNetTerminalGen()`;
- `tryUseRailTrain()`;
- полный цикл по `entities` для NPC;
- lift/metro/heatline/fungus/pneumomail/seroburmaline/hladon/paritel/betonoed/route cue/procedural anomaly/samosbor/hermodoor;
- дверь;
- контейнер.

Та же информация частично продублирована в:

- `canInteractAhead()` для mobile;
- prompt-блоке в `src/render/hud.ts`;
- overlay ветках `handleMenuInput()` для НЕТ-банка, НЕТ-ГЕН, map editor, NPC, containers.

Хорошие локальные паттерны уже есть:

- `systems/net_terminal_gen.ts`: sparse registry терминалов по cell idx и UI snapshots;
- `systems/rail_trains.ts`: target-id + use function;
- `systems/containers.ts` + `render/container_ui.ts`: runtime отдельно от canvas UI;
- `systems/events.ts`: единый канал важных фактов.

## Архитектура

Добавить `src/systems/interactions.ts` как единственный dispatcher для `E`, HUD prompt и mobile context.

Минимальные типы:

```ts
export type InteractableKind =
  | 'instant'
  | 'door'
  | 'lift'
  | 'npc'
  | 'container'
  | 'rail_train'
  | 'gambling'
  | 'computer'
  | 'net_hack';

export interface InteractionContext {
  world: World;
  state: GameState;
  player: Entity;
  entities: Entity[];
  nextEntityId: { v: number };
  lookX: number;
  lookY: number;
}

export interface InteractionTarget {
  id: number;
  defId: string;
  kind: InteractableKind;
  x: number;
  y: number;
  priority: number;
  prompt: string;
  colorSeed: number;
  disabledReason?: string;
}

export interface InteractionResult {
  handled: boolean;
  openedOverlay?: boolean;
  worldChanged?: boolean;
  message?: string;
}
```

Core API:

- `findInteractionTarget(ctx): InteractionTarget | null`
- `activateInteraction(ctx): InteractionResult`
- `isInteractableOverlayOpen(): boolean`
- `handleInteractableOverlayInput(input, ctx): void`
- `getInteractableOverlaySnapshot(): InteractableOverlaySnapshot`
- `closeInteractableOverlay(): void`

Generation helpers:

- `placeGamblingMachine(world, x, y, defId)`
- `placeComputer(world, x, y, defId)`
- `placeNetHackTerminal(world, x, y, defId)`

Начать со sparse registry по `cell idx`, как у `net_terminal_gen`. Typed arrays на `World` добавлять только если interactables станут массовыми.

## Домены

### Gambling

Файлы:

- `src/data/gambling.ts`
- `src/systems/gambling.ts`
- `src/render/gambling_ui.ts`

Содержимое:

- `roulette`, `slots`;
- ставки: presets, min/max;
- house edge;
- mutation `player.money`;
- events: `gambling_bet`, `gambling_win`, `gambling_loss`.

Gameplay decision: поставить деньги, уйти, рискнуть долгом/шумом, обмануть автомат через будущий hack hook.

### Computers

Файлы:

- `src/data/computers.ts`
- `src/systems/computers.ts`
- `src/render/computer_ui.ts`

Содержимое:

- страницы архива;
- floor-local facts;
- lead/hint unlock;
- optional quest flags через events.

Gameplay decision: читать, украсть данные, сдать источник, открыть маршрут, оставить след.

### Net hack

Расширить НЕТ-терминал через interactions, а не отдельную ветку в `main.ts`.

Формула v1:

```ts
difficulty = baseDifficulty + floorDangerOrZ + terminalRandom;
skill = player.rpg.level * 2 + player.rpg.int * 3;
chance = clamp(0.08, 0.92, 0.45 + (skill - difficulty) * 0.035);
```

Успех:

- открыть редактор/архив/координаты;
- деньги или доступ к банковской операции;
- publish `net_terminal_hacked`.

Ошибка:

- PSI damage, сигнал, блокировка терминала, local monster response;
- для BLAME-ветки spawn Safeguard через bounded hook;
- publish `net_terminal_hack_failed`.

## Этапы внедрения

1. Добавить read-only dispatcher, который повторяет текущий порядок `playerActions()` без изменения поведения.

2. Перевести HUD prompt и mobile `canInteractAhead()` на `findInteractionTarget()`.

3. Заменить длинный `input.interact` блок в `playerActions()` на `activateInteraction()`.

4. Добавить общий overlay runtime и одну ветку в `handleMenuInput()`.

5. Перенести новые gambling/computer/net_hack как первые native interactable kinds.

6. Адаптировать НЕТ-терминал: старые `render/net_terminal_*_ui.ts` можно оставить, но вызывать через общий overlay router.

7. Позже адаптировать containers/NPC/lifts как встроенные adapters, если это уменьшит код без риска.

## Риски

- Изменение приоритета `E` может сломать двери/NPC/терминалы. Нужен порядок, совпадающий с текущим `playerActions()`.
- Overlay input легко конфликтует с inventory/NPC/container/map editor. Сначала одна общая ветка и один общий close path.
- Хак-ошибка не должна фармить бесконечных монстров. Нужен cooldown на terminal idx/floor key.

## Проверки

- После dispatcher: `npm run typecheck`, `npm run test:unit`.
- После переноса `main.ts`/HUD/mobile: `npm run check`.
- После canvas UI: `npm run smoke` и ручная проверка prompt на дверях, лифтах, NPC, контейнерах, поездах, НЕТ-терминалах.
- Unit tests для gambling odds и net-hack chance.

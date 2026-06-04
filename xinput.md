# XInput / Gamepad Control Plan

> План интеграции геймпада, XInput-style раскладки и будущего экранного
> виртуального геймпада. Код пока не менялся; документ фиксирует оптимальную
> архитектуру на основе текущих `input`, mobile, HUD/menu и browser contracts.

## Цель

Добавить универсальное управление с геймпада без изменения основной схемы
клавиатуры и мыши.

Основная линия:

- keyboard/mouse остаются главным desktop-путём: pointer lock, mouse look,
  ЛКМ/ПКМ, горячие клавиши и текущий remap не ломаются;
- physical gamepad работает через браузерный Gamepad API, без native XInput,
  runtime dependencies или платформенных библиотек;
- mobile controls становятся экранным виртуальным геймпадом, который кормит тот
  же input layer, что и physical gamepad;
- gameplay, AI, render, save/load и генерация не получают device-specific logic;
- настройки геймпада хранятся browser-local, не в `gigahrush_save`.

В браузере "XInput" означает не прямой Windows XInput API, а стандартную
gamepad-раскладку, которую браузер отдаёт через `navigator.getGamepads()`.
Первый поддерживаемый профиль: Xbox / XInput-like controller с
`gamepad.mapping === "standard"`.

## Текущие факты кода

- `InputState` сейчас является общим transient input surface:
  boolean-действия, `mouse.dx/dy`, `touch.move/look`, menu latch-и и
  `textInput` живут в [src/core/types.ts](src/core/types.ts).
- Desktop events входят через [src/input.ts](src/input.ts): keyboard codes и
  synthetic mouse codes идут в `applyControlCode()`, mouse look копится только
  при pointer lock, menu mouse bypass-ит bindings через `menuAccept`,
  `menuClose`, `menuWheel`.
- Действия и keyboard/mouse bindings описаны в
  [src/systems/controls.ts](src/systems/controls.ts) через `CONTROL_ACTIONS`.
  Хранятся отдельно от сейва под `gigahrush_control_bindings_v7`.
- Mobile уже является вторым input producer:
  [src/mobile.ts](src/mobile.ts) создаёт DOM overlay, пишет `input.touch.*`,
  `input.mouseAttack`, `interact/interactHeld` и menu/action rail booleans.
- Движение и look читаются напрямую в [src/main.ts](src/main.ts):
  keyboard booleans + `input.touch.move*` складываются и clamp-ятся, mouse
  deltas очищаются после чтения, touch look масштабируется через
  `mobileLookSensitivity()`.
- Menu loop читает edge-и из `InputState`: `escape` как accept, `controlClose`
  / RMB как back, `invUp/Dn/Left/Right` с repeat, wheel как up/down.
- Title screen пока обрабатывает raw `keydown` отдельно от `InputState`.
- Net Sphere chat/open/close тоже имеет отдельный raw keyboard listener и
  текстовый ввод.
- UI/mobile/mouse sensitivity и HUD settings живут browser-local в
  [src/systems/ui_orchestrator.ts](src/systems/ui_orchestrator.ts) под
  `gigahrush_ui_orchestrator_v6`.
- Save shape находится в [src/systems/save_runtime.ts](src/systems/save_runtime.ts)
  (`SAVE_SHAPE_VERSION = 17`) и не должен меняться ради device preferences.

## Основной вывод

Нельзя просто дописать `input.gamepadAttack` / `input.gamepadMoveX` в несколько
мест. Это быстро создаст третий ad hoc path рядом с keyboard/mouse и touch,
сломает edge-семантику menus и усложнит mobile.

Правильная форма: один per-frame intent layer между устройствами и текущими
consumer-ами.

```txt
Keyboard / Mouse events
Touch / Virtual gamepad overlay
Physical Gamepad API polling
        |
        v
Universal Input Frame
  axes: move/look
  actions: held/pressed/released
  menu nav: accept/back/up/down/left/right/repeat
  text: keyboard-only printable chars
  activeDevice: keyboardMouse | gamepad | touch
        |
        v
Compatibility write into current InputState
        |
        v
Existing main.ts movement/actions/menu/render hints
```

`InputState` остаётся compatibility sink на первом этапе, чтобы не переписывать
все меню и gameplay сразу. Новые device adapters пишут в universal frame, а
один resolver синхронно обновляет старые поля до чтения input текущим кодом.

## Предлагаемые модули

### `src/systems/input_intent.ts`

Runtime-only типы и чистые функции:

- `InputDeviceKind = 'keyboard_mouse' | 'gamepad' | 'touch'`;
- `InputFrame`: movement/look axes, held/pressed/released action sets,
  menu navigation edges, active device, optional hardware status;
- `beginInputFrame(frame)`;
- `setActionHeld(frame, actionId, held)`;
- `pressAction(frame, actionId)`;
- `mergeAxis(frame, axis, value, source)`;
- `resolveInputFrameToInputState(frame, input, context)`.

Этот модуль не знает про DOM, Gamepad API, save/load, render или gameplay.

### `src/input_gamepad.ts`

Browser Gamepad API adapter:

- `createGamepadInput(options)` / `bindGamepadInput(...)`;
- `pollGamepadInput(frame, dt, context)`;
- active pad selection;
- `gamepadconnected` / `gamepaddisconnected`;
- safe `navigator.getGamepads()` wrapper;
- standard mapping parser;
- button edge detection;
- radial deadzone / curve helpers;
- optional haptics facade.

Polling должен вызываться из `gameLoop` рано: после расчёта `frameDt`, но до
`wantSleep`, `handleMenuInput()`, movement и action systems. Иначе `sleep`,
menus и часть latch-ей будут читать прошлый кадр.

### `src/systems/gamepad_settings.ts`

Browser-local настройки:

- storage key: `gigahrush_gamepad_settings_v1`;
- enabled flag;
- selected profile: initially `standard_xinput`;
- deadzones, curves, sensitivity, invert Y;
- button mapping for gamepad-specific semantics;
- virtual gamepad layout toggles.

Не включать в `SavePayload`. Не bump-ить `SAVE_SHAPE_VERSION`.

### `src/mobile.ts` / future `src/input_virtual_gamepad.ts`

Current mobile overlay надо не удалять, а привести к тем же semantic events,
что physical gamepad:

- left stick -> `moveX/moveY`;
- right stick / look zone -> `lookX/lookY`;
- A/B/X/Y/on-screen buttons -> same semantic gamepad actions;
- RT fire zone -> attack;
- menu/view buttons -> map/game menu;
- rail оставить как compact fallback для редких действий, пока не появится
  полноценная radial/quick menu схема.

## Action taxonomy

Нужны не только booleans, а разные классы действий.

### Continuous axes

- `moveX`: left/right strafe.
- `moveY`: forward/back.
- `lookX`: yaw.
- `lookY`: pitch.

Keyboard остаётся digital producer: `A/D`, `W/S`, arrows.
Mouse остаётся delta producer и не смешивается с stick axes.
Touch/gamepad являются continuous producer-ами.

### Held gameplay actions

- `attack`;
- `useTool`;
- `sprint`;
- `sleep`;
- `interactHeld`.

Held actions должны очищаться на pause, blur, visibility hide, pad disconnect и
pointer-capture gate.

### Edge gameplay actions

- `interact` как one-frame edge;
- `gameMenu`;
- `inventory`;
- `map`;
- `mapLegend`;
- `questLog`;
- `factions`;
- `log`;
- `controls`;
- `uiSettings`;
- `debug`;
- `drop`;
- `attrStr/attrAgi/attrInt`.

`interact` должен сохранить текущую особую семантику:
press создаёт one-frame `input.interact`, hold держит `interactHeld`.

### Menu actions

- `accept`;
- `back`;
- `up/down/left/right`;
- `pageLeft/pageRight` or `tabPrev/tabNext` later;
- repeat state for held navigation.

Не мапить gamepad accept/back как fake mouse buttons. Сейчас LMB/RMB имеют
особую menu-семантику (`menuAccept`, `menuClose`) отдельно от gameplay
bindings. Gamepad должен идти через menu actions.

### Text input

Keyboard остаётся единственным полноценным text producer.

Gamepad может:

- выбрать строку чата;
- submit;
- erase/backspace;
- scroll chat/history.

Но ввод букв с геймпада не входит в первый этап. Для title name/seed и Net
Sphere chat нужен fallback: keyboard, browser/OS on-screen keyboard или будущая
отдельная экранная клавиатура.

## Default physical gamepad mapping

Поддерживаемый стартовый профиль: `gamepad.mapping === "standard"`.

| Standard control | Gameplay | Menu/title |
| --- | --- | --- |
| Left stick axes 0/1 | moveX/moveY | optional nav if menu mode and d-pad idle |
| Right stick axes 2/3 | lookX/lookY | no text cursor control in v1 |
| A / button 0 | interact edge | accept |
| B / button 1 | no gameplay default | back/close |
| X / button 2 | use tool fallback or contextual secondary | optional action |
| Y / button 3 | inventory | optional panel/action |
| LB / button 4 | sprint hold fallback or previous tab | previous tab/cycle |
| RB / button 5 | next tab/cycle or action rail | next tab/cycle |
| LT / button 6 | use tool hold | left/secondary adjust |
| RT / button 7 | attack hold | accept only if explicit screen asks |
| View / button 8 | map | map close/open |
| Menu / button 9 | game menu | accept/open menu |
| L3 / button 10 | sprint hold preferred | no default |
| R3 / button 11 | recenter/look utility later | no default |
| D-pad 12/13/14/15 | optional fallback movement | menu nav |
| Guide / button 16 | unsupported | unsupported |

Important decision: A is context-sensitive. In gameplay it means world
interaction; in menus/title it means accept. Do not bind one gamepad code to
both `interact` and `gameMenu` through current `CONTROL_ACTIONS`, because that
would risk interacting and opening/accepting menu in the same frame.

## Deadzones and analog curves

Start values:

- move stick radial deadzone: `0.18`;
- look stick radial deadzone: `0.16`;
- trigger held threshold: `0.35`;
- trigger edge threshold: `0.55`;
- move exponent: `1.15`;
- look exponent: `1.65`;
- invert look Y: off by default.

Radial deadzone:

```ts
const len = Math.hypot(x, y);
if (len <= deadzone) return { x: 0, y: 0 };
const t = Math.min(1, (len - deadzone) / (1 - deadzone));
const scaled = Math.pow(t, exponent) / len;
return { x: x * scaled, y: y * scaled };
```

Movement should stay analog through `moveX/moveY`; do not convert sticks to
WASD booleans except for menu fallback. Look should be dt-scaled like current
touch look, not written into `mouse.dx/dy`.

## Active input mode and pointer lock

Current desktop gate requires pointer lock unless mobile controls are enabled.
For gamepad-only desktop play, this has to become input-mode aware.

Recommended rule:

- keyboard/mouse gameplay mode keeps current pointer-capture gate unchanged;
- mobile mode keeps current no-pointer-lock path;
- gamepad mode can run without pointer lock after a physical pad input has
  selected gamepad mode;
- any real mouse look / mouse click / keyboard movement can switch back to
  keyboard_mouse mode and restore pointer-lock requirement;
- menus/title can always accept gamepad navigation without pointer lock;
- losing pointer lock must still clear mouse deltas and keyboard/mouse held
  gameplay state.

This preserves the desktop contract while letting a controller start and play
the game without mandatory mouse capture.

## Mobile virtual gamepad

The mobile goal should change from "touch controls" to "virtual gamepad".

Recommended screen layout:

- left bottom: circular left stick for movement;
- right bottom / right half: right stick or look zone;
- right action cluster:
  - `A` interact / accept;
  - `B` back / close;
  - `X` tool;
  - `Y` inventory or contextual panel;
- right shoulder / large transparent zone: `RT` attack;
- small top/right buttons:
  - `VIEW` map;
  - `MENU` game menu;
  - `FULL/PAGE` keep existing fullscreen/direct-page behavior;
- compact rail remains for long-tail actions: quests, log, factions, UI,
  controls, debug, sleep, pee, drop, attrs.

All virtual buttons should call the same semantic action functions as physical
gamepad. They should not directly mutate arbitrary `InputState` booleans except
through the compatibility resolver.

Safe-area/HUD integration must continue through `setMobileHudSafeContext()`.
If the new action cluster occupies more space than the current rail, update
safe insets so HUD panels, interaction prompt and minimap do not sit under
buttons.

## Interface plan

### Existing canvas menus

Most menus already share the same navigation fields:

- `gameMenu` / `escape` for accept;
- `controlClose` / RMB for close;
- `invUp/Dn/Left/Right` for navigation;
- `drop` as right-side / special action in inventory and table games.

Gamepad should feed these existing fields through resolver output, not add
per-menu controller branches.

### Title screen

Title currently uses raw keyboard handler. It needs a small `TitleInputIntent`
bridge:

- A/Menu: open setup / accept selected row;
- B: go back from setup to language or no-op on language;
- D-pad / left stick: row selection;
- left/right: language / actor cap adjustment;
- View/Menu optional shortcuts only after setup is open;
- text fields remain keyboard/OS keyboard only in v1.

Without this, the player cannot start a run with controller only.

### Net Sphere

Net Sphere has special keyboard/text rules and should not be blindly routed
through generic menu handling.

Gamepad v1:

- Menu/View can open/close only when chat input is inactive;
- A selects chat line or submits current draft;
- B/Delete-equivalent closes when chat input inactive, cancels chat focus when
  active;
- X can erase one char only when chat input active;
- D-pad/right stick can scroll history;
- no controller text entry beyond OS/browser keyboard.

### Controls UI and hints

Current `controlHint()` reports keyboard/mouse bindings. Add a hint resolver:

```ts
controlHintForActiveDevice(actionId, context)
```

It should return:

- keyboard/mouse labels by default;
- gamepad labels when last active device is gamepad;
- virtual button labels when mobile virtual gamepad is active.

The controls screen should become three views:

- `keys`: current remappable keyboard/mouse bindings;
- `gamepad`: standard mapping, deadzones, invert, sensitivity, supported pad;
- `buttons`: current/future virtual mobile gamepad help.

Do not mix physical gamepad remap into `gigahrush_control_bindings_v7` until
the UI supports non-key codes cleanly. Use separate gamepad settings first.

## Persistence

Use a separate localStorage key:

```ts
const GAMEPAD_SETTINGS_KEY = 'gigahrush_gamepad_settings_v1';
```

Suggested payload:

```ts
interface GamepadSettings {
  version: 1;
  enabled: boolean;
  profile: 'standard_xinput';
  invertLookY: boolean;
  moveDeadzone: number;
  lookDeadzone: number;
  triggerThreshold: number;
  moveCurve: number;
  lookCurve: number;
  lookSensitivity: number;
  haptics: boolean;
  virtualGamepad: {
    enabled: boolean;
    layout: 'compact' | 'full';
    opacity: number;
  };
}
```

Sanitization:

- unknown version -> defaults;
- booleans only for flags;
- profile only from known ids;
- numbers finite and clamped;
- strings capped and enum-checked;
- no controller id persistence except optional short last-seen display label,
  capped and never trusted for mapping;
- blocked localStorage -> in-memory defaults.

No save shape bump is needed.

## Platform notes

Use current browser sources as constraints:

- MDN documents `Gamepad` as widely available, but with support variation
  across platform/controller combinations.
- MDN and the W3C spec both point to event discovery plus per-frame
  `navigator.getGamepads()` polling for live state.
- `mapping === "standard"` is the only reliable initial cross-browser layout.
- `vibrationActuator` / haptics are limited-availability and must be optional.
- Some browsers expose already-connected pads only after user interaction.
- `navigator.getGamepads()` can contain null holes; iframe/Permissions Policy
  can block access.

Practical policy:

- support `standard` first;
- show "unsupported/remap needed" for non-standard pads instead of guessing;
- never rely on Guide/System button;
- haptics are best-effort feedback only;
- no gameplay depends on haptics or controller-specific ids.

References:

- https://developer.mozilla.org/en-US/docs/Web/API/Gamepad
- https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- https://www.w3.org/TR/gamepad/

## Implementation phases

### Phase 1: pure mapper and tests

Files:

- new `src/systems/input_intent.ts`;
- new `src/systems/gamepad_settings.ts`;
- new tests under `tests/`.

Work:

- define `InputFrame`;
- define action classes and axis merge;
- implement deadzone/curve helpers;
- implement button edge detector;
- implement settings load/sanitize/save;
- unit tests for math, edge detection, settings sanitization.

Validation:

- `npm run typecheck`;
- `npm run test:unit`.

### Phase 2: physical gamepad adapter

Files:

- new `src/input_gamepad.ts`;
- narrow integration in `src/main.ts`.

Work:

- connect/disconnect listeners;
- active pad selection;
- guarded `getGamepads()` polling;
- standard mapping to `InputFrame`;
- disconnect clears pad-owned holds/axes;
- no haptics yet;
- no UI remap yet.

Critical integration point:

- poll before `wantSleep` and `handleMenuInput()`.

Validation:

- `npm run typecheck`;
- `npm run test:unit`;
- manual Chrome desktop pad check.

### Phase 3: compatibility resolver into current gameplay

Files:

- narrow `src/main.ts`;
- maybe `src/input.ts` only for shared clear hooks;
- no gameplay systems.

Work:

- merge keyboard/mouse legacy state, touch, and gamepad frame;
- update movement/look combination from helper functions;
- route menu accept/back/nav through existing fields;
- preserve `interact/interactHeld`;
- add active device mode and pointer-lock gate rule;
- add title screen bridge.

Validation:

- `npm run check`;
- `npm run check:browser` when Chrome is available.

### Phase 4: virtual gamepad mobile overlay

Files:

- `src/mobile.ts`;
- `src/systems/mobile_actions.ts`;
- `src/index.css`;
- `src/render/ui_layout.ts` only if safe insets need extension.

Work:

- replace current "touch controls" mental model with virtual gamepad semantics;
- keep current fullscreen/direct-page behavior;
- map mobile buttons into the same action resolver;
- keep compact rail for rare actions;
- update controls help rows.

Validation:

- `npm run check:browser`;
- mobile viewport smoke / screenshot;
- manual Android Chrome and embedded/mobile-host checks if available.

### Phase 5: UI settings and hints

Files:

- `src/systems/ui_orchestrator.ts`;
- `src/render/controls_ui.ts`;
- `src/render/ui_settings_ui.ts`;
- HUD/menu hint call sites as needed.

Work:

- add gamepad view to controls/settings UI;
- show active controller status;
- tune deadzones/invert/look sensitivity;
- route `controlHintForActiveDevice()`;
- avoid stale keyboard-only hints when controller is active.

Validation:

- `npm run check`;
- visual inspection of desktop and mobile menu text.

### Phase 6: haptics and browser smoke hook

Files:

- `src/input_gamepad.ts`;
- `scripts/smoke-playability.mjs`;
- focused tests.

Work:

- optional `playGamepadHaptic(kind)` with capability detection;
- damage/fire short pulses only;
- catch and ignore haptic rejection;
- smoke-only fake `navigator.getGamepads()` injection behind a test flag;
- assert that gamepad mapping can start title/menu/movement in browser smoke.

Validation:

- `npm run check:browser`;
- manual real controller check remains required.

## QA checklist

Desktop keyboard/mouse:

- click-to-capture still appears when expected;
- mouse look still requires pointer lock;
- ЛКМ attack, ПКМ tool, wheel menu nav, `Enter`, `E`, `Tab`, `U`, `M`, `L`
  all retain current behavior;
- losing pointer lock clears mouse/gameplay holds.

Desktop gamepad:

- already-connected pad becomes visible after first button/stick input;
- A starts/accepts title flow;
- left stick moves, right stick looks;
- RT attacks, LT uses tool, A interacts, B closes;
- gamepad play works without mouse pointer lock after gamepad mode activates;
- switching back to mouse restores pointer-capture expectations;
- disconnect clears held attack/tool/sprint and axes.

Mobile virtual gamepad:

- overlay appears only on mobile/compact touch conditions;
- left/right sticks do not get stuck after `pointercancel` or lost capture;
- buttons do not cover critical HUD;
- `FULL/PAGE` keeps existing iOS/iframe constraints;
- menus can be opened, navigated, accepted and closed without keyboard.

Menus/interfaces:

- inventory, quests, log, factions, controls, UI settings, map legend, full map,
  NPC menu, container, craft, table games, emergency panel, computer/net hack
  all respond to accept/back/nav;
- text input screens do not pretend to support full controller text entry;
- Net Sphere chat focus/submit/erase/scroll rules remain explicit.

Tests:

- mapper unit tests;
- settings sanitizer tests;
- pointer lock tests still pass;
- controls tests still pass;
- browser smoke confirms no blank canvas and no broken keyboard/mouse path.

## Risks and constraints

- `main.ts` already owns too much UI/input orchestration. Keep changes narrow:
  one early poll/resolve call, minimal helper calls for movement/look/menu/title.
- `core/types.ts` is integrator-owned. Avoid expanding `InputState` until the
  intent layer proves the exact transient shape needed.
- Non-standard gamepads are common enough that guessing mappings will create
  bad controls. Ship standard first, then remap UI.
- Gamepad + keyboard duplicate actions are allowed only through resolver
  policy, not by accidentally assigning the same synthetic code to many
  `CONTROL_ACTIONS`.
- Haptics are not portable.
- Mobile on-screen controls must not regress desktop pointer lock or canvas HUD
  pointer behavior.

## Accepted first implementation shape

Build the universal input layer first, then plug physical gamepad and virtual
mobile gamepad into it.

Do not implement a gameplay-specific controller path. Do not add a runtime
dependency. Do not put controller settings in save. Do not replace
keyboard/mouse. The first shipped controller path should be small, standard,
testable, and visible from title screen to gameplay to core canvas menus.

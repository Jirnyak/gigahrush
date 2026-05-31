# Лифтовая петля 404: implementation plan

Статус: planning package для будущего playable MVP. Этот документ не объявляет код реализованным. Цель среза: игрок может намеренно или полу-намеренно спровоцировать ошибку лифта, попасть в pocket `404`, понять локальное правило "карта лжет", выйти через неправильную дверь и получить документ, потерянный предмет или memory-mark consequence.

## Техническая рамка

EXP09 не добавляет новый постоянный `FloorLevel` для MVP. Номерные этажи описываются через data-driven `NumberedFloorDef`, а runtime создает один активный `floorInstance` с seed, локальным правилом, bounded state и fallback на последний стабильный этаж. Лифт остается входной точкой, но не становится полноценной транспортной сетью: ошибка возникает только на interaction/event cadence, не каждый кадр.

MVP строится вокруг `404`. `556`, `777` и `1337` получают зарезервированные defs, debug visibility и тесты на отсутствие краша при недоступном генераторе. Полный playable контент этих трех номеров идет после доказанного 404-loop.

## Фаза 0: preflight и ownership

Исполнитель будущего кода перечитывает фактические секции `README.md` про `FloorLevel`, лифты, save/load, debug, samosbor variants, world events и rumor/NPC memory; затем перечитывает `desdoc.md` разделы про номерные этажи, обратные лифты, протоколы 404/556/777/1337, документы и квестовые заготовки. После этого фиксируется owner-map: EXP09 owns numbered floor defs, instance state contract, elevator anomaly rules, 404 pocket generator, 404 docs/debug ids. EXP09 does not own global `FloorLevel`, metro routes, archive law, black market debt or samosbor core variants.

Definition of Done: выбран список будущих файлов и ids; `FloorLevel` не расширяется; optional hooks для EXP02/EXP03/EXP05 описаны, но не импортируются. Проверка: `rg "FloorLevel|LIFT|save|debug|samosbor"` по коду перед реализацией, затем baseline `npm run build`.

Риск: агент начнет с "1000 номерных этажей". Контрмера: MVP содержит один playable 404 и три passive defs только для validation/fallback.

## Фаза 1: NumberedFloorDef registry

Создать pure-data registry `src/data/numbered_floors.ts` с четырьмя стабильными ids: `numbered.404.not_found`, `numbered.556.p46`, `numbered.777.safe_trap`, `numbered.1337.radio_admin`. Def хранит entry conditions, generator id, local rule, exit rules, rewards, memory effect, map policy, samosbor bias and debug label.

Data не должна импортировать generators, render или debug. UI и debug получают summaries через system helper, а не читают raw mutable objects. Все ids должны быть строковыми и стабильными для save/load.

Definition of Done: registry validates duplicate ids, missing generator ids and missing exit rules at startup/debug call. Проверка: debug `numbered.listDefs` показывает четыре defs и `404` как only fully playable MVP.

Риск: def превратится в лор-текст без механики. Контрмера: mandatory fields include `localRuleId`, `exitRuleIds`, `rewardTags`, `mapPolicy`, `fallbackFloor`.

## Фаза 2: floorInstance runtime

Создать `src/systems/floor_instances.ts` как finite state machine: `idle -> entering -> active -> exiting -> closed`. В MVP допускается только один active numbered instance. State содержит `instanceId`, `defId`, `seed`, `enteredAtMinute`, `lastStableFloor`, `lastStablePos`, `exitState`, `visitedRoomMask`, `ruleFlags`, `rewardClaimed`, `closedReason`.

Instance generation happens once on entry. После выхода pocket is destroyed unless later design explicitly enables persistent return. Save/load normalizes aggressively: if active instance cannot be restored because def/generator is missing, player returns to `lastStableFloor` and `lastStablePos`, with a world-log/debug message. Missing active instance in old saves is valid.

Definition of Done: enter 404, save in pocket, load in pocket if generator exists, load fallback if def/generator is artificially missing in debug/test. Проверка: `numbered.dumpState`, `numbered.forceMissingDefLoad`, manual save/load.

Риск: temporary instance corrupts main world coordinates. Контрмера: stable floor and position are serialized before instance entry and never overwritten until confirmed exit.

## Фаза 3: elevator anomaly resolver

Создать `src/systems/elevator_anomalies.ts` как event/interaction resolver. Inputs: current floor, lift feature, requested target, samosbor phase/variant, player flags/items, recent rumors/docs, debug override and deterministic seed. Output: normal floor transition or `FloorInstanceEntryRequest`.

Anomaly chance is rare and bounded. MVP conditions: silent samosbor or no-siren warning increases 404; map/document clue unlocks intentional 404; corrupted lift protocol can force 404; debug can force any def. Resolver returns warning ids before entry: blank floor indicator, wrong elevator chime, wet iron smell, journal row "floor not found", NPC line about not remembering the ride.

Definition of Done: normal lift transition still works; forced 404 works; two samosbor variants influence risk; warnings are visible before or immediately after entry. Проверка: debug `numbered.force 404`, `numbered.rollAnomaly`, forced quiet/electric samosbor smoke test.

Риск: player sees random teleport bug. Контрмера: every anomaly has warning ids, event/log fact and escape path.

## Фаза 4: 404 pocket generator

Создать `src/gen/numbered/floor_404.ts` with 5-8 rooms around an elevator hall. Geometry is small, closed and deterministic by instance seed. Required rooms: elevator hall without number, lost-storage, empty queue, mislabeled door corridor, archive dead end and wrong-exit door. Optional rooms: service closet with lift cable, apartment that repeats the entrance, room where the map marker points behind a wall.

Local rule: navigation UI lies, but physical clues are consistent. The correct exit is the door whose label contradicts the map. Do not disable all orientation; provide non-map signals through repeated tiles, chime count, signage mismatch and short documents.

Definition of Done: player can walk from entry to all required rooms, identify wrong-exit clue, exit without softlock, and receive one reward/consequence. Проверка: debug teleport to 404, path smoke test, forced exit, collision/door enclosure check.

Риск: map distortion makes the game feel broken. Контрмера: distort only markers/minimap labels, never collision truth; add explicit diegetic clue "map is the wrong witness".

## Фаза 5: content, rewards and consequences

Implement the MVP content from `content_manifest.md`: one trace NPC or missing-person trace, three documents, one lost-item recovery node, one memory-mark consequence and one hostile/noise risk. Rewards should be modest: recover one recently lost low/mid item, get `doc_order_404_not_found`, unlock 404 rumor, or receive a route hint toward archive/void. Failure exits to a dangerous but valid stable floor/zone, not to invalid coordinates.

Definition of Done: content nodes are interactable once, reward cannot duplicate, memory mark changes a line/rumor/debug state, failure exit is visible in event/log. Проверка: claim reward twice, force failure exit, inspect debug state and inventory/log.

Риск: 404 becomes a free item vending machine. Контрмера: one recovery per instance, limited item tiers, chance of false item or memory mark instead of loot.

## Фаза 6: debug, tests and polish stop

Debug commands must prove every path without manual superstition: list defs, force enter, roll anomaly, dump active instance, set map policy, claim reward, force exit, simulate missing def/generator load. Test checks include build, normal lift travel, forced 404 entry/exit, quiet samosbor risk bias, map distortion readability, save/load fallback and reward dedupe.

Polish is not authorization to add more numbered floors. Polish budget goes into making 404 look intentional: blank elevator display, wrong chime count, paper journal, repeated door labels, subtle HUD-map contradiction and concise document text.

Definition of Done: `npm run build` passes after implementation; no permanent floor enum added; debug can reproduce entry, exit, fallback and reward; old saves without instance state load; generated pocket costs 0 us while inactive.

## Math LOD

| Tier | Логика | Визуал | Target cost |
| --- | --- | --- | ---: |
| Low | one active 404 instance, 5 rooms, static exit rule, no persistence after exit | blank lift number, two signs, one document | 0 us/frame inactive; <100 us entry resolve |
| Middle | four defs, 404 playable, samosbor risk bias, memory flags | distorted minimap label, wrong door plaques, simple chime cues | 0 us/frame inactive; 100-300 us instance creation |
| High | optional archive/rumor/world-log hooks, lost-item recovery, save/load fallback test path | richer 404 props, repeated room motif, NPC trace silhouette | 0 us/frame inactive; <500 us rare entry/exit event |
| Ultra | visual overkill per number after MVP: 556 panels, 777 sterile trap, 1337 radio cyberpunk | stronger HUD-map contradiction, procedural paper/noise effects in pocket only | finite instance only; no global per-frame polling |

## Test matrix

| Check | Required result |
| --- | --- |
| Build | `npm run build` passes after code implementation. |
| Normal lift | Existing known-floor elevator travel remains unchanged when anomaly resolver returns normal. |
| Forced 404 | Debug opens 404 from any stable elevator without requiring metro/archive/market. |
| Local rule | Correct exit is found by contradicting map labels, not by random search. |
| Reward | One document or lost-item recovery is granted once; duplicate claim is blocked. |
| Failure | Timeout/wrong exit returns to valid stable floor or dangerous zone, never invalid coordinates. |
| Save/load | Old saves without `activeFloorInstance` load; missing def/generator normalizes to last stable floor. |
| Samosbor | At least quiet and electric/classic variants affect anomaly chance/type. |
| Debug | `list`, `force`, `roll`, `dump`, `exit`, `simulateMissingLoad` expose state and reason codes. |


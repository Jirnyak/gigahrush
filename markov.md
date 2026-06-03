# Markov NPC Text Plan

> План контекстной генерации коротких NPC-реплик, bark-строк и записей
> `Инфосети Демос` через шаблонно-марковский слой. Это roadmap, а не shipped
> fact. Фактическое состояние проверять по `README.md`, `demos.md`, текущим
> `src/` и тестам.

Этот документ не про route-floor `markov_stairwell` / `Марковская лестница`.
Тот этаж уже является генераторной марковской лестничной цепью. Здесь речь о
процедурном тексте NPC на основе игрового контекста.

## Цель

Сделать фразы NPC более живыми и контекстными без новой скрытой симуляции.

Нужен bounded генератор, который:

- берет реальные игровые факты: комнату, зону, нужды, предметы, опасность,
  фракцию, отношение, событие, A-Life snapshot или Demos social edge;
- собирает короткую фразу через безопасный шаблон;
- использует марковскую цепь только внутри ограниченных слотов;
- не выдумывает смерти, долги, маршруты, предметы, визиты и квесты;
- не заменяет authored plot lines, точные world-log сообщения, самосборные
  предупреждения, combat alerts и quest copy.

Главная схема:

```txt
WorldEvent / ContextSnapshot / A-Life snapshot / Demos edge
  -> MarkovTextContext
  -> template-first phrase
  -> bounded Markov slots
  -> validator
  -> talk line, ambient bark, Demos post or Demos reaction
```

## Текущие Опоры

Существующие точки, которые надо использовать вместо нового параллельного
контура:

- `src/systems/dialogue.ts`: `generateTalkText()` уже идёт по слоям
  `plot -> context -> rumor -> AI state -> generic pools`. Markov должен
  входить перед generic fallback, когда нет более важной реплики.
- `src/systems/context.ts`: готовый дешевый `ContextSnapshot` с floor, room,
  zone, needs, HP, distance, samosbor, recent events, room memory, production,
  container и screen-rumor данными.
- `src/systems/rumor.ts` и `src/data/rumors.ts`: слухи имеют ids, topics,
  leads и event bridge. Markov может перефразировать flavor вокруг выбранного
  факта, но не должен терять `rumorId`.
- `src/data/dialogue.ts` и `src/data/context_lines.ts`: curated русский корпус
  для faction/occupation/context. Это основной источник словарей, а не
  player chat, debug strings или Net Sphere messages.
- `src/systems/events.ts`: `publishEvent()` и `registerWorldEventObserver()`
  дают downstream вход для Demos post candidates.
- `src/systems/world_log.ts`: точный event-to-log formatter с distance,
  dedupe и audibility. Markov не заменяет его.
- `src/systems/ai/barks.ts`: bark path должен оставаться bounded и radius-aware.
  Markov допустим для ambient/lead flavor, не для тревожных alerts.
- `src/systems/demos.ts`: Demos view-model читает A-Life snapshots. Социальный
  текст расширяет view-model, но не генерируется в render.
- `src/render/demos_ui.ts`: только canvas-отрисовка готовых строк и профилей.

## Не Цели

Не делать:

- свободную марковскую цепь по всему корпусу реплик;
- hidden simulation разговоров всех `100_000` A-Life NPC;
- генерацию текста каждый кадр;
- скан всего `entities` или всего A-Life пула ради одной строки;
- сохранение длинных generated strings в save;
- новые runtime dependencies;
- морфологический движок русского языка;
- контентные ветки в `main.ts`, `core/world.ts`, render или broad AI;
- фразы, раскрывающие техническую геометрию мира или закрытые route/endgame
  факты.

## Принцип Генерации

Использовать `template-first Markov slots`, а не свободный текст.

Плохо:

```txt
общий корпус -> Markov -> вся фраза
```

Такой путь быстро рождает ложные факты и пустую поэзию.

Нужно:

```txt
intent + context tags -> safe template -> small domain slot -> validator
```

Пример формы:

```txt
{address}, {place_fact}. {action_or_warning}.
```

Пример результата:

```txt
Слесарь, у гермы шов мокрый. Сначала уплотнитель, потом разговор.
```

Марковская часть может собрать только слот вроде `{place_fact}` или
`{trade_excuse}`, где все варианты уже принадлежат одному домену и не спорят с
фактом.

## Контекстная Модель

Первый `MarkovTextContext` должен быть компактным и transient. Он строится на
момент реплики, bark attempt, Demos post render или social director tick.

Рекомендуемые поля:

```ts
interface MarkovTextContext {
  actorId?: number;
  actorAlifeId?: number;
  targetId?: number;
  targetAlifeId?: number;
  floorKey?: string;
  floor?: number;
  routeZBand?: 'center' | 'upper' | 'lower' | 'deep';
  roomType?: number;
  roomName?: string;
  zoneId?: number;
  zoneFaction?: number;
  faction?: number;
  occupation?: number;
  relationBand?: 'hostile' | 'cold' | 'neutral' | 'warm' | 'friend';
  socialEdgeFlags?: number;
  needBand?: 'ok' | 'low' | 'urgent';
  dangerBand?: 'quiet' | 'uneasy' | 'threat' | 'combat' | 'panic';
  wealthBand?: 'broke' | 'small' | 'payday' | 'fat';
  timeBand?: 'night' | 'morning' | 'work' | 'evening' | 'late';
  itemId?: string;
  itemName?: string;
  monsterKind?: number;
  eventType?: string;
  eventId?: number;
  tags: readonly string[];
}
```

Для active-floor talk/bark базой является `ContextSnapshot`. Для Demos posts и
reactions базой являются `WorldEvent`, A-Life snapshot и Demos social edge из
`demos.md`. Live entity data используется только если NPC реально
материализован на активном этаже.

## Десять Доменов

Каждый домен должен иметь:

- tags;
- короткие templates;
- Markov slot domains;
- fallback line;
- запреты на ложные факты.

| Домен | Контекстные входы | Абстрактный контракт фразы |
| --- | --- | --- |
| `space_move` | `x/y`, room, zone, floor key, route z, AI intent, lift/door, player distance | кто куда движется, откуда, через что, зачем, какой риск у прохода |
| `needs` | food/water/sleep/toilet/HP/PSI, room affordance, medicine/food/water items | нужда, ближайшее действие, цена промедления |
| `danger` | samosbor, hostile nearby, monsterKind, combat, danger facts, room memory | признак опасности, что нельзя делать, куда уходить |
| `wealth` | money, account, inventory value, shortage, production, trade context | чем расплатиться, что дорого, кто наживается, что стало дешевле/дороже |
| `items_use` | inventory/equipment, ammo/medicine/water/food lows, item tags, craft/use action | предмет, способ применения, ошибка новичка, кому нужен |
| `time_change` | clock, time bucket, recent facts, need delta, samosbor phase, floor transition | что изменилось с утра/после смены/после самосбора/после события |
| `relationships` | playerRelation, Demos edge relation, family/friend/enemy/debt flags, memory trust/fear | кто кому верит, кто кому должен, кто кого ищет или избегает |
| `factions` | NPC faction, zone owner, faction relation, faction event, territory fact | правило фракции, чужой сектор, процедура, цена помощи |
| `world_events` | `WorldEvent`, `ContextFact`, room memory, rumor event, caravan/quest/production/death | короткий след реального события и слуховая зацепка |
| `interactions` | player/NPC/monster event, target id, trade/theft/help/hurt/kill/talk, monsterKind | что сделал actor, кто видел, что изменилось для разговора |

## Базовые Фразовые Семейства

Это не готовый corpus, а универсальные формы, из которых можно сделать data
definitions. Они должны быть достаточно общими, но не пустыми.

### 1. Перемещения В Пространстве

```txt
{role} идёт {from_place}->{to_place}: {route_reason}.
{door_or_lift} сейчас {state}; {movement_advice}.
Если {path_feature}, то {safe_move}; если {danger_feature}, то {fallback_move}.
```

Примеры:

- `Кухня ближе через мокрый коридор, но там слышно щиток. Иди по сухой стене.`
- `Лифт сегодня считает не этажи, а ошибки. Сначала спроси, кто вышел последним.`

### 2. Потребности

```txt
{need} уже {severity}; {room_or_item} решает это быстрее разговора.
{role} без {resource} сначала злится, потом торгуется плохо.
```

Примеры:

- `Воды мало. Кухня ближе, чем геройство.`
- `Если не ел, не спорь у гермы: голодный первым открывает из жалости.`

### 3. Опасности

```txt
{danger_sign} означает {risk}; {counter_action}.
{monster_or_event} рядом; {do_not} и {escape_or_hide}.
```

Примеры:

- `Сирена пошла глухо. Не стой в коридоре, ищи герму.`
- `Бетонника слабым стволом не учат. Закрой дверь и уходи.`

### 4. Уровень Богатства

```txt
У {role} {wealth_state}; поэтому {trade_rule}.
После {event} цена {resource} стала {price_change}.
```

Примеры:

- `Денег у него мало, зато вода сухая и без лишних вопросов.`
- `Когда цех молчит, завтра говорит кладовщик.`

### 5. Обладание Вещами И Их Применение

```txt
{item} не просто вещь; {use_case}.
Если {item_state}, {wrong_use} нельзя; {right_use}.
```

Примеры:

- `Фильтр бери сухим. Мокрый фильтр не сушат, мокрый списывают.`
- `Патронов мало. Значит, каждый шум должен быть чужим.`

### 6. Изменения Во Времени

```txt
С {time_or_event} {thing} стало {new_state}; {new_rule}.
Раньше {old_rule}; теперь {new_rule}, потому что {event_trace}.
```

Примеры:

- `После отбоя сначала сверяют номер двери, потом спрашивают, кто стучал.`
- `Утром очередь была за водой, к вечеру стала за справкой о воде.`

### 7. Взаимоотношения

```txt
{person_a} к {person_b} {relation}; причина {reason}.
Если {edge_flag}, то {reaction}; если {betrayal}, то {consequence}.
```

Примеры:

- `Он тебе улыбается не за лицо, а за принесённую воду.`
- `Долг у двери помнят дольше, чем крик за дверью.`

### 8. Фракции

```txt
{faction} здесь {rule}; чужим {cost_or_warning}.
В секторе {owner} {allowed_action}, но {forbidden_action}.
```

Примеры:

- `Ликвидаторы сначала считают своих, потом чужих, потом то, что нельзя оставить в коридоре.`
- `Дикие берут хлеб не за доброту, а за тихий обход.`

### 9. События Мира

```txt
{event_trace}: {who_or_place} теперь {state}. {lead_or_warning}.
После {event} {room_or_faction} делает {new_behavior}.
```

Примеры:

- `После самосбора здесь сначала считают дыхание, потом людей, потом долги.`
- `Караван задержался у лифта. Если ждёшь бинты, жди ещё и претензии.`

### 10. Взаимодействия С Игроком, NPC И Монстрами

```txt
{actor} сделал {action}; {witness_reaction}.
{monster} встретили у {place}; {counterplay_or_rumor}.
{player_action} изменило {relation_or_room_memory}.
```

Примеры:

- `Говорят, ты воду принёс без списка. За такое имя запоминают.`
- `После твоей кражи общий шкаф закрывают громче, чем герму.`

## Data Shape

Первый data layer должен быть plain objects в `src/data/markov_text.ts` или
близком файле.

```ts
type MarkovIntent =
  | 'talk_ambient'
  | 'talk_context'
  | 'bark_ambient'
  | 'demos_post'
  | 'demos_reaction';

interface MarkovTemplate {
  id: string;
  intent: MarkovIntent;
  domains: readonly string[];
  requiredTags?: readonly string[];
  blockedTags?: readonly string[];
  weight: number;
  maxChars: number;
  parts: readonly MarkovTemplatePart[];
  fallback: string;
}

type MarkovTemplatePart =
  | { kind: 'literal'; text: string }
  | { kind: 'arg'; key: string; fallback: string }
  | { kind: 'slot'; domain: string; minTokens: number; maxTokens: number };

interface MarkovDomain {
  id: string;
  order: 1 | 2;
  tags: readonly string[];
  starts: readonly string[];
  transitions: Readonly<Record<string, readonly string[]>>;
  ends: readonly string[];
}
```

Для русского языка лучше хранить согласованные короткие фрагменты, а не
пытаться склонять произвольные слова на лету.

## Алгоритм

1. Собрать `MarkovTextContext` из существующего источника.
2. Выбрать `intent`: talk, bark, Demos post или reaction.
3. Превратить context в tags: `room.kitchen`, `need.water.urgent`,
   `danger.samosbor.warning`, `relation.friend`, `faction.liquidator`.
4. Отфильтровать templates по `intent`, `requiredTags`, `blockedTags`.
5. Выбрать template seeded weighted random.
6. Для каждого `arg` вставить факт из context или безопасный fallback.
7. Для каждого `slot` сгенерировать 2-8 токенов из доменной цепи.
8. Прогнать validator.
9. Если validator провален, вернуть `template.fallback`.

Seed:

```txt
runSeed + floorKey + actorAlifeId/entityId + eventId/templateId + contextHash + repeatIndex
```

Не использовать `Math.random()` для persistent-visible Demos text. Для обычного
transient talk можно оставить runtime variation только если строка не пишется в
save/feed и не используется как durable social fact.

## Validator

Минимальные правила:

- строка не пустая;
- нет незамененных `{slot}`;
- длина в пределах `maxChars`;
- нет соседних одинаковых токенов;
- нет одной биграммы более двух раз;
- есть хотя бы один anchor: room, item, faction, need, event, actor или action;
- нет запрещенных слов/формул из tone blacklist;
- нет технических раскрытий вроде `1024x1024`, `toroid`, `seed`, internal id,
  если это player-facing текст;
- нет англоязычных placeholder-остатков;
- Demos post не говорит о событии без `eventId` или explicit compact fact.

Fallback обязан быть у каждого template и каждого intent.

## Demos Integration

`demos.md` уже планирует social graph, posts и reactions. Markov text должен
быть его текстовым слоем, а не отдельным владельцем социальных фактов.

Для Demos:

```txt
WorldEvent / migration summary / economy fact / quest fact
  -> Demos post candidate
  -> author selection
  -> compact args
  -> templateId + seed + tags
  -> rendered Markov text
```

Post storage должен быть compact:

```ts
interface DemosMarkovPost {
  id: number;
  authorAlifeId: number;
  createdAt: number;
  sourceEventId?: number;
  templateId: string;
  seed: number;
  args: readonly string[];
  tags: readonly string[];
}
```

Не хранить generated string как основной save payload. Если persistent posts
появятся, save shape bump обязателен, а sanitizer должен резать ids, args, tags
и caps.

Реакции выбираются только из outgoing Demos edges автора поста, максимум по
локальным slots. Не сканировать "кто знает автора" по всему A-Life пулу.

## Dialogue Integration

В `generateTalkText()` порядок должен остаться:

```txt
plot authored lines
context high-signal line
rumor line
AI state line
Markov ambient/context fallback
generic curated pools
```

Markov не должен перебивать:

- plot talk;
- active quest target text;
- recent theft/fear/wound/hunger/samosbor warning;
- selected rumor lead;
- exact combat/safety bark.

`NpcMemory` можно использовать для cooldown/repeat index, но не раздувать его
длинными строками.

## Bark Integration

Для bark path:

- только ambient, witness flavor или lead;
- не для alert/combat/samosbor critical warnings;
- уважать existing hearing radius, cooldown и HUD/log priority;
- не строить полный `ContextSnapshot`, если bark path не имеет `GameState`;
- брать уже доступный local fact или lightweight context.

## Производительность

Бюджеты первого implementation slice:

```txt
MARKOV_MAX_OUTPUT_CHARS_TALK = 140
MARKOV_MAX_OUTPUT_CHARS_BARK = 96
MARKOV_MAX_OUTPUT_CHARS_DEMOS = 180
MARKOV_SLOT_TOKEN_CAP = 8
MARKOV_TEMPLATE_ATTEMPTS = 3
MARKOV_CONTEXT_EVENT_SCAN = 5
MARKOV_GLOBAL_LINES_PER_SECOND = 8
MARKOV_NPC_COOLDOWN_SECONDS = 30..90
```

Правила:

- chain/domain cache строится один раз лениво и переиспользуется;
- никакого JSON parse/stringify в hot path;
- никакого full-world scan;
- threat/nearby context берётся из AI/index/facts или bounded nearby query;
- Demos social director создаёт максимум несколько text outcomes per tick;
- render только отображает готовый view-model.

## Save And Load

Первый slice должен быть transient и не менять save shape.

Save shape меняется только когда появляются persistent Demos posts/reactions или
relation overrides. Тогда:

- bump `SAVE_SHAPE_VERSION`;
- stale saves reject по текущей политике проекта;
- save хранит `templateId`, `seed`, короткие `args`, ids и tags;
- caps: posts <= 512, reactions <= 2048, args strings <= 48 chars, tags <= 8;
- sanitizer drop/clamp invalid ids, tags, strings и orphan reactions.

## Реализационные Срезы

### Slice 0: План

Файлы:

- `markov.md`.

Проверка:

- `git diff --check`.

### Slice 1: Transient Markov Core

Файлы:

- `src/data/markov_text.ts`;
- `src/systems/markov_text.ts`;
- `tests/markov-text.test.ts`.

Acceptance:

- deterministic output for same seed/context;
- invalid template/domain ids fail tests;
- output length caps work;
- fallback covers every intent;
- no save shape change.

Проверка:

- `npm run typecheck`;
- `npm run test:unit`.

### Slice 2: Dialogue Fallback

Файлы:

- `src/systems/dialogue.ts` narrow hook;
- tests for generated talk selection.

Acceptance:

- authored/context/rumor lines still win;
- Markov appears only as ambient fallback;
- NPC cooldown/repeat is bounded.

Проверка:

- `npm run check:readonly`.

### Slice 3: Demos Feed Text

Файлы:

- `src/data/demos_posts.ts`;
- `src/systems/demos_posts.ts`;
- `src/systems/demos.ts`;
- `src/render/demos_ui.ts`;
- `tests/demos*.test.ts`.

Acceptance:

- Demos feed candidates come from `WorldEvent` observer or existing summaries;
- post ring cap works;
- text resolves names lazily;
- UI does not scan all A-Life profiles per frame;
- no inactive floor loading.

Проверка:

- `npm run check:readonly`;
- `npm run check:browser` when UI changes and Chrome is available.

### Slice 4: Persistent Posts/Reactions

Файлы:

- `src/systems/save_runtime.ts`;
- `src/systems/save_payload.ts`;
- `save.md`;
- persistence tests.

Acceptance:

- save shape bumped;
- sanitizer caps posts/reactions/args/tags;
- stale save rejected;
- generated strings are reconstructed, not stored as full graph text.

Проверка:

- `npm run check`.

### Slice 5: Social Reactions And Rare Visits

Only after Demos social graph works.

Acceptance:

- reactions use outgoing social edges only;
- friends/family/enemies produce different tone;
- any movement uses normal A-Life migration/arrival systems;
- Demos never creates ordinary NPC refill.

Проверка:

- `npm run check`;
- browser validation if Demos UI changes.

## Тон И Запреты

Каждая строка должна отвечать хотя бы на один вопрос:

- кто говорит;
- где это;
- что произошло;
- что надо сделать;
- что можно получить;
- что можно потерять;
- какая вещь, дверь, очередь, долг, труба, талон, комната или сосед важны.

Запрещенный общий тон:

- `вечность`, `бездна`, `мироздание`, `память бетона`, `дом выбрал`,
  `геометрия жаждет`, `алгоритм страдания`;
- `избранный`, `пророк`, `спаситель`;
- технические player-facing раскрытия маршрута, seed, тороидальности или
  размеров мира;
- спойлеры Пустоты и эндгейма до явного раскрытия;
- гладкая трейлерная поэзия вместо действия.

Правильное направление:

```txt
Плохо: Дом помнит твою жажду.
Хорошо: Кухня утром была за углом, сейчас за шкафом. Воду бери по списку.
```

```txt
Плохо: Тварь ждёт твоего страха.
Хорошо: Если лампоглаз гудит у двери, лампу не включай. Отойди и зови ликвидатора.
```

## Definition Of Done

Система считается готовой, когда:

- NPC talk получает контекстный procedural fallback без поломки authored и rumor
  слоев;
- Demos posts/reactions могут звучать вариативно, но опираются на реальные
  события и compact social facts;
- Markov не выдумывает мир, а формулирует уже выбранный факт;
- generated text bounded по длине, частоте, seed и context;
- save не раздувается длинными строками;
- render/UI не генерирует gameplay text;
- тесты ловят пустые строки, битые slots, nondeterminism, превышение caps и
  tone blacklist.

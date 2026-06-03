# Markov NPC Text Implementation

> План единого контекстного контура для обычной NPC-речи: диалоги, bark-строки,
> NPC-реплики в логах, процедурные квесты, посты и реакции `Инфосети Демос`
> через шаблонно-марковский слой. Это implementation contract и batch index
> для будущей реализации, а не shipped fact. Фактическое состояние проверять по
> `README.md`, `demos.md`, текущим `src/` и тестам.

Этот документ не про route-floor `markov_stairwell` / `Марковская лестница`.
Тот этаж уже является генераторной марковской лестничной цепью. Здесь речь о
процедурном тексте NPC на основе игрового контекста.

Связанные agent task prompts:

- `markov_0.md`: индексатор batch, общий контракт и порядок запуска.
- `markov_1.md`: transient Markov core и compiled data pack.
- `markov_2.md`: context model и universal speech router.
- `markov_3.md`: dialogue, rumor и procedural quest adapters.
- `markov_4.md`: bark и log-speech adapters.
- `markov_5.md`: Demos feed/post/reaction text layer.
- `markov_6.md`: финальный orchestrator после всех parallel workers.

## Цель

Сделать фразы NPC более живыми и контекстными без новой скрытой симуляции.
Целевое состояние: всё, что обычные NPC говорят в диалогах, локальных логах,
ambient/witness barks, процедурных квестах, Demos posts и Demos reactions,
идёт через одну универсальную `Markov NPC Text` систему.

Исключения:

- lore/design quests и сюжетные route-floor сцены с написанными сценаристом
  строками;
- специальные реплики authored NPC, plot NPC и ручные character beats;
- точные системные HUD/log сообщения, которые не являются речью NPC.

Такие исключения могут проходить через тот же router как `locked_author_text`,
но не должны перегенерироваться марковской цепью.

Нужен bounded генератор, который:

- берет реальные игровые факты: комнату, зону, нужды, предметы, опасность,
  фракцию, отношение, событие, A-Life snapshot или Demos social edge;
- собирает короткую фразу через безопасный шаблон;
- использует марковскую цепь только внутри ограниченных слотов;
- не выдумывает смерти, долги, маршруты, предметы, визиты и квесты;
- объединяет обычные NPC speech surfaces вместо разрозненных fallback pools;
- пропускает authored/scenarist text как locked exact output, если строка
  относится к lore/design quest, plot scene или специальной ручной реплике.

Главная схема:

```txt
WorldEvent / ContextSnapshot / A-Life snapshot / Demos edge
  -> MarkovTextContext
  -> template-first phrase
  -> bounded Markov slots
  -> validator
  -> talk line, log speech, procedural quest line, bark, Demos post/reaction
```

## Единый Speech Router

Все новые обычные NPC-высказывания должны входить в систему через один router,
а не через отдельные локальные массивы строк в каждом модуле.

Целевые surfaces:

- `dialogue`: обычный talk, контекстный talk, reaction talk;
- `log_speech`: NPC-фразы, которые попадают в HUD/log как услышанная речь;
- `bark`: ambient, witness и lead barks;
- `procedural_quest`: процедурные задания, выдача, напоминание, провал,
  завершение и бытовая реакция на procedural quest facts;
- `demos_post`: посты `Инфосети Демос`;
- `demos_reaction`: реакции NPC на Demos posts;
- `rumor_flavor`: короткая переформулировка уже выбранного слуха без потери
  `rumorId`.

Authored сценаристский текст не исчезает. Он должен быть представлен как
отдельный source kind:

```txt
source = generated_markov | curated_pool | locked_author_text
```

`locked_author_text` возвращает точную строку и нужен для:

- главного сюжета;
- lore/design quests;
- спецреплик named NPC;
- ручных floor scenes;
- критичных предупреждений, где важна точная инструкция.

Так система становится единым маршрутизатором речи, но не стирает авторские
строки.

## Implementation Shape

Система должна быть маленькой и монолитной по внешнему взаимодействию: одна
точка входа для обычной procedural speech, несколько data/runtime модулей
внутри и никаких локальных параллельных генераторов в отдельных системах.

Целевые новые модули:

```txt
src/data/markov_text.ts
  author-facing domains, atoms, templates, corpus, fallbacks, tone blacklist

src/systems/markov_text.ts
  lazy compile, typed numeric pack, seeded decode, validators

src/systems/markov_context.ts
  ContextSnapshot / WorldEvent / Quest / Demos candidate -> MarkovTextContext

src/systems/speech_router.ts
  one public router: locked exact text, generated text, curated fallback

src/systems/markov_dialogue.ts
src/systems/markov_rumor.ts
src/systems/markov_procedural_quests.ts
src/systems/markov_barks.ts
src/systems/markov_log_speech.ts
src/systems/demos_posts.ts
  narrow adapters owned by domain surfaces, wired by the final orchestrator
```

Target public API:

```ts
type MarkovSource = 'generated_markov' | 'curated_pool' | 'locked_author_text';

interface SpeechRouterRequest {
  intent: MarkovIntent;
  source?: MarkovSource;
  context: MarkovTextContext;
  lockedText?: string;
  exactFallback?: string;
  repeatIndex?: number;
  maxChars?: number;
}

interface SpeechRouterResult {
  text: string;
  source: MarkovSource;
  intent: MarkovIntent;
  templateId?: string;
  domainId?: string;
  tags: readonly string[];
  fallbackUsed: boolean;
}

function routeSpeech(request: SpeechRouterRequest): SpeechRouterResult;
function generateMarkovText(request: SpeechRouterRequest): SpeechRouterResult;
function validateMarkovTextData(): readonly string[];
```

Only `routeSpeech()` should be called by gameplay systems after integration.
Direct calls to `generateMarkovText()` are for tests and internal adapters.

Layer ownership:

- `data/markov_text.ts` owns text definitions only. No world mutation, no DOM,
  no frame logic.
- `systems/markov_text.ts` owns math and bounded runtime generation. No save
  state, no entity scans, no Demos social decisions.
- `systems/markov_context.ts` owns context lowering into compact ids/tags/bands.
  It reads provided facts only; it does not search the world for missing facts.
- `systems/speech_router.ts` owns source priority and fallbacks.
- `render/` only draws ready strings. It never generates text.
- `main.ts`, `core/world.ts` and `render/webgl.ts` stay untouched unless a final
  orchestrator finds a truly generic hook requirement.

The implementation should prefer one working route:

```txt
existing fact -> MarkovTextContext -> routeSpeech() -> existing surface
```

over broad new social/text systems. Demos persistence and full social graph are
later slices, not prerequisites for the transient Markov speech core.

## Текущие Опоры

Существующие точки, которые надо использовать вместо нового параллельного
контура:

- `src/systems/dialogue.ts`: `generateTalkText()` сейчас идёт по слоям
  `plot -> context -> rumor -> AI state -> generic pools`. Цель - перевести
  обычные context/generic/procedural строки на единый router, оставив plot и
  спецреплики как `locked_author_text`.
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
  dedupe и audibility. Структурные системные сообщения остаются точными, но
  NPC-речь, попадающая в лог как услышанная фраза, должна идти через speech
  router.
- `src/systems/ai/barks.ts`: bark path должен оставаться bounded и radius-aware.
  Markov допустим для ambient/lead flavor, не для тревожных alerts.
- `src/systems/demos.ts`: Demos view-model читает A-Life snapshots. Социальный
  текст расширяет view-model, но не генерируется в render.
- `src/render/demos_ui.ts`: только canvas-отрисовка готовых строк и профилей.

## Surface Classification

Все player-facing строки не становятся Markov. Система обслуживает обычную
процедурную речь и социальную формулировку фактов; точные инструкции и authored
сцены остаются exact.

| Surface | Current files | Markov intent/source | Rule |
| --- | --- | --- | --- |
| Ordinary NPC talk | `src/systems/dialogue.ts`, `src/data/dialogue.ts`, `src/data/context_lines.ts` | `talk_context`, `talk_ambient`, `generated_markov` or `curated_pool` | Plot and named special lines stay `locked_author_text`; ordinary context/generic pools migrate into router definitions. |
| Rumor flavor | `src/systems/rumor.ts`, `src/data/rumors.ts` | `rumor_flavor`, `generated_markov` | Selected `rumorId`, lead and reveal facts remain authoritative; Markov only rephrases short flavor around them. |
| Procedural quest speech | `src/systems/quests.ts`, `src/data/contracts.ts` | `procedural_quest`, `generated_markov` | Quest target, reward, deadline and route facts come from `Quest`/`ContractDef`; authored plot and side quests remain locked. |
| NPC bark ambient/lead/witness | `src/systems/ai/barks.ts` | `bark_ambient`, `log_speech`, `generated_markov` | Ambient, arrival/lead and non-critical witness flavor may route through Markov. Combat alerts, flee/wounded critical lines and samosbor shelter instructions stay exact. |
| NPC speech in log/HUD | `pushNpcLogMessage()`, `pushNpcBarkMessage()` | `log_speech` | Only text spoken by an NPC goes through router. Radius, HUD priority and audibility remain owned by bark/log systems. |
| Structured world log | `src/systems/world_log.ts` | usually exact system text | `eventText()` stays exact for gameplay telemetry, warnings, item pickup/use, quest status, samosbor, hazards and monster mechanics. Optional NPC social paraphrase can be a separate event-derived speech line. |
| Notes/documents | `src/data/notes.ts`, explicit `note` drops in `src/gen/**` | mostly `locked_author_text`; future `procedural_note` only if added deliberately | Existing lore notes are authored content. Do not Markov-regenerate them by default. Future procedural notes must be grounded in existing item/room/event facts. |
| Demos profile labels | `src/systems/demos.ts`, `src/render/demos_ui.ts` | exact UI labels | Relation/faction/occupation/location labels stay exact view-model text. |
| Demos posts/reactions | future `src/data/demos_posts.ts`, `src/systems/demos_posts.ts` | `demos_post`, `demos_reaction` | Posts/reactions are generated from `WorldEvent`, A-Life snapshot and supplied social edges. No hidden simulation. |
| Net Sphere chat | `src/systems/net_sphere.ts` | out of scope | Player/network chat is not corpus and is not regenerated. Failure/status messages remain exact. |
| Debug/editor/UI controls | `src/systems/debug*`, HUD/menu/control files | out of scope | Not corpus, not Markov output. |

Migration priority:

1. `talk_context` and `talk_ambient` fallback.
2. Ambient/lead bark flavor.
3. Rumor flavor that preserves `rumorId`.
4. Procedural quest speech around existing `Quest`/`ContractDef` facts.
5. Explicit NPC `log_speech` only where a speaker exists.
6. Demos transient posts/reactions.
7. Persistent Demos feed only after save shape bump and sanitizer work.

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
- перегенерацию lore/design quests и спецреплик, написанных сценаристом;
- фразы, раскрывающие техническую геометрию мира или закрытые route/endgame
  факты.

## Принцип Генерации

Использовать не "цепь слов", а условную вероятностную модель короткой речи:
семантический skeleton выбирает факт, template фиксирует грамматическую форму, а
марковская часть заполняет только согласованный слот.

Плохо:

```txt
общий корпус -> Markov -> вся фраза
```

Такой путь быстро рождает ложные факты, случайную поэзию и одинаковый голос.

Нужно:

```txt
intent + grounded facts + context tag mask
  -> template / finite-state skeleton
  -> conditional variable-order Markov slot
  -> scored candidates
  -> semantic + tone validator
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
фактом. Для русского языка слот должен работать не с произвольными словами, а с
короткими `phrase atoms`: уже согласованными кусками длиной 1-4 токена,
помеченными классом, тоном и domain tags.

## Математическая Модель

Состояние генератора должно быть явным:

```txt
S_t = domainId, intent, source, styleMask, contextTagMask,
      prevClass2, prevClass1, prevToken2, prevToken1,
      requiredAnchorMask, producedAnchorMask, tokenBudget
```

Переход не равен "следующее слово после предыдущего слова". Кандидат
оценивается как интерполированная вероятность и набор штрафов:

```txt
score(a | h, c) =
  log P_interp(a | h, c)
  + w_tag * tagMatch(a, c)
  + w_anchor * anchorGain(a, c)
  + w_style * styleMatch(a, c)
  - repeatPenalty(a, h)
  - unsupportedFactPenalty(a, c)
  - tonePenalty(a)
```

`a` - token/phrase atom candidate, `h` - локальная история, `c` - compact
context. Для первого slice достаточно integer/fixed-point weights; floating
math допустим только во время одной реплики, не как persistent payload.

Интерполяция:

```txt
P_interp =
  lambda3(c) * P3(a | prev2, prev1, domain)
  + lambda2(c) * P2(a | prev1, domain)
  + lambda1(c) * P1(a | class(prev1), domain, contextTags)
  + lambda0(c) * P0(a | domain)
```

Где `lambda*` зависят от плотности корпуса и context confidence. Если точной
триграммы мало, модель плавно отступает к биграмме, классу и доменному unigram,
а не ломается. Для маленького корпуса использовать простое absolute discount /
Witten-Bell style backoff; полноценная библиотека language model не нужна.

Сильная цепь обязана иметь:

- variable order `1..3`, а не фиксированный `order: 1 | 2`;
- class-based fallback: `place -> state -> advice`, `need -> severity -> action`;
- context-conditioned weights через tag bitsets;
- repetition penalties и end-state scoring;
- grounded anchors: итоговая строка обязана содержать факт из context или
  template arg;
- finite-state slot schema: недопустимые классы не входят в candidate set.

То есть Markov здесь ближе к маленькому weighted finite-state transducer, чем к
детской склейке слов. Он генерирует вариативный способ сказать уже выбранный
факт, а не выбирает факт за игру.

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

## Corpus And Statistics

Корпус первого slice не должен собираться из всего проекта подряд. Источники:

- `src/data/dialogue.ts`: обычные faction/occupation/generic lines, кроме plot
  и named special beats;
- `src/data/context_lines.ts`: context pools как главная размеченная база;
- ambient/witness/lead части `src/systems/ai/barks.ts`, но не combat alerts,
  exact samosbor warnings и safety-critical короткие команды;
- будущие procedural quest strings только после привязки к quest facts;
- Demos post/reaction corpus только из Demos definitions, не из Net Sphere chat.

Каждая training line должна получить:

- `domain`;
- `intent`;
- `source`;
- `styleTags`: сухо, бытово, ругань, медпункт, цех, очередь, патруль;
- `contextTags`: room, need, faction, danger, event, relation;
- `anchorKinds`: какие факты строка умеет безопасно озвучивать;
- `blockedTags`: где строка становится ложной или спойлерной.

Токенизация не должна быть наивным `split(' ')`. Нужен compile step:

```txt
line -> phrase atoms -> token ids -> class ids -> domain counts -> transitions
```

Phrase atom - это короткий согласованный фрагмент:

```txt
"у гермы"         class=place_ref     tags=door, shelter
"шов мокрый"      class=state_fact    tags=repair, water
"сначала"         class=order_marker  tags=advice
"не геройствуй"   class=action_ban    tags=danger
```

Для русского языка это важнее морфологии. Система не склоняет произвольные
слова, а выбирает уже пригодный фрагмент нужного класса. Слоты могут соединять
атомы только по разрешенной class path, например:

```txt
place_ref -> state_fact -> order_marker -> action_advice
need_ref -> severity_ref -> room_or_item_ref -> action_advice
event_ref -> consequence_fact -> lead_or_warning
```

Статистический аудит corpus нужен до runtime:

- у каждого domain минимум несколько независимых lines и fallback;
- нет domain, где одна строка дает больше половины всех transition counts;
- нет atom без class id;
- нет class path, который не имеет terminal state;
- нет corpus line, раскрывающей запрещенные route/endgame/internal facts;
- blacklisted tone words не попадают в generated domains.

## Data Shape And Compiled Pack

Author-facing data layer должен быть plain objects в `src/data/markov_text.ts`
или близком файле. Runtime layer должен один раз скомпилировать эти objects в
компактный pack с numeric ids и typed arrays.

```ts
type MarkovIntent =
  | 'talk_ambient'
  | 'talk_context'
  | 'log_speech'
  | 'bark_ambient'
  | 'procedural_quest'
  | 'rumor_flavor'
  | 'demos_post'
  | 'demos_reaction'
  | 'locked_author_text';

type MarkovSource = 'generated_markov' | 'curated_pool' | 'locked_author_text';

type MarkovAtomClass =
  | 'address'
  | 'place_ref'
  | 'need_ref'
  | 'event_ref'
  | 'item_ref'
  | 'faction_ref'
  | 'state_fact'
  | 'severity_ref'
  | 'order_marker'
  | 'action_advice'
  | 'action_ban'
  | 'trade_rule'
  | 'relation_fact'
  | 'terminal';

interface MarkovTemplate {
  id: string;
  intent: MarkovIntent;
  source: MarkovSource;
  domains: readonly string[];
  requiredTags?: readonly string[];
  blockedTags?: readonly string[];
  requiredAnchors?: readonly string[];
  weight: number;
  scoreBias?: number;
  maxChars: number;
  parts: readonly MarkovTemplatePart[];
  fallback: string;
}

type MarkovTemplatePart =
  | { kind: 'literal'; text: string }
  | { kind: 'arg'; key: string; fallback: string; anchor?: string }
  | {
      kind: 'slot';
      domain: string;
      minAtoms: number;
      maxAtoms: number;
      allowedClassPaths: readonly (readonly MarkovAtomClass[])[];
      requiredAnchors?: readonly string[];
    };

interface MarkovCorpusLine {
  id: string;
  domain: string;
  intent: MarkovIntent;
  source: Exclude<MarkovSource, 'locked_author_text'>;
  text: string;
  weight?: number;
  styleTags?: readonly string[];
  contextTags?: readonly string[];
  anchorKinds?: readonly string[];
  blockedTags?: readonly string[];
}

interface MarkovAtomDef {
  id: string;
  text: string;
  class: MarkovAtomClass;
  tags?: readonly string[];
  anchorKind?: string;
  weight?: number;
}

interface MarkovDomain {
  id: string;
  maxOrder: 1 | 2 | 3;
  tags: readonly string[];
  allowedIntents: readonly MarkovIntent[];
  corpus: readonly MarkovCorpusLine[];
  atoms?: readonly MarkovAtomDef[];
  fallback: string;
}
```

Compiled pack shape is implementation-owned and may stay internal:

```ts
interface CompiledMarkovDomain {
  id: string;
  atomText: readonly string[];
  atomClass: Uint8Array;
  atomTagMask: Uint32Array;
  atomAnchorMask: Uint16Array;
  starts: Uint16Array;
  terminalMask: Uint8Array;
  transFrom: Uint32Array;
  transTo: Uint16Array;
  transWeight: Uint16Array;
  classTransFrom: Uint16Array;
  classTransTo: Uint8Array;
  classTransWeight: Uint16Array;
}
```

No object graph is needed in the hot path after compile. `string` arrays may
exist for final rendering, but selection should use numeric ids, masks and
weights.

## Алгоритм

1. Собрать `MarkovTextContext` из существующего источника.
2. Выбрать `intent`: talk, log speech, bark, procedural quest, rumor flavor,
   Demos post/reaction или `locked_author_text`.
3. Если `intent/source` равен `locked_author_text`, вернуть точную строку через
   router и выйти.
4. Превратить context в bitset/tag set: `room.kitchen`,
   `need.water.urgent`, `danger.samosbor.warning`, `relation.friend`,
   `faction.liquidator`.
5. Отфильтровать templates по `intent`, source, required/blocked tags и
   required anchors.
6. Посчитать score для template, а не выбирать голый random pool:

```txt
templateScore =
  baseWeight
  + matchedRequiredTags
  + matchedDomainTags
  + anchorCoverage
  - blockedNearMissPenalty
  + repeatCooldownBias
```

7. Выбрать template seeded weighted random из верхнего bounded набора.
8. Для каждого `arg` вставить только grounded факт из context или безопасный
   fallback.
9. Для каждого `slot` построить 4-8 candidate paths через beam search по
   `CompiledMarkovDomain`.
10. Для path использовать variable-order backoff: trigram -> bigram -> class
    transition -> domain unigram.
11. Выбрать один path seeded weighted random по итоговому score, а не первый
    успешный.
12. Прогнать validator.
13. Если validator провален, сделать bounded retry с другим candidate path.
14. Если все attempts провалены, вернуть `template.fallback`.

Seed:

```txt
runSeed + floorKey + actorAlifeId/entityId + eventId/templateId + contextHash + repeatIndex
```

`contextHash` должен быть compact и стабильным: только ids/bands/tags, без
сырого текста комнаты длиннее cap. Не использовать `Math.random()` для
persistent-visible Demos text. Для ordinary transient talk можно оставить
runtime variation только если строка не пишется в save/feed и не используется
как durable social fact.

## Validator

Минимальные правила:

- строка не пустая;
- нет незамененных `{slot}`;
- длина в пределах `maxChars`;
- нет соседних одинаковых atom/text tokens;
- нет одной биграммы более двух раз;
- class path дошел до terminal state;
- есть хотя бы один anchor: room, item, faction, need, event, actor или action;
- каждый named предмет, monster, faction, route или NPC пришёл из context args,
  template args или разрешенного domain atom;
- нет запрещенных слов/формул из tone blacklist;
- нет технических раскрытий вроде `1024x1024`, `toroid`, `seed`, internal id,
  если это player-facing текст;
- нет англоязычных placeholder-остатков;
- нет поздних route/endgame spoilers без явного раскрытия;
- Demos post не говорит о событии без `eventId` или explicit compact fact;
- procedural quest line не обещает reward, target, route или deadline, если
  этого нет в quest payload.

Fallback обязан быть у каждого template, domain и intent.

## Quality Gates

Тесты должны проверять не "строка сгенерировалась", а качество вероятностной
системы.

Минимальный набор:

- determinism: один seed/context даёт один output;
- variation: разные `repeatIndex` дают разные outputs при достаточном corpus;
- fallback rate: в generation matrix fallback не должен становиться основным
  ответом домена;
- distinct-2 / repeated bigram audit: generated batch не зацикливается;
- grounded fact audit: строка не содержит named fact, которого нет в context;
- domain isolation: hungry/medical/trade/danger atoms не смешиваются без общего
  allowed tag;
- class path audit: каждый slot path заканчивается terminal class;
- tone blacklist audit по `scenarist.md`;
- Demos persistence audit: post хранит `templateId`, seed, args и tags, а не
  длинный generated text;
- no-Math-random audit для persistent-visible calls.

Допустимая "умность" измеряется не длиной фразы. Хороший output:

- короткий;
- говорит один реальный факт;
- имеет предмет/место/действие;
- не звучит как гладкая трейлерная метафора;
- варьируется в пределах домена, а не между всеми репликами игры.

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

## Dialogue, Log And Quest Integration

Цель не в том, чтобы Markov был последним fallback. Цель - чтобы обычная
NPC-речь шла через один speech router, а разные поверхности отличались
`intent`, context tags и source kind.

Целевой порядок внутри router:

```txt
locked_author_text for lore/design/plot/special lines
high-signal exact gameplay line when instruction must stay fixed
rumor_flavor with stable rumorId
procedural_quest speech
log_speech / bark / talk generated_markov
curated_pool fallback through the same router
```

Router не должен перегенерировать:

- plot talk;
- lore/design quest text;
- спецреплики named NPC;
- active quest target text, если оно написано сценаристом;
- selected rumor lead;
- exact combat/safety bark;
- точные системные world-log сообщения, которые не являются речью NPC.

Обычные context/generic реплики, NPC-фразы в логах и procedural quest strings
должны постепенно переехать из отдельных массивов в data definitions этого
router. Старые curated pools могут быть первым corpus/source, но точка вызова
должна стать единой.

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
MARKOV_SLOT_ATOM_CAP = 8
MARKOV_SLOT_BEAM_WIDTH = 6
MARKOV_SLOT_CANDIDATE_CAP = 8
MARKOV_TEMPLATE_ATTEMPTS = 3
MARKOV_CHAIN_ORDER_MAX = 3
MARKOV_CONTEXT_EVENT_SCAN = 5
MARKOV_GLOBAL_LINES_PER_SECOND = 8
MARKOV_NPC_COOLDOWN_SECONDS = 30..90
```

Правила:

- domain compile cache строится один раз лениво и переиспользуется;
- author-facing definitions могут быть objects, но hot path работает по ids,
  masks и typed arrays;
- никакого JSON parse/stringify в hot path;
- никакого full-world scan;
- threat/nearby context берётся из AI/index/facts или bounded nearby query;
- Demos social director создаёт максимум несколько text outcomes per tick;
- beam/candidate arrays переиспользуются или ограничены маленькими локальными
  buffers;
- corpus audit и compile validation идут в tests/static checks, не каждый кадр;
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
- author-facing data compiles into a numeric domain pack;
- variable-order backoff works when trigram/bigram context is missing;
- class paths restrict invalid atom sequences;
- candidate scoring prefers grounded anchors over generic filler;
- invalid template/domain ids fail tests;
- output length caps work;
- fallback covers every intent;
- corpus audit catches orphan atoms, missing terminal classes and blocked tone;
- no save shape change.

Проверка:

- `npm run typecheck`;
- `npm run test:unit`.

### Slice 2: Universal NPC Speech Routing

Файлы:

- `src/systems/dialogue.ts` narrow hook;
- NPC log-speech call sites as narrow hooks;
- procedural quest text call sites as narrow hooks;
- tests for generated talk/log/procedural quest selection.

Acceptance:

- ordinary talk, log speech and procedural quest lines use the same router;
- lore/design quests and scripted special lines return `locked_author_text`;
- exact critical warnings still win when gameplay readability requires it;
- old curated pools are reachable only through router source definitions;
- old context pools are converted or wrapped as corpus/domain definitions, not
  copied into a second random fallback;
- generated text carries at least one grounded context anchor;
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

- обычные NPC talk, bark, NPC-речь в логах и процедурные quest lines идут через
  единый speech router;
- lore/design quests, plot scenes и спецреплики сценариста остаются точными
  `locked_author_text`, а не марковской перегенерацией;
- Demos posts/reactions могут звучать вариативно, но опираются на реальные
  события и compact social facts;
- Markov не выдумывает мир, а формулирует уже выбранный факт;
- Markov core использует context-conditioned variable-order transitions,
  class-based backoff и scored bounded decoding;
- generated строка проходит grounded fact, class path, repetition, tone и
  spoiler validators;
- corpus/compiled-pack audit ловит домены без fallback, terminal states и
  достаточного transition diversity;
- generated text bounded по длине, частоте, seed и context;
- save не раздувается длинными строками;
- render/UI не генерирует gameplay text;
- тесты ловят пустые строки, битые slots, nondeterminism, превышение caps и
  tone blacklist.

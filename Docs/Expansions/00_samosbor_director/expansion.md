# Expansion 00: Диспетчер Самосбора

Версия: 0.1 design  
Статус: обязательный foundation-expansion  
Роль в линейке: campaign director, cross-expansion glue, pacing, escalation, telemetry  
Базовые источники: `README.md`, `desdoc.md`, `Docs/Expansions/INDEX.md`, все 10 expansion-пакетов

## Назначение

«Диспетчер Самосбора» нужен, чтобы десять сильных expansion-документов не превратились в десять независимых островов. Это слой режиссуры кампании: он знает, какие системы уже открыты, что недавно случилось, где игрок был, какие фракции давят, какие ресурсы в дефиците, какой самосборный вариант давно не появлялся и какой expansion hook сейчас даст лучший игровой момент.

Это не AI Director в стиле бесконечного рандома. Это предсказуемый, data-driven scheduler с жесткими лимитами, cooldowns, act gates, black-box telemetry и ручным debug. Его задача - покупать связность за минимальный CPU cost.

Если этот слой не сделать, игра получит много контента, но не получит кампанию. Игрок будет находить хорошие комнаты, но не будет ощущать, что гигахрущ отвечает на его жизнь.

## Игровая задача

Сейчас каждый expansion имеет свой loop: грибница, метро, документы, теплотрасса, рынок, школа, больница, промзона, 404, VOID. Диспетчер связывает их в причинно-следственные цепочки:

- грибной урожай влияет на рынок, школу, больницу и промзону;
- пожар/пар теплотрассы приводит в больницу и меняет маршруты эвакуации;
- Райсовет создает доступы и фальшивые документы для рынка, метро и 404;
- промзона создает supply, который рынок распределяет или ворует;
- метро и лифт-петли открывают поздние маршруты только после нужных слухов;
- VOID вмешивается только в системы, которые игрок уже понимает.

Диспетчер не должен тащить игрока за руку. Он должен ставить давление там, где уже есть смысл.

## Основная петля режиссуры

Раз в редкий интервал диспетчер строит компактный снимок кампании: текущий floor, зона, активный самосбор, последние важные события, открытые expansion flags, дефициты, травмы, долги, выполненные milestones, недавние события и cooldowns. Затем он выбирает не «лучший контент вообще», а следующий допустимый beat.

Beat - это маленькое режиссерское решение: дать слух, открыть вход, поднять цену, назначить рейд, испортить документ, включить школьную тревогу, сдвинуть маршрут метро, подготовить 404, предложить VOID-протокол. Beat обязан иметь входное условие, эффект, cooldown, лимит повторов и лог.

Игрок видит не систему, а последствия: сосед говорит о грибной плесени, рынок просит поставку, санитар закрывает дверь, лифт показывает пустой номер, Вестник молчит слишком точно.

## Акты кампании

Диспетчер делит expansion-контент на акты, чтобы поздние идеи не свалились в раннюю игру:

| Акт | Состояние игрока | Разрешенные hooks |
| --- | --- | --- |
| Act 0: Быт | игрок освоил базу, сюжет еще ранний | слухи, мелкие документы, грибная кладовка, тепловой warning |
| Act 1: Дефицит | есть голод/первые фракционные решения | грибы, Райсовет, рынок, теплотрасса, больница-light |
| Act 2: Снабжение | игрок понимает маршруты и квесты | промзона, контракты, карантин, школа, supply events |
| Act 3: Ошибка | открыты транспорт/архив/документы | метро, 404 prep, 556/777 stubs, сильные рейды |
| Act 4: После ада | игрок видел HELL/VOID hooks | VOID-протоколы, backlash, late memory edits |
| Endless: Жизнь после | постфинальная игра | редкие chains, повторные кризисы, не полная победа |

Акты должны быть data flags, не hardcoded сюжетные стены. Если игрок нашел обход, диспетчер адаптируется, но не раскрывает late-game раньше смысла.

## Director Beat Definition

```ts
export interface DirectorBeatDef {
  id: string;
  title: string;
  actMin: number;
  actMax?: number;
  tags: string[];
  expansionIds: string[];
  weight: number;
  cooldownHours: number;
  maxRuns: number;
  requires: DirectorCondition[];
  blocks?: DirectorCondition[];
  effects: DirectorEffect[];
  visibleTrace: string;
  debugSummary: string;
}
```

Beat definitions живут в data-файлах и могут принадлежать разным expansion. Диспетчер читает их через registry. Если expansion не реализован, его beats не регистрируются. Никаких прямых imports из каждой системы в director.

## Снимок кампании

```ts
export interface CampaignSnapshot {
  timeHours: number;
  act: number;
  floor: FloorLevel;
  zoneId: number;
  samosborActive: boolean;
  lastSamosborVariant?: string;
  playerStress: number;
  scarcityTags: string[];
  openExpansionIds: string[];
  recentBeatIds: string[];
  dangerBudget: number;
  reliefBudget: number;
}
```

Snapshot строится дешево. Он не сканирует весь мир каждый frame. Он читает агрегаты, flags и последние события из bounded buffers.

## Danger/Relief Budget

Главная ошибка подобных систем - бесконечно давить на игрока. Диспетчер обязан считать два бюджета:

- `dangerBudget`: сколько угроз можно добавить без превращения игры в кашу;
- `reliefBudget`: когда нужно дать передышку, торговца, стабильную дверь, врача, безопасный маршрут или тихий документ.

Relief не делает мир добрым. Relief дает игроку возможность принять следующее плохое решение осознанно.

## Cross-Expansion Chains

Самое ценное - цепочки между expansion. MVP должен поддержать хотя бы 6 chain templates:

| Chain | Шаги | Результат |
| --- | --- | --- |
| Грибной дефицит | плесень -> очередь -> рынок -> санитар | еда становится социальным конфликтом |
| Паровой ожог | теплотрасса -> больница -> Райсовет | травма превращается в документ |
| Смена брака | промзона -> рынок -> школа | плохой концентрат попадает детям |
| Ошибка маршрута | метро -> архив -> 404 | транспортная ошибка становится легендой |
| Долг за лечение | больница -> рынок -> промзона | медицина связывается с экономикой |
| Пустотный откат | VOID -> дверь -> самосбор backlash | late-game не отменяет угрозу |

Chain не должен быть длинным квестом на 40 шагов. Это 2-4 связанных beats, каждый из которых может быть понятен отдельно.

## Самосбор

Диспетчер не управляет самосбором напрямую и не подменяет `src/systems/samosbor.ts`. Он готовит контекст вокруг самосбора:

- выбирает, какие expansion systems получают aftermath hook;
- не допускает три тяжелых кризиса подряд без relief;
- повышает шанс редкого варианта, если он давно не появлялся;
- запрещает late-game backlash до открытия VOID;
- пишет trace, почему beat был выбран.

Самосбор остается главным антагонистом. Диспетчер только помогает ему быть драматургически точным.

## Техническая интеграция

Планируемые файлы:

| Файл | Назначение |
| --- | --- |
| `src/data/director_beats.ts` | базовые beat definitions и act gates |
| `src/systems/director.ts` | rare tick, snapshot, selection, cooldowns |
| `src/systems/director_registry.ts` | регистрация beats expansion-модулями |
| `src/systems/director_trace.ts` | bounded black-box trace buffer |
| `src/data/director_chains.ts` | cross-expansion chain templates |
| `src/systems/debug.ts` | inspect snapshot, force beat, list cooldowns |

Интеграция с events/world_log желательна, но не обязательна для MVP. Если `world_log.ts` доступен, director пишет важные traces туда. Если нет, он держит собственный bounded ring.

## Black Box

Director обязан иметь фиксированный ring buffer минимум на 300 entries:

```ts
export interface DirectorTraceEntry {
  timeHours: number;
  act: number;
  chosenBeatId: string;
  rejectedTopBeatId?: string;
  reasonCode: string;
  dangerBudget: number;
  reliefBudget: number;
  samosborVariant?: string;
}
```

Если игрок получает странное событие, должен быть ответ: какой beat выбран, почему, какие conditions прошли, какие были заблокированы.

## Производительность и Math LOD

Low: director tick раз в 5-10 игровых минут, 20-30 beat defs, один active chain, debug только текстом.

Middle: 60-100 beats, act gates, danger/relief budgets, интеграция с world events и scarcity tags.

High: cross-expansion chains, faction pressure, weighted aftermath после самосбора, richer logs.

Ultra: не больше логики в hot path. Ultra покупает presentation: более умные слухи, больше уникальных aftermath lines, визуальные предвестники, разные звуки объявлений. CPU budget остается тем же.

Цель steady-state: 0 us/frame. Director работает только на rare tick или при событиях.

## Вертикальный срез

MVP готов, когда director может:

1. Построить `CampaignSnapshot`.
2. Выбрать beat из 10-20 definitions.
3. Применить один harmless effect: слух, debug marker, изменение локального pressure flag.
4. Записать trace.
5. Уважить cooldown и act gate.
6. Показать debug breakdown выбора.

Минимальный playable chain: `Грибной дефицит`: после порчи грибной партии director активирует слух у очереди, затем поднимает рыночный спрос, затем предлагает санитарный конфликт.

## Definition of Done

| Область | Проверка |
| --- | --- |
| Snapshot | строится без полного скана мира |
| Beats | минимум 20 data-driven beats из 5 expansion |
| Chains | минимум 2 cross-expansion chains playable через debug |
| Budget | danger/relief предотвращают spam угроз |
| Trace | 300-entry bounded buffer и debug output |
| Build | `npm run build` проходит |

## Риски

Главный риск: director станет скрытым богом и начнет подделывать игру. Контрмера: beats должны быть маленькими, trace - обязательным, direct mutation - ограниченной.

Второй риск: director станет бессмысленным random table. Контрмера: act gates, conditions, cooldowns, chain state, visible traces.

Третий риск: hot-loop bloat. Контрмера: no per-frame work, only rare tick/event-bound evaluation.

## Связь с линейкой

Это foundation-expansion. Его нужно проектировать до массовой реализации остальных DLC, иначе каждый expansion начнет делать собственный scheduler, свои cooldowns, свои слухи и свои последствия. Диспетчер Самосбора - общий позвоночник связной разработки.


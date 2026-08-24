# Fight AI Contract

> Центральный документ боя.
>
> Роль: описывает динамичный бой на всем активном этаже: thousands-capable actor combat, target selection, physical projectiles, friendly fire, monster/NPC pressure, simple tactics, gore/traces and smooth emergent fight experience. Связан с `ai.md`, `monsters.md`, `items.md` and `balance.md`.

Статус: рабочий контракт боевого апдейта. Текущий подход: активный этаж считается честным полным проходом live-AI акторов без player bubble, hot/cold tiers и proximity gates. Это текущая основа AI игры. Массовый бой остается живым и динамичным, потому что обычные акторы используют короткий универсальный combat-step, а дорогие вопросы вынесены в локальные cooldown/cache.

## Решение о бое живёт в ядре актора (с 2026-08-23)

«Драться или бежать» больше не решает боевой слой: это обычный драйв ядра (ярус `actor`),
который спорит одним счётом с укрытием, страхом, голодом и захватом территории. Слой
отвечает за исполнение — оружие, дистанцию, перезарядку, видовые тактики и сам удар.

- Ядро объявляет цель только если её нет: выбор противника принадлежит `findCombatTarget`.
- Побеждает не драка — ядро снимает и цель, и боевую память, иначе `forcedTarget` вернёт
  бойца в ту же схватку следующим кадром.
- Драка требует линии взгляда; страх и укрытие работают и от неувиденного.
- Пейн-стан общий для всех, включая игрока: боль поднимает откат атаки, ноги свободны.
  Полной заморозки ввода у игрока больше нет.
- Храбрость — не выключатель расчёта, а вес: смягчает вдвое порог здоровья и требуемый
  расклад, но безнадёжный расклад безнадёжен для всех.

## Цель

Сделать активный этаж опаснее и живее без переписывания AI в большой комбайн:

- мобы опаснее для игрока: лучше держат цель, давят пачкой, реагируют на шум/урон, не застревают в мертвой погоне;
- NPC активнее: вооруженные и смелые отвечают монстрам, слабые бегут или прячутся, свидетели зовут союзников локально;
- бой становится actor-oriented: игрок, NPC и монстры участвуют в одной логике угроз, целей, урона, паники и friendly fire;
- стрелки остаются простыми и честными: выбирают цель, двигаются, выпускают физический снаряд, а friendly fire и стрельба через толпу являются частью хаоса;
- все это остается bounded: `entity_index`, радиусы, кулдауны, caps, cached targets, без per-frame full-world scans.

## Архитектурная Парадигма

Бой должен быть простой частицевой симуляцией, а не набором частных сцен:

- воюют фракции: `isHostile` заканчивается матрицей фракций. Личная вражда между людьми боевой целью НЕ делает — она меняет поведение (отказ помочь, избегание) и разряжается разборкой один на один (`systems/npc_feud.ts`), см. `manifest.md`. Монстры не дерутся с монстрами по умолчанию, потому что это одна экология;
- каждый actor держит несколько простых состояний: цель, страх/бой, короткая память урона, cooldown, путь;
- сложность рождается из плотности, снарядов, фракций, узких коридоров, паники и персистентных последствий, а не из дорогого per-actor мышления;
- дальняя симуляция может быть грубее визуально, но не логически: она обязана менять данные мира: HP, смерти, кровь/следы, dropped inventory, события;
- физические projectiles остаются честными тупыми объектами: летят по прямой, сталкиваются с миром/актёрами и не заменяются скрытым hitscan ради FPS;
- шум вторичен: он не должен участвовать в every-frame классификаторе акторов, только в bounded локальных реакциях/патрулях;
- процедурные визуалы генерируются на границе загрузки этажа/игры и попадают в общий щедрый cache; hot render path только читает готовые texture handles;
- бой на всей карте считает тот же короткий faction/particle шаг; рядом с игроком отличается только рендеринг, звук, HUD и читаемость последствий;
- "сочность" важнее тактической умности: NPC могут стрелять через толпу, монстры могут идти простым давлением, но снаряды, урон, смерть, кровь и дроп должны быть настоящими данными мира.
- текущий потолок плотности активного этажа: общий soft cap 4096 NPC+monster actors; NPC и монстры делят один пул, а projectiles/items/billboards делят один общий 65536 floor-object pool.

## Рабочий Baseline

Массовый бой строится вокруг одного короткого правила:

```txt
actor -> remember current target/intent -> find hostile faction target -> move -> melee or shoot -> write consequences
```

Это не отменяет собственное поведение NPC. У каждого материализованного NPC остаются `combatTargetId`, текущий intent/debug state, needs, роль, фракция, личное отношение к игроку, loadout, страх/смелость и путь. Combat-step только временно приоритизирует опасность над бытом; если угрозы нет или она ушла, NPC возвращается к utility/routine/shelter logic.

Правило для производительности и вкуса:

- ordinary crowd combat не запускает тактический комбайн для каждого участника;
- рядом с игроком бой не становится фальшивым: те же акторы, HP, projectiles, deaths, blood marks, bullet marks, drops and events остаются реальными;
- дальние акторы не заморожены и не идут по другому симуляционному правилу: они получают тот же frame pass и оставляют последствия в структурах текущего этажа;
- фракции и личное отношение определяют враждебность, включая NPC↔NPC через `isDemosPersonalEnemy`; monster-vs-monster не является базовой политикой;
- шум и witnesses вторичны и bounded; они не должны становиться every-frame классификатором для 4096 actors.

## Механики стагера и отталкивания (Stagger / Pushback)

Для создания физичности боя введена система отталкивания и прерывания действий (stagger):
- Оружие ближнего боя и дробовики имеют параметр `knockback` (полей `staggerForce`/`staggerPush` в коде НЕТ; `rg` даёт 0 совпадений) (базовый урон выносливости/стаггера) и `staggerPush` (дистанция физического отскока).
- При получении `staggerForce` у цели уменьшается невидимая полоса выносливости (или стаггер-метр). Когда она пробивается, цель получает статус `staggered`.
- **Пейн-реакция сбивает УДАР, а не всего человека (отгружено 2026-08-23).** `staggered` поднимает откат атаки и только его: оглушённый продолжает видеть, выбирать цель, убегать и идти. Раньше `tryFactionCombat` отвечал на стаггер `return true` и съедал весь апдейт — актор не делал НИЧЕГО, и монстр с частотой атаки раз в секунду держал NPC замороженным почти половину времени, двое — постоянно.
- Порог и кулдаун (`systems/combat.ts`): боль вешает удар от **десятой доли максимального здоровья** (был 1% — царапина), и после каждой пейн-реакции идёт рефрактерный период РАВНОЙ длины. Отдельной ручки у него нет и заводить нельзя: она выводится из самого стаггера, поэтому боль физически не может занять больше половины времени даже под непрерывным огнём. Отскок остаётся на прежнем низком пороге — это физика попадания, а не боль.
- Часы для рефрактерного периода ставит кадр AI (`setCombatContext` → `setCombatClock`): функция урона не получает ни мира, ни времени, а зовут её все пути урона, включая единую дверь `damageActor`.
- **Общего чтения стаггера у монстров нет:** штраф за попадание платит пока только человек. Монстровая сторона симметрии — за `systems/ai/monster.ts`.
- Параметр `staggerPush` физически отбрасывает цель назад от источника урона. Это работает через `movement_collision.ts`, сдвигая позицию актора (учитывая препятствия).
- Это делает дробовики и тяжелое милишное оружие (кувалды, арматуру) инструментами контроля толпы, позволяя разрывать дистанцию или сбивать анимации сильных атак у танковых врагов, даже если урона недостаточно для мгновенного убийства.

## Откат атаки убывает В ОДНОЙ ТОЧКЕ (с 2026-08-24)

`attackCd` тикает одним вычитанием в цикле `updateAI` (`systems/ai/index.ts`) у ВСЯКОГО
актора со строкой `ai`. Игрок и сетевой пир тикают свой откат сами (`movePlayer`,
`hostTickRemoteActor`), и цикл пропускает их по имени и по слоту пира. **Видовая ветка
вправе только ВЗВЕСТИ откат и прочитать остаток; вторая убыль удваивает темп
восстановления.** Замок — `tests/attack-cooldown-tick.test.ts`.

Прежде убыль жила в пятнадцати местах и только под условием «цель в радиусе замаха», то
есть у бродящего монстра откат не тикал вовсе. Это была зеркальная асимметрия того же
закона, что уже снимали со стаггера: у игрока откат шёл всегда, у твари — нет.

Следствия, все замерены:

- **Монстры наконец ломают двери.** Контакт со створкой (`systems/door_state.ts`) гейтится
  откатом и сам его взводит, поэтому бродящая тварь била дверь РОВНО ОДИН РАЗ за жизнь
  этажа при потребных 2–16 ударах. Створок выломано за минуту на жилом этаже: 5 → **39**.
  Доля монстров с зависшим откатом: 65% → **31%**. Владелец: так и надо, мир разрушаем.
- Застревание ходячих видов 22.6% → **21.6%** (выборки трёх прогонов не пересекаются),
  людей гибнет 18 → 15, `p50 updateAI` слегка дешевле — снято пятнадцать вычитаний.
- **Найдены две двойные убыли.** Слепоглаз тикал откат и своим тактом, и ближней обороной,
  то есть бил ВДВОЕ чаще собственного паспорта (1.58 против 0.80 удара в секунду);
  решение владельца — оставить по паспорту, а если вид окажется слаб, поднимать число в
  его дефе, а не возвращать баг. У зомби под ударами откат сливался быстрее боли, вопреки
  правилу, записанному в этом же документе; порядок «убыль → пол» теперь совпадает с
  игроком знак в знак.

## Shipped Actor Tactics Layer

Поверх короткого combat-step добавлен общий профильный слой `src/systems/ai/tactics.ts`. Это не отдельная state machine на каждый монстр в цикле, а один runner с профилями:

- `updateAI()` вызывает runner перед обычным NPC/monster branch только если у actor есть профиль;
- профиль задает `senseRadius`, `senseIntervalSeconds`, `scanCap`, optional target-neighbor scan и список tactics по priority;
- локальные факты читаются через `entity_index.queryRadiusCapped()` и кэшируются в transient `AIState`;
- unprofiled NPC/monster не делают tactic scan и остаются на текущем дешевом combat/routine пути;
- состояние профиля не пишется в save: это cooldowns, target ids, local counts, phase/debug flags.

Первый shipped профиль: `MonsterKind.SLIME_WOMAN`.

- после hostile damage профиль оставляет bounded toxic slime residue через `cell_hazards` и surface mark;
- если рядом локальная толпа hostile NPC/player, профиль переводит монстра в `AIGoal.FLEE` и уводит от capped hostile centroid;
- на сухом светлом бетоне профиль публикует readable dry-counterplay cue и может отступать к ближайшему мокрому anchor;
- одиночная цель включает stalk/ambush behavior, а close isolated grab может оставить residue;
- все это работает на текущем активном этаже без full-map scan и без контентной ветки в `main.ts`.

## Снятые видовые контрплеи (2026-08-20)

Три контрплея, которые раньше числились в бою, больше не существуют — их механики снесены вместе с полями ядра (разбор — `problems.md`, «Механика одного вида, размазанная по ядру»). Не восстанавливать по памяти и не описывать в подсказках:

- **«Сбить фазу Ложного Духа точным выстрелом или УФ».** Фазового прохода дверей с телеграфом «холодный сквозняк», окном уязвимости и кулдауном нет. Вид переведён на обобщённый `noclip`: геометрия его просто не держит, окна для срыва не существует. Ответ теперь позиционный — не ставить на дверь, драться в открытом месте.
- **«Не входи в след Глубинной Тени».** Второго темпа, afterimage-якоря и отложенного бокового удара нет; флагов вид не носит вовсе. Остался тяжёлый темный ближник: сильный в темноте, слабее на свету.
- **«Не открывай дверь ложному патрулю».** Стука в дверь, нейтральной фазы и разоблачения по запретной пробе нет. Чёрный ликвидатор теперь читается глазами: он носит арт настоящего ликвидатора, отличие — меловой номер на маске вместо краски. Контрплей: **разглядеть мел до сближения и не оставаться с ним наедине** — маскировка держится, пока рядом больше одного постороннего, и слетает от первого же полученного урона (общая память угроз, `getRecentCombatThreat`).

## Текущая Диагностика

### NPC против монстров

Сейчас NPC-тик идет так: `tryFactionCombat()` -> `tryFleeFromMonster()` -> `updateNPC()` (`src/systems/ai/index.ts`). Это правильный порядок: бой выше быта. Проблема в условиях входа.

**ОТГРУЖЕНО: порог входа снят.** `tryFactionCombat()` больше не гейтит по «brave/armed или уже hostile к игроку» — по сторонам смотрят все. Небоец в этой ветке не дерётся, он замечает угрозу и убегает; смелость и дальнобойность оружия решают только ДАЛЬНОСТЬ, с которой он её замечает: `max(brave ? NPC_CHASE_RANGE : NPC_COMBAT_RANGE, дальность его оружия)`. Дальность обнаружения стала свойством наблюдателя, параметра `player` у функции нет (см. `architecture.md`, «Observer-Owned Detection»). Раньше сюда пускало «враждебен игроку»: мирный житель реагировал на угрозу, только если этой угрозой был игрок, и спокойно стоял рядом с враждебным ему соседом-NPC.

`tryFleeFromMonster()` включается только для не-brave и слабых/невооруженных NPC, ищет монстра радиусом около 10 клеток и может построить пустой flee-path, который все равно считается активным бегством.

**ОТГРУЖЕНО: универсальный стимул урона есть.** `notifyActorDamaged()` (`src/systems/combat_stimulus.ts`) записывает факт «actor damaged by actor» в память жертвы, а `tryFactionCombat` читает его через `getRecentCombatThreat()` и превращает в `forcedTarget` с расширенной дальностью. Реакция `startled` в цель не превращается. Исторический разрыв был такой: monster melee и monster-owned projectile уменьшали HP, рисовали кровь, могли убить и дропнуть инвентарь, но не ставили NPC `combatTargetId` и не включали panic/flee pressure — игрок видел, что монстр напал, а NPC рядом стоит.

Utility-FSM уже знает intents `safety`, `combat`, `flee`, но `combat` сейчас фактически уходит в patrol-like behavior, а `flee` ищет убежище, не обязательно бежит от конкретного атакующего. Для экстренной угрозы от монстра нужен короткий приоритетный combat/flee hook до обычного utility.

### Мобы и удержание цели

`findCombatTarget()` уже ищет ближайшую hostile цель через `entity_index`, кэширует `combatTargetId` и периодически ресканит. Но:

- cached target удерживается по alive/range, без полной перепроверки `typeFilter` и `isHostile`;
- цель за пределом range сбрасывается резко, без last-known-position поиска;
- periodic rescan всегда может переключить на ближайшего hostile без hysteresis;
- path failure при погоне не превращается в search/sidestep/retarget, поэтому возможна стоячая "агрессия в стену";
- monsters не атакуют monsters вообще: `isHostile(monster, monster)` возвращает false, а `canBeMonsterTarget()` допускает только игрока и NPC.

Вывод: "атаковать ближайшую цель" надо делать не как постоянный all-pairs хаос, а как target score:

```txt
score = hostility
      + recent_damage_bonus
      + distance_bonus
      + weak_prey_bonus
      + pack/faction/ecology modifiers
      - current_target_stickiness_penalty_to_switch
      - unreachable_or_lost_penalty
```

Текущая цель сохраняется, пока она жива, достижима или недавно видима. Новая ближайшая цель перебивает ее только если явно лучше, текущая умерла, путь провален, цель потеряна, или новая цель только что нанесла урон.

### Стрелки

Рабочий массовый baseline для стрелков теперь проще: цель, cooldown, физический projectile. Это намеренно дешевле и сочнее, чем попытка сделать каждого NPC тактическим стрелком.

Более умное позиционирование остается optional detail для plot/boss/rare/critical случаев, а не контрактом для каждого участника мясного этажа:

- если LOS закрыт, он обычно идет к цели, а не ищет прострел;
- если цель слишком близко, он не kite-ит, а проваливается в melee/fallback;
- **дальность выведена из оружия (отгружено 2026-08-23).** Общего потолка `NPC_RANGED_MAX = 13` больше нет: дальность боя — это честная баллистика, `projSpeed × projLife` теми же числами, с которыми снаряд и родится (`npcWeaponReach`), либо `beamRange` у лучевого. Макаров бьёт на 66 клеток и стреляет с 66, огнемёт целится с 4.9, а не с 9, куда струя не долетает. Нижняя граница — собственный радиус взрыва, а не отдельный порог. Зрение стрелка выводится из той же дальности;
- **мебель на линии огня — штраф к прицелу, а не запрет (там же).** Стеллаж, станок, аппарат, стол и парта проходимы и в ближнем бою не мешают, поэтому запрещать по ним выстрел нельзя — это давало «стою вплотную через стол и не стреляю». Каждое укрытие на пути добавляет разброса на угловой размер клетки в точке цели (`lineCoverCells`); бетон запрещает по-прежнему. Из ближнего боя проверка укрытия убрана целиком;
- **линия взгляда — одна на весь бой:** `world/line_of_sight.ts`, обход Amanatides–Woo. Прежняя шаговая растеризация существовала в двух копиях, шла пробами через полклетки и НЕ проверяла ни клетку наблюдателя, ни клетку цели — цель, стоящая в бетоне, считалась видимой. Правила теперь явные: клетка наблюдателя не преграда, клетка цели преграда, точная диагональ шагает по обеим осям сразу, поэтому угол между двумя стенами не запирает взгляд соседям вплотную. Копия в `systems/ai/monster.ts` ещё своя — её надо свести сюда же;
- line-of-fire может игнорировать актеров в линии в массовом бою; friendly fire и стрельба через толпу являются допустимой частью хаоса;
- ranged monsters имеют несколько специальных реализаций, но общий слой часто тоже сводится к "стреляй или догоняй".

## Референсы

### Doom / Quake

Полезные правила из Doom/Quake простые и дешевые:

- damage provenance важнее "умного" AI: если actor получил урон от другого actor, он часто переключает цель на источник;
- noise alert будит соседей через ограниченную топологию, а не глобально;
- target threshold / oldenemy дают липкость цели, чтобы монстр не дергался каждую проверку;
- pain reaction коротко прерывает или задерживает атаку, но имеет шанс/кулдаун, чтобы не было stunlock;
- melee и ranged атаки имеют state/cooldown/windup/recovery, а не стреляют каждый кадр;
- movement failure ведет к смене направления, открытию двери, поиску обхода или отказу от цели.

Источники: Doom `p_enemy.c` и `p_inter.c`, Quake `ai.qc`/`fight.qc`, Doom/Quake infighting references.

### Might and Magic 6/7/8 и соседние CRPG

Полезно:

- маленькие data labels: hostility range, movement leash, morale/flee type, attack slots, ranged capability, target preference;
- recovery/ticks создают понятный темп боя;
- morale breaks: cowardly flee, normal flee at low HP, disciplined/undead/samosbor never flee;
- ranged враги опасны, если держат дистанцию и линию, но теряют преимущество при rush;
- civilians and guards are social systems first: гражданские бегут/сообщают/прячутся, guards/responders отвечают на свидетелей и локальные факты;
- squad pattern: blockers спереди, shooters/casters сзади, flank только если пространство позволяет.

Не копировать:

- огромные пассивные horde fights, которые игрок просто kite-ит назад;
- бесконечный guard spawn;
- disposable civilians;
- грубое отключение ranged атак из-за союзника в линии. Лучше suppression/aim penalty/reposition/switch weapon.

## Целевая Модель Для ГИГАХРУЩА

### 1. Универсальный Combat Stimulus

Добавить маленький generic hook уровня systems, условно:

```ts
notifyActorDamaged(world, entities, victim, attacker, damage, sourceKind, time, state)
```

Это не должен быть контентный код в монстрах или `main.ts`. `main.ts` может только дернуть generic hook в местах projectile/melee damage, потому что projectile loop сейчас живет там. Monster melee, NPC melee, projectile hit, explosion, fire/psi damage должны сходиться в один damage reaction path.

Hook делает только bounded transient work:

- если attacker жив и hostile для victim, victim получает короткую threat memory;
  **ОТГРУЖЕНО и расширено 2026-08-22:** одной враждебности мало — ударивший с ЧУЖОЙ СТОРОНЫ становится врагом сам по себе, чем бы ни ударил, иначе мирный по матрице сосед бьёт ликвидатора, а тот читает его как друга и не отвечает. Источники не перечисляются принципиально: шальная пуля и нападение — одно и то же событие. Внутри стороны удар врагом не делает (там свой канал — личное ребро Демоса), экология против экологии — объявленное исключение;
- если victim имеет AI, выставляется `combatTargetId` или flee pressure;
- если victim NPC, выбирается реакция: fight, flee, hide, panic, call allies;
- если victim monster, выбирается retarget/pain reaction только против игрока/NPC по фракционной враждебности;
- nearby allies/witnesses получают локальный alert через capped radius query — **ОТГРУЖЕНО 2026-08-22** (`alertWitnesses` в `systems/combat_stimulus.ts`): свои той же фракции, в той же КОМНАТЕ и в радиусе 12 вступаются в тот же кадр, потолок 8 человек, одна тревога на схватку (признак — живая боевая память жертвы); за игрока — те, чьё личное отношение к нему дошло до порога дружбы, и тем же запросом считаются свидетели его ударов;
- public event публикуется компактно, если это важно игроку.

Сохранение: threat memory по умолчанию transient. Не тащить это в save shape. HP, death, inventory, relation, events и floor memory уже дают персистентные последствия.

### 2. NPC Reaction Matrix

NPC не должны все одинаково "героически" драться. Нужна таблица поведения по роли:

| Тип NPC | При нападении монстра | Если рядом союзники | Если HP низкий |
| --- | --- | --- | --- |
| civilian/scientist | бежать к shelter/door/за спины | кричать/alert guards | panic/flee |
| armed citizen/hunter | стрелять/держать дистанцию | помогать ближайшему союзнику | отступать |
| liquidator/guard | атаковать, перекрывать коридор | локальный call for help | tactical retreat |
| wild/scavenger | attack or flee by risk/loot | редко помогает | self-preserve |
| cultist | не всегда враг монстрам | помогает культу/ритуалу | flee только если не fanatical |
| medic/doctor | flee first, heal ally after threat | зовет охрану/игрока bark | hide |

Ключевое: слабый NPC может не бить, но он обязан сделать видимое действие: отойти, бежать, кричать, лечь в укрытие, пытаться закрыть дверь, спрятаться за сильным NPC. "Стоит и принимает урон" недопустимо.

### 3. Fight Or Flee Executor

`tryFactionCombat()` и `tryFleeFromMonster()` стоит объединить концептуально в один emergency layer:

1. Есть текущий attacker/threat из damage memory -> использовать его без нового скана.
2. Иначе capped scan ближайших hostile actors через `entity_index`.
3. Если NPC brave/armed/ordered/cornered -> fight.
4. Если NPC weak/unarmed/outmatched -> flee/hide.
5. Если flee path не найден -> выбрать другой flee candidate, sidestep, backpedal или panic crouch, но не считать пустой path успешным бегством.
6. Если цель слишком далеко, но недавно стреляла -> seek cover/shelter, а не забывать угрозу.

`combat` intent в utility-FSM должен либо реально передавать управление этому executor, либо быть переименован/ограничен до patrol readiness. Сейчас название создает ложное ожидание.

### 4. Monster Targeting 2.0

Новая логика не должна ломать специальные monster hooks. Нужен generic слой вокруг `findCombatTarget()`:

- cached target каждый AI tick валидируется: alive, type allowed, hostility still valid, not passive ally;
- current target получает stickiness window, например 2-6 секунд;
- recent damage от другого actor может перебить stickiness;
- last known position держится коротко: монстр идет к последней видимой/слышимой клетке, потом search/noise/wander;
- path failure увеличивает local frustration; после 2-3 провалов цель получает unreachable penalty или сбрасывается;
- target score предпочитает ближайшего hostile, но не дрожит каждую scan cadence;
- **отдельного «player pressure» нет и заводить его нельзя.** Блок «Prefer player» снят: монстр не перемеряет расстояние до игрока после честного выбора цели и не переключается на него мимо проверки луча, кадансов сканирования и враждебности. «Ближе / шумнее / нанёс урон» работает общими слагаемыми target score, и игрок получает их наравне с NPC. Особые аппетиты живут в своей функции выбора цели и написаны про любого носителя признака, а не про одно лицо;
- monster-vs-monster не является базовой политикой: если обе стороны `MONSTER`, hostility false, даже при плотной мясной симуляции;
- если когда-нибудь нужен хищник/жертва между тварями, это должен быть отдельный authored ecology/event mode с явным cap, а не глобальный combat rule.

### 5. Optional Detailed Shooter AI

Для обычной толпы достаточно дешевого физического выстрела. Если нужен редкий более читаемый стрелок, plot/boss/critical ranged layer может использовать:

- `idealRange`: от weapon stats или monster def;
- `minRange`: если цель ближе, shooter отступает/side-steps/switches melee;
- `maxRange`: если цель дальше, shooter сближается;
- `lineOfFire`: geometry + cover + optional actor lane risk;
- `reposition`: короткий strafe/backstep/peek cell, а не новый BFS каждый кадр;
- `suppression`: только для детализированных профилей; массовые NPC могут принимать friendly-fire риск и стрелять через толпу;
- windup locks target, LOS break cancels или переносит в reposition;
- recovery после выстрела обязателен.

Weapon-aware правила:

- shotgun/flame: ближе, но боится совсем ближнего melee;
- pistol/rifle/AK: mid-range, короткий sidestep;
- sniper/gauss/energy: держит дальность и LOS, длиннее windup;
- grenade/BFG/AoE: для детализированных профилей можно избегать союзников; для массового хаоса важнее честный projectile и последствия.

### 6. Mob Danger Pass

Чтобы мобы стали опаснее для игрока без тупого HP/damage buff:

- melee mobs должны не терять цель после одного угла: last-known pursuit + noise reacquire;
- pack mobs делятся целью capped pulse-ом, но не all-to-all;
- быстрые mobs получают short burst только после readable cue;
- ranged mobs не бегут в melee без причины: держат линию, отходят, вынуждают игрока менять позицию;
- monsters реагируют на выстрелы/noise сильнее рядом, но через room/door/fog topology;
- melee contact должен иметь LOS/contact validity, чтобы "сквозь угол" не кусали;
- first attack grace/windup для честности, но после aggro cadence жестче.

Опасность должна идти через решения игрока: шуметь или нет, кого подставить, где укрыться, кого спасать, когда отступать, чем сбить windup.

### 7. Friendly Fire And Infighting

Friendly fire нужен как системная тактика, но с контролем:

- projectiles уже могут попасть в actor на пути; это хорошо;
- damage source должен создавать retaliation или fear;
- same-faction NPC не должны мгновенно начинать гражданскую войну от одной случайной дробинки: нужен threshold, bark, relation penalty, suppression;
- monsters могут infight быстрее, как Doom/Quake, но same-kind/pack exceptions нужны, иначе стая сама себя очистит;
- AoE должен быть главным источником случайного chaos.

### 8. Body Blocking And Crowd Pressure

Не первая обязательная фаза, но полезная для ощущения боя:

- player не проходит сквозь живого blocking actor, если не phasing/dead/small;
- AI получает soft blocking: sidestep/yield/short shove, но pathfinding field остается cell-only;
- dynamic bodies не должны попадать в baked nav as walls;
- fail-open при уже существующем overlap, чтобы не зажать игрока багом;
- крупные монстры могут body-block corridors, но это должно быть readable и counterplay-able.

## Приоритет Внедрения

### Phase 1: Stop Standing Still

Минимальный видимый фикс для жалобы:

- generic `notifyActorDamaged`;
- monster melee и monster-owned projectile вызывают его;
- NPC, получивший hostile damage, сразу выбирает fight/flee;
- flee path с пустым результатом не считается успехом;
- armed/brave NPC атакует монстра, weak/unarmed NPC бежит от конкретного attacker.

Проверка: монстр бьет Ольгу/Якова/обычного NPC -> тот либо убегает/кричит/прячется, либо дерется, если роль/оружие позволяют.

### Phase 2: Target Memory

- cached target validation;
- short target stickiness;
- recent-damage retarget;
- last-known-position search;
- path-failure frustration и reset/retarget.

Проверка: монстр не забывает цель сразу за углом, но не стоит бесконечно напротив недостижимой стены.

### Phase 3: Active NPC Allies

- локальный ally alert через capped radius;
- guards/liquidators/hunters помогают ближайшему атакованному союзнику;
- civilians/scientists создают panic/witness events;
- cult/wild/scientist роли остаются data-driven, без hardcode имен.

Проверка: монстр врывается в группу, вооруженные отвечают, слабые расходятся, рядом возникает читаемый хаос.

### Phase 4: Optional Shooter Detail

- per-weapon ideal/min/max range для редких/важных стрелков;
- close target -> backstep/sidestep/switch melee;
- blocked LOS -> short reposition;
- actor-aware line-of-fire risk only when the profile pays for it;
- windup cancel/recover rules for readable counterplay cases.

Проверка: массовый стрелок честно выпускает снаряд и оставляет последствия; детализированный стрелок, если включен, не стоит в упор и пытается удержать прострел.

### Phase 5: Faction Waves

- цели ищутся через малое число фракций, а не через дорогой all-pairs chaos;
- дальние группы ведут себя как волны: текущая цель, путь/направление, cooldown, физический выстрел;
- same-faction threshold нужен только для NPC и игрока, чтобы случайная дробинка не запускала гражданскую войну;
- monster ecology остается единой, кроме явно объявленных authored exceptions;
- player/NPC/monster target score shared enough to produce emergent fights без monster-vs-monster.

Проверка: фракции NPC и монстры создают волны боя, но монстры не самоочищают карту до прихода игрока.

### Phase 6: Combat Readability

- barks for flee/fight/help;
- HUD/log messages only for nearby/heard events;
- blood/impact/noise already exist, reuse them;
- debug view shows current target/reason/intent for sampled actor.

Проверка: игрок понимает, почему NPC убежал, почему стрелок не стреляет, почему монстр переключился.

### Phase 7: Optional Collision

- actor blocking helper;
- player blocking first;
- AI soft block second;
- no dynamic-body nav invalidation.

Проверка: нельзя просто пройти сквозь моба, но игра не превращается в застревание толпы.

## Тесты Для Будущей Реализации

Добавить focused unit tests:

- NPC damaged by monster melee chooses combat or flee based on armed/brave/weak;
- NPC damaged by monster projectile reacts even if attacker is outside 10-cell flee scan;
- flee fallback does not return success with empty path;
- monster cached target revalidates hostility/type/alive;
- monster pursues last known position briefly and then drops unreachable target;
- closer hostile replaces current target only when score beats hysteresis;
- monster-vs-monster не возникает в базовом combat stimulus;
- mass ranged NPC fires a physical projectile through the shared combat step without hidden hitscan;
- detailed ranged NPC, when explicitly enabled, starts windup with LOS, cancels on LOS break, consumes ammo only on commit;
- detailed ranged NPC backs away when target is too close;
- actor in firing lane is ignored by mass shooters or suppresses/repositions only by detailed profile;
- AI stats show live/updated/skipped actors and NPC/monster split under mass combat.

Existing relevant tests:

- `tests/inventory-rpg.test.ts`: NPC melee/chase/flee baseline;
- `tests/ai-full-pass.test.ts`: full-pass active AI and emergent firefights;
- `tests/entity-index.test.ts`: broadphase/capped query contracts;
- monster-specific tests for telegraphs, pack behavior and counterplay.

Validation for implementation:

```bash
npm run check:readonly
npm run check
npm run check:browser
SMOKE_SCENARIO=stress SMOKE_STRESS_ENTITIES=4096 SMOKE_PERF_FRAMES=300 npm run smoke
```

For broad AI/index changes, repeat stress at the shared `4096` live AI actor ceiling when Chrome is available.

## Hard Constraints

- No content-specific Olga/Yakov logic.
- No broad AI rewrite before the minimal damage-reaction path works.
- No per-frame full `entities` scan.
- No off-floor combat simulation.
- No ordinary NPC refill.
- No renderer-owned gameplay.
- No save-shape migration unless persistent fields become required.
- Prefer transient systems state or existing `AIState` fields; if new fields are added, sanitize current-shape saves deliberately.
- Keep pathfinding cell-based; dynamic actors are movement/crowd pressure, not nav walls.

## Optimal First Patch Shape

Best first implementation should be small:

1. Add one generic combat reaction helper under `src/systems/`.
2. Call it from existing damage sites with minimal `main.ts` integration only where projectile damage lives.
3. Extend NPC emergency executor so known attacker beats local scan.
4. Fix flee path fallback.
5. Add 4-6 tests proving the reported NPC-vs-monster case.

After that, improve target memory and shooter movement. Starting with all-vs-all ecology before damage reactions would create more chaos without fixing the visible "NPC stands while being attacked" bug.

## Source Links

- Doom enemy AI: https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_enemy.c
- Doom damage/retargeting: https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_inter.c
- Quake AI source: https://www.gamers.org/dEngine/quake/Qc/ai.htm
- Doom monster infighting overview: https://doom.fandom.com/wiki/Monster_infighting
- Quake infighting overview: https://quake.fandom.com/wiki/Infighting
- OpenEnroth Actor source for MM7-like actor AI: https://github.com/OpenEnroth/OpenEnroth/blob/master/src/Engine/Objects/Actor.cpp

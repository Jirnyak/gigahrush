# Expansion 03 Content Manifest: Райсовет и Живой архив

Статус: MVP content manifest  
Scope: бюро, NPC, документы, проверки доступа, события, debug-команды  
Правило: все сущности ниже являются спецификацией для существующего `MINISTRY`, не для нового `ADMIN`.

## Content Slice

Playable MVP состоит из пяти ministry pockets: райсоветская очередь, бюро пропусков, комната печатей, живой архив, проверяющий пост. Порядок прохождения не жесткий. Игрок может идти легальным путем через очередь и бюро, рискованным путем через печати и фальшивку, или информационным путем через архив. Все пути сходятся на проверке доступа, где документ меняет реальный результат.

## Bureaus And Rooms

| ID | Место | Runtime роль | MVP interactive nodes | Access tags |
| --- | --- | --- | --- | --- |
| `raion_queue` | Райсоветская очередь | социальный вход, слухи, стартовая friction | талонная стойка, спор о месте, NPC-заявитель | `queue_ticket`, `bureau_pending` |
| `permit_bureau` | Бюро пропусков | легальная выдача доступа | окно выдачи, журнал пропусков, шкаф бланков | `ministry_permit`, `archive_entry` |
| `stamp_room` | Комната печатей | рискованная подделка и порча | стол печатника, сейф печатей, мокрая полка | `stamp_access`, `forgery_tool` |
| `living_archive` | Живой архив | lookup NPC/quest facts | картотека, архивариус, запрос карточки | `archive_entry`, `personal_file` |
| `penalty_office` | Кабинет взысканий | штрафы, доносы, suspicion sinks | стол взыскателя, ящик жалоб | `penalty_review`, `denunciation` |
| `speaker_node` | Узел громкоговорителей | объявления и false order events | пульт, аварийный микрофон | `speaker_order`, `false_order` |
| `checker_post` | Проверяющий пост | demonstrator для access system | охранник, запертая дверь/контейнер | required tag varies |

MVP должен реализовать первые четыре комнаты и `checker_post`. `penalty_office` и `speaker_node` являются phase-2 content, но их tags и события резервируются сейчас, чтобы не ломать future save/data ids.

## NPC Manifest

| ID | Имя | Фракция/роль | Комната | Функция | Failure consequence |
| --- | --- | --- | --- | --- | --- |
| `npc_queue_kapitolina` | Капитолина Талонная | citizen clerk | `raion_queue` | выдает талон и объясняет легальный путь | ставит `bureau_pending`, если игрок грубит или дерется |
| `npc_permit_filimon` | Филимон Пропускной | ministry clerk | `permit_bureau` | выдает временный пропуск после fetch/talk | отказ повышает suspicion при попытке обхода |
| `npc_stamp_anzhela` | Анжела Сургучная | ministry printer | `stamp_room` | делает печать или фальшивку за цену/риск | может создать `forgery_rumor` |
| `npc_archive_osip` | Осип Карточный | archivist | `living_archive` | возвращает `ArchiveCard` по NPC/quest fact | stale/warped card после самосбора |
| `npc_guard_kislov` | Кислов Проверяющий | liquidator guard | `checker_post` | вызывает `checkDocumentAccess` | deny может вызвать угрозу, штраф или бой |
| `npc_penalty_marta` | Марта Взыскательная | ministry clerk | `penalty_office` | снимает или усиливает штрафы | phase-2: донос в архив |
| `npc_speaker_yakovlev` | Яковлев Громкий | dispatcher | `speaker_node` | ложные приказы и объявления | phase-2: wrong route marker |

NPC должны использовать существующие faction/NPC patterns. Они не получают тяжелую уникальную AI-систему в MVP. Их отличие определяется room role, dialogue lines, quest hook и document action.

## Document Definitions

| Def ID | Title | Issuer | Access tags | Suspicion | Forgery difficulty | Expiry | Mechanical effect |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `doc_temp_archive_pass` | Временный пропуск в архив | Бюро пропусков | `archive_entry` | 0 | 60 | 6h | допускает к картотеке и archivist lookup |
| `doc_bureau_queue_ticket` | Талон очереди РС-03 | Райсоветская очередь | `queue_ticket` | 0 | 15 | 2h | открывает legal dialogue в бюро |
| `doc_ministry_corridor_permit` | Пропуск по коридору Министерства | Бюро пропусков | `ministry_permit` | 2 | 70 | 12h | снижает агрессию проверки на посту |
| `doc_sanitary_absence_form` | Справка об отсутствии тумана | Санитарный стол | `sanitary_clearance` | 1 | 55 | 8h | доступ к временно закрытой комнате/медузлу |
| `doc_requisition_act` | Акт реквизиции имущества | Кабинет взысканий | `requisition` | 4 | 80 | 4h | легально открыть один room/faction container |
| `doc_liquidator_order_copy` | Копия предписания ликвидатора | Ликвидаторы | `liquidator_order` | 5 | 85 | 3h | guard дает проход, но faction rumor worsens |
| `doc_personal_archive_card` | Архивная карточка NPC | Живой архив | `personal_file` | 0 | 95 | none | раскрывает агрегированный NPC fact |
| `doc_false_corridor_pass` | Фальшивый коридорный пропуск | Комната печатей | `ministry_permit`, `forged` | 12 | 35 | 6h | шанс прохода, высокий suspicion delta |
| `doc_wet_stamp_form` | Размытая форма с печатью | Самосбор | `warped`, `stamp_damaged` | 8 | none | until inspected | может провалить проверку или стать false order |
| `doc_denunciation_blank` | Бланк доноса | Кабинет взысканий | `denunciation` | 6 | 40 | none | phase-2: создает archive penalty fact |

Восемь первых документов покрывают MVP DOD. Два последних добавлены как reserved definitions для samosbor и penalty hooks. Тексты должны быть короткими, без long-form prose в hot UI.

## Access Checks

| Check ID | Target | Required tags | Legal result | Forged result | Deny result |
| --- | --- | --- | --- | --- | --- |
| `access_archive_card_index` | картотека живого архива | `archive_entry` | открыт запрос карточки | запрос открыт, `suspicion +4` | archivist требует пропуск |
| `access_ministry_checker_post` | пост охраны | `ministry_permit` | проход без боя | проход или задержание, `suspicion +8` | угроза, штраф или бой |
| `access_requisition_container` | сейф/картотека/шкаф | `requisition` | взять один item без theft flag | item marked suspicious | item marked stolen |
| `access_sanitary_room` | закрытый мед/сан узел | `sanitary_clearance` | вход разрешен | вход с rumor risk | дверь остается закрытой |
| `access_penalty_review` | кабинет взысканий | `penalty_review` | снять один штраф | clerk замечает несостыковку | штраф усиливается |
| `access_speaker_panel` | узел громкоговорителя | `speaker_order` | включить объявление | false order event | охрана идет к панели |

MVP обязан включить первые три checks. Остальные резервируют tags и tests для следующих фаз.

## Events

| Event ID | Trigger | Visibility | Consequence |
| --- | --- | --- | --- |
| `document_issued` | бюро выдало легальный документ | important/local | audit trail, HUD message |
| `document_forged` | печатник сделал фальшивку | secret/witnessed | suspicion seed, rumor source |
| `document_checked` | guard/container/archive проверил документ | local | telemetry entry, reason code |
| `document_denied` | проверка провалена | local/important | штраф, бой, отказ доступа |
| `document_warped` | самосбор изменил документ | important | mutation flag visible on inspect |
| `archive_query` | игрок запросил карточку | local | archive telemetry, possible stale flag |
| `archive_record_warped` | архивная карточка испорчена | important | false/stale/future-dated card |
| `forgery_rumor` | фальшивка замечена свидетелем | local/faction | faction reputation/suspicion hook |
| `false_order_broadcast` | speaker node или тихий самосбор | zone/important | temporary access anomaly |

События не требуют нового global event bus, если он занят другим агентом. Contract допускает локальный bounded log и optional bridge в `world_log`.

## Debug Commands

| Command | Input | Output | DOD use |
| --- | --- | --- | --- |
| `doc.listDefs` | none | ids, tags, suspicion | проверить data registration |
| `doc.give` | `defId`, optional flags | document instance id | выдать legal/forged docs |
| `doc.inspect` | instance id | title, issuer, tags, flags, expiry | проверить mutation |
| `doc.checkAccess` | target/check id | allow/deny, reason, suspicion delta | проверить unified access |
| `doc.warp` | instance id, mode | changed flags | форсировать samosbor effect |
| `archive.query` | `npc:<id>` or `quest:<id>` | `ArchiveCard` summary | проверить living archive |
| `archive.warp` | query id/mode | stale/duplicate/future flag | проверить corrupted archive |
| `doc.telemetry` | optional count | last N access/archive decisions | debug visibility |

Команды не должны создавать тяжелые строковые отчеты каждый кадр. Они вызываются вручную из debug UI/console.

## Test Scenarios

Legal scenario: получить `doc_bureau_queue_ticket`, обменять на `doc_temp_archive_pass`, открыть `access_archive_card_index`, запросить `npc_archive_osip`.

Forgery scenario: получить `doc_false_corridor_pass`, пройти `access_ministry_checker_post`, увидеть `suspicion` и `document_checked` telemetry.

Requisition scenario: получить `doc_requisition_act`, открыть один container без theft flag, повторная попытка без valid act дает `stolen`.

Samosbor scenario: применить `doc.warp` или вариант самосбора к `doc_temp_archive_pass`, повторить проверку и получить changed reason code.

Archive scenario: `archive.query npc:<id>` возвращает агрегированную зону и связанные tags; после `archive.warp future` карточка явно помечена как unreliable.

## Content Risks

Главный риск: игрок будет читать формы вместо игры. Поэтому форма является ключом и consequence carrier, а не литературной стеной. Второй риск: доступы разъедутся между комнатами. Поэтому все checks идут через один contract. Третий риск: другие expansions начнут требовать свои документы до готовности системы. Поэтому tags стабильны, но integration обязательна только через public document/access helpers.

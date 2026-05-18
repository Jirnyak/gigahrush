# Content Manifest: Диспетчер Самосбора

## Director Beats MVP

| ID | Expansion | Act | Смысл | Visible Trace |
| --- | --- | ---: | --- | --- |
| `mushroom_spoilage_rumor` | 01 | 1 | очередь узнает о плесени | слух у пайковой очереди |
| `mushroom_market_demand` | 01/05 | 1 | рынок поднимает спрос на чистые грибы | новая цена/реплика |
| `mushroom_sanitary_notice` | 01/03/07 | 1 | санитар требует журнал влажности | документ/проверка |
| `permit_for_heatline` | 03/04 | 1 | Райсовет выдает странный пропуск к вентилю | access hook |
| `archive_wrong_patient` | 03/07 | 2 | архив путает живого и пациента морга | карточка |
| `heat_steam_route_warning` | 04 | 1 | диспетчер предупреждает о паровом коридоре | HUD/log |
| `market_debt_offer` | 05 | 1 | рынок предлагает долг вместо цены | debt flag |
| `school_bad_concentrate` | 06/08 | 2 | школа получает плохую партию еды | evacuation pressure |
| `hospital_quarantine_hint` | 07 | 2 | санитарный слух о карантинном коридоре | access warning |
| `industry_broken_shift` | 08 | 2 | смена просит ресурс или защиту | contract hook |
| `metro_wrong_voice` | 02 | 3 | метро объявляет чужую станцию | route risk |
| `elevator_404_prepare` | 09 | 3 | лифт показывает пустой номер | anomaly prep |
| `void_protocol_locked` | 10 | 4 | Вестник молчит, пока нет anchor | late gate trace |

## Chain Templates

### `fungal_shortage_chain`

1. `mushroom_spoilage_rumor`
2. `mushroom_market_demand`
3. `mushroom_sanitary_notice`

Итог: еда становится социальным конфликтом, а не ресурсом в инвентаре.

### `route_error_chain`

1. `metro_wrong_voice`
2. `archive_wrong_patient`
3. `elevator_404_prepare`

Итог: ошибка маршрута получает лорную и системную подготовку перед 404.

## Debug Commands

| Команда | Назначение |
| --- | --- |
| `director snapshot` | вывести compact campaign snapshot |
| `director roll` | выполнить один legal selection |
| `director force <beat>` | применить beat и записать trace |
| `director trace` | последние 20 trace entries |
| `director chains` | состояние active chains |
| `director budget danger|relief <value>` | тест бюджетов |

## Documents And Notes

Director сам не добавляет десятки lore notes. Он использует короткие service traces:

- запись диспетчера о переносе очереди;
- акт о сорванной смене;
- карта маршрута с пустой станцией;
- санитарное уведомление без подписи;
- журнал решения director для debug/lore bridge.

## NPC Touchpoints

NPC создаются другими expansion. Director только выбирает, кому дать реплику или rumor flag:

- грибник;
- санитар;
- архивариус;
- метрошник;
- рыночный посредник;
- учитель ОБЖ;
- мастер смены;
- Вестник.


# PR Campaign Plan: ГИГАХРУЩ

Дата запуска: 2026-05-22.

Цель первого прохода: не массовая рассылка, а аккуратная кампания вокруг playable browser build: короткие посты там, где self-promo разрешен, страницы в каталогах браузерных/инди-игр, и точечный pitch медиа/кураторам.

Основные ссылки:

- itch.io: https://tenevik.itch.io/gigahrush
- Онлайн-версия: https://gigahrush.bileter.workers.dev
- Fandom archive: https://samosborarchive.fandom.com/ru/wiki/ГИГАХРУЩ
- Fandom samosb0r: https://samosb0r.fandom.com/ru/wiki/ГИГАХРУЩ
- Fandom archive EN: https://samosborarchive-en.fandom.com/wiki/GIGAH_RUSH
- Reddit r/playmygame: https://www.reddit.com/r/playmygame/comments/1tku91k/gigahrush/
- IndieDB: https://www.indiedb.com/games/gigahrush
- Game Jolt: https://gamejolt.com/games/gigahrush/1072064

Текущий релизный snapshot на 2026-05-23:

- `itch/gigahrush-itch.zip`: 4 992 192 bytes, SHA-256 `5930f53b913ec9666d0de8a5ae2f5034b799b90fbd3d91951f087d547ca0ad18`.
- `dist/index.html`: 10 652 640 bytes, SHA-256 `8a635b8516f5dc2d31f5649dd39566fe8385ccd298bbb3d72bd6d4cdd7c9d998`.
- Cloudflare build: https://gigahrush.bileter.workers.dev отдает 200, публично не содержит `noindex`, размер ответа совпадает с локальным `dist/index.html`.
- itch.io page: https://tenevik.itch.io/gigahrush отдает 200, обновлена `23 May 2026 @ 06:05 UTC`, содержит свежий iframe `html/17645043/index.html?v=1779516324`, но публичный HTML все еще содержит `noindex` по проверке 2026-05-23 17:46 UTC.
- Reddit r/playmygame живой, но свежий; 2026-05-23 recheck показал публичный пост без removal flags, score 1, один комментарий AutoModerator. Новые Reddit/community посты сегодня не делать как безопасную рекомендацию; единственный rule-fit same-day кандидат при явном owner override - r/WebGames direct link, но с medium-high spam/cross-post risk.
- Game Jolt: опубликован публично 2026-05-23 18:50 UTC / 19:50 BST. Package `1093814`, release `1474909`, version `0.1.0`; browser build `gigahrush-itch.zip` загружен из `itch/gigahrush-itch.zip`, статус `HTMLActive`, `Fit to screen` и HTTPS включены. Playable check дошел до `ГИГАХРУЩ - САМОСБОР`, canvas видимый.
- `npm run itch:verify` прошел: 12 screenshots, 7 root-relative files, 0 warnings.

## Запущено

| Статус | Площадка | URL | Что сделано |
| --- | --- | --- | --- |
| Done | Самосбор Archive Fandom | https://samosborarchive.fandom.com/ru/wiki/ГИГАХРУЩ | Создана страница игры. |
| Done | samosb0r Fandom | https://samosb0r.fandom.com/ru/wiki/ГИГАХРУЩ | Создана страница игры. |
| Done | Self-Assembly Wiki EN / Fandom | https://samosborarchive-en.fandom.com/wiki/GIGAH_RUSH | Создана английская страница игры с инфобоксом, контекстом Self-Assembly, ссылками на itch.io, онлайн-версию, Telegram, Newgrounds, DTF и GameDev.ru. |
| Done | Архив Самосбора / Игры по вселенной | https://samosborarchive.fandom.com/ru/wiki/Игры_по_вселенной | `ГИГАХРУЩ` добавлен в список игр по вселенной; ссылка ведет на itch.io и внутреннюю страницу `[[ГИГАХРУЩ]]`. |
| Done | Self-Assembly Games / Fandom EN | https://samosborarchive-en.fandom.com/wiki/Self-Assembly_Games | `GIGAH RUSH` добавлен в английский список Self-Assembly games; ссылка ведет на itch.io и внутреннюю страницу `[[GIGAH RUSH]]`. |
| Blocked | ShoutWiki Самосбор | https://samosbor.shoutwiki.com/wiki/ГИГАХРУЩ | Публикация невозможна: abuse filter `запрет правок` с правилом `1==1` запрещает все правки. |
| Ready | KPI agent brief | `KPI.md` | Создан бриф агента мониторинга: опубликованные поверхности, KPI, good/bad signs, cadence daily/weekly/incident, шаблон отчета и текущие блокеры. |
| Done | KPI report 2026-05-22 | `Docs/PRCampaign/kpi_report_2026-05-22.md` | Первый отчет кампании: itch/Cloudflare/Newgrounds/DTF/GameDev/Fandom/IndieDB/iDev статусы, good/bad signs, fix queue и owner-needed блокеры. |
| Ready | Link opportunities | `Docs/PRCampaign/link_opportunities_2026-05-22.md` | Список адекватных мест для ссылок: P0 wiki lists, осторожные wiki-discussion варианты, внешние devlog/submission площадки, готовые RU/EN wikitext snippets. |
| Ready | Copy pack | `Docs/PRCampaign/copy_pack_ru.md` | Готовы RU/EN посты, pitch, письма и one-liners. |
| Ready | Wiki page drafts | `Docs/WikiPages/` | Готовы wikitext-заготовки под вики. |
| Waiting | itch.io indexing | https://itch.io/docs/creators/getting-indexed | Снята галка `Disable new downloads & purchases`, которая исключала проект из индексации; `noindex` пока остается до асинхронной обработки/модерации itch. |
| Done | itch.io Release Announcements | https://itch.io/t/6385827/gigahrush-free-browser-survival-horror-in-an-endless-concrete-apartment-block | Опубликован и отредактирован пост из `Docs/PRCampaign/itch_release_announcement.md`: исправлен Markdown, GIF вставлен как изображение. |
| Done / check permalink | itch.io Devlog | https://tenevik.itch.io/gigahrush/devlog | Опубликован launch-devlog из `Docs/PRCampaign/itch_devlog_launch_ru.md`; тип `Major Update or Launch`. Public recheck 2026-05-23 18:12 UTC: index живой и показывает launch-post, но прямой URL `https://tenevik.itch.io/gigahrush/devlog/1530909/-` все еще возвращает `404`; нужен browser/dashboard check permalink. |
| Done | Reddit r/playmygame | https://www.reddit.com/r/playmygame/comments/1tku91k/gigahrush/ | Пользователь опубликовал новый non-NSFW self-post: developer affiliation раскрыта, ссылки на itch.io и direct build есть, игра подана как free browser survival horror. |
| Done | HTML5 portal preflight | `itch/gigahrush-itch.zip` | `npm run itch:verify` прошел: 12 screenshots, 7 root-relative files, 4 992 192 bytes, 0 warnings. |
| Conditional update | GameDev.ru / Проекты / Оцените | https://gamedev.ru/projects/forum/?id=295485 | Public recheck 2026-05-23 18:12 UTC: тема жива; есть конкретный отзыв `#1` про темно-синий зависший-looking экран в direct online build и просьба добавить ProgressBar, ответ `#2` уже дан про Cloudflare/VPN. Следующий reply/update только если признает этот риск и ведет в itch.io как primary link; не делать generic bump. |
| Update ready | DTF / Инди | https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror | Public recheck 2026-05-23 18:12 UTC: пост живой, `200 OK`, 1967 views, 419 hits, 6 comments, 10 favorites, 5 reactions; public HTML не показывает removal/editor warning. Уместен один короткий release-update comment; не делать новый DTF-пост. |
| Blocked | Newgrounds | https://www.newgrounds.com/portal/view/1033564 | URL теперь редиректит на https://www.newgrounds.com/portal/rip/1033564. Существующий проект `7759223` доступен в редакторе, но штатный browser upload через `<input type=file>` и прямой `/parkfile` attach сохраняют свежий `itch/gigahrush-itch.zip` как `9B`. Битый attachment удален; публиковать нельзя, пока preview не покажет реальный архив `4.76MB`. |
| Submitted | GamHub | https://gamhub.net/website_submit/ | Отправлена карточка `GIGAH\|RUSH` через публичную форму: itch.io как основной URL, direct browser build и Telegram в описании; категории Adventure/Shooter/Survival/Horror/Simulation, Best Browser Games, free-to-play. Сервер вернул `{"code":200,"msg":"Submit success"}`; follow-up 2026-05-23 18:00 UTC: `/game/gigahrush/`, `/game/gigah-rush/` и search endpoint не дают листинг (`404`). |
| Done / browser check | IndieDB | https://www.indiedb.com/games/gigahrush | Создан листинг, загружены profile assets и 5 gameplay screenshots. Страница изображений: https://www.indiedb.com/games/gigahrush/images/gigahrush-gameplay-screenshots. Follow-up 2026-05-23 18:00 UTC из shell: Cloudflare `403` / `Just a moment...`; проверять лучше браузером/account. |
| Submitted | DiscoverGG | https://discovergg.com/ | Сабмит отправлен; ответ сайта: `Submitted! Live within 24h after review.` Follow-up 2026-05-23 18:00 UTC: homepage newest list без GIGAH\|RUSH; `/game/gigahrush`, `/game/gigah-rush` и `/search?q=gigahrush` возвращают `404`; финального URL пока нет. |
| Submitted | Fake Portal | https://fakeportal.com/submit-a-game/ | Заявка отправлена через авторизованную форму: `Game submitted for review!`, `game_id: 10841`, статус `pending`, title `GIGAH\|RUSH`; follow-up 2026-05-23 18:00 UTC: `/games/gigahrush/`, `/games/gigah-rush/` дают 404, search pages дают `Nothing Found`. |
| Submitted | FreeZonePlay | https://freezoneplay.com/contact-us/ | Заявка отправлена через Contact Form 7; ответ `mail_sent`. WP admin creation недоступен (`403`); follow-up 2026-05-23 18:00 UTC: `/gigahrush/`, `/gigah-rush/` дают 404, search pages для `gigahrush` / `GIGAH RUSH` имеют `search-no-results`. |
| Blocked | Gamemoor | https://gamemoor.com/contact | Аккаунт `jirnyak` авторизован, но `/developer` редиректит на главную, а `/submit`, `/games/add`, `/dashboard`, `/my-games` дают `404`. Нужно написать им через contact и попросить включить developer portal или дать submit URL. |
| Blocked | Free Indie Games | https://www.freeindiegames.org/submit-game/ | Страница показывает сырой shortcode `[ninja_forms_display_form id=1]`; рабочей формы нет, Ninja Forms REST route возвращает `404 rest_no_route`. Нужен repair формы владельцем сайта или email/contact. |
| Blocked / not submitted | Querygame | https://querygame.com/submit | Public submit flow ранее уперся в `/api/submit-game` с ответом `405`, поэтому submission не засчитан. Follow-up 2026-05-23 18:00 UTC: homepage live, `/games/gigahrush`, `/games/gigah-rush` и `/search?q=gigahrush` возвращают Querygame 404. |
| Sent batch 1 | Email-only pitch wave | Alpha Beta Gamer, Free Game Planet, Games Pending | Chrome Apple Events подтвержден; Gmail DOM `Send` показал `Message sent` для `Admin@alphabetagamer.com`, `admin@freegameplanet.com` и `gamespending@gmail.com` 2026-05-23. Быстрый follow-up не делать. |
| Ready / not sent | Email-only pitch wave 2 | Indie Games Plus, Armor Games, TapCraftBox | Тексты готовы для `editors@indiegamesplus.com`, `mygame@armorgames.com`, `support@tapcraftbox.com`. Не отправлено, чтобы не превращать кампанию в массовую рассылку сразу после batch 1; Chrome DOM automation рабочий, но при долгих действиях может требовать активировать Chrome/повторить команду. |
| Done / public playable | Game Jolt | https://gamejolt.com/games/gigahrush/1072064 | Страница `GIGAH\|RUSH` опубликована как `Early Access` / `Published`; description, Teen/non-adult maturity, thumbnail `50560626`, header `50560651`, screenshot `2181594`/`50560706` сохранены. Package `1093814`, release `1474909`, version `0.1.0`; HTML build `gigahrush-itch.zip` опубликован, public API `200`, iframe/play check показал экран `ГИГАХРУЩ - САМОСБОР`. |
| Ready | Next wave targets | `Docs/PRCampaign/next_wave_targets_2026-05-23.md` | Добавлен новый пакет целей: Armor Games, TapCraftBox, Kongregate, Game Jolt, iDev.Games, Gamemoor support, Reddit follow-up и skip/low-fit список. |

## Волна 0: привести главную страницу в порядок

| Приоритет | Площадка | URL | Формат | Ограничения | Действие |
| --- | --- | --- | --- | --- | --- |
| A | itch.io page indexing | https://itch.io/docs/creators/getting-indexed | Проверка индексации/quality | Проект должен быть доступен для игры/скачивания, иметь нормальную страницу, cover, screenshots, теги и не выглядеть как placeholder. | В dashboard проверить, почему стоит `noindex`, и запросить/дождаться indexing. |
| A | itch.io HTML5 build | https://itch.io/docs/creators/html5 | Browser playable page | ZIP с `index.html`; корректная встраиваемая игра; желательно без внешних зависимостей. | Уже работает как HTML5 page; сохранить как primary link. |
| A | Press kit URL | `itch_page_pack/` | One-stop facts/assets | Медиа не должны искать скриншоты и GIF вручную. | Собрать публичный press-kit page или архив: 5-8 скриншотов/GIF, logo/capsule, fact sheet RU/EN, contact. |

## Волна 1: безопасные объявления

| Приоритет | Площадка | URL | Формат | Ограничения | Действие |
| --- | --- | --- | --- | --- | --- |
| A | itch.io Release Announcements | https://itch.io/board/10022/release-announcements | Топик с ссылкой, summary, картинкой/GIF | Правила требуют не link dump: ссылка на itch, краткое описание, хотя бы одно изображение/видео, без накруток и спама. | Опубликовать один release-topic и отвечать на комментарии. |
| A | DTF / Инди | https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror | Уже опубликованный devlog | Не делать чистый рекламный link-drop; DTF запрещает спам и агрессивное продвижение. | Go на один короткий release-update/comment после логина; текст должен быть changelog + просьба проверить понятность первых минут, без нового поста. |
| B | GameDev.ru / Проекты | https://gamedev.ru/projects/forum/?id=295485 | Уже опубликованная тема `Оцените` | Нужны описание, скриншоты, ссылка; поднятие темы не чаще разумного интервала; уже есть жалоба на stuck-looking direct build. | Conditional/no-go для generic update; если отвечать, то сначала признать loading/progress issue, попросить проверить itch.io билд и конкретно UI/первые минуты. |
| B | Reddit r/playmygame | https://www.reddit.com/r/playmygame/ | Media post + комментарий с описанием | Игра должна быть playable for free, нужен direct link, описание, flair, не чаще раза в месяц. | Постить EN-версию с GIF, затем первым комментарием добавить описание и ссылки. |
| C | Reddit r/IndieDev | https://www.reddit.com/r/IndieDev/ | GIF/image, dev-focused angle | Аудитория скорее разработчики; links хуже работают, нужен общий смысл/фидбек. | Постить не "play my game", а вопрос по генерации/визуалу Самосбора. |
| B | Reddit r/indiegames | https://www.reddit.com/r/indiegames/ | Gameplay GIF/video | Самопромо допустимо в разумных пределах, но нельзя маскировать рекламу под пустой feedback-bait. | Один честный пост с названием игры, GIF и ссылкой в комментарии. |
| B | Reddit r/WebGames | https://www.reddit.com/r/WebGames/ | Direct browser game link | Общая антиспам-логика Reddit; не кросспостить одинаковый текст пачкой. | Подходит из-за no-install browser build. |
| B | Reddit r/Games Indie Sunday | https://www.reddit.com/r/Games/ | Indie Sunday self-post | Только в подходящий weekly thread/формат, с сильным описанием и видео/GIF. | Использовать после itch announcement и первого social proof. |

## Волна 2: каталоги и браузерные порталы

| Приоритет | Площадка | URL | Формат | Ограничения | Действие |
| --- | --- | --- | --- | --- | --- |
| A | IndieDB | https://www.indiedb.com/games/gigahrush | Страница игры, новости/updates | Нужна учетная запись; страница проекта и материалы. | Листинг создан; shell follow-up 2026-05-23 18:00 UTC упирается в Cloudflare `403`; следующий шаг - browser/account check `Go Live`/review state и позже update-новость. |
| A | Newgrounds | https://www.newgrounds.com/projects/games/7759223/details | HTML5 upload | Нужен ZIP с `index.html` в корне; игра должна работать в браузере, без pop-ups и правовых проблем. | Сейчас blocked: upload flow сохраняет архив как `9B`; не публиковать, пока Newgrounds не принимает реальный ZIP и preview не играет. |
| A | GamHub | https://gamhub.net/website_submit/ | Browser-game directory submission | Форма публичная, review 24-48 часа; не принимает political/porn/terrorism content. | Отправлено 2026-05-22; follow-up 2026-05-23 18:00 UTC все еще без public URL, проверить еще раз через 48-72h. |
| A | DiscoverGG | https://discovergg.com/ | Browser-game discovery listing | Страница требует бесплатный login/signup: username, email, password. | Сабмит отправлен; follow-up 2026-05-23 18:00 UTC все еще без public URL, проверить через 24-48h и добавить финальный URL после review. |
| B | Gamemoor | https://gamemoor.com/contact | Browser-game publishing platform | Developer portal у авторизованного аккаунта редиректит на главную. | Написать через contact: logged-in account `jirnyak`, `/developer` redirects to homepage, нужен submit URL/developer access. |
| B | PLRun | https://plrun.com/plrun-for-developers/ | HTML5/WebGL portal | Старый developer URL на 2026-05-23 вернул `410/Page Not Found`; возможная новая точка `https://plrun.com/developers/`. Mobile/touch и family-friendly fit слабый. | Не отправлять как обычный P0 pitch; вернуться только после подтверждения актуального contact/developer path и честного content note. |
| B | FreeZonePlay | https://freezoneplay.com/contact-us/ | Email/contact submission | Принимают HTML5/WebGL; требуют hosted link/ZIP, details, screenshots, studio/social links. | Заявка отправлена через contact form; follow-up 2026-05-23 18:00 UTC без public listing, ждать email/listing. |
| B | Free Indie Games | https://www.freeindiegames.org/submit-game/ | Editorial review/contact form | Просят genre, length, publisher, state alpha/beta и детали; review не гарантирован. | Blocked: submit form broken/raw shortcode; нужен repair сайта или email. |
| B | Fake Portal | https://fakeportal.com/submit-a-game/ | Indie directory developer submission | Нужен вход; review после submission. | Заявка отправлена, `game_id: 10841`, status `pending`; follow-up 2026-05-23 18:00 UTC без public listing, проверить публикацию позже. |
| C | Playtesta | https://playtesta.com/ | Paid playtesting/listing | Для creator flow нужен аккаунт; JS bundle показывает checkout `PlayTesta - Indie Game Listing` за `$19`. | Не использовать без отдельного подтверждения бюджета. |
| B | CrazyGames | https://developer.crazygames.com/ | HTML5/WebGL portal | Требуются английская локализация, производительность, SDK/портальные ограничения, no cross-promotion. | Рассматривать после отдельной портальной сборки. |
| B | iDev.Games | https://idev.games/upload-your-game | HTML5 publish | Publish/upload pages публичные, но auth pages закрыты Cloudflare; нужен аккаунт. | Войти или зарегистрироваться в браузере, затем подать игру через upload flow. |
| B | Kongregate | https://blog.kongregate.com/hc/en-us/articles/44395849259661-SUBMISSION-How-do-I-submit-a-game-to-Kongregate-It-s-Easy | HTML5/WebGL developer portal | Нужен аккаунт, Developer Application approval, затем Alpha/review; common rejection reasons включают отсутствие screenshots, description, instructions, age rating, AI declaration и English option. | Завести/войти в аккаунт, подать developer application; после approval заполнить игру. |
| B | Game Jolt | https://gamejolt.com/games/gigahrush/1072064 | Game page + browser build/devlog | Public page is live; package `1093814`, release `1474909`, HTML build from `itch/gigahrush-itch.zip`, iframe preview/playable check passed. Description, Teen maturity, thumbnail, header and one screenshot are saved. | Следить за plays/comments/followers; позже добавить 3-5 gallery screenshots/GIFs и devlog/update. Safe DOM/keyboard automation не открыл devlog composer; не использовать blind coordinate clicks. |
| B | Armor Games | https://developers.armorgames.com/docs/introduction/overview/ | HTML5/iframe pitch по email | Принимают HTML5 и могут смотреть iframe; контакт `mygame@armorgames.com`. | Данные отправителя есть; отправить короткий pitch с itch/direct links и media после безопасного outbound. |
| B | TapCraftBox | https://tapcraftbox.com/page/submit-game | HTML5 email submission | Требования: HTML5, без disruptive ads/malicious links, права на распространение; контакт `support@tapcraftbox.com`. | Данные отправителя есть; отправить hosted links и HTML5/WebGL pitch после безопасного outbound. |
| C | CWS Games | https://www.cwsgames.com/developers.html | Discord submission thread | Принимают browser games, но сайт adult-creator oriented; игра не NSFW. | Решение: пропустить пока, чтобы не ставить survival horror в adult-adjacent каталог. |
| Skip | EmilyGaming | https://www.emilygaming.com/ | HTML game upload | Kids-friendly positioning conflicts with survival horror/violence. | Не подавать текущий билд. |
| Watch | Share.games | https://share.games/ | Future HTML5 platform | Сейчас waitlist/early access. | Добавить в watchlist, не тратить время на submission. |
| C | MegaViral | https://www.megaviral.games/submit/ | Paid HTML5 listing | Требует account email/password и Stripe `$1/month per game`; также лучше PG/family-friendly формулировка. | Не использовать без подтверждения бюджета и контентной совместимости. |
| C | Poki | https://developers.poki.com/ | Curated portal | Жесткие требования к размеру, mobile/desktop, 16:9, no external links, target initial download under 8 MB. | Пока только как future porting target. |
| C | GamePix | https://partners.gamepix.com/developers | HTML5 partner portal | Нужна SDK-интеграция и approval. | Только если появится отдельная revenue-share портальная стратегия. |
| A | Яндекс Игры | https://yandex.com/support/games/ru/for-developers | HTML5 submission | Требуется SDK, модерация, технические требования, возрастная/контентная политика. | Отдельная интеграционная задача: SDK, сохранения, сборка, модерационный пакет. |
| A | Пикабу Игры | https://games.pikabu.ru/add-own-game | HTML5 submission | Нужны GamePush SDK, модерация, русскоязычный интерфейс; возможны требования к статусу разработчика. | Отдельная интеграционная задача после Яндекс/портального адаптера. |
| A | ИграйТут | https://igraytut.ru/pages/publishing-rules | HTML5/WebGL submission | Ручная модерация, ограничения по внешним скриптам/размеру/ссылкам. | Проверить build size и отправить через форму/контакт. |
| B | MyIndie | https://myindie.ru/games | Страница игры | Нужна регистрация и права на весь контент. | Добавить страницу с RU copy и screenshots. |
| B | IndieHub | https://indiehub.ru/ | Страница игры | Нужна регистрация; не нарушать правила каталога. | Добавить короткую страницу и ссылку на itch. |

## Волна 3: кураторы, медиа, стримеры

| Приоритет | Площадка | URL | Формат | Что отправлять |
| --- | --- | --- | --- | --- |
| A | Alpha Beta Gamer | https://www.alphabetagamer.com/contact-us/ | Game submission | Ссылка на playable build, краткий pitch, 3 screenshots/GIF, что игра in development/free to access. |
| A | Free Game Planet | https://www.freegameplanet.com/contact/ | Email/Twitter suggestion | Короткий pitch, direct browser link, GIF, акцент на free browser horror. |
| A | Indie Games Plus | https://www.indiegameplus.com/contact | Email pitch | Review build, короткий hook, GIF, itch link. |
| A | Games Pending | https://gamespending.itch.io/ | Creator pitch | Free itch link, browser/no install, suggested route/session length, content warning. |
| B | DreadXP | https://dreadxp.com/how-to-pitch-dreadxp/ | Horror pitch | Только если цель - publisher/coverage; нужен сильный horror hook и trailer/GIF. |
| B | Indie Horror Showcase / The MIX | https://www.indiehorrorshowcase.com/ | Event submission | Ждать open submissions; нужен trailer 30-60 sec, page, press kit. |
| B | PC Gamer tips/editors | https://www.pcgamer.com/about-pc-gamer/ | Email tip | Слать только после трейлера/крупного обновления: "browser survival horror in endless Soviet apartment block". |
| B | VK Play Media | https://support.vkplay.ru/vkp_media/faq/3767 | Письмо редакции | Описание игры, ссылка, запись геймплея, скриншоты. |
| B | Indie Spotlight | https://t.me/indiespotlight | Предложка/контакт | RU pitch, GIF, ссылка на itch, просьба о посте/подборке. |
| C | Rock Paper Shotgun | https://www.rockpapershotgun.com/ | Pitch/news tip | Только с новостным поводом: крупный релиз, трейлер, Steam page, festival. |
| C | Product Hunt | https://www.producthunt.com/launch/ | One-day launch | Нельзя просить upvotes; аудитория tech/product, не core horror. |
| C | Hacker News Show HN | https://news.ycombinator.com/show | Tech/dev post | Только с техническим углом: zero-dependency one-file WebGL/procedural build. |

## Угол подачи

Главный hook:

> Браузерный survival horror / ARPG shooter про вылазки в бесконечной хрущевке, где NPC живут и умирают, фракции делят зоны, а САМОСБОР может закрыть двери и изменить этаж.

Вторичные hooks:

- запускается прямо в браузере без установки;
- процедурные текстуры, спрайты, звук и WebGL/canvas raycaster;
- 1024x1024 тороидальный бетонный этаж;
- A-Life NPC, перманентные смерти и последствия;
- редкий русскоязычный survival horror по мотивам Самосбора;
- не "уровни", а вылазки: еда, вода, патроны, документы, слухи, контракты.

## Правила кампании

- Не постить один и тот же текст везде.
- Не маскировать разработчика под случайного игрока.
- Не накручивать голоса, лайки, комментарии и рейтинги.
- На Reddit сначала читать rules конкретного сабреддита; link-only post почти всегда плохой.
- На DTF/GameDev.ru просить конкретный фидбек, а не "оцените вообще".
- На медиа писать один короткий pitch и один follow-up через 7-10 дней, если есть повод.
- Для порталов с SDK заводить отдельную интеграционную задачу, не ломать основной zero-runtime build.

## Следующие действия

1. Перепроверить `noindex` на itch.io после асинхронной модерации; если останется, смотреть dashboard/indexing warnings и писать в support.
2. Проверить GamHub через 48-72 часа: поиск `GIGAH|RUSH`, наличие страницы, теги и ссылки; follow-up 2026-05-23 18:00 UTC публичного листинга еще не нашел.
3. Newgrounds: не использовать в активных ссылках, пока `itch/gigahrush-itch.zip` не прикрепится как реальный `4.76MB` archive; текущий blocker - `9B` attachment через штатный upload flow.
4. DTF: добавить один короткий release-update comment после логина. GameDev.ru: не делать generic release bump; возможен только ответ, который признает loading/progress риск direct build и ведет к itch.io как primary link. Chrome DOM automation рабочий, но при ошибке 12 сначала активировать Chrome/проверить `Allow JavaScript from Apple Events`, затем повторить; blind coordinate clicks не использовать.
5. Проверить review/public URL для IndieDB, DiscoverGG, Fake Portal, FreeZonePlay и GamHub; public-проверка 2026-05-23 18:00 UTC не дала финальные GamHub/DiscoverGG/Fake Portal/FreeZonePlay URLs, IndieDB требует browser/account из-за Cloudflare.
6. Querygame не считать submitted: public follow-up 2026-05-23 18:00 UTC все еще 404, submit API ранее вернул `405`.
7. Связаться с Gamemoor и Free Indie Games по broken submit paths.
8. Reddit участок 2: r/playmygame мониторить, не репостить месяц; r/WebGames готовить на 2026-05-24/25 как один direct browser link post, r/indiegames/rIndieDev отложить под media/dev-angle, r/Games Indie Sunday возможен только в воскресное окно и по строгому формату.
9. Email batch 1 отправлен: Alpha Beta Gamer, Free Game Planet, Games Pending. Не отправлять follow-up сразу; мониторить ответы/coverage.
10. Следующая email-порция готова, но не отправлена: Indie Games Plus (`editors@indiegamesplus.com`), Armor Games, TapCraftBox. Отправлять малой порцией через Gmail DOM/manual, без немедленного follow-up batch 1; PLRun не считать P0.
11. Game Jolt уже public/playable. Дальше только мониторинг, extra media/devlog и ответы на реальные комментарии; не делать повторный publish pass.
12. После account login и безопасного final-click режима продолжить Kongregate developer application, iDev.Games и CrazyGames.
13. Спланировать SDK-адаптер для Яндекс Игры / Пикабу Игры без загрязнения основной сборки.

## 2026-05-23 Участок 4: quick RU/listing public recheck

Проверено без логина и без отправок: MyIndie, IndieHub, iDev.Games, Gamemoor.

| Площадка | Статус после публичной проверки | Следующий безопасный шаг |
| --- | --- | --- |
| MyIndie | Реальный quick RU candidate: каталог живой, `Добавить игру` ведет к `/games/create`, unauth redirects to `/login`; публичные фильтры поддерживают `Web (HTML5)`, `Horror`, `Shooter`, `RPG`, `Survival`, `Another`. | Owner login/register; подготовить RU карточку и остановиться перед финальным submit, если форма не показывает draft/preview. |
| IndieHub | Public add path broken: `/game/add` отвечает, что страница не существует и нужно обратиться к администрации в Telegram. | Не считать готовым quick target; сначала support Telegram или logged-in dashboard check. |
| iDev.Games | HTML5/WebGL fits, но публичная страница прямо описывает instant upload / later moderation. | Делать только после owner ok на instant-public; это не draft-safe. |
| Gamemoor | Contact page говорит, что developer portal открыт и review занимает несколько дней; public `/developer` ведет на login, guessed submit/dashboard paths не работают. | После логина проверить `/developer`; при блоке отправить support message для account `jirnyak`. |

Итог очередности участка 4: MyIndie после логина, затем Gamemoor access/support, затем iDev.Games только с подтверждением instant-public, IndieHub только после support/account path.

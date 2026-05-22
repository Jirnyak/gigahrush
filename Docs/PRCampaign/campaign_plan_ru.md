# PR Campaign Plan: ГИГАХРУЩ

Дата запуска: 2026-05-22.

Цель первого прохода: не массовая рассылка, а аккуратная кампания вокруг playable browser build: короткие посты там, где self-promo разрешен, страницы в каталогах браузерных/инди-игр, и точечный pitch медиа/кураторам.

Основные ссылки:

- itch.io: https://tenevik.itch.io/gigahrush
- Онлайн-версия: https://gigahrush.bileter.workers.dev
- Fandom archive: https://samosborarchive.fandom.com/ru/wiki/ГИГАХРУЩ
- Fandom samosb0r: https://samosb0r.fandom.com/ru/wiki/ГИГАХРУЩ
- Fandom archive EN: https://samosborarchive-en.fandom.com/wiki/GIGAH_RUSH

## Запущено

| Статус | Площадка | URL | Что сделано |
| --- | --- | --- | --- |
| Done | Самосбор Archive Fandom | https://samosborarchive.fandom.com/ru/wiki/ГИГАХРУЩ | Создана страница игры. |
| Done | samosb0r Fandom | https://samosb0r.fandom.com/ru/wiki/ГИГАХРУЩ | Создана страница игры. |
| Done | Self-Assembly Wiki EN / Fandom | https://samosborarchive-en.fandom.com/wiki/GIGAH_RUSH | Создана английская страница игры с инфобоксом, контекстом Self-Assembly, ссылками на itch.io, онлайн-версию, Telegram, Newgrounds, DTF и GameDev.ru. |
| Blocked | ShoutWiki Самосбор | https://samosbor.shoutwiki.com/wiki/ГИГАХРУЩ | Публикация невозможна: abuse filter `запрет правок` с правилом `1==1` запрещает все правки. |
| Ready | Copy pack | `Docs/PRCampaign/copy_pack_ru.md` | Готовы RU/EN посты, pitch, письма и one-liners. |
| Ready | Wiki page drafts | `Docs/WikiPages/` | Готовы wikitext-заготовки под вики. |
| Waiting | itch.io indexing | https://itch.io/docs/creators/getting-indexed | Снята галка `Disable new downloads & purchases`, которая исключала проект из индексации; `noindex` пока остается до асинхронной обработки/модерации itch. |
| Done | itch.io Release Announcements | https://itch.io/t/6385827/gigahrush-free-browser-survival-horror-in-an-endless-concrete-apartment-block | Опубликован и отредактирован пост из `Docs/PRCampaign/itch_release_announcement.md`: исправлен Markdown, GIF вставлен как изображение. |
| Done | itch.io Devlog | https://tenevik.itch.io/gigahrush/devlog/1530909/- | Опубликован launch-devlog из `Docs/PRCampaign/itch_devlog_launch_ru.md`; тип `Major Update or Launch`. |
| Needs fix | Reddit r/playmygame | https://old.reddit.com/r/playmygame/comments/1tkteuc/gigahrush_free_browser_survival_horror_arpg/ | Старый self-post не считать эталоном: игра не NSFW, пользователь сам перепостит/поправит non-NSFW текст для horror survival. |
| Done | HTML5 portal preflight | `itch/gigahrush-itch.zip` | `npm run itch:verify` прошел: 7 root-relative files, 4 445 484 bytes. `npm run smoke` прошел: canvas/HUD/scene lit, blank-screen smoke clean. |
| Done | GameDev.ru / Проекты / Оцените | https://gamedev.ru/projects/forum/?id=295485 | Опубликована тема с запросом конкретного фидбека, ссылками на itch.io, онлайн-версию и Telegram. |
| Done | DTF / Инди | https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror | Опубликован devlog-пост с изображением, ссылками на itch.io, онлайн-версию и Telegram; NSFW/adult flags не включались. |
| Done | Newgrounds | https://www.newgrounds.com/portal/view/1033564 | Создан и опубликован HTML5 game project `GIGAH RUSH`: ZIP загружен, icon/genre/rating/author comments заполнены, ссылки на itch.io и Telegram есть в Author Comments. |
| Blocked | IndieDB | https://www.indiedb.com/games/add | Прямая публикация из shell блокируется Cloudflare managed challenge; нужен ручной проход в браузере с авторизованной сессией. |

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
| A | DTF / Инди | https://dtf.ru/indie | Девлог-пост с углом: браузерный survival horror, Самосбор, A-Life, процедурный бетон | Не делать чистый рекламный link-drop; DTF запрещает спам и агрессивное продвижение. | Подготовить длинный пост с GIF и 4-6 скриншотами. |
| B | GameDev.ru / Проекты | https://gamedev.ru/projects/forum/ | Тема `Оцените` или `Релизы` | Нужны описание, скриншоты, ссылка; поднятие темы не чаще разумного интервала. | Постить как запрос фидбека по UI, вылазкам, генерации. |
| B | Reddit r/playmygame | https://www.reddit.com/r/playmygame/ | Media post + комментарий с описанием | Игра должна быть playable for free, нужен direct link, описание, flair, не чаще раза в месяц. | Постить EN-версию с GIF, затем первым комментарием добавить описание и ссылки. |
| C | Reddit r/IndieDev | https://www.reddit.com/r/IndieDev/ | GIF/image, dev-focused angle | Аудитория скорее разработчики; links хуже работают, нужен общий смысл/фидбек. | Постить не "play my game", а вопрос по генерации/визуалу Самосбора. |
| B | Reddit r/indiegames | https://www.reddit.com/r/indiegames/ | Gameplay GIF/video | Самопромо допустимо в разумных пределах, но нельзя маскировать рекламу под пустой feedback-bait. | Один честный пост с названием игры, GIF и ссылкой в комментарии. |
| B | Reddit r/WebGames | https://www.reddit.com/r/WebGames/ | Direct browser game link | Общая антиспам-логика Reddit; не кросспостить одинаковый текст пачкой. | Подходит из-за no-install browser build. |
| B | Reddit r/Games Indie Sunday | https://www.reddit.com/r/Games/ | Indie Sunday self-post | Только в подходящий weekly thread/формат, с сильным описанием и видео/GIF. | Использовать после itch announcement и первого social proof. |

## Волна 2: каталоги и браузерные порталы

| Приоритет | Площадка | URL | Формат | Ограничения | Действие |
| --- | --- | --- | --- | --- | --- |
| A | IndieDB | https://www.indiedb.com/games/add | Страница игры, новости/updates | Нужна учетная запись; страница проекта и материалы. | Создать profile, добавить screenshots/GIF, затем update-новость. |
| A | Newgrounds | https://www.newgrounds.com/projects/games/new | HTML5 upload | Нужен ZIP с `index.html` в корне; игра должна работать в браузере, без pop-ups и правовых проблем. | Проверить совместимость single-file build и создать NG-пакет. |
| B | CrazyGames | https://developer.crazygames.com/ | HTML5/WebGL portal | Требуются английская локализация, производительность, SDK/портальные ограничения, no cross-promotion. | Рассматривать после отдельной портальной сборки. |
| B | iDev.Games | https://idev.games/publish-game | HTML5 publish | Нужна browser game; низкий порог входа; `/submit-game` сейчас отдает 404. | Добавить как small web-indie listing. |
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

1. Через 1-2 часа перепроверить `noindex` на itch.io; если останется, ждать ручной модерации или писать в support.
2. Пройти IndieDB Cloudflare/email validation в живом браузере и создать страницу игры по `Docs/PRCampaign/en_portal_store_copy.md`.
3. Проверить Newgrounds embed/play preview вручную в браузере и при необходимости поправить viewport/tags/title.
4. Отправить Alpha Beta Gamer и Free Game Planet коротким EN pitch.
5. Спланировать SDK-адаптер для Яндекс Игры / Пикабу Игры без загрязнения основной сборки.

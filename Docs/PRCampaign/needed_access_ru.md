# Что нужно от владельца для продолжения PR

Дата: 2026-05-22.

Не присылай личные пароли в чат, если можно обойтись входом в браузере. Лучший вариант: открыть нужную площадку в Opera GX или Chrome, войти там, после этого я продолжу публикацию через уже авторизованную сессию.

## Уже не требует действий

| Площадка | Статус |
| --- | --- |
| samosborarchive Fandom | Страница опубликована: https://samosborarchive.fandom.com/ru/wiki/ГИГАХРУЩ |
| samosb0r Fandom | Страница опубликована: https://samosb0r.fandom.com/ru/wiki/ГИГАХРУЩ |
| Self-Assembly Wiki EN / Fandom | Страница опубликована: https://samosborarchive-en.fandom.com/wiki/GIGAH_RUSH |
| ShoutWiki Самосбор | Нужен не логин, а разморозка вики: abuse filter `запрет правок` запрещает все правки правилом `1==1`. |
| itch.io Release Announcements | Топик опубликован: https://itch.io/t/6385827/gigahrush-free-browser-survival-horror-in-an-endless-concrete-apartment-block |
| itch.io Devlog | Devlog опубликован: https://tenevik.itch.io/gigahrush/devlog/1530909/- |
| DTF | Пост опубликован: https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror |
| GameDev.ru | Тема опубликована: https://gamedev.ru/projects/forum/?id=295485 |
| Newgrounds | Игра опубликована: https://www.newgrounds.com/portal/view/1033564 |
| Reddit r/playmygame | Старый пост не использовать как эталон: игра не NSFW, для нового ручного поста нужен non-NSFW текст. |

## Нужен вход в аккаунт

| Площадка | Что нужно | Что я сделаю после входа |
| --- | --- | --- |
| IndieDB | Открыть https://www.indiedb.com/games/add в Opera GX или Chrome, пройти Cloudflare managed challenge и email/account validation, оставить вкладку авторизованной, потом написать `готово`. Пароль в чат не нужен. Если сайт попросит одноразовый код, пришли только код. | Создам страницу игры, добавлю EN description, screenshots/GIF и ссылки на itch/web build. |
| iDev.Games | Войти или создать аккаунт iDev.Games. Актуальная стартовая страница: https://idev.games/publish-game (`/submit-game` сейчас отдает 404). | Подам HTML5 build или подготовлю страницу с текущим ZIP после iframe-smoke. |
| Reddit следующие сабреддиты | Текущий Reddit уже авторизован, но лучше не постить пачкой. | Через 24-48 часов можно идти в r/WebGames, затем r/indiegames другим текстом. |

## Нужны контактные данные

| Для чего | Что нужно |
| --- | --- |
| Письма медиа/кураторам | Имя/ник для подписи, контактный email, можно ли указывать Telegram `https://t.me/gigah_rush`. |
| Alpha Beta Gamer / Free Game Planet / Indie Games Plus | Контактный email и разрешение отправлять pitch от имени проекта. |
| VK Play Media / Telegram-каналы | Имя/ник, Telegram для обратной связи, разрешение использовать RU pitch. |

## Нужны решения по порталам

| Портал | Решение |
| --- | --- |
| Яндекс Игры | Нужен отдельный SDK-адаптер и developer account. Это уже техническая задача, не просто публикация. |
| Пикабу Игры | Нужен GamePush/юридический статус и отдельная портальная сборка; физлицам без подходящего статуса может быть нельзя. |
| ИграйТут | Нужно решить, публикуем ли без SDK или делаем SDK-сборку; для SDK есть ограничения на cloud save size. |
| CrazyGames | Можно начинать с Basic Launch build, но для Full Launch нужен SDK и portal QA. |

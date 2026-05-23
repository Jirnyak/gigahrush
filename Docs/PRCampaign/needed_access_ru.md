# Что нужно от владельца для продолжения PR

Дата: 2026-05-23.

Не присылай личные пароли в чат, если можно обойтись входом в браузере. Лучший вариант: открыть нужную площадку в Opera GX или Chrome, войти там, после этого я продолжу публикацию через уже авторизованную сессию.

## Уже не требует действий

| Площадка | Статус |
| --- | --- |
| samosborarchive Fandom | Страница опубликована: https://samosborarchive.fandom.com/ru/wiki/ГИГАХРУЩ |
| samosb0r Fandom | Страница опубликована: https://samosb0r.fandom.com/ru/wiki/ГИГАХРУЩ |
| Self-Assembly Wiki EN / Fandom | Страница опубликована: https://samosborarchive-en.fandom.com/wiki/GIGAH_RUSH |
| Fandom game lists | `ГИГАХРУЩ` добавлен в https://samosborarchive.fandom.com/ru/wiki/Игры_по_вселенной, `GIGAH RUSH` добавлен в https://samosborarchive-en.fandom.com/wiki/Self-Assembly_Games |
| ShoutWiki Самосбор | Нужен не логин, а разморозка вики: abuse filter `запрет правок` запрещает все правки правилом `1==1`. |
| itch.io Release Announcements | Топик опубликован: https://itch.io/t/6385827/gigahrush-free-browser-survival-horror-in-an-endless-concrete-apartment-block |
| itch.io Devlog | Devlog index опубликован: https://tenevik.itch.io/gigahrush/devlog; прежний прямой URL `https://tenevik.itch.io/gigahrush/devlog/1530909/-` вернул публичный `404` из shell на 2026-05-23, нужен browser/dashboard check permalink. |
| DTF | Пост опубликован: https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror |
| GameDev.ru | Тема опубликована: https://gamedev.ru/projects/forum/?id=295485 |
| Newgrounds | Больше не считать закрытым успешным действием: https://www.newgrounds.com/portal/view/1033564 редиректит на RIP/eulogy https://www.newgrounds.com/portal/rip/1033564. Существующий проект `7759223` редактируется, но штатный upload flow сохраняет свежий ZIP как `9B`; битый файл удален. |
| GamHub | Публичная форма приняла сабмит: https://gamhub.net/website_submit/ вернул `{"code":200,"msg":"Submit success"}`. Публичного URL еще нет, нужен review 24-48 часов. |
| Reddit r/playmygame | Новый non-NSFW пост опубликован пользователем: https://www.reddit.com/r/playmygame/comments/1tku91k/gigahrush/ |
| IndieDB | Листинг создан: https://www.indiedb.com/games/gigahrush; загружены assets и 5 gameplay screenshots: https://www.indiedb.com/games/gigahrush/images/gigahrush-gameplay-screenshots |
| DiscoverGG | Сабмит отправлен; ответ сайта: `Submitted! Live within 24h after review.` На 2026-05-23 `/game/gigahrush`, guessed slugs и internal search пустые; финальный public URL пока не выдан. |
| Fake Portal | Сабмит отправлен; ответ сайта: `Game submitted for review!`, `game_id: 10841`, status `pending`; публичный поиск/direct slugs на 2026-05-23 не подтверждают листинг. |
| FreeZonePlay | Заявка отправлена через contact form: `mail_sent`; публичный поиск/direct slugs на 2026-05-23 не дают реальный листинг. |
| Email batch 1 | Отправлено через Gmail DOM automation 2026-05-23: Alpha Beta Gamer `Admin@alphabetagamer.com`, Free Game Planet `admin@freegameplanet.com`, Games Pending `gamespending@gmail.com`. Gmail показал `Message sent` по каждому письму. |
| Game Jolt | Страница опубликована публично: https://gamejolt.com/games/gigahrush/1072064; description сохранен; maturity сохранен как Teen/non-adult; thumbnail `50560626`, header `50560651`, screenshot `2181594`/`50560706` загружены. Package `1093814`, release `1474909`, version `0.1.0`; HTML build `gigahrush-itch.zip` загружен из `itch/gigahrush-itch.zip`, playable check дошел до `ГИГАХРУЩ - САМОСБОР` с видимым canvas. |

## Нужен логин для обновления уже опубликованных постов

| Площадка | Что нужно | Что я сделаю после входа |
| --- | --- | --- |
| DTF | Оставить авторизованную вкладку https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror или написать, что пост обновлять вручную. | Добавлю короткий комментарий/update: свежий релиз уже на itch.io и Cloudflare, ссылка на билд, просьба о фидбеке без повторной рекламной простыни. |
| GameDev.ru | Оставить авторизованную вкладку https://gamedev.ru/projects/forum/?id=295485 или написать, что пост обновлять вручную. | Добавлю reply/update с changelog-смыслом и запросом конкретного фидбека. |

## Нужен вход в аккаунт

| Площадка | Что нужно | Что я сделаю после входа |
| --- | --- | --- |
| iDev.Games | Открыть https://idev.games/login или https://idev.games/register в Opera GX/Chrome, пройти Cloudflare и войти/создать аккаунт. Актуальная стартовая страница: https://idev.games/publish-game (`/submit-game` сейчас отдает 404). | Подам HTML5 build или подготовлю страницу с текущим ZIP после iframe-smoke. |
| Reddit следующие сабреддиты | Текущий Reddit уже авторизован, но лучше не постить пачкой. | Через 24-48 часов можно идти в r/WebGames, затем r/indiegames другим текстом. |

## Нужен ручной контакт с владельцами площадок

| Площадка | Что произошло | Что нужно от владельца проекта |
| --- | --- | --- |
| Newgrounds | В существующем проекте `7759223` штатный browser upload через настоящий file input и прямой `/parkfile` attach оба сохраняют свежий `itch/gigahrush-itch.zip` как `9B`; прямой `file_2=@zip` не прикрепляет файл. | Если продолжаем Newgrounds, открыть редактор вручную и проверить, повторяется ли `9B`. Если повторяется, писать в Newgrounds support: HTML5 ZIP `4.76MB` attaches as `9B` in project `7759223`. Не нажимать publish без playable preview. |
| Gamemoor | Аккаунт `jirnyak` авторизован, но `/developer` редиректит на главную; `/submit`, `/games/add`, `/dashboard`, `/my-games` дают `404`. | Открыть https://gamemoor.com/contact и попросить включить developer portal для `jirnyak` или дать актуальный submit URL. |
| Free Indie Games | https://www.freeindiegames.org/submit-game/ показывает сырой shortcode `[ninja_forms_display_form id=1]`; рабочей формы нет. | Нужен email/contact владельца сайта или ремонт формы на их стороне. |

## Контакт подтвержден, outbound работает

Контакт подтвержден 2026-05-23:

- Ник/подпись: `jirnyak`
- Email: `jirnyak@gmail.com`
- Сайт: https://jirny.uk
- Telegram можно указывать: https://t.me/gigah_rush
- Основная страница игры: https://tenevik.itch.io/gigahrush

| Для чего | Что нужно |
| --- | --- |
| Письма медиа/кураторам | Gmail batch 1 был отправлен через DOM automation, без координатных кликов. Chrome Apple Events рабочий, но при длинной автоматизации может вернуть ошибку 12; если это случится, активировать Chrome/проверить menu item и повторить. Следующую отправку делать малой порцией через Gmail DOM/manual, без массовой рассылки. |
| Alpha Beta Gamer / Free Game Planet / Games Pending | Уже отправлено 2026-05-23; не отправлять быстрый follow-up, ждать ответов/coverage. |
| Indie Games Plus / TapCraftBox / Armor Games | Тексты готовы, но не отправлены. Для Indie Games Plus использовать `editors@indiegamesplus.com`; Armor Games `mygame@armorgames.com`; TapCraftBox `support@tapcraftbox.com`. |
| PLRun | Не считать P0 email target: старый `https://plrun.com/plrun-for-developers/` на 2026-05-23 вернул `410`; возвращаться только после подтверждения актуального developer/contact path. |
| VK Play Media / Telegram-каналы | Telegram разрешен как контакт; RU pitch допустим. |

## Нужны решения по порталам

| Портал | Решение |
| --- | --- |
| Яндекс Игры | Нужен отдельный SDK-адаптер и developer account. Это уже техническая задача, не просто публикация. |
| Пикабу Игры | Нужен GamePush/юридический статус и отдельная портальная сборка; физлицам без подходящего статуса может быть нельзя. |
| ИграйТут | Нужно решить, публикуем ли без SDK или делаем SDK-сборку; для SDK есть ограничения на cloud save size. |
| CrazyGames | Можно начинать с Basic Launch build, но для Full Launch нужен SDK и portal QA. |
| Newgrounds | Сейчас не playable listing: RIP/eulogy, а свежий ZIP в редакторе сохраняется как `9B`. Нужна ручная проверка/support; до этого не ссылаться как на active publication. |
| Kongregate | Нужен аккаунт и Developer Application approval; после approval можно загружать HTML5/WebGL/iframe game в Alpha/review. |
| Game Jolt | Public page уже опубликован; package `1093814`, release `1474909`, HTML build `itch/gigahrush-itch.zip`, playable preview check пройден. Осталось только мониторить plays/comments/followers и позже добавить дополнительные media/devlog через безопасный UI path. |
| CWS Games | Решение: пропустить пока. Площадка adult-adjacent, а игра не NSFW; публикация даст неправильный контекст. |
| MegaViral | Нужен отдельный бюджетный ok: форма требует Stripe `$1/month per game`. Без подтверждения не трогать. |

## Участок 4: account-gated / quick listing queue, проверено 2026-05-23

Без логина и без отправок проверены публичные текущие URL:

| Площадка | Что нужно от владельца | Что можно сделать безопасно после входа |
| --- | --- | --- |
| Game Jolt | Аккаунт уже использован для создания и публикации страницы. Description, Teen maturity, thumbnail, header, один screenshot, package `1093814`, release `1474909` и HTML build уже сохранены. | Следующий шаг: мониторинг, дополнительные screenshots/GIFs и devlog/update, если composer открывается trusted UI path. Финальный publish уже сделан после playable preview. |
| MyIndie | Войти/создать аккаунт на https://myindie.ru/login или https://myindie.ru/register. | Можно подготовить RU listing через https://myindie.ru/games/create, если после логина есть preview/draft. Если форма сразу публикует, остановиться перед финальным действием. |
| iDev.Games | Войти/создать developer account на https://idev.games/register или https://idev.games/login; пройти Cloudflare/JS в браузере. | Публикация не draft-safe: публичная страница говорит, что игра добавляется instantly and then moderated later. Загружать только после явного ok на моментальную публичность. |
| IndieHub | Зарегистрироваться/войти на https://indiehub.ru/ или написать в support Telegram с вопросом о рабочем add-game path. | Публичная кнопка `добавить игру` ведет на https://indiehub.ru/game/add, где сейчас ошибка “страница не существует”. Не считать готовым quick target, пока аккаунт/support не покажет рабочую форму. |
| Kongregate | Создать/войти в аккаунт Kongregate, выбрать username осознанно, подать Developer Application и дождаться approval. | Это не quick listing: до approval нельзя публиковать. После approval можно подготовить Alpha submission; publish доступен только после Kongregate review/approval. |

Дополнительные owner decisions перед финальными кликами:

- Kongregate требует English language option и AI declaration. Нужно решить формулировку AI disclosure для игры до Alpha submission.
- Game Jolt maturity уже сохранен как Teen/non-adult: cartoon violence 2, fantasy violence 2, bloodshed 2, без sexual/gambling/adult flags.
- iDev.Games adult/hateful content rule делает survival-horror допустимым только с аккуратной non-NSFW content note; не использовать adult positioning.

## Участок 4: quick RU/listing public recheck, 2026-05-23

Проверено публично без логина и без отправок:

| Площадка | Текущий публичный факт | Что нужно от владельца |
| --- | --- | --- |
| MyIndie | `https://myindie.ru/games` живой; есть `Добавить игру`; поддерживает `Web (HTML5)`, `Horror`, `Shooter`, `RPG`, `Survival`, движок `Another`. `https://myindie.ru/games/create` редиректит на `https://myindie.ru/login`. | Войти/зарегистрироваться на MyIndie. После входа я могу заполнить RU listing, но остановлюсь перед финальной отправкой, если нет явного draft/preview. |
| IndieHub | `https://indiehub.ru/` показывает вход/регистрацию, `добавить игру`, правила и Telegram support. `https://indiehub.ru/game/add` сейчас отвечает ошибкой, что страницы нет и нужно обратиться к администрации в Telegram. | Либо войти и проверить, появляется ли рабочий add-flow, либо написать в support Telegram и попросить актуальный путь добавления игры. |
| iDev.Games | `https://idev.games/upload-your-game` / `/publish-game` говорят: нужен account, HTML5/WebGL подходит, добавление игры происходит instantly, потом moderation/verification later; сайт требует JavaScript/Cloudflare. | Войти/зарегистрироваться и отдельно подтвердить, что можно публиковать instant-public. Без такого ok не загружать. |
| Gamemoor | `https://gamemoor.com/contact` говорит, что developer portal открыт и submissions идут в review queue за несколько дней. Публично `https://gamemoor.com/developer` редиректит на login; `/submit`, `/dashboard`, `/my-games`, `/games/add` не дают рабочий submit. | Войти и открыть `/developer`; если снова редирект/нет доступа, отправить support message с просьбой включить developer portal для `jirnyak` или дать submit URL. |

Реально можно сегодня:

1. MyIndie: подготовить карточку после логина; финальный submit только после проверки, есть ли draft/preview.
2. Gamemoor: проверить `/developer` после логина или отправить support request; это не instant-public.
3. iDev.Games: публиковать только после явного согласия на instant-public.
4. IndieHub: не тратить финальные клики; сначала support/login check.

## Браузерная автоматизация

Chrome давал выполнять JavaScript через AppleScript: проверка вернула title активной вкладки, Game Jolt description/maturity/media были сохранены, Gmail отправил 3 письма через DOM-кнопку Send. Во время длинной передачи ZIP Chrome один раз вернул ошибку 12, но пункт `Allow JavaScript from Apple Events` оставался отмеченным; после активации Chrome и повтора выполнение JS восстановилось, Game Jolt ZIP/release/game publish были завершены.

```text
Chrome menu: View > Developer > Allow JavaScript from Apple Events
```

Все равно не использовать слепые координатные клики по формам, file dialogs, Gmail send buttons или portal publish buttons. Безопасный режим: DOM-inspection/DOM-action и trusted keyboard activation; final publish/upload только после page-specific preview. Если Chrome вернет ошибку 12, сначала активировать Chrome, проверить `View > Developer > Allow JavaScript from Apple Events`, затем повторить команду.

## Готовый email pitch

Для Alpha Beta Gamer, Free Game Planet, Indie Games Plus (`editors@indiegamesplus.com`) и Games Pending:

```text
Subject: GIGAH|RUSH - free browser survival horror / ARPG shooter

Hello,

My name is jirnyak. I am affiliated with the development/outreach for GIGAH|RUSH, a free browser survival horror / ARPG shooter about expeditions inside an endless Soviet-style concrete apartment block.

The player prepares food, water, ammo, medicine, documents and weapons, then leaves the safer living area for hostile floors with factions, traders, monsters, quests, rumors and Samosbor events. The current browser build includes preparation, expeditions, combat, trading, inventory, quests, factions, procedural floors, browser saves, A-Life NPCs and persistent consequences.

Primary link: https://tenevik.itch.io/gigahrush
Direct browser build: https://gigahrush.bileter.workers.dev
Telegram: https://t.me/gigah_rush
Official site: https://jirny.uk

Content note: survival horror atmosphere, monsters, combat, death, corpses, blood, weapon use, sirens and disturbing procedural events. It is not NSFW.

If this fits your coverage, list, video channel or indie roundup, I would be glad if you took a look.

Best,
jirnyak
jirnyak@gmail.com
```

Для TapCraftBox / Armor Games / Free Play Games добавить перед `Content note`:

```text
The game is HTML5/WebGL/canvas, runs directly in the browser with no install, and has no ads or premium purchases in the submitted build.
```

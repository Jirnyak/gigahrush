# Next PR Wave Targets - 2026-05-23

Purpose: continue the campaign without spam. Use this as the working queue for surfaces that were not completed in the first portal wave.

Primary links:

- itch.io: https://tenevik.itch.io/gigahrush
- Official site: https://jirny.uk
- Direct browser build: https://gigahrush.bileter.workers.dev
- Telegram: https://t.me/gigah_rush
- IndieDB: https://www.indiedb.com/games/gigahrush

Sender/contact confirmed by owner on 2026-05-23:

- Sender name/nick: `jirnyak`
- Contact email: `jirnyak@gmail.com`
- Telegram may be used in pitch copy: yes, `https://t.me/gigah_rush`
- Use itch.io and already published resource pages as primary links.

Current release artifact:

- `itch/gigahrush-itch.zip`: 4 992 192 bytes, SHA-256 `5930f53b913ec9666d0de8a5ae2f5034b799b90fbd3d91951f087d547ca0ad18`.

## P0: Email / Contact Targets

These are not blocked by passwords, but they need a working outbound mail channel. Do not use a fake email.

| Target | URL / Contact | Fit | Action |
| --- | --- | --- | --- |
| Armor Games | `mygame@armorgames.com`; docs: https://developers.armorgames.com/docs/introduction/overview/ | Strong browser-game fit. They currently accept HTML5 games and can also consider iframe hosting for special cases. | Send a short pitch with itch.io, direct build, 2 GIF/screens, content warning and offer ZIP only if requested. |
| TapCraftBox | `support@tapcraftbox.com`; docs: https://tapcraftbox.com/page/submit-game | HTML5 browser portal. Requirements: HTML5, no disruptive ads/malicious links, rights to distribute. | Send game details and hosted links; mention no ads/premium purchases in submitted build. |
| Gamemoor | https://gamemoor.com/contact | Already has logged-in account, but developer portal redirects to homepage. | Send account/support message: logged-in account `jirnyak`, `/developer` redirects to homepage, need submit URL or developer access. |
| Alpha Beta Gamer | `Admin@alphabetagamer.com`; page: https://www.alphabetagamer.com/contact-us/ | Good fit for free in-development playable builds and horror. | Sent 2026-05-23; wait for reply/coverage, no quick follow-up. |
| Free Game Planet | `admin@freegameplanet.com`; page: https://www.freegameplanet.com/contact/ | Good fit for free browser games and horror. | Sent 2026-05-23 with direct build first; wait for reply/coverage, no quick follow-up. |
| Indie Games Plus | `editors@indiegamesplus.com`; page: https://indiegamesplus.com/contact/ | Good weird-indie fit. | Send short EN pitch with hook, itch/direct links and screenshot/GIF links; do not use the older unconfirmed Gmail address. |
| Games Pending | `gamespending@gmail.com`; itch page: https://gamespending.itch.io/ | Good gameplay-video fit. | Sent 2026-05-23 with suggested 10-15 minute route and content note; wait for reply/video. |
| PLRun | previously `dev@plrun.com`; old page https://plrun.com/plrun-for-developers/ now returns `410`; possible portal page https://plrun.com/developers/ | Low/conditional. Browser-game portal fit is weaker because it likely prefers mobile/touch and family-friendly games. | Do not send as normal P0 media pitch; only revisit if the current developer/contact path is confirmed and the content note is accepted. |
| TapCraftBox / Free Play Games class targets | Existing pitch pack | Browser-game directory fit varies. | Use the HTML5/WebGL no-install paragraph from `needed_access_ru.md`. |

2026-05-23 execution note:

- Chrome JavaScript-from-Apple-Events worked for Gmail batch 1 and the completed Game Jolt publish. It can intermittently return error 12 during long automation; activate Chrome/check `View > Developer > Allow JavaScript from Apple Events`, then retry. Do not use blind coordinate clicks.
- First targeted email batch sent on 2026-05-23; Gmail showed `Message sent` for Alpha Beta Gamer, Free Game Planet and Games Pending.
- Second batch copy is ready for Indie Games Plus, Armor Games and TapCraftBox, but not sent yet to avoid turning the campaign into a mass blast immediately after batch 1.
- Before sending, add 2-3 direct media links if available. If no public press-kit URL exists yet, use itch/direct/IndieDB links and offer ZIP/screens/GIFs on request.

## P0 Message Drafts

### Armor Games / TapCraftBox

```text
Subject: GIGAH|RUSH - free browser survival horror / ARPG shooter

Hello,

My name is jirnyak. I am affiliated with GIGAH|RUSH, a free HTML5/WebGL browser survival horror / ARPG shooter about expeditions inside an endless Soviet-style concrete apartment block.

The player prepares food, water, ammo, medicine, documents and weapons, then leaves the safer living area for hostile floors with factions, traders, monsters, quests, rumors and Samosbor events. The current browser build includes preparation, expeditions, combat, trading, inventory, quests, factions, procedural floors, browser saves, A-Life NPCs and persistent consequences.

Primary link: https://tenevik.itch.io/gigahrush
Official site: https://jirny.uk
Direct browser build: https://gigahrush.bileter.workers.dev
IndieDB: https://www.indiedb.com/games/gigahrush
Telegram: https://t.me/gigah_rush

The submitted build runs in the browser with no install, no ads and no premium purchases. Content note: survival horror atmosphere, monsters, combat, death, corpses, blood, weapon use, sirens and disturbing procedural events. It is not NSFW.

If this fits your portal or roundup, I would be glad if you took a look. I can provide a ZIP, screenshots, GIFs or any extra metadata you need.

Best,
jirnyak
jirnyak@gmail.com
```

### Gamemoor Support

```text
Subject: Developer portal access for GIGAH|RUSH

Hello,

I am trying to submit GIGAH|RUSH from the logged-in account `jirnyak`, but https://gamemoor.com/developer redirects to the homepage for this account. I also could not find a working submit URL under `/submit`, `/games/add`, `/dashboard` or `/my-games`.

Could you enable developer portal access for `jirnyak` or send the current game submission URL?

Game: GIGAH|RUSH
itch.io: https://tenevik.itch.io/gigahrush
Direct browser build: https://gigahrush.bileter.workers.dev
Telegram: https://t.me/gigah_rush

Best,
jirnyak
jirnyak@gmail.com
```

## P1: Account / Browser Session Required

| Target | URL | Fit | Blocker | Next Step |
| --- | --- | --- | --- | --- |
| Kongregate | https://blog.kongregate.com/hc/en-us/articles/44395849259661-SUBMISSION-How-do-I-submit-a-game-to-Kongregate-It-s-Easy | Strong browser portal fit. They accept HTML5/WebGL and iframe options, but require developer approval first. | Need Kongregate account and Developer Application approval; not instant. | Owner logs in/creates account, applies as developer, then agent fills Alpha submission after approval. |
| Game Jolt | https://gamejolt.com/games/gigahrush/1072064 | General indie page and devlog fit; supports browser-based game files according to creator docs. | Public page is live; package `1093814`, release `1474909`, version `0.1.0`; `itch/gigahrush-itch.zip` is uploaded as `HTMLActive`; public API returns `200`; playable check reached `ГИГАХРУЩ - САМОСБОР` with visible canvas. | Next: monitor plays/comments/followers; later add more screenshots/GIFs and a devlog/update through a trusted composer path. |
| iDev.Games | https://idev.games/upload-your-game | Good HTML5 fit; page says upload is free and added instantly, then moderated later. | Need account/browser login; site uses JS/Cloudflare. | Owner creates account/logs in, then agent uploads or fills page. |
| MyIndie | https://myindie.ru/games | Quick RU listing candidate. | Need account/registration and honest stage/content description. | Owner logs in; agent prepares page draft with RU copy, screenshots and itch/direct links. |
| IndieHub | https://indiehub.ru/ | Quick RU listing candidate; public page exposes add-game/account paths and Telegram support. | Need account/registration; detailed public requirements are sparse. | Owner logs in; agent prepares draft and waits for explicit publish confirmation. |
| CrazyGames | https://developer.crazygames.com/ | Large browser portal, but more QA/portal-specific. | JS app, likely account and portal QA; Full Launch/monetization should be separate SDK task. | Treat as later technical portal task, not quick PR. |
| GX.games | https://gamemaker.io/en/tutorials/publish-to-gxgames-tutorial | Opera/GX audience fit, but publish flow is GameMaker/GX Dev oriented. | Current project is TypeScript/Vite, not GameMaker. | Skip unless a GameMaker/GX-specific wrapper/port is planned. |
| Querygame | https://querygame.com/submit/ | General directory candidate. | Public form JS calls `/api/submit-game`, but direct POST returned `405` on 2026-05-23; likely broken server endpoint. | Recheck later or use their required confirmation email only if form starts accepting submissions. |

Kongregate submission notes:

- They require account creation and a Developer Application first.
- After developer approval, upload enters Alpha/review.
- Common rejection reasons include: not playable in browser, missing screenshots, missing description, missing instructions, no age rating, no AI declaration, and no English language option.
- Do not start this until the owner is ready for an account + approval queue.

## P1: Reddit / Community Follow-Up

Do not post the same copy everywhere. The current r/playmygame post is live; wait at least 24-48 hours and use a different angle.

2026-05-23 check: do not add another Reddit/community post today. The r/playmygame post is still fresh and only public AutoModerator activity was visible; monitor comments and prepare r/WebGames for 2026-05-24/25.

2026-05-23 участок 2 recheck: r/playmygame is still public at `https://www.reddit.com/r/playmygame/comments/1tku91k/gigahrush/`; public JSON shows `removed_by_category: null`, `over_18: false`, `score: 1`, `upvote_ratio: 1.0`, `num_comments: 1`, and the only visible comment is AutoModerator's safe-for-work/low-effort reminder. Do not repost to r/playmygame for one month. If the owner wants one additional Reddit post despite the fresh r/playmygame post, r/WebGames is the only rule-fit candidate for a same-day post, but campaign risk remains medium-high because it would be another Reddit self-promo within roughly 10 hours. Safer recommendation: wait until 2026-05-24 or 2026-05-25 and post only one subreddit.

### 2026-05-23 Reddit go/no-go

| Target | Current rule fit | Same-day decision |
| --- | --- | --- |
| r/WebGames | Fits the game: browser playable, no account required, direct permanent URL, title must start with game name, no repost found in subreddit search. Account must be at least 7 days old with 10 comment karma. | Conditional go only if the owner accepts the same-day self-promo risk; otherwise schedule for 2026-05-24/25. Use a direct link post to the Cloudflare build, not itch.io. |
| r/indiegames | Promotion is allowed only with gameplay image/gif/video; no URL shorteners; no feedback-bait title; store/page/social links and feedback-on-promo-material posts are disallowed. | No-go today. Use later with a Reddit-native GIF/video or direct GIF post, promotional title, and no feedback-bait. |
| r/IndieDev | Loose rules, but audience prefers GIFs/images and is peer/developer-focused; only explicit current rule bans capsule comparison posts except Wednesdays. | No-go today. Use later only with a dev/process angle and media, not as a play-my-game duplicate. |
| r/Games Indie Sunday | Only Sunday 12 AM EST for 24h; text post, Indie Sunday flair, required video footage in body, developer-only, same game/developer cooldown 60 days. | No-go today because 2026-05-23 is Saturday. Earliest window is Sunday 2026-05-24 00:00 EST, if account history and format are clean. |

| Target | Format | Text Angle | Risk |
| --- | --- | --- | --- |
| r/WebGames | Direct browser game link or short self-post | "Free browser survival horror you can launch in one click." Lead with direct build, itch second. | Avoid duplicating r/playmygame body. |
| r/indiegames | GIF/image post + link comment | Focus on Samosbor/A-Life/factions, not just "play my game". | Watch self-promo rules and cooldown. |
| r/IndieDev | Dev-focused post | Technical/process angle: one-file WebGL/canvas survival sim, procedural assets, A-Life. | Do not make it a naked ad. |
| r/Games Indie Sunday | Weekly allowed format only | Strong description + media + direct play link. | Only in the Indie Sunday hub and only if current weekly rules fit. |

### r/WebGames Draft

```text
Title: GIGAH|RUSH - free browser survival horror inside an endless concrete apartment block

I just released a fresh browser build of GIGAH|RUSH, a survival horror / ARPG shooter about expeditions inside a huge Soviet-style concrete apartment block.

You prepare food, water, ammo, medicine, documents and weapons, then leave the safer living area for hostile floors with factions, traders, monsters, quests, rumors and Samosbor events. NPCs trade, sleep, fight, hide and can die permanently; factions react to your actions and consequences persist.

Play directly in browser: https://gigahrush.bileter.workers.dev
itch.io page: https://tenevik.itch.io/gigahrush

Free to play. Not NSFW; it is survival horror with combat, corpses, blood, sirens and disturbing events.
```

## P2: Low Fit / Skip For Now

| Target | Reason |
| --- | --- |
| CWS Games | Skip for now. It accepts HTML/WebGL/JavaScript via Discord, but the site is explicitly adult-creator oriented. GIGAH|RUSH is not NSFW, so posting there would likely misplace the game and attract the wrong expectation. |
| EmilyGaming | Kids-friendly positioning. GIGAH|RUSH is survival horror with violence and disturbing events, so this is a poor fit. |
| Share.games | Currently waitlist/early access, not an active submission channel. |
| GegGames | Developer page says they accept HTML5/WebGL, but no clear submit form appeared in the public page; use contact only after sender email is available. |
| EducationalGamez | Educational positioning does not match the game. |

## Owner Needed

1. Browser automation: Chrome Apple Events are usable in the authenticated Chrome window but can fail intermittently on long runs. Still use DOM inspection/actions and trusted keyboard activation only, no blind coordinate clicks.
2. Game Jolt: public publishing is complete; next owner/agent work is monitoring, extra media and optional devlog, not another publish pass.
3. Account/browser login for Kongregate, iDev.Games and CrazyGames if we continue those; they are JS/account portals.
4. Manual/support decision for Newgrounds: current project `7759223` attaches the fresh ZIP as `9B`, so it stays out of active campaign links.
5. Account/browser login for MyIndie and IndieHub if we continue quick RU listings.
6. Keep CWS Games skipped unless the strategy changes and adult-adjacent discovery becomes acceptable.

## 2026-05-23 Участок 4: account-gated / quick listing queue

Public requirements/current URL check, no login and no submissions:

| Target | Current public URL | Public facts checked 2026-05-23 | Safest status |
| --- | --- | --- | --- |
| Game Jolt | https://gamejolt.com/games/gigahrush/1072064 | Add game from Store under user account; page needs description, tags, header/thumbnail, maturity rating, packages/releases/builds. Browser builds are supported; releases start hidden until explicitly published. | Public page is live after playable preview. Package `1093814`, release `1474909`, version `0.1.0`; HTML build from `itch/gigahrush-itch.zip`; one screenshot, thumbnail and header are saved. |
| iDev.Games | https://idev.games/publish-game and https://idev.games/upload-your-game | Free HTML5/browser publishing; account required; games are added instantly and moderated later; site says JavaScript is required and uses Cloudflare. Public register page asks whether the account is developer or gamer. | Good quick HTML5 candidate, but publication appears immediate. Treat final upload as owner-confirmed publish, not draft-only. |
| MyIndie | https://myindie.ru/games and https://myindie.ru/games/create | Catalog supports Web (HTML5), Horror, Shooter, Survival, RPG and `Another` engine; `Добавить игру` redirects unauthenticated users to login. Contact email in footer: `team@myindie.ru`. | Best RU quick listing candidate. Draft after owner login if dashboard allows preview; final publish only after owner confirms. |
| IndieHub | https://indiehub.ru/ and https://indiehub.ru/game/add | Public home exposes login/registration, service rules, support Telegram and `добавить игру`; current public `/game/add` returns “page does not exist” and asks to contact administration in Telegram. Rules require rights to publish and ban spam/malware/illegal/misleading content. | Blocked as quick listing until owner asks support or account reveals a working add flow. Draft-only if logged-in dashboard has a hidden state; otherwise do not final-click. |
| Kongregate | https://blog.kongregate.com/hc/en-us/articles/44395849259661-SUBMISSION-How-do-I-submit-a-game-to-Kongregate-It-s-Easy | Accepts HTML5/WebGL and iframe, but requires Kongregate account, developer application approval, legal upload agreement, no third-party ads/account systems/non-Kongregate microtransactions, browser playability, screenshots, description, instructions, age rating, AI declaration and English language option. Publish is available only after approval. | Not quick. Owner must create/login and apply as developer first; agent can only prepare Alpha materials after approval. |

Safest next order:

1. Game Jolt: live/public/playable; monitor it and later add more media/devlog if a trusted composer path is available.
2. MyIndie: create account/login and prepare RU listing; final publish after owner confirms exact public state.
3. iDev.Games: only after owner explicitly accepts instant-public + later moderation behavior.
4. IndieHub: contact support or test logged-in dashboard; skip final submission if `/game/add` remains broken.
5. Kongregate: start developer application only if owner accepts approval/legal/payment queue; not part of quick listing execution.

## 2026-05-23 Участок 4: quick RU/listing public recheck

No login and no submissions. Checked current public URLs/requirements for the requested targets:

| Target | Public URLs checked | Result | Today action |
| --- | --- | --- | --- |
| MyIndie | `https://myindie.ru/games`, `https://myindie.ru/games/create`, `https://myindie.ru/login` | Catalog is live and has `Добавить игру`; create redirects to login. Public filters fit GIGAH\|RUSH: `Web (HTML5)`, `Horror`, `Shooter`, `RPG`, `Survival`, engine `Another`. Footer lists `team@myindie.ru`. | Owner logs in/registers; agent prepares RU listing. Stop before final submit unless logged-in UI clearly offers draft/preview. |
| IndieHub | `https://indiehub.ru/`, `https://indiehub.ru/game/add` | Homepage shows login/registration, `добавить игру`, rules and Telegram support. Public add page errors: `Эта страница не существует. Обратитесь к администрации портала...`. | Contact support Telegram or test after login. Not a ready quick listing today without account/support. |
| iDev.Games | `https://idev.games/upload-your-game`, `https://idev.games/publish-game` | Public docs say HTML5/WebGL/browser publishing is free, account required, upload/start is instant, verification/moderation happens later, and JS is required. | Only proceed after owner explicitly confirms instant-public upload is acceptable. Login/register and upload/fill listing in browser. |
| Gamemoor | `https://gamemoor.com/contact`, `https://gamemoor.com/developer`, `/submit`, `/dashboard`, `/my-games`, `/games/add` | Contact page says developer portal is open and review usually takes a few days. Public `/developer` redirects to login; `/submit`, `/dashboard`, `/my-games` are 404; `/games/add` redirects to 404. | Try `/developer` after owner login; if blocked, send support request for developer portal access / submit URL for account `jirnyak`. |

Instant-public classification:

- Instant-public / publish-sensitive: iDev.Games.
- Likely review/draft after login, but unconfirmed: MyIndie.
- Review queue after portal access: Gamemoor.
- Blocked public add path: IndieHub.

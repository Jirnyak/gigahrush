# Next PR Wave Targets - 2026-05-23

Purpose: continue the campaign without spam. Use this as the working queue for surfaces that were not completed in the first portal wave.

Primary links:

- itch.io: https://tenevik.itch.io/gigahrush
- Official site: https://jirny.uk
- Direct browser build: https://gigahrush.bileter.workers.dev
- Telegram: https://t.me/gigah_rush
- IndieDB: https://www.indiedb.com/games/gigahrush
- iDev.Games: https://idev.games/game/gigah-rush
- MyIndie: https://myindie.ru/games/game/gigahrush

Sender/contact confirmed by owner on 2026-05-23:

- Sender name/nick: `jirnyak`
- Contact email: `jirnyak@gmail.com`
- Telegram may be used in pitch copy: yes, `https://t.me/gigah_rush`
- Use itch.io and already published resource pages as primary links.

Current release artifact:

- `itch/gigahrush-itch.zip`: 4 999 557 bytes, SHA-256 `fa63dd2be47292814989234482f40597b23fa58df2ec3ab823992953f6c66321`.
- local upload/media archive manifest: `Docs/PRCampaign/release_artifacts_2026-05-23.md`; generated archives are under `tmp/prcampaign_2026-05-23/`.
- current owner-updated best media folder: `tmp/prcampaign_screenshot_hunt_2026-05-23/selected_best/`.
- square 3x3 contact sheet for social/portal preview: `tmp/prcampaign_screenshot_hunt_2026-05-23/selected_best/contact_sheet_3x3.png`; `contact_sheet_png.png` is the same image under the older filename.
- PR agents should take GIFs/screenshots from `selected_best/` first: two GIF motion hooks plus the nine PNGs used in the 3x3 sheet.

## Completed Same-Day Fixes

- DTF post `https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror` was edited on 2026-05-23 20:44 UTC / 21:44 BST after comments asked for screenshots and clickable links. The post now has a 5-item gallery (blinking-eyes GIF plus 4 screenshots), and itch.io/Telegram/direct-build URLs are clickable through DTF redirect links. Owner marked DTF as a successful campaign channel. Public API recheck at 21:44 UTC / 22:44 BST: 1999 views, 472 hits, 12 comments, 10 favorites, 6 reactions, `total=2499`; public page shows roughly `2.4K` views. Next action: monitor comments only; do not duplicate the post or add a link-only bump.
- Fandom EN `GIGAH RUSH` was corrected at 21:19 UTC, rev `420`: the inactive Newgrounds link was replaced with the live Game Jolt page.
- iDev.Games is now confirmed public at `https://idev.games/game/gigah-rush`; the edit page says the game has been released and is visible to everyone.
- MyIndie is now public/playable at `https://myindie.ru/games/game/gigahrush`; uploaded cover, 3 screenshots and `itch/gigahrush-itch.zip` (`4 999 557` bytes), with Web iframe verified.
- Kongregate Developer Application is submitted; wait for approval before Alpha/upload.
- 2ch /b/ thread is now live: https://2ch.org/b/res/333348764.html. Public recheck 2026-05-23 23:26 UTC / 2026-05-24 00:26 BST found 14 posts, 11 files and 6 posters; OP uses developer disclosure, direct Cloudflare build first, itch second, and the prepared media pack (`01_hero_gif_hell_blinking_eyes.gif`, `contact_sheet_3x3.png`, `02_gif_underhell_maronary_samosbor_loop.gif`). No duplicate thread, no bumping and no extra mirrors unless asked.

## 2026-05-23 PR 11 Public Upload Update

Public upload/application pass at 21:23-21:45 UTC / 22:23-22:45 BST. Full pass log: `Docs/PRCampaign/PR_11.md`.

- MyIndie moved from quick RU candidate to live public surface: `https://myindie.ru/games/game/gigahrush`.
- iDev.Games stayed public/playable and now has first visible public metric snapshot: `4 plays`, `10.26 MB`, `This game has not been verified yet`.
- Kongregate moved from account/start blocker to application-submitted/approval-wait.
- Newgrounds remains blocked and should not be used in active links.

## 2026-05-23 PR 10 Monitoring Update

Public/browser recheck at 20:59-21:26 UTC / 21:59-22:26 BST. No duplicate submissions, no replies, no votes and no blind final-click actions. Full pass log: `Docs/PRCampaign/PR_10.md`.

- P0 itch.io is still blocked: the game page remains `noindex` and absent from exact itch search; the page now shows `Updated: 23 May 2026 @ 20:04 UTC`.
- The itch devlog direct permalink is a stronger blocker than before: public body says the page is flagged for moderator review and requires login. Use game page or devlog index only.
- Public itch iframe `index.html` differs from the local `dist/index.html` / ZIP root (`10 673 105` bytes and SHA-256 `6bc3eff...` on itch versus `10 673 018` bytes and SHA-256 `732ced4...` locally). Verify the intended itch upload before making parity claims or syncing other portals from itch.
- Direct Cloudflare build remains current and indexable: `10 673 018` bytes, SHA-256 `732ced4bc2d7bcf91edaec7382ca67d5f4707d1e75ed3c5a29f0ed5df3424d18`.
- Release Announcements is live with 38 views and one post; DTF is live and successful with 1999 views, 472 hits, 12 comments, 10 favorites, 6 reactions and `total=2499`; DiscoverGG is live/indexable with one vote and the itch play link retained.
- DTF counters after the media/link fix: `1999` views, `472` hits, `12` comments, `10` favorites, `6` reactions, `total=2499` at 21:44 UTC / 22:44 BST.
- Reddit r/playmygame remains live, non-NSFW and not removed, with only AutoModerator visible. Keep r/WebGames delayed and distinct.
- DiscoverGG and iDev.Games are live/indexable enough for active links; GamHub, Fake Portal and FreeZonePlay are still not public; Querygame remains 404/not submitted.
- IndieDB browser/account check confirms the game page and screenshot page open with expected titles, but shell still sees Cloudflare `403`. Newgrounds still requires manual/support work: Chrome is at login, Opera GX has the editable project tab, and the durable blocker remains RIP plus `9B` upload.

## P0: itch.io Listing Incident

Public recheck 2026-05-23 21:03 UTC: `https://tenevik.itch.io/gigahrush` is live, profile-visible and playable by direct URL, but still has public `noindex`; itch search for `gigahrush`, `GIGAH|RUSH` and `ГИГАХРУЩ` does not show the Tenevik page. The devlog index is live, but `/devlog/1530909/-` returns public `404` with a moderator-review login gate.

Action source: `Docs/PRCampaign/itch_listing_incident_2026-05-23.md`.

Dashboard/source check through Opera GX is complete: project is published/active, not restricted, not unlisted, current HTML ZIP is ready/embedded, cover/screenshots exist, Release info and Classification are saved, Engines/tools is intentionally blank because itch has no honest custom TypeScript/Vite/WebGL/canvas option, and compact External links are saved. Support email was sent to `support@itch.io` from `jirnyak@gmail.com` at 2026-05-23 20:22 UTC. Devlog editor also confirms the launch post is published, but no slug/permalink field is exposed; the broken `/-` URL appears to be generated from the Cyrillic title and is now moderation/login gated. Next step: wait for support/indexing and recheck `noindex`, exact itch search, devlog access and public iframe hash after a delay or reply. Do not recreate the page, do not make a duplicate release announcement, do not use spammy collection/rating asks, and do not change the public devlog title just to force a Latin slug unless owner/support approves.

## P0: DTF-Like Community Direction

The owner marked DTF as successful on 2026-05-23. The repeatable pattern is not "post the same ad everywhere"; it is a native UGC/devlog post with 1 GIF, 3-5 screenshots, a clear playable loop, direct itch/direct/Telegram links, explicit developer affiliation and 3-4 concrete feedback questions. Use `Docs/PRCampaign/ru_social_media_candidates_2026-05-23.md` as the RU social/editorial scratchpad from the 6-agent sweep.

| Priority | Surface | URL | Format | Guardrail / next step |
| --- | --- | --- | --- | --- |
| A | DevTribe | https://devtribe.ru/ | RU devlog/project diary | Register/login, create one project/devlog post with fresh copy and media; do not paste DTF verbatim. |
| A | Pikabu gamedev community | https://pikabu.ru/community/gamedev | RU longpost/devlog | Use developer disclosure, GIF/screenshots and a concrete feedback ask; avoid a naked external-link dump. |
| A | Indie Spotlight | https://t.me/indiespotlight | RU editorial/channel pitch | Ask whether editorial/free submission is appropriate; send GIF, 3-4 screenshots and playable links. |
| A | MyIndie | https://myindie.ru/games/game/gigahrush | RU playable listing, now public | Monitor the new listing and comments; later update media/description only for a real new build. |
| A | Game Jolt devlog | https://gamejolt.com/games/gigahrush/1072064 | EN game-page devlog | Add more gallery media first, then post through trusted UI only; no duplicate release spam. |
| A | IndieDB article | https://www.indiedb.com/games/gigahrush | EN media-rich article/news | Prepare "browser survival horror build after DTF feedback" with screenshots and concrete update angle. |
| A | r/WebGames | https://www.reddit.com/r/WebGames/ | EN direct browser-game post | Wait 24-48h after r/playmygame; use direct Cloudflare link and distinct title/body. |
| B | TIGSource DevLogs | https://forums.tigsource.com/ | Long-running EN devlog thread | Use process/design detail and commit to updates; not a one-off ad. |
| B | HTML5 GameDevs Showcase | https://www.html5gamedevs.com/forum/8-game-showcase/ | EN browser tech/showcase post | Ask for HTML5/WebGL/performance feedback; emphasize zero-runtime TypeScript/WebGL/canvas. |
| B | Habr / vc.ru | https://habr.com/ru/hubs/gamedev/articles/ / https://vc.ru/ | Technical or case-study article | Only as useful engineering/business material with links secondary; promotional reposts are high risk. |
| C | StopGame / PlayGround / Kanobu | https://stopgame.ru/ / https://www.playground.ru/ / https://kanobu.ru/ | Editorial or cautious community material | Do not use as direct advertising devlog without a new angle; check rules/account UI first. |

## P0: 2ch /b/ Live Thread

Thread: https://2ch.org/b/res/333348764.html

Draft/source file: `Docs/PRCampaign/dvach_b_post_2026-05-23.md`.

Board: https://2ch.org/b/

Status: live, monitor only. Public recheck 2026-05-23 23:26 UTC returned `200 OK`, thread `333348764`, 14 posts, 11 files, 6 posters and `is_closed: 0`.

Early feedback themes:

- First-run usability and controls: one player says it is conceptually interesting but uncomfortable to play; ask for specifics, do not argue.
- Tech/engine curiosity: answer with concise TypeScript/Vite/WebGL/canvas raycaster details.
- Goal confusion: clarify current goals as Olga Dmitrievna questline, looting/expeditions, XP and lower/higher route risk; avoid promising multiplayer/PvP as current gameplay.
- AI-content suspicion: disclose that code/algorithms/content are hand-authored, while EN localization and some NPC text used AI assistance.
- Bestiary/social monsters: useful content feedback for future monster/ecology direction.

Recommended link order for this surface:

1. Direct Cloudflare build: https://gigahrush.bileter.workers.dev
2. itch.io mirror: https://tenevik.itch.io/gigahrush
3. Game Jolt / MyIndie / Telegram only as replies when someone asks for mirrors or updates.

Recommended attachment:

- Primary: `tmp/prcampaign_screenshot_hunt_2026-05-23/selected_best/01_hero_gif_hell_blinking_eyes.gif`
- Fallback: `tmp/prcampaign_screenshot_hunt_2026-05-23/selected_best/contact_sheet_3x3.png`

Guardrails:

- One live thread only; no agent automation, no repeat threads, no empty bumps, no link-only mirror replies.
- Disclose developer status in the OP.
- Ask for concrete first-run feedback: where the player closed the tab and why.
- Do not use Newgrounds, itch devlog permalink, Querygame, GamHub, Fake Portal, FreeZonePlay, Gamemoor or Free Indie Games links here.
- Official 2ch rules prohibit autoposting, spam, wipes and malicious links; advertising is a moderation-sensitive area. /b/ has no normal thematic rules, but moderators also have broad discretion.

## P0: Email / Contact Targets

These are not blocked by passwords, but they need a working outbound mail channel. Do not use a fake email.

| Target | URL / Contact | Fit | Action |
| --- | --- | --- | --- |
| Armor Games | `mygame@armorgames.com`; docs: https://developers.armorgames.com/docs/introduction/overview/ | Strong browser-game fit. They currently accept HTML5 games and can also consider iframe hosting for special cases. | Sent 2026-05-23 21:33 BST; wait for reply/coverage, no quick follow-up. |
| TapCraftBox | `support@tapcraftbox.com`; docs: https://tapcraftbox.com/page/submit-game | HTML5 browser portal. Requirements: HTML5, no disruptive ads/malicious links, rights to distribute. | Sent 2026-05-23 21:34 BST; wait for reply/review request, no quick follow-up. |
| Gamemoor | https://gamemoor.com/contact | Already has logged-in account, but developer portal redirects to homepage. | Support request sent to `contact@gamemoor.com` 2026-05-23 21:35 BST; public contact page exposes a form, not an email, so watch for bounce/response and use the form if needed. |
| Alpha Beta Gamer | `Admin@alphabetagamer.com`; page: https://www.alphabetagamer.com/contact-us/ | Good fit for free in-development playable builds and horror. | Sent 2026-05-23; wait for reply/coverage, no quick follow-up. |
| Free Game Planet | `admin@freegameplanet.com`; page: https://www.freegameplanet.com/contact/ | Good fit for free browser games and horror. | Sent 2026-05-23 with direct build first; wait for reply/coverage, no quick follow-up. |
| Indie Games Plus | `editors@indiegamesplus.com`; page: https://indiegamesplus.com/contact/ | Good weird-indie fit. | Tailored pitch sent 2026-05-23 21:35 BST. Sent Mail also shows an earlier generic editor pitch around 18:00; no quick follow-up. |
| Games Pending | `gamespending@gmail.com`; itch page: https://gamespending.itch.io/ | Good gameplay-video fit. | Sent 2026-05-23 with suggested 10-15 minute route and content note; wait for reply/video. |
| VK Play Media | `mediavkplay@vkteam.ru`; page: https://support.vkplay.ru/vkp_media/faq/3767 | RU editorial/news fit for a working browser prototype. | Sent 2026-05-24 00:28 BST; wait for reply/coverage, no quick duplicate. |
| HorrorFam Indie Horror Inbox | `lauren@horrorfam.com`; page: https://horrorfam.com/contact/ | Horror-roundup fit, broader than games but relevant. | Sent 2026-05-24 00:29 BST; wait at least 7 business days before follow-up. |
| Indie Game Buzz | `games@indiegamebuzz.com`; page: https://indiegamebuzz.com/contact/ | Cool/unique indie review/developer-preview fit. | Sent 2026-05-24 00:30 BST with subject `Game Submission: GIGAH\|RUSH`; no paid promo without owner approval. |
| Into Indie Games | `info@intoindiegames.com`; page: https://intoindiegames.com/contact/ | Feature/review/news fit for unusual indie game. | Sent 2026-05-24 00:31 BST; wait for reply/coverage, no quick follow-up. |
| PLRun | previously `dev@plrun.com`; old page https://plrun.com/plrun-for-developers/ now returns `410`; possible portal page https://plrun.com/developers/ | Low/conditional. Browser-game portal fit is weaker because it likely prefers mobile/touch and family-friendly games. | Do not send as normal P0 media pitch; only revisit if the current developer/contact path is confirmed and the content note is accepted. |
| TapCraftBox / Free Play Games class targets | Existing pitch pack | Browser-game directory fit varies. | Use the HTML5/WebGL no-install paragraph from `needed_access_ru.md`. |

2026-05-23 execution note:

- Chrome JavaScript-from-Apple-Events worked for Gmail batch 1 and the completed Game Jolt publish. It can intermittently return error 12 during long automation; activate Chrome/check `View > Developer > Allow JavaScript from Apple Events`, then retry. Do not use blind coordinate clicks.
- First targeted email batch sent on 2026-05-23; Gmail showed `Message sent` for Alpha Beta Gamer, Free Game Planet and Games Pending.
- Second batch sent on 2026-05-23: Armor Games, TapCraftBox and Indie Games Plus. Gamemoor support request was also sent. Pause email outreach and monitor replies/bounces.
- Third targeted email batch sent on 2026-05-24 00:28-00:31 BST: VK Play Media, HorrorFam, Indie Game Buzz and Into Indie Games. Pause broad email outreach and monitor replies/bounces.
- Before sending, add 2-3 direct media links if available. If no public press-kit URL exists yet, use itch/direct/IndieDB links and offer ZIP/screens/GIFs on request.
- Current media source for all drafts in this file: `tmp/prcampaign_screenshot_hunt_2026-05-23/selected_best/`. Use the 3x3 sheet when a platform wants one compact square preview; use the individual GIF/PNG files from the same folder for galleries and pitches.

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

## Completed / Monitoring

| Target | URL | State | Next Step |
| --- | --- | --- | --- |
| Game Jolt | https://gamejolt.com/games/gigahrush/1072064 | Public page is live and synced; package `1093814`, release `1474942`, version `0.2.0`; active build `1960153` serves `gigahrush-itch.zip` at `4 999 557` bytes; direct playable check reached `ГИГАХРУЩ - САМОСБОР` with visible canvases. | Monitor plays/comments/followers; later add more screenshots/GIFs/devlog through a trusted composer path and real update angle. |
| MyIndie | https://myindie.ru/games/game/gigahrush | Public Web (HTML5) page is live; uploaded cover, 3 screenshots and current `itch/gigahrush-itch.zip` (`4 999 557` bytes); Web iframe opens uploaded ZIP build. | Monitor page/Web iframe/comments/counters; do not duplicate-submit. |

## P1: Account / Browser Session Required

| Target | URL | Fit | Blocker | Next Step |
| --- | --- | --- | --- | --- |
| Kongregate | https://www.kongregate.com/en/developer/apply | Strong browser portal fit. They accept HTML5/WebGL and iframe options, but require developer approval first. | Developer Application submitted; not instant and not public. | Wait for Kongregate approval, then agent fills Alpha submission after approval. |
| iDev.Games | https://idev.games/game/gigah-rush | Completed public listing. Public page returns `200 OK`, title `Gigah Rush - Free Online Browser Game`, no `noindex`; edit page says `Public: This game has been released and is visible to everyone!`. | Site moderation may still occur; icon/promo media can be improved later. | Monitor public page, comments/plays and moderation; no owner login is needed for basic publication. |
| MyIndie | https://myindie.ru/games/game/gigahrush | Completed public RU listing. | Newly public surface may still be moderated. | Monitor page/Web iframe/comments; no duplicate listing. |
| IndieHub | https://indiehub.ru/ | Quick RU listing candidate; public page exposes add-game/account paths and Telegram support. | Need account/registration; detailed public requirements are sparse. | Owner logs in; agent prepares draft and waits for explicit publish confirmation. |
| CrazyGames | https://developer.crazygames.com/ | Large browser portal, but more QA/portal-specific. | JS app, likely account and portal QA; Full Launch/monetization should be separate SDK task. | Treat as later technical portal task, not quick PR. |
| GX.games | https://gamemaker.io/en/tutorials/publish-to-gxgames-tutorial | Opera/GX audience fit, but publish flow is GameMaker/GX Dev oriented. | Current project is TypeScript/Vite, not GameMaker. | Skip unless a GameMaker/GX-specific wrapper/port is planned. |
| Querygame | https://querygame.com/submit/ | General directory candidate. | Public form JS calls `/api/submit-game`, but direct POST returned `405` on 2026-05-23; likely broken server endpoint. | Recheck later or use their required confirmation email only if form starts accepting submissions. |

Kongregate submission notes:

- Developer Application is now submitted.
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
2. itch.io: dashboard/support action is complete for settings, support email and devlog status check. Remaining action is waiting for support/indexing and rechecking `noindex`/search; title/slug changes require owner/support approval.
3. Game Jolt: public publishing and package sync are complete; next owner/agent work is monitoring, extra media/devlog through trusted UI and real comment replies.
4. Kongregate application is submitted; wait for approval before Alpha/upload. CrazyGames still needs account/browser login only if we continue that separate portal-build task. iDev.Games and MyIndie are already public and only need future login for media/polish.
5. Manual/support decision for Newgrounds: current project `7759223` attaches the fresh ZIP as `9B`, so it stays out of active campaign links.
6. IndieHub still needs account/support if we continue quick RU listings; MyIndie is complete/public.
7. Keep CWS Games skipped unless the strategy changes and adult-adjacent discovery becomes acceptable.

## 2026-05-23 Участок 4: account-gated / quick listing queue

Public requirements/current URL check, no login and no submissions:

| Target | Current public URL | Public facts checked 2026-05-23 | Safest status |
| --- | --- | --- | --- |
| Game Jolt | https://gamejolt.com/games/gigahrush/1072064 | Add game from Store under user account; page needs description, tags, header/thumbnail, maturity rating, packages/releases/builds. Browser builds are supported; releases start hidden until explicitly published. | Public page is live after playable preview. Package `1093814`, release `1474942`, version `0.2.0`, build `1960153`; one screenshot, thumbnail and header are saved; public API reports the current `4 999 557` byte ZIP. |
| iDev.Games | https://idev.games/game/gigah-rush | Public listing exists; edit page says the game has been released and is visible to everyone. Embed `/appvert/game/4008/game66400/` returns the game HTML title `ГИГАХРУЩ - САМОСБОР` with canvas content. | Completed; monitor moderation and polish media later if needed. |
| MyIndie | https://myindie.ru/games/game/gigahrush | Public Web (HTML5) listing is live after PR 11. Uploaded cover, 3 screenshots and current `itch/gigahrush-itch.zip`; Web iframe opens the uploaded build. | Completed; monitor moderation, iframe, comments and counters. |
| IndieHub | https://indiehub.ru/ and https://indiehub.ru/game/add | Public home exposes login/registration, service rules, support Telegram and `добавить игру`; current public `/game/add` returns “page does not exist” and asks to contact administration in Telegram. Rules require rights to publish and ban spam/malware/illegal/misleading content. | Blocked as quick listing until owner asks support or account reveals a working add flow. Draft-only if logged-in dashboard has a hidden state; otherwise do not final-click. |
| Kongregate | https://www.kongregate.com/en/developer/apply | Accepts HTML5/WebGL and iframe, but requires developer application approval, legal upload agreement, no third-party ads/account systems/non-Kongregate microtransactions, browser playability, screenshots, description, instructions, age rating, AI declaration and English language option. Publish is available only after approval. | Application submitted; wait for approval before Alpha materials. |

Safest next order:

1. MyIndie: already public; monitor, do not resubmit.
2. iDev.Games: already public; monitor, do not resubmit.
3. Game Jolt: monitor live surface; add more media/devlog later only through trusted UI path.
4. IndieHub: contact support or test logged-in dashboard; skip final submission if `/game/add` remains broken.
5. Kongregate: application submitted; wait for approval before Alpha/upload.

## 2026-05-23 Участок 4: quick RU/listing public recheck

No login and no submissions. Checked current public URLs/requirements for the requested targets:

| Target | Public URLs checked | Result | Today action |
| --- | --- | --- | --- |
| MyIndie | `https://myindie.ru/games/game/gigahrush` | Superseded by PR 11: public Web (HTML5) listing is live with current ZIP, cover and screenshots. | Monitor page/Web iframe/comments; no final-click action remains. |
| IndieHub | `https://indiehub.ru/`, `https://indiehub.ru/game/add` | Homepage shows login/registration, `добавить игру`, rules and Telegram support. Public add page errors: `Эта страница не существует. Обратитесь к администрации портала...`. | Contact support Telegram or test after login. Not a ready quick listing today without account/support. |
| iDev.Games | `https://idev.games/game/gigah-rush` | Public listing is live; browser/edit check confirms `Public` and visible to everyone. | Monitor page/moderation; no final-click action remains. |
| Gamemoor | `https://gamemoor.com/contact`, `https://gamemoor.com/developer`, `/submit`, `/dashboard`, `/my-games`, `/games/add` | Contact page says developer portal is open and review usually takes a few days. Public `/developer` redirects to login; `/submit`, `/dashboard`, `/my-games` are 404; `/games/add` redirects to 404. | Try `/developer` after owner login; if blocked, send support request for developer portal access / submit URL for account `jirnyak`. |

Instant-public classification:

- Already public: iDev.Games, MyIndie.
- Review queue after portal access: Gamemoor.
- Blocked public add path: IndieHub.

## 2026-05-23 Expanded Account-Gated Portal Recheck

Public recheck at 20:31 UTC / 21:31 BST. No login, no submission, no final-click actions. This is the current queue for the requested six portals.

| Target | Public requirements / blocker | Classification | Exact owner action |
| --- | --- | --- | --- |
| MyIndie | Completed/public after PR 11: `https://myindie.ru/games/game/gigahrush`. Listing uses Web (HTML5), engine `Another`, RU/EN, genres Shooter/RPG/Action/Survival/Horror and current ZIP. | Public surface; monitor moderation, iframe, comments and link retention. | Future owner login only for corrections/media polish/replies. |
| iDev.Games | Public listing is live at `https://idev.games/game/gigah-rush`; edit page says released and visible to everyone. | Completed public surface. | Monitor moderation/plays/comments; polish icon/promo media later only through trusted UI. |
| IndieHub | Homepage exposes login/registration, `добавить игру`, service rules and Telegram support. Public `/game/add` returns an error saying the page does not exist and to contact portal administration in Telegram. Rules require publisher rights and ban spam, malware, illegal, misleading and infringing content. | Support-blocked; not a ready quick listing. | Owner logs in to check for a hidden add flow or contacts IndieHub support Telegram for the current add-game URL. No final-click until a working form and public/draft state are known. |
| Kongregate | Developer Application submitted after PR 11. Still requires approval, legal Game License/Upload Agreement, no third-party ads/account systems/non-Kongregate microtransactions, browser playability, screenshots, description, instructions, voluntary age rating, AI declaration and English option. Publish happens only after approval/review. | Application submitted; not quick, not instant-public. | Wait for approval; agent prepares Alpha submission only after approval and owner-provided/legal confirmations. |
| CrazyGames | JS Developer Portal. Basic Launch is possible after Basic Implementation/QA without CrazyGames-specific integration and has monetization disabled; Full Launch requires Full Implementation including CrazyGames SDK. Public requirements include initial download `<=50MB`, total file size `<=250MB`, file count `<=1500`, relative paths, Chrome/Edge compatibility, readable UI in listed 16:9/mobile iframe sizes, English localization, PEGI 12, no custom in-game fullscreen button and no cross-promotion to external playable versions. | SDK/portal-build track, not quick PR. Basic may be tried after a portal-specific build; Full is SDK-required. | Owner logs into developer portal only after accepting a separate portal-build task. Agent should first make/verify a CrazyGames build: English default/path, remove external playable CTAs and fullscreen button, iframe/performance check, then use portal preview/QA. Full Launch needs SDK event/data/user integration. |
| Gamemoor | Contact page says developer portal is open and submissions enter review within a few days. Public `/developer` redirects to login; `/submit`, `/dashboard`, `/my-games` are 404; `/games/add` redirects to 404. Terms say game submissions are reviewed for PEGI 3-16 and no NSFW. | Review queue after portal access; currently access/support-blocked. | Owner logs in and opens `/developer`; if still blocked, send support request for developer access / submit URL for account `jirnyak`. Confirm non-NSFW survival-horror/PEGI 16 framing before submit. |

Proceed order after PR 11: MyIndie and iDev.Games are public/monitoring-only; Gamemoor support/access remains; Kongregate waits for approval; CrazyGames only as a separate portal-build task; IndieHub only after support reveals a working path.

## 2026-05-23 EN DTF-like Community Research

Scope: English-language user-generated indie/devlog/community-post surfaces similar to DTF mechanics. No submissions, no final publish clicks.

| Target | URL | Priority | Fit | Safe next step |
| --- | --- | --- | --- | --- |
| itch.io Devlogs | https://itch.io/board/10021/devlogs | A | Dedicated long-running project devlog threads; screenshots required for visual projects; relationship-building framing required. | Do not use as a completed-product ad. Start only if committing to a continuing English progress thread with screenshots/GIFs and replies. |
| itch.io Release Announcements | https://itch.io/community | B | Designated itch area for creators to announce/promote own projects; already used once for GIGAH\|RUSH. | No duplicate today; use only for a real new release/update angle. |
| Game Jolt Devlog / Communities | https://gamejolt.com/help-docs/creators/add-game and https://gamejolt.com/help-docs/start/communities | A | Native game-page devlogs plus topical communities; good fit because GIGAH\|RUSH page is already live. | Add more media first; post a devlog/update through trusted UI only, then share to relevant communities after reading each community rules. |
| IndieDB Articles | https://www.indiedb.com/articles | A | Public article feed is full of update/devlog/playtest posts; GIGAH\|RUSH page already exists. | Prepare a media-rich English article tied to a concrete playable update, not a repost of the listing text. |
| TIGSource DevLogs | https://forums.tigsource.com/ | B | Long-form indie devlog forum culture; best for technical/design process and repeated updates. | Register/login, create one thread with a strong first post and plan to maintain it; avoid link dump. |
| r/WebGames | https://www.reddit.com/r/WebGames/ | A | Browser-game audience; current public summaries indicate direct playable browser links and game-name-first titles fit. | Wait at least 24-48h after r/playmygame; use direct Cloudflare link and distinct copy. |
| r/Games Indie Sunday | https://www.reddit.com/r/Games/comments/p9adzi | A | Large English gaming audience; official weekly developer showcase allows self-posts during Indie Sunday. | Earliest Sunday window; include video footage, self-post format, developer disclosure and cooldown compliance. |
| r/IndieDev | https://www.reddit.com/r/IndieDev/ | B | Developer/community discussion audience; allows loose sharing but has account-age/comment-karma filters and high anti-spam sensitivity. | Use a process/dev angle with gameplay media and real discussion question; avoid storefront/direct link as the whole post. |
| r/indiegames | https://www.reddit.com/r/indiegames/ | B | Player-facing indie subreddit; recent rule discussions reject fake feedback-bait and low-effort promo. | Use native GIF/video and honest launch/update framing; no same-day cross-post blast. |
| Hacker News Show HN | https://news.ycombinator.com/showhn.html | C | Not a game community, but browser-native one-file procedural WebGL/canvas build can fit technical curiosity. | Only after writing a concise technical angle and being ready to answer; title must start `Show HN:` and no upvote asks. |
| Game Developer Blogs | https://www.gamedeveloper.com/blogging-guidelines | C | User-submitted developer articles can be featured, but must teach peers and not be an ad. | Pitch/write a technical postmortem: procedural browser survival horror, one-file build, A-Life, rendering constraints. |
| Product Hunt | https://www.producthunt.com/launch | C | Maker/product launch community with comments/upvotes; not devlog-native and weak game fit unless framed as a playable browser product. | Use only for a polished launch milestone with gallery/video; no vote solicitation and no duplicate relaunch under six months without major update. |

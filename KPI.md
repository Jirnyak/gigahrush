# GIGAH|RUSH KPI Agent

Role: track public media presence for GIGAH|RUSH across published pages, community posts, portals, wikis, search/indexing surfaces and campaign backlog. This file is an operating brief for a future agent. It does not grant permission to spam, manipulate votes, hide developer affiliation or bypass platform moderation.

Current date baseline: 2026-05-23.

## Operating Rules

- Report facts first: availability, indexing, visible links, comments, moderation state, traffic signals and concrete next actions.
- Do not post, repost, bump, vote, rate, ask for votes, mass-comment or contact media unless the owner explicitly asks for that action.
- Do not ask for passwords in chat. If access is needed, ask the owner to log in through Opera GX or Chrome and say `готово`; request only one-time codes if a site asks for them.
- Keep developer affiliation clear in every recommendation.
- Treat horror as survival horror, not NSFW, unless a platform questionnaire itself requires a stricter content label.
- When a platform blocks automation with Cloudflare, captcha, account validation or moderation review, record the blocker exactly and switch to manual-owner instructions.
- If Chrome browser automation is needed, require `View > Developer > Allow JavaScript from Apple Events`; do not use blind coordinate clicks for final Send/Publish/File Upload actions.

## Core Links

| Surface | URL | Status | What To Watch |
| --- | --- | --- | --- |
| itch.io game page | https://tenevik.itch.io/gigahrush | Live, fresh release uploaded by owner. Public HTML still showed `noindex` on 2026-05-23 after update `23 May 2026 @ 06:05 UTC`. | Page availability, `noindex`, screenshots/GIFs, tags, comments, downloads/plays if dashboard access exists. |
| Direct Cloudflare build | https://gigahrush.bileter.workers.dev | Live, 200 OK, no public `noindex` detected on 2026-05-23; public HTML size `10 652 640` bytes matched local `dist/index.html`. | Availability, title, boot health, console/runtime errors, whether final release matches itch build. |
| Telegram | https://t.me/gigah_rush | Public campaign/contact link. | Subscriber count, posts, comments/reactions if visible, whether this remains valid contact. |
| Newgrounds | https://www.newgrounds.com/portal/view/1033564 | Removed / RIP. On 2026-05-23 the view URL redirects to `https://www.newgrounds.com/portal/rip/1033564`; page title is `Eulogy for: GIGAH RUSH` and dates show `May 22, 2026 - May 22, 2026`. Existing project `7759223` is editable, but both the normal browser upload flow and direct `/parkfile` attach save the HTML5 ZIP as `9B`; the bad attachment was deleted and no playable ZIP is attached. | Manual/support blocker: do not publish until Newgrounds accepts a real `4.76MB` archive in preview. |
| DTF | https://dtf.ru/indie/5077801-gigahrush-brauzernyj-survival-horror | Published RU devlog post. Public recheck on 2026-05-23 18:12 UTC: `200 OK`, 1967 views, 419 hits, 6 comments, 10 favorites, 5 reactions; no public removal/editor warning detected in HTML. | Short release-update comment is appropriate; do not create a duplicate post. Watch comment tone and avoid link-only bumping. |
| GameDev.ru | https://gamedev.ru/projects/forum/?id=295485 | Published forum topic. Public recheck on 2026-05-23 18:12 UTC: `200 OK`; one concrete report says the direct online build showed a dark-blue stuck-looking screen and asks for a progress bar; owner replied about Cloudflare/VPN. | Reply/update is only conditional: acknowledge the loading/progress issue and prefer itch.io as the primary playable link; do not bump with a generic release ad. |
| itch.io Release Announcements | https://itch.io/t/6385827/gigahrush-free-browser-survival-horror-in-an-endless-concrete-apartment-block | Published and fixed. Public recheck on 2026-05-23 18:12 UTC: `200 OK`, 30 views, one post, embedded GIF and itch/direct links visible. | No reply needed now unless a real comment/question appears. |
| itch.io Devlog | https://tenevik.itch.io/gigahrush/devlog | Devlog index is live and lists the May 22 launch post; public recheck on 2026-05-23 18:12 UTC still shows the direct URL `https://tenevik.itch.io/gigahrush/devlog/1530909/-`, but fetching that URL returns `404`. | Verify the public permalink in browser/dashboard; keep the devlog index as the safe link until fixed. |
| GamHub | https://gamhub.net/website_submit/ | Submitted 2026-05-22 through public form; API returned `{"code":200,"msg":"Submit success"}`. Public follow-up on 2026-05-23 18:00 UTC: `/game/gigahrush/` and `/game/gigah-rush/` returned `404`; public search endpoint returned a tiny `404 Not Found` page. | Check search/listing after 48-72h, final game URL, tags, whether itch/direct/Telegram links survive review. |
| Samosbor Archive Fandom RU | https://samosborarchive.fandom.com/ru/wiki/ГИГАХРУЩ | Published game page. | Page availability, edits/reverts, external link retention, categories. |
| samosb0r Fandom RU | https://samosb0r.fandom.com/ru/wiki/ГИГАХРУЩ | Published game page. | Page availability, edits/reverts, external link retention, categories. |
| Self-Assembly Wiki EN / Fandom | https://samosborarchive-en.fandom.com/wiki/GIGAH_RUSH | Published game page; API extlinks retained itch/direct/Telegram/DTF/GameDev on 2026-05-23. | Page availability, edits/reverts, external link retention, EN terminology; manually review stale Newgrounds RIP link. |
| Reddit r/playmygame | https://www.reddit.com/r/playmygame/comments/1tku91k/gigahrush/ | Current non-NSFW post is live; developer affiliation and free-to-play status are stated; links to itch.io and direct build are present. | Watch comments only; do not repost identical copy across Reddit. |
| IndieDB | https://www.indiedb.com/games/gigahrush | Listing created 2026-05-23; profile assets and 5 gameplay screenshots uploaded. Public follow-up on 2026-05-23 18:00 UTC still hit Cloudflare `403` / `Just a moment...`, so shell cannot confirm review state. | Browser/account check page availability, screenshot page, comments/watchers, whether the account setup panel still asks for `Go Live`. |
| DiscoverGG | https://discovergg.com/ | Submitted 2026-05-23; site response: `Submitted! Live within 24h after review.` Public follow-up on 2026-05-23 18:00 UTC: homepage newest list did not include GIGAH\|RUSH; `/game/gigahrush` and `/game/gigah-rush` returned `404 · game not found`; `/search?q=gigahrush` returned `404`. | Recheck review status and final URL after 24-48h. |
| Gamemoor | https://gamemoor.com/contact | Logged-in account exists, but `/developer` redirects to homepage and likely requires site-owner action. | Contact Gamemoor: ask to enable developer portal for `jirnyak` or provide submit URL. |
| Fake Portal | https://fakeportal.com/submit-a-game/ | Submitted 2026-05-23 through logged-in form; response: `Game submitted for review!`, `game_id: 10841`, status `pending`, title `GIGAH\|RUSH`. Public follow-up on 2026-05-23 18:00 UTC: `/games/gigahrush/` and `/games/gigah-rush/` returned 404; search pages for `gigahrush` / `GIGAH RUSH` said `Nothing Found`. | Recheck pending review and public game URL in browser/account. |
| FreeZonePlay | https://freezoneplay.com/contact-us/ | Submitted 2026-05-23 through Contact Form 7; response `mail_sent`. WP admin post creation is `403`. Public follow-up on 2026-05-23 18:00 UTC: `/gigahrush/` and `/gigah-rush/` returned 404; search pages for `gigahrush` / `GIGAH RUSH` were `search-no-results`. | Watch email/contact response or public listing. |
| Querygame | https://querygame.com/submit | Blocked/submission not counted: earlier public form path exposed `/api/submit-game`, but direct POST returned `405`. Public follow-up on 2026-05-23 18:00 UTC: homepage is live, `/games/gigahrush` and `/games/gigah-rush` returned Querygame `404 - Page Not Found`, and `/search?q=gigahrush` also returned 404. | Recheck only if a working browser/account path is available; do not count as submitted. |
| Free Indie Games | https://www.freeindiegames.org/submit-game/ | Blocked by site bug: public page still displays raw shortcode `[ninja_forms_display_form id=1]` on 2026-05-23 18:00 UTC; earlier Ninja Forms REST route returned `404 rest_no_route`. | Owner/site maintainer must repair form or provide contact email. |
| iDev.Games | https://idev.games/upload-your-game | Upload info is public, but auth pages require account and Cloudflare challenge. | Owner logs in/registers in browser. |
| Kongregate | https://blog.kongregate.com/hc/en-us/articles/44395849259661-SUBMISSION-How-do-I-submit-a-game-to-Kongregate-It-s-Easy | Candidate. Accepts HTML5/WebGL/iframe, but requires account, Developer Application approval and review before publish. | Track account/application state if owner starts it. |
| Game Jolt | https://gamejolt.com/games/gigahrush/1072064 | Public Game Jolt page published on 2026-05-23 18:50 UTC / 19:50 BST. Package `1093814`, release `1474909`, version `0.1.0`; browser build `gigahrush-itch.zip` uploaded from `itch/gigahrush-itch.zip` (`4 992 192` bytes), marked `HTMLActive`, `Fit to screen` and HTTPS enabled. Public unauthenticated API check returned `200`; package visibility is `public`; release shows `Published1 build`. Play check opened Game Jolt wrapper and direct `serve.gamejolt.net` iframe; title `ГИГАХРУЩ - САМОСБОР`, visible canvas `1200x849`, language/name screen rendered. Description, Teen maturity (`tigrs_age=2`, non-adult), thumbnail `50560626`, header `50560651`, and one gallery screenshot `2181594` / media `50560706` are saved. | Watch plays/comments/followers and whether listing appears in discovery. Next optional improvements: add more gallery screenshots/GIFs and a Game Jolt devlog/update; safe DOM/keyboard automation could not open the devlog composer, so do not use blind coordinate clicks. |
| Alpha Beta Gamer | https://www.alphabetagamer.com/contact-us/ | Email pitch sent to `Admin@alphabetagamer.com` on 2026-05-23; Gmail showed `Message sent`. | Watch for reply/coverage; do not send immediate follow-up. |
| Free Game Planet | https://www.freegameplanet.com/contact/ | Email pitch sent to `admin@freegameplanet.com` on 2026-05-23; Gmail showed `Message sent`. | Watch for reply/coverage; do not send immediate follow-up. |
| Games Pending | https://gamespending.itch.io/ | Email pitch sent to `gamespending@gmail.com` on 2026-05-23 with a suggested 10-15 minute first-look route; Gmail showed `Message sent`. | Watch for reply/video; do not send immediate follow-up. |
| Armor Games | https://developers.armorgames.com/docs/introduction/overview/ | Candidate email pitch. Docs list `mygame@armorgames.com` and say they currently accept HTML5 games plus iframe options. | Pitch body is ready; send when Chrome/Gmail DOM automation is available again or manually from Gmail. |
| TapCraftBox | https://tapcraftbox.com/page/submit-game | Candidate email submission. HTML5 browser game requirements fit; contact is `support@tapcraftbox.com`. | Pitch body is ready; send when Chrome/Gmail DOM automation is available again or manually from Gmail. |
| ShoutWiki | https://samosbor.shoutwiki.com/wiki/ГИГАХРУЩ | Blocked by abuse filter `запрет правок`, rule `1==1`. | Only revisit if the wiki owner unfreezes editing. |

## Primary KPIs

Availability:

- Game page returns 200 and has the expected title.
- Direct build returns 200 and is playable.
- External links are still visible on each published surface.
- No moderation removal, hidden state, broken embed or deleted page.

Discovery:

- itch.io `noindex` removed.
- Search result appears for `GIGAH RUSH`, `GIGAH|RUSH`, `ГИГАХРУЩ`, `ГИГАХРУЩ Самосбор`.
- Wiki pages remain indexed and not marked for deletion.
- Portal pages expose tags/genres correctly: survival horror, browser, HTML5/WebGL, ARPG/shooter, singleplayer.

Engagement:

- Comments, replies, reviews, ratings, plays, downloads, views, bookmarks, reactions, subscribers.
- Ratio of constructive comments to generic negative/low-effort comments.
- Recurring feedback themes: onboarding confusion, UI readability, browser performance, expedition pacing, Samosbor danger, combat clarity, localization.

Conversion:

- Users click from media/wiki/forum pages to itch.io, direct build or Telegram where metrics are available.
- Newgrounds/itch plays after posts.
- Telegram joins after new publications.

Risk:

- Moderation warnings or removals.
- Accidental NSFW/adult flagging.
- Link-only/spam perception.
- Repeated complaints that the build is confusing, slow, blank, broken, too dark, too small, untranslated or not clearly playable.

## Good Signs

- itch.io `noindex` disappears.
- Newgrounds accepts a real HTML5 archive and the preview plays before any publish attempt.
- IndieDB stays visible with screenshots and no moderation rollback.
- Comments mention concrete mechanics instead of only confusion.
- People describe Samosbor, factions, expeditions or A-Life in their own words.
- Organic links/search mentions appear outside the places already posted.
- Repeated asks are actionable: controls, first objective, performance, fullscreen, English text, map readability.

## Bad Signs

- A page is removed, hidden, reverted, flagged as spam or marked for deletion.
- itch.io remains `noindex` after the release has been public for a while.
- Cloudflare/direct build is down or serves a stale build while itch has a newer release.
- Multiple first-time players cannot start, cannot find controls, cannot leave the safe area, or hit blank canvas/black screen.
- Feedback says "link dump", "AI spam", "NSFW mislabeled", "can't tell what this is", "not playable in browser" or "too much text".
- Same copy appears across several communities and starts looking like a blast campaign.

## Report Cadence

Owner-triggered reports:

- `KPI daily` - short status table, blockers and next 3 actions.
- `KPI weekly` - trend summary, best/worst platforms, feedback themes, fixes needed, next publishing wave.
- `KPI incident` - investigate a removal, broken link, bad feedback spike or build mismatch.
- `KPI pre-post` - check whether the next planned platform is safe to post to today.

Suggested normal cadence:

- Daily for the first 7 days after release.
- Twice weekly for the next 3 weeks.
- Weekly after the campaign stabilizes.
- Immediate check after each new release upload or portal publication.

## Report Template

```md
# GIGAH|RUSH Media KPI Report - YYYY-MM-DD

## Snapshot

| Surface | Status | Signal | Risk | Action |
| --- | --- | --- | --- | --- |

## Good Signs

- ...

## Bad Signs

- ...

## Feedback Themes

- ...

## Fix Queue

- ...

## Next Actions

1. ...
2. ...
3. ...

## Owner Needed

- ...
```

## Regular Checks

Use direct checks for public surfaces where possible:

- Fetch itch.io page and check status, title and `noindex`.
- Fetch Cloudflare build and check status, title and size drift.
- Fetch public forum/wiki/portal pages and verify the title plus external links.
- Use platform dashboards only if the owner has already logged in locally and the task explicitly requires private metrics.
- For any page requiring browser challenge, report `blocked by browser challenge` instead of guessing.

Manual dashboard metrics to capture when available:

- itch.io: views, browser plays, downloads, referrers, comments, ratings, devlog views.
- Newgrounds: views/plays, votes, rating, reviews, favorites, moderation notices.
- DTF: views, comments, likes, bookmarks.
- GameDev.ru: replies, views if visible, bug/criticism themes.
- Telegram: subscribers, post views, reactions, comment themes.
- IndieDB: page views, watchers, comments, news article views after page creation.

## Current Fix Priorities

1. Newgrounds is currently RIP/eulogy, not a live game surface. Existing project `7759223` is editable, but current upload/save flow produces a `9B` ZIP attachment; keep it out of active campaign links until a real archive is accepted.
2. itch.io public page still showed `noindex` on 2026-05-23. Recheck after moderation/indexing delay; if it persists, inspect dashboard/indexing warnings.
3. IndieDB listing, GamHub submission, DiscoverGG submission, Fake Portal pending submission and FreeZonePlay contact submission need follow-up checks after review windows; public checks on 2026-05-23 18:00 UTC still did not produce final GamHub/DiscoverGG/Fake Portal/FreeZonePlay URLs, and IndieDB remains Cloudflare-challenged from shell.
4. Gamemoor and Free Indie Games need owner/site-side contact because their public developer/submit paths are broken.
5. Querygame is not a submitted surface; public direct/search follow-up is still 404, and the submit API path previously returned `405`.
6. Chrome JavaScript-from-Apple-Events is usable in the authenticated Chrome session, but can intermittently return error 12 during long automation. In this pass the menu item remained checked; activating Chrome and retrying restored JS execution, and Game Jolt upload/publish completed through DOM/keyboard-safe actions. Do not use blind coordinate clicks. First email wave sent on 2026-05-23: Alpha Beta Gamer, Free Game Planet and Games Pending. Second-wave copy for Indie Games Plus, Armor Games and TapCraftBox is ready but not sent.
7. Keep Reddit non-NSFW. The current game classification is survival horror, not adult/NSFW.
8. CWS Games is skipped for now because it is adult-adjacent and the game is not NSFW.
9. Game Jolt is now a public live surface with package `1093814`, release `1474909`, HTML build `gigahrush-itch.zip`, playable iframe check passed, and public API `200`. Use `https://gamejolt.com/games/gigahrush/1072064` as an active campaign link.
10. Update all public pages after major release changes only when there is a real new angle: final release build, trailer, major content, press kit or portal launch. For the 2026-05-23 existing-surface amplification pass, DTF is a go for one concise release-update comment; GameDev.ru is conditional/no-go until the loading/progress complaint is addressed or explicitly acknowledged in the reply; itch forum/devlog are no-go for extra replies today.

## 2026-05-23 Account-Gated Quick Listing Check

Checked public requirements/current URLs for Game Jolt, iDev.Games, MyIndie, IndieHub and Kongregate without login or submission.

- Game Jolt is public at `https://gamejolt.com/games/gigahrush/1072064`; package `1093814` / release `1474909` contains the HTML build from `itch/gigahrush-itch.zip`; playable iframe check reached `ГИГАХРУЩ - САМОСБОР` with visible canvas. Next step is monitoring plus optional extra gallery media/devlog, not another publish pass.
- MyIndie is the safest RU quick listing: public catalog supports Web (HTML5), Horror, Shooter and Survival, and `Добавить игру` redirects to login. Owner account login is needed; draft/final safety depends on the logged-in form.
- iDev.Games fits HTML5/WebGL, but public docs say games are added instantly and moderated later. Treat upload as final-public unless the logged-in UI clearly provides a draft state.
- IndieHub is currently blocked as a quick listing: public `/game/add` returns an error and asks users to contact administration in Telegram. Use support/account check before any submission.
- Kongregate is not quick: it requires account, Developer Application approval, legal agreement, review, English language option, age rating, AI declaration, screenshots, description and instructions before publish is possible.

## 2026-05-23 Участок 4: quick RU/listing public recheck

No login, no submission, no final-click actions. Public pages checked for MyIndie, IndieHub, iDev.Games and Gamemoor.

| Surface | Current public state | Can do today | Blocker / risk |
| --- | --- | --- | --- |
| MyIndie | `https://myindie.ru/games` is live, has `Добавить игру`, supports `Web (HTML5)`, `Horror`, `Shooter`, `RPG`, `Survival` and engine `Another`; `https://myindie.ru/games/create` redirects to `https://myindie.ru/login`. Footer contact: `team@myindie.ru`. | After owner login/registers, prepare RU listing with itch/direct links, screenshots and honest stage/content note. Stop before final submit if there is no draft/preview state. | Login required. Public page does not reveal whether create is draft-safe or instant-public. |
| IndieHub | Homepage exposes login/registration, `добавить игру`, rules and Telegram support. Public `https://indiehub.ru/game/add` returns an error: page does not exist and asks to contact administration in Telegram. | Only ask support for working add-game path or test after owner login. | Not a ready quick listing until support/account reveals a working form. |
| iDev.Games | `https://idev.games/upload-your-game` and `/publish-game` say account is required, HTML5/WebGL/browser games fit, games are added instantly and moderated later; site requires JavaScript and uses Cloudflare. | If owner explicitly accepts instant-public behavior, login/register and upload/fill listing. | Treat upload as public publish, not draft work. Need account and Cloudflare/browser session. |
| Gamemoor | `https://gamemoor.com/contact` says developer portal is open and submissions go through review in a few days. Public `https://gamemoor.com/developer` redirects to login; `/submit`, `/dashboard`, `/my-games` are 404; `/games/add` redirects to 404. | If owner can log in, try `/developer`; otherwise send/contact support asking for developer access or submit URL. | Not instant-public from public web. Existing account previously could not reach developer portal, so support may be required. |

Classification: MyIndie is the best RU quick-listing candidate; iDev.Games is good but final-public; Gamemoor is review-queue after portal access; IndieHub is support-blocked.

# GIGAH|RUSH Media KPI Report - 2026-05-23

Latest public recheck: 2026-05-23 18:12 UTC / 19:12 BST. Later same-turn actions: owner explicitly asked to publish rather than keep surfaces unlisted; three targeted emails were sent through Gmail earlier in the pass; DTF/GameDev.ru/Reddit follow-up copy was prepared; Game Jolt was completed and published publicly at 2026-05-23 18:50 UTC / 19:50 BST. Game Jolt package `1093814` / release `1474909` uses `itch/gigahrush-itch.zip`; release `0.1.0` is published, HTML build is `HTMLActive`, public unauthenticated API returns `200`, and playable check reached the `ГИГАХРУЩ - САМОСБОР` canvas screen.

## Snapshot

| Surface | Status | Signal | Risk | Action |
| --- | --- | --- | --- | --- |
| itch.io game page | Live, fresh release | `200 OK`; page updated `23 May 2026 @ 06:05 UTC`; iframe points to `html/17645043/index.html?v=1779516324`; screenshots/GIFs visible; tags include Survival Horror. | Public HTML still contains `noindex`. | Recheck indexing; inspect dashboard/indexing warnings if it persists. |
| Cloudflare build | Live, fresh release | `200 OK`; public HTML size `10 652 640` bytes, matching local `dist/index.html`; no public `noindex` found. | Must stay synced with itch after every release. | Keep as direct browser link in PR copy. |
| Local itch pack | Verified | `npm run itch:verify` passed: 12 screenshots, 7 root-relative files, `4 992 192` bytes, 0 warnings. | This verifies package shape, not all browser gameplay. | Use this ZIP for portals that accept HTML5 archive. |
| Reddit r/playmygame | Live | New non-NSFW post exists: https://www.reddit.com/r/playmygame/comments/1tku91k/gigahrush/; author states developer involvement and links itch/direct build; only AutoModerator was visible in the public check. | Post is still fresh; blasting adjacent subreddits today would look like duplicate promo. | Reply only to real questions/feedback; wait 24-48h before r/WebGames and use different copy. |
| Newgrounds | Removed / upload blocked | `https://www.newgrounds.com/portal/view/1033564` redirects to `https://www.newgrounds.com/portal/rip/1033564`; existing project `7759223` is editable, but normal browser upload and direct `/parkfile` attach save the current ZIP as `9B`; bad attachment was deleted. | Not a live game surface; publishing now would be broken. | Keep out of active links; manual UI/support check before any publish. |
| GamHub | Submitted, pending review | Public form accepted on 2026-05-22, but `/game/gigahrush/`, `/game/gigah-rush/` and the public search endpoint still returned `404` at 18:00 UTC. | Listing may be waiting for manual review or may be rejected silently. | Recheck after 48-72h. |
| IndieDB | Listing created, browser check needed | Game page created at https://www.indiedb.com/games/gigahrush; profile assets and 5 gameplay screenshots uploaded; 18:00 UTC shell fetch still hit Cloudflare `403` / `Just a moment...`. | Cannot confirm current public review/`Go Live` state from shell. | Verify page/images/news state in browser/account, then consider a launch news update. |
| DiscoverGG | Submitted, pending review | Site response: `Submitted! Live within 24h after review.` At 18:00 UTC, homepage newest list did not include GIGAH\|RUSH; `/game/gigahrush`, `/game/gigah-rush` and `/search?q=gigahrush` returned `404`. | Review may still be pending; no public URL yet. | Recheck after 24-48h and add final URL to KPI if it appears. |
| Fake Portal | Submitted, pending review | Submission response: `Game submitted for review!`; `game_id: 10841`, title `GIGAH\|RUSH`; at 18:00 UTC `/games/gigahrush/` and `/games/gigah-rush/` returned 404, and search pages said `Nothing Found`. | Pending moderation or browser/account-only status; no public URL yet. | Recheck review state/public listing in browser/account. |
| FreeZonePlay | Contact submission sent, not listed | Contact Form 7 response: `mail_sent`; at 18:00 UTC `/gigahrush/` and `/gigah-rush/` returned 404, and `gigahrush` / `GIGAH RUSH` search pages were `search-no-results`. | Contact submission may not become a listing without owner response. | Watch for email/public listing; recheck search later. |
| Gamemoor | Blocked by site path | Logged-in account exists, but `/developer` redirects to homepage and likely submit endpoints return `404`. | Cannot submit until portal access is enabled. | Contact Gamemoor and ask for developer access/submit URL. |
| Free Indie Games | Blocked by broken form | Submit page still renders raw `[ninja_forms_display_form id=1]` at 18:00 UTC; earlier REST route returned `404 rest_no_route`. | No working submission form. | Need site owner repair or alternate email/contact. |
| DTF | Live, update appropriate | Public `200 OK`; counters in HTML: 1967 views, 419 hits, 6 comments, 10 favorites, 5 reactions; no public removal/editor warning detected. | A second full post would look duplicative; comment text must not be a bare link bump. | Go: one concise release-update comment with itch.io as primary link and a concrete feedback ask. |
| GameDev.ru | Live, conditional update only | Public `200 OK`; thread has `#1` feedback that the direct online build shows a dark-blue stuck-looking screen and needs a progress bar; `#2` owner reply says Cloudflare/VPN. | Generic release bump would ignore the only concrete technical complaint and may amplify a bad first impression. | No-go for generic update; conditional reply may acknowledge loading/progress risk, point to itch.io as primary, and ask for first-minutes/UI feedback. |
| itch.io Release Announcements | Live, no reply needed | Public `200 OK`; 30 views; one post; embedded GIF, itch link and direct online link visible. | Replying without an actual question/comment would be a self-bump. | No-go today; reply only to real comments. |
| itch.io Devlog | Index live, direct post URL broken | Devlog index `200 OK` and lists `ГИГАХРУЩ: первый публичный браузерный билд`; direct permalink `https://tenevik.itch.io/gigahrush/devlog/1530909/-` still returns `404`. | Sharing the direct permalink may send users to 404; itch game page and devlog index still carry `noindex`. | No-go for extra devlog reply; use devlog index as safe link and fix permalink in dashboard/browser. |
| Fandom RU/EN pages | Live via API, browser challenged | RU/EN pages and games lists exist; API extlinks retained itch/direct links, and EN retained Telegram/DTF/GameDev. | Shell HTML hits Cloudflare; EN page may still include stale Newgrounds RIP link. | Manual browser check page history/link retention; remove or mark Newgrounds link if appropriate. |
| Game Jolt | Public playable page | Page URL: https://gamejolt.com/games/gigahrush/1072064. Dashboard/API game `1072064` is `Early Access`, `Published`, `published_on=2026-05-23T18:50:59Z`; thumbnail `50560626`, header `50560651`, screenshot `2181594` / media `50560706`, Teen/non-adult maturity. Package `1093814` visibility is `public`; release `1474909`, version `0.1.0`, is published with one HTML build from `itch/gigahrush-itch.zip` (`4 992 192` bytes), `HTMLActive`, `Fit to screen` and HTTPS enabled. Play check opened Game Jolt wrapper and direct `serve.gamejolt.net` iframe; title `ГИГАХРУЩ - САМОСБОР`, visible canvas `1200x849`, language/name screen rendered. | Only one gallery screenshot is uploaded; safe automation did not open the Game Jolt devlog composer. | Monitor plays/comments/followers; optionally add more screenshots/GIFs and a devlog/update through a trusted UI path. |
| Account portal wave | Partially executed | IndieDB/Fake Portal/DiscoverGG submitted or created; Game Jolt is public/playable; iDev.Games still needs account/browser path. | Remaining platforms have either broken submit paths, account challenges or instant-public behavior. | Recheck reviews, then continue only where forms are real and draft-safe. |
| Email-only pitch wave | First targeted batch sent; second batch ready | Gmail `Message sent` confirmed for Alpha Beta Gamer `Admin@alphabetagamer.com`, Free Game Planet `admin@freegameplanet.com`, and Games Pending `gamespending@gmail.com`. Indie Games Plus, Armor Games and TapCraftBox bodies are ready but not sent. | Avoid turning this into a mass blast immediately after batch 1. | Send the second batch as a small follow-on only through Gmail DOM/manual, then pause again; no quick follow-up to batch 1. |
| Chrome automation | Working but intermittent | Apple Events / JavaScript automation worked for Gmail batch 1 and Game Jolt description, maturity, media upload, ZIP upload, release publish and game publish. During a long base64 transfer Chrome returned error 12 once, while the menu item remained checked; activating Chrome and retrying restored execution. | Long browser automation can fail mid-stream; blind coordinate clicks remain unsafe. | Use DOM inspection/actions and trusted keyboard activation where needed; if error 12 appears, activate Chrome/check `View > Developer > Allow JavaScript from Apple Events`, then retry. |
| Next-wave discovery | Ready | `Docs/PRCampaign/next_wave_targets_2026-05-23.md` now separates immediate email targets, account-gated portals, Reddit follow-up and low-fit skips. | Contact identity is solved; blockers are safe outbound, account logins and platform review windows. | Use it as the next operating queue. |
| CWS Games | Skipped | Official developer page accepts HTML/WebGL/JavaScript, but positions the site around adult HTML games/adult creators. | GIGAH|RUSH is survival horror, not NSFW; wrong audience/context. | Do not post unless strategy changes. |
| Querygame | Blocked / not submitted | Public form exists and JS calls `/api/submit-game`, but direct POST returned `405` earlier on 2026-05-23; at 18:00 UTC homepage was live but `/games/gigahrush`, `/games/gigah-rush` and `/search?q=gigahrush` returned Querygame 404. | Form likely broken server-side or requires a browser path that could not be safely automated; no submission should be counted. | Recheck only if a working browser/account path is available. |

## Good Signs

- Fresh release is live on itch.io and Cloudflare.
- Cloudflare direct build is indexable and matches local build size.
- itch package verification passed with 0 warnings.
- Reddit r/playmygame now has a non-NSFW post with developer affiliation and direct links.
- IndieDB page exists and has gameplay screenshots.
- DiscoverGG, Fake Portal and FreeZonePlay accepted submissions/contact forms for review.
- Additional viable next targets found: Armor Games, TapCraftBox, Kongregate, Game Jolt and iDev.Games.
- DTF is a live surface with enough visibility for one concise release-update comment.
- GameDev.ru is live and already produced useful technical feedback; the next reply should acknowledge the loading/progress issue instead of acting like a generic release bump.
- Email-only media/portal wave has clear targets and first three pitches sent.
- Owner contact details are now confirmed for pitches: `jirnyak@gmail.com`, https://jirny.uk and https://t.me/gigah_rush.
- Game Jolt is now a public playable surface with package/release/build IDs recorded and a visible canvas check.

## Bad Signs

- itch.io still emits `noindex` after the fresh release upload.
- Newgrounds publication is now a RIP/eulogy page, and the editor currently saves the ZIP as `9B`.
- GamHub, DiscoverGG, Fake Portal and FreeZonePlay are still not visible publicly after submission/contact follow-up.
- Gamemoor developer portal and Free Indie Games form are broken on the site side.
- Querygame is still not submitted/listed: submit API returned `405`, and public direct/search checks return 404.
- Game Jolt gallery is thin: only one gallery screenshot is documented; add several more screenshots/GIFs when doing the next polish pass.
- PLRun's previously tracked developer URL now returns `410/Page Not Found`, so it is no longer a clean P0 email target.
- Game Jolt devlog composer did not open through safe DOM/keyboard activation; use manual/trusted UI path for that post instead of blind coordinate clicks.

## Feedback Themes

- No reliable new public feedback was captured in this pass.
- Next monitoring should classify feedback into onboarding, controls, UI readability, survival pressure, Samosbor danger, browser performance and language clarity.

## Fix Queue

1. Resolve or wait out itch.io `noindex`.
2. Keep Newgrounds out of active link set until support/manual UI accepts the real ZIP.
3. Recheck GamHub listing visibility after 48-72h; 18:00 UTC follow-up still returned only 404/no listing.
4. Recheck IndieDB, DiscoverGG, Fake Portal and FreeZonePlay review/public states; current public checks still do not show final GamHub/DiscoverGG/Fake Portal/FreeZonePlay URLs, and IndieDB still needs browser/account because shell hits Cloudflare.
5. Add one short release-update comment on DTF after login; keep GameDev.ru conditional until the loading/progress complaint is addressed in the copy or in the build.
6. Contact Gamemoor and Free Indie Games about broken submit paths.
7. Pause email wave after sent Alpha Beta Gamer, Free Game Planet and Games Pending; next later batch is ready but not sent: Indie Games Plus (`editors@indiegamesplus.com`), Armor Games and TapCraftBox.
8. Game Jolt is public/playable; next pass should add extra media/devlog if a trusted composer path is available, then monitor plays/comments/followers.
9. Keep CWS Games skipped; the game is not NSFW.

## Next Actions

1. Agent: recheck GamHub / IndieDB / DiscoverGG / Fake Portal / FreeZonePlay review states and public URLs after the review window.
2. Agent/owner: Chrome Apple Events are usable but can be intermittent; continue with DOM inspection/actions and trusted keyboard activation only. No blind coordinate clicks and no final publish/upload without page-specific preview.
3. Agent: after DTF login, post one concise release-update comment with itch.io as the primary link and direct build as secondary.
4. Agent/owner: on GameDev.ru, do not post a generic release update; only reply if acknowledging the dark-blue/loading/progress feedback and asking for a recheck through itch.io.
5. Owner/agent: contact Gamemoor and Free Indie Games with the exact broken-submit notes.
6. Agent: monitor the now-public Game Jolt page, add extra screenshots/GIFs/devlog only through a trusted composer path, and answer real comments.
7. Agent: send a smaller second email batch to Indie Games Plus, Armor Games and TapCraftBox only via Gmail DOM/manual, then pause again.
8. Agent: after account access, start Kongregate developer application if desired; Game Jolt is already live.
9. Agent: run the next KPI check after GamHub/review windows and itch indexing delay; keep Querygame out of submitted surfaces until its flow works.

## Owner Needed

- Newgrounds: manual/support check for project `7759223`, because fresh ZIP attaches as `9B`; do not publish without playable preview.
- Browser login only, no passwords in chat: iDev.Games if we continue that target.
- Sender identity is confirmed: `jirnyak`, `jirnyak@gmail.com`, https://jirny.uk and Telegram `https://t.me/gigah_rush`.
- Safe automation: Chrome Apple Events worked for the completed Game Jolt publish, but long runs can intermittently return error 12. Activate Chrome/check the menu item and retry; final publish/upload still needs page-specific preview.
- Budget decision only if pursuing MegaViral: it requires Stripe `$1/month per game`.

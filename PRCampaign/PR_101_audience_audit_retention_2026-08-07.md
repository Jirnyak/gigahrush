# PR 101: Full audience audit across all public surfaces + retention brief

Date: 2026-08-07 (data snapshots: 2026-07-30 GamePush export, 2026-08-06 public/live counters).

Type: **monitoring / analysis only**. No post, comment, submission, upload, email, vote,
rating, form action, account action or moderation interaction was made in this pass.
One new local doc was written: `retention.md` (repo root). This report and the `KPI.md`
line are the durable record.

## Owner request

Owner asked for a full internet-wide audit of how many people have played ГИГАХРУЩ across
all sources, then for a combined view total, then to fold in Пикабу and DTF, and finally for
a briefing doc that a separate session can act on with the target of **10 000+ lifetime
unique players and hundreds of regulars**.

## Method

Public surfaces were read logged-out through search, direct HTTP and public APIs
(ModDB/IndieDB via readable proxy, DTF `api.dtf.ru/v2.5`, Game Jolt `site-api`,
`games.pikabu.ru` page payload, Telegram public shell). Owner-side numbers came from
screenshots supplied by the owner (itch dashboard, MyIndie card) and from the owner's
GamePush players export. The game's own backend was read at its public endpoint.
No authenticated dashboard was driven and no browser was launched.

## Unique-player counters (the only two that count people, not hits)

| Pool | Metric | Value | Snapshot | Source |
|---|---|---|---|---|
| Пикабу Игры (GamePush project `28314`) | unique GamePush IDs | **543** | 2026-07-30 08:07 | `28314-players-2026-07-30-08-07-46.csv` |
| Direct build + itch + MyIndie (shared backend) | `totalPlayers` | **564** | 2026-08-06 22:33 UTC | `https://gigahrush.bileter.workers.dev/api/net/stats` |
| **Confirmed total** | | **1 107** | | disjoint, see below |

The two pools do not overlap. The portal build runs from `s3.gamepush.com` and
`portalAllowsOptionalNetwork()` disables Net Sphere in portal mode
(`src/systems/net_sphere.ts`), so Pikabu players cannot appear in `totalPlayers`.

Honest estimate including offline players and Pikabu growth after the export:
**1 200-1 600 lifetime unique players**. Target is roughly 7x that.

Live backend snapshot 2026-08-06 22:33 UTC: `onlineUsers: 0`, `totalPlayers: 564`,
`totalSessions: 4`, `totalSamosbors: 123`, `totalDeaths: 124`.

## Per-surface counters

| Surface | Views | Plays | Downloads | Other |
|---|---|---|---|---|
| itch.io (365d, to 2026-08-06) | 1 661 | 429 browser plays | 2 | 0 ratings, 0 comments, 4 collections |
| MyIndie (v0.99) | 851 | 1 425 plays | 86 | — |
| Пикабу Игры (live since 2026-07-15) | not public | 543 players | — | rating **3.5 / 11 reviews** |
| ModDB | 2 027 visits | — | — | rank 26 821/78 393, 2 articles, 1 review, 1 follower |
| IndieDB | 974 visits | — | — | rank 1 297/74 558, 2 articles, 1 review |
| DTF (5 posts, 2 accounts) | 1 273 | — | — | `id3476339` 683; `id3479866` 180/171/150/89 |
| Telegram `@gigah_rush` | — | — | — | **58 subscribers** |
| Game Jolt (game id 1072064, since 2026-05-23) | not public | — | — | 1 like, 1 follower |
| Хабр (2 articles) | unavailable | — | — | API returns `AUTHOR_INACTIVE`; **articles do not open** |
| Пикабу posts (3, `@TENEVIK.GAMES`) | owner-only counter | — | — | — |
| gamedev.ru (3 threads), html5gamedevs, forum.indie.ru, gamedev.net, Gamin.me, iDev.Games | closed counters / ~0 | — | — | iDev.Games: 4 plays |

Measurable page views total: **~6 800**. Full reach including Хабр and forums is order 10⁴.

DTF detail: the older account `id3476339` ("Яков Бирман") has the single best-performing post
(683 views); the current account `id3479866` ("Tenevik T") averages ~148 across four posts.
Reach dropped roughly 4x after the account switch. Subscribers: 1 and 2.

## Search sweep result

No other publication, mirror, port or coverage exists. Checked and negative: Steam, VK Play,
Яндекс Игры, CrazyGames, Poki, Newgrounds, Kongregate, YouTube, VK Video, Reddit threads,
Пикабу/DTF third-party coverage. The only surfaces are the ones listed above.

## Findings from the GamePush export (543 rows)

| Field | Value |
|---|---|
| Rows / unique IDs | 543 / 543 |
| `test = false` | 539 |
| `progress` non-empty | 240 (44%) — of which **238 are the literal string `test`**, 2 are real save JSON |
| `progress` empty | 303 (56%) |
| With avatar (real Pikabu accounts) | 514 |
| With name | 128 |
| `score` | exactly 100 for all 240; max = 100 |

Three conclusions, verified against source:

1. **56% of Pikabu players never produced a single input.** `progress` stays empty exactly
   when `fulfillSandboxTests` never fires, and it is bound to the first `pointerdown`/`keydown`
   (`src/systems/platform_bridge.ts:459-462`). Those 303 people loaded the frame and left
   without clicking. Build weight is a prime suspect: `pikabu/gigahrush-pikabu.zip` is
   `13 031 440` bytes and `dist/index.html` is `11 476 096` bytes.
2. **Portal cloud save is effectively non-functional.** Only 2 of 543 players have a real
   save record. `fulfillSandboxTests` writes `gp.player.set('progress', 'test')` and
   `gp.player.set('score', 100)` on the first input of every live player
   (`src/systems/platform_bridge.ts:441-443`) — GamePush Sandbox scaffolding that shipped to
   production and clobbers the cloud-save slot. Whether the real write path
   (`platform_bridge.ts:671-689`) is ever reached is the open question.
3. **Both leaderboards are dead.** `Опыт выживания` (`99388`) and `Самый глубокий этаж`
   (`99389`) receive the constant 100 from the same scaffolding. The cheapest return hook on
   a portal shows nothing.

## Funnel

```
543 entered on Pikabu
 └─ 303 (56%)  left without a single input      <- load time / first screen
     240 (44%) started playing
      └─ 2 (0,4%) reached a real save            <- first minutes + broken cloud save
          ?         regulars                     <- not instrumented at all
```

Pikabu is the only proven channel at scale: 543 players in 15 days versus 564 in 2,5 months
across every other surface combined. Pushing more traffic into it before the funnel is fixed
burns the channel.

## Deliverable

`retention.md` in the repo root: full data set, the verified findings above, a six-lane work
plan (instrumentation, first five minutes, portal contract repair, a reason to return,
feedback loop, then channel scaling), target metrics with current values, project constraints,
a reading list, and a ready-to-paste starting prompt for a dedicated session.

Target metrics recorded there: 10 000+ lifetime unique players, hundreds of regulars,
80%+ reaching first input, 25%+ reaching first save, 15%+ second-session return,
500+ Telegram subscribers. Three of those six cannot currently be measured at all.

## Next actions

1. Run the retention session from `retention.md`. Instrumentation first — without the
   funnel events, half the target metrics are unverifiable.
2. Repair the portal contract: isolate `fulfillSandboxTests` so Sandbox still passes but live
   players stop receiving `progress='test'` / `score=100`; verify real cloud save in a live
   iframe; feed both leaderboards real values.
3. Read the 11 Pikabu reviews on `https://games.pikabu.ru/game/gigakhrushch` and the Net Sphere
   chat log in D1. Neither has ever been analysed; they are the only live feedback that exists.
4. Restore or replace the Хабр surface — it was the main traffic source and both articles are
   currently unreachable (`AUTHOR_INACTIVE`). Replacement material already exists in
   `PRCampaign/teletype_article_1.md`, `longread_procedural_speech_2026-07-23.md`,
   `vc_article_gigahrush_2026-07-23.md`.
5. Only after 1-3: scale through GamePush distribution to Яндекс Игры / VK Play / OK with the
   same adapter, and open the video lane (zero coverage at 1 100+ players).

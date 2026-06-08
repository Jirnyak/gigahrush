# audit_18.md - Cloudflare Net Sphere, Terminal, Online Fallback

### Coverage

- Files and docs reviewed: `README.md`, `AGENTS.md`, `architecture.md`, `cloudflare.md`, `online.md`, `save.md`, `functions/worker.ts`, `functions/api/net/{common,hello,stats,chat,event,market}.ts`, `cloudflare/d1/*.sql`, `scripts/cloudflare-net-setup.mjs`, `src/systems/net_sphere.ts`, `src/systems/stock_market.ts`, `src/systems/platform_bridge.ts`, `src/render/net_sphere_ui.ts`, `src/pwa.ts`, `public/sw.js`, `public/manifest.webmanifest`, `vite.config.ts`, `wrangler.jsonc`, `gigahrush-npc-intake/hosted/worker.mjs`, `tests/net-sphere.test.ts`, `tests/net-market.test.ts`, `tests/platform-bridge.test.ts`, `tests/npc-hosted-pipeline.test.ts`.
- Commands run: `git status --short`; `sed -n ...` for required docs; `nl -ba ... | sed -n ...` for cited code/test/schema ranges; `rg --files ...`; `find functions cloudflare -maxdepth 4 -type f | sort`; focused `rg -n ...` searches for Net Sphere, Cloudflare, API, session, event, market, PWA and NPC intake paths.
- Areas not covered and why: no live Cloudflare/Wrangler/D1/R2 commands were run because this audit explicitly forbids deployment/schema/write-producing commands; no build/check/browser smoke was run because this is a read-only audit; NPC intake frontend was only sampled through the hosted Worker path because the assignment focus is Net Sphere/terminal/online fallback.

### Findings

- `A18-01`
- Severity: `major`
- Location: `src/main.ts:2269`, `src/main.ts:2272`, `src/systems/net_sphere.ts:878`, `functions/api/net/event.ts:41`
- Evidence: `reportNetSphereProgressEvents()` reports samosbor with `eventKey` `samosbor:${count}` only. `reportNetSphereEvent()` scopes it only as `${runtime.netGen}:${eventKey}`. The Worker stores events with `INSERT OR IGNORE INTO net_events`.
- Why this is a real problem: after a new run under the same `НЕТ-ГЕН`, `state.samosborCount` starts from the same small integers again. The second run's first samosbor reuses the same cloud key, is ignored by D1, and does not increment `total_samosbors` because the counter update happens only when the insert changes rows at `functions/api/net/event.ts:46`. This silently undercounts repeat runs and suppresses public event summaries.
- 100% doable improvement: include a run-scoped stable value in event ids, for example `samosbor:${run.runSeed}:${floorRunEntryRouteId(entry)}:${count}` or a generated current-run id, while keeping the `NET-GEN` prefix on the client/server boundary.
- Validation after fix: add a Net Sphere event test that posts two `samosbor:1` events for the same `NET-GEN` but different run ids and asserts both are inserted and `totalSamosbors` becomes `2`; add a client/unit test for the generated samosbor event key.
- Related systems touched: Net Sphere client event reporting, Worker `/api/net/event`, D1 `net_events`, public stats.

- `A18-02`
- Severity: `major`
- Location: `functions/api/net/event.ts:29`, `functions/api/net/event.ts:41`, `functions/api/net/event.ts:46`, `functions/api/net/common.ts:399`
- Evidence: `/api/net/event` reads a bounded JSON body, validates identity/type/key, then writes every new `event_key` with `INSERT OR IGNORE`. There is no per-`net_gen`, per-session or per-IP event budget. Old events are only pruned after 30 days by `DELETE FROM net_events WHERE created_at < ?`.
- Why this is a real problem: chat has a 2.5 second per-profile cooldown and market has a per-window budget, but floor events can be spammed by sending unique event keys. That can grow D1 writes/storage, inflate `total_samosbors`/`deaths`, and churn the public summary feed even though the local game remains playable.
- 100% doable improvement: add a small server-side `net_event_budgets` table or query-backed token bucket keyed by `net_gen` plus a coarse IP hash; cap event count and accepted severity per minute; return the standard `apiError(..., 429)` envelope before inserting.
- Validation after fix: add tests that a burst of valid unique events over the cap returns `429`, inserts no extra rows, and leaves aggregate counters unchanged after the cap.
- Related systems touched: Worker `/api/net/event`, D1 schema/migration, Net Sphere tests, Cloudflare docs.

- `A18-03`
- Severity: `major`
- Location: `src/render/net_sphere_ui.ts:93`, `src/systems/net_sphere.ts:650`, `src/systems/net_sphere.ts:656`, `src/systems/net_sphere.ts:662`, `functions/api/net/hello.ts:29`, `functions/api/net/hello.ts:35`, `functions/api/net/common.ts:423`
- Evidence: the UI displays `НЕТ-ГЕН`; `/netgen` accepts any syntactically valid value and stores it in `localStorage`; mutating endpoints trust `netGen` plus `sessionId`; `upsertPresence()` updates the profile row for that `net_gen`.
- Why this is a real problem: `НЕТ-ГЕН` is treated as both public recovery code and write credential. Anyone who sees or guesses a code can switch to it, post chat/events/market impulses as that profile, and overwrite nickname/progress aggregates. This is not anti-cheat; it is basic profile ownership and abuse containment for a public chat/stats surface.
- 100% doable improvement: generate a separate private profile secret in `localStorage`, store only a hash/server-side verifier for each `net_gen`, and require it for POST endpoints. Keep `/netgen NET-...` as an explicit import/recovery flow that needs the secret, or make it read-only until ownership is proven.
- Validation after fix: tests should assert that POST `/hello`, `/chat`, `/event` and `/market` reject a correct `netGen` with a wrong/missing secret; existing local identity initialization should create and persist both `netGen` and secret; public `GET /stats` should not allow mutation.
- Related systems touched: Net Sphere client identity, D1 `net_players`, all mutating Net API endpoints, UI copy.

- `A18-04`
- Severity: `major`
- Location: `src/systems/net_sphere.ts:264`, `src/systems/net_sphere.ts:265`, `functions/api/net/common.ts:177`, `functions/api/net/common.ts:449`, `functions/api/net/common.ts:450`, `functions/api/net/market.ts:67`, `functions/api/net/market.ts:145`, `tests/net-market.test.ts:354`
- Evidence: the client creates/stores `sessionId` in `sessionStorage`; the server accepts any `SES-*` shape; `upsertPresence()` increments `runs` whenever a session id is new; market rate limiting keys the budget as `${netGen}:${sessionId}`. The existing burst test only proves one session is capped.
- Why this is a real problem: opening another tab, clearing session storage, or posting arbitrary valid `SES-*` ids bypasses the market budget and inflates session/runs/online metrics for the same profile. This weakens the cost gate the market endpoint is supposed to provide.
- 100% doable improvement: make the hard market budget key `net_gen` for write volume, optionally with a secondary session/IP dimension for diagnostics; count `runs` with a coarser per-profile start window instead of every novel session id; reject pathological session churn.
- Validation after fix: add tests that two different `sessionId` values under one `netGen` share the same market write budget and that repeated `/hello` calls with rotating session ids do not inflate `runs` beyond the intended window.
- Related systems touched: Net Sphere session identity, `/api/net/hello`, `/api/net/market`, D1 `net_sessions`, stats/profile tests.

- `A18-05`
- Severity: `minor`
- Location: `src/systems/net_sphere.ts:421`, `src/systems/net_sphere.ts:422`, `src/systems/net_sphere.ts:423`, `src/systems/net_sphere.ts:424`, `functions/api/net/common.ts:496`, `functions/api/net/common.ts:497`, `functions/api/net/common.ts:498`, `src/render/net_sphere_ui.ts:106`
- Evidence: the client sends floor name, raw run seed, route id and `z`; `readProfile()` returns `runSeed`, `routeId` and `floorZ`; the terminal UI displays the raw run seed as `сид мира`.
- Why this is a real problem: the public/campaign rule is to avoid implementation-geometry leakage. Raw route ids, z-depth and seed values are useful internal diagnostics, but they expose topology/procedural implementation language through a player-visible/network profile surface. If `GET /stats?netGen=...` remains unauthenticated, this is also observable by anyone with a known `НЕТ-ГЕН`.
- 100% doable improvement: keep route internals server-private or behind the ownership token from `A18-03`; return/display diegetic labels such as current signal/floor band and omit `routeId`/`floorZ` from public profile payloads. If a seed must remain visible, label it as a player-entered world code and do not expose other route topology fields.
- Validation after fix: update profile/API tests to assert public stats responses do not include `routeId`/`floorZ`; add a UI snapshot/unit assertion that Net Sphere shows diegetic signal text rather than raw route topology.
- Related systems touched: Net Sphere progress payload, profile response, UI copy, cloudflare docs.

- `A18-06`
- Severity: `minor`
- Location: `functions/worker.ts:68`, `functions/worker.ts:69`, `gigahrush-npc-intake/hosted/worker.mjs:1`, `gigahrush-npc-intake/hosted/worker.mjs:275`, `gigahrush-npc-intake/hosted/worker.mjs:277`, `gigahrush-npc-intake/hosted/worker.mjs:282`
- Evidence: the main Worker forwards `/api/npc-intake/*` into the hosted intake Worker. That Worker defines per-file caps, but `handleSubmit()` calls `request.formData()` before checking any total request size or `Content-Length`, then reads uploaded files into memory for validation.
- Why this is a real problem: the file caps catch oversized ZIP/image files after multipart parsing, but a large multipart body can still force Worker-side parsing/allocation before rejection. This is an optional online endpoint, yet it shares the same Worker deployment and abuse surface as Net Sphere.
- 100% doable improvement: reject early on `Content-Length` above a small total envelope, for example ZIP cap + image caps + metadata overhead, before `request.formData()`; also reject missing/invalid multipart content type before parsing.
- Validation after fix: add hosted Worker tests for an oversized `Content-Length` request that never calls storage/D1 and returns `413`, plus a normal valid submission test to preserve the manual/export fallback.
- Related systems touched: Worker `/api/npc-intake/submit`, NPC intake hosted tests, Cloudflare docs.

### Fallback Risk Table

| Network-dependent path | Current fallback | Risk |
| --- | --- | --- |
| Static game through Worker Assets | Safe: non-API paths go to `env.ASSETS.fetch()`, and tests cover missing D1 serving assets. | Low. |
| Net Sphere heartbeat `/api/net/hello` | Safe for local play: client times out fetches and marks channel offline without blocking the loop. | Medium: profile writes trust only `NET-GEN` + client session. |
| Stats/chat polling `/api/net/stats` and `/api/net/chat` | Safe for local play: missing D1 returns `503`; UI shows offline; service worker excludes `/api/`. | Medium: chat is rate-limited, but profile lookup is unauthenticated by `NET-GEN`. |
| Event posting `/api/net/event` | Gameplay-safe fire-and-forget path. | High: repeated-run event ids undercount, and unique event spam has no rate budget. |
| Market GET/POST `/api/net/market` | Safe for local economy: local stock market keeps running and remote snapshots only softly nudge quotes. | High: write budget is per client-supplied session id, so rotating sessions bypasses it. |
| PWA service worker | Safe: `public/sw.js` skips cross-origin, `/api/`, and `/npc-intake/` requests. | Low. |
| NPC intake submit `/api/npc-intake/submit` | Static questionnaire can still export ZIP manually when bindings are missing. | Medium: total multipart body is not rejected before parsing. |
| Cloudflare setup/schema scripts | Not required for local build; scripts are explicit `cf:*` commands. | Medium: they intentionally write `wrangler.jsonc` and remote D1/R2, so they must stay opt-in. |

### Highest-Impact Fix Order

1. Add server-side ownership secret/token for `NET-GEN` and require it on all mutating Net API endpoints (`A18-03`).
2. Move market/event budgets to server-trusted per-profile buckets, not client session ids; add event rate limiting (`A18-02`, `A18-04`).
3. Make Net event ids run-scoped so repeated local runs under one profile count correctly (`A18-01`).
4. Stop returning/displaying raw route topology fields from public/profile Net Sphere responses (`A18-05`).
5. Add early total-body rejection to `/api/npc-intake/submit` before multipart parsing (`A18-06`).

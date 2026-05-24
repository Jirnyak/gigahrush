# rework_04_message_log_and_bark_triage

Target model: GPT-5.5 worker.

Mode: implementation worker. Treat current dirty bark/UI work as existing user work unless you own the exact change.

## Goal

Make messages and NPC barks informative instead of noisy.

The game should not feel like a global chat feed. Local speech should be heard locally, important events should interrupt, and ambient chatter should live in the log or direct talk.

## Feedback This Addresses

- Chat/log flies too fast.
- NPC text feels noisy.
- Atmosphere does not land because important facts and ambient chatter share one lane.
- Players need to understand what happened near them.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `scenarist.md`
- `Docs/ScenarioWriters/README.md`
- `src/systems/ai/barks.ts`
- `src/systems/ai/index.ts`
- `src/systems/events.ts`
- `src/systems/world_log.ts` if present/current
- `src/systems/rumor.ts` if present/current
- `src/render/hud.ts`
- `src/render/log_ui.ts`
- `src/data/context_lines.ts`
- `src/data/dialogue.ts`
- `tests/npc-barks.test.ts`

Run `git status --short`.

## Channel Rules

Use four channels conceptually:

1. HUD
   - immediate survival
   - direct action result
   - severe consequence noticed by the player

2. Log
   - local heard speech with distance
   - action history
   - compact event record

3. Direct Talk
   - longer NPC flavor
   - rumors
   - local explanation

4. Rumor/Event Spread
   - delayed consequences
   - social memory
   - faction/economy changes

Do not put pure ambience in HUD.

## Bark Triage

Classify barks by signal:

- `alert`: danger now, may enter HUD.
- `witness`: saw theft, death, repair, shortage, faction clash; may enter HUD if severe.
- `lead`: points to route, shelter, quest, trade, rumor; log/direct talk unless explicitly selected.
- `ambient`: local color only; log/direct talk, not HUD.

Recommended HUD-worthy examples:

- `САМОСБОР: зона 12, 30 сек. К герме или за границу зоны.`
- `Кражу заметили: бинт из медпоста. Очередь услышала.`
- `Герма повреждена: ищите другой шов.`
- `За дверью зовут знакомым голосом. Не открывать до отбоя.`

Do not HUD:

- idle kitchen chatter
- generic curses
- "кран кашляет" ambience
- repeated random combat taunts unless they indicate a real tactical state

## Important Existing Bug To Check

Dirty bark work appears to set per-entity cooldown before confirming that the bark was heard. If an out-of-radius bark consumes cooldown, nearby future speech can be suppressed.

Fix direction:

- Select line.
- Check whether it can be pushed/logged.
- Only then write `lastBarkByEntity`, or keep separate "attempted" and "heard" cooldowns.

## Save/Shape Warning

Avoid adding fields to saved `Msg` / `LogEntry` unless necessary. If you add persistent fields, inspect save payload sanitization and shape version rules.

Prefer render-time classification helpers or optional fields sanitized safely.

## Suggested File Ownership

Likely touched:

- `src/systems/ai/barks.ts`
- `src/systems/ai/index.ts`
- `src/render/hud.ts`
- `src/render/log_ui.ts`
- `tests/npc-barks.test.ts`

Possible:

- `src/data/context_lines.ts` for first pass on duplicated/low-signal barks.
- `src/systems/events.ts` only if a generic channel is missing.

Avoid:

- Expanding bark pools just to add atmosphere.
- New unbounded logs.
- Per-frame broad scans for messages.

## Acceptance Criteria

- Out-of-range barks do not consume the "heard" cooldown.
- Heard NPC lines keep distance in log.
- HUD displays fewer, higher-signal lines.
- Message display is bounded by count, age and priority.
- Existing tests pass and new tests cover radius/cooldown behavior.

## Verification

```bash
npm run typecheck
npm run test:unit
```

If HUD routing changes:

```bash
npm run check:browser
```

If broad text changes:

```bash
npm run l10n:audit
```

# gatbage archive map

`gatbage/` is archive and local-artifact storage. It is not the primary source of truth for shipped behavior.

Use the folders by intent:

- `reference/` - still useful reference packets. Read only when the active root docs point here or the task needs that domain.
- `history/` - old prompts, agent logs, task statuses, batch plans, retired root notes, wiki drafts and generated planning waves.
- `media/` - small reusable archived public/media text packs. Large old screenshot/gallery/itch ZIP archives were removed from the working tree.
- `tmp/` - ignored local artifacts. `tmp/media/` keeps the current PR media pick set and small active promo assets; raw captures and stale ZIP bundles should not be kept here.
- `trash/` - preserved junk: system files, loose scratch files and other material kept only to avoid destructive cleanup.

Do not add new loose files at the top level of `gatbage/`. Put them in one of the buckets above, or update an active root document instead.

Most useful current paths:

- `reference/scenario_writers/` - text voice/domain packets.
- `reference/procedural_floors/` - procedural geometry/anomaly authoring contracts.
- `reference/design_floors/` - authored floor packets and route-floor references.
- `reference/expansions/` - old expansion briefs and integration contracts.
- `reference/ux_rework/` - cautious UX rework briefs.
- `tmp/media/prcampaign_screenshot_hunt_2026-05-23/selected_best/` - current PR media pick set referenced by PR campaign docs.

# Status_FLOOR11_LIVING

Prompt: `Docs/DesignFloors/AgentPrompts/floor11_living.md`
Domain: Living-floor expedition preparation / hub route prep.
Write scope: new additive Living module, Living content manifest import, this status file, final agent log.

## Preflight

- Read `README.md`, `architecture.md`, `desdoc.md`, `Docs/DesignFloors/INDEX.md`, `Docs/DesignFloors/floor_contract.md`, and `Docs/DesignFloors/living.md`.
- Read source references: `src/gen/living/content_manifest.ts`, `src/gen/living/zone_content.ts`, `src/gen/living/tutor_room.ts`, `src/systems/quests.ts`, plus local Living quest/content examples.
- Baseline `npm run build`: passed before implementation.

## Implementation

- Added `src/gen/living/expedition_prep.ts`.
- Registered it from `src/gen/living/content_manifest.ts`.
- New protected Living POI: `Пункт сборов вылазки`, zone HUD 52.
- New NPCs: Лида Маршрутная, Аня Герма, Миша Потеряшка, Вера Возвратная.
- New side quests:
  - `floor11_prepare_expedition_supplies`: bring water, receive filter, route and 9mm.
  - `floor11_hermodoor_repair`: bring hermo gasket, receive door kit and sealant.
  - `floor11_lost_property`: recover a key label, receive child map and water coupon.
  - `floor11_return_evidence`: bring pressure logbook from a lower-route expedition, visible through quest log/event completion and Vera's post-completion dialogue.
- Added public, owner and locked containers for prep supplies, repair materials, route records and lost property.

## Validation

- `npm run typecheck`: passed after implementation.
- `npm run check`: passed after implementation.
  - Typecheck passed.
  - Unit tests passed.
  - Vite single-file build passed: 229 modules, `dist/index.html` 1,326.42 kB, gzip 393.26 kB.
  - Smoke passed: `hudLit=6197`, `hudCenterLit=128`, `sceneLit=202145`.

# LOG_FLOOR11_LIVING

## Final Report

Implemented the Living-floor expedition-prep slice as one additive module, `src/gen/living/expedition_prep.ts`, with a single side-effect import from `src/gen/living/content_manifest.ts`.

The new protected POI is `Пункт сборов вылазки` in Living zone HUD 52. It adds four NPCs with concrete route-prep dialogue: Лида Маршрутная for supply checks, Аня Герма for hermodoor prep, Миша Потеряшка for lost property, and Вера Возвратная for return evidence. The content remains a playable room with containers and item decisions instead of a DOM menu.

Added side quests:

- `floor11_prepare_expedition_supplies`: water before a route, rewarded with filter, route clue and 9mm.
- `floor11_hermodoor_repair`: hermo gasket for shelter prep, rewarded with door kit and sealant.
- `floor11_lost_property`: recover a key label, rewarded with child map and water coupon.
- `floor11_return_evidence`: bring a pressure logbook from a lower-route expedition; completion is visible in quest/event log and Vera has post-completion return dialogue.

The room uses `protectRoom()` and `aptMask`, places public/owner/locked containers, and does no frame-time scanning or DOM work.

Verification:

- Baseline `npm run build`: passed before implementation.
- `npm run typecheck`: passed after implementation.
- `npm run check`: passed after implementation, including typecheck, unit tests, Vite build, and smoke.


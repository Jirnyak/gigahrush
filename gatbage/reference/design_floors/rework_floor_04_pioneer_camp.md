# Rework Floor 04: Пионерлагерь

Route id: `pioneer_camp`. Z: `+38`. Base floor: `LIVING`. Owned source: `src/gen/design_floors/pioneer_camp.ts`.

## Problem

The camp architecture is one of the good partial results: square, canteen, infirmary, radio club, bathhouse, old cabin and trails already give it identity. The issue is density. A camp with a few actors feels like a set. It needs a social field while staying calmer than the combat floors.

## Rework Target

Use a local override against the high-`z` curve: this floor is a protected social pocket, so it can have many children/citizens despite `z=+38`. The center should be populated and anxious; the forest/old cabin edges should hold monsters.

Population targets:

- NPC field: `700..1400`;
- NPC mix: mostly `Occupation.CHILD`/citizens, small staff, small scientists/liquidators;
- monsters: `500..1200`;
- level/loot: mixed; low-level camp supplies in center, high-risk old-cabin/radio loot at edges.

## Gameplay Identity

Pioneer camp should be quieter, not empty. It should offer escort, food theft, shelter roster truth/lie, loudspeaker repair, infirmary triage and old-cabin investigation. The center is social risk; the outer trail loop is monster risk.

Children are atmosphere and stakes, not a joke. Keep text dry and restrained. Avoid graphic or exploitative content.

## Generic Population Profile

The pre-pass already routes broad density through `designFloorPopulationProfile(route)` and `applyDesignFloorPopulationField()`. Current source-of-truth target: `npcTarget=1100`, `monsterTarget=900`, child-heavy occupation mix, camp placement kind. This is an explicit high-`z` override: keep the protected center populated while letting monsters own the edge.

Use room typing and zone factions to make canteen, infirmary, radio club and square pull NPC templates, while old cabin, trails, bathhouse edge and storage pull monsters. Do not hand-place the camp crowd in the generator.

## Implementation Notes

- Tune the existing camp NPC profile toward square/canteen/infirmary/library/radio club.
- Tune the existing monster profile toward forest decay, old cabin, bathhouse edge, boat station and trail loops.
- Use A-Life templates for ordinary children/citizens where possible; keep current named quest NPCs as `plotNpcId`.
- Keep bucket limits so the central square is busy but not a single pile.
- Keep shelter mechanics reachable and visible through existing rooms/cues.

## Samosbor

Samosbor should turn the lineup square into a shelter decision: warn by loudspeaker, hide in infirmary/canteen, abandon the old cabin, or lose people at the forest edge. Aftermath can move children to shelters, spoil food or open an old stash.

## Verification

- The camp feels calmer than roof/underhell, but has hundreds to low thousands of NPCs.
- Monsters are visible outside the safe center and do not spawn inside every child cluster.
- At least three decisions remain playable: roster, loudspeaker, food/infirmary/old cabin.
- Run `npm run check`.

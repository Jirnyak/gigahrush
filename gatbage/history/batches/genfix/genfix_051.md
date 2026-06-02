# genfix_051: Жилая зона

## Route target

- Map: `tmp/floor-maps/all_route_seed_61061/051_z+0_story_story_living_Жилая_зона.png`
- Route: story `story_living`, z+0, index 051/101
- Story route key: `story_living`
- Current metrics: rooms 10491, doors 2135, containers 67, entities 9309, reachable 415803, walls 632059, floors 416423
- Priority: P3 reference or preserve

## Reference scale

- 021 Министерство: rooms 609, doors 609, reachable 394873, floors 395226
- 037 Квартиры: rooms 13907, doors 79353, reachable 823940, floors 824339
- 051 Жилая зона: rooms 10491, doors 2135, reachable 415803, floors 416423
- 077 Коллекторы: rooms 4497, doors 75, reachable 287407, floors 287578

## Faction territory control

- Target control shares: граждане 64%, ликвидаторы 14%, культисты 6%, учёные 7%, дикие 9%.
- Dominant owner: граждане; reason: floor-specific override from new territory brief.
- Use cell-first ownership: zones may remain for debug/reveal, but they must not be the source of faction truth.
- Place one mini HQ anchor for every human faction in different parts of the map; tiny factions may get ruined/hidden outposts, not zero presence.
- Dominant faction gets the strongest HQ or 2-3 connected outposts; secondary factions get smaller safe cores and frontier rooms.
- Each mini HQ needs a hard hermetic/shelter core plus surrounding believable support rooms: toilets, kitchen/common room, workshop/storage, medical/office as faction-appropriate.
- Spread `world.factionControl` / future `territoryOwner` from HQ seeds until target shares are approximately reached; fill every passable cell, then inherit walls/inaccessible cells from nearest owned passable region.
- Borders should be chunky and readable, not checkerboard. Use deterministic noise and room bias, but keep floor-memory snapshots compressible.
- NPC placement/materialization should prefer own territory and HQ safe zones, while patrols/raids/frontier events can cross borders without creating population refill.
- At minimum, generated tests should assert HQ anchors and nonzero owned cells for: граждане, ликвидаторы, культисты, учёные, дикие.

## User feedback

```text
051_z+0_story_story_living_Жилая_зона.png
идеально 
эталон этажа
(но не что надо всё копировать а как референс)
например если надо добавить в пустые пространства другого этажа комнат то можно использовать идеи этого этажа
```

## Diagnosis

- Этаж отмечен как удачный/эталонный: не переписывать базовую геометрию, фиксировать только явные артефакты и использовать как reference scale.
- Story floor: это baseline/route floor, править осторожно и не ломать существующий первый проходимый путь.
- Новая фракционная система должна быть встроена в геометрию: доли контроля и HQ anchors являются частью генератора этажа, а не отдельной зонной раскраской после факта.

## Source files to inspect first

- `src/gen/floor_manifest.ts`
- `src/gen/living/geometry.ts`
- `src/gen/living/apartments.ts`
- `src/gen/living/index.ts`
- `src/gen/living/content_manifest.ts`
- `factions.md`
- `src/data/factions.ts`
- `src/systems/territory.ts`
- `src/systems/factions.ts`
- `scripts/render-procedural-floor-map.ts`

## Implementation brief

- Preserve-pass only: do not normalize this floor into the generic apartment/corridor style.
- Use the metrics and visual grammar here as a reference when filling worse floors.
- Fix only narrow issues mentioned in feedback: route continuity, accidental corridor merging, water/channel count, or intentional chaos density.
- Integrate faction territory in the generator pass: geometry first, mini HQ anchors second, cell control spread third, room ownership derivation fourth.
- Do not resurrect old zone ownership semantics. `zoneMap` can support debug/reveal, but `world.factionControl` / future `territoryOwner` is the authoritative cell owner field.
- Use existing World primitives: cells, roomMap, wallTex, floorTex, features, doors, room records, route cues and placement fields.
- Preserve toroidal coordinate rules via world.idx/world.wrap/world.delta/world.dist/world.dist2.
- Any new POI/cluster/HQ must be reachable, have coherent rooms/doors/textures/features, and respect protected lifts/hermo/apt cells.

## Acceptance criteria

- After rerender, the floor still reads as the same original/etalon floor; no broad homogenizing rewrite.
- Room/door/reachable metrics move toward the successful reference floors where relevant, without blindly copying their topology.
- Faction control starts from HQs and approximately matches target shares: граждане 64%, ликвидаторы 14%, культисты 6%, учёные 7%, дикие 9%.
- Every human faction has a mini HQ anchor in a distinct part of the map; tiny factions can be small/ruined but must not disappear.
- HQs have hermetic/safe cores plus support rooms, and NPC placement has a believable safe-zone bias toward own territory.
- Route lifts/spawn remain reachable; no protected apartments, hermetic walls or required anchors are bulldozed.
- No new FloorLevel, content-specific main/render/core hook, per-frame full-world scan, or background NPC refill.

## Checks

- `./node_modules/.bin/tsx scripts/render-procedural-floor-map.ts --seed 61061 --all --entry 051 --out-dir tmp/floor-maps/genfix_051_after`
- `Add/update focused territory assertions: territoryHqAnchors(world), countTerritoryCells(world), dominant owner/share, and nonzero HQ/cells for every human faction`
- `npm run typecheck`
- `npm run check unless blocked by unrelated dirty dist/build artifacts`

# genfix_027: Архив критической протечки

## Route target

- Map: `tmp/floor-maps/all_route_seed_61061/027_z+24_design_critical_leak_archive_Архив_критической_протечки.png`
- Route: design `critical_leak_archive`, z+24, index 027/101
- Design route id: `critical_leak_archive`, role: вода, документы, шлюзы, danger 4
- Current metrics: rooms 8, doors 2, containers 5, entities 1411, reachable 40304, walls 1008270, floors 40306
- Priority: P1 preserve macro, add mid/micro

## Reference scale

- 021 Министерство: rooms 609, doors 609, reachable 394873, floors 395226
- 037 Квартиры: rooms 13907, doors 79353, reachable 823940, floors 824339
- 051 Жилая зона: rooms 10491, doors 2135, reachable 415803, floors 416423
- 077 Коллекторы: rooms 4497, doors 75, reachable 287407, floors 287578

## Faction territory control

- Target control shares: граждане 28%, ликвидаторы 34%, культисты 8%, учёные 18%, дикие 12%.
- Dominant owner: ликвидаторы; reason: floor-specific override from new territory brief.
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
027_z+24_design_critical_leak_archive_Архив_критической_протечки.png
интересное макро и выглядит незаконченым почему бы не занять этим алгоритмом всё доступное пространство?
```

## Diagnosis

- См. дословный фидбек: закрыть замечание видимой геометрией и проверяемыми метриками, а не только переименованием или лутом.
- Authored design floor: сохранить уникальную макроидею этажа, но довести генератор до полного пакета macro -> mid -> micro.
- Новая фракционная система должна быть встроена в геометрию: доли контроля и HQ anchors являются частью генератора этажа, а не отдельной зонной раскраской после факта.

## Source files to inspect first

- `src/gen/design_floors/critical_leak_archive.ts`
- `src/gen/design_floors/full_floor.ts`
- `src/gen/design_floors/manifest.ts`
- `src/data/design_floors.ts`
- `tests/critical-leak-archive.test.ts`
- `factions.md`
- `src/data/factions.ts`
- `src/systems/territory.ts`
- `src/systems/factions.ts`
- `scripts/render-procedural-floor-map.ts`

## Implementation brief

- Keep or clarify the strongest macro shape; do not replace an interesting route idea with uniform room scatter.
- Add a mid layer: blocks, rings, stations, archive cells, yards, service islands, rails, shafts or clusters that occupy the large empty spans.
- Add a micro layer: small rooms, closets, storage, cabinets, side loops, local doors, alcoves, vents, booths and short connector corridors.
- Every large blank area must become either intentional playable void/court/hazard or be filled by a bounded generator pass.
- Archive-specific hint: ordered grids of small square registry rooms are valid microfill if connected by short doors/aisles.
- Algorithm-floor hint: expose the named algorithm in geometry; generate recognisable graph/cayley structure plus rooms attached to graph nodes.
- Integrate faction territory in the generator pass: geometry first, mini HQ anchors second, cell control spread third, room ownership derivation fourth.
- Do not resurrect old zone ownership semantics. `zoneMap` can support debug/reveal, but `world.factionControl` / future `territoryOwner` is the authoritative cell owner field.
- Use existing World primitives: cells, roomMap, wallTex, floorTex, features, doors, room records, route cues and placement fields.
- Preserve toroidal coordinate rules via world.idx/world.wrap/world.delta/world.dist/world.dist2.
- Any new POI/cluster/HQ must be reachable, have coherent rooms/doors/textures/features, and respect protected lifts/hermo/apt cells.

## Acceptance criteria

- After rerender, PNG visibly contains macro, mid and micro levels: a large idea, local clusters and small playable rooms.
- Long empty corridors and huge blank rooms are no longer the dominant geometry unless the feedback explicitly asks for a void/court.
- Room/door/reachable metrics move toward the successful reference floors where relevant, without blindly copying their topology.
- Faction control starts from HQs and approximately matches target shares: граждане 28%, ликвидаторы 34%, культисты 8%, учёные 18%, дикие 12%.
- Every human faction has a mini HQ anchor in a distinct part of the map; tiny factions can be small/ruined but must not disappear.
- HQs have hermetic/safe cores plus support rooms, and NPC placement has a believable safe-zone bias toward own territory.
- Route lifts/spawn remain reachable; no protected apartments, hermetic walls or required anchors are bulldozed.
- No new FloorLevel, content-specific main/render/core hook, per-frame full-world scan, or background NPC refill.
- The design floor keeps its authored identity and remains registered through the existing manifest route.

## Checks

- `./node_modules/.bin/tsx scripts/render-procedural-floor-map.ts --seed 61061 --all --entry 027 --out-dir tmp/floor-maps/genfix_027_after`
- `Add/update focused territory assertions: territoryHqAnchors(world), countTerritoryCells(world), dominant owner/share, and nonzero HQ/cells for every human faction`
- `./node_modules/.bin/tsx --test tests/critical-leak-archive.test.ts`
- `npm run typecheck`
- `npm run check unless blocked by unrelated dirty dist/build artifacts`

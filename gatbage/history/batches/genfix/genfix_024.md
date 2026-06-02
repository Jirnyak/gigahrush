# genfix_024: говнячный смог: архивные норы, гражданский этаж

## Route target

- Map: `tmp/floor-maps/all_route_seed_61061/024_z+27_procedural_z27_говнячный_смог_архивные_норы,_гражданский_этаж.png`
- Route: procedural `z27`, z+27, index 024/101
- Procedural profile: geometry `archive_warrens`, anomaly `smog`, majority `citizens`, danger 3
- Current metrics: rooms 225, doors 558, containers 27, entities 1630, reachable 52070, walls 996407, floors 52169
- Priority: P1 preserve macro, add mid/micro

## Reference scale

- 021 Министерство: rooms 609, doors 609, reachable 394873, floors 395226
- 037 Квартиры: rooms 13907, doors 79353, reachable 823940, floors 824339
- 051 Жилая зона: rooms 10491, doors 2135, reachable 415803, floors 416423
- 077 Коллекторы: rooms 4497, doors 75, reachable 287407, floors 287578

## Faction territory control

- Target control shares: граждане 56%, ликвидаторы 17%, культисты 7%, учёные 8%, дикие 12%.
- Dominant owner: граждане; reason: procedural majority citizens.
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
024_z+27_procedural_z27_говнячный_смог_архивные_норы,_гражданский_этаж.png
интересное макро но пусто нужно добавит мног окомнат и коридоров
```

## Diagnosis

- Главная проблема: нарушен масштаб 1024x1024. Макроидея есть или намечена, но между крупными линиями не хватает среднего и микрослоя.
- Процедурный профиль: geometry=archive_warrens, anomaly=smog, majority=citizens, danger=3. Исправление должно усиливать семейство геометрии/аномалии универсально, а не под один PNG.
- Новая фракционная система должна быть встроена в геометрию: доли контроля и HQ anchors являются частью генератора этажа, а не отдельной зонной раскраской после факта.

## Source files to inspect first

- `src/gen/procedural_floor.ts`
- `src/data/procedural_floors.ts`
- `src/gen/procedural_structure_library.ts`
- `src/gen/procedural_anomalies/index.ts`
- `tests/procedural-floors.test.ts`
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
- Prefer adding reusable geometry-family helpers or anomaly-specific fill hooks in generation time; no runtime population refill or renderer-owned geometry.
- Integrate faction territory in the generator pass: geometry first, mini HQ anchors second, cell control spread third, room ownership derivation fourth.
- Do not resurrect old zone ownership semantics. `zoneMap` can support debug/reveal, but `world.factionControl` / future `territoryOwner` is the authoritative cell owner field.
- Use existing World primitives: cells, roomMap, wallTex, floorTex, features, doors, room records, route cues and placement fields.
- Preserve toroidal coordinate rules via world.idx/world.wrap/world.delta/world.dist/world.dist2.
- Any new POI/cluster/HQ must be reachable, have coherent rooms/doors/textures/features, and respect protected lifts/hermo/apt cells.

## Acceptance criteria

- After rerender, PNG visibly contains macro, mid and micro levels: a large idea, local clusters and small playable rooms.
- Long empty corridors and huge blank rooms are no longer the dominant geometry unless the feedback explicitly asks for a void/court.
- Room/door/reachable metrics move toward the successful reference floors where relevant, without blindly copying their topology.
- Faction control starts from HQs and approximately matches target shares: граждане 56%, ликвидаторы 17%, культисты 7%, учёные 8%, дикие 12%.
- Every human faction has a mini HQ anchor in a distinct part of the map; tiny factions can be small/ruined but must not disappear.
- HQs have hermetic/safe cores plus support rooms, and NPC placement has a believable safe-zone bias toward own territory.
- Route lifts/spawn remain reachable; no protected apartments, hermetic walls or required anchors are bulldozed.
- No new FloorLevel, content-specific main/render/core hook, per-frame full-world scan, or background NPC refill.
- The fix benefits the geometry/anomaly/faction family across seeds, not only seed 61061.

## Checks

- `./node_modules/.bin/tsx scripts/render-procedural-floor-map.ts --seed 61061 --all --entry 024 --out-dir tmp/floor-maps/genfix_024_after`
- `Add/update focused territory assertions: territoryHqAnchors(world), countTerritoryCells(world), dominant owner/share, and nonzero HQ/cells for every human faction`
- `GIGAHRUSH_GENERATION_MATRIX=1 ./node_modules/.bin/tsx --test --test-name-pattern "procedural" tests/procedural-floors.test.ts`
- `npm run typecheck`
- `npm run check unless blocked by unrelated dirty dist/build artifacts`

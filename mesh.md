# Mesh Pass System

> Центральный документ текущей render-only mesh pass системы.
>
> Роль: описывает shipped слой 3D-детализации поверх плоской 2D-симуляции:
> данные, `World.visualSlots`, профили, генераторные corridor-covering модули,
> сбор сцены, процедурные модели, corridor-volume dressing, voxel/chunk ветку,
> WebGL draw path, лимиты, тесты и правила расширения.
> Это не план. Future work и физические блокираторы вынесены отдельно в
> [block.md](block.md).

## Status

Mesh pass реализован как декоративный WebGL2 слой в `src/render/mesh/`.

Текущий контракт:

- симуляция, AI, A-Life, pathfinding, combat, save/load и floor memory остаются
  плоскими;
- `World.cells`, `rooms`, `doors`, `features`, `containers`, `entities`,
  route/floor theme, gameplay context, render time и seed являются входом для
  картинки;
- mesh pass ничего не мутирует в gameplay state;
- `visualSlots` - render-only микродекорация, не коллизия;
- browser setting `3D детализация` хранится в UI settings, не в save payload;
- `off` полностью выключает mesh pass без изменения gameplay;
- `low` является default fresh setting;
- `high` включает дополнительную локальную voxel ветку под теми же бюджетами;
- прямоугольные 2D-коридоры могут получать render-only 3D-покрытие от
  генераторного профиля: бетонные микропанели/пороги, технические трубы/кабели,
  коллекторные канавки, пещерные выступы/сталактиты or smooth wall/floor meat
  folds;
- `webgl.ts` импортирует mesh только через публичный `./mesh` barrel.

Валидация текущего прохода:

- `npm run check` проходит.
- `npm run check:browser` проходит.
- `SMOKE_VISUAL_GEOMETRY_MODE=off npm run smoke` проходит.
- `SMOKE_VISUAL_GEOMETRY_MODE=high npm run smoke` проходит.
- `SMOKE_MOBILE=1 SMOKE_VISUAL_GEOMETRY_MODE=low npm run smoke` проходит.

## System Boundaries

Mesh pass не является 3D-симуляцией.

Data flow is one-way:

```txt
game/world/systems context -> mesh visuals -> screen
```

Gameplay can influence mesh. The pass may read stable world facts, resolved
floor profiles, route/procedural tags, camera, fog/light context, surface marks,
feature/container/entity facts and render time. Future samosbor, alarm,
electricity, damage, faction, quest or weather-like context may also feed
visual selection, animation, tinting, flicker or local deformation when passed as
bounded read-only data.

Mesh must not influence gameplay. Mesh output cannot become collision,
pathfinding, AI stimulus, interaction reachability, save truth, floor-memory
truth or quest state. If a visual change needs gameplay consequences, the source
system must publish an explicit gameplay fact separately, and mesh may only draw
that fact.

Не меняются:

- `Entity.x/y`, actor movement radius and AI intents;
- `World.solid()` and current coarse cell passability;
- projectile wall collision and line traces;
- A-Life materialization/foldback;
- faction territory and room ownership;
- save shape;
- floor memory packed world arrays;
- interaction semantics.

Колонна, стол, труба или шкаф в mesh pass могут выглядеть объемно, но они не
останавливают игрока и NPC. Gameplay-коллизия для таких объектов должна идти
через будущий `block.md` layer, not через `visualSlots` and not через mesh
model registry.

## Ownership

```txt
core/    World.visualSlots and dirty versions only
data/    visual slot/model/profile registries
gen/     generation-time visual slot filling
systems/ browser-local setting and floor-memory accounting
render/  mesh collection, model build, buffers, shaders and draw path
main.ts  passes resolved profile into renderSceneGL()
```

Render reads state and draws. It must not decide gameplay.

## Public API

The only public mesh entry point is `src/render/mesh/index.ts`.

It exports:

- `createMeshPass()`;
- mesh stats helpers and debug formatter;
- public mesh pass/context/stats types;
- material registry helpers;
- visual model registry helpers;
- model cache helpers;
- procedural model builders for tests and narrow tooling.

`src/render/webgl.ts` imports:

```ts
import {
  createMeshPass,
  createMeshPassStats,
  type MeshPassContext,
  type MeshPassHandle,
  type MeshPassStats,
} from './mesh';
```

No other mesh internals should leak into `webgl.ts`.

## Frame Pipeline

`renderSceneGL()` keeps the existing low-resolution WebGL raycaster pipeline.
Mesh pass is inserted after the raycaster depth pass and before sprites:

```txt
1. bind low-res ray FBO
2. draw raycaster fullscreen pass
3. update mesh pass from camera/world/profile
4. draw mesh triangles with depth test
5. draw billboard sprites
6. draw particles
7. final blit to visible canvas
8. draw canvas HUD/menus/maps/log
```

The mesh pass uses the same world coordinate frame as the raycaster:

- X/Y are world cell coordinates on the `1024x1024` torus;
- Z is visual height only;
- camera comes from `CameraView`;
- FOV comes from the current camera;
- depth is written into the same depth convention as raycaster/sprites.

`MeshPass.render()` sets:

- `gl.depthFunc(gl.LESS)`;
- `gl.depthMask(true)`;
- blending off;
- cull face off;
- one triangle draw call when geometry exists.

After drawing it leaves the GL state in the expected non-blended, depth-tested
baseline used by the following sprite path.

## Mesh Pass Context

The public context shape is:

```ts
interface MeshPassContext {
  world: World;
  camera: CameraView;
  floorKey: string;
  seed: number;
  time: number;
  fogDensity?: number;
  fogColor?: readonly [number, number, number];
  ambient?: number;
  lightTex?: WebGLTexture | null;
  mode: VisualGeometryMode;
  profile: ResolvedVisualGeometryProfile;
}
```

`webgl.ts` builds this context from already known render inputs. `main.ts`
resolves the geometry/surface profiles from current floor theme and browser
setting, then passes them into `renderSceneGL()`. Content-specific mesh choices
do not belong in `main.ts`.

## Browser Setting

`src/systems/ui_orchestrator.ts` stores `visualGeometryMode` in the browser-local
UI settings object. It is outside the game save.

Modes live in `src/data/visual_geometry_profiles.ts`:

| Mode | Enabled | Radius | Instance cap | Field radius | Field cap | Triangle cap | Corridor volume | Voxel |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `off` | no | 0 | 0 | 0 | 0 | 0 | no | no |
| `low` | yes | 4 | 128 | 2 | 16 | 24000 | low | no |
| `medium` | yes | 8 | 256 | 4 | 32 | 48000 | medium | no |
| `high` | yes | 16 | 512 | 8 | 64 | 96000 | high | yes, radius 12 |

`Radius` is the near disc, not the draw distance. The distance geometry is
actually collected and dissolved at is derived from it — `min(fog reach,
radius * 2)`, i.e. 8 / 16 / 31 cells — and resolved in one place,
`meshDrawRadiusForContext`. Read that helper, not the mode number, when you need
the real bound; the value used to be recomputed in three places and one copy had
already drifted.

The resolver applies deterministic theme modulation from floor key/tags:

- Maintenance/industrial floors bias toward pipes, cables, ceiling detail and
  emissive utility surfaces plus technical/collector corridor coverings.
- Residential floors bias toward furniture detail.
- Meat/Hell floors reduce ordinary furniture and emphasize smooth meat corridor
  folds; living-tunnel/mycelium tags select cave-like roughness separately.
- Void floors reduce instances/triangles for sparse silhouettes.

Corridor covering modules live in `src/data/visual_corridor_coverings.ts`.
They are selected from the same floor/theme/procedural tags that generators
already publish:

- `concrete`: ordinary rectangular corridor, wall relief, ledges and thresholds;
- `technical`: service corridors with more pipes, cables and panels;
- `collector`: collectors/sumps/blackwater corridors with gutters, pipes and
  wet service detail;
- `cave`: living-tunnel/mycelium topology with stone protrusions and
  stalactites;
- `meat`: Hell/samosbor meat corridors with smoother gut-like wall folds;
- `void`: sparse silhouette dressing for finale/void routes.

Resolved profile keys look like `geometry:<mode>:<floorKey>`.

## Visual Slots

`World.visualSlots` is the active-world source layer for render-only
micro-decoration.

```ts
export const VISUAL_SLOTS_PER_CELL = 16;
export const EMPTY_VISUAL_CELL_CODE = 0;
visualSlots: Uint8Array; // W * W * 16
```

Memory cost:

```txt
1024 * 1024 * 16 bytes = 16 MiB per active World
```

Facts:

- `0` means empty.
- `1..255` are data-driven visual cell codes.
- Slot index is a stacking lane and deterministic tiebreaker, not a second id.
- `visualSlotVersion` and `visualSlotDirtyVersion` are bumped by helpers.
- `replaceWorldFromGeneration()` copies `visualSlots` and bumps dirty state.
- `systems/floor_memory.ts` counts active `visualSlots` in RAM estimates but
  does not pack or save the full array.
- Tests assert packed floor memory does not contain `visualSlots`.

Current public helpers in `src/core/world.ts`:

- `visualSlotOffset(cellIdx, slot)`;
- `getVisualSlot(world, cellIdx, slot)`;
- `setVisualSlot(world, cellIdx, slot, code)`;
- `clearVisualSlots(world, cellIdx)`;
- `World.markVisualSlotsDirty()`.

`src/gen/visual_cell_slots.ts` provides generation-facing helpers:

- `addVisualSlotFirstFree()`;
- `addVisualSlotByPriority()`;
- `clearVisualSlotRegion()`;
- `fillVisualSlotsFromFeature()`;
- `fillVisualSlotsForWorldFeatures()`;
- `rebuildVisualSlotsFromWorldFeatures()`;
- room decor placement for wall fixtures, ceiling details and columns.

## Visual Cell Registry

`src/data/visual_cell_slots.ts` defines byte-sized semantic hints.

Each `VisualCellDef` contains:

- `code`;
- stable lowercase `id`;
- `family`;
- `anchor`;
- `mount`;
- optional `zBand`;
- source policy;
- wall face policy;
- `modelId`;
- merge mode;
- priority;
- density cost.

Families:

- `pipe`;
- `button`;
- `cable`;
- `panel`;
- `column`;
- `furniture`;
- `ceiling`;
- `lamp`;
- `machine`;
- `organic`;
- `clutter`.

Mounts:

- `floor`;
- `ceiling`;
- `wallFace`;
- `cellCenter`;
- `corner`;
- `volume`.

Merge modes:

- `none`;
- `line4`;
- `wallLine`;
- `cluster`.

The registry includes wall pipes, wall buttons, loose cables, wall panels,
ceiling cables/beams/bundles, columns, furniture hints, machine/apparatus
hints, lamp/candle hints, rubble and organic threads.

## Visual Model Registry

`src/data/visual_models.ts` defines procedural model templates, not asset files.

Model ids include:

- wall utilities: `pipe_wall_small`, `pipe_wall_large`, `button_panel`,
  `cable_wall_loose`, `wall_panel_flat`, `wall_panel_screen`;
- ceiling detail: `ceiling_cable`, `ceiling_beam`,
  `ceiling_pipe_bundle`, `ceiling_cable_bundle`, `lamp_support`;
- structure: `column_hint`, `column_concrete_square`,
  `column_concrete_round`;
- furniture: `table_slab`, `desk_slab`, `chair_simple`, `bed_frame`,
  `shelf_block`;
- machines/fixtures: `machine_box`, `stove_block`, `sink_basin`,
  `toilet_bowl`, `apparatus_cage`;
- small props: `lamp_stand`, `candle_stub`, `container_crate`,
  `container_small_box`, `container_tall_cabinet`, `trash_bin`;
- corridor volume: `corridor_wall_relief`, `corridor_side_ledge`,
  `corridor_floor_threshold`, `collector_gutter`, `organic_stalactite`,
  `organic_wall_bulge`, `cave_stalactite`, `cave_wall_protrusion`,
  `meat_wall_fold`, `meat_floor_fold`;
- fallback:
  `billboard_prop`.

Model parts are data-only:

- boxes;
- slabs;
- cylinders;
- planes;
- cross planes;
- rails.

Materials are simple ids such as `concrete`, `rust_metal`, `wood`,
`plastic`, `cloth`, `glass_dim`, `emissive_lamp` and `emissive_screen`.

`src/render/mesh/primitives.ts` builds immutable mesh templates from this data.
`src/render/mesh/model_cache.ts` caches templates by model id and variant seed
under a bounded cache size. `VisualModelDef.parts` can also be a procedural generator 
function `(seed: number) => readonly VisualModelPart[]`. When paired with a defined
`variantCount` (e.g. `128`), the mesh cache deterministically bins the seed 
(`seed % variantCount`). This allows generating and caching hundreds of distinct procedural 
geometry variations of a single model ID (e.g. random meat chunks) for the GPU without 
per-frame CPU rebuilding or cache thrashing.

## Scene Collection

`src/render/mesh/scene_collect.ts` turns world facts into mesh instances.

Inputs:

- camera position and radius;
- context time and resolved render profile;
- `World.cells`;
- `World.features`;
- `World.visualSlots`;
- `World.containers`;
- optional static billboard entities through `EntityIndex`;
- profile include flags and caps.

Output:

```ts
interface MeshInstance {
  modelId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  seed: number;
  tint?: number;
  flags: number;
}
```

Collection is camera-oriented and bounded. It does not scan the whole world per
frame. Unknown visual slot codes are counted and skipped. Final instance
capping uses model priority plus a camera-cell-centered distance/seed order, not
the exact fractional camera position, so tiny forward/back movement inside one
cell does not reshuffle the visible mesh set. Local procedural mesh fields use
the same camera-cell center for radius checks and a deterministic radial-ring
coverage cap, so capped pipes, cables, surface scraps and similar generated
details keep coverage across the local radius instead of being selected from a
camera-fraction-dependent random edge.

### Draw Radius And View Cone

Collection runs out to `meshDrawRadius = min(fog reach, radius * 2)`, giving a
mode ladder of 8 / 16 / 31 cells. Two separate bounds meet there: there is no
point drawing past the fog, and doubling the radius quadruples the disc area,
which is exactly what view-cone culling gives back.

This used to be `max(radius, fog reach)`, and it went nowhere. Geometry was
collected at `profile.radius` while the shader received the fog-stretched value,
so the dissolve band sat at 28–31 cells where instances never existed. Measured
on five floors at seed 61061: the old collector scanned 805 cells — `pi * 16^2` —
on *every* floor regardless of the radius it advertised. Meshes ended at 16 cells
at full brightness while walls and sprites drew to `MAX_DRAW = 40`. That was the
"meshes appear out of nowhere" bubble.

Culling has three stages, and each exists for a reason:

1. **Near disc, never culled.** Inside `profile.radius` collection is byte-for-byte
   what it was. Merged runs re-anchor at the scope boundary and derive their model
   variant from the anchor cell, so a boundary sweeping across the near field would
   swap variants of runs that are on screen.
2. **Far annulus, cone-culled per cell.** `cellInScope` and the scan loop share one
   predicate — they must, or a cell would yield its run start to a neighbour the
   loop never visits.
3. **Instances, cone-culled after collection.** Dropping a finished instance is
   free of anchoring concerns, and this is where the money is: sort, vertex
   expansion and the full `bufferSubData` upload all sit downstream.

The margin is `MESH_CONE_MARGIN_CELLS = 2` for cells, plus half the instance's own
horizontal scale for instances, so a 14-cell merged run is not clipped by its
anchor point.

Measured effect of the cone alone (same radius, cone forced true vs live):
instances −49 % to −69 %, cells −43 % to −55 %, triangles −50 % to −71 %. It is
weaker than the theoretical 75 % by exactly the three deliberate exemptions: the
near disc, the margin, and procedural fields.

Net result at double the draw distance: instances +4.8 % (living) to −14.8 %
(maintenance), triangles +6 % to −15 %, vertex build flat, cell scan +39 % to
+80 %, collect CPU +47 % to +58 %. Nothing hits a cap on any floor — `instanceCap`
peaks at 434/512, `triangleCap` at 41 %, `visualSlotScanCap` at 0.4 %. Without
the cone the same radius would put hell at 93.5 % of `instanceCap` and 68 % of
frames hard against it, so the cone is not an optimization here — it is the thing
that makes the radius affordable.

Instance flags distinguish:

- visual-slot instances;
- feature-derived instances;
- container-derived instances;
- entity-derived instances;
- merged instances;
- wall-mounted instances;
- emissive instances.
- corridor-volume instances.
- procedural-field instances (local pipe network and floor scatter).

The procedural-field flag exists because those two sources are not collected per
cell: they pick candidates across the whole local disc and then select a stable
subset (`selectStableFieldCoverage`) that does not churn as the camera moves.
They are therefore exempt from view-cone culling — culling them would both
quarter their visible density and make the selection re-shuffle on every turn.

### Wall Anchoring

Wall-mounted detail usually lives in the wall cell. The collector resolves
exposed wall faces by neighboring passable cells and deterministic seed/slot
rules. It does not choose faces from current camera direction, so geometry does
not pop while turning.

Adjacent-floor-cell sources exist as fallback for old feature-like placement,
but preferred wall props belong in wall cells.

### Feature Mapping

Feature-derived meshes are generic fallback detail:

- `Feature.LAMP` -> `lamp_stand`;
- `Feature.CANDLE` -> `candle_stub`;
- `Feature.TABLE` -> `table_slab`;
- `Feature.CHAIR` -> `chair_simple`;
- `Feature.BED` -> `bed_frame`;
- `Feature.STOVE` -> `stove_block`;
- `Feature.SINK` -> `sink_basin`;
- `Feature.TOILET` -> `toilet_bowl`;
- `Feature.SHELF` -> `shelf_block`;
- `Feature.MACHINE` -> `machine_box`;
- `Feature.APPARATUS` -> `apparatus_cage`;
- `Feature.LIFT_BUTTON` -> `button_panel`;
- `Feature.DESK` -> `desk_slab`;
- `Feature.SCREEN` -> `wall_panel_screen`.

`Feature.SLIDE` is deliberately texture-only. Tutorial/briefing slide walls can
use animated or special wall textures without receiving duplicate 3D wall-panel
meshes.

This is render fallback only. The `E` action still belongs to
`systems/interactions.ts`, `systems/interactive.ts` and related runtime systems.

### Containers And Billboards

Visible `WorldContainer` entries can contribute crate/box/cabinet-like mesh
instances. High mode may include static entity/billboard-derived props when an
`EntityIndex` is available to the collector. Runtime gameplay ownership stays
with existing container/entity systems.

### Corridor Volume Dressing

Rectangular 2D corridors remain the structural truth, but mesh pass adds a
bounded procedural 3D envelope around them. This is not `visualSlots` placement
and not physical geometry. It is a generic collector path driven by the
generator/floor covering profile. It reads:

- `World.cells`;
- passable/wall-like neighbor topology;
- `roomMap` and `RoomType.CORRIDOR`;
- floor key, floor/theme/procedural tags and resolved visual geometry profile;
- camera radius and existing instance caps.

The collector identifies passable corridor/tunnel cells near wall-like
neighbors. Wall-mounted corridor models orient their local X axis along the
wall tangent and local Y as shallow depth into the passable cell, so generated
panels and ledges stay micro-local rather than filling a whole cell. The
selected covering module decides which shapes are eligible:

- `concrete`: side-wall relief slabs, ledges and low thresholds;
- `technical`: service wall panels, pipes, loose cables and ceiling runs;
- `collector`: gutter/channel floor pieces plus wall service detail and
  procedural-lane merged ceiling pipe/cable runs;
- `cave`: stone wall protrusions and stalactites;
- `meat`: elongated smooth organic wall folds, lower wall/floor folds,
  ceiling growths and organic ceiling light glands;
- `void`: sparse relief/cable silhouettes.

The design target is an infrastructural skin, not random protruding boxes. A
good corridor-volume pass should read like small connected environment systems:
pipe runs, conduit breaks, service panels, control buttons, screen plates, low
threshold bars and bar-relief concrete strips that follow walls, floors and
ceilings. The classic "pipes screensaver" idea is a topology/scale reference
only: coherent local networks along surfaces, not copied visuals and not
full-cell blocks.

Placement is deterministic from floor seed, room id and cell coordinates using
multi-scale value-noise gates plus small tangent jitter. It intentionally avoids
fixed `(x + y) % n` spacing and does not create a repeating square or striped
pattern along long corridors. Corridor-volume panels, ledges and floor
thresholds are micro-local details: wall relief sits as small plaques/strips
near wall edges, and thresholds are low narrow floor bars instead of cell-sized
blocks. They are not culled by camera proximity; near-plane clipping is handled
by the mesh shader so details do not pop in and out when the player approaches.
Collector ceiling pipes/cables use topology-derived ceiling-wall lanes. Long
collector runs are split into bounded touching spans on the same seeded
room/axis/strip lane, so they read as connected infrastructure instead of
center-cell sticks. Industrial visual-slot ceiling bundles are also placed as
short adjacent runs and resolved onto those lanes at render time, rather than
as isolated center-cell decorations. In addition, service/collector profiles
emit a render-only procedural ceiling pipe network around the camera. That
network is rebuilt from floor seed, covering id, local cell coordinates and a
small layered hash grid every collection pass; it is not stored in `World`,
save data or floor memory. It uses bounded local caps and does not sample
passability along each segment, so the "pipes screensaver" reference becomes
cheap ceiling atmosphere rather than new collision or generated cell content.
The same pattern is the intended path for surface packages: each package is a
small render-only local field selected once from context rather than a universal
noise layer. The shipped collector package adds floor tile shards, brick
fragments, rubble, paper, crumbs and short floor pipes from the same seed/cell
context. The shipped linoleum package adds simple green linoleum sheets/scraps
plus paper, newspapers and small crumbs when the camera cell, current room, or
immediate local floor material resolves to `F_LINO`. These packages are rebuilt
around the camera, capped by the shared field cap (`16/32/64`), and do not
perform per-candidate passability, feature, container or visual-slot checks.
They also do not write visual slots, save data, floor memory or collision.
Meat corridor coverage uses the same bounded
collector path but scales organic folds along wall/floor tangents and swaps
ordinary ceiling bulbs/panels to organic light glands when the resolved
corridor covering is `meat`; it does not use the voxel branch or large
passable-cell solids.
Concrete/service corridor-volume is limited to actual corridor rooms, narrow
passages and unmapped tight topology; it must not fill broad furnished rooms.
Cells that already carry semantic `Feature`, container or visual-slot content
are skipped by corridor-volume and optional ceiling detail so room props do not
receive duplicate structural overlays.

Feature meshes are fallback only. When generation has already derived a primary
visual slot from the same feature cell, the scene collector suppresses the old
feature fallback mesh. This prevents tables, desks, lamps, machines and similar
feature-backed props from drawing twice during the transition from 2D features
to visual slots.

This makes a rectangular corridor read as a tunnel, cave, collector trench,
technical service spine, gut passage or bar-relief concrete hallway without
changing `World.cells`, pathfinding, collision, save shape or generation
topology.

Profile fields:

- `includeCorridorVolumes`;
- `corridorVolumeDetail`;
- `organicVolumeDetail`;
- `corridorVolumeStyle`: broad render family, `concrete`, `service`,
  `organic` or `void`;
- `corridorCoveringId`: generator-facing module id, `concrete`, `technical`,
  `collector`, `cave`, `meat` or `void`.
- `proceduralFieldRadius` and `proceduralFieldInstanceCap`: shared budget for
  render-only local fields such as ceiling pipe networks and floor surface
  scatter. Mode values are fixed at radius `2/4/8` cells and cap `16/32/64`.

`resolveVisualGeometryProfile()` derives those values from current floor theme
tags. Maintenance/industrial/service floors choose technical detail unless a
more specific collector/sump/blackwater tag wins. Living-tunnel or mycelium
topology chooses cave dressing. Hell/meat/samosbor chooses meat dressing.
Procedural floors get a small route roughness bonus so seeded rectangular
layouts can still feel less planar.

This channel is the right place for "the corridor has 3D roughness" features.
Use `visualSlots` for authored semantic fixtures such as pipes, buttons,
panels, furniture hints and columns. Use `block.md` only when the roughness must
affect movement.

## Buffer Build

`src/render/mesh/buffers.ts` converts collected instances plus optional voxel
chunks into one interleaved vertex buffer.

Vertex stride:

```txt
position xyz + normal xyz + color rgb = 9 floats
```

The pass uses a preallocated dynamic buffer sized for
`MAX_GPU_TRIANGLES = 96000`. The effective cap is:

```ts
Math.min(MAX_GPU_TRIANGLES, profile.triangleCap)
```

If collected instances would exceed the cap, the builder truncates rather than
allocating unbounded geometry.

## Shaders

`src/render/mesh/shaders.ts` owns the mesh WebGL program.

Inputs:

- `aWorld`;
- `aNormal`;
- `aColor`.

Uniforms:

- camera position;
- direction and camera plane;
- pitch/height;
- resolution;
- inverse determinant;
- world size;
- max draw distance;
- fog color/density;
- ambient term;
- time;
- `uLight` baked lightmap sampler and `uLightOn` flag.

The shader projects world-space triangles into the same low-res render target as
the raycaster, and writes **exactly** the raycaster's depth. That equality is not
obvious from the source and is easy to destroy, so it is worth spelling out.

The raycaster writes `gl_FragDepth = 1 - 0.1/dist` directly in window space. The
mesh goes through the ordinary pipeline instead: `gl_Position = vec4(tx, clipY,
ty - 0.2, ty)`, so `z/w = 1 - 0.2/ty` in NDC, and the window depth is `(z/w+1)/2
= 1 - 0.1/ty`. The `0.2` is therefore **not a bias** — it is the factor two that
cancels the NDC-to-window halving. Both sides measure perpendicular distance, the
depth func is `LEQUAL`, and the mesh draws after the raycaster, so ties go to the
mesh via `polygonOffset(-1, -2)`.

Reading that `0.2` as a safety margin and shrinking it does the opposite of what
it looks like: it pushes the mesh *behind* the surface it stands on. Measured the
expensive way — `0.125` gives a window depth of `1 - 0.0625/ty`, which is farther
than floor, wall and ceiling at every distance by far more than any polygon
offset can recover, and the entire mesh layer disappears from the game while the
raycaster world still renders normally.

Fog is distance-based tinting on view-space depth, and it saturates at its own
`0.92` clamp, so fog alone never hides a mesh completely. Everything visible is
therefore dissolved by `edgeFade` over the last few cells before its own edge.

**The dissolve distance is a per-vertex attribute (`aFade`), not a uniform, and
that is the whole point.** The pass has two independent edges: cell slots end at
the collection radius (8/16/31 cells), while the procedural fields around the
camera end at `proceduralFieldRadius` (2/4/8) and do not follow fog at all. One
uniform could only ever describe one of them. It described the far one, so the
near one — floor scatter and ceiling runs, the densest layer and the one right in
front of the player — was cut hard with no dissolve whatsoever. Fog at 8 cells is
only `0.27`, so those objects appeared showing **73 %** of their colour; on
`medium` the edge is 4 cells and fog `0.075`, i.e. **92 %**. That is the pop-in
players actually reported, and fixing the far edge alone changed nothing they
could see.

Adding a third source with its own edge now costs one assignment in
`drawInstanceFromScene`. The vertex grew from 9 floats to 10 (36 → 40 bytes) to
carry it. A fade radius of zero or `NaN` would silently erase geometry —
`edgeFade` would be 1 everywhere — so `appendInstance` treats any non-positive
value as `MAX_DRAW`, meaning "do not dissolve"; `tests/mesh-buffers.test.ts`
locks both that guard and the per-vertex value.

Lighting shares the raycaster system: when `uLightOn` is set, the fragment shader
samples the same baked `world.light` lightmap by fragment world position
(`vWorldXY`), so a mesh in an unlit cell stays dark (grounded contact shading),
and a 4-tap light gradient gives lamp-relative directional self-shadowing (the
mesh side facing a lamp is lit, the far side falls into shadow). The scene
`ambient` and a soft near-player term match the raycaster, so meshes sit in the
same brightness as floors and walls. This is render-only baked/self-shadow, not
shadow-mapped cast shadows. `MeshPassContext` carries `ambient` and `lightTex`;
when no lightmap is bound the shader falls back to the legacy fixed-direction
shading.

## Voxel Branch

`src/render/mesh/voxel/` is implemented as a local high-mode detail layer.

Files:

- `types.ts`;
- `field.ts`;
- `greedy_mesh.ts`;
- `marching_cubes.ts`.

Current stable path:

1. `collectVoxelChunks()` samples camera-near chunks only.
2. `createVoxelField()` builds a tiny deterministic local voxel field from
   exposed wall cells only. Passable cells (`FLOOR`, `WATER`, `DOOR`) must not
   create voxel solids at floor level or ceiling level, even when they carry
   furniture, lamp/screen features, surface marks or pipe/cable/ceiling visual
   slots.
3. `buildGreedyVoxelMesh()` extracts exposed faces with a triangle cap.
4. The resulting chunk mesh is appended into the same mesh vertex batch.

Regression guard: camera-near voxel chunks are allowed to disappear by distance,
so they must never be used for whole-cell props in passable space. If a player
can stand in the cell, the mesh pass may draw only ordinary bounded model
instances there. Lamps, wall panels, wall cylinders, ceiling bulbs, ceiling light
panels, ceiling cables and furniture hints belong to `visualSlots` /
`Feature`-mapped model instances, not to voxel field solids. This prevents the
old bug where gray one-cell floor blocks or large ceiling slabs appeared when
approaching the cell and vanished when stepping away.

`marching_cubes.ts` exists as a disabled/future API surface, not the stable draw
path.

Voxel profile facts in high mode:

- chunk size comes from visual geometry profile, currently 8;
- field depth is 8 in high mode;
- voxel radius is capped separately from ordinary mesh radius;
- solid voxel cap is bounded;
- voxel triangle cap is a small slice of the full mesh triangle cap;
- only a few chunks are built per frame.

## Chunk Cache

`src/render/mesh/chunk_cache.ts` contains `MeshChunkCache`, a bounded chunk reuse
helper keyed by:

- `World` identity;
- floor key;
- seed;
- profile key;
- cell/surface/feature/visual-slot versions.

It can collect and reuse per-chunk mesh instances and has unit coverage. The
current `MeshPass` draw path still uses direct bounded scene collection each
update, then reports chunk-like counters from scanned cells. Wire the cache into
the pass only if profiling shows mesh collection cost needs it; do not add cache
complexity speculatively.

## Surface Material Profiles

`src/data/visual_surface_profiles.ts` is adjacent to mesh pass but feeds the
raycaster material shader, not triangle geometry.

It resolves theme/room/texture facts into:

- floor pattern code;
- wall band code;
- ceiling pattern code;
- trim code;
- grime;
- seam strength;
- light panel chance;
- vent chance;
- `surfaceMaterialsEnabled`;
- `protrudingDressing`.

This gives floors, walls and ceilings more material identity without turning
surfaces into gameplay collision.

## Stats And Debug

`MeshPassStats` exposes:

- enabled/skipped reason;
- instance count;
- visible instances;
- triangle count;
- submitted triangles;
- draw calls;
- chunks considered/built;
- visual slot bytes scanned;
- merged visual slot outputs;
- unknown visual slot codes;
- CPU update/buffer/upload timings.

`getMeshPassDebugStats()` in `render/webgl.ts` returns current stats for HUD/debug
surfaces. `src/render/mesh/debug.ts` formats them for inspection.

## Floor Memory And Save

The full `visualSlots` array is not serialized in visited-floor snapshots and is
not written to browser save.

Current policy:

- active `World` owns full `visualSlots`;
- floor memory RAM estimate counts it for hot live worlds;
- packed floor memory excludes it;
- save payload excludes it;
- generated/static visual details are recoverable from floor generation,
  features, containers, themes and seeds;
- future persistent visual damage should use sparse overrides, not full
  per-floor visual slot dumps.

No save shape bump is needed for current mesh pass.

## Relationship To Gameplay Blockers

Mesh pass is visual. It must stay separate from physical blockers.

If a table should stop the player, that belongs to the planned system in
[block.md](block.md):

- a gameplay collision field over `World.cells`;
- separate dirty versions;
- player/NPC movement hooks;
- optional local path avoidance;
- save/floor-memory policy.

Do not infer collision from `VisualModelDef.bounds` or `visualSlots`. Two models
can look bulky but remain decorative, and a future invisible gameplay blocker can
exist without a mesh. The source-of-truth must be explicit.

## Extension Rules

Adding new visual detail usually follows this order:

1. Add or reuse a `VisualModelDef` in `src/data/visual_models.ts`.
2. Add or reuse a `VisualCellDef` in `src/data/visual_cell_slots.ts`.
3. Fill `World.visualSlots` in generation through `src/gen/visual_cell_slots.ts`
   or an existing floor/object placement hook.
4. Let scene collection resolve context, wall face, merge and transform.
5. Add focused tests when a new registry rule, merge family, model part or cap is
   introduced.

Avoid:

- content-specific branches in `main.ts`;
- content-specific branches in `render/webgl.ts`;
- making `Feature` a visual enum dump;
- using Russian display names for mesh logic: choose by stable ids/tags such as
  `corridorCoveringId`, `RoomType`, texture ids or visual codes, not by room
  names like `коллектор`, `пещера` or other player-facing text;
- adding runtime dependencies;
- putting gameplay state in mesh caches;
- using `doubleSided: true` for flat floor decals (like `plane` primitives facing up); the mesh pass disables backface culling, so double-sided floor planes will generate two exactly coplanar quads that self-Z-fight and flicker chaotically along their diagonals. Use `doubleSided: false` for anything lying flat on the floor;
- making camera direction decide stable model placement;
- widening caps without browser smoke validation.

## Tests

Focused coverage exists in:

- `tests/visual-cell-slots.test.ts`;
- `tests/visual-geometry-profiles.test.ts`;
- `tests/visual-models.test.ts`;
- `tests/visual-surface-profiles.test.ts`;
- `tests/mesh-camera.test.ts`;
- `tests/mesh-buffers.test.ts`;
- `tests/mesh-pass-types.test.ts`;
- `tests/mesh-scene-collect.test.ts`;
- `tests/mesh-voxel.test.ts`;
- `tests/graphics-material-patterns.test.ts`.

For ordinary mesh/data additions, minimum validation is `npm run typecheck` and
prefer `npm run check:readonly`. For render pipeline, profile/cap, shader,
mobile or browser behavior changes, run `npm run check` and
`npm run check:browser`. Use explicit smoke modes when touching the pass:

```bash
SMOKE_VISUAL_GEOMETRY_MODE=off npm run smoke
SMOKE_VISUAL_GEOMETRY_MODE=high npm run smoke
SMOKE_MOBILE=1 SMOKE_VISUAL_GEOMETRY_MODE=low npm run smoke
```

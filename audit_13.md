# audit_13.md - Rendering, WebGL, Raycast, Textures, Mesh Pass

## Assignment

You are subagent 13. Audit WebGL/canvas rendering, raycasting, procedural textures, sprite drawing, material patterns, render-only mesh pass and graphics settings. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `graphics.md`
- `mesh.md`
- `taste.md`
- `optimization.md`

Then inspect focused code and tests:

- `src/render/webgl.ts`
- `src/render/textures.ts`
- `src/render/sprites.ts`
- `src/render/sprite_index.ts`
- `src/render/material_patterns.ts`
- `src/render/mesh/`
- render-related data under `src/data/visual_*`
- graphics/mesh tests under `tests/`

## Scope

Find concrete problems and improvements around:

- render code making gameplay decisions or owning gameplay state
- content-specific rendering in `webgl.ts` that should be generic hooks/data
- blank-canvas, clipping, sprite sorting, depth, lighting or readability risks
- texture/sprite generation duplication, hardcoded ids and stale atlas paths
- mesh pass caps, cache invalidation, geometry profile selection and material consistency
- always-on postprocess dirt that degrades baseline image instead of improving material/readability
- render-only visual bounds accidentally becoming collision or save data
- mobile/desktop scaling interactions that could make HUD or canvas unreadable
- missing browser/smoke/visual tests for risky render paths

Focus on implementable improvements tied to exact code.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Do not inspect `dist/` or screenshots unless citing an already-existing render artifact is essential.
- Every finding must cite file and line evidence.

## Output Template

Replace this section with the finished audit.

### Coverage

- Files and docs reviewed:
- Commands run:
- Areas not covered and why:

### Findings

For each finding use:

- `A13-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Render Hotspot Table

List suspicious draw paths, cache paths or data/render mismatches.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.

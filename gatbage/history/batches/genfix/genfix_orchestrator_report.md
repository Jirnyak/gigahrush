# genfix orchestrator report

Date: 2026-06-02

## Status

- `genfix_INDEX.md` is backed by 101 route plans: `genfix_001.md` through `genfix_101.md`.
- The full generated route for seed `61061` now renders end-to-end: 101 floors, manifest written, 101 PNG files and 102 JSON files in `tmp/floor-maps/genfix_all_after/`.
- The previous generation-matrix leftovers are fixed: Living HQ anchoring, service-smog density, Upper Bureau legal route cuts, Silicon Net Well route-zone retune, and Black Market 88 service-gut hostility.

## Integration fixes completed

- Territory HQ selection now prefers non-apartment cell-first anchors before authored fallback rooms, so Living/Wild control no longer hardens protected apartment cells.
- Generic HQ hardening preserves keyed locked doors, so authored route gates such as Upper Bureau permits stay meaningful.
- Upper Bureau seals all public-route cut rooms used by the forged, stolen-key, and staff branches.
- Design-floor post-territory retuning now reapplies Silicon Net Well route-zone ownership after cell-first territory initialization.
- Black Market 88 reapplies hostile ownership to service-gut monster pressure zones after territory metadata sync.
- Procedural/anomaly repairs cover service smog, fractal floor, mirror run, Conway life, apartment pressure, collector helpers, Voronoi quarantine, and sprite atlas invariants.

## Validation

- `npm run typecheck` passed.
- `npm run test:generation` passed: 1741 passed, 0 failed.
- Focused regression tests passed for Living genfix 051, Upper Bureau genfix 017, Raionsovet archive, Black Market 88, Silicon Net Well, service smog genfix 070, fractal floor, mirror run, and Conway life.
- Route render passed: `./node_modules/.bin/tsx scripts/render-procedural-floor-map.ts --seed 61061 --all --out-dir tmp/floor-maps/genfix_all_after`.

## Notes

- `npm run check` was not rerun after the full generation matrix; the narrower gates above are the checks used for this genfix completion pass.
- The worktree had substantial pre-existing dirty state; this report does not attempt to classify unrelated PR campaign, generated build, or other active changes.

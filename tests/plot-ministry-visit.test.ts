import test from 'node:test';
import assert from 'node:assert/strict';

import { PLOT_CHAIN } from '../src/data/plot';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { QuestType } from '../src/core/types';

// фаза-3 #149 (HARD BLOCKER). Main-quest step 11 (Major Grom → Ministry for ammo) was a QuestType.VISIT
// carrying ONLY `targetFloorZ`. generatePlotQuest builds a VISIT via exactly two constructors —
//   branch A (quests.ts:1549): targetRoomType !== undefined || targetRoom !== undefined
//   branch B (quests.ts:1568): visitFloorZ  !== undefined
// — so the step matched NEITHER, generatePlotQuest returned undefined, and the chain soft-locked at 11,
// permanently sealing steps 12–18 (Podad → Marfa → Heralds → Void → Creator climax). The fix mirrored the
// working sibling step 12: it added `visitFloorZ` (satisfies branch B) plus `targetRoute.designFloorId:'ministry'`
// (the positional-route completion path derives the real floor z=30 from DESIGN_FLOOR_ROUTES, since the
// sentinel visitFloorZ is not consumed there). These lock the shape at the data level so a revert goes red.

// Mirrors generatePlotQuest's VISIT constructors verbatim (quests.ts:1549 branch A, :1568 branch B).
// `targetRoom` is read via `as any` in the constructor and is never set on PLOT_CHAIN literals, but we
// keep it in the predicate so the test tracks the constructor exactly rather than a paraphrase of it.
function visitStepIsConstructable(step: (typeof PLOT_CHAIN)[number]): boolean {
  const s = step as { targetRoomType?: number; targetRoom?: unknown; visitFloorZ?: number };
  return s.targetRoomType !== undefined || s.targetRoom !== undefined || s.visitFloorZ !== undefined;
}

test('#149 the Grom→Ministry VISIT step is constructable and route-resolvable', () => {
  const ministryVisits = PLOT_CHAIN.filter(s => s.type === QuestType.VISIT && s.targetRoute?.designFloorId === 'ministry');
  // Pre-fix this step carried no targetRoute at all → 0 matches. The fix restored it.
  assert.ok(ministryVisits.length >= 1, 'the Grom→Ministry ammo VISIT step (#149) must exist with its route target');

  const routeIds = new Set(DESIGN_FLOOR_ROUTES.map(r => r.id));
  for (const step of ministryVisits) {
    // The exact #149 regression-catcher: only targetFloorZ ⇒ matches neither constructor ⇒ soft-lock.
    assert.ok(visitStepIsConstructable(step), 'the ministry VISIT step must satisfy a generatePlotQuest VISIT constructor (branch A or B)');
    assert.ok(
      routeIds.has(step.targetRoute!.designFloorId!),
      'its designFloorId must resolve in DESIGN_FLOOR_ROUTES so the completion path can derive the floor z',
    );
  }
});

test('#149 every main-quest VISIT step is constructable and any route target resolves', () => {
  // Guards the whole chain (siblings 12–18 and any future VISIT step) against re-introducing the
  // targetFloorZ-only unconstructable shape that soft-locked the main quest.
  const routeIds = new Set(DESIGN_FLOOR_ROUTES.map(r => r.id));
  const visitSteps = PLOT_CHAIN.map((s, i) => ({ s, i })).filter(({ s }) => s.type === QuestType.VISIT);
  assert.ok(visitSteps.length >= 1, 'the main quest has VISIT steps to guard');

  for (const { s, i } of visitSteps) {
    assert.ok(
      visitStepIsConstructable(s),
      `PLOT_CHAIN[${i}] VISIT is unconstructable — lacks targetRoomType/targetRoom/visitFloorZ (the #149 soft-lock shape)`,
    );
    const designFloorId = s.targetRoute?.designFloorId;
    if (designFloorId !== undefined) {
      assert.ok(routeIds.has(designFloorId), `PLOT_CHAIN[${i}] targetRoute.designFloorId="${designFloorId}" must resolve in DESIGN_FLOOR_ROUTES`);
    }
  }
});

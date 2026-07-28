import test from 'node:test';
import assert from 'node:assert/strict';

import { _overrideRng, _restoreRng } from '../src/core/rand';
import { getSamosborAftermathBeats, getSamosborVariantWeight } from '../src/data/samosbor_variants';
import {
  chooseSamosborVariant,
  clearActiveSamosborVariant,
  forceNextSamosborVariant,
} from '../src/systems/samosbor_variants_runtime';

// WRONG-FIELD scope class (фаза-3 #61 + #67). Both samosbor selectors historically gated on
// `def.tags` — but for the KIND-label variants (classic/maronary/istotit/veretar) and for every
// aftermath beat, `tags` are self-referential/flavor labels that never appear in a floor's
// themeTags. So the gate matched nothing and the content was dead exactly where it was authored.
// The fix scopes by the theme-token field (`def.floors`), falling back to `tags` only for the
// theme-token-tagged variants (wet/electric/meat). These lock the polarity so it cannot silently
// regress; each positive assertion fails on the pre-fix `.tags` predicate.

test('#61 samosbor variant weight gates by theme-token floor scope (.floors), not KIND-label tags', () => {
  // Reachable where scoped — pre-fix these returned 0 on EVERY floor (KIND-label tags never
  // intersect floorTags), so >0 is the regression-catcher. veretar/maronary declare floors=ALL_FLOORS.
  assert.ok(getSamosborVariantWeight('veretar', ['void']) > 0, 'veretar is reachable on void');
  assert.ok(getSamosborVariantWeight('maronary', ['void']) > 0, 'maronary is reachable on void');
  assert.ok(getSamosborVariantWeight('istotit', ['ministry']) > 0, 'istotit is reachable on its civil scope');

  // The gate is a REAL gate, not blanket-open: istotit declares floors=CIVIL_FLOORS (∌ void),
  // so it must stay weightless on void. Proves the >0 assertions above mean "scoped", not "always on".
  assert.equal(getSamosborVariantWeight('istotit', ['void']), 0, 'istotit stays gated out off its scope');
});

test('#61 forced samosbor variant honours its theme-token scope in the runtime mirror', () => {
  // chooseSamosborVariant's forced-pick branch mirrors floorWeight's scope gate. Pre-fix it validated
  // the forced variant against KIND-label tags, so debug-forcing veretar/maronary/istotit/classic
  // always failed and silently fell through to the weighted roll. With rng pinned to 0 that fallthrough
  // deterministically selects SAMOSBOR_VARIANTS[0] (classic), so a returned 'veretar' proves the forced
  // branch was honoured (a pre-fix mirror would return 'classic').
  _overrideRng(() => 0);
  try {
    clearActiveSamosborVariant();
    assert.equal(forceNextSamosborVariant('veretar'), true);
    const chosen = chooseSamosborVariant(['void'], 0);
    assert.equal(chosen.def.id, 'veretar', 'the forced in-scope variant is honoured, not dropped to the weighted roll');
  } finally {
    _restoreRng();
    clearActiveSamosborVariant();
  }
});

test('#67 samosbor aftermath beats gate by theme-token floor scope (.floors), not flavor tags', () => {
  // aftermath_fog_residue: variants=['classic','wet','meat'], floors=CIVIL_AND_SERVICE_FLOORS
  // (incl. ministry, NOT void), tags=['fog','route'] (flavor). Pre-fix the filter used def.tags, which
  // never intersect a floor's themeTags, so the beat was dead even on its own scoped floor.
  const onMinistry = getSamosborAftermathBeats('classic', ['ministry']);
  assert.ok(onMinistry.some(b => b.id === 'aftermath_fog_residue'), 'beat fires on its scoped (ministry) floor');

  // Real scope gate — absent off-scope (floors ∌ void):
  const onVoid = getSamosborAftermathBeats('classic', ['void']);
  assert.equal(onVoid.some(b => b.id === 'aftermath_fog_residue'), false, 'beat is gated out off its floor scope');

  // The variant half of the AND still matters — electric is not in this beat's variant list:
  const wrongVariant = getSamosborAftermathBeats('electric', ['ministry']);
  assert.equal(wrongVariant.some(b => b.id === 'aftermath_fog_residue'), false, 'beat respects its variant list');
});

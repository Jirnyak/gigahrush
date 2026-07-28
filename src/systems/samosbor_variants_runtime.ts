import { rng } from '../core/rand';
import {
  SAMOSBOR_VARIANTS,
  buildActiveSamosborVariant,
  getSamosborVariantWeight,
  type ActiveSamosborVariant,
  type SamosborVariantId,
} from '../data/samosbor_variants';

let activeVariant: ActiveSamosborVariant | null = null;
let forcedNextVariant: SamosborVariantId | null = null;
let lastVariant: SamosborVariantId | null = null;

export function chooseSamosborVariant(floorTags: readonly string[], _zNum: number): ActiveSamosborVariant {
  if (forcedNextVariant) {
    const forced = SAMOSBOR_VARIANTS.find(v => v.id === forcedNextVariant);
    forcedNextVariant = null;
    // #61: mirror floorWeight's scope gate — validate the forced variant against
    // its theme-token scope (floors ?? tags), not the KIND-label tags. Otherwise
    // debug-forcing maronary/istotit/veretar/classic always failed the tags gate
    // and silently fell through to the weighted roll.
    const forcedScope = forced ? (forced.floors ?? forced.tags) : undefined;
    if (forced && forcedScope && forcedScope.some(t => floorTags.includes(t))) {
      activeVariant = buildActiveSamosborVariant(forced);
      lastVariant = activeVariant.def.id;
      return activeVariant;
    }
  }



  let total = 0;
  for (const def of SAMOSBOR_VARIANTS) total += getSamosborVariantWeight(def.id, floorTags);
  let roll = rng() * Math.max(1, total);
  for (const def of SAMOSBOR_VARIANTS) {
    roll -= getSamosborVariantWeight(def.id, floorTags);
    if (roll <= 0) {
      activeVariant = buildActiveSamosborVariant(def);
      lastVariant = activeVariant.def.id;
      return activeVariant;
    }
  }

  activeVariant = buildActiveSamosborVariant(SAMOSBOR_VARIANTS[0]);
  lastVariant = activeVariant.def.id;
  return activeVariant;
}

export function getActiveSamosborVariant(): ActiveSamosborVariant | null {
  return activeVariant;
}

export function clearActiveSamosborVariant(): void {
  activeVariant = null;
}

export function forceNextSamosborVariant(id: SamosborVariantId): boolean {
  if (!SAMOSBOR_VARIANTS.some(v => v.id === id)) return false;
  forcedNextVariant = id;
  return true;
}

export function cycleForcedSamosborVariant(): SamosborVariantId {
  const ids = SAMOSBOR_VARIANTS.map(v => v.id);
  const currentIdx = forcedNextVariant ? ids.indexOf(forcedNextVariant) : -1;
  const next = ids[(currentIdx + 1) % ids.length];
  forcedNextVariant = next;
  return next;
}

export function getForcedSamosborVariant(): SamosborVariantId | null {
  return forcedNextVariant;
}

export function getLastSamosborVariant(): SamosborVariantId | null {
  return lastVariant;
}

export function setActiveSamosborVariantForTests(variant: any): void {
  activeVariant = variant;
}

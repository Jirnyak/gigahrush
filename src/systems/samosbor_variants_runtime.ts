import { rng } from '../core/rand';
import { isSmokeDebugRun, stabilizeSmokeRecovery } from './debug_smoke';
import { msg } from '../core/types';
import {
  SAMOSBOR_VARIANTS,
  buildActiveSamosborVariant,
  getSamosborVariantWeight,
  type ActiveSamosborVariant,
  type SamosborVariantId,
} from '../data/samosbor_variants';
import { registerDebugCommand } from './debug_registry';

let activeVariant: ActiveSamosborVariant | null = null;
let forcedNextVariant: SamosborVariantId | null = null;
let lastVariant: SamosborVariantId | null = null;

export function chooseSamosborVariant(floorTags: readonly string[], z: number): ActiveSamosborVariant {
  if (forcedNextVariant) {
    const forced = SAMOSBOR_VARIANTS.find(v => v.id === forcedNextVariant);
    forcedNextVariant = null;
    // #61: mirror floorWeight's scope gate — validate the forced variant against
    // its floor scope (numeric-z floors, or theme-token tags for wet/electric/
    // meat), not the KIND-label tags. Otherwise debug-forcing maronary/istotit/
    // veretar/classic always failed the tags gate and silently fell through.
    const inForcedScope = forced
      ? (forced.floors ? forced.floors.includes(z) : forced.tags.some(t => floorTags.includes(t)))
      : false;
    if (forced && inForcedScope) {
      activeVariant = buildActiveSamosborVariant(forced);
      lastVariant = activeVariant.def.id;
      return activeVariant;
    }
  }



  let total = 0;
  for (const def of SAMOSBOR_VARIANTS) total += getSamosborVariantWeight(def.id, z, floorTags);
  let roll = rng() * Math.max(1, total);
  for (const def of SAMOSBOR_VARIANTS) {
    roll -= getSamosborVariantWeight(def.id, z, floorTags);
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

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* Cycle forced samosbor variant + start (full scale = global fronts) */
  id: 'cycle_samosbor_variant',
  group: 'samosbor',
  label: 'Цикл варианта + самосбор',
  run: ({ state }) => {
    const variantId = cycleForcedSamosborVariant();
    state.samosborTimer = 0;
    state.msgs.push(msg(`[DEBUG] Следующий самосбор: ${variantId} (глобальный)`, state.time, '#ff0'));
  },
});

registerDebugCommand({
  /* Force Veretar variant + start (full scale) */
  id: 'rare_samosbor',
  group: 'samosbor',
  label: 'ВЕРЕТАР: force + самосбор',
  run: ({ world, player, entities, state }) => {
    forceNextSamosborVariant('veretar');
    if (!state.samosborActive) state.samosborTimer = 0;
    if (isSmokeDebugRun()) stabilizeSmokeRecovery(world, player, entities);
    state.msgs.push(msg(
      state.samosborActive
        ? '[DEBUG] Следующий самосбор: Веретар (глобальный) после текущего'
        : '[DEBUG] Следующий самосбор: Веретар (глобальный)',
      state.time,
      '#f4f1df',
    ));
  },
});

registerDebugCommand({
  /* Force Maronary variant + start (full scale) */
  id: 'force_maronary_samosbor',
  group: 'samosbor',
  label: 'МАРОНАРИЙ: force + самосбор',
  run: ({ state }) => {
    forceNextSamosborVariant('maronary');
    state.samosborTimer = 0;
    state.msgs.push(msg('[DEBUG] Следующий самосбор: Маронарий (глобальный)', state.time, '#35ff66'));
  },
});

registerDebugCommand({
  /* Force Istotit variant + start (full scale) */
  id: 'force_istotit_samosbor',
  group: 'samosbor',
  label: 'ИСТОТИТ: force + самосбор',
  run: ({ state }) => {
    forceNextSamosborVariant('istotit');
    state.samosborTimer = 0;
    state.msgs.push(msg('[DEBUG] Следующий самосбор: Истотит (глобальный)', state.time, '#d6a64b'));
  },
});

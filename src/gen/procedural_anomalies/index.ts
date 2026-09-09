import type { ProceduralAnomalyGenContext } from './common';
import { FLOOR_ANOMALIES, type FloorAnomalyId } from '../../data/procedural_floors';
import { applyCementMemory } from './cement_memory';
import { applyConveyorSorter } from './conveyor_sorter';
import { applyConwayLife } from './conway_life';
import { applyFractalFloor } from './fractal_floor';
import { applyLivingTunnels } from './living_tunnels';
import { applyMirrorRun } from './mirror_run';
import { applyRadioChess } from './radio_chess';
import { applySamosborSeed } from './samosbor_seed';
import { applySandpilePerekrytie } from './sandpile_perekrytie';
import { applySectionShift } from './section_shift';
import { applyTeleportCells } from './teleport_cells';
import { applyWallSnake } from './wall_snake';
import { applyZombieApocalypse } from './zombie_apocalypse';

type ProceduralAnomalyGenerator = (ctx: ProceduralAnomalyGenContext) => void;
type ProceduralAnomalyGenerationMode = 'none' | 'inline' | 'module';

/* ── Фаза конвейера ──────────────────────────────────────────────
 *
 * У реестра была ОДНА точка вызова, а inline-аномалии стояли в разных местах
 * постройки этажа, и место было для них условием, а не оформлением: телепорты
 * обязаны ставиться ПОСЛЕ маршрутных шахт, иначе их проверка просвета не видит
 * шахты, которой ещё нет, и выход встаёт на стволе лифта.
 *
 * Поэтому аномалия объявляет СВОЮ фазу, а этаж зовёт реестр в каждой. Порядок
 * между аномалиями значения не имеет — на этаже действует ровно одна.
 */
export type ProceduralAnomalyGenPhase = 'dressing' | 'after_lifts';

interface ProceduralAnomalyGenerationRegistration {
  mode: ProceduralAnomalyGenerationMode;
  apply?: ProceduralAnomalyGenerator;
  /** Без объявления — `dressing`, то есть общая фаза убранства этажа. */
  phase?: ProceduralAnomalyGenPhase;
}

const PROCEDURAL_ANOMALY_GENERATION_REGISTRY: Record<FloorAnomalyId, ProceduralAnomalyGenerationRegistration> = {
  none: { mode: 'none' },
  smog: { mode: 'inline' },
  teleport_cells: { mode: 'module', apply: applyTeleportCells, phase: 'after_lifts' },
  mushroom_mycelium: { mode: 'inline' },
  hladon: { mode: 'inline' },
  false_safe_block: { mode: 'inline' },
  mirror_run: { mode: 'module', apply: applyMirrorRun },
  radio_chess: { mode: 'module', apply: applyRadioChess },
  conveyor_sorter: { mode: 'module', apply: applyConveyorSorter },
  fractal_floor: { mode: 'module', apply: applyFractalFloor },
  cement_memory: { mode: 'module', apply: applyCementMemory },
  wall_snake: { mode: 'module', apply: applyWallSnake },
  living_tunnels: { mode: 'module', apply: applyLivingTunnels },
  rail_trains: { mode: 'inline' },
  zombie_apocalypse: { mode: 'module', apply: applyZombieApocalypse },
  sandpile_perekrytie: { mode: 'module', apply: applySandpilePerekrytie },
  section_shift: { mode: 'module', apply: applySectionShift },
  conway_life: { mode: 'module', apply: applyConwayLife },
  samosbor_seed: { mode: 'module', apply: applySamosborSeed },
};

export function applyProceduralAnomalyProfile(
  ctx: ProceduralAnomalyGenContext,
  phase: ProceduralAnomalyGenPhase = 'dressing',
): void {
  const registration = PROCEDURAL_ANOMALY_GENERATION_REGISTRY[ctx.spec.anomalyId];
  if (!registration?.apply) return;
  if ((registration.phase ?? 'dressing') !== phase) return;
  registration.apply(ctx);
}

export function validateProceduralAnomalyGenerationRegistry(): void {
  for (const def of FLOOR_ANOMALIES) {
    const registration = PROCEDURAL_ANOMALY_GENERATION_REGISTRY[def.id];
    if (!registration) throw new Error(`Missing procedural anomaly generation registration: ${def.id}`);
    if (registration.mode === 'module' && !registration.apply) {
      throw new Error(`Procedural anomaly "${def.id}" declares module generation without an apply function`);
    }
    if (registration.mode !== 'module' && registration.apply) {
      throw new Error(`Procedural anomaly "${def.id}" declares ${registration.mode} generation with a module apply function`);
    }
  }
}

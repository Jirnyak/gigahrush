/* Освещённость маршрутных этажей: сколько проходимых клеток реально видит свет.
 *
 * Замер, а не мнение. Свет в мире берётся ТОЛЬКО из фич LAMP/CANDLE через
 * `World.bakeLights()` — значит этаж без систематического прохода расстановки
 * выходит чёрным, сколько бы декоративных ламп автор ни поставил руками.
 *
 *   npx tsx scripts/light_audit.ts            — все дизайн-этажи, по возрастанию
 *   npx tsx scripts/light_audit.ts slime_nii  — один этаж (или несколько через пробел)
 *
 * Колонка `lit%` — доля клеток с освещённостью выше 0.05; это тот порог, ниже
 * которого игрок видит только ambient 0.12 и собственный `eyeLight`.
 */

import '../src/content';
import { DESIGN_FLOOR_ROUTES, type DesignFloorId } from '../src/data/design_floors';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { Cell, Feature } from '../src/core/types';

const LIT_THRESHOLD = 0.05;
const SEED = 61061;

const argv = process.argv.slice(2);
const ids: DesignFloorId[] = argv.length > 0
  ? argv as DesignFloorId[]
  : DESIGN_FLOOR_ROUTES.map(def => def.id);

interface Row { id: string; open: number; lamps: number; candles: number; lit: number; mean: number }

const rows: Row[] = [];
for (const id of ids) {
  let world;
  try {
    world = generateDesignFloor(id, SEED).world;
  } catch (e) {
    console.log(`${id}\tFAIL ${(e as Error).message.slice(0, 120)}`);
    continue;
  }
  let open = 0, lamps = 0, candles = 0, lit = 0, sum = 0;
  for (let i = 0; i < world.cells.length; i++) {
    if (world.features[i] === Feature.LAMP) lamps++;
    else if (world.features[i] === Feature.CANDLE) candles++;
    const c = world.cells[i];
    if (c !== Cell.FLOOR && c !== Cell.WATER && c !== Cell.DOOR) continue;
    open++;
    sum += world.light[i];
    if (world.light[i] > LIT_THRESHOLD) lit++;
  }
  rows.push({ id, open, lamps, candles, lit, mean: sum / Math.max(1, open) });
}

rows.sort((a, b) => a.lit / Math.max(1, a.open) - b.lit / Math.max(1, b.open));
console.log('floor\topen\tlamps\tcandles\tlit%\tmean');
for (const r of rows) {
  console.log(`${r.id}\t${r.open}\t${r.lamps}\t${r.candles}\t${(100 * r.lit / Math.max(1, r.open)).toFixed(1)}\t${r.mean.toFixed(3)}`);
}

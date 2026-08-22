import { World } from '../core/world';
import { FieldChannel, fieldVersion, markFieldCell } from './fields/channels';
import { updatePerceptionFields } from './fields';

/**
 * Кровь и смерть — канал `FieldChannel.DANGER` слоя полей восприятия.
 *
 * Движок живёт в `systems/fields`: он многоканальный, изотропный и общий на все
 * поля. Здесь остались только специфичные для крови запросы и совместимые имена,
 * которыми пользуется остальная игра. `world.dangerField` — по-прежнему живой
 * массив, это представление нулевой плоскости `world.perceptionFields`.
 */

/** Импульс поля на месте смерти. Шкалу держит поле, а не тот, кто льёт кровь:
 *  по ней же падальщик отличает место смерти от царапины. */
export const DANGER_FIELD_DEATH_IMPULSE = 50;

export function dangerFieldVersion(): number {
  return fieldVersion(FieldChannel.DANGER);
}

/** Writers of `world.dangerField` must report the touched cell: the update below
 *  only scans the active bounding box, and an empty field collapses that box to
 *  an empty range. Without this the first idle tick would freeze the box and no
 *  later impulse would ever decay or diffuse. */
export function markDangerFieldCell(world: World, cx: number, cy: number): void {
  markFieldCell(world, FieldChannel.DANGER, cx, cy);
}

/**
 * Точка вызова из игрового цикла. Имя и сигнатура сохранены ради `main.ts`, но
 * такт теперь общий: за один вызов обновляются ВСЕ каналы восприятия, не только
 * кровь.
 */
export function updateDangerField(world: World, dt: number): void {
  updatePerceptionFields(world, dt);
}

/**
 * Ближайшая клетка, где кровь ещё пахнет сильнее порога. Падальщик идёт на
 * МЕСТО смерти, а не на тело: место помечено полем и остаётся помеченным, даже
 * когда от тела уже ничего не осталось.
 *
 * Окно фиксировано радиусом и обходится по клеткам тора — списки сущностей
 * здесь не при чём.
 */
export function findBloodTrailCell(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  minValue: number,
): { x: number; y: number } | null {
  const r = Math.ceil(radius);
  let best: { x: number; y: number } | null = null;
  let bestD2 = radius * radius;
  const cxInt = Math.floor(cx);
  const cyInt = Math.floor(cy);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 >= bestD2) continue;
      const x = world.wrap(cxInt + dx);
      const y = world.wrap(cyInt + dy);
      if (world.dangerField[world.idx(x, y)] < minValue) continue;
      best = { x, y };
      bestD2 = d2;
    }
  }
  return best;
}

/** Съеденная падаль больше не пахнет: поле на клетке гасится начисто. */
export function clearBloodTrailCell(world: World, cx: number, cy: number): void {
  const x = world.wrap(Math.floor(cx));
  const y = world.wrap(Math.floor(cy));
  if (world.dangerField[world.idx(x, y)] === 0) return;
  world.dangerField[world.idx(x, y)] = 0;
  markDangerFieldCell(world, x, y);
}

/* ── Дикий мертвяк: не умеет тормозить ────────────────────────────
 *
 * Одно правило: увидев цель, он разгоняется по ПРЯМОЙ и больше не правит курс.
 * Направление фиксируется в момент старта — дальше он едет туда, куда встал,
 * а не туда, куда ты ушёл. Врезался в бетон — оглушён и стоит открытым.
 *
 * Динамика из этого растёт вся: угол, косяк и колонна становятся оружием, а
 * прямой коридор — его territory. Убегать от него по прямой — худшее решение;
 * шаг вбок в последний момент — лучшее.
 *
 * Раньше он «продавливал толпу»: копил заряд от плотности соседей, толкал всех
 * в радиусе и ронял их в панику. Три поля в ядре, а игрок видел только, что его
 * иногда сбивает с ног непонятно за что.
 */

import { AIGoal, type Entity, type GameState, type Msg, msg } from '../../core/types';
import { World } from '../../core/world';
import { monsterHasAIFlag } from '../../entities/monster';
import { actorOccupyRadius, canActorOccupy } from '../movement_collision';
import { speciesState } from './species_state';

/** Разгон и потолок скорости в долях его обычного хода. */
const RUSH_ACCEL = 2.4;
const RUSH_MAX_MULT = 2.6;
/** Сколько он лежит после удара о бетон. Окно на выстрел в упор. */
const RUSH_CRASH_STUN_SEC = 1.6;
/** Ближе этого разгоняться не по чему — он уже бьёт. */
const RUSH_MIN_DIST_SQ = 1.4 * 1.4;

interface RushState {
  dx: number;
  dy: number;
  speed: number;
}
const rushState = speciesState<RushState>(() => ({ dx: 0, dy: 0, speed: 0 }));

/** Идёт ли он сейчас в разгоне: путь для отладки и тестов. */
export function peekDikiyRushSpeed(e: Entity): number {
  return rushState.peek(e)?.speed ?? 0;
}

export function updateDikiyRush(
  world: World,
  e: Entity,
  target: Entity | null,
  dt: number,
  time: number,
  msgs: Msg[],
  _state?: GameState,
): boolean {
  if (!monsterHasAIFlag(e, 'noBrakes') || !e.ai || dt <= 0) return false;
  const ai = e.ai;
  const rush = rushState.of(e);

  if ((ai.staggerTimer ?? 0) > 0) {
    // Убыль стаггера — одна на всех, в общем такте `updateMonster`. Своя вторая
    // здесь давала двойное вычитание за кадр: этот вид отходил от боли вдвое
    // быстрее любого другого, и гейт такого не ловит — это тайминг, не тип.
    rush.speed = 0;
    return true;
  }

  if (!target?.alive) {
    rush.speed = 0;
    return false;
  }

  const d2 = world.dist2(e.x, e.y, target.x, target.y);
  if (d2 <= RUSH_MIN_DIST_SQ) {
    rush.speed = 0;
    return false;
  }

  if (rush.speed <= 0) {
    // Курс берётся ОДИН раз. В этом весь вид: он едет туда, где цель была.
    const dx = world.delta(e.x, target.x);
    const dy = world.delta(e.y, target.y);
    const len = Math.max(0.001, Math.hypot(dx, dy));
    rush.dx = dx / len;
    rush.dy = dy / len;
    rush.speed = e.speed;
    ai.goal = AIGoal.HUNT;
    ai.path.length = 0;
    ai.pi = 0;
  }

  rush.speed = Math.min(e.speed * RUSH_MAX_MULT, rush.speed + e.speed * RUSH_ACCEL * dt);
  const step = rush.speed * dt;
  const nx = world.wrap(e.x + rush.dx * step);
  const ny = world.wrap(e.y + rush.dy * step);
  const radius = actorOccupyRadius(e);

  if (!canActorOccupy(world, nx, ny, radius)) {
    // Тормозить он не умеет — значит платит бетоном по лбу.
    ai.staggerTimer = Math.max(ai.staggerTimer ?? 0, RUSH_CRASH_STUN_SEC);
    ai.combatTargetId = undefined;
    e.attackCd = Math.max(e.attackCd ?? 0, RUSH_CRASH_STUN_SEC);
    rush.speed = 0;
    msgs.push(msg('Дикий мертвяк влетел в бетон и осел. Сейчас он открыт.', time, '#f87'));
    return true;
  }

  e.x = nx;
  e.y = ny;
  e.angle = Math.atan2(rush.dy, rush.dx);
  return true;
}

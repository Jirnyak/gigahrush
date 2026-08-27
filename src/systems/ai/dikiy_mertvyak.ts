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
 *
 * Разгон, курс и столкновение — общие для всей семьи рывков (`ai/dash.ts`);
 * здесь остались только его числа в дефе вида и его собственная развязка.
 */

import { AIGoal, type Entity, type GameState, type Msg, msg } from '../../core/types';
import { World } from '../../core/world';
import { monsterDash, monsterHasAIFlag } from '../../entities/monster';
import { DashRunOutcome, advanceDashRun, dashRunSpeed, endDashRun, startDashRun } from './dash';

/** Идёт ли он сейчас в разгоне: путь для отладки и тестов. */
export function peekDikiyRushSpeed(e: Entity): number {
  return dashRunSpeed(e);
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
  const dash = monsterDash(e.monsterKind);
  if (!dash) return false;
  const ai = e.ai;

  if ((ai.staggerTimer ?? 0) > 0) {
    // Убыль стаггера — одна на всех, в общем такте `updateMonster`. Своя вторая
    // здесь давала двойное вычитание за кадр: этот вид отходил от боли вдвое
    // быстрее любого другого, и гейт такого не ловит — это тайминг, не тип.
    endDashRun(e);
    return true;
  }

  if (!target?.alive) {
    endDashRun(e);
    return false;
  }

  // Ближе радиуса попадания разгоняться не по чему — он уже бьёт обычным боем.
  const hit = dash.hitRange ?? 0;
  if (world.dist2(e.x, e.y, target.x, target.y) <= hit * hit) {
    endDashRun(e);
    return false;
  }

  if (dashRunSpeed(e) <= 0) {
    // Курс берётся ОДИН раз. В этом весь вид: он едет туда, где цель была.
    const dx = world.delta(e.x, target.x);
    const dy = world.delta(e.y, target.y);
    const len = Math.max(0.001, Math.hypot(dx, dy));
    startDashRun(e, dx / len, dy / len, dash);
    ai.goal = AIGoal.HUNT;
    ai.path.length = 0;
    ai.pi = 0;
  }

  if (advanceDashRun(world, e, target, dt, dash) === DashRunOutcome.CRASHED) {
    // Тормозить он не умеет — значит платит бетоном по лбу.
    const stun = dash.crashStunSec ?? 0;
    ai.staggerTimer = Math.max(ai.staggerTimer ?? 0, stun);
    ai.combatTargetId = undefined;
    e.attackCd = Math.max(e.attackCd ?? 0, stun);
    msgs.push(msg('Дикий мертвяк влетел в бетон и осел. Сейчас он открыт.', time, '#f87'));
  }
  return true;
}

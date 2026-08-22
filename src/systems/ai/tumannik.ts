/* ── Туманник: виден только в тот миг, когда бьёт ─────────────────
 *
 * Одно правило: его нет на экране. Он проявляется на своём настоящем месте,
 * когда наносит удар, и гаснет, как только отойдёт от замаха.
 *
 * Динамика из этого растёт вся: единственный способ получить цель — принять
 * удар. Ты не ищешь его, ты решаешь, готов ли заплатить за выстрел. Чем
 * тяжелее его замах, тем дольше окно — так вид сам себя балансирует.
 *
 * Раньше он носил ложный силуэт в шести полях ядра, читался напрямую из
 * `render/webgl.ts` и требовал тумана вокруг, света, огня и трёх отдельных
 * условий развала обмана. Игрок из всего этого видел смещённую фигуру и не
 * понимал, почему.
 */

import { type Entity } from '../../core/types';
import { World } from '../../core/world';
import { MONSTERS, monsterHasAIFlag } from '../../entities/monster';

/** Потолок окна: дольше секунды он открытым не стоит ни при каком замахе. */
const TUMANNIK_REVEAL_MAX_SEC = 0.85;
/** Доля отката, на которой он ещё проявлен. Тяжёлый замах — длиннее окно. */
const TUMANNIK_REVEAL_SHARE = 0.55;
/* Вне удара его выдаёт только свет, и то наполовину: в полной темноте его нет
 * совсем, под яркой лампой он читается как стекло. Запечённое поле света уже
 * посчитано за нас — одно чтение клетки на кадр. */
const TUMANNIK_LIT_ALPHA_MAX = 0.5;

/**
 * Проявленность туманника. Считается от его же отката атаки: сразу после
 * удара откат полон, и пока он не сошёл на ширину окна, тело видно.
 * Отдельного таймера для этого не нужно — удар уже оставил след во времени.
 */
export function updateTumannikReveal(world: World, e: Entity): void {
  if (!monsterHasAIFlag(e, 'strikeReveal')) return;
  const attackRate = (e.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.attackRate : undefined) ?? 1;
  const window = Math.min(TUMANNIK_REVEAL_MAX_SEC, attackRate * TUMANNIK_REVEAL_SHARE);
  const sinceStrike = attackRate - (e.attackCd ?? 0);
  if (e.attackCd !== undefined && e.attackCd > 0 && sinceStrike <= window) {
    e.spriteAlpha = 1;
    return;
  }
  const light = world.light[world.idx(Math.floor(e.x), Math.floor(e.y))] ?? 0;
  e.spriteAlpha = Math.min(1, light) * TUMANNIK_LIT_ALPHA_MAX;
}

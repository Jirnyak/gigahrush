/* ── Чердак объявляет, каким он вырос ─────────────────────────────
 * `ChthonicAtticRootChoice` — не выбор игрока внутри прогона, а ВАРИАНТ этажа:
 * все три ветви меняют геометрию на постройке (створки, гермозакрытия, прожиг
 * молельной ниши, цена укрытия). Но манифест звал генератор без аргумента, то
 * есть у всех игроков и во всех прогонах чердак был один и тот же — `'cut'`, а
 * `'feed'` и `'burn'` оставались написанным и никем не виденным контентом.
 *
 * Две правки, и обе маленькие:
 *   1. ветвь выбирается СИДОМ ЭТАЖА (`chthonicAtticRootChoiceForSeed`), как
 *      любой другой вариант мира; прогон детерминирован, как и был;
 *   2. `publishChthonicAtticRootChoice` наконец зовётся — на прибытии, потому
 *      что во время генерации `GameState` ещё нет. Мир узнаёт, какой чердак ему
 *      достался, и `crossFloorFlag` уезжает в шину вместе с фактом.
 *
 * Проверено прогоном на сиде 1337: все три ветви держат ВСЕ три выхода
 * (`traceChthonicAtticExitPaths` — `reachable: true` у каждого), мёртвых комнат
 * ноль в каждой. Ветвь не запирает этаж, она меняет его цену.
 */

import { type World } from '../../core/world';
import { hashSeed, seededRandom } from '../../core/rand';
import { registerFloorScopedReset } from '../../world/world_contexts';
import { registerContentFloorArrivalHook } from '../../systems/content_hooks';
import { DESIGN_FLOOR_ID, type ChthonicAtticRootChoice, type ChthonicAtticRootState } from './meta';
import { publishChthonicAtticRootChoice } from './index';

/** Порядок ветвей — часть контракта: он задаёт разбивку сидов и его нельзя
 *  переставлять, не сдвинув чердаки всех сохранённых прогонов. */
export const CHTHONIC_ATTIC_ROOT_CHOICES: readonly ChthonicAtticRootChoice[] = ['cut', 'feed', 'burn'];

/** Ветвь корня по сиду этажа. Свой поток, а не глобальный `rng()`: вариант
 *  обязан быть решён ДО первого броска генерации, иначе он сдвинет всё
 *  остальное содержимое этажа. */
export function chthonicAtticRootChoiceForSeed(seed: number): ChthonicAtticRootChoice {
  const pick = seededRandom(hashSeed(`${DESIGN_FLOOR_ID}:root_choice`, seed));
  return CHTHONIC_ATTIC_ROOT_CHOICES[Math.floor(pick() * CHTHONIC_ATTIC_ROOT_CHOICES.length)]
    ?? CHTHONIC_ATTIC_ROOT_CHOICES[0];
}

let activeWorld: World | null = null;
let activeRootState: ChthonicAtticRootState | null = null;
let announced = false;

registerFloorScopedReset(current => {
  if (activeWorld !== current) resetChthonicAtticArrival();
});

/** Зовёт генератор: ветвь применена, факт ждёт прибытия игрока. */
export function bindChthonicAtticRootState(world: World, rootState: ChthonicAtticRootState): void {
  activeWorld = world;
  activeRootState = rootState;
  announced = false;
}

export function resetChthonicAtticArrival(): void {
  activeWorld = null;
  activeRootState = null;
  announced = false;
}

/** Для замка: объявил ли чердак свою ветвь. */
export function chthonicAtticRootAnnounced(): boolean {
  return announced;
}

registerContentFloorArrivalHook({
  id: 'chthonic_attic_root_choice',
  onArrival(ctx) {
    if (ctx.insideFloorInstance || ctx.designFloorId !== DESIGN_FLOOR_ID) return;
    if (announced || !activeRootState || activeWorld !== ctx.world) return;
    announced = true;
    publishChthonicAtticRootChoice(
      ctx.state,
      activeRootState,
      activeRootState.shelterRoomIds[0],
      ctx.player.id,
    );
  },
});

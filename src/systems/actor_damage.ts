/* ── Ядро единой двери урона ──────────────────────────────────────
 *
 * Дверь одна и живёт в `combat_stimulus.ts`. Здесь — её ядро: то, что делает
 * КАЖДЫЙ удар независимо от того, чья рука бьёт, — считает тип и броню,
 * снимает здоровье, толкает и доводит смерть до общей обработки.
 *
 * Отдельным файлом это лежит по одной причине, и она измеренная. Полная дверь
 * импортирует фракционный узел (`factions`), потому что удару с АВТОРОМ надо
 * начислить штраф отношениям и позвать свидетелей. А `factions` через свой
 * кадровый такт тянет `ai/pathfinding`, `noise` и `inventory`, которые сами
 * лежат НАД клеточной опасностью. Пока среда звала полную дверь, цикл
 * рантайм-импортов вырастал с 4 файлов до 18 — то есть газ, кислота и обвал не
 * могли войти в дверь вовсе, и каждый снимал здоровье сам, мимо всякой брони.
 *
 * Здесь `factions` не импортируется, и потому сюда может звать кто угодно снизу.
 * Социальная половина удара — штраф отношениям и память жертвы — от этого не
 * теряется: она нужна только когда автор ЕСТЬ, а у среды его нет по определению
 * (`applyCombatRelationOutcome` стоит под `if (attacker)`, `notifyActorDamaged`
 * сам возвращается ничем без атакующего). Поэтому средовой путь ниже — это
 * ровно `damageActor` с пустым автором, а не вторая дверь.
 */

import { DamageType, type Entity, type GameState } from '../core/types';
import type { World } from '../core/world';
import { applyDamage, applyHitStaggerAndKnockback, calculateDamage } from './combat';
import type { MonsterArmorHitResult } from './monster_armor';
import { isDebugOnePunchManEnabled, keepDebugOnePunchManAlive } from './debug_cheats';
import { isPlayerEntity } from './player_actor';
import { killEntity } from './entity_death';
import type { ActorDamageInput } from './combat_stimulus';

/** Кто обрабатывает смерть. Приходит инъекцией из точки сборки: сама обработка
 *  (лут, опыт, кровь, квесты, A-Life) принадлежит `main.ts`, а знать о ней
 *  систему заставлять нельзя — это ребро systems → main. */
export type ActorDeathHandler = (victim: Entity, killer: Entity | undefined, gore: number, vx: number, vy: number) => void;

let actorDeathHandler: ActorDeathHandler | undefined;
export function setActorDeathHandler(handler: ActorDeathHandler | undefined): void {
  actorDeathHandler = handler;
}

export interface ActorDamageCore {
  /** Что насчитал броневой конвейер. Отдаётся даже когда удар не дошёл. */
  armor: MonsterArmorHitResult;
  /** Удар не дошёл: жертва мертва, здоровья нет, урона нет или включено бессмертие. */
  blocked: boolean;
}

/**
 * Посчитать удар, снять здоровье и толкнуть. Ничего социального.
 *
 * Броневой конвейер гонится ВСЕМ, кто не посчитал его сам: живучесть существа не
 * зависит от того, чья рука бьёт. Состояние может отсутствовать — часть
 * спецударов монстров зовётся оттуда, где `GameState` не протянут; тогда
 * конвейер пропускается (ему нужен мир целиком), но тип урона работает как
 * всегда. Молча ронять урон нельзя ни в одном случае.
 */
export function runActorDamageCore(
  world: World,
  state: GameState | undefined,
  target: Entity,
  input: ActorDamageInput,
): ActorDamageCore {
  const armor = input.applied !== undefined
    ? { damage: input.applied, armorActive: false, armorStacks: 0, stripped: false, hitKind: 'weak' as const }
    : state
      ? applyDamage(world, state, target, input)
      : { damage: Math.round(calculateDamage(input.damage, input.damageType, target)), armorActive: false, armorStacks: 0, stripped: false, hitKind: 'weak' as const };
  if (!target.alive || target.hp === undefined || input.damage <= 0) return { armor, blocked: true };

  // Бессмертие отладочного режима — одно место на всю игру, а не по копии у
  // каждого бьющего.
  if (isPlayerEntity(target) && isDebugOnePunchManEnabled()) {
    keepDebugOnePunchManAlive(target);
    return { armor, blocked: true };
  }

  target.hp -= armor.damage;
  const knockbackX = input.knockbackFromX ?? input.attacker?.x;
  const knockbackY = input.knockbackFromY ?? input.attacker?.y;
  if (input.knockback !== false && knockbackX !== undefined && knockbackY !== undefined) {
    applyHitStaggerAndKnockback(world, target, knockbackX, knockbackY, armor.damage);
  }
  return { armor, blocked: false };
}

/**
 * Довести смерть до общей обработки.
 *
 * Смерть игрока здесь НЕ объявляется: у неё своя дорога — щит, продолжение за
 * другое тело, камера смерти, — и флаг `alive` там не поднимают вовсе.
 * Обработчик всё равно зовётся: он первым делом пробует поглотить удар щитом.
 */
export function finishActorDeath(target: Entity, attacker: Entity | undefined, input: ActorDamageInput): void {
  if (!isPlayerEntity(target)) killEntity(target);
  actorDeathHandler?.(target, attacker, input.gore ?? 1, input.splashX ?? 0, input.splashY ?? 0);
}

/**
 * Чем среда бьёт и добивает ли она.
 *
 * Тип обязателен и умолчания не имеет: у кислоты, пара, обвала и разряда он
 * разный, а «не назвал» здесь значит «броня молча не сработала» — ровно та
 * поломка, ради которой среду и вели к двери.
 */
export interface EnvironmentDamageInput {
  damage: number;
  damageType: DamageType;
  /**
   * Добивает ли среда насмерть.
   *
   * По умолчанию — да для всех, кроме игрока. Это не поблажка, а СНЯТЫЙ С МЕСТА
   * закон: полтора десятка средовых мест писали игроку `Math.max(1, hp - amount)`,
   * а тварям и жильцам `Math.max(0, ...)` со смертью. Среда выдавливает игрока с
   * клетки, а не убивает его; кто убивает — состав на рельсах — говорит это явно.
   */
  lethal?: boolean;
  gore?: number;
  time?: number;
}

/**
 * Урон от среды: кислота, споры, пар, обвал, разряд, пси-протокол.
 *
 * Тонкий вход в ту же дверь, а не вторая дверь: он только называет то, что у
 * среды одинаково всегда — автора нет, толкать нечем, источник `environment`, —
 * и держит порог выживания игрока в ОДНОМ месте вместо пятнадцати копий
 * `Math.max(1, hp - amount)`. Всё остальное (резист типа, носимая броня,
 * врождённая броня твари, толчок, смерть, добыча) делает то же ядро, что и удар
 * чужой рукой.
 *
 * Порог стоит ДО брони и потому безопасен: броня умеет только уменьшать удар,
 * значит снятое никогда не превысит `hp - 1`.
 *
 * Возвращает снятое здоровье — call-site печатает ЕГО, а не задуманное число:
 * иначе ОЗК гасил бы кислоту, а строка в логе продолжала врать про полный урон.
 */
export function damageActorByEnvironment(
  world: World,
  state: GameState | undefined,
  target: Entity,
  input: EnvironmentDamageInput,
): number {
  if (!target.alive || target.hp === undefined || input.damage <= 0) return 0;
  const lethal = input.lethal ?? !isPlayerEntity(target);
  const damage = lethal ? input.damage : Math.min(input.damage, target.hp - 1);
  if (damage <= 0) return 0;
  const full: ActorDamageInput = {
    damage,
    damageType: input.damageType,
    source: 'environment',
    knockback: false,
    gore: input.gore,
    time: input.time,
  };
  /* Броневой конвейер гонится ОДИН раз здесь, а в ядро уходит уже готовое число
   * (`applied` — штатный вход именно для этого; второй прогон запрещён, он с
   * побочными действиями). Причина не в экономии, а в потолке.
   *
   * Конвейер умеет УВЕЛИЧИВАТЬ удар: `monsterDamageFloor` даёт по виду твари пол
   * в долю её максимума («это оружие гарантированно кусает эту тварь»), а строка
   * матрицы больше единицы — уязвимость. Обе вещи про ОРУЖИЕ В РУКАХ, и в оружии
   * они честны: удар одиночный, за ним стоит выбор игрока и патрон.
   *
   * Клетка тикает четыре раза в секунду и выбора за собой не имеет. У Туманной
   * акулы `damageFloor[FIRE] = 1` — «любое попадание огнём убивает целиком»; без
   * потолка она умирала бы от ПЕРВОГО такта парового сброса в 1.2 урона в
   * секунду, и так же осыпались бы Кровяной цвет (0.38) и Борщевик (0.44) в
   * любой горячей клетке. Поэтому у клетки объявленный урон в секунду — это её
   * ПОТОЛОК: броня умеет только уменьшать его, а поднимать среду до чужой
   * гарантии нечему. */
  const armor = state
    ? applyDamage(world, state, target, full)
    : { damage: Math.round(calculateDamage(damage, input.damageType, target)), armorActive: false, armorStacks: 0, stripped: false, hitKind: 'weak' as const };
  const capped = Math.min(armor.damage, damage);
  const { blocked } = runActorDamageCore(world, state, target, { ...full, applied: capped });
  if (blocked) return 0;
  if ((target.hp ?? 0) > 0) return capped;
  finishActorDeath(target, undefined, full);
  return capped;
}

/* ── Standalone monster armor hooks ───────────────────────────── */

import { ArmorType, DamageType, EntityType, MonsterKind, ProjType, msg, type Entity, type GameState } from '../core/types';
import type { World } from '../core/world';
import { armorMultiplier, type ArmorImpact } from '../data/armor_matrix';
import { entityDisplayName, monsterDamageFloor } from '../entities/monster';
import { publishEvent } from './events';
import {
  applyMonsterIncomingDamage,
  chervieNetPowered,
  panelnikWallBraceActive,
} from './monster_traits';
import { isPlayerEntity } from './player_actor';

export const ZAKALENNAYA_ARMATURA_ARMOR_STACKS = 3;

const STRIP_COOLDOWN_S = 0.18;
const WEAK_CHIP_THRESHOLD = 24;
const WEAK_CHIP_MULT = 0.07;
const WEAK_MESSAGE_COOLDOWN_S = 0.75;

const ARMOR_STRIP_WEAPONS = new Set([
  'shotgun',
  'toz_shotgun',
  'grenade',
  'gauss',
  'bfg',
  'gravity_beam_emitter',
  'harpoon_gun',
  'losyash_rifle',
  'ptrs_liquidator',
  'sledgehammer',
  'axe',
  'liquidator_axe',
  'chainsaw',
  'crowbar',
  'metal_chair',
]);

/* Списки опознают удар по ID ОРУЖИЯ, поэтому запись, которой нет в `WEAPON_STATS`,
 * не срабатывает никогда и молча создаёт вид работающего правила. Отсюда сняты
 * `jackhammer` и `uv_spotlight`: оба `ItemType.TOOL` и оружием не являются. */
const ARMOR_TOOL_WEAPONS = new Set([
  'fire_hook',
  'rebar',
]);

export type MonsterArmorHitKind = 'weak' | 'heavy' | 'tool';

export interface MonsterArmorHitInput {
  damage: number;
  attacker?: Entity;
  weaponId?: string;
  /**
   * Чем бьют. Матрица брони выбирает по нему столбец; не передали — кинетика,
   * как и у резиста носимой брони.
   */
  damageType?: DamageType;
  projectileType?: ProjType;
  aoe?: boolean;
}

export interface MonsterArmorHitResult {
  damage: number;
  armorActive: boolean;
  armorStacks: number;
  stripped: boolean;
  hitKind: MonsterArmorHitKind;
}

function hitKind(input: MonsterArmorHitInput): MonsterArmorHitKind {
  const weaponId = input.weaponId ?? '';
  if (ARMOR_TOOL_WEAPONS.has(weaponId)) return 'tool';
  if (
    input.aoe ||
    input.projectileType === ProjType.GRENADE ||
    input.projectileType === ProjType.BFG ||
    input.projectileType === ProjType.BEAM ||
    ARMOR_STRIP_WEAPONS.has(weaponId)
  ) return 'heavy';
  return 'weak';
}

/**
 * Пробит ли Червие энергией.
 *
 * Ключ ОДИН — тип урона, и он же выбирает столбец матрицы. Прежде здесь стоял
 * собственный список `weaponId` плюс два вида снаряда, и он врал в обе стороны:
 * `grn420_gravizhernov` энергия по ролевому тиру, но в списке его не было, и
 * Червие держал гравижернов за кинетику; чужой энергетический выстрел без
 * `weaponId` не опознавался вовсе. Луч и шар не потерялись: `ProjType.BEAM` и
 * `ProjType.BFG` теперь сами значат энергию (`projTypeDamageType`).
 */
function isChervieEnergyHit(input: MonsterArmorHitInput): boolean {
  return input.damageType === DamageType.ENERGY;
}

function zoneIdAt(world: World, e: Entity): number | undefined {
  const zoneId = world.zoneMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
  return zoneId >= 0 ? zoneId : undefined;
}

function roomIdAt(world: World, e: Entity): number | undefined {
  const roomId = world.roomMap[world.idx(Math.floor(e.x), Math.floor(e.y))];
  return roomId >= 0 ? roomId : undefined;
}

function publishArmorStripEvent(
  world: World,
  state: GameState,
  monster: Entity,
  input: MonsterArmorHitInput,
  result: MonsterArmorHitResult,
  rawDamage: number,
): void {
  publishEvent(state, {
    type: 'monster_armor_cut',
    zoneId: zoneIdAt(world, monster),
    roomId: roomIdAt(world, monster),
    x: monster.x,
    y: monster.y,
    actorId: input.attacker?.id,
    actorName: input.attacker ? entityDisplayName(input.attacker) : undefined,
    actorFaction: input.attacker?.faction,
    targetId: monster.id,
    targetName: entityDisplayName(monster),
    targetFaction: monster.faction,
    monsterKind: monster.monsterKind,
    itemId: input.weaponId,
    severity: result.armorStacks <= 0 ? 4 : 3,
    privacy: isPlayerEntity(input.attacker) ? 'local' : 'witnessed',
    tags: ['monster', 'zakalennaya_armatura', 'armor_strip', result.hitKind],
    data: {
      armorStacks: result.armorStacks,
      armorMaxStacks: ZAKALENNAYA_ARMATURA_ARMOR_STACKS,
      rawDamage,
      damage: result.damage,
      weaponId: input.weaponId,
      projectileType: input.projectileType,
      finalStrip: result.armorStacks <= 0,
    },
  });
}

function pushArmorMessage(state: GameState, monster: Entity, text: string, color: string, force = false): void {
  if (!force && state.time - (monster.monsterArmorLastMsgAt ?? -Infinity) < WEAK_MESSAGE_COOLDOWN_S) return;
  monster.monsterArmorLastMsgAt = state.time;
  state.msgs.push(msg(text, state.time, color));
}

function applyPanelnikWallBraceHit(
  world: World,
  state: GameState,
  monster: Entity,
  input: MonsterArmorHitInput,
  rawDamage: number,
  kind: MonsterArmorHitKind,
): MonsterArmorHitResult | undefined {
  if (!panelnikWallBraceActive(world, monster)) return undefined;
  // Условие — упор в стену — уже сработало; сколько снимет удар, решает матрица.
  const mult = armorMultiplier(ArmorType.CONCRETE, input.damageType);
  const result: MonsterArmorHitResult = {
    damage: Math.max(1, Math.round(rawDamage * mult)),
    armorActive: true,
    armorStacks: 1,
    stripped: false,
    hitKind: kind,
  };

  if (state.time - (monster.monsterArmorLastMsgAt ?? -Infinity) >= 1.2) {
    monster.monsterArmorLastMsgAt = state.time;
    if (monster.ai) monster.ai.wallBraceCueAt = Math.max(monster.ai.wallBraceCueAt ?? 0, state.time + 2.4);
    state.msgs.push(msg('Пыльная рука Панельника уперлась в стену: броня держит удар, выманивайте в центр.', state.time, '#cca'));
    publishEvent(state, {
      type: 'monster_sighted',
      zoneId: zoneIdAt(world, monster),
      roomId: roomIdAt(world, monster),
      x: monster.x,
      y: monster.y,
      actorId: input.attacker?.id,
      actorName: input.attacker ? entityDisplayName(input.attacker) : undefined,
      actorFaction: input.attacker?.faction,
      targetId: monster.id,
      targetName: entityDisplayName(monster),
      targetFaction: monster.faction,
      monsterKind: MonsterKind.PANELNIK,
      itemId: input.weaponId,
      severity: 3,
      privacy: isPlayerEntity(input.attacker) ? 'local' : 'witnessed',
      tags: ['monster', 'panelnik', 'wall_brace', 'armor'],
      data: {
        rawDamage,
        damage: result.damage,
        damageMult: mult,
        counterplay: 'bait_to_open_floor',
        rumorIds: ['ecology_panelnik_wall'],
      },
    });
  }

  return result;
}

/**
 * Броня твари плюс объявленный видом пол урона по типу.
 *
 * Пол — вторая, независимая половина закона уязвимости, и она НЕ множитель:
 * «огонь доводит растение до порога от его максимума». Живёт она здесь, за
 * общей дверью, поэтому срабатывает от любой руки — от чужого огнемёта и от
 * пожара так же, как от снаряда игрока. Ключ у неё тот же единственный: тип
 * урона. Действие идемпотентно (`max`), так что путь, посчитавший порог до
 * двери, ничего не удваивает.
 */
export function applyMonsterArmorHit(
  world: World,
  state: GameState,
  monster: Entity,
  input: MonsterArmorHitInput,
): MonsterArmorHitResult {
  const result = applyMonsterArmorLayers(world, state, monster, input);
  const floor = monsterDamageFloor(monster, input.damageType);
  return floor > result.damage ? { ...result, damage: floor } : result;
}

function applyMonsterArmorLayers(
  world: World,
  state: GameState,
  monster: Entity,
  input: MonsterArmorHitInput,
): MonsterArmorHitResult {
  const rawDamage = Math.max(0, input.damage);
  const kind = hitKind(input);
  const panelnikBrace = applyPanelnikWallBraceHit(world, state, monster, input, rawDamage, kind);
  if (panelnikBrace) return panelnikBrace;
  if (monster.type === EntityType.MONSTER && monster.monsterKind === MonsterKind.CHERVIE_AVATAR) {
    // Условие — живая сеть рядом — выбирает броню, матрица считает удар.
    const powered = chervieNetPowered(world, monster);
    const energy = isChervieEnergyHit(input);
    const mult = armorMultiplier(powered ? ArmorType.LIVE_NET : ArmorType.WIRING, input.damageType);
    return {
      damage: Math.max(1, Math.round(rawDamage * mult)),
      armorActive: powered && !energy,
      armorStacks: powered && !energy ? 1 : 0,
      stripped: false,
      hitKind: kind,
    };
  }
  const incomingDamage = applyMonsterIncomingDamage(world, monster, rawDamage, input.damageType);

  if (monster.type !== EntityType.MONSTER || monster.monsterKind !== MonsterKind.ZAKALENNAYA_ARMATURA) {
    return { damage: incomingDamage, armorActive: false, armorStacks: 0, stripped: false, hitKind: kind };
  }

  let stacks = monster.monsterArmorStacks ?? ZAKALENNAYA_ARMATURA_ARMOR_STACKS;
  if (stacks <= 0) {
    monster.monsterArmorStacks = 0;
    return { damage: incomingDamage, armorActive: false, armorStacks: 0, stripped: false, hitKind: kind };
  }

  const heavy = kind !== 'weak';
  const canStrip = state.time - (monster.monsterArmorLastStripAt ?? -Infinity) >= STRIP_COOLDOWN_S;
  let stripped = false;

  if (heavy && canStrip) {
    stacks--;
    stripped = true;
    monster.monsterArmorChip = 0;
    monster.monsterArmorLastStripAt = state.time;
  } else if (!heavy) {
    const chip = (monster.monsterArmorChip ?? 0) + rawDamage * WEAK_CHIP_MULT;
    if (chip >= WEAK_CHIP_THRESHOLD && canStrip) {
      stacks--;
      stripped = true;
      monster.monsterArmorChip = 0;
      monster.monsterArmorLastStripAt = state.time;
    } else {
      monster.monsterArmorChip = Math.min(WEAK_CHIP_THRESHOLD, chip);
    }
  }

  monster.monsterArmorStacks = Math.max(0, stacks);
  if (stripped && monster.ai) {
    const stagger = heavy ? 0.85 : 0.35;
    monster.ai.staggerTimer = Math.max(monster.ai.staggerTimer ?? 0, stagger);
    monster.attackCd = Math.max(monster.attackCd ?? 0, heavy ? 0.75 : 0.35);
    monster.spriteScale = monster.monsterArmorStacks <= 0 ? 0.88 : 0.94;
  }

  // Ось «чем ударили» ортогональна типу урона и потому идёт в матрицу отдельным
  // ключом: кувалда кинетическая, но плиту срывает.
  const impact: ArmorImpact = stripped && monster.monsterArmorStacks <= 0 ? 'final' : kind;
  const mult = armorMultiplier(ArmorType.PLATE, input.damageType, impact);
  const result: MonsterArmorHitResult = {
    damage: Math.max(1, Math.round(rawDamage * mult)),
    armorActive: true,
    armorStacks: monster.monsterArmorStacks,
    stripped,
    hitKind: kind,
  };

  if (stripped) {
    publishArmorStripEvent(world, state, monster, input, result, rawDamage);
    pushArmorMessage(
      state,
      monster,
      monster.monsterArmorStacks <= 0
        ? 'Броня Закаленной Арматуры сорвана. Теперь это медленная цель.'
        : 'С Закаленной Арматуры осыпалась бронеплита.',
      '#fc4',
      true,
    );
  } else if (!heavy) {
    pushArmorMessage(state, monster, 'Слабый удар звякнул по закаленной броне.', '#aaa');
  }

  return result;
}

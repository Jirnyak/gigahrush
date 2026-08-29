/* Таблица единой двери урона: путь × кто ударил × кого ударили → что сдвинулось.
 *
 * Замок ЭТАЛОНА. Первая редакция описывала поведение на момент сведения шести
 * путей снятия здоровья к `damageActor` и наполовину состояла из ДЫР. Закон
 * «насилие двигает репутацию» (`plot.md` §7) закрыл шесть строк из шестнадцати,
 * и каждая правка перечислена здесь поимённо:
 *
 *   - снаряд NPC по NPC и по игроку: было «не двигает ничего» → стало то же,
 *     что ближний бой NPC. Путь снаряда фильтровал штраф по `isPlayerOwned`,
 *     то есть одна и та же пуля стоила репутации только в руках игрока;
 *   - взрыв NPC по NPC: то же самое, тем же фильтром;
 *   - удар ко-оп-пира по NPC: было «не платит вовсе» → стало полной ценой руки
 *     игрока. Пир — член фракции `PLAYER`, а не третья сущность.
 *
 * Что осталось тишиной и почему:
 *
 *   - ближний бой и спецудар МОНСТРА не двигают ничего: у обычной экологии нет
 *     стороны (`combatSideOf`), и укус крысы никому не портит репутацию;
 *   - удар по монстру не двигает ничего по той же причине;
 *   - удар ко-оп-пира по игроку: одна сторона, а боевой памяти игроку не
 *     ставят — у него свой канал `recordPlayerDamage`.
 *
 * Единственная строка, которую двигать НЕЛЬЗЯ, — глобальная матрица от боя
 * NPC↔NPC. Запрет замерен владельцем (`simulation.md`, «Политика фракций»):
 * дружественный огонь уводил жителей и ликвидаторов с +64 до −64 за десять
 * секунд, 690 смертей из 2175 за 90 секунд без игрока и без монстров.
 *
 * ПРАВКА 2026-08-27, шлюзы. Из шлюзов путей вычищены три поля, которых на входе
 * двери давно нет: `relationPenalty`, `relationAttacker` и `factionClash` были
 * сняты вместе с вызовами, когда платить стал тот, кто ударил. Тесты в скоуп
 * `tsc` не входят, поэтому мёртвые поля молча ехали дальше и врали про «списаны
 * с живых вызовов». Вместе с ними ушёл помощник `isPlayerOwned` — читать его
 * стало некому. Ни одно число таблицы от этого не сдвинулось: дверь их не
 * читала. Четвёртым снят `applied` у трёх боевых путей — см. вторую таблицу
 * внизу файла.
 *
 * ПРАВКА 2026-08-27, типы урона. Из двух путей твари снят `damageType`: прибитая
 * в вызове кинетика перекрывала тип, ОБЪЯВЛЕННЫЙ ВИДОМ (`MonsterDef.damageType`),
 * и все твари били одинаково. Ни одно число обеих таблиц не сдвинулось: жертвы в
 * них без брони, а тестовая «Тварь» вида не объявляет — то есть остаётся
 * кинетикой по умолчанию.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, DamageType, EntityType, Faction, Feature, MonsterKind, ProjType, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { applyDamage } from '../src/systems/combat';
import { factionBaseRelation, getFactionRel, initFactionRelations } from '../src/data/relations';
import {
  damageActor,
  getRecentCombatThreat,
  resetCombatStimulus,
  type ActorDamageInput,
} from '../src/systems/combat_stimulus';
import { setFactionsSocialContext } from '../src/systems/factions';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { isPlayerEntity, setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestEntity } from './helpers';

const TIME = 50;
/** Одна величина на всю таблицу: штраф −2, карма −1, матрица −2. */
const DAMAGE = 10;

type ActorKind = 'игрок' | 'NPC' | 'монстр' | 'пир';
type PathId =
  | 'ближний бой игрока'
  | 'ближний бой NPC'
  | 'ближний бой монстра'
  | 'спецудар монстра'
  | 'снаряд'
  | 'взрыв'
  | 'ко-оп-пир, ближний бой';

/**
 * Шлюзы каждого пути — СПИСАНЫ С ЖИВЫХ ВЫЗОВОВ, а не придуманы здесь.
 * Разошёлся вызов — разошлась и таблица, и это тоже находка.
 */
const PATH_GATES: Record<PathId, (attacker: Entity, victim: Entity) => ActorDamageInput> = {
  // src/main.ts, handlePlayerAttack
  'ближний бой игрока': () => ({
    damage: DAMAGE,
    applied: DAMAGE,
    reportedDamage: DAMAGE,
    source: 'player_melee',
    knockback: false,
    deathByCaller: true,
  }),
  /* src/systems/ai/combat.ts, tryFactionCombat.
   * `applied` СНЯТ 2026-08-27: путь гонит полный конвейер двери. */
  'ближний бой NPC': () => ({
    damage: DAMAGE,
    source: 'npc_melee',
    deathByCaller: true,
  }),
  // src/systems/ai/monster.ts, tryPerformMonsterMeleeAttack. `applied` снят там же.
  'ближний бой монстра': () => ({
    damage: DAMAGE,
    damageType: DamageType.KINETIC,
    source: 'monster_melee',
    deathByCaller: true,
  }),
  // src/systems/ai/monster.ts, finishRzhavnikLeap. `applied` снят там же.
  'спецудар монстра': () => ({
    damage: DAMAGE,
    damageType: DamageType.KINETIC,
    source: 'monster_special',
    deathByCaller: true,
  }),
  // src/main.ts, processProjectileEntityCollision
  'снаряд': (_a, victim) => ({
    damage: DAMAGE,
    applied: DAMAGE,
    reportedDamage: DAMAGE,
    source: 'projectile',
    knockbackFromX: victim.x,
    knockbackFromY: victim.y,
    deathByCaller: true,
  }),
  // src/main.ts, triggerExplosion
  'взрыв': (_a, victim) => ({
    damage: DAMAGE,
    applied: DAMAGE,
    reportedDamage: DAMAGE,
    source: 'explosion',
    aoe: true,
    knockbackFromX: victim.x,
    knockbackFromY: victim.y,
    deathByCaller: true,
  }),
  // src/main.ts, applyPeerFireAction
  'ко-оп-пир, ближний бой': (_a, victim) => ({
    damage: DAMAGE,
    applied: DAMAGE,
    reportedDamage: DAMAGE,
    source: 'player_melee',
    knockback: false,
    notifyVictim: !isPlayerEntity(victim),
    deathByCaller: true,
  }),
};

interface Outcome {
  /** Сколько сняли здоровья. */
  hp: number;
  /** Личное отношение жертвы к игроку. */
  victimRel: number;
  /** Карма ударившего. */
  karma: number;
  /** Глобальная матрица «фракция обидчика ↔ фракция жертвы». */
  matrix: number;
  /** Личное отношение к игроку у соседа, видевшего удар. */
  witnessRel: number;
  /** Осталась ли у жертвы боевая память об ударившем. */
  threat: boolean;
}

interface Row {
  path: PathId;
  attacker: ActorKind;
  victim: ActorKind;
  expect: Outcome;
}

/**
 * Жертва-человек намеренно ДРУГОЙ фракции, чем обидчик: удар внутри одной
 * фракции закон отсекает первой же строкой, и таблица меряла бы тишину.
 */
function makeActor(kind: ActorKind, id: number, x: number, faction?: Faction): Entity {
  if (kind === 'игрок') {
    return makeTestEntity({
      id, x, y: 10.5, type: EntityType.NPC, faction: Faction.PLAYER,
      persistentNpcId: 'player', name: 'Вы', hp: 100, maxHp: 100, karma: 0,
    });
  }
  if (kind === 'пир') {
    return makeTestEntity({
      id, x, y: 10.5, type: EntityType.NPC, faction: Faction.PLAYER,
      peerSlot: 0, name: 'Пир', hp: 100, maxHp: 100, karma: 0,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    });
  }
  if (kind === 'монстр') {
    return makeTestEntity({
      id, x, y: 10.5, type: EntityType.MONSTER, faction: Faction.WILD,
      persistentNpcId: undefined, name: 'Тварь', hp: 100, maxHp: 100, karma: 0,
      ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    });
  }
  return makeTestEntity({
    id, x, y: 10.5, type: EntityType.NPC, faction: faction ?? Faction.CITIZEN,
    persistentNpcId: undefined, name: 'Житель', hp: 100, maxHp: 100, karma: 0,
    playerRelation: 0,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  });
}

function runCase(row: Row): Outcome {
  initFactionRelations();
  resetCombatStimulus();
  setFactionsSocialContext(undefined);

  const world = new World();
  /* Пол под участниками ОБЯЗАТЕЛЕН. `new World()` — сплошная скала
   * (`cells.fill(Cell.WALL)`), а свидетелем считается тот, кто видит место по
   * прямой; в невырубленном мире луч не проходит ни от кого, и столбец
   * `witnessRel` молча мерил бы нули. Ловушка общая для всех тестов, строящих
   * голый мир: их свидетели пропадают, а не «не платят». */
  for (let x = 8; x <= 14; x++) world.set(x, 10, Cell.FLOOR);
  const state = makeGameState({ time: TIME });
  /* Игрок в мире есть ВСЕГДА, даже когда бьют не его и не он: без живого
   * `currentPlayerId` ко-оп-пир читается как родное тело игрока, и таблица
   * меряет не тот путь. */
  const player = makeActor('игрок', 900_000, 9.5);
  setCurrentPlayerEntity(player);

  const attacker = row.attacker === 'игрок' ? player : makeActor(row.attacker, 900_001, 10.5);
  const victim = row.victim === 'игрок' ? player : makeActor(row.victim, 900_002, 11.5, Faction.LIQUIDATOR);
  // Сосед в той же комнате и в радиусе зова: он ничего не делает, он смотрит.
  const witness = makeActor('NPC', 900_003, 12.5);
  rebuildEntityIndex([player, attacker, victim, witness]);

  const hpBefore = victim.hp ?? 0;
  const matrixBefore = getFactionRel(attacker.faction!, victim.faction!);
  const input = PATH_GATES[row.path](attacker, victim);
  damageActor(world, state, victim, { ...input, attacker, time: TIME });

  return {
    hp: hpBefore - (victim.hp ?? 0),
    victimRel: victim.playerRelation ?? 0,
    karma: attacker.karma ?? 0,
    matrix: getFactionRel(attacker.faction!, victim.faction!) - matrixBefore,
    witnessRel: witness.playerRelation ?? 0,
    threat: getRecentCombatThreat(victim, TIME) !== undefined,
  };
}

/** Ни один путь не платит: дельт нет ни у кого. */
const SILENT = (hp = DAMAGE, threat = true): Outcome =>
  ({ hp, victimRel: 0, karma: 0, matrix: 0, witnessRel: 0, threat });

/**
 * Полная цена руки игрока: −38 жертве, −1 карма, −19 свидетелю. МАТРИЦА НУЛЬ.
 *
 * ПРАВКА 2026-08-29, шкала. Числа жертвы и свидетеля выросли с −2/−1 не от
 * подкрутки, а от смены ЕДИНИЦЫ измерения: штраф считается долей снятого
 * здоровья, а не абсолютным уроном (`damageRelationPenalty`). Здесь урон 10 при
 * `maxHp` 100 — десятая часть полоски, то есть пятая часть пути до вражды,
 * потому что вражду даёт ПОЛОВИНА полоски: 191 × 0.1 / 0.5 = 38, свидетелю
 * половина = 19. Прежние −2 означали сорок попаданий до вражды при жертве,
 * умирающей за десять, — то есть враждебность по урону была недостижима
 * арифметически, а не «плохо настроена».
 *
 * Столбец матрицы обнулился вторым шагом закона: насилие стало ценой чисто
 * местной, и глобальную таблицу фракций бой не двигает больше ни от чьей руки.
 * Это была последняя ветка «атакующий — игрок» во всём счёте отношений: у
 * игрока имелся канал, которого нет ни у кого. Фракция как целое помнит теперь
 * кражи, память комнат, инфраструктуру и пропуска — договор и имущество, а не
 * трупы. Трупы помнят те, кто их видел.
 */
const PLAYER_HIT: Outcome =
  { hp: DAMAGE, victimRel: -38, karma: -1, matrix: 0, witnessRel: -19, threat: true };

/**
 * Удар по СВОЕЙ стороне: личного канала нет, карма есть.
 *
 * До 2026-08-29 совпадение фракций отменяло цену удара целиком первой же
 * строкой закона, и это было не послабление своим, а дыра: игрок после смерти
 * продолжает в ЧУЖОМ теле с чужой нашивкой, поэтому все его удары по жителям
 * упирались ровно сюда, и мир их не замечал. Замок снят; личное мнение о себе
 * при этом никуда не пишется — такого хранилища нет, — а карма за руку,
 * поднятую на неврага, платится обычная.
 */
const SAME_SIDE_HIT: Outcome =
  { hp: DAMAGE, victimRel: 0, karma: -1, matrix: 0, witnessRel: 0, threat: false };

/** Цена руки NPC. Личное ребро жертвы и ячейки свидетелей двигаются в A-Life,
 *  которого у тестовых тел нет, поэтому в таблице видна только карма обидчика.
 *  Матрица стоит намертво — как и у игрока, и теперь по одной и той же причине. */
const NPC_HIT: Outcome =
  { hp: DAMAGE, victimRel: 0, karma: -1, matrix: 0, witnessRel: 0, threat: true };

const TABLE: Row[] = [
  /* ── Рука игрока: ничем не отличается от чужой, кроме хранилища ── */
  { path: 'ближний бой игрока', attacker: 'игрок', victim: 'NPC', expect: PLAYER_HIT },
  { path: 'ближний бой игрока', attacker: 'игрок', victim: 'монстр', expect: SILENT() },
  { path: 'снаряд', attacker: 'игрок', victim: 'NPC', expect: PLAYER_HIT },
  { path: 'снаряд', attacker: 'игрок', victim: 'монстр', expect: SILENT() },
  { path: 'взрыв', attacker: 'игрок', victim: 'NPC', expect: PLAYER_HIT },

  /* ── Рука NPC: чем ударил — не важно, важно кто. ── */
  { path: 'ближний бой NPC', attacker: 'NPC', victim: 'NPC', expect: NPC_HIT },
  { path: 'ближний бой NPC', attacker: 'NPC', victim: 'монстр', expect: SILENT() },
  { path: 'ближний бой NPC', attacker: 'NPC', victim: 'игрок', expect: NPC_HIT },

  /* ── ЗАКРЫТО: снаряд и взрыв NPC платят наравне с рукой. Было SILENT: обе
   *    ветки фильтровали штраф по `isPlayerOwnedProjectile`. ── */
  { path: 'снаряд', attacker: 'NPC', victim: 'NPC', expect: NPC_HIT },
  { path: 'снаряд', attacker: 'NPC', victim: 'игрок', expect: NPC_HIT },
  { path: 'взрыв', attacker: 'NPC', victim: 'NPC', expect: NPC_HIT },

  /* ── Экология: у монстра без флага `sided` стороны нет, и счёта тоже. ── */
  { path: 'ближний бой монстра', attacker: 'монстр', victim: 'NPC', expect: SILENT() },
  { path: 'ближний бой монстра', attacker: 'монстр', victim: 'игрок', expect: SILENT() },
  { path: 'спецудар монстра', attacker: 'монстр', victim: 'NPC', expect: SILENT() },

  /* ── ЗАКРЫТО: ко-оп-пир платит как игрок, он член той же фракции. Было
   *    SILENT — путь пира выключал штраф целиком (`plot.md`, D12).
   *    По игроку по-прежнему тишина: одна сторона, и боевой памяти ему не
   *    ставят — у него свой канал. ── */
  { path: 'ко-оп-пир, ближний бой', attacker: 'пир', victim: 'NPC', expect: PLAYER_HIT },
  { path: 'ко-оп-пир, ближний бой', attacker: 'пир', victim: 'игрок', expect: SAME_SIDE_HIT },
];

for (const row of TABLE) {
  test(`${row.path}: ${row.attacker} → ${row.victim}`, () => {
    assert.deepEqual(runCase(row), row.expect);
  });
}

test('здоровье снимает только дверь: ни один путь не проходит мимо', () => {
  for (const row of TABLE) {
    assert.equal(runCase(row).hp, DAMAGE, `${row.path}: ${row.attacker} → ${row.victim}`);
  }
});

test('бой не двигает глобальную матрицу — ни от чьей руки, включая игрока', () => {
  /* Прежде эта проверка обходила строки игрока: матрицу двигал он один, и
   * запрет касался только боя NPC↔NPC. Фильтра больше нет — правило стало
   * общим, и это ровно то, что означает «игрок — просто NPC».
   *
   * Причина запрета для NPC замерена владельцем и не изменилась
   * (`simulation.md`, «Политика фракций»): дружественный огонь уводил жителей и
   * ликвидаторов с +64 до −64 за десять секунд, 690 смертей из 2175 за 90 с.
   * Для игрока причина другая и она про закон, а не про замер: канал, которого
   * нет у остальных, — это и есть нарушение. */
  const base = factionBaseRelation(Faction.CITIZEN, Faction.LIQUIDATOR);
  for (const row of TABLE) {
    assert.equal(runCase(row).matrix, 0, `${row.path}: ${row.attacker} → ${row.victim}`);
  }
  // База таблицы при этом читается, а не переписывается числом.
  assert.equal(typeof base, 'number');
});

/* ── Вторая таблица: врождённая броня твари ────────────────────────
 *
 * Живучесть существа не зависит от того, чья рука бьёт. До 2026-08-27 зависела:
 * ближний бой NPC и ближний бой/рывок монстра приходили к двери с уже посчитанным
 * уроном (`applied`) и `applyMonsterArmorHit` не гоняли вовсе — бронированная
 * тварь держала удар только от игрока.
 *
 * ЗАМЕР, по которому шаг сделан (живые этажи, без игрока, 60 с, по два сида):
 * из 38 256 ударов этими путями 606 пришлись по бронированной твари, и 74 из них —
 * по Червие с ЖИВОЙ сетью, то есть били 100 вместо 56. Авторский «Червие
 * НЕТ-ветки» на Кремниевом колодце погибал в обоих сидах; после — в одном.
 * Панельник и Лоточник от этого не пострадали ни разу: их множитель путь NPC и так
 * применял отдельным вызовом `applyMonsterIncomingDamage`, и замер это подтвердил
 * (B/A = 1.00). Совокупная смертность осталась в шуме: твари 35.74% → 35.63%,
 * люди 37.65% → 38.41%; броневых реплик в логе не прибавилось.
 *
 * Гоняются ПОЛНЫЕ сайты, а не одна дверь: точка сборки зовёт `applyDamage` сама и
 * отдаёт результат в `applied` (ей число нужно для крови и сообщений), боевой AI
 * отдаёт дверь сырой урон. Разойдись любой из них — таблица покажет разное число
 * в строке, и это тоже находка.
 */

/** Сырой урон таблицы. Сотня, чтобы множители читались процентами. */
const ARMOR_RAW = 100;

type ArmorPath = 'рука игрока' | 'рука NPC' | 'рука монстра' | 'снаряд' | 'взрыв';

interface ArmorCase {
  label: string;
  kind: MonsterKind;
  /** Во что поставлен мир вокруг твари: стена, вода, экран. */
  setup: (world: World, monster: Entity) => void;
  weaponId?: string;
  /** Сколько здоровья обязан снять КАЖДЫЙ путь. */
  expect: number;
}

function armoredMonster(kind: MonsterKind): Entity {
  return makeTestEntity({
    id: 900_010, x: 100.5, y: 100.5, type: EntityType.MONSTER, monsterKind: kind,
    faction: Faction.WILD, persistentNpcId: undefined, name: 'Тварь',
    hp: 100_000, maxHp: 100_000,
  });
}

/** Здоровье, снятое одним ударом по свежей твари данным путём. */
function armorHit(path: ArmorPath, kase: ArmorCase): number {
  resetCombatStimulus();
  /* Свежий `World` — сплошной бетон, а не пустая комната. Панельник в таком мире
   * упирается в стену ВСЕГДА, и строка «в открытом поле» мерила бы упор. Вокруг
   * твари вырезан зал, и только сценарий ставит обратно то, что ему нужно. */
  const world = new World();
  const monster = armoredMonster(kase.kind);
  const mx = Math.floor(monster.x);
  const my = Math.floor(monster.y);
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) world.cells[world.idx(mx + dx, my + dy)] = Cell.FLOOR;
  }
  const state = makeGameState({ time: TIME });
  kase.setup(world, monster);

  const attacker = makeActor(path === 'рука монстра' ? 'монстр' : 'NPC', 900_011, 101.5);
  attacker.y = 100.5;
  rebuildEntityIndex([attacker, monster]);

  const hpBefore = monster.hp ?? 0;
  if (path === 'рука NPC') {
    // src/systems/ai/combat.ts: дверь гонит конвейер сама.
    damageActor(world, state, monster, {
      damage: ARMOR_RAW, damageType: DamageType.KINETIC, source: 'npc_melee',
      attacker, weaponId: kase.weaponId, time: TIME, deathByCaller: true,
    });
  } else if (path === 'рука монстра') {
    // src/systems/ai/monster.ts: то же самое.
    damageActor(world, state, monster, {
      damage: ARMOR_RAW, damageType: DamageType.KINETIC, source: 'monster_melee',
      attacker, time: TIME, deathByCaller: true,
    });
  } else {
    /* src/main.ts: точка сборки считает конвейер ДО двери — результат ей нужен
     * для крови и сообщений — и отдаёт число в `applied`. */
    const input = {
      damage: ARMOR_RAW, attacker, weaponId: kase.weaponId,
      projectileType: path === 'снаряд' ? ProjType.BULLET : path === 'взрыв' ? ProjType.GRENADE : undefined,
      aoe: path === 'взрыв',
    };
    const armor = applyDamage(world, state, monster, input);
    damageActor(world, state, monster, {
      ...input,
      applied: armor.damage,
      reportedDamage: armor.damage,
      source: path === 'рука игрока' ? 'player_melee' : path === 'снаряд' ? 'projectile' : 'explosion',
      knockback: false,
      time: TIME,
      deathByCaller: true,
    });
  }
  return hpBefore - (monster.hp ?? 0);
}

const ARMOR_TABLE: ArmorCase[] = [
  /* Панельник у стены: плитная рука упёрта, множитель 0.58. Клетка справа —
   * бетон, тварь стоит вплотную. */
  {
    label: 'Панельник у стены', kind: MonsterKind.PANELNIK, expect: 58,
    setup: (world, m) => { world.cells[world.idx(Math.floor(m.x) + 1, Math.floor(m.y))] = Cell.WALL; },
  },
  // Он же в чистом поле: упора нет, броня не работает ни у кого.
  { label: 'Панельник в открытом поле', kind: MonsterKind.PANELNIK, expect: 100, setup: () => {} },
  // Лоточник в воде: та же врождённая броня 0.58, другой повод.
  {
    label: 'Лоточник в воде', kind: MonsterKind.LOTOCHNIK, expect: 58,
    setup: (world, m) => { world.cells[world.idx(Math.floor(m.x), Math.floor(m.y))] = Cell.WATER; },
  },
  /* Червие у живого экрана: 0.56 по кинетике. Ровно тот случай, ради которого
   * шаг и сделан, — путь NPC бил сюда сотней. */
  {
    label: 'Червие у живого экрана', kind: MonsterKind.CHERVIE_AVATAR, expect: 56,
    setup: (world, m) => { world.features[world.idx(Math.floor(m.x) + 2, Math.floor(m.y))] = Feature.SCREEN; },
  },
  // Червие без экрана: обычная цель.
  { label: 'Червие без экрана', kind: MonsterKind.CHERVIE_AVATAR, expect: 100, setup: () => {} },
  /* Закалённая арматура под слабым ударом: три плиты держат, 0.28. Нож в списки
   * срывающих броню не входит, поэтому удар считается слабым у всех путей. */
  {
    label: 'Закалённая арматура, слабый удар', kind: MonsterKind.ZAKALENNAYA_ARMATURA,
    weaponId: 'knife', expect: 28, setup: () => {},
  },
];

for (const kase of ARMOR_TABLE) {
  test(`броня твари: ${kase.label} — одинаково для любой руки`, () => {
    const paths: ArmorPath[] = ['рука игрока', 'рука NPC', 'рука монстра', 'снаряд', 'взрыв'];
    for (const path of paths) {
      // Снаряд и взрыв считаются тяжёлыми ударами и срывают плиту с арматуры:
      // множитель там свой, и сравнивать его со слабым ударом нечего.
      if (kase.kind === MonsterKind.ZAKALENNAYA_ARMATURA && (path === 'снаряд' || path === 'взрыв')) continue;
      assert.equal(armorHit(path, kase), kase.expect, `${kase.label}: ${path}`);
    }
  });
}

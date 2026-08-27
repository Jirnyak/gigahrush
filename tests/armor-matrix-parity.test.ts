/**
 * Эталонная таблица брони: вид брони × тип урона × путь удара → снятое здоровье.
 *
 * Замок паритета. Каждое число здесь — наблюдаемая живучесть, а не внутренний
 * множитель. Сдвинулось число — сдвинулся бой.
 *
 * ПРАВКА 2026-08-27, шаг 2 «наполнение матрицы». Первая редакция фиксировала
 * ПЛОСКИЕ строки: тип урона не влиял ни на что, и это было записано специально,
 * чтобы наполнение поменяло закон явно, а не молча. Здесь оно и меняется.
 * Правки построчно:
 *
 *   - шестой столбец: добавлен `BIO` — кислота, споры, слизь, гниль и газ. До
 *     него у всего перечисленного не было типа урона вовсе;
 *   - Панельник: было `[58,58,58,58,58]` → стало `[58,46,82,78,100,62]`.
 *     Кинетика НЕ ДВИНУТА — этим числом бетон и настраивали. Дробь по плите
 *     работает лучше всего (46), луч и пламя плиту почти не замечают (82/78),
 *     ПСИ не замечает совсем (100);
 *   - Лоточник: было `[58,58,58,58,58]` → стало `[58,52,106,20,100,48]`.
 *     Кинетика та же. Вода гасит огонь (20) и смывает биологию (48), но ПРОВОДИТ
 *     ток: под энергией мокрая шкура хуже сухой (106);
 *   - Закалённая Арматура: было `[28,28,28,28,28]` → стало `[28,22,52,62,100,86]`,
 *     кинетика та же. Строки оси удара больше не пишутся руками: они ВЫВЕДЕНЫ из
 *     базовой долями 4/9 и 1/9, и эти доли — сами прежние 0.68 и 0.92,
 *     пересчитанные из разрыва 0.72. По кинетике поэтому ровно 68 и 92, как было;
 *   - Червие с сетью: было `[56,56,56,56,56]` + список оружия → стало
 *     `[56,50,108,74,70,66]`, где 56 и 108 прежние. Ключ энергии теперь ОДИН —
 *     тип урона, поэтому `damageType: ENERGY` наконец переключает строку, а
 *     `grn420_gravizhernov` (энергия по ролевому тиру, в старом списке его не
 *     было) перестал считаться кинетикой;
 *   - Червие без сети: было `[100,100,100,100,100]` + 134 по списку → стало
 *     `[100,100,134,112,100,84]`, где 100 и 134 прежние;
 *   - носимая броня: таблица дополнена столбцом `BIO`, и во всех пяти строках он
 *     равен ПОЛНОМУ урону. Это не забывчивость теста, а находка: ни один предмет
 *     брони в игре не объявляет резист к био. Строка охраняет дыру, пока её не
 *     закроют в `data/items.ts`.
 *
 * ПРАВКА 2026-08-27, шаг 3 «лестница брони». Дыру закрыли, и охраняется теперь
 * обратное. Правки построчно:
 *
 *   - имя теста: «БИО не держит никто» → «колонка БИО закрыта». Проверка внизу
 *     перевёрнута: было `resistances[BIO] === undefined` у всех пяти, стало
 *     `> 0` у всех семи несущих комплектов;
 *   - Лёгкая: `[80,70,100,95,100,100]` → `[…,95]`. БИО 5 = её же ОГОНЬ: у
 *     негерметичного комплекта и пламя, и кислота идут по швам, и держит их одна
 *     и та же толщина. По тому же правилу Средняя `100 → 90` (ОГОНЬ 10) и
 *     Тяжёлая `100 → 80` (ОГОНЬ 20). Первые пять чисел каждой строки НЕ ДВИНУТЫ;
 *   - Ряса: `[90,90,60,100,25,100]` → `[…,90]`. Исключение из правила «БИО равен
 *     ОГНЮ»: ОГНЯ у рясы нет вовсе, потому что смоляная пропитка горит охотнее
 *     сухой ткани, — а жидкое та же пропитка отталкивает. БИО 10 много ниже
 *     ПСИ 75, её настоящей темы;
 *   - Броня Ликвидатора: `[20,15,80,85,95,100]` → `[…,65]`. Второе исключение и
 *     единственный герметичный комплект из семи: её БИО выведен не из толщины, а
 *     из замкнутого контура — половина глубины специалиста (70/2 = 35);
 *   - три новых строки. `armor_ozk` `[95,90,100,100,100,30]` и `armor_tok200`
 *     `[95,90,90,30,100,100]` — средняя ступень, узкая специализация: глубина 70
 *     в своей колонке и почти ничего в остальных. `armor_szk9`
 *     `[15,15,40,40,40,40]` — верх лестницы, полоса E4: дыр нет ни по одной оси;
 *   - новый тест «три ступени различимы по ФОРМЕ строки»: он держит не числа, а
 *     замысел (начало даёт понемногу от всего, специалист вчетверо глубже в своей
 *     колонке, универсал без дыр и всё-таки уступает специалисту в его колонке).
 *     Перецена строки его не роняет, смена формы — роняет;
 *   - «носимая броня объявляет вид, известный матрице»: три новых записи, ткань
 *     для обоих специалистов (полотно и резина) и пластина для СЗК-9.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ArmorType, Cell, DamageType, EntityType, Feature, MonsterKind, ProjType, Tex, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { ARMOR_MATRIX, armorMultiplier } from '../src/data/armor_matrix';
import { ITEMS } from '../src/data/items';
import { WEAPON_STATS } from '../src/data/catalog';
import { applyDamage, calculateDamage } from '../src/systems/combat';
import { applyMonsterArmorHit, ZAKALENNAYA_ARMATURA_ARMOR_STACKS, type MonsterArmorHitInput } from '../src/systems/monster_armor';
import { applyMonsterIncomingDamage } from '../src/systems/monster_traits';
import { makeGameState, makeTestEntity } from './helpers';

type HitInput = MonsterArmorHitInput & { damageType?: DamageType };

const DAMAGE_TYPES = [
  DamageType.KINETIC,
  DamageType.BUCKSHOT,
  DamageType.ENERGY,
  DamageType.FIRE,
  DamageType.PSI,
  DamageType.BIO,
] as const;

const RAW = 100;

function scene(): { world: World; state: GameState } {
  return { world: new World(), state: makeGameState() };
}

function monsterAt(kind: MonsterKind, x: number, y: number, extra: Partial<Entity> = {}): Entity {
  return makeTestEntity({ id: 2, type: EntityType.MONSTER, monsterKind: kind, x, y, hp: 5000, maxHp: 5000, ...extra });
}

/** Все шесть типов урона по одной и той же цели через `applyMonsterArmorHit`. */
function sweepArmorHit(
  world: World,
  state: GameState,
  makeTarget: () => Entity,
  base: HitInput,
): number[] {
  return DAMAGE_TYPES.map((damageType) =>
    applyMonsterArmorHit(world, state, makeTarget(), { ...base, damageType }).damage);
}

test('эталон: без брони — все шесть типов снимают полный урон', () => {
  const { world, state } = scene();
  const target = () => monsterAt(MonsterKind.EYE, 5, 5);

  assert.deepEqual(
    sweepArmorHit(world, state, target, { damage: RAW, weaponId: 'makarov' }),
    [100, 100, 100, 100, 100, 100],
  );
  assert.equal(applyMonsterIncomingDamage(world, monsterAt(MonsterKind.EYE, 5, 5), RAW), 100);
});

test('эталон: Панельник у стены — бетон держит вещество и не мешает полю', () => {
  const { world, state } = scene();
  // Мир по умолчанию сплошной: любая соседняя клетка — стена, упор активен.
  const target = () => monsterAt(MonsterKind.PANELNIK, 5, 5);

  assert.deepEqual(
    sweepArmorHit(world, state, target, { damage: RAW, weaponId: 'makarov' }),
    [58, 46, 82, 78, 100, 62],
  );
  // Прежнее число кинетики не двинуто — им бетон и настраивали.
  assert.equal(applyMonsterIncomingDamage(world, monsterAt(MonsterKind.PANELNIK, 5, 5), RAW, DamageType.KINETIC), 58);
  // Нетипизированный удар по-прежнему читается кинетикой.
  assert.equal(applyMonsterIncomingDamage(world, monsterAt(MonsterKind.PANELNIK, 5, 5), RAW), 58);

  // Тяжёлый удар и AoE упор не пробивают: ось «чем ударили» у бетона не работает.
  assert.equal(applyMonsterArmorHit(world, state, target(), { damage: RAW, weaponId: 'shotgun', damageType: DamageType.KINETIC }).damage, 58);
  assert.equal(applyMonsterArmorHit(world, state, target(), { damage: RAW, aoe: true, damageType: DamageType.KINETIC }).damage, 58);
});

test('эталон: Панельник вне стены — броня снята', () => {
  const { world, state } = scene();
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) world.cells[world.idx(5 + dx, 5 + dy)] = Cell.FLOOR;
  }
  const open = applyMonsterArmorHit(world, state, monsterAt(MonsterKind.PANELNIK, 5, 5), { damage: RAW, weaponId: 'makarov' });
  assert.equal(open.damage, 100);
  assert.equal(open.armorActive, false);
});

test('эталон: Лоточник в мокром — вода гасит огонь и проводит ток', () => {
  const { world, state } = scene();
  const wet = (): Entity => {
    world.cells[world.idx(9, 9)] = Cell.FLOOR;
    world.floorTex[world.idx(9, 9)] = Tex.F_WATER;
    return monsterAt(MonsterKind.LOTOCHNIK, 9, 9);
  };

  assert.deepEqual(sweepArmorHit(world, state, wet, { damage: RAW, weaponId: 'makarov' }), [58, 52, 106, 20, 100, 48]);
  assert.equal(applyMonsterIncomingDamage(world, wet(), RAW, DamageType.KINETIC), 58);

  // На сухом бетоне мокрой шкуры нет.
  world.cells[world.idx(12, 12)] = Cell.FLOOR;
  const dry = applyMonsterArmorHit(world, state, monsterAt(MonsterKind.LOTOCHNIK, 12, 12), { damage: RAW, weaponId: 'makarov' });
  assert.equal(dry.damage, 100);
});

test('эталон: Червие с живой сетью — энергия пробивает, ПСИ тонет в сети', () => {
  const { world, state } = scene();
  world.features[world.idx(20, 20)] = Feature.APPARATUS;
  const target = () => monsterAt(MonsterKind.CHERVIE_AVATAR, 20, 20);

  assert.deepEqual(sweepArmorHit(world, state, target, { damage: RAW }), [56, 50, 108, 74, 70, 66]);

  /* Ключ энергии — ТИП УРОНА, и он один. Раньше строку переключал собственный
   * список `weaponId`, а явный `damageType` не значил ничего. */
  const armored = applyMonsterArmorHit(world, state, target(), { damage: RAW, damageType: DamageType.KINETIC });
  assert.equal(armored.armorActive, true);
  assert.equal(armored.armorStacks, 1);
  const pierced = applyMonsterArmorHit(world, state, target(), { damage: RAW, damageType: DamageType.ENERGY });
  assert.equal(pierced.armorActive, false);
  assert.equal(pierced.armorStacks, 0);

  // Через дверь тип выводится сам: из оружия, из вида снаряда — результат один.
  assert.equal(applyDamage(world, state, target(), { damage: RAW, weaponId: 'plasma' }).damage, 108);
  assert.equal(applyDamage(world, state, target(), { damage: RAW, projectileType: ProjType.BEAM }).damage, 108);
  assert.equal(applyDamage(world, state, target(), { damage: RAW, weaponId: 'makarov' }).damage, 56);
  /* ЗАКРЫТАЯ ДЫРА: гравижернов — энергия по ролевому тиру, но в прежнем списке
   * Червия его не было, и сеть держала его за кинетику (56 вместо 108). */
  assert.equal(applyDamage(world, state, target(), { damage: RAW, weaponId: 'grn420_gravizhernov' }).damage, 108);
});

test('эталон: Червие без сети — кабель проводит ток и тянет пламя', () => {
  const { world, state } = scene();
  const target = () => monsterAt(MonsterKind.CHERVIE_AVATAR, 30, 30);

  assert.deepEqual(sweepArmorHit(world, state, target, { damage: RAW }), [100, 100, 134, 112, 100, 84]);
  assert.equal(applyDamage(world, state, target(), { damage: RAW, weaponId: 'plasma' }).damage, 134);
  assert.equal(applyDamage(world, state, target(), { damage: RAW, projectileType: ProjType.BEAM }).damage, 134);
});

test('эталон: Закалённая Арматура — ось удара выведена из базовой строки', () => {
  const { world, state } = scene();
  let clock = 100;
  const fresh = (stacks = ZAKALENNAYA_ARMATURA_ARMOR_STACKS): Entity => {
    state.time = (clock += 10);
    return monsterAt(MonsterKind.ZAKALENNAYA_ARMATURA, 40, 40, {
      monsterArmorStacks: stacks,
      monsterArmorChip: 0,
      monsterArmorLastStripAt: -Infinity,
    });
  };

  assert.deepEqual(sweepArmorHit(world, state, () => fresh(), { damage: RAW, weaponId: 'makarov' }), [28, 22, 52, 62, 100, 86]);
  assert.deepEqual(sweepArmorHit(world, state, () => fresh(), { damage: RAW, weaponId: 'shotgun' }), [68, 65, 79, 83, 100, 94]);
  assert.deepEqual(sweepArmorHit(world, state, () => fresh(), { damage: RAW, weaponId: 'fire_hook' }), [68, 65, 79, 83, 100, 94]);
  assert.deepEqual(sweepArmorHit(world, state, () => fresh(1), { damage: RAW, weaponId: 'shotgun' }), [92, 91, 95, 96, 100, 98]);
  assert.deepEqual(sweepArmorHit(world, state, () => fresh(0), { damage: RAW, weaponId: 'makarov' }), [100, 100, 100, 100, 100, 100]);

  // Ось удара ортогональна типу: граната и AoE — тоже «тяжёлый».
  assert.equal(applyMonsterArmorHit(world, state, fresh(), { damage: RAW, weaponId: 'makarov', aoe: true, damageType: DamageType.KINETIC }).damage, 68);
  assert.equal(applyMonsterArmorHit(world, state, fresh(), { damage: RAW, projectileType: ProjType.GRENADE, damageType: DamageType.KINETIC }).damage, 68);

  const tool = applyMonsterArmorHit(world, state, fresh(), { damage: RAW, weaponId: 'fire_hook' });
  assert.equal(tool.hitKind, 'tool');
  assert.equal(tool.stripped, true);
});

test('матрица: строки оси удара ВЫВЕДЕНЫ из базовой, а не вписаны', () => {
  /* Доли 4/9 и 1/9 — это сами прежние числа 0.68 и 0.92, пересчитанные из
   * разрыва 0.72 до единицы. Проверка держит именно вывод, а не результат. */
  for (const t of DAMAGE_TYPES) {
    const base = armorMultiplier(ArmorType.PLATE, t);
    assert.equal(
      armorMultiplier(ArmorType.PLATE, t, 'heavy').toFixed(6),
      (1 - (1 - base) * (4 / 9)).toFixed(6),
      `${DamageType[t]}: срывающий удар`,
    );
    assert.equal(
      armorMultiplier(ArmorType.PLATE, t, 'final').toFixed(6),
      (1 - (1 - base) * (1 / 9)).toFixed(6),
      `${DamageType[t]}: последняя плита`,
    );
  }
  // Прежние числа по кинетике при этом стоят ровно на месте.
  assert.equal(armorMultiplier(ArmorType.PLATE, DamageType.KINETIC), 0.28);
  assert.equal(armorMultiplier(ArmorType.PLATE, DamageType.KINETIC, 'heavy'), 0.68);
  assert.equal(armorMultiplier(ArmorType.PLATE, DamageType.KINETIC, 'tool'), 0.68);
  assert.equal(armorMultiplier(ArmorType.PLATE, DamageType.KINETIC, 'final'), 0.92);
  assert.equal(armorMultiplier(ArmorType.CONCRETE, DamageType.KINETIC, 'heavy'), 0.58, 'бетону всё равно, чем ударили');
});

test('матрица: материальная броня не мешает ПСИ', () => {
  /* Прямое следствие того, что пси-дефазинг проводит СКВОЗЬ стены: если разум
   * проходит сквозь несущую панель, он проходит и сквозь её обломок. Исключения
   * не материал: живая сеть Червия — распределённый разум, ряса культиста
   * пропитана специально, и её резист живёт в процентах предмета. */
  for (const kind of [ArmorType.PLATE, ArmorType.CONCRETE, ArmorType.WET_HIDE]) {
    assert.equal(armorMultiplier(kind, DamageType.PSI), 1, `${ArmorType[kind]}: ПСИ проходит насквозь`);
  }
  assert.equal(armorMultiplier(ArmorType.LIVE_NET, DamageType.PSI) < 1, true);
});

test('эталон: носимая броня — резист по типам, и колонка БИО закрыта', () => {
  const { world, state } = scene();
  const worn = (armorDefId: string): Entity => makeTestEntity({ id: 3, type: EntityType.NPC, armorDefId, x: 50, y: 50, hp: 5000, maxHp: 5000 });
  /* Строки идут снизу вверх по цене — это и есть лестница из `data/items.ts`. */
  const table: Record<string, number[]> = {
    armor_light: [80, 70, 100, 95, 100, 95],
    armor_ozk: [95, 90, 100, 100, 100, 30],
    armor_tok200: [95, 90, 90, 30, 100, 100],
    armor_medium: [60, 50, 85, 90, 100, 90],
    armor_cultist: [90, 90, 60, 100, 25, 90],
    armor_heavy: [40, 30, 70, 80, 100, 80],
    armor_liquidator: [20, 15, 80, 85, 95, 65],
    armor_szk9: [15, 15, 40, 40, 40, 40],
  };

  for (const [defId, expected] of Object.entries(table)) {
    assert.deepEqual(
      DAMAGE_TYPES.map((t) => Math.round(calculateDamage(RAW, t, worn(defId)))),
      expected,
      `${defId}: резист по типам`,
    );
    assert.deepEqual(
      DAMAGE_TYPES.map((t) => applyDamage(world, state, worn(defId), { damage: RAW, damageType: t }).damage),
      expected,
      `${defId}: тот же результат через единую дверь`,
    );
  }

  /* ЗАКРЫТАЯ ДЫРА: до этого шага столбец `BIO` стоял целиком по сотне — ни один
   * предмет брони не объявлял резиста к био, и строка теста охраняла дыру. Теперь
   * его объявляют все, кроме одного, и охраняется обратное.
   *
   * Единственный честный ноль — ТОК-200: асбестовое полотно держит пламя и не
   * держит кислоту, и это ровно то «и всё», ради которого узкая специализация
   * заведена. Ноль у него ЗАПЕРТ отдельной строкой, чтобы «забыли объявить» и
   * «объявили ноль намеренно» не путались. */
  const OWN_COLUMN_ONLY = 'armor_tok200';
  for (const defId of Object.keys(table)) {
    if (defId === OWN_COLUMN_ONLY) continue;
    assert.ok(
      (ITEMS[defId].resistances?.[DamageType.BIO] ?? 0) > 0,
      `${defId}: колонка БИО обязана быть объявлена`,
    );
  }
  assert.equal(ITEMS[OWN_COLUMN_ONLY].resistances?.[DamageType.BIO], undefined, 'ТОК-200 кислоту не держит намеренно');
});

test('эталон: три ступени лестницы различимы по ФОРМЕ строки, а не по сумме', () => {
  /* Замок замысла, а не чисел. Он держит ровно то, ради чего лестница заведена:
   * начало даёт понемногу, специалист — глубину в одной колонке ценой всех
   * остальных, универсал — отсутствие дыр. Значения берутся из `ITEMS`, поэтому
   * перецена строки его не роняет, а смена ФОРМЫ роняет. */
  const row = (defId: string): number[] => DAMAGE_TYPES.map((t) => ITEMS[defId].resistances?.[t] ?? 0);
  const deepest = (r: number[]): number => Math.max(...r);
  const rest = (r: number[]): number => Math.max(...r.filter((v) => v !== deepest(r)));

  // 1. Начало: ни одной колонки глубже половины, и хотя бы четыре объявлены.
  for (const defId of ['armor_light', 'armor_medium']) {
    const r = row(defId);
    assert.ok(deepest(r) <= 50, `${defId}: начальная ступень не бывает глубокой`);
    assert.ok(r.filter((v) => v > 0).length >= 4, `${defId}: начальная ступень даёт понемногу ОТ ВСЕГО`);
  }

  // 2. Специализация: своя колонка минимум вчетверо глубже любой другой.
  for (const [defId, own] of [['armor_ozk', DamageType.BIO], ['armor_tok200', DamageType.FIRE]] as const) {
    const r = row(defId);
    assert.equal(deepest(r), r[own], `${defId}: глубже всего обязана быть своя колонка`);
    assert.ok(r[own] >= rest(r) * 4, `${defId}: специализация обязана быть УЗКОЙ (${r[own]} против ${rest(r)})`);
  }

  // 3. Универсал: объявлены все шесть, и самая слабая колонка не ниже 60 —
  //    того числа, которым лестница уже называет тяжёлую защиту (кинетика
  //    тяжёлой брони). Дыр у верхней ступени нет по определению.
  const top = row('armor_szk9');
  assert.equal(top.filter((v) => v > 0).length, DAMAGE_TYPES.length, 'СЗК-9 обязан объявить все шесть колонок');
  assert.ok(Math.min(...top) >= (ITEMS.armor_heavy.resistances?.[DamageType.KINETIC] ?? 0), 'у СЗК-9 не бывает слабой оси');
  // Баллистику он берёт на потолке лестницы — и по ОБЕИМ осям сразу, чего нет
  // ни у одного другого комплекта.
  const ballisticCeiling = ITEMS.armor_liquidator.resistances?.[DamageType.BUCKSHOT] ?? 0;
  assert.equal(top[DamageType.KINETIC], ballisticCeiling);
  assert.equal(top[DamageType.BUCKSHOT], ballisticCeiling);

  // 4. Специалист остаётся глубже универсала в своей колонке: иначе покупка за
  //    500 000 отменяет выбор, ради которого специализация и заведена.
  assert.ok(row('armor_ozk')[DamageType.BIO] > top[DamageType.BIO]);
  assert.ok(row('armor_tok200')[DamageType.FIRE] > top[DamageType.FIRE]);
  assert.ok(row('armor_cultist')[DamageType.PSI] > top[DamageType.PSI]);

  // 5. Универсал бьёт любой другой комплект в КАЖДОЙ прочей колонке.
  for (const defId of ['armor_light', 'armor_medium', 'armor_heavy', 'armor_liquidator']) {
    const r = row(defId);
    for (const t of DAMAGE_TYPES) {
      assert.ok(top[t] >= r[t], `${defId}: СЗК-9 не вправе уступать по ${DamageType[t]}`);
    }
  }
});

test('эталон: тип урона выводится из оружия, когда его не передали', () => {
  const { world, state } = scene();
  const worn = (): Entity => makeTestEntity({ id: 4, type: EntityType.NPC, armorDefId: 'armor_liquidator', x: 60, y: 60, hp: 5000, maxHp: 5000 });

  assert.equal(applyDamage(world, state, worn(), { damage: RAW, weaponId: 'makarov' }).damage, 20, 'makarov → кинетика');
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, weaponId: 'shotgun' }).damage, 15, 'shotgun → дробь');
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, weaponId: 'plasma' }).damage, 80, 'plasma → энергия');
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, weaponId: 'flamethrower' }).damage, 85, 'flamethrower → огонь');
  assert.equal(applyDamage(world, state, worn(), { damage: RAW }).damage, 20, 'без оружия — кинетика');
  // Снаряд без оружия за спиной: тип несёт сам вид снаряда.
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, projectileType: ProjType.FLAME }).damage, 85, 'ProjType.FLAME → огонь');
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, projectileType: ProjType.BFG }).damage, 80, 'ProjType.BFG → энергия');
});

test('эталон: тип удара берётся у ВИДА бьющей твари', () => {
  const { world, state } = scene();
  const worn = (): Entity => makeTestEntity({ id: 5, type: EntityType.NPC, armorDefId: 'armor_liquidator', x: 60, y: 60, hp: 5000, maxHp: 5000 });
  const biter = (kind: MonsterKind): Entity => monsterAt(kind, 61, 60);

  /* Это и есть закрытая дыра шага: у `MonsterDef` не было поля типа урона, и
   * КАЖДЫЙ удар любой твари считался кинетикой. Ряса и пластина отвечали на
   * тень и на кислоту одним и тем же числом. */
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, attacker: biter(MonsterKind.ZOMBIE) }).damage, 20, 'мертвяк — кинетика');
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, attacker: biter(MonsterKind.SHADOW) }).damage, 95, 'теневик — ПСИ');
  /* 100 → 65: с закрытием колонки БИО герметичный штурмовой комплект наконец
   * отвечает на кислоту (резист 35). До этого шага он ловил плеть слизневика
   * голым телом — это и была охраняемая дыра. */
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, attacker: biter(MonsterKind.SLIMEVIK) }).damage, 65, 'слизневик — био');
  assert.equal(applyDamage(world, state, worn(), { damage: RAW, attacker: biter(MonsterKind.ROBOT) }).damage, 80, 'робот — энергия');
  // Явный тип в вызове старше вида: рука решает, если сказала.
  assert.equal(
    applyDamage(world, state, worn(), { damage: RAW, attacker: biter(MonsterKind.SHADOW), damageType: DamageType.KINETIC }).damage,
    20,
    'сказанное прямо старше объявленного видом',
  );
});

test('эталон: порог живучести от огня работает от ЛЮБОЙ руки', () => {
  const { world, state } = scene();
  // hp растения читается из его же дефа через maxHp сущности.
  const plant = (kind: MonsterKind, hp: number): Entity => monsterAt(kind, 70, 70, { hp, maxHp: hp });

  /* Огнемёт снимает шесть за впрыск. Порог доводит удар до доли максимума —
   * и делает это ЗА ДВЕРЬЮ, то есть одинаково для снаряда, ближнего боя и
   * чужой руки. Раньше он считался до двери и только на пути снаряда. */
  assert.equal(applyDamage(world, state, plant(MonsterKind.BORSHCHEVIK, 62), { damage: 6, weaponId: 'flamethrower' }).damage, Math.ceil(62 * 0.44));
  assert.equal(applyDamage(world, state, plant(MonsterKind.BLOOD_PLANT, 96), { damage: 6, weaponId: 'flamethrower' }).damage, Math.ceil(96 * 0.38));
  // Туманная акула: газовое брюхо, порог равен полному запасу — попадание смертельно.
  assert.equal(applyDamage(world, state, plant(MonsterKind.FOG_SHARK, 18), { damage: 6, weaponId: 'flamethrower' }).damage, 18);

  // Тот же порог без всякого оружия — по одному только виду снаряда.
  assert.equal(applyDamage(world, state, plant(MonsterKind.BORSHCHEVIK, 62), { damage: 1, projectileType: ProjType.FLAME }).damage, Math.ceil(62 * 0.44));
  // Не огонь — порога нет: пуля снимает свою пулю.
  assert.equal(applyDamage(world, state, plant(MonsterKind.BORSHCHEVIK, 62), { damage: 6, weaponId: 'makarov' }).damage, 6);
  // Порог идемпотентен: путь, посчитавший его до двери, ничего не удваивает.
  assert.equal(
    applyDamage(world, state, plant(MonsterKind.BORSHCHEVIK, 62), { damage: Math.ceil(62 * 0.44), weaponId: 'flamethrower' }).damage,
    Math.ceil(62 * 0.44),
  );
});

test('матрица: у каждого вида брони есть полная строка по шести типам', () => {
  const kinds = Object.values(ArmorType).filter((v): v is ArmorType => typeof v === 'number');
  for (const kind of kinds) {
    for (const damageType of DAMAGE_TYPES) {
      const mult = armorMultiplier(kind, damageType);
      assert.equal(typeof mult, 'number', `${ArmorType[kind]}/${DamageType[damageType]}: множитель обязан быть числом`);
      assert.ok(mult > 0, `${ArmorType[kind]}/${DamageType[damageType]}: множитель обязан быть положительным`);
    }
  }
});

test('матрица: носимая броня объявляет вид, известный матрице', () => {
  const declared: Record<string, ArmorType> = {
    armor_light: ArmorType.CLOTH,
    armor_ozk: ArmorType.CLOTH,
    armor_tok200: ArmorType.CLOTH,
    armor_medium: ArmorType.PLATE,
    armor_heavy: ArmorType.PLATE,
    armor_liquidator: ArmorType.PLATE,
    armor_cultist: ArmorType.CLOTH,
    armor_szk9: ArmorType.PLATE,
  };
  for (const [defId, kind] of Object.entries(declared)) {
    const def = ITEMS[defId];
    assert.ok(def, `${defId}: предмет обязан существовать`);
    assert.equal(def.armorType, kind, `${defId}: объявленный вид брони`);
    assert.ok(ARMOR_MATRIX[def.armorType!], `${defId}: у вида обязана быть строка матрицы`);
  }
  /* РЕШЕНИЕ ПО НОСИМОЙ БРОНЕ: проценты предмета И ЕСТЬ её строка, второго слоя
   * закона поверх них нет. Строка матрицы для носимого нейтральна ровно поэтому
   * — иначе резист считался бы дважды. */
  for (const t of DAMAGE_TYPES) {
    assert.equal(armorMultiplier(ArmorType.CLOTH, t), 1, `${DamageType[t]}: ткань считают проценты предмета`);
    assert.equal(armorMultiplier(ArmorType.NONE, t), 1, `${DamageType[t]}: без брони множителя нет`);
  }
});

test('эталон: пол урона в единицу и ноль остаются на месте', () => {
  const { world, state } = scene();
  const chervie = monsterAt(MonsterKind.CHERVIE_AVATAR, 80, 80);
  const eye = monsterAt(MonsterKind.EYE, 80, 80);

  assert.equal(applyMonsterArmorHit(world, state, chervie, { damage: 0, weaponId: 'makarov' }).damage, 1, 'броня твари не отдаёт ноль');
  assert.equal(applyMonsterArmorHit(world, state, eye, { damage: 0, weaponId: 'makarov' }).damage, 0, 'без брони ноль остаётся нулём');
});

test('ось импульса осталась списками — и в них нет мёртвых идентификаторов', () => {
  /* `ARMOR_STRIP_WEAPONS` / `ARMOR_TOOL_WEAPONS` НЕ сводятся к типу урона:
   * кувалда кинетическая, но плиту срывает, а панические пули — нет. Списки
   * опознают удар по id оружия, поэтому запись, которой нет в `WEAPON_STATS`,
   * не срабатывает никогда и молча создаёт вид работающего правила. */
  const strip = ['shotgun', 'toz_shotgun', 'grenade', 'gauss', 'bfg', 'gravity_beam_emitter',
    'harpoon_gun', 'losyash_rifle', 'ptrs_liquidator', 'sledgehammer', 'axe', 'liquidator_axe',
    'chainsaw', 'crowbar', 'metal_chair'];
  const tool = ['fire_hook', 'rebar'];
  for (const id of [...strip, ...tool]) {
    assert.ok(WEAPON_STATS[id], `${id}: запись обязана существовать в реестре оружия`);
  }

  const { world, state } = scene();
  const fresh = (): Entity => monsterAt(MonsterKind.ZAKALENNAYA_ARMATURA, 90, 90, {
    monsterArmorStacks: ZAKALENNAYA_ARMATURA_ARMOR_STACKS,
    monsterArmorChip: 0,
    monsterArmorLastStripAt: -Infinity,
  });
  let clock = 500;
  for (const id of strip) {
    state.time = (clock += 10);
    assert.equal(applyMonsterArmorHit(world, state, fresh(), { damage: RAW, weaponId: id }).hitKind, 'heavy', `${id}: срывает плиту`);
  }
  for (const id of tool) {
    state.time = (clock += 10);
    assert.equal(applyMonsterArmorHit(world, state, fresh(), { damage: RAW, weaponId: id }).hitKind, 'tool', `${id}: работает как инструмент`);
  }
});

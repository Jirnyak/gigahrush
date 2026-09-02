import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { LIVING_NAMED_ROOMS } from '../src/gen/living/rooms';
import { findNamedRoom, missingNamedRooms } from '../src/gen/named_rooms';
import { allNpcPackages, getNpcPackage } from '../src/data/npc_packages';

/* Комнаты — основа мира (`rooms.md`). У комнаты, на которую ссылается контент,
 * обязано быть имя, известное системе, а не только игроку. Объявление и есть
 * источник: этаж перечисляет свои именованные комнаты, генерация роет их по этой
 * же записи, и забыть вырыть объявленное нельзя. */

const SEED = 61061;

test('жилой этаж роет всё, что объявил', () => {
  const gen = generateDesignFloor('living', SEED);
  const missing = missingNamedRooms(gen.world, LIVING_NAMED_ROOMS);
  assert.deepEqual(missing, [], `объявлено, но не вырыто: ${missing.join(', ')}`);
});

test('именованная комната опознаётся по псевдониму, а не по русскому имени', () => {
  const gen = generateDesignFloor('living', SEED);
  const lab = findNamedRoom(gen.world, 'yakov_lab');
  assert.ok(lab, 'лаборатория Якова безымянна для системы');
  assert.equal(lab.defId, 'yakov_lab');
  assert.equal(lab.type, LIVING_NAMED_ROOMS.yakov_lab.type, 'тип обязан приходить из таблицы');
  assert.equal(lab.name, LIVING_NAMED_ROOMS.yakov_lab.name, 'имя обязано приходить из таблицы');
  assert.ok(lab.tags?.includes('yakov_lab'), 'псевдоним обязан попадать в теги');
});

test('обе стратегии генератора дают одну и ту же личность комнаты', () => {
  // Стратегия A занимает готовую медкомнату, B роет новую 7×7 — какая сработает,
  // решает раскладка. Личность обязана быть одинаковой в обоих случаях.
  for (const seed of [61061, 4242, 777, 90210]) {
    const gen = generateDesignFloor('living', seed);
    const lab = findNamedRoom(gen.world, 'yakov_lab');
    assert.ok(lab, `сид ${seed}: лаборатория не объявлена`);
    assert.equal(lab.name, LIVING_NAMED_ROOMS.yakov_lab.name, `сид ${seed}: имя разъехалось`);
  }
});

test('стартовый узел объявлен целиком: зал и оружейная тоже опознаются по псевдониму', () => {
  const gen = generateDesignFloor('living', SEED);
  for (const alias of ['tutor_hall', 'armory'] as const) {
    const def = LIVING_NAMED_ROOMS[alias];
    const room = findNamedRoom(gen.world, alias);
    assert.ok(room, `${alias}: комната безымянна для системы`);
    assert.equal(room.defId, alias);
    assert.equal(room.type, def.type, `${alias}: тип обязан приходить из таблицы`);
    assert.equal(room.name, def.name, `${alias}: имя обязано приходить из таблицы`);
    assert.ok(room.tags?.includes(alias), `${alias}: псевдоним обязан попадать в теги`);
    // Население обходит учебные комнаты по тегу, и таблица обязана его сохранить.
    assert.ok(room.tags?.includes('tutorial'), `${alias}: учебный тег потерян`);
  }
});

test('личность стартового узла одинакова на разных сидах', () => {
  for (const seed of [61061, 4242, 777, 90210]) {
    const gen = generateDesignFloor('living', seed);
    for (const alias of ['tutor_hall', 'armory'] as const) {
      const room = findNamedRoom(gen.world, alias);
      assert.ok(room, `сид ${seed}: ${alias} не объявлена`);
      assert.equal(room.name, LIVING_NAMED_ROOMS[alias].name, `сид ${seed}: ${alias} — имя разъехалось`);
      assert.equal(room.type, LIVING_NAMED_ROOMS[alias].type, `сид ${seed}: ${alias} — тип разъехался`);
    }
  }
});

test('человек объявляет комнату, а не полагается на память автора модуля', () => {
  const gen = generateDesignFloor('living', SEED);
  for (const [packageId, alias] of [['yakov', 'yakov_lab'], ['barni', 'armory'], ['olga', 'tutor_hall']] as const) {
    const pack = getNpcPackage(packageId);
    assert.ok(pack, `пакет ${packageId} не зарегистрирован`);
    assert.equal(pack.placement.roomId, alias, `${packageId}: комната не объявлена`);
    assert.ok(findNamedRoom(gen.world, pack.placement.roomId), `${packageId}: объявленная комната на этаже отсутствует`);
  }
});

/* ── Замок на КЛАСС, а не на жилой этаж ────────────────────────────
 *
 * Проверка выше знает три пакета жилого поимённо, и ровно поэтому мимо неё
 * прошла Олевия Кибер: её анкета объявляла `clean_lab`, которого НИИ слизи не
 * рыл, `roomForPlacement` возвращал undefined, и человек молча уезжал по
 * ремеслу в произвольную медкомнату — на этаже, но не дома.
 *
 * Список берётся из реестра, а не из этого файла: новый пакет с псевдонимом
 * попадает под проверку сам, вместе со своим этажом. Промах ловится с той же
 * стороны, с какой его видит игра — `roomForPlacement` ищет сперва точный
 * `defId`, затем теги (`gen/plot_npc_spawn.ts`), и обе дороги здесь повторены.
 */
test('каждый объявленный псевдоним комнаты вырыт на своём этаже', () => {
  const byFloor = new Map<string, { packageId: string; alias: string }[]>();
  for (const pack of allNpcPackages()) {
    const alias = pack.placement.roomId;
    if (!alias) continue;
    const floorKey = pack.placement.homeFloorKey;
    // Псевдоним без этажа адресовать некуда: чинить надо анкету, а не тест.
    assert.ok(floorKey, `${pack.id}: комната объявлена, а домашний этаж — нет`);
    const floorId = floorKey.replace(/^design:/, '');
    if (!byFloor.has(floorId)) byFloor.set(floorId, []);
    byFloor.get(floorId)!.push({ packageId: pack.id, alias });
  }
  assert.ok(byFloor.size > 0, 'ни один пакет не объявил комнату — реестр не собрался');

  for (const [floorId, declared] of byFloor) {
    const gen = generateDesignFloor(floorId, SEED);
    for (const { packageId, alias } of declared) {
      const room = findNamedRoom(gen.world, alias)
        ?? gen.world.rooms.find(candidate => candidate?.tags?.some(tag => tag === alias));
      assert.ok(room, `${floorId}: ${packageId} объявил комнату «${alias}», которую этаж не роет`);
    }
  }
});

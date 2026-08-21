/* ── Стенка на стенку: арена двух сторон ─────────────────────────
 *
 *   Замок на трёх вещах, ради которых этаж и делался, и каждая из них —
 *   общий механизм, а не собственный код этажа:
 *     1) две стороны монстров реально враждебны через матрицу отношений;
 *     2) гнездо передаёт приплоду фракцию и поводок;
 *     3) кратчайший путь из гнезда к своей цели идёт по СВОЕЙ линии.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity, type Msg } from '../src/core/types';
import { isHostile } from '../src/systems/factions';
import { initFactionRelations } from '../src/data/relations';
import { updateMatkaSource } from '../src/systems/matka_source';
import { MONSTERS } from '../src/entities/monster';
import { monsterPackMode } from '../src/data/monster_ecology';
import { designFloorById } from '../src/data/design_floors';
import { bakeNavigationTree, subcellToWorld, tryAssignPathToCell } from '../src/systems/ai/pathfinding';
import { generateStenkaDesignFloor } from '../src/gen/stenka';
import { buildLanes, lanePointAt } from '../src/gen/stenka/geometry';
import { LANE_IDS } from '../src/gen/stenka/meta';

// Матрица отношений — живое состояние забега, а не константа: без инициализации
// все пары читаются нейтральными, и войны на арене просто нет.
initFactionRelations();

function monster(id: number, kind: MonsterKind, faction?: Faction): Entity {
  return {
    id, type: EntityType.MONSTER, monsterKind: kind,
    x: 10.5, y: 10.5, angle: 0, pitch: 0, alive: true, speed: 1,
    sprite: 0, hp: 50, maxHp: 50, faction,
  };
}

test('экология монстров остаётся одной стороной, пока вид не объявлен сторонним', () => {
  const a = monster(1, MonsterKind.SBORKA);
  const b = monster(2, MonsterKind.TVAR);
  assert.equal(isHostile(a, b), false);
  assert.equal(isHostile(b, a), false);

  // Стороной делает флаг ВИДА, а не проставленное поле: фракция на обычном
  // монстре не должна ничего переключать, иначе случайное поле переводит всю
  // экологию на человеческие правила.
  const strayLiq = monster(3, MonsterKind.SBORKA, Faction.LIQUIDATOR);
  const strayWild = monster(4, MonsterKind.TVAR, Faction.WILD);
  assert.equal(isHostile(strayLiq, strayWild), false, 'без флага sided вражды между монстрами нет');
});

test('монстры с объявленными фракциями воюют по общей матрице отношений', () => {
  const liq = monster(1, MonsterKind.BOEC, Faction.LIQUIDATOR);
  const wild = monster(2, MonsterKind.BOEC, Faction.WILD);
  const kin = monster(3, MonsterKind.BOEC, Faction.LIQUIDATOR);

  assert.equal(isHostile(liq, wild), true, 'ликвидаторы и дикие враждебны в матрице');
  assert.equal(isHostile(wild, liq), true);
  assert.equal(isHostile(liq, kin), false, 'свои не дерутся между собой');

  // Против обычной экологии сторона ведёт себя как фракция человека: сборка
  // ликвидатору враг, потому что таблица «фракция-монстры» так и говорит.
  assert.equal(isHostile(liq, monster(4, MonsterKind.SBORKA)), true);
});

test('игрок читается через ту же матрицу, а не через таблицу «фракция-монстры»', () => {
  const player: Entity = {
    id: 99, type: EntityType.PLAYER, x: 1.5, y: 1.5, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: 0, hp: 100, maxHp: 100, faction: Faction.PLAYER,
  };
  const liq = monster(1, MonsterKind.BOEC, Faction.LIQUIDATOR);
  const wild = monster(2, MonsterKind.BOEC, Faction.WILD);
  const feral = monster(3, MonsterKind.SBORKA);

  assert.equal(isHostile(liq, player), false, 'ликвидаторы игроку дружелюбны');
  assert.equal(isHostile(wild, player), true, 'дикие враждебны всем');
  assert.equal(isHostile(feral, player), true, 'обычная экология игроку по-прежнему враг');
  assert.equal(isHostile(player, feral), true);
});

test('гнездо объявлено источником и отдаёт приплоду сторону и поводок', () => {
  const gnezdo = MONSTERS[MonsterKind.GNEZDO].source;
  assert.ok(gnezdo, 'гнездо объявляет себя источником данными, а не проверкой на вид');
  assert.deepEqual([...gnezdo.childKinds], [MonsterKind.BOEC]);

  const gen = generateStenkaDesignFloor(4404);
  const source = gen.entities.find(e => e.monsterKind === MonsterKind.GNEZDO && e.faction === Faction.WILD)!;
  assert.ok(source, 'на арене есть гнездо диких');
  const homeRoomId = source.ai!.homeRoomId;
  assert.equal(typeof homeRoomId, 'number');

  const msgs: Msg[] = [];
  const nextId = { v: 90000 };
  const byId = new Map(gen.entities.map(e => [e.id, e]));
  const before = gen.entities.length;
  updateMatkaSource(gen.world, gen.entities, source, 1, 0, msgs, nextId, byId);

  const child = gen.entities[gen.entities.length - 1];
  assert.equal(gen.entities.length, before + 1, 'источник выпустил бойца');
  assert.equal(child.monsterKind, MonsterKind.BOEC);
  assert.equal(child.faction, Faction.WILD, 'сторона наследуется');
  assert.equal(child.ai?.homeRoomId, homeRoomId, 'поводок наследуется — это и есть маршрут');
  assert.equal(msgs.length, 0, 'молчаливый источник не засоряет лог каждой волной');
});

test('боец объявлен территориальным — марш держится на общем поводке стаи', () => {
  assert.equal(monsterPackMode(MonsterKind.BOEC), 'territorial');
  assert.equal(MONSTERS[MonsterKind.BASHNYA].speed, 0, 'башня неподвижна');
  assert.equal(MONSTERS[MonsterKind.BASHNYA].isRanged, true);
  assert.equal(MONSTERS[MonsterKind.GNEZDO].speed, 0, 'гнездо неподвижно');
});

test('этаж занял слот -44 и расставил три линии, гнёзда и башни', () => {
  const route = designFloorById('stenka');
  assert.ok(route);
  assert.equal(route.z, -44);
  assert.equal(route.displayName, 'Стенка на стенку');

  const gen = generateStenkaDesignFloor(4404);
  const nests = gen.entities.filter(e => e.monsterKind === MonsterKind.GNEZDO);
  const towers = gen.entities.filter(e => e.monsterKind === MonsterKind.BASHNYA);

  assert.equal(nests.length, LANE_IDS.length * 2, 'по гнезду на каждую линию с каждой стороны');
  assert.ok(towers.length >= LANE_IDS.length * 4, 'башни стоят на линиях');
  assert.equal(nests.filter(e => e.faction === Faction.LIQUIDATOR).length, LANE_IDS.length);
  assert.equal(nests.filter(e => e.faction === Faction.WILD).length, LANE_IDS.length);
  assert.ok(gen.entities.filter(e => e.monsterKind !== MonsterKind.LOGOVO).every(e => e.faction !== undefined),
    'всё на линиях носит сторону; бесфракционны только логова леса');

  // Рубежи и базы — реальные комнаты, иначе поводку некуда указывать.
  const named = gen.world.rooms.filter(Boolean).map(r => r.name);
  assert.ok(named.some(n => n.includes('база ликвидаторов')));
  assert.ok(named.some(n => n.includes('логово диких')));
  assert.equal(named.filter(n => n.includes('рубеж')).length, LANE_IDS.length * 2);
});

test('нейтралы леса враждебны обеим командам, а экология между собой — нет', () => {
  // Сторонний монстр — член фракции целиком: против ОБЫЧНОЙ экологии он читает
  // ту же таблицу «фракция-монстры», что человек его фракции. Иначе боец
  // проходил бы мимо тени, которую тот же ликвидатор-человек атакует.
  const liq = monster(1, MonsterKind.BOEC, Faction.LIQUIDATOR);
  const wild = monster(2, MonsterKind.BOEC, Faction.WILD);
  const feral = monster(3, MonsterKind.SHADOW);
  const feral2 = monster(4, MonsterKind.POLZUN);

  assert.equal(isHostile(liq, feral), true, 'ликвидаторский боец дерётся с нейтралом');
  assert.equal(isHostile(feral, liq), true, 'и нейтрал с ним — связь симметрична');
  assert.equal(isHostile(wild, feral), true, 'дикий боец тоже');
  assert.equal(isHostile(feral, feral2), false, 'а экология между собой по-прежнему не дерётся');
});

test('логова лесных лагерей неубиваемы геометрией и рожают нейтралов', () => {
  const gen = generateStenkaDesignFloor(4404);
  const world = gen.world;
  const dens = gen.entities.filter(e => e.monsterKind === MonsterKind.LOGOVO);

  assert.ok(dens.length > 0, 'у лагерей есть логова');
  for (const den of dens) {
    // Неубиваемость держится камнем, а не числом хитов: логово стоит В СТЕНЕ,
    // куда нет ни прохода, ни линии выстрела.
    assert.equal(world.cells[world.idx(Math.floor(den.x), Math.floor(den.y))], Cell.WALL,
      `${den.name}: логово обязано стоять в толще стены`);
    assert.equal(den.faction, undefined, `${den.name}: у логова нет стороны`);
  }

  // Каждое логово обязано УМЕТЬ родить: логово в углу кармана регулярно не
  // находит места для выводка, и лагерь молча остаётся пустым.
  const msgs: Msg[] = [];
  const nextId = { v: 90000 };
  for (const den of dens) {
    const byId = new Map(gen.entities.map(e => [e.id, e]));
    const before = gen.entities.length;
    updateMatkaSource(world, gen.entities, den, 1, 0, msgs, nextId, byId);
    assert.equal(gen.entities.length, before + 1, `${den.name}: логово не нашло места для выводка`);
    const child = gen.entities[gen.entities.length - 1];
    assert.equal(child.faction, undefined, 'выводок логова остаётся обычной экологией');
    assert.equal(world.cells[world.idx(Math.floor(child.x), Math.floor(child.y))], Cell.FLOOR,
      'выводок выходит на пол кармана, а не в камень');
  }
});

test('каждое гнездо ведёт своих по СВОЕЙ линии, а не по общей кратчайшей', () => {
  // Главный замок этажа. Всё остальное — расстановка, а вот это проверяет
  // саму задумку: что три линии не схлопнутся в одну. Считаем не по глазу и
  // не по прямой, а той же навигацией, которой ходит AI.
  const gen = generateStenkaDesignFloor(4404);
  const world = gen.world;
  bakeNavigationTree(world);

  const lanes = buildLanes();
  const samples = lanes.map(lane => {
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= 200; s++) pts.push(lanePointAt(lane, s / 200));
    return { id: lane.id, pts };
  });
  const nearestLane = (x: number, y: number): string => {
    let best = 'none';
    let bd = Infinity;
    for (const sample of samples) {
      for (const p of sample.pts) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = sample.id; }
      }
    }
    return best;
  };

  const nests = gen.entities.filter(e => e.monsterKind === MonsterKind.GNEZDO);
  assert.equal(nests.length, LANE_IDS.length * 2);

  for (const nest of nests) {
    const target = world.rooms[nest.ai!.homeRoomId!];
    assert.ok(target, `${nest.name}: цель марша — существующая комната`);

    const probe: Entity = {
      id: 777777, type: EntityType.MONSTER, monsterKind: MonsterKind.BOEC,
      x: nest.x, y: nest.y, angle: 0, pitch: 0, alive: true, speed: 1, sprite: 0,
      hp: 46, maxHp: 46, faction: nest.faction,
      ai: { goal: AIGoal.WANDER, tx: nest.x, ty: nest.y, path: [], pi: 0, stuck: 0, timer: 0 },
    };
    const status = tryAssignPathToCell(world, probe, target.x + (target.w >> 1), target.y + (target.h >> 1));
    assert.equal(status, 'assigned', `${nest.name}: путь до чужого рубежа обязан находиться`);

    const path = probe.ai!.path;
    assert.ok(path.length > 100, `${nest.name}: маршрут не должен быть коротким огрызком`);

    const own = nest.name!.match(/\((top|mid|bot)\)/)![1];
    let onOwn = 0;
    let sampled = 0;
    const step = Math.max(1, Math.floor(path.length / 60));
    for (let i = 0; i < path.length; i += step) {
      // `ai.path` хранит ПОДклетки, а не клетки: декодировать их как клетки —
      // самая простая ошибка здесь, и она даёт правдоподобную чушь.
      const [x, y] = subcellToWorld(path[i]);
      if (nearestLane(x, y) === own) onOwn++;
      sampled++;
    }
    assert.ok(onOwn / sampled > 0.9,
      `${nest.name}: марш должен идти по своей линии, а вышло ${Math.round(onOwn / sampled * 100)}%`);
  }
});

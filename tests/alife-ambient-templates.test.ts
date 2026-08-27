import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { initFactionRelations } from '../src/data/relations';
import { seedGlobalRng } from '../src/core/rand';
import {
  alifeNpcRecordCount,
  captureAlifeFloorState,
  currentAlifeFloorKey,
  isAmbientNpcCandidate,
  materializeAlifeFloorPopulation,
  needsAlifeAdoption,
  recordAlifeNpcDeath,
} from '../src/systems/alife';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { makeGameState } from './helpers';
import { testGenerationMatrix } from './generator_helpers';

/* Шаблон расстановки — тело без личности, и опознаётся он по ОТСУТСТВИЮ
 * личности: нет записи A-Life, нет авторского пакета, нет сюжетного слота, нет
 * выданного квеста. Больше ни по чему.
 *
 * Замок стоит потому, что предикат однажды спрашивал ещё и «а имени точно нет?».
 * Имя телу даёт генератор этажа, и это его право: министерство подписывает
 * каждого служащего (`nm.name`). Цена одной лишней проверки — два закона проекта
 * разом:
 *
 *   1. Смерть перестала быть постоянным фактом. На министерстве находилось НОЛЬ
 *      шаблонов из 2070 тел, блок материализации пропускался целиком, и игрок,
 *      вырезавший этаж, находил 2000 живых после поездки на лифте.
 *   2. Появился запрещённый добор населения. Цикл усыновления заводил на те же
 *      тела 2000 НОВЫХ личностей за визит; тем же способом текли `underhell`
 *      (161), `maintenance` (511), `floor_69` (299), `communal_ring` (171).
 *      Круг маршрута прибавлял к пулу около 3300 человек, а на потолке
 *      (`ALIFE_POPULATION_CAPACITY`) прибывший начинал переписывать запись
 *      живого нетронутого жителя — имя, фракцию, семью, отношения, — и человек
 *      исчезал, не умерев.
 *
 * Поэтому проверяется не сам предикат, а его следствия на настоящих этажах. */

const SEED = 61061;
/** Номера материализованных: по ним видно, кто пришёл из пула, а кто стоял. */
const MARK = 2_000_000;

/**
 * Порог «этаж несёт обычное население». Ниже него живут авторские этажи с явным
 * `npcTarget: 0` (чердак техслужб — 4 тела, подъезд ПОДАД — 2): там шаблонов нет
 * по замыслу, и требовать их значит требовать населения, которого этаж не хочет.
 */
const POPULATED_FLOOR_BODIES = 100;

function liveNpcs(entities: readonly Entity[]): Entity[] {
  return entities.filter(e => e.type === EntityType.NPC && e.alive);
}

function freshFloor(id: string): { world: ReturnType<typeof generateDesignFloor>['world']; entities: Entity[] } {
  initFactionRelations();
  seedGlobalRng(SEED);
  const gen = generateDesignFloor(id as never, SEED);
  return { world: gen.world, entities: gen.entities as Entity[] };
}

testGenerationMatrix('населённый дизайн-этаж отдаёт A-Life шаблоны, а не готовых жильцов', () => {
  const empty: string[] = [];
  const thin: string[] = [];
  for (const route of DESIGN_FLOOR_ROUTES) {
    const { entities } = freshFloor(route.id);
    const bodies = liveNpcs(entities);
    if (bodies.length < POPULATED_FLOOR_BODIES) continue;
    const templates = bodies.filter(isAmbientNpcCandidate);
    if (templates.length === 0) empty.push(`${route.id}: 0 шаблонов при ${bodies.length} телах`);
    // Не шаблоны — только авторские: сюжетные слоты, пакеты NPC, актёры событий.
    // Их всегда меньшинство; замерено 0.95..1.00 доли шаблонов на всех этажах.
    else if (templates.length < bodies.length * 0.9) {
      thin.push(`${route.id}: ${templates.length} шаблонов из ${bodies.length} тел`);
    }
  }
  assert.deepEqual(empty, [], `этажей без единого шаблона: ${empty.length}\n${empty.join('\n')}`);
  assert.deepEqual(thin, [], `этажей, где шаблоны в меньшинстве: ${thin.length}\n${thin.join('\n')}`);
});

/* Этажи взяты как разные способы населять мир: министерство подписывает своих
 * служащих поимённо (тот самый случай), нижний пропускник — тоже, коллекторы
 * несут авторских актёров рядом с толпой, жилой и квартиры населяются общей
 * расстановкой. */
const VISITED = ['ministry', 'underhell', 'maintenance', 'living'] as const;

for (const floorId of VISITED) {
  test(`этаж ${floorId}: визит не заводит новых личностей сверх авторских актёров`, () => {
    const { world, entities } = freshFloor(floorId);
    const bodies = liveNpcs(entities);
    // Кого шаблоном не признают и кто при этом без записи — тот и будет усыновлён.
    // Это актёры, которым генератор не проставил `questId` вовсе (телохранители
    // Махно на коллекторах). Личность им положена, но их единицы.
    const expected = bodies.filter(e => needsAlifeAdoption(e) && !isAmbientNpcCandidate(e)).length;
    assert.ok(expected < bodies.length * 0.01, `${floorId}: усыновляемых ${expected} из ${bodies.length} — это уже добор населения`);

    const state = makeGameState() as GameState;
    const poolBefore = alifeNpcRecordCount(state);
    materializeAlifeFloorPopulation(state, world, entities, { v: MARK }, `design:${floorId}`);

    assert.equal(alifeNpcRecordCount(state) - poolBefore, expected);
    assert.ok(
      liveNpcs(entities).some(e => e.id >= MARK),
      `${floorId}: ни один житель не пришёл из пула A-Life`,
    );
  });
}

test('министерство: убитые не воскресают после ухода и возвращения', () => {
  const KILLED = 40;
  const ministryZ = DESIGN_FLOOR_ROUTES.find(route => route.id === 'ministry')!.z;
  const state = makeGameState({ currentZ: ministryZ }) as GameState;
  setFloorRunState(state, undefined);
  const floorKey = 'design:ministry';
  // Смерть записывается на ТЕКУЩИЙ этаж прогона, поэтому он обязан быть тем же.
  assert.equal(currentAlifeFloorKey(state), floorKey);

  const first = freshFloor('ministry');
  materializeAlifeFloorPopulation(state, first.world, first.entities, { v: MARK }, floorKey);
  const materialized = liveNpcs(first.entities).filter(e => e.alifeId !== undefined && e.id >= MARK);
  assert.ok(materialized.length > KILLED, `министерство подняло из пула ${materialized.length} человек — проверять нечего`);

  const doomed = new Set<number>();
  for (let i = 0; i < KILLED; i++) {
    const victim = materialized[i * 7 % materialized.length];
    if (doomed.has(victim.alifeId!)) continue;
    victim.alive = false;
    victim.hp = 0;
    recordAlifeNpcDeath(state, victim);
    doomed.add(victim.alifeId!);
  }
  const aliveBefore = liveNpcs(first.entities).length;

  // Уход с этажа: живое состояние сворачивается в записи, смерть становится фактом.
  captureAlifeFloorState(state, first.entities);

  // Возвращение: этаж строится заново и снова просит у A-Life людей.
  const second = freshFloor('ministry');
  materializeAlifeFloorPopulation(state, second.world, second.entities, { v: MARK }, floorKey);

  const revived = liveNpcs(second.entities).filter(e => e.alifeId !== undefined && doomed.has(e.alifeId));
  assert.deepEqual(revived.map(e => e.alifeId), [], `${revived.length} убитых вернулись живыми`);
  // Дыра остаётся дырой: место убитого не отдаётся следующему из пула.
  assert.ok(
    liveNpcs(second.entities).length <= aliveBefore,
    `на этаже стало больше людей, чем было до убийств: ${liveNpcs(second.entities).length} против ${aliveBefore}`,
  );
});

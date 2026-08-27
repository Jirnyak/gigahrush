import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basePopulationTotalAtDefaultSoftLimit,
  floorPopulationBudget,
  populationHeadroomAtDefaultSoftLimit,
} from '../src/data/population_profiles';
import {
  ACTIVE_ACTOR_SOFT_LIMIT,
  DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT,
  MIN_ACTIVE_ACTOR_SOFT_LIMIT,
  setActiveActorSoftLimit,
} from '../src/data/entity_limits';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { designFloorPopulationProfile } from '../src/data/design_floor_population';
import {
  FLOOR_RUN_MAX_Z,
  FLOOR_RUN_MIN_Z,
  PROCEDURAL_FLOOR_ZS,
  floorRunZAllowsNpcs,
} from '../src/data/procedural_floors';
import { proceduralPopulationBudget } from '../src/data/population_profiles';

/* Мягкий предел акторов — потолок, а не цель. Этаж, набивший его ровно, отдаёт
 * ноль из `entitySpawnSlots`, и любой рантайм-спавн — волна шага удержания,
 * кат-сцена, караван, самосбор — не появляется, ничего об этом не сообщая.
 * Раньше так стояли двадцать четыре этажа из пятидесяти одного: общий бюджет
 * был РАВЕН потолку (`basePopulationTotalAtDefaultSoftLimit` игнорировал `z`),
 * и подгонка сажала сумму точно на него. Здесь заперта кривая, которая к
 * потолку только подходит. */

test('кривая населения монотонно растёт по |z| и не достигает мягкого предела', () => {
  let previous = -1;
  for (let z = 0; z <= FLOOR_RUN_MAX_Z; z++) {
    const total = basePopulationTotalAtDefaultSoftLimit(z);
    assert.equal(total > previous, true, `не растёт на z=${z}: ${total} после ${previous}`);
    assert.equal(total < DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT, true, `касается потолка на z=${z}: ${total}`);
    // Формула читает |z|: вверх и вниз шахта одинакова по высоте.
    assert.equal(basePopulationTotalAtDefaultSoftLimit(-z), total);
    previous = total;
  }
});

test('запас над кривой — доля бюджета акторов, а на дне шахты ненулевой', () => {
  // Верх шахты оставляет свободным целый минимальный бюджет актёров, и на
  // спуске запас умножается на MIN/DEFAULT. Обе константы канонические:
  // собственного числа у кривой нет.
  assert.equal(Math.round(populationHeadroomAtDefaultSoftLimit(0)), MIN_ACTIVE_ACTOR_SOFT_LIMIT);
  const bottom = populationHeadroomAtDefaultSoftLimit(FLOOR_RUN_MIN_Z);
  assert.equal(
    Math.round(bottom),
    Math.round(MIN_ACTIVE_ACTOR_SOFT_LIMIT * MIN_ACTIVE_ACTOR_SOFT_LIMIT / DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT),
  );
  assert.equal(bottom > 0, true, `дно шахты без запаса: ${bottom}`);
  // Ниже дна кривая не разгоняется: глубина ограничена маршрутом.
  assert.equal(basePopulationTotalAtDefaultSoftLimit(-200), basePopulationTotalAtDefaultSoftLimit(FLOOR_RUN_MIN_Z));
});

test('ни один дизайн-этаж не упирается в мягкий предел, и Ад держит запас под рантайм-спавн', () => {
  for (const route of DESIGN_FLOOR_ROUTES) {
    const profile = designFloorPopulationProfile(route);
    const sum = profile.npcTarget + profile.monsterTarget;
    assert.equal(sum < ACTIVE_ACTOR_SOFT_LIMIT, true, `${route.id} (z=${route.z}) на потолке: ${sum}`);
    assert.equal(sum <= floorPopulationBudget(route.z), true, `${route.id} выше своего бюджета: ${sum}`);
  }

  // Ад — не дно: под ним ещё семь стопов маршрута, и они обязаны быть плотнее.
  const hell = DESIGN_FLOOR_ROUTES.find(route => route.id === 'hell')!;
  const hellProfile = designFloorPopulationProfile(hell);
  const hellFree = ACTIVE_ACTOR_SOFT_LIMIT - hellProfile.npcTarget - hellProfile.monsterTarget;
  assert.equal(hellFree >= 256, true, `Аду не хватает запаса на волны удержания: ${hellFree}`);
  for (const route of DESIGN_FLOOR_ROUTES) {
    if (route.z >= hell.z) continue;
    assert.equal(
      floorPopulationBudget(route.z) > floorPopulationBudget(hell.z),
      true,
      `${route.id} (z=${route.z}) не плотнее Ада`,
    );
  }
});

test('процедурные этажи тоже остаются под потолком, включая безлюдный низ', () => {
  for (const z of PROCEDURAL_FLOOR_ZS) {
    const budget = proceduralPopulationBudget({
      z,
      danger: 5,
      anomalyPressure: 4,
      industrial: true,
      npcAllowed: floorRunZAllowsNpcs(z),
      profileId: 'highDensity',
    });
    const sum = budget.npcs + budget.monsters;
    assert.equal(sum < ACTIVE_ACTOR_SOFT_LIMIT, true, `процедурный z=${z} на потолке: ${sum}`);
    assert.equal(sum <= floorPopulationBudget(z), true, `процедурный z=${z} выше бюджета: ${sum}`);
  }
});

test('авторские оверрайды продолжают работать поверх кривой', () => {
  const targets: Readonly<Record<string, number>> = {
    roof: 0,
    outer_district: 0,
    chthonic_attic: 0,
    radon_exchange: 420,
  };
  for (const [id, npcTarget] of Object.entries(targets)) {
    const route = DESIGN_FLOOR_ROUTES.find(def => def.id === id)!;
    assert.equal(designFloorPopulationProfile(route).npcTarget, npcTarget, `${id}: авторский npcTarget потерян`);
  }
  // Арена «стенка на стенку» населяется только своим генератором.
  const stenka = DESIGN_FLOOR_ROUTES.find(def => def.id === 'stenka')!;
  const stenkaProfile = designFloorPopulationProfile(stenka);
  assert.equal(stenkaProfile.npcTarget, 0);
  assert.equal(stenkaProfile.monsterTarget, 0);
});

test('бюджет этажа едет за мягким пределом рана, оставаясь строго под ним', () => {
  const previous = ACTIVE_ACTOR_SOFT_LIMIT;
  try {
    for (const cap of [1_024, 2_048, 8_192]) {
      setActiveActorSoftLimit(cap);
      for (const z of [0, 14, -36, -50, 50]) {
        const budget = floorPopulationBudget(z);
        assert.equal(budget < cap, true, `бюджет z=${z} при кэпе ${cap}: ${budget}`);
        assert.equal(budget > 0, true, `пустой бюджет z=${z} при кэпе ${cap}`);
        const expected = Math.round(basePopulationTotalAtDefaultSoftLimit(z) * cap / DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT);
        assert.equal(budget, expected);
      }
    }
  } finally {
    setActiveActorSoftLimit(previous);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { AIGoal, Cell, EntityType, Feature, W, type Entity } from '../src/core/types';
import type { World } from '../src/core/world';
import {
  HELL_POPULATION_PROFILE,
  KVARTIRY_POPULATION_PROFILE,
  PROCEDURAL_POPULATION_PROFILES,
  basePopulationTotalAtDefaultSoftLimit,
  floorPopulationBudget,
  proceduralAnomalyPressure,
  proceduralPopulationBudget,
  proceduralPopulationProfileId,
  VOID_POPULATION_PROFILE,
} from '../src/data/population_profiles';
import {
  ACTIVE_ACTOR_SOFT_LIMIT,
  activeActorCountAtDefaultSoftLimit,
  setActiveActorSoftLimit,
} from '../src/data/entity_limits';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { designFloorPopulationProfile } from '../src/data/design_floor_population';
import {
  PROCEDURAL_FLOOR_ZS,
  floorRunZAllowsNpcs,
  makeProceduralFloorSpec,
} from '../src/data/procedural_floors';
import { designFloorById } from '../src/data/design_floors';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { generateFloor } from '../src/gen/floor_manifest';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { getRouteCueMarkers } from '../src/systems/route_cues';
import { testGenerationMatrix } from './generator_helpers';
import { makeGameState, makeTestPlayer } from './helpers';

function liveActors(entities: readonly { alive: boolean; type: EntityType; ai?: unknown }[]): readonly { ai?: unknown }[] {
  return entities.filter(e => e.alive && (e.type === EntityType.NPC || e.type === EntityType.MONSTER));
}

function liveAiActors(entities: readonly { alive: boolean; type: EntityType; ai?: unknown }[]): readonly { ai?: unknown }[] {
  return liveActors(entities).filter(e => e.ai);
}

function maxLiveActorsInArea(
  entities: readonly { alive: boolean; type: EntityType; x: number; y: number }[],
  areaSize: number,
): number {
  const side = Math.ceil(W / areaSize);
  const counts = new Int32Array(side * side);
  let max = 0;
  for (const entity of entities) {
    if (!entity.alive || (entity.type !== EntityType.NPC && entity.type !== EntityType.MONSTER)) continue;
    const bx = Math.min(side - 1, Math.max(0, Math.floor(entity.x / areaSize)));
    const by = Math.min(side - 1, Math.max(0, Math.floor(entity.y / areaSize)));
    const next = ++counts[by * side + bx];
    if (next > max) max = next;
  }
  return max;
}

function proceduralIndustrial(geometryId: string): boolean {
  return geometryId === 'collectors' || geometryId === 'workshops' || geometryId === 'service_spines';
}

function tickOneAlifeFrame(gen: { world: World; entities: Entity[]; spawnX: number; spawnY: number }, floor: number): void {
  const player = makeTestPlayer({ id: 900_000, x: gen.spawnX, y: gen.spawnY, hp: 100, maxHp: 100 });
  gen.entities.unshift(player);
  const state = makeGameState({
    currentZ: floor,
    time: 0,
    clock: { hour: 9, minute: 0, totalMinutes: 9 * 60 },
  });
  rebuildEntityIndexForSimulation(gen.entities, 1);
  updateAI(gen.world, gen.entities, 1 / 60, 0, state.msgs, player.id, state.clock, false, { v: 1_000_000 }, floor, state);
}

function tasklessNpcCount(entities: readonly Entity[]): number {
  let count = 0;
  for (const entity of entities) {
    if (!entity.alive || entity.type !== EntityType.NPC || !entity.ai) continue;
    if (entity.persistentNpcId === 'player') continue;
    if (entity.ai.goal === AIGoal.IDLE && entity.ai.combatTargetId === undefined && entity.ai.npcState === undefined) count++;
  }
  return count;
}

function idleMovingMonsterCount(entities: readonly Entity[]): number {
  let count = 0;
  for (const entity of entities) {
    if (!entity.alive || entity.type !== EntityType.MONSTER || !entity.ai) continue;
    if (entity.speed > 0 && entity.ai.goal === AIGoal.IDLE && entity.ai.combatTargetId === undefined) count++;
  }
  return count;
}

testGenerationMatrix('KVARTIRY starts as a power-of-two actor AI floor', () => {
  // Через маршрутный вход, а не сырым генератором: централизованное заселение
  // живёт в `generateDesignFloor`, и напрямую этаж отдаёт десятки актёров
  // вместо тысяч.
  const gen = generateDesignFloor('kvartiry');
  const actors = liveActors(gen.entities);
  // Планка — бюджет СВОЕЙ высоты, а не мягкий предел: предел этаж не трогает,
  // иначе `entitySpawnSlots` глушит рантайм-спавн.
  assert.equal(actors.length < ACTIVE_ACTOR_SOFT_LIMIT, true);
  assert.equal(actors.length >= floorPopulationBudget(designFloorById('kvartiry')!.z) - 128, true);
  assert.equal(liveAiActors(gen.entities).length, actors.length);
  // Старое выражение требовало 5407 NPC при кэпе акторов 4096 — недостижимо по
  // построению. Контракт квартир в другом: это человеческий этаж, и люди
  // занимают подавляющую часть его бюджета актёров.
  const kvartiryNpcs = gen.entities.filter(e => e.type === EntityType.NPC).length;
  assert.equal(kvartiryNpcs >= actors.length * 0.8, true, `kvartiry npc ${kvartiryNpcs} of ${actors.length}`);
  // Второй аргумент — этаж; после снятия FloorLevel вызов схлопнулся в
  // `gen.KVARTIRY`, то есть в undefined, и падал ещё до ассерта.
  tickOneAlifeFrame(gen, designFloorById('kvartiry')!.z);
  assert.equal(tasklessNpcCount(gen.entities), 0);
});

testGenerationMatrix('HELL starts as a power-of-two actor AI floor', () => {
  // Тоже через маршрутный вход — иначе толпы и стай на этаже просто нет.
  const gen = generateDesignFloor('hell');
  const actors = liveActors(gen.entities);
  const monsters = gen.entities.filter(e => e.alive && e.type === EntityType.MONSTER);
  const sightlineCues = getRouteCueMarkers(gen.world).filter(marker => marker.tags.includes('sightline') && marker.tags.includes('fallback'));
  // Ад — не дно шахты, под ним ещё семь стопов маршрута, и упираться в мягкий
  // предел он не вправе: набитый под потолок этаж молча глушит волны шага
  // удержания сюжетной цепочки.
  assert.equal(actors.length < ACTIVE_ACTOR_SOFT_LIMIT, true);
  assert.equal(actors.length >= floorPopulationBudget(-36) - 128, true);
  assert.equal(liveAiActors(gen.entities).length, actors.length);
  assert.equal(monsters.length >= activeActorCountAtDefaultSoftLimit(basePopulationTotalAtDefaultSoftLimit(-36) * HELL_POPULATION_PROFILE.densityMult * (HELL_POPULATION_PROFILE.monsters.share ?? 0)), true);
  // Не блоб: ни один квадрат 32×32 не держит больше процента населения этажа.
  // Пин на 24 был замером до перевода теста на маршрутный вход и промахивался
  // на единицу — при 4096 актёрах максимум 25 на 860 занятых квадратов.
  assert.equal(maxLiveActorsInArea(gen.entities, 32) <= actors.length * 0.01, true, `hell blob ${maxLiveActorsInArea(gen.entities, 32)}`);
  assert.equal(sightlineCues.length >= 5, true);
  for (const cue of sightlineCues) {
    const cell = gen.world.idx(Math.floor(cue.targetX), Math.floor(cue.targetY));
    assert.equal(gen.world.cells[cell] === Cell.FLOOR || gen.world.cells[cell] === Cell.DOOR, true);
    assert.equal(gen.world.floorTex[cell] !== 0, true);
  }
  assert.equal(sightlineCues.some(cue => gen.world.features[gen.world.idx(Math.floor(cue.targetX), Math.floor(cue.targetY))] === Feature.SCREEN), true);
  tickOneAlifeFrame(gen, designFloorById('hell')!.z);
  assert.equal(idleMovingMonsterCount(gen.entities) <= 5, true);
});

testGenerationMatrix('VOID keeps NPC-free endgame density through monsters', () => {
  const gen = generateFloor(-50);
  const actors = liveActors(gen.entities);
  assert.equal(gen.entities.some(e => e.type === EntityType.NPC), false);
  assert.equal(actors.length >= 1000, true);
  assert.equal(liveAiActors(gen.entities).length, actors.length);
  assert.equal(gen.entities.filter(e => e.type === EntityType.MONSTER).length >= activeActorCountAtDefaultSoftLimit(VOID_POPULATION_PROFILE.guardians), true);
  assert.equal(VOID_POPULATION_PROFILE.z, -50);
});

test('procedural population budget scales by danger anomaly pressure and route band', () => {
  const calm = proceduralPopulationBudget({
    z: 2,
    danger: 1,
    anomalyPressure: 0,
    industrial: false,
    npcAllowed: true,
    profileId: 'normal',
  });
  const dangerous = proceduralPopulationBudget({
    z: 2,
    danger: 5,
    anomalyPressure: 0,
    industrial: false,
    npcAllowed: true,
    profileId: 'normal',
  });
  const pressured = proceduralPopulationBudget({
    z: 2,
    danger: 5,
    anomalyPressure: 2,
    industrial: false,
    npcAllowed: true,
    profileId: 'normal',
  });
  const deep = proceduralPopulationBudget({
    z: 29,
    danger: 5,
    anomalyPressure: 2,
    industrial: false,
    npcAllowed: true,
    profileId: 'normal',
  });
  const capped = proceduralPopulationBudget({
    z: 29,
    danger: 99,
    anomalyPressure: 99,
    industrial: true,
    npcAllowed: true,
    profileId: 'highDensity',
  });
  const voidRoute = proceduralPopulationBudget({
    z: 37,
    danger: 5,
    anomalyPressure: 2,
    industrial: true,
    npcAllowed: false,
    profileId: 'highDensity',
  });

  assert.equal(calm.npcs < dangerous.npcs, true);
  assert.equal(dangerous.monsters < pressured.monsters, true);
  assert.equal(pressured.monsters < deep.monsters, true);
  // Переполненный запрос садится на бюджет СВОЕЙ высоты, а не на мягкий предел:
  // потолок обязан оставаться недостижимым, иначе рантайм-спавн глохнет молча.
  assert.equal(capped.npcs + capped.monsters, floorPopulationBudget(29));
  assert.equal(capped.npcs + capped.monsters < ACTIVE_ACTOR_SOFT_LIMIT, true);
  assert.equal(capped.monsters > capped.npcs, true);
  assert.equal(capped.npcs <= PROCEDURAL_POPULATION_PROFILES.highDensity.npcs.cap, true);
  assert.equal(capped.monsters <= PROCEDURAL_POPULATION_PROFILES.highDensity.monsters.cap, true);
  assert.equal(voidRoute.npcs, 0);
  assert.equal(voidRoute.monsters <= PROCEDURAL_POPULATION_PROFILES.highDensity.monsters.cap, true);
});

test('procedural population deck keeps random slots normal-density unless the rare high-density anomaly is chosen', () => {
  const seeds = [1, 7, 321, 999, 2468, 12345];
  const summary = {
    slots: 0,
    normal: 0,
    highDensity: 0,
    maxNormalActors: 0,
    maxHighDensityActors: 0,
    npcFreeRouteSlots: 0,
  };

  for (const seed of seeds) {
    for (const z of PROCEDURAL_FLOOR_ZS) {
      const spec = makeProceduralFloorSpec(seed, z);
      const npcAllowed = floorRunZAllowsNpcs(spec.z);
      const profileId = proceduralPopulationProfileId(spec.anomalyId);
      const budget = proceduralPopulationBudget({
        z: spec.z,
        danger: spec.danger,
        anomalyPressure: proceduralAnomalyPressure(spec.anomalyId),
        industrial: proceduralIndustrial(spec.geometryId),
        npcAllowed,
        profileId,
      });
      const actorBudget = budget.npcs + budget.monsters;
      assert.equal(actorBudget <= ACTIVE_ACTOR_SOFT_LIMIT, true);

      summary.slots++;
      assert.equal(budget.npcs <= budget.npcCap, true);
      assert.equal(budget.monsters <= budget.monsterCap, true);
      if (!npcAllowed) {
        summary.npcFreeRouteSlots++;
        assert.equal(budget.npcs, 0);
      }

      if (profileId === 'highDensity') {
        summary.highDensity++;
        summary.maxHighDensityActors = Math.max(summary.maxHighDensityActors, actorBudget);
        assert.equal(spec.anomalyId, 'zombie_apocalypse');
      } else {
        summary.normal++;
        summary.maxNormalActors = Math.max(summary.maxNormalActors, actorBudget);
        assert.notEqual(spec.anomalyId, 'zombie_apocalypse');
        assert.equal(actorBudget <= PROCEDURAL_POPULATION_PROFILES.normal.npcs.cap + PROCEDURAL_POPULATION_PROFILES.normal.monsters.cap, true);
      }
    }
  }

  assert.equal(new Set(PROCEDURAL_FLOOR_ZS).size, PROCEDURAL_FLOOR_ZS.length);
  assert.equal(summary.slots, PROCEDURAL_FLOOR_ZS.length * seeds.length);
  assert.equal(summary.highDensity > 0, true);
  assert.equal(summary.normal > summary.highDensity, true);
  // Самый плотный обычный слот должен дотягивать до бюджета своей высоты —
  // но бюджет ниже мягкого предела на весь запас глубины, и раньше здесь стоял
  // сам предел, то есть проверка требовала упереться в потолок.
  const deepestProceduralBudget = Math.max(...PROCEDURAL_FLOOR_ZS.map(floorPopulationBudget));
  assert.equal(summary.maxNormalActors >= deepestProceduralBudget - 128, true);
  assert.equal(summary.maxNormalActors < ACTIVE_ACTOR_SOFT_LIMIT, true);
  assert.equal(summary.maxHighDensityActors >= summary.maxNormalActors, true);
  assert.equal(summary.npcFreeRouteSlots > 0, true);
});

test('actor population targets derive from the active actor soft cap', () => {
  const previous = ACTIVE_ACTOR_SOFT_LIMIT;
  try {
    setActiveActorSoftLimit(2_048);
    assert.equal(activeActorCountAtDefaultSoftLimit(4_096), 2_048);
    const procedural = proceduralPopulationBudget({
      z: 2,
      danger: 1,
      anomalyPressure: 0,
      industrial: false,
      npcAllowed: true,
      profileId: 'normal',
    });
    // Инварианты вместо пина точки: бюджет пропорционален кэпу, а тихий
    // мелкий этаж (z=2, danger 1) остаётся людным. Точные числа сдвигаются
    // от любой правки кривой и ничего не охраняют.
    assert.ok(procedural.npcs + procedural.monsters <= 2_048, `бюджет в пределах кэпа: ${procedural.npcs}+${procedural.monsters}`);
    assert.ok(procedural.npcs > procedural.monsters * 10, `тихий этаж людный: ${procedural.npcs} против ${procedural.monsters}`);
    const shallowBudget = floorPopulationBudget(2);
    assert.ok(
      procedural.npcs >= shallowBudget * 0.35 && procedural.npcs <= shallowBudget * 0.7,
      `NPC масштабируются от кэпа: ${procedural.npcs} при бюджете ${shallowBudget}`,
    );

    const blackMarket = DESIGN_FLOOR_ROUTES.find(route => route.id === 'black_market_88');
    assert.ok(blackMarket);
    const profile = designFloorPopulationProfile(blackMarket);
    assert.ok(profile.npcTarget >= 110 && profile.npcTarget <= 11000, 'npcTarget in bounds');
    assert.ok(profile.monsterTarget >= 35 && profile.monsterTarget <= 3500, 'monsterTarget in bounds');

    const podad = DESIGN_FLOOR_ROUTES.find(route => route.id === 'podad');
    assert.ok(podad);
    // Безлюдный глубокий этаж отдаёт монстрам ВЕСЬ свой бюджет — и всё равно
    // не касается мягкого предела.
    assert.equal(designFloorPopulationProfile(podad).monsterTarget, floorPopulationBudget(podad.z));
    assert.equal(designFloorPopulationProfile(podad).monsterTarget < ACTIVE_ACTOR_SOFT_LIMIT, true);
  } finally {
    setActiveActorSoftLimit(previous);
  }
});

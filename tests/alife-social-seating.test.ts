import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, type Entity, type GameState } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import {
  DEMOS_EDGE_FAMILY,
  DEMOS_SOCIAL_NEARBY_RADIUS,
} from '../src/data/demos_social';
import { getAlifeNpcRecordSnapshot, materializeAlifeFloorPopulation } from '../src/systems/alife';
import { getDemosNpcOnlySocialEdges } from '../src/systems/demos_social';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { makeGameState } from './helpers';
import { testGenerationMatrix } from './generator_helpers';

/* ── Связанные обязаны сидеть рядом ──────────────────────────────
 *
 * Это ПОВЕДЕНЧЕСКИЙ замок, а не проверка функции: он строит настоящий этаж,
 * поднимает настоящий пул A-Life и меряет ровно то, что видит игрок, — долю
 * людей, у которых родня или друг оказались ближе радиуса, на котором AI вообще
 * замечает связанного (`DEMOS_SOCIAL_NEARBY_RADIUS`).
 *
 * Замер до правки (жилой этаж, сиды 4242/7/1337):
 *
 *   живых личностей               1835
 *   связанный ТОЖЕ на этаже        149 / 134 / 140   (8%)
 *   связанный ближе радиуса          3 /   2 /   3   (0.16%)
 *   медиана до ближайшего          400 / 405 / 398 клеток
 *
 * После: связанный на этаже у ВСЕХ 1835, ближе радиуса 1117/1164/1159 (61..63%),
 * медиана 2..3 клетки. На квартирах 0.00..0.07% → 47.8%, медиана 396 → 109.
 *
 * Дефект держался на трёх сваях, и каждая охраняется здесь отдельным числом:
 *
 *   1. Ленивая строка графа не заводила родства вовсе (`addLazyFamilyEdges`) —
 *      охраняет `familyEdges`.
 *   2. Ленивая строка брала знакомых равномерно по ВСЕМУ стотысячному пулу, а не
 *      по своему этажу (`floorRoster` в `lazyCandidateId`) — охраняет `localShare`.
 *   3. Раздача мест не смотрела на граф (`pool.takeNear`) — охраняет `nearShare`.
 *
 * Пороги стоят на порядок в стороне и от дефекта, и от замеренного: типичное
 * поведение судит медиана по сидам, а покаждый сид держится только сам дефект.
 * Так замок не краснеет от сдвига потока `rng()`, но краснеет от возврата любой
 * из трёх свай — проверено снятием каждой поимённо.
 */

/** Этажи взяты как два разных способа населять мир: жилой сажает семьи по
 *  квартирам, квартиры раздают места заметно ровнее. */
const FLOORS = ['living', 'kvartiry'] as const;
const SEEDS = [4242, 7, 1337];

/** Ниже этой доли живых у связанного нет соседа-связанного ВООБЩЕ: дефект давал
 *  0.00..0.16%, замеренное — 37..63%. */
const MIN_NEAR_SHARE_PER_SEED = 0.10;
/** Типичное поведение, а не хвост одного сида. */
const MIN_NEAR_SHARE_MEDIAN = 0.30;
/** «Оба здесь»: дефект давал 8%, после правки — 100% на обоих этажах. */
const MIN_LOCAL_SHARE = 0.9;
/** Доля НЕродственных рёбер, чей адресат ЧИСЛИТСЯ на этом этаже. Равномерный
 *  выбор по всему пулу давал около 5%; этажный отбор поднимает её примерно до
 *  половины — вторую половину намеренно занимает ячейка дальнего знакомого
 *  (`DEMOS_SOCIAL_DISTANT_SLOT`), без которой умерли бы социальные поездки. */
const MIN_ACQUAINTANCE_LOCAL_SHARE = 0.25;

interface ProximityReport {
  alive: number;
  localShare: number;
  nearShare: number;
  familyEdges: number;
  acquaintanceEdges: number;
  acquaintanceLocal: number;
}

function measureFloor(floorId: string, seed: number): ProximityReport {
  const floorKey = `design:${floorId}`;
  initFactionRelations();
  seedGlobalRng(seed);
  const gen = generateDesignFloor(floorId as never, seed);
  const entities = gen.entities as Entity[];
  const state = makeGameState() as GameState;
  materializeAlifeFloorPopulation(state, gen.world, entities, { v: 2_000_000 }, floorKey);

  const byAlifeId = new Map<number, Entity>();
  for (const entity of entities) {
    if (entity.type !== EntityType.NPC || !entity.alive || entity.alifeId === undefined) continue;
    byAlifeId.set(entity.alifeId, entity);
  }

  const radius2 = DEMOS_SOCIAL_NEARBY_RADIUS * DEMOS_SOCIAL_NEARBY_RADIUS;
  let local = 0;
  let near = 0;
  let familyEdges = 0;
  let acquaintanceEdges = 0;
  let acquaintanceLocal = 0;
  for (const [alifeId, entity] of byAlifeId) {
    let hasLocal = false;
    let hasNear = false;
    for (const edge of getDemosNpcOnlySocialEdges(state, alifeId)) {
      const family = (edge.flags & DEMOS_EDGE_FAMILY) !== 0;
      if (family) familyEdges++;
      else if (edge.targetAlifeId !== undefined) {
        acquaintanceEdges++;
        // Числится ли знакомый на этом этаже — вопрос к ЗАПИСИ, а не к телу:
        // поднимается лишь часть бакета, и доля поднятых ничего не говорит о том,
        // по какому пулу граф выбирал.
        if (getAlifeNpcRecordSnapshot(state, edge.targetAlifeId)?.floorKey === floorKey) acquaintanceLocal++;
      }
      const other = edge.targetAlifeId === undefined ? undefined : byAlifeId.get(edge.targetAlifeId);
      if (!other) continue;
      hasLocal = true;
      if (gen.world.dist2(entity.x, entity.y, other.x, other.y) <= radius2) hasNear = true;
    }
    if (hasLocal) local++;
    if (hasNear) near++;
  }

  const alive = byAlifeId.size;
  return {
    alive,
    localShare: alive ? local / alive : 0,
    nearShare: alive ? near / alive : 0,
    familyEdges,
    acquaintanceEdges,
    acquaintanceLocal,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

for (const floorId of FLOORS) {
  testGenerationMatrix(`этаж ${floorId}: связанные материализуются вместе и садятся рядом`, () => {
    const reports = SEEDS.map(seed => ({ seed, report: measureFloor(floorId, seed) }));
    for (const { seed, report } of reports) {
      assert.ok(report.alive > 500, `${floorId}/${seed}: поднято ${report.alive} человек — мерить нечего`);
      assert.ok(
        report.familyEdges >= report.alive,
        `${floorId}/${seed}: родственных рёбер ${report.familyEdges} на ${report.alive} человек — родство в графе не объявлено`,
      );
      assert.ok(
        report.localShare >= MIN_LOCAL_SHARE,
        `${floorId}/${seed}: связанный материализован здесь лишь у ${(report.localShare * 100).toFixed(1)}% — граф снова берёт знакомых по всему пулу`,
      );
      /* Отдельное число под сваю 2. Родство одно уже даёт `localShare` = 1, и без
       * этой проверки снятие этажного отбора знакомых проходило бы ЗЕЛЁНЫМ —
       * пустой контроль, пойманный на себе же. */
      const acquaintanceShare = report.acquaintanceEdges ? report.acquaintanceLocal / report.acquaintanceEdges : 0;
      assert.ok(
        acquaintanceShare >= MIN_ACQUAINTANCE_LOCAL_SHARE,
        `${floorId}/${seed}: знакомых, числящихся на этом этаже, ${(acquaintanceShare * 100).toFixed(1)}% — граф снова берёт их по всему стотысячному пулу`,
      );
      assert.ok(
        report.nearShare >= MIN_NEAR_SHARE_PER_SEED,
        `${floorId}/${seed}: связанный ближе ${DEMOS_SOCIAL_NEARBY_RADIUS} клеток лишь у ${(report.nearShare * 100).toFixed(2)}% — расстановка снова не смотрит на граф`,
      );
    }
    const typical = median(reports.map(row => row.report.nearShare));
    assert.ok(
      typical >= MIN_NEAR_SHARE_MEDIAN,
      `${floorId}: медиана доли «связанный рядом» по сидам ${(typical * 100).toFixed(1)}% — ниже типичного`,
    );
  });
}

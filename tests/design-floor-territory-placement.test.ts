/* Замок на КОНТЕКСТНУЮ расстановку населения дизайн-этажей.
 *
 * Пятнадцать этажей несли собственную пару `is*AmbientNpc` +
 * `*TerritorySpawnCells`, которая должна была двигать ambient-NPC на землю
 * своей фракции. Замер показал, что вся эта полоса мертва: `Entity.id` —
 * обязательное число, поэтому `entity.id === undefined` ложно ВСЕГДА, а
 * `!entity.id` истинно только при id===0, которого не бывает (счётчик
 * рантайма начинается выше диапазона сюжетных слотов). Из пятнадцати
 * предикатов после полной генерации ловил хоть кого-то ровно один —
 * подадовский, у которого проверки id нет.
 *
 * Настоящий закон живёт в одном месте: центральный `spawnAmbientNpcTemplates`
 * берёт клетки контекстным сэмплером и выводит фракцию ИЗ владельца клетки.
 * Поэтому тест сторожит НЕ мёртвую полосу, а живой закон — иначе он охранял
 * бы дефект. Порог 90% намеренно ниже наблюдаемых 96–98%: в самом сэмплере
 * есть сознательная отдушина (4% берут фракцию из профиля этажа, а не с
 * земли), и выжимать её в ноль нельзя — она и делает толпу неоднородной.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, type Entity } from '../src/core/types';
import { factionToTerritoryOwner } from '../src/data/factions';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import type { DesignFloorId } from '../src/data/design_floors';

/** Обычный житель толпы: без пакета, без личности A-Life и без квеста. */
function isAmbient(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    entity.alive &&
    (entity as Entity & { npcPackageId?: string }).npcPackageId === undefined &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

const FLOORS: readonly DesignFloorId[] = [
  'attractor_dvor',
  'black_market_88',
  'dark_metro',
  'moebius_podezd',
  'turing_nursery',
  'voronoi_quarantine',
  'service_floor',
  'number_registry',
];

test('население дизайн-этажей встаёт на землю своей фракции', () => {
  for (const id of FLOORS) {
    const gen = generateDesignFloor(id);
    const crowd = gen.entities.filter(isAmbient);
    assert.ok(crowd.length > 0, `${id}: этаж без обычного населения`);

    let onOwnLand = 0;
    for (const npc of crowd) {
      const owner = factionToTerritoryOwner(npc.faction!);
      const cell = gen.world.idx(Math.floor(npc.x), Math.floor(npc.y));
      if (gen.world.factionControl[cell] === owner) onOwnLand++;
    }
    const share = onOwnLand / crowd.length;
    assert.ok(
      share >= 0.9,
      `${id}: на своей земле лишь ${(share * 100).toFixed(1)}% из ${crowd.length} — расстановка перестала быть контекстной`,
    );
  }
});

test('мёртвая полоса посетажного выравнивания не вернулась', () => {
  /* Предикат, сравнивающий обязательное числовое поле с undefined, всегда
     ложен, а функция за ним — недостижима. Именно так десять этажей несли
     по паре мёртвых экспортов. Замок стоит на самом поле, а не на списке
     имён: пока `Entity.id` обязателен, такая проверка — дефект. */
  const gen = generateDesignFloor('attractor_dvor');
  const npcs = gen.entities.filter(e => e.type === EntityType.NPC);
  assert.ok(npcs.length > 0);
  for (const npc of npcs) {
    assert.equal(typeof npc.id, 'number', 'у сущности нет числового id');
    assert.notEqual(npc.id, 0, 'id===0 сделал бы проверки вида `!entity.id` снова «живыми»');
  }
});

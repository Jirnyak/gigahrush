import { type Entity } from '../../core/types';
import { World as WorldClass } from '../../core/world';
import type { FloorGeneration } from '../floor_manifest';
import { ensureConnectivity, ensurePermanentRoomAccess, protectRoom, sanitizeDoors } from '../shared';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { newEntityIdCursor } from '../entity_ids';
import { buildLiquidatorFort } from './fort';

export const LIQUIDATOR_BASE_Z = -16;
const SEED = 0x4c495144;

/**
 * База Ликвидаторов — форт гарнизона на четверть этажа и дикие земли вокруг.
 *
 * Прежний генератор был заглушкой, и это измерено: четыре зала на 4992
 * проходимых клетки, из них арена занимала половину этажа, а вокруг стоял
 * сплошной бетон. Мерка взята с жилого этажа — медиана комнаты около двадцати
 * клеток, ни одна комната не тянет заметной доли этажа.
 */
export function generateLiquidatorBaseDesignFloor(): FloorGeneration {
  const world = new WorldClass();
  const entities: Entity[] = [];
  const nextId = newEntityIdCursor();

  const fort = buildLiquidatorFort(world, SEED);

  // Защиту носит только то, что по смыслу убежище: штаб за гермостеной. Раньше
  // защищены были все комнаты этажа — 4955 клеток из 4961, — и шахтам лифтов
  // было некуда сесть, отчего с базы нельзя было подняться.
  protectRoom(world, fort.hq.x, fort.hq.y, fort.hq.w, fort.hq.h, fort.hq.wallTex, fort.hq.floorTex);

  // Порядок фаз обязателен: связность прорубается ДО санации дверей, иначе
  // санация снесёт косяки, которые прорубание только что оставило.
  ensureConnectivity(world, fort.spawnX, fort.spawnY);
  ensurePermanentRoomAccess(world, world.rooms.length);
  sanitizeDoors(world);
  world.rebuildContainerMap();
  world.bakeLights();

  spawnBaseNpcs(entities, nextId,
    fort.hq.x + Math.floor(fort.hq.w / 2), fort.hq.y + Math.floor(fort.hq.h / 2),
    fort.arena.x + Math.floor(fort.arena.w / 2), fort.arena.y + Math.floor(fort.arena.h / 2));

  return { isDecentralized: true, world, entities, spawnX: fort.spawnX, spawnY: fort.spawnY };
}

/* Квартирмейстер, оружейник и гарнизонный медик — при штабе; Марко Лоло — при
 * арене: он распорядитель песка, и искать его надо там, где дерутся. Санчасти
 * кварталов принадлежат смене, а не ему. */
function spawnBaseNpcs(
  entities: Entity[], nextId: { v: number }, hqX: number, hqY: number, arenaX: number, arenaY: number,
): void {
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'liq_quartermaster', hqX, hqY, { angle: Math.PI / 2 });
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'liq_armorer', hqX - 4, hqY + 2, { angle: 0 });
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'liq_medic', hqX + 4, hqY + 2, { angle: Math.PI });
  requireSpawnedPlotNpcFromPackage(entities, nextId, 'marko_lolo', arenaX, arenaY + 6, { angle: -Math.PI / 2 });
}

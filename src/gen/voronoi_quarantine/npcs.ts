/* -- Design z: voronoi_quarantine - Laguerre quarantine cells -- */

import {
  Cell,
  EntityType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef } from '../../data/plot';
import { Spr } from '../../render/sprite_index';
import { randomRPG } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import {
  NpcId} from './geometry';

export function spawnPlotNpc(
  _world: World,
  entities: Entity[],
  nextId: { v: number },
  npcId: NpcId,
  _def: PlotNpcDef,
  point: { x: number; y: number },
  angle: number,
  weapon?: string,
): number {
  const px = point.x + 0.5;
  const py = point.y + 0.5;
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, px, py, {
    angle,
    weapon,
    aiTarget: { x: px, y: py },
    extra: { rpg: randomRPG(3) },
  });
  return npc.id;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function dropItem(world: World, entities: Entity[], nextId: { v: number }, point: { x: number; y: number }, defId: string, count: number): void {
  const idx = world.idx(point.x, point.y);
  if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) return;
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: point.x + 0.5,
    y: point.y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}


/* ── Форпост ликвидаторов — Major Grom's outpost (maintenance) ── */
/*   9×7 metal-walled room near the center of maintenance floor.  */
/*   Contains Major Grom + 2 liquidator guards.                   */
/*   Protected by aptMask.                                        */

import {
  W, Cell, Feature,
  type Room, type Entity,
  EntityType, AIGoal, Faction, Occupation,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds, randomName } from '../../data/catalog';
import { PLOT_NPCS } from '../../data/plot';
import { PLOT_ROOMS } from '../../data/plot_rooms';
import { stampRoom, protectRoom, connectProtectedRoom, findClearArea } from '../shared';
import { randomRPG, getMaxHp } from '../../systems/rpg';
import { Spr } from '../../render/sprite_index';

export function generateForpost(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number },
  spawnX: number, spawnY: number,
): { room: Room; nextRoomId: number } {
  const cx = Math.floor(spawnX);
  const cy = Math.floor(spawnY);
  const spec = PLOT_ROOMS['forpost'];

  // Strategy A: find existing room very close to spawn (near tutor room coords)
  const candidates = world.rooms.filter(r => {
    if (!r || r.w < 5 || r.h < 5) return false;
    if (r.apartmentId >= 0) return false;
    const d = world.dist(cx, cy, r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2));
    return d >= 5 && d <= 25;
  });

  let room: Room;

  if (candidates.length > 0) {
    room = candidates[Math.floor(Math.random() * candidates.length)];
    room.name = spec.name;
    room.wallTex = spec.wallTex;
    room.floorTex = spec.floorTex;
    room.type = spec.roomType;
    protectRoom(world, room.x, room.y, room.w, room.h, spec.wallTex, spec.floorTex);
    connectProtectedRoom(world, room.x, room.y, room.w, room.h);
  } else {
    // Strategy B: stamp a new room close to spawn
    const pos = findClearArea(world, cx, cy, spec.w, spec.h, 5, 25);
    const labX = pos ? pos.x : (cx + 15) % W;
    const labY = pos ? pos.y : (cy + 15) % W;

    room = stampRoom(world, nextRoomId++, spec.roomType, labX, labY, spec.w, spec.h, -1);
    room.name = spec.name;
    room.wallTex = spec.wallTex;
    room.floorTex = spec.floorTex;
    protectRoom(world, labX, labY, spec.w, spec.h, spec.wallTex, spec.floorTex);
    connectProtectedRoom(world, labX, labY, spec.w, spec.h);
  }

  // Lamps and furniture
  const rcx = room.x + Math.floor(room.w / 2);
  const rcy = room.y + Math.floor(room.h / 2);
  world.features[world.idx(rcx, rcy)] = Feature.LAMP;
  world.features[world.idx(room.x + 1, room.y + 1)] = Feature.TABLE;
  world.features[world.idx(room.x + room.w - 2, room.y + 1)] = Feature.SHELF;
  world.features[world.idx(room.x + 1, room.y + room.h - 2)] = Feature.LAMP;

  // Spawn Major Grom
  const majorDef = PLOT_NPCS['major_grom'];
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: rcx + 0.5, y: rcy + 0.5,
    angle: Math.PI, pitch: 0, alive: true, speed: majorDef.speed,
    sprite: majorDef.sprite,
    name: majorDef.name, isFemale: majorDef.isFemale,
    needs: freshNeeds(), hp: majorDef.hp, maxHp: majorDef.maxHp, money: majorDef.money,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: majorDef.inventory.map(i => ({ ...i })),
    faction: majorDef.faction, occupation: majorDef.occupation,
    plotNpcId: 'major_grom', canGiveQuest: true, questId: -1,
  });

  // Spawn 6 liquidator guards
  const guardPositions = [
    [room.x + 2, room.y + room.h - 2],
    [room.x + 5, room.y + room.h - 2],
    [room.x + 1, room.y + 2],
    [room.x + room.w - 2, room.y + 2],
    [room.x + 3, room.y + 1],
    [room.x + room.w - 3, room.y + room.h - 2],
  ];
  const guardWeapons = ['makarov', 'makarov', 'shotgun', 'nailgun', 'ppsh', 'makarov'];
  const guardAmmo: Record<string, { defId: string; count: number }> = {
    makarov: { defId: 'ammo_9mm', count: 12 },
    shotgun: { defId: 'ammo_shells', count: 8 },
    nailgun: { defId: 'ammo_nails', count: 20 },
    ppsh: { defId: 'ammo_9mm', count: 40 },
  };
  for (let g = 0; g < guardPositions.length; g++) {
    const gx = guardPositions[g][0];
    const gy = guardPositions[g][1];
    const ci = world.idx(gx, gy);
    if (world.cells[ci] !== Cell.FLOOR) continue;
    const rpg = randomRPG(7);
    const maxHp = Math.round(getMaxHp(rpg) * 1.6);
    const nm = randomName(Faction.LIQUIDATOR);
    const wpn = guardWeapons[g % guardWeapons.length];
    const ammo = guardAmmo[wpn] ?? { defId: 'ammo_9mm', count: 12 };
    entities.push({
      id: nextId.v++, type: EntityType.NPC,
      x: gx + 0.5, y: gy + 0.5,
      angle: 0, pitch: 0, alive: true, speed: 1.4 + Math.random() * 0.3,
      sprite: Occupation.HUNTER,
      name: nm.name, isFemale: nm.female,
      needs: freshNeeds(), hp: maxHp, maxHp,
      money: 30 + Math.floor(Math.random() * 50),
      ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: [
        { defId: wpn, count: 1 },
        { defId: ammo.defId, count: ammo.count },
      ],
      weapon: wpn,
      faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER,
      isTraveler: false,
      questId: -1,
      rpg,
    });
  }

  // Drop some supplies
  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: room.x + room.w - 2 + 0.5, y: room.y + room.h - 2 + 0.5,
    angle: 0, pitch: 0, alive: true, speed: 0, sprite: Spr.ITEM_DROP,
    inventory: [{ defId: 'ammo_9mm', count: 6 }, { defId: 'bandage', count: 2 }],
  });

  return { room, nextRoomId };
}

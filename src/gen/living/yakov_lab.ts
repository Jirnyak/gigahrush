/* ── Лаборатория Якова Давидовича — PSI researcher lab ─────────── */
/*   Self-contained content module (по аналогии с start_room.ts): */
/*     • Лаборатория 7×7 — белая плитка, аппаратура, полки        */
/*     • NPC: Яков Давидович (учёный, исследователь ПСИ)          */
/*     • Генерируется на расстоянии 10–50 клеток от спавна       */
/*     • Если есть MEDICAL-комната — захватывает её               */
/*     • Если нет — штампует новую 7×7 комнату + защищает aptMask */
/*                                                                 */
/*   Подключается одной строкой в living/index.ts.                */

import {
  W, Cell, Tex, RoomType, Feature,
  type Room, type Entity,
  EntityType, AIGoal, Faction, Occupation,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { stampRoom } from '../shared';

const LAB_MIN_DIST = 10;
const LAB_MAX_DIST = 50;

/* ── Helper: protect room with aptMask (same as start_room.ts) ── */
function protectRoom(world: World, rx: number, ry: number, w: number, h: number, wallTex: Tex, floorTex: Tex): void {
  for (let dy = -1; dy <= h; dy++)
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(rx + dx, ry + dy);
      world.aptMask[ci] = 1;
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      world.floorTex[world.idx(rx + dx, ry + dy)] = floorTex;
}

export function generateYakovLab(
  world: World, nextRoomId: number, entities: Entity[], nextId: { v: number },
  spawnX: number, spawnY: number,
): { room: Room; nextRoomId: number } {
  const cx = Math.floor(spawnX);
  const cy = Math.floor(spawnY);

  let room: Room;

  // ── Strategy A: find an existing MEDICAL room at moderate distance ──
  const candidates = world.rooms.filter(r => {
    if (!r || r.w < 4 || r.h < 4) return false;
    if (r.type !== RoomType.MEDICAL) return false;
    const d = world.dist(cx, cy, r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2));
    return d >= LAB_MIN_DIST && d <= LAB_MAX_DIST;
  });

  if (candidates.length > 0) {
    room = candidates[Math.floor(Math.random() * candidates.length)];
    room.name = 'Лаборатория';
    room.wallTex = Tex.TILE_W;
    room.floorTex = Tex.F_TILE;
    protectRoom(world, room.x, room.y, room.w, room.h, Tex.TILE_W, Tex.F_TILE);
    // Apparatus + lamp
    world.features[world.idx(room.x + 1, room.y + 1)] = Feature.APPARATUS;
    world.features[world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2))] = Feature.LAMP;
  } else {
    // ── Strategy B: stamp a new 7×7 lab at random angle from spawn ──
    const labW = 7, labH = 7;
    let labX = 0, labY = 0, found = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = LAB_MIN_DIST + Math.random() * (LAB_MAX_DIST - LAB_MIN_DIST);
      const tx = (cx + Math.round(Math.cos(angle) * dist) + W) % W;
      const ty = (cy + Math.round(Math.sin(angle) * dist) + W) % W;
      // Check entire area is WALL (safe to stamp)
      let ok = true;
      for (let dy = -1; dy <= labH && ok; dy++)
        for (let dx = -1; dx <= labW && ok; dx++)
          if (world.cells[world.idx((tx + dx + W) % W, (ty + dy + W) % W)] !== Cell.WALL) ok = false;
      if (ok) { labX = tx; labY = ty; found = true; break; }
    }
    if (!found) { labX = (cx + 100) % W; labY = (cy + 100) % W; }

    room = stampRoom(world, nextRoomId++, RoomType.MEDICAL, labX, labY, labW, labH, -1);
    room.name = 'Лаборатория';
    room.wallTex = Tex.TILE_W;
    room.floorTex = Tex.F_TILE;
    protectRoom(world, labX, labY, labW, labH, Tex.TILE_W, Tex.F_TILE);

    // Lamps + apparatus + shelf
    world.features[world.idx(labX + Math.floor(labW / 2), labY + Math.floor(labH / 2))] = Feature.LAMP;
    world.features[world.idx(labX + 1, labY + 1)] = Feature.APPARATUS;
    world.features[world.idx(labX + labW - 2, labY + 1)] = Feature.SHELF;
  }

  // ── NPC: Яков Давидович — PSI researcher ──
  const labCx = room.x + Math.floor(room.w / 2);
  const labCy = room.y + Math.floor(room.h / 2);
  entities.push({
    id: nextId.v++, type: EntityType.NPC,
    x: labCx + 0.5, y: labCy + 0.5,
    angle: Math.PI, pitch: 0, alive: true, speed: 1.0,
    sprite: Occupation.SCIENTIST,
    name: 'Яков Давидович', isFemale: false,
    needs: freshNeeds(), hp: 80, maxHp: 80, money: 60,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: [{ defId: 'psi_strike', count: 1 }, { defId: 'antidep', count: 1 }],
    faction: Faction.SCIENTIST, occupation: Occupation.SCIENTIST,
    isTutorYakov: true, canGiveQuest: true, questId: -1,
  });

  return { room, nextRoomId };
}

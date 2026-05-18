/* ── Второй затопленный тайник водолазов ─────────────────────── */

import { Tex, Feature, RoomType, MonsterKind } from '../../core/types';
import {
  type MaintContentCtx, dropItems, findMaintArea, setFeature, setWater,
  spawnMonstersNear, stampMaintRoom,
} from './content_helpers';

export function generateDiverCache(ctx: MaintContentCtx): void {
  const cx = Math.floor(ctx.spawnX);
  const cy = Math.floor(ctx.spawnY);
  const pos = findMaintArea(ctx.world, cx, cy, 11, 9, 85, 190);

  const room = stampMaintRoom(
    ctx.world, ctx.world.rooms.length, RoomType.STORAGE,
    pos.x, pos.y, 9, 7,
    'Затопленный тайник водолазов: давление ноль',
    Tex.PIPE, Tex.F_WATER,
  );

  for (let dy = 1; dy < room.h - 1; dy++) {
    for (let dx = 1; dx < room.w - 1; dx++) {
      if (dx === 4 && dy >= 2 && dy <= 4) continue;
      if ((dx + dy) % 2 === 0) setWater(ctx.world, room.x + dx, room.y + dy);
    }
  }
  setFeature(ctx.world, room.x + 1, room.y + 1, Feature.LAMP);
  setFeature(ctx.world, room.x + 4, room.y + 3, Feature.SHELF);
  setFeature(ctx.world, room.x + 6, room.y + 2, Feature.APPARATUS);

  dropItems(ctx, room, [
    'flashlight', 'water', 'water', 'bandage', 'ammo_shells',
    'knife', 'rawmeat', 'note',
  ]);

  spawnMonstersNear(ctx, room.x + 4, room.y + 3, [
    MonsterKind.POLZUN, MonsterKind.SBORKA, MonsterKind.TVAR,
  ], 3, 8);
}

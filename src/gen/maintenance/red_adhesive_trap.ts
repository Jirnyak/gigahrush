/* ── AG66 red adhesive trap: room-local sparse hazard ─────────── */

import {
  EntityType, Faction, Feature, MonsterKind, Occupation, RoomType, Tex,
} from '../../core/types';
import { registerCellHazardSite } from '../../systems/cell_hazards';

const HOME_FLOOR_KEY = designNpcFloorKey('maintenance');
import { stampMark, MarkType } from '../../systems/surface_marks';
import { Spr } from '../../entities/sprite_index';
import { type PlotNpcDef, registerAuthoredNpc, designNpcFloorKey } from '../../data/plot';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';

const AMBIENT_NPC_0: PlotNpcDef = {
  name: 'Семён Прилипло',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.LOCKSMITH,
  sprite: Occupation.LOCKSMITH,
  hp: 50, maxHp: 50, money: 5, speed: 0.9,
  inventory: [
    { defId: 'sealant_tube', count: 1 },
    { defId: 'rubber_strip', count: 1 },
  ],
  talkLines: ['...'],
  talkLinesPost: ['...']
};
registerAuthoredNpc({ id: 'maintenance_ambient_0_fb1ov', npc: AMBIENT_NPC_0, homeFloorKey: HOME_FLOOR_KEY });
import {
  type MaintContentCtx, dropItems, findMaintArea, setFeature,
  spawnMonstersNear, stampMaintRoom,
} from './content_helpers';

const TRAP_ID = 'maintenance_red_adhesive_trap';

function dropAt(ctx: MaintContentCtx, x: number, y: number, defId: string, count = 1): void {
  ctx.entities.push({
    id: ctx.nextId.v++, type: EntityType.ITEM_DROP,
    x: x + 0.5, y: y + 0.5, angle: 0, pitch: 0,
    alive: true, speed: 0, sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}

function stampAdhesiveCell(ctx: MaintContentCtx, x: number, y: number, n: number): number {
  const cell = ctx.world.idx(x, y);
  stampMark(ctx.world, x, y, 0.5, 0.5, 0.55, MarkType.POOL, 6600 + n * 37, 150, 8, 10, 215);
  stampMark(ctx.world, x, y, 0.35, 0.62, 0.28, MarkType.SPLAT, 7600 + n * 41, 220, 16, 18, 180);
  return cell;
}

export function generateRedAdhesiveTrap(ctx: MaintContentCtx): void {
  const cx = Math.floor(ctx.spawnX);
  const cy = Math.floor(ctx.spawnY);
  const pos = findMaintArea(ctx.world, cx, cy, 23, 13, 85, 190);

  const room = stampMaintRoom(
    ctx.world, ctx.world.rooms.length, RoomType.PRODUCTION,
    pos.x, pos.y, 19, 10,
    'НИИ слизи: красная липучка',
    Tex.PIPE, Tex.F_CONCRETE,
  );

  for (let dx = 1; dx < room.w - 1; dx++) {
    if (dx % 4 === 1) setFeature(ctx.world, room.x + dx, room.y + 1, Feature.APPARATUS);
    if (dx % 5 === 2) setFeature(ctx.world, room.x + dx, room.y + room.h - 2, Feature.SHELF);
  }
  setFeature(ctx.world, room.x + 2, room.y + 2, Feature.LAMP);
  setFeature(ctx.world, room.x + room.w - 3, room.y + 2, Feature.LAMP);
  setFeature(ctx.world, room.x + 3, room.y + room.h - 3, Feature.MACHINE);
  setFeature(ctx.world, room.x + room.w - 4, room.y + room.h - 3, Feature.DESK);

  const pattern = [
    [0, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 0],
  ];
  const trapCells: number[] = [];
  for (let py = 0; py < pattern.length; py++) {
    for (let px = 0; px < pattern[py].length; px++) {
      if (!pattern[py][px]) continue;
      const x = room.x + 6 + px;
      const y = room.y + 3 + py;
      trapCells.push(stampAdhesiveCell(ctx, x, y, trapCells.length));
    }
  }

  const zoneId = ctx.world.zoneMap[ctx.world.idx(room.x + 9, room.y + 5)];
  registerCellHazardSite(ctx.world, {
    id: TRAP_ID,
    kind: 'red_adhesive',
    displayName: 'Красная липучка',
    cells: trapCells,
    tags: ['slime', 'red_slime', 'adhesive', 'maintenance', 'nii_slime'],
    slowMult: 0.36,
    trappedMult: 0.08,
    stickAfter: 0.55,
    escapeSeconds: 2.8,
    npcEscapeSeconds: 5.2,
    roomId: room.id,
    zoneId,
    centerX: room.x + 9.5,
    centerY: room.y + 5.5,
    warning: 'Липнет к ногам. Обходите по краю, жгите огнем или чистите комплектом.',
  });

  dropAt(ctx, room.x + 2, room.y + 3, 'cleaning_kit');
  dropAt(ctx, room.x + 3, room.y + 3, 'ammo_fuel', 8);
  dropAt(ctx, room.x + room.w - 4, room.y + 3, 'sealant_tube', 2);
  dropAt(ctx, room.x + room.w - 5, room.y + room.h - 3, 'rubber_strip', 2);
  dropItems(ctx, room, ['alcohol_bottle', 'filter_layer', 'note']);

  requireSpawnedPlotNpcFromPackage(ctx.entities, ctx.nextId, 'maintenance_ambient_0_fb1ov', room.x + room.w - 3 + 0.5, room.y + 6 + 0.5, { angle: 0});
  spawnMonstersNear(ctx, room.x + 10, room.y + 5, [MonsterKind.POLZUN, MonsterKind.EYE], 5, 9);
}

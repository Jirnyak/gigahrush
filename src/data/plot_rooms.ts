/* ── Story room specifications ────────────────────────────────── */
/* Each entry defines room parameters used by gen/living/ modules. */
/* To add a new story room:                                        */
/*   1. Add entry here (dimensions, textures, NPC list)            */
/*   2. Create room generator in gen/living/                       */
/*   3. Wire it in gen/living/index.ts                             */

import { Tex, RoomType } from '../core/types';

export interface PlotRoomDef {
  id: string;
  name: string;
  w: number;
  h: number;
  wallTex: Tex;
  floorTex: Tex;
  roomType: RoomType;
  /** Keys into PLOT_NPCS that spawn in this room */
  plotNpcs: string[];
  /** Distance constraints from player spawn (for non-start rooms) */
  minDist?: number;
  maxDist?: number;
}

export const PLOT_ROOMS: Record<string, PlotRoomDef> = {
  tutor_hall: {
    id: 'tutor_hall',
    name: 'Актовый зал',
    w: 11, h: 9,
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    roomType: RoomType.COMMON,
    plotNpcs: ['olga'],
  },
  armory: {
    id: 'armory',
    name: 'Оружейная',
    w: 7, h: 14,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    roomType: RoomType.PRODUCTION,
    plotNpcs: ['barni'],
  },
  yakov_lab: {
    id: 'yakov_lab',
    name: 'Лаборатория',
    w: 7, h: 7,
    wallTex: Tex.TILE_W,
    floorTex: Tex.F_TILE,
    roomType: RoomType.MEDICAL,
    plotNpcs: ['yakov'],
    minDist: 10,
    maxDist: 50,
  },
  vanka_den: {
    id: 'vanka_den',
    name: 'Логово Банчиного',
    w: 6, h: 5,
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_CONCRETE,
    roomType: RoomType.LIVING,
    plotNpcs: ['vanka'],
    minDist: 50,
    maxDist: 120,
  },
  forpost: {
    id: 'forpost',
    name: 'Форпост ликвидаторов',
    w: 9, h: 7,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    roomType: RoomType.HQ,
    plotNpcs: ['major_grom'],
  },
};

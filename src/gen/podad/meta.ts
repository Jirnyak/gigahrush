import {
  
  RoomType, Tex, W, ZoneFaction,
  type Room, type TerritoryOwner,
} from '../../core/types';

export const PODAD_DESIGN_FLOOR_ID = 'podad' as const;

export const PODAD_DEFAULT_SEED = 36631;

export const SPAWN_X = W >> 1;

export const SPAWN_Y = W >> 1;

export const LIVING_TUNNEL_TAG = '[living_tunnel:';

export const WALL_SNAKE_TAG = '[wall_snake:';

export const SECTION_SHIFT_TAG = '[section_shift:';

export const HERALD_GATE_TAG = '[herald_gate:podad]';

export const CAPILLARY_FIELD_TAG = '[podad_capillary:';

export const PODAD_HQ_TAG = '[podad_hq:';

export const PODAD_SUPPORT_TAG = '[podad_support:';

export type PodadTopologyNodeId =
  | 'entry'
  | 'contact'
  | 'living_tunnel'
  | 'wall_snake'
  | 'section_shift'
  | 'herald_gate'
  | 'upper_lift';

export interface PodadTopologyNode {
  id: PodadTopologyNodeId;
  roomId: number;
  roomDefId: string;
  x: number;
  y: number;
  tags: readonly string[];
}

export interface PodadTopologyEdge {
  from: PodadTopologyNodeId;
  to: PodadTopologyNodeId;
  score: number;
  decision: string;
  tags: readonly string[];
}

export interface PodadTopologyDescriptor {
  routeId: typeof PODAD_DESIGN_FLOOR_ID;
  capillaryCells: number;
  nodes: readonly PodadTopologyNode[];
  edges: readonly PodadTopologyEdge[];
  sectionShiftChokepointScore: number;
  movingWallChokepointScore: number;
}

export interface PodadRooms {
  entry: Room;
  contact: Room;
  threshold: Room;
  livingTunnel: Room;
  wallSnake: Room;
  sectionShift: Room;
  upperLift: Room;
}

export interface RoomSpec {
  key: keyof PodadRooms;
  name: string;
  type: RoomType;
  dx: number;
  dy: number;
  w: number;
  h: number;
  wallTex: Tex;
  floorTex: Tex;
}

export interface PodadHqSpec {
  owner: TerritoryOwner;
  ownerId: string;
  x: number;
  y: number;
  coreName: string;
  wallTex: Tex;
  floorTex: Tex;
  coreW?: number;
  coreH?: number;
}

export interface PodadMicroSpec {
  type: RoomType;
  name: string;
  dx: number;
  dy: number;
  w: number;
  h: number;
}

export const ROOM_SPECS: readonly RoomSpec[] = [
  { key: 'entry', name: 'Корневая площадка Подада', type: RoomType.HQ, dx: -7, dy: -7, w: 15, h: 15, wallTex: Tex.GUT, floorTex: Tex.F_GUT },
  { key: 'contact', name: 'Обожженная сторожка Подада', type: RoomType.COMMON, dx: 34, dy: -28, w: 17, h: 13, wallTex: Tex.MEAT, floorTex: Tex.F_MEAT },
  { key: 'threshold', name: 'Порог Вестников Подада', type: RoomType.HQ, dx: 112, dy: -36, w: 27, h: 19, wallTex: Tex.GUT, floorTex: Tex.F_GUT },
  { key: 'livingTunnel', name: 'Живые тоннели: слепая кишка Подада', type: RoomType.CORRIDOR, dx: -116, dy: -58, w: 30, h: 18, wallTex: Tex.GUT, floorTex: Tex.F_GUT },
  { key: 'wallSnake', name: 'Змейка стены: сухой желудок Подада', type: RoomType.STORAGE, dx: -82, dy: 96, w: 32, h: 22, wallTex: Tex.CONCRETE, floorTex: Tex.F_CONCRETE },
  { key: 'sectionShift', name: 'Секционный сдвиг: мокрый пролет Подада', type: RoomType.PRODUCTION, dx: 82, dy: 96, w: 34, h: 24, wallTex: Tex.METAL, floorTex: Tex.F_TILE },
  { key: 'upperLift', name: 'Верхняя створка Подада', type: RoomType.CORRIDOR, dx: 8, dy: 174, w: 19, h: 13, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
];

export const PODAD_HQ_SPECS: readonly PodadHqSpec[] = [
  { owner: ZoneFaction.CITIZEN, ownerId: 'citizen', x: 160, y: 170, coreName: 'Гражданский штаб Подада: тёплая кишка', wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { owner: ZoneFaction.LIQUIDATOR, ownerId: 'liquidator', x: 832, y: 176, coreName: 'Ликвидаторский штаб Подада: сухой шлюз', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.CULTIST, ownerId: 'cultist', x: 512, y: 272, coreName: 'Большой культовый штаб Подада: сердце нижнего порога', wallTex: Tex.GUT, floorTex: Tex.F_GUT, coreW: 30, coreH: 20 },
  { owner: ZoneFaction.SCIENTIST, ownerId: 'scientist', x: 168, y: 812, coreName: 'Научный штаб Подада: камера сдвига', wallTex: Tex.PIPE, floorTex: Tex.F_TILE },
  { owner: ZoneFaction.WILD, ownerId: 'wild', x: 840, y: 820, coreName: 'Дикий штаб Подада: костяной карман', wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE },
];

export const PODAD_MICRO_SPECS: readonly PodadMicroSpec[] = [
  { type: RoomType.STORAGE, name: 'кладовая плёнки', dx: -35, dy: -5, w: 14, h: 10 },
  { type: RoomType.KITCHEN, name: 'кипятильная слюна', dx: 21, dy: -5, w: 14, h: 10 },
  { type: RoomType.BATHROOM, name: 'мокрый санитарный карман', dx: -7, dy: -24, w: 14, h: 9 },
  { type: RoomType.OFFICE, name: 'будка ведомости порога', dx: -7, dy: 15, w: 14, h: 9 },
  { type: RoomType.LIVING, name: 'лежанка живого тоннеля', dx: -35, dy: 16, w: 13, h: 9 },
  { type: RoomType.SMOKING, name: 'курилка стеновой змейки', dx: 22, dy: 16, w: 13, h: 9 },
  { type: RoomType.MEDICAL, name: 'перевязочная сдвига', dx: -7, dy: 29, w: 14, h: 8 },
];


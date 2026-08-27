/* ── Перевалка, слой 4: жизнь яруса ───────────────────────────────
 *
 * ИДЕЯ. Четыре базы делят ярус, но живут на нём не они. Грузчик, повариха,
 * банщик, фельдшер и перекупщик не состоят ни в одной из четырёх правд: им
 * платят за смену, и чья сегодня доля — вопрос не их. Пока яруса нет у них,
 * четыре двора остаются декорацией с хозяевами внутри.
 *
 * Слой строит два конца одной обыкновенной жизни:
 *   жилой конец  — три ночлежки посменно, столовая с кухней и кладовой, баня,
 *                  курилка и красный уголок;
 *   торговый     — крытый чёрный рынок на НИЧЬЕЙ площадке, ряды прилавков
 *                  вокруг него, медугол и конторки перекупщиков.
 *
 * НИЧЬЯ ЗЕМЛЯ — ЭТО РЕШЕНИЕ, А НЕ ПРОПУСК. Ни одна комната слоя не несёт метки
 * `district:`, по которой территория возвращается базе. Значит рынок и ночлежки
 * достаются той фракции, которой их отдаст общая раздача долей, и вокруг них
 * стоит смешанная толпа. Ровно этого и хотели: место, где четыре банды
 * встречаются, не будучи ни у кого дома.
 *
 * ПОЧЕМУ КАМОРОК ШЕСТЬДЕСЯТ. Расселение и A-Life садят людей по комнатам. На
 * этаже около 1900 обычных жителей, и до этого слоя койка была ровно одна на
 * весь ярус — гермоубежище. Ночлежка из десяти каморок в ряд по обе стороны
 * прохода даёт населению адрес, а бою — коридор с дверями, из которых выходят.
 *
 * СТАДИЯ. Вместе с остальными слоями застройки: после дворов баз, ДО
 * `generateZones` и `ensureConnectivity`. Кольцевые дороги обоих кварталов
 * ложатся по их кромке и выходят на авеню сами.
 */

import { Cell, DoorState, Feature, RoomType, Tex, type Room } from '../../core/types';
import { World } from '../../core/world';
import { stampRoom } from '../shared';
import { applyNamedRoom, type NamedRoomDef } from '../named_rooms';
import { perevalkaBlock } from './yard';

const HOME_BLOCK = { bx: 2, by: 4 } as const;
const TRADE_BLOCK = { bx: 3, by: 4 } as const;

const RING = 4;
const LANE = 4;

/* Ночлежка: два ряда каморок вдоль сквозного прохода. Числа взяты от каморки. */
const BUNK_W = 10;
const BUNK_H = 8;
const BUNK_PITCH = BUNK_W + 1;
const BARRACK_PITCH = BUNK_H * 2 + LANE + 3;
const BARRACKS = 3;

/** Крытый рынок объявляет свой потолок сам: 4 → 3.0 м под навесом. */
const MARKET_TIER = 4;
const MARKET_W = 70;
const MARKET_H = 40;
const STALL_W = 12;
const STALL_H = 10;

const BUNK: NamedRoomDef = { type: RoomType.LIVING, name: 'Каморка грузчика', tags: ['perevalka', 'life', 'bunk'] };
const CANTEEN: NamedRoomDef = { type: RoomType.COMMON, name: 'Столовая яруса', tags: ['perevalka', 'life', 'canteen'] };
const KITCHEN: NamedRoomDef = { type: RoomType.KITCHEN, name: 'Кухня столовой', tags: ['perevalka', 'life', 'canteen'] };
const PANTRY: NamedRoomDef = { type: RoomType.STORAGE, name: 'Кладовая столовой', tags: ['perevalka', 'life', 'canteen'] };
const BATH_FRONT: NamedRoomDef = { type: RoomType.COMMON, name: 'Предбанник', tags: ['perevalka', 'life', 'bath'] };
const BATH_STEAM: NamedRoomDef = { type: RoomType.BATHROOM, name: 'Парная', tags: ['perevalka', 'life', 'bath'] };
const BATH_WASH: NamedRoomDef = { type: RoomType.BATHROOM, name: 'Мойка', tags: ['perevalka', 'life', 'bath'] };
const SMOKING: NamedRoomDef = { type: RoomType.SMOKING, name: 'Курилка ночлежек', tags: ['perevalka', 'life'] };
const RED_CORNER: NamedRoomDef = { type: RoomType.CLASSROOM, name: 'Красный уголок грузчиков', tags: ['perevalka', 'life'] };
const MARKET: NamedRoomDef = { type: RoomType.MARKET, name: 'Чёрный рынок перевалки', tags: ['perevalka', 'life', 'market', 'neutral'] };
const STALL: NamedRoomDef = { type: RoomType.SHOP, name: 'Прилавок', tags: ['perevalka', 'life', 'market'] };
const MEDPOINT: NamedRoomDef = { type: RoomType.MEDICAL, name: 'Медугол яруса', tags: ['perevalka', 'life', 'medical'] };
const DRESSING: NamedRoomDef = { type: RoomType.MEDICAL, name: 'Перевязочная', tags: ['perevalka', 'life', 'medical'] };
const BROKER: NamedRoomDef = { type: RoomType.OFFICE, name: 'Конторка перекупщика', tags: ['perevalka', 'life', 'market'] };

export interface PerevalkaLifeQuarters {
  bunks: Room[];
  canteen: Room;
  market: Room;
  stalls: Room[];
  medpoint: Room;
  service: Room[];
}

function carve(world: World, x: number, y: number, floorTex: Tex): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT || world.cells[i] === Cell.DOOR) return;
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = floorTex;
  world.features[i] = Feature.NONE;
}

function carveBand(world: World, x: number, y: number, w: number, h: number, floorTex: Tex): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) carve(world, x + dx, y + dy, floorTex);
  }
}

function carveRingRoad(world: World, b: { x: number; y: number; w: number; h: number }, floorTex: Tex): void {
  carveBand(world, b.x, b.y, b.w, RING, floorTex);
  carveBand(world, b.x, b.y + b.h - RING, b.w, RING, floorTex);
  carveBand(world, b.x, b.y, RING, b.h, floorTex);
  carveBand(world, b.x + b.w - RING, b.y, RING, b.h, floorTex);
}

function stampLifeRoom(
  world: World, def: NamedRoomDef, alias: string, name: string,
  x: number, y: number, w: number, h: number, wallTex: Tex, floorTex: Tex, tier?: number,
): Room {
  const room = stampRoom(world, world.rooms.length, def.type, x, y, w, h, -1);
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  if (tier !== undefined) room.ceilingTier = tier;
  applyNamedRoom(room, alias, def);
  room.name = name;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
  }
  return room;
}

/** `other` — соседняя комната, когда створка стоит в общей стене: запись нужна обеим. */
function hangDoor(world: World, room: Room, x: number, y: number, state = DoorState.CLOSED, other?: Room): void {
  const i = world.idx(x, y);
  world.cells[i] = Cell.DOOR;
  world.wallTex[i] = Tex.DOOR_WOOD;
  world.features[i] = Feature.NONE;
  world.roomMap[i] = -1;
  world.doors.set(i, { idx: i, state, roomA: room.id, roomB: other?.id ?? -1, keyId: '', timer: 0 });
  room.doors.push(i);
  other?.doors.push(i);
}

/* ── Жилой конец ─────────────────────────────────────────────────
 * Три ночлежки одна под другой, под ними столовая, под столовой баня. Проходы
 * ночлежек рубятся во всю ширину квартала и потому упираются в кольцо с обоих
 * концов: тупиковой ночлежки на ярусе нет ни одной. */
function buildHomeQuarter(world: World, b: { x: number; y: number; w: number; h: number }, out: PerevalkaLifeQuarters): void {
  carveRingRoad(world, b, Tex.F_CONCRETE);
  const cols = Math.floor((b.w - RING * 2 - 2) / BUNK_PITCH);

  let serial = 0;
  for (let k = 0; k < BARRACKS; k++) {
    const top = b.y + RING + 1 + k * BARRACK_PITCH;
    carveBand(world, b.x, top + BUNK_H + 1, b.w, LANE, Tex.F_CONCRETE);
    for (const side of [0, 1] as const) {
      const rowY = side === 0 ? top : top + BUNK_H + 1 + LANE + 1;
      for (let c = 0; c < cols; c++) {
        serial++;
        const room = stampLifeRoom(world, BUNK, `perevalka_bunk_${serial}`, `Каморка грузчика ${serial}`,
          b.x + RING + 1 + c * BUNK_PITCH, rowY, BUNK_W, BUNK_H, Tex.PANEL, Tex.F_WOOD);
        hangDoor(world, room, room.x + (BUNK_W >> 1), side === 0 ? room.y + BUNK_H : room.y - 1);
        world.features[world.idx(room.x + 2, room.y + 2)] = Feature.BED;
        world.features[world.idx(room.x + BUNK_W - 3, room.y + 2)] = Feature.BED;
        world.features[world.idx(room.x + 2, room.y + BUNK_H - 3)] = Feature.SHELF;
        out.bunks.push(room);
      }
    }
  }

  // Столовая: зал во всю длину, кухня и кладовая рядом, все три выходят на один
  // служебный проход. Готовят на ярусе в одном месте, и очередь тут вечная.
  const serviceY = b.y + RING + 1 + BARRACKS * BARRACK_PITCH;
  carveBand(world, b.x, serviceY, b.w, LANE, Tex.F_CONCRETE);
  const hallY = serviceY + LANE + 1;
  const canteen = stampLifeRoom(world, CANTEEN, 'perevalka_canteen', 'Столовая яруса',
    b.x + RING + 2, hallY, 60, 20, Tex.PANEL, Tex.F_LINO);
  hangDoor(world, canteen, canteen.x + 12, canteen.y - 1, DoorState.OPEN);
  hangDoor(world, canteen, canteen.x + 44, canteen.y - 1, DoorState.OPEN);
  for (let dx = 4; dx < 58; dx += 7) {
    world.features[world.idx(canteen.x + dx, canteen.y + 4)] = Feature.TABLE;
    world.features[world.idx(canteen.x + dx, canteen.y + 12)] = Feature.CHAIR;
  }
  out.canteen = canteen;
  const kitchen = stampLifeRoom(world, KITCHEN, 'perevalka_kitchen', 'Кухня столовой',
    canteen.x + 62, hallY, 24, 16, Tex.TILE_W, Tex.F_TILE);
  hangDoor(world, kitchen, kitchen.x + 12, kitchen.y - 1);
  world.features[world.idx(kitchen.x + 3, kitchen.y + 3)] = Feature.STOVE;
  world.features[world.idx(kitchen.x + 8, kitchen.y + 3)] = Feature.SINK;
  const pantry = stampLifeRoom(world, PANTRY, 'perevalka_pantry', 'Кладовая столовой',
    kitchen.x + 26, hallY, 18, 16, Tex.TILE_W, Tex.F_TILE);
  hangDoor(world, pantry, pantry.x + 9, pantry.y - 1);
  world.features[world.idx(pantry.x + 3, pantry.y + 3)] = Feature.SHELF;
  out.service.push(kitchen, pantry);

  // Баня и то, что вокруг неё: последний ряд перед южным кольцом.
  const bathLaneY = hallY + 21;
  carveBand(world, b.x, bathLaneY, b.w, LANE, Tex.F_CONCRETE);
  const bathY = bathLaneY + LANE + 1;
  const bathH = b.y + b.h - RING - 1 - bathY;
  const suite: Array<[NamedRoomDef, string, string, number, number, Feature]> = [
    [BATH_FRONT, 'perevalka_bath_front', 'Предбанник', 22, 0, Feature.CHAIR],
    [BATH_STEAM, 'perevalka_bath_steam', 'Парная', 20, 24, Feature.STOVE],
    [BATH_WASH, 'perevalka_bath_wash', 'Мойка', 20, 46, Feature.SINK],
    [SMOKING, 'perevalka_bunk_smoking', 'Курилка ночлежек', 18, 68, Feature.CHAIR],
    [RED_CORNER, 'perevalka_red_corner', 'Красный уголок грузчиков', 22, 88, Feature.SCREEN],
  ];
  for (const [def, alias, name, w, dx, feature] of suite) {
    const room = stampLifeRoom(world, def, alias, name, b.x + RING + 2 + dx, bathY, w, bathH,
      def === BATH_STEAM || def === BATH_WASH ? Tex.TILE_W : Tex.PANEL,
      def === BATH_STEAM || def === BATH_WASH ? Tex.F_TILE : Tex.F_WOOD);
    hangDoor(world, room, room.x + (w >> 1), room.y - 1);
    world.features[world.idx(room.x + 3, room.y + 3)] = feature;
    out.service.push(room);
  }
}

/* ── Торговый конец ──────────────────────────────────────────────
 * Крытый рынок — единственный зал яруса, куда выходят двери прилавков и только
 * они: внутрь попадаешь через ряд, а не с улицы. Площадка ничья, и метки базы
 * на ней нет ни одной. */
function buildTradeQuarter(world: World, b: { x: number; y: number; w: number; h: number }, out: PerevalkaLifeQuarters): void {
  carveRingRoad(world, b, Tex.F_CONCRETE);
  const marketX = b.x + 26;
  const marketY = b.y + 30;
  // Два продольных проулка вплотную к торцам рынка: створка зала открывается
  // прямо в них. Проулок, отставший от торца на клетку, оставил бы рынок
  // островом с четырнадцатью дверями в никуда.
  carveBand(world, marketX - LANE - 1, b.y, LANE, b.h, Tex.F_CONCRETE);
  carveBand(world, marketX + MARKET_W + 1, b.y, LANE, b.h, Tex.F_CONCRETE);

  const market = stampLifeRoom(world, MARKET, 'perevalka_black_market', 'Чёрный рынок перевалки',
    marketX, marketY, MARKET_W, MARKET_H, Tex.METAL, Tex.F_CONCRETE, MARKET_TIER);
  hangDoor(world, market, marketX - 1, marketY + (MARKET_H >> 1), DoorState.OPEN);
  hangDoor(world, market, marketX + MARKET_W, marketY + (MARKET_H >> 1), DoorState.OPEN);
  for (let dx = 6; dx < MARKET_W - 4; dx += 10) {
    world.features[world.idx(marketX + dx, marketY + 4)] = Feature.TABLE;
    world.features[world.idx(marketX + dx, marketY + MARKET_H - 5)] = Feature.LAMP;
  }
  out.market = market;

  // Прилавки: два ряда по обе стороны зала, дверь только внутрь рынка.
  carveBand(world, b.x, marketY - STALL_H - 6, b.w, LANE, Tex.F_CONCRETE);
  carveBand(world, b.x, marketY + MARKET_H + STALL_H + 2, b.w, LANE, Tex.F_CONCRETE);
  let serial = 0;
  for (const north of [true, false] as const) {
    for (let c = 0; c < 4; c++) {
      serial++;
      const x = marketX + 2 + c * (STALL_W + 6);
      const y = north ? marketY - STALL_H - 1 : marketY + MARKET_H + 1;
      const room = stampLifeRoom(world, STALL, `perevalka_stall_${serial}`, `Прилавок ${serial}`,
        x, y, STALL_W, STALL_H, Tex.METAL, Tex.F_CONCRETE);
      // Две створки: одна в зал рынка, вторая на служебный проулок за спиной.
      // Прилавок с единственным выходом в зал — это ловушка, а не лавка.
      hangDoor(world, room, room.x + (STALL_W >> 1), north ? room.y + STALL_H : room.y - 1, DoorState.OPEN, market);
      hangDoor(world, room, room.x + (STALL_W >> 1) - 3, north ? room.y - 1 : room.y + STALL_H);
      world.features[world.idx(room.x + 2, room.y + 2)] = Feature.SHELF;
      out.stalls.push(room);
    }
  }

  // Медугол и конторки: южный ряд квартала, за прилавками.
  const southY = marketY + MARKET_H + STALL_H + 2 + LANE + 1;
  const southH = b.y + b.h - RING - 1 - southY;
  const medpoint = stampLifeRoom(world, MEDPOINT, 'perevalka_medpoint', 'Медугол яруса',
    b.x + 26, southY, 24, southH, Tex.TILE_W, Tex.F_TILE);
  hangDoor(world, medpoint, medpoint.x + 12, medpoint.y - 1);
  world.features[world.idx(medpoint.x + 3, medpoint.y + 3)] = Feature.BED;
  out.medpoint = medpoint;
  const dressing = stampLifeRoom(world, DRESSING, 'perevalka_dressing', 'Перевязочная',
    medpoint.x + 26, southY, 20, southH, Tex.TILE_W, Tex.F_TILE);
  hangDoor(world, dressing, dressing.x + 10, dressing.y - 1);
  world.features[world.idx(dressing.x + 3, dressing.y + 3)] = Feature.APPARATUS;
  out.service.push(dressing);
  for (let i = 0; i < 3; i++) {
    const room = stampLifeRoom(world, BROKER, `perevalka_broker_${i + 1}`, `Конторка перекупщика ${i + 1}`,
      dressing.x + 22 + i * 16, southY, 14, southH, Tex.PANEL, Tex.F_LINO);
    hangDoor(world, room, room.x + 7, room.y - 1);
    world.features[world.idx(room.x + 3, room.y + 3)] = Feature.DESK;
    out.service.push(room);
  }
}

/** Точка входа слоя. */
export function buildPerevalkaLifeQuarters(world: World): PerevalkaLifeQuarters {
  const out: PerevalkaLifeQuarters = {
    bunks: [], canteen: undefined as unknown as Room, market: undefined as unknown as Room,
    stalls: [], medpoint: undefined as unknown as Room, service: [],
  };
  buildHomeQuarter(world, perevalkaBlock(HOME_BLOCK.bx, HOME_BLOCK.by), out);
  buildTradeQuarter(world, perevalkaBlock(TRADE_BLOCK.bx, TRADE_BLOCK.by), out);
  return out;
}

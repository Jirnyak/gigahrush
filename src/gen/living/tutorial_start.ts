/* ── Стартовые комнаты: Столовая и Уборная ─────────────────────────
 *
 * Первые минуты игры целиком, одним куском. Игрок появляется в запертой Столовой,
 * пьёт из раковины, идёт через открытую дверь в Уборную, поднимает там ключ и
 * отпирает им дверь в Актовый зал. Дальше начинается этаж.
 *
 * Что этот модуль обязан поставить, чтобы интерфейсная система целей повела игрока
 * по шагам, — перечислено в `data/tutorial_start.ts`. Оттуда же берутся сами
 * опознавательные знаки, так что переименовать их в одном слое и забыть про
 * другой нельзя. Всё прочее здесь — размеры, место, обстановка — свободно.
 *
 * Раньше эти две комнаты жили в середине `tutor_room.ts` вместе с Актовым залом и
 * Оружейной, а точка появления игрока — тернарником в конце файла, в двухстах
 * строках от комнаты, на которую он ссылался. Понять сиквенс по коду было нельзя,
 * не сложив пять разных мест.
 */

import {
  Cell, DoorState, Tex, RoomType, Feature,
  type Room, type Entity,
  EntityType,
} from '../../core/types';
import { World } from '../../core/world';
import { stampRoom, protectRoom } from '../shared';
import { Spr } from '../../entities/sprite_index';
import { TUTORIAL_START } from '../../data/tutorial_start';

const CAFE_W = 8, CAFE_H = 8;
const BATH_W = 5, BATH_H = 5;

/** Запас по высоте над залом при поиске чистого места: его считает Актовый зал. */
export const TUTORIAL_START_CLEARANCE = CAFE_H + BATH_H;

export interface TutorialStartResult {
  nextRoomId: number;
  /** Где встаёт игрок. `null` вне туториала: тогда его принимает Актовый зал. */
  spawn: { x: number; y: number } | null;
}

/**
 * Стены стартовых комнат держат герметизацию: их не имеет права снести ни один
 * последующий проход по этажу.
 */
export function protectTutorialWallsAsHermetic(world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (dx !== -1 && dx !== w && dy !== -1 && dy !== h) continue;
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] === Cell.WALL) world.hermoWall[idx] = 1;
    }
  }
}

/**
 * Дверь стартовой зоны: створка, косяки и обе стороны учёта. Косяки помечаются
 * `aptMask`, чтобы связность этажа не пробила рядом второй проход и не обошла
 * замок — на этом замке держится весь сиквенс.
 */
export function addTutorialDoor(
  world: World,
  x: number,
  y: number,
  roomA: Room,
  roomB: Room,
  state: DoorState,
  tex: Tex,
  keyId = '',
  vertical = false,
): number {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = tex;
  world.floorTex[idx] = Tex.F_LINO;
  world.aptMask[idx] = 1;
  world.hermoWall[idx] = 1;
  world.doors.set(idx, { idx, state, roomA: roomA.id, roomB: roomB.id, keyId, timer: 0 });
  roomA.doors.push(idx);
  roomB.doors.push(idx);
  world.aptMask[world.idx(vertical ? x : x - 1, vertical ? y - 1 : y)] = 1;
  world.aptMask[world.idx(vertical ? x : x + 1, vertical ? y + 1 : y)] = 1;
  return idx;
}

/**
 * Вырыть стартовую зону над Актовым залом и вернуть точку появления игрока.
 * Вне туториала комнаты остаются на месте как обстановка этажа, но ни ключа, ни
 * зажигалки в них нет и игрок начинает не здесь.
 */
export function generateTutorialStart(
  world: World,
  nextRoomId: number,
  entities: Entity[],
  nextId: { v: number },
  hall: Room,
  hallX: number,
  hallY: number,
  hallW: number,
  isTutorial: boolean,
): TutorialStartResult {
  const cafeX = hallX + Math.floor(hallW / 2) - Math.floor(CAFE_W / 2);
  const cafeY = hallY - CAFE_H - 1;

  const cafeteria = stampRoom(world, nextRoomId++, RoomType.COMMON, cafeX, cafeY, CAFE_W, CAFE_H, -1);
  cafeteria.name = 'Столовая';
  cafeteria.tags = [TUTORIAL_START.roomTag];
  cafeteria.wallTex = Tex.TILE_W;
  cafeteria.floorTex = Tex.F_LINO;
  cafeteria.sealed = true;
  protectRoom(world, cafeX, cafeY, CAFE_W, CAFE_H, Tex.TILE_W, Tex.F_LINO);
  protectTutorialWallsAsHermetic(world, cafeX, cafeY, CAFE_W, CAFE_H);

  // ШАГ 1 — раковина. Система целей ищет её как `Feature.SINK` в комнате с тегом.
  if (isTutorial) {
    world.features[world.idx(cafeX + 1, cafeY + 1)] = Feature.SINK;
    entities.push({
      id: nextId.v++,
      type: EntityType.ITEM_DROP,
      x: cafeX + 1.5,
      y: cafeY + 1.5,
      angle: 0, pitch: 0,
      alive: true, speed: 0,
      sprite: Spr.ITEM_DROP, spriteScale: 1.0,
      inventory: [{ defId: 'lighter', count: 1 }],
    });
  }

  // ШАГ 4 — эта дверь. Заперта тем самым ключом, и в стороне от слайдов зала.
  addTutorialDoor(
    world,
    hallX + Math.floor(hallW / 2) - 2,
    hallY - 1,
    hall,
    cafeteria,
    DoorState.LOCKED,
    Tex.DOOR_METAL,
    TUTORIAL_START.keyId,
  );

  const bathX = cafeX - BATH_W - 1;
  const bathY = cafeY;
  const bathroom = stampRoom(world, nextRoomId++, RoomType.BATHROOM, bathX, bathY, BATH_W, BATH_H, -1);
  bathroom.name = 'Уборная';
  bathroom.tags = [TUTORIAL_START.roomTag];
  bathroom.wallTex = Tex.TILE_W;
  bathroom.floorTex = Tex.F_TILE;
  bathroom.sealed = true;
  protectRoom(world, bathX, bathY, BATH_W, BATH_H, Tex.TILE_W, Tex.F_TILE);
  protectTutorialWallsAsHermetic(world, bathX, bathY, BATH_W, BATH_H);

  // Уборная открыта всегда: запирать оба выхода значило бы запереть и сиквенс.
  addTutorialDoor(
    world,
    cafeX - 1,
    cafeY + Math.floor(BATH_H / 2),
    cafeteria,
    bathroom,
    DoorState.HERMETIC_OPEN,
    Tex.DOOR_WOOD,
    '',
    true,
  );

  world.features[world.idx(bathX + Math.floor(BATH_W / 2), bathY + 1)] = Feature.LAMP;
  // ШАГ 2 — уборная, `Feature.TOILET`. ШАГ 3 — ключ рядом с ней.
  world.features[world.idx(bathX + Math.floor(BATH_W / 2), bathY + BATH_H - 2)] = Feature.TOILET;
  if (isTutorial) {
    entities.push({
      id: nextId.v++,
      type: EntityType.ITEM_DROP,
      x: bathX + Math.floor(BATH_W / 2) + 0.5,
      y: bathY + Math.floor(BATH_H / 2) + 0.5,
      angle: 0, pitch: 0,
      alive: true, speed: 0,
      sprite: Spr.ITEM_DROP, spriteScale: 1.0,
      inventory: [{ defId: TUTORIAL_START.keyId, count: 1 }],
    });
  }

  return {
    nextRoomId,
    spawn: isTutorial
      ? { x: cafeX + Math.floor(CAFE_W / 2) + 0.5, y: cafeY + Math.floor(CAFE_H / 2) + 0.5 }
      : null,
  };
}

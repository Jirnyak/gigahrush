import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cell, RoomType, Tex, W, type Room } from '../src/core/types';
import { World } from '../src/core/world';
import { SKY_TIER_THRESHOLD, cellCeilingTier, getCeilingHeightForTier, stampCeilingHeights } from '../src/world/ceiling_heights';

describe('Ceiling Height Tiering', () => {
  it('derives height as 1.0 + tier * 0.5 without a cap', () => {
    assert.equal(getCeilingHeightForTier(0), 1.0);
    assert.equal(getCeilingHeightForTier(1), 1.5);
    assert.equal(getCeilingHeightForTier(2), 2.0);
    // Потолка нет: тир хранится в Uint8Array, высота растёт линейно до конца диапазона.
    assert.equal(getCeilingHeightForTier(3), 2.5);
    assert.equal(getCeilingHeightForTier(255), 128.5);
  });

  /* Ярус выводится из формы, а не назначается таблицей, поэтому и проверять
   * его надо инвариантами формы: что шире — то выше, ступенек нет, небо не
   * задето, авторская воля не размыта. Числа тут не эталон: подвинется джиттер
   * или сдвиг роли — тест обязан остаться зелёным, а ложь про геометрию — нет. */
  it('derives the tier from the shape of the space', () => {
    const world = new World();
    const rooms: Room[] = [];
    const carve = (x0: number, y0: number, w: number, h: number, type: RoomType): Room => {
      const room: Room = {
        id: rooms.length, type, x: x0, y: y0, w, h, doors: [], sealed: false,
        name: `r${rooms.length}`, apartmentId: -1, wallTex: Tex.CONCRETE, floorTex: Tex.F_CONCRETE,
      };
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const i = world.idx(x, y);
          world.cells[i] = Cell.FLOOR;
          world.roomMap[i] = room.id;
        }
      }
      rooms.push(room);
      return room;
    };

    const closet = carve(100, 100, 2, 2, RoomType.LIVING);
    const corridor = carve(120, 100, 40, 1, RoomType.CORRIDOR);
    const hall = carve(200, 200, 24, 24, RoomType.LIVING);
    const authored = carve(300, 300, 6, 6, RoomType.LIVING);
    authored.ceilingTier = 5;
    world.rooms = rooms;

    stampCeilingHeights(world);
    const tierOf = (room: Room) => cellCeilingTier(world, room.x + (room.w >> 1), room.y + (room.h >> 1));

    // Что просторнее — то выше. Табличка «площадь >= 80» ставила каморке и залу
    // соседние ярусы; радиус разводит их непрерывно.
    assert.ok(tierOf(hall) > tierOf(closet), `зал ${tierOf(hall)} не выше каморки ${tierOf(closet)}`);
    assert.ok(tierOf(hall) > tierOf(corridor), `зал ${tierOf(hall)} не выше коридора ${tierOf(corridor)}`);

    // Авторская воля выше формулы и диффузией не размывается.
    assert.equal(tierOf(authored), 5);

    // Небо — не потолок: выведенный ярус обязан остаться под его полосой, иначе
    // стена уйдёт столбом вверх (уже был такой баг с дверями).
    for (const room of [closet, corridor, hall]) {
      assert.ok(tierOf(room) < SKY_TIER_THRESHOLD, `${room.name}: ярус ${tierOf(room)} достал до неба`);
    }

    // Диффузия: между соседними открытыми клетками не больше одного яруса, —
    // иначе выход из коридора в зал читается обрывом потолка.
    for (let y = hall.y - 2; y < hall.y + hall.h + 2; y++) {
      for (let x = hall.x - 2; x < hall.x + hall.w + 2; x++) {
        const i = world.idx(x, y);
        if (world.cells[i] === Cell.WALL) continue;
        const right = world.idx(x + 1, y);
        const down = world.idx(x, y + 1);
        if (world.cells[right] !== Cell.WALL) {
          assert.ok(Math.abs(world.ceilHeight[i] - world.ceilHeight[right]) <= 1, `ступенька по X в ${x},${y}`);
        }
        if (world.cells[down] !== Cell.WALL) {
          assert.ok(Math.abs(world.ceilHeight[i] - world.ceilHeight[down]) <= 1, `ступенька по Y в ${x},${y}`);
        }
      }
    }

    assert.equal(W, world.ceilHeight.length / W, 'мир перестал быть квадратным — проверка выше врёт');
  });

  it('mirrors the GLSL formula in the raycaster', () => {
    // Смысл функции — быть TS-зеркалом шейдера. Разъедутся стороны — разъедется
    // геометрия потолка между растеризацией и рейкастером, молча.
    const shader = fs.readFileSync(path.join(process.cwd(), 'src/render/webgl.ts'), 'utf8');
    const occurrences = shader.match(/1\.0 \+ raw\w*Tier \* 0\.5/g) ?? [];
    assert.ok(occurrences.length > 0, 'формула высоты потолка исчезла из GLSL в render/webgl.ts');
    for (const line of occurrences) {
      assert.match(line, /1\.0 \+ raw\w*Tier \* 0\.5/);
    }
  });
});

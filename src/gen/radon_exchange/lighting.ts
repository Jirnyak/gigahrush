/* ── Радоновый обменник: свет скан-линий ──────────────────────────
 *
 * Этаж выходил из генератора с ШЕСТЬЮ источниками на 201 933 проходимых клетки.
 * Обменный зал, узел нулевого радиуса, кассеты заслонок и вся решётка проекций
 * стояли в темноте: игрок ходил по этажу-прибору, не видя ни одной его линии.
 *
 * Обменник светит не помещениями, а ПОЛОСАМИ. Он читает бетон построчно, и
 * свет здесь идёт тем же порядком: горизонтальные скан-линии через равный шаг,
 * между ними — непрочитанная тёмная полоса. Игрок пересекает их поперёк и
 * физически чувствует такт прибора; заодно полоса — ориентир, по которому на
 * решётке одинаковых ходов понятно, куда сместился.
 *
 * Отдельно горят заслонки: кассета под наблюдением всегда освещена, иначе
 * запертую створку невозможно отличить от глухой стены. Слепой клин
 * дозиметристов не освещается НАМЕРЕННО — он на то и слепой, и награда в нём
 * стоит того, чтобы войти туда без света.
 *
 * Проход детерминированный, шагом по полосе. Занятую клетку не переписывает.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';
import { RADON_EXCHANGE_ROOM_NAMES, SHUTTER_DOORS } from './meta';

/** Шаг между скан-линиями. Радиус лампы 8, полоса выходит около пятнадцати
 *  клеток шириной: шаг 22 оставляет между полосами узкую непрочитанную тень. */
const SCAN_PITCH = 22;

/** Шаг ламп ВДОЛЬ полосы. Чуть теснее диаметра пятна, чтобы полоса читалась
 *  как непрерывная линия, а не как пунктир. */
const SCAN_STEP = 9;

function setScanLamp(world: World, x: number, y: number, blind: number): boolean {
  const i = world.idx(x, y);
  if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) return false;
  if (world.roomMap[i] === blind) return false;
  world.features[i] = Feature.LAMP;
  return true;
}

/** Решётка обменника — сплошные простенки, и лампа на самой линии чаще всего
 *  попадает в бетон. Без кольцевого сноса полоса рассыпалась бы на огрызки. */
function setScanLampNear(world: World, x: number, y: number, reach: number, blind: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (setScanLamp(world, x + dx, y + dy, blind)) return true;
      }
    }
  }
  return false;
}

export function lightRadonExchange(world: World): void {
  const blind = world.rooms.find(room => room.name === RADON_EXCHANGE_ROOM_NAMES.blindWedge)?.id ?? -2;

  // Скан-линии. Полоса идёт через весь тор: этаж читает бетон целиком, а не
  // только там, где авторские комнаты.
  for (let y = SCAN_PITCH >> 1; y < W; y += SCAN_PITCH) {
    for (let x = 0; x < W; x += SCAN_STEP) {
      setScanLampNear(world, x, y, 3, blind);
    }
  }

  // Заслонки: створка под наблюдением. Свет садится по обе стороны кассеты,
  // поэтому игрок видит и саму заслонку, и то, что за ней открылось.
  for (const shutter of SHUTTER_DOORS) {
    const dx = shutter.axis === 'horizontal' ? 3 : 0;
    const dy = shutter.axis === 'horizontal' ? 0 : 3;
    setScanLampNear(world, shutter.x - dx, shutter.y - dy, 2, blind);
    setScanLampNear(world, shutter.x + dx, shutter.y + dy, 2, blind);
  }
}

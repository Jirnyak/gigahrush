/* ── Замурованные комнаты: комната есть, а войти в неё нельзя ──────
 *
 * Комнаты — основа мира (`rooms.md`). Комната, вырытая без единого проёма,
 * остаётся в `world.rooms`, видна на карте, принимает жильцов и цели квестов,
 * но игрок в неё не попадёт никогда. Это молчаливый класс: генерация не падает,
 * тесты этажа зелёные, и обнаруживается он только тем, что человек стоит перед
 * глухой стеной там, где слух обещал тайник.
 *
 * Замуровать комнату умеют четыре разные дороги, и общая починка не спасает ни
 * от одной:
 *
 * 1. `connectProtectedRoom` (`src/gen/shared.ts:596`) пробивает РОВНО ОДИН
 *    проём и ищет коридор не дальше 30 клеток. Не нашла — молча возвращается.
 * 2. `protectRoom` ставит `aptMask=1` на всю комнату с рамкой, а
 *    `carveCorridor` (`src/gen/shared.ts:836`) через `aptMask` не роет вообще.
 *    Поэтому `ensureConnectivity` — единственная общая починка связности —
 *    структурно не способна вскрыть защищённую комнату.
 * 3. Расширение до полного этажа после связности: этаж зовёт
 *    `ensureConnectivity`, а потом дорывает свои районы и больше связность не
 *    пересчитывает. Всё, что вырыто после, остаётся отдельными компонентами.
 * 4. Ручное соединение с ошибкой на клетку (свою же стену не прорыли) или
 *    маршрутный лифт, севший в единственный однокле­точный коридор.
 *
 * Тест НЕ утверждает, что всё хорошо. Он фиксирует ТЕКУЩЕЕ число замурованных
 * комнат как ПОТОЛОК: чинить — можно и нужно, ухудшать — нельзя. Починил этаж —
 * опусти число здесь же, иначе храповик разожмётся.
 *
 * Файл импортирует `../src/gen/`, поэтому уезжает в набор `npm run test:generation`
 * (он же третий шаг `npm run check`), а в `check:readonly` не входит.
 */

import * as assert from 'node:assert/strict';

import '../src/content';
import { Cell, W, type Room } from '../src/core/types';
import { SIDE_QUESTS } from '../src/data/plot';
import { RUMORS } from '../src/data/rumors';
import { designFloorById, type DesignFloorId } from '../src/data/design_floors';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { testGenerationMatrix } from './generator_helpers';

/** Один сид на весь тест: потолки ниже сняты именно с него. */
const SEED = 1;

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

interface FloorScan {
  /** Комнаты без единой достижимой от спавна клетки. */
  sealed: readonly Room[];
  /** Из них те, у кого есть системный `defId` (механизм `gen/named_rooms.ts`). */
  sealedWithDefId: readonly Room[];
  /** Из них те, на которые ссылается контент — квест или слух. */
  sealedReferenced: readonly Room[];
  totalRooms: number;
}

/** Имена и псевдонимы комнат, которые контент этого этажа объявил целью.
 *  Совпадение идёт и по `defId`, и по имени — ровно как в `systems/contracts.ts`. */
function contentReferencedRoomIds(z: number): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const step of SIDE_QUESTS) {
    if (step.targetRoomDefId && step.targetFloorZ === z) ids.add(step.targetRoomDefId);
  }
  for (const rumor of RUMORS) {
    const lead = rumor.lead;
    if (lead?.roomDefId && lead.z === z) ids.add(lead.roomDefId);
  }
  return ids;
}

function scanFloor(id: DesignFloorId): FloorScan {
  const gen = generateDesignFloor(id, SEED);
  const world = gen.world;

  // Заливка проходимых клеток от точки спавна. LIFT непроходим, как и в
  // `classifyReachabilityCell`: лифт — переход между этажами, а не пол.
  const reached = new Uint8Array(W * W);
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  const start = world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY));
  reached[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const ci = queue[head++];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of ORTHO) {
      const ni = world.idx(x + dx, y + dy);
      if (reached[ni]) continue;
      const cell = world.cells[ni];
      if (cell !== Cell.FLOOR && cell !== Cell.DOOR && cell !== Cell.WATER) continue;
      reached[ni] = 1;
      queue[tail++] = ni;
    }
  }

  const referenced = contentReferencedRoomIds(designFloorById(id)!.z);
  const sealed: Room[] = [];
  let totalRooms = 0;
  // Дыр тут быть не должно — плотность `world.rooms` держит
  // `tests/rooms-dense.test.ts`, — но обход дешевле оставить защищённым.
  for (const room of world.rooms) {
    if (!room) continue;
    totalRooms++;
    let reachable = false;
    for (let dy = 0; dy < room.h && !reachable; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const ci = world.idx(room.x + dx, room.y + dy);
        if (reached[ci]) { reachable = true; break; }
      }
    }
    if (!reachable) sealed.push(room);
  }

  return {
    sealed,
    sealedWithDefId: sealed.filter(room => room.defId !== undefined),
    sealedReferenced: sealed.filter(room => referenced.has(room.defId ?? '') || referenced.has(room.name)),
    totalRooms,
  };
}

/** Потолок замурованных комнат на этаже при `SEED`. Ноль — норма; всё остальное
 *  снято с реального прогона и подлежит уменьшению по мере починки. */
interface FloorCeiling {
  /** Всего комнат без единой достижимой клетки. */
  sealed: number;
  /** Из них с системным `defId`. */
  withDefId: number;
  /** Из них целей квестов и слухов. */
  referenced: number;
  /** Почему столько. */
  why: string;
}

const CEILINGS: Readonly<Record<string, FloorCeiling>> = {
  // Расширение районов идёт ПОСЛЕ связности, и второй раз её никто не считает:
  // всё, что дорыто расширением, остаётся отдельными компонентами.
  registry_morgue: { sealed: 194, withDefId: 0, referenced: 0, why: 'expandRegistryMorgueGeometry без повторной ensureConnectivity' },
  floor_69: { sealed: 130, withDefId: 0, referenced: 0, why: 'expandFloor69FullFloor после ensureConnectivity' },
  raionsovet_archive: { sealed: 58, withDefId: 0, referenced: 0, why: 'expandRaionsovetArchiveGeometry после ensureConnectivity' },
  // Защищённые POI: connectProtectedRoom не нашла коридор, а carveCorridor
  // через aptMask не роет, поэтому ensureConnectivity их не спасает.
  living: { sealed: 44, withDefId: 1, referenced: 3, why: 'защищённые POI + прокоп зала пролога сдвинул раскладку зон; владелец решил 2026-08-20 не чинить замурованность как класс — в игре есть ПСИ-дефазинг, см. problems.md. Потолок взят по максимуму сидов, а не по SEED' },
  maintenance: { sealed: 9, withDefId: 0, referenced: 4, why: 'stampMaintRoom: connectProtectedRoom + дробные координаты из findMaintArea' },
  roof: { sealed: 7, withDefId: 0, referenced: 0, why: 'острова архипелага за ABYSS: carveCorridor роет только по WALL' },
  ministry: { sealed: 4, withDefId: 0, referenced: 2, why: 'createAdminRoom: единственный проём от connectProtectedRoom' },
  kvartiry: { sealed: 2, withDefId: 0, referenced: 1, why: 'social_helpers: connectProtectedRoom' },
  liquidatorbase: { sealed: 2, withDefId: 0, referenced: 0, why: 'коридор не прорыл собственную стену штаба; в другой сел маршрутный лифт' },
  antenna_court: { sealed: 1, withDefId: 0, referenced: 0, why: 'гермокапсула НИИ' },
  outer_district: { sealed: 1, withDefId: 0, referenced: 0, why: 'домик за периметром' },
  horrorfloor: { sealed: 1, withDefId: 0, referenced: 0, why: 'лабиринтная камера' },
  // Чистые этажи — контрольная группа: здесь замурованных быть не должно.
  hell: { sealed: 0, withDefId: 0, referenced: 0, why: '' },
  service_floor: { sealed: 0, withDefId: 0, referenced: 0, why: '' },
  underhell: { sealed: 0, withDefId: 0, referenced: 0, why: '' },
};

function describe(rooms: readonly Room[], limit = 6): string {
  return rooms.slice(0, limit)
    .map(room => `${room.defId ?? room.name} (${room.x},${room.y} ${room.w}x${room.h})`)
    .join('; ') + (rooms.length > limit ? ` … ещё ${rooms.length - limit}` : '');
}

testGenerationMatrix('замурованных комнат на этаже не становится больше', () => {
  const regressions: string[] = [];
  for (const [id, ceiling] of Object.entries(CEILINGS)) {
    const scan = scanFloor(id as DesignFloorId);
    if (scan.sealed.length > ceiling.sealed) {
      regressions.push(
        `${id}: замуровано ${scan.sealed.length} из ${scan.totalRooms} комнат, потолок ${ceiling.sealed}`
        + ` — ${describe(scan.sealed)}`,
      );
    }
    // Именованная комната — та, на которую ссылается система: её псевдоним
    // объявлен этажом (`gen/named_rooms.ts`) или её ищет квест или слух.
    // Такую замуровать дороже всего: цель есть, дойти нельзя.
    if (scan.sealedWithDefId.length > ceiling.withDefId) {
      regressions.push(
        `${id}: замурована ИМЕНОВАННАЯ комната (defId), ${scan.sealedWithDefId.length} > ${ceiling.withDefId}`
        + ` — ${describe(scan.sealedWithDefId)}`,
      );
    }
    if (scan.sealedReferenced.length > ceiling.referenced) {
      regressions.push(
        `${id}: замурована комната-ЦЕЛЬ квеста или слуха, ${scan.sealedReferenced.length} > ${ceiling.referenced}`
        + ` — ${describe(scan.sealedReferenced)}`,
      );
    }
  }

  assert.deepEqual(regressions, [], `замурованные комнаты:\n- ${regressions.join('\n- ')}`);
});

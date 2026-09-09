/* Замок «наводка слуха ведёт в комнату, которая есть».
 *
 * Прежний оракул был ТЕКСТОВЫЙ — «имя встречается где-то в `src/`», — и врал в
 * обе стороны. Замерено прогоном 2026-09-09:
 *   · «Бетоноед: шумная кладовая у слабой стены» была помечена непостроенной, а
 *     стоит на коллекторах на всех четырёх сидах: её имя собирается из шаблона,
 *     и подстроки в исходнике нет;
 *   · «Курительная» и «Цех металла» текстовый оракул считал построенными, потому
 *     что такие подстроки в исходнике ЕСТЬ — но комнаты зовутся «Курительная
 *     #203» и «Цех металла: линия восстановления», и точное имя не встречается
 *     нигде.
 *
 * Поэтому оракул здесь — ГЕНЕРАЦИЯ. Проверяется ровно то, что обещает наводка:
 * на этаже, который она называет (`lead.z`), комната с таким адресом есть.
 * Совпадение идёт по паре полей — `room.defId` и `room.name`, — как в
 * `systems/contracts.ts` и `tests/hell-plot-rooms-delivery.test.ts`.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { RUMORS, UNBUILT_LEAD_ROOM_NAMES } from '../src/data/rumors';
import { DESIGN_FLOOR_ROUTES, type DesignFloorId } from '../src/data/design_floors';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';

const SEED = 4242;

interface LeadRoom { name: string; rumorIds: string[] }

function leadRoomsByFloor(): Map<DesignFloorId, LeadRoom[]> {
  const zToId = new Map(DESIGN_FLOOR_ROUTES.map(route => [route.z, route.id]));
  const byFloor = new Map<DesignFloorId, LeadRoom[]>();
  for (const rumor of RUMORS) {
    const name = rumor.lead?.roomDefId;
    if (name === undefined) continue;
    const z = rumor.lead?.z;
    assert.notEqual(z, undefined, `наводка ${rumor.id} называет комнату без этажа`);
    const id = zToId.get(z!);
    if (!id) continue;
    const list = byFloor.get(id) ?? [];
    const existing = list.find(entry => entry.name === name);
    if (existing) existing.rumorIds.push(rumor.id);
    else list.push({ name, rumorIds: [rumor.id] });
    byFloor.set(id, list);
  }
  return byFloor;
}

function builtRoomNames(id: DesignFloorId): Set<string> {
  const gen = generateDesignFloor(id, SEED);
  const names = new Set<string>();
  for (const room of gen.world.rooms) {
    if (!room) continue;
    if (room.name) names.add(room.name);
    const defId = (room as { defId?: string }).defId;
    if (defId) names.add(defId);
  }
  return names;
}

test('наводка ведёт в построенную комнату, а помеченная — никуда', () => {
  const byFloor = leadRoomsByFloor();
  assert.ok(byFloor.size > 5, 'наводок с адресом почти не осталось — замок стал бессмысленным');

  const missing: string[] = [];
  const falselyMarked: string[] = [];
  for (const [id, rooms] of byFloor) {
    const built = builtRoomNames(id);
    for (const room of rooms) {
      const marked = UNBUILT_LEAD_ROOM_NAMES.includes(room.name);
      const exists = built.has(room.name);
      if (marked && exists) falselyMarked.push(`${id}: ${room.name}`);
      if (!marked && !exists) missing.push(`${id}: ${room.name} (${room.rumorIds.join(', ')})`);
    }
  }

  assert.deepEqual(falselyMarked, [],
    'комната ЕСТЬ на своём этаже — убери её из UNBUILT_LEAD_ROOMS, иначе адрес гасится зря');
  assert.deepEqual(missing, [],
    'наводка ведёт в комнату, которой на названном ею этаже нет: построй её или помечай в UNBUILT_LEAD_ROOMS');
});

test('у помеченной наводки остаётся другой адрес', () => {
  /* Снятие имени не имеет права оставить слух вовсе без места: тогда он
   * становится наводкой в пустоту, а не наводкой на тип комнаты. */
  const anchorless: string[] = [];
  for (const rumor of RUMORS) {
    const name = rumor.lead?.roomDefId;
    if (name === undefined || !UNBUILT_LEAD_ROOM_NAMES.includes(name)) continue;
    const lead = rumor.lead!;
    const hasAnchor = lead.z !== undefined
      || lead.zoneHint !== undefined
      || lead.roomType !== undefined
      || lead.itemId !== undefined
      || lead.monsterKind !== undefined;
    if (!hasAnchor) anchorless.push(rumor.id);
  }
  assert.deepEqual(anchorless, []);
});

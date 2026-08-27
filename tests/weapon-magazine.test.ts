/* Замок: патроны в стволе принадлежат СТВОЛУ, а не бойцу.
 *
 * `currentMag` — одно число на сущности, и раньше оно не помнило, из какого
 * оружия эти патроны: смена ствола его не трогала нигде. Магазин ППШ (71
 * патрон 9 мм) переезжал в АК целиком и давал 71 БЕСПЛАТНЫЙ ВЫСТРЕЛ патроном
 * 7.62, которого у игрока нет вовсе:
 *   - ручная перезарядка молчала: needed = 30 − 71 < 0;
 *   - автоперезарядка не включалась: магазин ведь не пуст;
 *   - гейт выстрела в `main.ts` смотрел только на `(currentMag ?? 0) > 0`.
 * Цикл повторяем: вернуться к ППШ, перезарядиться дешёвым 9 мм, снова надеть
 * АК. Тем же путём заряжались пулемёт (100 в ленте) и лосяш-винтовка (урон 140).
 *
 * Обе стороны правила:
 *   - чужой магазин не стреляет и не догружается;
 *   - свой магазин переживает смену ствола и возврат («убрал ППШ с 40 в стволе —
 *     вернулся, там те же 40»);
 *   - перезарядка нового ствола работает своим патроном;
 *   - у NPC магазин остаётся за боевым AI, инвентарь ему в ствол не лезет.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { WEAPON_STATS, type WeaponStats } from '../src/data/catalog';
import { initFactionRelations } from '../src/data/relations';
import { addItem, consumeAmmo, countAmmo, removeItem, useItem } from '../src/systems/inventory';
import { setCombatContext, tryFactionCombat } from '../src/systems/ai/combat';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { freshRPG } from '../src/systems/rpg';

const OX = 500;
const OY = 500;

function makePlayer(): Entity {
  return {
    id: 1, type: EntityType.NPC, persistentNpcId: 'player',
    x: OX + 0.5, y: OY + 0.5, angle: 0, pitch: 0, alive: true, speed: 3, sprite: 0,
    hp: 100, maxHp: 100, inventory: [], weapon: '', faction: Faction.PLAYER,
    name: 'Вы', rpg: freshRPG(1),
  };
}

function slotIndex(e: Entity, defId: string): number {
  const idx = (e.inventory ?? []).findIndex(s => s.defId === defId);
  assert.notEqual(idx, -1, `нет слота ${defId}`);
  return idx;
}

function equip(e: Entity, defId: string): void {
  const msgs: Msg[] = [];
  useItem(e, slotIndex(e, defId), msgs, 0);
  assert.equal(e.weapon, defId, `не экипировалось: ${defId}`);
}

/* Зеркала боевых условий из `src/main.ts` (:4846 перезарядка, :4889 гейт
 * выстрела). Тест не тянет браузерную точку входа, поэтому условия переписаны
 * буквально — если они разойдутся, разойдётся и смысл замка. */
function canFire(e: Entity, ws: WeaponStats): boolean {
  return !!(ws.psiCost || ws.magazineSize === Infinity || (e.currentMag ?? 0) > 0);
}

function reload(e: Entity, weaponId: string): number {
  const ws = WEAPON_STATS[weaponId];
  const needed = (ws.magazineSize ?? 1) - (e.currentMag ?? 0);
  if (needed <= 0) return 0;
  const actual = Math.min(needed, countAmmo(e, weaponId));
  if (actual > 0) {
    removeItem(e, ws.ammoType!, actual);
    e.currentMag = (e.currentMag ?? 0) + actual;
  }
  return actual;
}

test('чужой магазин не стреляет: 71 патрон ППШ не заряжает АК', () => {
  const player = makePlayer();
  addItem(player, 'ppsh', 1);
  addItem(player, 'ak47', 1);
  addItem(player, 'ammo_9mm', 71);

  equip(player, 'ppsh');
  assert.equal(reload(player, 'ppsh'), 71, 'ППШ не набрал полный магазин');
  assert.equal(player.currentMag, 71);
  assert.equal(countAmmo(player, 'ppsh'), 0, '9 мм должны уйти в ствол целиком');

  // Патронов 7.62 у игрока НОЛЬ.
  equip(player, 'ak47');
  assert.equal(countAmmo(player, 'ak47'), 0);
  assert.equal(player.currentMag ?? 0, 0, 'патроны ППШ оказались в стволе АК');
  assert.equal(canFire(player, WEAPON_STATS.ak47), false, 'АК стреляет без единого патрона 7.62');
  assert.equal(consumeAmmo(player, undefined, 'ak47'), false, 'АК списал выстрел из чужого магазина');
  assert.equal(reload(player, 'ak47'), 0, 'перезарядка нашла патроны из ниоткуда');
});

test('свой магазин переживает смену ствола и возврат', () => {
  const player = makePlayer();
  addItem(player, 'ppsh', 1);
  addItem(player, 'ak47', 1);
  addItem(player, 'ammo_9mm', 71);
  addItem(player, 'ammo_762', 30);

  equip(player, 'ppsh');
  reload(player, 'ppsh');
  for (let i = 0; i < 31; i++) assert.equal(consumeAmmo(player, undefined, 'ppsh'), true);
  assert.equal(player.currentMag, 40);

  equip(player, 'ak47');
  assert.equal(reload(player, 'ak47'), 30, 'новый ствол не набрал свой магазин');
  assert.equal(player.currentMag, 30);
  for (let i = 0; i < 5; i++) assert.equal(consumeAmmo(player, undefined, 'ak47'), true);
  assert.equal(player.currentMag, 25);

  // Убрал ППШ с 40 в стволе — вернулся, там те же 40.
  equip(player, 'ppsh');
  assert.equal(player.currentMag, 40, 'ППШ забыл свой магазин');
  equip(player, 'ak47');
  assert.equal(player.currentMag, 25, 'АК забыл свой отстрелянный магазин');
});

test('снятое оружие не уносит магазин с собой, кулаки готовы к удару', () => {
  const player = makePlayer();
  addItem(player, 'ppsh', 1);
  addItem(player, 'ammo_9mm', 71);
  equip(player, 'ppsh');
  reload(player, 'ppsh');

  // Повторное использование слота снимает оружие: остаются кулаки.
  useItem(player, slotIndex(player, 'ppsh'), [], 0);
  assert.equal(player.weapon, '');
  assert.equal(player.currentMag, WEAPON_STATS[''].magazineSize ?? 1, 'кулаки не могут ударить');
  assert.equal(canFire(player, WEAPON_STATS['']), true);

  equip(player, 'ppsh');
  assert.equal(player.currentMag, 71, 'снятый ствол потерял патроны');
});

test('ближний бой готов к первому удару, а бензопила требует своего топлива', () => {
  const player = makePlayer();
  addItem(player, 'ppsh', 1);
  addItem(player, 'ammo_9mm', 71);
  addItem(player, 'knife', 1);
  addItem(player, 'chainsaw', 1);
  equip(player, 'ppsh');
  reload(player, 'ppsh');

  equip(player, 'knife');
  assert.equal(player.currentMag, 1, 'нож начал бой с фиктивной перезарядки');

  // Бензопила ближняя, но жрёт настоящее топливо через тот же магазин.
  equip(player, 'chainsaw');
  assert.equal(player.currentMag ?? 0, 0, 'бензопила получила 50 бесплатных оборотов');
  assert.equal(reload(player, 'chainsaw'), 0, 'топливо нашлось из ниоткуда');
  addItem(player, 'ammo_fuel', 20);
  assert.equal(reload(player, 'chainsaw'), 20);
});

/* ── Сторона NPC: магазин остаётся за боевым AI ───────────────── */

function openWorld(w = 40, h = 12): World {
  const world = new World();
  for (let y = OY - 1; y <= OY + h; y++) {
    for (let x = OX - 1; x <= OX + w; x++) world.set(x, y, Cell.FLOOR);
  }
  return world;
}

test('магазин NPC остаётся за боевым AI: инвентарь ему в ствол не лезет', () => {
  initFactionRelations();
  const world = openWorld();
  setCombatContext([], 5);

  const shooter: Entity = {
    id: 1, type: EntityType.NPC, x: OX + 0.5, y: OY + 0.5, angle: 0, pitch: 0, alive: true,
    speed: 3, sprite: 0, hp: 100, maxHp: 100, faction: Faction.LIQUIDATOR, weapon: 'ppsh',
    inventory: [{ defId: 'ppsh', count: 1, data: { mag: 0 } }],
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
  const beast: Entity = {
    id: 2, type: EntityType.MONSTER, x: OX + 8.5, y: OY + 0.5, angle: 0, pitch: 0, alive: true,
    speed: 2, sprite: 0, hp: 400, maxHp: 400, monsterKind: MonsterKind.SBORKA,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
  const entities = [shooter, beast];
  rebuildEntityIndex(entities);

  // Оружие пришло от генератора, `useItem` тут не звали: для AI `currentMag`
  // не определён — значит полный магазин, а не пустой слот из инвентаря.
  tryFactionCombat(world, entities, shooter, 0.1, 5, [], { v: 100 });
  assert.equal(shooter.reloading ?? false, false, 'NPC ушёл в перезарядку с полным магазином');
  assert.ok(entities.some(x => x.type === EntityType.PROJECTILE), 'NPC не выстрелил');
  assert.equal(shooter.currentMag, (WEAPON_STATS.ppsh.magazineSize ?? 1) - 1);
  assert.deepEqual(shooter.inventory![0].data, { mag: 0 }, 'бой переписал магазин в инвентаре');
});

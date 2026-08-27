/**
 * Замки контейнеров: обе стороны правила.
 *
 * Что защищает: запертый ящик признаёт ТОЛЬКО свой класс допуска, бумага при
 * этом расходуется, а замок без ключа остаётся законным — внутрь через удар.
 * Тир `lockDifficulty` задаёт ЦЕНУ обхода, а не запрет: непроламываемых ящиков
 * не бывает, как не бывает непроламываемых створок.
 *
 * Чем ошибка обошлась: `containerUnlockItemId` заканчивался безусловным
 * перебором пяти предметов, и один `key` — который министерское окно штампует
 * любому просителю за любую бумагу — отпирал ВСЕ запертые контейнеры игры: 36
 * из 36 на шести обмеренных этажах, бесплатно и без расхода. Одновременно
 * `lockDifficulty` не читал НИКТО: авторские тиры 2..7, расставленные больше чем
 * двадцатью модулями контента, были мёртвыми данными.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Faction } from '../src/core/types';
import { PERMIT_DEFS, permitAccessTagsFromContainerTags, resolvePermitAccess } from '../src/data/permits';
import {
  bashContainerLock,
  canAccessContainer,
  containerAccessInfo,
  containerLockBashDamage,
  containerLockMaxHp,
  containerLockRemainingHp,
  takeFromContainer,
  CONTAINER_FORCED_TAG,
} from '../src/systems/containers';
import { getRecentNoiseRecords, resetNoiseRecords } from '../src/systems/noise';
import { countInventoryItem, makeGameState, makeTestContainer, makeTestPlayer } from './helpers';

/** Карантинный шкаф: его класс допуска — только `quarantine`. */
function quarantineLocker(lockDifficulty = 3) {
  return makeTestContainer({
    access: 'locked',
    lockDifficulty,
    faction: Faction.LIQUIDATOR,
    tags: ['quarantine'],
    inventory: [{ defId: 'bandage', count: 1 }] });
}

/** Ящик, к которому ключа не существует: класса допуска у него нет вовсе. */
function keylessCrate(lockDifficulty = 3) {
  return makeTestContainer({
    access: 'locked',
    lockDifficulty,
    tags: ['tools'],
    inventory: [{ defId: 'bandage', count: 1 }] });
}

function playerWith(itemIds: readonly string[], weapon = '') {
  return makeTestPlayer({
    weapon,
    inventory: itemIds.map(defId => ({ defId, count: 1 })) });
}

test('чужой ключ запертый ящик не открывает', () => {
  const container = quarantineLocker();

  // Универсальный `key` — дверной ключ, а не отмычка от всей игры.
  assert.equal(containerAccessInfo(container, playerWith(['key'])).unlock, undefined);
  assert.equal(containerAccessInfo(container, playerWith(['container_key_label'])).unlock, undefined);
  // Бумага чужого класса (министерский корешок) карантинному шкафу не указ.
  assert.equal(containerAccessInfo(container, playerWith(['official_permit_slip'])).unlock, undefined);

  const info = containerAccessInfo(container, playerWith(['key']));
  assert.equal(info.label, 'ЗАПЕРТО');
  assert.equal(info.canTake, false);
  assert.equal(canAccessContainer(container, playerWith(['key'])), false);
});

test('свой ключ запертый ящик открывает', () => {
  const container = quarantineLocker();
  const player = playerWith(['official_quarantine_clearance']);

  const info = containerAccessInfo(container, player);
  assert.equal(info.unlock, true);
  assert.equal(info.mode, 'unlock');
  assert.equal(info.canTake, true);
});

test('одноразовая бумага расходуется при использовании', () => {
  const container = quarantineLocker();
  const player = playerWith(['official_quarantine_clearance']);
  const state = makeGameState();

  assert.equal(countInventoryItem(player, 'official_quarantine_clearance'), 1);
  assert.equal(takeFromContainer(container, player, 0, 1, state), true);

  // Бумага ушла, ящик остался открыт навсегда: класс допуска обменян на замок.
  assert.equal(countInventoryItem(player, 'official_quarantine_clearance'), 0);
  assert.equal(container.tags.includes('unlocked'), true);
  assert.equal(canAccessContainer(container, player), true);

  // Второй такой же шкаф той же бумагой уже не открыть — она израсходована.
  const second = quarantineLocker();
  assert.equal(containerAccessInfo(second, player).unlock, undefined);
});

test('замок без ключа — законный случай, и он всё равно вскрывается ломом', () => {
  const container = keylessCrate(3);

  // Ключа к нему не существует ни у кого: класса допуска у ящика нет.
  for (const paper of ['key', 'container_key_label', 'official_permit_slip',
    'official_quarantine_clearance', 'elevator_access_order', 'archive_access_permit']) {
    assert.equal(containerAccessInfo(container, playerWith([paper])).unlock, undefined, paper);
  }

  const player = playerWith(['crowbar'], 'crowbar');
  const state = makeGameState();
  const maxHp = containerLockMaxHp(container);
  assert.equal(maxHp, 90); // тир 3
  assert.equal(containerLockBashDamage(player), 24); // лом

  let hits = 0;
  let broken = false;
  while (!broken && hits < 32) {
    const result = bashContainerLock(container, player, state);
    assert.notEqual(result, null);
    hits++;
    broken = result!.broken;
  }

  assert.equal(broken, true);
  assert.equal(hits, Math.ceil(maxHp / 24)); // 4 удара
  assert.equal(container.tags.includes(CONTAINER_FORCED_TAG), true);
  assert.equal(canAccessContainer(container, player), true);
  assert.equal(containerLockRemainingHp(container), 0);
  // Ломать больше нечего.
  assert.equal(bashContainerLock(container, player, state), null);
});

test('сорванный замок открывает ящик, но взятое остаётся кражей', () => {
  const container = keylessCrate(1);
  const player = playerWith(['crowbar'], 'crowbar');
  const state = makeGameState();

  while (bashContainerLock(container, player, state)?.broken === false) { /* бьём до срыва */ }

  const info = containerAccessInfo(container, player);
  assert.equal(info.label, 'ВЗЛОМАНО');
  assert.equal(info.canTake, true);
  assert.equal(info.theft, true);
  assert.equal(info.mode, 'steal');
});

test('цена вскрытия растёт с тиром замка', () => {
  const tier2 = keylessCrate(2);
  const tier5 = keylessCrate(5);
  const crowbar = playerWith(['crowbar'], 'crowbar');
  const fists = playerWith([]);

  assert.equal(containerLockMaxHp(tier2), 60);
  assert.equal(containerLockMaxHp(tier5), 150);
  // Тир 5 ровно в 2.5 раза дороже тира 2 — линейно по авторской шкале 1..7.
  assert.equal(containerLockMaxHp(tier5) / containerLockMaxHp(tier2), 2.5);

  const hits = (c: typeof tier2, who: typeof crowbar) =>
    Math.ceil(containerLockMaxHp(c) / containerLockBashDamage(who));
  assert.equal(hits(tier2, crowbar), 3);
  assert.equal(hits(tier5, crowbar), 7);
  // Инструмент тоже цена: голыми руками тот же тир 5 стоит 50 ударов.
  assert.equal(hits(tier5, fists), 50);
  assert.ok(hits(tier5, crowbar) > hits(tier2, crowbar));
});

test('удар по замку изнашивает железо в руке', () => {
  const container = keylessCrate(5);
  const player = playerWith(['crowbar'], 'crowbar');
  const state = makeGameState();
  const slot = player.inventory!.find(i => i.defId === 'crowbar')!;
  slot.data = { dur: 120 };

  bashContainerLock(container, player, state);
  bashContainerLock(container, player, state);

  assert.equal((slot.data as { dur: number }).dur, 118);
});

test('шум удара по замку слышен, и на каждый удар', () => {
  const container = keylessCrate(5);
  const player = playerWith(['crowbar'], 'crowbar');
  const state = makeGameState();

  resetNoiseRecords();
  bashContainerLock(container, player, state);
  bashContainerLock(container, player, state);

  const records = getRecentNoiseRecords(state, { z: container.z, source: 'melee' });
  assert.equal(records.length, 2);
  assert.equal(records[0].tags.includes('lock'), true);
});

/* Замок не зависит от того, что в нём лежит.
 *
 * Ящик перечисляет всё, что о нём известно, и класс `general_admin` приписан ему
 * ПО СОДЕРЖИМОМУ: тег `paper`/`permit`/`document` значит «внутри бумаги», а не
 * «замок общий». Совпадения по ЛЮБОМУ классу хватало, поэтому самое узкое
 * требование ящика побеждалось его же самым широким: сейф с бумагами открывали
 * пятнадцать пропусков из семнадцати, а точно такой же сейф без бумаг — два.
 *
 * `general_admin` при этом ни у одного из семнадцати пропусков не единственный
 * класс: он всегда приписка. Поэтому строгое правило ни у кого не отнимает его
 * назначения, а обычный бумажный шкаф — тот, что просит ТОЛЬКО `general_admin`, —
 * по-прежнему открывает любая бумага. Это и есть общий административный доступ. */

function openersOf(containerTags: readonly string[]): number {
  const asks = permitAccessTagsFromContainerTags(containerTags);
  let openers = 0;
  for (const def of PERMIT_DEFS) {
    if (resolvePermitAccess([def.itemId], asks)) openers++;
  }
  return openers;
}

test('содержимое ящика не ослабляет его замок', () => {
  const bare = openersOf(['vault']);
  const withPapers = openersOf(['vault', 'paper']);
  assert.equal(withPapers, bare, 'сейф с бумагами открывается шире, чем такой же сейф без бумаг');
  assert.ok(bare < PERMIT_DEFS.length / 2, `узкий замок открывает слишком много пропусков: ${bare}`);
});

test('узкий класс побеждает широкий, а не наоборот', () => {
  for (const tags of [['vault', 'paper'], ['weapon', 'permit'], ['quarantine', 'document']]) {
    const asks = permitAccessTagsFromContainerTags(tags);
    assert.ok(asks.includes('general_admin'), `сцена не воспроизводит случай: ${tags.join(',')}`);
    assert.ok(asks.length > 1, `у ящика нет узкого класса: ${tags.join(',')}`);
    assert.ok(openersOf(tags) < 8, `узкий замок ${tags.join(',')} берут ${openersOf(tags)} пропусков`);
  }
});

test('общий административный доступ остался общим', () => {
  // Обратная сторона правила: без неё строгость превратила бы бумажный шкаф в сейф.
  assert.ok(openersOf(['paper']) >= 10, 'обычный бумажный шкаф перестала открывать обычная бумага');
});

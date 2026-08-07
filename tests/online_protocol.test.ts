import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, EntityType, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import {
  sanitizeIntent,
  nextIntentMsg,
  peerLastSentSeq,
  packActorEcho,
  applyActorEcho,
  buildVisitExport,
  sanitizeVisitExport,
  applyVisitExport,
  markNetCellTouched,
  drainNetCellPatch,
  applyNetCellPatch,
  pendingNetCellCount,
  noteNetSample,
  updateNetInterpolation,
  pushNetFx,
  drainNetFx,
  hostNoteProcessedSeq,
  hostLastProcessedSeq,
  hostSetOpenContainer,
  hostOpenContainer,
  hostContainerPayloadChanged,
  hostSetOpenNpc,
  hostOpenNpc,
  hostNpcPayloadChanged,
  hostClearSlot,
  resetOnlineProtocolState,
} from '../src/systems/online_protocol';

function makeActor(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1, type: EntityType.NPC,
    x: 10, y: 10, angle: 0, pitch: 0,
    alive: true, speed: 4, sprite: 0,
    hp: 80, maxHp: 100,
    money: 250,
    weapon: 'pipe', tool: '',
    inventory: [{ defId: 'pipe', count: 1 }, { defId: 'bread', count: 3 }],
    needs: { food: 50, water: 60, sleep: 70, pee: 10, poo: 5 },
    rpg: { level: 3, xp: 40, attrPoints: 1, str: 2, agi: 1, int: 1, psi: 10, maxPsi: 20 },
    ...overrides,
  } as Entity;
}

test.beforeEach(() => {
  resetOnlineProtocolState();
});

/* ── Intents ─────────────────────────────────────────────── */

test('intent sequence numbers are monotonic and reset with protocol state', () => {
  const a = nextIntentMsg({ kind: 'interact' });
  const b = nextIntentMsg({ kind: 'reload' });
  assert.equal(b.seq, a.seq + 1);
  assert.equal(peerLastSentSeq(), b.seq);
  resetOnlineProtocolState();
  assert.equal(peerLastSentSeq(), 0);
});

test('sanitizeIntent accepts every valid kind and rejects malformed input', () => {
  assert.deepEqual(sanitizeIntent({ kind: 'interact' }), { kind: 'interact' });
  assert.deepEqual(sanitizeIntent({ kind: 'reload' }), { kind: 'reload' });
  assert.deepEqual(sanitizeIntent({ kind: 'tool', edge: true }), { kind: 'tool', edge: true });
  assert.deepEqual(
    sanitizeIntent({ kind: 'use_item', slot: 2, defId: 'bread' }),
    { kind: 'use_item', slot: 2, defId: 'bread' },
  );
  const fire = sanitizeIntent({ kind: 'fire', weaponId: 'pipe', targetId: 42.9 });
  assert.deepEqual(fire, { kind: 'fire', weaponId: 'pipe', targetId: 42 });
  assert.equal(sanitizeIntent(null), null);
  assert.equal(sanitizeIntent({ kind: 'nonsense' }), null);
  assert.equal(sanitizeIntent({ kind: 'use_item', slot: 1 }), null); // missing defId
  assert.equal(sanitizeIntent({ kind: 'container', op: 'steal', cx: 1, cy: 1 }), null);
});

test('sanitizeIntent handles npc/trade intents and clamps the deal payload', () => {
  assert.deepEqual(sanitizeIntent({ kind: 'npc_talk', npcId: 17.9 }), { kind: 'npc_talk', npcId: 17 });
  assert.deepEqual(sanitizeIntent({ kind: 'npc_close', npcId: 3 }), { kind: 'npc_close', npcId: 3 });
  const deal = sanitizeIntent({
    kind: 'trade_deal', npcId: 5,
    give: [{ defId: 'bread', count: 2 }, { defId: 'bad', count: -1 }, 'junk'],
    take: [{ defId: 'pipe', count: 1 }],
    netCash: 1e12,
  });
  assert.ok(deal && deal.kind === 'trade_deal');
  assert.deepEqual(deal.give, [{ defId: 'bread', count: 2 }]);
  assert.deepEqual(deal.take, [{ defId: 'pipe', count: 1 }]);
  assert.equal(deal.netCash, 1_000_000);
  const dealNoCash = sanitizeIntent({ kind: 'trade_deal', npcId: 5, give: [], take: [] });
  assert.ok(dealNoCash && dealNoCash.kind === 'trade_deal');
  assert.equal(dealNoCash.netCash, 0);
});

test('sanitizeIntent clamps hostile numeric ranges', () => {
  const drop = sanitizeIntent({ kind: 'drop', slot: -5, defId: 'x'.repeat(200), count: 1e9 });
  assert.ok(drop && drop.kind === 'drop');
  assert.equal(drop.slot, 0);
  assert.equal(drop.count, 9999);
  assert.equal(drop.defId.length, 40);
  const cont = sanitizeIntent({ kind: 'container', op: 'take', cx: 99999, cy: -3, slot: 7 });
  assert.ok(cont && cont.kind === 'container');
  assert.equal(cont.cx, 1023);
  assert.equal(cont.cy, 0);
});

/* ── Actor echo reconciliation ───────────────────────────── */

test('actor echo applies host-exclusive fields always, predicted fields only when acked', () => {
  const hostActor = makeActor({ hp: 55, money: 500, currentMag: 3 });
  const echo = packActorEcho(hostActor, 7);
  assert.equal(echo.lastSeq, 7);

  const local = makeActor({ hp: 90, money: 100, currentMag: 8, inventory: [{ defId: 'pipe', count: 1 }] });
  // Not fully acked: hp/money land, inventory/mag stay predicted
  applyActorEcho(local, echo, false);
  assert.equal(local.hp, 55);
  assert.equal(local.money, 500);
  assert.equal(local.currentMag, 8);
  assert.equal(local.inventory!.length, 1);
  // Fully acked: everything converges to host truth
  applyActorEcho(local, echo, true);
  assert.equal(local.currentMag, 3);
  assert.equal(local.inventory!.length, 2);
  assert.equal(local.rpg!.level, 3);
});

test('actor echo death is applied even without ack', () => {
  const dead = makeActor({ alive: false });
  const local = makeActor();
  applyActorEcho(local, packActorEcho(dead, 0), false);
  assert.equal(local.alive, false);
});

/* ── Visit export (evacuation ritual) ────────────────────── */

test('visit export round-trips inventory, money and rpg through sanitization', () => {
  const actor = makeActor();
  const wire = JSON.parse(JSON.stringify(buildVisitExport(actor)));
  const clean = sanitizeVisitExport(wire);
  assert.ok(clean);
  const home = makeActor({ inventory: [], money: 0, weapon: '', rpg: { level: 1, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 0, psi: 0, maxPsi: 10 } });
  applyVisitExport(home, clean!);
  assert.equal(home.money, 250);
  assert.equal(home.weapon, 'pipe');
  assert.deepEqual(home.inventory, [{ defId: 'pipe', count: 1 }, { defId: 'bread', count: 3 }]);
  assert.equal(home.rpg!.level, 3);
});

test('sanitizeVisitExport rejects garbage and clamps hostile values', () => {
  assert.equal(sanitizeVisitExport(null), null);
  assert.equal(sanitizeVisitExport('x'), null);
  const clean = sanitizeVisitExport({
    inventory: [{ defId: 'bread', count: -5 }, { count: 3 }, { defId: 'ok', count: 2 }],
    money: -100,
    weapon: 42,
    rpg: { level: 1e9, xp: -1, str: 1000 },
  });
  assert.ok(clean);
  assert.deepEqual(clean!.inventory, [{ defId: 'ok', count: 2 }]);
  assert.equal(clean!.money, 0);
  assert.equal(clean!.weapon, '');
  assert.equal(clean!.rpg!.level, 999);
  assert.equal(clean!.rpg!.xp, 0);
  assert.equal(clean!.rpg!.str, 99);
});

/* ── Cell patches ────────────────────────────────────────── */

test('net cell patches drain marked cells and stamp them into another world', () => {
  const host = new World();
  host.cells.fill(Cell.WALL);
  const idx = host.idx(5, 5);
  host.cells[idx] = Cell.FLOOR;
  host.wallTex[idx] = 3;
  host.floorTex[idx] = 4;
  markNetCellTouched(idx);
  assert.equal(pendingNetCellCount(), 1);
  const patch = drainNetCellPatch(host);
  assert.equal(pendingNetCellCount(), 0);
  assert.equal(patch.length, 1);

  const peer = new World();
  peer.cells.fill(Cell.WALL);
  const changed = applyNetCellPatch(peer, JSON.parse(JSON.stringify(patch)));
  assert.equal(changed, true);
  assert.equal(peer.cells[idx], Cell.FLOOR);
  assert.equal(peer.wallTex[idx], 3);
  assert.equal(peer.floorTex[idx], 4);
  // malformed patches are ignored without throwing
  assert.equal(applyNetCellPatch(peer, [{ i: -1, c: 0, wt: 0, ft: 0 }, null, 'x']), false);
});

/* ── FX queue ────────────────────────────────────────────── */

test('fx queue is bounded and drains once', () => {
  for (let i = 0; i < 100; i++) pushNetFx({ k: 'shot', x: i, y: 0, w: 'pipe' });
  const fx = drainNetFx();
  assert.ok(fx.length <= 24);
  assert.equal(drainNetFx().length, 0);
});

/* ── Interpolation ───────────────────────────────────────── */

test('interpolation glides an entity between its last two network samples', () => {
  const world = new World();
  const self = makeActor({ id: 99 });
  const e = makeActor({ id: 7, x: 0, y: 0 });
  noteNetSample(7, 10, 10, 0, 1000);
  noteNetSample(7, 12, 10, 0, 1125);
  // render time = now - 150ms delay = 1062.5: halfway through the 125ms span
  updateNetInterpolation(world, [e, self], self, 1212.5);
  assert.ok(Math.abs(e.x - 11) < 0.01, `x=${e.x}`);
  assert.equal(e.y, 10);
  // long stall → snap to newest sample
  updateNetInterpolation(world, [e, self], self, 3000);
  assert.equal(e.x, 12);
  // the local player is never touched
  const px = self.x;
  noteNetSample(99, 500, 500, 0, 1000);
  updateNetInterpolation(world, [e, self], self, 1212.5);
  assert.equal(self.x, px);
});

/* ── Host slot bookkeeping ───────────────────────────────── */

test('host slot bookkeeping: seq high-water mark, container watch, cleanup', () => {
  hostNoteProcessedSeq(2, 5);
  hostNoteProcessedSeq(2, 3); // stale, ignored
  assert.equal(hostLastProcessedSeq(2), 5);

  hostSetOpenContainer(2, { cx: 4, cy: 4 });
  assert.deepEqual(hostOpenContainer(2), { cx: 4, cy: 4 });
  // first serialization always counts as changed, repeat does not
  assert.equal(hostContainerPayloadChanged(2, '{"a":1}'), true);
  assert.equal(hostContainerPayloadChanged(2, '{"a":1}'), false);
  assert.equal(hostContainerPayloadChanged(2, '{"a":2}'), true);
  // reopening resets the dirty baseline so the fresh view is pushed
  hostSetOpenContainer(2, { cx: 4, cy: 4 });
  assert.equal(hostContainerPayloadChanged(2, '{"a":2}'), true);

  hostClearSlot(2);
  assert.equal(hostLastProcessedSeq(2), 0);
  assert.equal(hostOpenContainer(2), null);
});

test('npc menu watch mirrors the container watch semantics', () => {
  hostSetOpenNpc(1, 42);
  assert.equal(hostOpenNpc(1), 42);
  assert.equal(hostNpcPayloadChanged(1, '{"m":10}'), true);
  assert.equal(hostNpcPayloadChanged(1, '{"m":10}'), false);
  assert.equal(hostNpcPayloadChanged(1, '{"m":7}'), true);
  hostSetOpenNpc(1, 42); // reopen resets the dirty baseline
  assert.equal(hostNpcPayloadChanged(1, '{"m":7}'), true);
  hostSetOpenNpc(1, null);
  assert.equal(hostOpenNpc(1), null);
});

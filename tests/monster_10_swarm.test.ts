import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { MonsterKind } from '../src/core/types';
import { DEF, generateSprite } from '../src/entities/swarm_mass';
import { MONSTERS } from '../src/entities/monster';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { S } from '../src/core/pixutil';

test('swarm is standalone crowd data with noisy mass sprite', () => {
  const ecology = getMonsterEcology(MonsterKind.SWARM);
  const sprite = generateSprite();
  let opaque = 0;
  let yellow = 0;
  let red = 0;
  for (const px of sprite) {
    if ((px >>> 24) === 0) continue;
    opaque++;
    const r = px & 0xff;
    const g = (px >>> 8) & 0xff;
    const b = (px >>> 16) & 0xff;
    if (r > 170 && g > 150 && b < 90) yellow++;
    if (r > 110 && g < 70 && b < 60) red++;
  }

  assert.equal(DEF.kind, MonsterKind.SWARM);
  assert.equal(DEF.name, 'Рой');
  assert.deepEqual(DEF.aiFlags, ['sourceSwarm', 'foodBait']);
  assert.equal(MONSTERS[MonsterKind.SWARM], DEF);
  assert.match(ecology?.rule ?? '', /тел|числ|стая/);
  assert.equal(sprite.length, S * S);
  assert.equal(opaque > 520, true, 'swarm sprite should read as a dense living mass');
  assert.equal(yellow >= 8, true, 'yellow eye pixels should distinguish the mass');
  assert.equal(red >= 4, true, 'red larva dots should be present');
});

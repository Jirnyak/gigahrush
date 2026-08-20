import { MONSTERS } from '../src/entities/monster';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { MonsterKind, RoomType } from '../src/core/types';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { RUMORS } from '../src/data/rumors';
import { DEF, generateSprite } from '../src/entities/lozhnyy_dukh';
import { S } from '../src/core/pixutil';

test('Lozhnyy Dukh is a table entry with generic phasing flags only', () => {
  const ecology = getMonsterEcology(MonsterKind.LOZHNYY_DUKH);

  assert.equal(DEF.kind, MonsterKind.LOZHNYY_DUKH);
  assert.equal(MONSTERS[MonsterKind.LOZHNYY_DUKH], DEF);
  // Никакого собственного флага: вид выражен общими средствами таблицы монстров.
  assert.deepEqual(DEF.aiFlags, ['noclip']);
  assert.equal(DEF.hp < MONSTERS[MonsterKind.SPIRIT].hp, true, 'false spirit should be lower HP than the full wall-phasing spirit');
  assert.ok(ecology);
  assert.equal(ecology?.rooms.includes(RoomType.OFFICE), true);
  assert.equal(ecology?.rumorIds.includes('ecology_lozhnyy_dukh_door'), true);
  assert.equal(RUMORS.some(rumor => rumor.id === 'ecology_lozhnyy_dukh_door'), true);
});

test('Lozhnyy Dukh sprite reads as a translucent side ghost with inner face', () => {
  const sprite = generateSprite();
  let opaque = 0;
  let translucentCold = 0;
  let blackVoids = 0;
  for (const px of sprite) {
    const alpha = px >>> 24;
    if (alpha === 0) continue;
    opaque++;
    const r = px & 255;
    const g = (px >>> 8) & 255;
    const b = (px >>> 16) & 255;
    if (alpha >= 32 && alpha <= 185 && b >= r && g >= r) translucentCold++;
    if (alpha >= 180 && r <= 24 && g <= 28 && b <= 36) blackVoids++;
  }

  assert.equal(sprite.length, S * S);
  assert.equal(opaque > 450, true);
  assert.equal(translucentCold > 260, true, 'body should read as cold transparent mass');
  assert.equal(blackVoids >= 12, true, 'mouth and inner false face should be visible');
});

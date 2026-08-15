import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getCeilingHeightForTier } from '../src/world/ceiling_heights';

describe('Ceiling Height Tiering', () => {
  it('derives height as 1.0 + tier * 0.5 without a cap', () => {
    assert.equal(getCeilingHeightForTier(0), 1.0);
    assert.equal(getCeilingHeightForTier(1), 1.5);
    assert.equal(getCeilingHeightForTier(2), 2.0);
    // Потолка нет: тир хранится в Uint8Array, высота растёт линейно до конца диапазона.
    assert.equal(getCeilingHeightForTier(3), 2.5);
    assert.equal(getCeilingHeightForTier(255), 128.5);
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

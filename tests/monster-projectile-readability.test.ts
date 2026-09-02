/* ── Замок: снаряд монстра читается глазом и ухом ──────────────────
 *
 * Стрелки НЕ объявляют `projSprite` руками — в дефе вида стоит ноль, а
 * настоящий спрайт раздаёт `MONSTER_VISUALS` (`data/monster_visuals.ts`)
 * внутри `generateSprites()`. Из-за этого статическое чтение дефов даёт
 * ложную картину «все стреляют глазным болтом», и на неё уже попадались.
 *
 * Тест ловит КЛАСС дефекта, а не значения:
 *   1) после раздачи у каждого стрелка ненулевой спрайт;
 *   2) спрайты не схлопнулись в один — иначе бой нечитаем глазом;
 *   3) каждая ветка `monsterProjectileSound` достижима хотя бы одним видом,
 *      то есть ни один импортированный боевой звук не становится мёртвым;
 *   4) каждая ветка `monsterProjectileScale` достижима — размер снаряда
 *      тоже различает стрелков.
 *
 * Конкретную пару «вид → спрайт» тест намеренно НЕ фиксирует: перекрасить
 * снаряд одному монстру можно, обесцветить весь бой — нельзя.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MonsterKind } from '../src/core/types';
import { MONSTERS } from '../src/entities/monster';
import { Spr } from '../src/entities/sprite_index';
import { generateSprites } from '../src/render/sprites';
import { monsterProjectileScale, monsterProjectileSound } from '../src/systems/ai/monster';

/* Раздача спрайтов — побочный эффект генерации; без неё дефы пусты. */
generateSprites();

const SPRITE_NAME = new Map<number, string>(
  Object.entries(Spr).map(([name, index]) => [index as number, name]),
);

function rangedShooters(): { kind: MonsterKind; name: string; sprite: number }[] {
  return Object.values(MonsterKind)
    .filter((k): k is MonsterKind => typeof k === 'number')
    .map((kind) => ({ kind, def: MONSTERS[kind] }))
    .filter(({ def }) => def !== undefined && def.isRanged === true)
    /* Тот же выбор спрайта, что и в `fireMonsterProjectile`. */
    .map(({ kind, def }) => ({ kind, name: def.name, sprite: def.projSprite || Spr.EYE_BOLT }));
}

test('у каждого стрелка есть раздача спрайта снаряда', () => {
  const shooters = rangedShooters();
  assert.ok(shooters.length > 0, 'дальнобойных монстров не осталось — тест потерял предмет');

  const unassigned = shooters.filter(({ kind }) => !MONSTERS[kind].projSprite);
  assert.deepEqual(
    unassigned.map((s) => s.name),
    [],
    'эти виды не получили projSprite и молча упали на EYE_BOLT — проверь `projectile` в MONSTER_VISUALS',
  );
});

test('снаряды монстров различимы глазом: спрайты не схлопнуты в один', () => {
  const distinct = new Set(rangedShooters().map((s) => s.sprite));
  assert.ok(
    distinct.size >= 4,
    `все стрелки стреляют почти одинаковым снарядом (${distinct.size} различных спрайтов): ` +
      `${[...distinct].map((s) => SPRITE_NAME.get(s) ?? s).join(', ')}`,
  );
});

test('каждая ветка звука снаряда достижима живым монстром', () => {
  const shooters = rangedShooters();
  const heard = new Map<() => void, string[]>();
  for (const { kind, name, sprite } of shooters) {
    const sound = monsterProjectileSound(kind, sprite);
    const list = heard.get(sound);
    if (list) list.push(name);
    else heard.set(sound, [name]);
  }

  /* Столько РАЗНЫХ звуков ветвление обязано выдать по живым видам. Ветка,
   * до которой не доходит ни один монстр, — мёртвый импорт в бою. */
  assert.ok(
    heard.size >= 4,
    `снаряды монстров звучат всего ${heard.size} разными звуками: ` +
      [...heard.values()].map((v) => v.join('/')).join(' | '),
  );

  for (const [sound, names] of heard) {
    assert.equal(typeof sound, 'function', `вид(ы) ${names.join(', ')} получили не звук`);
  }
});

test('каждая ветка размера снаряда достижима живым монстром', () => {
  const scales = new Set(rangedShooters().map(({ kind, sprite }) => monsterProjectileScale(kind, sprite)));
  assert.ok(
    scales.size >= 4,
    `снаряды монстров имеют всего ${scales.size} различных размеров: ${[...scales].sort().join(', ')}`,
  );
});

test('звук снаряда следует за спрайтом, а не за видом', () => {
  /* Если ветвление начнёт решать по `kind`, подмена спрайта перестанет
   * менять звук — и раздача семейств в MONSTER_VISUALS станет полуфиктивной. */
  const kind = MonsterKind.EYE;
  const eye = monsterProjectileSound(undefined, Spr.EYE_BOLT);
  const flame = monsterProjectileSound(undefined, Spr.HOSTILE_FLAME_BOLT);
  const psi = monsterProjectileSound(undefined, Spr.HOSTILE_PSI_BOLT);
  assert.notEqual(eye, flame, 'огненный и глазной снаряды звучат одинаково');
  assert.notEqual(eye, psi, 'пси и глазной снаряды звучат одинаково');
  assert.notEqual(
    monsterProjectileScale(undefined, Spr.HOSTILE_FLAME_BOLT),
    monsterProjectileScale(undefined, Spr.PARAGRAPH_BOLT),
    'огненный и бумажный снаряды одного размера',
  );
  assert.equal(monsterProjectileSound(kind, Spr.EYE_BOLT), eye);
});

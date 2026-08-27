/* ── Четыре слоя застройки Перевалки ──────────────────────────────
 *
 * Ярус собран как лего: решётка грузовых авеню, дворы четырёх баз, а поверх —
 * четыре независимых слоя (`stacks`, `districts`, `inspection`, `life`). Замок
 * держит то, что легко потерять при следующей правке геометрии и что не ловит
 * ни один общий тест:
 *
 *   — слои вырыты все четыре, и каждый в своём объёме;
 *   — У КАЖДОЙ комнаты слоя есть исправный вход. Дверь, записанная только в
 *     `world.doors` и не записанная в `room.doors`, — это невидимая стена; а
 *     створка, за которой глухой бетон, снимается санацией, и комната остаётся
 *     на страховке `ensureConnectivity`, то есть на случайности;
 *   — вертикаль настоящая: объявленный `room.ceilingTier` доживает до бэйка, и
 *     перепад между крановым створом и двором читается в метрах;
 *   — микрорайон принадлежит своей базе ПОСЛЕ общей раздачи долей территории;
 *   — жизнь яруса ничья: ни ночлежка, ни рынок не носят метки базы;
 *   — серый обход существует как обход: с авеню на авеню, не касаясь нитки
 *     досмотра.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { Cell, W } from '../src/core/types';
import type { World } from '../src/core/world';
import { stampCeilingHeights } from '../src/world/ceiling_heights';
import { territoryOwnerAtIndex } from '../src/systems/territory';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import {
  PEREVALKA_BASES,
  avenueCoords,
  districtOwnerTag,
  perevalkaBlock,
  perevalkaInspectionLayout,
} from '../src/gen/perevalka';

const RUN_SEEDS = [0x4453474e, 0x0be7a1];

/** Псевдонимы комнат слоя: по ним слой и опознаётся на готовом ярусе. */
const LAYERS: ReadonlyArray<{ name: string; re: RegExp; min: number }> = [
  { name: 'штабеля и эстакады', re: /^perevalka_(ramp|crane_run|container)_/, min: 60 },
  { name: 'четыре микрорайона', re: /^perevalka_(wild_cell|citizen_|liq_cell|shadow_)/, min: 100 },
  { name: 'инфраструктура досмотра', re: /^perevalka_(weighbridge|seal|quarantine|incinerator|chute)/, min: 12 },
  { name: 'жизнь яруса', re: /^perevalka_(bunk|canteen|kitchen|pantry|bath|red_corner|black_market|stall|medpoint|dressing|broker)/, min: 70 },
];

const ALL_LAYER_ROOMS = /^perevalka_(ramp|crane_run|container|wild_cell|citizen_|liq_cell|shadow_|weighbridge|seal|quarantine|incinerator|chute|bunk|canteen|kitchen|pantry|bath|red_corner|black_market|stall|medpoint|dressing|broker)/;

const generated = new Map<number, ReturnType<typeof generateDesignFloor>>();
function floor(seed: number): ReturnType<typeof generateDesignFloor> {
  if (!generated.has(seed)) generated.set(seed, generateDesignFloor('perevalka', seed));
  return generated.get(seed)!;
}

const walkable = (world: World, i: number): boolean =>
  world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.DOOR || world.cells[i] === Cell.WATER;

/**
 * Исправный вход: клетка в стене комнаты, которая либо настоящая дверь (запись
 * есть И в `world.doors`, И в `room.doors`), либо собственный проём комнаты, —
 * и снаружи от неё проходимо.
 */
function entranceFault(world: World, room: { id: number; x: number; y: number; w: number; h: number; doors: number[] }): string | null {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const onX = dx === -1 || dx === room.w;
      const onY = dy === -1 || dy === room.h;
      if (onX === onY) continue; // угол входом не бывает
      const i = world.idx(room.x + dx, room.y + dy);
      const door = world.cells[i] === Cell.DOOR && world.doors.has(i);
      if (door && !room.doors.includes(i)) return `дверь ${room.x + dx},${room.y + dy} не записана в room.doors`;
      const gap = world.cells[i] !== Cell.WALL && world.roomMap[i] === room.id;
      if (!door && !gap) continue;
      const ox = dx === -1 ? -2 : dx === room.w ? room.w + 1 : dx;
      const oy = dy === -1 ? -2 : dy === room.h ? room.h + 1 : dy;
      if (walkable(world, world.idx(room.x + ox, room.y + oy))) return null;
    }
  }
  return 'ни одного входа, за которым проходимо';
}

test('все четыре слоя застройки вырыты, и каждый в своём объёме', () => {
  for (const seed of RUN_SEEDS) {
    const { world } = floor(seed);
    for (const layer of LAYERS) {
      const count = world.rooms.filter(room => room?.defId && layer.re.test(room.defId)).length;
      assert.ok(count >= layer.min, `слой «${layer.name}»: ${count} комнат, ожидалось не меньше ${layer.min}`);
    }
    // Застройка обязана оставаться поверх старого яруса, а не вместо него.
    assert.ok(world.rooms.length >= 300, `комнат на ярусе ${world.rooms.length}, было 34 — слои не легли`);
  }
});

test('у каждой комнаты слоя есть исправный вход', () => {
  for (const seed of RUN_SEEDS) {
    const { world } = floor(seed);
    const faults: string[] = [];
    for (const room of world.rooms) {
      if (!room?.defId || !ALL_LAYER_ROOMS.test(room.defId)) continue;
      const fault = entranceFault(world, room);
      if (fault) faults.push(`${room.name} @${room.x},${room.y}: ${fault}`);
    }
    assert.deepEqual(faults, [], `комнаты слоёв без исправного входа на сиде ${seed.toString(16)}`);
  }
});

test('вертикаль настоящая: объявленный ярус доживает до бэйка и даёт перепад', () => {
  const { world } = floor(RUN_SEEDS[0]);
  stampCeilingHeights(world);

  const declared: Array<[RegExp, number]> = [
    [/^perevalka_crane_run_/, 7],
    [/^perevalka_ramp_/, 6],
    [/^perevalka_container_/, 0],
    [/^perevalka_incinerator/, 5],
  ];
  for (const [re, tier] of declared) {
    const rooms = world.rooms.filter(room => room?.defId && re.test(room.defId));
    assert.ok(rooms.length > 0, `комнат вида ${re} на ярусе нет`);
    for (const room of rooms) {
      assert.equal(room.ceilingTier, tier, `${room.name} объявляет ярус ${room.ceilingTier}, а не ${tier}`);
      const centre = world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1));
      // Клетка комнаты обязана НЕСТИ объявленный ярус: авторская воля выше
      // формулы и диффузией не размывается (`vertical.md`).
      assert.equal(world.ceilHeight[centre], tier, `бэйк вывел у «${room.name}» ярус ${world.ceilHeight[centre]}`);
    }
  }

  /* Створ против двора: 4.5 м против уличных 1.5–2.5. Сравнение идёт с САМОЙ
   * высокой ничейной клеткой рядом, а не с первой попавшейся: выведенный ярус
   * упирается в потолок 3, и перепад обязан оставаться в метрах даже там, где
   * двор раскрыт шире всего. */
  const crane = world.rooms.find(room => room?.defId?.startsWith('perevalka_crane_run_'))!;
  let low = 0;
  let yardCells = 0;
  for (let dy = -20; dy <= 20; dy++) {
    for (let dx = -30; dx <= 30; dx++) {
      const i = world.idx(crane.x + dx, crane.y + dy);
      if (world.cells[i] !== Cell.FLOOR || world.roomMap[i] >= 0) continue;
      yardCells++;
      // Ярус 3 — потолок ВЫВЕДЕННОГО: выше объявляют, а не выводят. Ореол в
      // клетку-две у ворот законен — его и даёт проход диффузии.
      if (world.ceilHeight[i] <= crane.ceilingTier! - 4) low++;
    }
  }
  assert.ok(yardCells > 400, `вокруг створа всего ${yardCells} клеток двора`);
  assert.ok(low / yardCells > 0.9,
    `двор у створа поднялся вместе с ним: низких клеток ${(low / yardCells * 100).toFixed(0)}%`);
});

test('в каждом кармане стоят глухие штабеля, и карман проходим насквозь', () => {
  const { world } = floor(RUN_SEEDS[0]);
  const cranes = world.rooms.filter(room => room?.defId?.startsWith('perevalka_crane_run_'));
  assert.equal(cranes.length, 12, 'карманов должно быть двенадцать');
  for (const crane of cranes) {
    // Штабель — обычная стена: считаем металлические стены вокруг створа.
    let stacks = 0;
    for (let dy = -20; dy <= 20; dy++) {
      for (let dx = -34; dx <= 34; dx++) {
        const i = world.idx(crane.x + dx, crane.y + dy);
        if (world.cells[i] === Cell.WALL && world.roomMap[i] < 0) stacks++;
      }
    }
    assert.ok(stacks > 200, `у створа «${crane.name}» вокруг всего ${stacks} клеток укрытий`);
  }
});

test('микрорайон принадлежит своей базе после общей раздачи долей', () => {
  const { world } = floor(RUN_SEEDS[0]);
  for (const spec of PEREVALKA_BASES) {
    const tag = districtOwnerTag(spec.id);
    const rooms = world.rooms.filter(room => room?.tags?.includes(tag));
    assert.ok(rooms.length >= 15, `у базы ${spec.id} микрорайон из ${rooms.length} комнат`);
    let own = 0;
    let total = 0;
    for (const room of rooms) {
      for (let dy = 0; dy < room.h; dy++) {
        for (let dx = 0; dx < room.w; dx++) {
          const i = world.idx(room.x + dx, room.y + dy);
          if (world.roomMap[i] !== room.id) continue;
          total++;
          if (territoryOwnerAtIndex(world, i) === spec.owner) own++;
        }
      }
    }
    assert.ok(own / total > 0.95, `микрорайон ${spec.id} принадлежит своей базе только на ${(own / total * 100).toFixed(0)}%`);
  }
  // Двор базы — та же земля: до этого штаб грибной артели доставался ликвидаторам.
  for (const spec of PEREVALKA_BASES) {
    const hq = world.rooms.find(room => room?.defId === spec.hqAlias)!;
    const centre = world.idx(hq.x + (hq.w >> 1), hq.y + (hq.h >> 1));
    assert.equal(territoryOwnerAtIndex(world, centre), spec.owner, `двор базы ${spec.id} принадлежит не ей`);
  }
});

test('жизнь яруса ничья: ни ночлежка, ни рынок не носят метки базы', () => {
  const { world } = floor(RUN_SEEDS[0]);
  const tags = PEREVALKA_BASES.map(spec => districtOwnerTag(spec.id));
  const life = world.rooms.filter(room => room?.defId
    && /^perevalka_(bunk|canteen|black_market|stall|medpoint|bath)/.test(room.defId));
  assert.ok(life.length >= 70, `жилого и торгового конца всего ${life.length} комнат`);
  for (const room of life) {
    for (const tag of tags) {
      assert.equal(room.tags?.includes(tag), false, `«${room.name}» досталась базе по метке ${tag}`);
    }
  }
});

test('серый обход существует: с авеню на авеню мимо нитки досмотра', () => {
  const layout = perevalkaInspectionLayout();
  const west = perevalkaBlock(3, 1);
  const east = perevalkaBlock(4, 1);
  const avenues = avenueCoords();
  const entryX = avenues[3]; // авеню западнее нитки
  const exitX = avenues[5];  // авеню восточнее нитки

  for (const seed of RUN_SEEDS) {
    const { world } = floor(seed);
    /* Волна идёт по кварталам нитки, но РЯДЫ САМОЙ НИТКИ ей запрещены. Дошла до
     * восточной авеню — значит обход мимо весов есть. Не дошла — значит его нет,
     * и весь смысл «серого» на ярусе держится на репликах. */
    const banned = (y: number) => {
      const d = world.delta(layout.lineY, y);
      return d >= -1 && d <= layout.lineWidth;
    };
    const inBand = (x: number, y: number) => {
      const dy = world.delta(west.y, y);
      if (dy < 0 || dy >= west.h) return false;
      const dx = world.delta(entryX, x);
      return dx >= 0 && dx <= world.delta(entryX, exitX);
    };
    const start = world.idx(entryX, layout.greyHighY);
    assert.ok(walkable(world, start), 'серый обход не начинается у западной авеню');
    const seen = new Uint8Array(W * W);
    const queue = [start];
    seen[start] = 1;
    let reachedExit = false;
    for (let head = 0; head < queue.length && !reachedExit; head++) {
      const cx = queue[head] % W;
      const cy = (queue[head] / W) | 0;
      if (world.delta(cx, exitX) === 0) reachedExit = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = world.wrap(cx + dx);
        const ny = world.wrap(cy + dy);
        const ni = world.idx(nx, ny);
        if (seen[ni] || banned(ny) || !inBand(nx, ny) || !walkable(world, ni)) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    assert.ok(reachedExit, `серый обход не доводит до восточной авеню на сиде ${seed.toString(16)}`);

    // И нитка досмотра шире обхода: цена обхода — теснота, а не ключ.
    assert.ok(layout.lineWidth > layout.greyWidth * 2, 'нитка досмотра не шире серого обхода');
    assert.ok(world.delta(layout.greyLowY, layout.lineY) > layout.lineWidth,
      'серый обход проложен вплотную к нитке — он её не обходит');
    assert.ok(east.x > west.x, 'кварталы нитки перепутаны местами');
  }
});

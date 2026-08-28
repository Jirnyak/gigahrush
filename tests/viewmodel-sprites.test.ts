/**
 * Замок картинки вьюмодели: спрайты, геометрия холста, детерминизм, откат,
 * границы кэша.
 *
 * Всё, что здесь проверяется, глазами ловится ТОЛЬКО в браузере и только на той
 * вещи, которую случайно взяли в руки. Пакет, не написавший ни пикселя, честно
 * откатывается и рука просто исчезает — молча. Силуэт, вылезший выше центра
 * кадра или не доехавший до нижнего среза, читается как оружие, висящее в
 * воздухе без предплечья. Поэтому и спрайт, и его габариты меряются здесь для
 * КАЖДОЙ вещи и КАЖДОГО объявленного кадра.
 *
 * Пороги взяты из `viewmodel.md`, раздел «Геометрия холста», и не выдуманы:
 * холст `weapon` стоит в кадре 320×200 на `x 96..224`, `y 72..200`, холст `tool`
 * — на `x 0..128`, `y = 127` холста есть самый низ экрана, нижние ~18 строк
 * перекрывает полоса HUD, а полезный силуэт инструмента держится в левых ~70
 * пикселях, иначе его закроет оружие по центру.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, WEAPON_STATS } from '../src/data/catalog';
import { itemEquipSlot } from '../src/data/items';
import { rng, seedGlobalRng } from '../src/core/rand';
import { S } from '../src/core/pixutil';
import {
  VIEWMODEL_ART_MANIFEST,
  VIEWMODEL_ART_SIDE,
  viewmodelArtFrameId,
  viewmodelArtManifestRow,
} from '../src/data/viewmodel_art_manifest';
import {
  GENERATED_VIEWMODEL_FRAME_IDS,
  GENERATED_VIEWMODEL_SIDE,
  getGeneratedViewmodelFrame,
} from '../src/render/viewmodel/generated_frames';
import {
  VM,
  resetViewmodel,
  resetViewmodelSpriteCache,
  viewmodelDef,
  viewmodelDefIdFor,
  viewmodelSprite,
  viewmodelSpriteCacheSize,
} from '../src/render/viewmodel';
import type { ViewmodelSlot } from '../src/render/viewmodel';

type FrameKey = 'idle' | 'fire' | 'swing' | 'swing2' | 'reload';

interface Held {
  /** `undefined` — пустая рука; иначе идентификатор предмета. */
  itemId: string | undefined;
  slot: ViewmodelSlot;
}

/** Всё, что игра умеет положить в руки: оружие, ПСИ, инструменты и кулаки. */
function heldThings(): Held[] {
  const out: Held[] = [{ itemId: undefined, slot: 'weapon' }];
  for (const id of Object.keys(WEAPON_STATS)) {
    if (!id) continue;
    const def = ITEMS[id];
    out.push({ itemId: id, slot: def && itemEquipSlot(def) === 'tool' ? 'tool' : 'weapon' });
  }
  for (const def of Object.values(ITEMS)) {
    if (itemEquipSlot(def) !== 'tool') continue;
    if (WEAPON_STATS[def.id]?.psiCost) continue; // уже добавлено выше
    out.push({ itemId: def.id, slot: 'tool' });
  }
  return out;
}

/** Кадры, которые пакет объявил, что умеет. Незнакомый реестр откатит к `idle`. */
function declaredFrames(thing: Held): readonly FrameKey[] {
  const defId = viewmodelDefIdFor(thing.slot, thing.itemId);
  assert.ok(defId, `${thing.slot}/${thing.itemId ?? '(пусто)'}: нет пакета`);
  const def = viewmodelDef(defId);
  assert.ok(def, `${defId}: пакет пропал из реестра`);
  return def.frames as readonly FrameKey[];
}

interface Box {
  x0: number; y0: number; x1: number; y1: number; opaque: number;
}

function measure(sprite: Uint32Array): Box {
  let x0 = VM, y0 = VM, x1 = -1, y1 = -1, opaque = 0;
  for (let y = 0; y < VM; y++) {
    for (let x = 0; x < VM; x++) {
      if ((sprite[y * VM + x] >>> 24) === 0) continue;
      opaque++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, opaque };
}

function label(thing: Held, frame: FrameKey): string {
  return `${thing.slot}/${thing.itemId ?? '(пустая рука)'}/${frame}`;
}

/* ── Пороги из `viewmodel.md`, «Геометрия холста» ─────────────────────────── */

/** Выше этой строки силуэт не поднимается: иначе оружие лезет выше центра кадра. */
const TOP_LIMIT = 18;
/** Досюда силуэт обязан доехать: предплечье уходит за нижний край, а не висит. */
const BOTTOM_REACH = 120;
/** Полезный силуэт инструмента держится в левых ~70 пикселях холста. */
const TOOL_RIGHT_LIMIT = 74;
/** Нижние ~18 строк перекрывает полоса HUD: срез там не виден. */
const HUD_BAND = 18;
/** Пакет, написавший меньше этого, считай не написал ничего. */
const MIN_OPAQUE = 256;

test('у каждой вещи в руках есть непустой кадр idle', () => {
  const things = heldThings();
  // Порог, а не точное число: контенту расти можно, но не до нуля.
  assert.ok(things.length >= 100, `вещей в руках стало мало: ${things.length}`);

  const blank: string[] = [];
  for (const thing of things) {
    const sprite = viewmodelSprite(thing.slot, thing.itemId, 'idle');
    if (!sprite) { blank.push(`${label(thing, 'idle')}: пусто`); continue; }
    assert.equal(sprite.length, VM * VM, `${label(thing, 'idle')}: не тот размер холста`);
    const box = measure(sprite);
    if (box.opaque < MIN_OPAQUE) blank.push(`${label(thing, 'idle')}: ${box.opaque} пикселей`);
  }
  // Пакет, ничего не нарисовавший, откатывается сам и рука ИСЧЕЗАЕТ молча —
  // ровно от этого замок и стоит.
  assert.deepEqual(blank, [], `вещи с пустой рукой: ${blank.join('; ')}`);
});

test('силуэт укладывается в холст: верх, нижний срез и полоса инструмента', () => {
  const highIn: string[] = [];
  const shortOf: string[] = [];
  const wideTool: string[] = [];

  for (const thing of heldThings()) {
    for (const frame of declaredFrames(thing)) {
      const sprite = viewmodelSprite(thing.slot, thing.itemId, frame);
      assert.ok(sprite, `${label(thing, frame)}: объявленный кадр не нарисован`);
      const box = measure(sprite);
      assert.ok(box.opaque >= MIN_OPAQUE, `${label(thing, frame)}: кадр почти пуст (${box.opaque})`);

      if (box.y0 < TOP_LIMIT) highIn.push(`${label(thing, frame)} y0=${box.y0}`);
      if (box.y1 < BOTTOM_REACH) shortOf.push(`${label(thing, frame)} y1=${box.y1}`);
      if (thing.slot === 'tool' && box.x1 > TOOL_RIGHT_LIMIT) {
        wideTool.push(`${label(thing, frame)} x1=${box.x1}`);
      }
    }
  }

  assert.deepEqual(highIn, [], `силуэт лезет выше центра кадра: ${highIn.join('; ')}`);
  assert.deepEqual(shortOf, [], `предплечье не доходит до нижнего среза: ${shortOf.join('; ')}`);
  assert.deepEqual(wideTool, [], `инструмент вылезает под оружие по центру: ${wideTool.join('; ')}`);
});

test('силуэт не режется о боковые края холста выше полосы HUD', () => {
  /* Холст оружия стоит в кадре на `x 96..224`, то есть ОБА его боковых края
   * лежат посреди экрана: силуэт, дошедший до края, читается прямым
   * вертикальным срезом в воздухе. У инструмента холст прижат влево (`x 0..128`),
   * поэтому его левый край — это край экрана, и срез там законен; правый край
   * инструмента и так закрыт полосой в `TOOL_RIGHT_LIMIT`.
   *
   * Правило нарушал ровно один пакет — `machinegun` уводил левое предплечье в
   * левый край холста, чтобы не закрывать короб с лентой, и получал прямой
   * вертикальный срез на трети ширины экрана. Ошибка была в системе координат,
   * а не в замысле: наружу из холста оружия можно только вниз. Починено —
   * предплечье уходит вниз-влево мимо короба. Здесь остаётся замок на ноль. */
  const cutting = new Set<string>();
  for (const thing of heldThings()) {
    const defId = viewmodelDefIdFor(thing.slot, thing.itemId)!;
    for (const frame of declaredFrames(thing)) {
      const sprite = viewmodelSprite(thing.slot, thing.itemId, frame);
      if (!sprite) continue;
      for (let y = 0; y < VM - HUD_BAND; y++) {
        const left = thing.slot === 'weapon' && (sprite[y * VM] >>> 24) !== 0;
        const right = (sprite[y * VM + VM - 1] >>> 24) !== 0;
        if (left || right) { cutting.add(defId); break; }
      }
    }
  }

  assert.deepEqual(
    [...cutting].sort(),
    [],
    `силуэт режется о боковой край холста посреди экрана: ${[...cutting].sort().join('; ')}`,
  );
});

test('дуло объявлено на срезе ствола, а не в пустоте', () => {
  // Вспышка ставится по `muzzle` пакета. Точка, промахнувшаяся мимо железа,
  // даёт огонь, висящий рядом с оружием, и в тесте это иначе никак не видно.
  let checked = 0;
  for (const thing of heldThings()) {
    const defId = viewmodelDefIdFor(thing.slot, thing.itemId)!;
    const def = viewmodelDef(defId)!;
    if (!def.muzzle) continue;
    const [mx, my] = def.muzzle;
    assert.ok(mx >= 0 && mx < VM && my >= 0 && my < VM, `${defId}: дуло вне холста`);
    const sprite = viewmodelSprite(thing.slot, thing.itemId, 'idle')!;
    let solid = false;
    for (let dy = -3; dy <= 3 && !solid; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = (mx | 0) + dx;
        const y = (my | 0) + dy;
        if (x < 0 || y < 0 || x >= VM || y >= VM) continue;
        if ((sprite[y * VM + x] >>> 24) !== 0) { solid = true; break; }
      }
    }
    assert.ok(solid, `${label(thing, 'idle')}: дуло ${defId} висит в пустоте`);
    checked++;
  }
  assert.ok(checked >= 20, `стволов с дулом стало мало: ${checked}`);
});

test('спрайт детерминирован по идентификатору и не зависит от глобального ГПСЧ', () => {
  /* Облик засеян ИДЕНТИФИКАТОРОМ вещи. Глобальный `rng()` здесь запрещён: он
   * зависит от хода партии, и один и тот же ствол менял бы вид на ровном месте —
   * между сейвом и загрузкой, между хостом и пиром, между двумя прогонами теста. */
  const sample: readonly (readonly [ViewmodelSlot, string, FrameKey])[] = [
    ['weapon', 'ak47', 'idle'],
    ['weapon', 'ak47', 'fire'],
    ['weapon', 'sledgehammer', 'swing'],
    ['weapon', 'chainsaw', 'idle'],
    ['tool', 'flashlight', 'idle'],
    ['tool', 'psi_strike', 'idle'],
  ];

  seedGlobalRng(1234);
  resetViewmodelSpriteCache();
  const first = sample.map(([slot, id, frame]) => {
    const sprite = viewmodelSprite(slot, id, frame);
    assert.ok(sprite, `${slot}/${id}/${frame}: нечего сравнивать`);
    return Uint32Array.from(sprite);
  });

  // Прокручиваем глобальный генератор и перезасеваем его другим числом: если
  // рисование хоть где-то зовёт `rng()`, картинка после этого поедет.
  for (let i = 0; i < 997; i++) rng();
  seedGlobalRng(98765);
  for (let i = 0; i < 41; i++) rng();

  resetViewmodelSpriteCache();
  sample.forEach(([slot, id, frame], i) => {
    const again = viewmodelSprite(slot, id, frame)!;
    assert.deepEqual(Array.from(again), Array.from(first[i]), `${slot}/${id}/${frame}: картинка поехала`);
  });

  // Разные вещи одного силуэта всё же различаются: детерминизм не должен
  // означать, что зерно вообще не доезжает до облика.
  resetViewmodelSpriteCache();
  const makarov = Array.from(viewmodelSprite('weapon', 'makarov', 'idle')!);
  const nagant = Array.from(viewmodelSprite('weapon', 'nagant', 'idle')!);
  assert.notDeepEqual(makarov, nagant, 'два пистолета вышли одинаковыми — зерно облика не работает');
});

test('незнакомый ключ запечённого арта пуст, и вещь всё равно рисуется процедурно', () => {
  assert.equal(getGeneratedViewmodelFrame('no_such_item:idle'), undefined);
  assert.equal(getGeneratedViewmodelFrame(undefined), undefined);
  assert.equal(getGeneratedViewmodelFrame(''), undefined);
  // Промах арта — это ПУСТОЙ результат, а не ветка «если есть арт»: отсутствие
  // ассета никогда не стирает вещь из рук.
  assert.equal(getGeneratedViewmodelFrame(viewmodelArtFrameId('makarov', 'idle')), undefined);
  const procedural = viewmodelSprite('weapon', 'makarov', 'idle');
  assert.ok(procedural && measure(procedural).opaque >= MIN_OPAQUE, 'без арта ПМ обязан рисоваться процедурой');

  // Сторона запечённого кадра совпадает с холстом: иначе арт молча отвергается
  // проверкой размера в `cache.ts` и художник не узнаёт об этом никогда.
  assert.equal(GENERATED_VIEWMODEL_SIDE, VM);
  assert.equal(VIEWMODEL_ART_SIDE, VM);
  assert.equal(VM, S * 2);
});

test('манифест арта рук валиден, и пустой список — законное состояние', () => {
  // Пустой список законен: значит арта нет и руки рисует процедура. Проверки
  // ниже поштучные, поэтому первая же настоящая строка попадёт под них сама.
  const seen = new Set<string>();
  for (const row of VIEWMODEL_ART_MANIFEST) {
    assert.equal(seen.has(row.id), false, `дубликат строки арта ${row.id}`);
    seen.add(row.id);
    assert.equal(row.id, viewmodelArtFrameId(row.itemId, row.frame), `${row.id}: ключ не собирается из вещи и кадра`);
    assert.ok(ITEMS[row.itemId], `${row.id}: нет такого предмета`);
    assert.equal(row.width, VIEWMODEL_ART_SIDE, `${row.id}: ширина исходника`);
    assert.equal(row.height, VIEWMODEL_ART_SIDE, `${row.id}: высота исходника`);
    assert.match(row.sha256, /^[0-9a-f]{64}$/, `${row.id}: не похоже на SHA-256`);
    assert.match(row.sourcePath, /^viewmodels\/.+\.png$/, `${row.id}: путь к исходнику`);
    assert.ok(viewmodelArtManifestRow(row.id), `${row.id}: строка не находится по своему же ключу`);
    // Строка манифеста без запечённых пикселей — это арт, который не доехал в
    // сборку: браузер исходные PNG не читает никогда.
    const baked = getGeneratedViewmodelFrame(row.id);
    assert.ok(baked, `${row.id}: строка есть, а запечённых пикселей нет`);
    assert.equal(baked.length, VM * VM, `${row.id}: не тот размер запечённого кадра`);
  }

  // Обратная сторона: запечённое без строки манифеста — арт без автора и согласия.
  for (const id of GENERATED_VIEWMODEL_FRAME_IDS) {
    assert.ok(viewmodelArtManifestRow(id), `${id}: запечённый кадр без строки манифеста`);
  }
  assert.equal(viewmodelArtManifestRow(undefined), undefined);
});

test('кэш спрайтов не растёт без предела, и сброс его чистит', () => {
  resetViewmodel();
  assert.equal(viewmodelSpriteCacheSize(), 0);

  // Гоняем заведомо больше ключей, чем помещается: пара «вещь + кадр» уникальна,
  // так что каждый запрос — новая запись.
  let requested = 0;
  let peak = 0;
  for (const thing of heldThings()) {
    for (const frame of declaredFrames(thing)) {
      viewmodelSprite(thing.slot, thing.itemId, frame);
      requested++;
      peak = Math.max(peak, viewmodelSpriteCacheSize());
      // Потолок из `cache.ts`: 48 записей, вытеснение до 36. В руках
      // одновременно две вещи, ещё одна уезжает при смене — запас огромен.
      assert.ok(viewmodelSpriteCacheSize() <= 48, `кэш перерос потолок: ${viewmodelSpriteCacheSize()}`);
    }
  }
  assert.ok(requested > 48 * 2, `ключей меньше, чем нужно для вытеснения: ${requested}`);
  assert.ok(peak > 36, `вытеснение ни разу не сработало, потолок не проверен: пик ${peak}`);

  resetViewmodel();
  assert.equal(viewmodelSpriteCacheSize(), 0, 'сброс обязан чистить кэш целиком');
});

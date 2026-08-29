/**
 * Посмотреть на вьюмодель глазами, не запуская игру.
 *
 * Два режима, и второй важнее первого.
 *
 *   Лист холстов — как выглядит сам спрайт:
 *     npx tsx scripts/viewmodel-preview.ts makarov:idle makarov:fire --out /tmp/pm.png
 *
 *   СОБРАННЫЙ КАДР — где оружие реально оказывается на экране:
 *     npx tsx scripts/viewmodel-preview.ts --screen makarov flashlight --out /tmp/scr.png
 *
 *   КОНТАКТНЫЙ ЛИСТ — весь парк силуэтов собранными кадрами, сеткой:
 *     npx tsx scripts/viewmodel-preview.ts --sheet --out /tmp/sheet.png
 *     npx tsx scripts/viewmodel-preview.ts --sheet --frame fire --out /tmp/sheet_fire.png
 *
 * Лист берёт по одному представителю на силуэт и ищет их тем же выводом, что и
 * игра (`viewmodelArchetype`), а не вторым списком. Заведённый силуэт попадает в
 * лист сам; забытый — виден пустой клеткой, а не отсутствием строки.
 *
 * Режим кадра появился потому, что лист холстов однажды соврал: спрайты в нём
 * выглядели верно, а в игре оружие висело посреди экрана вверх ногами. Изолированный
 * холст не показывает ни утопления под нижний срез, ни полосы HUD, ни того, что
 * левый край холста оружия приходится на середину кадра. Судить о композиции
 * можно только по кадру целиком.
 *
 * Инструмент отладочный: в сборку не входит и ничего не пишет, кроме файла,
 * который у него попросили.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import '../src/render/viewmodel';
import { viewmodelSprite } from '../src/render/viewmodel/cache';
import { VM } from '../src/render/viewmodel/types';
import type { ViewmodelFrameKey, ViewmodelSlot } from '../src/render/viewmodel/types';
import { viewmodelArchetype } from '../src/render/viewmodel/archetype';
import { WEAPON_STATS } from '../src/data/catalog';
import { ITEMS } from '../src/data/items';
import { ItemType } from '../src/core/types';

/** Кадр мира. Повторяет `SCR_W`/`SCR_H`; импортировать их сюда нельзя — потянет WebGL. */
const SCREEN_W = 320;
const SCREEN_H = 200;
/** Полоса витальных показателей снизу, та же доля, что в HUD. */
const HUD_BAND = 20;

const args = process.argv.slice(2);
let out = '/tmp/viewmodel.png';
let slot: ViewmodelSlot = 'weapon';
let bg = 0xff181a1c;
let screen = false;
let sheet = false;
let zoom = 1;
let frame: ViewmodelFrameKey = 'idle';
const targets: Array<{ itemId: string; frame: ViewmodelFrameKey }> = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') { out = args[++i]; continue; }
  if (a === '--slot') { slot = args[++i] as ViewmodelSlot; continue; }
  if (a === '--screen') { screen = true; zoom = 3; continue; }
  if (a === '--sheet') { sheet = true; zoom = 2; continue; }
  if (a === '--zoom') { zoom = Math.max(1, Number.parseInt(args[++i], 10) || 1); continue; }
  if (a === '--frame') { frame = args[++i] as ViewmodelFrameKey; continue; }
  if (a === '--bg') { bg = (Number.parseInt(args[++i], 16) >>> 0) | 0xff000000; continue; }
  const [itemId, f] = a.split(':');
  targets.push({ itemId, frame: (f ?? '') as ViewmodelFrameKey });
}

/* Кадр по умолчанию проставляется ВТОРЫМ проходом.
 *
 * Разбор шёл одним проходом, и `--frame fire` после цели молча не действовал:
 * цель успевала взять кадр, которого ещё не назначили. Порядок ключей в командной
 * строке не должен менять смысл — это ровно тот сорт ловушки, на который тратят
 * полчаса, решив, что не работает сам спрайт. */
for (const t of targets) if (!t.frame) t.frame = frame;

if (!targets.length && !sheet) {
  console.error('нечего показывать: укажите пары <itemId>[:<frame>], либо --screen <оружие> [<инструмент>], либо --sheet');
  process.exit(1);
}

function blendPixel(dst: Uint32Array, idx: number, src: number): void {
  const a = (src >>> 24) & 0xff;
  if (!a) return;
  if (a === 255) { dst[idx] = src; return; }
  const d = dst[idx] >>> 0;
  const t = a / 255;
  const mix = (sh: number) => Math.round((((d >>> sh) & 0xff) * (1 - t)) + (((src >>> sh) & 0xff) * t));
  dst[idx] = ((255 << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
}

/**
 * Собранный кадр мира с руками: пол снизу, стена сверху, полоса HUD и прицел.
 * Не картина, а подложка — она нужна ровно затем, чтобы видеть границы и
 * контраст. Геометрия укладки повторяет `runtime`: утопление под нижний срез,
 * инструмент прижат к левому краю, оружие зеркально к правому, инструмент лежит
 * ПОД оружием.
 */
function composeScreen(
  weaponId: string,
  weaponFrame: ViewmodelFrameKey,
  toolId?: string,
  toolFrame: ViewmodelFrameKey = 'idle',
): Uint32Array {
  const out = new Uint32Array(SCREEN_W * SCREEN_H);
  const horizon = (SCREEN_H * 0.46) | 0;
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      const wall = y < horizon;
      const t = wall ? y / horizon : (y - horizon) / (SCREEN_H - horizon);
      const v = wall ? 44 + t * 26 : 92 - t * 22;
      const n = ((x * 7 + y * 13) % 11) - 5;
      out[y * SCREEN_W + x] = (255 << 24) | ((((v + n) | 0) & 0xff) << 16) | ((((v + n) | 0) & 0xff) << 8) | (((v + n + 4) | 0) & 0xff);
    }
  }

  const baseY = SCREEN_H - VM + (VM >> 4);
  const place = (sprite: Uint32Array | undefined, ox: number) => {
    if (!sprite) return;
    for (let y = 0; y < VM; y++) {
      const sy = baseY + y;
      if (sy < 0 || sy >= SCREEN_H) continue;
      for (let x = 0; x < VM; x++) {
        const sx = ox + x;
        if (sx < 0 || sx >= SCREEN_W) continue;
        blendPixel(out, sy * SCREEN_W + sx, sprite[y * VM + x] >>> 0);
      }
    }
  };
  if (toolId !== undefined) place(viewmodelSprite('tool', toolId, toolFrame), 0);
  place(viewmodelSprite('weapon', weaponId, weaponFrame), SCREEN_W - VM);

  // Прицел ровно в центре, как в HUD.
  const cx = SCREEN_W >> 1;
  const cy = SCREEN_H >> 1;
  for (let d = 2; d <= 6; d++) {
    for (const [x, y] of [[cx + d, cy], [cx - d, cy], [cx, cy + d], [cx, cy - d]] as const) {
      out[y * SCREEN_W + x] = 0xff40d0c0;
    }
  }
  // Полоса витальных показателей: она перекроет низ кадра в игре.
  for (let y = SCREEN_H - HUD_BAND; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) blendPixel(out, y * SCREEN_W + x, 0xd0101014);
  }
  return out;
}

/* ── Подпись клетки: 3×5, только чтобы не гадать, что за силуэт в клетке ── */
const FONT_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
const FONT_ROWS = [
  '.#. ##. .## ##. ### ### .## #.# ### ..# #.# #.. #.# #.# .#. ##. .#. ##. .## ### #.# #.# #.# #.# #.# ### .#. .#. ##. ##. #.# ### .## ### ### ### ...',
  '#.# #.# #.. #.# #.. #.. #.. #.# .#. ..# #.# #.. ### ### #.# #.# #.# #.# #.. .#. #.# #.# #.# #.# #.# ..# #.# ##. ..# ..# #.# #.. #.. ..# #.# #.# ...',
  '### ##. #.. #.# ##. ##. #.# ### .#. ..# ##. #.. ### ### #.# ##. #.# ##. .#. .#. #.# #.# ### .#. .#. .#. #.# .#. .#. .#. ### ##. ### .#. ### ### ...',
  '#.# #.# #.. #.# #.. #.. #.# #.# .#. #.# #.# #.. #.# ### #.# #.. ### #.# ..# .#. #.# .#. ### #.# .#. #.. #.# .#. #.. ..# ..# ..# #.# .#. #.# ..# ...',
  '#.# ##. .## ##. ### #.. .## #.# ### .#. #.# ### #.# #.# .#. #.. .## #.# ##. .#. .#. .#. #.# #.# .#. ### .#. ### ### ##. ..# ##. ### .#. ### ##. ###',
].map((r) => r.split(' '));

function drawLabel(dst: Uint32Array, w: number, ox: number, oy: number, text: string, px1: number, color: number): void {
  let cx = ox;
  for (const ch of text.toUpperCase()) {
    const gi = FONT_KEYS.indexOf(ch);
    if (gi >= 0) {
      for (let r = 0; r < 5; r++) {
        const bits = FONT_ROWS[r][gi];
        for (let c = 0; c < 3; c++) {
          if (bits[c] !== '#') continue;
          for (let yy = 0; yy < px1; yy++) {
            for (let xx = 0; xx < px1; xx++) {
              dst[(oy + r * px1 + yy) * w + cx + c * px1 + xx] = color;
            }
          }
        }
      }
    }
    cx += 4 * px1;
  }
}

/**
 * По одному представителю на силуэт.
 *
 * Кто чей представитель, решает тот же вывод, что и в игре, — второго списка
 * «силуэт → пример» здесь нет и не должно быть: он разошёлся бы с правилом при
 * первой же правке боевых чисел.
 */
function sheetEntries(): Array<{ arch: string; itemId: string; slot: ViewmodelSlot; drawn: boolean }> {
  const seen = new Map<string, { arch: string; itemId: string; slot: ViewmodelSlot; drawn: boolean }>();
  /* Представитель занимает клетку первым, но НЕПУСТОЙ вытесняет пустого.
   *
   * Пси числится боевой характеристикой, а живёт в руке инструмента, и первым
   * заходом клетка доставалась слоту `weapon`, где пакета нет вовсе. Пустая
   * клетка при этом означала бы «силуэт не рисуется», хотя не рисовался он
   * только в стенде. Пустая клетка остаётся возможной — но теперь она означает,
   * что вещь не рисуется ни в одной руке. */
  const take = (slot: ViewmodelSlot, itemId: string) => {
    const arch = viewmodelArchetype(slot, itemId);
    if (!arch) return;
    const drawn = !!viewmodelSprite(slot, itemId, 'idle');
    const prev = seen.get(arch);
    if (prev && (prev.drawn || !drawn)) return;
    seen.set(arch, { arch, itemId, slot, drawn });
  };
  take('weapon', '');
  for (const id of Object.keys(WEAPON_STATS)) take('weapon', id);
  for (const id of Object.keys(WEAPON_STATS)) take('tool', id);
  for (const id of Object.keys(ITEMS)) if (ITEMS[id].type === ItemType.TOOL) take('tool', id);
  return [...seen.values()];
}

let width: number;
let height: number;
let px: Uint32Array;

if (sheet) {
  const entries = sheetEntries();
  const cols = Math.ceil(Math.sqrt(entries.length));
  const rows = Math.ceil(entries.length / cols);
  const band = 8 * zoom;
  const cw = SCREEN_W * zoom;
  const ch = SCREEN_H * zoom + band;
  width = cols * cw;
  height = rows * ch;
  px = new Uint32Array(width * height).fill(0xff0a0a0c);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const cell = e.slot === 'tool'
      ? composeScreen('', 'idle', e.itemId, frame)
      : composeScreen(e.itemId, frame, undefined, 'idle');
    const ox = (i % cols) * cw;
    const oy = ((i / cols) | 0) * ch;
    for (let y = 0; y < SCREEN_H * zoom; y++) {
      const sy = (y / zoom) | 0;
      for (let x = 0; x < cw; x++) px[(oy + y) * width + ox + x] = cell[sy * SCREEN_W + ((x / zoom) | 0)];
    }
    drawLabel(px, width, ox + 2 * zoom, oy + SCREEN_H * zoom + zoom, `${e.arch} ${e.itemId || 'FISTS'}`, zoom, 0xff8ad0c0);
  }
  console.log(entries.map((e, i) => `${i}: ${e.arch} ← ${e.slot} ${e.itemId || '(пусто)'}`).join('\n'));
  zoom = 1;
} else if (screen) {
  width = SCREEN_W;
  height = SCREEN_H;
  px = composeScreen(targets[0].itemId, targets[0].frame, targets[1]?.itemId, targets[1]?.frame ?? 'idle');
} else {
  width = targets.length * VM;
  height = VM;
  px = new Uint32Array(width * height).fill(bg >>> 0);
  for (let c = 0; c < targets.length; c++) {
    const sprite = viewmodelSprite(slot, targets[c].itemId, targets[c].frame);
    if (!sprite) { console.warn(`нет картинки: ${slot} ${targets[c].itemId}:${targets[c].frame}`); continue; }
    for (let y = 0; y < VM; y++) {
      for (let x = 0; x < VM; x++) blendPixel(px, y * width + c * VM + x, sprite[y * VM + x] >>> 0);
    }
  }
}

if (zoom > 1) {
  const zw = width * zoom;
  const zh = height * zoom;
  const zp = new Uint32Array(zw * zh);
  for (let y = 0; y < zh; y++) {
    const sy = (y / zoom) | 0;
    for (let x = 0; x < zw; x++) zp[y * zw + x] = px[sy * width + ((x / zoom) | 0)];
  }
  width = zw; height = zh; px = zp;
}

/* ── Минимальный кодировщик PNG: RGBA8, фильтр 0 ── */
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc(height * (width * 4 + 1));
for (let y = 0; y < height; y++) {
  const row = y * (width * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < width; x++) {
    const v = px[y * width + x] >>> 0;
    const o = row + 1 + x * 4;
    raw[o] = v & 0xff;
    raw[o + 1] = (v >>> 8) & 0xff;
    raw[o + 2] = (v >>> 16) & 0xff;
    raw[o + 3] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]));

console.log(`${out} — ${screen ? 'кадр' : `${targets.length} холст(ов)`}, ${width}x${height}`);

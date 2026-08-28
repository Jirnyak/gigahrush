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
 * Режим кадра появился потому, что лист холстов однажды соврал: спрайты в нём
 * выглядели верно, а в игре оружие висело посреди экрана вверх ногами. Изолированный
 * холст не показывает ни утопления под нижний срез, ни полосы HUD, ни того, что
 * левый край холста оружия приходится на треть ширины кадра. Судить о композиции
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
let zoom = 1;
let frame: ViewmodelFrameKey = 'idle';
const targets: Array<{ itemId: string; frame: ViewmodelFrameKey }> = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') { out = args[++i]; continue; }
  if (a === '--slot') { slot = args[++i] as ViewmodelSlot; continue; }
  if (a === '--screen') { screen = true; zoom = 3; continue; }
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

if (!targets.length) {
  console.error('нечего показывать: укажите пары <itemId>[:<frame>], либо --screen <оружие> [<инструмент>]');
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

let width: number;
let height: number;
let px: Uint32Array;

if (screen) {
  /* Кадр мира: пол снизу, стена сверху, полоса HUD и прицел. Не картина, а
   * подложка — она нужна ровно затем, чтобы видеть границы и контраст. */
  width = SCREEN_W;
  height = SCREEN_H;
  px = new Uint32Array(width * height);
  const horizon = (SCREEN_H * 0.46) | 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wall = y < horizon;
      const t = wall ? y / horizon : (y - horizon) / (height - horizon);
      const v = wall ? 44 + t * 26 : 92 - t * 22;
      const n = ((x * 7 + y * 13) % 11) - 5;
      px[y * width + x] = (255 << 24) | ((((v + n) | 0) & 0xff) << 16) | ((((v + n) | 0) & 0xff) << 8) | (((v + n + 4) | 0) & 0xff);
    }
  }

  const weaponId = targets[0]?.itemId ?? '';
  const toolId = targets[1]?.itemId;
  const baseY = SCREEN_H - VM + (VM >> 4);
  const place = (sprite: Uint32Array | undefined, ox: number) => {
    if (!sprite) return;
    for (let y = 0; y < VM; y++) {
      const sy = baseY + y;
      if (sy < 0 || sy >= height) continue;
      for (let x = 0; x < VM; x++) {
        const sx = ox + x;
        if (sx < 0 || sx >= width) continue;
        blendPixel(px, sy * width + sx, sprite[y * VM + x] >>> 0);
      }
    }
  };
  // Порядок тот же, что в кадре: инструмент слева и ПОД оружием.
  if (toolId !== undefined) place(viewmodelSprite('tool', toolId, targets[1].frame), 0);
  place(viewmodelSprite('weapon', weaponId, targets[0].frame), ((SCREEN_W - VM) * 0.5) | 0);

  // Прицел ровно в центре, как в HUD.
  const cx = width >> 1;
  const cy = height >> 1;
  for (let d = 2; d <= 6; d++) {
    for (const [x, y] of [[cx + d, cy], [cx - d, cy], [cx, cy + d], [cx, cy - d]] as const) {
      px[y * width + x] = 0xff40d0c0;
    }
  }
  // Полоса витальных показателей: она перекроет низ кадра в игре.
  for (let y = height - HUD_BAND; y < height; y++) {
    for (let x = 0; x < width; x++) blendPixel(px, y * width + x, 0xd0101014);
  }
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

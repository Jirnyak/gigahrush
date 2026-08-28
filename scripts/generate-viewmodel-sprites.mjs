/**
 * Запекатель художественных кадров вьюмодели.
 *
 *   node scripts/generate-viewmodel-sprites.mjs
 *
 * Читает `viewmodels/<itemId>/<frame>.png`, пишет пиксели в
 * `src/render/viewmodel/generated_frames.ts` и сверяет факты файлов с
 * `src/data/viewmodel_art_manifest.ts`. Браузер PNG не читает никогда: исходник
 * живёт только в сборке, в игру уезжает сгенерированный TypeScript.
 *
 * Отличие от запекателя спрайтов сущностей: здесь НЕТ ни обрезки прозрачных
 * полей, ни подгонки масштаба. У NPC важен только рост, а у руки положение дула
 * и кисти в кадре — это и есть замысел художника, двигать его нельзя. Поэтому
 * принимается строго 128x128, а любой другой размер — ошибка.
 *
 * Пустой каталог `viewmodels/` — законное состояние: получится корректный пустой
 * модуль, и руки продолжит рисовать процедура.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'viewmodels');
const MANIFEST_PATH = path.join(ROOT, 'src/data/viewmodel_art_manifest.ts');
const OUT_PATH = path.join(ROOT, 'src/render/viewmodel/generated_frames.ts');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Сторона холста вьюмодели. Должна совпадать с `VM` и `VIEWMODEL_ART_SIDE`. */
const SIDE = 128;
/** Кадры позы. Список закрыт: он повторяет `ViewmodelFrameKey`. */
const FRAMES = ['idle', 'fire', 'swing', 'swing2', 'reload'];
const DEFAULT_SLOT = 'weapon';
const SLOTS = ['weapon', 'tool'];
const ID_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const MANIFEST_HEAD = 'export const VIEWMODEL_ART_MANIFEST: readonly ViewmodelArtManifestRow[] = [';

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function fail(message) {
  throw new Error(message);
}

function assertAsciiName(filePath) {
  const name = path.basename(filePath);
  if (!/^[\x20-\x7e]+$/.test(name)) fail(`Source media paths must be ASCII: ${rel(filePath)}`);
}

function assertCleanTree(dir) {
  for (const name of readdirSync(dir)) {
    const filePath = path.join(dir, name);
    if (name === '.DS_Store') fail(`Source media must not contain .DS_Store: ${rel(filePath)}`);
    assertAsciiName(filePath);
    if (statSync(filePath).isDirectory()) assertCleanTree(filePath);
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(filePath) {
  const file = readFileSync(filePath);
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) fail(`${rel(filePath)}: not a PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = -1;
  let colorType = -1;
  let compression = -1;
  let filterMethod = -1;
  let interlace = -1;
  const idat = [];

  while (offset < file.length) {
    if (offset + 12 > file.length) fail(`${rel(filePath)}: truncated PNG chunk header`);
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > file.length) fail(`${rel(filePath)}: truncated PNG chunk ${type}`);
    const data = file.subarray(dataStart, dataEnd);
    offset = dataEnd + 4;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compression = data[10];
      filterMethod = data[11];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (width <= 0 || height <= 0) fail(`${rel(filePath)}: invalid PNG size ${width}x${height}`);
  if (bitDepth !== 8 || colorType !== 6) fail(`${rel(filePath)}: expected 8-bit RGBA PNG`);
  if (compression !== 0 || filterMethod !== 0 || interlace !== 0) {
    fail(`${rel(filePath)}: expected non-interlaced PNG with standard filters`);
  }
  if (idat.length === 0) fail(`${rel(filePath)}: missing IDAT payload`);
  // Ни обрезки, ни подгонки: кадр ложится в холст как есть, иначе уедет дуло.
  if (width !== SIDE || height !== SIDE) {
    fail(`${rel(filePath)}: viewmodel frames must be exactly ${SIDE}x${SIDE}, got ${width}x${height}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  if (raw.length !== height * (stride + 1)) fail(`${rel(filePath)}: unexpected PNG payload length`);
  const pixels = new Uint8Array(height * stride);
  let src = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[prevStart + x - bytesPerPixel] : 0;
      let value = raw[src++];
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) fail(`${rel(filePath)}: unsupported PNG filter ${filter}`);
      pixels[rowStart + x] = value;
    }
  }

  const out = new Uint32Array(width * height);
  let opaque = 0;
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    const a = pixels[j + 3];
    if (a !== 0) opaque++;
    out[i] = ((a << 24) | (pixels[j + 2] << 16) | (pixels[j + 1] << 8) | pixels[j]) >>> 0;
  }
  // Полностью прозрачный кадр молча стёр бы вещь из рук: пусть падает здесь.
  if (opaque === 0) fail(`${rel(filePath)}: blank transparent frame`);
  return { width, height, pixels: out };
}

function encodeRle(pixels) {
  const out = [];
  let value = pixels[0] >>> 0;
  let count = 1;
  for (let i = 1; i < pixels.length; i++) {
    const next = pixels[i] >>> 0;
    if (next === value && count < 0xffff) {
      count++;
      continue;
    }
    out.push(count, value);
    value = next;
    count = 1;
  }
  out.push(count, value);
  return out;
}

function hex32(value) {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
}

function formatRle(values) {
  const lines = [];
  for (let i = 0; i < values.length; i += 16) {
    const chunk = values.slice(i, i + 16).map((value, index) => index % 2 === 0 ? String(value) : hex32(value));
    lines.push(`    ${chunk.join(', ')},`);
  }
  return lines.join('\n');
}

function collectAssets() {
  if (!existsSync(SOURCE_DIR)) fail('Missing viewmodel source directory: viewmodels/');
  assertCleanTree(SOURCE_DIR);

  const itemDirs = readdirSync(SOURCE_DIR)
    .map(name => path.join(SOURCE_DIR, name))
    .filter(filePath => statSync(filePath).isDirectory())
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  const assets = [];
  for (const itemDir of itemDirs) {
    const itemId = path.basename(itemDir);
    if (!ID_RE.test(itemId)) fail(`${rel(itemDir)}: folder name must be an item id in lowercase snake_case`);

    const entries = readdirSync(itemDir).sort((a, b) => a.localeCompare(b));
    const frames = [];
    for (const name of entries) {
      const filePath = path.join(itemDir, name);
      if (!statSync(filePath).isFile()) fail(`${rel(filePath)}: viewmodel frames must be PNG files`);
      const match = /^([a-z0-9]+)\.png$/.exec(name);
      if (!match || !FRAMES.includes(match[1])) {
        fail(`${rel(filePath)}: frame name must be one of ${FRAMES.join(', ')} with .png`);
      }
      frames.push({ frame: match[1], filePath });
    }
    if (frames.length === 0) fail(`${rel(itemDir)}: empty viewmodel folder`);
    frames.sort((a, b) => FRAMES.indexOf(a.frame) - FRAMES.indexOf(b.frame));

    for (const { frame, filePath } of frames) {
      const file = readFileSync(filePath);
      const decoded = decodePng(filePath);
      assets.push({
        id: `${itemId}:${frame}`,
        itemId,
        frame,
        sourcePath: rel(filePath),
        sha256: createHash('sha256').update(file).digest('hex'),
        width: decoded.width,
        height: decoded.height,
        rle: encodeRle(decoded.pixels),
      });
    }
  }
  return assets;
}

function emit(assets) {
  const ids = assets.length === 0
    ? '[]'
    : `[\n${assets.map(asset => `  ${JSON.stringify(asset.id)},`).join('\n')}\n]`;
  const rle = assets.length === 0
    ? '{}'
    : `{\n${assets.map(asset => `  ${JSON.stringify(asset.id)}: [\n${formatRle(asset.rle)}\n  ],`).join('\n')}\n}`;

  return `/* Generated by scripts/generate-viewmodel-sprites.mjs. Do not edit manually. */\n\n` +
    `const IDS: readonly string[] = ${ids};\n\n` +
    `/** Идентификаторы вида \`<itemId>:<frame>\`, запечённые из \`viewmodels/\`. */\n` +
    `export const GENERATED_VIEWMODEL_FRAME_IDS: readonly string[] = IDS;\n\n` +
    `/** RLE-пары \`[count, value, ...]\` на кадр. Разжимаются только при промахе кэша. */\n` +
    `const GENERATED_VIEWMODEL_RLE: Record<string, readonly number[]> = ${rle};\n\n` +
    `/** Сторона запечённого кадра. Совпадает с \`VM\` и проверяется тестом. */\n` +
    `export const GENERATED_VIEWMODEL_SIDE = ${SIDE};\n\n` +
    `export function getGeneratedViewmodelFrame(id: string | undefined): Uint32Array | undefined {\n` +
    `  if (!id) return undefined;\n` +
    `  const rle = GENERATED_VIEWMODEL_RLE[id];\n` +
    `  if (!rle) return undefined;\n` +
    `  const out = new Uint32Array(GENERATED_VIEWMODEL_SIDE * GENERATED_VIEWMODEL_SIDE);\n` +
    `  let p = 0;\n` +
    `  for (let i = 0; i < rle.length; i += 2) {\n` +
    `    const count = rle[i];\n` +
    `    const value = rle[i + 1] >>> 0;\n` +
    `    for (let k = 0; k < count && p < out.length; k++) out[p++] = value;\n` +
    `  }\n` +
    `  return p === out.length ? out : undefined;\n` +
    `}\n`;
}

function renderManifestRow(asset) {
  return `  {\n` +
    `    id: '${asset.id}',\n` +
    `    itemId: '${asset.itemId}',\n` +
    `    frame: '${asset.frame}',\n` +
    `    slot: '${DEFAULT_SLOT}',\n` +
    `    sourcePath: '${asset.sourcePath}',\n` +
    `    sha256: '${asset.sha256}',\n` +
    `    width: ${asset.width},\n` +
    `    height: ${asset.height},\n` +
    `  },`;
}

/**
 * Строки манифеста следуют за файлами: факты переписываются, авторские поля
 * (`slot`, `author`, `consent` и любые заметки) остаются как их написал человек.
 */
function syncManifest(assets) {
  const src = readFileSync(MANIFEST_PATH, 'utf8');
  const head = src.indexOf(MANIFEST_HEAD);
  if (head < 0) fail(`Cannot find ${MANIFEST_HEAD} in ${rel(MANIFEST_PATH)}`);
  const bodyStart = head + MANIFEST_HEAD.length;
  const bodyEnd = src.indexOf('\n];', bodyStart);
  if (bodyEnd < 0) fail(`Cannot find the end of VIEWMODEL_ART_MANIFEST in ${rel(MANIFEST_PATH)}`);

  const body = src.slice(bodyStart, bodyEnd);
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const blocks = [];
  const kept = new Set();
  const dropped = [];

  let cursor = body.indexOf('\n  {');
  while (cursor >= 0) {
    const next = body.indexOf('\n  {', cursor + 1);
    const block = body.slice(cursor + 1, next < 0 ? body.length : next).replace(/\s+$/, '');
    cursor = next;

    const id = /id: '([^']*)'/.exec(block)?.[1];
    if (!id) fail(`Manifest row without id in ${rel(MANIFEST_PATH)}`);
    if (kept.has(id) || dropped.includes(id)) fail(`Duplicate manifest row: ${id}`);
    const slot = /slot: '([^']*)'/.exec(block)?.[1];
    if (!slot || !SLOTS.includes(slot)) fail(`Manifest row ${id}: slot must be one of ${SLOTS.join(', ')}`);

    const asset = byId.get(id);
    if (!asset) {
      dropped.push(id);
      continue;
    }
    kept.add(id);
    blocks.push(block
      .replace(/sourcePath: '[^']*'/, `sourcePath: '${asset.sourcePath}'`)
      .replace(/sha256: '[^']*'/, `sha256: '${asset.sha256}'`)
      .replace(/width: \d+/, `width: ${asset.width}`)
      .replace(/height: \d+/, `height: ${asset.height}`));
  }

  const added = [];
  for (const asset of assets) {
    if (kept.has(asset.id)) continue;
    added.push(asset.id);
    blocks.push(renderManifestRow(asset));
  }

  const nextBody = blocks.length === 0 ? '' : `\n${blocks.join('\n')}`;
  if (nextBody !== body) writeFileSync(MANIFEST_PATH, `${src.slice(0, bodyStart)}${nextBody}${src.slice(bodyEnd)}`);
  return { added, dropped };
}

const assets = collectAssets();
const { added, dropped } = syncManifest(assets);
mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, emit(assets));
for (const id of added) console.log(`  + manifest row ${id}`);
for (const id of dropped) console.log(`  - manifest row ${id} (source file is gone)`);
console.log(`Generated ${rel(OUT_PATH)} from ${assets.length} viewmodel frame(s) at ${SIDE}x${SIDE}`);

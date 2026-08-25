#!/usr/bin/env node
/*
 * Механическая проверка инвариантов, которые до сих пор держались только на дисциплине:
 *
 *   1. Границы слоёв — кто кого имеет право импортировать.
 *   1б. Крупнейший цикл рантайм-импортов. Отдельная метрика: рёбра и циклы не одно
 *       и то же, можно убрать 92% обратных рёбер и не сдвинуть цикл.
 *   2. Запрет сырого Math.random() вне core/rand.ts.
 *   3. Потолок длины функции.
 *
 * Проверка работает как храповик: у каждого нарушения есть счётчик BASELINE.
 * Стало больше — падаем. Стало меньше — тоже падаем, с требованием обновить
 * baseline, чтобы достигнутое нельзя было откатить молча.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const srcRoot = path.join(root, 'src');

/* ── 1. Слои ──────────────────────────────────────────────────────
   Порядок отражает реальность графа, а не порядок фаз игры: генераторы
   ПОТРЕБЛЯЮТ системы (пишут территорию, публикуют события, считают rpg),
   поэтому gen/ стоит НАД systems/, а не под ним.

       core → data → entities → world → systems → { gen, render }

   gen/ и render/ — соседи: ни один не имеет права звать другого. */
const ALLOWED = {
  core: [],
  data: ['core'],
  entities: ['core', 'data'],
  world: ['core', 'data'],
  systems: ['core', 'data', 'entities', 'world'],
  gen: ['core', 'data', 'entities', 'world', 'systems'],
  render: ['core', 'data', 'entities', 'world', 'systems'],
  // main.ts / input.ts / test_arena.ts — точка сборки, ей можно всё.
  root: ['core', 'data', 'entities', 'world', 'systems', 'gen', 'render'],
};

/* Известные нарушения на момент установки проверки. Только вниз.
   systems->gen: из шести осталось три, и все три — `import type FloorGeneration`
   из gen/floor_manifest (samosbor, samosbor_wave, floor_memory). При сборке тип
   стирается, рантайм-ребра нет: цикл и разрезание бандла они не держат. Довести
   счётчик до нуля можно только переселив сам тип в core/types, а это ~70 файлов
   импортёров ради косметики — не стоит того. Проверка синтаксическая и типы
   отличать не умеет, поэтому число зафиксировано здесь, а не занижено. */
const BASELINE = {
  'gen->render': 5,
  'systems->gen': 3,
  'systems->render': 2,
  'data->entities': 3,
  'entities->render': 2,
  'render->gen': 2,
  'data->gen': 1,
};

/* Крупнейший цикл в графе рантайм-импортов (типы стёрты — они не существуют при сборке).
   История: 293 → 106 (срезано ребро systems/samosbor → gen/floor_manifest, генератор
   приходит инъекцией из точки сборки src/content.ts) → 36 (константа версии сейва уехала
   в лист core/save_shape.ts, и platform_bridge перестал тянуть весь save_runtime) → 10
   (markov_text берёт реляцию из data/relations, а не через systems/factions) → 4
   (клубок из 10 разобран по ответственностям: словарь дельт матрицы отношений уехал
   к самой матрице в data/relations, а снятие зонного тумана — в лист systems/fog_zone,
   и бой перестал тянуть весь самосбор).
   Ленивый реестр этажей сверх этого не даёт ничего — замерено.
   Оставшиеся 4 — ядро боевого AI: ai/combat ↔ ai/monster ↔ ai/micro_goals ↔
   ai/khorovaya_matka. Это взаимная логика одного слоя, а не чужой лист: цель и
   стрельба, микроцели и матка ссылаются друг на друга по существу. */
const RUNTIME_CYCLE_BASELINE = 4;

const MATH_RANDOM_BASELINE = 2; // online_client.ts, net_sphere.ts — сетевые идентификаторы
const MAX_FUNCTION_LINES = 200;
const LONG_FUNCTION_BASELINE = 21;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = walk(srcRoot);
const rel = (abs) => path.relative(root, abs).replaceAll(path.sep, '/');
const layerOf = (srcRel) => {
  const head = srcRel.split('/')[0];
  return Object.prototype.hasOwnProperty.call(ALLOWED, head) && head !== 'root' ? head : 'root';
};

const failures = [];
const notes = [];

/* ── Проверка 1: границы слоёв ─────────────────────────────────── */
const edgeCounts = new Map();
const edgeExamples = new Map();

for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const from = layerOf(srcRel);
  const text = fs.readFileSync(file, 'utf8');

  // Голый `import './x'` тоже ребро: именно так подключаются content-манифесты,
  // регистрирующие контент побочным эффектом. Ловить только `from` — занижать граф.
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/gm)) {
    const abs = path.resolve(path.dirname(file), m[1] ?? m[2]).replace(/\.(js|ts)$/, '');
    const targetRel = path.relative(srcRoot, abs).replaceAll(path.sep, '/');
    if (targetRel.startsWith('..')) continue;
    const to = layerOf(targetRel);
    if (to === from || ALLOWED[from].includes(to)) continue;

    const key = `${from}->${to}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    if (!edgeExamples.has(key)) edgeExamples.set(key, []);
    edgeExamples.get(key).push(`${srcRel} → ${targetRel}`);
  }
}

for (const key of new Set([...edgeCounts.keys(), ...Object.keys(BASELINE)])) {
  const now = edgeCounts.get(key) ?? 0;
  const was = BASELINE[key] ?? 0;
  if (now > was) {
    failures.push(`Слои: ${key} — ${now}, разрешено ${was}. Новые нарушения:`);
    for (const e of edgeExamples.get(key) ?? []) failures.push(`    ${e}`);
  } else if (now < was) {
    notes.push(`Слои: ${key} — ${now} (было ${was}). Опусти BASELINE в ${path.basename(import.meta.filename)}.`);
  }
}

/* ── Проверка 1б: крупнейший цикл рантайм-импортов ──────────────
   Обратные рёбра и циклы — разные метрики. Можно убрать 92% рёбер и не сдвинуть
   цикл, если уцелело одно замыкающее. Поэтому цикл считается отдельно. */
const runtimeEdges = new Map();
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const text = fs.readFileSync(file, 'utf8');
  const out = new Set();
  for (const m of text.matchAll(/import\s+(type\s+)?(\{[^}]*\}|[\w*\s,]+?)?\s*from\s*['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/gs)) {
    if (m[1]) continue;                                  // import type — стирается
    const spec = (m[2] ?? '').trim();
    if (spec.startsWith('{')) {
      const parts = spec.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length && parts.every(x => x.startsWith('type '))) continue;
    }
    const abs = path.resolve(path.dirname(file), m[3] ?? m[4]).replace(/\.(js|ts)$/, '');
    let target = path.relative(srcRoot, abs).replaceAll(path.sep, '/');
    if (target.startsWith('..')) continue;
    if (!fs.existsSync(path.join(srcRoot, `${target}.ts`))) target = `${target}/index`;
    out.add(target);
  }
  runtimeEdges.set(srcRel.replace(/\.ts$/, ''), out);
}

/* Итеративный Тарьян: рекурсия на ~900 узлах переполняет стек. */
function largestCycle(graph) {
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [];
  let counter = 0, best = 0;
  for (const root of graph.keys()) {
    if (index.has(root)) continue;
    const work = [[root, graph.get(root)?.values() ?? [][Symbol.iterator]()]];
    index.set(root, counter); low.set(root, counter++); stack.push(root); onStack.add(root);
    while (work.length) {
      const [node, it] = work[work.length - 1];
      let descended = false;
      for (const next of it) {
        if (!index.has(next)) {
          index.set(next, counter); low.set(next, counter++); stack.push(next); onStack.add(next);
          work.push([next, graph.get(next)?.values() ?? [][Symbol.iterator]()]);
          descended = true;
          break;
        }
        if (onStack.has(next)) low.set(node, Math.min(low.get(node), index.get(next)));
      }
      if (descended) continue;
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        let size = 0, popped;
        do { popped = stack.pop(); onStack.delete(popped); size++; } while (popped !== node);
        if (size > best) best = size;
      }
    }
  }
  return best;
}

const runtimeCycle = largestCycle(runtimeEdges);
if (runtimeCycle > RUNTIME_CYCLE_BASELINE) {
  failures.push(`Цикл: крупнейший цикл рантайм-импортов ${runtimeCycle} файлов, разрешено ${RUNTIME_CYCLE_BASELINE}.`);
} else if (runtimeCycle < RUNTIME_CYCLE_BASELINE) {
  notes.push(`Цикл: ${runtimeCycle} файлов (было ${RUNTIME_CYCLE_BASELINE}). Опусти RUNTIME_CYCLE_BASELINE.`);
}

/* ── Проверка 2: сырой Math.random ─────────────────────────────── */
const randomHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  if (srcRel === 'core/rand.ts') continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/\bMath\.random\s*\(/.test(line)) randomHits.push(`${srcRel}:${i + 1}`);
  });
}
if (randomHits.length > MATH_RANDOM_BASELINE) {
  failures.push(`Math.random: ${randomHits.length} вызовов вне core/rand.ts, разрешено ${MATH_RANDOM_BASELINE}.`);
  for (const h of randomHits) failures.push(`    ${h}`);
} else if (randomHits.length < MATH_RANDOM_BASELINE) {
  notes.push(`Math.random: ${randomHits.length} (было ${MATH_RANDOM_BASELINE}). Опусти MATH_RANDOM_BASELINE.`);
}

/* ── Проверка 3: рукописный старт нумерации сущностей ──────────── */
// Номер сущности обязан приходить из `gen/entity_ids.ts`. Правило «начинать выше
// зарезервированного диапазона сюжетных слотов» жило сорока с лишним магическими
// числами по генераторам, и несколько копий оказались неверными: ад, квартиры и
// коллекторы начинали с единицы, тёмная пересадка — тоже, а общий шаг населения
// держал собственную копию счётчика. Предмет с чужим номером выдавал себя за
// сюжетную личность: с ада каждую загрузку пропадали пять авторских NPC, а на
// квартирах и коллекторах панель диалога рисовалась из листовки.
const ID_CURSOR_OWNER = 'gen/entity_ids.ts';
const idCursorHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  if (srcRel === ID_CURSOR_OWNER) continue;
  if (!srcRel.startsWith('gen/')) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Счётчик сущностей, а не комнат/контейнеров: те живут в своих пространствах.
    if (/\bnext(?:Entity)?Id\b[^=\n]*=\s*(?:\{\s*v:\s*\d+\s*\}|\d+)\s*;/.test(line)) {
      idCursorHits.push(`${srcRel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}
if (idCursorHits.length) {
  failures.push(`Нумерация сущностей: ${idCursorHits.length} мест заводят счётчик числом вместо newEntityIdCursor()/firstRuntimeEntityId().`);
  failures.push(`    Владелец правила — src/${ID_CURSOR_OWNER}; порог берётся оттуда, а не переписывается.`);
  for (const h of idCursorHits) failures.push(`    ${h}`);
}

/* ── Проверка 3.1: номер сущности как номер сюжетного слота ────── */
// Личность живёт в `alifeId`, `id` — адрес тела. Пока доставка выдавала
// авторскому человеку номер, равный слоту, разница ничего не стоила, и около
// ста мест читали `entity.id` там, где имели в виду личность. Совпадения больше
// нет: такое чтение теперь молча возвращает undefined, то есть личность просто
// перестаёт узнаваться — ни ошибки, ни падения.
const SLOT_LOOKUPS = 'getPlotNpcStringId|getPlotNpcNumericId|getPlotNpcPackageByNumericId|getNpcPackageByPlotNpcId|resolvePackageForPlotNpcId';
// Получатель ограничен ИМЕНАМИ СУЩНОСТЕЙ: `.id` у описания, спецификации или
// записи A-Life — законный строковый или слотовый идентификатор, и запрещать его
// нельзя (`def.id`, `spawn.id`, `snapshot.id` — все три встречаются и все верны).
const ENTITY_RECEIVERS = '(?:entity|e|npc|target|killed|actor|other|ctx\\.killed|ctx\\.npc)';
const slotByEntityIdRe = new RegExp(`(?:${SLOT_LOOKUPS})\\s*\\(\\s*${ENTITY_RECEIVERS}\\.id\\b`);
const slotCompareRe = new RegExp(`\\b${ENTITY_RECEIVERS}\\.id\\s*===\\s*(?:${SLOT_LOOKUPS})\\s*\\(`);
const slotIdHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (slotByEntityIdRe.test(line) || slotCompareRe.test(line)) {
      slotIdHits.push(`${srcRel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}
if (slotIdHits.length) {
  failures.push(`Личность по номеру сущности: ${slotIdHits.length} мест читают слот из \`.id\`.`);
  failures.push('    Слот живёт в `alifeId`; канонический предикат — `isPlotNpc` (data/plot.ts).');
  for (const h of slotIdHits) failures.push(`    ${h}`);
}

/* ── Проверка 3.2: урон мимо единой двери ───────────────────────── */
// Здоровье актору снимает `damageActor` (`systems/combat.ts`) и только он: он
// считает тип и броню, толкает, СООБЩАЕТ ЖЕРТВЕ, кто ударил, начисляет штраф
// отношениям и доводит смерть до общей обработки. Пока двери не было, каждый
// бьющий делал это сам, и половина забывала: `notifyActorDamaged` знали три
// файла из всех, снимавших здоровье, — пси-арсенал игрока бил без автора, а
// гнилушка и слизевик в тишине. Жертва не узнавала, кто её ударил.
//
// Белый список — не поблажка, а перечень мест, где урон БЕЗАВТОРСКИЙ по природе
// (голод, обвал, среда, поезд) либо где здоровье не отнимают, а восстанавливают
// (лечение, загрузка сейва, синхронизация A-Life и сети, цена предмета).
const DAMAGE_DOOR_ALLOWED = new Set([
  'systems/combat_stimulus.ts',   // сама дверь: `damageActor`
  'systems/damage.ts',            // обвал: автора нет
  'systems/needs.ts',             // голод и жажда
  'systems/cell_hazards.ts',      // газ и радиация: бегут от МЕСТА, не от лица
  'systems/samosbor.ts',          // свечение маронария и белый туман
  'systems/rail_trains.ts',       // поезд
  'systems/monster_armor.ts',     // считает, не применяет
  'systems/monster_traits.ts',    // считает, не применяет
  'systems/alife.ts',             // восстановление записи
  'systems/online_protocol.ts',   // сетевая синхронизация
  'systems/debug.ts',
]);
const damageDoorHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  if (DAMAGE_DOOR_ALLOWED.has(srcRel)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Вычитание здоровья у чужой сущности. Присваивание не ловим: им и лечат.
    if (/\b(?:target|victim|e|entity|other|npc|monster|host|actor)\.hp\s*(?:-=|=\s*Math\.max\(0,\s*[a-zA-Z_$][\w$.]*\.hp\s*-)/.test(line)) {
      damageDoorHits.push(`${srcRel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}
/* Осталось перевести СЕМЬ. Пять — доводка: рукопашная и рывок монстров,
 * рукопашная игрока, попадание снаряда и AoE-взрыв; жертве они сообщают, но
 * расходятся с дверью в частностях (рукопашная пира не начисляет штраф
 * отношениям и минует отладочное бессмертие, рывок Ржавника минует врождённую
 * броню монстров). Ещё два — самоурон Трескотника, и это ОТДЕЛЬНЫЙ КЛАСС, а не
 * долг: бьющий и есть жертва, сообщать некому. Число только вниз.
 * 12 → 11 (2026-08-23): снят скрытый hitscan `npcApplyDistantRangedDamage` —
 * шестой путь урона, недостижимый из игры (единственный вызов боя шёл с
 * `visualProjectiles: true`).
 * 11 → 8 (2026-08-23): белый список адресовал дверь как `systems/combat.ts`, а
 * живёт она в `systems/combat_stimulus.ts`, поэтому СОБСТВЕННАЯ строка двери
 * годами считалась нарушением (проверено воспроизведением этой регулярки по
 * всему `src/`: 16 совпадений). Плюс сняты два запасных пути без состояния в
 * `slimevik.ts` и `gnilushka.ts`: они дублировали то, что дверь и так умеет —
 * она принимает отсутствующее состояние сама, — но делали это хуже, без памяти
 * удара, из-за чего жертва не отвечала.
 * 8 → 7 (2026-08-23): пар моста Парителя переведён на дверь с источником
 * `environment`. Это единственное из мест, где консолидация дала НОВОЕ
 * поведение, а не гигиену: Паритель умирал без добычи, без крови и без
 * обработки смерти, а соседние твари не получали повода уйти с горячей клетки.
 * Решение владельца: «баг — перевести на единую дверь». */
const DAMAGE_DOOR_BASELINE = 7;
if (damageDoorHits.length > DAMAGE_DOOR_BASELINE) {
  failures.push(`Урон мимо двери: ${damageDoorHits.length} мест снимают здоровье напрямую, разрешено ${DAMAGE_DOOR_BASELINE}.`);
  failures.push('    Здоровье актору снимает `damageActor` (systems/combat_stimulus.ts) — он же сообщает жертве, кто ударил.');
  for (const h of damageDoorHits) failures.push(`    ${h}`);
} else if (damageDoorHits.length < DAMAGE_DOOR_BASELINE) {
  notes.push(`Урон мимо двери: ${damageDoorHits.length} (было ${DAMAGE_DOOR_BASELINE}). Опусти DAMAGE_DOOR_BASELINE.`);
}

/* ── Проверка: смерть сущности мимо единого пути ────────────────── *
 * `alive = false` присваивали в 63 местах, и узнать о смерти было неоткуда —
 * её приходилось ИСКАТЬ. Индекс сущностей платил за это полным обходом статики
 * каждый кадр: 9795 сущностей на жилом этаже ради события раз в несколько
 * секунд, 402 мкс на кадр. Теперь смерть проходит через `killEntity`
 * (systems/entity_death.ts), который двигает эпоху, и обход ждёт её сдвига.
 *
 * Пропущенное место не падает и не шумит: подобранный предмет останется в
 * бакете навсегда, и наткнуться на призрак можно только в игре. Поэтому
 * механическая проверка, а не дисциплина. Число только вниз. */
const ENTITY_DEATH_OWNER = 'systems/entity_death.ts';
const entityDeathHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  if (srcRel === ENTITY_DEATH_OWNER) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/\.alive\s*=\s*false/.test(line)) {
      entityDeathHits.push(`${srcRel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}
const ENTITY_DEATH_BASELINE = 0;
if (entityDeathHits.length > ENTITY_DEATH_BASELINE) {
  failures.push(`Смерть мимо единого пути: ${entityDeathHits.length} мест гасят alive напрямую, разрешено ${ENTITY_DEATH_BASELINE}.`);
  failures.push('    Сущность убивает `killEntity` (systems/entity_death.ts) — он же двигает эпоху смертей для индекса.');
  for (const h of entityDeathHits) failures.push(`    ${h}`);
}

/* ── Проверка 4: мёртвое координатное пространство этажей ──────── */
// Канон — числовой z из DESIGN_FLOOR_ROUTES: министерство 30, квартиры 14,
// жилой 0, коллекторы -26, ад -36, пустота -50. Прошлая схема кодировала те же
// шесть тем как 30/60/100/140/180/200 и росла с глубиной. Её удалили, но 134
// контентных места продолжали публиковать мёртвые ключи, так что события,
// слухи и планы A-Life указывали на несуществующие этажи, а перевёрнутые
// диапазоны (`z < 100`) молча ловили не те этажи. Схема пережила собственное
// удаление ровно потому, что ничто не мешало ей вернуться — теперь мешает.
// 30 не в списке: у министерства канон совпал со старым ключом.
const LEGACY_FLOOR_KEYS = [60, 100, 140, 180, 200];
const legacyZHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const key of LEGACY_FLOOR_KEYS) {
      // Только z-контекст: те же числа законны как радиус, hp или процент.
      const asValue = new RegExp(`\\bz\\s*[:=]\\s*${key}\\b`);
      const asCompare = new RegExp(`\\bz\\s*(===|!==|>=|<=|>|<)\\s*${key}\\b`);
      if (asValue.test(line) || asCompare.test(line)) {
        legacyZHits.push(`${srcRel}:${i + 1}  ${line.trim().slice(0, 90)}`);
        break;
      }
    }
  });
}
if (legacyZHits.length) {
  failures.push(`Мёртвые координаты этажей: ${legacyZHits.length} мест используют ключи ${LEGACY_FLOOR_KEYS.join('/')}.`);
  failures.push('    Канон: 60→14, 100→0, 140→-26, 180→-36, 200→-50 (см. DESIGN_FLOOR_ROUTES).');
  for (const h of legacyZHits) failures.push(`    ${h}`);
}

/* ── Проверка 4.1: связи между пакетами этажей ──────────────────── */
// Этаж — замкнутый DOD-субмодуль: своя геометрия, свои личности, свой контент.
// Между пакетами этажей связей нет вообще. Единственное исключение —
// gen/design_floors/, это реестр маршрута, он обязан знать всех.
// Корневые файлы gen/*.ts (shared, entity_ids, floor_manifest, plot_npc_spawn,
// log) — общая инфраструктура и под правило не попадают: инвариант генерации
// ставится ОДИН раз, а не копируется по 51 этажу.
// Замерено 2026-08-24: правило нарушали 9 импортов, и все девять оказались
// одним и тем же дефектом — файл лежал не в том этаже, где спавнится его
// контент (толкучка и больничный карантин строились на жилом из чужих папок,
// ошибочная линия метро — на коллекторах, Мухин объявлял домом жилой). Шесть
// переносов закрыли все девять, ни одна клетка мира не изменилась.
const FLOOR_PACKAGE_REGISTRY = 'design_floors';
const genRoot = path.join(srcRoot, 'gen');
const floorPackages = new Set(
  fs.readdirSync(genRoot).filter((name) => fs.statSync(path.join(genRoot, name)).isDirectory()),
);
const floorEdges = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  if (!srcRel.startsWith('gen/')) continue;
  const owner = srcRel.slice(4).split('/')[0];
  if (!floorPackages.has(owner) || owner === FLOOR_PACKAGE_REGISTRY) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:from\s+|^\s*import\s+|require\()['"]([^'"]+)['"]/gm)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = path.relative(genRoot, path.resolve(path.dirname(file), spec))
      .replaceAll(path.sep, '/');
    if (target.startsWith('..')) continue;
    const targetPackage = target.split('/')[0];
    if (targetPackage === owner || !floorPackages.has(targetPackage)) continue;
    floorEdges.push(`${srcRel}  →  gen/${targetPackage}  (${spec})`);
  }
}
if (floorEdges.length) {
  failures.push(`Связи между пакетами этажей: ${floorEdges.length}. Допускается ровно 0.`);
  failures.push('    Этаж — замкнутый субмодуль. Если модуль нужен чужому этажу, он лежит');
  failures.push('    не там: перенеси файл на тот этаж, где спавнится его контент.');
  for (const h of floorEdges) failures.push(`    ${h}`);
}

/* ── Проверка 3: длина функции ─────────────────────────────────── */
const longFunctions = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);

  const visit = (node) => {
    const isFn = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)
      || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
    if (isFn && node.body && ts.isBlock(node.body)) {
      const start = sf.getLineAndCharacterOfPosition(node.body.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.body.getEnd()).line;
      const len = end - start + 1;
      if (len > MAX_FUNCTION_LINES) {
        const name = node.name?.getText(sf) ?? '<анонимная>';
        longFunctions.push({ where: `${rel(file)}:${start + 1}`, name, len });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
longFunctions.sort((a, b) => b.len - a.len);

if (longFunctions.length > LONG_FUNCTION_BASELINE) {
  failures.push(`Длина функции: ${longFunctions.length} функций длиннее ${MAX_FUNCTION_LINES} строк, разрешено ${LONG_FUNCTION_BASELINE}.`);
  for (const f of longFunctions.slice(0, 10)) failures.push(`    ${f.where}  ${f.name} — ${f.len}`);
} else if (longFunctions.length < LONG_FUNCTION_BASELINE) {
  notes.push(`Длина функции: ${longFunctions.length} (было ${LONG_FUNCTION_BASELINE}). Опусти LONG_FUNCTION_BASELINE.`);
}

/* ── Итог ─────────────────────────────────────────────────────── */
if (process.argv.includes('--report')) {
  console.log('Обратные рёбра между слоями:');
  for (const [k, v] of [...edgeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)}  ${k}`);
    for (const e of edgeExamples.get(k)) console.log(`        ${e}`);
  }
  console.log(`\nMath.random вне core/rand.ts: ${randomHits.length}`);
  for (const h of randomHits) console.log(`        ${h}`);
  console.log(`\nФункций длиннее ${MAX_FUNCTION_LINES} строк: ${longFunctions.length}`);
  for (const f of longFunctions.slice(0, 20)) console.log(`        ${f.where}  ${f.name} — ${f.len}`);
}

for (const n of notes) console.log(`↓ ${n}`);
if (failures.length) {
  console.error('\nИнварианты нарушены:\n');
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`Инварианты в порядке: слои, цикл ${runtimeCycle}, Math.random (${randomHits.length}), нумерация сущностей (0), личность по alifeId (0), урон мимо двери (${damageDoorHits.length}), смерть мимо пути (${entityDeathHits.length}), длина функций (${longFunctions.length} > ${MAX_FUNCTION_LINES}), мёртвые координаты этажей (0), связи между этажами (0).`);

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
const LONG_FUNCTION_BASELINE = 20;

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

/* Разбор AST общий на весь скрипт: файл читается и парсится ОДИН раз, дальше
 * его берут и проверка урона, и запертые двери, и длина функций. */
const astCache = new Map();
function sourceFileFor(file) {
  let sf = astCache.get(file);
  if (!sf) {
    sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    astCache.set(file, sf);
  }
  return sf;
}

/* ── Проверка 3.2: урон мимо единой двери ───────────────────────── */
// Здоровье актору снимает `damageActor` (`systems/combat.ts`) и только он: он
// считает тип и броню, толкает, СООБЩАЕТ ЖЕРТВЕ, кто ударил, начисляет штраф
// отношениям и доводит смерть до общей обработки. Пока двери не было, каждый
// бьющий делал это сам, и половина забывала: `notifyActorDamaged` знали три
// файла из всех, снимавших здоровье, — пси-арсенал игрока бил без автора, а
// гнилушка и слизевик в тишине. Жертва не узнавала, кто её ударил.
//
/* Белый список — не поблажка, а перечень мест, где здоровье не отнимают, а
 * восстанавливают (лечение, загрузка сейва, синхронизация A-Life и сети), плюс
 * счётчики, которые считают, но не применяют.
 *
 * 11 → 7 (2026-08-27): «безавторский урон» перестал быть поводом для поблажки.
 * Обвал, клеточная опасность, поезд и свечение маронария ушли в дверь через
 * `damageActorByEnvironment` (`systems/actor_damage.ts`), потому что отсутствие
 * автора НЕ означает отсутствия брони: химкомплект ОЗК за 16 000 ₽ с био-защитой
 * 70 не мешал кислоте ровно ничем, пока кислота не знала, что она БИО.
 * Оставшееся исключение по природе одно — голод и жажда: у них нет ни автора, ни
 * типа, ни брони, они не удар, а исход.
 *
 * 8 → 9 (2026-08-27, прозрение регулярки): добавлен `data/items.ts`. Четыре
 * функции применения предмета берут здоровье как ЦЕНУ добровольного действия
 * (тухлая еда, снотворное, вскрытая синяя проба) — и войти в дверь не могут в
 * принципе: `data/` не имеет права импортировать `systems/`, это первый
 * инвариант этого же скрипта. Класс тот же, что у голода: не удар, а исход. */
const DAMAGE_DOOR_ALLOWED = new Set([
  'systems/combat_stimulus.ts',   // сама дверь: `damageActor`
  'systems/actor_damage.ts',      // ядро двери: снятие здоровья и средовой вход
  'systems/needs.ts',             // голод и жажда: не удар, а исход
  'data/items.ts',                // цена применения предмета; слой data/ двери не видит
  'systems/monster_armor.ts',     // считает, не применяет
  'systems/monster_traits.ts',    // считает, не применяет
  'systems/alife.ts',             // восстановление записи
  'systems/online_protocol.ts',   // сетевая синхронизация
  'systems/debug.ts',
]);
/* Створка — не актор: у неё нет ни типа урона, ни брони, ни смерти, а `hp` есть.
 * Разобрать это по типу нечем (проверка читает AST без чекера типов), поэтому
 * получатель назван здесь. Список ровно один и расти не должен. */
const NON_ACTOR_HP_OWNERS = new Set(['door']);

/* Развернуть скобки, `??` и приведения: `(target.hp ?? 0) - dmg` — та же форма,
 * что и `target.hp - dmg`, и до AST она не читалась вовсе. */
function unwrapHpRead(node) {
  let n = node;
  for (;;) {
    if (ts.isParenthesizedExpression(n)) { n = n.expression; continue; }
    if (ts.isAsExpression(n) || ts.isNonNullExpression(n)) { n = n.expression; continue; }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) { n = n.left; continue; }
    return n;
  }
}

/** Есть ли внутри выражения вычитание ИЗ здоровья (`… hp - x`, в любой обёртке). */
function subtractsFromHp(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.MinusToken) {
      const left = unwrapHpRead(n.left);
      if (ts.isPropertyAccessExpression(left) && left.name.text === 'hp') { found = true; return; }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

const damageDoorHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  if (DAMAGE_DOOR_ALLOWED.has(srcRel)) continue;
  const sf = sourceFileFor(file);
  const lines = sf.text.split('\n');
  const visit = (node) => {
    ts.forEachChild(node, visit);
    if (!ts.isBinaryExpression(node)) return;
    const target = node.left;
    if (!ts.isPropertyAccessExpression(target) || target.name.text !== 'hp') return;
    const owner = unwrapHpRead(target.expression);
    if (ts.isIdentifier(owner) && NON_ACTOR_HP_OWNERS.has(owner.text)) return;
    const op = node.operatorToken.kind;
    // Уменьшение здоровья в любой форме: `-=` или присваивание, выведенное
    // вычитанием из собственного `hp`. Прибавление не ловим — им лечат.
    const reduces = op === ts.SyntaxKind.MinusEqualsToken
      || (op === ts.SyntaxKind.EqualsToken && subtractsFromHp(node.right));
    if (!reduces) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    damageDoorHits.push(`${srcRel}:${line}  ${lines[line - 1].trim().slice(0, 90)}`);
  };
  visit(sf);
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
 * Решение владельца: «баг — перевести на единую дверь».
 * 7 → 2 (2026-08-27): переведены все пять оставшихся боевых путей — рукопашная
 * NPC, рукопашная и рывок монстра, рукопашная игрока, попадание снаряда, взрыв,
 * рукопашная ко-оп-пира. Поведение не сдвинуто ни на одну дельту: расхождения
 * между путями сохранены временными шлюзами на входе двери (`relationPenalty`,
 * `relationAttacker`, `factionClash`, `notifyVictim`, `applied`,
 * `reportedDamage`, `deathByCaller`) и закреплены таблицей
 * `tests/damage-door-unification.test.ts`. Снимает эти шлюзы следующий шаг —
 * общий закон «насилие двигает репутацию» (`plot.md` §7).
 * Остаток — ровно тот отдельный класс: самоурон Трескотника, где бьющий и есть
 * жертва и сообщать некому.
 * 2 → 2 при белом списке 11 → 8 (2026-08-27): число не сдвинулось, потому что
 * храповик считает ТОЛЬКО `-=` и `Math.max(0, …)`, а среда писала себе
 * `Math.max(1, hp - amount)` и в счёт не попадала вовсе. Сдвинулся сам список:
 * из него ушли обвал, клеточная опасность, поезд и свечение маронария — четыре
 * файла, где урон теперь идёт через дверь и встречает броню. Двадцать восемь
 * средовых мест в `systems/` и `gen/` названы своим типом (БИО, ОГОНЬ, ЭНЕРГИЯ,
 * КИНЕТИКА, ПСИ) и зовут `damageActorByEnvironment`. Слепое пятно регулярки к
 * `Math.max(1, …)` осталось и записано здесь как незакрытая работа: расширять
 * её нужно вместе с разбором того, что при этом покраснеет.
 *
 * 1 → 9 (2026-08-27, ПРОЗРЕНИЕ): слепое пятно закрыто, число выросло честно.
 * Построчная регулярка видела ровно две формы — `hp -=` и `hp = Math.max(0, hp -`
 * — и потому НЕ ВИДЕЛА ВОВСЕ ни `Math.max(1, hp - amount)` (основной способ, каким
 * среда резала здоровье), ни `(hp ?? 0) - amount`. Проверка переехала на общий
 * разбор AST (`sourceFileFor`, тот же кэш, что у запертых дверей и длины функций)
 * и ловит уменьшение здоровья В ЛЮБОЙ ОБЁРТКЕ: `-=` или присваивание, чьё
 * значение выведено вычитанием из собственного `hp`, сквозь скобки, `??` и `as`.
 * Створка (`door.hp`) исключена по получателю: у неё нет ни брони, ни смерти.
 *
 * 9 → 5 (2026-08-27): ДОЛГА БОЛЬШЕ НЕТ — все четыре места, где урон шёл мимо
 * брони, переведены в дверь, и все четыре доставались ТОЛЬКО игроку.
 *   · обратная тяга огнемёта (`main.ts`) — ОГОНЬ, `damageActorByEnvironment`, и
 *     обжигается теперь любой стрелок вплотную к вспышке: расстояние мерилось от
 *     игрока, поэтому тварь с огнемётом дышала своим пламенем безнаказанно;
 *   · давление самосбора вне рабочей гермы (`samosbor.ts`) — ПСИ: волна перешивает
 *     связность, тем же тактом снимает пси-запас, и держит её пропитка, а не плита;
 *   · колокол Истотита (`samosbor.ts`) — тем же ПСИ и той же дверью;
 *   · запасной путь ПСИ (`psi.ts`) снят ЦЕЛИКОМ вместе с причиной, по которой он
 *     существовал: `damage.ts` спрашивал флаг фазы у `psi.ts` и тем замыкал цикл,
 *     из-за которого дверь приходила инъекцией (`setPsiDamageSink`). Флаг уехал в
 *     лист `psi_state.ts`, цикла нет, дверь берётся прямым импортом, состояние
 *     стало обязательным. Ронять урон молча стало нечему.
 * Ни одно из четырёх мест ПОРОГ выживания игрока себе больше не переписывает:
 * им владеет сама дверь (`lethal`).
 *
 * Пять оставшихся, каждое проверено по коду и ни одно не является долгом:
 *   ОТДЕЛЬНЫЙ КЛАСС (бьющий и есть жертва, сообщать некому) — 1:
 *     · `systems/ai/dash.ts:198` самоурон Трескотника о геометрию.
 *   ЦЕНА ДОБРОВОЛЬНОГО ДЕЙСТВИЯ (не удар, а исход; ни автора, ни типа, ни брони,
 *   пол на 1 — убить не может) — 4:
 *     · `systems/govnyak.ts:209`      `hpCost` дозы;
 *     · `systems/inventory.ts:894`    вскрытие пломбы синей пробы;
 *     · `systems/inventory.ts:915`    уничтожение открытой пробы;
 *     · `systems/maronary_shaving.ts:161` уничтожение бритвы без запаса ПСИ.
 *   Последние четыре в дверь не просятся, но и в белый список файлом не уходят:
 *   `inventory.ts` и `govnyak.ts` слишком велики, чтобы слепнуть на них целиком.
 * Число только вниз. */
const DAMAGE_DOOR_BASELINE = 5;
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
/* ── Проверка: выход из кадрового цикла без перезаказа кадра ─────── *
 * `gameLoop` держит игру живой единственным способом — вызовом
 * `requestAnimationFrame(gameLoop)` в самом конце. Любой ранний `return`
 * ОБЯЗАН заказать кадр сам, иначе выход отсюда останавливает игру навсегда.
 *
 * Так и было: `if (webglContextLost) return;` убивал цикл на первой же потере
 * WebGL-контекста (память GPU, iOS Safari), а собственный комментарий рядом
 * обещал «game logic continues». Код восстановления ниже был недостижим —
 * браузер возвращал контекст, а звать `gameLoop` было уже некому. Второй такой
 * же выход стоял в catch с обещанием «will retry next frame».
 *
 * Ошибка бесшумная: ни исключения, ни строки в консоли — игра просто замирает.
 * Поэтому проверка механическая. Число только вниз. */
const FRAME_LOOP_FILE = path.join(srcRoot, 'main.ts');
const frameLoopDeadReturns = [];
{
  const lines = fs.readFileSync(FRAME_LOOP_FILE, 'utf8').split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^function gameLoop\(/.test(lines[i])) { start = i; break; }
  }
  if (start < 0) {
    failures.push('Кадровый цикл: функция `gameLoop` не найдена в src/main.ts — проверка ослепла.');
  } else {
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
      depth += (lines[i].match(/\{/g) ?? []).length;
      depth -= (lines[i].match(/\}/g) ?? []).length;
      if (/^\s*return\s*;/.test(lines[i])) {
        const window = lines.slice(Math.max(start, i - 3), i + 1).join('\n');
        if (!/requestAnimationFrame\(gameLoop\)/.test(window)) {
          frameLoopDeadReturns.push(`main.ts:${i + 1}  ${lines[i].trim()}`);
        }
      }
      if (depth === 0 && i > start) break;
    }
  }
}
/* Единственный законный: `return` после `finishDeferredLoad()` — она заказывает
 * кадр внутри себя, из вложенного `done()`. Статически это не видно. */
const FRAME_LOOP_DEAD_RETURN_BASELINE = 1;
if (frameLoopDeadReturns.length > FRAME_LOOP_DEAD_RETURN_BASELINE) {
  failures.push(`Кадровый цикл: ${frameLoopDeadReturns.length} выходов не заказывают следующий кадр, разрешён ${FRAME_LOOP_DEAD_RETURN_BASELINE}.`);
  failures.push('    Ранний выход из `gameLoop` обязан звать `requestAnimationFrame(gameLoop)` — иначе игра замирает навсегда, молча.');
  for (const h of frameLoopDeadReturns) failures.push(`    ${h}`);
} else if (frameLoopDeadReturns.length < FRAME_LOOP_DEAD_RETURN_BASELINE) {
  notes.push(`Кадровый цикл: ${frameLoopDeadReturns.length} (было ${FRAME_LOOP_DEAD_RETURN_BASELINE}). Опусти FRAME_LOOP_DEAD_RETURN_BASELINE.`);
}

/* ── Проверка: компилятор ослеплён вручную ──────────────────────── *
 * `// @ts-ignore` гасит ОДНУ строку целиком и навсегда, не говоря, что именно
 * он гасит. Измерено 2026-08-27: под двадцатью шестью такими строками пряталось
 * 53 ошибки типов, и почти все были следами переименований, которым просто
 * заткнули рот.
 *
 * Цена была не гигиеническая. Под одной из них в `loadGame` жила ссылка на
 * несуществующее имя `floor`: загрузка сохранения падала с `ReferenceError`
 * внутри обратного вызова загрузчика, кадр не перезаказывался, и «Продолжить»
 * навсегда вешало игру на экране загрузки. Под другой — `floorDanger`, который
 * разбирал выжженную шкалу этажей и возвращал `undefined` на любом настоящем
 * этаже, из-за чего весь мир населялся первым уровнем.
 *
 * Ловится именно БЛАНКЕТНЫЙ `@ts-ignore`. `@ts-expect-error` — форма честная и
 * под запрет не попадает: она называет код ошибки и сама падает, когда ошибка
 * уходит, то есть не переживает собственную причину. Если тип не нравится —
 * либо почини тип, либо назови ошибку. Число только вниз, и оно уже ноль. */
const TS_IGNORE_BASELINE = 0;
const tsIgnoreHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*\/\/\s*@ts-ignore\b/.test(line)) {
      tsIgnoreHits.push(`${srcRel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}
if (tsIgnoreHits.length > TS_IGNORE_BASELINE) {
  failures.push(`Ослеплённый компилятор: ${tsIgnoreHits.length} строк под @ts-ignore, разрешено ${TS_IGNORE_BASELINE}.`);
  failures.push('    `@ts-ignore` гасит строку целиком и молча. Почини тип, а не сообщение о нём.');
  for (const h of tsIgnoreHits) failures.push(`    ${h}`);
}

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
  /* Разбор и ключ таблицы кодируют шкалу так же, но мимо двух форм ниже они
   * проходили годами: `switch (z) { case 100: ... }` в `floorDanger` и
   * `floorWeights: { [180]: 9.5 }` — пять профилей населения. Оба места
   * выглядели рабочими и на каноническом этаже молча промахивались мимо всех
   * веток. У `case` предмет разбора стоит СТРОКОЙ ВЫШЕ, поэтому его надо
   * помнить: иначе либо слепота, либо ложные срабатывания на чужих `case 100:`. */
  let switchSubjectIsFloor = false;
  lines.forEach((line, i) => {
    const opened = /\bswitch\s*\(\s*([A-Za-z_$][\w$.]*)\s*\)/.exec(line);
    if (opened) switchSubjectIsFloor = /(^|\.)z$|floor|Z$/i.test(opened[1]);
    for (const key of LEGACY_FLOOR_KEYS) {
      // Только z-контекст: те же числа законны как радиус, hp или процент.
      const asValue = new RegExp(`\\bz\\s*[:=]\\s*${key}\\b`);
      const asCompare = new RegExp(`\\bz\\s*(===|!==|>=|<=|>|<)\\s*${key}\\b`);
      const asSwitchCase = new RegExp(`\\bcase\\s+${key}\\s*:`);
      const asTableKey = new RegExp(`\\[\\s*${key}\\s*\\]\\s*:`);
      /* Число, спрятанное за ИМЕНЕМ константы. Так пережили вырезание поля
       * `baseFloor` четыре `const BASE_FLOOR = 60|30|30|100` в пакетах этажей:
       * значение ехало в `z` ящиков и в `targetFloorZ` квестов, и лабиринт с
       * лестницей отправляли игрока на министерство вместо себя. Проверка
       * смотрела на литерал рядом с `z`, а тут литерал стоял рядом с именем.
       * Ловим только имена, которые сами говорят про этаж. */
      const asFloorConst = new RegExp(`\\bconst\\s+[A-Z][A-Z0-9_]*(?:FLOOR|_Z)\\s*=\\s*${key}\\b`);
      if (asValue.test(line) || asCompare.test(line) || asTableKey.test(line) || asFloorConst.test(line)
        || (asSwitchCase.test(line) && switchSubjectIsFloor)) {
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

/* ── Проверка 4.2: запертая дверь без ключа ─────────────────────── *
 * Ключ от створки читает `doorKeyId` (systems/door_state.ts), и пустое поле в
 * данных он трактует как универсальный предмет `key`. Умолчание удобное, его
 * никто не отменяет — но полагаться на него МОЛЧА нельзя: `DoorState.LOCKED`
 * с пустым `keyId` даёт дверь, которая выглядит замком, а открывается первой
 * же связкой, подобранной этажом выше. Разницы между «замок на класс допуска»
 * и «замок ни на что» в коде не видно ни на глаз, ни компилятору: половина
 * генераторов ключ называет, половина полагается на умолчание не думая.
 *
 * Поведение проверка НЕ меняет. Она мешает новому генератору лечь на умолчание,
 * не заметив этого.
 *
 * Ловятся три формы, в которых замок виден статически:
 *   1. литерал спецификации со свойством `state`/`doorState` — у него обязано
 *      быть непустое `keyId`;
 *   2. `DoorState.LOCKED` прямым аргументом вызова — у помощника с параметром
 *      `keyId` соответствующий аргумент обязан быть и быть непустым;
 *   3. присваивание `дверь.state = ...LOCKED...` — ключ обязан называться тут же,
 *      в том же блоке (`door.keyId = ...` строкой ниже — законная и частая форма).
 * Сравнения, `case`, значения по умолчанию у параметров, элементы массивов и
 * ПЕРЕМЕННЫЕ (`const state = ... LOCKED ...`, дальше уезжающие в помощника)
 * не проверяются: разбирать поток значения статически эта проверка не умеет и
 * не должна — на такой глубине она начнёт врать в обе стороны. */
const DOOR_STATE_PROPS = new Set(['state', 'doorState']);
const EMPTY_STRING = /^(''|""|``)$/;
const keyIdParamGlobal = new Map();   // имя функции → индекс параметра keyId | 'ambiguous'
const keyIdParamLocal = new Map();    // файл → та же карта, но только своих функций
const importOrigin = new Map();       // файл → (имя → файл, откуда оно пришло)

function recordKeyIdParam(map, name, params) {
  if (!name || !params) return;
  let idx = -1;
  params.forEach((p, i) => { if (ts.isIdentifier(p.name) && p.name.text === 'keyId') idx = i; });
  if (idx < 0) return;
  const prev = map.get(name);
  map.set(name, prev !== undefined && prev !== idx ? 'ambiguous' : idx);
}

for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const local = new Map();
  keyIdParamLocal.set(srcRel, local);
  // Помощники дверей носят одинаковые имена во всех пакетах этажей (`addDoor`,
  // `connectRoomToPoint`), поэтому по одному имени сигнатуру не найти: надо
  // спросить именно тот модуль, откуда имя импортировано.
  const origin = new Map();
  importOrigin.set(srcRel, origin);
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    let target = path.relative(srcRoot, path.resolve(path.dirname(file), m[2])).replaceAll(path.sep, '/');
    if (target.startsWith('..')) continue;
    if (!fs.existsSync(path.join(srcRoot, `${target}.ts`))) target = `${target}/index`;
    for (const spec of m[1].split(',')) {
      const name = spec.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
      if (name) origin.set(name, `${target}.ts`);
    }
  }
  const collect = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      recordKeyIdParam(keyIdParamGlobal, node.name.text, node.parameters);
      recordKeyIdParam(local, node.name.text, node.parameters);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      recordKeyIdParam(keyIdParamGlobal, node.name.text, node.initializer.parameters);
      recordKeyIdParam(local, node.name.text, node.initializer.parameters);
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFileFor(file));
}

const lockedNoKeyHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const sf = sourceFileFor(file);
  const lines = sf.text.split('\n');
  const local = keyIdParamLocal.get(srcRel);

  // Ключ назван рядом: `door.state = LOCKED; door.keyId = ...` — законная форма.
  const namesKeyNearby = (node) => {
    let scope = node.parent;
    while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
    return !!scope && /\bkeyId\b/.test(scope.getText(sf));
  };

  const report = (node, why) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    lockedNoKeyHits.push(`${srcRel}:${line}  ${why}  ${lines[line - 1].trim().slice(0, 88)}`);
  };

  const inspect = (node) => {
    // Сравнение и `case` разбирают состояние, а не создают его.
    let n = node;
    while (n.parent) {
      const p = n.parent;
      if (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
        || p.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)) return;
      if (ts.isCaseClause(p) || ts.isArrayLiteralExpression(p) || ts.isParameter(p)
        || ts.isVariableDeclaration(p)) return;
      if (ts.isCallExpression(p) || ts.isObjectLiteralExpression(p) || ts.isPropertyAssignment(p)
        || ts.isReturnStatement(p) || ts.isBinaryExpression(p)) break;
      n = p;
    }

    // 3. Присваивание состояния живой двери.
    let assign = node.parent;
    while (assign && !ts.isBinaryExpression(assign) && !ts.isCallExpression(assign)
      && !ts.isObjectLiteralExpression(assign)) assign = assign.parent;
    if (assign && ts.isBinaryExpression(assign) && assign.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (!namesKeyNearby(assign)) report(node, 'состояние выставлено в LOCKED, ключ рядом не назван');
      return;
    }

    // 1 и 2: ближайший владелец — спецификация или вызов.
    let owner = node.parent, arg = node;
    while (owner) {
      if (ts.isObjectLiteralExpression(owner)) break;
      if (ts.isCallExpression(owner) && owner.arguments.includes(arg)) break;
      arg = owner; owner = owner.parent;
    }
    if (!owner) return;

    if (ts.isObjectLiteralExpression(owner)) {
      let holder = node.parent;
      while (holder && holder !== owner && !ts.isPropertyAssignment(holder)) holder = holder.parent;
      if (!holder || holder === owner || !DOOR_STATE_PROPS.has(holder.name.getText(sf))) return;
      const key = owner.properties.find(p => p.name && p.name.getText(sf) === 'keyId');
      if (!key) { report(node, 'спецификация двери без keyId'); return; }
      const init = ts.isPropertyAssignment(key) ? key.initializer.getText(sf) : key.getText(sf);
      if (EMPTY_STRING.test(init.trim())) report(node, "спецификация двери с keyId: ''");
      return;
    }

    const callee = ts.isIdentifier(owner.expression) ? owner.expression.text
      : ts.isPropertyAccessExpression(owner.expression) ? owner.expression.name.text : null;
    const from = callee ? importOrigin.get(srcRel)?.get(callee) : undefined;
    const known = callee
      ? (local.get(callee) ?? keyIdParamLocal.get(from)?.get(callee) ?? keyIdParamGlobal.get(callee))
      : undefined;
    if (typeof known !== 'number') {
      // Помощник ключа не принимает вовсе (или одноимённых помощников много):
      // тогда ключ обязан называться в том же блоке, что и вызов.
      if (!namesKeyNearby(owner)) report(node, `${callee}() не называет ключ`);
      return;
    }
    const keyArg = owner.arguments[known];
    if (!keyArg) { report(node, `${callee}() вызван без аргумента keyId`); return; }
    if (EMPTY_STRING.test(keyArg.getText(sf).trim())) report(node, `${callee}(keyId = '')`);
  };

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && node.getText(sf) === 'DoorState.LOCKED') inspect(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
/* Замерено 2026-08-27: четыре места. Тёмная пересадка запирает каждую четвёртую
 * слепую подсобку спецификацией `DarkMetroOwnedRoomSpec`, в которой поля ключа
 * нет вообще; технический этаж запирает каморку уборщика и клетушку клерка
 * помощниками с умолчанием `keyId = ''`; пломбировщик на жилом ставит СЮЖЕТНУЮ
 * запечатанную створку своим локальным `addDoor`, который ключ не принимает —
 * то есть «печать» снимается любым найденным ключом. Все четыре — авторские
 * решения контентных пакетов, и правит их владелец этажа, а не эта проверка.
 * Число только вниз. */
const LOCKED_DOOR_NO_KEY_BASELINE = 4;
if (lockedNoKeyHits.length > LOCKED_DOOR_NO_KEY_BASELINE) {
  failures.push(`Запертая дверь без ключа: ${lockedNoKeyHits.length} мест, разрешено ${LOCKED_DOOR_NO_KEY_BASELINE}.`);
  failures.push("    Пустой `keyId` у LOCKED означает универсальный предмет `key` — замок, который открывает любая связка.");
  failures.push('    Назови ключ явно (`keyId: \'key\'` — тоже ответ) или не запирай створку.');
  for (const h of lockedNoKeyHits) failures.push(`    ${h}`);
} else if (lockedNoKeyHits.length < LOCKED_DOOR_NO_KEY_BASELINE) {
  notes.push(`Запертая дверь без ключа: ${lockedNoKeyHits.length} (было ${LOCKED_DOOR_NO_KEY_BASELINE}). Опусти LOCKED_DOOR_NO_KEY_BASELINE.`);
}

/* ── Проверка 3: длина функции ─────────────────────────────────── */
const longFunctions = [];
for (const file of files) {
  const sf = sourceFileFor(file);

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
console.log(`Инварианты в порядке: слои, цикл ${runtimeCycle}, Math.random (${randomHits.length}), @ts-ignore (${tsIgnoreHits.length}), нумерация сущностей (0), личность по alifeId (0), урон мимо двери (${damageDoorHits.length}), смерть мимо пути (${entityDeathHits.length}), мёртвые выходы из кадра (${frameLoopDeadReturns.length}), запертая дверь без ключа (${lockedNoKeyHits.length}), длина функций (${longFunctions.length} > ${MAX_FUNCTION_LINES}), мёртвые координаты этажей (0), связи между этажами (0).`);

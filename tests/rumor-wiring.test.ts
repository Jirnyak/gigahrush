/* Замок системы слухов.
 *
 * Ловит КЛАСС «ни один живой путь речи не зовёт отбор слуха», а не конкретную
 * строку проводки. До 2026-09-01 весь вход системы работал (события копились,
 * NPC их видели, `observeRecentRumorEventsForNpc` ставил флаг), а выход —
 * `selectRumorForNpc` / `renderRumor` — не звал никто, кроме тестов: ~580
 * авторских слухов не звучали ни разу, а строку «Слух:» в журнале, которую
 * зажигает `rememberRecentRumorLead` внутри отбора, нельзя было увидеть в игре.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { EntityType, Faction, Occupation, type Entity } from '../src/core/types';
import { RUMORS, UNBUILT_LEAD_ROOM_NAMES } from '../src/data/rumors';
import { generateTalkText } from '../src/systems/dialogue';
import { getRecentRumorLead } from '../src/systems/npc_memory';
import { describeRumorReveal, recordRumorEvent, resetRumorEvents } from '../src/systems/rumor';
import { makeGameState } from './helpers';

/* ── 1. Поведенческий замок: игрок реально слышит слух ─────────── */

test('живой путь речи NPC доносит слух до игрока и зажигает наводку в журнале', () => {
  resetRumorEvents();
  const now = 9_500;
  const npc = makeNpc(9_401);
  const state = makeGameState({ currentZ: -14, time: now });

  assert.equal(recordRumorEvent({
    id: 9_400_001,
    type: 'room_produced_items',
    time: now - 5,
    z: -14,
    zoneId: 12,
    roomId: 44,
    severity: 4,
    privacy: 'public',
    tags: ['production'],
    data: { roomName: 'Брикетный цех: линия концентрата', resourceName: 'Концентрат' },
  }), true);

  const talk = generateTalkText(npc, { state, player: makePlayer(), time: now });

  /* Реплика обязана нести ВТОРОЙ слой — сам слух, а не только настроение. */
  const parts = talk.split('\n\n');
  assert.ok(parts.length >= 2, `реплика без слуха: ${JSON.stringify(talk)}`);
  assert.ok(parts[parts.length - 1].trim().length > 0);

  /* И наводка обязана дойти до строки «Слух:» в журнале заданий. */
  const lead = getRecentRumorLead(now);
  assert.ok(lead, 'отбор слуха не зажёг наводку: строка «Слух:» в журнале мертва');
  assert.equal(lead.z, -14);
  assert.equal(lead.roomName, 'Брикетный цех: линия концентрата');
});

test('слух не повторяется той же личности: работает память отбора, а не свой счётчик', () => {
  resetRumorEvents();
  const now = 12_000;
  const npc = makeNpc(9_402);
  const state = makeGameState({ currentZ: -14, time: now });
  const player = makePlayer();

  assert.equal(recordRumorEvent({
    id: 9_400_002,
    type: 'room_produced_items',
    time: now - 5,
    z: -14,
    zoneId: 3,
    severity: 4,
    privacy: 'public',
    tags: ['production'],
    data: { roomName: 'Цех повторного слуха' },
  }), true);

  const first = generateTalkText(npc, { state, player, time: now });
  assert.ok(first.includes('\n\n'), 'первая реплика должна нести слух');

  /* Тот же миг, та же личность: пауза RUMOR_TALK_COOLDOWN_S закрывает повтор. */
  const second = generateTalkText(npc, { state, player, time: now + 1 });
  assert.ok(!second.includes('\n\n'), `слух повторился той же личности: ${JSON.stringify(second)}`);
});

/* ── 2. Статический замок класса ──────────────────────────────── */

test('отбор слуха вызывается из живого кода, а не только из тестов', () => {
  const callers = sourceFiles().filter(path =>
    path !== 'src/systems/rumor.ts' && readFileSync(path, 'utf8').includes('selectRumorForNpc'));
  assert.ok(
    callers.length > 0,
    'ни один модуль src/ не зовёт selectRumorForNpc: система слухов снова отрезана от игры',
  );
});

/* ── 3. Отсев наводок в никуда ────────────────────────────────── */

test('список непостроенных комнат честен в обе стороны', () => {
  const blob = sourceFiles()
    .filter(path => path !== 'src/data/rumors.ts')
    .map(path => readFileSync(path, 'utf8'))
    .join('\n');

  /* Сторона первая: помеченная комната действительно нигде не строится.
   * Как только её построят, тест краснеет и заставляет снять строку. */
  const built = UNBUILT_LEAD_ROOM_NAMES.filter(name => blob.includes(name));
  assert.deepEqual(built, [], 'комната построена — убери её из UNBUILT_LEAD_ROOMS');

  /* Сторона вторая: новая наводка не может указать на комнату, которой нет. */
  const unlisted: string[] = [];
  const anchorless: string[] = [];
  for (const rumor of RUMORS) {
    const room = rumor.lead?.roomDefId;
    if (room === undefined) continue;
    if (!UNBUILT_LEAD_ROOM_NAMES.includes(room)) {
      if (!blob.includes(room)) unlisted.push(`${rumor.id}: ${room}`);
      continue;
    }
    /* У помеченной наводки обязан остаться другой адрес, иначе снятие имени
     * оставит слух вообще без места и он станет наводкой в пустоту. */
    const lead = rumor.lead!;
    const hasAnchor = lead.z !== undefined
      || lead.zoneHint !== undefined
      || lead.roomType !== undefined
      || lead.itemId !== undefined
      || lead.monsterKind !== undefined;
    if (!hasAnchor) anchorless.push(rumor.id);
  }
  assert.deepEqual(unlisted, [], 'наводка на комнату, которой нет ни в одном генераторе');
  assert.deepEqual(anchorless, [], 'у наводки не осталось адреса после снятия непостроенной комнаты');
});

/* ── 4. Ловушка локализации ───────────────────────────────────── */

/* Замеряется то, что видит игрок, а не словарь: `humanizeTag` собирает имя по
 * словам и непереведённое слово пропускает как есть, поэтому словарь дырявый
 * всегда, а вот до игрока сырое слово доходить не должно никогда. На 2026-09-01
 * непереведёнными остаются 72 из 109 отображаемых тегов — их подсказка молча
 * гаснет; чинится это пополнением TAG_WORDS в `data/rumor_tag_names.ts`, и
 * каждое пополнение само по себе включает подсказку обратно. */
test('слух не печатает игроку сырые латинские id тегов', () => {
  const leaked: string[] = [];
  for (const rumor of RUMORS) {
    const reveals = rumor.reveals === undefined
      ? []
      : Array.isArray(rumor.reveals) ? rumor.reveals : [rumor.reveals];
    for (const reveal of reveals) {
      const shown = describeRumorReveal(reveal);
      /* Имена из словаря тегов обязаны быть русскими целиком. Прочие ветки —
       * авторские имена комнат, предметов и монстров, и там латинский индекс
       * законен («Ремонтная шахта лифта N-089»), поэтому ловится только
       * подпись сырого id: два латинских слова через подчёркивание. */
      const fromTagDictionary = reveal.kind === 'warning'
        || (reveal.kind === 'container' && reveal.name === undefined && reveal.tag !== undefined);
      const bad = fromTagDictionary ? /[A-Za-z]/.test(shown) : /[a-z]{2,}_[a-z]{2,}/.test(shown);
      if (bad) leaked.push(`${rumor.id}: ${shown}`);
    }
  }
  assert.deepEqual(leaked, [], 'русский текст канонический: тег доехал до игрока непереведённым');
});

test('фильтр латиницы гасит подсказку, а не пропускает её мимо себя', () => {
  /* Негативный контроль самого фильтра: непереведённый тег обязан исчезнуть,
   * переведённый — остаться. */
  assert.equal(describeRumorReveal({ kind: 'warning', tag: 'hack_error', confidence: 5 }), '');
  assert.equal(describeRumorReveal({ kind: 'warning', tag: 'samosbor_warning', confidence: 5 }), 'риск самосбора');
});

/* ── helpers ──────────────────────────────────────────────────── */

/** Обход через fs, а не через import: тест обязан остаться в гейтованном
 *  наборе, а импорт по пути с генераторами уводит файл в набор generation. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) out.push(path);
    }
  };
  walk('src');
  return out;
}

function makeNpc(id: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x: 10,
    y: 10,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    name: 'Разносчик слуха',
    faction: Faction.CITIZEN,
    occupation: Occupation.HOUSEWIFE,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
    hp: 100,
    maxHp: 100,
  };
}

function makePlayer(): Entity {
  return {
    id: 0,
    type: EntityType.NPC,
    persistentNpcId: 'player',
    x: 11,
    y: 10,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    name: 'Игрок',
    faction: Faction.PLAYER,
  };
}

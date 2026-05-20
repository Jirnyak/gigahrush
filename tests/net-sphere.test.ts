import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import worker from '../functions/worker';
import { onRequestPost as postChat } from '../functions/api/net/chat';
import { cleanMessage, cleanNickname, type D1Database, type D1PreparedStatement } from '../functions/api/net/common';
import { onRequestPost as postEvent } from '../functions/api/net/event';
import { onRequestPost as postHello } from '../functions/api/net/hello';
import { onRequestGet as getStats } from '../functions/api/net/stats';

const D1_SQL_FILES = [
  'cloudflare/d1/net_sphere.sql',
  'cloudflare/d1/net_sphere_names.sql',
  'cloudflare/d1/net_sphere_market.sql',
];

const EXPECTED_D1_TABLE_COLUMNS: Record<string, string[]> = {
  net_players: [
    'net_gen', 'nickname', 'created_at', 'last_seen_at', 'runs', 'total_samosbors',
    'deaths', 'best_level', 'best_samosbor_count', 'last_floor', 'progress_json',
  ],
  net_sessions: ['session_id', 'net_gen', 'last_seen_at'],
  net_events: ['event_key', 'net_gen', 'nickname', 'type', 'summary', 'created_at', 'payload_json'],
  net_chat: ['id', 'net_gen', 'body', 'created_at'],
  net_market_impulses: ['id', 'net_gen', 'corp_id', 'kind', 'magnitude', 'created_at', 'event_key'],
  net_market_budgets: [
    'identity_key', 'net_gen', 'session_id', 'window_started_at',
    'impulse_count', 'magnitude_sum', 'updated_at',
  ],
  net_market_snapshots: ['corp_id', 'price', 'last_delta', 'volume', 'updated_at'],
};

interface PlayerRow {
  net_gen: string;
  nickname: string;
  created_at: number;
  last_seen_at: number;
  runs: number;
  total_samosbors: number;
  deaths: number;
  best_level: number;
  best_samosbor_count: number;
  last_floor: string;
  progress_json: string;
}

interface SessionRow {
  session_id: string;
  net_gen: string;
  last_seen_at: number;
}

interface ChatRow {
  id: number;
  net_gen: string;
  body: string;
  created_at: number;
}

class FakeStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return this.db.first(this.query, this.values) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> {
    return { results: this.db.all(this.query, this.values) as T[] };
  }

  async run() {
    return this.db.run(this.query, this.values);
  }
}

class FakeD1 implements D1Database {
  players = new Map<string, PlayerRow>();
  sessions = new Map<string, SessionRow>();
  chat: ChatRow[] = [];
  events: Record<string, unknown>[] = [];
  nextChatId = 1;
  nextEventId = 1;

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query);
  }

  first(query: string, values: unknown[]): Record<string, unknown> | null {
    if (query.includes('FROM net_sessions WHERE session_id = ?')) {
      return this.sessions.get(String(values[0])) ?? null;
    }
    if (query.includes('COUNT(*) AS value FROM net_sessions')) {
      const cutoff = Number(values[0]);
      return { value: [...this.sessions.values()].filter(row => row.last_seen_at >= cutoff).length };
    }
    if (query.includes('COUNT(*) AS value FROM net_players')) {
      return { value: this.players.size };
    }
    if (query.includes("COUNT(*) AS value FROM net_events WHERE type = 'samosbor'")) {
      return { value: this.events.filter(row => row.type === 'samosbor').length };
    }
    if (query.includes("COUNT(*) AS value FROM net_events WHERE type = 'death'")) {
      return { value: this.events.filter(row => row.type === 'death').length };
    }
    if (query.includes('FROM net_players') && query.includes('WHERE net_gen = ?')) {
      return this.players.get(String(values[0])) ?? null;
    }
    if (query.includes('FROM net_chat') && query.includes('WHERE net_gen = ?')) {
      const netGen = String(values[0]);
      const rows = this.chat.filter(row => row.net_gen === netGen).sort((a, b) => b.id - a.id);
      return rows[0] ? { created_at: rows[0].created_at } : null;
    }
    throw new Error(`Unhandled fake first query: ${query}`);
  }

  all(query: string, values: unknown[]): Record<string, unknown>[] {
    if (query.includes('FROM net_chat')) {
      const since = Number(values[0] ?? 0);
      const limit = Number(values[1] ?? 60);
      return this.chat
        .filter(row => row.id > since)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(row => ({
          ...row,
          nickname: this.players.get(row.net_gen)?.nickname ?? '',
        }));
    }
    if (query.includes('FROM net_events')) {
      return this.events
        .slice()
        .sort((a, b) => {
          const createdDelta = Number(b.created_at ?? 0) - Number(a.created_at ?? 0);
          return createdDelta || Number(b.id ?? 0) - Number(a.id ?? 0);
        })
        .slice(0, 20);
    }
    throw new Error(`Unhandled fake all query: ${query}`);
  }

  run(query: string, values: unknown[]) {
    if (query.includes('INSERT INTO net_players')) {
      const netGen = String(values[0]);
      const existing = this.players.get(netGen);
      const nickname = String(values[1]);
      const row: PlayerRow = existing ?? {
        net_gen: netGen,
        nickname,
        created_at: Number(values[2]),
        last_seen_at: Number(values[3]),
        runs: 0,
        total_samosbors: 0,
        deaths: 0,
        best_level: Number(values[4]),
        best_samosbor_count: Number(values[5]),
        last_floor: String(values[6]),
        progress_json: String(values[7]),
      };
      row.nickname = nickname || row.nickname;
      row.last_seen_at = Number(values[3]);
      row.best_level = Math.max(row.best_level, Number(values[4]));
      row.best_samosbor_count = Math.max(row.best_samosbor_count, Number(values[5]));
      row.last_floor = String(values[6]) || row.last_floor;
      row.progress_json = String(values[7]);
      this.players.set(netGen, row);
      return { meta: { changes: 1 } };
    }
    if (query.includes('INSERT INTO net_sessions')) {
      this.sessions.set(String(values[0]), {
        session_id: String(values[0]),
        net_gen: String(values[1]),
        last_seen_at: Number(values[2]),
      });
      return { meta: { changes: 1 } };
    }
    if (query.includes('UPDATE net_players SET runs = runs + 1')) {
      const row = this.players.get(String(values[0]));
      if (row) row.runs += 1;
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (query.includes('INSERT INTO net_chat')) {
      const id = this.nextChatId++;
      this.chat.push({
        id,
        net_gen: String(values[0]),
        body: String(values[1]),
        created_at: Number(values[2]),
      });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (query.includes('INSERT OR IGNORE INTO net_events')) {
      const eventKey = String(values[0]);
      if (this.events.some(row => row.event_key === eventKey)) return { meta: { changes: 0 } };
      const id = this.nextEventId++;
      this.events.unshift({
        id,
        event_key: eventKey,
        net_gen: String(values[1]),
        nickname: String(values[2]),
        type: String(values[3]),
        summary: String(values[4]),
        created_at: Number(values[5]),
        payload_json: String(values[6]),
      });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (query.includes('UPDATE net_players SET total_samosbors = total_samosbors + 1')) {
      const row = this.players.get(String(values[0]));
      if (row) row.total_samosbors += 1;
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (query.includes('UPDATE net_players SET deaths = deaths + 1')) {
      const row = this.players.get(String(values[0]));
      if (row) row.deaths += 1;
      return { meta: { changes: row ? 1 : 0 } };
    }
    throw new Error(`Unhandled fake run query: ${query}`);
  }
}

function postRequest(body: Record<string, unknown>): Request {
  return new Request('https://game.test/api/net', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function workerRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://game.test${path}`, init);
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function makeAssets(body = 'asset fallback') {
  const requests: Request[] = [];
  return {
    requests,
    binding: {
      async fetch(request: Request): Promise<Response> {
        requests.push(request);
        return new Response(body, {
          status: 203,
          headers: { 'Cache-Control': 'public, max-age=60' },
        });
      },
    },
  };
}

function identityBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    netGen: 'NET-ABCD-1234',
    sessionId: 'SES-ABCD-1234',
    progress: {
      nickname: 'Жилец',
      floorId: 2,
      floorName: 'Жилая зона',
      samosborCount: 1,
      level: 3,
      xp: 12,
      hp: 90,
      maxHp: 100,
      alive: true,
      gameOver: false,
      gameTime: 123,
      day: 2,
      hour: 8,
      minute: 30,
    },
    ...overrides,
  };
}

function readJsonc(path: string): Record<string, unknown> {
  const text = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(text) as Record<string, unknown>;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, '');
}

function d1SqlFiles(): string[] {
  return readdirSync('cloudflare/d1')
    .filter(file => file.endsWith('.sql'))
    .map(file => `cloudflare/d1/${file}`)
    .sort();
}

function setupSqlFiles(script: string): string[] {
  return [...script.matchAll(/path:\s*'([^']+\.sql)'/g)].map(match => match[1]);
}

function tableNames(sql: string): string[] {
  const names: string[] = [];
  const re = /CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  for (const match of stripSqlComments(sql).matchAll(re)) names.push(match[1]);
  return names;
}

function tableColumns(sql: string, table: string): Set<string> {
  const match = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s+\\(([\\s\\S]*?)\\);`).exec(stripSqlComments(sql));
  assert.ok(match, `${table} must exist in base schema`);
  const columns = match[1]
    .split('\n')
    .map(line => /^([a-z_][a-z0-9_]*)\s/i.exec(line.trim())?.[1] ?? '')
    .filter(Boolean);
  return new Set(columns);
}

function indexNames(sql: string): string[] {
  const names: string[] = [];
  const re = /CREATE INDEX IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s/gi;
  for (const match of stripSqlComments(sql).matchAll(re)) names.push(match[1]);
  return names;
}

function migrationColumns(sql: string): string[] {
  const columns: string[] = [];
  const re = /ALTER TABLE\s+([a-z_][a-z0-9_]*)\s+ADD COLUMN\s+([a-z_][a-z0-9_]*)\s/gi;
  for (const match of stripSqlComments(sql).matchAll(re)) columns.push(`${match[1]}.${match[2]}`);
  return columns;
}

test('Net Sphere Cloudflare config keeps concrete D1 binding and covers every D1 SQL file', () => {
  const pkg = readJsonc('package.json');
  const scripts = pkg.scripts as Record<string, string>;
  assert.equal(scripts['cf:schema'], 'node scripts/cloudflare-net-setup.mjs --schema-only');

  const wrangler = readJsonc('wrangler.jsonc');
  assert.equal(wrangler.main, './functions/worker.ts');
  assert.deepEqual(wrangler.assets, {
    directory: './dist',
    binding: 'ASSETS',
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*'],
  });
  const databases = wrangler.d1_databases as Record<string, string>[];
  const d1 = databases.find(row => row.binding === 'GIGA_NET');
  assert.ok(d1, 'wrangler.jsonc must expose the GIGA_NET D1 binding');
  assert.equal(d1.database_name, 'gigahrush-net');
  assert.match(d1.database_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  const setup = readFileSync('scripts/cloudflare-net-setup.mjs', 'utf8');
  assert.deepEqual(d1SqlFiles(), [...D1_SQL_FILES].sort());
  assert.deepEqual(setupSqlFiles(setup), D1_SQL_FILES);
  assert.match(setup, /schemaOnly/);
  assert.match(setup, /cloudflare\/d1\/net_sphere_names\.sql', mode: 'guarded'/);
  assert.match(setup, /function applyGuardedSqlFile/);
  assert.match(setup, /applySchema\(\);/);
});

test('Net Sphere docs describe migration order, optional D1 tables, and local build boundary', () => {
  const docs = readFileSync('cloudflare.md', 'utf8');

  assert.match(docs, /## D1 Schema Files/);
  D1_SQL_FILES.forEach((path, index) => {
    assert.match(docs, new RegExp(`${index + 1}\\. \`${escapeRegExp(path)}\``));
  });
  assert.match(docs, /net_market_impulses[\s\S]*net_market_budgets[\s\S]*net_market_snapshots[\s\S]*опциональны/);
  assert.match(docs, /локальная игра не требуют Cloudflare credentials/);
});

test('Net Sphere D1 base schema and historical names migration stay aligned with API columns', () => {
  const schema = readFileSync('cloudflare/d1/net_sphere.sql', 'utf8');
  const migration = readFileSync('cloudflare/d1/net_sphere_names.sql', 'utf8');

  assert.deepEqual(tableNames(schema), Object.keys(EXPECTED_D1_TABLE_COLUMNS));
  for (const [table, columns] of Object.entries(EXPECTED_D1_TABLE_COLUMNS)) {
    const existing = tableColumns(schema, table);
    assert.deepEqual(columns.filter(column => !existing.has(column)), [], `${table} columns must match API use`);
  }

  assert.deepEqual(migrationColumns(migration), [
    'net_players.nickname',
    'net_events.nickname',
    'net_events.summary',
  ]);
  for (const column of migrationColumns(migration)) {
    const [table, name] = column.split('.');
    assert.equal(tableColumns(schema, table).has(name), true, `${column} migration must be present in base schema`);
  }
});

test('Net Sphere market migration mirrors canonical market tables and indexes', () => {
  const schema = readFileSync('cloudflare/d1/net_sphere.sql', 'utf8');
  const migration = readFileSync('cloudflare/d1/net_sphere_market.sql', 'utf8');
  const marketTables = ['net_market_impulses', 'net_market_budgets', 'net_market_snapshots'];
  const baseIndexes = new Set(indexNames(schema));

  assert.deepEqual(tableNames(migration), marketTables);
  for (const table of marketTables) {
    assert.deepEqual([...tableColumns(migration, table)], EXPECTED_D1_TABLE_COLUMNS[table]);
    assert.deepEqual([...tableColumns(schema, table)], EXPECTED_D1_TABLE_COLUMNS[table]);
  }
  for (const index of indexNames(migration)) {
    assert.equal(baseIndexes.has(index), true, `${index} migration index must be present in base schema`);
  }
});

test('Net Sphere endpoints return 503 when D1 binding is missing', async () => {
  const response = await getStats({ request: new Request('https://game.test/api/net/stats'), env: {} });

  assert.equal(response.status, 503);
  assert.equal((await responseJson(response)).error, 'D1 binding GIGA_NET is not configured');
});

test('Net Sphere worker routes GET and POST API requests without touching assets', async () => {
  const db = new FakeD1();
  const assets = makeAssets();

  const statsResponse = await worker.fetch(workerRequest('/api/net/stats'), {
    GIGA_NET: db,
    ASSETS: assets.binding,
  });
  const statsData = await responseJson(statsResponse);

  assert.equal(statsResponse.status, 200);
  assert.equal(statsResponse.headers.get('Cache-Control'), 'no-store');
  assert.match(statsResponse.headers.get('Content-Type') ?? '', /^application\/json/);
  assert.equal(statsData.ok, true);

  const helloResponse = await worker.fetch(workerRequest('/api/net/hello', {
    method: 'POST',
    body: JSON.stringify(identityBody()),
  }), {
    GIGA_NET: db,
    ASSETS: assets.binding,
  });
  const helloData = await responseJson(helloResponse);
  const profile = helloData.profile as Record<string, unknown>;

  assert.equal(helloResponse.status, 200);
  assert.equal(helloResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal(helloData.ok, true);
  assert.equal(profile.netGen, 'NET-ABCD-1234');
  assert.equal(assets.requests.length, 0);
});

test('Net Sphere worker returns 405 with Allow header for unsupported API methods', async () => {
  const assets = makeAssets();

  const statsResponse = await worker.fetch(workerRequest('/api/net/stats', { method: 'POST' }), {
    GIGA_NET: new FakeD1(),
    ASSETS: assets.binding,
  });
  const chatResponse = await worker.fetch(workerRequest('/api/net/chat', { method: 'PATCH' }), {
    GIGA_NET: new FakeD1(),
    ASSETS: assets.binding,
  });

  assert.equal(statsResponse.status, 405);
  assert.equal(statsResponse.headers.get('Allow'), 'GET');
  assert.equal(statsResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal((await responseJson(statsResponse)).error, 'method not allowed');

  assert.equal(chatResponse.status, 405);
  assert.equal(chatResponse.headers.get('Allow'), 'GET, POST');
  assert.equal(chatResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal((await responseJson(chatResponse)).error, 'method not allowed');
  assert.equal(assets.requests.length, 0);
});

test('Net Sphere worker returns no-store 404 for unknown Net API paths', async () => {
  const assets = makeAssets();
  const env = { GIGA_NET: new FakeD1(), ASSETS: assets.binding };

  const missingResponse = await worker.fetch(workerRequest('/api/net/missing'), env);
  const baseResponse = await worker.fetch(workerRequest('/api/net'), env);

  assert.equal(missingResponse.status, 404);
  assert.equal(missingResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal((await responseJson(missingResponse)).error, 'not found');

  assert.equal(baseResponse.status, 404);
  assert.equal(baseResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal((await responseJson(baseResponse)).error, 'not found');
  assert.equal(assets.requests.length, 0);
});

test('Net Sphere worker falls back to assets outside Net API even when D1 is absent', async () => {
  const assets = makeAssets('single file game');

  const response = await worker.fetch(workerRequest('/floor/2?from=test'), { ASSETS: assets.binding });
  const body = await response.text();

  assert.equal(response.status, 203);
  assert.equal(body, 'single file game');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
  assert.equal(assets.requests.length, 1);
  assert.equal(new URL(assets.requests[0].url).pathname, '/floor/2');
});

test('Net Sphere worker fails API softly when D1 is missing', async () => {
  const assets = makeAssets();

  const response = await worker.fetch(workerRequest('/api/net/stats'), { ASSETS: assets.binding });
  const data = await responseJson(response);

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(data.error, 'D1 binding GIGA_NET is not configured');
  assert.equal(assets.requests.length, 0);
});

test('Net Sphere sanitizers remove unsafe text and truncate bounded fields', () => {
  assert.equal(cleanMessage('  hi\u0000 <b>`x`\\ ok  '), 'hi bx ok');
  assert.equal(cleanMessage('x'.repeat(200)).length, 160);
  assert.equal(cleanNickname('  Вася\u0000 <tag>`\\  '), 'Вася tag');
  assert.equal(cleanNickname('NET-ABCD-1234'), '');
  assert.equal(cleanNickname('я'.repeat(40)).length, 24);
});

test('Net Sphere hello upserts presence and returns profile stats with fake D1', async () => {
  const db = new FakeD1();
  const response = await postHello({ request: postRequest(identityBody()), env: { GIGA_NET: db } });
  const data = await responseJson(response);
  const stats = data.stats as Record<string, unknown>;
  const profile = data.profile as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(stats.onlineUsers, 1);
  assert.equal(stats.totalPlayers, 1);
  assert.equal(profile.netGen, 'NET-ABCD-1234');
  assert.equal(profile.nickname, 'Жилец');
  assert.equal(profile.runs, 1);
  assert.equal(profile.bestLevel, 3);
});

test('Net Sphere chat stores sanitized body and rate-limits same NET-GEN', async () => {
  const realNow = Date.now;
  const db = new FakeD1();

  Date.now = () => 10_000;
  try {
    const first = await postChat({
      request: postRequest(identityBody({ body: ' привет <script>`\\ ' })),
      env: { GIGA_NET: db },
    });
    const firstData = await responseJson(first);
    const chat = firstData.chat as Record<string, unknown>[];

    assert.equal(first.status, 200);
    assert.equal(chat.at(-1)?.body, 'привет script');
    assert.equal(chat.at(-1)?.nickname, 'Жилец');
    assert.equal(chat.at(-1)?.netGen, undefined);

    Date.now = () => 11_000;
    const second = await postChat({
      request: postRequest(identityBody({ body: 'еще' })),
      env: { GIGA_NET: db },
    });

    assert.equal(second.status, 429);
    assert.equal((await responseJson(second)).error, 'слишком часто');
  } finally {
    Date.now = realNow;
  }
});

test('Net Sphere event summaries stay short and use last progress signal', async () => {
  const realNow = Date.now;
  const db = new FakeD1();

  Date.now = () => Date.UTC(2026, 4, 18, 2, 42);
  try {
    const response = await postEvent({
      request: postRequest(identityBody({
        type: 'death',
        eventKey: 'death:1',
        progress: {
          nickname: 'Жилец',
          floorId: 3,
          floorName: 'Коллекторы',
          samosborCount: 2,
          level: 5,
          xp: 120,
          hp: 0,
          maxHp: 100,
          alive: false,
          gameOver: true,
          gameTime: 12345,
          day: 7,
          hour: 3,
          minute: 5,
        },
      })),
      env: { GIGA_NET: db },
    });
    const data = await responseJson(response);
    const events = data.events as Record<string, unknown>[];

    assert.equal(response.status, 200);
    assert.equal(events[0].summary, 'Жилец умер. Последний сигнал: Коллекторы, д7 03:05.');
  } finally {
    Date.now = realNow;
  }
});

test('Net Sphere public event ids stay unique for duplicate timestamp and type', async () => {
  const realNow = Date.now;
  const db = new FakeD1();
  const now = Date.UTC(2026, 4, 18, 2, 42);

  Date.now = () => now;
  try {
    const first = await postEvent({
      request: postRequest(identityBody({
        netGen: 'NET-AAAA-1111',
        sessionId: 'SES-AAAA-1111',
        type: 'death',
        eventKey: 'NET-AAAA-1111:death:same-ms',
      })),
      env: { GIGA_NET: db },
    });
    const second = await postEvent({
      request: postRequest(identityBody({
        netGen: 'NET-BBBB-2222',
        sessionId: 'SES-BBBB-2222',
        type: 'death',
        eventKey: 'NET-BBBB-2222:death:same-ms',
      })),
      env: { GIGA_NET: db },
    });
    const data = await responseJson(second);
    const stats = data.stats as Record<string, unknown>;
    const events = data.events as Record<string, unknown>[];
    const publicIds = events.map(event => String(event.eventKey));

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(stats.totalDeaths, 2);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map(event => event.createdAt), [now, now]);
    assert.deepEqual(events.map(event => event.type), ['death', 'death']);
    assert.deepEqual(publicIds, ['event:2', 'event:1']);
    assert.equal(new Set(publicIds).size, 2);
    assert.equal(publicIds.some(id => id.includes('NET-')), false);
  } finally {
    Date.now = realNow;
  }
});

test('Net Sphere does not expose NET-GEN-shaped legacy nicknames as public names', async () => {
  const db = new FakeD1();
  const now = Date.UTC(2026, 4, 18, 2, 42);
  db.players.set('NET-LEAK-1234', {
    net_gen: 'NET-LEAK-1234',
    nickname: 'NET-LEAK-1234',
    created_at: now,
    last_seen_at: now,
    runs: 1,
    total_samosbors: 0,
    deaths: 1,
    best_level: 1,
    best_samosbor_count: 0,
    last_floor: 'Жилая зона',
    progress_json: '{}',
  });
  db.chat.push({ id: 1, net_gen: 'NET-LEAK-1234', body: 'эхо', created_at: now });
  db.events.push({
    event_key: 'NET-LEAK-1234:death:legacy',
    nickname: 'NET-LEAK-1234',
    type: 'death',
    summary: '[NET-LEAK-1234] умер старой строкой',
    created_at: now,
  });

  const response = await getStats({
    request: new Request('https://game.test/api/net/stats?netGen=NET-LEAK-1234'),
    env: { GIGA_NET: db },
  });
  const data = await responseJson(response);
  const profile = data.profile as Record<string, unknown>;
  const chat = data.chat as Record<string, unknown>[];
  const events = data.events as Record<string, unknown>[];

  assert.equal(response.status, 200);
  assert.equal(profile.nickname, 'Жилец');
  assert.equal(chat[0].nickname, 'Жилец');
  assert.equal(events[0].nickname, 'Жилец');
  assert.match(String(events[0].eventKey), /^event:death:legacy:/);
  assert.equal(String(events[0].eventKey).includes('NET-LEAK-1234'), false);
  assert.equal(events[0].summary, 'Жилец умер. Последний сигнал: 2026-05-18 02:42 UTC.');
});

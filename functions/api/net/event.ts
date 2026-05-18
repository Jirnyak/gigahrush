import {
  type PagesContext,
  cleanEventKey,
  cleanEventType,
  cleanNetGen,
  cleanSessionId,
  json,
  normalizeProgress,
  readBody,
  readEvents,
  readProfile,
  readStats,
  requireDb,
  upsertPresence,
} from './common';

function eventDate(now: number): string {
  return new Date(now).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function eventSummary(type: 'samosbor' | 'death', nickname: string, now: number): string {
  const name = nickname || 'Жилец';
  if (type === 'death') return `[${name}] умер ${eventDate(now)}`;
  return `[${name}] встретил самосбор ${eventDate(now)}`;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const db = requireDb(context.env);
  if (db instanceof Response) return db;

  try {
    const body = await readBody(context.request);
    const netGen = cleanNetGen(body.netGen);
    const sessionId = cleanSessionId(body.sessionId);
    const type = cleanEventType(body.type);
    const eventKey = cleanEventKey(body.eventKey);
    if (!netGen || !sessionId || !type || !eventKey) return json({ error: 'bad event' }, 400);

    const now = Date.now();
    const progress = normalizeProgress(body.progress);
    await upsertPresence(db, netGen, sessionId, progress, now);
    const summary = eventSummary(type, progress.nickname, now);

    const result = await db.prepare(`
      INSERT OR IGNORE INTO net_events (event_key, net_gen, nickname, type, summary, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(eventKey, netGen, progress.nickname, type, summary, now, JSON.stringify(progress)).run();

    if ((result.meta?.changes ?? 0) > 0) {
      if (type === 'samosbor') {
        await db.prepare('UPDATE net_players SET total_samosbors = total_samosbors + 1 WHERE net_gen = ?')
          .bind(netGen)
          .run();
      } else {
        await db.prepare('UPDATE net_players SET deaths = deaths + 1 WHERE net_gen = ?')
          .bind(netGen)
          .run();
      }
    }

    const [stats, profile, events] = await Promise.all([
      readStats(db, now),
      readProfile(db, netGen),
      readEvents(db),
    ]);
    return json({ ok: true, stats, profile, events });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'bad request' }, 400);
  }
}

import {
  type PagesContext,
  cleanMessage,
  cleanNetGen,
  cleanSessionId,
  json,
  normalizeProgress,
  readBody,
  readChat,
  readEvents,
  readProfile,
  readStats,
  requireDb,
  sinceChatIdFromUrl,
  upsertPresence,
} from './common';

const CHAT_COOLDOWN_MS = 2500;

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const db = requireDb(context.env);
  if (db instanceof Response) return db;
  return json({ ok: true, chat: await readChat(db, sinceChatIdFromUrl(context.request)) });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const db = requireDb(context.env);
  if (db instanceof Response) return db;

  try {
    const body = await readBody(context.request);
    const netGen = cleanNetGen(body.netGen);
    const sessionId = cleanSessionId(body.sessionId);
    const message = cleanMessage(body.body);
    if (!netGen || !sessionId || !message) return json({ error: 'bad chat message' }, 400);

    const now = Date.now();
    await upsertPresence(db, netGen, sessionId, normalizeProgress(body.progress), now);

    const last = await db.prepare(`
      SELECT created_at
      FROM net_chat
      WHERE net_gen = ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(netGen).first<{ created_at: number }>();
    if (last && now - Number(last.created_at) < CHAT_COOLDOWN_MS) {
      return json({ error: 'слишком часто' }, 429);
    }

    const inserted = await db.prepare(`
      INSERT INTO net_chat (net_gen, body, created_at)
      VALUES (?, ?, ?)
    `).bind(netGen, message, now).run();

    const sinceChatId = typeof body.sinceChatId === 'number'
      ? Math.max(0, Math.floor(body.sinceChatId))
      : Math.max(0, Number(inserted.meta?.last_row_id ?? 1) - 1);
    const [stats, profile, chat, events] = await Promise.all([
      readStats(db, now),
      readProfile(db, netGen),
      readChat(db, sinceChatId),
      readEvents(db),
    ]);
    return json({ ok: true, stats, profile, chat, events });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'bad request' }, 400);
  }
}

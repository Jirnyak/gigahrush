import {
  type PagesContext,
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
  upsertPresence,
} from './common';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const db = requireDb(context.env);
  if (db instanceof Response) return db;

  try {
    const body = await readBody(context.request);
    const netGen = cleanNetGen(body.netGen);
    const sessionId = cleanSessionId(body.sessionId);
    if (!netGen || !sessionId) return json({ error: 'bad identity' }, 400);

    const now = Date.now();
    const progress = normalizeProgress(body.progress);
    await upsertPresence(db, netGen, sessionId, progress, now);

    const sinceChatId = typeof body.sinceChatId === 'number' ? body.sinceChatId : 0;
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

import {
  INVASION_TTL_MS,
  type PagesContext,
  apiError,
  cleanNetGen,
  cleanSessionId,
  handleApiError,
  json,
  normalizeProgress,
  readBody,
  readChat,
  readEvents,
  readProfile,
  readStats,
  requireDb,
  requireMethod,
  sinceChatIdFromValue,
  upsertPresence,
} from './common';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const methodError = requireMethod(context.request, 'POST');
  if (methodError) return methodError;

  const db = requireDb(context.env);
  if (db instanceof Response) return db;

  try {
    const body = await readBody(context.request);
    const netGen = cleanNetGen(body.netGen);
    const sessionId = cleanSessionId(body.sessionId);
    if (!netGen || !sessionId) return apiError('bad identity', 400);

    const now = Date.now();
    const progress = normalizeProgress(body.progress);
    await upsertPresence(db, netGen, sessionId, progress, now);

    const sinceChatId = sinceChatIdFromValue(body.sinceChatId, 0);
    const [stats, profile, chat, events, invasionRow] = await Promise.all([
      readStats(db, now),
      readProfile(db, netGen),
      readChat(db, sinceChatId),
      readEvents(db),
      db.prepare(`
        SELECT s.invaded_by AS invaded_by, COALESCE(p.nickname, '') AS nickname
        FROM net_sessions s LEFT JOIN net_players p ON p.net_gen = s.invaded_by
        WHERE s.session_id = ? AND s.invaded_by != '' AND s.invaded_at >= ?
      `).bind(sessionId, now - INVASION_TTL_MS).first<{ invaded_by: string; nickname: string }>(),
    ]);
    const invasion = invasionRow ? { by: invasionRow.invaded_by, nickname: invasionRow.nickname } : undefined;
    return json({ ok: true, stats, profile, chat, events, invasion });
  } catch (err) {
    return handleApiError(err);
  }
}

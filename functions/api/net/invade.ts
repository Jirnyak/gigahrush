import {
  INVASION_TTL_MS,
  ONLINE_WINDOW_MS,
  type PagesContext,
  apiError,
  cleanNetGen,
  cleanSessionId,
  handleApiError,
  json,
  readBody,
  requireDb,
  requireMethod,
} from './common';

// Dark-Souls-style invasion matchmaking. The invader polls this endpoint;
// the server marks one random live session as the target. The target learns
// about the mark through its next /hello heartbeat, silently opens a host
// room, and its hosting_room shows up here on a later poll as 'ready'.

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

    // Release stale marks so abandoned invasions free their targets.
    await db
      .prepare("UPDATE net_sessions SET invaded_by = '', invaded_at = 0 WHERE invaded_by != '' AND invaded_at < ?")
      .bind(now - INVASION_TTL_MS)
      .run();

    // An invasion already in flight by this invader?
    const pending = await db
      .prepare('SELECT session_id, hosting_room FROM net_sessions WHERE invaded_by = ? ORDER BY invaded_at DESC LIMIT 1')
      .bind(netGen)
      .first<{ session_id: string; hosting_room: string }>();
    if (pending) {
      if (pending.hosting_room) return json({ ok: true, status: 'ready', roomId: pending.hosting_room });
      return json({ ok: true, status: 'waiting' });
    }

    // Pick a fresh victim: recently seen, not the invader, alive, not claimed.
    const target = await db
      .prepare(`
        SELECT s.session_id AS session_id, s.hosting_room AS hosting_room
        FROM net_sessions s JOIN net_players p ON p.net_gen = s.net_gen
        WHERE s.last_seen_at >= ? AND s.net_gen != ? AND s.session_id != ? AND s.invaded_by = ''
          AND COALESCE(json_extract(p.progress_json, '$.alive'), 0)
          AND NOT COALESCE(json_extract(p.progress_json, '$.gameOver'), 1)
        ORDER BY RANDOM() LIMIT 1
      `)
      .bind(now - ONLINE_WINDOW_MS, netGen, sessionId)
      .first<{ session_id: string; hosting_room: string }>();
    if (!target) return json({ ok: true, status: 'empty' });

    await db
      .prepare('UPDATE net_sessions SET invaded_by = ?, invaded_at = ? WHERE session_id = ?')
      .bind(netGen, now, target.session_id)
      .run();
    if (target.hosting_room) return json({ ok: true, status: 'ready', roomId: target.hosting_room });
    return json({ ok: true, status: 'waiting' });
  } catch (err) {
    return handleApiError(err);
  }
}

import {
  type PagesContext,
  cleanNetGen,
  json,
  readChat,
  readEvents,
  readProfile,
  readStats,
  requireDb,
  sinceChatIdFromUrl,
} from './common';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const db = requireDb(context.env);
  if (db instanceof Response) return db;

  const url = new URL(context.request.url);
  const netGen = cleanNetGen(url.searchParams.get('netGen') ?? '');
  const now = Date.now();
  const [stats, profile, chat, events] = await Promise.all([
    readStats(db, now),
    netGen ? readProfile(db, netGen) : Promise.resolve(null),
    readChat(db, sinceChatIdFromUrl(context.request)),
    readEvents(db),
  ]);
  return json({ ok: true, stats, profile, chat, events });
}

export async function handleJoin(context: any): Promise<Response> {
  const { request } = context;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  
  // For POC, the client can just generate a random room code and share it.
  // We can just return a success indicating the endpoint works.
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function handleWs(context: any): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const roomId = url.searchParams.get('room');
  
  if (!roomId) {
    return new Response('Missing room parameter', { status: 400 });
  }

  // Obtain the Durable Object ID from the roomId string
  const id = env.ONLINE_FLOORS.idFromName(roomId);
  const stub = env.ONLINE_FLOORS.get(id);

  // Pass the request directly to the Durable Object
  return stub.fetch(request);
}

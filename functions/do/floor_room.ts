// @ts-nocheck
export class FloorRoomDO {
  state: DurableObjectState;
  sessions: Map<WebSocket, { slot: number; role: 'host' | 'peer' }>;
  hostWs: WebSocket | null = null;
  nextSlot = 1;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const url = new URL(request.url);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'peer';

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    let slot = 0;
    if (role === 'host') {
      if (this.hostWs) {
        server.close(1008, 'Room already has a host');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.hostWs = server;
      slot = 0;
    } else {
      if (this.nextSlot > 3) {
        server.close(1008, 'Room full');
        return new Response(null, { status: 101, webSocket: client });
      }
      slot = this.nextSlot++;
    }

    this.sessions.set(server, { slot, role });

    server.addEventListener('message', (event) => {
      const session = this.sessions.get(server);
      if (!session) return;

      // Broadcast logic:
      // Host -> Peers
      // Peer -> Host
      if (session.role === 'host') {
        let dataObj: any = null;
        try {
          const dataStr = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
          dataObj = JSON.parse(dataStr);
        } catch (e) {}

        for (const [ws, s] of this.sessions.entries()) {
          if (s.role === 'peer') {
            if (dataObj && dataObj._excludeSlot !== undefined && dataObj._excludeSlot === s.slot) continue;
            if (!dataObj || dataObj._targetSlot === undefined || dataObj._targetSlot === s.slot) {
              try {
                ws.send(event.data);
              } catch (e) {
                // Ignore disconnected peers
              }
            }
          }
        }
      } else {
        if (this.hostWs) {
          try {
            // Append peer slot so the host knows who sent the input
            const dataStr = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
            const data = JSON.parse(dataStr);
            data._peerSlot = session.slot;
            this.hostWs.send(JSON.stringify(data));
          } catch (e) {
            // Ignore format errors or disconnected host
          }
        }
      }
    });

    server.addEventListener('close', () => {
      const session = this.sessions.get(server);
      if (session?.role === 'host') {
        this.hostWs = null;
        // Notify peers that host is gone
        for (const [ws, s] of this.sessions.entries()) {
          if (s.role === 'peer') {
            try {
              ws.send(JSON.stringify({ type: 'host_disconnected' }));
            } catch (e) {}
          }
        }
      } else if (session?.role === 'peer') {
        // Notify host that peer left
        if (this.hostWs) {
          try {
            this.hostWs.send(JSON.stringify({ type: 'peer_disconnected', slot: session.slot }));
          } catch (e) {}
        }
      }
      this.sessions.delete(server);
    });

    // Send initial handshake
    server.send(JSON.stringify({ type: 'welcome', slot, role }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

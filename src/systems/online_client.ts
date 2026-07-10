// ── Online client transport ────────────────────────────────
// Minimal host-relay POC: host simulates, peer is render+input only.
// Messages: peer→host input at 10Hz, host→peer entity sync at 8Hz.

import { type Entity } from '../core/types';

// ── Connection state ──────────────────────────────────────

let ws: WebSocket | null = null;
let currentRoomId: string | null = null;
let isHost = false;
let mySlot: number | undefined;
let messageCallback: ((msg: any) => void) | null = null;
let lastInputSendTime = 0;
let lastHostSyncTime = 0;

const PEER_INPUT_INTERVAL_MS = 100;  // 10 Hz
const HOST_SYNC_INTERVAL_MS = 125;   // 8 Hz

// ── Public queries ────────────────────────────────────────

export function getOnlineSlot(): number | undefined { return mySlot; }
export function isOnlineHost(): boolean { return isHost; }
export function isOnlinePeer(): boolean { return !isHost && isOnlineConnected(); }
export function isOnlineConnected(): boolean { return ws !== null && ws.readyState === WebSocket.OPEN; }
export function getOnlineRoomId(): string | null { return currentRoomId; }

// ── Message handler ───────────────────────────────────────

export function setOnlineMessageHandler(cb: (msg: any) => void) {
  messageCallback = cb;
}

export function sendOnlineMessage(msg: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Peer→Host: throttled input ────────────────────────────

export function maybeSendPeerInput(p: {
  x: number; y: number; angle: number; pitch: number;
  weapon: string; tool: string; sprite: number;
  npcVisualId?: string; sex?: string;
}): void {
  if (isHost) return; // host doesn't send input to itself
  const now = performance.now();
  if (now - lastInputSendTime < PEER_INPUT_INTERVAL_MS) return;
  lastInputSendTime = now;
  sendOnlineMessage({
    type: 'peer_input',
    x: p.x, y: p.y, angle: p.angle, pitch: p.pitch,
    weapon: p.weapon, tool: p.tool, sprite: p.sprite,
    npcVisualId: p.npcVisualId, sex: p.sex,
  });
}

// ── Host→Peers: compact entity sync ──────────────────────

export interface SyncEntity {
  id: number; type: number;
  x: number; y: number; angle: number; pitch: number;
  alive: boolean; hp: number; maxHp: number;
  sprite: number; weapon: string; tool: string;
  name: string; peerSlot?: number;
  sex?: string; npcVisualId?: string;
  faction?: number; staggerTimer?: number;
  speed: number; monsterKind?: number;
}

export function compactEntity(e: Entity): SyncEntity {
  return {
    id: e.id, type: e.type,
    x: +e.x.toFixed(2), y: +e.y.toFixed(2),
    angle: +e.angle.toFixed(3), pitch: +(e.pitch ?? 0).toFixed(3),
    alive: e.alive, hp: e.hp ?? 0, maxHp: e.maxHp ?? 100,
    sprite: e.sprite, weapon: e.weapon || '', tool: e.tool || '',
    name: e.name || '', peerSlot: e.peerSlot,
    sex: e.sex, npcVisualId: e.npcVisualId,
    faction: e.faction, staggerTimer: e.staggerTimer,
    speed: e.speed, monsterKind: e.monsterKind,
  };
}

/** Returns true if it's time to send the next entity sync. */
export function shouldSendHostSync(): boolean {
  if (!isHost) return false;
  const now = performance.now();
  if (now - lastHostSyncTime < HOST_SYNC_INTERVAL_MS) return false;
  lastHostSyncTime = now;
  return true;
}

// ── Room management ───────────────────────────────────────

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export function startOnlineHost(): string {
  if (ws) ws.close();
  const roomId = generateRoomCode();
  currentRoomId = roomId;
  isHost = true;
  connectWs(roomId, 'host');
  return roomId;
}

export function joinOnlinePeer(roomId: string): void {
  if (ws) ws.close();
  currentRoomId = roomId;
  isHost = false;
  connectWs(roomId, 'peer');
}

export function disconnectOnline(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
  currentRoomId = null;
  isHost = false;
  mySlot = undefined;
}

function connectWs(roomId: string, role: 'host' | 'peer') {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/online/v1/ws?room=${roomId}&role=${role}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log(`[online] connected to room ${roomId} as ${role}`);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'welcome') {
        mySlot = data.slot;
        console.log(`[online] slot=${mySlot}, role=${role}`);
        if (role === 'peer') {
          ws?.send(JSON.stringify({ type: 'peer_join' }));
        }
      }
      if (messageCallback) messageCallback(data);
    } catch (e) {
      console.error('[online] bad message', e);
    }
  };

  ws.onclose = () => {
    console.log('[online] disconnected');
    ws = null;
    currentRoomId = null;
    isHost = false;
    mySlot = undefined;
    // Notify game about disconnect
    if (messageCallback) messageCallback({ type: 'disconnected' });
  };

  ws.onerror = (err) => {
    console.error('[online] ws error', err);
  };
}

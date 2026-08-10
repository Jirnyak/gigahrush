// ── Online client transport (protocol v2) ──────────────────
// Host-authoritative model: the host simulates the shared world AND every
// peer actor's owned state (inventory, hp, mag, money, needs, rpg). Peers
// send throttled position moves at 20Hz plus reliable numbered intents;
// the host answers with one host_state packet per sync tick (~8Hz) that
// carries entity sync, per-slot actor echoes, doors, fx and cell patches.

import { type Entity } from '../core/types';
import { nextIntentMsg, resetOnlineProtocolState, type PeerIntent } from './online_protocol';

export const ONLINE_PROTOCOL_VERSION = 2;

// ── Connection state ──────────────────────────────────────

let ws: WebSocket | null = null;
let currentRoomId: string | null = null;
let isHost = false;
let isInvader = false;
let mySlot: number | undefined;
let messageCallback: ((msg: any) => void) | null = null;
let lastMoveSendTime = 0;
let lastHostSyncTime = 0;

const PEER_MOVE_INTERVAL_MS = 50;    // 20 Hz position stream
const HOST_SYNC_INTERVAL_MS = 125;   // 8 Hz host_state packet

// ── Public queries ────────────────────────────────────────

export function getOnlineSlot(): number | undefined { return mySlot; }
export function isOnlineHost(): boolean { return isHost; }
export function isOnlinePeer(): boolean { return !isHost && isOnlineConnected(); }
export function isOnlineInvader(): boolean { return isInvader; }
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

// ── Peer→Host: reliable numbered intent ───────────────────

/** Send a gameplay intent to the host. Returns the assigned sequence number
 *  (0 when not connected as a peer). The peer applies the action optimistically
 *  through its local prediction paths; the host's actor_echo reconciles. */
export function sendPeerIntent(intent: PeerIntent): number {
  if (isHost || !isOnlineConnected()) return 0;
  const msg = nextIntentMsg(intent);
  sendOnlineMessage(msg);
  return msg.seq;
}

// ── Peer→Host: throttled position stream ─────────────────

let _moveGen = 0;  // bumped per move send; host echoes ack for position-snap gating

export function getPeerMoveGen(): number { return _moveGen; }

export function maybeSendPeerMove(p: { x: number; y: number; angle: number; pitch: number }): boolean {
  if (isHost) return false;
  const now = performance.now();
  if (now - lastMoveSendTime < PEER_MOVE_INTERVAL_MS) return false;
  lastMoveSendTime = now;
  sendOnlineMessage({
    type: 'peer_move',
    x: p.x, y: p.y, angle: p.angle, pitch: p.pitch,
    gen: ++_moveGen,
  });
  return true;
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
  spriteScale?: number;
  currentMag?: number; reloading?: boolean; reloadTimer?: number; attackCd?: number;
  speed: number; monsterKind?: number;
  dropDefId?: string; dropCount?: number; dropData?: unknown;
  netGen?: string;
}

export function compactEntity(e: Entity): SyncEntity {
  const drop = e.inventory?.[0];
  return {
    id: e.id, type: e.type,
    x: +e.x.toFixed(2), y: +e.y.toFixed(2),
    angle: +e.angle.toFixed(3), pitch: +(e.pitch ?? 0).toFixed(3),
    alive: e.alive, hp: e.hp ?? 0, maxHp: e.maxHp ?? 100,
    sprite: e.sprite, weapon: e.weapon || '', tool: e.tool || '',
    name: e.name || '', peerSlot: e.peerSlot,
    netGen: e.netGen,
    sex: e.sex, npcVisualId: e.npcVisualId,
    faction: e.faction, staggerTimer: e.staggerTimer,
    spriteScale: e.spriteScale,
    currentMag: e.currentMag, reloading: e.reloading, reloadTimer: e.reloadTimer, attackCd: e.attackCd,
    speed: e.speed, monsterKind: e.monsterKind,
    dropDefId: drop?.defId,
    dropCount: drop?.count,
    dropData: drop?.data,
  };
}

/** Returns true if it's time to send the next host_state packet. */
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
  // net-identity exception (rand.ts policy): room code must be unpredictable/collision-resistant, not deterministic
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export function startOnlineHost(): string {
  if (ws) ws.close();
  const roomId = generateRoomCode();
  currentRoomId = roomId;
  isHost = true;
  isInvader = false;
  connectWs(roomId, 'host');
  return roomId;
}

export function joinOnlinePeer(roomId: string, invader = false): void {
  if (ws) ws.close();
  currentRoomId = roomId;
  isHost = false;
  isInvader = invader;
  connectWs(roomId, 'peer');
}

export function disconnectOnline(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
  currentRoomId = null;
  isHost = false;
  isInvader = false;
  mySlot = undefined;
  _moveGen = 0;
  resetOnlineProtocolState();
}

function connectWs(roomId: string, role: 'host' | 'peer') {
  const isGithubPages = window.location.hostname === 'gigahrush.github.io';
  const host = isGithubPages ? 'gigahrush.bileter.workers.dev' : window.location.host;
  const protocol = isGithubPages || window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${host}/api/online/v1/ws?room=${roomId}&role=${role}`;

  let welcomeReceived = false;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log(`[online] connected to room ${roomId} as ${role}`);
    // Auto-disconnect if server never sends 'welcome' (room doesn't exist)
    setTimeout(() => {
      if (!welcomeReceived && ws && ws.readyState === WebSocket.OPEN) {
        console.warn('[online] no welcome received — room likely does not exist');
        if (messageCallback) messageCallback({ type: 'server_error', reason: 'no_welcome' });
        ws.close();
      }
    }, 5000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'welcome') {
        welcomeReceived = true;
        mySlot = data.slot;
        console.log(`[online] slot=${mySlot}, role=${role}`);
        // peer_join (with the actor import) is sent by the game's welcome
        // handler — the transport layer doesn't know the player entity.
      }
      // Server rejected (room not found, etc.) — auto-disconnect
      if (data.type === 'error') {
        console.warn('[online] server error:', data.reason ?? data);
        if (messageCallback) messageCallback({ type: 'server_error', reason: data.reason ?? 'unknown' });
        ws?.close();
        return;
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
    isInvader = false;
    mySlot = undefined;
    _moveGen = 0;
    resetOnlineProtocolState();
    // Notify game about disconnect
    if (messageCallback) messageCallback({ type: 'disconnected' });
  };

  ws.onerror = (err) => {
    console.error('[online] ws error', err);
  };
}

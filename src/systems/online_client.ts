// ── Online client transport ────────────────────────────────
// Minimal host-relay POC: host simulates shared world, peer owns local body resources.
// Messages: peer→host throttled state/action claims at 20Hz, host-owned interact
// actions immediately, host→peer entity sync at 8Hz.

import { type Entity } from '../core/types';
import { getNetSphereSnapshot } from './net_sphere';

// ── Connection state ──────────────────────────────────────

let ws: WebSocket | null = null;
let currentRoomId: string | null = null;
let isHost = false;
let mySlot: number | undefined;
let messageCallback: ((msg: any) => void) | null = null;
let lastInputSendTime = 0;
let lastHostSyncTime = 0;

const PEER_INPUT_INTERVAL_MS = 50;   // 20 Hz continuous state
const HOST_SYNC_INTERVAL_MS = 125;   // 8 Hz entity sync

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

// ── Peer→Host: immediate host-owned edge action (interact/container/drop) ──

/** Send a one-shot shared-world action that must not be lost to throttling. */
export function sendPeerAction(action: Record<string, unknown>): void {
  if (isHost) return;
  sendOnlineMessage({ type: 'peer_action', ...action });
}

let _peerGen = 0;  // generation counter: bumped on each peer_input send
let _peerActorGen = 0;  // last peer_input gen whose actor payload changed
let _lastPeerActorPayload = '';
export function getPeerGen(): number { return _peerGen; }
export function getPeerActorGen(): number { return _peerActorGen; }
export function notePeerActorState(actor: PeerActorState): void {
  const actorPayload = JSON.stringify(actor);
  if (actorPayload !== _lastPeerActorPayload) {
    _lastPeerActorPayload = actorPayload;
    _peerActorGen = _peerGen + 1;
  }
}

/** Full peer actor state snapshot. Host uses delta-merge: only applies fields
 *  the peer actually changed vs. the previous snapshot, preserving host-side
 *  mutations (monster damage, item pickups) that the peer hasn't seen yet. */
export interface OnlineItemSnapshot {
  defId: string;
  count: number;
  data?: unknown;
}

export interface PeerActorState {
  hp: number; maxHp: number; alive: boolean;
  weapon: string; tool: string; sprite: number;
  spriteScale?: number;
  npcVisualId?: string; sex?: string;
  armorDefId?: string;
  money?: number;
  staggerTimer?: number;
  currentMag?: number;
  reloading?: boolean;
  reloadTimer?: number;
  attackCd?: number;
  inventory?: OnlineItemSnapshot[];
  needs?: { food: number; water: number; sleep: number; pee: number; poo: number };
  rpg?: { level: number; xp: number; attrPoints: number; str: number; agi: number; int: number; psi: number; maxPsi: number };
}

export interface PeerInputActionState {
  fire?: boolean;
  reload?: boolean;
  toolUse?: 'edge' | 'hold';
}

export function maybeSendPeerInput(p: {
  x: number; y: number; angle: number; pitch: number;
  actor: PeerActorState;
  action?: PeerInputActionState;
}): boolean {
  if (isHost) return false; // host doesn't send input to itself
  const now = performance.now();
  if (now - lastInputSendTime < PEER_INPUT_INTERVAL_MS) return false;
  lastInputSendTime = now;
  notePeerActorState(p.actor);
  sendOnlineMessage({
    type: 'peer_input',
    x: p.x, y: p.y, angle: p.angle, pitch: p.pitch,
    actor: p.actor,
    action: p.action,
    gen: ++_peerGen,
    actorGen: _peerActorGen,
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
  syncInventory?: OnlineItemSnapshot[];
  ackPeerGen?: number;  // last processed peer gen — peer skips position snaps until acked
  ackPeerActorGen?: number;  // last processed changed actor payload — peer accepts inventory/combat reconciliation when acked
  netGen?: string;
}

function compactItems(items: Entity['inventory']): OnlineItemSnapshot[] | undefined {
  return items?.map(i => i.data !== undefined
    ? { defId: i.defId, count: i.count, data: i.data }
    : { defId: i.defId, count: i.count });
}

export function compactEntity(e: Entity, ackPeerGen?: number, ackPeerActorGen?: number): SyncEntity {
  const syncInv = e.peerSlot !== undefined ? compactItems(e.inventory) : undefined;
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
    syncInventory: syncInv,
    ackPeerGen,
    ackPeerActorGen,
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
  _peerGen = 0;
  _peerActorGen = 0;
  _lastPeerActorPayload = '';
}

function connectWs(roomId: string, role: 'host' | 'peer') {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/online/v1/ws?room=${roomId}&role=${role}`;

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
        if (role === 'peer') {
          try {
            const count = parseInt(localStorage.getItem('gigahrush_net_sessions_count') || '0', 10);
            localStorage.setItem('gigahrush_net_sessions_count', String(count + 1));
          } catch {}
          const snap = getNetSphereSnapshot();
          let nicknameStr = '';
          try { nicknameStr = localStorage.getItem('gigahrush_player_name') ?? ''; } catch {}
          ws?.send(JSON.stringify({
            type: 'peer_join',
            netGen: snap.netGen,
            nickname: nicknameStr || snap.profile?.nickname,
          }));
        }
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
    mySlot = undefined;
    _peerGen = 0;
    _peerActorGen = 0;
    _lastPeerActorPayload = '';
    // Notify game about disconnect
    if (messageCallback) messageCallback({ type: 'disconnected' });
  };

  ws.onerror = (err) => {
    console.error('[online] ws error', err);
  };
}

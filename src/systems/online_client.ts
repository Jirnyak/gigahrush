// Base online client imports

import { type Entity, W } from '../core/types';
import { type World } from '../core/world';
import { worldForSave, worldFromSave, storableEntity } from './floor_memory';

let ws: WebSocket | null = null;
let currentRoomId: string | null = null;
let isHost = false;
let messageCallback: ((msg: any) => void) | null = null;

export function setOnlineMessageHandler(cb: (msg: any) => void) {
  messageCallback = cb;
}

export function generateOnlineSnapshot(world: World, entities: readonly Entity[]): string {
  const save = worldForSave(world);
  const storedEntities = entities.filter(storableEntity);
  return JSON.stringify({
    type: 'snapshot',
    world: save,
    entities: storedEntities
  });
}

export function applyOnlineSnapshot(data: any): { world: World, entities: Entity[] } | null {
  if (data.type !== 'snapshot' || !data.world) return null;
  const world = worldFromSave(data.world);
  if (!world) return null;
  return { world, entities: data.entities || [] };
}

export function generateOnlineAoi(world: World, entities: readonly Entity[], cx: number, cy: number, radius: number): any {
  const size = radius * 2 + 1;
  const cells = new Uint8Array(size * size);
  const wallTex = new Uint16Array(size * size);
  const floorTex = new Uint16Array(size * size);
  const feature = new Uint8Array(size * size);
  const light = new Uint8Array(size * size);
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = Math.floor(cx) + dx;
      const wy = Math.floor(cy) + dy;
      const widx = world.idx(wx, wy);
      const lidx = (dy + radius) * size + (dx + radius);
      
      cells[lidx] = world.cells[widx];
      wallTex[lidx] = world.wallTex[widx];
      floorTex[lidx] = world.floorTex[widx];
      feature[lidx] = world.features[widx];
      light[lidx] = world.light[widx];
    }
  }

  const aoiEntities = entities.filter(e => {
     if (!e.alive || !storableEntity(e)) return false;
     let edx = Math.abs(e.x - cx);
     let edy = Math.abs(e.y - cy);
     if (edx > W/2) edx = W - edx;
     if (edy > W/2) edy = W - edy;
     return edx <= radius && edy <= radius;
  });

  return {
    type: 'aoi',
    cx: Math.floor(cx),
    cy: Math.floor(cy),
    radius,
    cells: Array.from(cells),
    wallTex: Array.from(wallTex),
    floorTex: Array.from(floorTex),
    feature: Array.from(feature),
    light: Array.from(light),
    entities: aoiEntities,
  };
}

export function applyOnlineAoi(world: World, currentEntities: Entity[], aoi: any): Entity[] {
  const { cx, cy, radius, cells, wallTex, floorTex, feature, light, entities } = aoi;
  const size = radius * 2 + 1;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = cx + dx;
      const wy = cy + dy;
      const widx = world.idx(wx, wy);
      const lidx = (dy + radius) * size + (dx + radius);
      
      world.cells[widx] = cells[lidx];
      world.wallTex[widx] = wallTex[lidx];
      world.floorTex[widx] = floorTex[lidx];
      world.features[widx] = feature[lidx];
      world.light[widx] = light[lidx];
    }
  }
  world.markSurfaceUploadDirty();

  const localPlayer = currentEntities.find(e => e.peerSlot === undefined && e.alive && e.inventory !== undefined);
  
  const merged = entities.filter((e: any) => localPlayer ? e.id !== localPlayer.id : true);
  if (localPlayer) {
    merged.push(localPlayer);
  }
  
  return merged as Entity[];
}

export function sendPeerPosition(player: Entity) {
  sendOnlineMessage({
    type: 'peer_position',
    x: player.x,
    y: player.y,
    angle: player.angle,
    pitch: player.pitch,
    hp: player.hp,
    weapon: player.weapon,
    tool: player.tool,
    npcVisualId: player.npcVisualId,
    sprite: player.sprite,
    staggerTimer: player.staggerTimer,
    sex: player.sex
  });
}

export function sendOnlineMessage(msg: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function getOnlineRoomId(): string | null {
  return currentRoomId;
}

export function isOnlineHost(): boolean {
  return isHost;
}

export function isOnlineConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function startOnlineHost(): string {
  if (ws) {
    ws.close();
  }
  
  // Generate random room ID
  const roomId = 'ROOM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  currentRoomId = roomId;
  isHost = true;
  
  connectWs(roomId, 'host');
  return roomId;
}

export function joinOnlinePeer(roomId: string): void {
  if (ws) {
    ws.close();
  }
  
  currentRoomId = roomId;
  isHost = false;
  
  connectWs(roomId, 'peer');
}

function connectWs(roomId: string, role: 'host' | 'peer') {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/online/v1/ws?room=${roomId}&role=${role}`;
  
  ws = new WebSocket(url);
  
  ws.onopen = () => {
    console.log(`Connected to room ${roomId} as ${role}`);
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'welcome') {
        console.log('Welcome to room, assigned slot:', data.slot);
      }
      if (messageCallback) {
        messageCallback(data);
      }
    } catch (e) {
      console.error('Failed to parse WS message', e);
    }
  };
  
  ws.onclose = () => {
    console.log('WS connection closed');
    ws = null;
    currentRoomId = null;
    isHost = false;
  };
  
  ws.onerror = (err) => {
    console.error('WS error', err);
  };
}

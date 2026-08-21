import { type Entity, EntityType, msg } from '../core/types';
import { Spr } from '../entities/sprite_index';
import { canSpawnEntityType } from './entity_limits';
import { SURFACE_FLAG_CHALK_MAP, type World } from '../core/world';
import { paintSurfacePixel } from './surface_marks';
import { rng } from '../core/rand';
import { registerDebugCommand } from './debug_registry';

export const CHALK_ITEM_ID = 'chalk';
const CHALK_PIXEL_ALPHA = 235;

export interface ChalkItemData {
  dur?: number;
  rgb?: [number, number, number];
}

function colorByte(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(255, Math.floor(n)));
}

function randomVisibleByte(): number {
  return 32 + Math.floor(rng() * 224);
}

export function randomChalkRgb(): [number, number, number] {
  return [randomVisibleByte(), randomVisibleByte(), randomVisibleByte()];
}

export function chalkRgbFromData(data: unknown): [number, number, number] | null {
  if (!data || typeof data !== 'object') return null;
  const rgb = (data as Partial<ChalkItemData>).rgb;
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const r = colorByte(rgb[0]);
  const g = colorByte(rgb[1]);
  const b = colorByte(rgb[2]);
  return r === null || g === null || b === null ? null : [r, g, b];
}

export function createChalkItemData(maxDurability: number): ChalkItemData {
  return {
    dur: Math.max(0, Math.floor(maxDurability)),
    rgb: randomChalkRgb(),
  };
}

export function ensureChalkItemData(slot: { data?: unknown }, maxDurability: number): ChalkItemData {
  const src = slot.data && typeof slot.data === 'object' ? slot.data as Partial<ChalkItemData> : {};
  const dur = Number.isFinite(Number(src.dur))
    ? Math.max(0, Math.min(maxDurability, Number(src.dur)))
    : Math.max(0, Math.floor(maxDurability));
  const rgb = chalkRgbFromData(src) ?? randomChalkRgb();
  const data: ChalkItemData = { dur, rgb };
  slot.data = data;
  return data;
}

export function drawEquippedChalkPixel(world: World, player: Entity, maxDurability: number): boolean {
  const slot = (player.inventory ?? []).find(item => item.defId === CHALK_ITEM_ID);
  if (!slot) return false;
  const data = ensureChalkItemData(slot, maxDurability);
  const [r, g, b] = data.rgb ?? randomChalkRgb();
  if (!paintSurfacePixel(world, player.x, player.y, r, g, b, CHALK_PIXEL_ALPHA)) return false;
  const ci = world.idx(Math.floor(player.x), Math.floor(player.y));
  world.surfaceFlags[ci] |= SURFACE_FLAG_CHALK_MAP;
  return true;
}

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  id: 'spawn_chalk',
  group: 'spawn',
  label: 'спавн мелка',
  run: ({ player, entities, state, nextEntityId }) => {
    if (!canSpawnEntityType(entities, EntityType.ITEM_DROP)) {
      state.msgs.push(msg('[DEBUG] лимит предметов: мелок не заспавнен', state.time, '#f84'));
      return;
    }
    entities.push({
      id: nextEntityId.v++,
      type: EntityType.ITEM_DROP,
      x: player.x + Math.cos(player.angle) * 1.4,
      y: player.y + Math.sin(player.angle) * 1.4,
      angle: 0,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: Spr.ITEM_DROP,
      inventory: [{ defId: CHALK_ITEM_ID, count: 1 }] });
    state.msgs.push(msg('[DEBUG] мелок заспавнен перед игроком', state.time, '#ff0'));
  } });

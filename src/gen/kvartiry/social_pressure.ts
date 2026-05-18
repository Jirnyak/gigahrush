/* ── Bounded social pressure hooks for Kvartiry POIs ─────────── */

import { type Entity, EntityType, Faction, AIGoal } from '../../core/types';
import { World } from '../../core/world';

interface PressurePoi {
  x: number;
  y: number;
  radius: number;
  pressure: number;
}

const KV_SOCIAL_PRESSURE_POIS: PressurePoi[] = [];

export function resetKvSocialPressurePois(): void {
  KV_SOCIAL_PRESSURE_POIS.length = 0;
}

export function registerKvSocialPressurePoi(x: number, y: number, radius: number, pressure: number): void {
  KV_SOCIAL_PRESSURE_POIS.push({ x, y, radius, pressure });
}

export function tryKvSocialPressureUprising(world: World, entities: Entity[]): boolean {
  if (KV_SOCIAL_PRESSURE_POIS.length === 0) return false;
  const poi = KV_SOCIAL_PRESSURE_POIS[(Math.random() * KV_SOCIAL_PRESSURE_POIS.length) | 0];
  if (Math.random() > 0.16 * poi.pressure) return false;

  let converted = 0;
  const maxConverted = 2 + ((Math.random() * 4) | 0);
  for (const e of entities) {
    if (converted >= maxConverted) break;
    if (e.type !== EntityType.NPC || !e.alive || e.faction !== Faction.CITIZEN || e.plotNpcId) continue;
    if (world.dist(e.x, e.y, poi.x, poi.y) > poi.radius) continue;
    e.faction = Faction.WILD;
    if (e.ai) {
      e.ai.goal = AIGoal.GOTO;
      e.ai.tx = poi.x + (Math.random() - 0.5) * 6;
      e.ai.ty = poi.y + (Math.random() - 0.5) * 6;
    }
    converted++;
  }
  return converted > 0;
}

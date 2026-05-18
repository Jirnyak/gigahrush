/* ── Void content manifest ───────────────────────────────────── */

import { type Entity } from '../../core/types';
import { World } from '../../core/world';
import { syncNextEntityId } from '../content_manifest_utils';
import { generateBorrowedLightRule } from './borrowed_light_rule';
import { generateVoidPlotChain } from './plot_chain';
import { generateProtocolChamber } from './protocol_chamber';
import { generateTraceSealProtocol } from './trace_seal_protocol';

export function runVoidContent(
  world: World,
  entities: Entity[],
  nextId: number,
  spawnX: number,
  spawnY: number,
): number {
  const idRef = { v: nextId };
  generateVoidPlotChain(world, entities, idRef, spawnX, spawnY);
  generateProtocolChamber(world, entities, idRef, spawnX, spawnY);
  generateBorrowedLightRule(world, entities, idRef, spawnX, spawnY);
  generateTraceSealProtocol(world, entities, idRef, spawnX, spawnY);
  return syncNextEntityId(entities, nextId);
}

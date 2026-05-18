/* ── Content manifest utilities ─────────────────────────────────
 * Tiny helpers shared by floor manifests. Keep generation order in
 * manifests; keep mechanics in content modules.
 */

import { type Entity } from '../core/types';

export function syncNextEntityId(entities: Entity[], nextId: number): number {
  return entities.reduce((mx, e) => Math.max(mx, e.id), nextId) + 1;
}

import { EntityType } from '../../../core/types';
import { ART_SPRITE_MANIFEST } from '../../../data/art_sprite_manifest';
import { getGeneratedAnimationFramePack } from '../generated_frames';
import { RENDER_ANIMATION_PRIORITY, type RenderAnimationClipDef } from '../types';

export const AUTO_RENDER_ANIMATION_CLIPS: RenderAnimationClipDef[] = [];

for (const row of ART_SPRITE_MANIFEST) {
  if (row.kind !== 'npc' && row.kind !== 'monster') continue;

  const visualIds = row.intendedMappings
    .map(m => (m.type === 'npc_exact' || m.type === 'npc_family' ? m.visualId : null))
    .filter((id): id is string => id !== null);

  const monsterKinds = row.intendedMappings
    .map(m => (m.type === 'monster_kind' ? (m as any).monsterKind : null))
    .filter((id): id is string => id !== null);

  const fallbackPlotNpcIds = row.intendedMappings
    .map(m => (m.type === 'npc_exact' ? (m as any).plotNpcId : null))
    .filter((id): id is string => id !== null);

  if (visualIds.length === 0 && monsterKinds.length === 0 && fallbackPlotNpcIds.length === 0) continue;

  const baseId = row.id;

  function framePackFacts(actionId: string, fallbackFrameCount: number) {
    const packId = `${baseId}_${actionId}`;
    const pack = getGeneratedAnimationFramePack(packId as any);
    if (!pack) {
      return {
        source: { kind: 'staticFallback' as const, frameCount: fallbackFrameCount, fallback: 'static' },
        width: row.width,
        height: row.height,
        exists: false,
      };
    }
    return {
      source: {
        kind: 'framePack' as const,
        framePackId: pack.id,
        frameCount: pack.frameCount,
        width: pack.width,
        height: pack.height,
        fallback: 'static',
      },
      width: pack.width,
      height: pack.height,
      exists: true,
    };
  }

  const walk = framePackFacts('walk', 6);
  const harm = framePackFacts('harm', 3);
  const staticAnim = framePackFacts('static', 1);

  if (walk.exists || harm.exists || staticAnim.exists) {
    const selector: any = {};
    if (visualIds.length > 0) selector.npcVisualId = visualIds;
    if (monsterKinds.length > 0) selector.monsterKind = monsterKinds;
    if (fallbackPlotNpcIds.length > 0) selector.fallbackPlotNpcId = fallbackPlotNpcIds;
    if (row.kind === 'npc') selector.entityType = EntityType.NPC;
    if (row.kind === 'monster') selector.entityType = EntityType.MONSTER;

    if (walk.exists) {
      AUTO_RENDER_ANIMATION_CLIPS.push({
        id: `${baseId}_walk`,
        channel: 'entity_sprite',
        selector,
        trigger: { kind: 'moving' },
        playback: { loop: true, fps: 9, phaseByDistance: true },
        priority: RENDER_ANIMATION_PRIORITY.locomotion,
        source: walk.source,
        anchor: { width: walk.width, height: walk.height, anchorFeet: row.anchorFeet },
      });
    }

    if (harm.exists) {
      AUTO_RENDER_ANIMATION_CLIPS.push({
        id: `${baseId}_harm`,
        channel: 'entity_sprite',
        selector,
        trigger: { kind: 'damaged' },
        playback: { once: true, fps: 12, retriggerCooldownSec: 0.25 },
        priority: RENDER_ANIMATION_PRIORITY.harm,
        source: harm.source,
        anchor: { width: harm.width, height: harm.height, anchorFeet: row.anchorFeet },
      });
    }

    if (staticAnim.exists) {
      AUTO_RENDER_ANIMATION_CLIPS.push({
        id: `${baseId}_static`,
        channel: 'entity_sprite',
        selector,
        trigger: { kind: 'always' },
        playback: { loop: true, fps: 1 },
        priority: RENDER_ANIMATION_PRIORITY.idle,
        source: staticAnim.source,
        anchor: { width: staticAnim.width, height: staticAnim.height, anchorFeet: row.anchorFeet },
      });
    }
  }
}

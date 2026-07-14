import { visualModelDef, type VisualModelId } from '../../data/visual_models';
import { buildMeshTemplate, type MeshTemplate } from './primitives';

export const MAX_MESH_MODEL_CACHE_SIZE = 1024;

const meshTemplateCache = new Map<string, MeshTemplate>();

function cacheKey(modelId: VisualModelId, variantSeed: number): string {
  return `${modelId}:${variantSeed | 0}`;
}

export function getMeshTemplate(modelId: VisualModelId, variantSeed = 0): MeshTemplate {
  const def = visualModelDef(modelId);
  const effectiveSeed = def.variantCount ? (Math.abs(variantSeed) % def.variantCount) : (variantSeed | 0);
  const key = cacheKey(modelId, effectiveSeed);
  const cached = meshTemplateCache.get(key);
  if (cached) return cached;

  const template = buildMeshTemplate(def, effectiveSeed);
  if (meshTemplateCache.size >= MAX_MESH_MODEL_CACHE_SIZE) {
    const firstKey = meshTemplateCache.keys().next().value;
    if (firstKey !== undefined) meshTemplateCache.delete(firstKey);
  }
  meshTemplateCache.set(key, template);
  return template;
}

export function clearMeshModelCache(): void {
  meshTemplateCache.clear();
}

export function meshModelCacheSize(): number {
  return meshTemplateCache.size;
}

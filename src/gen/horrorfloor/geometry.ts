import { World } from '../../core/world';
import { Feature, W } from '../../core/types';

export function blackoutHorrorLights(world: World): void {
  let removed = false;
  for (let i = 0; i < W * W; i++) {
    const feature = world.features[i];
    if (feature === Feature.LAMP || feature === Feature.CANDLE) {
      world.features[i] = Feature.NONE;
      removed = true;
    }
  }
  world.light.fill(0);
  if (removed) world.markFeaturesDirty(false);
}


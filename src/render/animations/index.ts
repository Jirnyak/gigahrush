export * from './registry';
export * from './procedural';
export * from './defs/auto';

import { registerRenderAnimationClips } from './registry';
import { AUTO_RENDER_ANIMATION_CLIPS } from './defs/auto';

registerRenderAnimationClips(AUTO_RENDER_ANIMATION_CLIPS);

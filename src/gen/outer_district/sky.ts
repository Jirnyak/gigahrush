import type { DynamicSkyTexture } from '../../render/webgl';

export interface OuterDistrictSkyProvider extends DynamicSkyTexture {
  update(dt: number): boolean;
}

export function createOuterDistrictSkyProvider(): OuterDistrictSkyProvider {
  const pixels = new Uint32Array(1);
  pixels[0] = 0xFF888888; // ABGR for some gray, but it won't be seen much if there's no ceiling anyway, wait, it IS the ceiling!
  
  return {
    width: 1,
    height: 1,
    pixels,
    ambientTint: { r: 128, g: 128, b: 128 },
    fogTint: { r: 128, g: 128, b: 128 },
    dirty: true,
    update: () => false,
  };
}

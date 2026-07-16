import { getGeneratedArtSprite } from '../src/render/generated_art_sprites';
function spriteHash(sprite: Uint32Array): number {
  let h = 2166136261;
  for (let i = 0; i < sprite.length; i++) {
    h ^= sprite[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
console.log('Olga hash:', spriteHash(getGeneratedArtSprite('olga_dmitrievna')!));

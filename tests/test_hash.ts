import { Faction, Occupation, EntityType, type Entity } from '../src/core/types';
import { generateProceduralEntitySprite } from '../src/entities/procedural_visuals';

function makeNpc(id: number, visualId: string, spriteSeed: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x: 10 + id,
    y: 12,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: Occupation.DOCTOR,
    spriteSeed,
    npcVisualId: visualId || undefined,
    occupation: Occupation.DOCTOR,
    faction: Faction.SCIENTIST,
    isFemale: true,
  };
}

const citizen = makeNpc(4, '', 404);
citizen.npcVisualId = undefined;
citizen.faction = Faction.CITIZEN;
citizen.occupation = Occupation.TURNER;
citizen.sprite = Occupation.TURNER;
citizen.isFemale = false;

function spriteHash(sprite: Uint32Array): number {
  let h = 2166136261;
  for (let i = 0; i < sprite.length; i++) {
    h ^= sprite[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const s = generateProceduralEntitySprite(citizen);
console.log('generated', s ? spriteHash(s) : null);

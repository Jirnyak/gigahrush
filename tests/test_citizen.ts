import { Faction, Occupation } from '../src/core/types';
import { makeNpc } from './helpers';
import { generateProceduralEntitySprite } from '../src/entities/procedural_visuals';
import { getGeneratedArtSprite, spriteHash } from '../src/render/sprites';
import { resolveNpcArtVisualId } from '../src/data/npc_art_visuals';

const citizen = makeNpc(4, '', 404);
citizen.npcVisualId = undefined;
citizen.faction = Faction.CITIZEN;
citizen.occupation = Occupation.TURNER;
citizen.sprite = Occupation.TURNER;
citizen.isFemale = false;

const visualId = resolveNpcArtVisualId({
  faction: citizen.faction,
  occupation: citizen.occupation,
  isFemale: citizen.isFemale,
  age: citizen.age,
  plotNpcId: citizen.id,
});
console.log('Resolved visual ID:', visualId);

const gen = generateProceduralEntitySprite(citizen);
console.log('Procedural Hash:', gen ? spriteHash(gen) : null);

const art = getGeneratedArtSprite('citizen_m_1');
console.log('Art Hash:', art ? spriteHash(art) : null);

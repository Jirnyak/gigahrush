import { resolveNpcArtVisualId } from '../src/data/npc_art_visuals';
import { Faction, Occupation } from '../src/core/types';

console.log('Result: ' + resolveNpcArtVisualId({ faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, isFemale: false, plotNpcId: undefined }));

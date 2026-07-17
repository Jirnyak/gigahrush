import { createEmptyGameState } from '../src/core/world';
import { ensureAlifeState } from '../src/systems/alife';

const state = createEmptyGameState();
const alife = ensureAlifeState(state);
const olga = alife.npcs.find(n => n.name === 'Ольга Дмитриевна');
const barni = alife.npcs.find(n => n.name === 'Барни');
console.log('Olga:', olga?.plotNpcId, olga?.id);
console.log('Barni:', barni?.plotNpcId, barni?.id);

import { makeGameState } from '../tests/helpers';
import { ensureAlifeState } from '../src/systems/alife';
import { getPlotNpcNumericId } from '../src/data/npc_packages';
import { PLOT_NPCS } from '../src/data/plot';

const state = makeGameState();
const alife = ensureAlifeState(state);

console.log('Total NPCs in Alife:', alife.npcs.length);
console.log('Total Plot NPCs:', Object.keys(PLOT_NPCS).length);

for (const name of ['olga', 'yakov', 'barni', 'vanka', 'major_grom', 'rotenbergov', 'f69_accountant_nil']) {
  const numericId = getPlotNpcNumericId(name);
  const alifeRecord = alife.npcs.find(n => n.plotNpcId === numericId);
  console.log(`${name}: numericId=${numericId}, alifeId=${alifeRecord ? alifeRecord.id : 'NOT FOUND'}`);
}

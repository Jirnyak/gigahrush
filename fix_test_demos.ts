import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGameState } from './tests/helpers';
import { ensureAlifeState } from './src/systems/alife';
import { getDemosNpcOnlySocialEdges, DemosSocialRoleId, DEMOS_EDGE_FRIEND } from './src/systems/demos_social';
import { getPlotNpcNumericId } from './src/data/npc_packages';
import './src/data/npc_plot_packages';

const state = makeGameState();
ensureAlifeState(state);

const idOlga = getPlotNpcNumericId('olga');
const idYakov = getPlotNpcNumericId('yakov');

console.log("Olga ID:", idOlga, "Yakov ID:", idYakov);

const olgaToYakov = getDemosNpcOnlySocialEdges(state, idOlga!).find(edge => edge.targetAlifeId === idYakov);
console.log("Edge:", olgaToYakov);

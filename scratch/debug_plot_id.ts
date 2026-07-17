import { getPlotNpcNumericId } from '../src/data/npc_packages';
import '../src/data/npc_plot_packages'; // Ensure they are registered
console.log("od =", getPlotNpcNumericId('od'));
console.log("barni =", getPlotNpcNumericId('barni'));

import { createServerGameState } from '../src/systems/game_state.js';
import { ensureAlifeState, getAlifeNpcRecordSnapshot } from '../src/systems/alife.js';

const state = createServerGameState('debug', 123);
const alife = ensureAlifeState(state);

for (let i = 1; i <= 10; i++) {
  const snap = getAlifeNpcRecordSnapshot(state, i);
  if (snap) {
    console.log(`[alifeId: ${i}] name: ${snap.name}, sex: ${snap.sex}`);
  }
}

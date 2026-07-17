import fs from 'fs';
let code = fs.readFileSync('src/systems/demos_social.ts', 'utf8');

code = code.replace(
  "export function getDemosOutgoingSocialEdges(state: GameState, alifeId: number): readonly DemosSocialEdgeView[] {\n  const player = getDemosRelationToPlayerSlot(state, alifeId);\n  if (!player) return [];\n  return [player, ...getDemosNpcOnlySocialEdges(state, alifeId)];\n}",
  "export function getDemosOutgoingSocialEdges(state: GameState, alifeId: number): readonly DemosSocialEdgeView[] {\n  const player = getDemosRelationToPlayerSlot(state, alifeId);\n  const npcs = getDemosNpcOnlySocialEdges(state, alifeId);\n  if (!player && npcs.length === 0) return [];\n  return player ? [player, ...npcs] : npcs;\n}"
);

fs.writeFileSync('src/systems/demos_social.ts', code);

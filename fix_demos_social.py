import re
file = 'src/systems/demos_social.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("""function findPlotNpcAlifeId(
  state: GameState,
  graph: DemosSocialGraph,
  id: string,
): number | undefined {
  for (let id = 1; id <= graph.total; id++) {
    const snapshot = getAlifeNpcRecordSnapshot(state, id);
    if (snapshot?.id === id) return id;
  }
  return undefined;
}""", """function findPlotNpcAlifeId(
  state: GameState,
  graph: DemosSocialGraph,
  plotNpcId: string,
): number | undefined {
  const numericId = getPlotNpcNumericId(plotNpcId);
  for (let id = 1; id <= graph.total; id++) {
    const snapshot = getAlifeNpcRecordSnapshot(state, id);
    if (snapshot?.plotNpcId === numericId) return id;
  }
  return undefined;
}""")

content = content.replace("""function plotIdMapFromSnapshots(
  snapshots: readonly (AlifeNpcSnapshot | undefined)[],
  total: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (let id = 1; id <= total; id++) {
    const id = snapshots[id]?.id;
    if (id && !out.has(id)) out.set(id, id);
  }
  return out;
}""", """function plotIdMapFromSnapshots(
  snapshots: readonly (AlifeNpcSnapshot | undefined)[],
  total: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (let id = 1; id <= total; id++) {
    const plotNpcId = snapshots[id]?.plotNpcId;
    if (plotNpcId && !out.has(plotNpcId)) out.set(plotNpcId, id);
  }
  return out;
}""")

content = content.replace("export function isSocialGraphOutdated(graph: DemosSocialGraph, alife: AlifeState): boolean {\n  return graph.alifeVersion !== alife.version;", "import { getPlotNpcNumericId } from '../data/npc_packages';\nexport function isSocialGraphOutdated(graph: DemosSocialGraph, alife: AlifeState): boolean {\n  return graph.alifeVersion !== alife.version;")

with open(file, 'w') as f:
    f.write(content)

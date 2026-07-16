import re
file = 'src/data/npc_packages.ts'
with open(file, 'r') as f:
    content = f.read()

new_func = """export function getPlotNpcNumericId(stringId: string): number | undefined {
  const idx = PLOT_NPC_PACKAGES_BY_NUMERIC_ID.findIndex(pack => pack.id === stringId);
  return idx >= 0 ? idx : undefined;
}

export function getPlotNpcStringId(id: number): string | undefined {
  return PLOT_NPC_PACKAGES_BY_NUMERIC_ID[id]?.id;
}"""

content = content.replace("""export function getPlotNpcNumericId(stringId: string): number | undefined {
  const idx = PLOT_NPC_PACKAGES_BY_NUMERIC_ID.findIndex(pack => pack.id === stringId);
  return idx >= 0 ? idx : undefined;
}""", new_func)

with open(file, 'w') as f:
    f.write(content)

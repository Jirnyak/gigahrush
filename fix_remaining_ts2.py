import re

def fix_file(file, replacements):
    with open(file, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(file, 'w') as f:
        f.write(content)

# plot_npc_spawn.ts
fix_file('src/gen/plot_npc_spawn.ts', [
    ("return typeof entity.plotNpcId === 'string';", "return !!entity.id && !!getNpcPackageByPlotNpcId(getPlotNpcStringId(entity.id)!);"),
    ("import { getPlotNpcStringId } from '../data/npc_packages';", "import { getPlotNpcStringId, getNpcPackageByPlotNpcId } from '../data/npc_packages';"),
    ("export function isPlotNpcDynamic(entity: Entity): boolean {\n  return !!entity.id && !!getNpcPackageByPlotNpcId(getPlotNpcStringId(entity.id)!);\n}", "export function isPlotNpcDynamic(entity: Entity): boolean {\n  return !!entity.npcPackageId;\n}")
])

# alife.ts
fix_file('src/systems/alife.ts', [
    ("const recordIndex = alife.npcs.findIndex(record =>\n    record.plotNpcId === getPlotNpcNumericId(String(id))! &&", "const recordIndex = alife.npcs.findIndex(record =>\n    record.plotNpcId === getPlotNpcNumericId(String(entity.id))! &&"),
    ("alife.plotNpcToAlifeMap.get(id)", "alife.plotNpcToAlifeMap.get(getPlotNpcNumericId(id)!)"),
    ("const plotNpcId = typeof id === 'string' ? id : undefined;", "const plotNpcId = typeof id === 'number' && entity.npcPackageId ? id : undefined;"),
    ("alife.plotNpcToAlifeMap.get(String(record.plotNpcId))", "alife.plotNpcToAlifeMap.get(record.plotNpcId!)"),
    ("getPlotNpcNumericId(cleanPlotNpcId)!", "getPlotNpcNumericId(String(id))!")
])

# demos.ts
fix_file('src/systems/demos.ts', [
    ("import { getNpcPackage, NpcPackageDef", "import { getNpcPackageByPlotNpcId, getNpcPackage, NpcPackageDef")
])

# demos_social.ts
fix_file('src/systems/demos_social.ts', [
    ("function findPlotNpcAlifeId(\n  state: GameState,\n  graph: DemosSocialGraph,\n  plotNpcId: string,", "function findPlotNpcAlifeId(\n  state: GameState,\n  graph: DemosSocialGraph,\n  plotNpcId: number,"),
    ("const numericId = getPlotNpcNumericId(String(plotNpcId));", "const numericId = plotNpcId;"),
    ("getPlotNpcNumericId(String(id))!", "id")
])


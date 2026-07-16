import re
file = 'src/gen/plot_npc_spawn.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("    id,\n    type: EntityType.NPC,", "    id: getPlotNpcNumericId(plotNpcId)!,\n    type: EntityType.NPC,")
content = content.replace("    plotNpcId,\n    npcPackageId: pack.id,", "    npcPackageId: pack.id,")
content = content.replace("  return typeof entity.plotNpcId === 'string';", "  return !!entity.id && !!getNpcPackageByPlotNpcId(getPlotNpcStringId(entity.id)!);")
if "getPlotNpcNumericId" not in content[:200]:
    content = "import { getPlotNpcNumericId, getPlotNpcStringId } from '../data/npc_packages';\n" + content

with open(file, 'w') as f:
    f.write(content)

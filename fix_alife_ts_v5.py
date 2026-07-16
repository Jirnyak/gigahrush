import re
file = 'src/systems/alife.ts'
with open(file, 'r') as f:
    content = f.read()

if "getPlotNpcNumericId" not in content[:1000]:
    content = "import { getPlotNpcNumericId, getPlotNpcStringId } from '../data/npc_packages';\n" + content.replace("import { getPlotNpcStringId } from '../data/npc_packages';", "")

content = content.replace("record.id === getPlotNpcNumericId(cleanPlotNpcId)! &&", "record.plotNpcId === id &&")
content = content.replace("record.id === getPlotNpcNumericId(id)!", "record.plotNpcId === id")

with open(file, 'w') as f:
    f.write(content)

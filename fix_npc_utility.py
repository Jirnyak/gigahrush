import re
file = 'src/systems/ai/npc_utility.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("plotNpcId: entity.plotNpcId,", "plotNpcId: getPlotNpcStringId(entity.id),")
content = "import { getPlotNpcStringId } from '../../data/npc_packages';\n" + content

with open(file, 'w') as f:
    f.write(content)

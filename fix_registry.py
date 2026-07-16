import re
file = 'src/render/animations/registry.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("matchesValue(fallbackPlotNpcId, entity.id)", "matchesValue(fallbackPlotNpcId, getPlotNpcStringId(entity.id!))")
content = "import { getPlotNpcStringId } from '../../data/npc_packages';\n" + content

with open(file, 'w') as f:
    f.write(content)


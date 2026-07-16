import re
file = 'src/systems/npc_interaction_options.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("if (npc.id && predicate.ids?.includes(npc.id)) return true;", "if (npc.id && predicate.plotNpcIds?.includes(getPlotNpcStringId(npc.id)!)) return true;")
content = "import { getPlotNpcStringId } from '../data/npc_packages';\n" + content

with open(file, 'w') as f:
    f.write(content)

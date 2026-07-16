import re
file = 'src/data/craft_recipe_sources.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("npcId?: string;", "npcId?: number;")

old_line = "if (source.npcId !== getPlotNpcNumericId(undefined)! && source.npcId !== getPlotNpcNumericId(npc)!.id) return false;"
new_line = "if (source.npcId !== undefined && source.npcId !== npc.id) return false;"
content = content.replace(old_line, new_line)

with open(file, 'w') as f:
    f.write(content)


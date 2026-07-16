import re
file = 'src/render/map_ui.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("const activeKillPlotNpcIds = new Set<string>();", "")
content = content.replace("activeKillPlotNpcIds.clear();", "")
content = content.replace("if (q.targetNpcId !== undefined) activeKillPlotNpcIds.add(q.targetNpcId);", "")
content = content.replace("activeKillPlotNpcIds.size > 0", "False")
content = content.replace("return activeKillAnyMonster || activeKillKinds.size > 0 || activeKillNpcIds.size > 0 || False;", "return activeKillAnyMonster || activeKillKinds.size > 0 || activeKillNpcIds.size > 0;")
content = content.replace("return activeKillNpcIds.has(e.id) || (e.id !== undefined && activeKillPlotNpcIds.has(e.id));", "return activeKillNpcIds.has(e.id!);")

with open(file, 'w') as f:
    f.write(content)

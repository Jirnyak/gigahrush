import re
file = 'src/gen/plot_npc_spawn.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("const entity = plotNpcEntityFromPackage(plotNpcId, x, y, options);", "nextId.v++;\n  const entity = plotNpcEntityFromPackage(plotNpcId, x, y, options);")

with open(file, 'w') as f:
    f.write(content)

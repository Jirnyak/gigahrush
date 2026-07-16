import re
file = 'src/gen/plot_npc_spawn.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("export function plotNpcEntityFromPackage(\n  id: number,\n  plotNpcId: string,\n  x: number,\n  y: number,", "export function plotNpcEntityFromPackage(\n  plotNpcId: string,\n  x: number,\n  y: number,")
content = content.replace("const entity = plotNpcEntityFromPackage(nextId.v, plotNpcId, x, y, options);", "const entity = plotNpcEntityFromPackage(plotNpcId, x, y, options);")

with open(file, 'w') as f:
    f.write(content)

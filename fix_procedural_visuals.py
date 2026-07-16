import re
file = 'src/entities/procedural_visuals.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("plotNpcId: e.id,", "plotNpcId: e.id !== undefined ? String(e.id) : undefined,")
content = content.replace("if (e.id) h = hashText(e.id, h);", "if (e.id) h = hashText(String(e.id), h);")

with open(file, 'w') as f:
    f.write(content)

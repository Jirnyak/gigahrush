import re
file = 'src/systems/alife.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("//   id?: number;", "  id?: number;")
content = content.replace("e.id = getPlotNpcNumericId(pack.id)!", "e.id = getPlotNpcNumericId(pack.id)!")

with open(file, 'w') as f:
    f.write(content)

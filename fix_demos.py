import re
file = 'src/systems/demos.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("return snapshot.id ? getNpcPackageByPlotNpcId(snapshot.id) : undefined;", "return undefined;")

with open(file, 'w') as f:
    f.write(content)

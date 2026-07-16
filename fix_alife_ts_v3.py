import re
file = 'src/systems/alife.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("id: def.id,", "id: getPlotNpcNumericId(def.id),")
content = content.replace("reservedId: reserved.id,", "reservedId: getPlotNpcStringId(reserved.id!),")
content = content.replace("q.targetNpcId === reserved.id", "q.targetNpcId === reserved.id")
content = content.replace("q.targetNpcId === reserved.id", "q.targetNpcId === reserved.id")
content = content.replace("reservedId: string;", "reservedId: string;")

with open(file, 'w') as f:
    f.write(content)

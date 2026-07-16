import re
file = 'src/gen/living/obzh_school.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("e.id === spawn.id", "e.id === getPlotNpcNumericId(spawn.id)!")

with open(file, 'w') as f:
    f.write(content)

import re
import os

files = ['src/systems/quests.ts', 'src/data/plot.ts', 'src/main.ts']
for file in files:
    if not os.path.exists(file): continue
    with open(file, 'r') as f:
        content = f.read()

    # In quests.ts / plot.ts
    content = content.replace("failOnNpcDeathId?: string;", "failOnNpcDeathId?: number;")
    content = content.replace("failOnNpcDeathId: string;", "failOnNpcDeathId: number;")

    # In quests.ts we have `q.failOnNpcDeathId !== plotNpcId`
    content = content.replace("q.failOnNpcDeathId !== plotNpcId", "q.failOnNpcDeathId !== getPlotNpcNumericId(plotNpcId)")

    if file == 'src/main.ts':
        content = content.replace("typeof raw.failOnNpcDeathId === 'string'", "typeof raw.failOnNpcDeathId === 'number'")
        content = content.replace("raw.failOnNpcDeathId.length > 0", "raw.failOnNpcDeathId >= 0")
        content = content.replace("const numId = getPlotNpcNumericId(raw.failOnNpcDeathId)!;", "const numId = raw.failOnNpcDeathId;")

    with open(file, 'w') as f:
        f.write(content)


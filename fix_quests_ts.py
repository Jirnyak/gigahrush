import re
file = 'src/systems/quests.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("  byPlotLive: Map<string, Entity>;\n  byPlotAll: Map<string, Entity>;\n", "")
content = content.replace("failOnNpcDeathId: target.failOnNpcDeathId", "failOnNpcDeathId: target.failOnNpcDeathId ? getPlotNpcStringId(target.failOnNpcDeathId)! : undefined")
content = content.replace("=== target.failOnNpcDeathId", "=== getPlotNpcNumericId(target.failOnNpcDeathId!)")
content = content.replace("const failNpcId = step.failOnNpcDeathId", "const failNpcId = step.failOnNpcDeathId ? getPlotNpcNumericId(step.failOnNpcDeathId) : undefined")
content = content.replace("targetNpcId: step.targetNpcId", "targetNpcId: step.targetNpcId ? getPlotNpcStringId(step.targetNpcId)! : undefined")
content = content.replace("targetNpcId: number;", "targetNpcId?: string;")

with open(file, 'w') as f:
    f.write(content)

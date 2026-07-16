import re
file = 'src/systems/ai/npc_emergency.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("mixStringHash(h, npc.persistentNpcId ?? npc.id ?? npc.name ?? '');", "mixStringHash(h, npc.persistentNpcId ?? String(npc.id ?? npc.name ?? ''));")

with open(file, 'w') as f:
    f.write(content)

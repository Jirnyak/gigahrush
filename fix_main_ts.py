import re
file = 'src/main.ts'
with open(file, 'r') as f:
    content = f.read()

old_block = """  if (typeof raw.failOnNpcDeathId === 'number' && !Number.isNaN(raw.failOnNpcDeathId)) {
//     q.failOnNpcDeathId = clampInt(raw.failOnNpcDeathId, 0, 0, 1_000_000);
  } else if (typeof raw.failOnNpcDeathId === 'number' && raw.failOnNpcDeathId >= 0) {
    const numId = raw.failOnNpcDeathId;
//     if (numId !== undefined) q.failOnNpcDeathId = numId;
  }"""

new_block = """  if (typeof raw.failOnNpcDeathId === 'number' && !Number.isNaN(raw.failOnNpcDeathId)) {
    q.failOnNpcDeathId = clampInt(raw.failOnNpcDeathId, 0, 0, 1_000_000);
  } else if (typeof raw.failOnNpcDeathId === 'string' && raw.failOnNpcDeathId.length > 0) {
    const numId = getPlotNpcNumericId(raw.failOnNpcDeathId);
    if (numId !== undefined) q.failOnNpcDeathId = numId;
  }"""

content = content.replace(old_block, new_block)

with open(file, 'w') as f:
    f.write(content)

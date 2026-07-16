import re

file = 'src/data/plot.ts'
with open(file, 'r') as f:
    content = f.read()

# Replace q.giverId === plotNpcId with q.giverId === getPlotNpcNumericId(plotNpcId)
content = content.replace("q.giverId === plotNpcId", "q.giverId === getPlotNpcNumericId(plotNpcId)")
content = content.replace("step.giverId !== plotNpcId", "step.giverId !== getPlotNpcNumericId(plotNpcId)")
content = content.replace("sq.giverId !== plotNpcId", "sq.giverId !== getPlotNpcNumericId(plotNpcId)")

with open(file, 'w') as f:
    f.write(content)


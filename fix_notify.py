import re
file = 'src/systems/quests.ts'
with open(file, 'r') as f:
    content = f.read()

old_block = """export function notifyNpcKill(plotNpcId: string, state: GameState): void {
  for (const q of state.quests) {
    if (q.done || q.type !== QuestType.KILL) continue;
    if (q.targetNpcId === getPlotNpcNumericId(plotNpcId)!) {
      q.killCount = (q.killCount ?? 0) + 1;
    }
  }
  for (const q of state.quests) {
//     if (q.done || q.failOnNpcDeathId !== getPlotNpcNumericId(plotNpcId)) continue;
    failQuest(q, [], state, undefined, 'npc_dead', ['npc_dead'], { protectedPlotNpcId: plotNpcId });
  }
}"""

new_block = """export function notifyNpcKill(plotNpcId: number, state: GameState): void {
  for (const q of state.quests) {
    if (q.done || q.type !== QuestType.KILL) continue;
    if (q.targetNpcId === plotNpcId) {
      q.killCount = (q.killCount ?? 0) + 1;
    }
  }
  for (const q of state.quests) {
    if (q.done || q.failOnNpcDeathId !== plotNpcId) continue;
    failQuest(q, [], state, undefined, 'npc_dead', ['npc_dead'], { protectedPlotNpcId: plotNpcId });
  }
}"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file, 'w') as f:
        f.write(content)
else:
    print("Block not found, doing fallback")
    content = content.replace("export function notifyNpcKill(plotNpcId: string, state: GameState): void {", "export function notifyNpcKill(plotNpcId: number, state: GameState): void {")
    content = content.replace("q.targetNpcId === getPlotNpcNumericId(plotNpcId)!", "q.targetNpcId === plotNpcId")
    content = content.replace("q.failOnNpcDeathId !== getPlotNpcNumericId(plotNpcId)", "q.failOnNpcDeathId !== plotNpcId")
    content = content.replace("//     if (q.done || q.failOnNpcDeathId !== plotNpcId) continue;", "if (q.done || q.failOnNpcDeathId !== plotNpcId) continue;")
    with open(file, 'w') as f:
        f.write(content)


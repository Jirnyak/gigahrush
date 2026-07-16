import re
file = 'src/systems/npc_package_speech.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("""export function registerNpcSpeechPackage(pack: NpcSpeechPackageView): void {
  const defId = cleanId(pack.id);
  if (!plotNpcId) return;
  registry.set(plotNpcId, { ...pack, plotNpcId });
  const defId = cleanId(pack.content?.id);
  if (plotNpcId) registryByPlotId.set(plotNpcId, plotNpcId);
}""", """export function registerNpcSpeechPackage(pack: NpcSpeechPackageView): void {
  const defId = cleanId(pack.id);
  const plotNpcId = pack.plotNpcId;
  registry.set(defId, { ...pack, plotNpcId });
  const contentId = cleanId(pack.content?.id);
  if (plotNpcId) registryByPlotId.set(plotNpcId, defId);
}""")

with open(file, 'w') as f:
    f.write(content)

import re
file1 = 'src/data/craft_recipe_sources.ts'
with open(file1, 'r') as f:
    c1 = f.read()
c1 = c1.replace("import { getPlotNpcNumericId } from './npc_packages';\n", "")
with open(file1, 'w') as f:
    f.write(c1)

file2 = 'src/gen/plot_npc_spawn.ts'
with open(file2, 'r') as f:
    c2 = f.read()
c2 = c2.replace("""export function spawnPlotNpcFromPackage(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,""", """export function spawnPlotNpcFromPackage(
  entities: Entity[],
  plotNpcId: string,""")
c2 = c2.replace("""export function requireSpawnedPlotNpcFromPackage(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,""", """export function requireSpawnedPlotNpcFromPackage(
  entities: Entity[],
  plotNpcId: string,""")
with open(file2, 'w') as f:
    f.write(c2)


import re
file = 'src/systems/alife.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("""export interface AlifePopulationReservedNpc {
  id?: number;
  kind?: 'plot' | 'authored' | 'event_reserved';
  presence?: 'population' | 'event_only';
  id?: number;""", """export interface AlifePopulationReservedNpc {
  id?: number;
  kind?: 'plot' | 'authored' | 'event_reserved';
  presence?: 'population' | 'event_only';""")

with open(file, 'w') as f:
    f.write(content)

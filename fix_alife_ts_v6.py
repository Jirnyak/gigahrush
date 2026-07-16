import re
file = 'src/systems/alife.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("""  reservedKind?: 'plot' | 'authored' | 'event_reserved';
  reservedIdentityId?: string;
  reservedPresence?: 'population' | 'event_only';
  x?: number;
  y?: number;
  angle?: number;""", """  reservedKind?: 'plot' | 'authored' | 'event_reserved';
  reservedIdentityId?: string;
  reservedPresence?: 'population' | 'event_only';
  plotNpcId?: number;
  x?: number;
  y?: number;
  angle?: number;""")

content = content.replace("""    reservedKind: record.reservedKind,
    reservedIdentityId: record.reservedIdentityId,
    reservedPresence: record.reservedPresence,
    x: record.x,
    y: record.y,""", """    reservedKind: record.reservedKind,
    reservedIdentityId: record.reservedIdentityId,
    reservedPresence: record.reservedPresence,
    plotNpcId: record.plotNpcId,
    x: record.x,
    y: record.y,""")

with open(file, 'w') as f:
    f.write(content)

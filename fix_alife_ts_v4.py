import re
file = 'src/systems/alife.ts'
with open(file, 'r') as f:
    content = f.read()

# Fix AlifePopulationReservedNpc
content = content.replace("""export interface AlifePopulationReservedNpc {
  id?: number;
  kind?: 'plot' | 'authored' | 'event_reserved';
  presence?: 'population' | 'event_only';""", """export interface AlifePopulationReservedNpc {
  id?: string;
  kind?: 'plot' | 'authored' | 'event_reserved';
  presence?: 'population' | 'event_only';
  plotNpcId?: number;""")

# Fix reservedNpcFromData
content = content.replace("""    id: getPlotNpcNumericId(def.id),
    kind: def.kind,
    presence: def.presence,
//     id: def.id,""", """    id: def.id,
    kind: def.kind,
    presence: def.presence,
    plotNpcId: getPlotNpcNumericId(def.plotNpcId),""")

# Fix AlifeNpcRecord
content = content.replace("""  reservedKind?: 'plot' | 'authored' | 'event_reserved';
  reservedIdentityId?: string;
  reservedPresence?: 'population' | 'event_only';
  speed?: number;
  isTraveler?: boolean;
  x?: number;
  y?: number;""", """  reservedKind?: 'plot' | 'authored' | 'event_reserved';
  reservedIdentityId?: string;
  reservedPresence?: 'population' | 'event_only';
  speed?: number;
  isTraveler?: boolean;
  plotNpcId?: number;
  x?: number;
  y?: number;""")

# Fix applyReservedNpcToRecord
content = content.replace("""  if (reserved.id) record.reservedIdentityId = cleanFloorKey(reserved.id);
  if (reserved.kind) record.reservedKind = reserved.kind;
  if (reserved.presence === 'population' || reserved.presence === 'event_only') record.reservedPresence = reserved.presence;
  if (reserved.id) record.id = String(reserved.id).slice(0, 96);""", """  if (reserved.id) record.reservedIdentityId = cleanFloorKey(reserved.id);
  if (reserved.kind) record.reservedKind = reserved.kind;
  if (reserved.presence === 'population' || reserved.presence === 'event_only') record.reservedPresence = reserved.presence;
  if (reserved.plotNpcId) record.plotNpcId = reserved.plotNpcId;""")

# Fix updateEntityFromRecord
content = content.replace("""  e.firstName = record.firstName;
  e.lastName = record.lastName;
  e.npcVisualId = record.npcVisualId;
  e.role = record.role;
  e.cinematicState = record.cinematicState;
  e.reservedKind = record.reservedKind;
  e.reservedIdentityId = record.reservedIdentityId;
  e.reservedPresence = record.reservedPresence;""", """  e.firstName = record.firstName;
  e.lastName = record.lastName;
  e.npcVisualId = record.npcVisualId;
  e.role = record.role;
  e.cinematicState = record.cinematicState;
  e.reservedKind = record.reservedKind;
  e.reservedIdentityId = record.reservedIdentityId;
  e.reservedPresence = record.reservedPresence;
  e.id = record.plotNpcId ?? e.id;""")

with open(file, 'w') as f:
    f.write(content)

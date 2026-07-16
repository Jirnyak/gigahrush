import re
import os

files = [
    'src/gen/design_floors/bolnichny_korpus.ts',
    'src/gen/design_floors/registry_morgue.ts',
    'src/gen/design_floors/silicon_net_well.ts',
    'src/gen/design_floors/voronoi_quarantine.ts',
    'src/gen/living/cartographer_zone_map.ts',
    'src/gen/living/external_cell_neighbor.ts',
    'src/gen/living/obzh_school.ts',
    'src/gen/living/samosbornyy_ostov.ts',
    'src/gen/living/veretar_window_rescue.ts',
    'src/gen/maintenance/metro_error_line.ts'
]

for file in files:
    if not os.path.exists(file): continue
    with open(file, 'r') as f:
        content = f.read()

    # replace id: getPlotNpcNumericId('...')! with id: getPlotNpcNumericId('...')! Wait!
    # Wait, the error is `Type 'number' is not assignable to type 'string'.`
    # This means someone is expecting a string but got a number.
    # Ah! We changed `id: number` on Entity! Oh! Wait! If it's assigning to `persistentNpcId` maybe?
    # No, it's `persistentNpcId: getPlotNpcNumericId(...)!` Wait, `persistentNpcId` is a STRING? No, `persistentNpcId` is a string! But wait! The new standard is `id`! We shouldn't assign `persistentNpcId`.
    pass


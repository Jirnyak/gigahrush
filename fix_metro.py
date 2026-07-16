import re
file = 'src/gen/maintenance/metro_error_line.ts'
with open(file, 'r') as f:
    content = f.read()

content = content.replace("METRO_STATION_ROOM_NAME", "METRO_STATION_ROOM_DEF_ID")
content = content.replace("METRO_DEPOT_ROOM_NAME", "METRO_DEPOT_ROOM_DEF_ID")
content = content.replace("METRO_ERROR_ROOM_NAME", "METRO_ERROR_ROOM_DEF_ID")

with open(file, 'w') as f:
    f.write(content)


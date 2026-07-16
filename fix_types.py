import re
file = 'src/core/types.ts'
with open(file, 'r') as f:
    content = f.read()

if 'failOnNpcDeathId' not in content:
    content = content.replace("expiresAtMinutes?: number;  // absolute GameClock.totalMinutes deadline", "expiresAtMinutes?: number;  // absolute GameClock.totalMinutes deadline\n  failOnNpcDeathId?: number;")
    with open(file, 'w') as f:
        f.write(content)

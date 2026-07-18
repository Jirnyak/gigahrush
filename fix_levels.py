import os

replacements = [
    (
        "src/systems/rpg.ts",
        "  // Difficulty increases with depth\n  const depthBonus = Math.max(0, Math.floor(z * 1.5));",
        "  // Difficulty increases with depth (distance from z=0)\n  const depthBonus = Math.floor(Math.abs(z) * 1.5);"
    ),
    (
        "src/gen/living/index.ts",
        "calcZoneLevel(z.cx, z.cy, 100)",
        "calcZoneLevel(z.cx, z.cy, 0)"
    ),
    (
        "src/gen/kvartiry/index.ts",
        "calcZoneLevel(z.cx, z.cy, 60)",
        "calcZoneLevel(z.cx, z.cy, 14)"
    ),
    (
        "src/gen/manhattan_crossroads/geometry.ts",
        "calcZoneLevel(zone.cx, zone.cy, 60)",
        "calcZoneLevel(zone.cx, zone.cy, 8)"
    ),
    (
        "src/gen/raionsovet_archive/index.ts",
        "calcZoneLevel(zone.cx, zone.cy, 30)",
        "calcZoneLevel(zone.cx, zone.cy, 22)"
    ),
    (
        "src/gen/maintenance/index.ts",
        "calcZoneLevel(z.cx, z.cy, 140)",
        "calcZoneLevel(z.cx, z.cy, -26)"
    ),
    (
        "src/gen/hell/index.ts",
        "calcZoneLevel(z.cx, z.cy, 180)",
        "calcZoneLevel(z.cx, z.cy, -36)"
    ),
    (
        "src/gen/underhell/geometry.ts",
        "calcZoneLevel(zone.cx, zone.cy, 180)",
        "calcZoneLevel(zone.cx, zone.cy, -38)"
    ),
    (
        "src/gen/podad/npcs.ts",
        "calcZoneLevel(zone.cx, zone.cy, 180)",
        "calcZoneLevel(zone.cx, zone.cy, -40)"
    ),
    (
        "src/gen/void/index.ts",
        "calcZoneLevel(z.cx, z.cy, 200)",
        "calcZoneLevel(z.cx, z.cy, -50)"
    )
]

for filepath, old_str, new_str in replacements:
    full_path = os.path.join("/Users/jirnyak/Mirror/gigahrush", filepath)
    with open(full_path, "r") as f:
        content = f.read()
    
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(full_path, "w") as f:
            f.write(content)
        print(f"Fixed {filepath}")
    else:
        print(f"String not found in {filepath}!")


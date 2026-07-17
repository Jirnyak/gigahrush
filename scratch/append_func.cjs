const fs = require('fs');

const retuneCode = `
export function retuneRaionsovetArchiveZones(world: any): void {
  const storage = new Int32Array(world.zones.length);
  const office = new Int32Array(world.zones.length);
  const common = new Int32Array(world.zones.length);
  const hq = new Int32Array(world.zones.length);
  const production = new Int32Array(world.zones.length);

  for (let i = 0; i < world.cells.length; i++) {
    if (world.cells[i] !== 2) continue; // Cell.FLOOR
    const zoneId = world.zoneMap[i];
    if (zoneId < 0 || zoneId >= world.zones.length) continue;
    const room = world.rooms[world.roomMap[i]];
    if (!room) continue;
    switch (room.type) {
      case 2: // RoomType.STORAGE
        storage[zoneId]++;
        break;
      case 5: // RoomType.OFFICE
        office[zoneId]++;
        break;
      case 4: // RoomType.COMMON
        common[zoneId]++;
        break;
      case 3: // RoomType.HQ
        hq[zoneId]++;
        break;
      case 14: // RoomType.PRODUCTION
        production[zoneId]++;
        break;
    }
  }

  for (const zone of world.zones) {
    const z = zone.id;
    const archiveScore = storage[z] + production[z] * 0.8;
    const adminScore = office[z] + hq[z] * 1.2;
    const queueScore = common[z];
    if (archiveScore > 220 && archiveScore > adminScore + queueScore) {
      zone.faction = z % 5 === 0 ? 0 : 3; // ZoneFaction.WILD : SAMOSBOR
      zone.level = Math.max(zone.level, archiveScore > 520 ? 5 : 4);
    } else if (adminScore > 150) {
      zone.faction = z % 4 === 0 ? 1 : 2; // ZoneFaction.LIQUIDATOR : CITIZEN
      zone.level = Math.max(zone.level, 3);
    } else if (queueScore > 150) {
      zone.faction = 2; // ZoneFaction.CITIZEN
      zone.level = Math.max(zone.level, 2);
    }
  }
}
`;

fs.appendFileSync('src/gen/raionsovet_archive/index.ts', retuneCode);
console.log("Appended func");

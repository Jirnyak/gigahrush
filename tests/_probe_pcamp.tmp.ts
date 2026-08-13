// временный зонд pioneer HQ (удалить)
import { DoorState, RoomType, ZoneFaction } from '../src/core/types';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { territoryHqAnchors } from '../src/systems/territory';
const gen = generateDesignFloor('pioneer_camp', 61061);
for (const room of gen.world.rooms.filter(r => r.type === RoomType.HQ)) {
  const states = room.doors.map(d => DoorState[gen.world.doors.get(d)?.state ?? -1]);
  console.log(room.name, 'sealed:', room.sealed, 'doors:', states.join(','));
}
console.log('anchors:', territoryHqAnchors(gen.world).map(a => ZoneFaction[a.owner]).join(','));

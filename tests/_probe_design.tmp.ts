// временный зонд: макро-статы дизайн-этажей (удалить после использования)
import { auditReachability } from '../src/core/world';
import { Cell, EntityType, W, ZoneFaction } from '../src/core/types';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { countTerritoryCells } from '../src/systems/territory';

const ids = process.argv.slice(2);
for (const id of ids) {
  const gen = generateDesignFloor(id as any);
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  let reachable = 0;
  for (const v of audit.reachable) reachable += v;
  let passable = 0;
  for (let i = 0; i < W * W; i++) if (gen.world.cells[i] !== Cell.WALL) passable++;
  const npcs = gen.entities.filter(e => e.type === EntityType.NPC).length;
  const monsters = gen.entities.filter(e => e.type === EntityType.MONSTER).length;
  const shares = countTerritoryCells(gen.world)
    .map(r => `${ZoneFaction[r.owner]}=${(r.cells / (W * W)).toFixed(4)}`)
    .join(' ');
  console.log(`${id}: rooms=${gen.world.rooms.length} doors=${gen.world.doors.size} npcs=${npcs} monsters=${monsters} reachable=${reachable} passable=${passable} containers=${gen.world.containers.length}`);
  console.log(`  shares: ${shares}`);
}

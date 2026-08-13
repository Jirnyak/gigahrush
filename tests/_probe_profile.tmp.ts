// временный зонд: цели профиля населения (удалить после использования)
import { designFloorById } from '../src/data/design_floors';
import { designFloorPopulationProfile } from '../src/data/design_floor_population';

for (const id of process.argv.slice(2)) {
  const route = designFloorById(id as any);
  if (!route) { console.log(`${id}: NO ROUTE`); continue; }
  const p = designFloorPopulationProfile(route);
  console.log(`${id}: z=${route.z} npcTarget=${p.npcTarget} monsterTarget=${p.monsterTarget}`);
}

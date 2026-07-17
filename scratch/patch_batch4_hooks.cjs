const fs = require('fs');

function appendHook(fileId, hookCode) {
  let file = `src/gen/${fileId}/index.ts`;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('applyDesignFloorPopulationField', `${hookCode}\n  applyDesignFloorPopulationField`);
  fs.writeFileSync(file, content);
}

appendHook('chthonic_attic', `
  const rngFn = seededRandom(hashSeed('design-full:chthonic_attic:46', 46));
  expandChthonicAtticRootNetwork(world, rngFn);
  retuneExpandedChthonicAtticEcology(world);
`);

appendHook('antenna_court', `
  const rngFn = seededRandom(hashSeed('design-full:antenna_court:42', 42));
  expandAntennaCourtRouteGeometry(world, rngFn);
  retuneAntennaCourtRouteZones(world);
`);

appendHook('raionsovet_archive', `
  const rngFn = seededRandom(hashSeed('design-full:raionsovet_archive:22', 22));
  expandRaionsovetArchiveGeometry(world, rngFn);
  // These need to be called after territory... Wait, retuneRaionsovetArchiveZones is in raionsovet_archive/index.ts?
  // Let's add them before population
  retuneRaionsovetArchiveZones(world);
  reinforceRaionsovetArchiveAuthoredHqTerritory(world);
`);

appendHook('registry_morgue', `
  const rngFn = seededRandom(hashSeed('design-full:registry_morgue:18', 18));
  expandRegistryMorgueGeometry(world, rngFn);
  reinforceRegistryMorgueAuthoredTerritory(world);
`);

console.log("Hooks injected");

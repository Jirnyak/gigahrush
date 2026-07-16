const fs = require('fs');

let mainTs = fs.readFileSync('src/main.ts', 'utf8');
mainTs = mainTs.replace(/ensureRoomContainers\(world, state\.currentZ\)/g, "ensureRoomContainers(world, state.currentFloorId ?? String(state.currentZ))");
fs.writeFileSync('src/main.ts', mainTs, 'utf8');

let prodTs = fs.readFileSync('src/systems/production.ts', 'utf8');
prodTs = prodTs.replace(/ensureRoomContainers\(world, state\.currentZ\)/g, "ensureRoomContainers(world, state.currentFloorId ?? String(state.currentZ))");
fs.writeFileSync('src/systems/production.ts', prodTs, 'utf8');

let factionTs = fs.readFileSync('src/systems/faction_events.ts', 'utf8');
factionTs = factionTs.replace(/ensureRoomContainers\(world, state\.currentZ\)/g, "ensureRoomContainers(world, state.currentFloorId ?? String(state.currentZ))");
fs.writeFileSync('src/systems/faction_events.ts', factionTs, 'utf8');

let intTs = fs.readFileSync('src/systems/interactions.ts', 'utf8');
intTs = intTs.replace(/ensureRoomContainers\(ctx\.world, ctx\.state\.currentZ\)/g, "ensureRoomContainers(ctx.world, ctx.state.currentFloorId ?? String(ctx.state.currentZ))");
fs.writeFileSync('src/systems/interactions.ts', intTs, 'utf8');

let debugTs = fs.readFileSync('src/systems/debug.ts', 'utf8');
debugTs = debugTs.replace(/ensureRoomContainers\(world, state\.currentZ\)/g, "ensureRoomContainers(world, state.currentFloorId ?? String(state.currentZ))");
fs.writeFileSync('src/systems/debug.ts', debugTs, 'utf8');

let samosborTs = fs.readFileSync('src/systems/samosbor.ts', 'utf8');
samosborTs = samosborTs.replace(/ensureRoomContainers\(world, z\)/g, "ensureRoomContainers(world, state?.currentFloorId ?? String(z))");
samosborTs = samosborTs.replace(/ensureRoomContainers\(world, pending\.z\)/g, "ensureRoomContainers(world, state?.currentFloorId ?? String(pending.z))");
fs.writeFileSync('src/systems/samosbor.ts', samosborTs, 'utf8');

let containerTs = fs.readFileSync('src/systems/containers.ts', 'utf8');
containerTs = containerTs.replace(/export function ensureRoomContainers\(world: World, z: number, maxContainers = 128\): number \{/g, "export function ensureRoomContainers(world: World, floorId: string, maxContainers = 128): number {");
containerTs = containerTs.replace(/pruneContainersForWorld\(world, z\);/g, "pruneContainersForWorld(world, floorId);");
containerTs = containerTs.replace(/ensureShelterTallyStaticPath\(world, z\);/g, "ensureShelterTallyStaticPath(world, floorId);");
containerTs = containerTs.replace(/world\.containers\.some\(c => c\.floorId === z &&/g, "world.containers.some(c => c.floorId === floorId &&");
containerTs = containerTs.replace(/z,/g, "floorId,");
containerTs = containerTs.replace(/function ensureShelterTallyStaticPath\(world: World, z: number\): void \{/g, "function ensureShelterTallyStaticPath(world: World, floorId: string): void {");
containerTs = containerTs.replace(/function hasShelterTallyStaticPath\(world: World, z: number\): boolean \{/g, "function hasShelterTallyStaticPath(world: World, floorId: string): boolean {");
containerTs = containerTs.replace(/if \(!tallyFloorAllowsStaticSeed\(z\)/g, "if (!tallyFloorAllowsStaticSeed(floorId)");
containerTs = containerTs.replace(/hasShelterTallyStaticPath\(world, z\)/g, "hasShelterTallyStaticPath(world, floorId)");
containerTs = containerTs.replace(/c => c\.floorId === z/g, "c => c.floorId === floorId");
containerTs = containerTs.replace(/export function pruneContainersForWorld\(world: World, z: number\): number \{/g, "export function pruneContainersForWorld(world: World, floorId: string): number {");
containerTs = containerTs.replace(/function tallyFloorAllowsStaticSeed\(z: number\): boolean \{/g, "function tallyFloorAllowsStaticSeed(floorId: string): boolean {");
containerTs = containerTs.replace(/z === 100 \|\| z === 60 \|\| z === 30/g, "floorId === 'design:living' || floorId === 'design:kvartiry' || floorId === 'design:ministry'");
fs.writeFileSync('src/systems/containers.ts', containerTs, 'utf8');


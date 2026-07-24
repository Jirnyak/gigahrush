import { World } from './src/core/world';

const world = new World();
console.log('world cells 0:', world.cells[0]);
console.log('solid at 10,10:', world.solid(10,10));

function meleeTraceClearLine(world: World, x1: number, y1: number, x2: number, y2: number, maxDist: number): boolean {
  const dx = world.delta(x1, x2);
  const dy = world.delta(y1, y2);
  const dist = Math.sqrt(dx * dx + dy * dy);
  console.log('dist', dist, 'maxDist', maxDist);
  if (dist > maxDist) return false;
  const steps = Math.max(2, Math.ceil(dist * 2));
  console.log('steps', steps);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(world.wrap(x1 + dx * t));
    const y = Math.floor(world.wrap(y1 + dy * t));
    console.log('checking', x, y, 'solid', world.solid(x, y));
    if (world.solid(x, y)) return false;
  }
  return true;
}

const reach = 2;
const maxR = reach + 0.6 + 0.18;
console.log('result:', meleeTraceClearLine(world, 10, 10, 11.9, 10.05, maxR));

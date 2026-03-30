/* ── Toroidal world grid ──────────────────────────────────────── */

import { W, Cell, DoorState, Feature, type Room, type Door, type Zone } from './types';

export class World {
  cells:     Uint8Array;
  roomMap:   Int16Array;   // room id per cell (-1 = none)
  wallTex:   Uint8Array;
  floorTex:  Uint8Array;
  features:  Uint8Array;   // Feature enum per cell
  light:     Float32Array; // lightmap 0..1 per cell
  rooms:     Room[]  = [];
  doors:     Map<number, Door> = new Map();
  apartmentRoomCount = 0;          // first N rooms are permanent apartments
  aptMask:   Uint8Array;           // 1 = protected apartment cell (interior + wall ring)
  hermoWall: Uint8Array;           // 1 = unbreakable hermetic shelter wall
  zones:     Zone[] = [];          // 64 macro-regions
  zoneMap:   Uint8Array;           // zone id per cell (0-63)
  factionControl: Uint8Array;      // per-cell faction control (ZoneFaction enum)
  fog:       Uint8Array;           // purple fog density per cell (0 = clear, 255 = full)
  slideCells: number[] = [];       // cell indices of slide walls (cycle textures)
  surfaceMap: Map<number, Uint8Array> = new Map(); // sparse RGBA canvas, 16×16×4 per cell (floors + walls)
  liftDir:   Uint8Array;           // LiftDirection per cell (only meaningful where cells[i] === Cell.LIFT)

  constructor() {
    const n = W * W;
    this.cells    = new Uint8Array(n).fill(Cell.WALL);
    this.roomMap  = new Int16Array(n).fill(-1);
    this.wallTex  = new Uint8Array(n);
    this.floorTex = new Uint8Array(n);
    this.features = new Uint8Array(n);              // Feature.NONE = 0
    this.light    = new Float32Array(n);            // 0 = dark
    this.aptMask  = new Uint8Array(n);              // 0 = volatile, 1 = apartment-protected
    this.hermoWall = new Uint8Array(n);             // 0 = normal, 1 = unbreakable wall
    this.zoneMap  = new Uint8Array(n);              // zone id
    this.factionControl = new Uint8Array(n);        // per-cell faction (ZoneFaction)
    this.fog      = new Uint8Array(n);              // fog density
    this.liftDir  = new Uint8Array(n);              // LiftDirection (0=DOWN, 1=UP)
  }

  /* rebuild lightmap from lamp features */
  bakeLights(): void {
    this.light.fill(0);
    const R = 8;  // lamp radius in cells
    for (let i = 0; i < W * W; i++) {
      if (this.features[i] !== Feature.LAMP) continue;
      const lx = i % W;
      const ly = (i / W) | 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > R * R) continue;
          const wx = this.wrap(lx + dx);
          const wy = this.wrap(ly + dy);
          const ti = wy * W + wx;
          const brightness = 1.0 - Math.sqrt(d2) / R;
          if (brightness > this.light[ti]) this.light[ti] = brightness;
        }
      }
    }
  }

  /* toroidal helpers */
  wrap(v: number): number { return ((v % W) + W) % W; }

  idx(x: number, y: number): number {
    return this.wrap(y) * W + this.wrap(x);
  }

  get(x: number, y: number): number {
    return this.cells[this.idx(x, y)];
  }

  set(x: number, y: number, v: Cell): void {
    this.cells[this.idx(x, y)] = v;
  }

  solid(x: number, y: number): boolean {
    const i = this.idx(x, y);
    const c = this.cells[i];
    if (c === Cell.FLOOR || c === Cell.WATER) return false;
    if (c === Cell.LIFT) return true;  // lift wall — interact to use
    if (c === Cell.DOOR) {
      const d = this.doors.get(i);
      if (!d) return true;
      return d.state === DoorState.CLOSED
          || d.state === DoorState.LOCKED
          || d.state === DoorState.HERMETIC_CLOSED;
    }
    return true;
  }

  /* toroidal shortest displacement from a→b */
  delta(a: number, b: number): number {
    let d = b - a;
    if (d >  W / 2) d -= W;
    if (d < -W / 2) d += W;
    return d;
  }

  dist(x1: number, y1: number, x2: number, y2: number): number {
    const dx = this.delta(x1, x2);
    const dy = this.delta(y1, y2);
    return Math.sqrt(dx * dx + dy * dy);
  }

  dist2(x1: number, y1: number, x2: number, y2: number): number {
    const dx = this.delta(x1, x2);
    const dy = this.delta(y1, y2);
    return dx * dx + dy * dy;
  }

  roomAt(x: number, y: number): Room | null {
    const id = this.roomMap[this.idx(Math.floor(x), Math.floor(y))];
    return id >= 0 ? this.rooms[id] ?? null : null;
  }

  /* paint RGBA onto sparse 16×16 canvas — spills across cell boundaries.
     wallOk=true allows painting on wall/solid cells (for bullet holes, wall blood) */
  stamp(cx: number, cy: number, fx: number, fy: number, radius: number, intensity: number, seed: number, cr: number, cg: number, cb: number, wallOk = false): void {
    const bx = Math.floor(fx * 16);
    const by = Math.floor(fy * 16);
    const r = Math.max(1, Math.floor(radius * 16));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        let px = bx + dx, py = by + dy;
        let cellDx = 0, cellDy = 0;
        while (px < 0)  { px += 16; cellDx--; }
        while (px >= 16) { px -= 16; cellDx++; }
        while (py < 0)  { py += 16; cellDy--; }
        while (py >= 16) { py -= 16; cellDy++; }
        const ncx = this.wrap(cx + cellDx);
        const ncy = this.wrap(cy + cellDy);
        const ci = ncy * W + ncx;
        if (!wallOk && this.cells[ci] === Cell.WALL) continue;
        const absPx = bx + dx, absPy = by + dy;
        const h = ((seed * 2654435761 + absPx * 73856093 + absPy * 19349663) >>> 0) & 0xFF;
        if (d2 > r * r * 0.4 && h > 160) continue;
        const fall = 1 - d2 / (r * r + 1);
        const newA = Math.min(255, Math.floor(intensity * fall));
        if (newA <= 0) continue;
        let cell = this.surfaceMap.get(ci);
        if (!cell) { cell = new Uint8Array(1024); this.surfaceMap.set(ci, cell); }
        const idx = (py * 16 + px) << 2;
        const curA = cell[idx + 3];
        if (curA === 0) {
          cell[idx] = cr; cell[idx + 1] = cg; cell[idx + 2] = cb; cell[idx + 3] = newA;
        } else {
          const total = curA + newA;
          cell[idx]     = Math.floor((cell[idx]     * curA + cr * newA) / total);
          cell[idx + 1] = Math.floor((cell[idx + 1] * curA + cg * newA) / total);
          cell[idx + 2] = Math.floor((cell[idx + 2] * curA + cb * newA) / total);
          cell[idx + 3] = Math.min(255, total);
        }
      }
    }
  }

  /* carve a floor cell */
  carve(x: number, y: number): void {
    this.set(x, y, Cell.FLOOR);
  }

  /* carve rectangle */
  carveRect(rx: number, ry: number, rw: number, rh: number, roomId: number): void {
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const wx = this.wrap(rx + dx);
        const wy = this.wrap(ry + dy);
        const i = wy * W + wx;
        this.cells[i] = Cell.FLOOR;
        this.roomMap[i] = roomId;
      }
    }
  }
}

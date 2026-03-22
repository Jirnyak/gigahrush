/* ── ГИГАХРУЩ — core type definitions ─────────────────────────── */

export const W = 1024;           // toroidal world size
export const TEX = 64;           // texture size (px)
export const MAX_DRAW = 40;      // max raycaster distance
export const TICK_S = 1 / 60;    // seconds per logic tick

// ── Cells ────────────────────────────────────────────────────────
export const enum Cell {
  FLOOR   = 0,
  WALL    = 1,
  DOOR    = 2,
  ABYSS   = 3,
  LIFT    = 4,
  WATER   = 5,
}

// ── Texture indices ──────────────────────────────────────────────
export const enum Tex {
  CONCRETE  = 0,
  BRICK     = 1,
  PANEL     = 2,
  TILE_W    = 3,
  METAL     = 4,
  ROTTEN    = 5,
  CURTAIN   = 6,
  DARK      = 7,
  // floors 8-15
  F_CONCRETE = 8,
  F_LINO     = 9,
  F_TILE     = 10,
  F_WOOD     = 11,
  F_CARPET   = 12,
  // ceiling
  CEIL       = 13,
  // doors
  DOOR_WOOD  = 14,
  DOOR_METAL = 15,
  // abyss
  F_ABYSS    = 16,
  // lift
  LIFT_DOOR  = 17,
  // maintenance
  PIPE       = 18,
  F_WATER    = 19,
  // hell
  MEAT       = 20,
  F_MEAT     = 21,
  // start room
  DESK       = 22,
  SLIDE_1    = 23,
  SLIDE_2    = 24,
  SLIDE_3    = 25,
  SLIDE_4    = 26,
  SLIDE_5    = 27,
  SLIDE_6    = 28,
  SLIDE_7    = 29,
  SLIDE_8    = 30,
  TARGET     = 31,
  COUNT      = 32,
}

// ── Floor levels (Z-axis) ────────────────────────────────────────
export enum FloorLevel {
  LIVING       = 0,   // жилая зона — квартиры, цеха, залы
  MAINTENANCE  = 1,   // коллекторы — трубы, туннели, каналы с водой
  HELL         = 2,   // ад — мясо, постоянный самосбор, культисты
}

// ── Rooms ────────────────────────────────────────────────────────
export enum RoomType {
  LIVING,      // personal room — sleep, hide
  KITCHEN,     // eat, drink
  BATHROOM,    // toilet, shower
  STORAGE,     // items
  MEDICAL,     // healing
  COMMON,      // hall
  PRODUCTION,  // work
  CORRIDOR,    // passage
  SMOKING,     // курилка — free time
  OFFICE,      // бухгалтерия — paperwork
}

export interface Room {
  id: number;
  type: RoomType;
  x: number; y: number; w: number; h: number;
  doors: number[];          // door cell indices
  sealed: boolean;          // hermetically sealed during samosbor
  name: string;
  apartmentId: number;      // -1 = not apartment
  wallTex: Tex;
  floorTex: Tex;
}

// ── Cell features (one per cell) ─────────────────────────────────
export const enum Feature {
  NONE         = 0,
  LAMP         = 1,
  TABLE        = 2,
  CHAIR        = 3,
  BED          = 4,
  STOVE        = 5,
  SINK         = 6,
  TOILET       = 7,
  SHELF        = 8,
  MACHINE      = 9,
  APPARATUS    = 10,
  LIFT_BUTTON  = 11,
  DESK         = 12,
  SLIDE        = 13,
}

// ── Doors ────────────────────────────────────────────────────────
export enum DoorState {
  OPEN,
  CLOSED,
  LOCKED,
  HERMETIC_OPEN,
  HERMETIC_CLOSED,
}

export interface Door {
  idx: number;             // cell index
  state: DoorState;
  roomA: number;           // room id or -1
  roomB: number;
  keyId: string;           // item def id needed ("" = no key)
  timer: number;           // auto-close timer
}

// ── Entities ─────────────────────────────────────────────────────
export enum EntityType { PLAYER, NPC, MONSTER, ITEM_DROP, PROJECTILE }

export enum MonsterKind {
  SBORKA,     // fast, weak               — бегает быстро
  TVAR,       // medium                   — ходит за стенами
  POLZUN,     // slow, strong, creepy     — вылезает из-под пола
  BETONNIK,   // rare boss, very strong   — бетонная тварь
}

// ── Factions ─────────────────────────────────────────────────────
export enum Faction {
  CITIZEN,     // граждане
  LIQUIDATOR,  // ликвидаторы
  CULTIST,     // культисты
  SCIENTIST,   // учёные
}

// ── Zone control factions ────────────────────────────────────────
export enum ZoneFaction {
  CITIZEN,     // граждане
  LIQUIDATOR,  // ликвидаторы
  CULTIST,     // культисты
  SAMOSBOR,    // самосбор (захваченная зона)
}

// ── Zones (64 macro-regions ~128×128) ────────────────────────────
export interface Zone {
  id: number;
  cx: number; cy: number;     // center cell
  faction: ZoneFaction;
  hasLift: boolean;
  fogged: boolean;            // фиолетовый туман active
}

// ── Occupations ──────────────────────────────────────────────────
export enum Occupation {
  HOUSEWIFE,   // домохозяйка
  LOCKSMITH,   // слесарь
  SECRETARY,   // секретарь
  ELECTRICIAN, // электрик
  COOK,        // повар
  DOCTOR,      // врач
  TURNER,      // токарь
  MECHANIC,    // механик
  STOREKEEPER, // кладовщик
  ALCOHOLIC,   // алкоголик
  SCIENTIST,   // учёный
  CHILD,       // ребёнок
  DIRECTOR,    // директор
  TRAVELER,    // путник — бродит по лабиринту
  PILGRIM,     // паломник — бродит по лабиринту (культист)
  HUNTER,      // охотник — бродит по лабиринту (ликвидатор)
}

export interface Needs {
  food:  number;   // 0‥100   lower = hungrier
  water: number;
  sleep: number;
  pee:   number;   // 0‥100   higher = more urgent
  poo:   number;
}

export enum AIGoal {
  IDLE, GOTO, EAT, DRINK, SLEEP, TOILET, WORK, HIDE, HUNT, FLEE, WANDER,
}

// ── NPC A-Life FSM states ────────────────────────────────────────
export enum NpcState {
  SLEEPING,    // 22-6: в жилой комнате, спит
  MORNING,     // 6-8: утренние дела — санузел, кухня, коридоры
  WORKING,     // 8-12, 13-18: на работе
  LUNCH,       // 12-13: обед в кухне
  FREE_TIME,   // 18-22: свободное время — курилка, кухня, бродит
  HIDING,      // самосбор — сидит в жилой
  TRAVELING,   // путники — бродят по лабиринту постоянно
}

export interface AIState {
  goal: AIGoal;
  tx: number; ty: number;     // target position
  path: number[];             // cell indices
  pi: number;                 // path index
  stuck: number;
  timer: number;
  npcState?: NpcState;        // A-Life FSM current state
  stateTimer?: number;        // time remaining in current sub-activity
}

export interface Entity {
  id: number;
  type: EntityType;
  x: number; y: number;
  angle: number;
  pitch: number;              // vertical look: -1..1 (y-shearing)
  alive: boolean;
  speed: number;
  sprite: number;             // sprite sheet index
  // optional components
  needs?: Needs;
  hp?: number;
  maxHp?: number;
  ai?: AIState;
  inventory?: Item[];
  name?: string;
  monsterKind?: MonsterKind;
  attackCd?: number;
  familyId?: number;
  weapon?: string;            // equipped item def id
  faction?: Faction;
  occupation?: Occupation;
  isTraveler?: boolean;       // путник/паломник/охотник — бродит по лабиринту
  questId?: number;           // active quest given by this NPC (-1 = none)
  canGiveQuest?: boolean;     // only ~10% NPCs can give quests
  money?: number;             // рубли
  spriteScale?: number;       // sprite size multiplier (child = 0.6)
  isTutor?: boolean;          // Ольга Дмитриевна — tutorial NPC in start room
  isTutorBarni?: boolean;     // Барни — tutorial armory NPC
  tutorDone?: boolean;        // tutor phase ended, acts as normal doctor
  _tutorIdx?: number;         // internal: tutorial dialogue line counter
  // projectile fields
  vx?: number; vy?: number;   // velocity (cells/sec)
  projDmg?: number;           // projectile damage
  projLife?: number;          // remaining lifetime (seconds)
  ownerId?: number;           // entity that fired this
}

// ── Items ────────────────────────────────────────────────────────
export enum ItemType { FOOD, DRINK, MEDICINE, WEAPON, TOOL, KEY, NOTE, MISC, AMMO }

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  stack: number;              // max stack (1 = unstackable)
  desc: string;
  spawnRooms: RoomType[];
  spawnW: number;             // spawn weight
  value: number;              // price in рубли (0 = worthless)
  use?: (e: Entity) => string; // returns message
}

export interface Item {
  defId: string;
  count: number;
  data?: unknown;              // key roomId, note text, etc.
}

// ── Quests ────────────────────────────────────────────────────────
export enum QuestType { FETCH, VISIT, KILL, TALK }

export interface Quest {
  id: number;
  type: QuestType;
  giverId: number;            // NPC entity id
  giverName: string;
  desc: string;
  // FETCH: targetItem + targetCount
  targetItem?: string;        // item def id
  targetCount?: number;
  // VISIT: targetRoom
  targetRoom?: number;        // room id
  // KILL: targetMonsterKind + killCount/killNeeded
  targetMonsterKind?: MonsterKind;
  killCount?: number;
  killNeeded?: number;
  // TALK: targetNpcId
  targetNpcId?: number;
  targetNpcName?: string;
  // reward
  rewardItem?: string;
  rewardCount?: number;
  extraRewards?: {defId: string; count: number}[];  // additional rewards
  relationDelta?: number;     // how much relation changes on completion
  done: boolean;
}

// ── Game state ───────────────────────────────────────────────────
// ── Game clock (24h cycle) ────────────────────────────────────────
// 1 game hour = 60 real seconds, 1 game minute = 1 real second
// gameHour: 0-23, gameMinute: 0-59
export interface GameClock {
  hour: number;
  minute: number;
  totalMinutes: number;     // total minutes elapsed since game start
}

export interface GameState {
  tick: number;
  time: number;
  clock: GameClock;
  samosborActive: boolean;
  samosborTimer: number;
  samosborCount: number;
  paused: boolean;
  gameOver: boolean;
  showInventory: boolean;
  mapMode: number;          // 0=off, 1=minimap, 2=fullmap
  showQuests: boolean;
  invSel: number;
  msgs: Msg[];
  quests: Quest[];
  nextQuestId: number;
  currentFloor: FloorLevel;
  fogSpreadTimer: number;     // ticks between fog spread steps
  // ── Game menu (ESC) ──
  showMenu: boolean;
  menuSel: number;            // 0=continue, 1=new game, 2=save, 3=load
  // ── NPC interaction menu ──
  showNpcMenu: boolean;
  npcMenuSel: number;         // 0=talk, 1=quest, 2=trade
  npcMenuTarget: number;      // entity id
  npcMenuTab: string;         // 'main'|'talk'|'quest'|'trade'
  npcTalkText: string;
  questPage: number;
  tradeSel: number;
  tradeMode: string;          // 'npc'|'player'
}

export interface Msg { text: string; time: number; color: string; }

// ── Input ────────────────────────────────────────────────────────
export interface InputState {
  fwd: boolean; back: boolean; left: boolean; right: boolean;
  strafeL: boolean; strafeR: boolean;
  attack: boolean; interact: boolean; pickup: boolean;
  map: boolean; inv: boolean;
  invUp: boolean; invDn: boolean; invLeft: boolean; invRight: boolean;
  use: boolean;
  escape: boolean;
  debugSamosbor: boolean;
  questLog: boolean;
  mouseAttack: boolean;
  mouse: { dx: number; dy: number; locked: boolean; };
}

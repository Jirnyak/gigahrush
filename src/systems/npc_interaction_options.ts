import { getPlotNpcNumericId, getPlotNpcStringId } from '../data/npc_packages';
import { openArena } from './arena';
import { EntityType, NpcState, AIGoal, msg, type Entity, type GameState, type AIState } from '../core/types';
import { craftRecipeSourcesForNpc, type CraftRecipeSourceDef } from '../data/craft_recipe_sources';
import {
  allDesignFloorProfiles,
  type DesignFloorNpcInteractionProfile,
  type DesignFloorNpcPredicateProfile,
} from '../data/design_floor_profiles';
import { craftRecipeLearnedMessage, isCraftRecipeKnown, learnCraftRecipe } from './crafting';
import { isNetworkedPlayerActor } from './coop_session';
import { COOP_BARTER_ID } from './coop_barter';
import { tabletopGames, type TabletopGameDef } from './tabletop';
// Side-effect imports: each game registers itself with the tabletop registry.
import './durak';
import './dice';
import './domino';
import './checkers';
import './poker';
import './chess';
import './go';
import './backgammon';
import './battleship';
import { canOpenDemosProfileForNpc, demosCursorForNpcProfile } from './demos_profiles';
import { portalAllowsCasinoLikeContent } from './platform_bridge';
import { currentFloorRunEntry } from './procedural_floors';
import { npcHasQuestMarker } from './quests';
import { buildContextSnapshot } from './context';
import { renderMarkovDialogueTalk } from './markov_dialogue';

export const NPC_MENU_INTERFACE_TAB = 'interface';

export interface NpcInteractionContext {
  state: GameState;
  player: Entity;
  npc: Entity;
  entities?: readonly Entity[];
  roomDefIdResolver?: (x: number, y: number) => string | undefined;
}

export interface NpcMenuOption {
  id: string;
  label: string;
  order: number;
  disabled?: boolean;
  disabledReason?: string;
}

export interface NpcInteractionInterfaceSnapshot {
  open: boolean;
  id: string;
  title: string;
  npcId: number;
  npcName: string;
  lines: readonly string[];
  priceRubles?: number;
  stakeRubles?: number;
  message: string;
}

export interface NpcInteractionInterfaceRequest {
  id: string;
  title: string;
  lines: readonly string[];
  priceRubles?: number;
  stakeRubles?: number;
  message?: string;
}

export interface NpcInteractionOptionDef {
  id: string;
  order: number;
  label: (ctx: NpcInteractionContext) => string;
  visible: (ctx: NpcInteractionContext) => boolean;
  disabledReason?: (ctx: NpcInteractionContext) => string | undefined;
  activate: (ctx: NpcInteractionContext) => void;
  /** Also offered when the target is another human rather than an NPC. Default
   *  false: most options (dialogue, quests, lessons, arena) only make sense
   *  against an NPC. See `getNpcMenuOptions`. */
  playerTarget?: boolean;
  /** Fold this option into a named group. The menu then shows ONE line for the
   *  whole group and lists its members when you open it. Generic on purpose:
   *  tabletop games are simply the first cluster big enough to need it. */
  group?: string;
}

/** Group headings, registered by whoever owns the cluster. */
interface NpcMenuGroupDef { id: string; label: (ctx: NpcInteractionContext) => string; order: number }

const optionGroups = new Map<string, NpcMenuGroupDef>();

export function registerNpcMenuGroup(def: NpcMenuGroupDef): void {
  optionGroups.set(def.id, def);
}

/** A group is browsed as its own menu tab, so it needs no new state field. */
export const NPC_MENU_GROUP_PREFIX = 'group:';

export function npcMenuGroupTab(groupId: string): string {
  return NPC_MENU_GROUP_PREFIX + groupId;
}

/** The group being browsed, or null on any other tab. */
export function npcMenuGroupOf(tab: string): string | null {
  return tab.startsWith(NPC_MENU_GROUP_PREFIX) ? tab.slice(NPC_MENU_GROUP_PREFIX.length) : null;
}

/** Tabs that render a list of options: the root and every group. */
export function isNpcMenuOptionListTab(tab: string): boolean {
  return tab === 'main' || tab.startsWith(NPC_MENU_GROUP_PREFIX);
}

/** Marks the synthetic «back» line and the synthetic group lines apart from
 *  real options, so activation can tell them from something to run. */
export const NPC_MENU_BACK_ID = 'group_back';

/** Builtin tabs that survive when the target is another human. Talk, quest and
 *  the priced NPC trade are all NPC-only: a live player generates no Markov
 *  line, hands out no errands and sells at no price list. Swapping goods with
 *  one goes through the `barter` option instead. */
const PLAYER_TARGET_BUILTINS = new Set(['leave']);

interface NpcRecipeLesson {
  source: CraftRecipeSourceDef;
  recipeId: string;
}

const customOptions: NpcInteractionOptionDef[] = [];
const BUILTIN_MENU_OPTIONS = [
  { id: 'talk', label: 'Разговор', order: 0 },
  { id: 'quest', label: 'Задание', questMarkerLabel: 'Задание !', order: 10 },
  { id: 'trade', label: 'Торг', order: 20 },
  { id: 'leave', label: 'Уйти', order: 9000 },
] as const;

const runtime: NpcInteractionInterfaceSnapshot = {
  open: false,
  id: '',
  title: '',
  npcId: -1,
  npcName: '',
  lines: [],
  message: '',
};

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

function countItem(actor: Entity, defId: string): number {
  let count = 0;
  for (const slot of actor.inventory ?? []) {
    if (slot.defId === defId && slot.count > 0) count += slot.count;
  }
  return count;
}

function currentDesignRouteId(state: GameState): string {
  return currentFloorRunEntry(state).designFloorId ?? '';
}

function npcMatchesProfilePredicate(npc: Entity, predicate: DesignFloorNpcPredicateProfile): boolean {
  if (npc.type !== EntityType.NPC || !npc.alive) return false;
  const name = npc.name ?? '';
  if (npc.id && predicate.plotNpcIds?.includes(getPlotNpcStringId(npc.id)!)) return true;
  if (predicate.exactNames?.includes(name)) return true;
  if (predicate.namePrefixes?.some(prefix => name.startsWith(prefix))) return true;
  if (npc.npcVisualId && predicate.npcVisualIds?.includes(npc.npcVisualId)) return true;
  return false;
}

function designFloorInteractionVisible(
  routeId: string,
  option: DesignFloorNpcInteractionProfile,
  ctx: NpcInteractionContext,
): boolean {
  if (option.requiresCasinoLikePortalAllowance && !portalAllowsCasinoLikeContent()) return false;
  return currentDesignRouteId(ctx.state) === routeId && npcMatchesProfilePredicate(ctx.npc, option.npcPredicate);
}

function designFloorInteractionLabel(option: DesignFloorNpcInteractionProfile): string {
  return option.priceRubles !== undefined ? `${option.label} (₽${option.priceRubles})` : option.label;
}

function designFloorInteractionDisabledReason(
  option: DesignFloorNpcInteractionProfile,
  ctx: NpcInteractionContext,
): string | undefined {
  const price = option.priceRubles ?? 0;
  if (price > 0 && cleanMoney(ctx.player) < price) return `Нужно ₽${price}.`;
  return undefined;
}

function formatDesignFloorInteractionLine(
  line: string,
  option: DesignFloorNpcInteractionProfile,
  ctx: NpcInteractionContext,
): string {
  return line
    .replace(/\{npc\}/g, ctx.npc.name ?? 'NPC')
    .replace(/\{price\}/g, String(option.priceRubles ?? 0));
}

function openDesignFloorInteraction(option: DesignFloorNpcInteractionProfile, ctx: NpcInteractionContext): void {
  openNpcInteractionInterface(ctx, {
    id: option.id,
    title: option.title,
    priceRubles: option.priceRubles,
    lines: option.lines.map(line => formatDesignFloorInteractionLine(line, option, ctx)),
    message: option.message,
  });
}

function hashString32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function npcRecipeLessonKey(npc: Entity): string {
  return [
    npc.persistentNpcId ?? '',
    npc.id ?? '',
    Number.isFinite(npc.alifeId) ? String(npc.alifeId) : '',
    String(npc.id),
    npc.name ?? '',
    npc.occupation ?? '',
    npc.faction ?? '',
  ].join('|');
}

function npcRecipeLesson(ctx: NpcInteractionContext): NpcRecipeLesson | undefined {
  const choices: NpcRecipeLesson[] = [];
  for (const source of craftRecipeSourcesForNpc(ctx.npc)) {
    for (const recipeId of source.recipeIds) choices.push({ source, recipeId });
  }
  if (choices.length === 0) return undefined;
  const lesson = choices[hashString32(npcRecipeLessonKey(ctx.npc)) % choices.length];
  return lesson && !isCraftRecipeKnown(ctx.state, lesson.recipeId) ? lesson : undefined;
}

export function registerNpcInteractionOption(def: NpcInteractionOptionDef): void {
  if (customOptions.some(existing => existing.id === def.id)) return;
  customOptions.push(def);
  customOptions.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function menuOptionOrderCompare(aOrder: number, aId: string, bOrder: number, bId: string): number {
  return aOrder - bOrder || aId.localeCompare(bId);
}

function pushBuiltinMenuOption(options: NpcMenuOption[], ctx: NpcInteractionContext, index: number): void {
  const def = BUILTIN_MENU_OPTIONS[index];
  if (!def) return;
  if (isNetworkedPlayerActor(ctx.npc) && !PLAYER_TARGET_BUILTINS.has(def.id)) return;
  const label = def.id === 'quest' && npcHasQuestMarker(ctx.npc, ctx.state) ? def.questMarkerLabel : def.label;
  options.push({ id: def.id, label, order: def.order });
}

/** The list for the CURRENT tab: the root menu, or the contents of the group
 *  being browsed. Reading the tab here is what keeps every call site — the
 *  panel, the pointer hit-test, the keyboard nav — unaware that groups exist.
 *
 *  The same menu serves an NPC and another human; the human's version simply
 *  drops what cannot apply to a live player. */
export function getNpcMenuOptions(ctx: NpcInteractionContext): NpcMenuOption[] {
  const groupId = npcMenuGroupOf(ctx.state.npcMenuTab);
  if (groupId !== null) return groupMenuOptions(ctx, groupId);
  return rootMenuOptions(ctx);
}

/** Inside a group: its members, plus a way back out for the mouse. */
function groupMenuOptions(ctx: NpcInteractionContext, groupId: string): NpcMenuOption[] {
  const playerTarget = isNetworkedPlayerActor(ctx.npc);
  const options: NpcMenuOption[] = [];
  for (const def of customOptions) {
    if (def.group !== groupId) continue;
    if (playerTarget && def.playerTarget !== true) continue;
    if (!def.visible(ctx)) continue;
    const disabledReason = def.disabledReason?.(ctx);
    options.push({ id: def.id, label: def.label(ctx), order: def.order, disabled: !!disabledReason, disabledReason });
  }
  options.sort((a, b) => menuOptionOrderCompare(a.order, a.id, b.order, b.id));
  options.push({ id: NPC_MENU_BACK_ID, label: 'Назад', order: 9000 });
  return options;
}

/** True when a group has anything to show — an empty group must not offer an
 *  empty room. */
function groupHasVisibleMembers(ctx: NpcInteractionContext, groupId: string): boolean {
  const playerTarget = isNetworkedPlayerActor(ctx.npc);
  for (const def of customOptions) {
    if (def.group !== groupId) continue;
    if (playerTarget && def.playerTarget !== true) continue;
    if (def.visible(ctx)) return true;
  }
  return false;
}

function rootMenuOptions(ctx: NpcInteractionContext): NpcMenuOption[] {
  const options: NpcMenuOption[] = [];
  const playerTarget = isNetworkedPlayerActor(ctx.npc);
  // One line per non-empty group, in place of all its members.
  for (const group of optionGroups.values()) {
    if (!groupHasVisibleMembers(ctx, group.id)) continue;
    options.push({ id: npcMenuGroupTab(group.id), label: group.label(ctx), order: group.order });
  }
  let builtinIndex = 0;
  for (const def of customOptions) {
    if (def.group !== undefined) continue;
    if (playerTarget && def.playerTarget !== true) continue;
    if (!def.visible(ctx)) continue;
    while (builtinIndex < BUILTIN_MENU_OPTIONS.length) {
      const builtin = BUILTIN_MENU_OPTIONS[builtinIndex];
      if (menuOptionOrderCompare(builtin.order, builtin.id, def.order, def.id) > 0) break;
      pushBuiltinMenuOption(options, ctx, builtinIndex);
      builtinIndex++;
    }
    const disabledReason = def.disabledReason?.(ctx);
    options.push({
      id: def.id,
      label: def.label(ctx),
      order: def.order,
      disabled: !!disabledReason,
      disabledReason,
    });
  }
  while (builtinIndex < BUILTIN_MENU_OPTIONS.length) {
    pushBuiltinMenuOption(options, ctx, builtinIndex);
    builtinIndex++;
  }
  options.sort((a, b) => menuOptionOrderCompare(a.order, a.id, b.order, b.id));
  return options;
}

export function clampNpcMenuSelection(state: GameState, options: readonly NpcMenuOption[]): void {
  state.npcMenuSel = Math.max(0, Math.min(Math.max(0, options.length - 1), state.npcMenuSel));
}

export function npcMenuOptionAt(ctx: NpcInteractionContext, index: number): NpcMenuOption | undefined {
  const options = getNpcMenuOptions(ctx);
  clampNpcMenuSelection(ctx.state, options);
  return options[Math.max(0, Math.min(options.length - 1, index))];
}

export function npcMenuSelectionFor(ctx: NpcInteractionContext, preferredId: string): number {
  const options = getNpcMenuOptions(ctx);
  const index = options.findIndex(option => option.id === preferredId);
  return index >= 0 ? index : 0;
}

export function openNpcInteractionInterface(ctx: NpcInteractionContext, request: NpcInteractionInterfaceRequest): void {
  runtime.open = true;
  runtime.id = request.id;
  runtime.title = request.title;
  runtime.npcId = ctx.npc.id;
  runtime.npcName = ctx.npc.name ?? 'NPC';
  runtime.lines = request.lines.slice(0, 8);
  runtime.priceRubles = request.priceRubles;
  runtime.stakeRubles = request.stakeRubles;
  runtime.message = request.message ?? '';
  ctx.state.showNpcMenu = true;
  ctx.state.npcMenuTab = NPC_MENU_INTERFACE_TAB;
  ctx.state.paused = true;
}

export function closeNpcInteractionInterface(state?: GameState): void {
  // Whatever table was on the panel folds up with it, whichever game it was.
  for (const game of tabletopGames()) game.close();
  runtime.open = false;
  runtime.id = '';
  runtime.title = '';
  runtime.npcId = -1;
  runtime.npcName = '';
  runtime.lines = [];
  runtime.priceRubles = undefined;
  runtime.stakeRubles = undefined;
  runtime.message = '';
  if (state?.npcMenuTab === NPC_MENU_INTERFACE_TAB) state.npcMenuTab = 'main';
}

export function isNpcInteractionInterfaceOpen(): boolean {
  return runtime.open;
}

export function getNpcInteractionInterfaceSnapshot(): NpcInteractionInterfaceSnapshot {
  return { ...runtime, lines: [...runtime.lines] };
}

export function activateNpcCustomMenuOption(ctx: NpcInteractionContext, optionId: string): boolean {
  const def = customOptions.find(option => option.id === optionId);
  if (!def || !def.visible(ctx)) return false;
  const disabledReason = def.disabledReason?.(ctx);
  if (disabledReason) {
    ctx.state.msgs.push(msg(disabledReason, ctx.state.time, '#f84'));
    return true;
  }
  def.activate(ctx);
  return true;
}

registerNpcInteractionOption({
  id: 'demos_profile',
  order: 5,
  label: () => 'Профиль Демоса',
  visible: ctx => canOpenDemosProfileForNpc(ctx.npc),
  activate: ctx => {
    const cursor = demosCursorForNpcProfile(ctx.state, ctx.npc);
    if (cursor === undefined) {
      ctx.state.msgs.push(msg('Профиль Демоса не найден.', ctx.state.time, '#888'));
      return;
    }
    closeNpcInteractionInterface(ctx.state);
    ctx.state.showNpcMenu = false;
    ctx.state.showDemos = true;
    ctx.state.demosCursor = cursor;
    ctx.state.demosSearch = '';
    ctx.state.demosSearchActive = false;
    ctx.state.demosTab = 'profile';
    ctx.state.demosFeedScroll = 0;
    ctx.state.demosPostCursor = 0;
  },
});

registerNpcInteractionOption({
  id: 'craft_recipe_lesson',
  order: 25,
  label: () => 'Спросить схему',
  visible: ctx => npcRecipeLesson(ctx) !== undefined,
  activate: ctx => {
    const lesson = npcRecipeLesson(ctx);
    if (!lesson) {
      ctx.state.msgs.push(msg('Рецепт уже известен', ctx.state.time, '#888'));
      return;
    }
    const learned = learnCraftRecipe(ctx.state, lesson.recipeId, lesson.source.id);
    const learnedLines = learned ? [craftRecipeLearnedMessage(lesson.recipeId)] : [];
    for (const line of learnedLines) ctx.state.msgs.push(msg(line, ctx.state.time, '#8cf'));
    openNpcInteractionInterface(ctx, {
      id: 'craft_recipe_lesson',
      title: 'СХЕМА',
      lines: [
        `${ctx.npc.name ?? 'NPC'}: «${lesson.source.text}»`,
        ...learnedLines.slice(0, 4),
      ],
      message: learnedLines.length > 0 ? 'Рецепт записан в журнал крафта.' : 'Рецепт уже известен.',
    });
  },
});

for (const profile of allDesignFloorProfiles()) {
  for (const option of profile.npcInteractions ?? []) {
    registerNpcInteractionOption({
      id: option.id,
      order: option.order,
      label: () => designFloorInteractionLabel(option),
      visible: ctx => designFloorInteractionVisible(profile.routeId, option, ctx),
      disabledReason: ctx => designFloorInteractionDisabledReason(option, ctx),
      activate: ctx => openDesignFloorInteraction(option, ctx),
    });
  }
}

registerNpcInteractionOption({
  id: 'arena',
  order: 5,
  label: () => 'Арена',
  visible: ctx => ctx.npc.id === getPlotNpcNumericId('marko_lolo'),
  activate: ctx => {
    openArena(ctx);
  },
});

function getNpcOccupationStateText(ctx: NpcInteractionContext): string {
  const npc = ctx.npc;
  const ai = npc.ai;

  // Build AI-state context tags for Markov core
  const extraTags: string[] = ['activity_query'];
  if (ai) {
    if (ai.npcState !== undefined) extraTags.push(`ai_state.${ai.npcState}`);
    if (ai.goal !== undefined) extraTags.push(`ai_goal.${ai.goal}`);
  }

  // Resolve target room name if NPC is traveling
  let targetRoomName: string | undefined;
  if (ai && Number.isFinite(ai.tx) && Number.isFinite(ai.ty)) {
    targetRoomName = ctx.roomDefIdResolver?.(ai.tx, ai.ty);
    if (targetRoomName) extraTags.push(`target_room`);
  }

  const snapshot = buildContextSnapshot(npc, {
    player: ctx.player,
    state: ctx.state,
    time: ctx.state.time,
  });

  const repeatIndex = Math.floor((ctx.state.time ?? 0) / 60);

  const result = renderMarkovDialogueTalk(npc, snapshot, {
    time: ctx.state.time,
    repeatIndex,
    extraTags,
  });

  // Build a concrete factual prefix about the NPC's current activity
  const prefix = npcActivityPrefix(ai, targetRoomName);
  if (prefix) {
    return `${prefix} ${result.text}`;
  }
  return result.text;
}

/**
 * Returns a short factual prefix describing what the NPC is actually doing.
 * This provides concrete A-Life info (room name, goal) that Markov core
 * can't fabricate on its own.
 */
function npcActivityPrefix(
  ai: AIState | undefined,
  targetRoomName: string | undefined,
): string | undefined {
  if (!ai) return undefined;

  switch (ai.npcState) {
    case NpcState.SLEEPING: return 'Сейчас отдыхаю.';
    case NpcState.MORNING: return 'Занят делами.';
    case NpcState.WORKING: return 'Работаю.';
    case NpcState.LUNCH: return 'Ищу, где поесть.';
    case NpcState.HIDING: return 'Прячусь!';
    case NpcState.PATROL: return 'На обходе.';
    case NpcState.MEETING: return 'Общаюсь по делу.';
    case NpcState.BREAK: return 'Отдыхаю.';
    case NpcState.TRAVELING:
      if (targetRoomName) return `Иду в «${targetRoomName}».`;
      return 'В пути.';
    case NpcState.FREE_TIME:
      if (ai.goal === AIGoal.WANDER) return 'Слоняюсь.';
      return 'Без срочных дел.';
    default:
      break;
  }

  // Fallback by AI goal if npcState is not set
  switch (ai.goal) {
    case AIGoal.EAT: return 'Ищу еду.';
    case AIGoal.DRINK: return 'Ищу воду.';
    case AIGoal.SLEEP: return 'Ложусь спать.';
    case AIGoal.TOILET: return 'Занят.';
    case AIGoal.HIDE:
    case AIGoal.FLEE: return 'Прячусь!';
    case AIGoal.HUNT: return 'Ищу цель.';
    case AIGoal.WORK: return 'Работаю.';
    case AIGoal.GOTO:
      if (targetRoomName) return `Иду в «${targetRoomName}».`;
      return 'Иду по делам.';
    default:
      return undefined;
  }
}

registerNpcInteractionOption({
  id: 'current_activity',
  order: 15,
  label: () => 'Моё занятие',
  visible: ctx => ctx.npc.type === EntityType.NPC && ctx.npc.alive,
  activate: ctx => {
    const text = getNpcOccupationStateText(ctx);
    openNpcInteractionInterface(ctx, {
      id: 'current_activity',
      title: 'ТЕКУЩЕЕ ЗАНЯТИЕ',
      lines: [
        `${ctx.npc.name ?? 'NPC'}: «${text}»`
      ],
      message: 'Текущий статус',
    });
  },
});

const TABLETOP_GROUP = 'tabletop';

/* ── Tabletop games ────────────────────────────────────────────
 * Every board and card game gets its menu line from the registry, so adding one
 * is a single registration in `systems/<game>.ts` and nothing here. Wording is
 * uniform on purpose: label, stake, and the two reasons a table cannot start. */
registerNpcMenuGroup({
  id: TABLETOP_GROUP,
  // The count is on the line so nobody opens an empty shelf: it already tells
  // you how many sets are actually on this table.
  label: ctx => `Сыграть (${tabletopGames().filter(g => sideHasSet(ctx, g.itemId)).length})`,
  order: 30,
});

for (const game of tabletopGames()) {
  registerNpcInteractionOption({
    id: game.id,
    group: TABLETOP_GROUP,
    playerTarget: true,
    order: game.order,
    label: ctx => `${game.menuLabel} (₽${tableStake(ctx, game)})`,
    visible: ctx => portalAllowsCasinoLikeContent() && sideHasSet(ctx, game.itemId),
    disabledReason: ctx => {
      const stake = tableStake(ctx, game);
      if (stake <= 0) return isNetworkedPlayerActor(ctx.npc) ? 'Ставку не покрыть.' : 'У NPC нет денег для ставки.';
      if (cleanMoney(ctx.player) < stake) return `Нужно ₽${stake} для ставки.`;
      return undefined;
    },
    activate: ctx => {
      const stake = tableStake(ctx, game);
      if (!game.start(ctx, { stake })) {
        ctx.state.msgs.push(msg('Партию не удалось разложить.', ctx.state.time, '#f84'));
        return;
      }
      const intro = game.intro({ opponent: ctx.npc, stake });
      openNpcInteractionInterface(ctx, {
        id: game.id,
        title: game.title,
        stakeRubles: stake,
        lines: intro.lines,
        message: intro.message,
      });
    },
  });
}

/** Against an NPC the stake is its own ten percent; across a co-op table the
 *  poorer purse sets it, so both sides can actually cover the bet. */
function tableStake(ctx: NpcInteractionContext, game: TabletopGameDef): number {
  return isNetworkedPlayerActor(ctx.npc)
    ? Math.min(game.stake(ctx.player), game.stake(ctx.npc))
    : game.stake(ctx.npc);
}

/** One set on the table is enough: either chair may be the one carrying it. */
function sideHasSet(ctx: NpcInteractionContext, itemId: string): boolean {
  return countItem(ctx.player, itemId) > 0 || countItem(ctx.npc, itemId) > 0;
}

registerNpcInteractionOption({
  id: COOP_BARTER_ID,
  playerTarget: true,
  order: 20,
  label: () => 'Обмен',
  // Only ever between two humans: an NPC sells at a price, it does not swap.
  visible: ctx => isNetworkedPlayerActor(ctx.npc),
  activate: () => { /* routed as a co-op proposal before it ever gets here */ },
});

import { EntityType, msg, type Entity, type GameState } from '../core/types';
import { craftRecipeSourcesForNpc, type CraftRecipeSourceDef } from '../data/craft_recipe_sources';
import { DESIGN_FLOOR_ROUTES } from '../data/design_floors';
import { craftRecipeLearnedMessage, isCraftRecipeKnown, learnCraftRecipe } from './crafting';
import { closeDiceGame, diceStakeFromNpc, startDiceGame } from './dice';
import { closeDominoGame, dominoStakeFromNpc, startDominoGame } from './domino';
import { closeDurakGame, durakStakeFromNpc, startDurakGame } from './durak';
import { canOpenDemosProfileForNpc, demosCursorForNpcProfile } from './demos_profiles';
import { portalAllowsCasinoLikeContent } from './platform_bridge';
import { npcHasQuestMarker } from './quests';
import { controlBindingLabel } from './controls';

export const CARD_DECK_ITEM_ID = 'card_deck';
export const DICE_BONE_ITEM_ID = 'dice_bone';
export const DOMINO_BOX_ITEM_ID = 'domino_box';
export const NPC_MENU_INTERFACE_TAB = 'interface';

export interface NpcInteractionContext {
  state: GameState;
  player: Entity;
  npc: Entity;
  entities?: readonly Entity[];
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
}

interface NpcRecipeLesson {
  source: CraftRecipeSourceDef;
  recipeId: string;
}

const customOptions: NpcInteractionOptionDef[] = [];
const BUILTIN_MENU_OPTIONS = [
  { id: 'talk', label: 'Говорить', order: 0 },
  { id: 'quest', label: 'Задание', questMarkerLabel: 'Задание !', order: 10 },
  { id: 'trade', label: 'Торг', order: 20 },
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

function hasCardDeck(ctx: NpcInteractionContext): boolean {
  return countItem(ctx.player, CARD_DECK_ITEM_ID) > 0 || countItem(ctx.npc, CARD_DECK_ITEM_ID) > 0;
}

function hasDice(ctx: NpcInteractionContext): boolean {
  return countItem(ctx.player, DICE_BONE_ITEM_ID) > 0 || countItem(ctx.npc, DICE_BONE_ITEM_ID) > 0;
}

function hasDominoBox(ctx: NpcInteractionContext): boolean {
  return countItem(ctx.player, DOMINO_BOX_ITEM_ID) > 0 || countItem(ctx.npc, DOMINO_BOX_ITEM_ID) > 0;
}

function durakStake(ctx: NpcInteractionContext): number {
  return durakStakeFromNpc(ctx.npc);
}

function diceStake(ctx: NpcInteractionContext): number {
  return diceStakeFromNpc(ctx.npc);
}

function dominoStake(ctx: NpcInteractionContext): number {
  return dominoStakeFromNpc(ctx.npc);
}

function currentRouteId(state: GameState): string {
  const z = (state as GameState & { floorRun?: { currentZ?: number } }).floorRun?.currentZ;
  if (typeof z !== 'number' || !Number.isFinite(z)) return '';
  return DESIGN_FLOOR_ROUTES.find(route => route.z === Math.trunc(z))?.id ?? '';
}

function isFloor69Worker(npc: Entity): boolean {
  if (npc.type !== EntityType.NPC || !npc.alive) return false;
  if (npc.plotNpcId === 'f69_performer_ira') return true;
  return npc.name === 'Ира Сцена' || (npc.name?.startsWith('Этаж 69: работница ') ?? false);
}

function floor69EntertainmentPrice(): number {
  return 45;
}

function hashString32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function npcRecipeLessonKey(npc: Entity): string {
  return [
    npc.persistentNpcId ?? '',
    npc.plotNpcId ?? '',
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
  const label = def.id === 'quest' && npcHasQuestMarker(ctx.npc, ctx.state) ? def.questMarkerLabel : def.label;
  options.push({ id: def.id, label, order: def.order });
}

export function getNpcMenuOptions(ctx: NpcInteractionContext): NpcMenuOption[] {
  const options: NpcMenuOption[] = [];
  let builtinIndex = 0;
  for (const def of customOptions) {
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
  closeDurakGame();
  closeDiceGame();
  closeDominoGame();
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

registerNpcInteractionOption({
  id: 'durak',
  order: 30,
  label: ctx => `Играть в дурака (₽${durakStake(ctx)})`,
  visible: ctx => portalAllowsCasinoLikeContent() && hasCardDeck(ctx),
  disabledReason: ctx => {
    const stake = durakStake(ctx);
    if (stake <= 0) return 'У NPC нет денег для ставки.';
    if (cleanMoney(ctx.player) < stake) return `Нужно ₽${stake} для ставки в дурака.`;
    return undefined;
  },
  activate: ctx => {
    const stake = durakStake(ctx);
    if (!startDurakGame(ctx)) {
      ctx.state.msgs.push(msg('Партию в дурака не удалось разложить.', ctx.state.time, '#f84'));
      return;
    }
    openNpcInteractionInterface(ctx, {
      id: 'durak',
      title: 'ДУРАК',
      stakeRubles: stake,
      lines: [
        `${ctx.npc.name ?? 'NPC'} кладет колоду на край стола. Козырь открыт.`,
        `Ставка зафиксирована: 10% от денег NPC, сейчас ₽${stake}.`,
        'Подкидной дурак на двоих, без перевода.',
      ],
      message: 'Деньги переходят только после победы или сдачи.',
    });
  },
});

registerNpcInteractionOption({
  id: 'dice',
  order: 31,
  label: ctx => `Играть в кости (₽${diceStake(ctx)})`,
  visible: ctx => portalAllowsCasinoLikeContent() && hasDice(ctx),
  disabledReason: ctx => {
    const stake = diceStake(ctx);
    if (stake <= 0) return 'У NPC нет денег для ставки.';
    if (cleanMoney(ctx.player) < stake) return `Нужно ₽${stake} для ставки в кости.`;
    return undefined;
  },
  activate: ctx => {
    const stake = diceStake(ctx);
    if (!startDiceGame(ctx)) {
      ctx.state.msgs.push(msg('Кости не легли на стол.', ctx.state.time, '#f84'));
      return;
    }
    openNpcInteractionInterface(ctx, {
      id: 'dice',
      title: 'КОСТИ',
      stakeRubles: stake,
      lines: [
        `${ctx.npc.name ?? 'NPC'} ставит пару костей на бетон.`,
        `Ставка зафиксирована: 10% от денег NPC, сейчас ₽${stake}.`,
        'Бросайте до 21. Перебор проигрывает; равный счет оставляет деньги при себе.',
      ],
      message: `${controlBindingLabel('gameMenu')} бросить, ${controlBindingLabel('drop')} стоп: передать ход NPC.`,
    });
  },
});

registerNpcInteractionOption({
  id: 'domino',
  order: 32,
  label: ctx => `Играть в домино (₽${dominoStake(ctx)})`,
  visible: ctx => portalAllowsCasinoLikeContent() && hasDominoBox(ctx),
  disabledReason: ctx => {
    const stake = dominoStake(ctx);
    if (stake <= 0) return 'У NPC нет денег для ставки.';
    if (cleanMoney(ctx.player) < stake) return `Нужно ₽${stake} для ставки в домино.`;
    return undefined;
  },
  activate: ctx => {
    const stake = dominoStake(ctx);
    if (!startDominoGame(ctx)) {
      ctx.state.msgs.push(msg('Домино не разложилось на столе.', ctx.state.time, '#f84'));
      return;
    }
    openNpcInteractionInterface(ctx, {
      id: 'domino',
      title: 'ДОМИНО',
      stakeRubles: stake,
      lines: [
        `${ctx.npc.name ?? 'NPC'} высыпает костяшки из коробки.`,
        `Ставка зафиксирована: 10% от денег NPC, сейчас ₽${stake}.`,
        'По 7 костяшек. Кладите к совпадающему краю; если хода нет, добирайте из коробки.',
      ],
      message: `${controlBindingLabel('gameMenu')} сыграть/добрать, ${controlBindingLabel('drop')} меняет левый/правый край.`,
    });
  },
});

registerNpcInteractionOption({
  id: 'floor69_entertainment',
  order: 40,
  label: () => `Развлечься (₽${floor69EntertainmentPrice()})`,
  visible: ctx => portalAllowsCasinoLikeContent() && currentRouteId(ctx.state) === 'floor_69' && isFloor69Worker(ctx.npc),
  disabledReason: ctx => {
    const price = floor69EntertainmentPrice();
    if (cleanMoney(ctx.player) < price) return `Нужно ₽${price}.`;
    return undefined;
  },
  activate: ctx => {
    const price = floor69EntertainmentPrice();
    openNpcInteractionInterface(ctx, {
      id: 'floor69_entertainment',
      title: 'ЭТАЖ 69',
      priceRubles: price,
      lines: [
        `${ctx.npc.name ?? 'Работница'} называет цену и смотрит на дверь.`,
        `Цена: ₽${price}.`,
        'Закрытая сцена будет реализована позже; сейчас это атмосферный вход в будущий интерфейс.',
      ],
      message: 'Оплата пока не списана: сцена не реализована.',
    });
  },
});

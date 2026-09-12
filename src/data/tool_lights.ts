/* Ярус «горит сам, пока держишь в руке» СНЯТ 2026-09-10 по решению владельца.
 * Поле `passive` стояло `false` у всех четырёх источников света, то есть расход,
 * замедление ходьбы и яркость пассивного света были написаны, подключены к
 * рендеру, движению и прочности — и не включены ни у одного предмета. Свет в
 * игре зажигается ТОЛЬКО удержанием кнопки использования, и так было всегда.
 * Вернуть поведение — это строка данных, а не воскрешение яруса. */
export interface ToolLightDef {
  id: string;
  drainPerSecond: number;
  renderIntensity: number;
  minChargeRatio: number;
  moveMultiplier: number;
  actorLightScore: number;
  dropLightScore: number;
}

export const TOOL_LIGHT_DEFS: readonly ToolLightDef[] = [
  {
    id: 'flashlight',
    drainPerSecond: 1,
    renderIntensity: 1,
    minChargeRatio: 0.25,
    moveMultiplier: 1,
    actorLightScore: 0.72,
    dropLightScore: 0.74,
  },
  {
    id: 'lighter',
    drainPerSecond: 1, // small drain
    renderIntensity: 0.6, // weaker than flashlight (1)
    minChargeRatio: 0.25,
    moveMultiplier: 1,
    actorLightScore: 0.45,
    dropLightScore: 0.45,
  },
  {
    id: 'liquidator_flashlamp',
    drainPerSecond: 1.15,
    renderIntensity: 1.35,
    minChargeRatio: 0.22,
    moveMultiplier: 0.82,
    actorLightScore: 0.9,
    dropLightScore: 0.88,
  },
  {
    id: 'uv_spotlight',
    drainPerSecond: 0,
    renderIntensity: 0,
    minChargeRatio: 0,
    moveMultiplier: 1,
    actorLightScore: 0,
    dropLightScore: 0,
  },
];

const TOOL_LIGHT_BY_ID: Readonly<Record<string, ToolLightDef>> = Object.fromEntries(
  TOOL_LIGHT_DEFS.map(def => [def.id, def]),
);

export function toolLightDef(toolId: string | undefined): ToolLightDef | undefined {
  return toolId ? TOOL_LIGHT_BY_ID[toolId] : undefined;
}

export function activeToolLightDrainPerSecond(toolId: string | undefined): number {
  const def = toolLightDef(toolId);
  return def && def.renderIntensity > 0 ? def.drainPerSecond : 0;
}

export function activeToolLightMoveMultiplier(toolId: string | undefined): number {
  const def = toolLightDef(toolId);
  return def && def.renderIntensity > 0 ? def.moveMultiplier : 1;
}

export function activeToolLightRenderIntensity(
  toolId: string | undefined,
  durability: { cur: number; max: number } | null,
): number {
  const def = toolLightDef(toolId);
  if (!def || def.renderIntensity <= 0 || !durability || durability.max <= 0 || durability.cur <= 0) return 0;
  const charge = Math.max(def.minChargeRatio, Math.min(1, durability.cur / durability.max));
  return def.renderIntensity * charge;
}

/** Насколько заметен человек с источником света В РУКЕ.
 *
 *  Спрашивают трое, и все трое молчали, пока ответом был ноль: противодействие
 *  гермодверному буру (`systems/hermodoor_borer.ts`), опознание светящегося
 *  актора у Лишенного и его же выбор цели по свету (`ai/monster.ts`). Ноль они
 *  получали не по замыслу, а через снятое поле `passive`: света «сам по себе» в
 *  игре нет, значит условие не выполнялось никогда.
 *
 *  Ответ теперь про НОШЕНИЕ, а не про то, зажат ли курок в этот кадр: все три
 *  спрашивающих задают вопрос «этот человек с фонарём?», а не «светит ли он
 *  прямо сейчас». */
export function equippedToolLightScore(toolId: string | undefined): number {
  return toolLightDef(toolId)?.actorLightScore ?? 0;
}

export function droppedToolLightScore(itemId: string): number {
  return toolLightDef(itemId)?.dropLightScore ?? 0;
}

/* Свет, брошенный на пол, светит и НЕ будучи инструментом: свеча горит, лампа
 * бликует. Числа стояли двумя ветками внутри боевого AI (`ai/monster.ts`), то
 * есть ядро знало предметы по имени. Место им здесь, рядом с остальным светом.
 * В `TOOL_LIGHT_DEFS` их заводить нельзя: оттуда предмет получает расход,
 * замедление и яркость В РУКЕ, а свечу в руке игра не зажигает. */
const NON_TOOL_DROP_LIGHT_SCORES: Readonly<Record<string, number>> = {
  istotit_candle: 0.64,
  lamp_bulb: 0.32,
};

/** Насколько заметен ЛЮБОЙ брошенный источник света — инструмент или нет. */
export function droppedLightScore(itemId: string): number {
  return NON_TOOL_DROP_LIGHT_SCORES[itemId] ?? droppedToolLightScore(itemId);
}

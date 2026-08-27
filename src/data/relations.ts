/* ── Faction-to-faction relation system ───────────────────────── */

import { Faction, Occupation } from '../core/types';
import { OCCUPATION_PROFILES } from './occupation_profiles';
import { hash32, rng } from '../core/rand';

/* ── Constants ────────────────────────────────────────────────── */
export const FACTION_COUNT = 6; // CITIZEN, LIQUIDATOR, CULTIST, SCIENTIST, WILD, PLAYER

/* ── Отношение: одно число на пару ────────────────────────────────
 * Кто угодно к кому угодно — фракция к фракции, человек к человеку,
 * человек к игроку — измеряется одной шкалой и хранится в одном знаковом
 * байте. Диапазон — весь байт минус единственное значение, отданное под
 * «не задано»; второй шкалы, второго клампа и конвертации между ними в
 * проекте быть не должно, каждая такая пара — будущий рассинхрон.
 * Пороги — ровно половина пути в каждую сторону. */
export const RELATION_UNSET = -128;
export const RELATION_MIN = -127;
export const RELATION_MAX = 127;
export const RELATION_HOSTILE_THRESHOLD = -64;
/* Дружба — зеркало вражды, и порог у неё выводится из того же числа, а не
 * пишется своим. Асимметричные пороги (−64 против +32) означали, что другом
 * становятся вдвое дешевле, чем врагом, а полосы ярлыков сверху и снизу мерили
 * шкалу разным шагом. Разница сторон живёт в ТАБЛИЦЕ баз, а не в порогах. */
export const RELATION_FRIENDLY_THRESHOLD = -RELATION_HOSTILE_THRESHOLD;

export function clampRelation(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(RELATION_MIN, Math.min(RELATION_MAX, Math.round(value)));
}

/* ── Dynamic faction relation matrix — Int8Array flat ────────── */
// factionRels[a * FACTION_COUNT + b] = how faction a feels about faction b (-127..127)
const factionRels = new Int8Array(FACTION_COUNT * FACTION_COUNT);

/* ── Get / set / add faction relation ─────────────────────────── */
export function getFactionRel(a: number, b: number): number {
  return factionRels[a * FACTION_COUNT + b];
}

export function setFactionRel(a: number, b: number, v: number): void {
  factionRels[a * FACTION_COUNT + b] = clampRelation(v);
}

export function addFactionRel(a: number, b: number, delta: number): void {
  setFactionRel(a, b, getFactionRel(a, b) + delta);
}

export function addFactionRelMutual(a: number, b: number, delta: number): void {
  addFactionRel(a, b, delta);
  addFactionRel(b, a, delta);
}

/* ── Затухание к базе: единственный ограничитель обид ─────────────
 *
 * Любое отношение — пары фракций в матрице, личности к фракции в её восьми
 * ячейках — медленно тянется обратно к тому числу, с которого начало. Без этого
 * ЛЮБАЯ обида вечна, и долгий прогон неизбежно сползает во всеобщую войну:
 * влить в число можно сколько угодно, вылить нельзя ничем.
 *
 * Форма — пропорциональная: за один визит снимается ЧЕТВЕРТЬ накопленного
 * отклонения, и целочисленный сдвиг сам даёт мёртвую зону. Отсюда два свойства,
 * ради которых форма и выбрана, и ни одно из них не пришлось задавать ручкой:
 *
 * 1. Отклонение меньше четырёх не рассасывается вовсе (`|drift| >> 2 === 0`).
 *    Мелкая обида и мелкая заслуга помнятся вечно — в том числе награда за
 *    поручение (`QUEST_FACTION_RELATION_DELTA`), которую плоское затухание
 *    съело бы на первом же такте.
 * 2. Крупная обида не столько «забывается», сколько УПИРАЕТСЯ В ТЕМП НАСИЛИЯ:
 *    отклонение встаёт там, где приток за визит сравнивается с четвертью
 *    остатка, то есть примерно вчетверо выше притока. Пока бьют — число висит
 *    низко; перестали бить — оно возвращается за десяток визитов. Это
 *    пропорциональный регулятор, а не таймер, и потолка обиде он не ставит
 *    вручную.
 *
 * Один сдвиг на обе шкалы: две ручки разъехались бы, а доля читается по той же
 * формуле, куда бы человек ни смотрел. */
export const RELATION_DECAY_SHIFT = 2;

/** Шаг к базе за один визит. Ноль — значит отклонение уже в мёртвой зоне. */
export function relationDecayStep(value: number, base: number): number {
  const drift = value - base;
  const step = Math.abs(drift) >> RELATION_DECAY_SHIFT;
  if (step === 0) return 0;
  return drift > 0 ? -step : step;
}

/** Затухание глобальной матрицы. Тридцать недиагональных пар — весь проход,
 *  диагональ не мнение, а принадлежность, и её никто не двигает. */
export function decayFactionMatrixTowardBase(): number {
  let moved = 0;
  for (let a = 0; a < FACTION_COUNT; a++) {
    for (let b = 0; b < FACTION_COUNT; b++) {
      if (a === b) continue;
      const step = relationDecayStep(getFactionRel(a, b), factionBaseRelation(a, b));
      if (step === 0) continue;
      addFactionRel(a, b, step);
      moved++;
    }
  }
  return moved;
}

/* ── Наборы дельт: словарь мутаций матрицы ────────────────────── */
// Живут рядом с матрицей, а не в systems/factions: это её собственный
// вокабуляр, и любой системе (пропуска, контейнеры, панели) он нужен без
// остальной фракционной логики — иначе получается импортный цикл.
export type FactionRelationDelta = readonly [Faction, number];

export function applyFactionRelationDeltas(
  deltas: readonly FactionRelationDelta[],
  actor: Faction = Faction.PLAYER,
): Record<string, number> {
  const applied: Record<string, number> = {};
  for (const [faction, delta] of deltas) {
    if (delta === 0) continue;
    addFactionRelMutual(actor, faction, delta);
    applied[Faction[faction] ?? String(faction)] = (applied[Faction[faction] ?? String(faction)] ?? 0) + delta;
  }
  return applied;
}

/* ── Узкий социальный штраф за замеченную/выявленную кражу ────── */
export function applyTheftRelationPenalty(
  victimFaction: Faction | undefined,
  witnessed: boolean,
  audited: boolean,
): number {
  if (victimFaction === undefined || victimFaction === Faction.PLAYER) return 0;
  if (!witnessed && !audited) return 0;

  const penalty = witnessed ? -4 : -2;
  addFactionRelMutual(victimFaction, Faction.PLAYER, penalty);
  return penalty;
}

export function applyRoomMemoryRelationPenalty(victimFaction: Faction | undefined, severity: number): number {
  if (victimFaction === undefined || victimFaction === Faction.PLAYER) return 0;
  const penalty = severity >= 5 ? -2 : -1;
  addFactionRelMutual(victimFaction, Faction.PLAYER, penalty);
  return penalty;
}

export function applyInfrastructureRelationResponse(
  ownerFaction: Faction | null | undefined,
  action: 'repair' | 'shutdown' | 'force' | 'overload',
): number {
  if (ownerFaction === null || ownerFaction === undefined || ownerFaction === Faction.PLAYER) return 0;
  const delta = action === 'repair'
    ? (ownerFaction === Faction.WILD ? 0 : 1)
    : action === 'shutdown'
      ? -1
      : action === 'force'
        ? -2
        : -4;
  if (delta !== 0) addFactionRelMutual(Faction.PLAYER, ownerFaction, delta);
  return delta;
}

/* ── Base faction attitudes (used for initialization) ─────────── */
/* [строка][столбец] = как СМОТРЯЩИЙ относится к ТОЙ фракции.
 *
 * Таблица асимметрична намеренно, и это её главное свойство: ликвидатор смотрит
 * на жителя сверху вниз (−24), житель на ликвидатора — с надеждой (+16). Раньше
 * матрица была симметричной и записана порогами, из-за чего целые пары молча
 * меняли смысл при сдвиге порога.
 *
 * Числа тут — НЕ приговор, а середина распределения: живое отношение конкретного
 * человека рождается из этой клетки плюс индивидуальный разброс (см. ниже), и
 * именно расстояние клетки до порога вражды задаёт ДОЛЮ тех, кто считает
 * фракцию врагом. Поэтому −64 читается не как «враги», а как «половина против».
 *
 * Диагональ оставлена на самом верху шкалы. Своя фракция — не мнение, а
 * принадлежность: `areSameSide` строит на ней ответную агрессию, а личная
 * вражда внутри стороны идёт отдельным каналом графа Демоса. При базе +64
 * разброс родил бы примерно троих на сто тысяч, ненавидящих своих с рождения;
 * при KIN — ни одного.
 *
 * Строка и столбец игрока живут своей жизнью: у игрока отдельный канал
 * отношения, и трогать его эта работа не должна. Союз записан зеркалом вражды. */
const HOSTILE = RELATION_HOSTILE_THRESHOLD;
/* Зеркало полосы «ненавидит» (−96): 84% личных друзей у пары. */
const ALLY = RELATION_FRIENDLY_THRESHOLD + 32;
const KIN = RELATION_MAX;
const BASE_FACTION_MATRIX: number[][] = [
  /*                CIT   LIQ   CUL   SCI  WILD   PLAYER  */
  /* CITIZEN  */ [  KIN,   48,  -56,   72,  -72,    ALLY ],
  /* LIQUID.  */ [  -24,  KIN, -120,   48,  -96,    ALLY ],
  /* CULTIST  */ [  -56,  -96,  KIN,  -64,  -24,       0 ],
  /* SCIENTIST*/ [   72,  -24,  -56,  KIN,  -96,    ALLY ],
  /* WILD     */ [  -72, -120,  -56,  -96,  KIN, HOSTILE ],
  /* PLAYER   */ [ ALLY, ALLY,    0, ALLY, HOSTILE,  KIN ],
];

/** База пары «смотрящий → фракция». Неизменна за прогон: живая матрица ходит
 *  под игроком, а рождение личности обязано быть воспроизводимым из семени. */
export function factionBaseRelation(a: number, b: number): number {
  return BASE_FACTION_MATRIX[a]?.[b] ?? 0;
}

/* ── Личное отношение человека к фракции ──────────────────────────
 *
 * Восемь знаковых байт на личность — по одному на фракцию, три про запас.
 * Хранятся плоско рядом с остальными колонками A-Life (`systems/alife.ts`),
 * пишутся один раз при рождении и дальше двигаются только событиями.
 *
 * Ширина разброса — единственная ручка, и она задаёт не «характер», а ДОЛЮ:
 * доля тех, кто считает фракцию врагом, равна Φ((−64 − база) / σ). При σ = 32
 * база −24 даёт 11%, −56 — 40%, −64 — ровно половину, −96 — 84%, −120 — 96%.
 * Тем же счётом читается верх шкалы: доля личных ДРУЗЕЙ равна Φ((база − 64)/σ),
 * то есть +96 — 84%, +72 — 60%, +48 — 31%, 0 — 2.3%. Двигать σ значит двигать
 * все двадцать пар разом. */
export const NPC_FACTION_ATTITUDE_SLOTS = 8;
export const NPC_FACTION_ATTITUDE_SIGMA = 32;

/* Гауссиана вокруг нуля, детерминированно от личности и цели.
 *
 * Сумма двенадцати равномерных (Ирвин–Холл): шестьдесят бит из двух слов хеша,
 * по пять на слагаемое. Сумма пятибитных полей лежит в [0, 372] со средним 186
 * и σ = 31.98 — те самые 32 с точностью 0.06%, а хвост доходит до ±5.8σ, чего
 * требует доля 0.06% на базе +40 (это 3.25σ). Бокс-Мюллер дал бы неограниченный
 * хвост и два логарифма на ячейку, а ячеек — восемь на каждую из ста тысяч
 * личностей, и считаются они в один присест при создании прогона.
 *
 * Соль третьим аргументом — обычно номер фракции, но не обязательно им: тем же
 * разбросом рождается личное отношение к ИГРОКУ, у которого база берётся не из
 * таблицы, а из живой матрицы. Разброс один на все каналы отношения намеренно:
 * доля читается по одной формуле, куда бы человек ни смотрел. */
export function attitudeSpread(seed: number, alifeId: number, targetFaction: number): number {
  const lo = hash32(seed, alifeId, 0x5a17 + targetFaction);
  const hi = hash32(alifeId, targetFaction, seed ^ 0x9e3779b9);
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += ((lo >>> (i * 5)) & 31) + ((hi >>> (i * 5)) & 31);
  return (sum - 186) * (NPC_FACTION_ATTITUDE_SIGMA / 32);
}

/** Отношение личности к фракции при рождении: база таблицы плюс её разброс.
 *  Кламп общий, поэтому в служебное `RELATION_UNSET` значение не попадает. */
export function npcFactionAttitudeAtBirth(
  viewerFaction: number,
  targetFaction: number,
  seed: number,
  alifeId: number,
): number {
  return clampRelation(factionBaseRelation(viewerFaction, targetFaction) + attitudeSpread(seed, alifeId, targetFaction));
}

/* ── Initialize dynamic faction relations from base matrix ────── */
export function initFactionRelations(): void {
  for (let a = 0; a < FACTION_COUNT; a++) {
    for (let b = 0; b < FACTION_COUNT; b++) {
      setFactionRel(a, b, BASE_FACTION_MATRIX[a][b]);
    }
  }
}

/* ── Reset only the PLAYER row/column to base (death-continuation) ─ */
// On death-rebirth the player continues as a different body. Faction↔faction
// politics stay as persistent world state, but the player's personal standing
// resets: the reborn actor is not recognized as "the player". Only PLAYER's
// row (how the player feels) and column (how others feel about the player) revert.
export function resetPlayerFactionRelations(): void {
  const p = Faction.PLAYER;
  for (let f = 0; f < FACTION_COUNT; f++) {
    setFactionRel(p, f, BASE_FACTION_MATRIX[p][f]);
    setFactionRel(f, p, BASE_FACTION_MATRIX[f][p]);
  }
}

/* ── Snapshot / restore the dynamic matrix for save persistence ─── */
// The matrix is persistent world state that must survive save/load. Snapshot is
// a flat FACTION_COUNT² array of Int8 relation values; restore overlays a saved
// snapshot onto the current (base-initialized) matrix and ignores malformed input.
export function snapshotFactionRelations(): number[] {
  return Array.from(factionRels);
}

export function restoreFactionRelations(input: unknown): void {
  if (!Array.isArray(input) || input.length !== FACTION_COUNT * FACTION_COUNT) return;
  for (let i = 0; i < input.length; i++) {
    const v = input[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    factionRels[i] = Math.max(-128, Math.min(127, v | 0));
  }
}



/* ── Faction names ────────────────────────────────────────────── */
export const FACTION_NAMES: Record<Faction, string> = {
  [Faction.CITIZEN]: 'Гражданин',
  [Faction.LIQUIDATOR]: 'Ликвидатор',
  [Faction.CULTIST]: 'Культист',
  [Faction.SCIENTIST]: 'Учёный',
  [Faction.WILD]: 'Дикий',
  [Faction.PLAYER]: 'Игрок',
};

/* ── Occupation names ─────────────────────────────────────────── */
export const OCCUPATION_NAMES: Record<Occupation, string> = {
  ...Object.fromEntries(Object.values(OCCUPATION_PROFILES).map(profile => [profile.occupation, profile.label])),
} as Record<Occupation, string>;

/* ── Weighted faction/occupation assignment ────────────────────── */
export function randomFaction(): Faction {
  const r = rng();
  if (r < 0.40) return Faction.CITIZEN;
  if (r < 0.60) return Faction.LIQUIDATOR;
  if (r < 0.75) return Faction.CULTIST;
  if (r < 0.90) return Faction.SCIENTIST;
  return Faction.WILD;
}

/* ── Weighted occupation distribution (faction-independent) ───── */
// домохозяйка 10%, слесарь 10%, секретарь 10%, электрик 10%, повар 5%,
// врач 5%, токарь 10%, механик 10%, кладовщик 10%, алкоголик 5%,
// учёный 5%, ребёнок 10%, директор 1%
const OCC_WEIGHTS: [Occupation, number][] = Object.values(OCCUPATION_PROFILES)
  .filter(profile => profile.defaultGenerationWeight > 0)
  .map(profile => [profile.occupation, profile.defaultGenerationWeight] as [Occupation, number]);
const OCC_TOTAL = OCC_WEIGHTS.reduce((s, [, w]) => s + w, 0);

export function randomOccupation(_faction: Faction): Occupation {
  let r = rng() * OCC_TOTAL;
  for (const [occ, w] of OCC_WEIGHTS) {
    r -= w;
    if (r <= 0) return occ;
  }
  return Occupation.HOUSEWIFE;
}

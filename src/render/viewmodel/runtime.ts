/**
 * Моторика рук и сборка кадра вьюмодели.
 *
 * Всё состояние здесь — рендерное и недолговечное: фаза шага, откат отдачи,
 * увод при смене. В сейв не попадает ничего, геймплей отсюда не решается, и
 * пропажа этого состояния стоит ровно одного дёрганого кадра.
 *
 * Считается ОТ АКТОРА. Одержимость меняет тело — руки меняются вместе с ним
 * сами, потому что читаются `actor.weapon` и `actor.tool`, а не глобал игрока.
 * Смена тела распознаётся по идентификатору и сбрасывает моторику: иначе новое
 * тело унаследовало бы чужую отдачу.
 */

import type { Entity } from '../../core/types';
import type { World } from '../../core/world';
import { muzzleFlashSprite, MUZZLE_FLASH_KEY } from './flash';
import { viewmodelDef } from './registry';
import { viewmodelDefIdFor, viewmodelSprite } from './cache';
import { EMPTY_VIEWMODEL_FRAME, VM } from './types';
import type {
  ViewmodelFrameKey,
  ViewmodelFrameState,
  ViewmodelMotion,
  ViewmodelQuad,
  ViewmodelSlot,
} from './types';

/** Общая моторика. Пакет вправе её домножить, но не заменить. */
const BASE_MOTION: ViewmodelMotion = { recoil: 1, bob: 1, swap: 0.22, flash: 0.06 };

/**
 * Шагов покачивания на клетку пути.
 *
 * Взято от камеры (`CAMERA_BOB_STEP_RATE`), но НЕ импортом: там частота живёт
 * во времени и завязана на высоту глаза, здесь — в пройденном расстоянии, и
 * общая константа связала бы два разных смысла одним числом.
 */
const BOB_STEPS_PER_CELL = 2.4;

/**
 * На сколько холст утоплен ниже кадра.
 *
 * Раньше он ложился ровно по нижнему срезу, и предплечье кончалось вместе с
 * экраном — снизу читалась собственная граница спрайта. Запас съедается краем
 * кадра: рука уходит из вида, а не обрывается в нём. Доля от стороны холста, а
 * не своё число, — чтобы масштаб вьюмодели двигался одной величиной.
 */
const VIEWMODEL_OVERHANG = VM >> 4;

interface SlotState {
  /** Что реально показано сейчас: при смене отстаёт от актора на такт увода. */
  shownId: string;
  /** 0 — в руках, 1 — уведено вниз за край кадра. */
  swap: number;
  /** 1 сразу после удара/выстрела, гаснет к нулю. */
  recoil: number;
  /** Секунды свечения вспышки. */
  flash: number;
}

interface RuntimeState {
  actorId: number;
  prevX: number;
  prevY: number;
  prevAttackCd: number;
  bobPhase: number;
  bobAmount: number;
  weapon: SlotState;
  tool: SlotState;
}

function emptySlot(): SlotState {
  return { shownId: '', swap: 1, recoil: 0, flash: 0 };
}

let state: RuntimeState = {
  actorId: -1,
  prevX: 0,
  prevY: 0,
  prevAttackCd: 0,
  bobPhase: 0,
  bobAmount: 0,
  weapon: emptySlot(),
  tool: emptySlot(),
};

let frame: ViewmodelFrameState = EMPTY_VIEWMODEL_FRAME;

export interface ViewmodelUpdate {
  /** Тело, чьими глазами смотрим. Не обязательно родное тело игрока. */
  actor: Entity;
  world: World;
  /** Секунды кадра. */
  dt: number;
  /** Часы интерфейса: идут и в паузе, годятся для дыхания в покое. */
  time: number;
  /** Размер низкого кадра. Приходит снаружи, чтобы константы не двоились. */
  screenW: number;
  screenH: number;
  /** Фоновая освещённость этажа. */
  ambient: number;
  /** Яркость фонаря 0..1: он в левой руке и светит на правую. */
  flashlight: number;
  /** Смерть, кат-сцена, ролик — рук не видно. */
  hidden: boolean;
}

function resetSlots(): void {
  state.weapon = emptySlot();
  state.tool = emptySlot();
  state.bobPhase = 0;
  state.bobAmount = 0;
}

function motionFor(defId: string | undefined): ViewmodelMotion {
  const def = defId ? viewmodelDef(defId) : undefined;
  return def?.motion ? { ...BASE_MOTION, ...def.motion } : BASE_MOTION;
}

/** Увод и подъём при смене вещи в руке. */
function tickSlot(slot: SlotState, wantedId: string, dt: number, motion: ViewmodelMotion, fired: boolean): void {
  const swapRate = dt / Math.max(0.04, motion.swap);
  if (slot.shownId !== wantedId) {
    slot.swap = Math.min(1, slot.swap + swapRate);
    // Меняем показанное на дне увода: подмена наверху была бы рывком.
    if (slot.swap >= 1) slot.shownId = wantedId;
  } else {
    slot.swap = Math.max(0, slot.swap - swapRate);
  }
  if (fired && slot.swap <= 0.5) {
    slot.recoil = 1;
    slot.flash = motion.flash;
  }
  slot.recoil = Math.max(0, slot.recoil - dt / 0.16);
  slot.flash = Math.max(0, slot.flash - dt);
}

/** Свет на руках: тот же контракт, что у спрайтов и живности. */
function handTint(u: ViewmodelUpdate): readonly [number, number, number] {
  const idx = u.world.idx(u.actor.x | 0, u.actor.y | 0);
  const lit = u.world.light[idx] ?? 0;
  const ambient = Math.max(0, Math.min(1, u.ambient));
  // Фонарь в руке светит в упор, поэтому его вклад тут больше, чем у мира.
  const value = Math.pow(Math.max(0, Math.min(1, ambient + lit * (1 - ambient) + u.flashlight * 0.62)), 1.32);
  // Тёплый фонарь, холодная лампа: иначе руки одинаково серые при любом свете.
  const warm = u.flashlight * 0.1;
  return [value * (1 + warm), value * (1 + warm * 0.55), value * (1 - warm * 0.35)] as const;
}

/**
 * Какой кадр просить у пакета.
 *
 * Замах проверяется РАНЬШЕ выстрела: вспышка тикает у любого оружия, а кадра
 * `fire` у ближнего боя нет, и проверка в обратном порядке съедала первые
 * полкадра удара, откатывая пилу и топор обратно в покой.
 */
function frameKey(slot: SlotState, actor: Entity, ranged: boolean): ViewmodelFrameKey {
  if (!ranged && slot.recoil > 0.05) return slot.recoil > 0.55 ? 'swing' : 'swing2';
  if (slot.flash > 0) return 'fire';
  if (actor.reloading) return 'reload';
  return 'idle';
}

function buildQuad(
  slotName: ViewmodelSlot,
  slot: SlotState,
  u: ViewmodelUpdate,
  tint: readonly [number, number, number],
  out: ViewmodelQuad[],
): void {
  // Полностью уведённая рука не рисуется вовсе: квад за краем кадра — это
  // отрисовка, за которую платят каждый кадр и не видят ничего.
  if (slot.swap >= 1) return;
  const itemId = slot.shownId;
  const defId = viewmodelDefIdFor(slotName, itemId);
  if (!defId) return;
  const def = viewmodelDef(defId);
  if (!def) return;
  const motion = motionFor(defId);
  // Дальнобойное — то, у чего пакет объявил кадр выстрела, а не то, у чего
  // есть дуло: бросок гранаты тоже имеет `fire`, но вспышки у него нет.
  const ranged = def.frames.includes('fire');
  const key = frameKey(slot, u.actor, ranged);
  const sprite = viewmodelSprite(slotName, itemId, key);
  if (!sprite) return;

  /* Классика Doom: оружие по центру-снизу, инструмент силуэтом слева.
   *
   * Холст УТОПЛЕН ниже кадра на восьмую долю своей стороны. Раньше он ложился
   * ровно по нижнему срезу, и предплечье кончалось вместе с экраном: снизу была
   * видна собственная граница спрайта — тёмный контур поперёк руки. Запас
   * съедается краем кадра, и рука уходит из вида, а не обрывается в нём. */
  const baseX = slotName === 'weapon' ? (u.screenW - VM) * 0.5 : 0;
  const baseY = u.screenH - VM + VIEWMODEL_OVERHANG;

  const walk = state.bobAmount;
  const idle = 1 - walk;
  const bob = motion.bob;
  let x = baseX
    + Math.sin(state.bobPhase) * 5 * walk * bob
    + Math.sin(u.time * 0.63) * 1.4 * idle;
  let y = baseY
    + (1 - Math.cos(state.bobPhase * 2)) * 2.2 * walk * bob
    + Math.sin(u.time * 0.41) * 1.1 * idle;

  // Взгляд вверх опускает руки в кадре — то же, что делает камера с горизонтом.
  y -= (u.actor.pitch ?? 0) * 14;
  // Отдача уводит вглубь и вверх; у ближнего боя тот же откат играет замах.
  y += slot.recoil * 13 * motion.recoil;
  x -= slot.recoil * 2 * motion.recoil * (slotName === 'weapon' ? 1 : -1);
  if (u.actor.reloading) y += 16;
  y += slot.swap * VM;

  const roll = -slot.recoil * 0.05 * motion.recoil + (u.actor.reloading ? 0.1 : 0);

  out.push({
    key: `${slotName}|${itemId}|${key}`,
    sprite,
    x,
    y,
    scale: 1,
    roll,
    tint,
    alpha: 1,
    additive: false,
  });

  // Вспышка ставится на дуло пакета и складывается со сценой, а не закрывает её.
  if (slot.flash > 0 && def.muzzle) {
    const t = slot.flash / Math.max(0.001, motion.flash);
    out.push({
      key: MUZZLE_FLASH_KEY,
      sprite: muzzleFlashSprite(),
      x: x + def.muzzle[0] - VM * 0.5,
      y: y + def.muzzle[1] - VM * 0.5,
      scale: 0.72 + (1 - t) * 0.5,
      roll,
      tint: [1, 1, 1],
      alpha: t,
      additive: true,
    });
  }
}

/** Такт моторики. Зовётся раз в кадр до отрисовки сцены. */
export function updateViewmodel(u: ViewmodelUpdate): void {
  const actor = u.actor;
  if (state.actorId !== actor.id) {
    state.actorId = actor.id;
    state.prevX = actor.x;
    state.prevY = actor.y;
    state.prevAttackCd = actor.attackCd ?? 0;
    resetSlots();
  }

  if (u.hidden || !actor.alive) {
    // Руки УЕЗЖАЮТ вниз, а не гаснут кадром, поэтому кадр продолжает
    // собираться, пока они не ушли за край: смерть и кат-сцена читаются
    // движением. Полностью уведённая рука отсекается в `buildQuad`.
    state.weapon.swap = Math.min(1, state.weapon.swap + u.dt / BASE_MOTION.swap);
    state.tool.swap = Math.min(1, state.tool.swap + u.dt / BASE_MOTION.swap);
    const leaving: ViewmodelQuad[] = [];
    const leavingTint = handTint(u);
    buildQuad('tool', state.tool, u, leavingTint, leaving);
    buildQuad('weapon', state.weapon, u, leavingTint, leaving);
    frame = leaving.length ? { quads: leaving } : EMPTY_VIEWMODEL_FRAME;
    return;
  }

  // Пройденный путь берётся по тору: иначе шов мира давал бы рывок в пол-мира.
  const moved = Math.hypot(u.world.delta(state.prevX, actor.x), u.world.delta(state.prevY, actor.y));
  state.prevX = actor.x;
  state.prevY = actor.y;

  const moving = moved > 1e-4 && u.dt > 0;
  state.bobPhase = (state.bobPhase + moved * BOB_STEPS_PER_CELL * Math.PI) % (Math.PI * 2);
  const target = moving ? 1 : 0;
  const rate = u.dt * (moving ? 7 : 5);
  state.bobAmount += (target - state.bobAmount) * Math.min(1, rate);

  // Выстрел и удар распознаются по СКАЧКУ отката атаки вверх: он ставится
  // ровно в момент применения оружия и виден рендеру без нового события.
  const attackCd = actor.attackCd ?? 0;
  const fired = attackCd > state.prevAttackCd + 1e-4;
  state.prevAttackCd = attackCd;

  tickSlot(state.weapon, actor.weapon ?? '', u.dt, motionFor(viewmodelDefIdFor('weapon', actor.weapon)), fired);
  tickSlot(state.tool, actor.tool ?? '', u.dt, motionFor(viewmodelDefIdFor('tool', actor.tool)), false);

  const tint = handTint(u);
  const quads: ViewmodelQuad[] = [];
  // Инструмент рисуется первым: оружие по центру перекрывает его, а не наоборот.
  buildQuad('tool', state.tool, u, tint, quads);
  buildQuad('weapon', state.weapon, u, tint, quads);
  frame = quads.length ? { quads } : EMPTY_VIEWMODEL_FRAME;
}

/** Готовый кадр для прохода отрисовки. */
export function viewmodelFrame(): ViewmodelFrameState {
  return frame;
}

/** Сброс моторики: смена этажа, пересборка визуала, тесты. */
export function resetViewmodelRuntime(): void {
  state = {
    actorId: -1,
    prevX: 0,
    prevY: 0,
    prevAttackCd: 0,
    bobPhase: 0,
    bobAmount: 0,
    weapon: emptySlot(),
    tool: emptySlot(),
  };
  frame = EMPTY_VIEWMODEL_FRAME;
}

import { EntityType, type Entity, type GameState, msg } from '../core/types';
import { registerDebugCommand } from './debug_registry';

let debugOnePunchMan = false;

/**
 * Неуязвимость игрока. Источников три, и два из них — не читерство.
 *
 * `trailerMode` и `sceneLock` означают одно и то же: КАДР НЕ ПРИНАДЛЕЖИТ ИГРОКУ.
 * Управление отобрано, он не может ни отойти, ни выстрелить, ни закрыть дверь — и
 * убивать его в это время нечестно по построению. Смерть под сценой к тому же
 * рвёт саму сцену: замок снимается обрывом, кадр возвращается посреди фразы.
 *
 * Снимается это само и гарантированно: `sceneLock` гасят и конец сцены, и обрыв
 * снаружи — смерть, смена этажа, загрузка сейва. Отдельного «снять неуязвимость»
 * не существует, а значит его нельзя забыть.
 */
export function isDebugOnePunchManEnabled(state?: Pick<GameState, 'trailerMode' | 'sceneLock'>): boolean {
  return debugOnePunchMan || (state?.trailerMode ?? false) || (state?.sceneLock ?? false);
}

export function toggleDebugOnePunchMan(): boolean {
  debugOnePunchMan = !debugOnePunchMan;
  return debugOnePunchMan;
}

export function debugOnePunchMeleeDamage(target: Entity, normalDamage: number): number {
  if (!debugOnePunchMan) return normalDamage;
  if (target.type !== EntityType.MONSTER && target.type !== EntityType.NPC) return normalDamage;
  return Math.max(normalDamage, Math.ceil(target.hp ?? target.maxHp ?? 1));
}

export function keepDebugOnePunchManAlive(player: Entity, state?: Pick<GameState, 'trailerMode' | 'sceneLock'>): void {
  if (!isDebugOnePunchManEnabled(state)) return;
  player.alive = true;
  player.maxHp = Math.max(1, player.maxHp ?? 100);
  player.hp = player.maxHp;
}

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой: меню собирает реестр, а не список в
 * debug.ts. Чтобы добавить ещё одну, допишите ещё один registerDebugCommand. */

registerDebugCommand({
  /* Toggle Onepunchman cheat */
  id: 'toggle_onepunchman',
  group: 'cheat',
  label: 'ONEPUNCHMAN',
  run: ({ player, state }) => {
    const enabled = toggleDebugOnePunchMan();
    if (enabled) keepDebugOnePunchManAlive(player);
    state.msgs.push(msg(
      `[DEBUG] ONEPUNCHMAN ${enabled ? 'включён' : 'выключен'}`,
      state.time,
      enabled ? '#ff0' : '#888',
    ));
  } });

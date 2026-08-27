import { type Entity, type GameState, type WorldContainer } from '../core/types';
import { SAVE_SHAPE_VERSION } from '../core/save_shape';
import { snapshotFactionRelations } from '../data/relations';
import { activeBetEscrowAmount } from './arena_betting';
import { alifeMobilityForSave } from './alife_migration';
import { bankingForSave } from './banking';
import { alifeForSave } from './alife';
import { computersStateForSave } from './computers';
import { craftingForSave } from './crafting';
import { demosSocialForSave } from './demos_save';
import { economyForSave } from './economy';
import { trimEventHistoryForSave } from './events';
import { floorInstanceStateForSave } from './floor_instances';
import { liftArachnaStateForSave } from './lift_arachna';
import { mapEditorPatchStateForSave } from './map_editor';
import { netHackStateForSave } from './net_hack';
import { netTerminalGenStateForSave } from './net_terminal_gen';
import { productionForSave } from './production';
import { pseudoliftStateForSave } from './pseudolift';
import { floorRunStateForSave } from './procedural_floors';
import { buildSavePayload, type SavePayload } from './save_payload';
import { stockMarketForSave } from './stock_market';

export interface SaveRuntimeExtras {
  voidReturnPortal?: unknown;
  voidEntryFromFloor?: unknown;
  floorMemory?: unknown;
  playedScenes?: unknown;
}

export type GameSavePayload = SavePayload & { version: number };

export function createGameSavePayload(
  player: Entity,
  state: GameState,
  containers: readonly WorldContainer[],
  extras: SaveRuntimeExtras = {},
): GameSavePayload {
  const payload = buildSavePayload({
    player,
    state,
    containers,
    sections: {
      floorRun: floorRunStateForSave(state),
      floorInstances: floorInstanceStateForSave(state),
      voidReturnPortal: extras.voidReturnPortal,
      voidEntryFromFloor: extras.voidEntryFromFloor,
      liftArachna: liftArachnaStateForSave(state),
      pseudolift: pseudoliftStateForSave(state),
      floorMemory: extras.floorMemory,
      playedScenes: extras.playedScenes,
      alife: alifeForSave(state),
      alifeMobility: alifeMobilityForSave(state),
      computers: computersStateForSave(),
      netHack: netHackStateForSave(),
      netTerminalGen: netTerminalGenStateForSave(state),
      mapEditorPatches: mapEditorPatchStateForSave(state),
      worldEvents: trimEventHistoryForSave(state),
      crafting: craftingForSave(state),
      demosSocial: demosSocialForSave(state),
      economy: economyForSave(state),
      banking: bankingForSave(state),
      stockMarket: stockMarketForSave(state),
      production: productionForSave(state),
      factionRelations: snapshotFactionRelations(),
    },
  });
  // Залог арены возвращается игроку прямо в снимке: дуэль в сейв не идёт
  // (модульное состояние на сущностях активного этажа), а ставка без дуэли не
  // сыграет — деньги при этом уже списаны. Это правило транзиентных полей из
  // `save.md`, а не отдельная секция: сохранять нечего, кроме суммы, которая
  // и так обязана вернуться. Живой кошелёк не трогается — `buildSavePayload`
  // строит игроку отдельный объект, и текущий прогон доигрывает ставку как
  // обычно.
  const arenaEscrow = activeBetEscrowAmount();
  if (arenaEscrow > 0) payload.player.money = (payload.player.money ?? 0) + arenaEscrow;
  return {
    version: SAVE_SHAPE_VERSION,
    ...payload,
  };
}

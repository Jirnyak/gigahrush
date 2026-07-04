import type { GameState } from '../core/types';
import { msg } from '../core/types';
import { crittersEnabled } from './ui_orchestrator';

let lowFpsFrames = 0;

export function checkPerformance(fps: number, state: GameState) {
    if (crittersEnabled() && fps < 30 && fps > 0) {
        lowFpsFrames++;
        if (lowFpsFrames > 300) { // Approx 5 seconds at 60 fps
            state.msgs.push(msg('Низкая производительность. Рекомендуем отключить живность в настройках (U).', state.time, '#fc8'));
            lowFpsFrames = 0; // Reset
        }
    } else {
        lowFpsFrames = 0;
    }
}

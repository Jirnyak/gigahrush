import { Entity, EntityType } from '../core/types.js';
import { GameState } from '../core/types.js';
import { World } from '../core/world.js';
import { audioSuspended } from './audio.js';
import { masterAudioEnabled, musicVolume } from './ui_orchestrator.js';
import { mathRng } from '../core/rand.js';

// Import all .ogg files from the music folder. Vite will bundle them (as base64 via viteSingleFile or as static assets).
const musicFiles = import.meta.glob('../../music/*.ogg', { eager: true, as: 'url' });

export type MusicContext = 'safezone' | 'fight' | 'ambient';

class MusicSystem {
  private currentContext: MusicContext = 'ambient';
  private currentTrackName: string | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private fadeOutAudio: HTMLAudioElement | null = null;
  private fadeTimer: number = 0;
  private playPending: boolean = false;
  private readonly fadeDuration = 2.0; // 2 seconds crossfade

  private tracks: Record<string, string> = {};

  constructor() {
    for (const [path, url] of Object.entries(musicFiles)) {
      const name = path.split('/').pop()?.replace('.ogg', '');
      if (name) {
        this.tracks[name] = url as string;
      }
    }
  }

  private pickTrack(context: MusicContext): string | null {
    const prefix = context === 'fight' ? 'fightsong' : context === 'ambient' ? 'ambientsong' : 'safezone';
    const valid = Object.keys(this.tracks).filter(name => name.startsWith(prefix));
    
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0];

    let nextTrack;
    do {
      nextTrack = valid[Math.floor(mathRng() * valid.length)];
    } while (nextTrack === this.currentTrackName);
    
    return nextTrack;
  }

  private onTrackEnded = () => {
    const nextTrack = this.pickTrack(this.currentContext);
    if (nextTrack && this.currentAudio) {
      this.currentTrackName = nextTrack;
      this.currentAudio.src = this.tracks[nextTrack];
      this.playPending = true;
      this.currentAudio.play().finally(() => { this.playPending = false; }).catch(() => {});
    }
  };

  public tick(world: World, entities: readonly Entity[], cameraTarget: Entity, state: GameState, dt: number) {

    // 1. Determine context
    let newContext: MusicContext = 'ambient';

    const cx = Math.floor(cameraTarget.x);
    const cy = Math.floor(cameraTarget.y);
    
    const ci = world.idx(cx, cy);
    if (world.aptMask[ci]) {
      newContext = 'safezone';
    } else {
      // Check fight
      let inFight = false;
      const fightRadius2 = 15 * 15;
      
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (!e.alive || (e.hp !== undefined && e.hp <= 0)) continue;
        if (e.id === cameraTarget.id) continue;
        
        if (e.type === EntityType.MONSTER || (e.type === EntityType.NPC && e.ai?.combatTargetId === cameraTarget.id)) {
          if (world.dist2(e.x, e.y, cameraTarget.x, cameraTarget.y) <= fightRadius2) {
            inFight = true;
            break;
          }
        }
      }
      if (inFight) {
        newContext = 'fight';
      }
    }

    // Crossfade logic
    const masterVolume = (audioSuspended() || state.trailerMode || !masterAudioEnabled()) ? 0 : 0.4 * musicVolume();

    if (this.fadeTimer > 0) {
      this.fadeTimer -= dt;
      const p = Math.max(0, this.fadeTimer / this.fadeDuration);
      if (this.currentAudio) {
        this.currentAudio.volume = Math.max(0, Math.min(1, (1 - p) * masterVolume));
        if (this.currentAudio.paused && masterVolume > 0 && !this.playPending) {
          this.playPending = true;
          this.currentAudio.play().finally(() => { this.playPending = false; }).catch(() => {});
        }
      }
      if (this.fadeOutAudio) {
        this.fadeOutAudio.volume = Math.max(0, Math.min(1, p * masterVolume));
      }
      if (this.fadeTimer <= 0 && this.fadeOutAudio) {
        this.fadeOutAudio.pause();
        this.fadeOutAudio.removeAttribute('src');
        this.fadeOutAudio.load();
        this.fadeOutAudio = null;
      }
    } else {
      if (this.currentAudio) {
        this.currentAudio.volume = Math.max(0, Math.min(1, masterVolume));
        if (this.currentAudio.paused && masterVolume > 0 && !this.playPending) {
          this.playPending = true;
          this.currentAudio.play().finally(() => { this.playPending = false; }).catch(() => {});
        }
      }
    }

    // Switch context if needed
    if (newContext !== this.currentContext || !this.currentAudio) {
      this.currentContext = newContext;
      const nextTrack = this.pickTrack(newContext);
      
      if (nextTrack && nextTrack !== this.currentTrackName) {
        if (this.currentAudio) {
          this.currentAudio.removeEventListener('ended', this.onTrackEnded);
          if (this.fadeOutAudio) {
            this.fadeOutAudio.pause();
            this.fadeOutAudio.removeAttribute('src');
            this.fadeOutAudio.load();
          }
          this.fadeOutAudio = this.currentAudio;
        }

        this.currentTrackName = nextTrack;
        this.currentAudio = new Audio(this.tracks[nextTrack]);
        this.currentAudio.addEventListener('ended', this.onTrackEnded);
        this.currentAudio.volume = 0;
        
        // Browsers block autoplay until interaction. The error is safely ignored.
        this.playPending = true;
        this.currentAudio.play().finally(() => { this.playPending = false; }).catch(() => {
          // Playback blocked, will try again naturally or just stay paused.
        });
        
        this.fadeTimer = this.fadeDuration;
      }
    }
  }

}

export const musicSystem = new MusicSystem();

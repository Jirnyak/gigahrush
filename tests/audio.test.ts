import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { playSoundAt, setAudioSuspendedForPage } from '../src/systems/audio';

class FakeGainNode {
  gain = { value: 0 };
  connect(): FakeGainNode { return this; }
  disconnect(): void {}
}

class FakeAudioContext {
  static constructed = 0;
  currentTime = 0;
  destination = {};
  sampleRate = 44100;
  state: AudioContextState = 'running';

  constructor() {
    FakeAudioContext.constructed++;
  }

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

test('positional audio does not wake context while page audio is suspended', () => {
  const globalWithAudio = globalThis as typeof globalThis & { AudioContext?: typeof AudioContext };
  const originalAudioContext = globalWithAudio.AudioContext;
  let played = false;

  globalWithAudio.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  FakeAudioContext.constructed = 0;
  setAudioSuspendedForPage(true);

  try {
    playSoundAt(() => { played = true; }, 0, 0);
    assert.equal(played, false);
    assert.equal(FakeAudioContext.constructed, 0);
  } finally {
    setAudioSuspendedForPage(false);
    if (originalAudioContext) {
      globalWithAudio.AudioContext = originalAudioContext;
    } else {
      delete globalWithAudio.AudioContext;
    }
  }
});

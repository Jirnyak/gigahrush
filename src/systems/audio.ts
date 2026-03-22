/* ── Procedural sound engine (Web Audio API) ─────────────────── */

let ctx: AudioContext | null = null;
let mainGain: GainNode | null = null;

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    mainGain = ctx.createGain();
    mainGain.gain.value = 0.3;
    mainGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function gain(): GainNode { return mainGain!; }

/* ── Footstep: short low thump ───────────────────────────────── */
export function playFootstep(): void {
  const ac = ensureContext();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = 60 + Math.random() * 30;
  g.gain.setValueAtTime(0.15, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  osc.connect(g).connect(gain());
  osc.start(); osc.stop(ac.currentTime + 0.12);
}

/* ── Attack swing: quick noise burst ─────────────────────────── */
export function playAttack(): void {
  const ac = ensureContext();
  const len = 0.15;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] = (Math.random() * 2 - 1) * (1 - t) * 0.5;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = 0.2;
  src.connect(g).connect(gain());
  src.start();
}

/* ── Door open/close: creaky tone ────────────────────────────── */
export function playDoor(): void {
  const ac = ensureContext();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.3);
  g.gain.setValueAtTime(0.08, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
  osc.connect(g).connect(gain());
  osc.start(); osc.stop(ac.currentTime + 0.35);
}

/* ── Monster growl: distorted buffer ─────────────────────────── */
export function playGrowl(): void {
  const ac = ensureContext();
  const len = 0.6;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / ac.sampleRate;
    const freq = 80 + Math.sin(t * 15) * 30;
    d[i] = Math.sin(t * freq * Math.PI * 2) * 0.4 * (1 - t / len)
         + (Math.random() * 2 - 1) * 0.1 * (1 - t / len);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = 0.15;
  src.connect(g).connect(gain());
  src.start();
}

/* ── Samosbor alarm: rising distorted siren ──────────────────── */
export function playSamosborAlarm(): void {
  const ac = ensureContext();
  const len = 3;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / ac.sampleRate;
    const freq = 200 + Math.sin(t * 4) * 150 + t * 100;
    d[i] = Math.sin(t * freq * Math.PI * 2) * 0.3
         + Math.sin(t * freq * 0.5 * Math.PI * 2) * 0.15;
    // Clip for distortion
    d[i] = Math.max(-0.5, Math.min(0.5, d[i] * 2));
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = 0.25;
  src.connect(g).connect(gain());
  src.start();
}

/* ── Pickup ding ─────────────────────────────────────────────── */
export function playPickup(): void {
  const ac = ensureContext();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.08);
  g.gain.setValueAtTime(0.12, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
  osc.connect(g).connect(gain());
  osc.start(); osc.stop(ac.currentTime + 0.15);
}

/* ── Gunshot: sharp percussive bang ───────────────────────────── */
export function playGunshot(): void {
  const ac = ensureContext();
  const len = 0.2;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    const env = Math.exp(-t * 20);
    d[i] = ((Math.random() * 2 - 1) * 0.8 + Math.sin(i * 0.05) * 0.3) * env;
    d[i] = Math.max(-1, Math.min(1, d[i] * 1.5));
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = 0.25;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  src.connect(lp).connect(g).connect(gain());
  src.start();
}

/* ── Shotgun: heavy boom ─────────────────────────────────────── */
export function playShotgun(): void {
  const ac = ensureContext();
  const len = 0.35;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    const env = Math.exp(-t * 12);
    d[i] = (Math.random() * 2 - 1) * env;
    d[i] += Math.sin(i * 0.015) * 0.4 * env;
    d[i] = Math.max(-1, Math.min(1, d[i] * 2));
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = 0.3;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500;
  src.connect(lp).connect(g).connect(gain());
  src.start();
}

/* ── Nailgun: rapid metallic clack ───────────────────────────── */
export function playNailgun(): void {
  const ac = ensureContext();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800 + Math.random() * 200, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.04);
  g.gain.setValueAtTime(0.15, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
  osc.connect(g).connect(gain());
  osc.start(); osc.stop(ac.currentTime + 0.06);
}

/* ── Weapon break: crunch ────────────────────────────────────── */
export function playBreak(): void {
  const ac = ensureContext();
  const len = 0.25;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] = (Math.random() * 2 - 1) * (1 - t) * 0.4;
    d[i] += Math.sin(i * 0.02 + Math.sin(i * 0.005) * 3) * 0.3 * (1 - t);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = 0.2;
  src.connect(g).connect(gain());
  src.start();
}

/* ── Ambient drone (looping) ─────────────────────────────────── */
let droneOsc: OscillatorNode | null = null;

export function startAmbientDrone(): void {
  const ac = ensureContext();
  if (droneOsc) return;
  droneOsc = ac.createOscillator();
  const g = ac.createGain();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 28;
  g.gain.value = 0.03;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 80;
  droneOsc.connect(lp).connect(g).connect(gain());
  droneOsc.start();
}

export function stopAmbientDrone(): void {
  if (droneOsc) {
    droneOsc.stop();
    droneOsc = null;
  }
}

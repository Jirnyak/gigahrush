import { randomTip } from './data/tips';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let animId = 0;
let active = false;
let currentTip = '';
let tipTime = 0;
let dots = 0;
let lastTime = 0;

const CANVAS_TEXT_GLITCH_CHARS = '#%&*+=?/\\<>[]{}';
const CANVAS_TEXT_GLITCH_RE = /[A-Za-zА-Яа-яЁё]/;

function canvasTextGlitchTick(): number {
  return Math.floor(performance.now() / 85);
}

function canvasTextGlitchHash(text: string, index: number, x: number, y: number, tick: number): number {
  let h = (0x811c9dc5 ^ tick ^ Math.round(x * 7) ^ Math.round(y * 13)) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) + i * 17;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= Math.imul(index + 1, 0x9e3779b9);
  h ^= h >>> 16;
  return h >>> 0;
}

function canvasTextGlitch(text: string, x: number, y: number): string {
  if (text.length < 4) return text;
  const chars = Array.from(text);
  const maxChanges = Math.max(1, Math.min(4, Math.floor(chars.length / 16)));
  const tick = canvasTextGlitchTick();
  let changed = 0;
  for (let i = 0; i < chars.length && changed < maxChanges; i++) {
    const ch = chars[i];
    if (!CANVAS_TEXT_GLITCH_RE.test(ch)) continue;
    const h = canvasTextGlitchHash(text, i, x, y, tick);
    // Use fixed pressure of 10 for loading screen
    if ((h % 1000) >= 10) continue;
    chars[i] = CANVAS_TEXT_GLITCH_CHARS[(h >>> 10) % CANVAS_TEXT_GLITCH_CHARS.length];
    changed++;
  }
  return changed > 0 ? chars.join('') : text;
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'init') {
    canvas = msg.canvas;
    ctx = canvas?.getContext('2d') as OffscreenCanvasRenderingContext2D;
  } else if (msg.type === 'resize') {
    width = msg.width;
    height = msg.height;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  } else if (msg.type === 'start') {
    if (!active) {
      active = true;
      currentTip = randomTip();
      tipTime = performance.now();
      lastTime = tipTime;
      dots = 0;
      loop(tipTime);
      requestAnimationFrame(() => {
        self.postMessage({ type: 'started' });
      });
    }
  } else if (msg.type === 'stop') {
    active = false;
    cancelAnimationFrame(animId);
    if (ctx && width && height) {
      ctx.clearRect(0, 0, width, height);
    }
  }
};

function loop(now: number) {
  if (!active) return;

  // Change tip every 5 seconds
  if (now - tipTime > 5000) {
    currentTip = randomTip();
    tipTime = now;
  }

  // Update dots every 300ms
  if (now - lastTime > 300) {
    dots = (dots + 1) % 4;
    lastTime = now;
  }

  if (ctx && width && height) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = '#aaa';
    ctx.font = `${Math.round(height / 20)}px monospace`;
    ctx.textAlign = 'center';

    const baseText = 'ЗАГРУЗКА';
    const dotsStr = '.'.repeat(dots);
    
    const centerX = width / 2;
    const centerY = height / 2;
    
    const glitchedBase = canvasTextGlitch(baseText, centerX, centerY);
    const baseWidth = ctx.measureText(glitchedBase).width;
    
    ctx.fillText(glitchedBase, centerX, centerY);
    
    ctx.textAlign = 'left';
    // Draw dots to the right of the centered word
    const glitchedDots = canvasTextGlitch(dotsStr, centerX + baseWidth / 2, centerY);
    ctx.fillText(glitchedDots, centerX + baseWidth / 2, centerY);

    const tipSize = Math.max(14, Math.round(height / 40));
    ctx.font = `${tipSize}px monospace`;
    ctx.fillStyle = '#777';
    
    const maxW = width * 0.85;
    const words = currentTip.split(' ');
    const lines: string[] = [];
    let line = words[0];
    
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    lines.push(line);
    
    const lineH = tipSize * 1.3;
    const startY = height / 2 + Math.round(height / 12);
    for (let i = 0; i < lines.length; i++) {
      const lineX = width / 2;
      const lineY = startY + i * lineH;
      const glitchedLine = canvasTextGlitch(lines[i], lineX, lineY);
      
      ctx.textAlign = 'center';
      ctx.fillText(glitchedLine, lineX, lineY);
    }
    
    ctx.textAlign = 'left';
  }

  animId = requestAnimationFrame(loop);
}

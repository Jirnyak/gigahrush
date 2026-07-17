import { randomTip } from './data/tips';
import { drawLoadingScreen } from './render/loading_screen';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let animId = 0;
let active = false;
let isFirstLoad = false;
let currentTip = '';
let tipTime = 0;
let dots = 0;
let lastTime = 0;
let progressStage = '';
let progressPct = 0;

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
      isFirstLoad = Boolean(msg.isFirstLoad);
      currentTip = randomTip();
      tipTime = performance.now();
      lastTime = tipTime;
      dots = 0;
      progressStage = '';
      progressPct = 0;
      loop(tipTime);
      requestAnimationFrame(() => {
        self.postMessage({ type: 'started' });
      });
    }
  } else if (msg.type === 'stop') {
    active = false;
    isFirstLoad = false;
    progressStage = '';
    progressPct = 0;
    cancelAnimationFrame(animId);
    if (ctx && width && height) {
      ctx.clearRect(0, 0, width, height);
    }
  } else if (msg.type === 'progress') {
    progressStage = msg.stage ?? '';
    progressPct = Math.max(0, Math.min(100, msg.pct ?? 0));
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
    drawLoadingScreen(ctx, width, height, now, isFirstLoad, progressStage, progressPct, dots, currentTip);
  }

  animId = requestAnimationFrame(loop);
}


import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { bindInput, createInput } from '../src/input';

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Event = new Event(type)): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
  }
}

class FakeDocument extends FakeEventTarget {
  hidden = false;
  pointerLockElement: Element | null = null;
}

class FakeWindow extends FakeEventTarget {}

class FakeCanvas extends FakeEventTarget {
  requestCount = 0;

  constructor(private readonly doc: FakeDocument) {
    super();
  }

  requestPointerLock(): void {
    this.requestCount++;
    this.doc.pointerLockElement = this as unknown as Element;
  }
}

function installInputDom(): { canvas: FakeCanvas; restore: () => void } {
  const doc = new FakeDocument();
  const win = new FakeWindow();
  const canvas = new FakeCanvas(doc);
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  return {
    canvas,
    restore: () => {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    },
  };
}

function mouseEvent(type: string, button = 0): MouseEvent {
  const event = new Event(type) as MouseEvent;
  Object.defineProperty(event, 'button', { value: button });
  return event;
}

test('canvas click requests pointer lock only when gameplay capture is allowed', () => {
  const env = installInputDom();
  try {
    let menuOpen = true;
    const blockedUnbind = bindInput(createInput(), env.canvas as unknown as HTMLCanvasElement, {
      shouldRequestPointerLock: () => !menuOpen,
    });
    env.canvas.dispatch('click');
    assert.equal(env.canvas.requestCount, 0);
    menuOpen = false;
    env.canvas.dispatch('click');
    assert.equal(env.canvas.requestCount, 1);
    blockedUnbind();

    const allowedUnbind = bindInput(createInput(), env.canvas as unknown as HTMLCanvasElement, {
      shouldRequestPointerLock: () => true,
    });
    env.canvas.dispatch('click');
    assert.equal(env.canvas.requestCount, 1);
    allowedUnbind();
  } finally {
    env.restore();
  }
});

test('canvas click does not request pointer lock after a menu click closes the menu', () => {
  const env = installInputDom();
  try {
    let menuOpen = true;
    const unbind = bindInput(createInput(), env.canvas as unknown as HTMLCanvasElement, {
      shouldRequestPointerLock: () => !menuOpen,
    });

    env.canvas.dispatch('mousedown', mouseEvent('mousedown'));
    menuOpen = false;
    env.canvas.dispatch('click');
    assert.equal(env.canvas.requestCount, 0);

    env.canvas.dispatch('mousedown', mouseEvent('mousedown'));
    env.canvas.dispatch('click');
    assert.equal(env.canvas.requestCount, 1);
    unbind();
  } finally {
    env.restore();
  }
});

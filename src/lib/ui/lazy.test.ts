import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterPaintIdle, loadOnce } from './lazy';

afterEach(() => vi.unstubAllGlobals());

describe('loadOnce', () => {
  it('shares an in-flight import with navigation and keeps the loaded module', async () => {
    const module = { default: 'step' };
    let resolve!: (value: typeof module) => void;
    const importModule = vi.fn(
      () => new Promise<typeof module>((done) => (resolve = done)),
    );
    const load = loadOnce(importModule);
    const prefetch = load();
    expect(load()).toBe(prefetch);
    resolve(module);
    expect(await load()).toBe(module);
    expect(importModule).toHaveBeenCalledTimes(1);
  });

  it('lets navigation retry a failed prefetch', async () => {
    const importModule = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('step');
    const load = loadOnce(importModule);
    await expect(load()).rejects.toThrow('offline');
    await expect(load()).resolves.toBe('step');
    expect(importModule).toHaveBeenCalledTimes(2);
  });
});

function scheduler(idle = true, readyState: DocumentReadyState = 'complete') {
  let frame!: () => void;
  let timer!: () => void;
  let idleWork!: () => void;
  const raf = vi.fn((callback: () => void) => {
    frame = callback;
    return 1;
  });
  const timeout = vi.fn((callback: () => void) => {
    timer = callback;
    return 2;
  });
  const requestIdle = vi.fn((callback: () => void) => {
    idleWork = callback;
    return 3;
  });
  const cancelFrame = vi.fn();
  const clearTimeout = vi.fn();
  const cancelIdle = vi.fn();
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  const events = new EventTarget();
  const document = { readyState };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    setTimeout: timeout,
    clearTimeout,
    ...(idle
      ? { requestIdleCallback: requestIdle, cancelIdleCallback: cancelIdle }
      : {}),
  });
  return {
    load: () => {
      document.readyState = 'complete';
      events.dispatchEvent(new Event('load'));
    },
    raf,
    paint: () => frame(),
    afterPaint: () => timer(),
    idle: () => idleWork(),
    timeout,
    requestIdle,
    cancelFrame,
    clearTimeout,
    cancelIdle,
  };
}

describe('afterPaintIdle', () => {
  it.each(['loading', 'interactive'] as const)(
    'waits for window load before scheduling the timer fallback when %s',
    (readyState) => {
      const clock = scheduler(false, readyState);
      const work = vi.fn();
      afterPaintIdle(work);
      expect(clock.raf).not.toHaveBeenCalled();
      expect(clock.timeout).not.toHaveBeenCalled();
      expect(work).not.toHaveBeenCalled();
      clock.load();
      expect(clock.raf).toHaveBeenCalledTimes(1);
      expect(work).not.toHaveBeenCalled();
      clock.paint();
      expect(work).not.toHaveBeenCalled();
      clock.afterPaint();
      expect(work).toHaveBeenCalledTimes(1);
      clock.load();
      expect(clock.raf).toHaveBeenCalledTimes(1);
    },
  );

  it('removes the load listener if prefetch is cancelled before load', () => {
    const clock = scheduler(false, 'loading');
    const work = vi.fn();
    const cancel = afterPaintIdle(work);
    cancel();
    clock.load();
    expect(clock.raf).not.toHaveBeenCalled();
    expect(clock.timeout).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it('waits for rendering, then idle time, before prefetching', () => {
    const clock = scheduler();
    const work = vi.fn();
    afterPaintIdle(work);
    expect(clock.raf).toHaveBeenCalledTimes(1);
    expect(clock.timeout).not.toHaveBeenCalled();
    clock.paint();
    expect(clock.requestIdle).not.toHaveBeenCalled();
    clock.afterPaint();
    expect(clock.requestIdle).toHaveBeenCalledWith(work, { timeout: 1000 });
    expect(work).not.toHaveBeenCalled();
    clock.idle();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('falls back after paint when a WebView has no idle callback', () => {
    const clock = scheduler(false);
    const work = vi.fn();
    afterPaintIdle(work);
    clock.paint();
    expect(work).not.toHaveBeenCalled();
    clock.afterPaint();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('cancels queued work when the step changes or app unmounts', () => {
    const clock = scheduler();
    const cancel = afterPaintIdle(vi.fn());
    clock.paint();
    clock.afterPaint();
    cancel();
    expect(clock.cancelFrame).toHaveBeenCalledWith(1);
    expect(clock.clearTimeout).toHaveBeenCalledWith(2);
    expect(clock.cancelIdle).toHaveBeenCalledWith(3);
  });
});

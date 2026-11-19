/** Share in-flight and completed imports; allow a failed chunk load to be retried. */
export function loadOnce<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

/** Wait for window load and paint before idle work; older WebViews use a timer. */
export function afterPaintIdle(work: () => void): () => void {
  let idle: number | undefined;
  let timer: number | undefined;
  let frame: number | undefined;
  const schedule = () => {
    frame = requestAnimationFrame(() => {
      // A timer scheduled from rAF runs after that frame's rendering opportunity.
      timer = window.setTimeout(() => {
        if (window.requestIdleCallback)
          idle = window.requestIdleCallback(work, { timeout: 1000 });
        else work();
      }, 0);
    });
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    window.removeEventListener('load', schedule);
    if (frame !== undefined) cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}

interface Visibility {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** One startup check, then six-hour checks; hidden windows defer until visible. */
export function scheduleUpdateChecks(
  check: () => void,
  visibility: Visibility = document,
): () => void {
  let pending = false;
  const due = () => {
    pending = visibility.hidden;
    if (!pending) check();
  };
  const visible = () => {
    if (pending && !visibility.hidden) due();
  };
  const first = setTimeout(due, 8000);
  const every = setInterval(due, 6 * 3600_000);
  visibility.addEventListener('visibilitychange', visible);
  return () => {
    clearTimeout(first);
    clearInterval(every);
    visibility.removeEventListener('visibilitychange', visible);
  };
}

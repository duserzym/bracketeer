import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleUpdateChecks } from './scheduler';

afterEach(() => vi.useRealTimers());

describe('update scheduling', () => {
  it('checks once at startup and only again after six hours, then stops on disposal', () => {
    vi.useFakeTimers();
    const visibility = Object.assign(new EventTarget(), { hidden: false });
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, visibility);
    vi.advanceTimersByTime(8000);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6 * 3600_000 - 8001);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(12 * 3600_000);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('coalesces hidden startup/interval checks into one check when shown', () => {
    vi.useFakeTimers();
    const visibility = Object.assign(new EventTarget(), { hidden: true });
    const check = vi.fn();
    const stop = scheduleUpdateChecks(check, visibility);
    vi.advanceTimersByTime(12 * 3600_000);
    expect(check).not.toHaveBeenCalled();
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledTimes(1);
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledTimes(1);
    visibility.hidden = true;
    vi.advanceTimersByTime(6 * 3600_000);
    stop();
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the startup check if disposed before it fires', () => {
    vi.useFakeTimers();
    const check = vi.fn();
    const stop = scheduleUpdateChecks(
      check,
      Object.assign(new EventTarget(), { hidden: false }),
    );
    stop();
    vi.advanceTimersByTime(24 * 3600_000);
    expect(check).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

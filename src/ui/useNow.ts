import { useCallback, useRef, useSyncExternalStore } from 'react';

/**
 * The current instant, re-read on an interval.
 *
 * A running timer is the only thing in the product that changes without
 * anybody touching it, and this is the one place that admits it. Everything
 * downstream — the elapsed clock, today's total, the estimate comparison —
 * takes `now` as an argument and stays pure, which is why all of them are
 * testable and this hook is not.
 *
 * The wall clock is an external store, so it is subscribed to as one rather
 * than copied into state from an effect: an effect that calls `setState` in its
 * body renders once stale and again fresh, every time the interval changes.
 *
 * Pass `null` to stop ticking. A drawer with no clock running should not
 * re-render every second to show the same thing.
 */
export function useNow(intervalMs: number | null): string {
  const snapshot = useRef(new Date().toISOString());

  const subscribe = useCallback(
    (changed: () => void) => {
      if (intervalMs === null) return () => {};

      // Read the clock the moment the subscription opens: a hook that has been
      // idle is holding an instant from whenever it last ticked, which may be
      // an hour ago.
      snapshot.current = new Date().toISOString();
      changed();

      const handle = window.setInterval(() => {
        snapshot.current = new Date().toISOString();
        changed();
      }, intervalMs);
      return () => window.clearInterval(handle);
    },
    [intervalMs],
  );

  return useSyncExternalStore(
    subscribe,
    () => snapshot.current,
    () => snapshot.current,
  );
}

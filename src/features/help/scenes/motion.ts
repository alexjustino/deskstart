import type { CSSProperties } from 'react';

/** A move's start, and where it comes from when it travels. */
export function at(ms: number, dx = 0, dy = 0): CSSProperties {
  return { animationDelay: `${ms}ms`, '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties;
}

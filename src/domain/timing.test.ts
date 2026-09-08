import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMING,
  describeDuration,
  describeTiming,
  parseStoredTiming,
  readTiming,
  serializeTiming,
} from './timing';

describe('readTiming', () => {
  it('reads nothing as the defaults', () => {
    expect(readTiming(undefined)).toEqual(DEFAULT_TIMING);
    expect(readTiming({})).toEqual(DEFAULT_TIMING);
    expect(parseStoredTiming('{}')).toEqual(DEFAULT_TIMING);
    expect(parseStoredTiming('')).toEqual(DEFAULT_TIMING);
  });

  it('reads a full timing and round-trips it compactly', () => {
    const timing = readTiming({ pauseAfterMs: 2000, holdMs: 5000, repeat: 3, closedMs: 1000 });
    expect(timing).toEqual({ pauseAfterMs: 2000, holdMs: 5000, repeat: 3, closedMs: 1000 });
    if (Array.isArray(timing)) return;
    expect(JSON.parse(serializeTiming(timing))).toEqual({
      pauseAfterMs: 2000,
      holdMs: 5000,
      repeat: 3,
      closedMs: 1000,
    });
    expect(serializeTiming(DEFAULT_TIMING)).toBe('{}');
    expect(parseStoredTiming(serializeTiming(timing))).toEqual(timing);
    expect(readTiming({ holdMs: 100, repeat: 'forever' })).toEqual({
      pauseAfterMs: 0,
      holdMs: 100,
      repeat: 'forever',
      closedMs: 0,
    });
  });

  it('refuses a zero hold: a duration of nothing is not a duration', () => {
    const result = readTiming({ holdMs: 0 });
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result[0]?.path).toBe('timing.holdMs');
  });

  it('refuses a repeat without a hold, and a repeat of zero', () => {
    expect(readTiming({ repeat: 3 })).toEqual([
      {
        path: 'timing.repeat',
        problem: 'a step repeats only when it has a hold to end each opening',
      },
    ]);
    expect(readTiming({ holdMs: 1000, repeat: 0 })).toEqual([
      { path: 'timing.repeat', problem: 'repeat must be a whole number from 1, or "forever"' },
    ]);
    expect(readTiming({ holdMs: 1000, repeat: 'sometimes' }).constructor).toBe(Array);
  });

  it('refuses fractions, negatives, strings and unknown fields', () => {
    expect(readTiming({ pauseAfterMs: 1.5 }).constructor).toBe(Array);
    expect(readTiming({ pauseAfterMs: -1 }).constructor).toBe(Array);
    expect(readTiming({ closedMs: '5' }).constructor).toBe(Array);
    expect(readTiming({ hold: 5 })).toEqual([
      { path: 'timing.hold', problem: 'this field is not part of timing' },
    ]);
    expect(readTiming([]).constructor).toBe(Array);
    expect(parseStoredTiming('nope').constructor).toBe(Array);
  });
});

describe('describing time', () => {
  it('says a duration the way a person would', () => {
    expect(describeDuration(500)).toBe('500 ms');
    expect(describeDuration(5000)).toBe('5 s');
    expect(describeDuration(90_000)).toBe('1 min 30 s');
    expect(describeDuration(3_600_000)).toBe('1 h');
    expect(describeDuration(3_661_000)).toBe('1 h 1 min 1 s');
  });

  it('says what a timing means, or nothing for the default', () => {
    expect(describeTiming(DEFAULT_TIMING)).toBeNull();
    expect(describeTiming({ pauseAfterMs: 2000, holdMs: null, repeat: 1, closedMs: 0 })).toBe(
      'then wait 2 s',
    );
    expect(describeTiming({ pauseAfterMs: 0, holdMs: 5000, repeat: 1, closedMs: 0 })).toBe(
      'open for 5 s',
    );
    expect(describeTiming({ pauseAfterMs: 1000, holdMs: 5000, repeat: 3, closedMs: 2000 })).toBe(
      'open for 5 s, 3 times, 2 s closed between, then wait 1 s',
    );
    expect(
      describeTiming({ pauseAfterMs: 0, holdMs: 60_000, repeat: 'forever', closedMs: 0 }),
    ).toBe('open for 1 min, again and again');
  });
});

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLACEMENT,
  describePlacement,
  isPlaced,
  parseStoredPlacement,
  readPlacement,
  serializePlacement,
  type Placement,
} from './placement';
import type { StepConfig } from './profile';
import { DEFAULT_TIMING } from './timing';
import { stepProblems } from './step';

const RECT = { x: 100, y: 80, width: 1200, height: 800 };

function placement(over: Partial<Placement> = {}): Placement {
  return { ...DEFAULT_PLACEMENT, ...over };
}

describe('reading a placement', () => {
  it('asks for nothing when nothing is written', () => {
    expect(readPlacement(undefined)).toEqual(DEFAULT_PLACEMENT);
    expect(readPlacement(null)).toEqual(DEFAULT_PLACEMENT);
    expect(readPlacement({})).toEqual(DEFAULT_PLACEMENT);
    expect(isPlaced(DEFAULT_PLACEMENT)).toBe(false);
  });

  it('reads a screen, a rectangle and a state', () => {
    expect(readPlacement({ monitor: 2, rect: RECT, state: 'maximized' })).toEqual({
      monitor: 2,
      rect: RECT,
      state: 'maximized',
    });
    expect(isPlaced(placement({ state: 'minimized' }))).toBe(true);
    expect(isPlaced(placement({ monitor: 1 }))).toBe(true);
  });

  it('refuses a screen that is not a screen number', () => {
    for (const monitor of [0, -1, 1.5, '2', true]) {
      const result = readPlacement({ monitor });
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) expect(result[0]?.path).toBe('placement.monitor');
    }
  });

  it('refuses a state that is not one of the three', () => {
    const result = readPlacement({ state: 'fullscreen' });
    expect(result).toEqual([
      { path: 'placement.state', problem: 'a window is normal, maximized, minimized' },
    ]);
  });

  it('refuses a rectangle with no size, and one with a field that is not part of it', () => {
    const noSize = readPlacement({ rect: { x: 0, y: 0, width: 0, height: 400 } });
    expect(Array.isArray(noSize)).toBe(true);
    if (Array.isArray(noSize)) expect(noSize[0]?.path).toBe('placement.rect.width');

    const extra = readPlacement({ rect: { ...RECT, always: 'on top' } });
    expect(Array.isArray(extra)).toBe(true);
    if (Array.isArray(extra)) expect(extra[0]?.path).toBe('placement.rect.always');
  });

  it('refuses a rectangle that is missing a corner', () => {
    const result = readPlacement({ rect: { x: 10, width: 100, height: 100 } });
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result.map((p) => p.path)).toEqual(['placement.rect.y']);
  });

  it('refuses an unknown field rather than ignoring it', () => {
    const result = readPlacement({ monitor: 1, alwaysOnTop: true });
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result[0]?.path).toBe('placement.alwaysOnTop');
  });

  it('takes a negative position: a screen left of the primary has one', () => {
    expect(readPlacement({ rect: { x: -1920, y: 0, width: 800, height: 600 } })).toEqual({
      monitor: null,
      rect: { x: -1920, y: 0, width: 800, height: 600 },
      state: 'normal',
    });
  });
});

describe('the stored form', () => {
  it('round-trips, and stores nothing when nothing was asked for', () => {
    expect(serializePlacement(DEFAULT_PLACEMENT)).toBe('{}');
    expect(parseStoredPlacement('{}')).toEqual(DEFAULT_PLACEMENT);
    expect(parseStoredPlacement('')).toEqual(DEFAULT_PLACEMENT);

    const asked = placement({ monitor: 2, rect: RECT, state: 'maximized' });
    expect(parseStoredPlacement(serializePlacement(asked))).toEqual(asked);
  });

  it('is a problem, not a crash, when the row is not JSON', () => {
    const result = parseStoredPlacement('{oops');
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result[0]?.path).toBe('placement');
  });
});

describe('what a placement says', () => {
  it('says nothing when it asks for nothing', () => {
    expect(describePlacement(DEFAULT_PLACEMENT)).toBeNull();
  });

  it('says the state, the rectangle and the screen, in that order', () => {
    expect(describePlacement(placement({ state: 'maximized', monitor: 2 }))).toBe(
      'opens maximised on screen 2',
    );
    expect(describePlacement(placement({ rect: RECT }))).toBe('opens 1200×800 at 100, 80');
    expect(describePlacement(placement({ state: 'minimized' }))).toBe('opens minimised');
  });
});

describe('what a run may do to a window it did not open', () => {
  const app: StepConfig = { kind: 'app', program: 'C:\\a.exe', args: [], workingDir: null };
  const folder: StepConfig = { kind: 'folder', path: 'C:\\src' };

  it('nothing: a folder cannot be held, and cannot be placed', () => {
    expect(
      stepProblems(folder, { ...DEFAULT_TIMING, holdMs: 5000 }, placement({ monitor: 1 })).map(
        (p) => p.path,
      ),
    ).toEqual(['timing.holdMs', 'placement.match']);
  });

  it('places a folder when a window rule says which new window', () => {
    expect(
      stepProblems(
        folder,
        DEFAULT_TIMING,
        placement({ monitor: 1, match: { title: 'src', className: null } }),
      ),
    ).toEqual([]);
    // A rule never makes a folder holdable: closing is still not ours to do.
    expect(
      stepProblems(
        folder,
        { ...DEFAULT_TIMING, holdMs: 5000 },
        placement({ monitor: 1, match: { title: 'src', className: null } }),
      ).map((p) => p.path),
    ).toEqual(['timing.holdMs']);
  });

  it('and says which kind it is talking about', () => {
    const [problem] = stepProblems(
      { kind: 'url', url: 'https://x.test/' },
      DEFAULT_TIMING,
      placement({ state: 'maximized' }),
    );
    expect(problem?.problem).toContain('a web page');
  });

  it('leaves an application alone', () => {
    expect(
      stepProblems(app, { ...DEFAULT_TIMING, holdMs: 5000 }, placement({ monitor: 2, rect: RECT })),
    ).toEqual([]);
  });

  it('and leaves a folder alone when it asks for nothing', () => {
    expect(stepProblems(folder, DEFAULT_TIMING, DEFAULT_PLACEMENT)).toEqual([]);
  });
});

describe('a window rule (ADR-029)', () => {
  it('reads a title piece and a class, trimmed, and stores them', () => {
    const read = readPlacement({
      state: 'maximized',
      match: { title: '  Character Map ', className: 'MyClass' },
    });
    expect(read).toEqual({
      monitor: null,
      rect: null,
      state: 'maximized',
      match: { title: 'Character Map', className: 'MyClass' },
    });
    if (Array.isArray(read)) return;
    expect(JSON.parse(serializePlacement(read))).toEqual({
      state: 'maximized',
      match: { title: 'Character Map', className: 'MyClass' },
    });
  });

  it('is no rule at all when both halves are empty', () => {
    expect(readPlacement({ state: 'maximized', match: { title: ' ', className: '' } })).toEqual({
      monitor: null,
      rect: null,
      state: 'maximized',
    });
  });

  it('needs somewhere to put the window', () => {
    expect(readPlacement({ match: { title: 'x' } })).toEqual([
      {
        path: 'placement.match',
        problem:
          'a window rule needs somewhere to put the window: a screen, a rectangle or a state',
      },
    ]);
  });

  it('refuses what is not text, a field it does not know, and a paragraph', () => {
    const read = readPlacement({
      state: 'maximized',
      match: { title: 3, pid: 12, className: 'x'.repeat(201) },
    });
    expect(Array.isArray(read) ? read.map((p) => p.path) : read).toEqual([
      'placement.match.pid',
      'placement.match.title',
      'placement.match.className',
    ]);
  });

  it('is said in the sentence', () => {
    expect(
      describePlacement({
        monitor: 2,
        rect: null,
        state: 'maximized',
        match: { title: 'Notepad', className: null },
      }),
    ).toBe('the first new window whose title has “Notepad” opens maximised on screen 2');
  });
});

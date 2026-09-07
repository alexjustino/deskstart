import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMEOUT_MS,
  describeProbe,
  describeWaitFor,
  parseStoredWaitFor,
  readWaitFor,
  serializeWaitFor,
  waitForProblems,
  type WaitFor,
} from './readiness';

const WINDOW: WaitFor = { stepId: 'a', probe: { kind: 'window' }, timeoutMs: 10_000 };

describe('readWaitFor', () => {
  it('reads nothing as waiting for nothing', () => {
    expect(readWaitFor(undefined)).toBeNull();
    expect(readWaitFor(null)).toBeNull();
    expect(readWaitFor({})).toBeNull();
    expect(parseStoredWaitFor('{}')).toBeNull();
    expect(parseStoredWaitFor('')).toBeNull();
  });

  it('reads a window wait and a port wait, and round-trips them', () => {
    expect(readWaitFor({ stepId: 'a', probe: { kind: 'window' }, timeoutMs: 10_000 })).toEqual(
      WINDOW,
    );
    const port = readWaitFor({ stepId: ' a ', probe: { kind: 'port', port: 5173 } });
    expect(port).toEqual({
      stepId: 'a',
      probe: { kind: 'port', port: 5173 },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    expect(parseStoredWaitFor(serializeWaitFor(WINDOW))).toEqual(WINDOW);
    expect(serializeWaitFor(null)).toBe('{}');
  });

  it('refuses a probe that is neither a window nor a port, and an unknown field', () => {
    expect(readWaitFor({ stepId: 'a', probe: { kind: 'ping' } })).toEqual([
      {
        path: 'waitFor.probe',
        problem: 'a step waits for a window to appear or for a port to answer',
      },
    ]);
    expect(readWaitFor({ stepId: 'a', probe: { kind: 'window' }, exec: 'x' })).toEqual([
      { path: 'waitFor.exec', problem: 'this field is not part of what a step waits for' },
    ]);
    expect(readWaitFor({ stepId: 'a', probe: { kind: 'window', port: 80 } })).toEqual([
      { path: 'waitFor.probe.port', problem: 'this field is not part of a window probe' },
    ]);
  });

  it('refuses a port outside the range, a timeout of zero, and no step', () => {
    const refused = (value: unknown) => Array.isArray(readWaitFor(value));
    expect(refused({ stepId: 'a', probe: { kind: 'port', port: 0 } })).toBe(true);
    expect(refused({ stepId: 'a', probe: { kind: 'port', port: 70_000 } })).toBe(true);
    expect(refused({ stepId: 'a', probe: { kind: 'port', port: 8.5 } })).toBe(true);
    expect(refused({ stepId: 'a', probe: { kind: 'window' }, timeoutMs: 0 })).toBe(true);
    expect(refused({ stepId: '  ', probe: { kind: 'window' } })).toBe(true);
    expect(refused([])).toBe(true);
    expect(Array.isArray(parseStoredWaitFor('nope'))).toBe(true);
  });
});

describe('waitForProblems', () => {
  const steps = (waits: Array<WaitFor | null>) =>
    waits.map((waitFor, index) => ({ id: `s${index}`, waitFor }));

  it('is happy when a step waits for an earlier one', () => {
    const list = steps([null, { ...WINDOW, stepId: 's0' }]);
    expect(waitForProblems(list, 0)).toEqual([]);
    expect(waitForProblems(list, 1)).toEqual([]);
  });

  it('refuses waiting for itself, for a later step, or for a step that is gone', () => {
    expect(waitForProblems(steps([{ ...WINDOW, stepId: 's0' }]), 0)).toEqual([
      { path: 'waitFor.stepId', problem: 'a step cannot wait for itself' },
    ]);
    const later = steps([{ ...WINDOW, stepId: 's1' }, null]);
    expect(waitForProblems(later, 0)[0]?.problem).toContain('only wait for an earlier one');
    const gone = steps([null, { ...WINDOW, stepId: 'removed' }]);
    expect(waitForProblems(gone, 1)[0]?.problem).toContain('no longer in this profile');
  });

  it('says nothing about a step that waits for nothing, or an index that is not there', () => {
    expect(waitForProblems(steps([null]), 0)).toEqual([]);
    expect(waitForProblems(steps([null]), 9)).toEqual([]);
  });
});

describe('describing what a step waits for', () => {
  it('says what it looks for and for how long', () => {
    expect(describeProbe({ kind: 'window' })).toBe('a window');
    expect(describeProbe({ kind: 'port', port: 5173 })).toBe('port 5173');
    expect(describeWaitFor(null, 'anything')).toBeNull();
    expect(describeWaitFor(WINDOW, 'code.exe')).toBe('waits for code.exe — a window — up to 10 s');
    expect(
      describeWaitFor(
        { stepId: 'a', probe: { kind: 'port', port: 5173 }, timeoutMs: 90_000 },
        null,
      ),
    ).toBe('waits for a step that is no longer here — port 5173 — up to 1 min 30 s');
  });
});

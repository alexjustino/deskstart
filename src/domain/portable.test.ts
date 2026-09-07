import { describe, expect, it } from 'vitest';

import {
  droppedWaits,
  fileNameFor,
  readPortableProfile,
  toImports,
  writePortableProfile,
  type Exportable,
} from './portable';
import { DEFAULT_TIMEOUT_MS } from './readiness';
import { DEFAULT_TIMING } from './timing';

const NOTEPAD = 'C:\\Windows\\System32\\notepad.exe';

/** A stored step, with everything that is not being tested left at its default. */
function stored(id: string, over: Partial<Exportable> = {}): Exportable {
  return {
    id,
    config: { kind: 'app', program: NOTEPAD, args: [], workingDir: null },
    timing: { ...DEFAULT_TIMING },
    waitFor: null,
    ...over,
  };
}

describe('reading a profile document', () => {
  it('reads a well-formed document with every kind of step', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: ' Morning ',
      steps: [
        { kind: 'app', program: NOTEPAD },
        { kind: 'folder', path: '%USERPROFILE%\\src' },
        { kind: 'file', path: 'C:\\notes.txt' },
        { kind: 'url', url: 'https://example.com/a' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.name).toBe('Morning');
    expect(result.profile.steps.map((s) => s.config)).toEqual([
      { kind: 'app', program: NOTEPAD, args: [], workingDir: null },
      { kind: 'folder', path: '%USERPROFILE%\\src' },
      { kind: 'file', path: 'C:\\notes.txt' },
      { kind: 'url', url: 'https://example.com/a' },
    ]);
    expect(result.profile.steps.every((s) => s.waitFor === null)).toBe(true);
    expect(result.profile.steps[0]?.timing).toEqual(DEFAULT_TIMING);
  });

  it('reads a JSON string and never throws on garbage', () => {
    expect(readPortableProfile('{"schemaVersion":1,"name":"A","steps":[]}').ok).toBe(true);
    expect(readPortableProfile('{not json')).toEqual({
      ok: false,
      problems: [{ path: '', problem: 'the file is not valid JSON' }],
    });
    expect(readPortableProfile(null).ok).toBe(false);
    expect(readPortableProfile([]).ok).toBe(false);
    expect(readPortableProfile(42).ok).toBe(false);
    expect(readPortableProfile(undefined).ok).toBe(false);
    expect(readPortableProfile('[1,2,3]').ok).toBe(false);
  });

  it('refuses another schema version', () => {
    const result = readPortableProfile({ schemaVersion: 2, name: 'A', steps: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]?.path).toBe('schemaVersion');
  });

  it('refuses unknown fields rather than ignoring them', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: 'A',
      steps: [{ kind: 'app', program: NOTEPAD, shell: 'cmd /c format c:' }],
      onOpen: 'evil()',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map((p) => p.path)).toEqual(['onOpen', 'steps[0].shell']);
    }
  });

  it('reports every problem, with its path, in one pass', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: '',
      steps: [
        { kind: 'shortcut', program: '' },
        'not a step',
        { kind: 'app', program: 'x', args: 'y' },
        { kind: 'url', url: 'ftp://x' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map((p) => p.path)).toEqual([
        'name',
        'steps[0].kind',
        'steps[1]',
        'steps[2].args',
        'steps[3].url',
      ]);
    }
  });

  it('requires steps to be a list', () => {
    const result = readPortableProfile({ schemaVersion: 1, name: 'A', steps: {} });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.problems).toEqual([{ path: 'steps', problem: 'steps must be a list' }]);
  });

  it('reads a step that carries time', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: 'A',
      steps: [{ kind: 'app', program: NOTEPAD, timing: { holdMs: 5000, repeat: 3 } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.profile.steps[0]?.timing).toEqual({
        pauseAfterMs: 0,
        holdMs: 5000,
        repeat: 3,
        closedMs: 0,
      });
  });

  it('refuses timing that could not have been written here', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: 'A',
      steps: [{ kind: 'app', program: NOTEPAD, timing: { repeat: 4 } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]?.path).toBe('steps[0].timing.repeat');
  });
});

describe('what a step waits for, in a file', () => {
  it('names an earlier step by its position', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: 'A',
      steps: [
        { kind: 'app', program: NOTEPAD },
        {
          kind: 'app',
          program: NOTEPAD,
          waitFor: { step: 1, probe: { kind: 'port', port: 5173 } },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.profile.steps[1]?.waitFor).toEqual({
        step: 1,
        probe: { kind: 'port', port: 5173 },
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
  });

  it('refuses a wait that points at itself or forwards — a cycle cannot be written', () => {
    // The step's own position, a later one, and its own again from the second
    // slot: three ways to write a wait that could never be satisfied.
    const cases: Array<{ at: number; target: number }> = [
      { at: 0, target: 1 },
      { at: 0, target: 2 },
      { at: 1, target: 2 },
    ];
    for (const { at, target } of cases) {
      const steps: Record<string, unknown>[] = [
        { kind: 'app', program: NOTEPAD },
        { kind: 'app', program: NOTEPAD },
      ];
      steps[at] = {
        kind: 'app',
        program: NOTEPAD,
        waitFor: { step: target, probe: { kind: 'window' } },
      };
      const result = readPortableProfile({ schemaVersion: 1, name: 'A', steps });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problems[0]?.path).toBe(`steps[${at}].waitFor.step`);
    }
  });

  it('refuses a position that is not one, and a probe that is not a probe', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: 'A',
      steps: [
        { kind: 'app', program: NOTEPAD },
        {
          kind: 'app',
          program: NOTEPAD,
          waitFor: { step: 'the first one', probe: { kind: 'ping' } },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.problems.map((p) => p.path)).toEqual([
        'steps[1].waitFor.step',
        'steps[1].waitFor.probe',
      ]);
  });

  it('refuses an unknown field inside a wait, and a port that is not a port', () => {
    const result = readPortableProfile({
      schemaVersion: 1,
      name: 'A',
      steps: [
        { kind: 'app', program: NOTEPAD },
        {
          kind: 'app',
          program: NOTEPAD,
          waitFor: { step: 1, probe: { kind: 'port', port: 70000 }, retries: 5 },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.problems.map((p) => p.path)).toEqual([
        'steps[1].waitFor.retries',
        'steps[1].waitFor.probe.port',
      ]);
  });
});

describe('writing a profile document', () => {
  it('round-trips a profile through the file and back', () => {
    const steps: Exportable[] = [
      stored('a', { timing: { pauseAfterMs: 0, holdMs: 5000, repeat: 3, closedMs: 1000 } }),
      stored('b', {
        config: { kind: 'url', url: 'https://example.com/' },
        waitFor: { stepId: 'a', probe: { kind: 'port', port: 5173 }, timeoutMs: 12_000 },
      }),
      stored('c', { config: { kind: 'folder', path: '%USERPROFILE%\\src' } }),
    ];
    const file = writePortableProfile(' Dev ', steps);
    const read = readPortableProfile(file);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.profile.name).toBe('Dev');
    expect(read.profile.steps.map((s) => s.config)).toEqual(steps.map((s) => s.config));
    expect(read.profile.steps.map((s) => s.timing)).toEqual(steps.map((s) => s.timing));
    expect(read.profile.steps[1]?.waitFor).toEqual({
      step: 1,
      probe: { kind: 'port', port: 5173 },
      timeoutMs: 12_000,
    });
  });

  it('writes no identifier of this machine, and no default nobody chose', () => {
    const file = writePortableProfile('Dev', [stored('01927f7e-cafe-7000-8000-000000000001')]);
    expect(file).not.toContain('01927f7e');
    expect(file).not.toContain('timing');
    expect(file).not.toContain('waitFor');
    expect(file.endsWith('\n')).toBe(true);
    // Readable by a person, and by `git diff`.
    expect(file.split('\n').length).toBeGreaterThan(3);
  });

  it('leaves out a wait that does not point backwards, and says so first', () => {
    const steps: Exportable[] = [
      stored('a', {
        waitFor: { stepId: 'gone', probe: { kind: 'window' }, timeoutMs: 1000 },
      }),
      stored('b', {
        waitFor: { stepId: 'a', probe: { kind: 'window' }, timeoutMs: 1000 },
      }),
    ];
    expect(droppedWaits(steps).map((p) => p.path)).toEqual(['steps[0].waitFor']);
    const read = readPortableProfile(writePortableProfile('Dev', steps));
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.profile.steps[0]?.waitFor).toBeNull();
      expect(read.profile.steps[1]?.waitFor?.step).toBe(1);
    }
  });

  it('says nothing was dropped when every wait points backwards', () => {
    expect(
      droppedWaits([
        stored('a'),
        stored('b', { waitFor: { stepId: 'a', probe: { kind: 'window' }, timeoutMs: 1000 } }),
      ]),
    ).toEqual([]);
  });
});

describe('what the host is asked to store', () => {
  it('turns a document into steps in order, waits named by position', () => {
    const read = readPortableProfile({
      schemaVersion: 1,
      name: 'A',
      steps: [
        { kind: 'app', program: NOTEPAD, timing: { pauseAfterMs: 2000 } },
        {
          kind: 'url',
          url: 'https://example.com/',
          waitFor: { step: 1, probe: { kind: 'window' }, timeoutMs: 9000 },
        },
      ],
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(toImports(read.profile)).toEqual([
      {
        kind: 'app',
        configJson: JSON.stringify({ program: NOTEPAD, args: [], workingDir: null }),
        timingJson: JSON.stringify({ pauseAfterMs: 2000 }),
        waitOn: null,
        waitJson: '{}',
      },
      {
        kind: 'url',
        configJson: JSON.stringify({ url: 'https://example.com/' }),
        timingJson: '{}',
        waitOn: 1,
        waitJson: JSON.stringify({ probe: { kind: 'window' }, timeoutMs: 9000 }),
      },
    ]);
  });
});

describe('what the file is called', () => {
  it('is the profile, and is a name Windows accepts', () => {
    expect(fileNameFor('Dev')).toBe('Dev.deskstart.json');
    expect(fileNameFor('Dev: work/home')).toBe('Dev-work-home.deskstart.json');
    expect(fileNameFor('  ..  ')).toBe('profile.deskstart.json');
    expect(fileNameFor('a'.repeat(200)).length).toBeLessThan(90);
  });
});

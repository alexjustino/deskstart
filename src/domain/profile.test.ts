import { describe, expect, it } from 'vitest';

import {
  parseStoredStep,
  readProfile,
  readStepConfig,
  resolvePath,
  serializeStepConfig,
} from './profile';

const NOTEPAD = 'C:\\Windows\\System32\\notepad.exe';

describe('readProfile', () => {
  it('reads a well-formed document', () => {
    const result = readProfile({
      schemaVersion: 1,
      name: ' Morning ',
      steps: [{ kind: 'app', program: NOTEPAD }],
    });
    expect(result).toEqual({
      ok: true,
      document: {
        schemaVersion: 1,
        name: 'Morning',
        steps: [{ kind: 'app', program: NOTEPAD, args: [], workingDir: null }],
      },
    });
  });

  it('reads a JSON string and never throws on garbage', () => {
    expect(readProfile('{"schemaVersion":1,"name":"A","steps":[]}').ok).toBe(true);
    expect(readProfile('{not json')).toEqual({
      ok: false,
      problems: [{ path: '', problem: 'the file is not valid JSON' }],
    });
    expect(readProfile(null).ok).toBe(false);
    expect(readProfile([]).ok).toBe(false);
    expect(readProfile(42).ok).toBe(false);
  });

  it('refuses another schema version', () => {
    const result = readProfile({ schemaVersion: 2, name: 'A', steps: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]?.path).toBe('schemaVersion');
  });

  it('refuses unknown fields rather than ignoring them', () => {
    const result = readProfile({
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
    const result = readProfile({
      schemaVersion: 1,
      name: '',
      steps: [
        { kind: 'folder', program: '' },
        'not a step',
        { kind: 'app', program: 'x', args: 'y' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map((p) => p.path)).toEqual([
        'name',
        'steps[0].kind',
        'steps[0].program',
        'steps[1]',
        'steps[2].args',
      ]);
    }
  });

  it('requires steps to be a list', () => {
    const result = readProfile({ schemaVersion: 1, name: 'A', steps: {} });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.problems).toEqual([{ path: 'steps', problem: 'steps must be a list' }]);
  });
});

describe('a step configuration', () => {
  it('round-trips through the stored form', () => {
    const config = readStepConfig({
      kind: 'app',
      program: NOTEPAD,
      args: ['C:\\notes.txt'],
      workingDir: 'C:\\',
    });
    expect(Array.isArray(config)).toBe(false);
    if (Array.isArray(config)) return;
    const stored = serializeStepConfig(config);
    expect(JSON.parse(stored)).toEqual({
      program: NOTEPAD,
      args: ['C:\\notes.txt'],
      workingDir: 'C:\\',
    });
    expect(parseStoredStep('app', stored)).toEqual({ ok: true, config });
  });

  it('treats a blank working directory as none', () => {
    const config = readStepConfig({ kind: 'app', program: NOTEPAD, workingDir: null });
    expect(config).toMatchObject({ workingDir: null });
    const blank = readStepConfig({ kind: 'app', program: NOTEPAD, workingDir: '   ' });
    expect(Array.isArray(blank)).toBe(true);
  });

  it('refuses a stored row that is not JSON or not an object', () => {
    expect(parseStoredStep('app', 'nope').ok).toBe(false);
    expect(parseStoredStep('app', '[]').ok).toBe(false);
    expect(parseStoredStep('folder', '{"program":"x"}').ok).toBe(false);
  });
});

describe('resolvePath', () => {
  const env = { USERPROFILE: 'C:\\Users\\Alex', SystemRoot: 'C:\\Windows', PATH: 'C:\\evil' };

  it('expands allow-listed names, whatever their case, and normalises slashes', () => {
    expect(resolvePath('%userprofile%/Documents/a.txt', env)).toEqual({
      ok: true,
      path: 'C:\\Users\\Alex\\Documents\\a.txt',
    });
    expect(resolvePath('%SystemRoot%\\System32\\notepad.exe', env)).toEqual({
      ok: true,
      path: 'C:\\Windows\\System32\\notepad.exe',
    });
  });

  it('refuses a name outside the allow-list, even when the environment has it', () => {
    expect(resolvePath('%PATH%\\x.exe', env)).toEqual({
      ok: false,
      problem: '%PATH% is not a name this product expands',
    });
    expect(resolvePath('%TEMP%\\x.exe', env)).toEqual({
      ok: false,
      problem: '%TEMP% is not a name this product expands',
    });
  });

  it('refuses an allow-listed name the environment does not provide', () => {
    expect(resolvePath('%APPDATA%\\x.exe', env).ok).toBe(false);
  });

  it('requires the result to be absolute', () => {
    expect(resolvePath('notepad.exe', env)).toEqual({
      ok: false,
      problem: 'the path is not absolute: notepad.exe',
    });
    expect(resolvePath('..\\up\\x.exe', env).ok).toBe(false);
    expect(resolvePath('\\\\server\\share\\x.exe', env)).toEqual({
      ok: true,
      path: '\\\\server\\share\\x.exe',
    });
    expect(resolvePath('   ', env)).toEqual({ ok: false, problem: 'the path is empty' });
  });
});

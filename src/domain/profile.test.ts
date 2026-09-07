import { describe, expect, it } from 'vitest';

import {
  lastSegment,
  parseStoredStep,
  readStepConfig,
  readUrl,
  resolvePath,
  resolveStep,
  serializeStepConfig,
  stepTitle,
} from './profile';

const NOTEPAD = 'C:\\Windows\\System32\\notepad.exe';
const ENV = { USERPROFILE: 'C:\\Users\\Alex', SystemRoot: 'C:\\Windows', PATH: 'C:\\evil' };

describe('a step configuration', () => {
  it('refuses a field that belongs to another kind', () => {
    const result = readStepConfig({ kind: 'folder', path: 'C:\\', args: ['x'] });
    expect(result).toEqual([
      { path: 'step.args', problem: 'this field is not part of a folder step' },
    ]);
  });

  it('round-trips through the stored form, kind kept apart', () => {
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

    const url = readStepConfig({ kind: 'url', url: 'https://example.com' });
    if (Array.isArray(url)) throw new Error('unexpected');
    expect(JSON.parse(serializeStepConfig(url))).toEqual({ url: 'https://example.com' });
    expect(parseStoredStep('url', serializeStepConfig(url))).toEqual({ ok: true, config: url });
  });

  it('treats a blank working directory as none', () => {
    const config = readStepConfig({ kind: 'app', program: NOTEPAD, workingDir: null });
    expect(config).toMatchObject({ workingDir: null });
    const blank = readStepConfig({ kind: 'app', program: NOTEPAD, workingDir: '   ' });
    expect(Array.isArray(blank)).toBe(true);
  });

  it('refuses a stored row that is not JSON, not an object, or of an unknown kind', () => {
    expect(parseStoredStep('app', 'nope').ok).toBe(false);
    expect(parseStoredStep('app', '[]').ok).toBe(false);
    expect(parseStoredStep('shortcut', '{"program":"x"}').ok).toBe(false);
    expect(parseStoredStep('folder', '{"path":""}').ok).toBe(false);
  });
});

describe('resolvePath', () => {
  it('expands allow-listed names, whatever their case, and normalises slashes', () => {
    expect(resolvePath('%userprofile%/Documents/a.txt', ENV)).toEqual({
      ok: true,
      path: 'C:\\Users\\Alex\\Documents\\a.txt',
    });
    expect(resolvePath('%SystemRoot%\\System32\\notepad.exe', ENV)).toEqual({
      ok: true,
      path: 'C:\\Windows\\System32\\notepad.exe',
    });
  });

  it('refuses a name outside the allow-list, even when the environment has it', () => {
    expect(resolvePath('%PATH%\\x.exe', ENV)).toEqual({
      ok: false,
      problem: '%PATH% is not a name this product expands',
    });
    expect(resolvePath('%TEMP%\\x.exe', ENV)).toEqual({
      ok: false,
      problem: '%TEMP% is not a name this product expands',
    });
  });

  it('refuses an allow-listed name the environment does not provide', () => {
    expect(resolvePath('%APPDATA%\\x.exe', ENV).ok).toBe(false);
  });

  it('requires the result to be absolute', () => {
    expect(resolvePath('notepad.exe', ENV)).toEqual({
      ok: false,
      problem: 'the path is not absolute: notepad.exe',
    });
    expect(resolvePath('..\\up\\x.exe', ENV).ok).toBe(false);
    expect(resolvePath('\\\\server\\share\\x.exe', ENV)).toEqual({
      ok: true,
      path: '\\\\server\\share\\x.exe',
    });
    expect(resolvePath('   ', ENV)).toEqual({ ok: false, problem: 'the path is empty' });
  });
});

describe('readUrl', () => {
  it('accepts http and https and nothing else', () => {
    expect(readUrl(' https://example.com/a?b=1 ')).toEqual({
      ok: true,
      url: 'https://example.com/a?b=1',
    });
    expect(readUrl('http://localhost:3000')).toEqual({ ok: true, url: 'http://localhost:3000/' });
    expect(readUrl('file:///C:/secret.txt').ok).toBe(false);
    expect(readUrl('javascript:alert(1)').ok).toBe(false);
    expect(readUrl('ftp://x.y').ok).toBe(false);
    expect(readUrl('example.com').ok).toBe(false);
    expect(readUrl('').ok).toBe(false);
  });
});

describe('resolveStep', () => {
  it('resolves an app with its working directory and remembers the source when expanded', () => {
    expect(
      resolveStep(
        {
          kind: 'app',
          program: '%SystemRoot%\\System32\\notepad.exe',
          args: ['a b', 'c && d'],
          workingDir: '%USERPROFILE%',
        },
        ENV,
      ),
    ).toEqual({
      ok: true,
      launch: {
        kind: 'app',
        program: NOTEPAD,
        args: ['a b', 'c && d'],
        workingDir: 'C:\\Users\\Alex',
        source: '%SystemRoot%\\System32\\notepad.exe',
      },
    });
    const plain = resolveStep({ kind: 'app', program: NOTEPAD, args: [], workingDir: null }, ENV);
    expect(plain).toEqual({
      ok: true,
      launch: { kind: 'app', program: NOTEPAD, args: [], workingDir: null, source: null },
    });
  });

  it('resolves a folder, a file and a url', () => {
    expect(resolveStep({ kind: 'folder', path: '%USERPROFILE%/src' }, ENV)).toEqual({
      ok: true,
      launch: { kind: 'folder', path: 'C:\\Users\\Alex\\src', source: '%USERPROFILE%/src' },
    });
    expect(resolveStep({ kind: 'file', path: 'C:\\notes.txt' }, ENV)).toEqual({
      ok: true,
      launch: { kind: 'file', path: 'C:\\notes.txt', source: null },
    });
    expect(resolveStep({ kind: 'url', url: 'https://example.com' }, ENV)).toEqual({
      ok: true,
      launch: { kind: 'url', url: 'https://example.com/', source: null },
    });
  });

  it('collects every problem of a step, with its field', () => {
    const result = resolveStep(
      { kind: 'app', program: 'notepad.exe', args: [], workingDir: '%TEMP%' },
      ENV,
    );
    expect(result).toEqual({
      ok: false,
      problems: [
        { path: 'program', problem: 'the path is not absolute: notepad.exe' },
        { path: 'workingDir', problem: '%TEMP% is not a name this product expands' },
      ],
    });
    expect(resolveStep({ kind: 'folder', path: 'src' }, ENV).ok).toBe(false);
    expect(resolveStep({ kind: 'url', url: 'file:///x' }, ENV).ok).toBe(false);
  });
});

describe('stepTitle', () => {
  it('names a step the way a person would', () => {
    expect(stepTitle({ kind: 'app', program: NOTEPAD, args: [], workingDir: null })).toBe(
      'notepad.exe',
    );
    expect(stepTitle({ kind: 'folder', path: 'C:\\Users\\Alex\\src\\' })).toBe('src');
    expect(stepTitle({ kind: 'file', path: '%USERPROFILE%/notes.md' })).toBe('notes.md');
    expect(stepTitle({ kind: 'url', url: 'https://github.com/alexjustino/deskstart' })).toBe(
      'github.com',
    );
    expect(stepTitle({ kind: 'url', url: 'not a url' })).toBe('not a url');
    expect(lastSegment('C:\\')).toBe('C:');
  });
});

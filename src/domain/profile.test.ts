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

describe('the steps that call a tool', () => {
  it('reads a bookmark folder, a terminal and an editor', () => {
    expect(readStepConfig({ kind: 'bookmarks', folder: ' Work ' })).toEqual({
      kind: 'bookmarks',
      browser: 'chrome',
      folder: 'Work',
    });
    expect(readStepConfig({ kind: 'terminal' })).toEqual({
      kind: 'terminal',
      profile: null,
      directory: null,
    });
    expect(readStepConfig({ kind: 'editor', path: 'C:\\src\\project' })).toEqual({
      kind: 'editor',
      path: 'C:\\src\\project',
    });
  });

  it('refuses a browser it does not read, and a folder with no name', () => {
    expect(readStepConfig({ kind: 'bookmarks', browser: 'firefox', folder: 'Work' })).toEqual([
      { path: 'step.browser', problem: 'bookmarks are read from chrome or edge' },
    ]);
    expect(readStepConfig({ kind: 'bookmarks', folder: '  ' })).toEqual([
      { path: 'step.folder', problem: 'name the bookmark folder to open' },
    ]);
  });

  it('refuses a field that is not part of the kind', () => {
    expect(readStepConfig({ kind: 'terminal', command: 'rm -rf' })).toEqual([
      { path: 'step.command', problem: 'this field is not part of a terminal step' },
    ]);
  });

  it('turns a terminal into an argument vector, never a string', () => {
    const config = readStepConfig({
      kind: 'terminal',
      profile: 'PowerShell && whoami',
      directory: '%USERPROFILE%/src',
    });
    if (Array.isArray(config)) throw new Error('the step reads');
    const resolved = resolveStep(config, ENV);
    expect(resolved).toEqual({
      ok: true,
      launch: {
        kind: 'tool',
        tool: 'terminal',
        args: ['-p', 'PowerShell && whoami', '-d', 'C:\\Users\\Alex\\src'],
        what: 'Windows Terminal — PowerShell && whoami',
        source: '%USERPROFILE%/src',
      },
    });
  });

  it('refuses an editor path that does not resolve here', () => {
    const config = readStepConfig({ kind: 'editor', path: 'project' });
    if (Array.isArray(config)) throw new Error('the step reads');
    expect(resolveStep(config, ENV).ok).toBe(false);
  });

  it('leaves a bookmark folder unread: the host is never handed one', () => {
    const config = readStepConfig({ kind: 'bookmarks', browser: 'edge', folder: 'Work' });
    if (Array.isArray(config)) throw new Error('the step reads');
    expect(resolveStep(config, ENV)).toEqual({
      ok: true,
      launch: { kind: 'bookmarks', browser: 'edge', folder: 'Work', source: null },
    });
  });
});

describe('a virtual machine', () => {
  it('reads a machine on each hypervisor, and refuses one it does not know', () => {
    expect(readStepConfig({ kind: 'vm', hypervisor: 'hyperv', machine: ' dev ' })).toEqual({
      kind: 'vm',
      hypervisor: 'hyperv',
      machine: 'dev',
    });
    expect(readStepConfig({ kind: 'vm', hypervisor: 'parallels', machine: 'dev' })).toEqual([
      {
        path: 'step.hypervisor',
        problem: 'a machine is started by one of: hyperv, virtualbox, vmware',
      },
    ]);
    expect(readStepConfig({ kind: 'vm', hypervisor: 'hyperv' })).toEqual([
      { path: 'step.machine', problem: 'name the machine — or, for VMware, the path to its .vmx' },
    ]);
  });

  it('is one fixed argument shape per hypervisor, the machine as one argument', () => {
    const hyperv = readStepConfig({ kind: 'vm', hypervisor: 'hyperv', machine: 'dev; whoami' });
    const vbox = readStepConfig({ kind: 'vm', hypervisor: 'virtualbox', machine: 'W11 --foo' });
    if (Array.isArray(hyperv) || Array.isArray(vbox)) throw new Error('both read');
    expect(resolveStep(hyperv, ENV)).toEqual({
      ok: true,
      launch: {
        kind: 'tool',
        tool: 'hyperv',
        args: ['dev; whoami'],
        what: 'Hyper-V — dev; whoami',
        source: null,
      },
    });
    expect(resolveStep(vbox, ENV)).toEqual({
      ok: true,
      launch: {
        kind: 'tool',
        tool: 'virtualbox',
        args: ['startvm', 'W11 --foo', '--type', 'gui'],
        what: 'VirtualBox — W11 --foo',
        source: null,
      },
    });
  });

  it('knows a VMware machine by its .vmx, resolved, and refuses anything else', () => {
    const vmware = readStepConfig({
      kind: 'vm',
      hypervisor: 'vmware',
      machine: '%USERPROFILE%/VMs/dev/dev.vmx',
    });
    if (Array.isArray(vmware)) throw new Error('the step reads');
    const resolved = resolveStep(vmware, ENV);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.launch).toMatchObject({
        kind: 'tool',
        tool: 'vmware',
        what: 'VMware — dev',
        source: '%USERPROFILE%/VMs/dev/dev.vmx',
      });
      if (resolved.launch.kind === 'tool') {
        expect(resolved.launch.args.slice(0, 3)).toEqual(['-T', 'ws', 'start']);
        expect(resolved.launch.args[3]).toMatch(/^C:\\Users\\Alex\\VMs\\dev\\dev\.vmx$/);
        expect(resolved.launch.args[4]).toBe('gui');
      }
    }
    const notVmx = readStepConfig({ kind: 'vm', hypervisor: 'vmware', machine: 'C:\\VMs\\dev' });
    if (Array.isArray(notVmx)) throw new Error('the step reads');
    expect(resolveStep(notVmx, ENV)).toEqual({
      ok: false,
      problems: [{ path: 'machine', problem: 'VMware knows a machine by its .vmx file' }],
    });
    expect(stepTitle(vmware)).toBe('dev');
  });
});

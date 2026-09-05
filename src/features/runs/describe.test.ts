import { describe as suite, expect, it } from 'vitest';

import type { LogLine } from '@/data/runs';

import { describe } from './describe';

function line(kind: string, payload: Record<string, unknown>): LogLine {
  return { id: 1, runId: 'r', seq: 1, at: '2026-09-05T16:00:00.000Z', stepId: 's', kind, payload };
}

suite('a log line reads as a sentence', () => {
  it('names an app by its file and shows where an expanded path came from', () => {
    expect(
      describe(
        line('spawned', {
          kind: 'app',
          program: 'C:\\Windows\\System32\\notepad.exe',
          source: '%SYSTEMROOT%\\System32\\notepad.exe',
          pid: 42,
        }),
      ),
    ).toEqual({
      text: 'Started notepad.exe — PID 42',
      detail: 'C:\\Windows\\System32\\notepad.exe — from %SYSTEMROOT%\\System32\\notepad.exe',
    });
  });

  it('names a folder, a file and a web page by what a person calls them', () => {
    expect(
      describe(line('opened', { kind: 'folder', target: 'C:\\Users\\Alex\\src', pid: 7 })).text,
    ).toBe('Opened folder src — PID 7');
    expect(
      describe(line('opened', { kind: 'file', target: 'C:\\notes.txt', pid: null })).text,
    ).toBe('Opened notes.txt');
    expect(describe(line('would_open', { kind: 'url', target: 'https://github.com/x/y' }))).toEqual(
      {
        text: 'Would open github.com',
        detail: 'https://github.com/x/y',
      },
    );
    expect(describe(line('would_spawn', { kind: 'app', program: 'C:\\a\\b.exe' })).text).toBe(
      'Would start b.exe',
    );
  });

  it('says why a step failed, with the right verb', () => {
    expect(
      describe(
        line('failed', {
          kind: 'app',
          program: 'C:\\x.exe',
          reason: 'the program was not found at C:\\x.exe',
        }),
      ).text,
    ).toBe('Could not start x.exe: the program was not found at C:\\x.exe');
    expect(
      describe(line('failed', { kind: 'folder', target: 'C:\\gone', reason: 'no' })).text,
    ).toBe('Could not open folder gone: no');
  });

  it('still says something for a line it does not know', () => {
    expect(describe(line('mystery', {})).text).toBe('mystery');
    expect(describe(line('spawned', {})).text).toBe('Started the step');
  });
});

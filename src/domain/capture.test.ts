import { describe, expect, it } from 'vitest';

import { abbreviate, judgeCaptured, stepFromCapture, type CapturedWindow } from './capture';
import { serializePlacement } from './placement';
import { serializeStepConfig } from './profile';

const ENV = {
  USERPROFILE: 'C:\\Users\\Alex',
  LOCALAPPDATA: 'C:\\Users\\Alex\\AppData\\Local',
  PROGRAMFILES: 'C:\\Program Files',
  SYSTEMROOT: 'C:\\Windows',
};

function captured(over: Partial<CapturedWindow> = {}): CapturedWindow {
  return {
    program: 'C:\\Users\\Alex\\AppData\\Local\\Programs\\Code\\Code.exe',
    title: 'secret-plan.md — Visual Studio Code',
    className: 'Chrome_WidgetWin_1',
    monitor: 2,
    rect: { x: 10, y: 20, width: 1200, height: 800 },
    state: 'normal',
    appId: null,
    folder: null,
    ...over,
  };
}

describe('which windows can become a step', () => {
  it('takes a program Windows named', () => {
    expect(judgeCaptured(captured()).ok).toBe(true);
  });

  it('takes a Store app by its identity — the windows 1.2 refused (UAT)', () => {
    const judged = judgeCaptured(
      captured({
        program: 'C:\\Program Files\\WindowsApps\\Claude_1.0_x64__pzs8sxrjxfjjc\\app\\claude.exe',
        appId: 'Claude_pzs8sxrjxfjjc!Claude',
      }),
    );
    expect(judged.ok && judged.as).toBe('store');
  });

  it('takes an Explorer window as the folder it shows', () => {
    const judged = judgeCaptured(
      captured({ program: 'C:\\Windows\\explorer.exe', folder: 'C:\\Users\\Alex\\Projects' }),
    );
    expect(judged.ok && judged.as).toBe('folder');
  });

  it('says why it cannot take the rest', () => {
    const reasons = [
      captured({ program: null }),
      captured({ program: 'C:\\Program Files\\WindowsApps\\Microsoft.Todos_1.0\\Todo.exe' }),
      captured({ program: 'C:\\Windows\\explorer.exe' }),
    ].map((w) => {
      const judged = judgeCaptured(w);
      return judged.ok ? null : judged.reason;
    });
    expect(reasons).toEqual([
      'Windows did not say which program this is (it may run with more rights)',
      'a Store app Windows did not name — open it and capture again',
      'an Explorer window on something that is not a folder (This PC, a library)',
    ]);
  });
});

describe('the step a Store app or an Explorer window becomes (1.3)', () => {
  it('starts a Store app the way Windows does, and finds its window by class', () => {
    const judged = judgeCaptured(
      captured({
        program: 'C:\\Program Files\\WindowsApps\\Claude_1.0_x64__pzs8sxrjxfjjc\\app\\claude.exe',
        appId: 'Claude_pzs8sxrjxfjjc!Claude',
        state: 'maximized',
        rect: null,
      }),
    );
    if (!judged.ok) throw new Error('capturable');
    const { config, placement } = stepFromCapture(judged, ENV);
    expect(config).toEqual({
      kind: 'app',
      program: '%SYSTEMROOT%\\explorer.exe',
      args: ['shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude'],
      workingDir: null,
    });
    expect(placement.match).toEqual({ title: null, className: 'Chrome_WidgetWin_1' });
    expect(placement.state).toBe('maximized');
  });

  it('reopens an Explorer window as a Folder step, found by its folder name', () => {
    const judged = judgeCaptured(
      captured({
        program: 'C:\\Windows\\explorer.exe',
        folder: 'C:\\Users\\Alex\\Projects',
        className: 'CabinetWClass',
        title: 'Projects - File Explorer',
      }),
    );
    if (!judged.ok) throw new Error('capturable');
    const { config, placement } = stepFromCapture(judged, ENV);
    expect(config).toEqual({ kind: 'folder', path: '%USERPROFILE%\\Projects' });
    expect(placement.match).toEqual({ title: 'Projects', className: 'CabinetWClass' });
    expect(placement.rect).toEqual({ x: 10, y: 20, width: 1200, height: 800 });
  });
});

describe('writing a path with the known folder it is under', () => {
  it('prefers the longest folder that fits', () => {
    expect(abbreviate('C:\\Users\\Alex\\AppData\\Local\\Programs\\x.exe', ENV)).toBe(
      '%LOCALAPPDATA%\\Programs\\x.exe',
    );
    expect(abbreviate('c:\\program files\\App\\app.exe', ENV)).toBe('%PROGRAMFILES%\\App\\app.exe');
  });

  it('leaves a path under no known folder, and a near miss, alone', () => {
    expect(abbreviate('D:\\Tools\\x.exe', ENV)).toBe('D:\\Tools\\x.exe');
    expect(abbreviate('C:\\Users\\Alexander\\x.exe', ENV)).toBe('C:\\Users\\Alexander\\x.exe');
  });
});

describe('the step a window becomes', () => {
  it('starts its program and puts the window back where it is, found by its class', () => {
    const judged = judgeCaptured(captured());
    if (!judged.ok) throw new Error('capturable');
    const { config, placement } = stepFromCapture(judged, ENV);
    expect(config).toEqual({
      kind: 'app',
      program: '%LOCALAPPDATA%\\Programs\\Code\\Code.exe',
      args: [],
      workingDir: null,
    });
    expect(placement).toEqual({
      monitor: 2,
      rect: { x: 10, y: 20, width: 1200, height: 800 },
      state: 'normal',
      match: { title: null, className: 'Chrome_WidgetWin_1' },
    });
  });

  it('keeps neither the title nor anything not asked for', () => {
    const judged = judgeCaptured(captured());
    if (!judged.ok) throw new Error('capturable');
    const { config, placement } = stepFromCapture(judged, ENV);
    const stored = serializeStepConfig(config) + serializePlacement(placement);
    expect(stored).not.toContain('secret-plan');
    expect(stored).not.toContain('Visual Studio Code');
  });

  it('gives a window of a generic class no rule, so it is found by its own process', () => {
    const judged = judgeCaptured(
      captured({ program: 'C:\\Windows\\System32\\charmap.exe', className: '#32770' }),
    );
    if (!judged.ok) throw new Error('capturable');
    const { config, placement } = stepFromCapture(judged, ENV);
    expect(config.kind === 'app' && config.program).toBe('%SYSTEMROOT%\\System32\\charmap.exe');
    expect(placement.match).toBeUndefined();
    expect(placement.monitor).toBe(2);
  });

  it('places a maximised window by its screen and state, without a rectangle', () => {
    const judged = judgeCaptured(captured({ state: 'maximized', rect: null }));
    if (!judged.ok) throw new Error('capturable');
    expect(stepFromCapture(judged, ENV).placement).toEqual({
      monitor: 2,
      rect: null,
      state: 'maximized',
      match: { title: null, className: 'Chrome_WidgetWin_1' },
    });
  });

  it('asks for nothing when there is nothing to say, and drops a rule with nowhere to go', () => {
    const judged = judgeCaptured(captured({ monitor: null, rect: null, state: 'normal' }));
    if (!judged.ok) throw new Error('capturable');
    expect(stepFromCapture(judged, ENV).placement).toEqual({
      monitor: null,
      rect: null,
      state: 'normal',
    });
  });
});

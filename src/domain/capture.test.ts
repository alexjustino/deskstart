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
    ...over,
  };
}

describe('which windows can become a step', () => {
  it('takes a program Windows named', () => {
    expect(judgeCaptured(captured()).ok).toBe(true);
  });

  it('says why it cannot take the others', () => {
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
      'a Store app, which is not started by its path',
      'an Explorer window — add its folder as a Folder step instead',
    ]);
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
    expect(config.program).toBe('%SYSTEMROOT%\\System32\\charmap.exe');
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

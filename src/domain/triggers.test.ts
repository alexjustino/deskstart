import { describe, expect, it } from 'vitest';

import {
  describeSchedule,
  describeTrigger,
  parseStoredSchedule,
  parseStoredShortcut,
  readSchedule,
  readShortcut,
  serializeSchedule,
  serializeShortcut,
  whyNotTriggerable,
} from './triggers';

describe('a schedule', () => {
  it('is a time of day and the days it applies to', () => {
    expect(readSchedule({ at: '07:30' })).toEqual({ at: '07:30', days: [] });
    expect(readSchedule({ at: '07:30', days: ['fri', 'mon', 'mon'] })).toEqual({
      at: '07:30',
      days: ['mon', 'fri'],
    });
    expect(readSchedule(null)).toBeNull();
    expect(readSchedule({})).toBeNull();
  });

  it('refuses a time that is not one, a day that is not one, and a field that is not part of it', () => {
    for (const at of ['7:30', '24:00', '07:60', 'seven', '']) {
      const result = readSchedule({ at });
      expect(Array.isArray(result), at).toBe(true);
    }
    const day = readSchedule({ at: '07:30', days: ['monday'] });
    expect(Array.isArray(day) && day[0]?.path).toBe('schedule.days');
    const field = readSchedule({ at: '07:30', command: 'rm' });
    expect(Array.isArray(field) && field[0]?.path).toBe('schedule.command');
  });

  it('round-trips through the stored form, and stores nothing for none', () => {
    expect(serializeSchedule(null)).toBe('{}');
    expect(parseStoredSchedule('{}')).toBeNull();
    expect(parseStoredSchedule('')).toBeNull();
    const weekly = { at: '08:15', days: ['mon', 'wed'] as const };
    expect(parseStoredSchedule(serializeSchedule({ ...weekly, days: [...weekly.days] }))).toEqual({
      at: '08:15',
      days: ['mon', 'wed'],
    });
    expect(serializeSchedule({ at: '08:15', days: [] })).toBe('{"at":"08:15"}');
    expect(Array.isArray(parseStoredSchedule('{oops'))).toBe(true);
  });

  it('says what it means', () => {
    expect(describeSchedule(null)).toBeNull();
    expect(describeSchedule({ at: '07:30', days: [] })).toBe('every day at 07:30');
    expect(describeSchedule({ at: '07:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe(
      'weekdays at 07:30',
    );
    expect(describeSchedule({ at: '20:00', days: ['sat', 'sun'] })).toBe(
      'Saturday, Sunday at 20:00',
    );
  });
});

describe('a shortcut', () => {
  it('reads what a person writes into one canonical form', () => {
    expect(readShortcut('ctrl+alt+d')).toEqual({
      ok: true,
      shortcut: { modifiers: ['Ctrl', 'Alt'], key: 'D' },
    });
    expect(readShortcut(' Win + Shift + F9 ')).toEqual({
      ok: true,
      shortcut: { modifiers: ['Shift', 'Win'], key: 'F9' },
    });
    expect(readShortcut('alt+control+1')).toEqual({
      ok: true,
      shortcut: { modifiers: ['Ctrl', 'Alt'], key: '1' },
    });
  });

  it('refuses typing: a bare key, Shift alone, two keys, a key it does not register', () => {
    expect(readShortcut('d').ok).toBe(false);
    expect(readShortcut('shift+d').ok).toBe(false);
    expect(readShortcut('ctrl+a+b').ok).toBe(false);
    expect(readShortcut('ctrl+alt+space').ok).toBe(false);
    expect(readShortcut('ctrl+alt').ok).toBe(false);
    expect(readShortcut('').ok).toBe(false);
    const problem = readShortcut('shift+d');
    if (!problem.ok) expect(problem.problem).toContain('Shift and a key is typing');
  });

  it('is stored as its text', () => {
    const read = readShortcut('win+ctrl+d');
    if (!read.ok) throw new Error('reads');
    expect(serializeShortcut(read.shortcut)).toBe('Ctrl+Win+D');
    expect(parseStoredShortcut('Ctrl+Win+D')).toEqual(read.shortcut);
    expect(parseStoredShortcut('')).toBeNull();
    expect(serializeShortcut(null)).toBe('');
    expect(Array.isArray(parseStoredShortcut('d'))).toBe(true);
  });
});

describe('what a trigger may bind to', () => {
  it('not an unreviewed profile', () => {
    expect(whyNotTriggerable({ importedUnreviewed: false })).toBeNull();
    expect(whyNotTriggerable({ importedUnreviewed: true })).toContain('accept its steps first');
  });

  it('names the triggers that are not a person', () => {
    expect(describeTrigger('button')).toBeNull();
    expect(describeTrigger('schedule')).toBe('Scheduled');
    expect(describeTrigger('shortcut')).toBe('Shortcut');
    expect(describeTrigger('command')).toBe('Command line');
  });
});

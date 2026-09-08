/**
 * What starts a run without a person pressing Run (F9).
 *
 * Three triggers, and one rule they share: **a trigger binds to a profile id
 * and to nothing else** — never to a file, never to a step, and never to a
 * profile that has not been reviewed (ADR-013). The host asks the same
 * question again when a trigger fires, because the button is a courtesy and
 * the host is the boundary.
 *
 * - A **schedule** is a time of day and the days it applies to, registered
 *   with the Windows Task Scheduler (ADR-017). The scheduler is what fires it,
 *   which is why Deskstart need not be running: the task starts it with
 *   `--run <id> --trigger schedule`, and a running instance is handed the
 *   request instead of a second one opening.
 * - A **shortcut** is a key combination the system reports to Deskstart
 *   whatever program is in front. It needs a real modifier — Ctrl, Alt or Win
 *   — because a bare letter, or Shift and a letter, is typing.
 * - **Autostart** is not a trigger of a profile but of the product: start
 *   with Windows, so the shortcuts are there when the desktop is.
 *
 * Everything here is data. The host turns a schedule into the Task Scheduler's
 * own arguments and a shortcut into the system's registration — it has to
 * validate what it hands over anyway, so the vocabulary lives once, on the
 * side that speaks it. The person's values never meet a command line as text
 * (ADR-014).
 */

import type { Problem } from './profile';

/** Why a run started. `button` is a person; the rest are this module's. */
export const TRIGGERS = ['button', 'shortcut', 'schedule', 'command'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A time of day, and the days it applies to; no days means every day. */
export interface Schedule {
  /** `HH:MM`, 24-hour, as the Task Scheduler reads it. */
  at: string;
  days: Weekday[];
}

const SCHEDULE_FIELDS = new Set(['at', 'days']);
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read a stored or drafted schedule. `{}` and null mean "none". */
export function readSchedule(value: unknown, path = 'schedule'): Schedule | null | Problem[] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return [{ path, problem: 'a schedule must be an object' }];
  if (Object.keys(value).length === 0) return null;

  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!SCHEDULE_FIELDS.has(key)) {
      problems.push({ path: `${path}.${key}`, problem: 'this field is not part of a schedule' });
    }
  }
  const at = typeof value.at === 'string' ? value.at.trim() : '';
  if (!TIME.test(at)) {
    problems.push({ path: `${path}.at`, problem: 'a time of day is written HH:MM, 24-hour' });
  }
  const rawDays = value.days ?? [];
  const days: Weekday[] = [];
  if (!Array.isArray(rawDays)) {
    problems.push({ path: `${path}.days`, problem: 'the days are a list' });
  } else {
    for (const day of rawDays) {
      if (!(WEEKDAYS as readonly unknown[]).includes(day)) {
        problems.push({
          path: `${path}.days`,
          problem: `a day is one of ${WEEKDAYS.join(', ')}`,
        });
        break;
      }
      if (!days.includes(day as Weekday)) days.push(day as Weekday);
    }
  }
  if (problems.length > 0) return problems;
  // Kept in the week's order, whatever order they were written in.
  days.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  return { at, days };
}

/** The stored form. "None" stores as `{}`, so an untouched row stays small. */
export function serializeSchedule(schedule: Schedule | null): string {
  if (schedule === null) return '{}';
  return JSON.stringify(schedule.days.length === 0 ? { at: schedule.at } : schedule);
}

/** Read a stored `schedule_json` back. A row that cannot be read is a problem, not a crash. */
export function parseStoredSchedule(json: string): Schedule | null | Problem[] {
  if (json.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [{ path: 'schedule', problem: 'the stored schedule could not be read' }];
  }
  return readSchedule(parsed);
}

const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** What a schedule means, in a sentence. */
export function describeSchedule(schedule: Schedule | null): string | null {
  if (schedule === null) return null;
  if (schedule.days.length === 0) return `every day at ${schedule.at}`;
  const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
  if (schedule.days.length === 5 && weekdays.every((day) => schedule.days.includes(day))) {
    return `weekdays at ${schedule.at}`;
  }
  return `${schedule.days.map((day) => DAY_NAMES[day]).join(', ')} at ${schedule.at}`;
}

/** A key combination, in the form the system is asked to register. */
export interface Shortcut {
  modifiers: Array<'Ctrl' | 'Alt' | 'Shift' | 'Win'>;
  key: string;
}

const MODIFIER_NAMES: Record<string, Shortcut['modifiers'][number]> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  win: 'Win',
  super: 'Win',
  meta: 'Win',
};
const MODIFIER_ORDER: Shortcut['modifiers'] = ['Ctrl', 'Alt', 'Shift', 'Win'];
const KEY = /^([A-Z]|[0-9]|F([1-9]|1[0-9]|2[0-4]))$/;

export type ShortcutResult = { ok: true; shortcut: Shortcut } | { ok: false; problem: string };

/**
 * Read a key combination as a person writes it — `ctrl+alt+d`, `Win + F9` —
 * into one canonical form. A letter, a digit or a function key, with at least
 * one of Ctrl, Alt or Win: Shift alone is typing, and a bare key is typing.
 */
export function readShortcut(text: string): ShortcutResult {
  const parts = text
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return { ok: false, problem: 'write the keys, like Ctrl+Alt+D' };

  const modifiers: Shortcut['modifiers'] = [];
  let key: string | null = null;
  for (const part of parts) {
    const modifier = MODIFIER_NAMES[part.toLowerCase()];
    if (modifier !== undefined) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier);
      continue;
    }
    if (key !== null) return { ok: false, problem: 'a shortcut has one key after its modifiers' };
    const upper = part.toUpperCase();
    if (!KEY.test(upper)) {
      return {
        ok: false,
        problem: `${part} is not a key this product registers; use a letter, a digit or F1–F24`,
      };
    }
    key = upper;
  }
  if (key === null)
    return { ok: false, problem: 'a shortcut ends with a key: a letter, a digit or F1–F24' };
  if (!modifiers.some((modifier) => modifier !== 'Shift')) {
    return { ok: false, problem: 'a shortcut needs Ctrl, Alt or Win; Shift and a key is typing' };
  }
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return { ok: true, shortcut: { modifiers, key } };
}

/** The canonical text: what is stored, shown, and registered. */
export function serializeShortcut(shortcut: Shortcut | null): string {
  if (shortcut === null) return '';
  return [...shortcut.modifiers, shortcut.key].join('+');
}

/** Read a stored shortcut back; an empty string is "none". */
export function parseStoredShortcut(text: string): Shortcut | null | Problem[] {
  if (text.trim() === '') return null;
  const read = readShortcut(text);
  return read.ok ? read.shortcut : [{ path: 'shortcut', problem: read.problem }];
}

/**
 * Why a trigger may not bind to this profile, or null. One reason today, and
 * it is the review gate: a profile that arrived in a file and has not been
 * accepted step by step does not get a schedule or a key (ADR-013).
 */
export function whyNotTriggerable(profile: { importedUnreviewed: boolean }): string | null {
  return profile.importedUnreviewed
    ? 'this profile was imported and has not been reviewed; accept its steps first'
    : null;
}

/** What a trigger is called on a run's heading. */
export function describeTrigger(trigger: string): string | null {
  switch (trigger) {
    case 'schedule':
      return 'Scheduled';
    case 'shortcut':
      return 'Shortcut';
    case 'command':
      return 'Command line';
    default:
      return null;
  }
}

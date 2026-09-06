/**
 * What a step does with time (F2).
 *
 * - `pauseAfterMs`: how long the run waits after this step before starting the
 *   next — a breath between two programs that would otherwise fight for the
 *   disk. Any kind of step.
 * - `holdMs`: keep the program open this long, then close it. Only an
 *   application: the host holds the process it started; a folder, a file or a
 *   web page opened by Windows is not ours to close (ADR-018).
 * - `repeat`: how many times the program is opened in all — `1` is "open it";
 *   `3` is "open, close, open, close, open, close"; `'forever'` is until the
 *   run is stopped. More than once needs a hold, or there is nothing to cycle.
 * - `closedMs`: how long it stays closed between two openings.
 *
 * Stored as JSON in `step.timing_json`; `{}` means the defaults.
 */

import type { Problem } from './profile';

export interface Timing {
  pauseAfterMs: number;
  holdMs: number | null;
  repeat: number | 'forever';
  closedMs: number;
}

export const DEFAULT_TIMING: Timing = { pauseAfterMs: 0, holdMs: null, repeat: 1, closedMs: 0 };

const FIELDS = new Set(['pauseAfterMs', 'holdMs', 'repeat', 'closedMs']);

/** A whole number of milliseconds, zero or more. */
function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Read a timing document. `{}` is the default; anything unexpected is a problem. */
export function readTiming(value: unknown, path = 'timing'): Timing | Problem[] {
  if (value === undefined || value === null) return { ...DEFAULT_TIMING };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return [{ path, problem: 'timing must be an object' }];
  }
  const record = value as Record<string, unknown>;
  const problems: Problem[] = [];
  for (const key of Object.keys(record)) {
    if (!FIELDS.has(key))
      problems.push({ path: `${path}.${key}`, problem: 'this field is not part of timing' });
  }

  const pauseAfterMs = record.pauseAfterMs ?? 0;
  if (!isDuration(pauseAfterMs)) {
    problems.push({
      path: `${path}.pauseAfterMs`,
      problem: 'the pause must be a whole number of milliseconds',
    });
  }

  const holdMs = record.holdMs ?? null;
  if (holdMs !== null && (!isDuration(holdMs) || holdMs === 0)) {
    problems.push({
      path: `${path}.holdMs`,
      problem: 'a hold must be a whole number of milliseconds, more than zero, or left empty',
    });
  }

  const repeat = record.repeat ?? 1;
  const repeatOk =
    repeat === 'forever' || (typeof repeat === 'number' && Number.isInteger(repeat) && repeat >= 1);
  if (!repeatOk) {
    problems.push({
      path: `${path}.repeat`,
      problem: 'repeat must be a whole number from 1, or "forever"',
    });
  }

  const closedMs = record.closedMs ?? 0;
  if (!isDuration(closedMs)) {
    problems.push({
      path: `${path}.closedMs`,
      problem: 'the closed time must be a whole number of milliseconds',
    });
  }

  if (repeatOk && repeat !== 1 && holdMs === null) {
    problems.push({
      path: `${path}.repeat`,
      problem: 'a step repeats only when it has a hold to end each opening',
    });
  }

  if (problems.length > 0) return problems;
  return {
    pauseAfterMs: pauseAfterMs as number,
    holdMs: holdMs as number | null,
    repeat: repeat as number | 'forever',
    closedMs: closedMs as number,
  };
}

/** The timing as the host stores it. The defaults store as `{}`, so an untouched row stays small. */
export function serializeTiming(timing: Timing): string {
  const out: Record<string, unknown> = {};
  if (timing.pauseAfterMs !== 0) out.pauseAfterMs = timing.pauseAfterMs;
  if (timing.holdMs !== null) out.holdMs = timing.holdMs;
  if (timing.repeat !== 1) out.repeat = timing.repeat;
  if (timing.closedMs !== 0) out.closedMs = timing.closedMs;
  return JSON.stringify(out);
}

/** Read a stored timing back. A row that cannot be read is a problem, not a crash. */
export function parseStoredTiming(json: string): Timing | Problem[] {
  if (json.trim() === '') return { ...DEFAULT_TIMING };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [{ path: 'timing', problem: 'the stored timing is not JSON' }];
  }
  return readTiming(parsed);
}

/** "5 s", "2 min 30 s", "1 h": how a duration is said. */
export function describeDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} h`);
  if (m > 0) parts.push(`${m} min`);
  if (s > 0 || parts.length === 0) parts.push(`${s} s`);
  return parts.join(' ');
}

/** What a timing means, in a sentence, or nothing when it is the default. */
export function describeTiming(timing: Timing): string | null {
  const parts: string[] = [];
  if (timing.holdMs !== null) {
    parts.push(`open for ${describeDuration(timing.holdMs)}`);
    if (timing.repeat === 'forever') {
      parts.push(
        `again and again${timing.closedMs > 0 ? `, ${describeDuration(timing.closedMs)} closed between` : ''}`,
      );
    } else if (timing.repeat > 1) {
      parts.push(
        `${timing.repeat} times${timing.closedMs > 0 ? `, ${describeDuration(timing.closedMs)} closed between` : ''}`,
      );
    }
  }
  if (timing.pauseAfterMs > 0) parts.push(`then wait ${describeDuration(timing.pauseAfterMs)}`);
  return parts.length === 0 ? null : parts.join(', ');
}

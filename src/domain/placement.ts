/**
 * Where a window goes when the step opens it (F6).
 *
 * "Open the editor maximised on the left screen" is the second half of what a
 * setup is: not only what opens, but where it lands. A placement says three
 * things, each of which may be left alone:
 *
 * - `monitor`: which screen, by the number the system gives it — `1` is the
 *   primary. `null` means wherever the program would have opened.
 * - `rect`: where on that screen, in **that screen's own coordinates**, so a
 *   profile written for the second monitor says `0, 0` and not `1920, 0`. When
 *   no monitor is named, the rectangle is read in the desktop's coordinates,
 *   which is what a single-screen machine means anyway.
 * - `state`: normal, maximised or minimised.
 *
 * Only an **application** can be placed. A folder, a file or a web page opens
 * in a window that belongs to Explorer or to the browser — a process this
 * product did not start and does not own (ADR-018), and reaching into it means
 * matching windows by title, which is how a rule ends up moving the wrong
 * window. That is a 1.1 subject with its own risks; here, a window we place is
 * a window we opened.
 *
 * A placement that cannot be carried out is **said, never guessed**: a monitor
 * that is not there lands the window on the primary and the log says so
 * (ADR-016). A program that never shows a window of its own — a stub that
 * hands off, risk R2 — is a line that says the window never came, not silence.
 */

import type { Problem } from './profile';

export const WINDOW_STATES = ['normal', 'maximized', 'minimized'] as const;
export type WindowState = (typeof WINDOW_STATES)[number];

/** A rectangle in whole pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  /** The screen, numbered from 1, or null for wherever it opens. */
  monitor: number | null;
  /** Where on that screen, or null for wherever it opens. */
  rect: Rect | null;
  state: WindowState;
}

export const DEFAULT_PLACEMENT: Placement = { monitor: null, rect: null, state: 'normal' };

/** How long the host waits for the window to appear before giving up on placing it. */
export const WINDOW_TIMEOUT_MS = 5000;

const FIELDS = new Set(['monitor', 'rect', 'state']);
const RECT_FIELDS = new Set(['x', 'y', 'width', 'height']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function readRect(value: unknown, path: string): Rect | null | Problem[] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return [{ path, problem: 'a rectangle must be an object' }];
  if (Object.keys(value).length === 0) return null;

  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!RECT_FIELDS.has(key)) {
      problems.push({ path: `${path}.${key}`, problem: 'this field is not part of a rectangle' });
    }
  }
  for (const key of ['x', 'y'] as const) {
    if (!isWhole(value[key])) {
      problems.push({ path: `${path}.${key}`, problem: `${key} must be a whole number of pixels` });
    }
  }
  for (const key of ['width', 'height'] as const) {
    const measure = value[key];
    if (!isWhole(measure) || measure < 1) {
      problems.push({
        path: `${path}.${key}`,
        problem: `the ${key} must be a whole number of pixels, more than zero`,
      });
    }
  }
  if (problems.length > 0) return problems;
  return {
    x: value.x as number,
    y: value.y as number,
    width: value.width as number,
    height: value.height as number,
  };
}

/** Read a stored or drafted placement. `{}` and null mean "wherever it opens". */
export function readPlacement(value: unknown, path = 'placement'): Placement | Problem[] {
  if (value === undefined || value === null) return { ...DEFAULT_PLACEMENT };
  if (!isRecord(value)) return [{ path, problem: 'a placement must be an object' }];
  if (Object.keys(value).length === 0) return { ...DEFAULT_PLACEMENT };

  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!FIELDS.has(key)) {
      problems.push({ path: `${path}.${key}`, problem: 'this field is not part of a placement' });
    }
  }

  const monitor = value.monitor ?? null;
  if (monitor !== null && (!isWhole(monitor) || monitor < 1)) {
    problems.push({
      path: `${path}.monitor`,
      problem: 'a screen is named by its number, from 1',
    });
  }

  const state = value.state ?? 'normal';
  if (!(WINDOW_STATES as readonly unknown[]).includes(state)) {
    problems.push({
      path: `${path}.state`,
      problem: `a window is ${WINDOW_STATES.join(', ')}`,
    });
  }

  const rect = readRect(value.rect, `${path}.rect`);
  if (Array.isArray(rect)) problems.push(...rect);

  if (problems.length > 0 || Array.isArray(rect)) return problems;
  return { monitor: monitor as number | null, rect, state: state as WindowState };
}

/** Is anything actually asked for? The default is "wherever it opens, as it opens". */
export function isPlaced(placement: Placement): boolean {
  return placement.monitor !== null || placement.rect !== null || placement.state !== 'normal';
}

/** The stored form. Asking for nothing stores as `{}`, so an untouched row stays small. */
export function serializePlacement(placement: Placement): string {
  const out: Record<string, unknown> = {};
  if (placement.monitor !== null) out.monitor = placement.monitor;
  if (placement.rect !== null) out.rect = placement.rect;
  if (placement.state !== 'normal') out.state = placement.state;
  return JSON.stringify(out);
}

/** Read a stored `place_json` back. A row that cannot be read is a problem, not a crash. */
export function parseStoredPlacement(json: string): Placement | Problem[] {
  if (json.trim() === '') return { ...DEFAULT_PLACEMENT };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [{ path: 'placement', problem: 'where the window goes could not be read' }];
  }
  return readPlacement(parsed);
}

/** What a placement means, in a sentence, or nothing when it asks for nothing. */
export function describePlacement(placement: Placement): string | null {
  if (!isPlaced(placement)) return null;
  const parts: string[] = [];
  if (placement.state === 'maximized') parts.push('maximised');
  if (placement.state === 'minimized') parts.push('minimised');
  if (placement.rect !== null) {
    const { x, y, width, height } = placement.rect;
    parts.push(`${width}×${height} at ${x}, ${y}`);
  }
  if (placement.monitor !== null) parts.push(`on screen ${placement.monitor}`);
  return `opens ${parts.join(' ')}`;
}

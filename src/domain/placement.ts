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
 * Without more, only an **application** can be placed: its window is found by
 * the process this product started. A folder, a file, a web page, a terminal,
 * an editor or a machine's console opens in a window that belongs to some
 * other process (ADR-018, risk R2), and for those a placement needs a
 * **window rule** (1.1, ADR-029): which window to place, by a piece of its
 * title or by its class. A rule only ever matches a window that **appeared
 * after its step started** — the host notes the windows that are open the
 * moment the step begins and never considers one of them — so a rule cannot
 * move a window that was already there, whatever it matches. An application
 * may carry a rule too, for a program that hands its window to another
 * process (Notepad on Windows 11, a browser).
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

/**
 * Which new window a placement is for (1.1, ADR-029). At least one half is
 * given; a window must match every half that is.
 */
export interface WindowMatch {
  /** A piece of the window's title, matched ignoring case. */
  title: string | null;
  /** The window's class, exactly, ignoring case — e.g. `CabinetWClass` for Explorer. */
  className: string | null;
}

export interface Placement {
  /** The screen, numbered from 1, or null for wherever it opens. */
  monitor: number | null;
  /** Where on that screen, or null for wherever it opens. */
  rect: Rect | null;
  state: WindowState;
  /** Which new window to place; absent means the window of the process the step started. */
  match?: WindowMatch;
}

export const DEFAULT_PLACEMENT: Placement = {
  monitor: null,
  rect: null,
  state: 'normal',
};

/** The longest title piece or class a rule may hold: a rule, not a paragraph. */
const MATCH_LIMIT = 200;

/** How long the host waits for the window to appear before giving up on placing it. */
export const WINDOW_TIMEOUT_MS = 5000;

const FIELDS = new Set(['monitor', 'rect', 'state', 'match']);
const MATCH_FIELDS = new Set(['title', 'className']);
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

function readMatch(value: unknown, path: string): WindowMatch | null | Problem[] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return [{ path, problem: 'a window rule must be an object' }];
  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!MATCH_FIELDS.has(key)) {
      problems.push({ path: `${path}.${key}`, problem: 'this field is not part of a window rule' });
    }
  }
  const half = (key: 'title' | 'className', what: string): string | null => {
    const raw = value[key] ?? null;
    if (raw === null) return null;
    if (typeof raw !== 'string') {
      problems.push({ path: `${path}.${key}`, problem: `${what} must be text` });
      return null;
    }
    const text = raw.trim();
    if (text.length > MATCH_LIMIT) {
      problems.push({
        path: `${path}.${key}`,
        problem: `${what} is at most ${MATCH_LIMIT} characters`,
      });
      return null;
    }
    return text === '' ? null : text;
  };
  const title = half('title', 'a title to match');
  const className = half('className', 'a window class');
  if (problems.length > 0) return problems;
  if (title === null && className === null) return null;
  return { title, className };
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

  const match = readMatch(value.match, `${path}.match`);
  if (Array.isArray(match)) problems.push(...match);

  if (problems.length > 0 || Array.isArray(rect) || Array.isArray(match)) return problems;
  const placement: Placement = {
    monitor: monitor as number | null,
    rect,
    state: state as WindowState,
    ...(match !== null ? { match } : {}),
  };
  // A rule says which window; without somewhere to put it, it asks for nothing.
  if (match !== null && !isPlaced(placement)) {
    return [
      {
        path: `${path}.match`,
        problem:
          'a window rule needs somewhere to put the window: a screen, a rectangle or a state',
      },
    ];
  }
  return placement;
}

/** Is anything actually asked for? The default is "wherever it opens, as it opens". A rule alone asks for nothing. */
export function isPlaced(placement: Placement): boolean {
  return placement.monitor !== null || placement.rect !== null || placement.state !== 'normal';
}

/** The stored form. Asking for nothing stores as `{}`, so an untouched row stays small. */
export function serializePlacement(placement: Placement): string {
  const out: Record<string, unknown> = {};
  if (placement.monitor !== null) out.monitor = placement.monitor;
  if (placement.rect !== null) out.rect = placement.rect;
  if (placement.state !== 'normal') out.state = placement.state;
  if (placement.match !== undefined) {
    const match: Record<string, string> = {};
    if (placement.match.title !== null) match.title = placement.match.title;
    if (placement.match.className !== null) match.className = placement.match.className;
    out.match = match;
  }
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
  const which = describeMatch(placement.match);
  return which === null ? `opens ${parts.join(' ')}` : `${which} opens ${parts.join(' ')}`;
}

/** Which window a rule picks, as the start of a sentence, or null for no rule. */
export function describeMatch(match: WindowMatch | undefined): string | null {
  if (match === undefined) return null;
  const halves: string[] = [];
  if (match.title !== null) halves.push(`whose title has “${match.title}”`);
  if (match.className !== null) halves.push(`of class ${match.className}`);
  return `the first new window ${halves.join(' and ')}`;
}

/** A step placed on a screen this machine does not have right now. */
export interface OffScreen {
  id: string;
  title: string;
  monitor: number;
}

/**
 * The steps whose placement names a screen that is not here now (1.1). Such
 * a window still opens — on the primary, and the log says so (ADR-016) — but
 * a person looking at the profile should know before pressing Run, not after.
 * With no screens known at all, nothing is said: that is "could not ask", not
 * "screen missing".
 */
export function placedOffScreen(
  steps: readonly { id: string; title: string; placement: Placement }[],
  screens: readonly number[],
): OffScreen[] {
  if (screens.length === 0) return [];
  const here = new Set(screens);
  return steps
    .filter((step) => step.placement.monitor !== null && !here.has(step.placement.monitor))
    .map((step) => ({ id: step.id, title: step.title, monitor: step.placement.monitor as number }));
}

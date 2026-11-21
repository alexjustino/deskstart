/**
 * The desktop as it is, turned into a profile (1.1, ADR-030).
 *
 * "Set it up the way I like once, then capture it" is how most people would
 * rather write a profile than field by field. The host reads the windows that
 * are open — program, screen, rectangle, state, class, and a title to know
 * them by — and this module decides what each one can become:
 *
 * - an **application step** that starts its program, with a placement that
 *   puts its window back where it is now, and a window rule on its class so a
 *   program that hands its window to another process (ADR-029) is still found;
 * - or nothing, **with the reason**: a window whose program Windows would not
 *   name, a Store app (not started by its path), an Explorer window (its
 *   folder is not knowable from outside — add the folder as a Folder step).
 *
 * What a capture keeps is what starts and places the window, and nothing more.
 * **The title is not kept**: it is what a person reads to recognise a window
 * in the list, and it is also a document's name, a mail's subject, a chat. A
 * program's **arguments are not captured** either: a window does not say how
 * it was opened, and reading another process's command line is reading
 * further into the machine than this product goes. Paths under a known folder
 * are written with its name — `%LOCALAPPDATA%\…` — so the profile reads the
 * same on another account.
 */

import type { Placement, Rect, WindowState } from './placement';
import { DEFAULT_PLACEMENT, readPlacement } from './placement';
import { lastSegment, type AppStep } from './profile';

/**
 * Window classes too common to say which window: `#32770` is every standard
 * dialog box on Windows. A rule on one of these could pick a dialog that
 * happens to open during the step, so a window of such a class is found by
 * its own process instead (F6), and gets no rule.
 */
const GENERIC_CLASSES = new Set(['#32770']);

/** One window as the host read it. */
export interface CapturedWindow {
  program: string | null;
  title: string;
  className: string;
  monitor: number | null;
  rect: Rect | null;
  state: WindowState;
}

export type Judged =
  | { ok: true; window: CapturedWindow; program: string }
  | { ok: false; window: CapturedWindow; reason: string };

/** Can this window become a step, and if not, why — in a sentence for the list. */
export function judgeCaptured(window: CapturedWindow): Judged {
  const program = window.program?.trim() ?? '';
  if (program === '') {
    return {
      ok: false,
      window,
      reason: 'Windows did not say which program this is (it may run with more rights)',
    };
  }
  if (/[\\/]WindowsApps[\\/]/i.test(program)) {
    return { ok: false, window, reason: 'a Store app, which is not started by its path' };
  }
  if (lastSegment(program).toLowerCase() === 'explorer.exe') {
    return {
      ok: false,
      window,
      reason: 'an Explorer window — add its folder as a Folder step instead',
    };
  }
  return { ok: true, window, program };
}

/**
 * A path written with the known folder it is under, when it is under one:
 * `C:\Users\Alex\AppData\Local\Programs\x.exe` → `%LOCALAPPDATA%\Programs\x.exe`.
 * The longest folder that fits wins, so `%LOCALAPPDATA%` beats `%USERPROFILE%`.
 */
export function abbreviate(path: string, env: Readonly<Record<string, string>>): string {
  let best: { name: string; value: string } | null = null;
  for (const [name, value] of Object.entries(env)) {
    const folder = value.replace(/[\\/]+$/, '');
    if (folder.length < 3) continue;
    const lower = path.toLowerCase();
    const prefix = folder.toLowerCase();
    if (lower === prefix || lower.startsWith(`${prefix}\\`) || lower.startsWith(`${prefix}/`)) {
      if (best === null || folder.length > best.value.length) best = { name, value: folder };
    }
  }
  return best === null ? path : `%${best.name}%${path.slice(best.value.length)}`;
}

/** The step a capturable window becomes: its program, and where its window is now. */
export function stepFromCapture(
  judged: Judged & { ok: true },
  env: Readonly<Record<string, string>>,
): { config: AppStep; placement: Placement } {
  const { window } = judged;
  const config: AppStep = {
    kind: 'app',
    program: abbreviate(judged.program, env),
    args: [],
    workingDir: null,
  };
  const document: Record<string, unknown> = {
    state: window.state,
    ...(window.monitor !== null ? { monitor: window.monitor } : {}),
    ...(window.state === 'normal' &&
    window.rect !== null &&
    window.rect.width > 0 &&
    window.rect.height > 0
      ? { rect: window.rect }
      : {}),
  };
  const className = window.className.trim();
  if (className !== '' && !GENERIC_CLASSES.has(className)) document.match = { className };
  const read = readPlacement(document);
  if (!Array.isArray(read)) return { config, placement: read };
  // A window with nowhere to say (normal, no screen known) asks for nothing,
  // and the reader refuses a rule with nowhere to go: the rule is dropped.
  const { match: _rule, ...without } = document;
  const bare = readPlacement(without);
  return { config, placement: Array.isArray(bare) ? { ...DEFAULT_PLACEMENT } : bare };
}

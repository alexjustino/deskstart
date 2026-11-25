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
import { lastSegment, type StepConfig } from './profile';

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
  /** A packaged (Store) app's identity, when it is one (1.3). */
  appId: string | null;
  /** The folder an Explorer window shows, when it is one on disk (1.3). */
  folder: string | null;
}

/**
 * What a window can become (1.3): an ordinary **program**, started by its
 * path; a **Store app**, started the way Windows starts it, by its identity;
 * or the **folder** an Explorer window shows. 1.2 refused the last two —
 * which, on a real desktop, are most windows.
 */
export type Judged =
  | { ok: true; window: CapturedWindow; as: 'program'; program: string }
  | { ok: true; window: CapturedWindow; as: 'store'; appId: string }
  | { ok: true; window: CapturedWindow; as: 'folder'; folder: string }
  | { ok: false; window: CapturedWindow; reason: string };

/** How Windows starts a packaged app: Explorer opens its entry in the Apps folder. */
export const STORE_LAUNCHER = '%SYSTEMROOT%\\explorer.exe';
export function storeArgument(appId: string): string {
  return `shell:AppsFolder\\${appId}`;
}

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
  const appId = window.appId?.trim() ?? '';
  if (appId !== '') return { ok: true, window, as: 'store', appId };
  if (/[\\/]WindowsApps[\\/]/i.test(program) || /applicationframehost\.exe$/i.test(program)) {
    return {
      ok: false,
      window,
      reason: 'a Store app Windows did not name — open it and capture again',
    };
  }
  if (lastSegment(program).toLowerCase() === 'explorer.exe') {
    const folder = window.folder?.trim() ?? '';
    if (folder !== '') return { ok: true, window, as: 'folder', folder };
    return {
      ok: false,
      window,
      reason: 'an Explorer window on something that is not a folder (This PC, a library)',
    };
  }
  return { ok: true, window, as: 'program', program };
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

/** The step a capturable window becomes, and where its window is now. */
export function stepFromCapture(
  judged: Judged & { ok: true },
  env: Readonly<Record<string, string>>,
): { config: StepConfig; placement: Placement } {
  const { window } = judged;
  const config: StepConfig =
    judged.as === 'folder'
      ? { kind: 'folder', path: abbreviate(judged.folder, env) }
      : judged.as === 'store'
        ? {
            kind: 'app',
            program: STORE_LAUNCHER,
            args: [storeArgument(judged.appId)],
            workingDir: null,
          }
        : { kind: 'app', program: abbreviate(judged.program, env), args: [], workingDir: null };
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
  if (judged.as === 'folder') {
    // Explorer's window for this folder: its class, and the folder's name in
    // its title — both read from the folder, not from the window's title.
    document.match = { className: 'CabinetWClass', title: lastSegment(judged.folder) };
  } else if (className !== '' && !GENERIC_CLASSES.has(className)) {
    document.match = { className };
  }
  const read = readPlacement(document);
  if (!Array.isArray(read)) return { config, placement: read };
  // A window with nowhere to say (normal, no screen known) asks for nothing,
  // and the reader refuses a rule with nowhere to go: the rule is dropped.
  const { match: _rule, ...without } = document;
  const bare = readPlacement(without);
  return { config, placement: Array.isArray(bare) ? { ...DEFAULT_PLACEMENT } : bare };
}

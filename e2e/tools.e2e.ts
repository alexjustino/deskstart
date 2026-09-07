import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * The steps that call a tool (F7), and the proof of done from the
 * specification:
 *
 *   "a bookmark folder opens every page in one browser window; `wt` opens the
 *    named profile in the directory; a missing tool is a visible reason"
 *
 * Two of the three are driven here against the real binary. The third — a tool
 * that is not installed — cannot be staged on a machine that has all four, so
 * it is covered by the host's own tests (`os/tools.rs`) and by the same code
 * path this suite does exercise: a bookmarks file that is not there.
 *
 * **No browser is opened by this suite.** Starting Chrome with the person's own
 * profile would join their real session, restore their tabs and hold a profile
 * lock — a test has no business doing that on somebody's machine. What the
 * bookmarks case proves here is the reading: a dry run names the pages it would
 * open, having actually found the folder in the real file.
 */

function pids(image: string): number[] {
  const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH', '/FO', 'CSV'], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  return [...output.matchAll(/^"[^"]*","(\d+)"/gim)].map((m) => Number(m[1]));
}

function killProcess(pid: number): void {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {
    // Already gone.
  }
}

interface Node {
  name?: unknown;
  type?: unknown;
  url?: unknown;
  children?: unknown;
}

/**
 * A bookmark folder this machine really has, with pages in it — read the same
 * way the product reads it, from the same file, so the test asks for something
 * that is actually there rather than a name invented in a fixture.
 */
function aRealFolder(): { name: string; pages: number } | null {
  const local = process.env.LOCALAPPDATA;
  if (local === undefined) return null;
  let file: string;
  try {
    file = readFileSync(
      path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
      'utf-8',
    );
  } catch {
    return null;
  }
  let parsed: { roots?: Record<string, Node> };
  try {
    parsed = JSON.parse(file) as { roots?: Record<string, Node> };
  } catch {
    return null;
  }
  let best: { name: string; pages: number } | null = null;
  const visit = (node: Node): void => {
    const children = Array.isArray(node.children) ? (node.children as Node[]) : [];
    const pages = children.filter(
      (child) => typeof child.url === 'string' && /^https?:/i.test(child.url),
    ).length;
    const name = typeof node.name === 'string' ? node.name : '';
    if (name !== '' && pages > 0 && (best === null || pages < best.pages)) {
      // The smallest folder that has pages: enough to prove the reading,
      // nothing like the biggest.
      best = { name, pages };
    }
    for (const child of children) visit(child);
  };
  for (const root of Object.values(parsed.roots ?? {})) visit(root);
  return best;
}

const REAL_FOLDER = aRealFolder();

function edgeHasBookmarks(): boolean {
  const local = process.env.LOCALAPPDATA;
  if (local === undefined) return false;
  try {
    readFileSync(path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'));
    return true;
  } catch {
    return false;
  }
}

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

async function runAndWait(
  session: Session,
  which: 'Run' | 'Dry run' = 'Run',
  timeoutMs = 40_000,
): Promise<string[]> {
  const { driver } = session;
  const before = JSON.stringify(await logRows(session));
  await (await driver.findByXPath(`//button[normalize-space(.)="${which}"]`)).click();
  return driver.waitFor(
    'the run to finish',
    async () => {
      const rows = await logRows(session);
      if (rows.length === 0 || JSON.stringify(rows) === before) return null;
      return rows.at(-1)?.includes('Run finished') ? rows : null;
    },
    timeoutMs,
    200,
  );
}

/** Remove every step, so each test builds its own profile from nothing. */
async function clearSteps(session: Session): Promise<void> {
  const { driver } = session;
  for (;;) {
    const remove = await driver.findAll('button[aria-label^="Remove step"]');
    if (remove.length === 0) return;
    await (await driver.find('button[aria-label="Remove step 1"]')).click();
    await driver.waitFor('the step to go', async () => {
      const left = await driver.findAll('ol[aria-label="Steps"] li');
      return left.length === remove.length - 1 ? true : null;
    });
  }
}

/** Choose the kind of step being added. */
async function chooseKind(session: Session, label: string): Promise<void> {
  await (
    await session.driver.findByXPath(
      `//select[@aria-label="Kind"]/option[normalize-space(.)="${label}"]`,
    )
  ).click();
}

async function addStep(session: Session): Promise<void> {
  await (
    await session.driver.findByXPath(
      '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
    )
  ).click();
}

describe('the steps that call a tool', () => {
  let session: Session;
  let terminalsBefore: number[] = [];

  beforeAll(async () => {
    terminalsBefore = pids('WindowsTerminal.exe');
    session = await startSession();
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Context');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('input[aria-label="Program path"]');
  }, 120_000);

  afterAll(async () => {
    for (const pid of pids('WindowsTerminal.exe').filter((p) => !terminalsBefore.includes(p)))
      killProcess(pid);
    await session?.stop();
  });

  it('opens Windows Terminal in the directory the step names', async () => {
    const { driver } = session;
    await chooseKind(session, 'Terminal');
    const directory = await driver.waitForElement('input[aria-label="Terminal directory"]');
    await directory.sendKeys('%USERPROFILE%');
    await addStep(session);
    await driver.waitForText('Windows Terminal');

    const before = pids('WindowsTerminal.exe');
    const rows = await runAndWait(session);
    expect(rows.some((r) => r.includes('Opened Windows Terminal'))).toBe(true);
    expect(rows.at(-1)).toContain('Run finished — completed');

    // Windows itself: a terminal window that was not there before.
    const appeared = await driver.waitFor(
      'a new terminal',
      async () => {
        const now = pids('WindowsTerminal.exe').filter((pid) => !before.includes(pid));
        return now.length > 0 ? now : null;
      },
      15_000,
      250,
    );
    expect(appeared.length).toBeGreaterThan(0);
    await session.screenshot('tools-terminal');
  }, 180_000);

  it('refuses to be held or placed: its window is not this product’s', async () => {
    const { driver } = session;
    // The hold field is only offered for an application, so a terminal that
    // would be held can only be written in a file — and the reader refuses it.
    await (await driver.findByXPath('//button[normalize-space(.)="Import a profile"]')).click();
    const box = await driver.waitForElement('textarea[aria-label="Profile file"]');
    await box.sendKeys(
      JSON.stringify({
        schemaVersion: 1,
        name: 'Held terminal',
        steps: [{ kind: 'terminal', profile: null, directory: null, timing: { holdMs: 5000 } }],
      }),
    );
    await driver.waitForText('only an application can be held and closed');
    await driver.waitForText('hands its window to Windows Terminal');
    await session.screenshot('tools-refused');
    await (await driver.findByXPath('//button[normalize-space(.)="Cancel"]')).click();
    await driver.waitForGone('only an application can be held and closed');
  }, 120_000);

  it.skipIf(REAL_FOLDER === null)(
    'reads a real bookmark folder and says which pages it would open',
    async () => {
      const { driver } = session;
      const folder = REAL_FOLDER as { name: string; pages: number };
      await clearSteps(session);
      await chooseKind(session, 'Bookmark folder');
      const field = await driver.waitForElement('input[aria-label="Bookmark folder"]');
      await field.sendKeys(folder.name);
      await addStep(session);
      await driver.waitForText(folder.name);

      // A dry run: the file is read, the folder is found, the pages are named —
      // and no browser is opened on this person's machine.
      const rows = await runAndWait(session, 'Dry run');
      const line = rows.find((r) => r.includes('pages from') || r.includes('page from'));
      expect(line).toBeDefined();
      expect(line).toContain(folder.name);
      expect(line).toContain(`${folder.pages} `);
      expect(rows.at(-1)).toContain('Run finished — completed');
      await session.screenshot('tools-bookmarks-dry-run');
    },
    180_000,
  );

  it('says which folders there are when the one named is not', async () => {
    const { driver } = session;
    await clearSteps(session);
    await chooseKind(session, 'Bookmark folder');
    const field = await driver.waitForElement('input[aria-label="Bookmark folder"]');
    await field.sendKeys('Deskstart Nowhere');
    await addStep(session);
    await driver.waitForText('Deskstart Nowhere');

    // A second step, so the run has somewhere to carry on to.
    await chooseKind(session, 'Terminal');
    await addStep(session);
    await driver.waitFor('two steps', async () =>
      (await driver.findAll('ol[aria-label="Steps"] li')).length === 2 ? true : null,
    );

    const rows = await runAndWait(session);
    const failed = rows.find((r) => r.includes('Could not open'));
    expect(failed).toContain('no bookmark folder called Deskstart Nowhere');
    // It says which folders there are, rather than only which one there is not.
    expect(failed).toContain('there is ');
    // And the profile carried on past it, to its end.
    expect(rows.some((r) => r.includes('Opened Windows Terminal'))).toBe(true);
    expect(rows.at(-1)).toContain('Run finished — completed, with failures');
    await session.screenshot('tools-bookmarks-missing-folder');
  }, 180_000);

  it.skipIf(edgeHasBookmarks())(
    'says so when the browser has no bookmarks file here',
    async () => {
      const { driver } = session;
      await clearSteps(session);
      await chooseKind(session, 'Bookmark folder');
      await (
        await driver.findByXPath(
          '//form[@aria-label="Add a step"]//button[@role="radio" and normalize-space(.)="Edge"]',
        )
      ).click();
      const field = await driver.waitForElement('input[aria-label="Bookmark folder"]');
      await field.sendKeys('Work');
      await addStep(session);

      const rows = await runAndWait(session);
      const failed = rows.find((r) => r.includes('Could not open'));
      expect(failed).toContain('could not be opened');
      expect(rows.at(-1)).toContain('Run finished');
      await session.screenshot('tools-bookmarks-no-file');
    },
    180_000,
  );
});

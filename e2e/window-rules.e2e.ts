import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys, type Element } from './webdriver';

/**
 * Window rules (1.1, ADR-029), against the real binary.
 *
 * A folder opens in Explorer's window, which this product never started — so
 * until 1.1 it could not be placed at all. With a rule, the first **new**
 * window whose title has the folder's name is moved, and Windows itself is
 * asked where it ended up. The other half is the promise that makes a rule
 * safe: a window that was already open when the step began is never touched,
 * even when the rule matches it exactly.
 */

const ASKED = { x: 140, y: 110, width: 760, height: 540 };
const TOLERANCE = 24;
const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';

/** A C# helper that finds top-level windows whose title has a piece of text. */
const PROBE = [
  'Add-Type @"',
  'using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;',
  'public class Probe {',
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }',
  '  public delegate bool Visit(IntPtr h, IntPtr l);',
  '  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);',
  '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
  '  public static List<IntPtr> Find(string piece) {',
  '    var found = new List<IntPtr>();',
  '    EnumWindows((h, l) => { if (!IsWindowVisible(h)) return true; var s = new StringBuilder(512); GetWindowText(h, s, 512);',
  '      if (s.ToString().IndexOf(piece, StringComparison.OrdinalIgnoreCase) >= 0) found.Add(h); return true; }, IntPtr.Zero);',
  '    return found;',
  '  }',
  '}',
  '"@',
].join('\n');

function powershell(script: string): string {
  return execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf-8',
    windowsHide: true,
  }).trim();
}

/** Where the windows whose title has `piece` are, as Windows reports them. */
function rectsOf(piece: string): { x: number; y: number; width: number; height: number }[] {
  const output = powershell(
    [
      PROBE,
      `foreach ($h in [Probe]::Find('${piece}')) { $r = New-Object Probe+RECT; [void][Probe]::GetWindowRect($h, [ref]$r); "$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)" }`,
    ].join('\n'),
  );
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [x, y, width, height] = line.split(',').map(Number) as [number, number, number, number];
      return { x, y, width, height };
    });
}

/** Ask every window whose title has `piece` to close. */
function closeWindows(piece: string): void {
  try {
    powershell(
      [
        PROBE,
        `foreach ($h in [Probe]::Find('${piece}')) { [void][Probe]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) }`,
      ].join('\n'),
    );
  } catch {
    // Nothing to close.
  }
}

function charmaps(): number[] {
  const output = execFileSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq charmap.exe', '/NH', '/FO', 'CSV'],
    {
      encoding: 'utf-8',
      windowsHide: true,
    },
  );
  return [...output.matchAll(/^"[^"]*","(\d+)"/gim)].map((m) => Number(m[1]));
}

let charmapsBefore: number[] = [];

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

async function clearField(field: Element): Promise<void> {
  await field.sendKeys(Keys.CONTROL + 'a' + Keys.CONTROL + Keys.BACKSPACE);
}

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

async function chooseKind(session: Session, kind: string): Promise<void> {
  await (
    await session.driver.findByXPath(
      `//select[@aria-label="Kind"]/option[normalize-space(.)="${kind}"]`,
    )
  ).click();
}

/** Fill the rectangle and the rule, then add the step. */
async function placeAndAdd(session: Session, title: string): Promise<void> {
  const { driver } = session;
  for (const [label, value] of [
    ['X', ASKED.x],
    ['Y', ASKED.y],
    ['Width', ASKED.width],
    ['Height', ASKED.height],
  ] as const) {
    const field = await driver.find(`input[aria-label="${label}"]`);
    await clearField(field);
    await field.sendKeys(String(value));
  }
  await (await driver.find('input[aria-label="Window title has"]')).sendKeys(title);
  await (
    await driver.findByXPath(
      '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
    )
  ).click();
  await driver.waitFor('the step to be added', async () =>
    (await driver.findAll('ol[aria-label="Steps"] li')).length > 0 ? true : null,
  );
}

async function run(session: Session, which: 'Run' | 'Dry run' = 'Run'): Promise<string[]> {
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
    40_000,
    200,
  );
}

describe('a window rule', () => {
  let session: Session;
  let folder: string;
  let name: string;

  beforeAll(async () => {
    charmapsBefore = charmaps();
    folder = mkdtempSync(path.join(tmpdir(), 'deskstart-rule-'));
    name = path.basename(folder);
    session = await startSession();
    const { driver } = session;
    const field = await driver.waitForElement('input[aria-label="New profile name"]');
    await field.sendKeys('Rules');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('input[aria-label="Program path"]');
  }, 120_000);

  afterAll(async () => {
    closeWindows(name);
    await session?.stop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('says in a dry run which new window it would place', async () => {
    await chooseKind(session, 'Folder');
    await (await session.driver.waitForElement('input[aria-label="Folder path"]')).sendKeys(folder);
    await session.driver.waitForText('placing it needs a window rule');
    await placeAndAdd(session, name);
    const rows = await run(session, 'Dry run');
    expect(
      rows.some((r) => r.includes(`Would place the first new window whose title has “${name}”`)),
    ).toBe(true);
  }, 120_000);

  it('places the new Explorer window of a folder, where Windows says it is', async () => {
    const rows = await run(session);
    const placed = rows.find(
      (r) => r.startsWith('Placed the window') || r.includes('Placed the window'),
    );
    expect(placed, rows.join('\n')).toContain(name);
    const rect = await session.driver.waitFor(
      'the Explorer window',
      async () => rectsOf(name)[0] ?? null,
    );
    expect(near(rect.width, ASKED.width), JSON.stringify(rect)).toBe(true);
    expect(near(rect.height, ASKED.height), JSON.stringify(rect)).toBe(true);
    await session.screenshot('window-rule-folder');
  }, 120_000);

  it('never touches a window that was already open, even one the rule matches', async () => {
    // The Explorer window from the last case is still open, and placed at
    // ASKED. Move it somewhere else by hand, then run a step whose rule names
    // it — on a program, charmap, whose own window does not match.
    powershell(
      [
        PROBE,
        'Add-Type @"',
        'using System; using System.Runtime.InteropServices;',
        'public class Mover { [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r); }',
        '"@',
        `foreach ($h in [Probe]::Find('${name}')) { [void][Mover]::MoveWindow($h, 300, 260, 640, 420, $true) }`,
      ].join('\n'),
    );
    const before = rectsOf(name)[0];
    expect(before).toBeDefined();

    await clearSteps(session);
    await chooseKind(session, 'Application');
    await (
      await session.driver.waitForElement('input[aria-label="Program path"]')
    ).sendKeys(CHARMAP);
    await placeAndAdd(session, name);
    const rows = await run(session);
    expect(rows.some((r) => r.includes('no new window answering the rule appeared in time'))).toBe(
      true,
    );
    const after = rectsOf(name)[0];
    expect(after).toEqual(before);
  }, 120_000);

  afterAll(() => {
    // charmap was started by the run and not held: end the ones that were not
    // running before this file, and only those.
    for (const pid of charmaps().filter((pid) => !charmapsBefore.includes(pid))) {
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch {
        // Already gone.
      }
    }
  });
});

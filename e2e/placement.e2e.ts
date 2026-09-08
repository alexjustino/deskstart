import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys, type Element } from './webdriver';

/**
 * Window placement (F6), and its proof of done from the specification:
 *
 *   "lands on the chosen monitor at the chosen rectangle and state; a missing
 *    monitor is reported and the window lands on the primary"
 *
 * The window is measured **outside the product**: PowerShell asks Windows for
 * the rectangle of Character Map's window through `GetWindowRect`. A test that
 * read the placement back from Deskstart would only prove Deskstart remembers
 * what it was told.
 *
 * The first test asks for a rectangle and no screen, so the numbers are in the
 * desktop's own coordinates and the assertion does not depend on where this
 * machine's taskbar is. The screen number is what the second test is about.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';
/** Windows 11's stub: it hands off to the Store app and never shows a window of its own (R2). */
const NOTEPAD = '%SYSTEMROOT%\\System32\\notepad.exe';

const ASKED = { x: 120, y: 90, width: 700, height: 520 };
/** Windows rounds and a shadow is not part of the window; this is not a pixel test. */
const TOLERANCE = 24;

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

/** Where Windows says the window of this program is, right now. */
function windowRect(image: string): { x: number; y: number; width: number; height: number } | null {
  const script = [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class Probe {',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
    '}',
    '"@',
    `$p = Get-Process ${image} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1`,
    'if (-not $p) { exit }',
    '$r = New-Object Probe+RECT',
    '[void][Probe]::GetWindowRect($p.MainWindowHandle, [ref]$r)',
    '"$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"',
  ].join('\n');
  const output = execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf-8',
    windowsHide: true,
  }).trim();
  const parts = output.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return {
    x: parts[0] as number,
    y: parts[1] as number,
    width: parts[2] as number,
    height: parts[3] as number,
  };
}

async function clearField(field: Element): Promise<void> {
  await field.sendKeys(Keys.CONTROL + 'a' + Keys.CONTROL + Keys.BACKSPACE);
}

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

/** Remove every step the profile has, so the next test starts from nothing. */
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

/** Add an application step, with a hold and a placement. */
async function addPlacedStep(
  session: Session,
  program: string,
  holdS: string,
  where: {
    monitor?: string;
    rect?: { x: number; y: number; width: number; height: number };
    state?: 'Normal' | 'Maximised' | 'Minimised';
  },
): Promise<void> {
  const { driver } = session;
  const form = '//form[@aria-label="Add a step"]';
  const path = await driver.waitForElement('input[aria-label="Program path"]');
  await path.sendKeys(program);
  await (await driver.find('input[aria-label="Hold (seconds)"]')).sendKeys(holdS);
  if (where.monitor !== undefined) {
    await (await driver.find('select[aria-label="Screen"]')).sendKeys(where.monitor);
  }
  if (where.state !== undefined && where.state !== 'Normal') {
    await (
      await driver.findByXPath(
        `${form}//button[@role="radio" and normalize-space(.)="${where.state}"]`,
      )
    ).click();
  }
  if (where.rect !== undefined) {
    for (const [label, value] of [
      ['X', where.rect.x],
      ['Y', where.rect.y],
      ['Width', where.rect.width],
      ['Height', where.rect.height],
    ] as const) {
      const field = await driver.find(`input[aria-label="${label}"]`);
      await clearField(field);
      await field.sendKeys(String(value));
    }
  }
  await (await driver.findByXPath(`${form}//button[normalize-space(.)="Add step"]`)).click();
}

/** Press Run and wait for the line that says the window was dealt with. */
async function runUntilPlaced(session: Session, timeoutMs = 40_000): Promise<string[]> {
  const { driver } = session;
  await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
  return driver.waitFor(
    'the placement line',
    async () => {
      const rows = await logRows(session);
      return rows.some((r) => r.includes('the window')) ? rows : null;
    },
    timeoutMs,
    200,
  );
}

async function runFinished(session: Session, timeoutMs = 40_000): Promise<string[]> {
  return session.driver.waitFor(
    'the run to finish',
    async () => {
      const rows = await logRows(session);
      return rows.at(-1)?.includes('Run finished') ? rows : null;
    },
    timeoutMs,
    200,
  );
}

describe('where a window lands', () => {
  let session: Session;
  let charmapsBefore: number[] = [];
  let notepadsBefore: number[] = [];

  beforeAll(async () => {
    charmapsBefore = pids('charmap.exe');
    notepadsBefore = pids('notepad.exe');
    session = await startSession();
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Desk');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('input[aria-label="Program path"]');
  }, 120_000);

  afterAll(async () => {
    for (const pid of pids('charmap.exe').filter((p) => !charmapsBefore.includes(p)))
      killProcess(pid);
    for (const pid of pids('notepad.exe').filter((p) => !notepadsBefore.includes(p)))
      killProcess(pid);
    await session?.stop();
  });

  it('puts the window at the rectangle the step asked for', async () => {
    // Held long enough to be measured while it is still there.
    await addPlacedStep(session, CHARMAP, '12', { rect: ASKED });
    await session.driver.waitForText('opens 700×520 at 120, 90');

    const rows = await runUntilPlaced(session);
    expect(rows.some((r) => r.includes('Placed the window'))).toBe(true);

    // Windows itself, asked from outside the product.
    const measured = await session.driver.waitFor(
      'the window to be where it was put',
      async () => {
        const rect = windowRect('charmap');
        if (rect === null) return null;
        return Math.abs(rect.x - ASKED.x) <= TOLERANCE ? rect : null;
      },
      10_000,
      250,
    );
    expect(Math.abs(measured.y - ASKED.y)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(measured.width - ASKED.width)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(measured.height - ASKED.height)).toBeLessThanOrEqual(TOLERANCE);
    await session.screenshot('placement-rectangle');
    await runFinished(session);
  }, 180_000);

  it('says so, and uses the primary, when the screen the step names is not there', async () => {
    const { driver } = session;
    // The editor only offers screens that exist, so a profile that names a
    // screen this machine has not got can only arrive one way: in a file. That
    // is the case worth proving — a profile written on a two-screen desk,
    // opened on a laptop.
    await (await driver.findByXPath('//button[normalize-space(.)="Import a profile"]')).click();
    const box = await driver.waitForElement('textarea[aria-label="Profile file"]');
    await box.sendKeys(
      JSON.stringify({
        schemaVersion: 1,
        name: 'From the other desk',
        steps: [
          {
            kind: 'app',
            program: CHARMAP,
            args: [],
            workingDir: null,
            timing: { holdMs: 8000 },
            placement: { monitor: 9, state: 'maximized' },
          },
        ],
      }),
    );
    await driver.waitForText('From the other desk');
    await (await driver.findByXPath('//button[normalize-space(.)="Import"]')).click();

    // The review screen says where it would put the window, before it may.
    await driver.waitForText('opens maximised on screen 9');
    await (await driver.findByXPath('//button[contains(., "Accept all")]')).click();
    await (await driver.findByXPath('//button[normalize-space(.)="Accept them all"]')).click();
    await driver.waitForText('What this profile opens, in this order.');

    const rows = await runUntilPlaced(session);
    const line = rows.find((r) => r.includes('the window'));
    expect(line).toContain('Placed the window');
    expect(line).toContain('maximised');
    // The screen that is not there is said, not guessed past.
    expect(rows.join(' ')).toContain('not 9; the primary was used');

    const measured = await driver.waitFor(
      'the window to be maximised',
      async () => {
        const rect = windowRect('charmap');
        return rect !== null && rect.width > ASKED.width ? rect : null;
      },
      10_000,
      250,
    );
    expect(measured.width).toBeGreaterThan(ASKED.width);
    await session.screenshot('placement-missing-screen');
    await runFinished(session);
  }, 180_000);

  it('says a program that never shows a window of its own was not placed', async () => {
    await clearSteps(session);
    // Windows 11's Notepad stub hands off to the Store app and exits (R2):
    // there is no window of its own to place, and the log says that rather
    // than counting the placement as done.
    await addPlacedStep(session, NOTEPAD, '', { state: 'Maximised' });

    const rows = await runUntilPlaced(session);
    const line = rows.find((r) => r.includes('the window'));
    expect(line).toContain('Did not place the window');
    expect(line).toContain('did not show a window of its own');
    await session.screenshot('placement-no-window');

    const finished = await runFinished(session);
    // And the run carried on to its end regardless.
    expect(finished.at(-1)).toContain('Run finished');
  }, 180_000);

  it('writes what it would do, and moves nothing, in a dry run', async () => {
    await clearSteps(session);
    await addPlacedStep(session, CHARMAP, '', { rect: ASKED, state: 'Maximised' });
    const before = pids('charmap.exe');

    const { driver } = session;
    await (await driver.findByXPath('//button[normalize-space(.)="Dry run"]')).click();
    const rows = await runFinished(session);
    expect(rows.some((r) => r.includes('Would place the window'))).toBe(true);
    expect(rows.some((r) => r.includes('maximised'))).toBe(true);
    expect(pids('charmap.exe')).toEqual(before);
    await session.screenshot('placement-dry-run');

    // The section itself, on screen: the capture is a gate of its own.
    await driver.execute(
      "document.querySelectorAll('fieldset')[1]?.scrollIntoView({ block: 'center' })",
    );
    await session.screenshot('placement-where-section');
  }, 120_000);
});

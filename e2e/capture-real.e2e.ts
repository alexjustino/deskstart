import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys } from './webdriver';

/**
 * Capturing a real desktop (1.3) — the UAT that 1.2 failed, made a gate.
 *
 * 1.2's capture was proved with charmap, a classic Win32 program. A real
 * desktop is mostly Explorer windows and Store apps, and 1.2 refused both:
 * a person found nothing to tick. Here, an Explorer window on a folder and
 * Windows Calculator (a Store app) are opened, captured, closed, and brought
 * back by running the profile the capture made.
 */

const CALCULATOR = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
const EXPLORER = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe');

const PROBE = [
  'Add-Type @"',
  'using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;',
  'public class Probe {',
  '  public delegate bool Visit(IntPtr h, IntPtr l);',
  '  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);',
  '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
  '  public static List<IntPtr> Find(string piece) { var found = new List<IntPtr>();',
  '    EnumWindows((h, l) => { if (!IsWindowVisible(h)) return true; var s = new StringBuilder(512); GetWindowText(h, s, 512);',
  '      if (s.ToString().IndexOf(piece, StringComparison.OrdinalIgnoreCase) >= 0) found.Add(h); return true; }, IntPtr.Zero);',
  '    return found; }',
  '}',
  '"@',
].join('\n');

function powershell(script: string): string {
  return execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf-8',
    windowsHide: true,
  }).trim();
}

function windowsTitled(piece: string): number {
  return Number(powershell([PROBE, `([Probe]::Find('${piece}')).Count`].join('\n'))) || 0;
}

function closeTitled(piece: string): void {
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

function calculators(): number[] {
  const output = execFileSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq CalculatorApp.exe', '/NH', '/FO', 'CSV'],
    { encoding: 'utf-8', windowsHide: true },
  );
  return [...output.matchAll(/^"[^"]*","(\d+)"/gim)].map((m) => Number(m[1]));
}

function endCalculators(except: number[]): void {
  for (const pid of calculators().filter((p) => !except.includes(p))) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      // Already gone.
    }
  }
}

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

describe('capturing a real desktop', () => {
  let session: Session;
  let folder: string;
  let name: string;
  let calculatorsBefore: number[] = [];

  beforeAll(async () => {
    calculatorsBefore = calculators();
    folder = mkdtempSync(path.join(tmpdir(), 'deskstart-uat-'));
    name = path.basename(folder);
    session = await startSession();
    await session.driver.waitForElement('input[aria-label="New profile name"]');
    // What a person has open: a folder in Explorer, and a Store app.
    execFileSync(EXPLORER, [folder], { windowsHide: false });
    execFileSync(EXPLORER, [`shell:AppsFolder\\${CALCULATOR}`], { windowsHide: false });
    await session.driver.waitFor(
      'the folder and Calculator to show',
      async () =>
        windowsTitled(name) > 0 && calculators().length > calculatorsBefore.length ? true : null,
      20_000,
      300,
    );
  }, 120_000);

  afterAll(async () => {
    closeTitled(name);
    endCalculators(calculatorsBefore);
    await session?.stop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('offers the Explorer window as its folder and Calculator as itself', async () => {
    const { driver } = session;
    await (await driver.findByXPath('//button[normalize-space(.)="Capture this desktop"]')).click();
    const folderBox = await driver.waitFor(
      'the folder in the list',
      async () =>
        (await driver.findAll(`input[aria-label^="Include ${name} (folder)"]`))[0] ?? null,
      20_000,
      300,
    );
    const calculatorBox = await driver.waitFor(
      'Calculator in the list',
      async () =>
        (await driver.findAll('input[aria-label^="Include Windows Calculator"]'))[0] ?? null,
      20_000,
      300,
    );
    await (await driver.findByXPath('//button[normalize-space(.)="Untick all"]')).click();
    await folderBox.click();
    await calculatorBox.click();
    await driver.waitForText('2 of');
    await session.screenshot('capture-real-dialog');

    const field = await driver.find('input[aria-label="Captured profile name"]');
    await field.sendKeys(Keys.CONTROL + 'a' + Keys.CONTROL + Keys.BACKSPACE + 'Real desk');
    await (
      await driver.findByXPath('//button[normalize-space(.)="Make a profile of 2 windows"]')
    ).click();
    await driver.waitForText('2 steps, in this order.');
    const steps = await (await driver.find('ol[aria-label="Steps"]')).text();
    expect(steps).toContain(name);
    expect(steps).toContain('Windows Calculator');
    expect(steps).not.toContain('ApplicationFrameHost');
    await session.screenshot('capture-real-profile');
  }, 120_000);

  it('runs it: the folder and Calculator come back', async () => {
    const { driver } = session;
    closeTitled(name);
    endCalculators(calculatorsBefore);
    await driver.waitFor(
      'both to be closed',
      async () =>
        windowsTitled(name) === 0 && calculators().length <= calculatorsBefore.length ? true : null,
      15_000,
      300,
    );

    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    const rows = await driver.waitFor(
      'the run to finish',
      async () => {
        const all = await logRows(session);
        return all.at(-1)?.includes('Run finished') ? all : null;
      },
      60_000,
      300,
    );
    expect(rows.at(-1), rows.join('\n')).toContain('completed');
    await driver.waitFor(
      'the folder and Calculator back',
      async () =>
        windowsTitled(name) > 0 && calculators().length > calculatorsBefore.length ? true : null,
      20_000,
      300,
    );
    expect(rows.filter((r) => r.includes('Placed the window')).length, rows.join('\n')).toBe(2);
  }, 120_000);
});

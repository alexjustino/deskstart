import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * Capturing the desktop as a profile (1.1, ADR-030), against the real binary.
 *
 * The round trip is the proof: a window is put somewhere by hand, the desktop
 * is captured with that window ticked, the window is closed, and the profile
 * the capture made is run — and the program comes back, with its window where
 * it was, as Windows measures it. On the way, what the profile keeps is
 * checked: the program and where it goes, never the window's title.
 */

const TOLERANCE = 24;
const WHERE = { x: 230, y: 170 };

const PROBE = [
  'Add-Type @"',
  'using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;',
  'public class Probe {',
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }',
  '  public delegate bool Visit(IntPtr h, IntPtr l);',
  '  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);',
  '  public static IntPtr Of(uint want) { IntPtr found = IntPtr.Zero;',
  '    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);',
  '      if (pid == want && IsWindowVisible(h)) { found = h; return false; } return true; }, IntPtr.Zero);',
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

function kill(pid: number): void {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {
    // Already gone.
  }
}

/** The window of a process, as Windows reports it, or null before it shows. */
function rectOf(pid: number): { x: number; y: number; width: number; height: number } | null {
  const output = powershell(
    [
      PROBE,
      `$h = [Probe]::Of(${pid}); if ($h -eq [IntPtr]::Zero) { exit }`,
      '$r = New-Object Probe+RECT; [void][Probe]::GetWindowRect($h, [ref]$r)',
      '"$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"',
    ].join('\n'),
  );
  const parts = output.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  return { x, y, width, height };
}

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

describe('capturing the desktop', () => {
  let session: Session;
  let before: number[] = [];
  let mine: number | null = null;
  let placedAt: { x: number; y: number; width: number; height: number } | null = null;

  beforeAll(async () => {
    before = charmaps();
    session = await startSession();
    await session.driver.waitForElement('input[aria-label="New profile name"]');

    // A window put somewhere by hand, as a person would before capturing.
    const started = powershell(
      '(Start-Process -FilePath "$env:SystemRoot\\System32\\charmap.exe" -PassThru).Id',
    );
    mine = Number(started);
    placedAt = await session.driver.waitFor(
      'charmap to show',
      async () => rectOf(mine as number),
      15_000,
      250,
    );
    powershell(
      [
        PROBE,
        `[void][Probe]::MoveWindow([Probe]::Of(${mine}), ${WHERE.x}, ${WHERE.y}, ${placedAt.width}, ${placedAt.height}, $true)`,
      ].join('\n'),
    );
    placedAt = rectOf(mine);
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
    for (const pid of charmaps().filter((p) => !before.includes(p))) kill(pid);
  });

  it('lists the windows, and makes a profile of the one ticked — without its title', async () => {
    const { driver } = session;
    await (await driver.findByXPath('//button[normalize-space(.)="Capture this desktop"]')).click();
    await driver.waitForText('Each window ticked becomes a step');
    const box = await driver.waitFor(
      'charmap in the list',
      async () => (await driver.findAll('input[aria-label^="Include charmap.exe"]'))[0] ?? null,
      15_000,
      250,
    );
    await (await driver.findByXPath('//button[normalize-space(.)="Untick all"]')).click();
    await box.click();
    await driver.waitForText('1 of');
    await session.screenshot('capture-dialog');

    const name = await driver.find('input[aria-label="Captured profile name"]');
    await name.sendKeys('aCaptured');
    await (
      await driver.findByXPath('//button[normalize-space(.)="Make a profile of 1 window"]')
    ).click();

    await driver.waitForText('1 step, in this order.');
    const steps = await (await driver.find('ol[aria-label="Steps"]')).text();
    expect(steps).toContain('charmap.exe');
    // A standard dialog's class says nothing about which window it is, so
    // charmap is found by its own process, with no rule.
    expect(steps).not.toContain('of class #32770');
    // The title helped choose the window; the profile does not keep it.
    expect(steps).not.toContain('Character Map');
    await session.screenshot('capture-profile');
  }, 120_000);

  it('runs it: the program comes back, with its window where it was', async () => {
    const { driver } = session;
    if (mine !== null) kill(mine);
    const running = charmaps();
    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    const rows = await driver.waitFor(
      'the window to be placed',
      async () => {
        const all = await logRows(session);
        return all.some((r) => r.includes('Placed the window') || r.includes('Did not place'))
          ? all
          : null;
      },
      40_000,
      250,
    );
    expect(
      rows.some((r) => r.includes('Placed the window')),
      rows.join('\n'),
    ).toBe(true);
    const fresh = charmaps().filter((p) => !running.includes(p));
    expect(fresh.length).toBeGreaterThan(0);
    const now = rectOf(fresh[0] as number);
    expect(now).not.toBeNull();
    expect(
      Math.abs((now?.x ?? 0) - (placedAt?.x ?? 0)),
      JSON.stringify({ now, placedAt }),
    ).toBeLessThanOrEqual(TOLERANCE);
    expect(
      Math.abs((now?.y ?? 0) - (placedAt?.y ?? 0)),
      JSON.stringify({ now, placedAt }),
    ).toBeLessThanOrEqual(TOLERANCE);
  }, 120_000);
});

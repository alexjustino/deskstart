import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys } from './webdriver';

/**
 * Triggers (F9), and the proof of done from the specification:
 *
 *   "a task registered by the app fires at the minute set and the run appears
 *    in the log; the shortcut runs the profile over another program"
 *
 * Both halves are driven here against the real binary, and both are checked
 * from outside the product where that is possible: the task is read back from
 * the Windows Task Scheduler with `schtasks`, the key combination is pressed
 * by PowerShell as if by a hand, the second launch is a real second process,
 * and the autostart entry is read back from the registry.
 *
 * The scheduled case takes real minutes: the scheduler fires on the minute,
 * so the task is set for two minutes ahead and the log is watched until the
 * run arrives. That wait is the test.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const APP =
  process.env.DESKSTART_E2E_APP ?? path.join(ROOT, 'src-tauri', 'target', 'debug', 'deskstart.exe');

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

/** The tasks this product has in the scheduler, by name, as Windows lists them. */
function deskstartTasks(): string[] {
  let output: string;
  try {
    output = execFileSync('schtasks', ['/Query', '/FO', 'CSV', '/NH'], {
      encoding: 'utf-8',
      windowsHide: true,
    });
  } catch {
    return [];
  }
  return [...output.matchAll(/^"(\\Deskstart\\[^"]+)"/gim)].map((m) => m[1] as string);
}

/** What the task would do, straight from the scheduler. */
function taskAction(name: string): string {
  const output = execFileSync('schtasks', ['/Query', '/TN', name, '/V', '/FO', 'LIST'], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  return output.match(/^Task To Run:\s*(.+)$/im)?.[1]?.trim() ?? '';
}

function deleteTask(name: string): void {
  try {
    execFileSync('schtasks', ['/Delete', '/TN', name, '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    // Already gone.
  }
}

/** `HH:MM` local time, this many minutes from now. */
function minutesFromNow(minutes: number): string {
  const when = new Date(Date.now() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/** The Run key, as Windows keeps it. */
function runKey(): string {
  try {
    return execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'],
      { encoding: 'utf-8', windowsHide: true },
    );
  } catch {
    return '';
  }
}

/** Press a key combination as if by a hand, to whatever is in front. */
function pressKeys(sendKeys: string): void {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeys}')`,
    ],
    { stdio: 'ignore', windowsHide: true },
  );
}

/** Wait for the latest run to have been started by this trigger, and to finish. */
async function waitForTriggeredRun(
  session: Session,
  chip: string,
  timeoutMs: number,
): Promise<void> {
  const { driver } = session;
  await driver.waitFor(
    `a run started by ${chip}`,
    async () => {
      const heading = await driver.findAll('[data-run-heading]');
      if (heading.length === 0) return null;
      const text = await heading[0]!.text();
      if (!text.includes(chip)) return null;
      const rows = await driver.findAll('ol[aria-label="Run log"] li');
      const last = rows.at(-1);
      if (last === undefined) return null;
      return (await last.text()).includes('Run finished') ? true : null;
    },
    timeoutMs,
    500,
  );
}

describe('what starts a run without the button', () => {
  let session: Session;
  let charmapsBefore: number[] = [];
  let tasksBefore: string[] = [];
  let profileId: string | null = null;

  beforeAll(async () => {
    charmapsBefore = pids('charmap.exe');
    tasksBefore = deskstartTasks();
    session = await startSession();
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Clock');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(CHARMAP);
    await (
      await driver.findByXPath(
        '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
      )
    ).click();
    await driver.waitForText('charmap.exe');
  }, 120_000);

  afterAll(async () => {
    for (const name of deskstartTasks().filter((t) => !tasksBefore.includes(t))) deleteTask(name);
    for (const pid of pids('charmap.exe').filter((p) => !charmapsBefore.includes(p)))
      killProcess(pid);
    await session?.stop();
  });

  it('registers a task with Windows, which fires at the minute set and the run appears', async () => {
    const { driver } = session;
    const at = minutesFromNow(2);
    const field = await driver.waitForElement('input[aria-label="Time of day"]');
    await field.sendKeys(at);
    await (await driver.findByXPath('//button[normalize-space(.)="Save schedule"]')).click();
    await driver.waitForText('Registered with Windows');
    await driver.waitForText(`every day at ${at}`);

    // Windows itself: a task of this product's, whose action is this
    // executable with the profile's id and nothing a person typed.
    const created = deskstartTasks().filter((t) => !tasksBefore.includes(t));
    expect(created).toHaveLength(1);
    const task = created[0] as string;
    profileId = task.split('\\').pop() ?? null;
    expect(profileId).toMatch(/^[0-9a-f-]{36}$/);
    const action = taskAction(task);
    expect(action).toContain(`--run ${profileId}`);
    expect(action).toContain('--trigger schedule');
    expect(action.toLowerCase()).toContain(path.basename(APP).toLowerCase());
    await session.screenshot('triggers-scheduled');

    // The minute comes, the scheduler starts a second Deskstart, the first is
    // handed the request, and the run is in the log with its trigger.
    await waitForTriggeredRun(session, 'Scheduled', 200_000);
    await session.screenshot('triggers-scheduled-run');

    await (await driver.findByXPath('//button[normalize-space(.)="Clear schedule"]')).click();
    await driver.waitForText('Not scheduled.');
    await driver.waitFor(
      'the task to be gone',
      async () => (deskstartTasks().includes(task) ? null : true),
      15_000,
      500,
    );
  }, 300_000);

  it('a key combination pressed anywhere starts the profile', async () => {
    const { driver } = session;
    const field = await driver.waitForElement('input[aria-label="Shortcut"]');
    await field.sendKeys('ctrl+alt+f9');
    await (await driver.find('button[aria-label="Save shortcut"]')).click();
    await driver.waitForText('Ctrl+Alt+F9 will start this profile');

    // Pressed as if by a hand, with no window of ours asked to take it.
    pressKeys('^%{F9}');
    await waitForTriggeredRun(session, 'Shortcut', 60_000);
    await session.screenshot('triggers-shortcut-run');

    await (await driver.findByXPath('//button[normalize-space(.)="Clear shortcut"]')).click();
    await driver.waitForText('Pressed anywhere');
  }, 120_000);

  it('refuses a combination that is typing, before Windows is asked', async () => {
    const { driver } = session;
    const field = await driver.waitForElement('input[aria-label="Shortcut"]');
    await field.sendKeys('shift+d');
    await (await driver.find('button[aria-label="Save shortcut"]')).click();
    await driver.waitForText('Shift and a key is typing');
    await field.sendKeys(Keys.CONTROL + 'a' + Keys.CONTROL + Keys.BACKSPACE);
  }, 60_000);

  it('closing the window keeps Deskstart; a second launch with --run hands it the request', async () => {
    {
      const { driver } = session;
      expect(profileId, 'the id the scheduled task named').not.toBeNull();
      const id = profileId as string;
      const before = pids('deskstart.exe');

      // Closed, not quit: the process is still there two seconds later.
      await (await driver.find('button[aria-label="Close"]')).click();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect(pids('deskstart.exe').length).toBe(before.length);

      const second = spawn(APP, ['--run', id], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      second.unref();
      await waitForTriggeredRun(session, 'Command line', 60_000);
      // And the second process did not stay: the first is the only Deskstart.
      await session.driver.waitFor(
        'the second launch to have gone',
        async () => (pids('deskstart.exe').length <= before.length ? true : null),
        20_000,
        500,
      );
      await session.screenshot('triggers-second-launch');
    }
  }, 120_000);

  it('starts with Windows only when asked, and stops when asked again', async () => {
    const { driver } = session;
    await (
      await driver.findByXPath('//nav[@aria-label="Main"]//*[normalize-space(.)="Diagnostics"]')
    ).click();
    const box = await driver.waitForElement('input[aria-label="Start with Windows"]');
    expect(runKey().toLowerCase()).not.toContain(path.dirname(APP).toLowerCase());

    await box.click();
    await driver.waitForText('Deskstart starts when you sign in.');
    expect(runKey().toLowerCase()).toContain(path.dirname(APP).toLowerCase());
    await session.screenshot('triggers-autostart');

    await (await driver.find('input[aria-label="Start with Windows"]')).click();
    await driver.waitForText('Deskstart starts only when you open it.');
    expect(runKey().toLowerCase()).not.toContain(path.dirname(APP).toLowerCase());
  }, 60_000);
});

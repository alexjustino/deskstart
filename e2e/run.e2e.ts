import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * The proof of done for the foundation, verbatim from the specification:
 *
 *   "a profile with one step opens Notepad and the log says when and with
 *    which PID"
 *
 * Not "the button was clicked" — Windows is asked whether a Notepad appeared,
 * and the suite closes it afterwards. Then the application is restarted and
 * the log is still there.
 *
 * Why the check is "a Notepad appeared" and not "the PID in the log is alive":
 * on Windows 11, `System32\notepad.exe` is a stub that hands off to the Store
 * Notepad and exits within milliseconds. The PID the log prints is true — it
 * is the process Deskstart started — and it is gone by the time anyone looks.
 * That is risk R2 in the specification, seen on the first real run rather
 * than read about; readiness by window is F4's subject.
 */

const NOTEPAD = 'C:\\Windows\\System32\\notepad.exe';

/** The PIDs of every running Notepad, whichever binary it is. */
function notepadPids(): number[] {
  const output = execFileSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq notepad.exe', '/NH', '/FO', 'CSV'],
    {
      encoding: 'utf-8',
      windowsHide: true,
    },
  );
  return [...output.matchAll(/^"[^"]*","(\d+)"/gim)].map((m) => Number(m[1]));
}

function killProcess(pid: number): void {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {
    // Already gone.
  }
}

describe('a run', () => {
  let session: Session;
  let pid: number | null = null;
  /** Notepads that were already open before the suite: not ours to close. */
  let before: number[] = [];

  beforeAll(async () => {
    before = notepadPids();
    session = await startSession();
  });

  afterAll(async () => {
    for (const opened of notepadPids().filter((p) => !before.includes(p))) killProcess(opened);
    await session?.stop();
  });

  it('creates a profile with one step', async () => {
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Morning');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('h1');
    expect(await (await driver.find('h1')).text()).toBe('Morning');

    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(NOTEPAD);
    await (await driver.findByXPath('//button[normalize-space(.)="Add step"]')).click();
    const step = await driver.waitForText('notepad.exe');
    expect(await step.text()).toContain('notepad.exe');
    await session.screenshot('run-profile-ready');
  });

  it('refuses a relative path before anything is stored', async () => {
    const { driver } = session;
    const program = await driver.find('input[aria-label="Program path"]');
    await program.clear();
    await program.sendKeys('notepad.exe');
    await (await driver.findByXPath('//button[normalize-space(.)="Add step"]')).click();
    await driver.waitForText('the path is not absolute');
    await program.clear();
    const steps = await driver.findAll('ol[aria-label="Steps"] li');
    expect(steps.length).toBe(1);
  });

  it('a dry run writes what it would do and starts nothing', async () => {
    const { driver } = session;
    await (await driver.findByXPath('//button[normalize-space(.)="Dry run"]')).click();
    const line = await driver.waitForText('Would start notepad.exe');
    expect(await line.text()).toContain('Would start notepad.exe');
    await driver.waitForText('Run finished — completed');
    const lines = await driver.findAll('ol[aria-label="Run log"] li');
    expect(lines.length).toBe(3);
  });

  it('Run opens Notepad and the log says when and with which PID', async () => {
    const { driver } = session;
    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    const line = await driver.waitForText('Started notepad.exe — PID');
    const text = await line.text();
    const match = /PID (\d+)/.exec(text);
    expect(match, `no PID in: ${text}`).not.toBeNull();
    pid = Number(match?.[1]);
    expect(pid).toBeGreaterThan(0);

    // The clock on the row is the time the host wrote, in the file.
    const row = await driver.findByXPath('//ol[@aria-label="Run log"]/li[@data-kind="spawned"]');
    const stamp = await (await row.find('span')).text();
    expect(stamp).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);

    // Windows agrees that a Notepad appeared that was not there before.
    await driver.waitFor('a new Notepad process', async () =>
      notepadPids().some((p) => !before.includes(p)) ? true : null,
    );
    await driver.waitForText('Run finished — completed');
    await session.screenshot('run-notepad-started');
  });

  it('a program that does not exist is a reason in the log, and the run goes on', async () => {
    const { driver } = session;
    const program = await driver.find('input[aria-label="Program path"]');
    await program.sendKeys('C:\\Windows\\System32\\no-such-program-deskstart.exe');
    await (await driver.findByXPath('//button[normalize-space(.)="Add step"]')).click();
    await driver.waitForText('no-such-program-deskstart.exe');

    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    await driver.waitForText(
      'Could not start no-such-program-deskstart.exe: the program was not found',
    );
    await driver.waitForText('Run finished — completed, with failures');

    // Close the second Notepad this run opened; the first stays for the restart check.
    const rows = await driver.findAll('ol[aria-label="Run log"] li[data-kind="spawned"]');
    expect(rows.length).toBe(1);
    await session.screenshot('run-with-failure');
  });

  it('the log survives a restart', async () => {
    await session.restart();
    const { driver } = session;
    await (await driver.findByXPath('//nav//button[normalize-space(.)="Runs"]')).click();
    const runs = await driver.waitFor('three runs', async () => {
      const items = await driver.findAll('ol[aria-label="Runs"] li');
      return items.length === 3 ? items : null;
    });
    expect(runs.length).toBe(3);
    await driver.waitForText(`PID ${pid}`, 10_000).catch(() => undefined);
    // The newest run is selected; the one with our PID is the second.
    await (await driver.findAllByXPath('//ol[@aria-label="Runs"]//button'))[1]?.click();
    await driver.waitForText(`PID ${pid}`);
    await session.screenshot('runs-after-restart');
  });
});

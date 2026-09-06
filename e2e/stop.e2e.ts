import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * Stop (F3), and its proof of done from the specification:
 *
 *   "Stop closes only what the run opened — a Notepad opened by hand survives"
 *
 * The run holds Character Map again and again (repeat forever). A Character
 * Map opened by hand *before* the run — by this suite, the way a person would
 * — must still be there after Stop, while the one the run opened is gone.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';

function pids(image: string): number[] {
  const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH', '/FO', 'CSV'], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  return [...output.matchAll(/^"[^"]*","(\d+)"/gim)].map((m) => Number(m[1]));
}

function alive(pid: number): boolean {
  const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  return out.includes(`"${pid}"`);
}

function killProcess(pid: number): void {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {
    // Already gone.
  }
}

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

describe('stop', () => {
  let session: Session;
  let before: number[] = [];
  /** The Character Map a person opened, not the run. */
  let byHand: number | null = null;

  beforeAll(async () => {
    before = pids('charmap.exe');
    const mine = spawn(
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'charmap.exe'),
      [],
      {
        stdio: 'ignore',
        detached: true,
      },
    );
    mine.unref();
    byHand = mine.pid ?? null;
    session = await startSession();
  });

  afterAll(async () => {
    for (const pid of pids('charmap.exe').filter((p) => !before.includes(p))) killProcess(pid);
    await session?.stop();
  });

  it('a run that repeats forever is ended by Stop, and only what it opened goes', async () => {
    const { driver } = session;
    expect(byHand, 'a Character Map opened by hand').not.toBeNull();
    expect(alive(byHand ?? 0)).toBe(true);

    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Forever');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(CHARMAP);
    await (await driver.find('input[aria-label="Hold (seconds)"]')).sendKeys('2');
    await (await driver.find('input[aria-label="Repeat until the run is stopped"]')).click();
    await driver.waitForText('again and again');
    await (await driver.findByXPath('//button[normalize-space(.)="Add step"]')).click();
    await driver.waitForText('open for 2 s, again and again');

    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    const started = await driver.waitForText('Started charmap.exe');
    const pid = Number(/PID (\d+)/.exec(await started.text())?.[1]);
    expect(pid).toBeGreaterThan(0);
    // Let it cycle at least once: the second opening proves "again and again".
    await driver.waitFor(
      'a second opening',
      async () =>
        (await logRows(session)).filter((r) => r.includes('Started charmap.exe')).length >= 2
          ? true
          : null,
      10_000,
      200,
    );

    await (await driver.findByXPath('//button[normalize-space(.)="Stop"]')).click();
    const rows = await driver.waitFor(
      'the run to be stopped',
      async () => {
        const all = await logRows(session);
        return all.at(-1)?.includes('Run finished — stopped') ? all : null;
      },
      15_000,
      200,
    );
    expect(
      rows.some((r) => r.startsWith('Stopped charmap.exe') || r.includes('Stopped charmap.exe')),
    ).toBe(true);
    expect(rows.some((r) => r.includes('Stop — 1 closed'))).toBe(true);

    // The one the run opened is gone; the one opened by hand is not.
    await driver.waitFor("the run's Character Map gone", async () =>
      pids('charmap.exe').some((p) => !before.includes(p) && p !== byHand) ? null : true,
    );
    expect(alive(byHand ?? 0)).toBe(true);
    await session.screenshot('stop-forever');
  });

  it('a stop during a pause skips what had not started and finishes at once', async () => {
    const { driver } = session;
    // Edit the step: no more repeat; then add a second step after a long pause.
    await (await driver.find('button[aria-label="Edit step 1"]')).click();
    const form = await driver.waitForElement('form[aria-label="Edit step"]');
    await (await form.find('input[aria-label="Repeat until the run is stopped"]')).click();
    const pause = await form.find('input[aria-label="Pause after this step (seconds)"]');
    await pause.sendKeys('30');
    await (await form.find('button[type="submit"]')).click();
    await driver.waitForGone('Save step');
    await driver.waitForText('then wait 30 s');

    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(CHARMAP);
    await (
      await driver.findByXPath(
        '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
      )
    ).click();
    await driver.waitFor('two steps', async () =>
      (await driver.findAll('ol[aria-label="Steps"] li')).length === 2 ? true : null,
    );

    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    await driver.waitForText('Started charmap.exe');
    const pressed = Date.now();
    await (await driver.findByXPath('//button[normalize-space(.)="Stop"]')).click();
    const rows = await driver.waitFor(
      'the run to be stopped',
      async () => {
        const all = await logRows(session);
        return all.at(-1)?.includes('Run finished — stopped') ? all : null;
      },
      15_000,
      200,
    );
    // Stopped within the close grace, not after the thirty-second pause.
    expect(Date.now() - pressed).toBeLessThan(6000);
    expect(rows.filter((r) => r.includes('Started charmap.exe')).length).toBe(1);
    expect(rows.some((r) => r.includes('Waited 30 s'))).toBe(false);
    await session.screenshot('stop-during-pause');
  });
});

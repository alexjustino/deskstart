import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys, type Element } from './webdriver';

/**
 * Time (F2), and its proof of done from the specification:
 *
 *   "a 5 s hold closes at 5 s ± 250 ms on the real binary; a cycle of three
 *    runs three times and stops"
 *
 * The program held is Character Map (`charmap.exe`): a Win32 program that
 * owns its own window, so the process Deskstart started is the one on screen
 * and `WM_CLOSE` reaches it — unlike Notepad, which hands off (risk R2). The
 * instants are read from the log's own timestamps, the ones the host wrote.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';
const NOTEPAD = '%SYSTEMROOT%\\System32\\notepad.exe';

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

async function clearField(field: Element): Promise<void> {
  await field.sendKeys(Keys.CONTROL + 'a' + Keys.CONTROL + Keys.BACKSPACE);
}

/** "13:12:28.556" on a log row, as milliseconds into the day. */
function clockMs(text: string): number {
  const match = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(text);
  if (!match) throw new Error(`no clock in: ${text}`);
  const [, h, m, s, ms] = match;
  return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(ms);
}

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

/**
 * Press Run or Dry run and wait for *that* run to finish. The card keeps the
 * previous run's log on screen until the new one's first line lands, and its
 * last line already says "Run finished" — so the wait is for the log to change
 * and then to end, never for a sentence that is already there.
 */
async function runAndWait(session: Session, label: 'Run' | 'Dry run', timeoutMs = 30_000) {
  const { driver } = session;
  const before = JSON.stringify(await logRows(session));
  await (await driver.findByXPath(`//button[normalize-space(.)="${label}"]`)).click();
  return driver.waitFor(
    `the ${label.toLowerCase()} to finish`,
    async () => {
      const rows = await logRows(session);
      if (rows.length === 0 || JSON.stringify(rows) === before) return null;
      return rows.at(-1)?.includes('Run finished') ? rows : null;
    },
    timeoutMs,
    200,
  );
}

describe('time', () => {
  let session: Session;
  let charmapsBefore: number[] = [];
  let notepadsBefore: number[] = [];

  beforeAll(async () => {
    charmapsBefore = pids('charmap.exe');
    notepadsBefore = pids('notepad.exe');
    session = await startSession();
  });

  afterAll(async () => {
    for (const pid of pids('charmap.exe').filter((p) => !charmapsBefore.includes(p)))
      killProcess(pid);
    for (const pid of pids('notepad.exe').filter((p) => !notepadsBefore.includes(p)))
      killProcess(pid);
    await session?.stop();
  });

  it('a held program is closed when its hold is over, within the budget', async () => {
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Timed');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(CHARMAP);
    await (await driver.find('input[aria-label="Hold (seconds)"]')).sendKeys('5');
    await driver.waitForText('open for 5 s');
    await (await driver.findByXPath('//button[normalize-space(.)="Add step"]')).click();
    await driver.waitForText('charmap.exe');

    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    const line = await driver.waitForText('Started charmap.exe');
    const pid = Number(/PID (\d+)/.exec(await line.text())?.[1]);
    expect(pid).toBeGreaterThan(0);
    // Windows agrees: the process the log names is alive while it is held.
    // Character Map keeps its PID (no hand-off), so the PID is the check.
    await driver.waitFor(
      `process ${pid} while it is held`,
      async () => {
        const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], {
          encoding: 'utf-8',
          windowsHide: true,
        });
        return out.includes(`"${pid}"`) ? true : null;
      },
      4000,
      100,
    );
    const rows = await driver.waitFor(
      'the run to finish',
      async () => {
        const all = await logRows(session);
        return all.at(-1)?.includes('Run finished') ? all : null;
      },
      15_000,
      200,
    );
    const started = rows.find((r) => r.includes('Started charmap.exe'));
    const closed = rows.find((r) => r.includes('Closed charmap.exe'));
    expect(started).toBeDefined();
    expect(closed).toBeDefined();
    const held = clockMs(closed ?? '') - clockMs(started ?? '');
    expect(Math.abs(held - 5000), `held for ${held} ms`).toBeLessThanOrEqual(250);
    expect(closed).not.toContain('terminated');

    // And that it is gone now.
    await driver.waitFor('charmap gone', async () =>
      pids('charmap.exe').some((p) => !charmapsBefore.includes(p)) ? null : true,
    );
    await session.screenshot('time-hold');
  });

  it('a cycle of three opens three times, closing in between, then stops', async () => {
    const { driver } = session;
    await (await driver.find('button[aria-label="Edit step 1"]')).click();
    const form = await driver.waitForElement('form[aria-label="Edit step"]');
    const hold = await form.find('input[aria-label="Hold (seconds)"]');
    await clearField(hold);
    await hold.sendKeys('1');
    const repeat = await form.find('input[aria-label="Repeat (times)"]');
    await clearField(repeat);
    await repeat.sendKeys('3');
    await driver.waitForText('open for 1 s, 3 times');
    await (await form.find('button[type="submit"]')).click();
    await driver.waitForGone('Save step');

    const rows = await runAndWait(session, 'Run');
    expect(rows.at(-1)).toContain('Run finished — completed');
    expect(rows.filter((r) => r.includes('Started charmap.exe')).length).toBe(3);
    expect(rows.filter((r) => r.includes('Closed charmap.exe after 1 s')).length).toBe(3);
    // Started, closed, started, closed, started, closed — in that order.
    const order = rows
      .filter((r) => r.includes('charmap.exe'))
      .map((r) => (r.includes('Started') ? 'S' : 'C'))
      .join('');
    expect(order).toBe('SCSCSC');
    await session.screenshot('time-cycle');
  });

  it('a pause holds the next step back, and the log says it waited', async () => {
    const { driver } = session;
    // Notepad first, with a two-second pause after it; Character Map second, held one second.
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(NOTEPAD);
    await (await driver.find('input[aria-label="Pause after this step (seconds)"]')).sendKeys('2');
    await (
      await driver.findByXPath(
        '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
      )
    ).click();
    await driver.waitForText('then wait 2 s');
    await (await driver.find('button[aria-label="Move step 2 up"]')).click();
    await driver.waitFor('notepad first', async () => {
      const rows = await driver.findAll('ol[aria-label="Steps"] li');
      return (await rows[0]?.text())?.includes('notepad.exe') ? true : null;
    });

    const rows = await runAndWait(session, 'Run');
    expect(rows.at(-1)).toContain('Run finished — completed');
    const notepad = rows.find((r) => r.includes('Started notepad.exe'));
    const waited = rows.find((r) => r.includes('Waited 2 s'));
    const charmap = rows.find((r) => r.includes('Started charmap.exe'));
    expect(notepad).toBeDefined();
    expect(waited).toBeDefined();
    expect(charmap).toBeDefined();
    const gap = clockMs(charmap ?? '') - clockMs(notepad ?? '');
    expect(gap, `gap of ${gap} ms`).toBeGreaterThanOrEqual(2000);
    expect(gap).toBeLessThan(2500);
    await session.screenshot('time-pause');
  });

  it('a dry run writes the whole timeline at once and waits for nothing', async () => {
    const before = Date.now();
    const rows = await runAndWait(session, 'Dry run');
    expect(Date.now() - before).toBeLessThan(3000);
    expect(rows.at(-1)).toContain('Run finished — completed');
    expect(rows.some((r) => r.includes('Would wait 2 s'))).toBe(true);
    expect(rows.filter((r) => r.includes('Would close charmap.exe after 1 s')).length).toBe(3);
    await session.screenshot('time-dry-run');
  });

  it('refuses a hold on a folder, and a repeat without a hold', async () => {
    const { driver } = session;
    await (
      await driver.findByXPath('//select[@aria-label="Kind"]/option[normalize-space(.)="Folder"]')
    ).click();
    // The hold fields are for applications only: a folder offers none.
    const holds = await driver.findAll(
      'form[aria-label="Add a step"] input[aria-label="Hold (seconds)"]',
    );
    expect(holds.length).toBe(0);
    await (
      await driver.findByXPath(
        '//select[@aria-label="Kind"]/option[normalize-space(.)="Application"]',
      )
    ).click();
    const repeat = await driver.waitForElement(
      'form[aria-label="Add a step"] input[aria-label="Repeat (times)"]',
    );
    expect(await repeat.attribute('disabled')).not.toBeNull();
  });
});

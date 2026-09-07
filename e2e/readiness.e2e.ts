import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys, type Element } from './webdriver';

/**
 * Readiness (F4), and its proof of done from the specification:
 *
 *   "X does not start until Y's window exists (or its port answers); Y timing
 *    out marks X skipped with the reason, and the profile continues"
 *
 * Character Map is the program with a window (it owns its own, unlike Notepad
 * — risk R2). The port is a real TCP listener this suite opens and closes, so
 * "answers" and "does not answer" are both true of the same port, minutes
 * apart, without guessing a number.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';
const MISSING = 'C:\\Windows\\System32\\no-such-program-deskstart.exe';

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

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

/** Press Run and wait for that run — not the one still on screen — to finish. */
async function runAndWait(session: Session, timeoutMs = 30_000): Promise<string[]> {
  const { driver } = session;
  const before = JSON.stringify(await logRows(session));
  await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
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

/** Add an application step that waits for nothing. */
async function addPlainStep(session: Session, program: string): Promise<void> {
  const { driver } = session;
  const path = await driver.waitForElement('input[aria-label="Program path"]');
  await path.sendKeys(program);
  await (
    await driver.findByXPath(
      '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
    )
  ).click();
}

/** Add an application step that waits for the step at `waitOn` (1-based). */
async function addWaitingStep(
  session: Session,
  program: string,
  waitOn: { label: string; probe: 'A window' | 'A port'; port?: number; timeoutS: string },
): Promise<void> {
  const { driver } = session;
  const form = '//form[@aria-label="Add a step"]';
  const path = await driver.waitForElement('input[aria-label="Program path"]');
  await path.sendKeys(program);
  const select = await driver.find('select[aria-label="Wait for this step"]');
  await select.sendKeys(waitOn.label);
  await (
    await driver.findByXPath(
      `${form}//button[@role="radio" and normalize-space(.)="${waitOn.probe}"]`,
    )
  ).click();
  if (waitOn.port !== undefined) {
    const port = await driver.find('input[aria-label="Port"]');
    await port.sendKeys(String(waitOn.port));
  }
  const timeout = await driver.find('input[aria-label="Give up after (seconds)"]');
  await clearField(timeout);
  await timeout.sendKeys(waitOn.timeoutS);
  await (await driver.findByXPath(`${form}//button[normalize-space(.)="Add step"]`)).click();
}

describe('readiness', () => {
  let session: Session;
  let charmapsBefore: number[] = [];
  let listener: Server | null = null;
  let port = 0;

  beforeAll(async () => {
    charmapsBefore = pids('charmap.exe');
    // A port that answers, on a number the operating system chose.
    listener = createServer();
    await new Promise<void>((resolve) => listener?.listen(0, '127.0.0.1', resolve));
    const address = listener.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
    expect(port).toBeGreaterThan(0);
    session = await startSession();
  });

  afterAll(async () => {
    for (const pid of pids('charmap.exe').filter((p) => !charmapsBefore.includes(p)))
      killProcess(pid);
    listener?.close();
    await session?.stop();
  });

  it('waits for the window of an earlier step, then starts', async () => {
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Ready');
    await (await driver.find('button[aria-label="Add profile"]')).click();

    // 1. Character Map, held for the whole run so its window is there to find.
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(CHARMAP);
    await (await driver.find('input[aria-label="Hold (seconds)"]')).sendKeys('8');
    await (
      await driver.findByXPath(
        '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
      )
    ).click();
    await driver.waitForText('charmap.exe');

    // 2. Another Character Map, which waits for the first one's window.
    await addWaitingStep(session, CHARMAP, {
      label: '1. charmap.exe',
      probe: 'A window',
      timeoutS: '15',
    });
    await driver.waitForText('waits for charmap.exe — a window');

    const rows = await runAndWait(session);
    expect(rows.at(-1)).toContain('Run finished — completed');
    const waiting = rows.findIndex((r) => r.includes('Waiting for a window'));
    const ready = rows.findIndex((r) => r.includes('Ready after'));
    expect(waiting).toBeGreaterThan(0);
    expect(ready).toBeGreaterThan(waiting);
    // The second Character Map started only after the wait was over.
    expect(rows.filter((r) => r.includes('Started charmap.exe')).length).toBe(2);
    expect(
      rows.lastIndexOf(rows.filter((r) => r.includes('Started charmap.exe'))[1] ?? ''),
    ).toBeGreaterThan(ready);
    await session.screenshot('readiness-window');
  });

  it('waits for a port that answers', async () => {
    const { driver } = session;
    // Remove the second step and add one that waits for the port instead.
    await (await driver.find('button[aria-label="Remove step 2"]')).click();
    await driver.waitFor('one step', async () =>
      (await driver.findAll('ol[aria-label="Steps"] li')).length === 1 ? true : null,
    );
    await addWaitingStep(session, CHARMAP, {
      label: '1. charmap.exe',
      probe: 'A port',
      port,
      timeoutS: '10',
    });
    await driver.waitForText(`waits for charmap.exe — port ${port}`);

    const rows = await runAndWait(session);
    expect(rows.at(-1)).toContain('Run finished — completed');
    expect(rows.some((r) => r.includes(`Waiting for port ${port}`))).toBe(true);
    expect(rows.some((r) => r.includes('Ready after'))).toBe(true);
    await session.screenshot('readiness-port');
  });

  it('gives up on a port nobody answers, skips the step with the reason, and carries on', async () => {
    const { driver } = session;
    // Close the listener: the same port, now silent.
    await new Promise<void>((resolve) => listener?.close(() => resolve()));
    listener = null;

    // The step that waited for the port now waits for a port nobody answers,
    // with a short patience; a plain step after it proves the profile carried on.
    await (await driver.find('button[aria-label="Remove step 2"]')).click();
    await driver.waitFor('one step', async () =>
      (await driver.findAll('ol[aria-label="Steps"] li')).length === 1 ? true : null,
    );
    await addWaitingStep(session, CHARMAP, {
      label: '1. charmap.exe',
      probe: 'A port',
      port,
      timeoutS: '2',
    });
    await addPlainStep(session, CHARMAP);
    await driver.waitFor('three steps', async () =>
      (await driver.findAll('ol[aria-label="Steps"] li')).length === 3 ? true : null,
    );

    const rows = await runAndWait(session, 45_000);
    expect(rows.at(-1)).toContain('Run finished — completed');
    const skipped = rows.find((r) => r.includes('Skipped —'));
    expect(skipped).toContain('did not answer within 2 s');
    // The step after the skipped one ran: two Character Maps started, not three.
    expect(rows.filter((r) => r.includes('Started charmap.exe')).length).toBe(2);
    await session.screenshot('readiness-timeout');
  });

  it('skips at once, without waiting, when the step it waits for did not start', async () => {
    const { driver } = session;
    // Clear the profile and build: a program that does not exist, then a step
    // that waits for its window with a long timeout it must never spend.
    for (const label of ['Remove step 3', 'Remove step 2', 'Remove step 1']) {
      await (await driver.find(`button[aria-label="${label}"]`)).click();
      await driver.waitForGone(label);
    }
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(MISSING);
    await (
      await driver.findByXPath(
        '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
      )
    ).click();
    await driver.waitForText('no-such-program-deskstart.exe');
    await addWaitingStep(session, CHARMAP, {
      label: '1. no-such-program-deskstart.exe',
      probe: 'A window',
      timeoutS: '600',
    });

    const pressed = Date.now();
    const rows = await runAndWait(session, 20_000);
    expect(Date.now() - pressed).toBeLessThan(10_000);
    expect(rows.at(-1)).toContain('Run finished — completed, with failures');
    expect(rows.some((r) => r.includes('Skipped — the step it waits for did not start'))).toBe(
      true,
    );
    expect(rows.some((r) => r.includes('Waiting for'))).toBe(false);
    await session.screenshot('readiness-never-started');
  });
});

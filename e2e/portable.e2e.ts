import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys, type Element } from './webdriver';

/**
 * A profile as a file (F5), and its proof of done from the specification:
 *
 *   "an exported profile round-trips; an imported one cannot run until every
 *    step is accepted; a tampered path is shown absolute"
 *
 * The file travels through the screen here — export writes the document into a
 * box, import reads one out of a box — which is the one door a WebDriver can
 * drive. The other door, the system's own open and save dialogs, hands the same
 * two host commands a path and is covered by their own tests in `os/files.rs`;
 * the picker itself is native and is not driven by this suite.
 *
 * Character Map is the program used throughout: it owns its own window, unlike
 * Notepad on Windows 11 (risk R2), and it is at the same place on every machine
 * — under `%SYSTEMROOT%`, which is also what makes it the path this test wants.
 * The file carries `%SYSTEMROOT%\System32\charmap.exe`; the review screen has
 * to show `C:\Windows\System32\charmap.exe`, because what a person accepts is
 * what will run, not what it was written as.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';
const RESOLVED = 'C:\\Windows\\System32\\charmap.exe';

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

/** Is the Run button offered at all? */
async function runIsOffered(session: Session): Promise<boolean> {
  const run = await session.driver.findByXPath('//button[normalize-space(.)="Run"]');
  return (await run.attribute('disabled')) === null;
}

describe('a profile as a file', () => {
  let session: Session;
  let charmapsBefore: number[] = [];
  /** The document the first test exports, read back by the second. */
  let exported = '';

  beforeAll(async () => {
    charmapsBefore = pids('charmap.exe');
    session = await startSession();
  }, 120_000);

  afterAll(async () => {
    for (const pid of pids('charmap.exe').filter((p) => !charmapsBefore.includes(p)))
      killProcess(pid);
    await session?.stop();
  });

  it('exports a profile with its time and its waiting, and no identifier of this machine', async () => {
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Trip');
    await (await driver.find('button[aria-label="Add profile"]')).click();

    // 1. Character Map, held long enough for the second step to find its window.
    const form = '//form[@aria-label="Add a step"]';
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(CHARMAP);
    await (await driver.find('input[aria-label="Hold (seconds)"]')).sendKeys('8');
    await (await driver.findByXPath(`${form}//button[normalize-space(.)="Add step"]`)).click();
    await driver.waitForText('charmap.exe');

    // 2. Another one, which waits for the first one's window.
    const second = await driver.waitForElement('input[aria-label="Program path"]');
    await second.sendKeys(CHARMAP);
    await (await driver.find('select[aria-label="Wait for this step"]')).sendKeys('1. charmap.exe');
    await (
      await driver.findByXPath(`${form}//button[@role="radio" and normalize-space(.)="A window"]`)
    ).click();
    const timeout = await driver.find('input[aria-label="Give up after (seconds)"]');
    await clearField(timeout);
    await timeout.sendKeys('20');
    await (await driver.findByXPath(`${form}//button[normalize-space(.)="Add step"]`)).click();
    await driver.waitForText('waits for charmap.exe — a window');

    await (await driver.findByXPath('//button[normalize-space(.)="Export"]')).click();
    const file = await driver.waitForElement('textarea[aria-label="Profile file"]');
    exported = String(await file.property('value'));
    await session.screenshot('portable-export');
    await (await driver.findByXPath('//button[normalize-space(.)="Close"]')).click();

    // What it says: the profile, its time, and a wait that names a position.
    expect(exported).toContain('"schemaVersion": 1');
    expect(exported).toContain('"name": "Trip"');
    expect(exported).toContain(CHARMAP.replace(/\\/g, '\\\\'));
    expect(exported).toContain('"holdMs": 8000');
    expect(exported).toContain('"step": 1');
    expect(exported).toContain('"timeoutMs": 20000');
    // What it does not say: anything about this machine.
    expect(exported).not.toContain('stepId');
    expect(exported).not.toContain('profileId');
    expect(exported).not.toContain(RESOLVED);
  }, 120_000);

  it('imports it, and the imported profile runs nothing until every step is accepted', async () => {
    // Reassigned after the restart: a session that came back is a new driver.
    let driver = session.driver;
    await (await driver.findByXPath('//button[normalize-space(.)="Import a profile"]')).click();
    const box = await driver.waitForElement('textarea[aria-label="Profile file"]');
    await box.sendKeys(exported.replace('"name": "Trip"', '"name": "Shared"'));
    await driver.waitForText('Shared');
    await (await driver.findByXPath('//button[normalize-space(.)="Import"]')).click();

    // The gate: the screen says so, and Run is not offered.
    await driver.waitForText('This profile has not been reviewed');
    await driver.waitForText('Review before running');
    expect(await runIsOffered(session)).toBe(false);

    // The path is shown as it will run, not as it was written.
    await driver.waitForText(RESOLVED);
    await driver.waitForText('written as %SYSTEMROOT%');
    await driver.waitForText('started directly, with its arguments');
    await session.screenshot('portable-review');

    // One step is not every step — and it survives a restart.
    await (await driver.find('button[aria-label="Accept step 1"]')).click();
    await driver.waitForText('of its 2 steps has not been accepted yet');
    expect(await runIsOffered(session)).toBe(false);

    // Acceptance is on disk, not in the window: it is still there afterwards.
    await session.restart();
    driver = session.driver;
    await (await driver.waitForElement('nav[aria-label="Profiles"] button:last-child')).click();
    await driver.waitForText('Review before running');
    await driver.waitForText('of its 2 steps has not been accepted yet');
    expect(await runIsOffered(session)).toBe(false);

    // The last acceptance lifts the gate, and the profile becomes an ordinary one.
    await (await driver.find('button[aria-label="Accept step 2"]')).click();
    await driver.waitForText('What this profile opens, in this order.');
    await driver.waitForGone('Review before running');
    expect(await runIsOffered(session)).toBe(true);
    await session.screenshot('portable-accepted');

    // And what it does is what the file said: two Character Maps, the second
    // one only after the first one's window was there.
    await (await driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
    const rows = await driver.waitFor(
      'the run to finish',
      async () => {
        const lines = await logRows(session);
        return lines.at(-1)?.includes('Run finished') ? lines : null;
      },
      60_000,
      200,
    );
    expect(rows.at(-1)).toContain('Run finished — completed');
    expect(rows.filter((r) => r.includes('Started charmap.exe')).length).toBe(2);
    expect(rows.some((r) => r.includes('Waiting for a window'))).toBe(true);
    expect(rows.some((r) => r.includes('Ready after'))).toBe(true);
  }, 180_000);

  it('refuses a document that this version cannot read, and stores nothing', async () => {
    const { driver } = session;
    const before = (await driver.findAll('nav[aria-label="Profiles"] button')).length;
    await (await driver.findByXPath('//button[normalize-space(.)="Import a profile"]')).click();
    const box = await driver.waitForElement('textarea[aria-label="Profile file"]');
    // An unknown field at the top, a step that would run a shell, and a wait
    // that points forwards: three ways in, all closed.
    await box.sendKeys(
      '{"schemaVersion":1,"name":"Hostile","onOpen":"evil()","steps":[' +
        '{"kind":"app","program":"C:\\\\Windows\\\\System32\\\\charmap.exe","shell":"cmd /c del"},' +
        '{"kind":"app","program":"C:\\\\Windows\\\\System32\\\\charmap.exe",' +
        '"waitFor":{"step":2,"probe":{"kind":"window"}}}]}',
    );
    await driver.waitForText('This is not a profile this version can read');
    await driver.waitForText('this field is not part of a profile');
    await driver.waitForText('steps[0].shell');
    await driver.waitForText('a step may only wait for an earlier one');
    await session.screenshot('portable-refused');

    const importButton = await driver.findByXPath('//button[normalize-space(.)="Import"]');
    expect(await importButton.attribute('disabled')).not.toBeNull();

    await (await driver.findByXPath('//button[normalize-space(.)="Cancel"]')).click();
    await driver.waitForGone('This is not a profile this version can read');
    expect((await driver.findAll('nav[aria-label="Profiles"] button')).length).toBe(before);
  }, 120_000);
});

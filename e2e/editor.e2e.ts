import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys, type Element } from './webdriver';

/**
 * The profile editor (F1), and its proof of done from the specification:
 *
 *   "steps of every basic kind (app, folder, file, URL) with arguments and
 *    working directory; dry-run lists resolved absolute paths and spawns
 *    nothing"
 *
 * A folder step is written with `%USERPROFILE%` and the row shows what it
 * became; the dry run writes the resolved path to the log and starts nothing
 * — Windows is asked how many Notepads and Explorers exist before and after.
 */

const NOTEPAD = '%SYSTEMROOT%\\System32\\notepad.exe';

function pids(image: string): number[] {
  const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH', '/FO', 'CSV'], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  return [...output.matchAll(/^"[^"]*","(\d+)"/gim)].map((m) => Number(m[1]));
}

async function clearField(field: Element): Promise<void> {
  await field.sendKeys(Keys.CONTROL + 'a' + Keys.CONTROL + Keys.BACKSPACE);
}

async function chooseKind(session: Session, label: string): Promise<void> {
  await (
    await session.driver.findByXPath(
      `//form[@aria-label="Add a step"]//button[@role="radio" and normalize-space(.)="${label}"]`,
    )
  ).click();
}

async function addStep(session: Session): Promise<void> {
  await (
    await session.driver.findByXPath(
      '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
    )
  ).click();
}

describe('the editor', () => {
  let session: Session;
  let userProfile = '';

  beforeAll(async () => {
    session = await startSession();
    userProfile = process.env.USERPROFILE ?? '';
    expect(userProfile, 'USERPROFILE is set on any Windows account').not.toBe('');
  });

  afterAll(async () => {
    await session?.stop();
  });

  it('starts a profile', async () => {
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Editor');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('form[aria-label="Add a step"]');
  });

  it('adds a folder written with %USERPROFILE% and shows what it became', async () => {
    const { driver } = session;
    await chooseKind(session, 'Folder');
    const path = await driver.waitForElement('input[aria-label="Folder path"]');
    await path.sendKeys('%USERPROFILE%');
    // The preview under the form is the same resolution the run will use.
    await driver.waitForText(`Will open the folder ${userProfile}`);
    await addStep(session);
    const row = await driver.waitForText(`%USERPROFILE% → ${userProfile}`);
    expect(await row.text()).toContain(userProfile);
  });

  it('refuses a web address that is not http or https, then takes one that is', async () => {
    const { driver } = session;
    await chooseKind(session, 'Web page');
    const url = await driver.waitForElement('input[aria-label="Web address"]');
    await url.sendKeys('file:///C:/secret.txt');
    await addStep(session);
    await driver.waitForText('only http and https addresses are opened');
    await clearField(url);
    await url.sendKeys('https://example.com/docs');
    await addStep(session);
    await driver.waitForText('example.com');
    const rows = await driver.findAll('ol[aria-label="Steps"] li');
    expect(rows.length).toBe(2);
  });

  it('adds an application with an argument that a shell would have mangled', async () => {
    const { driver } = session;
    await chooseKind(session, 'Application');
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(NOTEPAD);
    const argument = await driver.find('input[aria-label="New argument"]');
    await argument.sendKeys('hello && goodbye');
    await (await driver.find('button[aria-label="Add argument"]')).click();
    await driver.waitForText('Will start');
    await addStep(session);
    await driver.waitForText('1 argument');
    const rows = await driver.findAll('ol[aria-label="Steps"] li');
    expect(rows.length).toBe(3);
  });

  it('moves a step', async () => {
    const { driver } = session;
    await (await driver.find('button[aria-label="Move step 3 up"]')).click();
    await driver.waitFor('notepad second', async () => {
      const rows = await driver.findAll('ol[aria-label="Steps"] li');
      const second = await rows[1]?.text();
      return second?.includes('notepad.exe') ? true : null;
    });
    await session.screenshot('editor-three-kinds');
  });

  it('a dry run lists the resolved paths and starts nothing', async () => {
    const { driver } = session;
    const notepads = pids('notepad.exe');
    const explorers = pids('explorer.exe');

    await (await driver.findByXPath('//button[normalize-space(.)="Dry run"]')).click();
    await driver.waitForText('Run finished — completed');

    const lines = await driver.findAll('ol[aria-label="Run log"] li');
    const texts = await Promise.all(lines.map((l) => l.text()));
    expect(texts[1]).toContain(`Would open folder ${userProfile.split('\\').pop()}`);
    expect(texts[1]).toContain(`${userProfile} — from %USERPROFILE%`);
    expect(texts[2]).toContain('Would start notepad.exe');
    expect(texts[2]).toContain('C:\\');
    expect(texts[2]).toContain('from %SYSTEMROOT%');
    expect(texts[3]).toContain('Would open example.com');
    expect(texts[3]).toContain('https://example.com/docs');

    expect(pids('notepad.exe')).toEqual(notepads);
    expect(pids('explorer.exe')).toEqual(explorers);
    await session.screenshot('editor-dry-run');
  });

  it('edits a step and refuses a change that would not resolve', async () => {
    const { driver } = session;
    await (await driver.find('button[aria-label="Edit step 2"]')).click();
    const form = await driver.waitForElement('form[aria-label="Edit step"]');
    const program = await form.find('input[aria-label="Program path"]');
    await clearField(program);
    await program.sendKeys('%TEMP%\\x.exe');
    await (await form.find('button[type="submit"]')).click();
    await driver.waitForText('%TEMP% is not a name this product expands');
    await clearField(program);
    await program.sendKeys(NOTEPAD);
    await (await form.find('button[aria-label="Remove argument 1"]')).click();
    await (await form.find('button[type="submit"]')).click();
    await driver.waitForGone('1 argument');
    await session.screenshot('editor-after-edit');
  });
});

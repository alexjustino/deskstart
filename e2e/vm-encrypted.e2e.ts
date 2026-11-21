import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * An encrypted machine (1.1, ADR-028), against the real binary.
 *
 * What is proved here: the step carries the fact that it is encrypted and the
 * editor says so; Run asks for the password before anything starts and Cancel
 * starts nothing; a password left empty skips that machine with the reason
 * and the run reaches its end; a dry run asks for nothing; and a password
 * given reaches the host and is **nowhere** afterwards — not on the screen,
 * not in a single byte of the workspace on disk.
 *
 * What is not: VMware actually opening an encrypted machine with it. That
 * needs VMware Workstation and an encrypted machine, which is a person's
 * proof. On a desk that has VMware, the case that hands over a password is
 * skipped rather than starting somebody's machine.
 */

const VMWARE_HERE = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
  .filter((dir): dir is string => dir !== undefined)
  .some((dir) => existsSync(path.join(dir, 'VMware', 'VMware Workstation', 'vmrun.exe')));

const SECRET = 'Sup3r-Secret!vault';

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

async function waitForFinish(session: Session, before: string): Promise<string[]> {
  return session.driver.waitFor(
    'the run to finish',
    async () => {
      const rows = await logRows(session);
      if (rows.length === 0 || JSON.stringify(rows) === before) return null;
      return rows.at(-1)?.includes('Run finished') ? rows : null;
    },
    40_000,
    200,
  );
}

async function pressRun(session: Session): Promise<void> {
  await (await session.driver.findByXPath('//button[normalize-space(.)="Run"]')).click();
}

const DIALOG = '//div[@role="dialog" and @aria-label="Passwords for this run"]';

async function waitForDialog(session: Session): Promise<void> {
  await session.driver.waitFor('the password dialog', async () =>
    (await session.driver.findAllByXPath(DIALOG)).length > 0 ? true : null,
  );
}

/** Every byte under a directory, as text both ways SQLite might hold it. */
async function everythingUnder(dir: string): Promise<string> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const bytes = await readFile(path.join(entry.parentPath, entry.name));
    out.push(bytes.toString('utf8'), bytes.toString('utf16le'));
  }
  return out.join('\n');
}

describe('an encrypted machine', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession();
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Vault');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('input[aria-label="Program path"]');
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('is marked in the editor, and the step says it is encrypted', async () => {
    const { driver } = session;
    const form = '//form[@aria-label="Add a step"]';
    await (
      await driver.findByXPath(
        '//select[@aria-label="Kind"]/option[normalize-space(.)="Virtual machine"]',
      )
    ).click();
    await (
      await driver.findByXPath(`${form}//button[@role="radio" and normalize-space(.)="VMware"]`)
    ).click();
    await (
      await driver.waitForElement('input[aria-label="Machine"]')
    ).sendKeys('%USERPROFILE%\\VMs\\vault\\vault.vmx');
    // The box is for VMware alone. Its native input is drawn over, invisible,
    // so it is found rather than waited for as "displayed".
    await driver.waitForText('This machine is encrypted');
    await (
      await driver.find('input[aria-label="Encrypted: ask for its password at each run"]')
    ).click();
    await driver.waitForText('never stored');
    await driver.execute(
      "document.querySelector('input[aria-label=\"Machine\"]')?.scrollIntoView({ block: 'center' })",
    );
    await session.screenshot('vm-encrypted-form');
    await (await driver.findByXPath(`${form}//button[normalize-space(.)="Add step"]`)).click();
    await driver.waitFor('the step to say it is encrypted', async () =>
      (
        await driver.findAllByXPath(
          '//ol[@aria-label="Steps"]//li//*[normalize-space(.)="Encrypted"]',
        )
      ).length > 0
        ? true
        : null,
    );
  }, 120_000);

  it('asks before the run, and Cancel starts nothing', async () => {
    const { driver } = session;
    const before = JSON.stringify(await logRows(session));
    await pressRun(session);
    await waitForDialog(session);
    await driver.waitForText('used for this run only and is never stored');
    await session.screenshot('vm-encrypted-ask');
    await (await driver.findByXPath(`${DIALOG}//button[normalize-space(.)="Cancel"]`)).click();
    await driver.waitFor('the dialog to close', async () =>
      (await driver.findAllByXPath(DIALOG)).length === 0 ? true : null,
    );
    // Nothing ran: the log is what it was.
    expect(JSON.stringify(await logRows(session))).toBe(before);
  }, 120_000);

  it('skips the machine, with the reason, when no password is given', async () => {
    const { driver } = session;
    const before = JSON.stringify(await logRows(session));
    await pressRun(session);
    await waitForDialog(session);
    await (await driver.findByXPath(`${DIALOG}//button[normalize-space(.)="Run"]`)).click();
    const rows = await waitForFinish(session, before);
    expect(
      rows.some((r) =>
        r.includes('Skipped — the machine is encrypted, and its password was not given'),
      ),
    ).toBe(true);
    expect(rows.at(-1)).toContain('Run finished — completed');
    await session.screenshot('vm-encrypted-skipped');
  }, 120_000);

  it('asks nothing in a dry run, and says what it would open', async () => {
    const { driver } = session;
    const before = JSON.stringify(await logRows(session));
    await (await driver.findByXPath('//button[normalize-space(.)="Dry run"]')).click();
    const rows = await waitForFinish(session, before);
    expect((await driver.findAllByXPath(DIALOG)).length).toBe(0);
    expect(rows.some((r) => r.includes('Would open VMware — vault'))).toBe(true);
  }, 120_000);

  it.skipIf(VMWARE_HERE)(
    'hands a given password to the host, and it is nowhere afterwards — screen or disk',
    async () => {
      const { driver } = session;
      const before = JSON.stringify(await logRows(session));
      await pressRun(session);
      await waitForDialog(session);
      await (await driver.findByXPath(`${DIALOG}//input[@type="password"]`)).sendKeys(SECRET);
      await (await driver.findByXPath(`${DIALOG}//button[normalize-space(.)="Run"]`)).click();
      const rows = await waitForFinish(session, before);
      // The host took it and went on to look for VMware, which is not here.
      const failed = rows.find((r) => r.includes('Could not open'));
      expect(failed).toContain('VMware — vault');
      expect(failed).toContain('VMware Workstation is not installed');
      // Not on the screen…
      const page = await driver.execute<string>('return document.body.innerText');
      expect(page).not.toContain(SECRET);
      // …and not in one byte of the workspace.
      expect(await everythingUnder(session.dataDir)).not.toContain(SECRET);
      await session.screenshot('vm-encrypted-given');
    },
    120_000,
  );
});

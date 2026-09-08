import { existsSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * Virtual machines (F8), and the proof of done from the specification:
 *
 *   "two machines start and their consoles appear (host proof by a person);
 *    a missing hypervisor is a reason, not a hang"
 *
 * The first half is a person's: it needs a hypervisor with two machines on it,
 * and this suite runs on whatever machine it is given. What it proves here is
 * the second half, and the shape of the first — a hypervisor that is not here
 * is a sentence in the log within seconds, the run reaches its end, and a dry
 * run says what it would ask of which hypervisor without asking anything.
 *
 * Every hypervisor case is adaptive: it runs only where that hypervisor is
 * absent, because a step that would actually start somebody's machine is not a
 * test to run on somebody's machine. On a desk that has all three, this file
 * proves the dry run alone and says so.
 */

function programFiles(): string[] {
  return [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
    (dir): dir is string => dir !== undefined,
  );
}

const HYPERV_HERE = existsSync(
  path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'vmconnect.exe'),
);
const VIRTUALBOX_HERE = programFiles().some((dir) =>
  existsSync(path.join(dir, 'Oracle', 'VirtualBox', 'VBoxManage.exe')),
);
const VMWARE_HERE = programFiles().some((dir) =>
  existsSync(path.join(dir, 'VMware', 'VMware Workstation', 'vmrun.exe')),
);

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

async function runAndWait(
  session: Session,
  which: 'Run' | 'Dry run' = 'Run',
  timeoutMs = 40_000,
): Promise<string[]> {
  const { driver } = session;
  const before = JSON.stringify(await logRows(session));
  await (await driver.findByXPath(`//button[normalize-space(.)="${which}"]`)).click();
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

async function clearSteps(session: Session): Promise<void> {
  const { driver } = session;
  for (;;) {
    const remove = await driver.findAll('button[aria-label^="Remove step"]');
    if (remove.length === 0) return;
    await (await driver.find('button[aria-label="Remove step 1"]')).click();
    await driver.waitFor('the step to go', async () => {
      const left = await driver.findAll('ol[aria-label="Steps"] li');
      return left.length === remove.length - 1 ? true : null;
    });
  }
}

/** Add a machine step on the given hypervisor. */
async function addMachine(
  session: Session,
  hypervisor: 'Hyper-V' | 'VirtualBox' | 'VMware',
  machine: string,
): Promise<void> {
  const { driver } = session;
  const form = '//form[@aria-label="Add a step"]';
  await (
    await driver.findByXPath(
      '//select[@aria-label="Kind"]/option[normalize-space(.)="Virtual machine"]',
    )
  ).click();
  await (
    await driver.findByXPath(
      `${form}//button[@role="radio" and normalize-space(.)="${hypervisor}"]`,
    )
  ).click();
  const field = await driver.waitForElement('input[aria-label="Machine"]');
  await field.sendKeys(machine);
  await (await driver.findByXPath(`${form}//button[normalize-space(.)="Add step"]`)).click();
}

describe('a virtual machine', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession();
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Machines');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('input[aria-label="Program path"]');
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('says what it would ask of which hypervisor, and asks nothing, in a dry run', async () => {
    const { driver } = session;
    await addMachine(session, 'VirtualBox', 'W11 dev');
    await driver.waitForText('W11 dev');
    await driver.waitForText('VirtualBox');

    const rows = await runAndWait(session, 'Dry run');
    expect(rows.some((r) => r.includes('Would open VirtualBox — W11 dev'))).toBe(true);
    expect(rows.at(-1)).toContain('Run finished — completed');
    await session.screenshot('vm-dry-run');
  }, 120_000);

  it.skipIf(VIRTUALBOX_HERE)(
    'a hypervisor that is not here is a reason within seconds, not a hang',
    async () => {
      const pressed = Date.now();
      const rows = await runAndWait(session);
      const failed = rows.find((r) => r.includes('Could not open'));
      expect(failed).toContain('VirtualBox — W11 dev');
      expect(failed).toContain('VirtualBox is not installed where this product looks for it');
      expect(rows.at(-1)).toContain('Run finished — failed');
      // A reason, not a hang: nothing waited on a hypervisor that is not there.
      expect(Date.now() - pressed).toBeLessThan(10_000);
      await session.screenshot('vm-missing-hypervisor');
    },
    120_000,
  );

  it.skipIf(HYPERV_HERE)(
    'the same for Hyper-V, whose console is what says it is installed',
    async () => {
      await clearSteps(session);
      await addMachine(session, 'Hyper-V', 'dev');
      await session.driver.waitForText('Hyper-V');
      const rows = await runAndWait(session);
      const failed = rows.find((r) => r.includes('Could not open'));
      expect(failed).toContain('Hyper-V — dev');
      expect(failed).toContain('Hyper-V is not installed where this product looks for it');
    },
    120_000,
  );

  it.skipIf(VMWARE_HERE)(
    'and for VMware, which knows a machine by its .vmx',
    async () => {
      await clearSteps(session);
      await addMachine(session, 'VMware', '%USERPROFILE%\\VMs\\dev\\dev.vmx');
      await session.driver.waitForText('VMware');
      const rows = await runAndWait(session);
      const failed = rows.find((r) => r.includes('Could not open'));
      expect(failed).toContain('VMware — dev');
      expect(failed).toContain('VMware Workstation is not installed');
      await session.screenshot('vm-vmware-missing');
    },
    120_000,
  );

  it('refuses a VMware machine that is not a .vmx before it is stored', async () => {
    const { driver } = session;
    await clearSteps(session);
    await addMachine(session, 'VMware', '%USERPROFILE%\\VMs\\dev');
    await driver.waitForText('VMware knows a machine by its .vmx file');
    expect((await driver.findAll('ol[aria-label="Steps"] li')).length).toBe(0);
  }, 120_000);
});

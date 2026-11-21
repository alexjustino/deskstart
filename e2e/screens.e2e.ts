import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * Screens that come and go (1.1), against the real binary.
 *
 * A profile written on a desk with three screens and opened on a laptop with
 * one says so **before** Run: which step asked for which screen, and that its
 * window will open on the primary. And the list is live — when the host's
 * watch reports the screens changed, the profile's warning follows without a
 * reload. Plugging a real monitor in is a person's proof; here the host's
 * event is delivered the way the host delivers it, through Tauri's event bus.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';

function document(monitor: number): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      name: `Desk ${monitor}`,
      steps: [{ kind: 'app', program: CHARMAP, placement: { monitor, state: 'maximized' } }],
    },
    null,
    2,
  );
}

async function importProfile(session: Session, text: string): Promise<void> {
  const { driver } = session;
  await (await driver.findByXPath('//button[normalize-space(.)="Import a profile"]')).click();
  const box = await driver.waitForElement('textarea[aria-label="Profile file"]');
  await box.sendKeys(text);
  await (await driver.findByXPath('//button[normalize-space(.)="Import"]')).click();
  await driver.waitForText('This profile has not been reviewed');
}

describe('screens that come and go', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession();
    await session.driver.waitForElement('input[aria-label="New profile name"]');
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('says before Run that a step asks for a screen this machine has not got', async () => {
    const { driver } = session;
    await importProfile(session, document(9));
    await driver.waitForText('A screen this profile uses is not here');
    await driver.waitForText('charmap.exe is placed on screen 9');
    await driver.waitForText('those windows open on the primary');
    await session.screenshot('screens-missing');
  }, 120_000);

  it('follows the host when the screens change, without a reload', async () => {
    const { driver } = session;
    await importProfile(session, document(1));
    // Screen 1 is here: nothing to say.
    expect(
      (
        await driver.findAllByXPath(
          '//*[normalize-space(.)="A screen this profile uses is not here"]',
        )
      ).length,
    ).toBe(0);

    // The host's event, as the host sends it: now only a screen numbered 2.
    await driver.executeAsync(
      `const done = arguments[arguments.length - 1];
       window.__TAURI_INTERNALS__
         .invoke('plugin:event|emit', {
           event: 'monitors-changed',
           payload: [{ number: 2, name: 'only', x: 0, y: 0, width: 1280, height: 720, primary: true }],
         })
         .then(() => done(true), (e) => done(String(e)));`,
    );
    await driver.waitForText('charmap.exe is placed on screen 1');
    await driver.waitForText('Screens changed: this machine has 1 screen now');
  }, 120_000);
});

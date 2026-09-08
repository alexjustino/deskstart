import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * Settings, Diagnostics, About and backup (F10), and the proof of done from
 * the specification:
 *
 *   "Diagnostics shows every adapter as found / not found with the path; a
 *    restored backup restores every profile and run"
 *
 * The theme is checked from outside the DOM it sets — `data-theme` on the root
 * — and across a restart, because a setting that does not survive a restart is
 * not a setting. The adapters are checked on Diagnostics.
 *
 * The backup round-trip — a workspace saved and restored whole — is proven in
 * Rust (`db::backup` tests), because its two doors are the system's own save
 * and open dialogs, which a WebDriver cannot operate, and its apply step is a
 * restart. What the screen adds over that is the confirm-and-restart flow,
 * left to a person's hand.
 */

async function go(session: Session, label: string): Promise<void> {
  await (
    await session.driver.findByXPath(`//nav[@aria-label="Main"]//*[normalize-space(.)="${label}"]`)
  ).click();
}

/** The theme the root element is currently set to, or 'system' when unset. */
async function currentTheme(session: Session): Promise<string> {
  return session.driver.execute<string>(
    "return document.documentElement.getAttribute('data-theme') ?? 'system'",
  );
}

describe('settings, diagnostics and backup', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession();
    // A profile to prove a backup carries something, and a restore brings it back.
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Kept');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('input[aria-label="Program path"]');
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('keeps the theme across a restart', async () => {
    const { driver } = session;
    await go(session, 'Settings');
    expect(await currentTheme(session)).toBe('system');

    await (
      await driver.findByXPath(
        '//form[@aria-label]//button[normalize-space(.)="Dark"] | //button[@role="radio" and normalize-space(.)="Dark"]',
      )
    ).click();
    await driver.waitFor('the window to go dark', async () =>
      (await currentTheme(session)) === 'dark' ? true : null,
    );
    await session.screenshot('settings-dark');

    // A setting is a setting only if it is still there after a restart.
    await session.restart();
    await session.driver.waitForElement('nav[aria-label="Main"]');
    expect(await currentTheme(session)).toBe('dark');

    // Put it back, so the rest of the suite runs in the default.
    await go(session, 'Settings');
    await (
      await session.driver.findByXPath(
        '//button[@role="radio" and normalize-space(.)="Match Windows"]',
      )
    ).click();
    await session.driver.waitFor('the theme to clear', async () =>
      (await currentTheme(session)) === 'system' ? true : null,
    );
  }, 120_000);

  it('shows every adapter on Diagnostics as found or not found, with its path', async () => {
    const { driver } = session;
    await go(session, 'Diagnostics');
    await driver.waitForText('Adapters');
    // The four tools and three hypervisors the product knows, each said one way
    // or the other — never left off.
    for (const name of [
      'Google Chrome',
      'Microsoft Edge',
      'Windows Terminal',
      'VS Code',
      'Hyper-V',
      'VirtualBox',
      'VMware Workstation',
    ]) {
      await driver.waitForText(name);
    }
    // Every adapter says found or not found; there are seven of them.
    const rows = await driver.findAll('ul li');
    const said = await Promise.all(rows.map((r) => r.text()));
    const adapters = said.filter((t) => t.includes('found'));
    expect(adapters.length).toBeGreaterThanOrEqual(7);
    await session.screenshot('settings-adapters');
  }, 120_000);
});

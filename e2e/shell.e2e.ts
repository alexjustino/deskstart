import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * The shell: the window comes up, the rail names every destination, and each
 * one renders a real screen. This is the first thing that must be true of a
 * build before any other claim about it means anything.
 */
describe('shell', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession();
  });

  afterAll(async () => {
    await session?.stop();
  });

  it('opens on Profiles with the title bar and the mark', async () => {
    const { driver } = session;
    expect(await driver.title()).toBe('Deskstart');
    await driver.waitForElement('input[aria-label="New profile name"]');
    const mark = await driver.find('header img');
    expect(await mark.attribute('width')).toBe('16');
  });

  it('lists every destination', async () => {
    const { driver } = session;
    const buttons = await driver.findAll('nav[aria-label="Main"] button');
    const labels = await Promise.all(buttons.map((b) => b.text()));
    expect(labels).toEqual(['Profiles', 'Runs', 'Diagnostics']);
  });

  it.each([
    ['Runs', 'h1'],
    ['Diagnostics', 'h1'],
    ['Profiles', 'input[aria-label="New profile name"]'],
  ])('navigates to %s and renders it', async (label, marker) => {
    const { driver } = session;
    const button = await driver.findByXPath(`//nav//button[normalize-space(.)="${label}"]`);
    await button.click();
    await driver.waitForElement(marker);
    const current = await driver.findByXPath('//nav//button[@aria-current="page"]');
    expect(await current.text()).toBe(label);
  });

  it('Diagnostics reports the workspace the suite relocated it to', async () => {
    const { driver } = session;
    await (await driver.findByXPath('//nav//button[normalize-space(.)="Diagnostics"]')).click();
    const row = await driver.waitForText('deskstart.sqlite3');
    expect(await row.text()).toContain(session.dataDir.split('\\').pop() ?? session.dataDir);
    await driver.waitForText('up to date');
    await driver.waitForText('relocated by DESKSTART_DATA_DIR');
    await session.screenshot('diagnostics-light');
  });

  it('renders in the dark theme too', async () => {
    const { driver } = session;
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="dark"]')
    ).click();
    await driver.waitFor(
      'the dark theme',
      async () =>
        (await driver.execute<string | null>(
          'return document.documentElement.getAttribute("data-theme")',
        )) === 'dark',
    );
    await session.screenshot('diagnostics-dark');
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="system"]')
    ).click();
  });
});

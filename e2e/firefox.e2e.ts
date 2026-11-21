import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys } from './webdriver';

/**
 * Firefox bookmarks (1.1), against the real binary.
 *
 * The application is pointed at a Firefox folder of the suite's own — a
 * `profiles.ini` and a `places.sqlite` with a "Morning" folder on the toolbar
 * — so nobody's real bookmarks are read. What is proved: the host finds the
 * default profile, reads the database through a copy, the domain finds the
 * folder by the names Firefox shows, and a dry run says it would open its two
 * pages in Firefox. A real run is not made: it would start Firefox on this
 * machine, which creates a Firefox profile of its own the first time.
 */

const FIXTURE = path.resolve('e2e/fixtures/firefox');

async function logRows(session: Session): Promise<string[]> {
  const rows = await session.driver.findAll('ol[aria-label="Run log"] li');
  return Promise.all(rows.map((r) => r.text()));
}

describe('a Firefox bookmark folder', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession({ env: { DESKSTART_FIREFOX_DIR: FIXTURE } });
    const { driver } = session;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Fox');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForElement('input[aria-label="Program path"]');
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('is read from a copy of Firefox’s database, and a dry run names its pages', async () => {
    const { driver } = session;
    const form = '//form[@aria-label="Add a step"]';
    await (
      await driver.findByXPath(
        '//select[@aria-label="Kind"]/option[normalize-space(.)="Bookmark folder"]',
      )
    ).click();
    await (
      await driver.findByXPath(`${form}//button[@role="radio" and normalize-space(.)="Firefox"]`)
    ).click();
    await (
      await driver.waitForElement('input[aria-label="Bookmark folder"]')
    ).sendKeys('Bookmarks Toolbar/Morning');
    await driver.waitForText('from Firefox, as one window');
    await (await driver.findByXPath(`${form}//button[normalize-space(.)="Add step"]`)).click();
    await driver.waitForText('Morning — Firefox');

    await (await driver.findByXPath('//button[normalize-space(.)="Dry run"]')).click();
    const rows = await driver.waitFor(
      'the dry run to finish',
      async () => {
        const all = await logRows(session);
        return all.at(-1)?.includes('Run finished') ? all : null;
      },
      30_000,
      200,
    );
    const opened = rows.find((r) => r.includes('2 pages from Morning'));
    expect(opened, rows.join('\n')).toBeDefined();
    expect(rows.at(-1)).toContain('completed');
    await session.screenshot('firefox-dry-run');
  }, 120_000);

  it('says which folders there are when the one named is not', async () => {
    const { driver } = session;
    await (await driver.find('button[aria-label="Edit step 1"]')).click();
    const field = await driver.waitForElement(
      'form[aria-label="Edit step"] input[aria-label="Bookmark folder"]',
    );
    await field.sendKeys(Keys.CONTROL + 'a' + Keys.CONTROL + Keys.BACKSPACE + 'Evening');
    await (
      await driver.findByXPath(
        '//form[@aria-label="Edit step"]//button[normalize-space(.)="Save step"]',
      )
    ).click();
    await (await driver.findByXPath('//button[normalize-space(.)="Dry run"]')).click();
    const rows = await driver.waitFor(
      'the dry run to finish',
      async () => {
        const all = await logRows(session);
        return all.at(-1)?.includes('Run finished') && all.some((r) => r.includes('Evening'))
          ? all
          : null;
      },
      30_000,
      200,
    );
    expect(
      rows.some((r) => r.includes('Bookmarks Toolbar/Morning')),
      rows.join('\n'),
    ).toBe(true);
  }, 120_000);
});

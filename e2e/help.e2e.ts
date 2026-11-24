import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';

/**
 * The manual inside the product (1.1), against the real binary.
 *
 * Help opens offline at the start; the language is a setting that survives
 * the screen; search finds a section by its words, accents or not; and the
 * "?" on a card opens the manual at that card's section.
 */

async function go(session: Session, label: string): Promise<void> {
  await (
    await session.driver.findByXPath(
      `//nav[@aria-label="Main"]//button[normalize-space(.)="${label}"]`,
    )
  ).click();
}

async function shownSection(session: Session): Promise<string> {
  return (await session.driver.find('article h2')).text();
}

describe('the manual', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession();
    await session.driver.waitForElement('input[aria-label="New profile name"]');
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('opens under Help, in English, at Getting started', async () => {
    const { driver } = session;
    await go(session, 'Help');
    await driver.waitForElement('input[aria-label="Search the manual"]');
    // The machine running this suite may be in either language; choose one.
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="English"]')
    ).click();
    await driver.waitForText('Deskstart manual');
    expect(await shownSection(session)).toBe('Getting started');
    await session.screenshot('help-en');
  }, 60_000);

  it('reads in Portuguese when asked, and remembers it', async () => {
    const { driver } = session;
    await (
      await driver.findByXPath(
        '//button[@role="radio" and normalize-space(.)="Português (Brasil)"]',
      )
    ).click();
    await driver.waitForText('Manual do Deskstart');
    expect(await shownSection(session)).toBe('Primeiros passos');
    // Away and back: still Portuguese, and Settings says so.
    await go(session, 'Settings');
    await driver.waitForText('The language of the manual under Help, the welcome and the tour');
    const chosen = await driver.findAllByXPath(
      '//button[@role="radio" and @aria-checked="true" and normalize-space(.)="Português (Brasil)"]',
    );
    expect(chosen.length).toBe(1);
    await go(session, 'Help');
    await driver.waitForText('Manual do Deskstart');
    await session.screenshot('help-pt');
  }, 60_000);

  it('finds a section by its words, with or without accents', async () => {
    const { driver } = session;
    const search = await driver.find('input[aria-label="Search the manual"]');
    await search.sendKeys('maquinas criptografadas');
    await driver.waitFor('the search to narrow the contents', async () => {
      const entries = await driver.findAll('nav[aria-label="Manual contents"] button');
      return entries.length === 2 ? entries : null;
    });
    await (
      await driver.findByXPath(
        '//nav[@aria-label="Manual contents"]//button[contains(., "Máquinas virtuais")]',
      )
    ).click();
    expect(await shownSection(session)).toBe('Máquinas virtuais');
  }, 60_000);

  it('opens at the right section from the "?" on a card', async () => {
    const { driver } = session;
    await go(session, 'Profiles');
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Helped');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForText('Start this profile without pressing Run');
    await (
      await driver.find('button[aria-label="Help: Triggers: schedule, shortcut, command line"]')
    ).click();
    await driver.waitFor('the manual at Triggers', async () =>
      (await shownSection(session)) === 'Gatilhos: agendamento, atalho, linha de comando'
        ? true
        : null,
    );
    const current = await driver.findByXPath(
      '//nav[@aria-label="Main"]//button[@aria-current="page"]',
    );
    expect(await current.text()).toBe('Help');
  }, 60_000);
});

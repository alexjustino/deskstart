import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys } from './webdriver';

/**
 * The welcome and the guided tour (1.2, ADR-032), against the real binary.
 *
 * A new workspace opens on the welcome, in either language. The tour lights
 * the real element of each step — measured here: the light sits on the
 * element's own rectangle — moves between screens, skips what is not on
 * screen yet, goes back, and leaves on Escape. The welcome does not come back
 * once left. From Help, "Show me in the app" starts the tour at its section.
 */

async function dialogLabel(session: Session): Promise<string | null> {
  const dialogs = await session.driver.findAll('div[role="dialog"]');
  return dialogs.length === 0 ? null : dialogs[0]!.attribute('aria-label');
}

async function waitForStep(session: Session, label: string): Promise<void> {
  await session.driver.waitFor(`the tour at "${label}"`, async () =>
    (await dialogLabel(session)) === label ? true : null,
  );
}

async function next(session: Session, label = 'Next'): Promise<void> {
  await (
    await session.driver.findByXPath(`//div[@role="dialog"]//button[normalize-space(.)="${label}"]`)
  ).click();
}

/** How far the light is from the element it should be on, in pixels. */
async function lightOffset(session: Session, anchor: string): Promise<number> {
  return session.driver.waitFor(
    `the light on ${anchor}`,
    async () => {
      const off = await session.driver.execute<number | null>(
        `const light = document.querySelector('[data-coach-light]');
         const target = document.querySelector('[data-guide="${anchor}"]');
         if (!light || !target) return null;
         const a = light.getBoundingClientRect(), b = target.getBoundingClientRect();
         return Math.max(Math.abs(a.left + 6 - b.left), Math.abs(a.top + 6 - b.top),
                         Math.abs(a.width - 12 - b.width), Math.abs(a.height - 12 - b.height));`,
      );
      return off !== null && off < 3 ? off : null;
    },
    5_000,
    100,
  );
}

describe('the welcome and the tour', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession({ keepWelcome: true });
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('opens on the welcome, in either language', async () => {
    const { driver } = session;
    await driver.waitForElement('[data-guide="welcome"]');
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="English"]')
    ).click();
    await driver.waitForText('Your working day, one button away');
    await session.screenshot('welcome-en');
    await (
      await driver.findByXPath(
        '//button[@role="radio" and normalize-space(.)="Português (Brasil)"]',
      )
    ).click();
    await driver.waitForText('Seu dia de trabalho, a um botão');
    await session.screenshot('welcome-pt');
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="English"]')
    ).click();
    await driver.waitForText('Your working day, one button away');
  }, 60_000);

  it('lights the real element of each step, and moves across screens', async () => {
    const { driver } = session;
    await (await driver.findByXPath('//button[normalize-space(.)="Take the tour"]')).click();
    await waitForStep(session, 'Everything is one click away');
    expect(await lightOffset(session, 'rail')).toBeLessThan(3);
    await session.screenshot('guide-rail');

    await next(session);
    await waitForStep(session, 'Name a profile');
    expect(await lightOffset(session, 'new-profile')).toBeLessThan(3);
    await next(session);
    await waitForStep(session, 'Or capture what is open');
    await next(session);
    await waitForStep(session, 'Or bring one in');

    // No profile yet: the editor's steps are skipped, and the tour goes on to Runs.
    await next(session);
    await waitForStep(session, 'Every run, written down');
    const current = await driver.findByXPath(
      '//nav[@aria-label="Main"]//button[@aria-current="page"]',
    );
    expect(await current.text()).toBe('Runs');
    expect(await lightOffset(session, 'runs')).toBeLessThan(3);
    await session.screenshot('guide-runs');

    await next(session, 'Back');
    await waitForStep(session, 'Or bring one in');
    await driver.chord(Keys.ESCAPE);
    await driver.waitFor('the tour to close', async () =>
      (await dialogLabel(session)) === null ? true : null,
    );
  }, 90_000);

  it('does not show the welcome again once it was left', async () => {
    // Reassigned after the restart: a session that came back is a new driver.
    await session.restart();
    const restarted = session.driver;
    await restarted.waitForElement('input[aria-label="New profile name"]');
    expect((await restarted.findAll('[data-guide="welcome"]')).length).toBe(0);
  }, 120_000);

  it('starts at a section from Help, and ends on its last card', async () => {
    const driver = session.driver;
    const name = await driver.waitForElement('input[aria-label="New profile name"]');
    await name.sendKeys('Tour');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    await driver.waitForText('Start this profile without pressing Run');

    await (
      await driver.findByXPath('//nav[@aria-label="Main"]//button[normalize-space(.)="Help"]')
    ).click();
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="English"]')
    ).click();
    await (
      await driver.findByXPath(
        '//nav[@aria-label="Manual contents"]//button[contains(., "Triggers")]',
      )
    ).click();
    await (await driver.findByXPath('//button[normalize-space(.)="Show me in the app"]')).click();
    await waitForStep(session, 'Start it without the button');
    expect(await lightOffset(session, 'triggers')).toBeLessThan(3);
    await session.screenshot('guide-triggers');

    await next(session);
    await waitForStep(session, 'Every run, written down');
    await next(session);
    await waitForStep(session, 'The manual is here');
    await next(session);
    await waitForStep(session, 'That is the tour');
    await next(session, 'Done');
    await driver.waitFor('the tour to close', async () =>
      (await dialogLabel(session)) === null ? true : null,
    );
  }, 90_000);
});

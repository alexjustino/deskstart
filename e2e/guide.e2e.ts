import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys } from './webdriver';

/**
 * Home and the guided tour (1.3, ADR-034), against the real binary.
 *
 * Deskstart opens on Home, every time: the welcome while there is no profile,
 * the profiles — each one click from Run — once there are. The tour lights the
 * real element of each step (measured: the light sits on the element's own
 * rectangle), moves between screens, skips what is not on screen yet, goes
 * back, and leaves on Escape. From Help, "Show me in the app" starts it at a
 * section. 1.2's UAT found the welcome gone after one look; Home is the fix.
 */

const CHARMAP = '%SYSTEMROOT%\\System32\\charmap.exe';

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

async function rail(session: Session, label: string): Promise<void> {
  await (
    await session.driver.findByXPath(
      `//nav[@aria-label="Main"]//button[normalize-space(.)="${label}"]`,
    )
  ).click();
}

async function current(session: Session): Promise<string> {
  return (
    await session.driver.findByXPath('//nav[@aria-label="Main"]//button[@aria-current="page"]')
  ).text();
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

describe('Home and the tour', () => {
  let session: Session;

  beforeAll(async () => {
    session = await startSession({ keepWelcome: true });
  }, 120_000);

  afterAll(async () => {
    await session?.stop();
  });

  it('opens on Home — the welcome, in either language, while there is no profile', async () => {
    const { driver } = session;
    await driver.waitForElement('[data-guide="home"]');
    expect(await current(session)).toBe('Home');
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="English"]')
    ).click();
    await driver.waitForText('Your working day, one button away');
    await driver.waitForText('Create your first profile');
    await session.screenshot('home-empty-en');
    await (
      await driver.findByXPath(
        '//button[@role="radio" and normalize-space(.)="Português (Brasil)"]',
      )
    ).click();
    await driver.waitForText('Seu dia de trabalho, a um botão');
    await session.screenshot('home-empty-pt');
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="English"]')
    ).click();
    await driver.waitForText('Create your first profile');
  }, 60_000);

  it('tours the real interface from Home, across screens, and back', async () => {
    const { driver } = session;
    await (await driver.findByXPath('//button[normalize-space(.)="Take the tour"]')).click();
    await waitForStep(session, 'Home is where you start');
    expect(await lightOffset(session, 'home')).toBeLessThan(3);
    await next(session);
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
    expect(await current(session)).toBe('Runs');
    expect(await lightOffset(session, 'runs')).toBeLessThan(3);
    await next(session, 'Back');
    await waitForStep(session, 'Or bring one in');
    await driver.chord(Keys.ESCAPE);
    await driver.waitFor('the tour to close', async () =>
      (await dialogLabel(session)) === null ? true : null,
    );
  }, 90_000);

  it('makes a first profile from Home, and runs it from Home in one click', async () => {
    const driver = session.driver;
    await rail(session, 'Home');
    await (
      await driver.findByXPath('//button[normalize-space(.)="Create your first profile"]')
    ).click();
    // Profiles, with the name field ready to type into.
    await driver.waitForElement('input[aria-label="New profile name"]');
    await driver.waitFor('the name field to have focus', async () =>
      (await driver.execute<string | null>(
        "return document.activeElement && document.activeElement.getAttribute('aria-label')",
      )) === 'New profile name'
        ? true
        : null,
    );
    await (await driver.find('input[aria-label="New profile name"]')).sendKeys('Morning');
    await (await driver.find('button[aria-label="Add profile"]')).click();
    const program = await driver.waitForElement('input[aria-label="Program path"]');
    await program.sendKeys(CHARMAP);
    await (
      await driver.findByXPath(
        '//form[@aria-label="Add a step"]//button[normalize-space(.)="Add step"]',
      )
    ).click();
    await driver.waitForText('1 step, in this order.');

    await rail(session, 'Home');
    await driver.waitForText('Your profiles');
    await driver.waitForText('Not run yet');
    await session.screenshot('home-profiles');
    await (await driver.find('button[aria-label="Run Morning"]')).click();
    // Run from Home goes to the profile and starts it, as its own Run would.
    await driver.waitFor(
      'the run started from Home to finish',
      async () => {
        const rows = await driver.findAll('ol[aria-label="Run log"] li');
        const last = rows.at(-1);
        return last !== undefined && (await last.text()).includes('Run finished') ? true : null;
      },
      30_000,
      200,
    );
    expect(await current(session)).toBe('Profiles');
    await rail(session, 'Home');
    await driver.waitForText('Last run');
  }, 120_000);

  it('opens on Home again after a restart', async () => {
    await session.restart();
    const restarted = session.driver;
    await restarted.waitForElement('[data-guide="home"]');
    expect(await current(session)).toBe('Home');
    await restarted.waitForText('Your profiles');
  }, 120_000);

  it('starts at a section from Help, and ends on its last card', async () => {
    const driver = session.driver;
    await rail(session, 'Profiles');
    await driver.waitForText('Start this profile without pressing Run');
    await rail(session, 'Help');
    await (
      await driver.findByXPath(
        '//nav[@aria-label="Manual contents"]//button[contains(., "Triggers")]',
      )
    ).click();
    await (await driver.findByXPath('//button[normalize-space(.)="Show me in the app"]')).click();
    await waitForStep(session, 'Start it without the button');
    expect(await lightOffset(session, 'triggers')).toBeLessThan(3);
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

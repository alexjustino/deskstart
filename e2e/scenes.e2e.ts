import { afterAll, describe, expect, it } from 'vitest';

import { startSession, type Session } from './session';
import { Keys } from './webdriver';

/**
 * The animated guide (1.3, ADR-035), against the real binary: the opening
 * as the window comes up, F1 from any screen to its section of the manual,
 * and the manual's scenes — played once in view, again on Replay.
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

async function attribute(session: Session, css: string, name: string): Promise<string | null> {
  return session.driver.execute<string | null>(
    'const el = document.querySelector(arguments[0]); return el ? el.getAttribute(arguments[1]) : null;',
    [css, name],
  );
}

describe('the animated guide', () => {
  let session: Session;

  afterAll(async () => {
    await session?.stop();
  });

  it('opens with the mark and a greeting, which go by themselves', async () => {
    session = await startSession({ keepOpening: true, keepWelcome: true });
    const { driver } = session;
    // It may already be leaving by the time the session is up; it must go.
    const seen = (await driver.findAll('[data-opening]')).length > 0;
    if (seen) await session.screenshot('opening');
    await driver.waitFor(
      'the opening to go',
      async () => ((await driver.findAll('[data-opening]')).length === 0 ? true : null),
      5_000,
      100,
    );
    // Hidden from assistive technology while it stands: Home is what is read.
    await driver.waitForText('Create your first profile');
  }, 120_000);

  it('F1 opens the manual at the section about the screen', async () => {
    const { driver } = session;
    await driver.chord(Keys.F1);
    await driver.waitForElement('input[aria-label="Search the manual"]');
    expect(await shownSection(session)).toBe('Getting started');

    await go(session, 'Settings');
    await driver.chord(Keys.F1);
    await driver.waitFor(
      'the Settings section',
      async () =>
        (await shownSection(session).catch(() => '')).startsWith('Settings') ? true : null,
      10_000,
      150,
    );
  }, 60_000);

  it('a section with a scene plays it in view, and Replay plays it again', async () => {
    const { driver } = session;
    await (
      await driver.findByXPath(
        '//nav[@aria-label="Manual contents"]//button[starts-with(normalize-space(.), "Run, Dry run")]',
      )
    ).click();
    const scene = 'figure[data-scene="run"]';
    await driver.waitForElement(scene);
    const label = await attribute(session, `${scene} svg`, 'aria-label');
    expect(label).toContain('log');
    await driver.execute(
      'document.querySelector(arguments[0]).scrollIntoView({block: "center"});',
      [scene],
    );
    await driver.waitFor(
      'the scene to play',
      async () => ((await attribute(session, scene, 'data-state')) === 'playing' ? true : null),
      5_000,
      100,
    );
    // Its last move ends about three seconds in.
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    await session.screenshot('scene-run');

    await (await driver.find(`${scene} button[aria-label="Replay"]`)).click();
    expect(await attribute(session, scene, 'data-take')).toBe('1');

    // A section without a scene draws nothing in its place.
    await (
      await driver.findByXPath(
        '//nav[@aria-label="Manual contents"]//button[starts-with(normalize-space(.), "Privacy")]',
      )
    ).click();
    await driver.waitFor(
      'the Privacy section',
      async () => ((await driver.findAll('figure[data-scene]')).length === 0 ? true : null),
      5_000,
      100,
    );
  }, 60_000);

  it('each scene is in the manual, in Portuguese too', async () => {
    const { driver } = session;
    await (
      await driver.findByXPath(
        '//button[@role="radio" and normalize-space(.)="Português (Brasil)"]',
      )
    ).click();
    for (const [title, scene, words] of [
      ['Gatilhos', 'triggers', 'Agendador'],
      ['Capturar', 'capture', 'janelas'],
    ]) {
      // The language is a saved setting: the contents change once it is saved.
      const link = await driver.waitFor(
        `${title} in the contents`,
        async () =>
          (
            await driver.findAllByXPath(
              `//nav[@aria-label="Manual contents"]//button[starts-with(normalize-space(.), "${title}")]`,
            )
          )[0] ?? null,
        10_000,
        150,
      );
      await link.click();
      await driver.waitForElement(`figure[data-scene="${scene}"]`);
      expect(await attribute(session, `figure[data-scene="${scene}"] svg`, 'aria-label')).toContain(
        words,
      );
      expect(
        await driver.findAll(
          `figure[data-scene="${scene}"] button[aria-label="Repetir a animação"]`,
        ),
      ).toHaveLength(1);
    }
    await session.screenshot('scene-pt');
    await (
      await driver.findByXPath('//button[@role="radio" and normalize-space(.)="English"]')
    ).click();
  }, 60_000);
});

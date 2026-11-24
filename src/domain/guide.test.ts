import { describe, expect, it } from 'vitest';

import { GUIDE_STEPS, indexOfStep, nextShown, stepForSection, type GuideStep } from './guide';

const ids = (indexes: (number | null)[]) =>
  indexes.map((i) => (i === null ? null : (GUIDE_STEPS[i]?.id ?? '?')));

describe('the guided tour', () => {
  it('has a step id once, an anchor and a manual section for every step', () => {
    const seen = new Set(GUIDE_STEPS.map((s) => s.id));
    expect(seen.size).toBe(GUIDE_STEPS.length);
    for (const step of GUIDE_STEPS) {
      expect(step.anchor).not.toBe('');
      expect(step.section).not.toBe('');
    }
  });

  it('walks every step forward and back when everything is on screen', () => {
    const all = () => true;
    let at: number | null = 0;
    const forward: (number | null)[] = [at];
    while (at !== null) {
      at = nextShown(GUIDE_STEPS, at, 1, all);
      forward.push(at);
    }
    expect(forward.length).toBe(GUIDE_STEPS.length + 1);
    expect(forward.at(-1)).toBeNull();
    expect(nextShown(GUIDE_STEPS, 0, -1, all)).toBeNull();
  });

  it('skips the steps whose anchor is not on screen — no profile, no editor', () => {
    const withoutAProfile = (step: GuideStep) =>
      !['steps', 'add-step', 'where', 'run', 'triggers'].includes(step.id);
    const from = indexOfStep(GUIDE_STEPS, 'import');
    expect(ids([nextShown(GUIDE_STEPS, from, 1, withoutAProfile)])).toEqual(['runs']);
    expect(
      ids([nextShown(GUIDE_STEPS, indexOfStep(GUIDE_STEPS, 'runs'), -1, withoutAProfile)]),
    ).toEqual(['import']);
  });

  it('starts at a named step, and at the first for one it does not know', () => {
    expect(GUIDE_STEPS[indexOfStep(GUIDE_STEPS, 'triggers')]?.id).toBe('triggers');
    expect(indexOfStep(GUIDE_STEPS, 'nonsense')).toBe(0);
    expect(indexOfStep(GUIDE_STEPS, null)).toBe(0);
  });

  it('finds the step that shows a manual section, for "Show me" in Help', () => {
    expect(stepForSection(GUIDE_STEPS, 'triggers')).toBe('triggers');
    expect(stepForSection(GUIDE_STEPS, 'where')).toBe('where');
    expect(stepForSection(GUIDE_STEPS, 'privacy')).toBeNull();
  });
});

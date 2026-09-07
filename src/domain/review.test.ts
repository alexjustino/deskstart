import { describe, expect, it } from 'vitest';

import { reviewState, whyNotRunnable, type Reviewable } from './review';

const HERE = { importedUnreviewed: false };
const IMPORTED = { importedUnreviewed: true };

function steps(...accepted: boolean[]): Reviewable[] {
  return accepted.map((reviewed, at) => ({ id: `s${at}`, reviewed }));
}

describe('the review gate', () => {
  it('does not stand between a person and a profile they wrote', () => {
    expect(whyNotRunnable(HERE, steps(true, true))).toBeNull();
    // Written here, so nothing was ever unaccepted; the flag is what gates.
    expect(whyNotRunnable(HERE, steps(false))).toBeNull();
  });

  it('blocks an imported profile until every step is accepted', () => {
    expect(whyNotRunnable(IMPORTED, steps(false, false, false))).toBe(
      'this profile was imported; 3 of its 3 steps have not been accepted yet',
    );
    expect(whyNotRunnable(IMPORTED, steps(true, true, false))).toBe(
      'this profile was imported; 1 of its 3 steps has not been accepted yet',
    );
  });

  it('counts what has been accepted and what is left', () => {
    expect(reviewState(IMPORTED, steps(true, false, false))).toEqual({
      blocked: true,
      accepted: 1,
      total: 3,
      remaining: 2,
      reason: 'this profile was imported; 2 of its 3 steps have not been accepted yet',
    });
  });

  it('still blocks when every step is accepted but the flag has not cleared', () => {
    // The host clears the flag; until it has, the answer is no. A screen that
    // decided for itself would run a profile the host is about to refuse.
    expect(whyNotRunnable(IMPORTED, steps(true, true))).toBe(
      'this profile was imported and is still marked unreviewed',
    );
  });

  it('has an answer for a profile with no steps at all', () => {
    expect(reviewState(HERE, [])).toEqual({
      blocked: false,
      accepted: 0,
      total: 0,
      remaining: 0,
      reason: null,
    });
  });
});

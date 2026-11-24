import { describe, expect, it } from 'vitest';

import { CARD_HEIGHT, CARD_WIDTH, EDGE, GAP, place } from './coachPlacement';

const WINDOW = { width: 1180, height: 760 };

function inside(at: { top: number; left: number }) {
  return (
    at.top >= EDGE &&
    at.left >= EDGE &&
    at.top + CARD_HEIGHT <= WINDOW.height - EDGE &&
    at.left + CARD_WIDTH <= WINDOW.width - EDGE
  );
}

describe('where a coach mark card goes', () => {
  it('goes below a small element near the top', () => {
    expect(place({ top: 40, left: 220, width: 230, height: 32 }, WINDOW)).toEqual({
      top: 40 + 32 + GAP,
      left: 220,
    });
  });

  it('goes above an element near the bottom', () => {
    const at = place({ top: 600, left: 500, width: 200, height: 40 }, WINDOW);
    expect(at.top).toBe(600 - GAP - CARD_HEIGHT);
  });

  it('goes beside the rail, which is as tall as the window — never off the screen', () => {
    const rail = { top: 32, left: 0, width: 208, height: 728 };
    const at = place(rail, WINDOW);
    expect(at.left).toBe(208 + GAP);
    expect(inside(at)).toBe(true);
  });

  it('stays inside the window for an element at the right edge', () => {
    expect(inside(place({ top: 100, left: 1100, width: 70, height: 30 }, WINDOW))).toBe(true);
  });

  it('sits in the middle with no element to light', () => {
    const at = place(null, WINDOW);
    expect(inside(at)).toBe(true);
    expect(at.left).toBe((WINDOW.width - CARD_WIDTH) / 2);
  });
});

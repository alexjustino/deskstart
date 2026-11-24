/**
 * Where a coach mark's card goes, beside the element it lights (1.2). Pure
 * geometry, kept apart from the component so it is tested without a window.
 */

/** Room between the light and the card. */
export const GAP = 12;
/** The card's width; the layout keeps it on the window. */
export const CARD_WIDTH = 360;
/** The card's height, near enough to choose a side; it is never measured twice. */
export const CARD_HEIGHT = 240;
/** The window's own margin, which the card never crosses. */
export const EDGE = 16;

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Where the card goes: below the light if it fits, above it, then to its
 * right, then to its left — the first side with room — and inside the window
 * whichever it is. A light as tall as the window, like the rail, has no room
 * above or below; before this rule the card went above it, off the screen.
 * With no light, the card sits high in the middle.
 */
export function place(
  light: Box | null,
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const clampLeft = (left: number) =>
    Math.min(Math.max(EDGE, left), viewport.width - CARD_WIDTH - EDGE);
  const clampTop = (top: number) =>
    Math.min(Math.max(EDGE, top), viewport.height - CARD_HEIGHT - EDGE);
  if (light === null) {
    return {
      top: clampTop(viewport.height * 0.25),
      left: clampLeft((viewport.width - CARD_WIDTH) / 2),
    };
  }
  const bottom = light.top + light.height;
  const right = light.left + light.width;
  if (viewport.height - bottom >= CARD_HEIGHT + GAP + EDGE) {
    return { top: bottom + GAP, left: clampLeft(light.left) };
  }
  if (light.top >= CARD_HEIGHT + GAP + EDGE) {
    return { top: light.top - GAP - CARD_HEIGHT, left: clampLeft(light.left) };
  }
  if (viewport.width - right >= CARD_WIDTH + GAP + EDGE) {
    return { top: clampTop(light.top), left: right + GAP };
  }
  if (light.left >= CARD_WIDTH + GAP + EDGE) {
    return { top: clampTop(light.top), left: light.left - GAP - CARD_WIDTH };
  }
  return {
    top: clampTop(viewport.height * 0.25),
    left: clampLeft((viewport.width - CARD_WIDTH) / 2),
  };
}

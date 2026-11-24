import { useEffect, useRef, type ReactNode } from 'react';

import { CARD_WIDTH, place } from './coachPlacement';
import { useFocusTrap } from './useFocusTrap';

/** Where an element is on the screen, in window pixels. */
export interface Spot {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Room around the element, so the light does not cut its edge. */
const PADDING = 6;
/**
 * The canonical coach mark: a light on one element of the real interface,
 * the rest dimmed, and a card beside it that says what it is (1.2).
 *
 * The light moves from element to element — position and size glide with the
 * Fluent decelerate curve — so a tour reads as one continuous gesture rather
 * than a slideshow; when the system asks for less motion, it jumps. The
 * dimmed rest is not a control: the card's buttons and Escape are the way
 * through and the way out, and focus stays inside the card while it is open.
 * With no element to light (`spot` null), the card sits in the middle — the
 * last card of a tour, or a step whose element is not on screen.
 */
export function CoachMark({
  label,
  spot,
  children,
  onClose,
}: {
  /** The accessible name of the card. */
  label: string;
  spot: Spot | null;
  children: ReactNode;
  onClose: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  useFocusTrap(card, true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const light =
    spot === null
      ? null
      : {
          top: spot.top - PADDING,
          left: spot.left - PADDING,
          width: spot.width + PADDING * 2,
          height: spot.height + PADDING * 2,
        };

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const cardPosition = place(light, viewport);

  return (
    <div className="fixed inset-0 z-50">
      {light === null ? (
        <div aria-hidden="true" className="absolute inset-0 bg-overlay" />
      ) : (
        // The light: a clear rectangle whose enormous outer shadow, in the
        // overlay token, is the dimming. One element, so it can glide.
        <div
          aria-hidden="true"
          data-coach-light
          className={[
            'pointer-events-none absolute rounded-lg ring-2 ring-accent',
            'transition-[top,left,width,height] duration-300 ease-decelerate',
            'motion-reduce:transition-none',
          ].join(' ')}
          style={{ ...light, boxShadow: '0 0 0 100vmax var(--surface-overlay)' }}
        />
      )}
      {/* The dimmed rest catches clicks, so the page underneath is not used by accident. */}
      <div aria-hidden="true" className="absolute inset-0" />

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ ...cardPosition, width: CARD_WIDTH }}
        className={[
          'absolute flex flex-col gap-3 rounded-xl border border-stroke bg-flyout p-4 shadow-dialog',
          'transition-[top,left] duration-300 ease-decelerate motion-reduce:transition-none',
          'focus:outline-none',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Keep Tab inside a dialog while it is open, and give focus back afterwards.
 *
 * A dialog that lets Tab wander into the page behind it is not modal, whatever
 * the scrim says; and a dialog that closes and leaves focus on `<body>` strands
 * a keyboard user at the top of the document. On open, focus moves to the first
 * focusable descendant (or the panel itself); on close, back to whatever had it.
 */
export function useFocusTrap(panel: RefObject<HTMLElement | null>, open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const element = panel.current;
    if (!element) return;

    const previous = document.activeElement as HTMLElement | null;
    const first = element.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? element).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (candidate) => candidate.offsetParent !== null || candidate === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        element.focus();
        return;
      }
      const head = focusable[0];
      const tail = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === head || active === element)) {
        event.preventDefault();
        tail?.focus();
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault();
        head?.focus();
      }
    };
    element.addEventListener('keydown', onKeyDown);

    return () => {
      element.removeEventListener('keydown', onKeyDown);
      // Only give focus back to something still on the page.
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [panel, open]);
}

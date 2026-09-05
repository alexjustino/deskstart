import { useEffect, useRef, type ReactNode } from 'react';

import { useFocusTrap } from './useFocusTrap';

/**
 * A surface that takes over the window for one exchange.
 *
 * The dialog sits high rather than centred — a palette or a prompt is read from
 * the top, and the eye is already there. Escape closes it; the scrim closes on
 * click but is not a control, so the keyboard route is Escape or whatever the
 * content offers. Focus moves into the panel on open so a keyboard user is not
 * left on the page underneath.
 */
export function Modal({
  open,
  label,
  onClose,
  children,
  width = 'md',
}: {
  open: boolean;
  /** The accessible name. A dialog with no name is a dialog nobody can use. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  width?: 'md' | 'lg';
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Tab stays inside while it is open; focus goes back to where it was after.
  useFocusTrap(panel, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div aria-hidden="true" className="absolute inset-0 bg-overlay" onClick={onClose} />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={[
          'relative flex max-h-[70vh] w-full flex-col overflow-hidden rounded-xl border border-stroke',
          'bg-flyout shadow-dialog backdrop-blur-xl focus:outline-none',
          width === 'lg' ? 'max-w-3xl' : 'max-w-xl',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

import { Dismiss20Regular } from '@fluentui/react-icons';
import { useEffect, useRef, type ReactNode } from 'react';

import { IconButton } from './IconButton';
import { useFocusTrap } from './useFocusTrap';

/**
 * A panel that slides in from the right for editing one thing.
 *
 * Escape closes it, and focus moves into it on open so a keyboard user is not
 * left behind on the page underneath.
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Tab stays inside while it is open; focus goes back to where it was after.
  useFocusTrap(panel, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* The scrim closes on click but is not a control: the close button and
          Escape are the ways a keyboard reaches the same action. */}
      <div aria-hidden="true" className="flex-1 bg-overlay" onClick={onClose} />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col border-l border-stroke bg-flyout shadow-dialog backdrop-blur-xl focus:outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-stroke-subtle px-4 py-3">
          <h2 className="truncate text-body-lg font-semibold text-fg">{title}</h2>
          <IconButton label="Close" icon={<Dismiss20Regular />} onClick={onClose} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer && <footer className="border-t border-stroke-subtle p-4">{footer}</footer>}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

import { Button } from './Button';
import { Modal } from './Modal';

/**
 * The one way the product asks "are you sure".
 *
 * Never `window.confirm`: it is not themed, not keyboard-consistent, and it
 * blocks the window's own event loop. The question names what will happen and
 * the confirming button repeats the verb, so a person reads the consequence
 * twice before it is done. A destructive confirmation is drawn in the danger
 * tone, but never with colour alone — the wording carries it too.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** The verb, e.g. "Restore this backup". */
  confirmLabel: string;
  danger?: boolean;
  /** True while the action runs; the buttons wait. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} label={title} onClose={onCancel}>
      <div className="flex flex-col gap-4 p-5">
        <h2 className="text-body-lg font-semibold text-fg">{title}</h2>
        <div className="text-body text-fg-secondary">{children}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            appearance="accent"
            onClick={onConfirm}
            disabled={pending}
            className={danger ? 'bg-danger hover:bg-danger active:bg-danger' : ''}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

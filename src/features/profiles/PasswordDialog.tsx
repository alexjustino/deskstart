import { LockClosed20Regular } from '@fluentui/react-icons';
import { useState, type FormEvent } from 'react';

import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Modal } from '@/ui/Modal';

/**
 * The passwords a run needs, asked before it starts (1.1, ADR-028).
 *
 * One field per encrypted machine, in the order the run reaches them. What is
 * typed lives in this component's state while the dialog is open, goes to the
 * run when Run is pressed, and is gone when the dialog closes — the caller
 * unmounts it. Nothing is written: not the profile, not the disk, not the
 * Windows credential store. A field left empty skips that machine, with the
 * reason in the log, and the rest of the profile runs.
 */
export function PasswordDialog({
  machines,
  onRun,
  onCancel,
}: {
  /** The encrypted machines this run starts, by step. */
  machines: readonly { id: string; title: string }[];
  onRun: (passwords: ReadonlyMap<string, string>) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState<Record<string, string>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const passwords = new Map<string, string>();
    for (const machine of machines) {
      const value = typed[machine.id] ?? '';
      if (value !== '') passwords.set(machine.id, value);
    }
    setTyped({});
    onRun(passwords);
  };

  const missing = machines.filter((m) => (typed[m.id] ?? '') === '').length;

  return (
    <Modal open label="Passwords for this run" onClose={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 text-fg-tertiary">
            <LockClosed20Regular />
          </span>
          <div>
            <h2 className="text-body-lg font-semibold text-fg">Passwords for this run</h2>
            <p className="mt-1 text-body text-fg-secondary">
              {machines.length === 1
                ? 'One machine in this profile is encrypted.'
                : `${machines.length} machines in this profile are encrypted.`}{' '}
              Each password is used for this run only and is never stored.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {machines.map((machine, index) => (
            <label key={machine.id} className="flex flex-col gap-1">
              <span className="text-body text-fg">{machine.title}</span>
              <Input
                type="password"
                aria-label={`Password for ${machine.title}`}
                autoComplete="off"
                spellCheck={false}
                autoFocus={index === 0}
                value={typed[machine.id] ?? ''}
                onChange={(e) =>
                  setTyped((current) => ({ ...current, [machine.id]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>

        <p className="text-caption text-fg-tertiary">
          {missing === 0
            ? 'Every machine will be started.'
            : missing === machines.length
              ? 'With no password, these machines are skipped and the rest of the profile runs.'
              : `${missing} left empty: ${missing === 1 ? 'that machine is' : 'those machines are'} skipped, and the rest of the profile runs.`}
        </p>

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" appearance="accent">
            Run
          </Button>
        </div>
      </form>
    </Modal>
  );
}

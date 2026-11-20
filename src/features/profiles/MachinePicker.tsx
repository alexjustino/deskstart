import { ArrowClockwise20Regular } from '@fluentui/react-icons';

import { describeError } from '@/data/errors';
import { useVmInventory } from '@/data/hooks';
import type { Hypervisor } from '@/domain/profile';
import { inListOrder } from '@/domain/vminventory';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Chip } from '@/ui/Chip';
import { InfoBar } from '@/ui/InfoBar';

import { HYPERVISOR_LABELS } from './kinds';

/**
 * The machines a hypervisor already has, to pick from (1.1, ADR-027).
 *
 * Adding, several can be ticked — "start two of these four" is two ticks and
 * one button, and each becomes a step of its own, in the order listed. Editing
 * a step, ticking one replaces the machine it starts. Typing a machine by hand
 * stays possible underneath: a profile is often written on one computer and
 * run on another, whose machines this one cannot see.
 *
 * The list is a local read and nothing more; a hypervisor that does not
 * answer is said so, and the typed field is still there.
 */
export function MachinePicker({
  hypervisor,
  installed,
  multiple,
  picked,
  onPick,
  disabled,
}: {
  hypervisor: Hypervisor;
  /** False when the hypervisor is not installed here: it is not asked at all. */
  installed: boolean;
  /** True when adding: several machines, one step each. */
  multiple: boolean;
  /** The ids ticked now. */
  picked: readonly string[];
  onPick: (ids: string[]) => void;
  disabled: boolean;
}) {
  const inventory = useVmInventory(hypervisor, installed);
  const name = HYPERVISOR_LABELS[hypervisor];

  if (!installed) return null;

  const toggle = (id: string, on: boolean) => {
    if (!multiple) {
      onPick(on ? [id] : []);
      return;
    }
    // Kept in the list's order, whatever order they were clicked in: the
    // steps are added top to bottom, as the person sees them.
    const listed = inventory.data?.ok === true ? inventory.data.machines.map((m) => m.id) : [];
    onPick(inListOrder(on ? [...picked, id] : picked.filter((p) => p !== id), listed));
  };

  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-caption font-semibold text-fg-tertiary uppercase">
        Machines in {name}
      </span>
      <Button
        appearance="subtle"
        icon={<ArrowClockwise20Regular />}
        onClick={() => void inventory.refetch()}
        disabled={disabled || inventory.isFetching}
        aria-label={`Read ${name}'s machines again`}
      >
        {inventory.isFetching ? 'Reading…' : 'Refresh'}
      </Button>
    </div>
  );

  if (inventory.isPending) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <p className="text-caption text-fg-secondary">Asking {name} for its machines…</p>
      </div>
    );
  }

  if (inventory.isError || !inventory.data.ok) {
    const why = inventory.isError
      ? describeError(inventory.error)
      : inventory.data.ok
        ? ''
        : inventory.data.problem;
    return (
      <div className="flex flex-col gap-2">
        {header}
        <InfoBar severity="caution" title={`${name}'s machines could not be read`}>
          {why} You can still type the machine below.
        </InfoBar>
      </div>
    );
  }

  const machines = inventory.data.machines;

  return (
    <div className="flex flex-col gap-2">
      {header}
      {machines.length === 0 ? (
        <p className="text-caption text-fg-secondary">
          {name} has no machines registered on this computer. Type one below.
        </p>
      ) : (
        <ul
          aria-label={`Machines in ${name}`}
          className="flex flex-col rounded-md border border-stroke-subtle"
        >
          {machines.map((machine) => {
            const on = picked.includes(machine.id);
            return (
              <li
                key={machine.id}
                className="flex items-center gap-3 border-b border-stroke-subtle px-3 py-2 last:border-b-0"
              >
                <Checkbox
                  label={multiple ? `Start ${machine.label}` : `Use ${machine.label}`}
                  checked={on}
                  onChange={(next) => {
                    toggle(machine.id, next);
                  }}
                  disabled={disabled}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body text-fg">{machine.label}</span>
                  {machine.id !== machine.label && (
                    <span
                      data-selectable
                      className="truncate font-mono text-caption text-fg-tertiary"
                    >
                      {machine.id}
                    </span>
                  )}
                </span>
                {machine.running && <Chip tone="success">Running</Chip>}
              </li>
            );
          })}
        </ul>
      )}
      {multiple && picked.length > 0 && (
        <p className="text-caption text-fg-secondary">
          {picked.length === 1
            ? 'One machine ticked: one step will be added.'
            : `${picked.length} machines ticked: ${picked.length} steps will be added, one each, in the order listed.`}{' '}
          {picked.map((id) => machines.find((m) => m.id === id)?.label ?? id).join(', ')}.
        </p>
      )}
    </div>
  );
}

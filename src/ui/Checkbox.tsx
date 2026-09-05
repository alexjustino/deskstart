import { Checkmark12Filled } from '@fluentui/react-icons';

/**
 * The canonical checkbox.
 *
 * A real `<input type="checkbox">` sits underneath, visually hidden but present:
 * it carries the accessible role, the keyboard behaviour and the form
 * semantics for free. Only the box is drawn.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The accessible name. Required — a box with no name is a box nobody can use. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="relative inline-grid size-5 shrink-0 place-items-center">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className={[
          'grid size-4 place-items-center rounded-sm border transition-colors duration-100 ease-easy',
          checked
            ? 'border-accent bg-accent text-fg-on-accent'
            : 'border-stroke-strong bg-card peer-hover:border-fg-secondary',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)',
          'peer-disabled:border-stroke-subtle peer-disabled:bg-card',
        ].join(' ')}
      >
        {checked && <Checkmark12Filled />}
      </span>
    </span>
  );
}

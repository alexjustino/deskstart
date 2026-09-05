import { Button } from './Button';

/**
 * A few mutually exclusive options, each a button, one of them pressed.
 *
 * A radio group underneath — the semantics screen readers and the keyboard
 * expect — drawn with the canonical button so it looks like the rest of the
 * product. For two to four options; a longer list is a `Select`.
 */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
  disabled = false,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  /** Display text per option; the option id is shown, capitalised, without it. */
  labels?: Partial<Record<T, string>>;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-caption font-semibold text-fg-tertiary uppercase">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {options.map((option) => (
          <Button
            key={option}
            role="radio"
            aria-checked={option === value}
            appearance={option === value ? 'accent' : 'standard'}
            onClick={() => onChange(option)}
            disabled={disabled}
            className={labels?.[option] ? '' : 'capitalize'}
          >
            {labels?.[option] ?? option}
          </Button>
        ))}
      </div>
    </div>
  );
}

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

/**
 * A square button carrying only an icon.
 *
 * `label` is required, not optional: an icon alone is never the only cue. It
 * becomes the accessible name and the tooltip, so the control is reachable by a
 * screen reader and understandable to someone who does not recognise the glyph.
 */

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  label: string;
  icon: ReactNode;
  selected?: boolean;
  /** For the rare caller that must reach the element — a drag handle, say. */
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  icon,
  selected = false,
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={[
        'inline-flex items-center justify-center rounded-md border border-transparent',
        'size-(--density-control) text-fg',
        'transition-colors duration-100 ease-easy',
        selected ? 'bg-accent-subtle text-accent' : 'hover:bg-card-hover active:bg-card-active',
        'disabled:cursor-not-allowed disabled:text-fg-disabled',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon}
    </button>
  );
}

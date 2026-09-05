import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * The canonical button. Nothing in the product draws its own.
 *
 * Three appearances, matching Fluent: `accent` for the one primary action on a
 * surface, `standard` for everything else, `subtle` for actions that live
 * inside dense chrome such as a toolbar.
 */

export type ButtonAppearance = 'accent' | 'standard' | 'subtle';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  appearance?: ButtonAppearance;
  icon?: ReactNode;
}

const APPEARANCE: Record<ButtonAppearance, string> = {
  accent:
    'bg-accent text-fg-on-accent border-transparent hover:bg-accent-hover active:bg-accent-active',
  standard: 'bg-card text-fg border-stroke hover:bg-card-hover active:bg-card-active',
  subtle: 'bg-transparent text-fg border-transparent hover:bg-card-hover active:bg-card-active',
};

export function Button({
  appearance = 'standard',
  icon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md border px-3',
        'h-(--density-control) text-body font-semibold whitespace-nowrap',
        'transition-colors duration-100 ease-easy',
        'disabled:cursor-not-allowed disabled:text-fg-disabled disabled:bg-card disabled:border-stroke-subtle',
        APPEARANCE[appearance],
        className,
      ].join(' ')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

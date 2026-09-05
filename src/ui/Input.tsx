import type { InputHTMLAttributes } from 'react';

/**
 * The canonical text field.
 *
 * The Fluent shape: a filled surface with a heavier bottom stroke that takes the
 * accent colour on focus, rather than a ring drawn around the whole control.
 */
export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={[
        'h-(--density-control) w-full rounded-md border border-stroke bg-card px-3',
        'text-body text-fg placeholder:text-fg-tertiary',
        'border-b-2 border-b-stroke-strong',
        'transition-colors duration-100 ease-easy',
        'hover:bg-card-hover',
        'focus:border-b-accent focus:bg-card focus:outline-none',
        'disabled:cursor-not-allowed disabled:text-fg-disabled',
        className,
      ].join(' ')}
      {...rest}
    />
  );
}

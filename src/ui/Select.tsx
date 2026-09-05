import { ChevronDown16Regular } from '@fluentui/react-icons';
import type { SelectHTMLAttributes } from 'react';

/**
 * The canonical single-choice control.
 *
 * A real `<select>` underneath, styled. Rolling our own listbox would mean
 * reimplementing type-ahead, keyboard navigation, screen reader semantics and
 * the platform's own popup behaviour — badly, and for no gain a person can see.
 */
export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex w-full items-center">
      <select
        className={[
          'h-(--density-control) w-full appearance-none rounded-md border border-stroke bg-card',
          'border-b-2 border-b-stroke-strong pr-8 pl-3 text-body text-fg',
          'transition-colors duration-100 ease-easy',
          'hover:bg-card-hover focus:border-b-accent focus:outline-none',
          'disabled:cursor-not-allowed disabled:text-fg-disabled',
          className,
        ].join(' ')}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown16Regular
        aria-hidden="true"
        className="pointer-events-none absolute right-2 text-fg-tertiary"
      />
    </span>
  );
}

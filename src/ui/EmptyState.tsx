import type { ReactNode } from 'react';

/**
 * What a screen shows when there is nothing yet.
 *
 * An empty list is the first thing a new user sees, so it says what this place
 * is for and how to put something in it — not "No data".
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      {icon && (
        <span aria-hidden="true" className="mb-1 text-fg-disabled">
          {icon}
        </span>
      )}
      <p className="text-body-lg font-semibold text-fg">{title}</p>
      {description && <p className="max-w-sm text-body text-fg-tertiary">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

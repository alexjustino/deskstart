import type { ReactNode } from 'react';

/** An opaque surface inside the layer, at the first step of elevation. */
export function Card({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-stroke-subtle bg-card p-4 shadow-card">
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-body-lg font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-caption text-fg-tertiary">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

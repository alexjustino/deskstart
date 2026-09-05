import type { ReactNode } from 'react';

/**
 * A row of tabs.
 *
 * Arrow keys move between tabs, which is what the pattern requires and what a
 * plain row of buttons does not give you.
 */
export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string;
}

export function TabStrip({
  tabs,
  active,
  onSelect,
  actions,
}: {
  tabs: Tab[];
  active: string;
  onSelect: (id: string) => void;
  actions?: ReactNode;
}) {
  const move = (from: number, step: number) => {
    const next = tabs[(from + step + tabs.length) % tabs.length];
    if (next) onSelect(next.id);
  };

  return (
    <div className="flex items-end justify-between gap-4 border-b border-stroke-subtle">
      <div role="tablist" className="flex gap-0.5">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') move(index, 1);
                if (event.key === 'ArrowLeft') move(index, -1);
              }}
              className={[
                'relative flex items-center gap-2 px-3 py-2 text-body whitespace-nowrap',
                'transition-colors duration-100 ease-easy',
                selected ? 'font-semibold text-fg' : 'text-fg-secondary hover:text-fg',
              ].join(' ')}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && <span className="text-caption text-fg-tertiary">{tab.badge}</span>}
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>
      {actions && <div className="flex items-center gap-1 pb-1">{actions}</div>}
    </div>
  );
}

import {
  History20Regular,
  PlayCircle20Regular,
  Settings20Regular,
  Wrench20Regular,
} from '@fluentui/react-icons';
import type { ReactNode } from 'react';

/**
 * The navigation rail.
 *
 * Every destination here is built. A destination that is planned and not
 * built is not listed — nothing on the rail pretends to work when it does not.
 */

export type Destination = 'profiles' | 'runs' | 'diagnostics' | 'settings';

interface Entry {
  id: Destination;
  label: string;
  icon: ReactNode;
}

const ENTRIES: Entry[] = [
  { id: 'profiles', label: 'Profiles', icon: <PlayCircle20Regular /> },
  { id: 'runs', label: 'Runs', icon: <History20Regular /> },
  { id: 'diagnostics', label: 'Diagnostics', icon: <Wrench20Regular /> },
  { id: 'settings', label: 'Settings', icon: <Settings20Regular /> },
];

export function Sidebar({
  active,
  onNavigate,
}: {
  active: Destination;
  onNavigate: (destination: Destination) => void;
}) {
  return (
    <nav
      aria-label="Main"
      className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-stroke-subtle bg-layer-alt p-2"
    >
      {ENTRIES.map((entry) => {
        const selected = entry.id === active;
        return (
          <button
            key={entry.id}
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={() => onNavigate(entry.id)}
            title={entry.label}
            className={[
              'flex h-(--density-row) items-center gap-3 rounded-md px-3 text-body',
              'transition-colors duration-100 ease-easy hover:bg-card-hover',
              selected ? 'bg-accent-subtle font-semibold text-fg' : 'text-fg-secondary',
            ].join(' ')}
          >
            <span aria-hidden="true" className={selected ? 'text-accent' : undefined}>
              {entry.icon}
            </span>
            <span className="truncate">{entry.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

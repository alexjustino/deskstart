import { History20Regular } from '@fluentui/react-icons';
import { useState } from 'react';

import { describeError } from '@/data/errors';
import { useEvents, useRuns } from '@/data/hooks';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { InfoBar } from '@/ui/InfoBar';

import { outcomeLabel, outcomeTone, when } from './describe';
import { LogLines, RunHeading } from './LogLines';

/**
 * Every run, newest first, and the log of the one selected.
 *
 * A run keeps its profile's name even after the profile is gone: history
 * does not lose its subject because the subject was deleted.
 */
export function RunsPage() {
  const runs = useRuns(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derived, not synchronised: the chosen run while it is listed, else the newest.
  const list = runs.data ?? [];
  const selected =
    (selectedId !== null ? list.find((r) => r.id === selectedId) : undefined) ?? list[0] ?? null;
  const events = useEvents(selected?.id ?? null);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-title font-semibold text-fg">Runs</h1>
        <p className="mt-1 text-body text-fg-secondary">
          What happened, every time. The log is written by the host and cannot be edited.
        </p>
      </header>

      {runs.isError && (
        <InfoBar severity="danger" title="The runs could not be read">
          {describeError(runs.error)}
        </InfoBar>
      )}

      {runs.data && runs.data.length === 0 && (
        <EmptyState
          icon={<History20Regular />}
          title="Nothing has run yet"
          description="Run a profile and its log appears here."
        />
      )}

      {runs.data && runs.data.length > 0 && (
        <div className="grid grid-cols-[minmax(16rem,1fr)_2fr] gap-4">
          <Card title="History">
            <ol aria-label="Runs" className="flex flex-col gap-0.5">
              {runs.data.map((run) => {
                const current = run.id === selected?.id;
                return (
                  <li key={run.id}>
                    <button
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => setSelectedId(run.id)}
                      className={[
                        'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left',
                        'transition-colors duration-100 ease-easy hover:bg-card-hover',
                        current ? 'bg-accent-subtle' : '',
                      ].join(' ')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-body font-semibold text-fg">
                          {run.profileName}
                        </span>
                        <Chip tone={outcomeTone(run.outcome)}>{outcomeLabel(run.outcome)}</Chip>
                      </span>
                      <span className="text-caption text-fg-tertiary">
                        {run.mode === 'dry' ? 'Dry run' : 'Run'} · {when(run.startedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>
          <Card title="Log">
            {selected ? (
              <div className="flex flex-col gap-3">
                <RunHeading run={selected} />
                <LogLines lines={events.data ?? []} />
              </div>
            ) : (
              <p className="text-body text-fg-tertiary">Choose a run.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

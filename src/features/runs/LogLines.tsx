import type { LogLine, Run } from '@/data/runs';
import { describeTrigger } from '@/domain/triggers';
import { Chip } from '@/ui/Chip';

import { clock, describe, outcomeLabel, outcomeTone, when } from './describe';

/**
 * The run log, drawn.
 *
 * Every row is a line the host wrote before the interface saw it (ADR-011).
 * The screen adds nothing: a PID shown here is a PID in the file, and a
 * reason shown here is the reason recorded. What the row says is decided in
 * one place, `describe`, so the list, the latest-run card and the end-to-end
 * suite all read the same sentence.
 */

export function RunHeading({ run }: { run: Run }) {
  return (
    <div data-run-heading className="flex flex-wrap items-center gap-2 text-body text-fg-secondary">
      <span className="font-semibold text-fg">{run.profileName}</span>
      <Chip tone={run.mode === 'dry' ? 'info' : 'accent'}>
        {run.mode === 'dry' ? 'Dry run' : 'Run'}
      </Chip>
      <span>{when(run.startedAt)}</span>
      {describeTrigger(run.trigger) !== null && (
        <Chip tone="neutral">{describeTrigger(run.trigger)}</Chip>
      )}
      <Chip tone={outcomeTone(run.outcome)}>{outcomeLabel(run.outcome)}</Chip>
    </div>
  );
}

export function LogLines({ lines }: { lines: LogLine[] }) {
  if (lines.length === 0) {
    return <p className="text-body text-fg-tertiary">Nothing recorded yet.</p>;
  }
  return (
    <ol aria-label="Run log" data-selectable className="flex flex-col gap-1">
      {lines.map((line) => {
        const { text, detail } = describe(line);
        return (
          <li
            key={line.id}
            data-kind={line.kind}
            className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 rounded-md px-2 py-1 hover:bg-card-hover"
          >
            <span className="font-mono text-caption text-fg-tertiary">{clock(line.at)}</span>
            <span className="font-mono text-caption text-fg-disabled">#{line.seq}</span>
            <span className="min-w-0">
              <span className="text-body text-fg">{text}</span>
              {detail && (
                <span className="block truncate font-mono text-caption text-fg-tertiary">
                  {detail}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

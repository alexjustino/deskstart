/**
 * What a log line says, decided once.
 *
 * Pure functions over the lines the host wrote: the profile screen, the runs
 * screen and the end-to-end suite all read the same sentence from here, so a
 * PID shown anywhere is the PID in the file and a reason is the reason
 * recorded. Nothing here renders.
 */

import type { LogLine } from '@/data/runs';
import type { Outcome } from '@/domain/run';
import type { ChipTone } from '@/ui/chipTone';

/** The last path segment: what a person calls the program. */
export function baseName(path: unknown): string {
  if (typeof path !== 'string' || path === '') return 'the program';
  return path.split(/[\\/]/).pop() || path;
}

export function describe(line: LogLine): { text: string; detail: string | null } {
  const p = line.payload;
  switch (line.kind) {
    case 'run_started': {
      const mode = p.mode === 'dry' ? 'dry run' : 'run';
      const steps = typeof p.steps === 'number' ? p.steps : 0;
      return {
        text: `${mode === 'dry run' ? 'Dry run' : 'Run'} started — ${String(p.profileName ?? '')}, ${steps} ${steps === 1 ? 'step' : 'steps'}`,
        detail: null,
      };
    }
    case 'spawned':
      return {
        text: `Started ${baseName(p.program)} — PID ${String(p.pid ?? '?')}`,
        detail: typeof p.program === 'string' ? p.program : null,
      };
    case 'would_spawn':
      return {
        text: `Would start ${baseName(p.program)}`,
        detail: typeof p.program === 'string' ? p.program : null,
      };
    case 'failed':
      return {
        text: `Could not start ${baseName(p.program)}: ${String(p.reason ?? 'no reason recorded')}`,
        detail: typeof p.program === 'string' ? p.program : null,
      };
    case 'run_finished':
      return { text: `Run finished — ${outcomeLabel(p.outcome)}`, detail: null };
    default:
      return { text: line.kind, detail: null };
  }
}

export function outcomeLabel(outcome: unknown): string {
  switch (outcome) {
    case 'completed':
      return 'completed';
    case 'completed_with_failures':
      return 'completed, with failures';
    case 'failed':
      return 'failed';
    case 'stopped':
      return 'stopped';
    default:
      return 'in progress';
  }
}

export function outcomeTone(outcome: Outcome | null): ChipTone {
  switch (outcome) {
    case 'completed':
      return 'success';
    case 'completed_with_failures':
      return 'caution';
    case 'failed':
      return 'danger';
    case 'stopped':
      return 'neutral';
    default:
      return 'info';
  }
}

/** Local wall-clock time with milliseconds: what a person compares against their watch. */
export function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Local date and time, to the minute: enough to tell one run from another. */
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

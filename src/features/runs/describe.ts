/**
 * What a log line says, decided once.
 *
 * Pure functions over the lines the host wrote: the profile screen, the runs
 * screen and the end-to-end suite all read the same sentence from here, so a
 * PID shown anywhere is the PID in the file and a reason is the reason
 * recorded. Nothing here renders.
 */

import type { LogLine } from '@/data/runs';
import { lastSegment } from '@/domain/profile';
import type { Outcome } from '@/domain/run';
import type { ChipTone } from '@/ui/chipTone';

/** The last path segment: what a person calls the program. */
export function baseName(path: unknown): string {
  if (typeof path !== 'string' || path === '') return 'the program';
  return lastSegment(path);
}

/** The resolved target of a line: the program for an app, the target otherwise. */
function targetOf(p: Record<string, unknown>): string | null {
  if (typeof p.program === 'string') return p.program;
  if (typeof p.target === 'string') return p.target;
  return null;
}

/** What a person calls the target: a file name, a folder name, a host. */
function nameOf(p: Record<string, unknown>): string {
  const target = targetOf(p);
  if (target === null) return 'the step';
  if (p.kind === 'url') {
    try {
      return new URL(target).host;
    } catch {
      return target;
    }
  }
  return lastSegment(target);
}

/** "folder src" / "notes.txt" / "github.com": the noun the sentence needs. */
function noun(p: Record<string, unknown>): string {
  return p.kind === 'folder' ? `folder ${nameOf(p)}` : nameOf(p);
}

/** The resolved target, and where it came from when expansion changed it. */
function detailOf(p: Record<string, unknown>): string | null {
  const target = targetOf(p);
  if (target === null) return null;
  return typeof p.source === 'string' && p.source !== '' ? `${target} — from ${p.source}` : target;
}

function pidSuffix(p: Record<string, unknown>): string {
  return typeof p.pid === 'number' ? ` — PID ${p.pid}` : '';
}

export function describe(line: LogLine): { text: string; detail: string | null } {
  const p = line.payload;
  switch (line.kind) {
    case 'run_started': {
      const steps = typeof p.steps === 'number' ? p.steps : 0;
      return {
        text: `${p.mode === 'dry' ? 'Dry run' : 'Run'} started — ${String(p.profileName ?? '')}, ${steps} ${steps === 1 ? 'step' : 'steps'}`,
        detail: null,
      };
    }
    case 'spawned':
      return { text: `Started ${nameOf(p)}${pidSuffix(p)}`, detail: detailOf(p) };
    case 'opened':
      return { text: `Opened ${noun(p)}${pidSuffix(p)}`, detail: detailOf(p) };
    case 'would_spawn':
      return { text: `Would start ${nameOf(p)}`, detail: detailOf(p) };
    case 'would_open':
      return { text: `Would open ${noun(p)}`, detail: detailOf(p) };
    case 'failed': {
      const verb = p.kind === 'app' || p.kind === undefined ? 'start' : 'open';
      return {
        text: `Could not ${verb} ${noun(p)}: ${String(p.reason ?? 'no reason recorded')}`,
        detail: detailOf(p),
      };
    }
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

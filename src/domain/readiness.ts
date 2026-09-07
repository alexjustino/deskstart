/**
 * What a step waits for before it starts (F4).
 *
 * "Open the editor once the server is answering" is the rule that makes a
 * profile a setup rather than a list. A step may wait for **an earlier step**
 * to be responding, in one of two ways:
 *
 * - `window`: the program that step started has a visible window of its own.
 * - `port`: something answers on a TCP port of this machine.
 *
 * It waits up to a timeout. When the timeout runs out the waiting step is
 * **skipped with the reason** and the profile carries on — a setup that stalls
 * forever because one thing did not come up is worse than one that says so.
 *
 * Waiting only ever points **backwards**, at a step earlier in the profile.
 * That is the whole cycle prevention: two steps cannot wait for each other,
 * not because a check refuses it at run time but because the shape does not
 * allow it to be written.
 */

import type { Problem } from './profile';
import { describeDuration } from './timing';

export type Probe = { kind: 'window' } | { kind: 'port'; port: number };

export interface WaitFor {
  /** The earlier step this one waits for. */
  stepId: string;
  probe: Probe;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/** How often the host is asked again while a step is waiting. */
export const PROBE_EVERY_MS = 250;

const FIELDS = new Set(['stepId', 'probe', 'timeoutMs']);
const PROBE_FIELDS: Record<string, ReadonlySet<string>> = {
  window: new Set(['kind']),
  port: new Set(['kind', 'port']),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read a stored or drafted `waitFor`. `{}` and null mean "waits for nothing". */
export function readWaitFor(value: unknown, path = 'waitFor'): WaitFor | null | Problem[] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return [{ path, problem: 'what a step waits for must be an object' }];
  if (Object.keys(value).length === 0) return null;

  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!FIELDS.has(key)) {
      problems.push({
        path: `${path}.${key}`,
        problem: 'this field is not part of what a step waits for',
      });
    }
  }

  const stepId = typeof value.stepId === 'string' ? value.stepId.trim() : '';
  if (stepId === '') {
    problems.push({ path: `${path}.stepId`, problem: 'a step waits for another step; name which' });
  }

  const timeoutMs = value.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    problems.push({
      path: `${path}.timeoutMs`,
      problem: 'the timeout must be a whole number of milliseconds, more than zero',
    });
  }

  let probe: Probe | null = null;
  const raw = value.probe;
  if (!isRecord(raw) || (raw.kind !== 'window' && raw.kind !== 'port')) {
    problems.push({
      path: `${path}.probe`,
      problem: 'a step waits for a window to appear or for a port to answer',
    });
  } else {
    const kind = raw.kind;
    for (const key of Object.keys(raw)) {
      if (!PROBE_FIELDS[kind]?.has(key)) {
        problems.push({
          path: `${path}.probe.${key}`,
          problem: `this field is not part of a ${kind} probe`,
        });
      }
    }
    if (kind === 'window') {
      probe = { kind: 'window' };
    } else {
      const port = raw.port;
      if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
        problems.push({
          path: `${path}.probe.port`,
          problem: 'a port is a whole number from 1 to 65535',
        });
      } else {
        probe = { kind: 'port', port };
      }
    }
  }

  if (problems.length > 0 || probe === null) return problems;
  return { stepId, probe, timeoutMs: timeoutMs as number };
}

/** The stored form. "Waits for nothing" stores as `{}`, so an untouched row stays small. */
export function serializeWaitFor(waitFor: WaitFor | null): string {
  if (waitFor === null) return '{}';
  return JSON.stringify(waitFor);
}

/** Read a stored `wait_json` back. A row that cannot be read is a problem, not a crash. */
export function parseStoredWaitFor(json: string): WaitFor | null | Problem[] {
  if (json.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [{ path: 'waitFor', problem: 'what the step waits for could not be read' }];
  }
  return readWaitFor(parsed);
}

/** What a probe looks for, in a sentence fragment. */
export function describeProbe(probe: Probe): string {
  return probe.kind === 'window' ? 'a window' : `port ${probe.port}`;
}

/**
 * What a step's waiting means, in a sentence, given what the awaited step is
 * called. Nothing when it waits for nothing.
 */
export function describeWaitFor(
  waitFor: WaitFor | null,
  awaitedTitle: string | null,
): string | null {
  if (waitFor === null) return null;
  const what = awaitedTitle ?? 'a step that is no longer here';
  return `waits for ${what} — ${describeProbe(waitFor.probe)} — up to ${describeDuration(waitFor.timeoutMs)}`;
}

/** A step as far as waiting is concerned: its identity and what it waits for. */
export interface Waiter {
  id: string;
  waitFor: WaitFor | null;
}

/**
 * What is wrong with a step's waiting, in the profile it lives in.
 *
 * A step may only wait for one that comes **before** it: a step that waits for
 * itself, for a later step, or for a step that is no longer in the profile is
 * a step that would wait for something that cannot happen.
 */
export function waitForProblems(steps: readonly Waiter[], index: number): Problem[] {
  const step = steps[index];
  if (step === undefined || step.waitFor === null) return [];
  const awaited = step.waitFor.stepId;
  if (awaited === step.id) {
    return [{ path: 'waitFor.stepId', problem: 'a step cannot wait for itself' }];
  }
  const at = steps.findIndex((s) => s.id === awaited);
  if (at === -1) {
    return [
      { path: 'waitFor.stepId', problem: 'it waits for a step that is no longer in this profile' },
    ];
  }
  if (at > index) {
    return [
      {
        path: 'waitFor.stepId',
        problem: 'it waits for a step that comes after it; a step may only wait for an earlier one',
      },
    ];
  }
  return [];
}

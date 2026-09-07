/**
 * The typed client for the run commands, and the reading of a log line.
 *
 * A line in the log is data the host wrote; what it means to the state
 * machine is decided here, once, by `toRunEvent`. The interface reads the
 * same lines to draw them.
 */

import { invoke } from '@tauri-apps/api/core';

import type { Launch } from '@/domain/profile';
import type { Placement } from '@/domain/placement';
import type { Probe } from '@/domain/readiness';
import type { Mode, Outcome, RunEvent } from '@/domain/run';

export interface Run {
  id: string;
  profileId: string | null;
  profileName: string;
  mode: Mode;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: Outcome | null;
}

export interface LogLine {
  id: number;
  runId: string;
  seq: number;
  at: string;
  stepId: string | null;
  kind: string;
  payload: Record<string, unknown>;
}

interface RawRun {
  id: string;
  profile_id: string | null;
  profile_name: string;
  mode: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  outcome: string | null;
}

interface RawEvent {
  id: number;
  run_id: string;
  seq: number;
  at: string;
  step_id: string | null;
  kind: string;
  payload_json: string;
}

const OUTCOMES: ReadonlySet<string> = new Set([
  'completed',
  'completed_with_failures',
  'failed',
  'stopped',
]);

/** The line kinds that mean the step was done, whatever "done" meant for its kind. */
const DONE: ReadonlySet<string> = new Set(['spawned', 'opened', 'would_spawn', 'would_open']);
/** The line kinds that mean the step's program is closed — for real, or on paper. */
const CLOSED: ReadonlySet<string> = new Set(['closed', 'would_close']);

function toRun(raw: RawRun): Run {
  return {
    id: raw.id,
    profileId: raw.profile_id,
    profileName: raw.profile_name,
    mode: raw.mode === 'dry' ? 'dry' : 'real',
    trigger: raw.trigger,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    outcome: raw.outcome !== null && OUTCOMES.has(raw.outcome) ? (raw.outcome as Outcome) : null,
  };
}

function toLogLine(raw: RawEvent): LogLine {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw.payload_json);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // A line whose payload cannot be read still exists; it is drawn without detail.
  }
  return {
    id: raw.id,
    runId: raw.run_id,
    seq: raw.seq,
    at: raw.at,
    stepId: raw.step_id,
    kind: raw.kind,
    payload,
  };
}

/**
 * What a log line means to the state machine, or nothing when it is not a
 * step event. `at` is the instant the machine should take for it: the host's
 * timestamp, or the caller's virtual clock in a dry run.
 */
export function toRunEvent(line: LogLine, at = Date.parse(line.at)): RunEvent | null {
  if (line.stepId === null) return null;
  const reason = typeof line.payload.reason === 'string' ? line.payload.reason : 'unknown';
  if (DONE.has(line.kind)) return { kind: 'step_done', stepId: line.stepId, at };
  if (line.kind === 'failed') return { kind: 'step_failed', stepId: line.stepId, reason, at };
  if (CLOSED.has(line.kind)) return { kind: 'step_closed', stepId: line.stepId, at };
  if (line.kind === 'not_closed') {
    return { kind: 'step_not_closed', stepId: line.stepId, reason, at };
  }
  return null;
}

export async function runBegin(profileId: string, mode: Mode): Promise<Run> {
  return toRun(await invoke<RawRun>('run_begin', { profileId, mode, trigger: 'button' }));
}

export async function stepExecute(runId: string, stepId: string, launch: Launch): Promise<LogLine> {
  return toLogLine(await invoke<RawEvent>('step_execute', { runId, stepId, launch }));
}

export async function stepClose(
  runId: string,
  stepId: string,
  launch: Launch,
  heldMs: number,
): Promise<LogLine> {
  return toLogLine(await invoke<RawEvent>('step_close', { runId, stepId, launch, heldMs }));
}

export async function stepWait(runId: string, stepId: string, ms: number): Promise<LogLine> {
  return toLogLine(await invoke<RawEvent>('step_wait', { runId, stepId, ms }));
}

/** Stop a run: the host closes what the run opened, and only that, one line each. */
/**
 * Ask the host whether what a step waits for is responding. Writes no line:
 * it is asked four times a second, and a log with four lines a second is not
 * a log.
 */
export async function stepProbe(
  runId: string,
  awaitedStepId: string,
  probe: Probe,
): Promise<boolean> {
  return invoke<boolean>('step_probe', { runId, awaitedStepId, probe });
}

/** The line that opens a wait. */
export async function stepWaitingFor(
  runId: string,
  stepId: string,
  awaitedStepId: string,
  probe: Probe,
  timeoutMs: number,
): Promise<LogLine> {
  return toLogLine(
    await invoke<RawEvent>('step_waiting_for', {
      runId,
      stepId,
      awaitedStepId,
      probe,
      timeoutMs,
    }),
  );
}

/** The line that closes a wait: it answered, after this long. */
export async function stepReady(runId: string, stepId: string, waitedMs: number): Promise<LogLine> {
  return toLogLine(await invoke<RawEvent>('step_ready', { runId, stepId, waitedMs }));
}

/**
 * The line for a step the loop could not start — a bookmark folder that is not
 * there. Every other failure is the host's own; this one is found between the
 * file and the browser, and is written in the same shape.
 */
export async function stepFailed(
  runId: string,
  stepId: string,
  launch: Launch,
  reason: string,
): Promise<LogLine> {
  return toLogLine(await invoke<RawEvent>('step_failed', { runId, stepId, launch, reason }));
}

/** The line for a step that will not start, and why. */
export async function stepSkipped(runId: string, stepId: string, reason: string): Promise<LogLine> {
  return toLogLine(await invoke<RawEvent>('step_skipped', { runId, stepId, reason }));
}

/**
 * Put a step's window where the step says (F6). The host looks for the window
 * of the process this run started, waits a moment for it, and writes one line:
 * what it did, or what it could not do.
 */
export async function stepPlace(
  runId: string,
  stepId: string,
  placement: Placement,
): Promise<LogLine> {
  return toLogLine(await invoke<RawEvent>('step_place', { runId, stepId, placement }));
}

export async function runStop(runId: string, launches: Record<string, Launch>): Promise<LogLine[]> {
  const raw = await invoke<RawEvent[]>('run_stop', { runId, launches });
  return raw.map(toLogLine);
}

export async function runFinish(runId: string, outcome: Outcome): Promise<Run> {
  return toRun(await invoke<RawRun>('run_finish', { runId, outcome }));
}

export async function listRuns(profileId: string | null, limit = 50): Promise<Run[]> {
  const raw = await invoke<RawRun[]>('runs_list', { profileId, limit });
  return raw.map(toRun);
}

export async function listEvents(runId: string): Promise<LogLine[]> {
  const raw = await invoke<RawEvent[]>('events_list', { runId });
  return raw.map(toLogLine);
}

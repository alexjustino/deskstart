/**
 * The run, as a pure state machine (ADR-012).
 *
 * `reduce` never reads the clock and never performs I/O. The host feeds it
 * events — what actually happened, with the time it happened — and executes
 * the actions it returns. Dry-run, real run and the end-to-end suite all drive
 * this one function, so what is tested here with fabricated instants is what
 * runs.
 *
 * Time (F2) enters as one more event, `time { at }`, carrying the instant the
 * host looked at its clock. Everything due by then fires; nothing is measured
 * by counting ticks. A laptop that slept through a hold wakes up, the host
 * sends one `time`, and the close that was due fires then — late, and said so
 * by the timestamps, never lost.
 *
 * The machine does not know how a step was done — started, opened, or only
 * written down in a dry run — only that it was, or was not. That translation
 * happens once, at the boundary (`data/runs.ts`).
 */

import type { Timing } from './timing';

export type Mode = 'real' | 'dry';

export type Outcome = 'completed' | 'completed_with_failures' | 'failed' | 'stopped';

export interface PlannedStep {
  id: string;
  timing: Timing;
}

export type StepResult = 'ok' | 'failed' | 'skipped';

/** Where one step is in its own life: opened, held, closed, reopening, over. */
export type StepPhase =
  'pending' | 'open' | 'closing' | 'closed' | 'reopening' | 'done' | 'failed' | 'skipped';

export type RunEvent =
  | { kind: 'begun'; at: number }
  | { kind: 'step_done'; stepId: string; at: number }
  | { kind: 'step_failed'; stepId: string; reason: string; at: number }
  | { kind: 'step_closed'; stepId: string; at: number }
  | { kind: 'step_not_closed'; stepId: string; reason: string; at: number }
  | { kind: 'time'; at: number }
  | { kind: 'stop_requested'; at: number };

export type WaitReason = { kind: 'pause'; stepId: string } | { kind: 'timer' };

export type Action =
  | { kind: 'execute'; stepId: string }
  | { kind: 'close'; stepId: string; heldMs: number }
  | { kind: 'wait_until'; at: number; reason: WaitReason }
  | { kind: 'finish'; outcome: Outcome };

interface Timer {
  stepId: string;
  at: number;
  what: 'close' | 'reopen';
}

export interface RunState {
  mode: Mode;
  steps: PlannedStep[];
  /** Index of the next step to start in the sequence. */
  index: number;
  /** When the next sequence step may start, while a pause is running. */
  nextStepAt: number | null;
  timers: Timer[];
  phases: Record<string, StepPhase>;
  /** How many times each step has been opened. */
  opened: Record<string, number>;
  /** When each step was last opened, so a hold is measured from the real instant. */
  openedAt: Record<string, number>;
  results: Record<string, StepResult>;
  phase: 'planned' | 'running' | 'finished';
  startedAt: number | null;
  finishedAt: number | null;
  outcome: Outcome | null;
}

type Next = { state: RunState; actions: Action[] };

/** The plan: the steps in the order they will be executed, and nothing done yet. */
export function plan(steps: PlannedStep[], mode: Mode): RunState {
  return {
    mode,
    steps,
    index: 0,
    nextStepAt: null,
    timers: [],
    phases: Object.fromEntries(steps.map((s) => [s.id, 'pending' as StepPhase])),
    opened: {},
    openedAt: {},
    results: {},
    phase: 'planned',
    startedAt: null,
    finishedAt: null,
    outcome: null,
  };
}

/** How a run ended, judged from what each step did. */
export function outcomeOf(results: Record<string, StepResult>, stopped: boolean): Outcome {
  if (stopped) return 'stopped';
  const values = Object.values(results);
  const failed = values.filter((r) => r === 'failed').length;
  if (failed === 0) return 'completed';
  return failed === values.length ? 'failed' : 'completed_with_failures';
}

/**
 * One event in, the next state and the actions to take out.
 *
 * An event that does not fit the state — a step that is not the current one,
 * anything after the run finished — changes nothing and asks for nothing. The
 * log still holds it; the machine simply does not act on it.
 */
export function reduce(state: RunState, event: RunEvent): Next {
  if (state.phase === 'finished') return { state, actions: [] };

  switch (event.kind) {
    case 'begun': {
      if (state.phase !== 'planned') return { state, actions: [] };
      return startNext({ ...state, phase: 'running', startedAt: event.at }, event.at);
    }

    case 'step_done':
    case 'step_failed': {
      if (state.phase !== 'running') return { state, actions: [] };
      const step = stepOf(state, event.stepId);
      if (step === null) return { state, actions: [] };
      const phase = state.phases[step.id];
      const current = state.steps[state.index];
      const isSequence = current?.id === step.id && phase === 'pending';
      const isReopen = phase === 'reopening';
      if (!isSequence && !isReopen) return { state, actions: [] };

      let next: RunState = state;
      const actions: Action[] = [];
      if (event.kind === 'step_failed') {
        next = {
          ...next,
          phases: { ...next.phases, [step.id]: 'failed' },
          results: { ...next.results, [step.id]: 'failed' },
        };
      } else {
        const opened = (next.opened[step.id] ?? 0) + 1;
        next = {
          ...next,
          phases: { ...next.phases, [step.id]: 'open' },
          opened: { ...next.opened, [step.id]: opened },
          openedAt: { ...next.openedAt, [step.id]: event.at },
          results: { ...next.results, [step.id]: next.results[step.id] ?? 'ok' },
        };
        if (step.timing.holdMs !== null) {
          next = withTimer(next, {
            stepId: step.id,
            at: event.at + step.timing.holdMs,
            what: 'close',
          });
        } else {
          // Nothing more will happen to it: it stays open, and the run does not wait for it.
          next = { ...next, phases: { ...next.phases, [step.id]: 'done' } };
        }
      }

      if (isSequence) {
        next = { ...next, index: next.index + 1 };
        const following = next.steps[next.index];
        if (following !== undefined && step.timing.pauseAfterMs > 0) {
          next = { ...next, nextStepAt: event.at + step.timing.pauseAfterMs };
          return { state: next, actions: [...actions, ...nextWait(next, event.at)] };
        }
        const started = startNext(next, event.at);
        return { state: started.state, actions: [...actions, ...started.actions] };
      }
      return settle(next, event.at, actions);
    }

    case 'step_closed':
    case 'step_not_closed': {
      if (state.phase !== 'running') return { state, actions: [] };
      const step = stepOf(state, event.stepId);
      if (step === null || state.phases[step.id] !== 'closing') return { state, actions: [] };
      if (event.kind === 'step_not_closed') {
        // Reopening what could not be closed would multiply windows; the log
        // holds the reason, the step is over.
        return settle({ ...state, phases: { ...state.phases, [step.id]: 'done' } }, event.at, []);
      }
      const opened = state.opened[step.id] ?? 0;
      const again = step.timing.repeat === 'forever' || opened < step.timing.repeat;
      if (!again) {
        return settle({ ...state, phases: { ...state.phases, [step.id]: 'done' } }, event.at, []);
      }
      if (step.timing.closedMs > 0) {
        const next = withTimer(
          { ...state, phases: { ...state.phases, [step.id]: 'closed' } },
          { stepId: step.id, at: event.at + step.timing.closedMs, what: 'reopen' },
        );
        return settle(next, event.at, []);
      }
      return {
        state: { ...state, phases: { ...state.phases, [step.id]: 'reopening' } },
        actions: [{ kind: 'execute', stepId: step.id }],
      };
    }

    case 'time': {
      if (state.phase !== 'running') return { state, actions: [] };
      let next = state;
      const actions: Action[] = [];
      // Everything due by now, in the order it was due.
      const due = next.timers.filter((t) => t.at <= event.at).sort((a, b) => a.at - b.at);
      next = { ...next, timers: next.timers.filter((t) => t.at > event.at) };
      for (const timer of due) {
        const step = stepOf(next, timer.stepId);
        if (step === null) continue;
        if (timer.what === 'close' && next.phases[step.id] === 'open') {
          next = { ...next, phases: { ...next.phases, [step.id]: 'closing' } };
          actions.push({
            kind: 'close',
            stepId: step.id,
            heldMs: step.timing.holdMs ?? 0,
          });
        } else if (timer.what === 'reopen' && next.phases[step.id] === 'closed') {
          next = { ...next, phases: { ...next.phases, [step.id]: 'reopening' } };
          actions.push({ kind: 'execute', stepId: step.id });
        }
      }
      if (next.nextStepAt !== null && next.nextStepAt <= event.at) {
        next = { ...next, nextStepAt: null };
        const started = startNext(next, event.at);
        return { state: started.state, actions: [...actions, ...started.actions] };
      }
      return settle(next, event.at, actions);
    }

    case 'stop_requested': {
      return finish(state, event.at, true);
    }
  }
}

function stepOf(state: RunState, id: string): PlannedStep | null {
  return state.steps.find((s) => s.id === id) ?? null;
}

function withTimer(state: RunState, timer: Timer): RunState {
  return { ...state, timers: [...state.timers, timer] };
}

/** Start the next sequence step, or settle when the sequence is over. */
function startNext(state: RunState, at: number): Next {
  const next = state.steps[state.index];
  if (next === undefined) return settle(state, at, []);
  return { state, actions: [{ kind: 'execute', stepId: next.id }] };
}

/** The wait for whatever comes first: a pause ending or a timer firing. */
function nextWait(state: RunState, at: number): Action[] {
  const candidates: Array<{ at: number; reason: WaitReason }> = state.timers.map((t) => ({
    at: t.at,
    reason: { kind: 'timer' as const },
  }));
  if (state.nextStepAt !== null) {
    const step = state.steps[state.index - 1];
    candidates.push({
      at: state.nextStepAt,
      reason: step ? { kind: 'pause', stepId: step.id } : { kind: 'timer' },
    });
  }
  if (candidates.length === 0) return [];
  const soonest = candidates.reduce((a, b) => (b.at < a.at ? b : a));
  return [{ kind: 'wait_until', at: Math.max(soonest.at, at), reason: soonest.reason }];
}

/**
 * After anything that is not a start: finish if there is nothing left to do,
 * otherwise say how long to wait for the next thing.
 */
function settle(state: RunState, at: number, actions: Action[]): Next {
  const sequenceOver = state.index >= state.steps.length && state.nextStepAt === null;
  const busy = Object.values(state.phases).some(
    (p) => p === 'open' || p === 'closing' || p === 'closed' || p === 'reopening',
  );
  if (sequenceOver && !busy && state.timers.length === 0) {
    const finished = finish(state, at, false);
    return { state: finished.state, actions: [...actions, ...finished.actions] };
  }
  // A close or an execute is already in flight; the wait comes once it answers.
  if (actions.some((a) => a.kind === 'execute' || a.kind === 'close')) {
    return { state, actions };
  }
  return { state, actions: [...actions, ...nextWait(state, at)] };
}

function finish(state: RunState, at: number, stopped: boolean): Next {
  const results = { ...state.results };
  const phases = { ...state.phases };
  for (const step of state.steps) {
    if (results[step.id] === undefined) {
      results[step.id] = 'skipped';
      phases[step.id] = 'skipped';
    }
  }
  const outcome = outcomeOf(results, stopped);
  return {
    state: {
      ...state,
      results,
      phases,
      timers: [],
      nextStepAt: null,
      phase: 'finished',
      finishedAt: at,
      outcome,
    },
    actions: [{ kind: 'finish', outcome }],
  };
}

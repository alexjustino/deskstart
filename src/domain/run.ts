/**
 * The run, as a pure state machine (ADR-012).
 *
 * `reduce` never reads the clock and never performs I/O. The host feeds it
 * events — what actually happened, with the time it happened — and executes
 * the actions it returns. Dry-run, real run and the end-to-end suite all drive
 * this one function, so what is tested here with a fake clock is what runs.
 *
 * F0 knows one thing: start each step in order, then finish with an outcome
 * that says how many started. Pauses, holds, cycles and dependencies arrive in
 * later slices as more event and action kinds over the same reducer.
 */

export type Mode = 'real' | 'dry';

export type Outcome = 'completed' | 'completed_with_failures' | 'failed' | 'stopped';

export interface PlannedStep {
  id: string;
}

export type StepResult = 'ok' | 'failed' | 'skipped';

export type RunEvent =
  | { kind: 'begun'; at: number }
  | { kind: 'spawned'; stepId: string; pid: number; at: number }
  | { kind: 'would_spawn'; stepId: string; at: number }
  | { kind: 'failed'; stepId: string; reason: string; at: number }
  | { kind: 'stop_requested'; at: number };

export type Action = { kind: 'execute'; stepId: string } | { kind: 'finish'; outcome: Outcome };

export interface RunState {
  mode: Mode;
  steps: PlannedStep[];
  /** Index of the step being executed, or the next to execute. */
  index: number;
  results: Record<string, StepResult>;
  phase: 'planned' | 'running' | 'finished';
  startedAt: number | null;
  finishedAt: number | null;
  outcome: Outcome | null;
}

/** The plan: the steps in the order they will be executed, and nothing done yet. */
export function plan(steps: PlannedStep[], mode: Mode): RunState {
  return {
    mode,
    steps,
    index: 0,
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
export function reduce(state: RunState, event: RunEvent): { state: RunState; actions: Action[] } {
  if (state.phase === 'finished') return { state, actions: [] };

  switch (event.kind) {
    case 'begun': {
      if (state.phase !== 'planned') return { state, actions: [] };
      const running: RunState = { ...state, phase: 'running', startedAt: event.at };
      return advance(running, event.at);
    }

    case 'spawned':
    case 'would_spawn':
    case 'failed': {
      if (state.phase !== 'running') return { state, actions: [] };
      const current = state.steps[state.index];
      if (current === undefined || current.id !== event.stepId) return { state, actions: [] };
      const result: StepResult = event.kind === 'failed' ? 'failed' : 'ok';
      const next: RunState = {
        ...state,
        index: state.index + 1,
        results: { ...state.results, [current.id]: result },
      };
      return advance(next, event.at);
    }

    case 'stop_requested': {
      if (state.phase === 'planned') {
        return finish({ ...state, startedAt: event.at }, event.at, true);
      }
      return finish(state, event.at, true);
    }
  }
}

/** Ask for the next step, or finish when there is none. */
function advance(state: RunState, at: number): { state: RunState; actions: Action[] } {
  const next = state.steps[state.index];
  if (next === undefined) return finish(state, at, false);
  return { state, actions: [{ kind: 'execute', stepId: next.id }] };
}

function finish(
  state: RunState,
  at: number,
  stopped: boolean,
): { state: RunState; actions: Action[] } {
  const results = { ...state.results };
  for (const step of state.steps.slice(state.index)) {
    results[step.id] ??= 'skipped';
  }
  const outcome = outcomeOf(results, stopped);
  return {
    state: { ...state, results, phase: 'finished', finishedAt: at, outcome },
    actions: [{ kind: 'finish', outcome }],
  };
}

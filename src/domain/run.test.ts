import { describe, expect, it } from 'vitest';

import { outcomeOf, plan, reduce, type Action, type RunEvent, type RunState } from './run';
import { DEFAULT_TIMING, type Timing } from './timing';

function step(id: string, timing: Partial<Timing> = {}) {
  return { id, timing: { ...DEFAULT_TIMING, ...timing } };
}

const STEPS = [step('a'), step('b'), step('c')];

/** Feed events in order and collect every action, the way the host does. */
function drive(initial: RunState, events: RunEvent[]) {
  let state = initial;
  const actions: Action[] = [];
  for (const event of events) {
    const next = reduce(state, event);
    state = next.state;
    actions.push(...next.actions);
  }
  return { state, actions };
}

/**
 * A fake host: executes what the machine asks, answering `step_done` at once
 * and `step_closed` at once, and advancing a fake clock to every `wait_until`.
 * Every instant the machine sees comes from here, never from Date.
 */
function simulate(initial: RunState, options: { failing?: string[]; unclosable?: string[] } = {}) {
  let state = initial;
  const trace: string[] = [];
  let now = 0;
  const queue: Action[] = [];
  // Like the real loop: a wait is remembered, not queued, and the clock moves
  // only when nothing else is pending — the soonest wait wins.
  let wake: { at: number; reason: string } | null = null;
  const feed = (event: RunEvent) => {
    const next = reduce(state, event);
    state = next.state;
    for (const action of next.actions) {
      if (action.kind === 'wait_until') {
        if (wake === null || action.at < wake.at)
          wake = { at: action.at, reason: action.reason.kind };
      } else {
        queue.push(action);
      }
    }
  };
  feed({ kind: 'begun', at: now });
  let guard = 0;
  while ((queue.length > 0 || wake !== null) && guard++ < 1000) {
    const action = queue.shift();
    if (action === undefined) {
      if (wake === null) break;
      const { at, reason } = wake;
      wake = null;
      trace.push(`wait ${reason} until ${at}`);
      now = Math.max(now, at);
      feed({ kind: 'time', at: now });
      continue;
    }
    switch (action.kind) {
      case 'execute':
        trace.push(`execute ${action.stepId} @${now}`);
        if (options.failing?.includes(action.stepId)) {
          feed({ kind: 'step_failed', stepId: action.stepId, reason: 'no', at: now });
        } else {
          feed({ kind: 'step_done', stepId: action.stepId, at: now });
        }
        break;
      case 'close':
        trace.push(`close ${action.stepId} @${now} after ${action.heldMs}`);
        if (options.unclosable?.includes(action.stepId)) {
          feed({ kind: 'step_not_closed', stepId: action.stepId, reason: 'gone', at: now });
        } else {
          feed({ kind: 'step_closed', stepId: action.stepId, at: now });
        }
        break;
      case 'finish':
        trace.push(`finish ${action.outcome} @${now}`);
        wake = null;
        break;
      case 'wait_until':
        break;
    }
  }
  return { state, trace, now };
}

describe('a run without time', () => {
  it('starts each step in order and finishes completed', () => {
    const { state, actions } = drive(plan(STEPS, 'real'), [
      { kind: 'begun', at: 1000 },
      { kind: 'step_done', stepId: 'a', at: 1100 },
      { kind: 'step_done', stepId: 'b', at: 1200 },
      { kind: 'step_done', stepId: 'c', at: 1300 },
    ]);
    expect(actions).toEqual([
      { kind: 'execute', stepId: 'a' },
      { kind: 'execute', stepId: 'b' },
      { kind: 'execute', stepId: 'c' },
      { kind: 'finish', outcome: 'completed' },
    ]);
    expect(state.phase).toBe('finished');
    expect(state.startedAt).toBe(1000);
    expect(state.finishedAt).toBe(1300);
    expect(state.results).toEqual({ a: 'ok', b: 'ok', c: 'ok' });
    expect(state.phases).toEqual({ a: 'done', b: 'done', c: 'done' });
  });

  it('continues past a step that failed and says so in the outcome', () => {
    const { state, actions } = drive(plan(STEPS, 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 1 },
      { kind: 'step_failed', stepId: 'b', reason: 'the program was not found', at: 2 },
      { kind: 'step_done', stepId: 'c', at: 3 },
    ]);
    expect(actions.at(-1)).toEqual({ kind: 'finish', outcome: 'completed_with_failures' });
    expect(state.results).toEqual({ a: 'ok', b: 'failed', c: 'ok' });
  });

  it('is failed when every step failed', () => {
    const { actions } = drive(plan(STEPS.slice(0, 2), 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_failed', stepId: 'a', reason: 'x', at: 1 },
      { kind: 'step_failed', stepId: 'b', reason: 'y', at: 2 },
    ]);
    expect(actions.at(-1)).toEqual({ kind: 'finish', outcome: 'failed' });
  });

  it('an empty profile finishes at once, completed', () => {
    const { state, actions } = drive(plan([], 'real'), [{ kind: 'begun', at: 5 }]);
    expect(actions).toEqual([{ kind: 'finish', outcome: 'completed' }]);
    expect(state.finishedAt).toBe(5);
  });

  it('a stop finishes the run and marks the rest skipped', () => {
    const { state, actions } = drive(plan(STEPS, 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 1 },
      { kind: 'stop_requested', at: 2 },
    ]);
    expect(actions.at(-1)).toEqual({ kind: 'finish', outcome: 'stopped' });
    expect(state.results).toEqual({ a: 'ok', b: 'skipped', c: 'skipped' });
    expect(state.phase).toBe('finished');
  });

  it('a stop before it begun still finishes it, stopped', () => {
    const { state, actions } = drive(plan(STEPS, 'real'), [{ kind: 'stop_requested', at: 9 }]);
    expect(actions).toEqual([{ kind: 'finish', outcome: 'stopped' }]);
    expect(state.results).toEqual({ a: 'skipped', b: 'skipped', c: 'skipped' });
  });

  it('ignores an event for a step that is not the current one', () => {
    const begun = reduce(plan(STEPS, 'real'), { kind: 'begun', at: 0 }).state;
    const stray = reduce(begun, { kind: 'step_done', stepId: 'c', at: 1 });
    expect(stray.state).toBe(begun);
    expect(stray.actions).toEqual([]);
    const unknown = reduce(begun, { kind: 'step_failed', stepId: 'zz', reason: '?', at: 1 });
    expect(unknown.state).toBe(begun);
    const closed = reduce(begun, { kind: 'step_closed', stepId: 'a', at: 1 });
    expect(closed.state).toBe(begun);
  });

  it('ignores a step event before the run begun and anything after it finished', () => {
    const planned = plan(STEPS.slice(0, 1), 'real');
    const early = reduce(planned, { kind: 'step_done', stepId: 'a', at: 1 });
    expect(early.state).toBe(planned);
    expect(early.actions).toEqual([]);
    const tick = reduce(planned, { kind: 'time', at: 1 });
    expect(tick.state).toBe(planned);

    const { state: finished } = drive(planned, [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 1 },
    ]);
    for (const event of [
      { kind: 'begun', at: 2 },
      { kind: 'time', at: 3 },
      { kind: 'stop_requested', at: 3 },
    ] as RunEvent[]) {
      const late = reduce(finished, event);
      expect(late.state).toBe(finished);
      expect(late.actions).toEqual([]);
    }
  });

  it('a second begun changes nothing', () => {
    const begun = reduce(plan(STEPS, 'real'), { kind: 'begun', at: 0 });
    const again = reduce(begun.state, { kind: 'begun', at: 1 });
    expect(again.state).toBe(begun.state);
    expect(again.actions).toEqual([]);
  });
});

describe('a pause between steps', () => {
  it('waits after a step before starting the next, and not after the last', () => {
    const { trace, now } = simulate(
      plan([step('a', { pauseAfterMs: 2000 }), step('b', { pauseAfterMs: 9000 })], 'real'),
    );
    expect(trace).toEqual([
      'execute a @0',
      'wait pause until 2000',
      'execute b @2000',
      'finish completed @2000',
    ]);
    expect(now).toBe(2000);
  });

  it('a stop during a pause skips what had not started', () => {
    const { state, actions } = drive(plan([step('a', { pauseAfterMs: 5000 }), step('b')], 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 10 },
      { kind: 'stop_requested', at: 2000 },
    ]);
    expect(actions.at(-1)).toEqual({ kind: 'finish', outcome: 'stopped' });
    expect(state.results).toEqual({ a: 'ok', b: 'skipped' });
    expect(state.nextStepAt).toBeNull();
  });

  it('a time event before the pause is over starts nothing', () => {
    const { actions } = drive(plan([step('a', { pauseAfterMs: 5000 }), step('b')], 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 10 },
      { kind: 'time', at: 3000 },
    ]);
    expect(actions.filter((a) => a.kind === 'execute')).toEqual([{ kind: 'execute', stepId: 'a' }]);
    // The machine asks again for the same instant, not an earlier one.
    expect(actions.at(-1)).toEqual({
      kind: 'wait_until',
      at: 5010,
      reason: { kind: 'pause', stepId: 'a' },
    });
  });
});

describe('a hold', () => {
  it('closes the step when its hold is over, measured from when it opened', () => {
    const { trace } = simulate(plan([step('a', { holdMs: 5000 })], 'real'));
    expect(trace).toEqual([
      'execute a @0',
      'wait timer until 5000',
      'close a @5000 after 5000',
      'finish completed @5000',
    ]);
  });

  it('does not hold the sequence: the next step starts while the first is held', () => {
    const { trace } = simulate(plan([step('a', { holdMs: 5000 }), step('b')], 'real'));
    expect(trace).toEqual([
      'execute a @0',
      'execute b @0',
      'wait timer until 5000',
      'close a @5000 after 5000',
      'finish completed @5000',
    ]);
  });

  it('a clock that jumps past the deadline closes late, not never', () => {
    const { state, actions } = drive(plan([step('a', { holdMs: 5000 })], 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 0 },
      // The laptop slept; the next look at the clock is an hour later.
      { kind: 'time', at: 3_600_000 },
    ]);
    expect(actions.at(-1)).toEqual({ kind: 'close', stepId: 'a', heldMs: 5000 });
    expect(state.phases.a).toBe('closing');
  });

  it('a time event before the hold is over asks to wait again, and closes nothing', () => {
    const { actions } = drive(plan([step('a', { holdMs: 5000 })], 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 100 },
      { kind: 'time', at: 3000 },
    ]);
    expect(actions.some((a) => a.kind === 'close')).toBe(false);
    expect(actions.at(-1)).toEqual({ kind: 'wait_until', at: 5100, reason: { kind: 'timer' } });
  });

  it("a stop during a hold finishes stopped; the close is the host's (F3)", () => {
    const { state, actions } = drive(plan([step('a', { holdMs: 5000 })], 'real'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 0 },
      { kind: 'stop_requested', at: 1000 },
    ]);
    expect(actions.at(-1)).toEqual({ kind: 'finish', outcome: 'stopped' });
    expect(state.timers).toEqual([]);
    expect(state.phases.a).toBe('open');
  });

  it('a step that could not be closed is over, not reopened', () => {
    const { trace, state } = simulate(plan([step('a', { holdMs: 1000, repeat: 3 })], 'real'), {
      unclosable: ['a'],
    });
    expect(trace).toEqual([
      'execute a @0',
      'wait timer until 1000',
      'close a @1000 after 1000',
      'finish completed @1000',
    ]);
    expect(state.opened.a).toBe(1);
  });

  it('a step that failed to open has no hold and no close', () => {
    const { trace } = simulate(plan([step('a', { holdMs: 1000 }), step('b')], 'real'), {
      failing: ['a'],
    });
    expect(trace).toEqual(['execute a @0', 'execute b @0', 'finish completed_with_failures @0']);
  });
});

describe('a cycle', () => {
  it('opens three times, closing in between, then stops', () => {
    const { trace, state } = simulate(plan([step('a', { holdMs: 1000, repeat: 3 })], 'real'));
    expect(trace).toEqual([
      'execute a @0',
      'wait timer until 1000',
      'close a @1000 after 1000',
      'execute a @1000',
      'wait timer until 2000',
      'close a @2000 after 1000',
      'execute a @2000',
      'wait timer until 3000',
      'close a @3000 after 1000',
      'finish completed @3000',
    ]);
    expect(state.opened.a).toBe(3);
    expect(state.phases.a).toBe('done');
  });

  it('stays closed for a while between openings', () => {
    const { trace } = simulate(
      plan([step('a', { holdMs: 1000, repeat: 2, closedMs: 500 })], 'real'),
    );
    expect(trace).toEqual([
      'execute a @0',
      'wait timer until 1000',
      'close a @1000 after 1000',
      'wait timer until 1500',
      'execute a @1500',
      'wait timer until 2500',
      'close a @2500 after 1000',
      'finish completed @2500',
    ]);
  });

  it('a cycle that repeats forever ends only when stopped', () => {
    let state = plan([step('a', { holdMs: 100, repeat: 'forever' })], 'real');
    const feed = (e: RunEvent) => {
      const next = reduce(state, e);
      state = next.state;
      return next.actions;
    };
    feed({ kind: 'begun', at: 0 });
    let at = 0;
    for (let i = 0; i < 50; i += 1) {
      feed({ kind: 'step_done', stepId: 'a', at });
      at += 100;
      const closing = feed({ kind: 'time', at });
      expect(closing).toEqual([{ kind: 'close', stepId: 'a', heldMs: 100 }]);
      const reopen = feed({ kind: 'step_closed', stepId: 'a', at });
      expect(reopen).toEqual([{ kind: 'execute', stepId: 'a' }]);
    }
    expect(state.phase).toBe('running');
    expect(state.opened.a).toBe(50);
    const stopped = feed({ kind: 'stop_requested', at });
    expect(stopped).toEqual([{ kind: 'finish', outcome: 'stopped' }]);
  });

  it('a failed reopening ends the cycle and marks the step failed', () => {
    let state = plan([step('a', { holdMs: 100, repeat: 3 })], 'real');
    const feed = (e: RunEvent) => {
      const next = reduce(state, e);
      state = next.state;
      return next.actions;
    };
    feed({ kind: 'begun', at: 0 });
    feed({ kind: 'step_done', stepId: 'a', at: 0 });
    feed({ kind: 'time', at: 100 });
    feed({ kind: 'step_closed', stepId: 'a', at: 100 });
    const actions = feed({ kind: 'step_failed', stepId: 'a', reason: 'gone', at: 100 });
    expect(actions).toEqual([{ kind: 'finish', outcome: 'failed' }]);
    expect(state.results.a).toBe('failed');
  });

  it('two held steps and a pause interleave by their own deadlines', () => {
    const { trace } = simulate(
      plan(
        [step('a', { holdMs: 3000, pauseAfterMs: 1000 }), step('b', { holdMs: 1000 }), step('c')],
        'real',
      ),
    );
    expect(trace).toEqual([
      'execute a @0',
      'wait pause until 1000',
      'execute b @1000',
      'execute c @1000',
      'wait timer until 2000',
      'close b @2000 after 1000',
      'wait timer until 3000',
      'close a @3000 after 3000',
      'finish completed @3000',
    ]);
  });
});

describe('outcomeOf', () => {
  it('judges from the results alone', () => {
    expect(outcomeOf({}, false)).toBe('completed');
    expect(outcomeOf({ a: 'ok' }, false)).toBe('completed');
    expect(outcomeOf({ a: 'ok', b: 'failed' }, false)).toBe('completed_with_failures');
    expect(outcomeOf({ a: 'failed' }, false)).toBe('failed');
    expect(outcomeOf({ a: 'ok', b: 'skipped' }, false)).toBe('completed');
    expect(outcomeOf({ a: 'ok' }, true)).toBe('stopped');
  });
});

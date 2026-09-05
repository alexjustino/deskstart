import { describe, expect, it } from 'vitest';

import { outcomeOf, plan, reduce, type RunEvent, type RunState } from './run';

const STEPS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

/** Feed events in order and collect every action, the way the host does. */
function drive(initial: RunState, events: RunEvent[]) {
  let state = initial;
  const actions = [];
  for (const event of events) {
    const step = reduce(state, event);
    state = step.state;
    actions.push(...step.actions);
  }
  return { state, actions };
}

describe('a run', () => {
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

  it('a dry run is the same machine: a step done is a step done', () => {
    const { state, actions } = drive(plan(STEPS.slice(0, 1), 'dry'), [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 1 },
    ]);
    expect(actions).toEqual([
      { kind: 'execute', stepId: 'a' },
      { kind: 'finish', outcome: 'completed' },
    ]);
    expect(state.results).toEqual({ a: 'ok' });
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
    expect(state.startedAt).toBe(9);
    expect(state.results).toEqual({ a: 'skipped', b: 'skipped', c: 'skipped' });
  });

  it('ignores an event for a step that is not the current one', () => {
    const begun = reduce(plan(STEPS, 'real'), { kind: 'begun', at: 0 }).state;
    const stray = reduce(begun, { kind: 'step_done', stepId: 'c', at: 1 });
    expect(stray.state).toBe(begun);
    expect(stray.actions).toEqual([]);
    const unknown = reduce(begun, { kind: 'step_failed', stepId: 'zz', reason: '?', at: 1 });
    expect(unknown.state).toBe(begun);
  });

  it('ignores a step event before the run begun and anything after it finished', () => {
    const planned = plan(STEPS.slice(0, 1), 'real');
    const early = reduce(planned, { kind: 'step_done', stepId: 'a', at: 1 });
    expect(early.state).toBe(planned);
    expect(early.actions).toEqual([]);

    const { state: finished } = drive(planned, [
      { kind: 'begun', at: 0 },
      { kind: 'step_done', stepId: 'a', at: 1 },
    ]);
    const late = reduce(finished, { kind: 'begun', at: 2 });
    expect(late.state).toBe(finished);
    expect(late.actions).toEqual([]);
    const stop = reduce(finished, { kind: 'stop_requested', at: 3 });
    expect(stop.actions).toEqual([]);
  });

  it('a second begun changes nothing', () => {
    const begun = reduce(plan(STEPS, 'real'), { kind: 'begun', at: 0 });
    const again = reduce(begun.state, { kind: 'begun', at: 1 });
    expect(again.state).toBe(begun.state);
    expect(again.actions).toEqual([]);
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

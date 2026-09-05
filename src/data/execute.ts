/**
 * The execution loop: the host's actions driven by the domain's decisions.
 *
 * One reducer (`domain/run`), one host command per action. The loop begins a
 * run, feeds the reducer `begun`, and then — for as long as the reducer asks
 * for a step — has the host execute it and feeds back the line the host wrote.
 * The log is written before the interface sees anything (ADR-011): every
 * `onLine` here is a line that is already on disk.
 */

import { plan, reduce, type Action, type Mode, type RunState } from '@/domain/run';

import { runBegin, runFinish, stepExecute, toRunEvent, type LogLine, type Run } from './runs';

export interface Execution {
  run: Run;
  state: RunState;
}

export async function executeProfile(
  profileId: string,
  stepIds: string[],
  mode: Mode,
  onLine: (line: LogLine) => void = () => undefined,
): Promise<Execution> {
  const run = await runBegin(profileId, mode);
  let state = plan(
    stepIds.map((id) => ({ id })),
    mode,
  );

  let { state: next, actions } = reduce(state, { kind: 'begun', at: Date.parse(run.startedAt) });
  state = next;

  const queue: Action[] = [...actions];
  while (queue.length > 0) {
    const action = queue.shift();
    if (action === undefined) break;

    if (action.kind === 'finish') {
      const finished = await runFinish(run.id, action.outcome);
      return { run: finished, state };
    }

    const line = await stepExecute(run.id, action.stepId);
    onLine(line);
    const event = toRunEvent(line);
    if (event === null) continue;
    ({ state: next, actions } = reduce(state, event));
    state = next;
    queue.push(...actions);
  }

  // The reducer always ends with a finish; reaching here means it did not,
  // which is a bug worth a loud failure rather than a run left open.
  throw new Error('the run ended without an outcome');
}

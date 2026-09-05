/**
 * The execution loop: the host's actions driven by the domain's decisions.
 *
 * One reducer (`domain/run`), one host command per action. The loop begins a
 * run, feeds the reducer `begun`, and then — for as long as the reducer asks
 * for a step — resolves that step (`domain/profile`), has the host execute the
 * resolved launch, and feeds back the line the host wrote. The log is written
 * before the interface sees anything (ADR-011): every `onLine` here is a line
 * that is already on disk.
 *
 * Resolution is the same function the editor previews with, so what a person
 * saw before pressing Run is what the host is asked to do.
 */

import { resolveStep, type Step } from '@/domain/profile';
import { plan, reduce, type Action, type Mode, type RunState } from '@/domain/run';

import { runBegin, runFinish, stepExecute, toRunEvent, type LogLine, type Run } from './runs';

export interface Execution {
  run: Run;
  state: RunState;
}

export async function executeProfile(
  profileId: string,
  steps: Step[],
  mode: Mode,
  env: Readonly<Record<string, string>>,
  onLine: (line: LogLine) => void = () => undefined,
): Promise<Execution> {
  const run = await runBegin(profileId, mode);
  let state = plan(
    steps.map((step) => ({ id: step.id })),
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

    const step = steps.find((s) => s.id === action.stepId);
    if (step === undefined) throw new Error('the run asked for a step the profile does not have');
    const resolved = resolveStep(step.config, env);
    if (!resolved.ok) {
      // The editor refuses to store an unresolvable step and Run is disabled
      // while one exists, so reaching this is a bug worth a loud failure.
      throw new Error(`a step could not be resolved: ${resolved.problems[0]?.problem ?? '?'}`);
    }

    const line = await stepExecute(run.id, step.id, resolved.launch);
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

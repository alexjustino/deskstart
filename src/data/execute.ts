/**
 * The execution loop: the host's actions driven by the domain's decisions.
 *
 * One reducer (`domain/run`), one host command per action. The loop begins a
 * run, feeds the reducer `begun`, and then — for as long as the reducer asks —
 * executes, closes, or waits. The log is written before the interface sees
 * anything (ADR-011): every `onLine` here is a line that is already on disk.
 *
 * Time is the host's clock and nothing else. A `wait_until` is remembered,
 * never queued: when no action is pending the loop sleeps until the soonest
 * instant asked for, then feeds one `time` event with the clock as it is —
 * late after a sleep, and the machine copes. A dry run does not sleep: its
 * clock is virtual and jumps to every instant asked for, so a profile with an
 * hour of holds is written down in a second.
 *
 * A Stop (F3) is a flag the loop looks at before every action and that wakes
 * it from any sleep. Nothing queued is started after it; the machine finishes
 * `stopped`, the host closes what the run opened — and only that — and the
 * run is finished with that outcome.
 */

import { resolveStep, type Launch, type Step } from '@/domain/profile';
import { plan, reduce, type Action, type Mode, type RunEvent, type RunState } from '@/domain/run';

import {
  runBegin,
  runFinish,
  runStop,
  stepClose,
  stepExecute,
  stepProbe,
  stepReady,
  stepSkipped,
  stepWait,
  stepWaitingFor,
  toRunEvent,
  type LogLine,
  type Run,
} from './runs';

export interface Execution {
  run: Run;
  state: RunState;
}

/** The one way to interrupt a run from outside the loop. */
export class Stopper {
  private requested = false;
  private wakers: Array<() => void> = [];

  get stopped(): boolean {
    return this.requested;
  }

  stop(): void {
    this.requested = true;
    for (const wake of this.wakers.splice(0)) wake();
  }

  /** Sleep, unless a stop comes first. */
  sleep(ms: number): Promise<void> {
    if (this.requested) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wakers = this.wakers.filter((w) => w !== done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakers.push(done);
    });
  }
}

export async function executeProfile(
  profileId: string,
  steps: Step[],
  mode: Mode,
  env: Readonly<Record<string, string>>,
  onLine: (line: LogLine) => void = () => undefined,
  onBegin: (run: Run) => void = () => undefined,
  stopper: Stopper = new Stopper(),
): Promise<Execution> {
  const run = await runBegin(profileId, mode);
  // The run exists in the file from this instant; the screen may show it now,
  // not when it is over. A run with an hour of holds is still a run.
  onBegin(run);
  const dry = mode === 'dry';

  // Every launch resolved once, before anything runs: the editor refused to
  // store an unresolvable step and Run is disabled while one exists, so a
  // miss here is a bug worth a loud failure.
  const launches = new Map<string, Launch>();
  for (const step of steps) {
    const resolved = resolveStep(step.config, env);
    if (!resolved.ok) {
      throw new Error(`a step could not be resolved: ${resolved.problems[0]?.problem ?? '?'}`);
    }
    launches.set(step.id, resolved.launch);
  }
  const launchOf = (stepId: string): Launch => {
    const launch = launches.get(stepId);
    if (launch === undefined) throw new Error('the run asked for a step the profile does not have');
    return launch;
  };
  const stepOf = (stepId: string): Step => {
    const step = steps.find((s) => s.id === stepId);
    if (step === undefined) throw new Error('the run asked for a step the profile does not have');
    return step;
  };

  let state = plan(
    steps.map((step) => ({ id: step.id, timing: step.timing, waitFor: step.waitFor })),
    mode,
  );
  // The dry run's clock; the real run reads the host's timestamps.
  let virtualNow = Date.parse(run.startedAt);
  const now = () => (dry ? virtualNow : Date.now());

  type Wake = { at: number; reason: Action & { kind: 'wait_until' } };
  const queue: Action[] = [];
  // Written by `feed` (a closure), so it is read through `pending()` below —
  // straight-line narrowing would otherwise decide it is always null.
  let wake: Wake | null = null;
  const pending = (): Wake | null => wake;
  const feed = (event: RunEvent) => {
    const next = reduce(state, event);
    state = next.state;
    for (const action of next.actions) {
      if (action.kind === 'wait_until') {
        if (wake === null || action.at < wake.at) wake = { at: action.at, reason: action };
      } else {
        queue.push(action);
      }
    }
  };
  const feedLine = (line: LogLine) => {
    onLine(line);
    const event = toRunEvent(line, dry ? virtualNow : Date.parse(line.at));
    if (event !== null) feed(event);
  };

  let stopFed = false;
  const takeStop = () => {
    if (!stopper.stopped || stopFed) return;
    stopFed = true;
    // Nothing queued before the stop is started after it.
    queue.length = 0;
    wake = null;
    feed({ kind: 'stop_requested', at: now() });
  };

  feed({ kind: 'begun', at: now() });

  for (;;) {
    takeStop();
    const action = queue.shift();
    if (action === undefined) {
      if (state.phase === 'finished') break;
      const next = pending();
      if (next === null) throw new Error('the run has nothing to do and no reason to wait');
      const { at, reason } = next;
      wake = null;
      if (dry) {
        virtualNow = Math.max(virtualNow, at);
      } else {
        await stopper.sleep(Math.max(0, at - Date.now()));
        if (stopper.stopped) continue;
      }
      if (reason.reason.kind === 'pause') {
        const step = stepOf(reason.reason.stepId);
        onLine(await stepWait(run.id, step.id, step.timing.pauseAfterMs));
      }
      feed({ kind: 'time', at: now() });
      continue;
    }

    switch (action.kind) {
      case 'execute':
        feedLine(await stepExecute(run.id, action.stepId, launchOf(action.stepId)));
        break;
      case 'close':
        feedLine(await stepClose(run.id, action.stepId, launchOf(action.stepId), action.heldMs));
        break;
      case 'probe': {
        const step = stepOf(action.stepId);
        const waitFor = step.waitFor;
        if (waitFor === null) throw new Error('a step was probed that waits for nothing');
        if (action.first) {
          onLine(
            await stepWaitingFor(run.id, step.id, waitFor.stepId, waitFor.probe, waitFor.timeoutMs),
          );
        }
        // A dry run performs no probe: it says what it would wait for and
        // carries on, so a profile that waits a minute is written down at once.
        const ready = dry ? true : await stepProbe(run.id, waitFor.stepId, waitFor.probe);
        feed({ kind: 'probe_result', stepId: step.id, ready, at: now() });
        break;
      }
      case 'ready':
        if (!dry) onLine(await stepReady(run.id, action.stepId, action.waitedMs));
        break;
      case 'skip':
        onLine(await stepSkipped(run.id, action.stepId, action.reason));
        break;
      case 'finish': {
        if (action.outcome === 'stopped') {
          for (const line of await runStop(run.id, Object.fromEntries(launches))) onLine(line);
        }
        const finished = await runFinish(run.id, action.outcome);
        return { run: finished, state };
      }
      case 'wait_until':
        // Never queued; handled above.
        break;
    }
  }

  // The reducer always ends with a finish; reaching here means it did not,
  // which is a bug worth a loud failure rather than a run left open.
  throw new Error('the run ended without an outcome');
}

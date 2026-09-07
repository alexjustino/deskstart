/**
 * The rules that need more than one part of a step.
 *
 * A step's configuration, its time and its placement are each read by their own
 * module, and each is right on its own. What is left over is the handful of
 * rules that only make sense when you look at two of them together — and those
 * live here, in the domain, so that the **editor and the file reader ask the
 * same question**. Before this module the rule was in the form only, which
 * meant a document could carry what the form would have refused.
 *
 * There is one such rule today, in two halves: what a run does to a window it
 * did not open. Nothing — so a folder, a file or a web page cannot be held,
 * closed, cycled or placed. Those open in a window that belongs to Explorer or
 * to the browser (ADR-018); reaching into one means matching windows by title,
 * and a rule that matches by name will one day match the wrong one.
 */

import type { Placement } from './placement';
import { isPlaced } from './placement';
import type { Problem, StepConfig } from './profile';
import type { Timing } from './timing';

/** What a kind of step is called in a sentence about it. */
const AS_WRITTEN: Record<StepConfig['kind'], string> = {
  app: 'an application',
  folder: 'a folder',
  file: 'a file',
  url: 'a web page',
};

/**
 * What is wrong with a step once its parts are read together, or nothing.
 * The paths point at the field that would have to change.
 */
export function stepProblems(config: StepConfig, timing: Timing, placement: Placement): Problem[] {
  if (config.kind === 'app') return [];
  const what = AS_WRITTEN[config.kind];
  const problems: Problem[] = [];
  if (timing.holdMs !== null) {
    problems.push({
      path: 'timing.holdMs',
      problem: `only an application can be held and closed; ${what} is opened by Windows and is not ours to close`,
    });
  }
  if (isPlaced(placement)) {
    problems.push({
      path: 'placement',
      problem: `only an application's window can be placed; ${what} opens in a window Windows owns, not this one`,
    });
  }
  return problems;
}

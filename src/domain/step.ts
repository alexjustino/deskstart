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
  bookmarks: 'a bookmark folder',
  terminal: 'a terminal',
  editor: 'an editor window',
  vm: 'a virtual machine',
};

/**
 * Why this kind's window is not this product's to hold or place.
 *
 * Two different reasons, and the difference is worth saying: Windows opens the
 * first three in a window that was never ours, while the tools of F7 are
 * started by us and then hand the window to a process of their own — a
 * browser, a terminal host, an editor that was already running. Either way the
 * process this product holds is not the one with the window (risk R2).
 */
const WHY_NOT: Record<Exclude<StepConfig['kind'], 'app'>, string> = {
  folder: 'is opened by Windows and is not ours to close',
  file: 'is opened by Windows and is not ours to close',
  url: 'is opened by Windows and is not ours to close',
  bookmarks: 'hands its window to the browser, which this product did not start',
  terminal: 'hands its window to Windows Terminal, which outlives the process that asked for it',
  editor: 'hands its window to the editor, which may have been running already',
  vm: 'shows a console the hypervisor owns; the process this product started only asked for it',
};

/**
 * What is wrong with a step once its parts are read together, or nothing.
 * The paths point at the field that would have to change.
 */
export function stepProblems(config: StepConfig, timing: Timing, placement: Placement): Problem[] {
  if (config.kind === 'app') return [];
  const what = AS_WRITTEN[config.kind];
  const why = WHY_NOT[config.kind];
  const problems: Problem[] = [];
  if (timing.holdMs !== null) {
    problems.push({
      path: 'timing.holdMs',
      problem: `only an application can be held and closed; ${what} ${why}`,
    });
  }
  if (isPlaced(placement)) {
    problems.push({
      path: 'placement',
      problem: `only an application's window can be placed; ${what} ${why}`,
    });
  }
  return problems;
}

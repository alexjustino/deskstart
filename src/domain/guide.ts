/**
 * The guided tour (1.2): which parts of the screen it shows, in what order,
 * and how it moves between them.
 *
 * The tour points at the real interface — the rail, the profile list, the
 * step editor, Run — not at pictures of it. Each step names an **anchor**, a
 * `data-guide` mark on the element it is about, and the screen that element
 * lives on. What is on screen depends on the person's own data: a workspace
 * with no profile has no step editor to point at. So moving through the tour
 * skips a step whose anchor is not there, rather than pointing at nothing;
 * and the steps that were skipped are counted, so the last card can say how
 * to see the rest.
 *
 * Every step also names the manual section that says more (ADR-031), so the
 * tour and the manual are one guide read two ways (ADR-032).
 */

/** The screens the tour may take a person to. */
export type GuideDestination = 'home' | 'profiles' | 'runs' | 'settings' | 'help';

export interface GuideStep {
  id: string;
  /** The screen the anchor is on. */
  destination: GuideDestination;
  /** The `data-guide` value of the element the step is about. */
  anchor: string;
  /** The manual section that says more — a manual section id. */
  section: string;
}

/** The tour, in order. */
export const GUIDE_STEPS: readonly GuideStep[] = [
  { id: 'home', destination: 'home', anchor: 'home', section: 'start' },
  { id: 'rail', destination: 'profiles', anchor: 'rail', section: 'start' },
  { id: 'new-profile', destination: 'profiles', anchor: 'new-profile', section: 'profiles' },
  { id: 'capture', destination: 'profiles', anchor: 'capture', section: 'capture' },
  { id: 'import', destination: 'profiles', anchor: 'import', section: 'sharing' },
  { id: 'steps', destination: 'profiles', anchor: 'steps', section: 'profiles' },
  { id: 'add-step', destination: 'profiles', anchor: 'add-step', section: 'kinds' },
  { id: 'where', destination: 'profiles', anchor: 'where', section: 'where' },
  { id: 'run', destination: 'profiles', anchor: 'run', section: 'run' },
  { id: 'triggers', destination: 'profiles', anchor: 'triggers', section: 'triggers' },
  { id: 'runs', destination: 'runs', anchor: 'runs', section: 'run' },
  { id: 'help', destination: 'help', anchor: 'help', section: 'start' },
] as const;

/**
 * The next step from `from`, going `by` (+1 forward, -1 back), skipping the
 * steps whose anchor is not on screen; null past either end.
 *
 * `present` is asked about a step only once the tour would show it, and it
 * may need the step's screen to be open first — so it is the caller's to
 * answer, honestly, for the screen it is on.
 */
export function nextShown(
  steps: readonly GuideStep[],
  from: number,
  by: 1 | -1,
  present: (step: GuideStep) => boolean,
): number | null {
  for (let i = from + by; i >= 0 && i < steps.length; i += by) {
    const step = steps[i];
    if (step !== undefined && present(step)) return i;
  }
  return null;
}

/** Where a step starts the tour: its index, or the first step for an unknown id. */
export function indexOfStep(steps: readonly GuideStep[], id: string | null): number {
  if (id === null) return 0;
  const found = steps.findIndex((step) => step.id === id);
  return found < 0 ? 0 : found;
}

/** The first step that points at a manual section, for "Show me" from Help. */
export function stepForSection(steps: readonly GuideStep[], section: string): string | null {
  return steps.find((step) => step.section === section)?.id ?? null;
}

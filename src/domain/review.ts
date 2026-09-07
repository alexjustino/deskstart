/**
 * The review gate (ADR-013): an imported profile is code.
 *
 * A profile that arrived as a file is an instruction to start programs with
 * this person's privileges. Until every one of its steps has been seen and
 * accepted, it runs nothing — not by the button, which is disabled, and not by
 * anything that goes around the button, because the execution loop asks this
 * function before it opens a run, and the host asks its own copy of the
 * question before it writes one (`run_begin` answers `unreviewed`).
 *
 * Two gates for one rule is the point. The screen is a courtesy; the host is
 * the boundary. This module is what they agree on.
 */

/** A step as far as review is concerned. */
export interface Reviewable {
  id: string;
  /** Seen and accepted by the person on this machine. */
  reviewed: boolean;
}

export interface ReviewState {
  /** True while the profile may not run. */
  blocked: boolean;
  accepted: number;
  total: number;
  remaining: number;
  /** Why it may not run, in a sentence, or null when it may. */
  reason: string | null;
}

/**
 * Where a profile stands with review. A profile that was written here is not
 * under review at all — the person who wrote a step is the person who accepted
 * it — so only the imported flag opens the gate.
 */
export function reviewState(
  profile: { importedUnreviewed: boolean },
  steps: readonly Reviewable[],
): ReviewState {
  const total = steps.length;
  const accepted = steps.filter((step) => step.reviewed).length;
  const remaining = total - accepted;
  if (!profile.importedUnreviewed) {
    return { blocked: false, accepted, total, remaining, reason: null };
  }
  return {
    blocked: true,
    accepted,
    total,
    remaining,
    reason:
      remaining === 0
        ? 'this profile was imported and is still marked unreviewed'
        : `this profile was imported; ${remaining} of its ${total} ${
            total === 1 ? 'step' : 'steps'
          } ${remaining === 1 ? 'has' : 'have'} not been accepted yet`,
  };
}

/**
 * The one question the execution loop asks: may this run start? A sentence
 * back means no, and it is the sentence the person is shown.
 */
export function whyNotRunnable(
  profile: { importedUnreviewed: boolean },
  steps: readonly Reviewable[],
): string | null {
  return reviewState(profile, steps).reason;
}

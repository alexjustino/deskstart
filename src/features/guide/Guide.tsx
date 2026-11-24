import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  GUIDE_STEPS,
  indexOfStep,
  nextShown,
  type GuideDestination,
  type GuideStep,
} from '@/domain/guide';
import type { ManualLanguage } from '@/domain/settings';
import { Button } from '@/ui/Button';
import { CoachMark, type Spot } from '@/ui/CoachMark';
import { announce } from '@/ui/announce';

import { inline } from '../help/manual/text';
import type { SectionId } from '../help/manual/types';
import { GUIDE_TEXT } from './content';

/** How long a step's element may take to appear after its screen opens. */
const FIND_FOR_MS = 1500;

function anchorOf(step: GuideStep): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-guide="${step.anchor}"]`);
}

function spotOf(element: HTMLElement): Spot {
  const r = element.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameSpot(a: Spot | null, b: Spot | null): boolean {
  return (
    a !== null &&
    b !== null &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((part, i) =>
        part.kind === 'strong' ? (
          <strong key={i} className="font-semibold text-fg">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The guided tour (1.2, ADR-032): the real interface, lit one part at a time.
 *
 * Each step opens its screen, waits for its element, scrolls it into view and
 * lights it; the light follows the element if it moves. A step whose element
 * is not there — the editor, before there is a profile — is skipped, and the
 * last card says how to see it. Every step can open the manual at the section
 * that says more, which ends the tour there.
 */
export function Guide({
  startAt,
  language,
  current,
  navigate,
  openHelp,
  onClose,
}: {
  startAt: string | null;
  language: ManualLanguage;
  /** The screen showing now. */
  current: string;
  navigate: (destination: GuideDestination) => void;
  openHelp: (section: SectionId) => void;
  onClose: () => void;
}) {
  const text = GUIDE_TEXT[language];
  const [index, setIndex] = useState(() => indexOfStep(GUIDE_STEPS, startAt));
  const [ended, setEnded] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  // The way the tour is going: a step with nothing to show is skipped the same
  // way, or going Back from a later screen would bounce forward again.
  const [direction, setDirection] = useState<1 | -1>(1);
  const step = ended ? undefined : GUIDE_STEPS[index];

  // A step on the screen that is open now can be judged at once; one on
  // another screen is judged after that screen opens.
  const present = useCallback(
    (candidate: GuideStep) => candidate.destination !== current || anchorOf(candidate) !== null,
    [current],
  );

  const move = useCallback(
    (by: 1 | -1) => {
      const to = nextShown(GUIDE_STEPS, index, by, present);
      if (to === null) {
        if (by === 1) setEnded(true);
        return;
      }
      setDirection(by);
      setSpot(null);
      setIndex(to);
    },
    [index, present],
  );

  // Open the step's screen.
  useEffect(() => {
    if (step !== undefined && current !== step.destination) navigate(step.destination);
  }, [step, current, navigate]);

  // Find the step's element, bring it into view, and keep the light on it.
  useEffect(() => {
    if (step === undefined || current !== step.destination) return;
    let frame = 0;
    let last: Spot | null = null;
    let scrolled = false;
    const since = performance.now();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const follow = () => {
      const element = anchorOf(step);
      if (element === null) {
        if (performance.now() - since > FIND_FOR_MS) {
          // Nothing to show here yet: on, the way the tour is going, and
          // remember it. Back past the first step there is to show ends at it.
          setSkipped((n) => n + 1);
          const to = nextShown(GUIDE_STEPS, index, direction, () => true);
          if (to !== null) setIndex(to);
          else if (direction === 1) setEnded(true);
          else {
            setDirection(1);
            setIndex(nextShown(GUIDE_STEPS, index, 1, () => true) ?? index);
          }
          return;
        }
      } else {
        if (!scrolled) {
          element.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
          scrolled = true;
        }
        const now = spotOf(element);
        if (!sameSpot(now, last)) {
          last = now;
          setSpot(now);
        }
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [step, current, index, direction]);

  const said = step !== undefined ? text.steps[step.id] : undefined;
  useEffect(() => {
    if (said !== undefined) announce(said.title);
  }, [said]);

  const position = useMemo(() => GUIDE_STEPS.findIndex((s) => s.id === step?.id), [step]);
  const hasBack = step !== undefined && nextShown(GUIDE_STEPS, index, -1, present) !== null;

  if (ended || step === undefined || said === undefined) {
    return (
      <CoachMark label={text.end.title} spot={null} onClose={onClose}>
        <h2 className="text-body-lg font-semibold text-fg">{text.end.title}</h2>
        <p className="text-body text-fg-secondary">{text.end.body}</p>
        {skipped > 0 && <p className="text-caption text-fg-secondary">{text.end.skipped}</p>}
        <div className="flex justify-end">
          <Button appearance="accent" onClick={onClose} autoFocus>
            {text.done}
          </Button>
        </div>
      </CoachMark>
    );
  }

  return (
    <CoachMark label={said.title} spot={spot} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-fg-tertiary">
          {text.progress(position + 1, GUIDE_STEPS.length)}
        </span>
        {/* The tour's progress as a row of lights, one per step. */}
        <span aria-hidden="true" className="flex gap-1">
          {GUIDE_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={[
                'size-1.5 rounded-full transition-colors duration-200 ease-easy motion-reduce:transition-none',
                i <= position ? 'bg-accent' : 'bg-stroke-strong',
              ].join(' ')}
            />
          ))}
        </span>
      </div>
      <h2 className="text-body-lg font-semibold text-fg">{said.title}</h2>
      <p className="text-body text-fg-secondary">
        <Rich text={said.body} />
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="flex gap-1">
          <Button appearance="subtle" onClick={onClose}>
            {text.skip}
          </Button>
          <Button
            appearance="subtle"
            onClick={() => {
              onClose();
              openHelp(step.section as SectionId);
            }}
          >
            {text.more}
          </Button>
        </span>
        <span className="flex gap-2">
          {hasBack && <Button onClick={() => move(-1)}>{text.back}</Button>}
          <Button appearance="accent" onClick={() => move(1)} autoFocus>
            {text.next}
          </Button>
        </span>
      </div>
    </CoachMark>
  );
}

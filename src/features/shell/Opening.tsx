import { useEffect, useState } from 'react';

import type { ManualLanguage } from '@/domain/settings';
import { GUIDE_TEXT } from '@/features/guide/content';

import './opening.css';

/** The mark's six points (ADR-033), in the order they light. */
const POINTS = [
  { cx: 76, cy: 72, r: 13, fill: '#22D3EE', opacity: 0.5 },
  { cx: 76, cy: 128, r: 15, fill: '#22D3EE', opacity: 0.62 },
  { cx: 76, cy: 184, r: 17, fill: '#22D3EE', opacity: 0.74 },
  { cx: 130, cy: 100, r: 19, fill: '#60A5FA', opacity: 0.86 },
  { cx: 130, cy: 156, r: 21, fill: '#60A5FA', opacity: 0.94 },
  { cx: 184, cy: 128, r: 26, fill: '#FBBF24', opacity: 1 },
] as const;

/** How long the opening stands before it goes by itself. */
const OPENING_MS = 1500;
/** How long it takes to go. */
const LEAVING_MS = 250;

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The opening (1.3, ADR-035): once per launch, the mark's points light one
 * after another up to the amber one — a profile's steps running into Run —
 * and the greeting comes up beside it. About a second and a half, then it
 * goes. A click or any key ends it at once. Under reduced motion there is no
 * opening at all: the window opens on Home.
 *
 * It covers the content, not the title bar — the window can be moved and
 * closed while it stands. It is a curtain, not a screen: it is hidden from assistive technology, and
 * nothing behind it waits for it.
 */
export function Opening({ language }: { language: ManualLanguage }) {
  const [phase, setPhase] = useState<'shown' | 'leaving' | 'gone'>(() =>
    reducedMotion() ? 'gone' : 'shown',
  );

  useEffect(() => {
    if (phase === 'gone') return;
    if (phase === 'leaving') {
      const timer = window.setTimeout(() => setPhase('gone'), LEAVING_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setPhase('leaving'), OPENING_MS);
    const skip = () => setPhase('leaving');
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', skip);
    };
  }, [phase]);

  if (phase === 'gone') return null;
  return (
    <div
      aria-hidden="true"
      data-opening={phase}
      className="ds-opening absolute inset-0 z-40 flex items-center justify-center gap-5 bg-layer"
      onClick={() => setPhase('leaving')}
    >
      <svg viewBox="0 0 256 256" width="96" height="96">
        <path
          d="M0 128C0 22.6 22.6 0 128 0S256 22.6 256 128 233.4 256 128 256 0 233.4 0 128Z"
          fill="#0B1220"
        />
        {POINTS.map((point, i) => (
          <circle
            key={i}
            className="ds-opening-point"
            cx={point.cx}
            cy={point.cy}
            r={point.r}
            fill={point.fill}
            fillOpacity={point.opacity}
            style={{ animationDelay: `${150 + i * 120}ms` }}
          />
        ))}
      </svg>
      <div className="ds-opening-words flex flex-col gap-1">
        <span className="text-title font-semibold text-fg">
          {GUIDE_TEXT[language].home.greeting(new Date().getHours())}
        </span>
        <span className="text-body text-fg-secondary">Deskstart</span>
      </div>
    </div>
  );
}

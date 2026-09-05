import type { ReactNode } from 'react';

/**
 * A small labelled token: an option, a tag, a state.
 *
 * `tone` names a semantic token rather than a colour, so a chip cannot
 * introduce a shade the design system does not own. An unknown tone falls back
 * to neutral instead of rendering an invalid class.
 */
import type { ChipTone } from './chipTone';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-card-hover text-fg-secondary border-stroke-subtle',
  info: 'bg-info-subtle text-info border-info/30',
  success: 'bg-success-subtle text-success border-success/30',
  caution: 'bg-caution-subtle text-caution border-caution/30',
  danger: 'bg-danger-subtle text-danger border-danger/30',
  accent: 'bg-accent-subtle text-accent border-accent/30',
};

export function Chip({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={[
        'inline-flex max-w-full items-center gap-1 truncate rounded-sm border px-1.5 py-0.5',
        'text-caption font-semibold',
        TONE[tone],
      ].join(' ')}
    >
      {children}
    </span>
  );
}

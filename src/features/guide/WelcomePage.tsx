import {
  ArrowRight20Regular,
  Desktop20Regular,
  LockClosed20Regular,
  Play20Regular,
  WindowMultiple20Regular,
} from '@fluentui/react-icons';

import mark from '@/assets/mark.svg';
import { MANUAL_LANGUAGE_LABELS, MANUAL_LANGUAGES, type ManualLanguage } from '@/domain/settings';
import { Button } from '@/ui/Button';
import { ChoiceGroup } from '@/ui/ChoiceGroup';

import { GUIDE_TEXT } from './content';

const POINT_ICONS = [
  <Play20Regular key="p" />,
  <Desktop20Regular key="d" />,
  <LockClosed20Regular key="l" />,
];

/**
 * The first thing a new workspace shows (1.2, ADR-032): what Deskstart is, in
 * three promises, and three ways in — the tour, capturing the desktop, or an
 * empty profile. Any of them, or Skip, marks the welcome seen; Help brings it
 * back. It speaks the manual's language, which can be chosen right here.
 */
export function WelcomePage({
  language,
  onLanguage,
  onTour,
  onCapture,
  onEmpty,
}: {
  language: ManualLanguage;
  onLanguage: (language: ManualLanguage) => void;
  onTour: () => void;
  onCapture: () => void;
  onEmpty: () => void;
}) {
  const text = GUIDE_TEXT[language].welcome;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-10" data-guide="welcome">
      <div className="flex items-start justify-between gap-4">
        <img
          src={mark}
          alt=""
          width={56}
          height={56}
          className="rounded-xl motion-safe:animate-fade-in"
        />
        <ChoiceGroup
          label="Language"
          options={MANUAL_LANGUAGES}
          value={language}
          onChange={onLanguage}
          labels={MANUAL_LANGUAGE_LABELS}
        />
      </div>

      <header className="flex flex-col gap-3 motion-safe:animate-rise-in">
        <p className="text-body font-semibold text-accent">{text.eyebrow}</p>
        <h1 className="text-display leading-tight font-semibold text-fg">{text.title}</h1>
        <p className="max-w-2xl text-body-lg text-fg-secondary">{text.lead}</p>
      </header>

      <ul className="grid grid-cols-3 gap-3">
        {text.points.map((point, i) => (
          <li
            key={point.title}
            className="flex flex-col gap-2 rounded-xl border border-stroke-subtle bg-card p-4 shadow-card motion-safe:animate-rise-in"
          >
            <span aria-hidden="true" className="text-accent">
              {POINT_ICONS[i]}
            </span>
            <span className="text-body font-semibold text-fg">{point.title}</span>
            <span className="text-caption text-fg-secondary">{point.body}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button appearance="accent" icon={<ArrowRight20Regular />} onClick={onTour} autoFocus>
          {text.tour}
        </Button>
        <Button icon={<WindowMultiple20Regular />} onClick={onCapture}>
          {text.capture}
        </Button>
        <Button appearance="subtle" onClick={onEmpty} data-welcome="empty">
          {text.empty}
        </Button>
      </div>
      <p className="text-caption text-fg-tertiary">{text.privacy}</p>
    </div>
  );
}

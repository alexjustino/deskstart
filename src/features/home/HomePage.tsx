import {
  Add20Regular,
  ArrowImport20Regular,
  Desktop20Regular,
  LockClosed20Regular,
  Navigation20Regular,
  Open20Regular,
  Play20Filled,
  Play20Regular,
  WindowMultiple20Regular,
} from '@fluentui/react-icons';
import { useMemo } from 'react';

import mark from '@/assets/mark.svg';
import { useProfiles, useRuns, useSteps } from '@/data/hooks';
import type { Profile } from '@/data/profiles';
import type { Run } from '@/data/runs';
import { MANUAL_LANGUAGE_LABELS, MANUAL_LANGUAGES, type ManualLanguage } from '@/domain/settings';
import { Button } from '@/ui/Button';
import { ChoiceGroup } from '@/ui/ChoiceGroup';
import { Chip } from '@/ui/Chip';
import { toChipTone } from '@/ui/chipTone';
import { useNow } from '@/ui/useNow';

import { GUIDE_TEXT, type GuideText } from '../guide/content';

const POINT_ICONS = [
  <Play20Regular key="p" />,
  <Desktop20Regular key="d" />,
  <LockClosed20Regular key="l" />,
];

/** The tone of an outcome, the same reading the run log uses. */
const OUTCOME_TONE: Record<string, string> = {
  completed: 'success',
  completed_with_failures: 'caution',
  failed: 'danger',
  stopped: 'neutral',
};

function ProfileCard({
  profile,
  last,
  text,
  onRun,
  onOpen,
}: {
  profile: Profile;
  last: Run | undefined;
  text: GuideText['home'];
  onRun: () => void;
  onOpen: () => void;
}) {
  const steps = useSteps(profile.id);
  // "2 h ago" from a clock that ticks, not from a render that read the time.
  const now = useNow(60_000);
  const count = steps.data?.length ?? null;
  const minutes =
    last === undefined
      ? null
      : Math.max(0, Math.round((Date.parse(now) - Date.parse(last.startedAt)) / 60_000));
  const outcome = last?.outcome ?? null;
  const runnable = !profile.importedUnreviewed && count !== null && count > 0;

  return (
    <li
      className={[
        'flex flex-col gap-3 rounded-xl border border-stroke-subtle bg-card p-4 shadow-card',
        'transition-colors duration-100 ease-easy hover:bg-card-hover motion-safe:animate-rise-in',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body-lg font-semibold text-fg">{profile.name}</p>
          <p className="text-caption text-fg-secondary">
            {count === null ? '…' : text.steps(count)}
          </p>
        </div>
        <span className="flex shrink-0 gap-1">
          {profile.schedule !== null && <Chip tone="info">{text.scheduled}</Chip>}
          {profile.shortcut !== null && <Chip tone="info">{text.shortcut}</Chip>}
        </span>
      </div>
      <p className="flex items-center gap-2 text-caption text-fg-secondary">
        {last === undefined || minutes === null ? (
          text.notRun
        ) : (
          <>
            <Chip tone={toChipTone(OUTCOME_TONE[outcome ?? ''] ?? 'neutral')}>
              {text.outcomes[outcome ?? ''] ?? '…'}
            </Chip>
            <span>{text.lastRun(text.ago(minutes))}</span>
          </>
        )}
      </p>
      <div className="flex gap-2">
        {profile.importedUnreviewed ? (
          <Button onClick={onOpen}>{text.blocked}</Button>
        ) : (
          <>
            <Button
              appearance="accent"
              icon={<Play20Filled />}
              onClick={onRun}
              disabled={!runnable}
              aria-label={`${text.run} ${profile.name}`}
            >
              {text.run}
            </Button>
            <Button
              icon={<Open20Regular />}
              onClick={onOpen}
              aria-label={`${text.open} ${profile.name}`}
            >
              {text.open}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Home (1.3): where Deskstart opens, every time.
 *
 * With no profile yet it is the welcome — what Deskstart does, and the ways
 * in. With profiles, it is the product's promise on one screen: each profile
 * one click from Run, with when it last ran and how. 1.2's welcome showed once
 * and was gone; a person who left it had no start to come back to (UAT).
 */
export function HomePage({
  language,
  onLanguage,
  onRun,
  onOpen,
  onNewProfile,
  onCapture,
  onImport,
  onTour,
}: {
  language: ManualLanguage;
  onLanguage: (language: ManualLanguage) => void;
  onRun: (profileId: string) => void;
  onOpen: (profileId: string) => void;
  onNewProfile: () => void;
  onCapture: () => void;
  onImport: () => void;
  onTour: () => void;
}) {
  const guide = GUIDE_TEXT[language];
  const text = guide.home;
  const welcome = guide.welcome;
  const profiles = useProfiles();
  const runs = useRuns(null);
  const list = profiles.data ?? [];
  const lastByProfile = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of runs.data ?? []) {
      if (run.profileId === null || run.mode !== 'real') continue;
      const known = map.get(run.profileId);
      if (known === undefined || known.startedAt < run.startedAt) map.set(run.profileId, run);
    }
    return map;
  }, [runs.data]);
  const empty = profiles.data !== undefined && list.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8" data-guide="home">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src={mark} alt="" width={48} height={48} className="motion-safe:animate-fade-in" />
          <div>
            <p className="text-body font-semibold text-accent">
              {empty ? welcome.eyebrow : text.greeting(new Date().getHours())}
            </p>
            <h1 className="text-title font-semibold text-fg">{welcome.title}</h1>
          </div>
        </div>
        <ChoiceGroup
          label="Language"
          options={MANUAL_LANGUAGES}
          value={language}
          onChange={onLanguage}
          labels={MANUAL_LANGUAGE_LABELS}
        />
      </div>

      {empty ? (
        <>
          <p className="max-w-2xl text-body-lg text-fg-secondary motion-safe:animate-rise-in">
            {welcome.lead}
          </p>
          <ul className="grid grid-cols-3 gap-3">
            {welcome.points.map((point, i) => (
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
            <Button
              appearance="accent"
              icon={<Add20Regular />}
              onClick={onNewProfile}
              data-home="new"
            >
              {text.first}
            </Button>
            <Button icon={<WindowMultiple20Regular />} onClick={onCapture}>
              {welcome.capture}
            </Button>
            <Button icon={<ArrowImport20Regular />} onClick={onImport}>
              {text.importProfile}
            </Button>
            <Button appearance="subtle" icon={<Navigation20Regular />} onClick={onTour}>
              {welcome.tour}
            </Button>
          </div>
          <p className="text-caption text-fg-tertiary">{welcome.points[2]?.body}</p>
        </>
      ) : (
        <>
          <section className="flex flex-col gap-3" aria-label={text.yours}>
            <h2 className="text-subtitle font-semibold text-fg">{text.yours}</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
              {list.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  last={lastByProfile.get(profile.id)}
                  text={text}
                  onRun={() => onRun(profile.id)}
                  onOpen={() => onOpen(profile.id)}
                />
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Add20Regular />} onClick={onNewProfile} data-home="new">
              {text.newProfile}
            </Button>
            <Button icon={<WindowMultiple20Regular />} onClick={onCapture}>
              {welcome.capture}
            </Button>
            <Button icon={<ArrowImport20Regular />} onClick={onImport}>
              {text.importProfile}
            </Button>
            <Button appearance="subtle" icon={<Navigation20Regular />} onClick={onTour}>
              {welcome.tour}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

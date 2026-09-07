import { Checkmark20Regular, Delete20Regular } from '@fluentui/react-icons';
import { useState } from 'react';

import { describeError } from '@/data/errors';
import { useAcceptProfile, useAcceptStep, useDeleteStep } from '@/data/hooks';
import type { Profile, StoredStep } from '@/data/profiles';
import { resolveStep, stepTitle, type Step } from '@/domain/profile';
import { describeWaitFor } from '@/domain/readiness';
import type { ReviewState } from '@/domain/review';
import { describeTiming } from '@/domain/timing';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { IconButton } from '@/ui/IconButton';
import { InfoBar } from '@/ui/InfoBar';
import { announce } from '@/ui/announce';

import { HOW_IT_OPENS, KIND_LABELS } from './kinds';

/**
 * The review screen: what an imported profile would do, before it may do it.
 *
 * Every step is shown the way the run will read it — the path resolved and
 * absolute, each argument on its own line, and the plain sentence for what
 * actually starts it. Nothing here is a summary: a step that resolves to
 * somewhere unexpected is unexpected on this screen too, which is the whole
 * point of putting a person between a file and a Run button.
 *
 * Accepting is per step. Accepting everything at once is offered, and says in
 * words what it means, because a profile of forty steps otherwise trains people
 * to click forty times without reading.
 */
export function ReviewSteps({
  profile,
  steps,
  env,
  review,
}: {
  profile: Profile;
  steps: StoredStep[];
  env: Readonly<Record<string, string>>;
  review: ReviewState;
}) {
  const accept = useAcceptStep();
  const acceptAll = useAcceptProfile();
  const remove = useDeleteStep();
  const [confirmAll, setConfirmAll] = useState(false);
  const pending = accept.isPending || acceptAll.isPending || remove.isPending;

  return (
    <Card
      title="Review before running"
      description="This profile came from a file. Nothing in it starts until you have accepted every step."
    >
      {(accept.isError || acceptAll.isError || remove.isError) && (
        <InfoBar severity="danger" title="That did not go through">
          {describeError(accept.error ?? acceptAll.error ?? remove.error)}
        </InfoBar>
      )}

      <ol aria-label="Steps to review" className="mb-4 flex flex-col gap-2">
        {steps.map((stored, index) => (
          <ReviewRow
            key={stored.readable ? stored.step.id : stored.id}
            stored={stored}
            index={index}
            env={env}
            steps={steps}
            pending={pending}
            onAccept={(id) =>
              accept.mutate(
                { id, profileId: profile.id },
                { onSuccess: () => announce(`Accepted step ${index + 1}`) },
              )
            }
            onRemove={(id) => remove.mutate({ id, profileId: profile.id })}
          />
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-fg-secondary">
          {review.accepted} of {review.total} accepted.
        </p>
        <Button
          appearance="accent"
          icon={<Checkmark20Regular />}
          disabled={pending}
          onClick={() => setConfirmAll(true)}
        >
          {review.total === 0
            ? 'Accept this profile'
            : `Accept all ${review.total} ${review.total === 1 ? 'step' : 'steps'}`}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmAll}
        title="Accept every step?"
        confirmLabel="Accept them all"
        pending={acceptAll.isPending}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() =>
          acceptAll.mutate(profile.id, {
            onSuccess: () => {
              setConfirmAll(false);
              announce(`Accepted every step of ${profile.name}; it can be run now`);
            },
          })
        }
      >
        Every step above may then start on this machine, with your account&rsquo;s rights, when you
        press Run — the programs, the folders, the files and the pages, exactly as they are shown.
        You can still delete any step afterwards.
      </ConfirmDialog>
    </Card>
  );
}

function ReviewRow({
  stored,
  index,
  env,
  steps,
  pending,
  onAccept,
  onRemove,
}: {
  stored: StoredStep;
  index: number;
  env: Readonly<Record<string, string>>;
  steps: StoredStep[];
  pending: boolean;
  onAccept: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const id = stored.readable ? stored.step.id : stored.id;
  const reviewed = stored.readable ? stored.step.reviewed : stored.reviewed;

  return (
    <li
      className={[
        'rounded-md border p-3',
        reviewed ? 'border-stroke-subtle bg-card' : 'border-caution/30 bg-caution-subtle',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-caption text-fg-tertiary">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          {stored.readable ? (
            <ReviewDetail step={stored.step} env={env} steps={steps} />
          ) : (
            <p className="text-body text-danger">
              This step could not be read, so it will not run:{' '}
              {stored.problems.map((p) => p.problem).join('; ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reviewed ? (
            <Chip tone="success">Accepted</Chip>
          ) : (
            <Button
              icon={<Checkmark20Regular />}
              disabled={pending}
              onClick={() => onAccept(id)}
              aria-label={`Accept step ${index + 1}`}
            >
              Accept
            </Button>
          )}
          <IconButton
            label={`Remove step ${index + 1}`}
            icon={<Delete20Regular />}
            disabled={pending}
            onClick={() => onRemove(id)}
          />
        </div>
      </div>
    </li>
  );
}

/** One step, as the run will read it. */
function ReviewDetail({
  step,
  env,
  steps,
}: {
  step: Step;
  env: Readonly<Record<string, string>>;
  steps: StoredStep[];
}) {
  const resolved = resolveStep(step.config, env);
  const awaited = steps.find((s) => s.readable && s.step.id === step.waitFor?.stepId);
  const waits = describeWaitFor(
    step.waitFor,
    awaited?.readable === true ? stepTitle(awaited.step.config) : null,
  );
  const timing = describeTiming(step.timing);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-fg">
        {stepTitle(step.config)}
        <span className="ml-2 text-caption text-fg-tertiary">{KIND_LABELS[step.config.kind]}</span>
      </p>

      {resolved.ok ? (
        <p data-selectable className="break-all font-mono text-caption text-fg-secondary">
          {resolved.launch.kind === 'url' ? resolved.launch.url : targetOf(resolved.launch)}
          {resolved.launch.source !== null && (
            <span className="text-fg-tertiary"> (written as {resolved.launch.source})</span>
          )}
        </p>
      ) : (
        <p className="text-caption text-danger">
          This step does not resolve on this machine, so it will not run:{' '}
          {resolved.problems.map((p) => p.problem).join('; ')}
        </p>
      )}

      {step.config.kind === 'app' && step.config.args.length > 0 && (
        <div>
          <p className="text-caption text-fg-tertiary">
            {step.config.args.length === 1 ? '1 argument' : `${step.config.args.length} arguments`},
            each passed as one:
          </p>
          <ol className="mt-0.5 flex flex-col gap-0.5">
            {step.config.args.map((argument, at) => (
              <li
                key={at}
                data-selectable
                className="break-all rounded bg-card-hover px-1.5 py-0.5 font-mono text-caption text-fg-secondary"
              >
                {argument}
              </li>
            ))}
          </ol>
        </div>
      )}

      {step.config.kind === 'app' && step.config.workingDir !== null && (
        <p data-selectable className="break-all font-mono text-caption text-fg-tertiary">
          runs in {step.config.workingDir}
        </p>
      )}

      <p className="text-caption text-fg-secondary">{HOW_IT_OPENS[step.config.kind]}</p>
      {waits !== null && <p className="text-caption text-fg-secondary">{waits}</p>}
      {timing !== null && <p className="text-caption text-fg-secondary">{timing}</p>}
    </div>
  );
}

/** The absolute thing the host is handed, whatever kind of step it is. */
function targetOf(launch: { kind: string; path?: string; program?: string }): string {
  return launch.program ?? launch.path ?? '';
}

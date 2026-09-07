import {
  Add20Regular,
  Apps20Regular,
  ArrowImport20Regular,
  ArrowDown20Regular,
  ArrowUp20Regular,
  Delete20Regular,
  Document20Regular,
  DocumentSearch20Regular,
  Edit20Regular,
  Folder20Regular,
  Globe20Regular,
  Play20Regular,
  PlayCircle20Regular,
  Share20Regular,
  Stop20Regular,
} from '@fluentui/react-icons';
import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { describeError } from '@/data/errors';
import {
  useAddStep,
  useCreateProfile,
  useDeleteProfile,
  useDeleteStep,
  useEnvironment,
  useEvents,
  useExecuteProfile,
  useMonitors,
  useMoveStep,
  useProfiles,
  useRuns,
  useSteps,
  useUpdateStep,
} from '@/data/hooks';
import type { Profile, StoredStep } from '@/data/profiles';
import {
  resolveStep,
  stepTitle,
  type Problem,
  type Step,
  type StepConfig,
  type StepKind,
} from '@/domain/profile';
import type { Mode } from '@/domain/run';
import { describePlacement } from '@/domain/placement';
import { describeWaitFor, waitForProblems } from '@/domain/readiness';
import { reviewState } from '@/domain/review';
import { describeTiming } from '@/domain/timing';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { InfoBar } from '@/ui/InfoBar';
import { Input } from '@/ui/Input';
import { announce } from '@/ui/announce';

import { LogLines, RunHeading } from '../runs/LogLines';
import { ExportProfile } from './ExportProfile';
import { ImportProfile } from './ImportProfile';
import { ReviewSteps } from './ReviewSteps';
import { KIND_LABELS } from './kinds';
import { StepForm, type EarlierStep, type Screen } from './StepForm';

/**
 * Profiles: the list on the left, the selected profile on the right, and the
 * button that runs it.
 *
 * The latest run's log sits under the steps because that is the product's
 * claim in one screen: press Run, watch the lines appear, read what happened.
 */
export function ProfilesPage() {
  const profiles = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The selection is derived, not synchronised: a profile chosen earlier
  // stays chosen while it exists, and the first one stands in otherwise.
  const list = profiles.data ?? [];
  const selected =
    (selectedId !== null ? list.find((p) => p.id === selectedId) : undefined) ?? list[0] ?? null;

  return (
    <div className="flex h-full">
      <ProfileList profiles={list} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      <section className="min-w-0 flex-1 overflow-y-auto">
        {profiles.isError && (
          <div className="p-6">
            <InfoBar severity="danger" title="The profiles could not be read">
              {describeError(profiles.error)}
            </InfoBar>
          </div>
        )}
        {profiles.data && profiles.data.length === 0 && (
          <EmptyState
            icon={<PlayCircle20Regular />}
            title="No profiles yet"
            description="A profile is the set of things you open to start working. Name one on the left, then add what it should open."
          />
        )}
        {selected && <ProfileDetail key={selected.id} profile={selected} />}
      </section>
    </div>
  );
}

function ProfileList({
  profiles,
  selectedId,
  onSelect,
}: {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const create = useCreateProfile();
  const [name, setName] = useState('');
  const [importing, setImporting] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    create.mutate(trimmed, {
      onSuccess: (profile) => {
        setName('');
        onSelect(profile.id);
        announce(`Added profile ${profile.name}`);
      },
    });
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-stroke-subtle bg-layer-alt">
      <form onSubmit={submit} className="flex gap-2 p-3">
        <Input
          aria-label="New profile name"
          placeholder="New profile"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={create.isPending}
        />
        <IconButton
          type="submit"
          label="Add profile"
          icon={<Add20Regular />}
          disabled={create.isPending || name.trim() === ''}
        />
      </form>
      {create.isError && (
        <div className="px-3 pb-3">
          <InfoBar severity="danger" title="The profile was not added">
            {describeError(create.error)}
          </InfoBar>
        </div>
      )}
      <div className="px-3 pb-3">
        <Button
          className="w-full"
          icon={<ArrowImport20Regular />}
          onClick={() => setImporting(true)}
        >
          Import a profile
        </Button>
      </div>
      <ImportProfile
        open={importing}
        onClose={() => setImporting(false)}
        onImported={(profile) => onSelect(profile.id)}
      />
      <nav aria-label="Profiles" className="flex flex-col gap-0.5 px-2">
        {profiles.map((profile) => {
          const current = profile.id === selectedId;
          return (
            <button
              key={profile.id}
              type="button"
              aria-current={current ? 'true' : undefined}
              onClick={() => onSelect(profile.id)}
              className={[
                'flex h-(--density-row) items-center rounded-md px-3 text-left text-body',
                'transition-colors duration-100 ease-easy hover:bg-card-hover',
                current ? 'bg-accent-subtle font-semibold text-fg' : 'text-fg-secondary',
              ].join(' ')}
            >
              <span className="truncate">{profile.name}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/** A stored step with what the domain makes of it against this machine's environment. */
interface Judged {
  stored: StoredStep;
  step: Step | null;
  problems: Problem[];
}

function ProfileDetail({ profile }: { profile: Profile }) {
  const steps = useSteps(profile.id);
  const environment = useEnvironment();
  const screens = useMonitors();
  const runs = useRuns(profile.id);
  const execute = useExecuteProfile();
  const remove = useDeleteProfile();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const env = useMemo(() => environment.data ?? {}, [environment.data]);

  // Every step judged once: readable, and resolvable here. Both are shown on
  // the row, and either blocks Run — a profile never runs with a step the
  // person cannot see for what it is.
  const judged: Judged[] = useMemo(() => {
    const stored = steps.data ?? [];
    // What every step waits for is judged against the profile as it is now: a
    // step that waits for one that was deleted, or moved after it, says so.
    const waiters = stored.map((s) => ({
      id: s.readable ? s.step.id : s.id,
      waitFor: s.readable ? s.step.waitFor : null,
    }));
    return stored.map((entry, index) => {
      if (!entry.readable) return { stored: entry, step: null, problems: entry.problems };
      const resolved = resolveStep(entry.step.config, env);
      return {
        stored: entry,
        step: entry.step,
        problems: [...(resolved.ok ? [] : resolved.problems), ...waitForProblems(waiters, index)],
      };
    });
  }, [steps.data, env]);
  const runnable = judged.filter((j): j is Judged & { step: Step } => j.step !== null);
  const blocked = judged.filter((j) => j.problems.length > 0).length;

  // Where this profile stands with review (ADR-013). While it is blocked the
  // screen shows what the profile would do instead of how to edit it, and the
  // loop refuses the run even if something reached it another way.
  const review = useMemo(
    () =>
      reviewState(
        profile,
        (steps.data ?? []).map((entry) =>
          entry.readable
            ? { id: entry.step.id, reviewed: entry.step.reviewed }
            : { id: entry.id, reviewed: entry.reviewed },
        ),
      ),
    [profile, steps.data],
  );

  // The log on screen is the run in progress, or else the newest one.
  const shownRunId = activeRunId ?? runs.data?.[0]?.id ?? null;
  const shownRun = runs.data?.find((r) => r.id === shownRunId) ?? null;
  const events = useEvents(shownRunId);

  const start = useCallback(
    (mode: Mode) => {
      setActiveRunId(null);
      execute.mutate(
        {
          profile,
          steps: runnable.map((j) => j.step),
          mode,
          env,
          onBegin: (run) => setActiveRunId(run.id),
        },
        {
          onSuccess: ({ run }) => {
            setActiveRunId(run.id);
            announce(
              `${mode === 'dry' ? 'Dry run' : 'Run'} finished: ${run.outcome ?? 'no outcome'}`,
            );
          },
        },
      );
    },
    [execute, profile, runnable, env],
  );

  const canRun =
    runnable.length > 0 &&
    blocked === 0 &&
    !review.blocked &&
    !execute.isPending &&
    environment.data !== undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-fg">{profile.name}</h1>
          <p className="mt-1 text-body text-fg-secondary">
            {judged.length === 0
              ? 'No steps yet.'
              : `${judged.length} ${judged.length === 1 ? 'step' : 'steps'}, in this order.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            appearance="accent"
            icon={<Play20Regular />}
            onClick={() => start('real')}
            disabled={!canRun}
          >
            {execute.isPending ? 'Running…' : 'Run'}
          </Button>
          <Button
            icon={<DocumentSearch20Regular />}
            onClick={() => start('dry')}
            disabled={!canRun}
            title="Write what would happen without starting anything"
          >
            Dry run
          </Button>
          {execute.isPending && (
            <Button
              icon={<Stop20Regular />}
              onClick={() => execute.stop()}
              className="bg-danger-subtle text-danger border-danger/30 hover:bg-danger-subtle"
              title="Close what this run opened, and only that"
            >
              Stop
            </Button>
          )}
          <Button
            icon={<Share20Regular />}
            onClick={() => setExporting(true)}
            disabled={execute.isPending}
            title="Write this profile as a file"
          >
            Export
          </Button>
          <IconButton
            label="Delete profile"
            icon={<Delete20Regular />}
            onClick={() => setConfirmDelete(true)}
            disabled={execute.isPending}
          />
        </div>
      </header>

      {execute.isError && (
        <InfoBar severity="danger" title="The run could not be started">
          {describeError(execute.error)}
        </InfoBar>
      )}
      {environment.isError && (
        <InfoBar severity="danger" title="The environment could not be read">
          {describeError(environment.error)} Paths with %NAMES% cannot be resolved until it can.
        </InfoBar>
      )}
      {review.blocked && (
        <InfoBar severity="caution" title="This profile has not been reviewed">
          It came from a file, and {review.reason}. Read each step below and accept it; until then
          nothing here starts.
        </InfoBar>
      )}
      {blocked > 0 && (
        <InfoBar severity="danger" title="A step cannot run on this machine">
          {blocked === 1 ? 'One step has' : `${blocked} steps have`} a problem shown below. Fix or
          remove {blocked === 1 ? 'it' : 'them'} before running.
        </InfoBar>
      )}

      {review.blocked ? (
        <ReviewSteps profile={profile} steps={steps.data ?? []} env={env} review={review} />
      ) : (
        <Card title="Steps" description="What this profile opens, in this order.">
          <StepList
            profileId={profile.id}
            judged={judged}
            env={env}
            screens={screens.data ?? []}
            busy={execute.isPending}
          />
          <AddStep
            profileId={profile.id}
            env={env}
            earlier={titlesOf(judged, env)}
            screens={screens.data ?? []}
          />
        </Card>
      )}

      <Card
        title={activeRunId !== null && execute.isPending ? 'Run in progress' : 'Latest run'}
        description="Every line was written to the log before it reached this screen."
      >
        {shownRun ? (
          <div className="flex flex-col gap-3">
            <RunHeading run={shownRun} />
            <LogLines lines={events.data ?? []} />
          </div>
        ) : (
          <p className="text-body text-fg-tertiary">This profile has not run yet.</p>
        )}
      </Card>

      <ExportProfile
        open={exporting}
        profile={profile}
        steps={runnable.map((j) => j.step)}
        omitted={judged.length - runnable.length}
        onClose={() => setExporting(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${profile.name}?`}
        confirmLabel="Delete profile"
        danger
        pending={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(profile.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              announce(`Deleted profile ${profile.name}`);
            },
          })
        }
      >
        The profile and its steps are removed. Runs it made stay in the log, under its name.
      </ConfirmDialog>
    </div>
  );
}

const KIND_ICONS: Record<StepKind, ReactNode> = {
  app: <Apps20Regular />,
  folder: <Folder20Regular />,
  file: <Document20Regular />,
  url: <Globe20Regular />,
};

/** What a person calls the step, judged after expansion: the folder's real name, not `%USERPROFILE%`. */
function titleOf(config: StepConfig, env: Readonly<Record<string, string>>): string {
  const resolved = resolveStep(config, env);
  if (!resolved.ok) return stepTitle(config);
  switch (resolved.launch.kind) {
    case 'app':
      return stepTitle({ ...config, kind: 'app', program: resolved.launch.program } as StepConfig);
    case 'folder':
    case 'file':
      return stepTitle({ kind: resolved.launch.kind, path: resolved.launch.path });
    case 'url':
      return stepTitle(config);
  }
}

/** What the row says under the title: the path as written, and what it became. */
function summary(config: StepConfig, env: Readonly<Record<string, string>>): string {
  const resolved = resolveStep(config, env);
  const written = (() => {
    switch (config.kind) {
      case 'app':
        return `${config.program}${config.args.length > 0 ? ` · ${config.args.length} ${config.args.length === 1 ? 'argument' : 'arguments'}` : ''}${config.workingDir ? ` · in ${config.workingDir}` : ''}`;
      case 'folder':
      case 'file':
        return config.path;
      case 'url':
        return config.url;
    }
  })();
  if (!resolved.ok) return written;
  const target = (() => {
    switch (resolved.launch.kind) {
      case 'app':
        return resolved.launch.program;
      case 'folder':
      case 'file':
        return resolved.launch.path;
      case 'url':
        return resolved.launch.url;
    }
  })();
  const source = resolved.launch.source;
  return source !== null ? `${written} → ${target}` : written;
}

/** What each readable step is called, in order: the "waits for" list. */
function titlesOf(judged: Judged[], env: Readonly<Record<string, string>>): EarlierStep[] {
  return judged
    .filter((j): j is Judged & { step: Step } => j.step !== null)
    .map((j) => ({ id: j.step.id, title: titleOf(j.step.config, env) }));
}

function StepList({
  profileId,
  judged,
  env,
  screens,
  busy,
}: {
  profileId: string;
  judged: Judged[];
  env: Readonly<Record<string, string>>;
  screens: readonly Screen[];
  busy: boolean;
}) {
  const remove = useDeleteStep();
  const move = useMoveStep();
  const update = useUpdateStep();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (judged.length === 0) {
    return <p className="mb-3 text-body text-fg-tertiary">Add the first step below.</p>;
  }
  const pending = busy || remove.isPending || move.isPending || update.isPending;

  return (
    <ol aria-label="Steps" className="mb-4 flex flex-col gap-1">
      {judged.map(({ stored, step, problems }, index) => {
        const id = stored.readable ? stored.step.id : stored.id;
        const editing = step !== null && editingId === id;
        return (
          <li key={id} className="rounded-md px-2 py-1 hover:bg-card-hover">
            <div className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-right font-mono text-caption text-fg-tertiary">
                {index + 1}
              </span>
              <span aria-hidden="true" className="shrink-0 text-fg-tertiary">
                {step ? KIND_ICONS[step.config.kind] : <Document20Regular />}
              </span>
              {step ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-fg">
                    {titleOf(step.config, env)}
                    <span className="ml-2 text-caption text-fg-tertiary">
                      {KIND_LABELS[step.config.kind]}
                    </span>
                  </span>
                  <span
                    data-selectable
                    title={summary(step.config, env)}
                    className="block truncate font-mono text-caption text-fg-tertiary"
                  >
                    {summary(step.config, env)}
                  </span>
                  {describeWaitFor(
                    step.waitFor,
                    judged.find((j) => j.step?.id === step.waitFor?.stepId)?.step
                      ? titleOf(
                          judged.find((j) => j.step?.id === step.waitFor?.stepId)!.step!.config,
                          env,
                        )
                      : null,
                  ) && (
                    <span className="block text-caption text-fg-secondary">
                      {describeWaitFor(
                        step.waitFor,
                        judged.find((j) => j.step?.id === step.waitFor?.stepId)?.step
                          ? titleOf(
                              judged.find((j) => j.step?.id === step.waitFor?.stepId)!.step!.config,
                              env,
                            )
                          : null,
                      )}
                    </span>
                  )}
                  {describeTiming(step.timing) && (
                    <span className="block text-caption text-fg-secondary">
                      {describeTiming(step.timing)}
                    </span>
                  )}
                  {describePlacement(step.placement) && (
                    <span className="block text-caption text-fg-secondary">
                      {describePlacement(step.placement)}
                    </span>
                  )}
                  {problems.length > 0 && (
                    <span className="block text-caption text-danger">
                      {problems.map((p) => p.problem).join('; ')}
                    </span>
                  )}
                </span>
              ) : (
                <span className="min-w-0 flex-1 text-body text-danger">
                  This step could not be read: {problems.map((p) => p.problem).join('; ')}
                </span>
              )}
              <IconButton
                label={`Move step ${index + 1} up`}
                icon={<ArrowUp20Regular />}
                disabled={pending || index === 0}
                onClick={() => move.mutate({ id, profileId, direction: -1 })}
              />
              <IconButton
                label={`Move step ${index + 1} down`}
                icon={<ArrowDown20Regular />}
                disabled={pending || index === judged.length - 1}
                onClick={() => move.mutate({ id, profileId, direction: 1 })}
              />
              {step && (
                <IconButton
                  label={`Edit step ${index + 1}`}
                  icon={<Edit20Regular />}
                  selected={editing}
                  disabled={pending}
                  onClick={() => setEditingId(editing ? null : id)}
                />
              )}
              <IconButton
                label={`Remove step ${index + 1}`}
                icon={<Delete20Regular />}
                disabled={pending}
                onClick={() => remove.mutate({ id, profileId })}
              />
            </div>
            {editing && (
              <div className="pb-2 pl-9">
                <StepForm
                  key={id}
                  initial={{
                    config: step.config,
                    timing: step.timing,
                    waitFor: step.waitFor,
                    placement: step.placement,
                  }}
                  earlier={titlesOf(judged.slice(0, index), env)}
                  screens={screens}
                  env={env}
                  pending={update.isPending}
                  hostError={update.isError ? describeError(update.error) : null}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(config, timing, waitFor, placement) =>
                    update.mutate(
                      { id, profileId, config, timing, waitFor, placement },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          announce(`Changed step ${index + 1}`);
                        },
                      },
                    )
                  }
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AddStep({
  profileId,
  env,
  earlier,
  screens,
}: {
  profileId: string;
  env: Readonly<Record<string, string>>;
  earlier: readonly EarlierStep[];
  screens: readonly Screen[];
}) {
  const add = useAddStep();
  // A new key after every success gives the form a clean slate.
  const [generation, setGeneration] = useState(0);
  return (
    <StepForm
      key={generation}
      initial={null}
      earlier={earlier}
      screens={screens}
      env={env}
      pending={add.isPending}
      hostError={add.isError ? describeError(add.error) : null}
      onSubmit={(config, timing, waitFor, placement) =>
        add.mutate(
          { profileId, config, timing, waitFor, placement },
          {
            onSuccess: () => {
              setGeneration((g) => g + 1);
              announce(`Added ${stepTitle(config)}`);
            },
          },
        )
      }
    />
  );
}

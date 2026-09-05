import {
  Add20Regular,
  Delete20Regular,
  DocumentSearch20Regular,
  Play20Regular,
  PlayCircle20Regular,
} from '@fluentui/react-icons';
import { useCallback, useMemo, useState, type FormEvent } from 'react';

import { describeError } from '@/data/errors';
import {
  useAddStep,
  useCreateProfile,
  useDeleteProfile,
  useDeleteStep,
  useEvents,
  useExecuteProfile,
  useProfiles,
  useRuns,
  useSteps,
} from '@/data/hooks';
import type { Profile, StoredStep } from '@/data/profiles';
import { resolvePath } from '@/domain/profile';
import type { Mode } from '@/domain/run';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { InfoBar } from '@/ui/InfoBar';
import { Input } from '@/ui/Input';
import { announce } from '@/ui/announce';

import { baseName } from '../runs/describe';
import { LogLines, RunHeading } from '../runs/LogLines';

/**
 * Profiles: the list on the left, the selected profile on the right, and the
 * button that runs it.
 *
 * The latest run's log sits under the steps because that is the product's
 * claim in one screen: press Run, watch the lines appear, read the PID.
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
            description="A profile is the set of things you open to start working. Name one on the left, then add the programs it should start."
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

function ProfileDetail({ profile }: { profile: Profile }) {
  const steps = useSteps(profile.id);
  const runs = useRuns(profile.id);
  const execute = useExecuteProfile();
  const remove = useDeleteProfile();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const readable = useMemo(
    () => (steps.data ?? []).filter((s): s is StoredStep & { readable: true } => s.readable),
    [steps.data],
  );
  const unreadable = (steps.data ?? []).length - readable.length;

  // The log on screen is the run in progress, or else the newest one.
  const shownRunId = activeRunId ?? runs.data?.[0]?.id ?? null;
  const shownRun = runs.data?.find((r) => r.id === shownRunId) ?? null;
  const events = useEvents(shownRunId);

  const start = useCallback(
    (mode: Mode) => {
      setActiveRunId(null);
      execute.mutate(
        {
          profileId: profile.id,
          stepIds: readable.map((s) => s.step.id),
          mode,
          onLine: (line) => setActiveRunId(line.runId),
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
    [execute, profile.id, readable],
  );

  const canRun = readable.length > 0 && unreadable === 0 && !execute.isPending;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-fg">{profile.name}</h1>
          <p className="mt-1 text-body text-fg-secondary">
            {readable.length === 0
              ? 'No steps yet.'
              : `${readable.length} ${readable.length === 1 ? 'step' : 'steps'}, started in order.`}
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
            title="Show what would happen without starting anything"
          >
            Dry run
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
      {unreadable > 0 && (
        <InfoBar severity="danger" title="A step cannot be read">
          This profile has {unreadable} {unreadable === 1 ? 'step' : 'steps'} whose configuration
          could not be read. Remove {unreadable === 1 ? 'it' : 'them'} before running.
        </InfoBar>
      )}

      <Card title="Steps" description="What this profile opens, in this order.">
        <StepList profileId={profile.id} steps={steps.data ?? []} busy={execute.isPending} />
        <AddStepForm profileId={profile.id} />
      </Card>

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

function StepList({
  profileId,
  steps,
  busy,
}: {
  profileId: string;
  steps: StoredStep[];
  busy: boolean;
}) {
  const remove = useDeleteStep();
  if (steps.length === 0) {
    return <p className="mb-3 text-body text-fg-tertiary">Add the first program below.</p>;
  }
  return (
    <ol aria-label="Steps" className="mb-4 flex flex-col gap-1">
      {steps.map((stored, index) => (
        <li
          key={stored.readable ? stored.step.id : stored.id}
          className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-card-hover"
        >
          <span className="w-6 shrink-0 text-right font-mono text-caption text-fg-tertiary">
            {index + 1}
          </span>
          {stored.readable ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-fg">
                {baseName(stored.step.config.program)}
              </span>
              <span
                data-selectable
                className="block truncate font-mono text-caption text-fg-tertiary"
              >
                {stored.step.config.program}
                {stored.step.config.workingDir ? ` — in ${stored.step.config.workingDir}` : ''}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-body text-danger">
              This step could not be read: {stored.problems.map((p) => p.problem).join('; ')}
            </span>
          )}
          <IconButton
            label={`Remove step ${index + 1}`}
            icon={<Delete20Regular />}
            disabled={busy || remove.isPending}
            onClick={() =>
              remove.mutate({ id: stored.readable ? stored.step.id : stored.id, profileId })
            }
          />
        </li>
      ))}
    </ol>
  );
}

function AddStepForm({ profileId }: { profileId: string }) {
  const add = useAddStep();
  const [program, setProgram] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // F0 expands nothing: the host's environment is not read yet, so a path is
    // taken as written and must already be absolute. F1 brings the allow-list.
    const resolvedProgram = resolvePath(program, {});
    if (!resolvedProgram.ok) {
      setProblem(resolvedProgram.problem);
      return;
    }
    let dir: string | null = null;
    if (workingDir.trim() !== '') {
      const resolvedDir = resolvePath(workingDir, {});
      if (!resolvedDir.ok) {
        setProblem(resolvedDir.problem);
        return;
      }
      dir = resolvedDir.path;
    }
    setProblem(null);
    add.mutate(
      {
        profileId,
        config: { kind: 'app', program: resolvedProgram.path, args: [], workingDir: dir },
      },
      {
        onSuccess: () => {
          setProgram('');
          setWorkingDir('');
          announce(`Added ${baseName(resolvedProgram.path)}`);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-stroke-subtle pt-3">
      <p className="text-caption font-semibold text-fg-tertiary uppercase">Add an application</p>
      <Input
        aria-label="Program path"
        placeholder="Absolute path to a program, e.g. C:\Program Files\App\app.exe"
        value={program}
        onChange={(e) => setProgram(e.target.value)}
        disabled={add.isPending}
        spellCheck={false}
      />
      <Input
        aria-label="Working directory (optional)"
        placeholder="Working directory (optional)"
        value={workingDir}
        onChange={(e) => setWorkingDir(e.target.value)}
        disabled={add.isPending}
        spellCheck={false}
      />
      {(problem ?? (add.isError ? describeError(add.error) : null)) && (
        <InfoBar severity="danger" title="The step was not added">
          {problem ?? describeError(add.error)}
        </InfoBar>
      )}
      <div>
        <Button
          type="submit"
          icon={<Add20Regular />}
          disabled={add.isPending || program.trim() === ''}
        >
          Add step
        </Button>
      </div>
    </form>
  );
}

import { Add20Regular, Dismiss20Regular } from '@fluentui/react-icons';
import { useState, type FormEvent } from 'react';

import {
  readStepConfig,
  resolveStep,
  STEP_KINDS,
  type Problem,
  type StepConfig,
  type StepKind,
} from '@/domain/profile';
import { describeTiming, readTiming, type Timing } from '@/domain/timing';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { ChoiceGroup } from '@/ui/ChoiceGroup';
import { IconButton } from '@/ui/IconButton';
import { InfoBar } from '@/ui/InfoBar';
import { Input } from '@/ui/Input';

import { KIND_LABELS } from './kinds';

/**
 * The step editor: one form for adding and for editing, one kind at a time.
 *
 * Arguments are a list, and are edited as a list — one field per argument,
 * added one at a time. Never a text box split on spaces: splitting on spaces
 * is how a shell thinks, and this product deliberately does not (ADR-014).
 *
 * The preview under the form is `resolveStep`, the same function the run
 * uses: what it shows is what the host will be asked to do. Time (F2) is
 * entered in seconds and stored in milliseconds; the sentence under the
 * fields is `describeTiming`, the same one the row shows.
 */

/** What the form holds while it is being edited: strings, nothing decided yet. */
interface Draft {
  kind: StepKind;
  program: string;
  args: string[];
  workingDir: string;
  path: string;
  url: string;
  pauseAfterS: string;
  holdS: string;
  repeat: string;
  closedS: string;
}

const EMPTY: Draft = {
  kind: 'app',
  program: '',
  args: [],
  workingDir: '',
  path: '',
  url: '',
  pauseAfterS: '',
  holdS: '',
  repeat: '1',
  closedS: '',
};

function seconds(ms: number): string {
  return ms === 0 ? '' : String(ms / 1000);
}

function draftOf(initial: { config: StepConfig; timing: Timing } | null): Draft {
  if (initial === null) return EMPTY;
  const { config, timing } = initial;
  const time = {
    pauseAfterS: seconds(timing.pauseAfterMs),
    holdS: timing.holdMs === null ? '' : String(timing.holdMs / 1000),
    repeat: timing.repeat === 'forever' ? 'forever' : String(timing.repeat),
    closedS: seconds(timing.closedMs),
  };
  switch (config.kind) {
    case 'app':
      return {
        ...EMPTY,
        ...time,
        kind: 'app',
        program: config.program,
        args: config.args,
        workingDir: config.workingDir ?? '',
      };
    case 'folder':
    case 'file':
      return { ...EMPTY, ...time, kind: config.kind, path: config.path };
    case 'url':
      return { ...EMPTY, ...time, kind: 'url', url: config.url };
  }
}

/** The draft as a document the domain can read; `readStepConfig` decides if it is one. */
function documentOf(draft: Draft): Record<string, unknown> {
  switch (draft.kind) {
    case 'app':
      return {
        kind: 'app',
        program: draft.program,
        args: draft.args,
        workingDir: draft.workingDir.trim() === '' ? null : draft.workingDir,
      };
    case 'folder':
    case 'file':
      return { kind: draft.kind, path: draft.path };
    case 'url':
      return { kind: 'url', url: draft.url };
  }
}

/** Seconds typed by a person, as whole milliseconds, or a problem. */
function millis(text: string, path: string, what: string): number | Problem {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    return { path, problem: `${what} must be a number of seconds, zero or more` };
  }
  return Math.round(value * 1000);
}

/** The draft's timing as a document; `readTiming` decides if it is one. */
function timingOf(draft: Draft): Record<string, unknown> | Problem[] {
  const problems: Problem[] = [];
  const pauseAfterMs = millis(draft.pauseAfterS, 'timing.pauseAfterMs', 'the pause');
  if (typeof pauseAfterMs !== 'number') problems.push(pauseAfterMs);
  const holdMs = millis(draft.holdS, 'timing.holdMs', 'the hold');
  if (typeof holdMs !== 'number') problems.push(holdMs);
  const closedMs = millis(draft.closedS, 'timing.closedMs', 'the closed time');
  if (typeof closedMs !== 'number') problems.push(closedMs);
  const repeatText = draft.repeat.trim();
  const repeat = repeatText === '' ? 1 : repeatText === 'forever' ? 'forever' : Number(repeatText);
  if (problems.length > 0) return problems;
  return {
    pauseAfterMs,
    holdMs: holdMs === 0 ? null : holdMs,
    repeat,
    closedMs,
  };
}

export function StepForm({
  initial,
  env,
  pending,
  hostError,
  onSubmit,
  onCancel,
}: {
  /** The step being edited, or null to add one. */
  initial: { config: StepConfig; timing: Timing } | null;
  env: Readonly<Record<string, string>>;
  pending: boolean;
  /** What the host answered when the last submit was refused, if anything. */
  hostError: string | null;
  onSubmit: (config: StepConfig, timing: Timing) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [argument, setArgument] = useState('');
  const [problems, setProblems] = useState<Problem[]>([]);

  const editing = initial !== null;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  // The live preview: the step as the domain reads it now, resolved, and its time.
  const read = readStepConfig(documentOf(draft));
  const preview = Array.isArray(read) ? null : resolveStep(read, env);
  const timingDocument = timingOf(draft);
  const timing = Array.isArray(timingDocument) ? timingDocument : readTiming(timingDocument);
  const timingSentence = Array.isArray(timing) ? null : describeTiming(timing);

  const addArgument = () => {
    if (argument === '') return;
    set({ args: [...draft.args, argument] });
    setArgument('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const config = readStepConfig(documentOf(draft));
    if (Array.isArray(config)) {
      setProblems(config);
      return;
    }
    const resolved = resolveStep(config, env);
    if (!resolved.ok) {
      setProblems(resolved.problems);
      return;
    }
    if (Array.isArray(timing)) {
      setProblems(timing);
      return;
    }
    if (config.kind !== 'app' && timing.holdMs !== null) {
      setProblems([
        {
          path: 'timing.holdMs',
          problem: `only an application can be held and closed; a ${KIND_LABELS[config.kind].toLowerCase()} is opened by Windows and is not ours to close`,
        },
      ]);
      return;
    }
    setProblems([]);
    onSubmit(config, timing);
  };

  const target = (() => {
    if (preview === null || !preview.ok) return null;
    const launch = preview.launch;
    switch (launch.kind) {
      case 'app':
        return `Will start ${launch.program}${launch.args.length > 0 ? ` with ${launch.args.length} ${launch.args.length === 1 ? 'argument' : 'arguments'}` : ''}${launch.workingDir ? `, in ${launch.workingDir}` : ''}`;
      case 'folder':
        return `Will open the folder ${launch.path}`;
      case 'file':
        return `Will open ${launch.path}`;
      case 'url':
        return `Will open ${launch.url} in the default browser`;
    }
  })();

  const holdable = draft.kind === 'app';

  return (
    <form
      onSubmit={submit}
      aria-label={editing ? 'Edit step' : 'Add a step'}
      className="flex flex-col gap-3 border-t border-stroke-subtle pt-3"
    >
      <p className="text-caption font-semibold text-fg-tertiary uppercase">
        {editing ? 'Edit step' : 'Add a step'}
      </p>

      <ChoiceGroup
        label="Kind"
        options={STEP_KINDS}
        value={draft.kind}
        onChange={(kind) => {
          setProblems([]);
          set({ kind });
        }}
        labels={KIND_LABELS}
        disabled={pending || editing}
      />

      {draft.kind === 'app' && (
        <>
          <Input
            aria-label="Program path"
            placeholder="Absolute path to a program, e.g. %PROGRAMFILES%\App\app.exe"
            value={draft.program}
            onChange={(e) => set({ program: e.target.value })}
            disabled={pending}
            spellCheck={false}
          />
          <div className="flex flex-col gap-1">
            <span className="text-caption text-fg-tertiary">
              Arguments, one per line — passed as they are, never through a shell
            </span>
            {draft.args.length > 0 && (
              <ol aria-label="Arguments" className="flex flex-col gap-1">
                {draft.args.map((value, index) => (
                  <li key={`${index}-${value}`} className="flex items-center gap-2">
                    <span className="w-6 text-right font-mono text-caption text-fg-tertiary">
                      {index + 1}
                    </span>
                    <span
                      data-selectable
                      className="min-w-0 flex-1 truncate rounded-md bg-card-hover px-2 py-1 font-mono text-caption text-fg"
                    >
                      {value}
                    </span>
                    <IconButton
                      label={`Remove argument ${index + 1}`}
                      icon={<Dismiss20Regular />}
                      disabled={pending}
                      onClick={() => set({ args: draft.args.filter((_, i) => i !== index) })}
                    />
                  </li>
                ))}
              </ol>
            )}
            <div className="flex gap-2">
              <Input
                aria-label="New argument"
                placeholder="Add an argument"
                value={argument}
                onChange={(e) => setArgument(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addArgument();
                  }
                }}
                disabled={pending}
                spellCheck={false}
              />
              <IconButton
                label="Add argument"
                icon={<Add20Regular />}
                disabled={pending || argument === ''}
                onClick={addArgument}
              />
            </div>
          </div>
          <Input
            aria-label="Working directory (optional)"
            placeholder="Working directory (optional)"
            value={draft.workingDir}
            onChange={(e) => set({ workingDir: e.target.value })}
            disabled={pending}
            spellCheck={false}
          />
        </>
      )}

      {(draft.kind === 'folder' || draft.kind === 'file') && (
        <Input
          aria-label={draft.kind === 'folder' ? 'Folder path' : 'File path'}
          placeholder={
            draft.kind === 'folder'
              ? 'Absolute path to a folder, e.g. %USERPROFILE%\\src'
              : 'Absolute path to a file, e.g. %USERPROFILE%\\notes.md'
          }
          value={draft.path}
          onChange={(e) => set({ path: e.target.value })}
          disabled={pending}
          spellCheck={false}
        />
      )}

      {draft.kind === 'url' && (
        <Input
          aria-label="Web address"
          placeholder="https://…"
          value={draft.url}
          onChange={(e) => set({ url: e.target.value })}
          disabled={pending}
          spellCheck={false}
          inputMode="url"
        />
      )}

      {target && (
        <p data-selectable className="text-caption text-fg-secondary">
          {target}
        </p>
      )}

      <fieldset className="flex flex-col gap-2 rounded-md border border-stroke-subtle p-3">
        <legend className="px-1 text-caption font-semibold text-fg-tertiary uppercase">Time</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2">
          <label htmlFor="step-pause" className="text-body text-fg-secondary">
            Wait after this step, before the next (seconds)
          </label>
          <Input
            id="step-pause"
            aria-label="Pause after this step (seconds)"
            inputMode="decimal"
            placeholder="0"
            value={draft.pauseAfterS}
            onChange={(e) => set({ pauseAfterS: e.target.value })}
            disabled={pending}
          />
          {holdable && (
            <>
              <label htmlFor="step-hold" className="text-body text-fg-secondary">
                Keep it open for, then close (seconds; empty leaves it open)
              </label>
              <Input
                id="step-hold"
                aria-label="Hold (seconds)"
                inputMode="decimal"
                placeholder="leave open"
                value={draft.holdS}
                onChange={(e) => set({ holdS: e.target.value })}
                disabled={pending}
              />
              <label htmlFor="step-repeat" className="text-body text-fg-secondary">
                Open it this many times in all
              </label>
              <Input
                id="step-repeat"
                aria-label="Repeat (times)"
                inputMode="numeric"
                value={draft.repeat === 'forever' ? '' : draft.repeat}
                onChange={(e) => set({ repeat: e.target.value })}
                placeholder={draft.repeat === 'forever' ? 'until stopped' : '1'}
                disabled={pending || draft.holdS.trim() === '' || draft.repeat === 'forever'}
              />
              <label htmlFor="step-closed" className="text-body text-fg-secondary">
                Closed for, between openings (seconds)
              </label>
              <Input
                id="step-closed"
                aria-label="Closed between openings (seconds)"
                inputMode="decimal"
                placeholder="0"
                value={draft.closedS}
                onChange={(e) => set({ closedS: e.target.value })}
                disabled={pending || draft.holdS.trim() === ''}
              />
              <span className="text-body text-fg-secondary">
                Again and again, until the run is stopped
              </span>
              <span className="flex items-center">
                <Checkbox
                  label="Repeat until the run is stopped"
                  checked={draft.repeat.trim() === 'forever'}
                  onChange={(on) => set({ repeat: on ? 'forever' : '1' })}
                  disabled={pending || draft.holdS.trim() === ''}
                />
              </span>
              <span hidden />
            </>
          )}
        </div>
        <p className="text-caption text-fg-secondary">
          {timingSentence ?? 'Opens and moves on to the next step at once.'}
        </p>
      </fieldset>

      {(problems.length > 0 || hostError) && (
        <InfoBar
          severity="danger"
          title={editing ? 'The step was not changed' : 'The step was not added'}
        >
          {problems.length > 0 ? (
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={`${p.path}:${p.problem}`}>{p.problem}</li>
              ))}
            </ul>
          ) : (
            hostError
          )}
        </InfoBar>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          appearance={editing ? 'accent' : 'standard'}
          icon={editing ? undefined : <Add20Regular />}
          disabled={pending}
        >
          {editing ? 'Save step' : 'Add step'}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

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
import { Button } from '@/ui/Button';
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
 * uses: what it shows is what the host will be asked to do.
 */

/** What the form holds while it is being edited: strings, nothing decided yet. */
interface Draft {
  kind: StepKind;
  program: string;
  args: string[];
  workingDir: string;
  path: string;
  url: string;
}

const EMPTY: Draft = { kind: 'app', program: '', args: [], workingDir: '', path: '', url: '' };

function draftOf(config: StepConfig | null): Draft {
  if (config === null) return EMPTY;
  switch (config.kind) {
    case 'app':
      return {
        ...EMPTY,
        kind: 'app',
        program: config.program,
        args: config.args,
        workingDir: config.workingDir ?? '',
      };
    case 'folder':
    case 'file':
      return { ...EMPTY, kind: config.kind, path: config.path };
    case 'url':
      return { ...EMPTY, kind: 'url', url: config.url };
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

export function StepForm({
  initial,
  env,
  pending,
  hostError,
  onSubmit,
  onCancel,
}: {
  /** The step being edited, or null to add one. */
  initial: StepConfig | null;
  env: Readonly<Record<string, string>>;
  pending: boolean;
  /** What the host answered when the last submit was refused, if anything. */
  hostError: string | null;
  onSubmit: (config: StepConfig) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [argument, setArgument] = useState('');
  const [problems, setProblems] = useState<Problem[]>([]);

  const editing = initial !== null;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  // The live preview: the step as the domain reads it now, resolved.
  const read = readStepConfig(documentOf(draft));
  const preview = Array.isArray(read) ? null : resolveStep(read, env);

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
    setProblems([]);
    onSubmit(config);
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

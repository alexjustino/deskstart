import { Add20Regular, Dismiss20Regular } from '@fluentui/react-icons';
import { useState, type FormEvent } from 'react';

import {
  BROWSERS,
  HYPERVISORS,
  readStepConfig,
  resolveStep,
  STEP_KINDS,
  type Browser,
  type Hypervisor,
  type Problem,
  type StepConfig,
  type StepKind,
} from '@/domain/profile';
import {
  describePlacement,
  readPlacement,
  type Placement,
  type WindowState,
} from '@/domain/placement';
import { DEFAULT_TIMEOUT_MS, describeWaitFor, readWaitFor, type WaitFor } from '@/domain/readiness';
import { stepProblems } from '@/domain/step';
import { describeTiming, readTiming, type Timing } from '@/domain/timing';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { ChoiceGroup } from '@/ui/ChoiceGroup';
import { IconButton } from '@/ui/IconButton';
import { InfoBar } from '@/ui/InfoBar';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';

import { BROWSER_LABELS, KIND_LABELS } from './kinds';
import { MachinePicker } from './MachinePicker';

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
  /** Bookmarks: which browser, and the folder in it. */
  browser: Browser;
  folder: string;
  /** Terminal: the Windows Terminal profile, and where it opens. */
  terminalProfile: string;
  directory: string;
  /** A virtual machine: which hypervisor, and the machine's name or .vmx. */
  hypervisor: Hypervisor;
  machine: string;
  /** VMware: the machine is encrypted, its password asked at each run (ADR-028). */
  encrypted: boolean;
  /** Adding: the machines ticked in the hypervisor's list, one step each. */
  picked: string[];
  pauseAfterS: string;
  holdS: string;
  repeat: string;
  closedS: string;
  /** The earlier step this one waits for; empty means it waits for nothing. */
  waitStepId: string;
  waitProbe: 'window' | 'port';
  waitPort: string;
  waitTimeoutS: string;
  /** The screen, as a number, or '' for wherever it opens. */
  monitor: string;
  x: string;
  y: string;
  width: string;
  height: string;
  windowState: WindowState;
  /** Which new window to place (ADR-029): a piece of its title, its class. */
  matchTitle: string;
  matchClass: string;
}

/** An earlier step, as the "waits for" list offers it. */
export interface EarlierStep {
  id: string;
  title: string;
}

/** A tool this product can call, as the editor knows it (F7). */
export interface ToolState {
  id: string;
  name: string;
  found: boolean;
}

/** A screen, as the "where" list offers it. */
export interface Screen {
  number: number;
  width: number;
  height: number;
  primary: boolean;
}

const EMPTY: Draft = {
  kind: 'app',
  program: '',
  args: [],
  workingDir: '',
  path: '',
  url: '',
  browser: 'chrome',
  folder: '',
  terminalProfile: '',
  directory: '',
  hypervisor: 'hyperv',
  machine: '',
  encrypted: false,
  picked: [],
  pauseAfterS: '',
  holdS: '',
  repeat: '1',
  closedS: '',
  waitStepId: '',
  waitProbe: 'window',
  waitPort: '',
  waitTimeoutS: String(DEFAULT_TIMEOUT_MS / 1000),
  monitor: '',
  x: '',
  y: '',
  width: '',
  height: '',
  windowState: 'normal',
  matchTitle: '',
  matchClass: '',
};

function seconds(ms: number): string {
  return ms === 0 ? '' : String(ms / 1000);
}

function draftOf(
  initial: {
    config: StepConfig;
    timing: Timing;
    waitFor: WaitFor | null;
    placement: Placement;
  } | null,
): Draft {
  if (initial === null) return EMPTY;
  const { config, timing, waitFor, placement } = initial;
  const time = {
    pauseAfterS: seconds(timing.pauseAfterMs),
    holdS: timing.holdMs === null ? '' : String(timing.holdMs / 1000),
    repeat: timing.repeat === 'forever' ? 'forever' : String(timing.repeat),
    closedS: seconds(timing.closedMs),
    waitStepId: waitFor?.stepId ?? '',
    waitProbe: waitFor?.probe.kind ?? ('window' as const),
    waitPort: waitFor?.probe.kind === 'port' ? String(waitFor.probe.port) : '',
    waitTimeoutS: String((waitFor?.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000),
    monitor: placement.monitor === null ? '' : String(placement.monitor),
    x: placement.rect === null ? '' : String(placement.rect.x),
    y: placement.rect === null ? '' : String(placement.rect.y),
    width: placement.rect === null ? '' : String(placement.rect.width),
    height: placement.rect === null ? '' : String(placement.rect.height),
    windowState: placement.state,
    matchTitle: placement.match?.title ?? '',
    matchClass: placement.match?.className ?? '',
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
    case 'bookmarks':
      return {
        ...EMPTY,
        ...time,
        kind: 'bookmarks',
        browser: config.browser,
        folder: config.folder,
      };
    case 'terminal':
      return {
        ...EMPTY,
        ...time,
        kind: 'terminal',
        terminalProfile: config.profile ?? '',
        directory: config.directory ?? '',
      };
    case 'editor':
      return { ...EMPTY, ...time, kind: 'editor', path: config.path };
    case 'vm':
      return {
        ...EMPTY,
        ...time,
        kind: 'vm',
        hypervisor: config.hypervisor,
        machine: config.machine,
        encrypted: config.encrypted === true,
      };
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
    case 'bookmarks':
      return { kind: 'bookmarks', browser: draft.browser, folder: draft.folder };
    case 'terminal':
      return {
        kind: 'terminal',
        profile: draft.terminalProfile.trim() === '' ? null : draft.terminalProfile,
        directory: draft.directory.trim() === '' ? null : draft.directory,
      };
    case 'editor':
      return { kind: 'editor', path: draft.path };
    case 'vm':
      return {
        kind: 'vm',
        hypervisor: draft.hypervisor,
        machine: draft.machine,
        // Only VMware takes a password; the box is not shown for the others,
        // and a tick left over from switching does not follow them.
        ...(draft.hypervisor === 'vmware' && draft.encrypted ? { encrypted: true } : {}),
      };
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

/** The draft's waiting as a document; `readWaitFor` decides if it is one. */
function waitDocumentOf(draft: Draft): Record<string, unknown> | null {
  if (draft.waitStepId === '') return null;
  const timeout = millis(draft.waitTimeoutS, 'waitFor.timeoutMs', 'the timeout');
  return {
    stepId: draft.waitStepId,
    probe:
      draft.waitProbe === 'window'
        ? { kind: 'window' }
        : { kind: 'port', port: Number(draft.waitPort.trim()) },
    timeoutMs: typeof timeout === 'number' && timeout > 0 ? timeout : 0,
  };
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

/**
 * The draft's placement as a document; `readPlacement` decides if it is one.
 *
 * A rectangle is all four fields or none: half a rectangle is not a smaller
 * ask, it is an ambiguous one — and the form says which field is missing
 * rather than quietly filling it in.
 */
function placementOf(draft: Draft): Record<string, unknown> | Problem[] {
  const corners = [draft.x, draft.y, draft.width, draft.height].map((value) => value.trim());
  const given = corners.filter((value) => value !== '').length;
  if (given > 0 && given < 4) {
    return [
      {
        path: 'placement.rect',
        problem: 'a rectangle needs all four of x, y, width and height, or none of them',
      },
    ];
  }
  const numbers = corners.map((value) => Number(value));
  if (given === 4 && numbers.some((value) => !Number.isFinite(value))) {
    return [{ path: 'placement.rect', problem: 'a rectangle is written in whole pixels' }];
  }
  const monitor = draft.monitor.trim();
  return {
    ...(monitor === '' ? {} : { monitor: Number(monitor) }),
    ...(given === 4
      ? {
          rect: {
            x: Math.round(numbers[0] as number),
            y: Math.round(numbers[1] as number),
            width: Math.round(numbers[2] as number),
            height: Math.round(numbers[3] as number),
          },
        }
      : {}),
    state: draft.windowState,
    ...(draft.matchTitle.trim() !== '' || draft.matchClass.trim() !== ''
      ? {
          match: {
            title: draft.matchTitle.trim() === '' ? null : draft.matchTitle,
            className: draft.matchClass.trim() === '' ? null : draft.matchClass,
          },
        }
      : {}),
  };
}

export function StepForm({
  initial,
  earlier,
  screens,
  tools,
  env,
  pending,
  hostError,
  onSubmit,
  onSubmitMany,
  onCancel,
}: {
  /** The step being edited, or null to add one. */
  initial: {
    config: StepConfig;
    timing: Timing;
    waitFor: WaitFor | null;
    placement: Placement;
  } | null;
  /** The steps before this one: the only ones it may wait for. */
  earlier: readonly EarlierStep[];
  /** The screens this machine has, as the host numbers them. */
  screens: readonly Screen[];
  /** The tools this machine has, and the ones it has not. */
  tools: readonly ToolState[];
  env: Readonly<Record<string, string>>;
  pending: boolean;
  /** What the host answered when the last submit was refused, if anything. */
  hostError: string | null;
  onSubmit: (
    config: StepConfig,
    timing: Timing,
    waitFor: WaitFor | null,
    placement: Placement,
  ) => void;
  /**
   * Adding several machines picked from a hypervisor's list: one step each,
   * with the same time, waiting and placement, in the order given.
   */
  onSubmitMany?: (
    configs: StepConfig[],
    timing: Timing,
    waitFor: WaitFor | null,
    placement: Placement,
  ) => void;
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
  const waitDocument = waitDocumentOf(draft);
  const waitFor = readWaitFor(waitDocument);
  const awaitedTitle = earlier.find((s) => s.id === draft.waitStepId)?.title ?? null;
  const waitSentence = Array.isArray(waitFor) ? null : describeWaitFor(waitFor, awaitedTitle);
  const placeDocument = placementOf(draft);
  const placement = Array.isArray(placeDocument) ? placeDocument : readPlacement(placeDocument);
  const placeSentence = Array.isArray(placement) ? null : describePlacement(placement);

  // What this kind of step needs installed, and whether this machine has it.
  const needs =
    draft.kind === 'bookmarks'
      ? draft.browser
      : draft.kind === 'terminal' || draft.kind === 'editor'
        ? draft.kind
        : draft.kind === 'vm'
          ? draft.hypervisor
          : null;
  const tool = needs === null ? undefined : tools.find((candidate) => candidate.id === needs);
  const missingTool = tool !== undefined && !tool.found ? tool.name : null;

  const addArgument = () => {
    if (argument === '') return;
    set({ args: [...draft.args, argument] });
    setArgument('');
  };

  // Adding machines ticked in the list: each is read and resolved as its own
  // step, exactly as one typed by hand would be.
  const many = !editing && draft.kind === 'vm' && draft.picked.length > 0;

  const submitMany = () => {
    if (Array.isArray(timing)) {
      setProblems(timing);
      return;
    }
    if (Array.isArray(placement)) {
      setProblems(placement);
      return;
    }
    if (Array.isArray(waitFor)) {
      setProblems(waitFor);
      return;
    }
    const configs: StepConfig[] = [];
    const found: Problem[] = [];
    for (const machine of draft.picked) {
      const config = readStepConfig(documentOf({ ...draft, machine }));
      if (Array.isArray(config)) {
        found.push(...config);
        continue;
      }
      const resolved = resolveStep(config, env);
      if (!resolved.ok) {
        found.push(...resolved.problems);
        continue;
      }
      found.push(...stepProblems(config, timing, placement));
      configs.push(config);
    }
    if (found.length > 0) {
      setProblems(found);
      return;
    }
    setProblems([]);
    onSubmitMany?.(configs, timing, waitFor, placement);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (many) {
      submitMany();
      return;
    }
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
    if (Array.isArray(placement)) {
      setProblems(placement);
      return;
    }
    // The rules that need two parts of a step at once, asked of the form
    // exactly as the file reader asks them of a document.
    const together = stepProblems(config, timing, placement);
    if (together.length > 0) {
      setProblems(together);
      return;
    }
    if (Array.isArray(waitFor)) {
      setProblems(waitFor);
      return;
    }
    setProblems([]);
    onSubmit(config, timing, waitFor, placement);
  };

  const target = (() => {
    if (many) {
      return `Will start ${draft.picked.length} ${draft.picked.length === 1 ? 'machine' : 'machines'}, one step each`;
    }
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
      case 'tool':
        return `Will open ${launch.what}${launch.source !== null ? ` — from ${launch.source}` : ''}`;
      case 'bookmarks':
        return `Will open every page in ${launch.folder}, from ${BROWSER_LABELS[launch.browser]}, as one window`;
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

      {/*
        Seven kinds, and more coming: past four options a row of buttons stops
        being a row — it wraps, or it pushes the last kind off the card, which
        is what the capture of F7 showed. The design system's own rule for a
        longer list is a Select (see `ui/ChoiceGroup`), and this is the list
        that outgrew it.
      */}
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-caption font-semibold text-fg-tertiary uppercase">
          Kind
        </span>
        <span className="w-64">
          <Select
            aria-label="Kind"
            value={draft.kind}
            onChange={(e) => {
              setProblems([]);
              set({ kind: e.target.value as StepKind });
            }}
            disabled={pending || editing}
          >
            {STEP_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </span>
      </div>

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

      {draft.kind === 'bookmarks' && (
        <>
          <ChoiceGroup
            label="Bookmarks in"
            options={BROWSERS}
            value={draft.browser}
            onChange={(browser) => set({ browser })}
            labels={BROWSER_LABELS}
            disabled={pending}
          />
          <Input
            aria-label="Bookmark folder"
            placeholder="The folder's name, e.g. Work — or Bookmarks bar/Work"
            value={draft.folder}
            onChange={(e) => set({ folder: e.target.value })}
            disabled={pending}
          />
          <p className="text-caption text-fg-tertiary">
            Every page directly in that folder opens as one browser window. Pages in its subfolders
            stay where they are.
          </p>
        </>
      )}

      {draft.kind === 'terminal' && (
        <>
          <Input
            aria-label="Terminal profile"
            placeholder="The Windows Terminal profile, e.g. PowerShell (optional)"
            value={draft.terminalProfile}
            onChange={(e) => set({ terminalProfile: e.target.value })}
            disabled={pending}
          />
          <Input
            aria-label="Terminal directory"
            placeholder="Where it opens, e.g. %USERPROFILE%\\src (optional)"
            value={draft.directory}
            onChange={(e) => set({ directory: e.target.value })}
            disabled={pending}
          />
        </>
      )}

      {draft.kind === 'editor' && (
        <Input
          aria-label="Folder or workspace"
          placeholder="Folder or .code-workspace to open, e.g. %USERPROFILE%\\src\\project"
          value={draft.path}
          onChange={(e) => set({ path: e.target.value })}
          disabled={pending}
        />
      )}

      {draft.kind === 'vm' && (
        <>
          <ChoiceGroup
            label="Started by"
            options={HYPERVISORS}
            value={draft.hypervisor}
            onChange={(hypervisor) => set({ hypervisor, picked: [] })}
            labels={{ hyperv: 'Hyper-V', virtualbox: 'VirtualBox', vmware: 'VMware' }}
            disabled={pending}
          />
          <MachinePicker
            hypervisor={draft.hypervisor}
            installed={tool?.found === true}
            multiple={!editing}
            picked={editing ? [draft.machine] : draft.picked}
            onPick={(ids) =>
              editing ? set({ machine: ids[0] ?? draft.machine }) : set({ picked: ids })
            }
            disabled={pending}
          />
          <Input
            aria-label="Machine"
            placeholder={
              draft.hypervisor === 'vmware'
                ? 'The machine\u2019s .vmx, e.g. %USERPROFILE%\\VMs\\dev\\dev.vmx'
                : 'The machine\u2019s name, as the hypervisor lists it'
            }
            value={draft.machine}
            onChange={(e) => set({ machine: e.target.value })}
            disabled={pending || many}
            title={
              many ? 'The machines ticked above are added; untick them to type one' : undefined
            }
          />
          {draft.hypervisor === 'vmware' && (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-3 text-body text-fg">
                <Checkbox
                  label="Encrypted: ask for its password at each run"
                  checked={draft.encrypted}
                  onChange={(encrypted) => set({ encrypted })}
                  disabled={pending}
                />
                <span>
                  {many && draft.picked.length > 1 ? 'These machines are' : 'This machine is'}{' '}
                  encrypted — ask for the password at each run
                </span>
              </label>
              <p className="pl-8 text-caption text-fg-tertiary">
                The password is asked when you press Run, used for that run, and never stored — not
                in the profile, not on disk, not in the log.
              </p>
            </div>
          )}
          <p className="text-caption text-fg-tertiary">
            The machine is started and its console opened. Starting it is asked of the hypervisor
            and waited for, up to a minute; what the hypervisor answers is in the log.
          </p>
        </>
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

      <fieldset className="flex flex-col gap-2 rounded-md border border-stroke-subtle p-3">
        <legend className="px-1 text-caption font-semibold text-fg-tertiary uppercase">
          Where
        </legend>
        {!holdable && (
          <p className="text-caption text-fg-secondary">
            This opens in a window another program owns, so placing it needs a window rule below:
            which new window to move.
          </p>
        )}
        <ChoiceGroup
          label="Opens"
          options={['normal', 'maximized', 'minimized'] as const}
          value={draft.windowState}
          onChange={(windowState) => set({ windowState })}
          labels={{ normal: 'Normal', maximized: 'Maximised', minimized: 'Minimised' }}
          disabled={pending}
        />
        <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-2">
          <label htmlFor="step-monitor" className="text-body text-fg-secondary">
            Screen
          </label>
          <Select
            id="step-monitor"
            aria-label="Screen"
            value={draft.monitor}
            onChange={(e) => set({ monitor: e.target.value })}
            disabled={pending}
          >
            <option value="">Wherever it opens</option>
            {screens.map((screen) => (
              <option key={screen.number} value={String(screen.number)}>
                {screen.number}
                {screen.primary ? ' — primary' : ''} ({screen.width}×{screen.height})
              </option>
            ))}
          </Select>
          <label htmlFor="step-x" className="text-body text-fg-secondary">
            Position and size on that screen (pixels; all four, or none)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              id="step-x"
              aria-label="X"
              inputMode="numeric"
              placeholder="x"
              value={draft.x}
              onChange={(e) => set({ x: e.target.value })}
              disabled={pending}
            />
            <Input
              aria-label="Y"
              inputMode="numeric"
              placeholder="y"
              value={draft.y}
              onChange={(e) => set({ y: e.target.value })}
              disabled={pending}
            />
            <Input
              aria-label="Width"
              inputMode="numeric"
              placeholder="width"
              value={draft.width}
              onChange={(e) => set({ width: e.target.value })}
              disabled={pending}
            />
            <Input
              aria-label="Height"
              inputMode="numeric"
              placeholder="height"
              value={draft.height}
              onChange={(e) => set({ height: e.target.value })}
              disabled={pending}
            />
          </div>
        </div>
        <p className="text-caption text-fg-secondary">
          {placeSentence ?? 'Opens wherever the program would have opened it.'}
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-2">
          <label htmlFor="step-match-title" className="text-body text-fg-secondary">
            Which window: its title has (optional)
          </label>
          <Input
            id="step-match-title"
            aria-label="Window title has"
            placeholder="e.g. Character Map"
            value={draft.matchTitle}
            onChange={(e) => set({ matchTitle: e.target.value })}
            disabled={pending}
            spellCheck={false}
          />
          <label htmlFor="step-match-class" className="text-body text-fg-secondary">
            Which window: its class is (optional)
          </label>
          <Input
            id="step-match-class"
            aria-label="Window class"
            placeholder="e.g. CabinetWClass"
            value={draft.matchClass}
            onChange={(e) => set({ matchClass: e.target.value })}
            disabled={pending}
            spellCheck={false}
          />
        </div>
        <p className="text-caption text-fg-tertiary">
          A rule only ever picks a window that appeared after this step started — never one that was
          already open.
        </p>
        {screens.length === 0 && (
          <p className="text-caption text-caution">
            No screen was found to offer. A step can still ask to be maximised or minimised.
          </p>
        )}
      </fieldset>

      {earlier.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-md border border-stroke-subtle p-3">
          <legend className="px-1 text-caption font-semibold text-fg-tertiary uppercase">
            Waits for
          </legend>
          <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-2">
            <label htmlFor="step-wait" className="text-body text-fg-secondary">
              Start this step only once an earlier one is responding
            </label>
            <Select
              id="step-wait"
              aria-label="Wait for this step"
              value={draft.waitStepId}
              onChange={(e) => set({ waitStepId: e.target.value })}
              disabled={pending}
            >
              <option value="">Nothing — start at once</option>
              {earlier.map((step, index) => (
                <option key={step.id} value={step.id}>
                  {index + 1}. {step.title}
                </option>
              ))}
            </Select>
          </div>
          {draft.waitStepId !== '' && (
            <ChoiceGroup
              label="Responding"
              options={['window', 'port'] as const}
              value={draft.waitProbe}
              onChange={(waitProbe) => set({ waitProbe })}
              labels={{ window: 'A window', port: 'A port' }}
              disabled={pending}
            />
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-2">
            {draft.waitStepId !== '' && (
              <>
                {draft.waitProbe === 'port' && (
                  <>
                    <label htmlFor="step-wait-port" className="text-body text-fg-secondary">
                      The port it listens on
                    </label>
                    <Input
                      id="step-wait-port"
                      aria-label="Port"
                      inputMode="numeric"
                      placeholder="5173"
                      value={draft.waitPort}
                      onChange={(e) => set({ waitPort: e.target.value })}
                      disabled={pending}
                    />
                  </>
                )}
                <label htmlFor="step-wait-timeout" className="text-body text-fg-secondary">
                  Give up after (seconds), and skip this step
                </label>
                <Input
                  id="step-wait-timeout"
                  aria-label="Give up after (seconds)"
                  inputMode="decimal"
                  placeholder="30"
                  value={draft.waitTimeoutS}
                  onChange={(e) => set({ waitTimeoutS: e.target.value })}
                  disabled={pending}
                />
              </>
            )}
          </div>
          <p className="text-caption text-fg-secondary">
            {waitSentence ?? 'Starts as soon as the step before it has been started.'}
          </p>
        </fieldset>
      )}

      {missingTool !== null && (
        <InfoBar severity="caution" title={`${missingTool} is not installed here`}>
          The step can still be saved — a profile is often written on one machine and run on
          another. On this one it will not start, and the log will say this.
        </InfoBar>
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
          {editing
            ? 'Save step'
            : many && draft.picked.length > 1
              ? `Add ${draft.picked.length} steps`
              : 'Add step'}
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

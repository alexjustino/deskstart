/**
 * A profile as a file (F5).
 *
 * The file is the whole product's trust boundary: it arrives from somewhere
 * else and it describes programs to start with this person's privileges. So it
 * is read here, in one function that never throws, and everything it does not
 * declare is refused rather than ignored (ADR-010). What comes out is not yet a
 * profile that can run — it is a profile that must be reviewed (ADR-013).
 *
 * Two shapes, and the difference matters:
 *
 * - **Stored**, in `domain/profile` and `domain/readiness`: a step has an `id`,
 *   and what it waits for names that id.
 * - **Portable**, here: a step has no identity at all, and what it waits for
 *   names a **position** — `"step": 1`, the first step of this same document.
 *
 * A file carrying identifiers would carry a machine's identifiers, which mean
 * nothing on the machine that opens it. A position means the same thing
 * everywhere. It also keeps the rule that survives the trip: a step may only
 * wait for an **earlier** one, so a document that points forwards, or at
 * itself, is refused at the door rather than after import.
 */

import {
  PROFILE_SCHEMA_VERSION,
  readStepConfig,
  serializeStepConfig,
  type Problem,
  type Step,
  type StepConfig,
  type StepKind,
} from './profile';
import { readPlacement, serializePlacement, type Placement } from './placement';
import { DEFAULT_TIMEOUT_MS, readProbe, type Probe } from './readiness';
import { stepProblems } from './step';
import { readTiming, serializeTiming, type Timing } from './timing';

/** What a step waits for, in a document: a position, not an identity. */
export interface PortableWait {
  /** The 1-based position of an earlier step in this same document. */
  step: number;
  probe: Probe;
  timeoutMs: number;
}

/** A step in a document: what it opens, its time, what it waits for, where it lands. */
export interface PortableStep {
  config: StepConfig;
  timing: Timing;
  waitFor: PortableWait | null;
  placement: Placement;
}

/** A profile in a document: no identifiers, only what it means. */
export interface PortableProfile {
  schemaVersion: number;
  name: string;
  steps: PortableStep[];
}

export type ReadResult =
  { ok: true; profile: PortableProfile } | { ok: false; problems: Problem[] };

const DOCUMENT_FIELDS = new Set(['schemaVersion', 'name', 'steps']);
const WAIT_FIELDS = new Set(['step', 'probe', 'timeoutMs']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read what a step waits for, in document form. `index` is the reader's own
 * 1-based position, because "earlier" is the whole rule.
 */
function readPortableWait(
  value: unknown,
  index: number,
  path: string,
): PortableWait | null | Problem[] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return [{ path, problem: 'what a step waits for must be an object' }];
  if (Object.keys(value).length === 0) return null;

  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!WAIT_FIELDS.has(key)) {
      problems.push({
        path: `${path}.${key}`,
        problem: 'this field is not part of what a step waits for',
      });
    }
  }

  const step = value.step;
  const positioned = typeof step === 'number' && Number.isInteger(step) && step >= 1;
  if (!positioned) {
    problems.push({
      path: `${path}.step`,
      problem: 'a step waits for another step, named by its position from 1',
    });
  } else if (step >= index) {
    problems.push({
      path: `${path}.step`,
      problem: `a step may only wait for an earlier one; step ${index} cannot wait for step ${step}`,
    });
  }

  const timeoutMs = value.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    problems.push({
      path: `${path}.timeoutMs`,
      problem: 'the timeout must be a whole number of milliseconds, more than zero',
    });
  }

  const probe = readProbe(value.probe, `${path}.probe`);
  if (Array.isArray(probe)) problems.push(...probe);

  if (problems.length > 0 || Array.isArray(probe)) return problems;
  return { step: step as number, probe, timeoutMs: timeoutMs as number };
}

/**
 * Read one step of a document. Its time and what it waits for are lifted off
 * first, and everything left is the configuration — so an unknown field is
 * still an unknown field, refused by the same reader the editor uses.
 */
function readPortableStep(value: unknown, index: number, path: string): PortableStep | Problem[] {
  if (!isRecord(value)) return [{ path, problem: 'a step must be an object' }];
  const { timing: timingValue, waitFor: waitValue, placement: placeValue, ...rest } = value;

  const problems: Problem[] = [];
  const config = readStepConfig(rest, path);
  if (Array.isArray(config)) problems.push(...config);

  const timing = readTiming(timingValue, `${path}.timing`);
  if (Array.isArray(timing)) problems.push(...timing);

  const waitFor = readPortableWait(waitValue, index, `${path}.waitFor`);
  if (Array.isArray(waitFor)) problems.push(...waitFor);

  const placement = readPlacement(placeValue, `${path}.placement`);
  if (Array.isArray(placement)) problems.push(...placement);

  if (
    problems.length > 0 ||
    Array.isArray(config) ||
    Array.isArray(timing) ||
    Array.isArray(waitFor) ||
    Array.isArray(placement)
  )
    return problems;
  // The rules that need two parts of a step at once — a folder that would be
  // held, a web page that would be placed — asked of the file exactly as the
  // editor asks them of the form.
  const together = stepProblems(config, timing, placement).map((problem) => ({
    ...problem,
    path: `${path}.${problem.path}`,
  }));
  if (together.length > 0) return together;
  return { config, timing, waitFor, placement };
}

/**
 * Read a profile document. Never throws: a document that is not JSON, not an
 * object, of another schema version, or with anything unexpected in it comes
 * back as a list of problems written for a person.
 */
export function readPortableProfile(input: unknown): ReadResult {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, problems: [{ path: '', problem: 'the file is not valid JSON' }] };
    }
  }
  if (!isRecord(value)) {
    return { ok: false, problems: [{ path: '', problem: 'a profile must be an object' }] };
  }

  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!DOCUMENT_FIELDS.has(key)) {
      problems.push({ path: key, problem: 'this field is not part of a profile' });
    }
  }

  if (value.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    problems.push({
      path: 'schemaVersion',
      problem: `expected schema version ${PROFILE_SCHEMA_VERSION}, found ${String(value.schemaVersion)}`,
    });
  }

  if (typeof value.name !== 'string' || value.name.trim() === '') {
    problems.push({ path: 'name', problem: 'a profile needs a name' });
  }

  const steps: PortableStep[] = [];
  if (!Array.isArray(value.steps)) {
    problems.push({ path: 'steps', problem: 'steps must be a list' });
  } else {
    value.steps.forEach((step, at) => {
      const read = readPortableStep(step, at + 1, `steps[${at}]`);
      if (Array.isArray(read)) problems.push(...read);
      else steps.push(read);
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    profile: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      name: (value.name as string).trim(),
      steps,
    },
  };
}

/** A stored profile as far as export is concerned. */
export type Exportable = Pick<Step, 'id' | 'config' | 'timing' | 'waitFor' | 'placement'>;

/**
 * Write a profile as a document: identifiers dropped, positions in their
 * place, defaults left out so the file says only what was chosen.
 *
 * A step that waits for one that is no longer in the profile loses its wait
 * rather than carrying a dangling reference into a file: the reader would
 * refuse the file, and a profile that cannot be read is worse than a profile
 * that says less. What is dropped is shown on the screen before the file is
 * written.
 */
export function writePortableProfile(name: string, steps: readonly Exportable[]): string {
  const positions = new Map(steps.map((step, at) => [step.id, at + 1]));
  const document = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    name: name.trim(),
    steps: steps.map((step, at) => {
      const entry: Record<string, unknown> = {
        kind: step.config.kind,
        ...(JSON.parse(serializeStepConfig(step.config)) as Record<string, unknown>),
      };
      const timing = JSON.parse(serializeTiming(step.timing)) as Record<string, unknown>;
      if (Object.keys(timing).length > 0) entry.timing = timing;
      const placement = JSON.parse(serializePlacement(step.placement)) as Record<string, unknown>;
      if (Object.keys(placement).length > 0) entry.placement = placement;
      const awaited = step.waitFor === null ? undefined : positions.get(step.waitFor.stepId);
      if (step.waitFor !== null && awaited !== undefined && awaited < at + 1) {
        entry.waitFor = {
          step: awaited,
          probe: step.waitFor.probe,
          timeoutMs: step.waitFor.timeoutMs,
        };
      }
      return entry;
    }),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** A step that will lose its wait on export, and why — shown before writing. */
export function droppedWaits(steps: readonly Exportable[]): Problem[] {
  const positions = new Map(steps.map((step, at) => [step.id, at + 1]));
  const problems: Problem[] = [];
  steps.forEach((step, at) => {
    if (step.waitFor === null) return;
    const awaited = positions.get(step.waitFor.stepId);
    if (awaited === undefined || awaited >= at + 1) {
      problems.push({
        path: `steps[${at}].waitFor`,
        problem: 'it waits for a step that is not earlier in this profile; the wait is left out',
      });
    }
  });
  return problems;
}

/** A step of a document, ready for the host to store. */
export interface StepImport {
  kind: StepKind;
  configJson: string;
  timingJson: string;
  /** The 1-based position of the earlier step it waits for, or null. */
  waitOn: number | null;
  /** The wait without its step: the host adds the identity it just created. */
  waitJson: string;
  placeJson: string;
}

/** Turn a read document into what the import command stores, in order. */
export function toImports(profile: PortableProfile): StepImport[] {
  return profile.steps.map((step) => ({
    kind: step.config.kind,
    configJson: serializeStepConfig(step.config),
    timingJson: serializeTiming(step.timing),
    waitOn: step.waitFor?.step ?? null,
    waitJson:
      step.waitFor === null
        ? '{}'
        : JSON.stringify({ probe: step.waitFor.probe, timeoutMs: step.waitFor.timeoutMs }),
    placeJson: serializePlacement(step.placement),
  }));
}

/**
 * What to call the file. Anything Windows refuses in a name, and anything
 * that is not a name at all, becomes a hyphen: a profile called
 * `Dev: work/home` still writes.
 */
const FORBIDDEN = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*', ' ']);

export function fileNameFor(name: string): string {
  const safe = [...name.trim()]
    .map((ch) => (FORBIDDEN.has(ch) || ch.codePointAt(0)! < 0x20 ? '-' : ch))
    .join('')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '')
    .slice(0, 60);
  return `${safe === '' ? 'profile' : safe}.deskstart.json`;
}

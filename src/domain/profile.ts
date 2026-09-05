/**
 * A profile is data (ADR-010).
 *
 * This module is the only place that decides what a profile may contain. It
 * reads an untrusted document and either returns a typed profile or a list of
 * problems written for a person; it never throws, and nothing in a document is
 * interpreted — a path is expanded only through a closed allow-list of
 * environment names, and shown expanded.
 */

export const PROFILE_SCHEMA_VERSION = 1;

export type StepKind = 'app';

/** An application to start: a program, its arguments, where it runs. */
export interface AppStep {
  kind: 'app';
  program: string;
  args: string[];
  workingDir: string | null;
}

export type StepConfig = AppStep;

/** A step as stored: its configuration plus the identity the host gave it. */
export interface Step {
  id: string;
  profileId: string;
  position: number;
  config: StepConfig;
}

/** The shape of a profile as a file: no identifiers, only what it means. */
export interface ProfileDocument {
  schemaVersion: number;
  name: string;
  steps: StepConfig[];
}

export interface Problem {
  /** Where in the document, e.g. `steps[2].program`. */
  path: string;
  /** What is wrong, as a sentence. */
  problem: string;
}

export type ReadResult =
  { ok: true; document: ProfileDocument } | { ok: false; problems: Problem[] };

const ALLOWED_STEP_FIELDS = new Set(['kind', 'program', 'args', 'workingDir']);
const ALLOWED_DOCUMENT_FIELDS = new Set(['schemaVersion', 'name', 'steps']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read one step's configuration. Unknown fields are refused rather than
 * ignored: a newer document must not smuggle behaviour into an older reader.
 */
export function readStepConfig(value: unknown, path = 'step'): StepConfig | Problem[] {
  if (!isRecord(value)) return [{ path, problem: 'a step must be an object' }];
  const problems: Problem[] = [];

  for (const key of Object.keys(value)) {
    if (!ALLOWED_STEP_FIELDS.has(key)) {
      problems.push({ path: `${path}.${key}`, problem: 'this field is not part of a step' });
    }
  }

  if (value.kind !== 'app') {
    problems.push({ path: `${path}.kind`, problem: 'the only step kind known today is "app"' });
  }

  const program = value.program;
  if (typeof program !== 'string' || program.trim() === '') {
    problems.push({ path: `${path}.program`, problem: 'a program path is required' });
  }

  const args = value.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
    problems.push({ path: `${path}.args`, problem: 'arguments must be a list of strings' });
  }

  const workingDir = value.workingDir ?? null;
  if (workingDir !== null && (typeof workingDir !== 'string' || workingDir.trim() === '')) {
    problems.push({
      path: `${path}.workingDir`,
      problem: 'the working directory must be a path or left empty',
    });
  }

  if (problems.length > 0) return problems;
  return {
    kind: 'app',
    program: (program as string).trim(),
    args: args as string[],
    workingDir: workingDir === null ? null : (workingDir as string).trim(),
  };
}

/** The configuration as the host stores it: the step's own shape, verbatim. */
export function serializeStepConfig(config: StepConfig): string {
  return JSON.stringify({
    program: config.program,
    args: config.args,
    workingDir: config.workingDir,
  });
}

/** Read a stored configuration back. A row that cannot be read is a problem, not a crash. */
export function parseStoredStep(
  kind: string,
  configJson: string,
): { ok: true; config: StepConfig } | { ok: false; problems: Problem[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configJson);
  } catch {
    return { ok: false, problems: [{ path: 'config', problem: 'the stored step is not JSON' }] };
  }
  if (!isRecord(parsed)) {
    return {
      ok: false,
      problems: [{ path: 'config', problem: 'the stored step is not an object' }],
    };
  }
  const result = readStepConfig({ kind, ...parsed });
  return Array.isArray(result) ? { ok: false, problems: result } : { ok: true, config: result };
}

/**
 * Read a profile document. Never throws: a document that is not JSON, not an
 * object, of another schema version, or with anything unexpected in it comes
 * back as a list of problems.
 */
export function readProfile(input: unknown): ReadResult {
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
    if (!ALLOWED_DOCUMENT_FIELDS.has(key)) {
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

  const steps: StepConfig[] = [];
  if (!Array.isArray(value.steps)) {
    problems.push({ path: 'steps', problem: 'steps must be a list' });
  } else {
    value.steps.forEach((step, index) => {
      const read = readStepConfig(step, `steps[${index}]`);
      if (Array.isArray(read)) problems.push(...read);
      else steps.push(read);
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    document: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      name: (value.name as string).trim(),
      steps,
    },
  };
}

/** The environment names a path may use. Anything else is refused, not expanded. */
export const ALLOWED_ENVIRONMENT = [
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'SYSTEMROOT',
] as const;

export type PathResult = { ok: true; path: string } | { ok: false; problem: string };

/**
 * Resolve a path the way the product will use it: allow-listed `%NAME%`
 * segments expanded from the values given, slashes normalised, and the result
 * required to be absolute. What this returns is what the dry-run shows and
 * what the host is asked to start — there is no second resolution.
 */
export function resolvePath(raw: string, env: Readonly<Record<string, string>>): PathResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, problem: 'the path is empty' };

  const upper = new Map<string, string>();
  for (const [key, value] of Object.entries(env)) upper.set(key.toUpperCase(), value);

  let unknown: string | null = null;
  const expanded = trimmed.replace(/%([^%]+)%/g, (match, name: string) => {
    const key = name.toUpperCase();
    if (!(ALLOWED_ENVIRONMENT as readonly string[]).includes(key)) {
      unknown ??= name;
      return match;
    }
    const value = upper.get(key);
    if (value === undefined) {
      unknown ??= name;
      return match;
    }
    return value;
  });
  if (unknown !== null) {
    return { ok: false, problem: `%${unknown}% is not a name this product expands` };
  }

  const normalised = expanded.replace(/\//g, '\\');
  if (!/^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)/.test(normalised)) {
    return { ok: false, problem: `the path is not absolute: ${normalised}` };
  }
  return { ok: true, path: normalised };
}

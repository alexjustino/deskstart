/**
 * A profile is data (ADR-010).
 *
 * This module is the only place that decides what a step may contain. It reads
 * an untrusted configuration and either returns a typed step or a list of
 * problems written for a person; it never throws, and nothing is interpreted —
 * a path is expanded only through a closed allow-list of environment names, and
 * shown expanded. A whole profile as a file is read by `domain/portable`, which
 * comes back here for every step.
 *
 * It is also the only place that turns a step into what the host is asked to
 * do (`resolveStep`): the same function feeds the dry run, the real run and
 * the editor's preview, so what is shown is what runs — there is no second
 * resolution.
 */

import type { WaitFor } from './readiness';
import type { Timing } from './timing';

export const PROFILE_SCHEMA_VERSION = 1;

export const STEP_KINDS = ['app', 'folder', 'file', 'url'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** An application to start: a program, its arguments, where it runs. */
export interface AppStep {
  kind: 'app';
  program: string;
  args: string[];
  workingDir: string | null;
}

/** A folder to open in Explorer. */
export interface FolderStep {
  kind: 'folder';
  path: string;
}

/** A file to open in whatever Windows opens it with. */
export interface FileStep {
  kind: 'file';
  path: string;
}

/** A web page to open in the default browser. */
export interface UrlStep {
  kind: 'url';
  url: string;
}

export type StepConfig = AppStep | FolderStep | FileStep | UrlStep;

/** A step as stored: its configuration, its timing, and the identity the host gave it. */
export interface Step {
  id: string;
  profileId: string;
  position: number;
  config: StepConfig;
  timing: Timing;
  /** What must be responding before this step starts, or null to start at once. */
  waitFor: WaitFor | null;
  /**
   * Seen and accepted on this machine (ADR-013). A step written here is
   * accepted the moment it is written; a step that arrived in a file is not.
   */
  reviewed: boolean;
}

export interface Problem {
  /** Where in the document, e.g. `steps[2].program`. */
  path: string;
  /** What is wrong, as a sentence. */
  problem: string;
}

const FIELDS: Record<StepKind, ReadonlySet<string>> = {
  app: new Set(['kind', 'program', 'args', 'workingDir']),
  folder: new Set(['kind', 'path']),
  file: new Set(['kind', 'path']),
  url: new Set(['kind', 'url']),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is StepKind {
  return typeof value === 'string' && (STEP_KINDS as readonly string[]).includes(value);
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Read one step's configuration. Unknown fields are refused rather than
 * ignored: a newer document must not smuggle behaviour into an older reader.
 */
export function readStepConfig(value: unknown, path = 'step'): StepConfig | Problem[] {
  if (!isRecord(value)) return [{ path, problem: 'a step must be an object' }];
  if (!isKind(value.kind)) {
    return [
      {
        path: `${path}.kind`,
        problem: `a step is one of: ${STEP_KINDS.join(', ')}`,
      },
    ];
  }
  const kind = value.kind;
  const problems: Problem[] = [];
  for (const key of Object.keys(value)) {
    if (!FIELDS[kind].has(key)) {
      problems.push({
        path: `${path}.${key}`,
        problem: `this field is not part of a ${kind} step`,
      });
    }
  }

  switch (kind) {
    case 'app': {
      const program = requiredText(value.program);
      if (program === null) {
        problems.push({ path: `${path}.program`, problem: 'a program path is required' });
      }
      const args = value.args ?? [];
      if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
        problems.push({ path: `${path}.args`, problem: 'arguments must be a list of strings' });
      }
      const workingDir = value.workingDir ?? null;
      if (workingDir !== null && requiredText(workingDir) === null) {
        problems.push({
          path: `${path}.workingDir`,
          problem: 'the working directory must be a path or left empty',
        });
      }
      if (problems.length > 0) return problems;
      return {
        kind,
        program: program as string,
        args: args as string[],
        workingDir: workingDir === null ? null : (workingDir as string).trim(),
      };
    }
    case 'folder':
    case 'file': {
      const target = requiredText(value.path);
      if (target === null) {
        problems.push({ path: `${path}.path`, problem: `a ${kind} path is required` });
      }
      if (problems.length > 0) return problems;
      return { kind, path: target as string };
    }
    case 'url': {
      const url = requiredText(value.url);
      if (url === null) {
        problems.push({ path: `${path}.url`, problem: 'a web address is required' });
      } else {
        const read = readUrl(url);
        if (!read.ok) problems.push({ path: `${path}.url`, problem: read.problem });
      }
      if (problems.length > 0) return problems;
      return { kind, url: url as string };
    }
  }
}

/** The configuration as the host stores it: the step's own shape, without the kind. */
export function serializeStepConfig(config: StepConfig): string {
  const { kind: _kind, ...rest } = config;
  return JSON.stringify(rest);
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

export type UrlResult = { ok: true; url: string } | { ok: false; problem: string };

/**
 * A web address the product will hand to the default browser: `http` or
 * `https`, nothing else. `file:` would open the file the profile did not
 * declare; `javascript:` and friends are not addresses at all.
 */
export function readUrl(raw: string): UrlResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, problem: 'the address is empty' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, problem: `not a web address: ${trimmed}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      problem: `only http and https addresses are opened, not ${parsed.protocol}`,
    };
  }
  if (parsed.hostname === '') return { ok: false, problem: `the address has no host: ${trimmed}` };
  return { ok: true, url: parsed.toString() };
}

/**
 * What the host is asked to do for a step, with every path resolved. `source`
 * is the path as written when expansion changed it, so the log and the screen
 * can show both.
 */
export type Launch =
  | {
      kind: 'app';
      program: string;
      args: string[];
      workingDir: string | null;
      source: string | null;
    }
  | { kind: 'folder'; path: string; source: string | null }
  | { kind: 'file'; path: string; source: string | null }
  | { kind: 'url'; url: string; source: null };

export type ResolveResult = { ok: true; launch: Launch } | { ok: false; problems: Problem[] };

function sourceOf(raw: string, resolved: string): string | null {
  return raw.trim() === resolved ? null : raw.trim();
}

/** Turn a step into its launch, or say what stops it. Pure: the host checks the disk. */
export function resolveStep(
  config: StepConfig,
  env: Readonly<Record<string, string>>,
): ResolveResult {
  switch (config.kind) {
    case 'app': {
      const problems: Problem[] = [];
      const program = resolvePath(config.program, env);
      if (!program.ok) problems.push({ path: 'program', problem: program.problem });
      let workingDir: string | null = null;
      if (config.workingDir !== null) {
        const dir = resolvePath(config.workingDir, env);
        if (!dir.ok) problems.push({ path: 'workingDir', problem: dir.problem });
        else workingDir = dir.path;
      }
      if (!program.ok || problems.length > 0) return { ok: false, problems };
      return {
        ok: true,
        launch: {
          kind: 'app',
          program: program.path,
          args: config.args,
          workingDir,
          source: sourceOf(config.program, program.path),
        },
      };
    }
    case 'folder':
    case 'file': {
      const target = resolvePath(config.path, env);
      if (!target.ok) return { ok: false, problems: [{ path: 'path', problem: target.problem }] };
      return {
        ok: true,
        launch: {
          kind: config.kind,
          path: target.path,
          source: sourceOf(config.path, target.path),
        },
      };
    }
    case 'url': {
      const url = readUrl(config.url);
      if (!url.ok) return { ok: false, problems: [{ path: 'url', problem: url.problem }] };
      return { ok: true, launch: { kind: 'url', url: url.url, source: null } };
    }
  }
}

/** What a person calls the step: the file name, the folder name, the host. */
export function stepTitle(config: StepConfig): string {
  switch (config.kind) {
    case 'app':
      return lastSegment(config.program);
    case 'folder':
    case 'file':
      return lastSegment(config.path);
    case 'url': {
      const read = readUrl(config.url);
      if (!read.ok) return config.url;
      try {
        return new URL(read.url).host;
      } catch {
        return config.url;
      }
    }
  }
}

/** The last path segment, or the path itself when there is none. */
export function lastSegment(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).pop() || path;
}

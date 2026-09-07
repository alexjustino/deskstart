/**
 * The typed client for the profile and step commands.
 *
 * The host speaks snake_case, because that is what the schema speaks. The
 * interface speaks camelCase. The translation happens exactly once, here,
 * rather than leaking a database naming convention into every component.
 */

import { invoke } from '@tauri-apps/api/core';

import type { StepImport } from '@/domain/portable';
import {
  parseStoredStep,
  serializeStepConfig,
  type Problem,
  type Step,
  type StepConfig,
} from '@/domain/profile';
import { parseStoredWaitFor, serializeWaitFor, type WaitFor } from '@/domain/readiness';
import { parseStoredTiming, serializeTiming, type Timing } from '@/domain/timing';

export interface Profile {
  id: string;
  name: string;
  position: number;
  importedUnreviewed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A stored step, read back: either its configuration or why it could not be read. */
export type StoredStep =
  | { readable: true; step: Step }
  | {
      readable: false;
      id: string;
      profileId: string;
      position: number;
      reviewed: boolean;
      problems: Problem[];
    };

interface RawProfile {
  id: string;
  name: string;
  position: number;
  imported_unreviewed: boolean;
  created_at: string;
  updated_at: string;
}

interface RawStep {
  id: string;
  profile_id: string;
  position: number;
  kind: string;
  config_json: string;
  timing_json: string;
  wait_json: string;
  reviewed: boolean;
  created_at: string;
  updated_at: string;
}

function toProfile(raw: RawProfile): Profile {
  return {
    id: raw.id,
    name: raw.name,
    position: raw.position,
    importedUnreviewed: raw.imported_unreviewed,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * A row that cannot be read is shown as such rather than dropped: a profile
 * with a step the interface silently hides is a profile that runs something
 * the person cannot see.
 */
function toStoredStep(raw: RawStep): StoredStep {
  const parsed = parseStoredStep(raw.kind, raw.config_json);
  const timing = parseStoredTiming(raw.timing_json);
  const waitFor = parseStoredWaitFor(raw.wait_json ?? '{}');
  if (!parsed.ok || Array.isArray(timing) || Array.isArray(waitFor)) {
    return {
      readable: false,
      id: raw.id,
      profileId: raw.profile_id,
      position: raw.position,
      reviewed: raw.reviewed,
      problems: [
        ...(parsed.ok ? [] : parsed.problems),
        ...(Array.isArray(timing) ? timing : []),
        ...(Array.isArray(waitFor) ? waitFor : []),
      ],
    };
  }
  return {
    readable: true,
    step: {
      id: raw.id,
      profileId: raw.profile_id,
      position: raw.position,
      config: parsed.config,
      timing,
      waitFor,
      reviewed: raw.reviewed,
    },
  };
}

export async function listProfiles(): Promise<Profile[]> {
  const raw = await invoke<RawProfile[]>('profiles_list');
  return raw.map(toProfile);
}

export async function createProfile(name: string): Promise<Profile> {
  return toProfile(await invoke<RawProfile>('profile_create', { name }));
}

export async function renameProfile(id: string, name: string): Promise<Profile> {
  return toProfile(await invoke<RawProfile>('profile_rename', { id, name }));
}

export async function deleteProfile(id: string): Promise<void> {
  await invoke('profile_delete', { id });
}

export async function listSteps(profileId: string): Promise<StoredStep[]> {
  const raw = await invoke<RawStep[]>('steps_list', { profileId });
  return raw.map(toStoredStep);
}

export async function addStep(
  profileId: string,
  config: StepConfig,
  timing: Timing,
  waitFor: WaitFor | null,
): Promise<StoredStep> {
  const raw = await invoke<RawStep>('step_add', {
    profileId,
    kind: config.kind,
    configJson: serializeStepConfig(config),
    timingJson: serializeTiming(timing),
    waitJson: serializeWaitFor(waitFor),
  });
  return toStoredStep(raw);
}

export async function updateStep(
  id: string,
  config: StepConfig,
  timing: Timing,
  waitFor: WaitFor | null,
): Promise<StoredStep> {
  const raw = await invoke<RawStep>('step_update', {
    id,
    configJson: serializeStepConfig(config),
    timingJson: serializeTiming(timing),
    waitJson: serializeWaitFor(waitFor),
  });
  return toStoredStep(raw);
}

export async function deleteStep(id: string): Promise<void> {
  await invoke('step_delete', { id });
}

/** Move a step one place up (`-1`) or down (`1`); the whole list comes back. */
export async function moveStep(id: string, direction: -1 | 1): Promise<StoredStep[]> {
  const raw = await invoke<RawStep[]>('step_move', { id, direction });
  return raw.map(toStoredStep);
}

/**
 * Store a profile that came from a file. It arrives unreviewed: the host
 * refuses to run it until every step has been accepted (ADR-013).
 */
export async function importProfile(name: string, steps: StepImport[]): Promise<Profile> {
  return toProfile(await invoke<RawProfile>('profile_import', { name, steps }));
}

/** Accept one step. The profile comes back, so the screen learns when the gate lifts. */
export async function acceptStep(id: string): Promise<Profile> {
  return toProfile(await invoke<RawProfile>('step_accept', { id }));
}

/** Accept every step of a profile at once. */
export async function acceptProfile(id: string): Promise<Profile> {
  return toProfile(await invoke<RawProfile>('profile_accept', { id }));
}

/** Read one file the person chose, as text. What it means is the domain's business. */
export async function readProfileFile(path: string): Promise<string> {
  return invoke<string>('profile_file_read', { path });
}

/** Write one file the person chose. */
export async function writeProfileFile(path: string, contents: string): Promise<void> {
  await invoke('profile_file_write', { path, contents });
}

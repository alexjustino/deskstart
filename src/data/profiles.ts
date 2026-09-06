/**
 * The typed client for the profile and step commands.
 *
 * The host speaks snake_case, because that is what the schema speaks. The
 * interface speaks camelCase. The translation happens exactly once, here,
 * rather than leaking a database naming convention into every component.
 */

import { invoke } from '@tauri-apps/api/core';

import {
  parseStoredStep,
  serializeStepConfig,
  type Problem,
  type Step,
  type StepConfig,
} from '@/domain/profile';
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
  | { readable: false; id: string; profileId: string; position: number; problems: Problem[] };

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
  if (!parsed.ok || Array.isArray(timing)) {
    return {
      readable: false,
      id: raw.id,
      profileId: raw.profile_id,
      position: raw.position,
      problems: [...(parsed.ok ? [] : parsed.problems), ...(Array.isArray(timing) ? timing : [])],
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
): Promise<StoredStep> {
  const raw = await invoke<RawStep>('step_add', {
    profileId,
    kind: config.kind,
    configJson: serializeStepConfig(config),
    timingJson: serializeTiming(timing),
  });
  return toStoredStep(raw);
}

export async function updateStep(
  id: string,
  config: StepConfig,
  timing: Timing,
): Promise<StoredStep> {
  const raw = await invoke<RawStep>('step_update', {
    id,
    configJson: serializeStepConfig(config),
    timingJson: serializeTiming(timing),
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

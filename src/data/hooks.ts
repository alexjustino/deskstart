/**
 * React Query bindings for the host commands.
 *
 * Commands are asynchronous I/O against a local process, which is what this
 * library is for: caching, invalidation and load state, without a hand-rolled
 * store per screen.
 *
 * Every mutation invalidates rather than patching the cache by hand. The write
 * already returned the row the host actually stored, and refetching is how the
 * interface stays honest about what is on disk instead of about what it hoped
 * would be.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Step, StepConfig } from '@/domain/profile';
import type { Mode } from '@/domain/run';

import { executeProfile } from './execute';
import * as profileApi from './profiles';
import * as runApi from './runs';
import { fetchEnvironment } from './system';

export const keys = {
  profiles: ['profiles'] as const,
  steps: (profileId: string) => ['steps', profileId] as const,
  runs: (profileId: string | null) => ['runs', profileId] as const,
  events: (runId: string) => ['events', runId] as const,
  environment: ['environment'] as const,
};

export function useProfiles() {
  return useQuery({ queryKey: keys.profiles, queryFn: profileApi.listProfiles });
}

/** The allow-listed environment. Read once: it does not change while the window is open. */
export function useEnvironment() {
  return useQuery({ queryKey: keys.environment, queryFn: fetchEnvironment });
}

export function useCreateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => profileApi.createProfile(name),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.profiles }),
  });
}

export function useRenameProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => profileApi.renameProfile(id, name),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.profiles }),
  });
}

export function useDeleteProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => profileApi.deleteProfile(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.profiles }),
  });
}

export function useSteps(profileId: string | null) {
  return useQuery({
    queryKey: keys.steps(profileId ?? ''),
    queryFn: () => profileApi.listSteps(profileId ?? ''),
    enabled: profileId !== null,
  });
}

export function useAddStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, config }: { profileId: string; config: StepConfig }) =>
      profileApi.addStep(profileId, config),
    onSuccess: (_step, { profileId }) =>
      client.invalidateQueries({ queryKey: keys.steps(profileId) }),
  });
}

export function useUpdateStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; profileId: string; config: StepConfig }) =>
      profileApi.updateStep(id, config),
    onSuccess: (_step, { profileId }) =>
      client.invalidateQueries({ queryKey: keys.steps(profileId) }),
  });
}

export function useDeleteStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; profileId: string }) => profileApi.deleteStep(id),
    onSuccess: (_void, { profileId }) =>
      client.invalidateQueries({ queryKey: keys.steps(profileId) }),
  });
}

export function useMoveStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; profileId: string; direction: -1 | 1 }) =>
      profileApi.moveStep(id, direction),
    onSuccess: (_steps, { profileId }) =>
      client.invalidateQueries({ queryKey: keys.steps(profileId) }),
  });
}

export function useRuns(profileId: string | null) {
  return useQuery({
    queryKey: keys.runs(profileId),
    queryFn: () => runApi.listRuns(profileId),
  });
}

export function useEvents(runId: string | null) {
  return useQuery({
    queryKey: keys.events(runId ?? ''),
    queryFn: () => runApi.listEvents(runId ?? ''),
    enabled: runId !== null,
  });
}

/**
 * Run a profile. The run list refetches when it is over; the log of the run
 * in progress is read by `useEvents`, which the caller invalidates on every
 * line so the screen is always a reading of the file.
 */
export function useExecuteProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      steps,
      mode,
      env,
      onLine,
    }: {
      profileId: string;
      steps: Step[];
      mode: Mode;
      env: Readonly<Record<string, string>>;
      onLine?: (line: runApi.LogLine) => void;
    }) =>
      executeProfile(profileId, steps, mode, env, (line) => {
        void client.invalidateQueries({ queryKey: keys.events(line.runId) });
        onLine?.(line);
      }),
    // The last line — `run_finished` — is written by the host without an
    // `onLine`, and the refetch the previous line triggered may have read the
    // file before it was there. Read every log again once the run is over, so
    // the screen never stops one line short of the truth. Found by the
    // end-to-end suite: "completed, with failures" reached the file and not
    // the screen.
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['runs'] });
      void client.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

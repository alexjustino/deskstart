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

import type { StepConfig } from '@/domain/profile';
import type { Mode } from '@/domain/run';

import { executeProfile } from './execute';
import * as profileApi from './profiles';
import * as runApi from './runs';

export const keys = {
  profiles: ['profiles'] as const,
  steps: (profileId: string) => ['steps', profileId] as const,
  runs: (profileId: string | null) => ['runs', profileId] as const,
  events: (runId: string) => ['events', runId] as const,
};

export function useProfiles() {
  return useQuery({ queryKey: keys.profiles, queryFn: profileApi.listProfiles });
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

export function useDeleteStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; profileId: string }) => profileApi.deleteStep(id),
    onSuccess: (_void, { profileId }) =>
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
      stepIds,
      mode,
      onLine,
    }: {
      profileId: string;
      stepIds: string[];
      mode: Mode;
      onLine?: (line: runApi.LogLine) => void;
    }) =>
      executeProfile(profileId, stepIds, mode, (line) => {
        void client.invalidateQueries({ queryKey: keys.events(line.runId) });
        onLine?.(line);
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ['runs'] }),
  });
}

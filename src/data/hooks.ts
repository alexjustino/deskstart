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
import { useCallback, useRef } from 'react';

import type { StepImport } from '@/domain/portable';
import type { Step, StepConfig } from '@/domain/profile';
import type { Mode } from '@/domain/run';
import type { WaitFor } from '@/domain/readiness';
import type { Placement } from '@/domain/placement';
import type { Timing } from '@/domain/timing';

import { executeProfile, Stopper, type Runnable } from './execute';
import * as profileApi from './profiles';
import * as runApi from './runs';
import { fetchEnvironment, fetchMonitors } from './system';

export const keys = {
  profiles: ['profiles'] as const,
  steps: (profileId: string) => ['steps', profileId] as const,
  runs: (profileId: string | null) => ['runs', profileId] as const,
  events: (runId: string) => ['events', runId] as const,
  environment: ['environment'] as const,
  monitors: ['monitors'] as const,
};

export function useProfiles() {
  return useQuery({ queryKey: keys.profiles, queryFn: profileApi.listProfiles });
}

/** The allow-listed environment. Read once: it does not change while the window is open. */
export function useEnvironment() {
  return useQuery({ queryKey: keys.environment, queryFn: fetchEnvironment });
}

/** The screens this machine has. Read once: the editor offers them by number. */
export function useMonitors() {
  return useQuery({ queryKey: keys.monitors, queryFn: fetchMonitors });
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

/**
 * Import a profile from a document that has already been read by the domain.
 * What comes back is a profile that cannot run yet, by design.
 */
export function useImportProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, steps }: { name: string; steps: StepImport[] }) =>
      profileApi.importProfile(name, steps),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.profiles }),
  });
}

/** Accept one step of an imported profile, or all of them at once. */
export function useAcceptStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; profileId: string }) => profileApi.acceptStep(id),
    onSuccess: (_profile, { profileId }) => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.steps(profileId) });
    },
  });
}

export function useAcceptProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => profileApi.acceptProfile(id),
    onSuccess: (_profile, id) => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.steps(id) });
    },
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
    mutationFn: ({
      profileId,
      config,
      timing,
      waitFor,
      placement,
    }: {
      profileId: string;
      config: StepConfig;
      timing: Timing;
      waitFor: WaitFor | null;
      placement: Placement;
    }) => profileApi.addStep(profileId, config, timing, waitFor, placement),
    onSuccess: (_step, { profileId }) =>
      client.invalidateQueries({ queryKey: keys.steps(profileId) }),
  });
}

export function useUpdateStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      config,
      timing,
      waitFor,
      placement,
    }: {
      id: string;
      profileId: string;
      config: StepConfig;
      timing: Timing;
      waitFor: WaitFor | null;
      placement: Placement;
    }) => profileApi.updateStep(id, config, timing, waitFor, placement),
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
  // One stopper per execution: Stop reaches the run in progress and nothing else.
  const stopper = useRef<Stopper | null>(null);
  const stop = useCallback(() => stopper.current?.stop(), []);
  const mutation = useMutation({
    mutationFn: ({
      profile,
      steps,
      mode,
      env,
      onLine,
      onBegin,
    }: {
      profile: Runnable;
      steps: Step[];
      mode: Mode;
      env: Readonly<Record<string, string>>;
      onLine?: (line: runApi.LogLine) => void;
      onBegin?: (run: runApi.Run) => void;
    }) => {
      stopper.current = new Stopper();
      return executeProfile(
        profile,
        steps,
        mode,
        env,
        (line) => {
          void client.invalidateQueries({ queryKey: keys.events(line.runId) });
          onLine?.(line);
        },
        (run) => {
          // The run list must know the run while it runs, or the screen shows
          // "has not run yet" for the whole of a hold. Found by the end-to-end
          // suite the first time a run lasted longer than a refetch.
          void client.invalidateQueries({ queryKey: ['runs'] });
          onBegin?.(run);
        },
        stopper.current,
      );
    },
    // The last line — `run_finished` — is written by the host without an
    // `onLine`, and the refetch the previous line triggered may have read the
    // file before it was there. Read every log again once the run is over, so
    // the screen never stops one line short of the truth. Found by the
    // end-to-end suite: "completed, with failures" reached the file and not
    // the screen.
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['runs'] });
      void client.invalidateQueries({ queryKey: ['events'] });
      stopper.current = null;
    },
  });
  return { ...mutation, stop };
}

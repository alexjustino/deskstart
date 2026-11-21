import { ArrowClockwise20Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';

import { describeError } from '@/data/errors';
import { useAddStep, useCreateProfile, useEnvironment } from '@/data/hooks';
import type { Profile } from '@/data/profiles';
import { fetchCapture } from '@/data/system';
import { judgeCaptured, stepFromCapture, type Judged } from '@/domain/capture';
import { describePlacement } from '@/domain/placement';
import { lastSegment } from '@/domain/profile';
import { DEFAULT_TIMING } from '@/domain/timing';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { InfoBar } from '@/ui/InfoBar';
import { Input } from '@/ui/Input';
import { Modal } from '@/ui/Modal';
import { announce } from '@/ui/announce';

/**
 * The desktop as it is, made into a profile (1.1, ADR-030).
 *
 * The windows open now are listed with the program that owns them, the title
 * a person knows them by, and where they are. Each one ticked becomes an
 * application step that starts its program and puts its window back there.
 * The title is shown here to recognise the window and is not kept by the
 * profile; a window that cannot become a step says why, and cannot be ticked.
 */
export function CaptureProfile({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (profile: Profile) => void;
}) {
  const environment = useEnvironment();
  const env = useMemo(() => environment.data ?? {}, [environment.data]);
  const create = useCreateProfile();
  const add = useAddStep();

  // A read of the desktop as it is now, never a cached one: asked when the
  // dialog opens and again on demand.
  const capture = useQuery({
    queryKey: ['capture'],
    queryFn: fetchCapture,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  const windows = capture.data ?? null;
  // Every window that can be a step starts ticked — "capture this desktop"
  // means what is on it — so what is kept is what was unticked.
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [name, setName] = useState('My desk');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const judged: Judged[] = useMemo(() => (windows ?? []).map(judgeCaptured), [windows]);
  const chosen = judged.filter((j, i): j is Judged & { ok: true } => j.ok && !unticked.has(i));
  const capturable = judged.filter((j) => j.ok).length;

  const toggle = (index: number, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(index);
      else next.add(index);
      return next;
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || chosen.length === 0) return;
    setBusy(true);
    setFailure(null);
    try {
      const profile = await create.mutateAsync(trimmed);
      // One step at a time, top window first: the order they are listed in.
      for (const window of chosen) {
        const { config, placement } = stepFromCapture(window, env);
        await add.mutateAsync({
          profileId: profile.id,
          config,
          timing: DEFAULT_TIMING,
          waitFor: null,
          placement,
        });
      }
      announce(
        `Captured ${chosen.length} ${chosen.length === 1 ? 'window' : 'windows'} as ${profile.name}`,
      );
      onCreated(profile);
      onClose();
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open label="Capture this desktop" onClose={onClose} width="lg">
      <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-col gap-3 p-5">
        <div>
          <h2 className="text-subtitle font-semibold text-fg">Capture this desktop</h2>
          <p className="mt-1 text-body text-fg-secondary">
            Each window ticked becomes a step that starts its program and puts the window back where
            it is now. Titles are shown to help you choose; the profile does not keep them, nor how
            a program was started.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-fg-secondary">
            {windows === null ? 'Reading the windows…' : `${chosen.length} of ${capturable} ticked`}
          </span>
          <span className="flex gap-2">
            <Button
              appearance="subtle"
              onClick={() => setUnticked(new Set(judged.map((_, i) => i)))}
              disabled={busy || chosen.length === 0}
            >
              Untick all
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowClockwise20Regular />}
              onClick={() => {
                setUnticked(new Set());
                void capture.refetch();
              }}
              disabled={busy || capture.isFetching}
            >
              Read again
            </Button>
          </span>
        </div>

        {capture.isError && (
          <InfoBar severity="danger" title="The windows could not be read">
            {describeError(capture.error)}
          </InfoBar>
        )}

        {windows !== null && windows.length === 0 && (
          <p className="text-body text-fg-secondary">No windows to capture are open.</p>
        )}

        {judged.length > 0 && (
          <ul
            aria-label="Windows on this desktop"
            className="flex max-h-[38vh] flex-col overflow-y-auto rounded-md border border-stroke-subtle"
          >
            {judged.map((entry, index) => {
              const program = entry.window.program ?? '';
              const name = program === '' ? 'Unknown program' : lastSegment(program);
              const where = entry.ok
                ? (describePlacement(stepFromCapture(entry, env).placement) ??
                  'opens where it opens')
                : entry.reason;
              return (
                <li
                  key={`${index}-${entry.window.className}-${program}`}
                  className="flex items-start gap-3 border-b border-stroke-subtle px-3 py-2 last:border-b-0"
                >
                  <span className="pt-0.5">
                    <Checkbox
                      label={`Include ${name} — ${entry.window.title}`}
                      checked={entry.ok && !unticked.has(index)}
                      onChange={(on) => toggle(index, on)}
                      disabled={busy || !entry.ok}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body text-fg">
                      {name}
                      <span className="ml-2 text-caption text-fg-tertiary">
                        {entry.window.title}
                      </span>
                    </span>
                    <span
                      className={[
                        'truncate text-caption',
                        entry.ok ? 'text-fg-secondary' : 'text-caution',
                      ].join(' ')}
                    >
                      {where}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <label className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-caption font-semibold text-fg-tertiary uppercase">
            Profile name
          </span>
          <Input
            aria-label="Captured profile name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>

        {failure !== null && (
          <InfoBar severity="danger" title="The profile was not made">
            {failure}
          </InfoBar>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            appearance="accent"
            disabled={busy || chosen.length === 0 || name.trim() === ''}
          >
            {busy
              ? 'Making the profile…'
              : `Make a profile of ${chosen.length} ${chosen.length === 1 ? 'window' : 'windows'}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

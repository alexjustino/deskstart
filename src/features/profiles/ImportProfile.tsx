import { FolderOpen20Regular } from '@fluentui/react-icons';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useMemo, useState } from 'react';

import { describeError } from '@/data/errors';
import { useImportProfile } from '@/data/hooks';
import { readProfileFile, type Profile } from '@/data/profiles';
import { readPortableProfile, toImports } from '@/domain/portable';
import { stepTitle } from '@/domain/profile';
import { Button } from '@/ui/Button';
import { InfoBar } from '@/ui/InfoBar';
import { Modal } from '@/ui/Modal';
import { announce } from '@/ui/announce';

import { KIND_LABELS } from './kinds';

/**
 * Import: a document, read before anything is stored.
 *
 * Two doors in — a file the person picks, and text they paste — and one reader
 * behind both, so a profile that came through the clipboard is judged by
 * exactly the rules a profile from a file is. Nothing is stored until the
 * document reads cleanly, and what is stored cannot run: the next screen is the
 * review, and that is where a profile earns the Run button (ADR-013).
 */
export function ImportProfile({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (profile: Profile) => void;
}) {
  const [text, setText] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const importing = useImportProfile();

  const read = useMemo(() => (text.trim() === '' ? null : readPortableProfile(text)), [text]);

  const openFile = async () => {
    setFileError(null);
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Deskstart profile', extensions: ['json'] }],
      });
      if (typeof picked !== 'string') return;
      setText(await readProfileFile(picked));
      setSource(picked);
    } catch (cause) {
      setFileError(describeError(cause));
    }
  };

  const store = () => {
    if (read === null || !read.ok) return;
    importing.mutate(
      { name: read.profile.name, steps: toImports(read.profile) },
      {
        onSuccess: (profile) => {
          announce(`Imported ${profile.name}; every step needs to be accepted before it can run`);
          setText('');
          setSource(null);
          onImported(profile);
          onClose();
        },
      },
    );
  };

  return (
    <Modal open={open} label="Import a profile" onClose={onClose} width="lg">
      <div className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-subtitle font-semibold text-fg">Import a profile</h2>
          <p className="mt-1 text-body text-fg-secondary">
            A profile from somewhere else is a list of programs to start on this machine. It is
            stored, read and shown — and it runs nothing until you have seen and accepted every
            step.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button icon={<FolderOpen20Regular />} onClick={() => void openFile()}>
            Open a file…
          </Button>
          {source !== null && (
            <span
              data-selectable
              className="min-w-0 truncate font-mono text-caption text-fg-tertiary"
            >
              {source}
            </span>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-caption text-fg-secondary">or paste the profile here</span>
          <textarea
            aria-label="Profile file"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSource(null);
            }}
            rows={10}
            spellCheck={false}
            className="w-full resize-none rounded-md border border-stroke bg-card p-3 font-mono text-caption text-fg"
          />
        </label>

        {fileError !== null && (
          <InfoBar severity="danger" title="The file was not read">
            {fileError}
          </InfoBar>
        )}
        {importing.isError && (
          <InfoBar severity="danger" title="The profile was not imported">
            {describeError(importing.error)}
          </InfoBar>
        )}

        {read !== null && !read.ok && (
          <InfoBar severity="danger" title="This is not a profile this version can read">
            <ul className="mt-1 flex flex-col gap-0.5">
              {read.problems.slice(0, 8).map((problem, at) => (
                <li key={`${problem.path}-${at}`}>
                  <span className="font-mono">
                    {problem.path === '' ? 'the file' : problem.path}
                  </span>{' '}
                  — {problem.problem}
                </li>
              ))}
              {read.problems.length > 8 && <li>…and {read.problems.length - 8} more.</li>}
            </ul>
          </InfoBar>
        )}

        {read !== null && read.ok && (
          <div className="rounded-md border border-stroke-subtle bg-card p-3">
            <p className="text-body font-semibold text-fg">{read.profile.name}</p>
            <ol aria-label="Steps in this file" className="mt-1 flex flex-col gap-0.5">
              {read.profile.steps.map((step, at) => (
                <li key={at} className="flex gap-2 text-caption text-fg-secondary">
                  <span className="w-5 shrink-0 text-right font-mono text-fg-tertiary">
                    {at + 1}
                  </span>
                  <span className="truncate">{stepTitle(step.config)}</span>
                  <span className="text-fg-tertiary">{KIND_LABELS[step.config.kind]}</span>
                </li>
              ))}
            </ol>
            {read.profile.steps.length === 0 && (
              <p className="text-caption text-fg-tertiary">This profile has no steps.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            appearance="accent"
            onClick={store}
            disabled={read === null || !read.ok || importing.isPending}
          >
            {importing.isPending ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

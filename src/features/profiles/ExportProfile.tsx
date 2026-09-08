import { Copy20Regular, Save20Regular } from '@fluentui/react-icons';
import { save } from '@tauri-apps/plugin-dialog';
import { useMemo, useState } from 'react';

import { describeError } from '@/data/errors';
import { writeProfileFile } from '@/data/profiles';
import type { Profile } from '@/data/profiles';
import { droppedWaits, fileNameFor, writePortableProfile } from '@/domain/portable';
import type { Step } from '@/domain/profile';
import { Button } from '@/ui/Button';
import { InfoBar } from '@/ui/InfoBar';
import { Modal } from '@/ui/Modal';
import { announce } from '@/ui/announce';

/**
 * Export: the profile as the file it would be.
 *
 * The document is on screen before anything is written, because that is the
 * honest way to offer a file that will be sent to someone else — you can read
 * what you are about to share. Two doors out: the clipboard, and the system's
 * save dialog. Neither of them changes the document.
 */
export function ExportProfile({
  open,
  profile,
  steps,
  omitted,
  onClose,
}: {
  open: boolean;
  profile: Profile;
  steps: Step[];
  /** Steps of this profile that could not be read, and so are not in the file. */
  omitted: number;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = useMemo(() => writePortableProfile(profile.name, steps), [profile.name, steps]);
  const dropped = useMemo(() => droppedWaits(steps), [steps]);

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      announce('The profile was copied');
    } catch {
      setCopied(false);
      setError('The clipboard was not available. Select the text above and copy it.');
    }
  };

  const saveToFile = async () => {
    setError(null);
    try {
      const path = await save({
        defaultPath: fileNameFor(profile.name),
        filters: [{ name: 'Deskstart profile', extensions: ['json'] }],
      });
      if (path === null) return;
      await writeProfileFile(path, text);
      setSaved(path);
      announce(`The profile was saved to ${path}`);
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  return (
    <Modal open={open} label={`Export ${profile.name}`} onClose={onClose} width="lg">
      <div className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-subtitle font-semibold text-fg">Export {profile.name}</h2>
          <p className="mt-1 text-body text-fg-secondary">
            This is the whole file: what the profile opens, its time, and what each step waits for.
            It carries nothing about this machine — no identifiers, and paths exactly as you wrote
            them.
          </p>
        </div>

        {omitted > 0 && (
          <InfoBar severity="caution" title="A step is not in this file">
            {omitted === 1 ? 'One step' : `${omitted} steps`} of this profile could not be read, so{' '}
            {omitted === 1 ? 'it is' : 'they are'} left out. The file is the rest of the profile,
            and the positions in it are the positions of what it contains.
          </InfoBar>
        )}

        {dropped.length > 0 && (
          <InfoBar severity="caution" title="A wait is left out of the file">
            {dropped.length === 1 ? 'One step waits' : `${dropped.length} steps wait`} for a step
            that is not earlier in this profile. A file can only say &ldquo;wait for the step
            before&rdquo;, so {dropped.length === 1 ? 'that wait is' : 'those waits are'} left out
            rather than written in a form nobody could read back.
          </InfoBar>
        )}

        <textarea
          readOnly
          aria-label="Profile file"
          value={text}
          rows={14}
          data-selectable
          className="w-full resize-none rounded-md border border-stroke bg-card p-3 font-mono text-caption text-fg"
        />

        {saved !== null && (
          <InfoBar severity="success" title="Saved">
            <span data-selectable className="font-mono">
              {saved}
            </span>
          </InfoBar>
        )}
        {copied && saved === null && (
          <InfoBar severity="success" title="Copied">
            The file is on the clipboard.
          </InfoBar>
        )}
        {error !== null && (
          <InfoBar severity="danger" title="The file was not written">
            {error}
          </InfoBar>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button icon={<Copy20Regular />} onClick={() => void copy()}>
            Copy
          </Button>
          <Button appearance="accent" icon={<Save20Regular />} onClick={() => void saveToFile()}>
            Save to file…
          </Button>
        </div>
      </div>
    </Modal>
  );
}

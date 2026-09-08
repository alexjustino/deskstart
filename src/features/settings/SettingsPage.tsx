import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { ArrowDownload20Regular, ArrowUpload20Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';

import { describeError } from '@/data/errors';
import { useSetSetting, useSettings } from '@/data/hooks';
import {
  backupSummary,
  backupWorkspace,
  restart,
  restoreWorkspace,
  type BackupSummary,
} from '@/data/system';
import { readSettings, THEME_LABELS, THEMES, type ThemeChoice } from '@/domain/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { ChoiceGroup } from '@/ui/ChoiceGroup';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { InfoBar } from '@/ui/InfoBar';
import { announce } from '@/ui/announce';

/**
 * Settings: what a person chooses, kept in the workspace (F10).
 *
 * Appearance and Start with Windows were on Diagnostics as a stopgap; they
 * live here now, and the theme is a stored setting rather than a choice held
 * for the window. Backup and About are the other two halves of the slice.
 */
export function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-title font-semibold text-fg">Settings</h1>
        <p className="mt-1 text-body text-fg-secondary">
          Kept in your workspace, the same file a backup saves.
        </p>
      </header>

      <AppearanceCard />
      <AutostartCard />
      <BackupCard />
      <AboutCard />
    </div>
  );
}

function AppearanceCard() {
  const settings = useSettings();
  const set = useSetSetting();
  const theme = readSettings(settings.data).theme;

  return (
    <Card title="Appearance" description="Light, dark, or whatever Windows is set to.">
      <ChoiceGroup
        label="Theme"
        options={THEMES}
        value={theme}
        onChange={(next: ThemeChoice) =>
          set.mutate(
            { key: 'theme', value: next },
            { onSuccess: () => announce(`Theme set to ${THEME_LABELS[next].toLowerCase()}`) },
          )
        }
        labels={THEME_LABELS}
        disabled={set.isPending || settings.data === undefined}
      />
    </Card>
  );
}

function AutostartCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    isEnabled()
      .then((on) => {
        if (active) setEnabled(on);
      })
      .catch((error: unknown) => {
        if (active) setFailure(describeError(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (on: boolean) => {
    setFailure(null);
    try {
      if (on) await enable();
      else await disable();
      setEnabled(await isEnabled());
      announce(on ? 'Deskstart will start with Windows' : 'Deskstart will not start with Windows');
    } catch (error) {
      setFailure(describeError(error));
    }
  };

  return (
    <Card
      title="Start with Windows"
      description="So a shortcut or a schedule finds Deskstart already running, in the tray."
    >
      <label className="flex items-center gap-3 text-body text-fg">
        <Checkbox
          label="Start with Windows"
          checked={enabled === true}
          onChange={(on) => void toggle(on)}
          disabled={enabled === null}
        />
        <span>
          {enabled === null
            ? 'Asking Windows…'
            : enabled
              ? 'Deskstart starts when you sign in.'
              : 'Deskstart starts only when you open it.'}
        </span>
      </label>
      {failure !== null && (
        <div className="mt-3">
          <InfoBar severity="danger" title="Windows did not answer">
            {failure}
          </InfoBar>
        </div>
      )}
      <p className="mt-3 text-caption text-fg-tertiary">
        Closing the window keeps Deskstart in the tray, so a scheduled run has somewhere to arrive;
        Quit is in the tray icon&rsquo;s menu.
      </p>
    </Card>
  );
}

function BackupCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, setPending] = useState<{ path: string; summary: BackupSummary } | null>(null);

  const backup = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const path = await saveDialog({
        defaultPath: `deskstart-${new Date().toISOString().slice(0, 10)}.deskstart-backup`,
        filters: [{ name: 'Deskstart backup', extensions: ['deskstart-backup'] }],
      });
      if (path !== null) {
        await backupWorkspace(path);
        setMessage({ tone: 'success', text: `Everything was saved to ${path}` });
        announce('The workspace was backed up');
      }
    } catch (error) {
      setMessage({ tone: 'danger', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const chooseRestore = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const path = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Deskstart backup', extensions: ['deskstart-backup', 'sqlite3'] }],
      });
      if (typeof path === 'string') {
        setPending({ path, summary: await backupSummary(path) });
      }
    } catch (error) {
      setMessage({ tone: 'danger', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (pending === null) return;
    setBusy(true);
    try {
      await restoreWorkspace(pending.path);
      // The staged backup becomes the workspace at the next start; restarting
      // is how "the next start" is now.
      announce('Restoring; Deskstart will restart');
      await restart();
    } catch (error) {
      setMessage({ tone: 'danger', text: describeError(error) });
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <Card
      title="Backup and restore"
      description="A backup is your whole workspace — every profile and every run — in one file."
    >
      <div className="flex gap-2">
        <Button
          appearance="accent"
          icon={<ArrowDownload20Regular />}
          onClick={() => void backup()}
          disabled={busy}
        >
          Back up…
        </Button>
        <Button
          icon={<ArrowUpload20Regular />}
          onClick={() => void chooseRestore()}
          disabled={busy}
        >
          Restore…
        </Button>
      </div>
      <p className="mt-3 text-caption text-fg-tertiary">
        Restoring replaces everything here with what the backup holds, and restarts Deskstart. What
        is here now is gone unless you back it up first.
      </p>
      {message !== null && (
        <div className="mt-3">
          <InfoBar
            severity={message.tone === 'success' ? 'success' : 'danger'}
            title={message.tone === 'success' ? 'Done' : 'That did not work'}
          >
            <span data-selectable className={message.tone === 'success' ? 'font-mono' : ''}>
              {message.text}
            </span>
          </InfoBar>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Restore this backup?"
        confirmLabel="Restore and restart"
        danger
        pending={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmRestore()}
      >
        {pending !== null && (
          <>
            It holds {pending.summary.profiles}{' '}
            {pending.summary.profiles === 1 ? 'profile' : 'profiles'} and {pending.summary.runs}{' '}
            {pending.summary.runs === 1 ? 'run' : 'runs'}. Everything in your workspace now will be
            replaced by it, and Deskstart will restart.
          </>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function AboutCard() {
  return (
    <Card title="About Deskstart" description="Open your working day with one button.">
      <div className="flex flex-col gap-2 text-body text-fg-secondary">
        <p>
          Deskstart runs a profile of steps — the applications, folders, pages and machines that
          make up a working setup — in order, with timing, from one button, and keeps a log of every
          run.
        </p>
        <p>
          It runs entirely on your machine. There is no account, no cloud, no telemetry and no
          update check; the only network contact is what a step you wrote asks a browser to open.
        </p>
        <p className="text-caption text-fg-tertiary">
          Apache-2.0. The source is at{' '}
          <span data-selectable className="font-mono">
            github.com/alexjustino/deskstart
          </span>
          .
        </p>
      </div>
    </Card>
  );
}
